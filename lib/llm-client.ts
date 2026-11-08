import { Character, Message, UserSettings, TokenUsage, activeProfile } from './db';
import { hasNarration } from './message-parser';
import { downloadJsonFile } from './utils';

interface ChatCompletionOptions {
  character: Character;
  history: Message[];
  latestUserMessage: string;
  settings: UserSettings;
  onChunk: (chunk: string) => void;
  onUsage?: (usage: TokenUsage) => void;
  signal?: AbortSignal;
}

interface StreamCompletionResult {
  fullText: string;
  usage: TokenUsage;
}

/**
 * Robust token estimator for Japanese, CJK and Latin characters
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let cjkCount = 0;
  let otherCount = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3040 && code <= 0x309f) ||
      (code >= 0x30a0 && code <= 0x30ff) ||
      (code >= 0xff00 && code <= 0xffef)
    ) {
      cjkCount++;
    } else {
      otherCount++;
    }
  }
  return Math.max(1, Math.ceil(cjkCount * 1.1 + otherCount / 3.8));
}

/**
 * Builds messages payload according to OpenZeta specifications:
 * 1. System: character's systemPrompt
 * 2. Recent history (up to maxHistoryCount)
 * 3. Latest user message
 */
function buildPromptMessages(
  character: Character,
  history: Message[],
  latestUserMessage: string,
  maxHistoryCount = 20,
  userSettings?: UserSettings
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const result: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

  // User Profile / Name instructions if provided
  const profile = userSettings ? activeProfile(userSettings) : undefined;
  let userInfoPrompt = '';
  if (profile?.userName && profile.userName.trim().length > 0) {
    userInfoPrompt += `\n\n【対話相手（ユーザー）の情報】\n- ユーザーの呼び名/名前: ${profile.userName.trim()}`;
  }
  if (profile?.userBio && profile.userBio.trim().length > 0) {
    userInfoPrompt += `\n- ユーザーに関する背景設定・要望: ${profile.userBio.trim()}`;
  }

  // A single concrete number is easier to follow than a range, and rolling it
  // per reply keeps the rhythm from becoming uniform. Still an instruction, not
  // a guarantee: the model can miscount.
  const dialogueBlocks = 2 + Math.floor(Math.random() * 3); // 2..4
  const narrationBlocks = 1 + Math.floor(Math.random() * 3); // 1..3

  // 1. System Prompt with Multi-Role Dialogue and Action instructions (excluding inner thoughts in asterisks)
  const formatInstruction = `

【セリフおよび行動描写の表現規則（最重要）】
会話において、発言（セリフ）と行動・仕草（ト書き）を明確に区別してください：
- 通常テキスト (raw text): 実際に声に出して喋っている発言・セリフ
- アスタリスク (*こんな感じ*): 外から観察できる表情、仕草、視線、動作、物理的な行動描写
※ アスタリスク内に「心境」「心の声」「思考過程」「（心境: 〜）」を絶対に入れないでください。内心や感情は発言や物理的な仕草・表情を通してのみ表現してください。
※ <thought> や <think> などの思考タグ・内部思考文は一切出力しないでください。
※ ユーザーからの入力に含まれるアスタリスク（行動・状況）も適切に解釈してリアクションしてください。

【出力プレフィックス形式】
- @${character.name}: キャラクターの発言および行動
  例: @${character.name}: おはよう！ *ふっと柔らかく微笑みながら手を振り返す* 今日も会えて嬉しいな。
- @ナレーター: シーン全体の情景描写、環境音、第三者視点の地の文
  例: @ナレーター: 窓から柔らかな朝の光が差し込み、静かな部屋を温かく照らしている。

【今回の構成（厳守）】
今回は次の回数ちょうどで出力してください。
- @${character.name}: ${dialogueBlocks}回
- @ナレーター: ${narrationBlocks}回
各ブロックは1〜3文程度。同じ話者のブロックを連続させず、
ナレーションを挟んでテンポよく構成してください。`;

  // If the last two replies had no narration, make this turn produce one so the
  // scene description does not disappear for long stretches.
  const recentReplies = history.filter((msg) => msg.role === 'assistant').slice(-2);
  const needsNarration =
    recentReplies.length === 2 && !recentReplies.some((msg) => hasNarration(msg.content));

  const forcedNarrationInstruction = `

【今回の必須事項】
直近の応答で情景描写（@ナレーター）が使われていません。今回は返答の冒頭に必ず
「@ナレーター: 」で始まる情景・状況描写を1〜2文入れてから、キャラクターのセリフを続けてください。`;

  const fullSystemPrompt =
    (character.systemPrompt || `あなたは「${character.name}」です。`) +
    userInfoPrompt +
    formatInstruction +
    (needsNarration ? forcedNarrationInstruction : '');

  result.push({
    role: 'system',
    content: fullSystemPrompt,
  });

  // 2. Recent history excluding the very latest message if it was already added
  const recentHistory = history.slice(-maxHistoryCount);
  for (const msg of recentHistory) {
    result.push({
      role: msg.role,
      content: msg.content,
    });
  }

  // 3. Latest user message
  result.push({
    role: 'user',
    content: latestUserMessage,
  });

  return result;
}

/**
 * Streams chat completion using either the user's custom endpoint or the server proxy route.
 */
export async function streamChatCompletion({
  character,
  history,
  latestUserMessage,
  settings,
  onChunk,
  onUsage,
  signal,
}: ChatCompletionOptions): Promise<StreamCompletionResult> {
  const messages = buildPromptMessages(
    character,
    history,
    latestUserMessage,
    settings.maxHistoryCount || 20,
    settings
  );

  const endpoint = '/api/chat';
  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const requestBody: Record<string, unknown> = {
    messages,
    baseUrl: settings.baseUrl,
    apiKey: settings.apiKey,
    modelName: settings.modelName,
    temperature: settings.temperature,
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: requestHeaders,
    body: JSON.stringify(requestBody),
    signal,
  });

  if (!response.ok) {
    const errText = await response.text();
    let parsedErr = errText;
    try {
      const json = JSON.parse(errText);
      parsedErr = json.error?.message || json.error || errText;
    } catch {
      // keep errText
    }
    throw new Error(`API Error (${response.status}): ${parsedErr}`);
  }

  if (!response.body) {
    throw new Error('Response body is empty');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';
  let capturedUsage: TokenUsage | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':')) continue;

      if (trimmed === 'data: [DONE]') {
        break;
      }

      if (trimmed.startsWith('data: ')) {
        const jsonStr = trimmed.slice(6);
        try {
          const parsed = JSON.parse(jsonStr);

          // Check if usage information is returned in the stream
          if (parsed.usage) {
            capturedUsage = {
              promptTokens: parsed.usage.prompt_tokens ?? parsed.usage.promptTokens ?? 0,
              completionTokens: parsed.usage.completion_tokens ?? parsed.usage.completionTokens ?? 0,
              totalTokens: parsed.usage.total_tokens ?? parsed.usage.totalTokens ?? 0,
            };
            if (onUsage) {
              onUsage(capturedUsage);
            }
          }

          const delta = parsed.choices?.[0]?.delta?.content || '';
          if (delta) {
            fullText += delta;
            onChunk(delta);
          }
        } catch {
          // ignore malformed SSE lines
        }
      }
    }
  }

  // If endpoint didn't provide exact usage, estimate based on tokens
  if (!capturedUsage) {
    const promptTokens = messages.reduce((acc, m) => acc + estimateTokens(m.content) + 4, 0);
    const completionTokens = estimateTokens(fullText);
    capturedUsage = {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    };
    if (onUsage) {
      onUsage(capturedUsage);
    }
  }

  return {
    fullText,
    usage: capturedUsage,
  };
}

/**
 * Fetch 3 smart reply suggestions for the current conversation context
 */
export async function fetchSmartReplies(
  character: Character,
  history: Message[],
  settings: UserSettings
): Promise<string[]> {
  try {
    const messagesPayload = history.slice(-8).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const response = await fetch('/api/smart-reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        characterName: character.name,
        messages: messagesPayload,
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
        modelName: settings.modelName,
      }),
    });

    if (!response.ok) {
      return [
        'なるほど、面白いね！',
        'もっと詳しく教えて？',
        'ふふっ、次はどうしようか？',
      ];
    }

    const data = await response.json();
    if (Array.isArray(data.replies) && data.replies.length > 0) {
      return data.replies;
    }
    return [
      'なるほど、面白いね！',
      'もっと詳しく教えて？',
      'ふふっ、次はどうしようか？',
    ];
  } catch (error) {
    console.error('Failed to fetch smart replies:', error);
    return [
      'うん、わかったよ！',
      'どういうことか教えて？',
      'これからもよろしくね！',
    ];
  }
}

/**
 * Exports a character to a JSON downloadable file
 */
export function exportCharacterToFile(character: Character) {
  const exportData = {
    version: '1.0',
    app: 'OpenZeta',
    exportedAt: new Date().toISOString(),
    character: {
      name: character.name,
      avatarBase64: character.avatarBase64,
      greeting: character.greeting,
      systemPrompt: character.systemPrompt,
    },
  };

  const safeName = character.name.replace(/[^a-zA-Z0-9_\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/g, '_');
  downloadJsonFile(`openzeta-character-${safeName || 'char'}.json`, exportData);
}

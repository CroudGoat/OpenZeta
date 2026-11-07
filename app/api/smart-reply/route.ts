import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import {
  ChatMessagePayload,
  externalFetchErrorStatus,
  fetchExternalChatCompletion,
  isExternalEndpoint,
  parseChatRequestBody,
  RequestValidationError,
} from '@/lib/external-chat';

interface ExternalChatJsonResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

const FALLBACK_REPLIES: string[] = [
  'なるほど、面白いね！',
  'もっと詳しく教えて？',
  'ふふっ、次はどうしようか？',
];

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function buildPromptInstruction(characterName: string): string {
  return `あなたはAIキャラクター対話アプリ「OpenZeta」のスマートリプライアシスタントです。
キャラクター「${characterName}」との直前の会話ログを踏まえ、ユーザーが返しそうな魅力的でバリエーションに富んだ返答の候補を3つ日本語で生成してください。
返答においては、実際のセリフ（通常テキスト）に加え、行動や仕草・感情をアスタリスク（*こんな感じ*）で表現することも適宜取り入れてください（例: *微笑みながら* ありがとう！, *少し考えてから* どうしてそう思うの？）。

返答の候補は、以下のトーンや意図で異なるものにしてください：
1. 好意的・共感的な返答、または質問への回答
2. キャラクターへのツッコミ、からかい、またはユニークなリアクション
3. 会話を深める質問、または新しい展開・行動を促す提案

出力は必ず3つの文字列の配列 (e.g. ["返答1", "返答2", "返答3"]) のみを含むJSONとしてください。他の余計な解説文やMarkdownタグは含めないでください。`;
}

function sanitizeReplies(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const replies = value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  return replies.slice(0, 3);
}

export async function POST(req: NextRequest) {
  let characterName: string;
  let payload: {
    messages: ChatMessagePayload[];
    baseUrl: string;
    apiKey: string;
    modelName: string;
  };

  try {
    const body: unknown = await req.json();
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new RequestValidationError('Request body must be a JSON object.');
    }
    const raw = body as Record<string, unknown>;
    if (typeof raw.characterName !== 'string' || raw.characterName.trim() === '') {
      throw new RequestValidationError('"characterName" is required.');
    }
    // Keep the name on a single line and bounded so it cannot break the prompt structure
    characterName = raw.characterName.trim().replace(/[\r\n\t]+/g, ' ').slice(0, 100);
    payload = parseChatRequestBody(body);
  } catch (error) {
    const message =
      error instanceof RequestValidationError ? error.message : 'Invalid JSON in request body.';
    return NextResponse.json({ error: message, replies: FALLBACK_REPLIES }, { status: 400 });
  }

  const { messages, baseUrl, apiKey, modelName } = payload;
  const promptInstruction = buildPromptInstruction(characterName);

  // Branch 1: user-supplied OpenAI-compatible endpoint
  if (isExternalEndpoint(baseUrl)) {
    let resData: ExternalChatJsonResponse | null = null;
    try {
      const response = await fetchExternalChatCompletion({
        baseUrl,
        apiKey,
        model: modelName || 'gpt-4o-mini',
        messages: [
          ...messages.slice(-8),
          { role: 'system', content: promptInstruction },
          {
            role: 'user',
            content: '直前の会話を踏まえて、ユーザーの次の魅力的な返答候補3つをJSON配列 ["...", "...", "..."] で出力してください。',
          },
        ],
        temperature: 0.8,
        stream: false,
        extraBody: { response_format: { type: 'json_object' } },
        timeoutMs: 30_000,
      });
      if (!response.ok) {
        throw new Error(`External API failed with status ${response.status}`);
      }
      resData = (await response.json()) as ExternalChatJsonResponse;
    } catch (error) {
      const { status, message } = externalFetchErrorStatus(error);
      return NextResponse.json({ error: message, replies: FALLBACK_REPLIES }, { status });
    }

    const content = resData?.choices?.[0]?.message?.content || '[]';
    try {
      const parsed = JSON.parse(content) as unknown;
      if (Array.isArray(parsed)) {
        const replies = sanitizeReplies(parsed);
        if (replies.length > 0) return NextResponse.json({ replies });
      } else if (typeof parsed === 'object' && parsed !== null) {
        const obj = parsed as Record<string, unknown>;
        const replies = sanitizeReplies(obj.replies ?? obj.suggestions ?? Object.values(obj));
        if (replies.length > 0) return NextResponse.json({ replies });
      }
      return NextResponse.json({ replies: FALLBACK_REPLIES });
    } catch {
      // Regex fallback for slightly malformed JSON
      const matches = content.match(/"([^"\\]*(\\.[^"\\]*)*)"/g);
      if (matches && matches.length >= 3) {
        return NextResponse.json({
          replies: matches.slice(0, 3).map((m: string) => m.replace(/^"|"$/g, '')),
        });
      }
      return NextResponse.json({ replies: FALLBACK_REPLIES });
    }
  }

  // Branch 2: built-in Gemini API
  try {
    const geminiKey = process.env.GEMINI_API_KEY || apiKey;
    if (!geminiKey) {
      return NextResponse.json({ replies: FALLBACK_REPLIES });
    }

    const ai = new GoogleGenAI({ apiKey: geminiKey });

    const recentContext = messages
      .slice(-6)
      .map((m) => `${m.role === 'user' ? 'ユーザー' : characterName}: ${m.content}`)
      .join('\n');

    const fullPrompt = `${promptInstruction}\n\n[直近の会話履歴]:\n${recentContext}\n\n3つの魅力的な返答候補のJSON配列を出力してください。`;

    const result = await ai.models.generateContent({
      model: modelName.includes('gemini') ? modelName : 'gemini-2.5-flash',
      contents: fullPrompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: '3 suggested replies for the user',
        },
        temperature: 0.8,
      },
    });

    const text = result.text || '[]';
    const parsedReplies = sanitizeReplies(JSON.parse(text));
    return NextResponse.json({
      replies: parsedReplies.length > 0 ? parsedReplies : FALLBACK_REPLIES,
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Smart reply error:', err);
    return NextResponse.json({ replies: FALLBACK_REPLIES });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      characterName,
      messages,
      baseUrl,
      apiKey,
      modelName = 'gemini-2.5-flash',
    } = body as {
      characterName: string;
      messages: ChatMessage[];
      baseUrl?: string;
      apiKey?: string;
      modelName?: string;
    };

    const promptInstruction = `あなたはAIキャラクター対話アプリ「OpenZeta」のスマートリプライアシスタントです。
キャラクター「${characterName}」との直前の会話ログを踏まえ、ユーザーが返しそうな魅力的でバリエーションに富んだ返答の候補を3つ日本語で生成してください。
返答においては、実際のセリフ（通常テキスト）に加え、行動や仕草・感情をアスタリスク（*こんな感じ*）で表現することも適宜取り入れてください（例: *微笑みながら* ありがとう！, *少し考えてから* どうしてそう思うの？）。

返答の候補は、以下のトーンや意図で異なるものにしてください：
1. 好意的・共感的な返答、または質問への回答
2. キャラクターへのツッコミ、からかい、またはユニークなリアクション
3. 会話を深める質問、または新しい展開・行動を促す提案

出力は必ず3つの文字列の配列 (e.g. ["返答1", "返答2", "返答3"]) のみを含むJSONとしてください。他の余計な解説文やMarkdownタグは含めないでください。`;

    // External OpenAI-compatible endpoint
    if (baseUrl && baseUrl !== '/api/chat' && !baseUrl.includes('/api/chat')) {
      const targetUrl = baseUrl.endsWith('/chat/completions')
        ? baseUrl
        : `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: modelName || 'gpt-4o-mini',
          messages: [
            ...messages.slice(-8),
            {
              role: 'system',
              content: promptInstruction,
            },
            {
              role: 'user',
              content: '直前の会話を踏まえて、ユーザーの次の魅力的な返答候補3つをJSON配列 ["...", "...", "..."] で出力してください。',
            },
          ],
          temperature: 0.8,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        throw new Error(`External API failed with status ${response.status}`);
      }

      const resData = await response.json();
      const content = resData.choices?.[0]?.message?.content || '[]';
      try {
        const parsed = JSON.parse(content);
        const replies = Array.isArray(parsed)
          ? parsed
          : parsed.replies || parsed.suggestions || Object.values(parsed);
        return NextResponse.json({ replies: replies.slice(0, 3) });
      } catch {
        // Regex fallback
        const matches = content.match(/"([^"\\]*(\\.[^"\\]*)*)"/g);
        if (matches && matches.length >= 3) {
          return NextResponse.json({
            replies: matches.slice(0, 3).map((m: string) => m.replace(/^"|"$/g, '')),
          });
        }
        return NextResponse.json({
          replies: ['なるほど、面白いね！', 'もっと詳しく教えて？', '次はどうしようか？'],
        });
      }
    }

    // Default: Gemini API
    const geminiKey = process.env.GEMINI_API_KEY || apiKey;
    if (!geminiKey) {
      return NextResponse.json({
        replies: ['なるほど！それいいね。', 'もう少し詳しく聞かせて？', 'ふふっ、次はどうする？'],
      });
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
          items: {
            type: Type.STRING,
          },
          description: '3 suggested replies for the user',
        },
        temperature: 0.8,
      },
    });

    const text = result.text || '[]';
    const parsedReplies = JSON.parse(text);
    return NextResponse.json({
      replies: Array.isArray(parsedReplies) ? parsedReplies.slice(0, 3) : [],
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Smart reply error:', err);
    return NextResponse.json({
      replies: ['なるほど、それ面白いね！', 'もっと詳しく教えてほしいな', 'ふふ、次はどうする？'],
    });
  }
}

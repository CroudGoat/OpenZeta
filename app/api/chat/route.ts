import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import {
  externalFetchErrorStatus,
  fetchExternalChatCompletion,
  isExternalEndpoint,
  parseChatRequestBody,
  RequestValidationError,
} from '@/lib/external-chat';

const SSE_HEADERS: Record<string, string> = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let payload;
  try {
    const body: unknown = await req.json();
    payload = parseChatRequestBody(body);
  } catch (error) {
    const message =
      error instanceof RequestValidationError
        ? error.message
        : 'Invalid JSON in request body.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { messages, baseUrl, apiKey, modelName, temperature } = payload;

  // Branch 1: forward to a user-supplied OpenAI-compatible endpoint (BYOK)
  if (isExternalEndpoint(baseUrl)) {
    let response: Response;
    try {
      response = await fetchExternalChatCompletion({
        baseUrl,
        apiKey,
        model: modelName || 'gpt-4o-mini',
        messages,
        temperature,
        stream: true,
      });
    } catch (error) {
      const { status, message } = externalFetchErrorStatus(error);
      return NextResponse.json({ error: message }, { status });
    }

    if (!response.ok) {
      const errText = (await response.text().catch(() => '')).slice(0, 500);
      return NextResponse.json(
        { error: `External API error (${response.status})${errText ? `: ${errText}` : ''}` },
        { status: response.status }
      );
    }

    // Proxy the streaming SSE body directly
    return new Response(response.body, { headers: SSE_HEADERS });
  }

  // Branch 2: built-in Gemini via @google/genai SDK
  try {
    const geminiKey = process.env.GEMINI_API_KEY || apiKey;
    if (!geminiKey) {
      return NextResponse.json(
        { error: 'Gemini API Key is not configured. Please enter your API Key in Settings.' },
        { status: 400 }
      );
    }

    const ai = new GoogleGenAI({ apiKey: geminiKey });

    // Extract system message and format history for Gemini
    const systemMessage = messages.find((m) => m.role === 'system')?.content || '';
    const chatHistory = messages.filter((m) => m.role !== 'system');

    const contents = chatHistory.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    if (contents.length === 0) {
      contents.push({ role: 'user', parts: [{ text: 'こんにちは' }] });
    }

    const geminiModel = modelName.includes('gemini') ? modelName : 'gemini-2.5-flash';
    const streamConfig: Record<string, unknown> = {
      systemInstruction: systemMessage || undefined,
      temperature,
    };

    if (geminiModel.includes('thinking')) {
      streamConfig.thinkingConfig = { thinkingBudget: 0 };
    }

    const streamResult = await ai.models.generateContentStream({
      model: geminiModel,
      contents,
      config: streamConfig,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let lastUsageMetadata: {
            promptTokenCount?: number;
            candidatesTokenCount?: number;
            totalTokenCount?: number;
          } | null = null;

          for await (const chunk of streamResult) {
            if (chunk.usageMetadata) {
              lastUsageMetadata = chunk.usageMetadata;
            }
            const text = chunk.text || '';
            if (text) {
              const data = JSON.stringify({
                choices: [{ delta: { content: text }, index: 0, finish_reason: null }],
              });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }
          }

          if (lastUsageMetadata) {
            const usageData = JSON.stringify({
              choices: [],
              usage: {
                prompt_tokens: lastUsageMetadata.promptTokenCount || 0,
                completion_tokens: lastUsageMetadata.candidatesTokenCount || 0,
                total_tokens: lastUsageMetadata.totalTokenCount || 0,
              },
            });
            controller.enqueue(encoder.encode(`data: ${usageData}\n\n`));
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (err: unknown) {
          const error = err as Error;
          controller.error(error);
        }
      },
    });

    return new Response(stream, { headers: SSE_HEADERS });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('API /api/chat error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

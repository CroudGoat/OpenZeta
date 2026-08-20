import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      messages,
      baseUrl,
      apiKey,
      modelName = 'gemini-2.5-flash',
      temperature = 0.7,
    } = body as {
      messages: ChatMessage[];
      baseUrl?: string;
      apiKey?: string;
      modelName?: string;
      temperature?: number;
    };

    // If a custom external endpoint is specified (not empty, not default /api/chat)
    if (baseUrl && baseUrl !== '/api/chat' && !baseUrl.includes('/api/chat')) {
      // Forward to custom OpenAI-compatible endpoint
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
          messages,
          temperature,
          stream: true,
          stream_options: { include_usage: true },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return NextResponse.json(
          { error: `External API error (${response.status}): ${errText}` },
          { status: response.status }
        );
      }

      // Proxy the streaming SSE body directly
      return new Response(response.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    }

    // Default: Use server-side Gemini via @google/genai SDK
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

    // Build Gemini contents structure
    const contents = chatHistory.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    // If contents is empty, add a default user message
    if (contents.length === 0) {
      contents.push({ role: 'user', parts: [{ text: 'こんにちは' }] });
    }

    // Use streaming
    const geminiModel = modelName.includes('gemini') ? modelName : 'gemini-2.5-flash';
    const streamConfig: Record<string, unknown> = {
      systemInstruction: systemMessage || undefined,
      temperature,
    };

    // If using gemini 2.0 flash thinking or gemini 2.5 thinking models, set thinkingBudget to 0 or disable thinking output if desired
    if (geminiModel.includes('thinking')) {
      streamConfig.thinkingConfig = {
        thinkingBudget: 0,
      };
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
          let lastUsageMetadata: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } | null = null;

          for await (const chunk of streamResult) {
            if (chunk.usageMetadata) {
              lastUsageMetadata = chunk.usageMetadata;
            }

            const text = chunk.text || '';
            if (text) {
              // Format as OpenAI SSE event
              const data = JSON.stringify({
                choices: [
                  {
                    delta: { content: text },
                    index: 0,
                    finish_reason: null,
                  },
                ],
              });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }
          }

          // If usage metadata is available from Gemini, emit usage event
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

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('API /api/chat error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

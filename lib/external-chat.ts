/**
 * Shared helpers for the BYOK (Bring-Your-Own-Key) proxy routes.
 *
 * Both /api/chat and /api/smart-reply forward requests to a user-supplied
 * OpenAI-compatible endpoint. This module centralises:
 *  - request body validation (RequestValidationError => HTTP 400)
 *  - SSRF-safe endpoint resolution (ExternalUrlError => HTTP 400)
 *  - the fetch itself (with timeout + auth headers)
 */
import {
  ExternalUrlError,
  RequestValidationError,
  validateExternalBaseUrl,
} from './safe-url';

export { ExternalUrlError, RequestValidationError } from './safe-url';

export interface ChatMessagePayload {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ValidatedChatRequest {
  messages: ChatMessagePayload[];
  baseUrl: string;
  apiKey: string;
  modelName: string;
  temperature: number;
}

const MAX_MESSAGE_CHARS = 100_000;
const MAX_MESSAGES = 500;
const ALLOWED_ROLES: ReadonlySet<string> = new Set(['system', 'user', 'assistant']);

function isNonEmptyString(value: unknown, maxLen: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLen;
}

/**
 * Validates and normalises the raw JSON body sent by the client.
 * Throws RequestValidationError with a user-safe message on bad input.
 */
export function parseChatRequestBody(body: unknown): ValidatedChatRequest {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new RequestValidationError('Request body must be a JSON object.');
  }
  const raw = body as Record<string, unknown>;

  const messages = raw.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    throw new RequestValidationError(`"messages" must be a non-empty array (max ${MAX_MESSAGES}).`);
  }
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i] as Record<string, unknown> | null;
    if (typeof m !== 'object' || m === null) {
      throw new RequestValidationError(`messages[${i}] must be an object.`);
    }
    if (typeof m.role !== 'string' || !ALLOWED_ROLES.has(m.role)) {
      throw new RequestValidationError(`messages[${i}].role must be one of: system, user, assistant.`);
    }
    if (typeof m.content !== 'string' || m.content.length > MAX_MESSAGE_CHARS) {
      throw new RequestValidationError(`messages[${i}].content must be a string (max ${MAX_MESSAGE_CHARS} chars).`);
    }
  }

  const baseUrl = typeof raw.baseUrl === 'string' ? raw.baseUrl.trim() : '';
  const apiKey = typeof raw.apiKey === 'string' ? raw.apiKey.trim() : '';
  const modelName = isNonEmptyString(raw.modelName, 200)
    ? raw.modelName
    : 'gemini-2.5-flash';

  let temperature: number =
    typeof raw.temperature === 'number' && Number.isFinite(raw.temperature) ? raw.temperature : 0.7;
  temperature = Math.min(2, Math.max(0, temperature));

  return {
    messages: messages as ChatMessagePayload[],
    baseUrl,
    apiKey,
    modelName,
    temperature,
  };
}

/**
 * True when the caller supplied a real external endpoint (i.e. anything
 * other than the built-in /api/chat proxy).
 */
export function isExternalEndpoint(baseUrl: string): boolean {
  if (!baseUrl) return false;
  return baseUrl !== '/api/chat' && !baseUrl.includes('/api/chat');
}

export interface ExternalChatOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessagePayload[];
  temperature: number;
  stream: boolean;
  extraBody?: Record<string, unknown>;
  timeoutMs?: number;
}

/**
 * Fetches a user-supplied OpenAI-compatible /chat/completions endpoint.
 * Validates the URL against SSRF before touching the network and applies
 * a hard timeout so a misbehaving endpoint cannot hang the route.
 */
export async function fetchExternalChatCompletion(
  options: ExternalChatOptions
): Promise<Response> {
  const check = await validateExternalBaseUrl(options.baseUrl);
  if (!check.ok) {
    throw new ExternalUrlError(check.error);
  }

  const targetUrl = check.url.endsWith('/chat/completions')
    ? check.url
    : `${check.url.replace(/\/+$/, '')}/chat/completions`;

  const response = await fetch(targetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      temperature: options.temperature,
      stream: options.stream,
      ...(options.stream ? { stream_options: { include_usage: true } } : {}),
      ...options.extraBody,
    }),
    // The SSRF check only covers the first hop, so a redirect could be used to
    // reach an internal address. Refuse them instead of following.
    redirect: 'manual',
    // shortcut: one hard 10 min cap covers the whole stream; a slower generation is cut off.
    signal: AbortSignal.timeout(options.timeoutMs ?? 600_000),
  });

  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    throw new ExternalUrlError('The endpoint returned a redirect, which is not allowed.');
  }

  return response;
}

/**
 * Converts a fetch error (timeout / network failure / SSRF rejection) into
 * a user-safe NextResponse status pair.
 */
export function externalFetchErrorStatus(error: unknown): { status: number; message: string } {
  if (error instanceof ExternalUrlError) {
    return { status: 400, message: error.message };
  }
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return { status: 504, message: 'External endpoint timed out.' };
  }
  return { status: 502, message: 'Failed to reach the external endpoint.' };
}

export interface OllamaOptions {
  url: string;
  model: string;
  fetchImpl?: typeof fetch;
}

interface ChatResponse {
  message?: { content?: string };
}

/**
 * Chat completion constrained to JSON. Ollama 0.20.x reliably honours
 * `format: "json"` (the full JSON-schema mode is not enforced for all models),
 * so callers must also instruct the exact shape in the prompt and parse the
 * returned string themselves.
 */
export async function chatJson(
  opts: OllamaOptions,
  system: string,
  user: string,
): Promise<string> {
  const f = opts.fetchImpl ?? fetch;
  const res = await f(`${opts.url}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model,
      stream: false,
      format: "json",
      options: { temperature: 0 },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`ollama /api/chat failed: ${res.status}`);
  const body = (await res.json()) as ChatResponse;
  return body.message?.content ?? "";
}

/** Best-effort extraction of a JSON object from a model response. */
export function extractJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    // fall through
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      // fall through
    }
  }
  return null;
}

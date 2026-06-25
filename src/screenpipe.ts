export interface OcrFrame {
  appName: string | null;
  windowName: string | null;
  browserUrl: string | null;
  text: string;
  timestampMs: number;
  focused: boolean;
}

export interface ScreenpipeOptions {
  url: string;
  token: string;
  fetchImpl?: typeof fetch;
}

interface RawSearchResponse {
  data: {
    type: string;
    content: {
      app_name: string | null;
      window_name: string | null;
      browser_url: string | null;
      text: string;
      timestamp: string;
      focused: boolean;
    };
  }[];
}

function headers(token: string): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

export async function health(opts: ScreenpipeOptions): Promise<boolean> {
  const f = opts.fetchImpl ?? fetch;
  try {
    const res = await f(`${opts.url}/health`, { headers: headers(opts.token) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Most recent OCR frame, or null if none. Screenpipe returns newest-first. */
export async function latestOcrFrame(opts: ScreenpipeOptions): Promise<OcrFrame | null> {
  const f = opts.fetchImpl ?? fetch;
  const res = await f(`${opts.url}/search?content_type=ocr&limit=1`, {
    headers: headers(opts.token),
  });
  if (!res.ok) throw new Error(`screenpipe /search failed: ${res.status}`);
  const body = (await res.json()) as RawSearchResponse;
  const first = body.data?.[0];
  if (!first) return null;
  const c = first.content;
  const ts = Date.parse(c.timestamp);
  return {
    appName: c.app_name,
    windowName: c.window_name,
    browserUrl: c.browser_url,
    text: c.text ?? "",
    timestampMs: Number.isNaN(ts) ? 0 : ts,
    focused: c.focused,
  };
}

/** Collapse OCR whitespace and cap length for prompts / storage. */
export function snippet(text: string, max = 1200): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max) : clean;
}

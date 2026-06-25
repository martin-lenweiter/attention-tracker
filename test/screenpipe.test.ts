import { describe, it, expect, vi } from "vitest";
import { latestOcrFrame, snippet } from "../src/screenpipe.js";

function searchResponse() {
  return new Response(
    JSON.stringify({
      data: [
        {
          type: "OCR",
          content: {
            app_name: "Google Chrome",
            window_name: "Amazon - Headphones",
            browser_url: "https://amazon.com",
            text: "Add to Cart",
            timestamp: "2026-06-25T23:47:48.412203+02:00",
            focused: true,
          },
        },
      ],
    }),
    { status: 200 },
  );
}

describe("latestOcrFrame", () => {
  it("maps fields and parses the timestamp", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => searchResponse());
    const frame = await latestOcrFrame({
      url: "http://host:3030",
      token: "tok",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(frame).toEqual({
      appName: "Google Chrome",
      windowName: "Amazon - Headphones",
      browserUrl: "https://amazon.com",
      text: "Add to Cart",
      timestampMs: Date.parse("2026-06-25T23:47:48.412203+02:00"),
      focused: true,
    });
    // Sends bearer auth.
    const init = fetchImpl.mock.calls[0]?.[1];
    const h = (init?.headers ?? {}) as Record<string, string>;
    expect(h["Authorization"]).toBe("Bearer tok");
  });

  it("returns null on empty data", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );
    const frame = await latestOcrFrame({
      url: "http://h",
      token: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(frame).toBeNull();
  });

  it("throws on non-ok response", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 401 }));
    await expect(
      latestOcrFrame({
        url: "http://h",
        token: "t",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow();
  });
});

describe("snippet", () => {
  it("collapses whitespace and caps length", () => {
    expect(snippet("a   b\n\nc")).toBe("a b c");
    expect(snippet("abcdef", 3)).toBe("abc");
  });
});

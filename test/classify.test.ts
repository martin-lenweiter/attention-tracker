import { describe, it, expect, vi } from "vitest";
import {
  parseLabel,
  buildUserPrompt,
  createOllamaClassifier,
} from "../src/classify.js";

describe("parseLabel", () => {
  it("parses clean JSON and lowercases the activity", () => {
    expect(parseLabel('{"activity": "Reviewing A PR", "confidence": 0.9}')).toEqual({
      activity: "reviewing a pr",
      confidence: 0.9,
    });
  });

  it("extracts JSON embedded in prose", () => {
    const raw = 'Sure! {"activity": "shopping", "confidence": 0.8} hope that helps';
    expect(parseLabel(raw)).toEqual({ activity: "shopping", confidence: 0.8 });
  });

  it("falls back to unknown for non-JSON output", () => {
    expect(parseLabel("shopping for headphones 0.95")).toEqual({
      activity: "unknown",
      confidence: 0,
    });
  });

  it("clamps out-of-range confidence and handles non-numbers", () => {
    expect(parseLabel('{"activity":"x","confidence":5}').confidence).toBe(1);
    expect(parseLabel('{"activity":"x","confidence":-2}').confidence).toBe(0);
    expect(parseLabel('{"activity":"x","confidence":"high"}').confidence).toBe(0);
  });
});

describe("buildUserPrompt", () => {
  it("includes url only when present", () => {
    const withUrl = buildUserPrompt({
      app: "Chrome",
      window: "GitHub",
      browserUrl: "https://github.com",
      text: "code",
    });
    expect(withUrl).toContain("url: https://github.com");

    const noUrl = buildUserPrompt({
      app: "Terminal",
      window: "zsh",
      browserUrl: null,
      text: "ls",
    });
    expect(noUrl).not.toContain("url:");
  });
});

describe("createOllamaClassifier", () => {
  it("calls Ollama and returns a parsed label", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({ message: { content: '{"activity":"coding","confidence":0.7}' } }),
        { status: 200 },
      ),
    );
    const c = createOllamaClassifier({
      url: "http://x",
      model: "m",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const label = await c.classify({ app: "VS Code", window: "x", browserUrl: null, text: "y" });
    expect(label).toEqual({ activity: "coding", confidence: 0.7 });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});

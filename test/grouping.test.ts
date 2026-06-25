import { describe, it, expect, vi } from "vitest";
import { openDb, getCategory, listCategories } from "../src/db.js";
import { createOllamaGrouper, parseCategory } from "../src/grouping.js";

function ollamaResponse(category: string) {
  return new Response(
    JSON.stringify({ message: { content: JSON.stringify({ category, isNew: true }) } }),
    { status: 200 },
  );
}

describe("parseCategory", () => {
  it("lowercases and trims", () => {
    expect(parseCategory('{"category":"  Deep Work  "}')).toBe("deep work");
  });
  it("returns null on garbage", () => {
    expect(parseCategory("not json")).toBeNull();
  });
});

describe("createOllamaGrouper", () => {
  it("resolves a new label, persists the mapping, and caches it", async () => {
    const db = openDb(":memory:");
    const fetchImpl = vi.fn(async () => ollamaResponse("deep work"));
    const grouper = createOllamaGrouper(db, {
      url: "http://x",
      model: "m",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(await grouper.resolve("reviewing a pr")).toBe("deep work");
    expect(getCategory(db, "reviewing a pr")).toBe("deep work");
    expect(listCategories(db)).toContain("deep work");
    expect(fetchImpl).toHaveBeenCalledOnce();

    // Second call for the same label is a cache hit — no new model call.
    expect(await grouper.resolve("reviewing a pr")).toBe("deep work");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("does not persist an uncategorized fallback", async () => {
    const db = openDb(":memory:");
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ message: { content: "garbage" } }), { status: 200 }),
    );
    const grouper = createOllamaGrouper(db, {
      url: "http://x",
      model: "m",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(await grouper.resolve("weird thing")).toBe("uncategorized");
    expect(getCategory(db, "weird thing")).toBeUndefined();
  });
});

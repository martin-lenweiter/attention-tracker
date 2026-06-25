import { describe, it, expect, vi } from "vitest";
import { openDb, breakdownByCategory } from "../src/db.js";
import { runTick, type TickDeps } from "../src/sampler.js";
import type { Classifier } from "../src/classify.js";
import type { Grouper } from "../src/grouping.js";

const NOW = 1_700_000_000_000;

function searchFetch(frameTsMs: number, text = "some code on screen") {
  return vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              type: "OCR",
              content: {
                app_name: "VS Code",
                window_name: "sampler.ts",
                browser_url: null,
                text,
                timestamp: new Date(frameTsMs).toISOString(),
                focused: true,
              },
            },
          ],
        }),
        { status: 200 },
      ),
  );
}

function idleFetch(idleSeconds: number | "error") {
  return vi.fn(async () => {
    if (idleSeconds === "error") return new Response("x", { status: 500 });
    return new Response(JSON.stringify({ idleSeconds }), { status: 200 });
  });
}

function makeDeps(over: Partial<TickDeps>): TickDeps {
  const db = over.db ?? openDb(":memory:");
  const classifier: Classifier = over.classifier ?? {
    classify: vi.fn(async () => ({ activity: "coding", confidence: 0.8 })),
  };
  const grouper: Grouper = over.grouper ?? { resolve: vi.fn(async () => "deep work") };
  return {
    db,
    screenpipe: { url: "http://mac:3030", token: "t", fetchImpl: searchFetch(NOW - 1000) },
    classifier,
    grouper,
    idleUrl: "http://mac:3031",
    idleThresholdSec: 90,
    intervalSec: 60,
    now: () => NOW,
    fetchImpl: idleFetch(5) as unknown as typeof fetch,
    ...over,
  };
}

describe("runTick", () => {
  it("active: classifies, groups, and stores a 60s active sample", async () => {
    const db = openDb(":memory:");
    const classify = vi.fn(async () => ({ activity: "coding", confidence: 0.8 }));
    const resolve = vi.fn(async () => "deep work");
    const deps = makeDeps({
      db,
      classifier: { classify },
      grouper: { resolve },
      fetchImpl: idleFetch(5) as unknown as typeof fetch,
    });

    const sample = await runTick(deps);

    expect(sample.idle).toBe(false);
    expect(sample.rawLabel).toBe("coding");
    expect(sample.tsEnd - sample.tsStart).toBe(60_000);
    expect(classify).toHaveBeenCalledOnce();
    expect(resolve).toHaveBeenCalledWith("coding");

    // Category resolves to "deep work" via the grouper's persisted mapping is
    // mocked, so query uncategorized math instead: 60s total attributed.
    const total = breakdownByCategory(db, NOW - 120_000, NOW + 1000).reduce(
      (a, r) => a + r.seconds,
      0,
    );
    expect(total).toBe(60);
  });

  it("idle: when idle exceeds threshold, stores idle and skips classification", async () => {
    const classify = vi.fn(async () => ({ activity: "x", confidence: 1 }));
    const deps = makeDeps({
      classifier: { classify },
      fetchImpl: idleFetch(200) as unknown as typeof fetch,
    });

    const sample = await runTick(deps);

    expect(sample.idle).toBe(true);
    expect(sample.rawLabel).toBeNull();
    expect(classify).not.toHaveBeenCalled();
  });

  it("falls back to frame staleness when the idle reporter is unreachable", async () => {
    const classify = vi.fn(async () => ({ activity: "x", confidence: 1 }));
    const deps = makeDeps({
      classifier: { classify },
      screenpipe: {
        url: "http://mac:3030",
        token: "t",
        fetchImpl: searchFetch(NOW - 10 * 60_000) as unknown as typeof fetch, // 10 min stale
      },
      fetchImpl: idleFetch("error") as unknown as typeof fetch,
    });

    const sample = await runTick(deps);
    expect(sample.idle).toBe(true);
    expect(classify).not.toHaveBeenCalled();
  });
});

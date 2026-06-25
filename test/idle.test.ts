import { describe, it, expect, vi } from "vitest";
import { parseHidIdleSeconds, fetchIdleSeconds } from "../src/idle.js";

describe("parseHidIdleSeconds", () => {
  it("takes the minimum across devices, in seconds", () => {
    const out = `
      | | "HIDIdleTime" = 5000000000
      | | "HIDIdleTime" = 2000000000
    `;
    expect(parseHidIdleSeconds(out)).toBe(2);
  });

  it("returns null when absent", () => {
    expect(parseHidIdleSeconds("nothing here")).toBeNull();
  });
});

describe("fetchIdleSeconds", () => {
  it("returns the number on success", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ idleSeconds: 12.5 }), { status: 200 }),
    );
    expect(await fetchIdleSeconds("http://h", fetchImpl as unknown as typeof fetch)).toBe(12.5);
  });

  it("returns null on error or bad body", async () => {
    const bad = vi.fn(async () => new Response("x", { status: 500 }));
    expect(await fetchIdleSeconds("http://h", bad as unknown as typeof fetch)).toBeNull();

    const throws = vi.fn(async () => {
      throw new Error("network");
    });
    expect(await fetchIdleSeconds("http://h", throws as unknown as typeof fetch)).toBeNull();
  });
});

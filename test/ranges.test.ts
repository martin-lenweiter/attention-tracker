import { describe, it, expect } from "vitest";
import { resolveRange, formatDuration } from "../src/ranges.js";

// Fixed "now": 2026-06-25T15:30:00 local.
const NOW = new Date(2026, 5, 25, 15, 30, 0).getTime();
const startToday = new Date(2026, 5, 25, 0, 0, 0, 0).getTime();
const DAY = 86_400_000;

describe("resolveRange", () => {
  it("today: from local midnight to now", () => {
    expect(resolveRange({ range: "today" }, () => NOW)).toEqual({
      fromMs: startToday,
      toMs: NOW,
    });
  });

  it("yesterday: previous full local day", () => {
    expect(resolveRange({ range: "yesterday" }, () => NOW)).toEqual({
      fromMs: startToday - DAY,
      toMs: startToday,
    });
  });

  it("week: last 7 calendar days ending now", () => {
    expect(resolveRange({ range: "week" }, () => NOW)).toEqual({
      fromMs: startToday - 6 * DAY,
      toMs: NOW,
    });
  });

  it("defaults to today", () => {
    expect(resolveRange({}, () => NOW)).toEqual({ fromMs: startToday, toMs: NOW });
  });

  it("explicit from/to overrides range", () => {
    const r = resolveRange(
      { range: "today", from: "2026-01-01T00:00:00Z", to: "2026-01-02T00:00:00Z" },
      () => NOW,
    );
    expect(r.fromMs).toBe(Date.parse("2026-01-01T00:00:00Z"));
    expect(r.toMs).toBe(Date.parse("2026-01-02T00:00:00Z"));
  });

  it("throws on invalid dates and unknown range", () => {
    expect(() => resolveRange({ from: "nope", to: "also nope" })).toThrow();
    expect(() => resolveRange({ range: "decade" }, () => NOW)).toThrow();
  });
});

describe("formatDuration", () => {
  it("formats h/m/s", () => {
    expect(formatDuration(3 * 3600 + 25 * 60)).toBe("3h 25m");
    expect(formatDuration(42 * 60)).toBe("42m");
    expect(formatDuration(30)).toBe("30s");
  });
});

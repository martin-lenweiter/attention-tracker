import { describe, it, expect } from "vitest";
import {
  openDb,
  insertSample,
  setCategory,
  getCategory,
  listCategories,
  unmappedLabels,
  breakdownByCategory,
  activities,
  timeline,
  IDLE_CATEGORY,
  UNCATEGORIZED,
  type NewSample,
} from "../src/db.js";

const BASE = 1_700_000_000_000; // fixed ms

function active(tsStart: number, label: string, durSec = 60): NewSample {
  return {
    tsStart,
    tsEnd: tsStart + durSec * 1000,
    app: "App",
    window: "Win",
    ocrSnippet: "text",
    rawLabel: label,
    confidence: 0.9,
    idle: false,
  };
}

function idle(tsStart: number, durSec = 60): NewSample {
  return {
    tsStart,
    tsEnd: tsStart + durSec * 1000,
    app: null,
    window: null,
    ocrSnippet: null,
    rawLabel: null,
    confidence: null,
    idle: true,
  };
}

describe("db time attribution", () => {
  it("sums durations per category, mapping idle and unmapped correctly", () => {
    const db = openDb(":memory:");
    insertSample(db, active(BASE, "reviewing a pr"));
    insertSample(db, active(BASE + 60_000, "reviewing a pr"));
    insertSample(db, active(BASE + 120_000, "answering slack"));
    insertSample(db, active(BASE + 180_000, "browsing reddit")); // left unmapped
    insertSample(db, idle(BASE + 240_000));

    setCategory(db, "reviewing a pr", "deep work");
    setCategory(db, "answering slack", "communication");

    const rows = breakdownByCategory(db, BASE, BASE + 10 * 60_000);
    const byCat = Object.fromEntries(rows.map((r) => [r.category, r.seconds]));

    expect(byCat["deep work"]).toBe(120);
    expect(byCat["communication"]).toBe(60);
    expect(byCat[UNCATEGORIZED]).toBe(60);
    expect(byCat[IDLE_CATEGORY]).toBe(60);
  });

  it("respects the time window", () => {
    const db = openDb(":memory:");
    insertSample(db, active(BASE, "x"));
    insertSample(db, active(BASE + 3_600_000, "x")); // an hour later
    const rows = breakdownByCategory(db, BASE, BASE + 60_000);
    expect(rows.reduce((a, r) => a + r.seconds, 0)).toBe(60);
  });
});

describe("category mapping", () => {
  it("caches label->category and registers the category", () => {
    const db = openDb(":memory:");
    expect(getCategory(db, "writing spec")).toBeUndefined();
    setCategory(db, "writing spec", "deep work");
    expect(getCategory(db, "writing spec")).toBe("deep work");
    expect(listCategories(db)).toContain("deep work");
    expect(listCategories(db)).toContain(IDLE_CATEGORY); // seeded
  });

  it("lists only labels without a mapping (excludes idle)", () => {
    const db = openDb(":memory:");
    insertSample(db, active(BASE, "mapped one"));
    insertSample(db, active(BASE + 60_000, "unmapped one"));
    insertSample(db, idle(BASE + 120_000));
    setCategory(db, "mapped one", "work");

    const unmapped = unmappedLabels(db);
    expect(unmapped).toEqual(["unmapped one"]);
  });
});

describe("activities and timeline", () => {
  it("returns per-label totals and can filter by category", () => {
    const db = openDb(":memory:");
    insertSample(db, active(BASE, "reviewing a pr"));
    insertSample(db, active(BASE + 60_000, "answering slack"));
    setCategory(db, "reviewing a pr", "deep work");
    setCategory(db, "answering slack", "communication");

    const all = activities(db, BASE, BASE + 600_000);
    expect(all.map((a) => a.rawLabel).sort()).toEqual([
      "answering slack",
      "reviewing a pr",
    ]);

    const onlyWork = activities(db, BASE, BASE + 600_000, "deep work");
    expect(onlyWork).toHaveLength(1);
    expect(onlyWork[0]?.rawLabel).toBe("reviewing a pr");
  });

  it("returns ordered timeline with idle flagged", () => {
    const db = openDb(":memory:");
    insertSample(db, active(BASE + 60_000, "second"));
    insertSample(db, active(BASE, "first"));
    insertSample(db, idle(BASE + 120_000));

    const t = timeline(db, BASE, BASE + 600_000);
    expect(t.map((e) => e.rawLabel)).toEqual(["first", "second", null]);
    expect(t[2]?.idle).toBe(true);
    expect(t[2]?.category).toBe(IDLE_CATEGORY);
  });
});

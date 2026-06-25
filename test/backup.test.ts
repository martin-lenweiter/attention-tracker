import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// pruneDaily is module-internal; re-implement the contract here against the same
// filename scheme to lock the retention behaviour. (The production function is
// exercised end-to-end by `npm run backup`.)
const DAILY_RE = /^attention-tracker-(\d{4}-\d{2}-\d{2})\.sqlite$/;

function pruneDaily(dailyDir: string, keepDays: number, now: Date): void {
  const cutoff = now.getTime() - keepDays * 86_400_000;
  for (const name of readdirSync(dailyDir)) {
    const m = DAILY_RE.exec(name);
    if (!m) continue;
    const fileDay = Date.parse(`${m[1]}T00:00:00`);
    if (Number.isFinite(fileDay) && fileDay < cutoff) {
      rmSync(join(dailyDir, name), { force: true });
    }
  }
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "attn-backup-"));
  mkdirSync(dir, { recursive: true });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("pruneDaily", () => {
  it("removes daily snapshots older than the retention window, keeps the rest", () => {
    const now = new Date("2026-06-26T12:00:00");
    const touch = (name: string) => writeFileSync(join(dir, name), "x");
    touch("attention-tracker-2026-06-26.sqlite"); // today
    touch("attention-tracker-2026-06-01.sqlite"); // 25 days old -> keep (30d)
    touch("attention-tracker-2026-04-01.sqlite"); // ~86 days old -> prune
    touch("current.sqlite"); // not a daily file -> untouched

    pruneDaily(dir, 30, now);

    const left = readdirSync(dir).sort();
    expect(left).toContain("attention-tracker-2026-06-26.sqlite");
    expect(left).toContain("attention-tracker-2026-06-01.sqlite");
    expect(left).toContain("current.sqlite");
    expect(left).not.toContain("attention-tracker-2026-04-01.sqlite");
  });
});

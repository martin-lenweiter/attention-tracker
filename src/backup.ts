import Database from "better-sqlite3";
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { config } from "./config.js";

// Consistent SQLite snapshot into the iCloud Drive folder (Apple syncs it to the
// cloud). We never put the live WAL DB in iCloud directly — better-sqlite3's
// online backup captures a coherent copy while the sampler keeps writing.
//
// Layout in <backup.dir>:
//   current.sqlite                          always the latest snapshot
//   daily/attention-tracker-YYYY-MM-DD.sqlite   one per day, pruned after N days

function dayStamp(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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

export async function runBackup(now: Date = new Date()): Promise<string> {
  const dir = config.backup.dir;
  const dailyDir = join(dir, "daily");
  mkdirSync(dailyDir, { recursive: true });

  const tmp = join(dir, `.current.sqlite.tmp-${now.getTime()}`);
  const current = join(dir, "current.sqlite");

  // Online backup to a temp file on the same filesystem, then atomic rename.
  const db = new Database(config.dbPath, { readonly: true });
  try {
    await db.backup(tmp);
  } finally {
    db.close();
  }
  renameSync(tmp, current);

  // Maintain one snapshot per day (overwrites within the same day).
  const dailyPath = join(dailyDir, `attention-tracker-${dayStamp(now)}.sqlite`);
  copyFileSync(current, dailyPath);

  pruneDaily(dailyDir, config.backup.keepDailyDays, now);
  return current;
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  runBackup()
    .then((p) => console.log(`backup written: ${p}`))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type DB = InstanceType<typeof Database>;

export const IDLE_CATEGORY = "idle/away";
export const UNCATEGORIZED = "uncategorized";

export interface NewSample {
  tsStart: number; // unix ms
  tsEnd: number; // unix ms
  app: string | null;
  window: string | null;
  browserUrl: string | null; // from the a11y tree; null for non-browser frames
  ocrSnippet: string | null;
  rawLabel: string | null; // null when idle
  confidence: number | null;
  idle: boolean;
}

export interface CategoryTotal {
  category: string;
  seconds: number;
}

export interface ActivityTotal {
  rawLabel: string;
  category: string;
  seconds: number;
}

export interface TimelineEntry {
  tsStart: number;
  tsEnd: number;
  app: string | null;
  window: string | null;
  rawLabel: string | null;
  category: string;
  idle: boolean;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS samples (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts_start    INTEGER NOT NULL,
  ts_end      INTEGER NOT NULL,
  app         TEXT,
  window      TEXT,
  browser_url TEXT,
  ocr_snippet TEXT,
  raw_label   TEXT,
  confidence  REAL,
  idle        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_samples_ts ON samples (ts_start);

CREATE TABLE IF NOT EXISTS categories (
  name       TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS label_map (
  raw_label  TEXT PRIMARY KEY,
  category   TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`;

export function openDb(path: string, now: () => number = Date.now): DB {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 5000");
  db.exec(SCHEMA);
  ensureColumn(db, "samples", "browser_url", "TEXT");
  // Idle is a permanent built-in category so totals always resolve.
  ensureCategory(db, IDLE_CATEGORY, now);
  return db;
}

// Add a column to an existing table if it's missing (CREATE TABLE IF NOT EXISTS
// won't alter an already-created table). Idempotent.
function ensureColumn(db: DB, table: string, column: string, decl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
  }
}

export function insertSample(db: DB, s: NewSample): void {
  db.prepare(
    `INSERT INTO samples (ts_start, ts_end, app, window, browser_url, ocr_snippet, raw_label, confidence, idle)
     VALUES (@tsStart, @tsEnd, @app, @window, @browserUrl, @ocrSnippet, @rawLabel, @confidence, @idle)`,
  ).run({
    tsStart: s.tsStart,
    tsEnd: s.tsEnd,
    app: s.app,
    window: s.window,
    browserUrl: s.browserUrl,
    ocrSnippet: s.ocrSnippet,
    rawLabel: s.rawLabel,
    confidence: s.confidence,
    idle: s.idle ? 1 : 0,
  });
}

export function ensureCategory(db: DB, name: string, now: () => number = Date.now): void {
  db.prepare(`INSERT OR IGNORE INTO categories (name, created_at) VALUES (?, ?)`).run(
    name,
    now(),
  );
}

export function listCategories(db: DB): string[] {
  const rows = db.prepare(`SELECT name FROM categories ORDER BY name`).all() as {
    name: string;
  }[];
  return rows.map((r) => r.name);
}

export function getCategory(db: DB, rawLabel: string): string | undefined {
  const row = db
    .prepare(`SELECT category FROM label_map WHERE raw_label = ?`)
    .get(rawLabel) as { category: string } | undefined;
  return row?.category;
}

/** Cache a raw_label -> category mapping and register the category. */
export function setCategory(
  db: DB,
  rawLabel: string,
  category: string,
  now: () => number = Date.now,
): void {
  const tx = db.transaction(() => {
    ensureCategory(db, category, now);
    db.prepare(
      `INSERT INTO label_map (raw_label, category, created_at) VALUES (?, ?, ?)
       ON CONFLICT(raw_label) DO UPDATE SET category = excluded.category`,
    ).run(rawLabel, category, now());
  });
  tx();
}

/** Distinct raw labels that have no category mapping yet (excludes idle rows). */
export function unmappedLabels(db: DB): string[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT s.raw_label AS raw_label
       FROM samples s
       LEFT JOIN label_map m ON m.raw_label = s.raw_label
       WHERE s.idle = 0 AND s.raw_label IS NOT NULL AND m.raw_label IS NULL`,
    )
    .all() as { raw_label: string }[];
  return rows.map((r) => r.raw_label);
}

// Each row's category: idle rows -> IDLE_CATEGORY; mapped rows -> their category;
// labelled-but-unmapped rows -> UNCATEGORIZED.
const CATEGORY_EXPR = `CASE
  WHEN s.idle = 1 THEN '${IDLE_CATEGORY}'
  WHEN m.category IS NOT NULL THEN m.category
  ELSE '${UNCATEGORIZED}'
END`;

export function breakdownByCategory(db: DB, fromMs: number, toMs: number): CategoryTotal[] {
  return db
    .prepare(
      // GROUP BY ordinal: `category` as a name would bind to label_map.category
      // (NULL for idle/unmapped rows) instead of the computed expression.
      `SELECT ${CATEGORY_EXPR} AS category,
              SUM(s.ts_end - s.ts_start) / 1000.0 AS seconds
       FROM samples s
       LEFT JOIN label_map m ON m.raw_label = s.raw_label
       WHERE s.ts_start >= ? AND s.ts_start < ?
       GROUP BY 1
       ORDER BY 2 DESC`,
    )
    .all(fromMs, toMs) as CategoryTotal[];
}

export function activities(
  db: DB,
  fromMs: number,
  toMs: number,
  category?: string,
): ActivityTotal[] {
  const rows = db
    .prepare(
      `SELECT COALESCE(s.raw_label, '${IDLE_CATEGORY}') AS rawLabel,
              ${CATEGORY_EXPR} AS category,
              SUM(s.ts_end - s.ts_start) / 1000.0 AS seconds
       FROM samples s
       LEFT JOIN label_map m ON m.raw_label = s.raw_label
       WHERE s.ts_start >= ? AND s.ts_start < ?
       GROUP BY 1, 2
       ORDER BY 3 DESC`,
    )
    .all(fromMs, toMs) as ActivityTotal[];
  return category ? rows.filter((r) => r.category === category) : rows;
}

export function timeline(db: DB, fromMs: number, toMs: number): TimelineEntry[] {
  const rows = db
    .prepare(
      `SELECT s.ts_start AS tsStart, s.ts_end AS tsEnd, s.app AS app, s.window AS window,
              s.raw_label AS rawLabel, ${CATEGORY_EXPR} AS category, s.idle AS idle
       FROM samples s
       LEFT JOIN label_map m ON m.raw_label = s.raw_label
       WHERE s.ts_start >= ? AND s.ts_start < ?
       ORDER BY s.ts_start ASC`,
    )
    .all(fromMs, toMs) as (Omit<TimelineEntry, "idle"> & { idle: number })[];
  return rows.map((r) => ({ ...r, idle: r.idle === 1 }));
}

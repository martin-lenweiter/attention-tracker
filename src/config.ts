import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Minimal .env loader (KEY=VALUE lines) so secrets stay out of git. No dependency.
function loadEnvFile(): void {
  try {
    const raw = readFileSync(join(process.cwd(), ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // no .env file — rely on real env vars (e.g. from launchd)
  }
}
loadEnvFile();

const env = process.env;

export const config = {
  // Screenpipe REST API on the MacBook, reached over Tailscale by MagicDNS name.
  screenpipe: {
    url: env.SCREENPIPE_URL ?? "http://martins-macbook-pro.taild7427e.ts.net:3030",
    // Local API key (sp-...). --listen-on-lan forces --api-auth, so remote calls need it.
    token: env.SCREENPIPE_TOKEN ?? "",
  },
  // Ollama already running on the mini.
  ollama: {
    url: env.OLLAMA_URL ?? "http://localhost:11434",
    model: env.OLLAMA_MODEL ?? "gemma4:e4b",
  },
  // Idle-reporter on the MacBook (HIDIdleTime over Tailscale).
  idle: {
    url: env.IDLE_URL ?? "http://martins-macbook-pro.taild7427e.ts.net:3031",
    // Treat the tick as away when idle exceeds this (seconds).
    thresholdSec: Number(env.IDLE_THRESHOLD_SEC ?? 90),
  },
  // SQLite DB on the mini.
  dbPath: env.TT_DB_PATH ?? join(homedir(), ".time-tracker", "data.sqlite"),
  // Sampler cadence (seconds). Each tick attributes this much time to one label.
  sampleIntervalSec: Number(env.TT_SAMPLE_INTERVAL_SEC ?? 60),
  // Backup target. Default is the iCloud Drive folder, which Apple syncs to cloud.
  backup: {
    dir:
      env.BACKUP_DIR ??
      join(homedir(), "Library/Mobile Documents/com~apple~CloudDocs/attention-tracker"),
    keepDailyDays: Number(env.BACKUP_KEEP_DAILY_DAYS ?? 30),
  },
} as const;

export type Config = typeof config;

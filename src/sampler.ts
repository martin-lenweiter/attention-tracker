import { config } from "./config.js";
import { insertSample, openDb, type DB, type NewSample } from "./db.js";
import { createOllamaClassifier, type Classifier } from "./classify.js";
import { createOllamaGrouper, type Grouper } from "./grouping.js";
import { fetchIdleSeconds } from "./idle.js";
import { latestOcrFrame, snippet, type ScreenpipeOptions } from "./screenpipe.js";

export interface TickDeps {
  db: DB;
  screenpipe: ScreenpipeOptions;
  classifier: Classifier;
  grouper: Grouper;
  idleUrl: string;
  idleThresholdSec: number;
  intervalSec: number;
  now?: () => number;
  fetchImpl?: typeof fetch;
}

/**
 * One sampling tick. Attributes `intervalSec` of time to a single activity:
 * idle/away when the MacBook was idle (or no fresh frame), otherwise the
 * classified + grouped activity from the latest screen frame.
 */
export async function runTick(deps: TickDeps): Promise<NewSample> {
  const now = deps.now ?? Date.now;
  const tsEnd = now();
  const tsStart = tsEnd - deps.intervalSec * 1000;

  const idleSeconds = await fetchIdleSeconds(deps.idleUrl, deps.fetchImpl ?? fetch);

  let frame = null;
  try {
    frame = await latestOcrFrame(deps.screenpipe);
  } catch {
    frame = null;
  }

  const frameAgeSec = frame ? (tsEnd - frame.timestampMs) / 1000 : Infinity;
  // Prefer the real idle signal; fall back to frame staleness if unreachable.
  const isIdle =
    idleSeconds !== null
      ? idleSeconds > deps.idleThresholdSec
      : frameAgeSec > deps.idleThresholdSec;

  if (isIdle || !frame) {
    const sample: NewSample = {
      tsStart,
      tsEnd,
      app: frame?.appName ?? null,
      window: frame?.windowName ?? null,
      browserUrl: frame?.browserUrl ?? null,
      ocrSnippet: null,
      rawLabel: null,
      confidence: null,
      idle: true,
    };
    insertSample(deps.db, sample);
    return sample;
  }

  const text = snippet(frame.text);
  const label = await deps.classifier.classify({
    app: frame.appName,
    window: frame.windowName,
    browserUrl: frame.browserUrl,
    text,
  });
  // Populate the label -> category mapping (cheap after first occurrence).
  await deps.grouper.resolve(label.activity);

  const sample: NewSample = {
    tsStart,
    tsEnd,
    app: frame.appName,
    window: frame.windowName,
    browserUrl: frame.browserUrl,
    ocrSnippet: text,
    rawLabel: label.activity,
    confidence: label.confidence,
    idle: false,
  };
  insertSample(deps.db, sample);
  return sample;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const db = openDb(config.dbPath);
  const ollama = config.ollama;
  const deps: TickDeps = {
    db,
    screenpipe: config.screenpipe,
    classifier: createOllamaClassifier(ollama),
    grouper: createOllamaGrouper(db, ollama),
    idleUrl: config.idle.url,
    idleThresholdSec: config.idle.thresholdSec,
    intervalSec: config.sampleIntervalSec,
  };

  console.log(
    `sampler: every ${deps.intervalSec}s | screenpipe ${deps.screenpipe.url} | ollama ${ollama.model} | db ${config.dbPath}`,
  );

  let running = true;
  process.on("SIGINT", () => {
    running = false;
  });
  process.on("SIGTERM", () => {
    running = false;
  });

  while (running) {
    const startedAt = Date.now();
    try {
      const s = await runTick(deps);
      const tag = s.idle ? "idle/away" : `${s.rawLabel} (${s.confidence})`;
      console.log(`[${new Date(s.tsEnd).toISOString()}] ${tag}`);
    } catch (err) {
      console.error("tick failed:", err);
    }
    const elapsed = Date.now() - startedAt;
    await sleep(Math.max(0, deps.intervalSec * 1000 - elapsed));
  }

  db.close();
}

// Run only when executed directly (not when imported by tests).
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

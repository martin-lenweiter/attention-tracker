import {
  getCategory,
  listCategories,
  setCategory,
  IDLE_CATEGORY,
  UNCATEGORIZED,
  type DB,
} from "./db.js";
import { chatJson, extractJsonObject, type OllamaOptions } from "./ollama.js";

// Incrementally resolve a fine-grained raw label into a broad canonical category.
export interface Grouper {
  resolve(rawLabel: string): Promise<string>;
}

const SYSTEM = [
  "You organize fine-grained computer-activity labels into a small set of broad",
  "categories for a personal time-tracking dashboard (aim for 5-12 total categories",
  "covering everything, e.g. 'deep work', 'communication', 'research', 'shopping',",
  "'entertainment', 'admin').",
  "Given EXISTING categories and a new activity label, reuse an existing category if",
  "one reasonably fits; otherwise propose a NEW concise category (1-3 lowercase words).",
  'Respond ONLY with JSON: {"category": "<name>", "isNew": <true|false>}. No prose.',
].join(" ");

function buildPrompt(rawLabel: string, existing: string[]): string {
  const list = existing.length ? existing.join(", ") : "(none yet)";
  return `existing categories: ${list}\nactivity label: ${rawLabel}`;
}

export function parseCategory(raw: string): string | null {
  const obj = extractJsonObject(raw);
  if (obj && typeof obj.category === "string" && obj.category.trim()) {
    return obj.category.trim().toLowerCase();
  }
  return null;
}

export function createOllamaGrouper(db: DB, opts: OllamaOptions): Grouper {
  return {
    async resolve(rawLabel: string): Promise<string> {
      const label = rawLabel.trim();
      if (!label) return UNCATEGORIZED;

      const cached = getCategory(db, label);
      if (cached) return cached;

      const existing = listCategories(db).filter(
        (c) => c !== IDLE_CATEGORY && c !== UNCATEGORIZED,
      );
      const raw = await chatJson(opts, SYSTEM, buildPrompt(label, existing));
      const category = parseCategory(raw) ?? UNCATEGORIZED;

      // Only persist a real resolution; leave UNCATEGORIZED unmapped so a later
      // regroup can retry it.
      if (category !== UNCATEGORIZED) setCategory(db, label, category);
      return category;
    },
  };
}

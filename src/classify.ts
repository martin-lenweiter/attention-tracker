import { chatJson, extractJsonObject, type OllamaOptions } from "./ollama.js";

export interface ClassifyInput {
  app: string | null;
  window: string | null;
  browserUrl: string | null;
  text: string;
}

export interface Label {
  activity: string;
  confidence: number;
}

// Small interface so the model backend (Ollama now, Claude API later) is one swap.
export interface Classifier {
  classify(input: ClassifyInput): Promise<Label>;
}

const SYSTEM = [
  "You label what the user is doing on their computer from a single screen snapshot.",
  "Output a fine-grained, free-form activity label describing the SPECIFIC activity,",
  "not just the app. Good: 'reviewing a pull request on GitHub', 'shopping for headphones',",
  "'writing a product spec', 'watching a youtube tutorial'. Bad: 'using Chrome'.",
  'Respond ONLY with JSON of exactly this shape: {"activity": "<3-7 word label>", "confidence": <number 0-1>}.',
  "No prose, no markdown.",
].join(" ");

export function buildUserPrompt(input: ClassifyInput): string {
  const lines = [
    `app: ${input.app ?? "unknown"}`,
    `window: ${input.window ?? "unknown"}`,
  ];
  if (input.browserUrl) lines.push(`url: ${input.browserUrl}`);
  lines.push(`screen text: ${input.text || "(none)"}`);
  return lines.join("\n");
}

export function parseLabel(raw: string): Label {
  const obj = extractJsonObject(raw);
  const activity =
    obj && typeof obj.activity === "string" && obj.activity.trim()
      ? obj.activity.trim()
      : "unknown";
  let confidence = obj && typeof obj.confidence === "number" ? obj.confidence : 0;
  if (!Number.isFinite(confidence)) confidence = 0;
  confidence = Math.max(0, Math.min(1, confidence));
  return { activity: activity.toLowerCase(), confidence };
}

export function createOllamaClassifier(opts: OllamaOptions): Classifier {
  return {
    async classify(input: ClassifyInput): Promise<Label> {
      const raw = await chatJson(opts, SYSTEM, buildUserPrompt(input));
      return parseLabel(raw);
    },
  };
}

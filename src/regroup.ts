import { config } from "./config.js";
import { openDb, unmappedLabels } from "./db.js";
import { createOllamaGrouper } from "./grouping.js";

// Re-resolve any raw labels that have no category yet (e.g. earlier UNCATEGORIZED
// fallbacks, or labels captured before grouping ran). Raw samples are untouched.
async function main(): Promise<void> {
  const db = openDb(config.dbPath);
  const grouper = createOllamaGrouper(db, config.ollama);
  const labels = unmappedLabels(db);
  console.log(`regrouping ${labels.length} unmapped label(s)...`);
  for (const label of labels) {
    const category = await grouper.resolve(label);
    console.log(`  ${label} -> ${category}`);
  }
  db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

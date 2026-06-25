import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { config } from "./config.js";
import {
  activities,
  breakdownByCategory,
  listCategories,
  openDb,
  timeline,
} from "./db.js";
import { formatDuration, resolveRange } from "./ranges.js";

const rangeShape = {
  range: z
    .enum(["today", "yesterday", "week"])
    .optional()
    .describe("Named range. Ignored if both from and to are given. Default: today."),
  from: z.string().optional().describe("Start (ISO/parseable date). Use with `to`."),
  to: z.string().optional().describe("End (ISO/parseable date). Use with `from`."),
};

function jsonContent(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

export function buildServer(dbPath: string): McpServer {
  const db = openDb(dbPath);
  const server = new McpServer({ name: "time-tracker", version: "0.1.0" });

  server.registerTool(
    "get_time_breakdown",
    {
      description: "Total time per activity category over a range.",
      inputSchema: rangeShape,
    },
    async ({ range, from, to }) => {
      const { fromMs, toMs } = resolveRange({ range, from, to });
      const rows = breakdownByCategory(db, fromMs, toMs);
      return jsonContent({
        from: new Date(fromMs).toISOString(),
        to: new Date(toMs).toISOString(),
        breakdown: rows.map((r) => ({
          category: r.category,
          seconds: Math.round(r.seconds),
          human: formatDuration(r.seconds),
        })),
      });
    },
  );

  server.registerTool(
    "get_activities",
    {
      description:
        "Time per fine-grained activity label over a range, optionally filtered to one category.",
      inputSchema: { ...rangeShape, category: z.string().optional() },
    },
    async ({ range, from, to, category }) => {
      const { fromMs, toMs } = resolveRange({ range, from, to });
      const rows = activities(db, fromMs, toMs, category);
      return jsonContent({
        from: new Date(fromMs).toISOString(),
        to: new Date(toMs).toISOString(),
        activities: rows.map((r) => ({
          label: r.rawLabel,
          category: r.category,
          seconds: Math.round(r.seconds),
          human: formatDuration(r.seconds),
        })),
      });
    },
  );

  server.registerTool(
    "get_timeline",
    {
      description: "Ordered activity intervals over a range (for a timeline view).",
      inputSchema: rangeShape,
    },
    async ({ range, from, to }) => {
      const { fromMs, toMs } = resolveRange({ range, from, to });
      const rows = timeline(db, fromMs, toMs);
      return jsonContent({
        from: new Date(fromMs).toISOString(),
        to: new Date(toMs).toISOString(),
        timeline: rows.map((r) => ({
          start: new Date(r.tsStart).toISOString(),
          end: new Date(r.tsEnd).toISOString(),
          app: r.app,
          window: r.window,
          label: r.idle ? "idle/away" : r.rawLabel,
          category: r.category,
        })),
      });
    },
  );

  server.registerTool(
    "list_categories",
    { description: "List current canonical activity categories.", inputSchema: {} },
    async () => jsonContent({ categories: listCategories(db) }),
  );

  return server;
}

async function main(): Promise<void> {
  const server = buildServer(config.dbPath);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

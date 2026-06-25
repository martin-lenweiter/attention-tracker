export interface ResolvedRange {
  fromMs: number;
  toMs: number;
}

export interface RangeOpts {
  range?: string;
  from?: string;
  to?: string;
}

function startOfLocalDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const DAY = 86_400_000;

/**
 * Resolve a named range ("today" | "yesterday" | "week") or an explicit
 * {from,to} (ISO/parseable date strings) into millisecond bounds.
 * Explicit from+to takes precedence over `range`.
 */
export function resolveRange(opts: RangeOpts, now: () => number = Date.now): ResolvedRange {
  if (opts.from && opts.to) {
    const fromMs = Date.parse(opts.from);
    const toMs = Date.parse(opts.to);
    if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
      throw new Error(`invalid from/to: ${opts.from} / ${opts.to}`);
    }
    return { fromMs, toMs };
  }

  const nowMs = now();
  const startToday = startOfLocalDay(nowMs);
  switch (opts.range ?? "today") {
    case "today":
      return { fromMs: startToday, toMs: nowMs };
    case "yesterday":
      return { fromMs: startToday - DAY, toMs: startToday };
    case "week":
      return { fromMs: startToday - 6 * DAY, toMs: nowMs };
    default:
      throw new Error(`unknown range: ${opts.range}`);
  }
}

export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${total}s`;
}

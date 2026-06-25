import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Parse seconds-since-last-input from `ioreg -c IOHIDSystem` output.
 * HIDIdleTime is nanoseconds since each device's last event; system idle is the
 * smallest value (the most recently used device). Returns null if not found.
 */
export function parseHidIdleSeconds(ioregOutput: string): number | null {
  const matches = [...ioregOutput.matchAll(/"HIDIdleTime"\s*=\s*(\d+)/g)];
  if (matches.length === 0) return null;
  let minNs = Infinity;
  for (const m of matches) {
    const ns = Number(m[1]);
    if (Number.isFinite(ns) && ns < minNs) minNs = ns;
  }
  if (!Number.isFinite(minNs)) return null;
  return minNs / 1e9;
}

/** Read system idle seconds on macOS via ioreg. Throws if unavailable. */
export async function readIdleSeconds(): Promise<number> {
  const { stdout } = await execFileAsync("/usr/sbin/ioreg", ["-c", "IOHIDSystem"]);
  const idle = parseHidIdleSeconds(stdout);
  if (idle === null) throw new Error("could not read HIDIdleTime");
  return idle;
}

/** Client: fetch idle seconds from the MacBook idle-reporter. Null on failure. */
export async function fetchIdleSeconds(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<number | null> {
  try {
    const res = await fetchImpl(`${url}/idle`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { idleSeconds?: unknown };
    return typeof body.idleSeconds === "number" ? body.idleSeconds : null;
  } catch {
    return null;
  }
}

import { createServer } from "node:http";
import { readIdleSeconds } from "./idle.js";

// Runs on the MacBook. Serves system idle seconds so the mini's sampler can tell
// "reading" from "away". Idle seconds are non-sensitive; bound to all interfaces
// but only reached over the private tailnet in practice.
const port = Number(process.env.IDLE_PORT ?? 3031);

const server = createServer(async (req, res) => {
  if (req.url?.startsWith("/idle")) {
    try {
      const idleSeconds = await readIdleSeconds();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ idleSeconds }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(err) }));
    }
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(port, "0.0.0.0", () => {
  console.log(`idle-reporter listening on 0.0.0.0:${port}`);
});

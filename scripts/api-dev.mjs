// Minimal local dev server for api/strava-token
// Usage: node scripts/api-dev.mjs
import { createServer } from "http";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local
function loadEnv() {
  try {
    const raw = readFileSync(resolve(__dirname, "../.env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([^#=\s]+)\s*=\s*"?([^"]*)"?/);
      if (m) process.env[m[1]] = m[2];
    }
  } catch {}
}
loadEnv();

const CLIENT_ID = process.env.VITE_STRAVA_CLIENT_ID ?? process.env.STRAVA_CLIENT_ID;
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;

const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.writeHead(204).end();
  if (req.url !== "/api/strava-token" || req.method !== "POST") {
    res.writeHead(404).end("Not found");
    return;
  }

  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    try {
      const { code, refresh_token, grant_type } = JSON.parse(body);

      if (!CLIENT_ID || !CLIENT_SECRET) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Strava credentials not configured in .env.local" }));
      }

      const payload = { client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type };
      if (grant_type === "authorization_code") payload.code = code;
      if (grant_type === "refresh_token") payload.refresh_token = refresh_token;

      const upstream = await fetch("https://www.strava.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await upstream.text();
      res.writeHead(upstream.status, { "Content-Type": "application/json" });
      res.end(data);
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e) }));
    }
  });
});

const PORT = 3001;
server.listen(PORT, "127.0.0.1", () => {
  console.log(`API dev server running at http://localhost:${PORT}`);
  console.log(`Client ID: ${CLIENT_ID ? "✓" : "✗ missing"}`);
  console.log(`Client Secret: ${CLIENT_SECRET ? "✓" : "✗ missing"}`);
});

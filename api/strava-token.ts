import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN ?? "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { code, refresh_token, grant_type } = req.body ?? {};

  if (!grant_type) return res.status(400).json({ error: "Missing grant_type" });
  if (grant_type === "authorization_code" && !code)
    return res.status(400).json({ error: "Missing code" });
  if (grant_type === "refresh_token" && !refresh_token)
    return res.status(400).json({ error: "Missing refresh_token" });

  const clientId = process.env.VITE_STRAVA_CLIENT_ID ?? process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret)
    return res.status(500).json({ error: "Strava credentials not configured" });

  const body: Record<string, string | number> = {
    client_id: Number(clientId),
    client_secret: clientSecret,
    grant_type,
  };
  if (grant_type === "authorization_code") body.code = code;
  if (grant_type === "refresh_token") body.refresh_token = refresh_token;

  const upstream = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await upstream.json();
  return res.status(upstream.status).json(data);
}

const CLIENT_ID = import.meta.env.VITE_STRAVA_CLIENT_ID ?? "";
const REDIRECT_URI = import.meta.env.VITE_STRAVA_REDIRECT_URI ?? `${window.location.origin}/`;

const STORAGE_KEY = "strava_token";

export type StravaToken = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // unix seconds
  athleteName: string;
  athleteAvatar: string;
};

export function getStoredToken(): StravaToken | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StravaToken) : null;
  } catch {
    return null;
  }
}

function storeToken(token: StravaToken) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(token));
}

export function clearToken() {
  localStorage.removeItem(STORAGE_KEY);
}

export function isTokenValid(token: StravaToken): boolean {
  return token.expiresAt > Date.now() / 1000 + 60;
}

export function startOAuth() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    approval_prompt: "auto",
    scope: "read,activity:read,profile:read_all",
  });
  window.location.href = `https://www.strava.com/oauth/authorize?${params}`;
}

type StravaTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: { firstname: string; lastname: string; profile_medium: string };
};

async function callTokenEndpoint(body: Record<string, string>): Promise<StravaTokenResponse> {
  const res = await fetch("/api/strava-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? `Token request failed (${res.status})`);
  }
  return res.json();
}

async function exchangeCode(code: string): Promise<StravaToken> {
  const data = await callTokenEndpoint({ grant_type: "authorization_code", code });
  const token: StravaToken = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
    athleteName: data.athlete
      ? `${data.athlete.firstname} ${data.athlete.lastname}`.trim()
      : "",
    athleteAvatar: data.athlete?.profile_medium ?? "",
  };
  storeToken(token);
  return token;
}

async function refreshToken(token: StravaToken): Promise<StravaToken> {
  const data = await callTokenEndpoint({
    grant_type: "refresh_token",
    refresh_token: token.refreshToken,
  });
  const next: StravaToken = {
    ...token,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
  };
  storeToken(next);
  return next;
}

/** Handle the OAuth callback — call on app mount */
export async function handleOAuthCallback(): Promise<StravaToken | null> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const scope = params.get("scope");
  if (!code || !scope) return null;
  window.history.replaceState({}, "", window.location.pathname);
  return exchangeCode(code);
}

/** Get a valid access token, refreshing if needed */
export async function getValidToken(): Promise<StravaToken | null> {
  let token = getStoredToken();
  if (!token) return null;
  if (!isTokenValid(token)) {
    try {
      token = await refreshToken(token);
    } catch {
      clearToken();
      return null;
    }
  }
  return token;
}

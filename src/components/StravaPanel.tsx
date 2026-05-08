import { useEffect, useState, useCallback } from "react";
import { useStore } from "../store";
import { startOAuth, handleOAuthCallback } from "../strava/auth";
import {
  fetchMyRoutes,
  fetchRouteGpx,
  fetchRecentActivities,
  fetchActivityGpx,
} from "../strava/api";
import type { StravaRoute, StravaSummaryActivity } from "../strava/api";
import { parseGpx } from "../gpx/parse";

type Tab = "routes" | "activities";

function fmtDist(m: number) {
  return (m / 1000).toFixed(1) + " km";
}
function fmtEle(m: number) {
  return Math.round(m) + " m";
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function StravaPanel({ onRouteLoaded, onLoadStart, onLoadError }: {
  onRouteLoaded?: () => void;
  onLoadStart?: () => void;
  onLoadError?: () => void;
} = {}) {
  const stravaToken = useStore((s) => s.stravaToken);
  const setStravaToken = useStore((s) => s.setStravaToken);
  const disconnectStrava = useStore((s) => s.disconnectStrava);
  const loadRoute = useStore((s) => s.loadRoute);
  const setAppMode = useStore((s) => s.setAppMode);

  const [tab, setTab] = useState<Tab>("routes");
  const [routes, setRoutes] = useState<StravaRoute[]>([]);
  const [activities, setActivities] = useState<StravaSummaryActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Handle OAuth callback on mount
  useEffect(() => {
    if (!window.location.search.includes("code=")) return;
    handleOAuthCallback()
      .then((token) => { if (token) setStravaToken(token); })
      .catch(() => setError("Strava login failed"));
  }, [setStravaToken]);

  const loadList = useCallback(async () => {
    if (!stravaToken) return;
    setLoading(true);
    setError(null);
    try {
      if (tab === "routes") {
        const data = await fetchMyRoutes();
        setRoutes(data.filter((r) => r.type === 1)); // cycling only
      } else {
        const data = await fetchRecentActivities();
        setActivities(data.filter((a) => a.type === "Ride" || a.type === "VirtualRide"));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [stravaToken, tab]);

  useEffect(() => {
    if (stravaToken) loadList();
  }, [stravaToken, loadList]);

  const openRoute = async (routeId: string, name: string) => {
    setLoadingId(routeId);
    setError(null);
    onLoadStart?.();
    try {
      const gpx = await fetchRouteGpx(routeId);
      const parsed = parseGpx(gpx);
      loadRoute(parsed, name);
      setAppMode("plan");
      onRouteLoaded?.();
    } catch (e) {
      setError((e as Error).message);
      onLoadError?.();
    } finally {
      setLoadingId(null);
    }
  };

  const openActivity = async (activityId: string, name: string) => {
    setLoadingId(activityId);
    setError(null);
    onLoadStart?.();
    try {
      const gpx = await fetchActivityGpx(activityId);
      const parsed = parseGpx(gpx);
      loadRoute(parsed, name);
      setAppMode("plan");
      onRouteLoaded?.();
    } catch (e) {
      setError((e as Error).message);
      onLoadError?.();
    } finally {
      setLoadingId(null);
    }
  };

  if (!stravaToken) {
    return (
      <div className="strava-connect">
        <button className="strava-connect-btn" onClick={startOAuth}>
          Connect with Strava
        </button>
      </div>
    );
  }

  return (
    <div className="strava-panel">
      <div className="strava-header">
        <div className="strava-athlete">
          {stravaToken.athleteAvatar && (
            <img className="strava-avatar" src={stravaToken.athleteAvatar} alt="" />
          )}
          <span className="strava-athlete-name">{stravaToken.athleteName}</span>
        </div>
        <button className="strava-disconnect" onClick={disconnectStrava}>
          Disconnect
        </button>
      </div>

      <div className="strava-tabs">
        <button
          className={`strava-tab${tab === "routes" ? " active" : ""}`}
          onClick={() => setTab("routes")}
        >
          Routes
        </button>
        <button
          className={`strava-tab${tab === "activities" ? " active" : ""}`}
          onClick={() => setTab("activities")}
        >
          Activities
        </button>
      </div>

      {error && <div className="strava-error">{error}</div>}

      {loading ? (
        <div className="strava-loading">Loading…</div>
      ) : tab === "routes" ? (
        <div className="strava-list">
          {routes.length === 0 && <div className="strava-empty">No cycling routes found</div>}
          {routes.map((r) => (
            <button
              key={r.id}
              className="strava-item"
              onClick={() => openRoute(r.id, r.name)}
              disabled={loadingId === r.id}
            >
              <div className="strava-item-name">{loadingId === r.id ? "Loading…" : r.name}</div>
              <div className="strava-item-meta">
                <span>{fmtDist(r.distance)}</span>
                <span>↑ {fmtEle(r.elevation_gain)}</span>
                <span>{fmtDate(r.created_at)}</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="strava-list">
          {activities.length === 0 && <div className="strava-empty">No recent rides found</div>}
          {activities.map((a) => (
            <button
              key={a.id}
              className="strava-item"
              onClick={() => openActivity(a.id, a.name)}
              disabled={loadingId === a.id}
            >
              <div className="strava-item-name">{loadingId === a.id ? "Loading…" : a.name}</div>
              <div className="strava-item-meta">
                <span>{fmtDist(a.distance)}</span>
                <span>↑ {fmtEle(a.total_elevation_gain)}</span>
                <span>{fmtDate(a.start_date)}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StravaLogo({ size = 20 }: { size?: number }) {
  // Strava official logo mark — two overlapping chevrons
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M32 4L18 32h8l6-12 6 12h8L32 4z" fill="white"/>
      <path d="M44 20l-6 12h-4l-6-12h-4l10 20 10-20h-4z" fill="rgba(255,255,255,0.6)"/>
    </svg>
  );
}

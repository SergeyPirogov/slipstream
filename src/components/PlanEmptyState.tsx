import { useCallback, useState } from "react";
import { parseGpxFile } from "../gpx/parse";
import { parseFitFile } from "../gpx/parseFit";
import { useStore } from "../store";
import { StravaPanel } from "./StravaPanel";
import { startOAuth } from "../strava/auth";

export function PlanEmptyState({
  onRouteLoaded,
  onStravaOpen,
}: {
  onRouteLoaded: () => void;
  onStravaOpen: () => void;
}) {
  const loadRoute = useStore((s) => s.loadRoute);
  const setPlanRouteLoading = useStore((s) => s.setPlanRouteLoading);
  const stravaToken = useStore((s) => s.stravaToken);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setLoading(true);
    setPlanRouteLoading(true);
    try {
      const isFit = /\.fit$/i.test(file.name);
      const parsed = isFit ? await parseFitFile(file) : await parseGpxFile(file);
      loadRoute(parsed, file.name);
      onRouteLoaded();
    } catch (e: any) {
      setError(e?.message ?? "Failed to parse file");
      setPlanRouteLoading(false);
    } finally {
      setLoading(false);
    }
  }, [loadRoute, setPlanRouteLoading, onRouteLoaded]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const dropZone = (
    <label
      htmlFor="plan-empty-file"
      className={`mes-drop mes-drop--fill${dragging ? " dragging" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {loading ? (
        <>
          <svg className="drop-spinner" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 2a10 10 0 0 1 10 10" />
          </svg>
          <span>Parsing…</span>
        </>
      ) : (
        <>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span>Drop route file here</span>
          <span className="mes-drop-hint">GPX or FIT · Garmin, Komoot, Strava, RideWithGPS</span>
        </>
      )}
      <input
        id="plan-empty-file"
        type="file"
        accept=".gpx,.fit,application/gpx+xml,application/xml,text/xml,application/octet-stream"
        style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
    </label>
  );

  return (
    <div className="mode-empty-state">
      <div className={`mes-content${stravaToken ? " mes-content--wide" : ""}`}>
        <div className="mes-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/>
            <path d="M5 17C5 10 10 7 19 7"/>
          </svg>
        </div>
        <h2 className="mes-title">Plan a route</h2>
        <p className="mes-sub">Upload a GPX or FIT file to see wind analysis, elevation, and time estimates.</p>

        {stravaToken ? (
          <div className="mes-two-col">
            {dropZone}
            <div className="mes-col-divider"><span>or</span></div>
            <StravaPanel
              onLoadStart={() => setPlanRouteLoading(true)}
              onRouteLoaded={onRouteLoaded}
              onLoadError={() => setPlanRouteLoading(false)}
            />
          </div>
        ) : (
          <>
            {dropZone}
            {error && <p className="mes-error">{error}</p>}
            <div className="mes-divider"><span>or</span></div>
            <button className="mes-strava-btn" onClick={startOAuth}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
                <line x1="4" y1="22" x2="4" y2="15"/>
              </svg>
              Connect Strava to browse routes
            </button>
          </>
        )}

        {stravaToken && error && <p className="mes-error">{error}</p>}
      </div>
    </div>
  );
}

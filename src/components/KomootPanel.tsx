import { useState, useCallback } from "react";
import { parseKomootUrl, fetchKomootTourGpx } from "../komoot/api";
import { parseGpx } from "../gpx/parse";
import { useStore } from "../store";

export function KomootPanel({
  onLoadStart,
  onRouteLoaded,
  onLoadError,
}: {
  onLoadStart?: () => void;
  onRouteLoaded?: () => void;
  onLoadError?: () => void;
}) {
  const loadRoute = useStore((s) => s.loadRoute);
  const setPlanRouteLoading = useStore((s) => s.setPlanRouteLoading);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLoad = useCallback(async () => {
    const parsed = parseKomootUrl(url);
    if (!parsed) {
      setError("Paste a full Komoot share link, e.g. komoot.com/tour/123…?share_token=…");
      return;
    }
    setError(null);
    setLoading(true);
    onLoadStart?.();
    setPlanRouteLoading(true);
    try {
      const { gpx, tour } = await fetchKomootTourGpx(parsed.tourId, parsed.shareToken);
      const gpxParsed = parseGpx(gpx);
      loadRoute(gpxParsed, tour.name);
      onRouteLoaded?.();
    } catch (e: any) {
      setError(e?.message ?? "Failed to load Komoot tour");
      setPlanRouteLoading(false);
      onLoadError?.();
    } finally {
      setLoading(false);
    }
  }, [url, loadRoute, setPlanRouteLoading, onLoadStart, onRouteLoaded, onLoadError]);

  return (
    <div className="komoot-panel">
      <div className="komoot-panel-header">
        <KomootLogo />
        <span className="komoot-panel-title">Import from Komoot</span>
      </div>
      <p className="komoot-panel-hint">
        Open a tour on Komoot, copy the share link, and paste it here.
      </p>
      <div className="komoot-panel-row">
        <input
          className="komoot-url-input"
          type="url"
          placeholder="https://www.komoot.com/tour/…?share_token=…"
          value={url}
          onChange={(e) => { setUrl(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === "Enter" && !loading) handleLoad(); }}
          disabled={loading}
          spellCheck={false}
        />
        <button
          className="komoot-load-btn"
          onClick={handleLoad}
          disabled={loading || !url.trim()}
        >
          {loading ? (
            <svg className="drop-spinner" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 2a10 10 0 0 1 10 10" />
            </svg>
          ) : "Load"}
        </button>
      </div>
      {error && <p className="komoot-error">{error}</p>}
    </div>
  );
}

function KomootLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="11" fill="#6AA800"/>
      <path d="M7 17L12 7l5 10" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="12" cy="13" r="2" fill="white"/>
    </svg>
  );
}

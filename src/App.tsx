import { LandingPage } from "./components/LandingPage";
import { PlanEmptyState } from "./components/PlanEmptyState";
import { CompareEmptyState } from "./components/CompareEmptyState";
import { MapFlyover } from "./components/MapFlyover";
import { PlaybackControls } from "./components/PlaybackControls";
import { AlignmentModal } from "./components/AlignmentModal";
import { SummaryCards } from "./components/Analytics/SummaryCards";
import { SpeedChart } from "./components/Analytics/SpeedChart";
import { PowerChart } from "./components/Analytics/PowerChart";
import { ElevationChart } from "./components/Analytics/ElevationChart";
import { HeartRateChart } from "./components/Analytics/HeartRateChart";
import { SplitsTable } from "./components/Analytics/SplitsTable";
import { RiderNameEditor } from "./components/RiderNameEditor";
import { RoutePlannerMap } from "./components/RoutePlannerView";
import { RoutePlannerStats } from "./components/RoutePlannerStats";
import { RouteElevationChart } from "./components/RouteElevationChart";
import { StravaPanel } from "./components/StravaPanel";
import { KomootPanel } from "./components/KomootPanel";
import { useStore } from "./store";
import { useState, useRef, useEffect, useCallback } from "react";
import { parseGpxFile } from "./gpx/parse";
import { parseFitFile } from "./gpx/parseFit";
import { startOAuth, handleOAuthCallback } from "./strava/auth";

export default function App() {
  const appMode = useStore((s) => s.appMode);
  const setAppMode = useStore((s) => s.setAppMode);
  const modeSelected = useStore((s) => s.modeSelected);
  const selectMode = useStore((s) => s.selectMode);
  const goToLanding = useStore((s) => s.goToLanding);
  const trackA = useStore((s) => s.trackA);
  const trackB = useStore((s) => s.trackB);
  const planRoute = useStore((s) => s.plan.route);
  const clearTrack = useStore((s) => s.clearTrack);
  const clearRoute = useStore((s) => s.clearRoute);
  const loadRoute = useStore((s) => s.loadRoute);
  const loadTrack = useStore((s) => s.loadTrack);
  const setPlanRouteLoading = useStore((s) => s.setPlanRouteLoading);
  const anyLoaded = !!trackA;
  const bothLoaded = !!trackA && !!trackB;
  const planLoaded = !!planRoute;
  const reopenAlignment = useStore((s) => s.reopenAlignment);
  const [changeRouteOpen, setChangeRouteOpen] = useState(false);
  const [changeRidesOpen, setChangeRidesOpen] = useState(false);
  const routeLoading = useStore((s) => s.plan.routeLoading);
  const [stravaModalOpen, setStravaModalOpen] = useState(false);
  const [komootModalOpen, setKomootModalOpen] = useState(false);
  const changeRouteRef = useRef<HTMLDivElement>(null);
  const changeRidesRef = useRef<HTMLDivElement>(null);

  const stravaTokenRaw = useStore((s) => s.stravaToken);
  const stravaToken = __GITHUB_PAGES__ ? null : stravaTokenRaw;
  const setStravaToken = useStore((s) => s.setStravaToken);

  // Handle Strava OAuth redirect — must be at App level so it fires regardless of which view is mounted
  useEffect(() => {
    if (__GITHUB_PAGES__ || !window.location.search.includes("code=")) return;
    handleOAuthCallback()
      .then((token) => {
        if (token) {
          setStravaToken(token);
          selectMode("plan");
        }
      })
      .catch(() => {});
  }, []);

  const handleRouteFile = useCallback(async (file: File) => {
    setChangeRouteOpen(false);
    setPlanRouteLoading(true);
    try {
      const isFit = /\.fit$/i.test(file.name);
      const parsed = isFit ? await parseFitFile(file) : await parseGpxFile(file);
      loadRoute(parsed, file.name);
    } catch {
      setPlanRouteLoading(false);
    }
  }, [loadRoute, setPlanRouteLoading]);

  useEffect(() => {
    if (!changeRouteOpen) return;
    const handler = (e: MouseEvent) => {
      if (changeRouteRef.current && !changeRouteRef.current.contains(e.target as Node)) {
        setChangeRouteOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [changeRouteOpen]);

  useEffect(() => {
    if (!changeRidesOpen) return;
    const handler = (e: MouseEvent) => {
      if (changeRidesRef.current && !changeRidesRef.current.contains(e.target as Node)) {
        setChangeRidesOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [changeRidesOpen]);

  const handleRiderFile = useCallback(async (slot: "A" | "B", file: File) => {
    setChangeRidesOpen(false);
    try {
      const isFit = /\.fit$/i.test(file.name);
      const parsed = isFit ? await parseFitFile(file) : await parseGpxFile(file);
      loadTrack(slot, parsed, file.name);
    } catch {}
  }, [loadTrack]);

  const resetComparison = () => {
    clearTrack("A");
    clearTrack("B");
  };

  const resetPlan = () => {
    clearRoute();
  };

  if (!modeSelected) {
    return <LandingPage onSelectMode={selectMode} />;
  }

  return (
    <div className="app">
      <header className="header">
        <h1
          className="app-logo"
          onClick={goToLanding}
          title="Back to home"
        >Slipstream</h1>

        <div className="mode-switcher">
          <button
            className={`mode-pill${appMode === "plan" ? " active" : ""}`}
            onClick={() => setAppMode("plan")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/>
              <path d="M5 17C5 10 10 7 19 7"/>
            </svg>
            Plan
          </button>
          <button
            className={`mode-pill${appMode === "compare" ? " active" : ""}`}
            onClick={() => setAppMode("compare")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            Analyze
          </button>
        </div>

        <div className="header-right">
          {anyLoaded && appMode === "compare" && (
            <div className="header-route-pill" ref={changeRidesRef}>
              {bothLoaded ? (
                <div className="compare-pill-riders">
                  <span className="dot dot-a" />
                  <RiderNameEditor slot="A" readonly />
                  <span className="compare-pill-vs">vs</span>
                  <span className="dot dot-b" />
                  <RiderNameEditor slot="B" readonly />
                </div>
              ) : (
                <div className="compare-pill-riders">
                  <span className="dot dot-a" />
                  <RiderNameEditor slot="A" readonly />
                </div>
              )}
              <button
                className={`header-route-change${changeRidesOpen ? " active" : ""}`}
                onClick={() => setChangeRidesOpen((v) => !v)}
              >
                {!bothLoaded ? "+ Add rider" : "↺ Change"}
              </button>
              {bothLoaded && (
                <button
                  className="header-icon-btn"
                  onClick={reopenAlignment}
                  title="Time alignment settings"
                  aria-label="Settings"
                  style={{ marginLeft: 2 }}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </button>
              )}
              {changeRidesOpen && (
                <div className="change-route-popover">
                  <div className="crp-title">{bothLoaded ? "Change rides" : "Manage ride"}</div>
                  <label className="crp-option" htmlFor="crp-rider-a">
                    <span className="dot dot-a" />
                    Replace {trackA!.rider || "Rider A"}
                    <input id="crp-rider-a" type="file" accept=".gpx,.fit" style={{ display: "none" }}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleRiderFile("A", f); }} />
                  </label>
                  {bothLoaded ? (
                    <label className="crp-option" htmlFor="crp-rider-b">
                      <span className="dot dot-b" />
                      Replace {trackB!.rider || "Rider B"}
                      <input id="crp-rider-b" type="file" accept=".gpx,.fit" style={{ display: "none" }}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleRiderFile("B", f); }} />
                    </label>
                  ) : (
                    <label className="crp-option" htmlFor="crp-rider-b-add">
                      <span className="dot dot-b" />
                      Add second rider to compare
                      <input id="crp-rider-b-add" type="file" accept=".gpx,.fit" style={{ display: "none" }}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleRiderFile("B", f); }} />
                    </label>
                  )}
                  <div className="crp-divider" />
                  <button className="crp-option crp-danger" onClick={() => { setChangeRidesOpen(false); resetComparison(); }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                    </svg>
                    Clear {bothLoaded ? "both rides" : "ride"}
                  </button>
                </div>
              )}
            </div>
          )}

          {(planLoaded || routeLoading) && appMode === "plan" && (
            <div className="header-route-pill" ref={changeRouteRef}>
              {routeLoading ? (
                <svg className="crp-spinner" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M12 2a10 10 0 0 1 10 10" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/>
                  <path d="M5 17C5 10 10 7 19 7"/>
                </svg>
              )}
              <span className="header-route-name">
                {routeLoading ? "Loading…" : (planRoute!.name || "Route")}
              </span>
              {!routeLoading && (
                <>
                  <span className="header-route-sep">·</span>
                  <span className="header-route-stat">
                    {(planRoute!.totals.distanceM / 1000).toFixed(1)} km
                  </span>
                </>
              )}
              <button
                className={`header-route-change${changeRouteOpen ? " active" : ""}`}
                onClick={() => setChangeRouteOpen((v) => !v)}
                disabled={routeLoading}
              >
                ↺ Change route
              </button>
              {changeRouteOpen && (
                <div className="change-route-popover">
                  <div className="crp-title">Load a different route</div>
                  <label className="crp-option" htmlFor="crp-file-input">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    Upload GPX / FIT file
                    <input
                      id="crp-file-input"
                      type="file"
                      accept=".gpx,.fit"
                      style={{ display: "none" }}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleRouteFile(f); }}
                    />
                  </label>
                  <button className="crp-option" onClick={() => { setChangeRouteOpen(false); setKomootModalOpen(true); }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="12" cy="12" r="11" fill="#6AA800"/>
                      <path d="M7 17L12 7l5 10" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <circle cx="12" cy="13" r="2" fill="white"/>
                    </svg>
                    Paste Komoot link
                  </button>
                  {!__GITHUB_PAGES__ && (stravaToken ? (
                    <button className="crp-option" onClick={() => { setChangeRouteOpen(false); setStravaModalOpen(true); }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="#FC4C02" xmlns="http://www.w3.org/2000/svg">
                        <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066l-2.084 4.116zM9.2 6.708l2.09 4.116h3.065L9.2 0 4.051 10.172h3.066l2.083-4.116z" />
                      </svg>
                      Browse Strava routes
                    </button>
                  ) : (
                    <button className="crp-option" onClick={() => { setChangeRouteOpen(false); startOAuth(); }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="#FC4C02" xmlns="http://www.w3.org/2000/svg">
                        <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066l-2.084 4.116zM9.2 6.708l2.09 4.116h3.065L9.2 0 4.051 10.172h3.066l2.083-4.116z" />
                      </svg>
                      Connect Strava
                    </button>
                  ))}
                  <div className="crp-divider"/>
                  <button className="crp-option crp-danger" onClick={() => { setChangeRouteOpen(false); resetPlan(); }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                    </svg>
                    Clear route
                  </button>
                </div>
              )}
            </div>
          )}

          <a
            className="patreon-btn"
            href="https://patreon.com/automation_remarks"
            target="_blank"
            rel="noreferrer noopener"
            title="Support this project on Patreon"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
              <circle cx="15" cy="9.5" r="6.5" />
              <rect x="2" y="3" width="3.5" height="18" />
            </svg>
            <span>Support</span>
          </a>
        </div>
      </header>

      {appMode === "plan" ? (
        planLoaded || routeLoading ? (
          <div className="main">
            <div className="map-pane plan-map-pane">
              <RoutePlannerMap />
              <div className="elevation-strip">
                <RouteElevationChart />
              </div>
            </div>
            <aside className="side">
              <RoutePlannerStats />
            </aside>
          </div>
        ) : (
          <PlanEmptyState
            onRouteLoaded={() => {}}
            onStravaOpen={() => setStravaModalOpen(true)}
          />
        )
      ) : (
        anyLoaded ? (
          <>
            <div className="main">
              <div className="map-pane">
                <MapFlyover />
                <div className="elevation-strip">
                  <ElevationChart />
                </div>
                <PlaybackControls />
                <div className="charts-strip">
                  <SpeedChart />
                  <PowerChart />
                  <HeartRateChart />
                </div>
              </div>
              <aside className="side">
                <SummaryCards />
                <SplitsTable />
              </aside>
            </div>
            {bothLoaded && <AlignmentModal />}
          </>
        ) : (
          <CompareEmptyState />
        )
      )}

      {komootModalOpen && (
        <div className="strava-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setKomootModalOpen(false); }}>
          <div className="strava-modal">
            <button className="strava-modal-close" onClick={() => setKomootModalOpen(false)} aria-label="Close">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
            <KomootPanel
              onLoadStart={() => setPlanRouteLoading(true)}
              onRouteLoaded={() => setKomootModalOpen(false)}
              onLoadError={() => setPlanRouteLoading(false)}
            />
          </div>
        </div>
      )}

      {!__GITHUB_PAGES__ && stravaModalOpen && (
        <div className="strava-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setStravaModalOpen(false); }}>
          <div className="strava-modal">
            <button className="strava-modal-close" onClick={() => setStravaModalOpen(false)} aria-label="Close">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
            <StravaPanel
              onLoadStart={() => setPlanRouteLoading(true)}
              onRouteLoaded={() => setStravaModalOpen(false)}
              onLoadError={() => setPlanRouteLoading(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

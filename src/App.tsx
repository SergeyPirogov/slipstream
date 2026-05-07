import { FileLoader } from "./components/FileLoader";
import { MapFlyover } from "./components/MapFlyover";
import { Map3D } from "./components/Map3D";
import { PlaybackControls } from "./components/PlaybackControls";
import { OffsetControl } from "./components/OffsetControl";
import { AlignmentModal } from "./components/AlignmentModal";
import { SummaryCards } from "./components/Analytics/SummaryCards";
import { LiveStatsPanel } from "./components/Analytics/LiveStatsPanel";
import { SpeedChart } from "./components/Analytics/SpeedChart";
import { PowerChart } from "./components/Analytics/PowerChart";
import { ElevationChart } from "./components/Analytics/ElevationChart";
import { HeartRateChart } from "./components/Analytics/HeartRateChart";
import { SplitsTable } from "./components/Analytics/SplitsTable";
import { RiderNameEditor } from "./components/RiderNameEditor";
import { useStore } from "./store";
import { useState } from "react";

export default function App() {
  const trackA = useStore((s) => s.trackA);
  const trackB = useStore((s) => s.trackB);
  const clearTrack = useStore((s) => s.clearTrack);
  const bothLoaded = !!trackA && !!trackB;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mapMode, setMapMode] = useState<"2d" | "3d">("2d");

  const resetComparison = () => {
    clearTrack("A");
    clearTrack("B");
    setSettingsOpen(false);
  };

  return (
    <div className="app">
      <header className="header">
        <h1>Slipstream</h1>
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
        {bothLoaded && (
          <>
            <div className="legend" style={{ marginLeft: "auto" }}>
              <span><span className="dot a" /><RiderNameEditor slot="A" /></span>
              <span><span className="dot b" /><RiderNameEditor slot="B" /></span>
            </div>
            <button
              className="header-icon-btn"
              onClick={resetComparison}
              title="New comparison (clear both files)"
              aria-label="New comparison"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-3-6.7" />
                <path d="M21 4v5h-5" />
              </svg>
            </button>
            <button
              className="header-icon-btn"
              onClick={() => setSettingsOpen((v) => !v)}
              title="Time alignment settings"
              aria-label="Settings"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </>
        )}
      </header>

      {!bothLoaded ? (
        <FileLoader />
      ) : (
        <>
          <div className="main">
            <div className="map-pane">
              <div style={{ position: "relative", minHeight: 0 }}>
                {mapMode === "2d" ? <MapFlyover /> : <Map3D />}
                <button
                  className={`map-mode-toggle${mapMode === "3d" ? " active" : ""}`}
                  onClick={() => setMapMode((m) => m === "2d" ? "3d" : "2d")}
                  title={mapMode === "2d" ? "Switch to 3D map" : "Switch to 2D map"}
                  aria-label="Toggle 3D map"
                >
                  {mapMode === "2d" ? "3D" : "2D"}
                </button>
              </div>
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
              <LiveStatsPanel />
              {settingsOpen && <OffsetControl />}
              <SplitsTable />
            </aside>
          </div>
          <AlignmentModal />
        </>
      )}
    </div>
  );
}

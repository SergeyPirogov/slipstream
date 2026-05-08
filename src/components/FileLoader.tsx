import { useCallback, useState } from "react";
import { parseGpxFile } from "../gpx/parse";
import { parseFitFile } from "../gpx/parseFit";
import { useStore, type Slot } from "../store";
import { RiderNameEditor } from "./RiderNameEditor";

function DropZone({ slot, color }: { slot: Slot; color: "a" | "b" }) {
  const track = useStore((s) => (slot === "A" ? s.trackA : s.trackB));
  const loadTrack = useStore((s) => s.loadTrack);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      try {
        const isFit = /\.fit$/i.test(file.name);
        const parsed = isFit ? await parseFitFile(file) : await parseGpxFile(file);
        loadTrack(slot, parsed, file.name);
      } catch (e: any) {
        setError(e?.message ?? "Failed to parse file");
      }
    },
    [loadTrack, slot],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const onPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const id = `file-${slot}`;
  return (
    <label
      htmlFor={id}
      className={`drop drop-${color} ${track ? "has-file" : ""} ${dragging ? "dragging" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <div className="drop-head">
        <span className="dot" />
        <span className="drop-title">Rider {slot}</span>
      </div>
      {track ? (
        <>
          <p className="drop-name" onClick={(e) => e.preventDefault()}>
            <RiderNameEditor slot={slot} />
          </p>
          <p className="drop-stat">
            {(track.totals.distanceM / 1000).toFixed(1)} km · {formatDuration(track.totals.durationSec)}
          </p>
          <p className="drop-hint">Click name to rename · drop another file to replace</p>
        </>
      ) : (
        <>
          <p className="drop-cta">Drop .gpx or .fit here</p>
          <p className="drop-hint">or click to browse</p>
        </>
      )}
      {error && <p className="drop-error">{error}</p>}
      <input
        id={id}
        type="file"
        accept=".gpx,.fit,application/gpx+xml,application/xml,text/xml,application/octet-stream"
        style={{ display: "none" }}
        onChange={onPick}
      />
    </label>
  );
}

function PlanDropZone() {
  const route = useStore((s) => s.plan.route);
  const loadRoute = useStore((s) => s.loadRoute);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      try {
        const isFit = /\.fit$/i.test(file.name);
        const parsed = isFit ? await parseFitFile(file) : await parseGpxFile(file);
        loadRoute(parsed, file.name);
      } catch (e: any) {
        setError(e?.message ?? "Failed to parse file");
      }
    },
    [loadRoute],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const onPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  return (
    <label
      htmlFor="file-route"
      className={`drop drop-plan ${route ? "has-file" : ""} ${dragging ? "dragging" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <div className="drop-head">
        <span className="dot dot-plan" />
        <span className="drop-title">Route file</span>
      </div>
      {route ? (
        <>
          <p className="drop-name">{route.name || "Route"}</p>
          <p className="drop-stat">
            {(route.totals.distanceM / 1000).toFixed(1)} km ·{" "}
            {Math.round(route.totals.ascentM)} m elevation
          </p>
          <p className="drop-hint">Drop another file to replace</p>
        </>
      ) : (
        <>
          <p className="drop-cta">Drop route .gpx or .fit here</p>
          <p className="drop-hint">or click to browse · Garmin course, Komoot, RideWithGPS…</p>
        </>
      )}
      {error && <p className="drop-error">{error}</p>}
      <input
        id="file-route"
        type="file"
        accept=".gpx,.fit,application/gpx+xml,application/xml,text/xml,application/octet-stream"
        style={{ display: "none" }}
        onChange={onPick}
      />
    </label>
  );
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function HeroIllustration() {
  return (
    <svg
      className="hero-illo"
      viewBox="0 0 480 320"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1f232c" />
          <stop offset="100%" stopColor="#0f1115" />
        </linearGradient>
        <linearGradient id="routeA" x1="0" x2="1">
          <stop offset="0%" stopColor="#f97316" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#f97316" />
        </linearGradient>
        <linearGradient id="routeB" x1="0" x2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect width="480" height="320" fill="url(#bgGrad)" rx="14" />

      {/* Topo contour lines */}
      <g stroke="#2a2f3a" fill="none" strokeWidth="1">
        <path d="M0 80 Q 120 60, 240 90 T 480 80" />
        <path d="M0 130 Q 120 110, 240 140 T 480 130" />
        <path d="M0 180 Q 120 160, 240 190 T 480 180" />
        <path d="M0 230 Q 120 210, 240 240 T 480 230" />
        <path d="M0 280 Q 120 260, 240 290 T 480 280" />
      </g>
      <g stroke="#2a2f3a" fill="none" strokeWidth="1" opacity="0.5">
        <path d="M80 0 Q 60 120, 90 240 T 80 320" />
        <path d="M200 0 Q 180 120, 210 240 T 200 320" />
        <path d="M320 0 Q 300 120, 330 240 T 320 320" />
        <path d="M440 0 Q 420 120, 450 240 T 440 320" />
      </g>

      <path
        d="M40 250 Q 100 180, 160 190 T 280 140 Q 340 110, 380 70 L 440 60"
        stroke="url(#routeA)"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        filter="url(#glow)"
      />
      <path
        d="M40 260 Q 110 220, 170 210 T 290 160 Q 350 130, 400 100 L 440 90"
        stroke="url(#routeB)"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        filter="url(#glow)"
      />

      <g>
        <circle cx="280" cy="140" r="10" fill="#f97316" stroke="#fff" strokeWidth="2.5" />
      </g>
      <g>
        <circle cx="240" cy="185" r="10" fill="#3b82f6" stroke="#fff" strokeWidth="2.5" />
      </g>

      <line
        x1="280" y1="140" x2="240" y2="185"
        stroke="#fff" strokeWidth="1.5" strokeDasharray="3 4" opacity="0.5"
      />

      <g transform="translate(300, 200)">
        <rect width="130" height="44" rx="8" fill="#171a21" stroke="#2a2f3a" />
        <text x="12" y="18" fill="#8e94a0" fontSize="9" fontFamily="system-ui" fontWeight="500">
          Δ DISTANCE · Δ TIME
        </text>
        <text x="12" y="35" fill="#e6e8eb" fontSize="13" fontFamily="system-ui" fontWeight="600">
          +0.42 km · +1:23
        </text>
      </g>
    </svg>
  );
}

function PlanIllustration() {
  return (
    <svg
      className="hero-illo"
      viewBox="0 0 480 320"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="bgGrad2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1f232c" />
          <stop offset="100%" stopColor="#0f1115" />
        </linearGradient>
        <filter id="glow2">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <rect width="480" height="320" fill="url(#bgGrad2)" rx="14" />
      {/* Topo */}
      <g stroke="#2a2f3a" fill="none" strokeWidth="1">
        <path d="M0 80 Q 120 60, 240 90 T 480 80" />
        <path d="M0 150 Q 120 130, 240 160 T 480 150" />
        <path d="M0 220 Q 120 200, 240 230 T 480 220" />
        <path d="M0 290 Q 120 270, 240 300 T 480 290" />
      </g>
      {/* Route coloured by wind */}
      <path d="M40 260 Q 80 230, 120 200" stroke="#ef4444" strokeWidth="5" fill="none" strokeLinecap="round" filter="url(#glow2)" />
      <path d="M120 200 Q 160 170, 200 180" stroke="#9ca3af" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M200 180 Q 240 190, 280 160" stroke="#9ca3af" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M280 160 Q 340 120, 420 80" stroke="#22c55e" strokeWidth="5" fill="none" strokeLinecap="round" filter="url(#glow2)" />
      {/* Wind arrows */}
      <g opacity="0.7">
        <line x1="80" y1="120" x2="80" y2="150" stroke="#facc15" strokeWidth="2" strokeLinecap="round" />
        <polygon points="80,110 74,125 86,125" fill="#facc15" />
        <line x1="200" y1="100" x2="200" y2="130" stroke="#facc15" strokeWidth="2" strokeLinecap="round" />
        <polygon points="200,90 194,105 206,105" fill="#facc15" />
        <line x1="340" y1="100" x2="340" y2="130" stroke="#facc15" strokeWidth="2" strokeLinecap="round" />
        <polygon points="340,90 334,105 346,105" fill="#facc15" />
      </g>
      {/* Start / end */}
      <circle cx="40" cy="260" r="7" fill="#22c55e" stroke="#fff" strokeWidth="2" />
      <circle cx="420" cy="80" r="7" fill="#ef4444" stroke="#fff" strokeWidth="2" />
      {/* Wind card */}
      <g transform="translate(30, 40)">
        <rect width="150" height="50" rx="8" fill="#171a21" stroke="#2a2f3a" />
        <text x="12" y="18" fill="#8e94a0" fontSize="9" fontFamily="system-ui" fontWeight="500">WIND ANALYSIS</text>
        <text x="12" y="36" fill="#e6e8eb" fontSize="12" fontFamily="system-ui" fontWeight="600">42 km headwind</text>
      </g>
    </svg>
  );
}

function FeatureIcon({ name }: { name: "map" | "chart" | "clock" | "bolt" | "split" | "upload" | "wind" }) {
  const paths: Record<string, JSX.Element> = {
    map: (
      <>
        <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6z" />
        <path d="M9 4v16M15 6v16" strokeWidth="1.3" />
      </>
    ),
    chart: (
      <>
        <path d="M3 3v18h18" />
        <path d="M7 16l4-4 3 3 6-7" strokeWidth="2" strokeLinecap="round" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" strokeWidth="2" strokeLinecap="round" />
      </>
    ),
    bolt: (
      <>
        <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" strokeLinejoin="round" />
      </>
    ),
    split: (
      <>
        <path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" strokeWidth="2" />
      </>
    ),
    upload: (
      <>
        <path d="M12 3v12m0-12l-4 4m4-4l4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    wind: (
      <>
        <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2" strokeLinecap="round" />
        <path d="M9.6 4.6A2 2 0 1 1 11 8H2" strokeLinecap="round" />
        <path d="M12.6 19.4A2 2 0 1 0 14 16H2" strokeLinecap="round" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      {paths[name]}
    </svg>
  );
}

const COMPARE_FEATURES: {
  icon: "map" | "chart" | "clock" | "bolt" | "split" | "upload";
  title: string;
  copy: string;
}[] = [
  {
    icon: "map",
    title: "Synced map replay",
    copy: "Watch both riders race the same route on a live map. See who's ahead, when gaps open, where one pulled away.",
  },
  {
    icon: "bolt",
    title: "Power, HR & cadence",
    copy: "Load .fit files for power data. Compare normalized power, heart rate zones, cadence consistency side-by-side.",
  },
  {
    icon: "chart",
    title: "Speed & elevation",
    copy: "Overlayed charts for speed, elevation, climbs, and grade-adjusted effort — scrubbable, synced to the replay.",
  },
  {
    icon: "split",
    title: "10 km splits",
    copy: "Segment-by-segment breakdown. Per-rider times, cumulative Δ on the shared clock, who gained where.",
  },
  {
    icon: "clock",
    title: "Time alignment",
    copy: "Auto-detect timezone mismatches and head-start gaps. One click to trim or compensate — no manual editing.",
  },
  {
    icon: "upload",
    title: "GPX & FIT, local only",
    copy: "Drop Strava / Garmin / Wahoo exports directly. Everything parses in your browser — nothing uploaded anywhere.",
  },
];

const PLAN_FEATURES: {
  icon: "map" | "chart" | "wind" | "clock" | "split" | "upload";
  title: string;
  copy: string;
}[] = [
  {
    icon: "wind",
    title: "Headwind & tailwind map",
    copy: "Route segments coloured by wind impact. See exactly where you'll fight the wind and where it'll push you.",
  },
  {
    icon: "map",
    title: "Live weather forecast",
    copy: "Set your departure time and date — we'll pull the wind forecast and apply it per segment along the route.",
  },
  {
    icon: "clock",
    title: "Estimated duration",
    copy: "Set your target average speed and get a realistic ETA accounting for elevation and wind resistance.",
  },
  {
    icon: "chart",
    title: "Elevation profile",
    copy: "Climb detection, total ascent/descent, and per-segment grade — know what's coming before you leave.",
  },
  {
    icon: "split",
    title: "Wind splits by segment",
    copy: "5 km breakdown of wind direction, bearing, and headwind/tailwind component for each part of the ride.",
  },
  {
    icon: "upload",
    title: "Any route file",
    copy: "GPX from Komoot, Strava, RideWithGPS, Garmin Connect, or any other platform. FIT courses work too.",
  },
];

export function FileLoader() {
  const appMode = useStore((s) => s.appMode);
  const setAppMode = useStore((s) => s.setAppMode);

  return (
    <div className="landing">
      {/* Mode switcher */}
      <div className="mode-switcher">
        <button
          className={`mode-btn ${appMode === "compare" ? "active" : ""}`}
          onClick={() => setAppMode("compare")}
        >
          Compare rides
        </button>
        <button
          className={`mode-btn ${appMode === "plan" ? "active" : ""}`}
          onClick={() => setAppMode("plan")}
        >
          Plan a route
        </button>
      </div>

      {appMode === "compare" ? (
        <section className="hero">
          <div className="hero-copy">
            <div className="hero-kicker">For cyclists · runners · endurance athletes</div>
            <h1 className="hero-title">
              Compare two rides.<br />
              <span className="grad-a">See</span>{" "}
              <span className="grad-b">who</span>{" "}
              <span className="grad-a">led</span>.
            </h1>
            <p className="hero-sub">
              Drop two GPX or FIT files and we'll sync them on a live map, plot your speed, power,
              heart rate, and elevation side-by-side, and show you exactly where seconds went. No
              account. No upload. Everything runs in your browser.
            </p>
            <div className="hero-drops">
              <DropZone slot="A" color="a" />
              <DropZone slot="B" color="b" />
            </div>
            <div className="hero-note">
              Both files needed to start. Different start times or timezones? We'll walk you through aligning them.
            </div>
          </div>
          <div className="hero-art">
            <HeroIllustration />
          </div>
        </section>
      ) : (
        <section className="hero">
          <div className="hero-copy">
            <div className="hero-kicker">Wind analysis · elevation · time estimates</div>
            <h1 className="hero-title">
              Plan your ride.<br />
              <span className="grad-plan">Know</span>{" "}
              the wind.
            </h1>
            <p className="hero-sub">
              Drop a route file and set your departure time. We'll fetch the forecast and colour-code
              every segment of your route: green tailwind, red headwind. See your estimated duration
              and where the hard parts are before you start.
            </p>
            <div className="hero-drops hero-drops--single">
              <PlanDropZone />
            </div>
            <div className="hero-note">
              Works with GPX routes from Komoot, Strava, RideWithGPS, Garmin Connect, and FIT course files.
            </div>
          </div>
          <div className="hero-art">
            <PlanIllustration />
          </div>
        </section>
      )}

      <section className="features">
        <h2 className="features-title">
          {appMode === "compare"
            ? "Everything you need to compare two efforts"
            : "Everything you need to plan a great ride"}
        </h2>
        <div className="features-grid">
          {(appMode === "compare" ? COMPARE_FEATURES : PLAN_FEATURES).map((f) => (
            <div className="feature" key={f.title}>
              <div className="feature-icon"><FeatureIcon name={f.icon as any} /></div>
              <h3>{f.title}</h3>
              <p>{f.copy}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="landing-footer">
        <span>
          Built for endurance athletes. Accepts Strava GPX exports and raw FIT files from Garmin, Wahoo, and compatible head units.
        </span>
      </footer>
    </div>
  );
}

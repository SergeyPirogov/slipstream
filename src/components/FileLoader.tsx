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

      {/* Route A — orange */}
      <path
        d="M40 250 Q 100 180, 160 190 T 280 140 Q 340 110, 380 70 L 440 60"
        stroke="url(#routeA)"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        filter="url(#glow)"
      />
      {/* Route B — blue, slightly offset */}
      <path
        d="M40 260 Q 110 220, 170 210 T 290 160 Q 350 130, 400 100 L 440 90"
        stroke="url(#routeB)"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        filter="url(#glow)"
      />

      {/* Rider A marker */}
      <g>
        <circle cx="280" cy="140" r="10" fill="#f97316" stroke="#fff" strokeWidth="2.5" />
      </g>
      {/* Rider B marker */}
      <g>
        <circle cx="240" cy="185" r="10" fill="#3b82f6" stroke="#fff" strokeWidth="2.5" />
      </g>

      {/* Gap line */}
      <line
        x1="280"
        y1="140"
        x2="240"
        y2="185"
        stroke="#fff"
        strokeWidth="1.5"
        strokeDasharray="3 4"
        opacity="0.5"
      />

      {/* Stats pill */}
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

function FeatureIcon({ name }: { name: "map" | "chart" | "clock" | "bolt" | "split" | "upload" }) {
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
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      {paths[name]}
    </svg>
  );
}

const FEATURES: { icon: "map" | "chart" | "clock" | "bolt" | "split" | "upload"; title: string; copy: string }[] = [
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

export function FileLoader() {
  return (
    <div className="landing">
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

      <section className="features">
        <h2 className="features-title">Everything you need to compare two efforts</h2>
        <div className="features-grid">
          {FEATURES.map((f) => (
            <div className="feature" key={f.title}>
              <div className="feature-icon"><FeatureIcon name={f.icon} /></div>
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

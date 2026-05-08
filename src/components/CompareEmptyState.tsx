import { useCallback, useState } from "react";
import { parseGpxFile } from "../gpx/parse";
import { parseFitFile } from "../gpx/parseFit";
import { useStore, type Slot } from "../store";
import { RiderNameEditor } from "./RiderNameEditor";

function RiderDrop({ slot }: { slot: Slot }) {
  const track = useStore((s) => (slot === "A" ? s.trackA : s.trackB));
  const loadTrack = useStore((s) => s.loadTrack);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setLoading(true);
    try {
      const isFit = /\.fit$/i.test(file.name);
      const parsed = isFit ? await parseFitFile(file) : await parseGpxFile(file);
      loadTrack(slot, parsed, file.name);
    } catch (e: any) {
      setError(e?.message ?? "Failed to parse file");
    } finally {
      setLoading(false);
    }
  }, [loadTrack, slot]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const id = `compare-empty-${slot.toLowerCase()}`;
  const accentColor = slot === "A" ? "var(--a)" : "var(--b)";

  return (
    <label
      htmlFor={id}
      className={`mes-drop mes-drop--fill mes-drop--rider${dragging ? " dragging" : ""}${track ? " has-file" : ""}`}
      style={{ "--rider-accent": accentColor } as React.CSSProperties}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {loading ? (
        <>
          <svg className="drop-spinner" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke={accentColor} strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 2a10 10 0 0 1 10 10" />
          </svg>
          <span>Parsing…</span>
        </>
      ) : track ? (
        <>
          <span className="mes-rider-dot" style={{ background: accentColor }} />
          <p className="mes-drop-name" onClick={(e) => e.preventDefault()}>
            <RiderNameEditor slot={slot} />
          </p>
          <p className="mes-drop-stat">
            {(track.totals.distanceM / 1000).toFixed(1)} km · {formatDuration(track.totals.durationSec)}
          </p>
          <span className="mes-drop-hint">Click name to rename · drop to replace</span>
        </>
      ) : (
        <>
          <span className="mes-rider-dot" style={{ background: accentColor }} />
          <span className="mes-rider-label">Rider {slot}</span>
          <span>Drop .gpx or .fit here</span>
          <span className="mes-drop-hint">or click to browse</span>
        </>
      )}
      {error && <p className="mes-error">{error}</p>}
      <input
        id={id}
        type="file"
        accept=".gpx,.fit,application/gpx+xml,application/xml,text/xml,application/octet-stream"
        style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
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

export function CompareEmptyState() {
  const trackA = useStore((s) => s.trackA);
  return (
    <div className="mode-empty-state">
      <div className="mes-content mes-content--wide">
        <div className="mes-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--b)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
        </div>
        <h2 className="mes-title">Analyze or compare</h2>
        <p className="mes-sub">Drop one file to analyze a single ride. Drop two to compare riders head-to-head.</p>

        <div className="mes-two-col">
          <RiderDrop slot="A" />
          <div className="mes-col-divider"><span>{trackA ? "+" : "vs"}</span></div>
          <RiderDrop slot="B" />
        </div>

        {trackA && (
          <div className="mes-note mes-note--hint">
            Rider A loaded — drop a second file to compare, or close this panel to view stats.
          </div>
        )}
        {!trackA && (
          <div className="mes-note">
            Different start times or timezones? We'll walk you through aligning them.
          </div>
        )}
      </div>
    </div>
  );
}

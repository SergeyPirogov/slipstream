import { useCallback, useState } from "react";
import { parseGpxFile } from "../gpx/parse";
import { parseFitFile } from "../gpx/parseFit";
import { useStore } from "../store";

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function CompareEmptyState() {
  const trackA = useStore((s) => s.trackA);
  const trackB = useStore((s) => s.trackB);
  const loadTrack = useStore((s) => s.loadTrack);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files).slice(0, 2);
    if (!arr.length) return;
    setError(null);
    setLoading(true);
    try {
      for (let i = 0; i < arr.length; i++) {
        const file = arr[i];
        const isFit = /\.fit$/i.test(file.name);
        const parsed = isFit ? await parseFitFile(file) : await parseGpxFile(file);
        loadTrack(i === 0 ? "A" : "B", parsed, file.name);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to parse file");
    } finally {
      setLoading(false);
    }
  }, [loadTrack]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  // Already have trackA — this empty state shouldn't show, but just in case
  if (trackA) return null;

  return (
    <div className="mode-empty-state">
      <div className="mes-content">
        <div className="mes-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
        </div>
        <h2 className="mes-title">Analyze your ride</h2>
        <p className="mes-sub">Drop a GPX or FIT file to analyze. Drop two files to compare riders side-by-side.</p>

        <label
          htmlFor="analyze-file-input"
          className={`mes-drop${dragging ? " dragging" : ""}`}
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
              <span>Drop file here</span>
              <span className="mes-drop-hint">GPX or FIT · drop one file or two to compare</span>
            </>
          )}
          <input
            id="analyze-file-input"
            type="file"
            accept=".gpx,.fit,application/gpx+xml,application/xml,text/xml,application/octet-stream"
            multiple
            style={{ display: "none" }}
            onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); }}
          />
        </label>

        {error && <p className="mes-error">{error}</p>}

        <div className="mes-note" style={{ marginTop: 12 }}>
          Different start times or timezones? We'll walk you through aligning them.
        </div>
      </div>
    </div>
  );
}

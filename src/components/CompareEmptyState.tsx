import { useCallback, useState } from "react";
import { parseGpxFile } from "../gpx/parse";
import { parseFitFile } from "../gpx/parseFit";
import { analyze } from "../gpx/analyze";
import { useStore } from "../store";
import type { ParsedGpx } from "../gpx/parse";

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtDist(m: number) {
  return (m / 1000).toFixed(1) + " km";
}

type StagedFile = {
  id: number;
  name: string;
  rider: string;
  parsed: ParsedGpx;
  distanceM: number;
  durationSec: number;
  elevGainM: number;
};

let nextId = 1;

export function CompareEmptyState() {
  const loadTrack = useStore((s) => s.loadTrack);
  const startAnalysis = useStore((s) => s.startAnalysis);
  const [files, setFiles] = useState<StagedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addFiles = useCallback(async (incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    if (!arr.length) return;
    setError(null);
    setLoading(true);
    try {
      const parsed: StagedFile[] = [];
      for (const file of arr) {
        const isFit = /\.fit$/i.test(file.name);
        const gpx = isFit ? await parseFitFile(file) : await parseGpxFile(file);
        const track = analyze(gpx, file.name, 0);
        parsed.push({
          id: nextId++,
          name: file.name,
          rider: track.rider,
          parsed: gpx,
          distanceM: track.totals.distanceM,
          durationSec: track.totals.durationSec,
          elevGainM: track.totals.ascentM,
        });
      }
      setFiles((prev) => [...prev, ...parsed]);
    } catch (e: any) {
      setError(e?.message ?? "Failed to parse file");
    } finally {
      setLoading(false);
    }
  }, []);

  const removeFile = (id: number) => setFiles((prev) => prev.filter((f) => f.id !== id));

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleStart = () => {
    if (files.length < 1 || files.length > 2) return;
    loadTrack("A", files[0].parsed, files[0].name);
    if (files[1]) loadTrack("B", files[1].parsed, files[1].name);
    startAnalysis();
  };

  const tooMany = files.length > 2;
  const canStart = files.length >= 1 && files.length <= 2;

  return (
    <div className="mode-empty-state">
      <div className="mes-content">
        <div className="mes-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
        </div>
        <h2 className="mes-title">Analyze your ride</h2>
        <p className="mes-sub">Load one file to analyze, or two to compare riders side-by-side.</p>

        {/* Drop zone — always visible */}
        <label
          htmlFor="ces-file-input"
          className={`mes-drop${dragging ? " dragging" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          {loading ? (
            <>
              <svg className="drop-spinner" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 2a10 10 0 0 1 10 10" />
              </svg>
              <span>Parsing…</span>
            </>
          ) : (
            <>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <span>Drop GPX / FIT here or browse</span>
              <span className="mes-drop-hint">GPX or FIT · you can drop multiple files at once</span>
            </>
          )}
          <input
            id="ces-file-input"
            type="file"
            accept=".gpx,.fit,application/gpx+xml,application/xml,text/xml,application/octet-stream"
            multiple
            style={{ display: "none" }}
            onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); }}
          />
        </label>

        {error && <p className="mes-error">{error}</p>}

        {/* Staged file list */}
        {files.length > 0 && (
          <div className="ces-file-list">
            {tooMany && (
              <div className="ces-warning">
                Only 2 files are supported. Remove {files.length - 2} file{files.length - 2 > 1 ? "s" : ""} to continue.
              </div>
            )}
            {files.map((f, i) => (
              <div key={f.id} className={`ces-file-row${i >= 2 ? " ces-file-row--excess" : ""}`}>
                <span className={`ces-file-dot ces-file-dot--${i === 0 ? "a" : i === 1 ? "b" : "excess"}`} />
                <div className="ces-file-info">
                  <span className="ces-file-name">{f.rider}</span>
                  <span className="ces-file-stats">
                    {fmtDist(f.distanceM)} · {formatDuration(f.durationSec)}
                  </span>
                </div>
                <button className="ces-remove-btn" onClick={() => removeFile(f.id)} title="Remove">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {files.length > 0 && (
          <button
            className="ces-start-btn"
            onClick={handleStart}
            disabled={!canStart}
          >
            {files.length === 2 ? "Compare rides →" : "Start analysis →"}
          </button>
        )}

        <div className="mes-note">
          Different start times or timezones? We'll walk you through aligning them.
        </div>
      </div>
    </div>
  );
}

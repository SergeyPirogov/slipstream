import { useCallback, useState } from "react";
import { parseGpxFile } from "../gpx/parse";
import { parseFitFile } from "../gpx/parseFit";
import { analyze } from "../gpx/analyze";
import { useStore } from "../store";
import type { StagedFile } from "../store";

const MAX_FILES = 5;

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

let nextId = 1;

export function CompareEmptyState() {
  const files = useStore((s) => s.stagedFiles);
  const slotA = useStore((s) => s.stagedSlotA);
  const slotB = useStore((s) => s.stagedSlotB);
  const addStagedFiles = useStore((s) => s.addStagedFiles);
  const removeStagedFile = useStore((s) => s.removeStagedFile);
  const assignStagedSlot = useStore((s) => s.assignStagedSlot);
  const startAnalysis = useStore((s) => s.startAnalysis);

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
        });
      }
      addStagedFiles(parsed);
    } catch (e: any) {
      setError(e?.message ?? "Failed to parse file");
    } finally {
      setLoading(false);
    }
  }, [addStagedFiles]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const canStart = slotA !== null;
  const atMax = files.length >= MAX_FILES;

  return (
    <div className="mode-empty-state">
      <div className="mes-content">
        <div className="mes-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
        </div>
        <h2 className="mes-title">Analyze your ride</h2>
        <p className="mes-sub">Load up to 5 files, then pick which to analyze or compare.</p>

        {!atMax && (
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
                <span className="mes-drop-hint">
                  {files.length === 0 ? "Up to 5 files · GPX or FIT" : `${MAX_FILES - files.length} more file${MAX_FILES - files.length !== 1 ? "s" : ""} allowed`}
                </span>
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
        )}

        {atMax && (
          <div className="ces-warning">
            Maximum of {MAX_FILES} files loaded. Remove a file to add another.
          </div>
        )}

        {error && <p className="mes-error">{error}</p>}

        {files.length > 0 && (
          <div className="ces-file-list">
            {files.map((f) => {
              const isA = slotA === f.id;
              const isB = slotB === f.id;
              return (
                <div key={f.id} className={`ces-file-row${isA ? " ces-file-row--a" : isB ? " ces-file-row--b" : ""}`}>
                  <div className="ces-slot-btns">
                    <button
                      className={`ces-slot-btn ces-slot-btn--a${isA ? " active" : ""}`}
                      onClick={() => assignStagedSlot("A", f.id)}
                      disabled={isB}
                      title={isB ? "Already selected as Rider B" : "Assign to Rider A"}
                    >A</button>
                    <button
                      className={`ces-slot-btn ces-slot-btn--b${isB ? " active" : ""}`}
                      onClick={() => assignStagedSlot("B", f.id)}
                      disabled={isA}
                      title={isA ? "Already selected as Rider A" : "Assign to Rider B"}
                    >B</button>
                  </div>
                  <div className="ces-file-info">
                    <span className="ces-file-name">{f.rider}</span>
                    <span className="ces-file-stats">{fmtDist(f.distanceM)} · {formatDuration(f.durationSec)}</span>
                  </div>
                  <button className="ces-remove-btn" onClick={() => removeStagedFile(f.id)} title="Remove">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/>
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {files.length > 0 && (
          <button className="ces-start-btn" onClick={startAnalysis} disabled={!canStart}>
            {slotB !== null ? "Compare rides →" : "Start analysis →"}
          </button>
        )}

        <div className="mes-note">
          Different start times or timezones? We'll walk you through aligning them.
        </div>
      </div>
    </div>
  );
}

import { useRef, useState, useMemo } from "react";
import { useStore } from "../store";
import { startOffsetSec, findCommonStart, findCommonEnd } from "../gpx/align";
import { RiderNameEditor } from "./RiderNameEditor";
import type { Track } from "../gpx/analyze";

function fmtDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

function fmtGap(sec: number): string {
  const abs = Math.abs(sec);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function fmtSigned(sec: number): string {
  if (sec === 0) return "0s";
  const sign = sec > 0 ? "+" : "−";
  const abs = Math.abs(sec);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  if (h > 0) return `${sign}${h}h ${m}m ${s}s`;
  if (m > 0) return `${sign}${m}m ${s}s`;
  return `${sign}${s}s`;
}

const COLOR_A = "#f97316";
const COLOR_B = "#3b82f6";

function TrimBars({
  totalA, totalB, leadA, leadB, tailA, tailB,
}: { totalA: number; totalB: number; leadA: number; leadB: number; tailA: number; tailB: number }) {
  const maxTotal = Math.max(totalA, totalB);
  const row = (color: string, label: string, total: number, lead: number, tail: number) => {
    const pLead = (lead / maxTotal) * 100;
    const pKeep = ((total - lead - tail) / maxTotal) * 100;
    const pTail = (tail / maxTotal) * 100;
    return (
      <div style={{ display: "contents" }}>
        <span style={{ color, fontWeight: 700, fontSize: 11 }}>{label}</span>
        <div style={{ display: "flex", height: 16, borderRadius: 3, overflow: "hidden", background: "var(--bg-elev-2)" }}>
          {pLead > 0.3 && (
            <div title={`Cut start: −${fmtDist(lead)}`} style={{ width: `${pLead}%`, background: "rgba(239,68,68,0.5)", display: "flex", alignItems: "center", justifyContent: "center", minWidth: 0, overflow: "hidden" }}>
              {pLead > 8 && <span style={{ fontSize: 9, color: "#fca5a5", whiteSpace: "nowrap", padding: "0 2px" }}>−{fmtDist(lead)}</span>}
            </div>
          )}
          <div style={{ width: `${pKeep}%`, background: color, opacity: 0.65 }} />
          {pTail > 0.3 && (
            <div title={`Cut finish: −${fmtDist(tail)}`} style={{ width: `${pTail}%`, background: "rgba(239,68,68,0.5)", display: "flex", alignItems: "center", justifyContent: "center", minWidth: 0, overflow: "hidden" }}>
              {pTail > 8 && <span style={{ fontSize: 9, color: "#fca5a5", whiteSpace: "nowrap", padding: "0 2px" }}>−{fmtDist(tail)}</span>}
            </div>
          )}
        </div>
        <span style={{ fontSize: 10, color: "var(--fg-dim)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
          {fmtDist(total - lead - tail)}
        </span>
      </div>
    );
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "14px 1fr auto", gap: "4px 6px", alignItems: "center", marginTop: 8 }}>
      {row(COLOR_A, "A", totalA, leadA, tailA)}
      {row(COLOR_B, "B", totalB, leadB, tailB)}
    </div>
  );
}

function subsample<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = arr.length / max;
  return Array.from({ length: max }, (_, i) => arr[Math.floor(i * step)]);
}

function TrackMinimap({ trackA, trackB }: { trackA: Track; trackB: Track }) {
  const W = 320, H = 150, PAD = 14;
  const { polyA, polyB, startA, endA, startB, endB } = useMemo(() => {
    const allPts = [...trackA.points, ...trackB.points];
    const lats = allPts.map((p) => p.lat);
    const lons = allPts.map((p) => p.lon);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const latRange = maxLat - minLat || 0.001;
    const lonRange = maxLon - minLon || 0.001;
    const scale = Math.min((W - PAD * 2) / lonRange, (H - PAD * 2) / latRange);
    const toX = (lon: number) => PAD + (lon - minLon) * scale + ((W - PAD * 2) - lonRange * scale) / 2;
    const toY = (lat: number) => H - PAD - (lat - minLat) * scale - ((H - PAD * 2) - latRange * scale) / 2;
    const toPoly = (pts: Track["points"]) =>
      subsample(pts, 300).map((p) => `${toX(p.lon).toFixed(1)},${toY(p.lat).toFixed(1)}`).join(" ");
    return {
      polyA: toPoly(trackA.points), polyB: toPoly(trackB.points),
      startA: { x: toX(trackA.points[0].lon), y: toY(trackA.points[0].lat) },
      endA:   { x: toX(trackA.points[trackA.points.length - 1].lon), y: toY(trackA.points[trackA.points.length - 1].lat) },
      startB: { x: toX(trackB.points[0].lon), y: toY(trackB.points[0].lat) },
      endB:   { x: toX(trackB.points[trackB.points.length - 1].lon), y: toY(trackB.points[trackB.points.length - 1].lat) },
    };
  }, [trackA, trackB]);
  const Pin = ({ x, y, color, label }: { x: number; y: number; color: string; label: string }) => (
    <g>
      <circle cx={x} cy={y} r={4} fill={color} stroke="#000" strokeWidth={1} opacity={0.9} />
      <text x={x} y={y - 7} textAnchor="middle" fontSize={9} fill={color} stroke="var(--bg)" strokeWidth={2.5} paintOrder="stroke">{label}</text>
    </g>
  );
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}
      style={{ display: "block", borderRadius: 6, background: "var(--bg)", border: "1px solid var(--border)", maxWidth: "100%", marginBottom: 10 }}
    >
      <polyline points={polyA} fill="none" stroke={COLOR_A} strokeWidth={1.8} strokeOpacity={0.85} strokeLinejoin="round" />
      <polyline points={polyB} fill="none" stroke={COLOR_B} strokeWidth={1.8} strokeOpacity={0.85} strokeLinejoin="round" />
      <Pin x={startA.x} y={startA.y} color={COLOR_A} label="A start" />
      <Pin x={endA.x}   y={endA.y}   color={COLOR_A} label="A end" />
      <Pin x={startB.x} y={startB.y} color={COLOR_B} label="B start" />
      <Pin x={endB.x}   y={endB.y}   color={COLOR_B} label="B end" />
    </svg>
  );
}

const TZ_OPTIONS: { label: string; value: number }[] = [
  { label: "UTC (0)", value: 0 },
  { label: "UTC+1", value: 1 },
  { label: "UTC+2", value: 2 },
  { label: "UTC+3 (Kyiv EEST)", value: 3 },
  { label: "UTC+4", value: 4 },
  { label: "UTC+5", value: 5 },
  { label: "UTC+5:30", value: 5.5 },
  { label: "UTC+6", value: 6 },
  { label: "UTC+7", value: 7 },
  { label: "UTC+8", value: 8 },
  { label: "UTC+9", value: 9 },
  { label: "UTC+10", value: 10 },
  { label: "UTC+11", value: 11 },
  { label: "UTC+12", value: 12 },
  { label: "UTC−1", value: -1 },
  { label: "UTC−2", value: -2 },
  { label: "UTC−3", value: -3 },
  { label: "UTC−4", value: -4 },
  { label: "UTC−5", value: -5 },
  { label: "UTC−6", value: -6 },
  { label: "UTC−7", value: -7 },
  { label: "UTC−8", value: -8 },
  { label: "UTC−9", value: -9 },
  { label: "UTC−10", value: -10 },
  { label: "UTC−11", value: -11 },
  { label: "UTC−12", value: -12 },
].sort((a, b) => a.value - b.value);

const STEPS = ["Timezones", "Common segment"] as const;
type StepIndex = 0 | 1;

export function AlignmentModal() {
  const trackA = useStore((s) => s.trackA);
  const trackB = useStore((s) => s.trackB);
  const rawA = useStore((s) => s.rawA);
  const rawB = useStore((s) => s.rawB);
  const offsetSec = useStore((s) => s.offsetSec);
  const alignmentConfirmed = useStore((s) => s.alignmentConfirmed);
  const alignmentPreviouslyConfirmed = useStore((s) => s.alignmentPreviouslyConfirmed);
  const confirmAlignment = useStore((s) => s.confirmAlignment);
  const cancelAlignment = useStore((s) => s.cancelAlignment);
  const setTzOffsetHours = useStore((s) => s.setTzOffsetHours);
  const trimToCommonStart = useStore((s) => s.trimToCommonStart);
  const commonStartScanKm = useStore((s) => s.commonStartScanKm);
  const setCommonStartScanKm = useStore((s) => s.setCommonStartScanKm);

  const [step, setStep] = useState<StepIndex>(0);

  const needsAttentionRef = useRef(false);
  const pairKey = `${rawA?.filename ?? ""}|${rawB?.filename ?? ""}`;
  const lastPairKeyRef = useRef(pairKey);
  if (lastPairKeyRef.current !== pairKey) {
    needsAttentionRef.current = false;
    lastPairKeyRef.current = pairKey;
    // reset step on new pair — use layout effect workaround via ref
  }

  const gap = trackA && trackB ? startOffsetSec(trackA, trackB) : 0;
  const commonStart = trackA && trackB ? findCommonStart(trackA, trackB, 500, commonStartScanKm * 1000) : null;
  const commonEnd = trackA && trackB ? findCommonEnd(trackA, trackB) : null;

  if (!trackA || !trackB) return null;
  if (alignmentConfirmed) return null;

  const absGap = Math.abs(gap);
  const hoursGuess = Math.round(gap / 3600);
  const nearWholeHour = absGap >= 1800 && Math.abs(hoursGuess * 3600 - gap) < 600;
  const tzOk = !nearWholeHour;
  const gapOk = absGap <= 2;
  const totalA = trackA.totals.distanceM;
  const totalB = trackB.totals.distanceM;
  const leadA = commonStart?.distA ?? 0;
  const leadB = commonStart?.distB ?? 0;
  const tailA = commonEnd?.tailA ?? 0;
  const tailB = commonEnd?.tailB ?? 0;
  const hasTrimBars = leadA > 10 || leadB > 10 || tailA > 10 || tailB > 10;
  const needsTrim = hasTrimBars;

  const allGood = tzOk && gapOk;

  if (!tzOk || commonStart || commonEnd) needsAttentionRef.current = true;
  if (!needsAttentionRef.current) return null;

  // ── Step status ──────────────────────────────────────────────────────────────
  const stepStatus = (i: StepIndex): "done" | "warn" | "idle" => {
    if (i === 0) return tzOk ? "done" : "warn";
    return !!commonStart ? "done" : "warn";
  };

  // ── Step 1: Timezones ────────────────────────────────────────────────────────
  const stepTz = (
    <div className="align-step-body">
      <p className="align-step-desc">
        Set each rider's timezone to match their head unit. A whole-hour gap usually means one device recorded in the wrong TZ.
      </p>
      {nearWholeHour && (
        <div className="align-step-warn">
          Start-time gap is {fmtGap(gap)} — looks like a {Math.abs(hoursGuess)}h TZ mismatch. Adjust one rider below.
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "8px 160px 1fr auto", alignItems: "center", gap: "8px 10px", marginTop: 4 }}>
        {(["A", "B"] as const).map((slot) => {
          const track = slot === "A" ? trackA : trackB;
          return (
            <>
              <span key={slot + "dot"} style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: slot === "A" ? "var(--a)" : "var(--b)" }} />
              <span key={slot + "name"} style={{ color: "var(--fg)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <RiderNameEditor slot={slot} />
              </span>
              <select key={slot + "tz"} value={track.tzOffsetHours} onChange={(e) => setTzOffsetHours(slot, Number(e.target.value))} style={{ fontSize: 12 }}>
                {TZ_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <span key={slot + "time"} style={{ color: "var(--fg-dim)", fontSize: 11, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                {track.points[0].t.toISOString().replace("T", " ").slice(0, 19)}Z
              </span>
            </>
          );
        })}
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: "var(--fg-dim)" }}>
        Current gap: <span style={{ color: gapOk ? "var(--accent)" : "#f59e0b", fontWeight: 600 }}>{fmtSigned(gap)}</span>
        {offsetSec !== 0 && <span> · manual offset: {fmtSigned(offsetSec)}</span>}
      </div>
      <div className="align-step-actions">
        <button className="align-btn-primary" onClick={() => setStep(1)}>
          Next: Common segment →
        </button>
      </div>
    </div>
  );

  // ── Step 2: Common segment ───────────────────────────────────────────────────
  const stepSegment = (
    <div className="align-step-body">
      <TrackMinimap trackA={trackA} trackB={trackB} />
      <p className="align-step-desc">
        Trim both tracks to their shared start and end so the comparison covers the same segment.
      </p>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, fontSize: 12 }}>
        <span style={{ color: "var(--fg-dim)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>Scan window</span>
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--fg-dim)" }}>
          <input
            type="number" min={1} max={100} value={commonStartScanKm}
            onChange={(e) => setCommonStartScanKm(Number(e.target.value))}
            style={{ width: 44, background: "var(--bg-elev-2)", color: "var(--fg)", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 4px", fontSize: 11, textAlign: "center" }}
          />
          <span>km</span>
        </div>
      </div>

      {commonStart ? (
        <div className="align-segment-info">
          <div style={{ fontSize: 11, color: "var(--fg-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Common start{commonStart.geoDistM > 25 ? ` · ${Math.round(commonStart.geoDistM)} m apart` : ""}</div>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 10px", fontSize: 12 }}>
            <span style={{ color: "var(--a)", fontWeight: 600 }}>A</span>
            <span>
              {leadA > 10
                ? <><span style={{ color: "var(--fg-dim)" }}>skip </span>{fmtDist(leadA)} lead-in ({fmtGap(commonStart.elapsedA)})</>
                : <span style={{ color: "var(--fg-dim)" }}>starts at file beginning</span>}
            </span>
            <span style={{ color: "var(--b)", fontWeight: 600 }}>B</span>
            <span>
              {leadB > 10
                ? <><span style={{ color: "var(--fg-dim)" }}>skip </span>{fmtDist(leadB)} lead-in ({fmtGap(commonStart.elapsedB)})</>
                : <span style={{ color: "var(--fg-dim)" }}>starts at file beginning</span>}
            </span>
          </div>

          {commonEnd && (tailA > 10 || tailB > 10) && (
            <>
              <div style={{ fontSize: 11, color: "var(--fg-dim)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "10px 0 6px", paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                Common finish{commonEnd.geoDistM > 25 ? ` · ${Math.round(commonEnd.geoDistM)} m apart` : ""}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 10px", fontSize: 12 }}>
                {tailA > 10 && <><span style={{ color: "var(--a)", fontWeight: 600 }}>A</span><span style={{ color: "var(--fg-dim)" }}>trim {fmtDist(tailA)} tail</span></>}
                {tailB > 10 && <><span style={{ color: "var(--b)", fontWeight: 600 }}>B</span><span style={{ color: "var(--fg-dim)" }}>trim {fmtDist(tailB)} tail</span></>}
              </div>
            </>
          )}

          {hasTrimBars && (
            <>
              <div style={{ fontSize: 11, color: "var(--fg-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 10 }}>After trim</div>
              <TrimBars totalA={totalA} totalB={totalB} leadA={leadA} leadB={leadB} tailA={tailA} tailB={tailB} />
            </>
          )}
        </div>
      ) : (
        <div className="align-step-warn">
          No common starting point found within first {commonStartScanKm} km.
          {commonStartScanKm < 50 && (
            <button
              onClick={() => setCommonStartScanKm(Math.min(commonStartScanKm + 20, 50))}
              style={{ marginLeft: 8, fontSize: 11, padding: "2px 8px", background: "var(--bg-elev-2)", color: "var(--fg)", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer" }}
            >
              Extend to {Math.min(commonStartScanKm + 20, 50)} km
            </button>
          )}
        </div>
      )}

      <div className="align-step-actions">
        <button className="align-btn-secondary" onClick={() => setStep(0)}>← Back</button>
        {needsTrim ? (
          <button
            className="align-btn-primary"
            disabled={nearWholeHour}
            title={nearWholeHour ? "Fix the timezone mismatch first" : "Trim each track to its common start and end points"}
            onClick={() => { trimToCommonStart(); confirmAlignment(); }}
          >
            Apply & analyze
          </button>
        ) : (
          <button
            className="align-btn-primary"
            style={!allGood ? { background: "var(--bg-elev-2)", color: "var(--fg-dim)", borderColor: "var(--border)" } : undefined}
            onClick={confirmAlignment}
          >
            {allGood ? "Continue" : "Compare anyway"}
          </button>
        )}
      </div>
    </div>
  );

  const stepPanels = [stepTz, stepSegment];

  return (
    <div className="alignment-modal-backdrop">
      <div className="alignment-modal">
        <div className="alignment-modal-header">
          <div className="alignment-modal-title-row">
            <h2>Align tracks</h2>
            {alignmentPreviouslyConfirmed && (
              <button className="alignment-modal-cancel" onClick={cancelAlignment} title="Cancel">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/>
                </svg>
              </button>
            )}
          </div>

          <div className="align-steps">
            {STEPS.map((label, i) => {
              const status = stepStatus(i as StepIndex);
              return (
                <button
                  key={i}
                  className={`align-step-tab${step === i ? " active" : ""}${status === "done" ? " done" : ""}${status === "warn" ? " warn" : ""}`}
                  onClick={() => setStep(i as StepIndex)}
                >
                  <span className="align-step-num">
                    {status === "done" ? "✓" : status === "warn" ? "!" : i + 1}
                  </span>
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {stepPanels[step]}
      </div>
    </div>
  );
}

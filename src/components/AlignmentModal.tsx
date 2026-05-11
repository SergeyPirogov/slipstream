import { useRef, useState, useMemo, useEffect } from "react";
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceArea, ReferenceLine, Tooltip } from "recharts";
import { useStore } from "../store";
import { startOffsetSec, findCommonStart, findCommonEnd, findSegmentWindow } from "../gpx/align";
import { buildSeriesByDistance } from "./Analytics/chartHelpers";
import { RiderNameEditor } from "./RiderNameEditor";
import type { Track } from "../gpx/analyze";

function fmtTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Build a spatial grid index from a subset of B's points for fast nearest-neighbour lookup.
function buildGrid(pts: Track["points"]): Map<string, Track["points"]> {
  const CELL_DEG = 0.002; // ~200 m cells
  const grid = new Map<string, Track["points"]>();
  for (const p of pts) {
    const key = `${Math.floor(p.lat / CELL_DEG)},${Math.floor(p.lon / CELL_DEG)}`;
    let cell = grid.get(key);
    if (!cell) { cell = []; grid.set(key, cell); }
    cell.push(p);
  }
  return grid;
}

function nearestDistFromGrid(grid: Map<string, Track["points"]>, lat: number, lon: number): number {
  const CELL_DEG = 0.002;
  const cosLat = Math.cos(lat * Math.PI / 180);
  const cx = Math.floor(lat / CELL_DEG);
  const cy = Math.floor(lon / CELL_DEG);
  let bestD = Infinity;
  for (let r = 0; r <= 25; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const cell = grid.get(`${cx + dx},${cy + dy}`);
        if (!cell) continue;
        for (const bp of cell) {
          const dlat = (lat - bp.lat) * 111320;
          const dlon = (lon - bp.lon) * 111320 * cosLat;
          const d = Math.sqrt(dlat * dlat + dlon * dlon);
          if (d < bestD) bestD = d;
        }
      }
    }
    if (bestD < Infinity && r * CELL_DEG * 111320 > bestD * 1.5) break;
  }
  return bestD;
}

// For start candidates: scan all of A against B's first `windowM` metres.
// For end candidates:   scan all of A against B's last  `windowM` metres.
// Returns the top `count` A-track km values closest to each B boundary region.
// Find the single A-track km closest to a set of B points (represented as a grid).
// Returns { km, distM } for the best match.
function bestMatchOnA(aPts: Track["points"], grid: Map<string, Track["points"]>): { km: number; distM: number } {
  let best = { km: 0, distM: Infinity };
  for (const p of aPts) {
    const d = nearestDistFromGrid(grid, p.lat, p.lon);
    if (d < best.distM) best = { km: p.distFromStart / 1000, distM: d };
  }
  return best;
}

export type SnapCandidate = { km: number; distM: number; reason: string };

function findAllSnapCandidates(
  trackA: Track,
  trackB: Track,
  windowM = 1000,
): { startCandidates: SnapCandidate[]; endCandidates: SnapCandidate[] } {
  const aPts = trackA.points;
  const bPts = trackB.points;
  const bTotalM = trackB.totals.distanceM;

  const bStart = bPts.filter((p) => p.distFromStart <= windowM);
  const bEnd   = bPts.filter((p) => p.distFromStart >= bTotalM - windowM);

  const gridAFull  = buildGrid(aPts);
  const gridBStart = buildGrid(bStart);
  const gridBEnd   = buildGrid(bEnd);

  // A→B: which A km is closest to B's boundary region?
  const aTowardsBStart = bestMatchOnA(aPts, gridBStart);
  const aTowardsBEnd   = bestMatchOnA(aPts, gridBEnd);

  // B→A: find B boundary point closest to full A, project to nearest A km
  const bWindowToA = (bWindow: Track["points"]): { km: number; distM: number } => {
    let bestBPt: Track["points"][0] | null = null;
    let bestD = Infinity;
    for (const p of bWindow) {
      const d = nearestDistFromGrid(gridAFull, p.lat, p.lon);
      if (d < bestD) { bestD = d; bestBPt = p; }
    }
    if (!bestBPt) return { km: 0, distM: Infinity };
    return bestMatchOnA(aPts, buildGrid([bestBPt]));
  };

  const bStartOnA = bWindowToA(bStart);
  const bEndOnA   = bWindowToA(bEnd);

  const fmtGeo = (d: number) => d < 1000 ? `${Math.round(d)} m apart` : `${(d / 1000).toFixed(1)} km apart`;

  // Pick best from both directions; label each with why it was chosen
  const pickTwo = (
    cAB: { km: number; distM: number },
    cBA: { km: number; distM: number },
    reasonAB: string,
    reasonBA: string,
  ): SnapCandidate[] => {
    const better: SnapCandidate = cAB.distM <= cBA.distM
      ? { ...cAB, reason: `${reasonAB} · ${fmtGeo(cAB.distM)}` }
      : { ...cBA, reason: `${reasonBA} · ${fmtGeo(cBA.distM)}` };
    const other: SnapCandidate = cAB.distM <= cBA.distM
      ? { ...cBA, reason: `${reasonBA} · ${fmtGeo(cBA.distM)}` }
      : { ...cAB, reason: `${reasonAB} · ${fmtGeo(cAB.distM)}` };
    if (Math.abs(better.km - other.km) < 0.1) return [better];
    return [better, other].sort((a, b) => a.km - b.km);
  };

  return {
    startCandidates: pickTwo(
      aTowardsBStart, bStartOnA,
      "closest A point to B's start",
      "closest B start point projected onto A",
    ),
    endCandidates: pickTwo(
      aTowardsBEnd, bEndOnA,
      "closest A point to B's finish",
      "closest B finish point projected onto A",
    ),
  };
}

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

function SnapChips({
  label, color, candidates, activeKm, endKm, isStart, onSnap,
}: {
  label: string;
  color: string;
  candidates: SnapCandidate[];
  activeKm: number | null;
  endKm: number | null;
  isStart: boolean;
  onSnap: (km: number) => void;
}) {
  if (candidates.length === 0) return null;
  return (
    <div className="snap-row">
      <span className="snap-row-label" style={{ color }}>{label}</span>
      <div className="snap-chips">
        {candidates.map((c) => {
          const isActive = activeKm !== null && Math.abs(c.km - activeKm) < 0.05;
          const invalid = endKm !== null && (isStart ? c.km >= endKm - 0.1 : c.km <= endKm + 0.1);
          return (
            <button
              key={c.km}
              disabled={invalid}
              onClick={() => onSnap(c.km)}
              className={`snap-chip${isActive ? " active" : ""}`}
              style={{ "--chip-color": color } as React.CSSProperties}
              title={invalid ? "Would overlap with the other edge" : c.reason}
            >
              {c.km.toFixed(1)} km
              <span className="snap-chip-reason">{c.reason}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SliderRow({
  label, color, sliderClass, value, min, max, step, onChange,
}: {
  label: string;
  color: string;
  sliderClass: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const startEdit = () => {
    setDraft(value.toFixed(2));
    setEditing(true);
  };

  const commit = () => {
    const parsed = parseFloat(draft);
    if (Number.isFinite(parsed)) {
      const clamped = Math.max(min, Math.min(max, Math.round(parsed / step) * step));
      onChange(Math.round(clamped * 1000) / 1000);
    }
    setEditing(false);
  };

  return (
    <div className="seg-slider-row">
      <span className="seg-slider-label" style={{ color }}>{label}</span>
      <input
        type="range"
        className={`seg-slider ${sliderClass}`}
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      {editing ? (
        <input
          type="number"
          className="seg-slider-val seg-slider-val--input"
          value={draft}
          step={step}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          style={{ color, width: 72 }}
        />
      ) : (
        <span
          className="seg-slider-val"
          style={{ color, cursor: "text" }}
          title="Click to edit"
          onClick={startEdit}
        >
          {value.toFixed(2)} km
        </span>
      )}
    </div>
  );
}

function SegmentElevationChart({
  trackA, trackB, segPinStart, segPinEnd, onSegmentChange, onSegmentClear,
}: {
  trackA: Track; trackB: Track;
  segPinStart: { lat: number; lon: number } | null;
  segPinEnd: { lat: number; lon: number } | null;
  onSegmentChange: (startKm: number, endKm: number) => void;
  onSegmentClear: () => void;
}) {
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);
  const dragging = useRef(false);
  // "start" | "end" | null — which boundary is being border-dragged
  const borderDrag = useRef<"start" | "end" | null>(null);
  const [borderDragKm, setBorderDragKm] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Margins Recharts uses inside the SVG (must match the chart margin prop)
  const CHART_MARGIN_LEFT = 36 + 4; // YAxis width + left margin
  const CHART_MARGIN_RIGHT = 4;

  const data = useMemo(
    () => buildSeriesByDistance(trackA, trackB, (i, t) => t.points[i].ele),
    [trackA, trackB],
  );

  // Convert stored lat/lon pins back to km for reference lines
  const pinToKm = (pin: { lat: number; lon: number } | null, track: Track): number | null => {
    if (!pin) return null;
    let best = 0, bestD = Infinity;
    for (const p of track.points) {
      const d = Math.abs(p.lat - pin.lat) + Math.abs(p.lon - pin.lon);
      if (d < bestD) { bestD = d; best = p.distFromStart; }
    }
    return best / 1000;
  };

  const committedStartKm = pinToKm(segPinStart, trackA);
  const committedEndKm   = pinToKm(segPinEnd,   trackA);

  // Live drag preview
  const liveLeft  = dragStart !== null && dragEnd !== null ? Math.min(dragStart, dragEnd) : null;
  const liveRight = dragStart !== null && dragEnd !== null ? Math.max(dragStart, dragEnd) : null;

  // What to show: dragging in progress → live; otherwise committed
  const selLeft  = liveLeft  ?? committedStartKm;
  const selRight = liveRight ?? committedEndKm;
  const hasSelection = selLeft !== null && selRight !== null;
  const hasCommitted = segPinStart !== null && segPinEnd !== null;
  const isDragging = dragStart !== null;

  // Global snap candidates — computed async so the chart renders first
  const [snapCandidates, setSnapCandidates] = useState<{ startCandidates: SnapCandidate[]; endCandidates: SnapCandidate[] } | null>(null);
  useEffect(() => {
    setSnapCandidates(null);
    const id = setTimeout(() => setSnapCandidates(findAllSnapCandidates(trackA, trackB)), 0);
    return () => clearTimeout(id);
  }, [trackA, trackB]);
  const startCandidates = snapCandidates?.startCandidates ?? [];
  const endCandidates   = snapCandidates?.endCandidates   ?? [];
  const snapLoading = snapCandidates === null;

  // X-axis ticks scaled to the actual track length
  const xTicks = useMemo(() => {
    const maxKm = Math.max(trackA.totals.distanceM, trackB.totals.distanceM) / 1000;
    const interval = maxKm <= 10 ? 1 : maxKm <= 25 ? 2 : maxKm <= 50 ? 5 : 10;
    const ticks: number[] = [];
    for (let km = 0; km <= maxKm; km += interval) ticks.push(Math.round(km * 10) / 10);
    return ticks;
  }, [trackA, trackB]);

  // Convert a clientX pixel position to a km value using the chart's plot area
  const pxToKm = (clientX: number): number => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const plotW = rect.width - CHART_MARGIN_LEFT - CHART_MARGIN_RIGHT;
    const maxKm = Math.max(trackA.totals.distanceM, trackB.totals.distanceM) / 1000;
    const x = clientX - rect.left - CHART_MARGIN_LEFT;
    return Math.max(0, Math.min(maxKm, (x / plotW) * maxKm));
  };

  // Tolerance for grabbing a border line: 10px in km
  const getTolKm = (): number => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return 0.3;
    const plotW = rect.width - CHART_MARGIN_LEFT - CHART_MARGIN_RIGHT;
    const maxKm = Math.max(trackA.totals.distanceM, trackB.totals.distanceM) / 1000;
    return (10 / plotW) * maxKm;
  };

  // Native pointer handlers for smooth border dragging (bypasses Recharts discrete steps)
  const startBorderDrag = (which: "start" | "end", initialKm: number) => {
    borderDrag.current = which;
    setBorderDragKm(initialKm);

    const onMove = (ev: PointerEvent) => {
      setBorderDragKm(pxToKm(ev.clientX));
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const km = pxToKm(ev.clientX);
      borderDrag.current = null;
      setBorderDragKm(null);
      if (which === "start" && committedEndKm !== null && km < committedEndKm - 0.05) {
        onSegmentChange(km, committedEndKm);
      } else if (which === "end" && committedStartKm !== null && km > committedStartKm + 0.05) {
        onSegmentChange(committedStartKm, km);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const handleMouseDown = (e: any) => {
    if (!e || e.activeLabel == null) return;
    const km = Number(e.activeLabel);
    const tol = getTolKm();

    if (committedStartKm !== null && Math.abs(km - committedStartKm) < tol) {
      startBorderDrag("start", committedStartKm);
      return;
    }
    if (committedEndKm !== null && Math.abs(km - committedEndKm) < tol) {
      startBorderDrag("end", committedEndKm);
      return;
    }

    dragging.current = true;
    setDragStart(km);
    setDragEnd(km);
  };

  const handleMouseMove = (e: any) => {
    if (!dragging.current || !e || e.activeLabel == null) return;
    setDragEnd(Number(e.activeLabel));
  };

  const handleMouseUp = (e: any) => {
    if (!dragging.current) return;
    dragging.current = false;
    if (dragStart !== null && dragEnd !== null) {
      const start = Math.min(dragStart, dragEnd);
      const end = Math.max(dragStart, dragEnd);
      if (end - start > 0.1) onSegmentChange(start, end);
    }
    setDragStart(null);
    setDragEnd(null);
  };

  const handleSnapStart = (km: number) => {
    const end = committedEndKm ?? (endCandidates[endCandidates.length - 1]?.km ?? km + 1);
    if (km < end) onSegmentChange(km, end);
  };
  const handleSnapEnd = (km: number) => {
    const start = committedStartKm ?? (startCandidates[0]?.km ?? km - 1);
    if (km > start) onSegmentChange(start, km);
  };

  return (
    <div className="seg-chart-wrap">
      {/* Header row */}
      <div className="seg-chart-header">
        <span className="seg-chart-label">
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: COLOR_A, marginRight: 5, verticalAlign: "middle" }} />
          {trackA.rider}
          {trackB && <>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: COLOR_B, margin: "0 5px 0 10px", verticalAlign: "middle" }} />
            {trackB.rider}
          </>}
        </span>
        {hasCommitted && (
          <button className="seg-chart-clear" onClick={onSegmentClear} title="Clear selection">
            ✕ Clear
          </button>
        )}
      </div>

      {/* Chart */}
      <div ref={containerRef} className="seg-chart-container" style={{ cursor: borderDragKm !== null ? "ew-resize" : "crosshair" }}>
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart
            data={data}
            margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            style={{ userSelect: "none" }}
          >
            <defs>
              <linearGradient id="alignEleFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLOR_A} stopOpacity={0.3} />
                <stop offset="100%" stopColor={COLOR_A} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#2a2f3a" strokeDasharray="3 3" />
            <XAxis dataKey="km" stroke="#8e94a0" tick={{ fontSize: 10 }} type="number" domain={["dataMin", "dataMax"]} ticks={xTicks} tickFormatter={(v) => `${v} km`} />
            <YAxis stroke="#8e94a0" tick={{ fontSize: 10 }} width={36} domain={["auto", "auto"]} tickFormatter={(v) => `${v}m`} />
            <Tooltip
              contentStyle={{ background: "#171a21", border: "1px solid #2a2f3a", fontSize: 11 }}
              formatter={(v: any, name: string) => [typeof v === "number" ? `${Math.round(v)} m` : v, name]}
              labelFormatter={(l) => `${Number(l).toFixed(1)} km`}
            />
            <Area name={trackA.rider} type="monotone" dataKey="a" stroke={COLOR_A} strokeWidth={1.5} fill="url(#alignEleFill)" isAnimationActive={false} />
            {trackB && <Line name={trackB.rider} type="monotone" dataKey="b" stroke={COLOR_B} dot={false} strokeWidth={1.2} isAnimationActive={false} />}
            {/* Derive display edges: substitute live border-drag position */}
            {(() => {
              const isBorderDragging = borderDragKm !== null;
              const dispStart = isBorderDragging && borderDrag.current === "start" ? borderDragKm! : committedStartKm;
              const dispEnd   = isBorderDragging && borderDrag.current === "end"   ? borderDragKm! : committedEndKm;
              const showSelection = hasCommitted || isBorderDragging;
              const totalKm = trackA.totals.distanceM / 1000;
              return <>
                {/* Outer dim — soft, elevation still fully visible underneath */}
                {!isDragging && showSelection && dispStart !== null && dispStart > 0 && (
                  <ReferenceArea x1={0} x2={dispStart} fill="#000" fillOpacity={0.18} />
                )}
                {!isDragging && showSelection && dispEnd !== null && (
                  <ReferenceArea x1={dispEnd} x2={totalKm} fill="#000" fillOpacity={0.18} />
                )}
                {/* Active selection highlight */}
                {!isDragging && showSelection && dispStart !== null && dispEnd !== null && (
                  <ReferenceArea x1={Math.min(dispStart, dispEnd)} x2={Math.max(dispStart, dispEnd)}
                    fill="#22c55e" fillOpacity={0.08} stroke="#22c55e" strokeOpacity={0.5} strokeWidth={1} />
                )}
                {/* Boundary lines with grab-handle label */}
                {!isDragging && dispStart !== null && (
                  <ReferenceLine x={dispStart} stroke="#22c55e"
                    strokeWidth={isBorderDragging && borderDrag.current === "start" ? 3 : 2}
                    label={{ value: isBorderDragging && borderDrag.current === "start" ? `${dispStart!.toFixed(2)} km` : "⠿ Start", position: "insideTopRight", fontSize: 10, fill: "#22c55e" }} />
                )}
                {!isDragging && dispEnd !== null && (
                  <ReferenceLine x={dispEnd} stroke="#ef4444"
                    strokeWidth={isBorderDragging && borderDrag.current === "end" ? 3 : 2}
                    label={{ value: isBorderDragging && borderDrag.current === "end" ? `${dispEnd!.toFixed(2)} km` : "End ⠿", position: "insideTopLeft", fontSize: 10, fill: "#ef4444" }} />
                )}
              </>;
            })()}
            {/* Live new-selection drag preview */}
            {isDragging && liveLeft !== null && liveRight !== null && liveRight - liveLeft > 0.05 && (
              <ReferenceArea x1={liveLeft} x2={liveRight} fill="#22c55e" fillOpacity={0.15} stroke="#22c55e" strokeOpacity={0.5} strokeDasharray="4 3" />
            )}
            {/* Candidate snap lines — shown when no committed edge for that side */}
            {!isDragging && committedStartKm === null && startCandidates.map((c) => (
              <ReferenceLine key={`sc-${c.km}`} x={c.km} stroke="#22c55e" strokeWidth={1} strokeDasharray="3 4" strokeOpacity={0.5} />
            ))}
            {!isDragging && committedEndKm === null && endCandidates.map((c) => (
              <ReferenceLine key={`ec-${c.km}`} x={c.km} stroke="#ef4444" strokeWidth={1} strokeDasharray="3 4" strokeOpacity={0.5} />
            ))}
          </ComposedChart>
        </ResponsiveContainer>

        {/* Instructional overlay — only when no selection and not dragging */}
        {!hasSelection && !isDragging && (
          <div className="seg-chart-hint">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
              <path d="M2 8h3M11 8h3M8 2v3M8 11v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <rect x="4" y="4" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </svg>
            Drag to select, or use snap points below
          </div>
        )}
      </div>

      {/* Fine-tune sliders — shown once both edges are committed */}
      {hasCommitted && committedStartKm !== null && committedEndKm !== null && (() => {
        const maxKm = Math.max(trackA.totals.distanceM, trackB.totals.distanceM) / 1000;
        const step = 0.01; // 10 m
        return (
          <div className="seg-sliders">
            <SliderRow
              label="Start" color="#22c55e" sliderClass="seg-slider--start"
              value={committedStartKm} min={0} max={committedEndKm - step} step={step}
              onChange={(v) => onSegmentChange(v, committedEndKm!)}
            />
            <SliderRow
              label="End" color="#ef4444" sliderClass="seg-slider--end"
              value={committedEndKm} min={committedStartKm + step} max={maxKm} step={step}
              onChange={(v) => onSegmentChange(committedStartKm!, v)}
            />
          </div>
        );
      })()}

      {/* Snap candidates — always shown so user can pick before dragging */}
      <div className="snap-panel">
        <div className="snap-panel-title">
          Best shared points
          <span className="snap-panel-hint">where both tracks pass near each other</span>
        </div>
        {snapLoading ? (
          <div className="snap-loading">
            <span className="snap-spinner" />
            Calculating…
          </div>
        ) : (
          <>
            <SnapChips
              label="Start"
              color="#22c55e"
              candidates={startCandidates}
              activeKm={committedStartKm}
              endKm={committedEndKm}
              isStart={true}
              onSnap={handleSnapStart}
            />
            <SnapChips
              label="End"
              color="#ef4444"
              candidates={endCandidates}
              activeKm={committedEndKm}
              endKm={committedStartKm}
              isStart={false}
              onSnap={handleSnapEnd}
            />
          </>
        )}
      </div>
    </div>
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
  const trimToSegment = useStore((s) => s.trimToSegment);
  const commonStartScanKm = useStore((s) => s.commonStartScanKm);
  const setCommonStartScanKm = useStore((s) => s.setCommonStartScanKm);
  const segStart = useStore((s) => s.segPinStart);
  const segEnd = useStore((s) => s.segPinEnd);
  const setSegmentPinsFromKm = useStore((s) => s.setSegmentPinsFromKm);
  const clearSegPins = useStore((s) => s.clearSegPins);

  const [step, setStep] = useState<StepIndex>(0);
  const [segError, setSegError] = useState<string | null>(null);

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
  const nearWholeHour = absGap >= 1800 && Math.abs(hoursGuess * 3600 - gap) < 600 && Math.abs(hoursGuess) <= 12;
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

  if (!tzOk || commonStart || commonEnd || absGap > 60) needsAttentionRef.current = true;
  if (!needsAttentionRef.current) return null;

  // ── Step status ──────────────────────────────────────────────────────────────
  const stepStatus = (i: StepIndex): "done" | "warn" | "idle" => {
    if (i === 0) return tzOk ? "done" : "warn";
    if (segStart && segEnd) return "done";
    if (commonStart) return "done";
    return "idle";
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
        Current gap: <span style={{ color: gapOk ? "var(--accent)" : nearWholeHour ? "#f59e0b" : "var(--fg-dim)", fontWeight: 600 }}>{fmtSigned(gap)}</span>
        {offsetSec !== 0 && <span> · manual offset: {fmtSigned(offsetSec)}</span>}
      </div>
      <div className="align-step-actions">
        <button className="align-btn-primary" onClick={() => setStep(1)}>
          Next: Common segment →
        </button>
      </div>
    </div>
  );

  // ── Segment window lookup ────────────────────────────────────────────────────
  const segWinA = segStart && segEnd ? findSegmentWindow(trackA, segStart.lat, segStart.lon, segEnd.lat, segEnd.lon) : null;
  const segWinB = segStart && segEnd && trackB ? findSegmentWindow(trackB, segStart.lat, segStart.lon, segEnd.lat, segEnd.lon) : null;

  const handleApplySegment = () => {
    if (!segStart || !segEnd) return;
    if (!segWinA) { setSegError("Segment not found on rider A's track."); return; }
    if (!segWinB) { setSegError("Segment not found on rider B's track."); return; }
    trimToSegment(segStart.lat, segStart.lon, segEnd.lat, segEnd.lon);
    confirmAlignment();
  };

  // ── Step 2: Common segment ───────────────────────────────────────────────────
  const hasManualSeg = segStart !== null && segEnd !== null;

  const stepSegment = (
    <div className="align-step-body">
      <SegmentElevationChart
        trackA={trackA} trackB={trackB}
        segPinStart={segStart}
        segPinEnd={segEnd}
        onSegmentChange={(startKm, endKm) => { setSegmentPinsFromKm(startKm, endKm); setSegError(null); }}
        onSegmentClear={() => { clearSegPins(); setSegError(null); }}
      />

      {/* ── Live segment stats ── */}
      {hasManualSeg && (
        <div className="seg-stats-card">
          {segWinA && segWinB ? (
            <div className="seg-stats-grid">
              <span className="seg-stats-label" style={{ color: COLOR_A }}>{trackA.rider}</span>
              <span className="seg-stats-val">
                <span style={{ color: "var(--fg-dim)" }}>{fmtDist(trackA.totals.distanceM)}</span>
                <span className="seg-stats-sep">→</span>
                <span style={{ color: COLOR_A, fontWeight: 600 }}>{fmtDist(segWinA.exitDistM - segWinA.entryDistM)}</span>
                <span style={{ color: "var(--fg-dim)", fontSize: 10 }}>
                  ({fmtTime(Math.round(segWinA.exitElapsed - segWinA.entryElapsed))})
                </span>
              </span>
              <span className="seg-stats-label" style={{ color: COLOR_B }}>{trackB.rider}</span>
              <span className="seg-stats-val">
                <span style={{ color: "var(--fg-dim)" }}>{fmtDist(trackB.totals.distanceM)}</span>
                <span className="seg-stats-sep">→</span>
                <span style={{ color: COLOR_B, fontWeight: 600 }}>{fmtDist(segWinB.exitDistM - segWinB.entryDistM)}</span>
                <span style={{ color: "var(--fg-dim)", fontSize: 10 }}>
                  ({fmtTime(Math.round(segWinB.exitElapsed - segWinB.entryElapsed))})
                </span>
              </span>
            </div>
          ) : (
            <div className="seg-stats-error">
              {!segWinA && <span>Segment not found on <span style={{ color: COLOR_A }}>{trackA.rider}</span>'s track</span>}
              {!segWinB && trackB && <span>Segment not found on <span style={{ color: COLOR_B }}>{trackB.rider}</span>'s track</span>}
            </div>
          )}
          {segError && <div className="align-step-warn" style={{ marginTop: 6 }}>{segError}</div>}
        </div>
      )}

      {/* ── OR divider + auto-detect ── */}
      {!hasManualSeg && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0", color: "var(--fg-dim)", fontSize: 11 }}>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            <span>or auto-detect</span>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>
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
                <span>{leadA > 10 ? <><span style={{ color: "var(--fg-dim)" }}>skip </span>{fmtDist(leadA)} lead-in ({fmtGap(commonStart.elapsedA)})</> : <span style={{ color: "var(--fg-dim)" }}>starts at file beginning</span>}</span>
                <span style={{ color: "var(--b)", fontWeight: 600 }}>B</span>
                <span>{leadB > 10 ? <><span style={{ color: "var(--fg-dim)" }}>skip </span>{fmtDist(leadB)} lead-in ({fmtGap(commonStart.elapsedB)})</> : <span style={{ color: "var(--fg-dim)" }}>starts at file beginning</span>}</span>
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
                <button onClick={() => setCommonStartScanKm(Math.min(commonStartScanKm + 20, 50))}
                  style={{ marginLeft: 8, fontSize: 11, padding: "2px 8px", background: "var(--bg-elev-2)", color: "var(--fg)", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer" }}>
                  Extend to {Math.min(commonStartScanKm + 20, 50)} km
                </button>
              )}
            </div>
          )}
        </>
      )}

      <div className="align-step-actions">
        <button className="align-btn-secondary" onClick={() => setStep(0)}>← Back</button>
        {segStart && segEnd ? (
          <button className="align-btn-primary" onClick={handleApplySegment}>
            Apply & analyze
          </button>
        ) : needsTrim ? (
          <button className="align-btn-primary" disabled={nearWholeHour}
            title={nearWholeHour ? "Fix the timezone mismatch first" : "Trim each track to its common start and end points"}
            onClick={() => { trimToCommonStart(); confirmAlignment(); }}>
            Apply & analyze
          </button>
        ) : (
          <button className="align-btn-primary"
            style={!allGood ? { background: "var(--bg-elev-2)", color: "var(--fg-dim)", borderColor: "var(--border)" } : undefined}
            onClick={confirmAlignment}>
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

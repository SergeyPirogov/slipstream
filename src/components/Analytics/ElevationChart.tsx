import { useMemo, useRef, useState } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  ReferenceArea,
  Legend,
} from "recharts";
import { useStore, useMaxValue } from "../../store";
import { buildSeriesByDistance } from "./chartHelpers";

export function ElevationChart() {
  const trackA = useStore((s) => s.trackA);
  const trackB = useStore((s) => s.trackB);
  const syncMode = useStore((s) => s.syncMode);
  const progress = useStore((s) => s.progress);
  const segmentM = useStore((s) => s.segmentM);
  const setSegmentM = useStore((s) => s.setSegmentM);
  const clearSegmentM = useStore((s) => s.clearSegmentM);
  const maxValue = useMaxValue();

  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);
  const dragging = useRef(false);

  const data = useMemo(
    () => buildSeriesByDistance(trackA, trackB, (i, t) => t.points[i].ele),
    [trackA, trackB],
  );

  const xTicks = useMemo(() => {
    if (!trackA || !trackB) return undefined;
    const maxKm = Math.max(trackA.totals.distanceM, trackB.totals.distanceM) / 1000;
    const ticks: number[] = [];
    for (let km = 0; km <= maxKm; km += 10) ticks.push(km);
    return ticks;
  }, [trackA, trackB]);

  if (!trackA || !trackB) return null;

  let cursorKm: number | undefined;
  if (syncMode === "distance") {
    cursorKm = (progress * maxValue) / 1000;
  } else {
    const elapsed = progress * maxValue;
    const idx = trackA.points.findIndex((p) => p.elapsedSec >= elapsed);
    if (idx >= 0) cursorKm = trackA.points[idx].distFromStart / 1000;
  }

  const segStartKm = segmentM ? segmentM.start / 1000 : null;
  const segEndKm = segmentM ? segmentM.end / 1000 : null;

  const selLeft = dragStart !== null && dragEnd !== null ? Math.min(dragStart, dragEnd) : null;
  const selRight = dragStart !== null && dragEnd !== null ? Math.max(dragStart, dragEnd) : null;

  const handleMouseDown = (e: any) => {
    if (!e || e.activeLabel == null) return;
    dragging.current = true;
    setDragStart(Number(e.activeLabel));
    setDragEnd(Number(e.activeLabel));
  };

  const handleMouseMove = (e: any) => {
    if (!dragging.current || !e || e.activeLabel == null) return;
    setDragEnd(Number(e.activeLabel));
  };

  const handleMouseUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (dragStart !== null && dragEnd !== null) {
      const start = Math.min(dragStart, dragEnd);
      const end = Math.max(dragStart, dragEnd);
      if (end - start > 0.05) {
        setSegmentM(start * 1000, end * 1000);
      }
    }
    setDragStart(null);
    setDragEnd(null);
  };

  return (
    <div className="panel">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h3>Elevation (m)</h3>
        {segmentM ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "var(--fg-dim)" }}>
              Segment: {(segmentM.start / 1000).toFixed(1)}–{(segmentM.end / 1000).toFixed(1)} km
            </span>
            <button
              onClick={clearSegmentM}
              style={{ fontSize: 11, padding: "2px 8px", background: "var(--bg-elev-2)", color: "var(--fg-dim)", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer" }}
            >
              ✕ Clear
            </button>
          </div>
        ) : (
          <span style={{ fontSize: 11, color: "var(--fg-dim)" }}>Drag to select segment</span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <ComposedChart
          data={data}
          margin={{ top: 5, right: 10, bottom: 5, left: 0 }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          style={{ userSelect: "none" }}
        >
          <defs>
            <linearGradient id="eleFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f97316" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#2a2f3a" strokeDasharray="3 3" />
          <XAxis
            dataKey="km"
            stroke="#8e94a0"
            tick={{ fontSize: 10 }}
            type="number"
            domain={["dataMin", "dataMax"]}
            ticks={xTicks}
            tickFormatter={(v) => `${Math.round(v)}`}
          />
          <YAxis stroke="#8e94a0" tick={{ fontSize: 10 }} width={36} domain={["auto", "auto"]} />
          <Tooltip
            contentStyle={{ background: "#171a21", border: "1px solid #2a2f3a", fontSize: 12 }}
            formatter={(v: any) => (typeof v === "number" ? `${Math.round(v)} m` : v)}
            labelFormatter={(l) => `${Number(l).toFixed(1)} km`}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
          <Area name={trackA.rider} type="monotone" dataKey="a" stroke="#f97316" strokeWidth={1.5} fill="url(#eleFill)" isAnimationActive={false} />
          <Line name={trackB.rider} type="monotone" dataKey="b" stroke="#3b82f6" dot={false} strokeWidth={1.2} isAnimationActive={false} />
          {trackA.climbs.map((c, i) => (
            <ReferenceArea
              key={`a-${i}`}
              x1={c.startKm}
              x2={c.startKm + c.lengthM / 1000}
              fill="#f97316"
              fillOpacity={0.08}
            />
          ))}
          {/* Active segment highlight */}
          {segStartKm !== null && segEndKm !== null && (
            <ReferenceArea x1={segStartKm} x2={segEndKm} fill="#22c55e" fillOpacity={0.12} stroke="#22c55e" strokeOpacity={0.4} />
          )}
          {/* In-progress drag selection */}
          {selLeft !== null && selRight !== null && (
            <ReferenceArea x1={selLeft} x2={selRight} fill="#22c55e" fillOpacity={0.15} stroke="#22c55e" strokeOpacity={0.6} strokeDasharray="3 3" />
          )}
          {cursorKm !== undefined && <ReferenceLine x={cursorKm} stroke="#22c55e" strokeDasharray="3 3" />}
        </ComposedChart>
      </ResponsiveContainer>
      {trackA.climbs.length > 0 && (
        <div style={{ fontSize: 11, color: "var(--fg-dim)", marginTop: 6 }}>
          {trackA.climbs.length} climb{trackA.climbs.length === 1 ? "" : "s"} detected (≥3% for ≥500m)
        </div>
      )}
    </div>
  );
}

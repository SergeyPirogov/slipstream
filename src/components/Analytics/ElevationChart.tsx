import { useMemo } from "react";
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
  const maxValue = useMaxValue();

  const data = useMemo(
    () => buildSeriesByDistance(trackA, trackB, (i, t) => t.points[i].ele),
    [trackA, trackB],
  );

  if (!trackA || !trackB) return null;

  let cursorKm: number | undefined;
  if (syncMode === "distance") {
    cursorKm = (progress * maxValue) / 1000;
  } else {
    const elapsed = progress * maxValue;
    const idx = trackA.points.findIndex((p) => p.elapsedSec >= elapsed);
    if (idx >= 0) cursorKm = trackA.points[idx].distFromStart / 1000;
  }

  return (
    <div className="panel">
      <h3>Elevation (m)</h3>
      <ResponsiveContainer width="100%" height={180}>
        <ComposedChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
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

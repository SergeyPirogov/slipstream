import { useMemo } from "react";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  Legend,
} from "recharts";
import type { Track } from "../../gpx/analyze";

type Row = { km: number; a?: number; b?: number };

export function buildSeriesByDistance(
  trackA: Track | null,
  trackB: Track | null,
  pick: (idx: number, track: Track) => number | undefined,
  sampleCount = 600,
  segmentM?: { start: number; end: number } | null,
): Row[] {
  if (!trackA || !trackB) return [];
  const fullMaxM = Math.max(trackA.totals.distanceM, trackB.totals.distanceM);
  const startM = segmentM ? segmentM.start : 0;
  const endM = segmentM ? Math.min(segmentM.end, fullMaxM) : fullMaxM;
  const rangeM = endM - startM;
  if (rangeM <= 0) return [];
  const step = rangeM / sampleCount;
  const rows: Row[] = [];
  const aDists = trackA.points.map((p) => p.distFromStart);
  const bDists = trackB.points.map((p) => p.distFromStart);
  for (let i = 0; i <= sampleCount; i++) {
    const m = startM + i * step;
    const km = m / 1000;
    const aIdx = bsearch(aDists, m);
    const bIdx = bsearch(bDists, m);
    const a = m <= trackA.totals.distanceM ? pick(aIdx, trackA) : undefined;
    const b = m <= trackB.totals.distanceM ? pick(bIdx, trackB) : undefined;
    rows.push({ km, a, b });
  }
  return rows;
}

function bsearch(arr: number[], target: number): number {
  let lo = 0, hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function TwoSeriesLineChart({
  data,
  cursorKm,
  yLabel,
  yUnit,
  riderA,
  riderB,
  yDomain,
  segmentM,
}: {
  data: Row[];
  cursorKm?: number;
  yLabel: string;
  yUnit: string;
  riderA: string;
  riderB: string;
  yDomain?: [number | "auto", number | "auto"];
  segmentM?: { start: number; end: number } | null;
}) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <ComposedChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
        <CartesianGrid stroke="#2a2f3a" strokeDasharray="3 3" />
        <XAxis
          dataKey="km"
          stroke="#8e94a0"
          tick={{ fontSize: 10 }}
          tickFormatter={(v) => `${Math.round(v)}`}
          label={{ value: "km", position: "insideBottomRight", offset: -2, fill: "#8e94a0", fontSize: 10 }}
          type="number"
          domain={segmentM ? [segmentM.start / 1000, segmentM.end / 1000] : ["dataMin", "dataMax"]}
        />
        <YAxis
          stroke="#8e94a0"
          tick={{ fontSize: 10 }}
          width={36}
          domain={yDomain ?? ["auto", "auto"]}
        />
        <Tooltip
          contentStyle={{ background: "#171a21", border: "1px solid #2a2f3a", fontSize: 12 }}
          formatter={(v: any) => (typeof v === "number" ? `${v.toFixed(1)} ${yUnit}` : v)}
          labelFormatter={(l) => `${Number(l).toFixed(1)} km`}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
        <Line name={riderA} type="monotone" dataKey="a" stroke="#f97316" dot={false} strokeWidth={1.5} isAnimationActive={false} />
        <Line name={riderB} type="monotone" dataKey="b" stroke="#3b82f6" dot={false} strokeWidth={1.5} isAnimationActive={false} />
        {cursorKm !== undefined && <ReferenceLine x={cursorKm} stroke="#22c55e" strokeDasharray="3 3" />}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function useCursorKm(): number | undefined {
  return undefined; // placeholder unused; kept for future API compatibility
}

import { useStore } from "../../store";
import { RiderNameEditor } from "../RiderNameEditor";
import type { Track, TrackPoint } from "../../gpx/analyze";

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec)) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

type SegStats = {
  distanceM: number;
  durationSec: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
  ascentM: number;
  avgHr?: number;
  avgCad?: number;
  avgPower?: number;
  maxPower?: number;
};

function segmentStats(track: Track, startM: number, endM: number): SegStats {
  const pts = track.points.filter((p) => p.distFromStart >= startM && p.distFromStart <= endM);
  if (pts.length < 2) {
    return { distanceM: 0, durationSec: 0, avgSpeedKmh: 0, maxSpeedKmh: 0, ascentM: 0 };
  }
  const distanceM = pts[pts.length - 1].distFromStart - pts[0].distFromStart;
  const durationSec = pts[pts.length - 1].elapsedSec - pts[0].elapsedSec;
  const avgSpeedKmh = durationSec > 0 ? (distanceM / durationSec) * 3.6 : 0;
  let maxSpeedKmh = 0, ascentM = 0;
  let hrSum = 0, hrN = 0, cadSum = 0, cadN = 0, pwrSum = 0, pwrN = 0, pwrMax = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i] as TrackPoint;
    if (p.speedKmh > maxSpeedKmh) maxSpeedKmh = p.speedKmh;
    if (i > 0) {
      const dEle = p.ele - pts[i - 1].ele;
      if (dEle > 0) ascentM += dEle;
    }
    if (p.hr !== undefined) { hrSum += p.hr; hrN++; }
    if (p.cad !== undefined) { cadSum += p.cad; cadN++; }
    if (p.power !== undefined) { pwrSum += p.power; pwrN++; if (p.power > pwrMax) pwrMax = p.power; }
  }
  return {
    distanceM,
    durationSec,
    avgSpeedKmh,
    maxSpeedKmh,
    ascentM,
    avgHr: hrN > 0 ? hrSum / hrN : undefined,
    avgCad: cadN > 0 ? cadSum / cadN : undefined,
    avgPower: pwrN > 0 ? pwrSum / pwrN : undefined,
    maxPower: pwrN > 0 ? pwrMax : undefined,
  };
}

type Row = { label: string; a: string; b: string; delta?: "pos" | "neg" | "neutral" };

function deltaClass(a: number, b: number, higherIsBetter = true): "pos" | "neg" | "neutral" {
  if (Math.abs(a - b) < 0.001) return "neutral";
  return (a > b) === higherIsBetter ? "pos" : "neg";
}

export function SummaryCards() {
  const trackA = useStore((s) => s.trackA);
  const trackB = useStore((s) => s.trackB);
  const segmentM = useStore((s) => s.segmentM);
  if (!trackA) return null;

  const statsA = segmentM ? segmentStats(trackA, segmentM.start, segmentM.end) : null;
  const statsB = trackB && segmentM ? segmentStats(trackB, segmentM.start, segmentM.end) : null;
  const tA = statsA ?? trackA.totals;
  const tB = statsB ?? trackB?.totals ?? null;
  const seg = !!segmentM;

  const rows: Row[] = [];
  const b = (val: string | undefined) => val ?? "—";

  rows.push({
    label: "Distance",
    a: `${(tA.distanceM / 1000).toFixed(2)} km`,
    b: tB ? `${(tB.distanceM / 1000).toFixed(2)} km` : "",
    delta: tB ? deltaClass(tA.distanceM, tB.distanceM) : undefined,
  });
  rows.push({
    label: "Moving time",
    a: formatDuration(tA.durationSec),
    b: tB ? formatDuration(tB.durationSec) : "",
    delta: tB ? deltaClass(tB.durationSec, tA.durationSec) : undefined,
  });

  const showElapsedA = !seg && trackA.elapsedSec !== undefined && trackA.elapsedSec - trackA.totals.durationSec > 60;
  const showElapsedB = !seg && trackB && trackB.elapsedSec !== undefined && trackB.elapsedSec - trackB.totals.durationSec > 60;
  if (showElapsedA || showElapsedB) {
    rows.push({
      label: "Elapsed time",
      a: showElapsedA ? formatDuration(trackA.elapsedSec!) : "—",
      b: showElapsedB ? formatDuration(trackB!.elapsedSec!) : tB ? "—" : "",
    });
  }

  rows.push({
    label: "Avg speed",
    a: `${tA.avgSpeedKmh.toFixed(1)} km/h`,
    b: tB ? `${tB.avgSpeedKmh.toFixed(1)} km/h` : "",
    delta: tB ? deltaClass(tA.avgSpeedKmh, tB.avgSpeedKmh) : undefined,
  });
  rows.push({
    label: "Max speed",
    a: `${tA.maxSpeedKmh.toFixed(1)} km/h`,
    b: tB ? `${tB.maxSpeedKmh.toFixed(1)} km/h` : "",
    delta: tB ? deltaClass(tA.maxSpeedKmh, tB.maxSpeedKmh) : undefined,
  });
  rows.push({
    label: "Ascent",
    a: `${Math.round(tA.ascentM)} m`,
    b: tB ? `${Math.round(tB.ascentM)} m` : "",
    delta: tB ? deltaClass(tA.ascentM, tB.ascentM) : undefined,
  });

  if (tA.avgHr !== undefined || tB?.avgHr !== undefined) {
    rows.push({
      label: "Avg HR",
      a: tA.avgHr !== undefined ? `${Math.round(tA.avgHr)} bpm` : "—",
      b: tB ? (tB.avgHr !== undefined ? `${Math.round(tB.avgHr)} bpm` : "—") : "",
    });
  }
  if (tA.avgCad !== undefined || tB?.avgCad !== undefined) {
    rows.push({
      label: "Avg cadence",
      a: tA.avgCad !== undefined ? `${Math.round(tA.avgCad)} rpm` : "—",
      b: tB ? (tB.avgCad !== undefined ? `${Math.round(tB.avgCad)} rpm` : "—") : "",
    });
  }
  if (tA.avgPower !== undefined || tB?.avgPower !== undefined) {
    rows.push({
      label: "Avg power",
      a: tA.avgPower !== undefined ? `${Math.round(tA.avgPower)} W` : "—",
      b: tB ? (tB.avgPower !== undefined ? `${Math.round(tB.avgPower)} W` : "—") : "",
      delta: tB && tA.avgPower !== undefined && tB.avgPower !== undefined
        ? deltaClass(tA.avgPower, tB.avgPower) : undefined,
    });
  }
  if (!seg && (trackA.totals.normalizedPower !== undefined || trackB?.totals.normalizedPower !== undefined)) {
    rows.push({
      label: "NP",
      a: trackA.totals.normalizedPower !== undefined ? `${Math.round(trackA.totals.normalizedPower)} W` : "—",
      b: trackB ? (trackB.totals.normalizedPower !== undefined ? `${Math.round(trackB.totals.normalizedPower)} W` : "—") : "",
      delta: trackB && trackA.totals.normalizedPower !== undefined && trackB.totals.normalizedPower !== undefined
        ? deltaClass(trackA.totals.normalizedPower, trackB.totals.normalizedPower) : undefined,
    });
  }
  if (tA.maxPower !== undefined || tB?.maxPower !== undefined) {
    rows.push({
      label: "Max power",
      a: tA.maxPower !== undefined ? `${Math.round(tA.maxPower)} W` : "—",
      b: tB ? (tB.maxPower !== undefined ? `${Math.round(tB.maxPower)} W` : "—") : "",
      delta: tB && tA.maxPower !== undefined && tB.maxPower !== undefined
        ? deltaClass(tA.maxPower, tB.maxPower) : undefined,
    });
  }
  if (trackA.weightKg !== undefined || trackB?.weightKg !== undefined) {
    rows.push({
      label: "Weight",
      a: trackA.weightKg !== undefined ? `${trackA.weightKg} kg` : "—",
      b: trackB ? (trackB.weightKg !== undefined ? `${trackB.weightKg} kg` : "—") : "",
    });
  }
  if (!seg) {
    rows.push({
      label: "Climbs ≥500m",
      a: String(trackA.climbs.length),
      b: trackB ? String(trackB.climbs.length) : "",
    });
  }

  const COLOR_A = "var(--a)";
  const COLOR_B = "var(--b)";

  return (
    <div className="panel">
      <h3>Summary{segmentM ? ` · ${(segmentM.start / 1000).toFixed(1)}–${(segmentM.end / 1000).toFixed(1)} km` : ""}</h3>
      <table className="summary-table">
        <thead>
          <tr>
            <th />
            <th style={{ color: COLOR_A }}>
              <RiderNameEditor slot="A" />
              {trackA.subSport === "virtual_activity" && <span className="virtual-badge" style={{ marginLeft: 4 }}>Virtual</span>}
            </th>
            {trackB && (
              <th style={{ color: COLOR_B }}>
                <RiderNameEditor slot="B" />
                {trackB.subSport === "virtual_activity" && <span className="virtual-badge" style={{ marginLeft: 4 }}>Virtual</span>}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td className="summary-label">{r.label}</td>
              <td className={r.delta === "pos" ? "delta-pos" : r.delta === "neg" ? "delta-neg" : ""}>{r.a}</td>
              {trackB && <td className={r.delta === "pos" ? "delta-neg" : r.delta === "neg" ? "delta-pos" : ""}>{r.b}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

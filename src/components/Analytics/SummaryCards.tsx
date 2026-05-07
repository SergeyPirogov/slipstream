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

export function SummaryCards() {
  const trackA = useStore((s) => s.trackA);
  const trackB = useStore((s) => s.trackB);
  const segmentM = useStore((s) => s.segmentM);
  if (!trackA || !trackB) return null;

  const statsA = segmentM ? segmentStats(trackA, segmentM.start, segmentM.end) : null;
  const statsB = segmentM ? segmentStats(trackB, segmentM.start, segmentM.end) : null;

  const card = (slot: "a" | "b", track: NonNullable<typeof trackA>, seg: SegStats | null) => {
    const totals = seg ?? track.totals;
    const elapsedDiffSec = track.elapsedSec !== undefined
      ? track.elapsedSec - track.totals.durationSec
      : 0;
    const showElapsed = !seg && track.elapsedSec !== undefined && elapsedDiffSec > 60;

    return (
      <div className={`summary-card ${slot}`}>
        <div className="rider">
          <RiderNameEditor slot={slot === "a" ? "A" : "B"} />
          {track.subSport === "virtual_activity" && (
            <span className="virtual-badge">Virtual</span>
          )}
        </div>
        <div className="rows">
          <div className="k">Distance</div>
          <div className="v">{(totals.distanceM / 1000).toFixed(2)} km</div>
          <div className="k">Moving time</div>
          <div className="v">{formatDuration(totals.durationSec)}</div>
          {showElapsed && (
            <>
              <div className="k">Elapsed time</div>
              <div className="v">{formatDuration(track.elapsedSec!)}</div>
            </>
          )}
          <div className="k">Avg speed</div>
          <div className="v">{totals.avgSpeedKmh.toFixed(1)} km/h</div>
          <div className="k">Max speed</div>
          <div className="v">{totals.maxSpeedKmh.toFixed(1)} km/h</div>
          <div className="k">Ascent</div>
          <div className="v">{Math.round(totals.ascentM)} m</div>
          {totals.avgHr !== undefined && (
            <>
              <div className="k">Avg HR</div>
              <div className="v">{Math.round(totals.avgHr)} bpm</div>
            </>
          )}
          {totals.avgCad !== undefined && (
            <>
              <div className="k">Avg cadence</div>
              <div className="v">{Math.round(totals.avgCad)} rpm</div>
            </>
          )}
          {totals.avgPower !== undefined && (
            <>
              <div className="k">Avg power</div>
              <div className="v">{Math.round(totals.avgPower)} W</div>
            </>
          )}
          {!seg && track.totals.normalizedPower !== undefined && (
            <>
              <div className="k">NP</div>
              <div className="v">{Math.round(track.totals.normalizedPower)} W</div>
            </>
          )}
          {totals.maxPower !== undefined && (
            <>
              <div className="k">Max power</div>
              <div className="v">{Math.round(totals.maxPower)} W</div>
            </>
          )}
          {!seg && (
            <>
              <div className="k">Climbs ≥500m</div>
              <div className="v">{track.climbs.length}</div>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="panel">
      <h3>Summary{segmentM ? ` · ${(segmentM.start / 1000).toFixed(1)}–${(segmentM.end / 1000).toFixed(1)} km` : ""}</h3>
      <div className="summary-grid">
        {card("a", trackA, statsA)}
        {card("b", trackB, statsB)}
      </div>
    </div>
  );
}

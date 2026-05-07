import { useStore } from "../../store";
import { RiderNameEditor } from "../RiderNameEditor";

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec)) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

export function SummaryCards() {
  const trackA = useStore((s) => s.trackA);
  const trackB = useStore((s) => s.trackB);
  if (!trackA || !trackB) return null;

  const card = (slot: "a" | "b", track: NonNullable<typeof trackA>) => (
    <div className={`summary-card ${slot}`}>
      <div className="rider">
        <RiderNameEditor slot={slot === "a" ? "A" : "B"} />
      </div>
      <div className="rows">
        <div className="k">Distance</div>
        <div className="v">{(track.totals.distanceM / 1000).toFixed(2)} km</div>
        <div className="k">Moving time</div>
        <div className="v">{formatDuration(track.totals.durationSec)}</div>
        <div className="k">Avg speed</div>
        <div className="v">{track.totals.avgSpeedKmh.toFixed(1)} km/h</div>
        <div className="k">Max speed</div>
        <div className="v">{track.totals.maxSpeedKmh.toFixed(1)} km/h</div>
        <div className="k">Ascent</div>
        <div className="v">{Math.round(track.totals.ascentM)} m</div>
        {track.totals.avgHr !== undefined && (
          <>
            <div className="k">Avg HR</div>
            <div className="v">{Math.round(track.totals.avgHr)} bpm</div>
          </>
        )}
        {track.totals.avgCad !== undefined && (
          <>
            <div className="k">Avg cadence</div>
            <div className="v">{Math.round(track.totals.avgCad)} rpm</div>
          </>
        )}
        {track.totals.avgPower !== undefined && (
          <>
            <div className="k">Avg power</div>
            <div className="v">{Math.round(track.totals.avgPower)} W</div>
          </>
        )}
        {track.totals.normalizedPower !== undefined && (
          <>
            <div className="k">NP</div>
            <div className="v">{Math.round(track.totals.normalizedPower)} W</div>
          </>
        )}
        {track.totals.maxPower !== undefined && (
          <>
            <div className="k">Max power</div>
            <div className="v">{Math.round(track.totals.maxPower)} W</div>
          </>
        )}
        <div className="k">Climbs ≥500m</div>
        <div className="v">{track.climbs.length}</div>
      </div>
    </div>
  );

  return (
    <div className="panel">
      <h3>Summary</h3>
      <div className="summary-grid">
        {card("a", trackA)}
        {card("b", trackB)}
      </div>
    </div>
  );
}

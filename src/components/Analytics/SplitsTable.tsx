import { useStore } from "../../store";
import type { Track } from "../../gpx/analyze";

function fmtDur(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function avgPowerBetweenKm(track: Track, fromKm: number, toKm: number): number | null {
  const fromM = fromKm * 1000;
  const toM = toKm * 1000;
  const pts = track.points.filter((p) => p.distFromStart >= fromM && p.distFromStart <= toM && p.power !== undefined);
  if (pts.length === 0) return null;
  return pts.reduce((s, p) => s + p.power!, 0) / pts.length;
}

function elapsedAtKm(track: Track, targetKm: number): number | null {
  const targetM = targetKm * 1000;
  if (targetM > track.totals.distanceM + 50) return null;
  // binary search
  const pts = track.points;
  let lo = 0, hi = pts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].distFromStart < targetM) lo = mid + 1;
    else hi = mid;
  }
  return pts[lo].elapsedSec;
}

export function SplitsTable() {
  const trackA = useStore((s) => s.trackA);
  const trackB = useStore((s) => s.trackB);
  const offsetSec = useStore((s) => s.offsetSec);
  const segmentM = useStore((s) => s.segmentM);
  if (!trackA || !trackB) return null;

  const segStartKm = segmentM ? segmentM.start / 1000 : 0;
  const segEndKm = segmentM
    ? segmentM.end / 1000
    : Math.min(trackA.totals.distanceM, trackB.totals.distanceM) / 1000;
  const limitKm = segEndKm;
  const splitKm = segmentM ? Math.max(1, Math.round((segEndKm - segStartKm) / 5)) : 10;

  const boundaries: number[] = [];
  for (let k = segStartKm + splitKm; k <= Math.floor(limitKm * 10) / 10; k += splitKm) {
    boundaries.push(Math.round(k * 10) / 10);
  }
  const lastFull = boundaries.length > 0 ? boundaries[boundaries.length - 1] : segStartKm;
  if (limitKm - lastFull > 0.1) boundaries.push(limitKm);

  const rows = boundaries.map((km, i) => {
    const prevKm = i === 0 ? segStartKm : boundaries[i - 1];
    const aEndElapsed = elapsedAtKm(trackA, km) ?? 0;
    const bEndElapsed = elapsedAtKm(trackB, km) ?? 0;
    const aPrevElapsed = elapsedAtKm(trackA, prevKm) ?? 0;
    const bPrevElapsed = elapsedAtKm(trackB, prevKm) ?? 0;
    const aDurReal = aEndElapsed - aPrevElapsed;
    const bDurReal = bEndElapsed - bPrevElapsed;
    const segKm = km - prevKm;

    // On the first row only, subtract the head-start wait from the rider who started earlier.
    //   offsetSec > 0 → B started after A, so A had the head start; cut it from A's first split.
    //   offsetSec < 0 → A started after B; cut it from B's first split.
    let aDur = aDurReal;
    let bDur = bDurReal;
    if (i === 0) {
      if (offsetSec > 0) aDur = Math.max(0, aDurReal - offsetSec);
      else if (offsetSec < 0) bDur = Math.max(0, bDurReal + offsetSec);
    }

    return {
      km,
      aDur,
      bDur,
      aSpd: aDurReal > 0 ? (segKm / aDurReal) * 3600 : 0,
      bSpd: bDurReal > 0 ? (segKm / bDurReal) * 3600 : 0,
      aPwr: avgPowerBetweenKm(trackA, prevKm, km),
      bPwr: avgPowerBetweenKm(trackB, prevKm, km),
      delta: bEndElapsed + offsetSec - aEndElapsed,
    };
  });

  const hasPower = rows.some((r) => r.aPwr !== null || r.bPwr !== null);

  return (
    <div className="panel">
      <h3>{segmentM ? `${splitKm} km splits · segment` : "10 km splits"}</h3>
      <table className="splits-table">
        <thead>
          <tr>
            <th>km</th>
            <th>{trackA.rider.slice(0, 10)}</th>
            <th>{trackB.rider.slice(0, 10)}</th>
            <th>Δ overall</th>
            {hasPower && <th>Δ W</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.km}>
              <td>{Number.isInteger(r.km) ? r.km.toFixed(0) : r.km.toFixed(1)}</td>
              <td>
                {fmtDur(r.aDur)}
                <br />
                <span style={{ color: "var(--fg-dim)", fontSize: 11 }}>{r.aSpd.toFixed(1)} km/h</span>
                {hasPower && r.aPwr !== null && <><br /><span style={{ color: "var(--fg-dim)", fontSize: 11 }}>{Math.round(r.aPwr)} W</span></>}
              </td>
              <td>
                {fmtDur(r.bDur)}
                <br />
                <span style={{ color: "var(--fg-dim)", fontSize: 11 }}>{r.bSpd.toFixed(1)} km/h</span>
                {hasPower && r.bPwr !== null && <><br /><span style={{ color: "var(--fg-dim)", fontSize: 11 }}>{Math.round(r.bPwr)} W</span></>}
              </td>
              <td className={r.delta > 0 ? "delta-pos" : r.delta < 0 ? "delta-neg" : ""}>
                {r.delta === 0 ? "—" : `${r.delta > 0 ? "+" : "−"}${fmtDur(Math.abs(r.delta))}`}
              </td>
              {hasPower && (() => {
                const diff = r.aPwr !== null && r.bPwr !== null ? Math.round(r.aPwr - r.bPwr) : null;
                return (
                  <td className={diff !== null && diff > 0 ? "delta-pos" : diff !== null && diff < 0 ? "delta-neg" : ""}>
                    {diff === null ? "—" : diff === 0 ? "0 W" : `${diff > 0 ? "+" : ""}${diff} W`}
                  </td>
                );
              })()}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 11, color: "var(--fg-dim)", marginTop: 6 }}>
        Δ uses the shared clock (playback offset applied). Positive = {trackA.rider.slice(0, 10)} ahead.
      </div>
    </div>
  );
}

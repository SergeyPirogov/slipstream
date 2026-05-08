import { useMemo } from "react";
import { useStore, useMaxValue } from "../../store";
import { buildSyncArrays, positionAtValue, queryValues } from "../../gpx/align";
import { RiderNameEditor } from "../RiderNameEditor";

function fmtHMS(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function LiveStatsPanel() {
  const trackA = useStore((s) => s.trackA);
  const trackB = useStore((s) => s.trackB);
  const syncMode = useStore((s) => s.syncMode);
  const progress = useStore((s) => s.progress);
  const offsetSec = useStore((s) => s.offsetSec);
  const maxValue = useMaxValue();

  const syncA = useMemo(() => (trackA ? buildSyncArrays(trackA) : null), [trackA]);
  const syncB = useMemo(() => (trackB ? buildSyncArrays(trackB) : null), [trackB]);

  if (!trackA || !trackB || !syncA || !syncB) return null;

  const target = progress * maxValue;
  const arrA = syncMode === "time" ? syncA.time : syncA.distance;
  const arrB = syncMode === "time" ? syncB.time : syncB.distance;
  const { aValue, bValue } = queryValues(
    target, syncMode, arrA[arrA.length - 1], arrB[arrB.length - 1], offsetSec,
  );
  const posA = positionAtValue(trackA, arrA, aValue);
  const posB = positionAtValue(trackB, arrB, bValue);

  const refDist = Math.max(0, Math.min(
    posA.distFromStart, posB.distFromStart,
    syncA.distance[syncA.distance.length - 1],
    syncB.distance[syncB.distance.length - 1],
  ));
  const dPosA = positionAtValue(trackA, syncA.distance, refDist);
  const dPosB = positionAtValue(trackB, syncB.distance, refDist);
  const timeDelta = (dPosB.elapsedSec + offsetSec) - dPosA.elapsedSec;
  const timeDeltaZero = Math.abs(timeDelta) < 0.5;
  const distDelta = posA.distFromStart - posB.distFromStart;

  type Row = { label: string; a: string; b: string; deltaA?: "pos" | "neg" };

  const rows: Row[] = [
    { label: "Speed", a: `${posA.speedKmh.toFixed(1)} km/h`, b: `${posB.speedKmh.toFixed(1)} km/h`,
      deltaA: posA.speedKmh > posB.speedKmh ? "pos" : posA.speedKmh < posB.speedKmh ? "neg" : undefined },
    { label: "Distance", a: `${(posA.distFromStart / 1000).toFixed(2)} km`, b: `${(posB.distFromStart / 1000).toFixed(2)} km`,
      deltaA: posA.distFromStart > posB.distFromStart ? "pos" : posA.distFromStart < posB.distFromStart ? "neg" : undefined },
    { label: "Elapsed", a: fmtHMS(posA.elapsedSec), b: fmtHMS(posB.elapsedSec) },
    { label: "Elevation", a: `${Math.round(posA.ele)} m`, b: `${Math.round(posB.ele)} m` },
  ];

  if (posA.hr !== undefined || posB.hr !== undefined) {
    rows.push({ label: "HR",
      a: posA.hr !== undefined ? `${Math.round(posA.hr)} bpm` : "—",
      b: posB.hr !== undefined ? `${Math.round(posB.hr)} bpm` : "—",
    });
  }
  if (posA.cad !== undefined || posB.cad !== undefined) {
    rows.push({ label: "Cadence",
      a: posA.cad !== undefined ? `${Math.round(posA.cad)} rpm` : "—",
      b: posB.cad !== undefined ? `${Math.round(posB.cad)} rpm` : "—",
    });
  }
  if (posA.power !== undefined || posB.power !== undefined) {
    const aW = posA.power !== undefined ? Math.round(posA.power3s ?? posA.power) : null;
    const bW = posB.power !== undefined ? Math.round(posB.power3s ?? posB.power) : null;
    rows.push({ label: "Power (3s)",
      a: aW !== null ? `${aW} W` : "—",
      b: bW !== null ? `${bW} W` : "—",
      deltaA: aW !== null && bW !== null ? (aW > bW ? "pos" : aW < bW ? "neg" : undefined) : undefined,
    });
  }

  return (
    <div className="panel">
      <h3><span className="rec-dot" aria-hidden="true" />Live</h3>
      <table className="summary-table">
        <thead>
          <tr>
            <th />
            <th style={{ color: "var(--a)" }}><RiderNameEditor slot="A" /></th>
            <th style={{ color: "var(--b)" }}><RiderNameEditor slot="B" /></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td className="summary-label">{r.label}</td>
              <td className={r.deltaA === "pos" ? "delta-pos" : r.deltaA === "neg" ? "delta-neg" : ""}>{r.a}</td>
              <td className={r.deltaA === "pos" ? "delta-neg" : r.deltaA === "neg" ? "delta-pos" : ""}>{r.b}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="live-delta">
        <div>
          <span className="k">Δ distance</span>
          <span className={`v ${distDelta > 0 ? "delta-pos" : distDelta < 0 ? "delta-neg" : ""}`}>
            {distDelta === 0 ? "—" : `${distDelta > 0 ? "+" : "−"}${(Math.abs(distDelta) / 1000).toFixed(2)} km`}
          </span>
        </div>
        <div>
          <span className="k">Δ time</span>
          <span className={`v ${timeDeltaZero ? "" : timeDelta > 0 ? "delta-pos" : "delta-neg"}`}>
            {timeDeltaZero ? "0s" : `${timeDelta > 0 ? "+" : "−"}${fmtHMS(Math.abs(timeDelta))}`}
          </span>
        </div>
      </div>
      <div className="live-ahead" style={{ color: timeDeltaZero ? "var(--fg-dim)" : timeDelta > 0 ? "var(--a)" : "var(--b)" }}>
        {timeDeltaZero ? "Even" : `${timeDelta > 0 ? trackA.rider : trackB.rider} is ahead`}
      </div>
    </div>
  );
}

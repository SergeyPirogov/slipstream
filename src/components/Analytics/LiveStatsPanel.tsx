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
    target,
    syncMode,
    arrA[arrA.length - 1],
    arrB[arrB.length - 1],
    offsetSec,
  );
  const posA = positionAtValue(trackA, arrA, aValue);
  const posB = positionAtValue(trackB, arrB, bValue);

  // Δ time at same distance (ghost-race style, regardless of sync mode).
  // Reference distance = the distance where both riders have data, i.e. min of their current distances.
  // At that distance, compare each rider's shared-clock time.
  //   A shared-clock time = A's elapsed when they reached that distance
  //   B shared-clock time = B's elapsed when they reached that distance + offsetSec
  // Positive → A reached first (A ahead).
  const refDist = Math.max(
    0,
    Math.min(
      posA.distFromStart,
      posB.distFromStart,
      syncA.distance[syncA.distance.length - 1],
      syncB.distance[syncB.distance.length - 1],
    ),
  );
  const dPosA = positionAtValue(trackA, syncA.distance, refDist);
  const dPosB = positionAtValue(trackB, syncB.distance, refDist);
  const aShared = dPosA.elapsedSec;
  const bShared = dPosB.elapsedSec + offsetSec;
  const timeDelta = bShared - aShared;
  const timeDeltaZero = Math.abs(timeDelta) < 0.5;

  // Distance delta: A minus B (positive → A is further along the route).
  const distDelta = posA.distFromStart - posB.distFromStart;

  const card = (
    slot: "a" | "b",
    pos: typeof posA,
    track: NonNullable<typeof trackA>,
  ) => (
    <div className={`summary-card ${slot}`}>
      <div className="rider">
        <RiderNameEditor slot={slot === "a" ? "A" : "B"} />
      </div>
      <div className="rows">
        <div className="k">Speed</div>
        <div className="v">{pos.speedKmh.toFixed(1)} km/h</div>
        <div className="k">Distance</div>
        <div className="v">{(pos.distFromStart / 1000).toFixed(2)} km</div>
        <div className="k">Elapsed</div>
        <div className="v">{fmtHMS(pos.elapsedSec)}</div>
        <div className="k">Elevation</div>
        <div className="v">{Math.round(pos.ele)} m</div>
        {pos.hr !== undefined && (
          <>
            <div className="k">HR</div>
            <div className="v">{Math.round(pos.hr)} bpm</div>
          </>
        )}
        {pos.cad !== undefined && (
          <>
            <div className="k">Cadence</div>
            <div className="v">{Math.round(pos.cad)} rpm</div>
          </>
        )}
        {pos.power !== undefined && (
          <>
            <div className="k">Power (3s)</div>
            <div className="v">{Math.round(pos.power3s ?? pos.power)} W</div>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="panel">
      <h3><span className="rec-dot" aria-hidden="true" />Live</h3>
      <div className="summary-grid">
        {card("a", posA, trackA)}
        {card("b", posB, trackB)}
      </div>
      <div className="live-delta">
        <div>
          <span className="k">Δ distance</span>
          <span className={`v ${distDelta > 0 ? "delta-pos" : distDelta < 0 ? "delta-neg" : ""}`}>
            {distDelta === 0
              ? "—"
              : `${distDelta > 0 ? "+" : "−"}${(Math.abs(distDelta) / 1000).toFixed(2)} km`}
          </span>
        </div>
        <div>
          <span className="k">Δ time</span>
          <span className={`v ${timeDeltaZero ? "" : timeDelta > 0 ? "delta-pos" : "delta-neg"}`}>
            {timeDeltaZero
              ? "0s"
              : `${timeDelta > 0 ? "+" : "−"}${fmtHMS(Math.abs(timeDelta))}`}
          </span>
        </div>
      </div>
      <div
        className="live-ahead"
        style={{
          color: timeDeltaZero
            ? "var(--fg-dim)"
            : timeDelta > 0
              ? "var(--a)"
              : "var(--b)",
        }}
      >
        {timeDeltaZero
          ? "Even"
          : `${timeDelta > 0 ? trackA.rider : trackB.rider} is ahead`}
      </div>
    </div>
  );
}

import { useMemo } from "react";
import { useStore, useMaxValue } from "../../store";
import { buildSeriesByDistance, TwoSeriesLineChart } from "./chartHelpers";

export function SpeedChart() {
  const trackA = useStore((s) => s.trackA);
  const trackB = useStore((s) => s.trackB);
  const syncMode = useStore((s) => s.syncMode);
  const progress = useStore((s) => s.progress);
  const segmentM = useStore((s) => s.segmentM);
  const maxValue = useMaxValue();

  const data = useMemo(
    () => buildSeriesByDistance(trackA, trackB, (i, t) => t.points[i].speedKmh, 600, segmentM),
    [trackA, trackB, segmentM],
  );

  if (!trackA || !trackB) return null;

  // Cursor expressed in km
  let cursorKm: number | undefined;
  if (syncMode === "distance") {
    cursorKm = (progress * maxValue) / 1000;
  } else {
    // time-sync: show rider A's distance at the current elapsed time
    const elapsed = progress * maxValue;
    const idx = trackA.points.findIndex((p) => p.elapsedSec >= elapsed);
    if (idx >= 0) cursorKm = trackA.points[idx].distFromStart / 1000;
  }

  return (
    <div className="panel">
      <h3>Speed (km/h)</h3>
      <TwoSeriesLineChart
        data={data}
        cursorKm={cursorKm}
        yLabel="Speed"
        yUnit="km/h"
        riderA={trackA.rider}
        riderB={trackB.rider}
        segmentM={segmentM}
      />
    </div>
  );
}

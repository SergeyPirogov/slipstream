import { useMemo } from "react";
import { useStore, useMaxValue } from "../../store";
import { buildSeriesByDistance, TwoSeriesLineChart } from "./chartHelpers";

export function PowerChart() {
  const trackA = useStore((s) => s.trackA);
  const trackB = useStore((s) => s.trackB);
  const syncMode = useStore((s) => s.syncMode);
  const progress = useStore((s) => s.progress);
  const segmentM = useStore((s) => s.segmentM);
  const maxValue = useMaxValue();

  const data = useMemo(
    () => buildSeriesByDistance(trackA, trackB, (i, t) => t.points[i].power, 600, segmentM),
    [trackA, trackB, segmentM],
  );

  if (!trackA || !trackB) return null;
  const hasPower = data.some((d) => d.a !== undefined || d.b !== undefined);
  if (!hasPower) return null;

  let cursorKm: number | undefined;
  if (syncMode === "distance") cursorKm = (progress * maxValue) / 1000;
  else {
    const elapsed = progress * maxValue;
    const idx = trackA.points.findIndex((p) => p.elapsedSec >= elapsed);
    if (idx >= 0) cursorKm = trackA.points[idx].distFromStart / 1000;
  }

  return (
    <div className="panel">
      <h3>Power (W)</h3>
      <TwoSeriesLineChart
        data={data}
        cursorKm={cursorKm}
        yLabel="Power"
        yUnit="W"
        riderA={trackA.rider}
        riderB={trackB.rider}
        segmentM={segmentM}
      />
    </div>
  );
}

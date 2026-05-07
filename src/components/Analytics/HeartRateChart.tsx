import { useMemo } from "react";
import { useStore, useMaxValue } from "../../store";
import { buildSeriesByDistance, TwoSeriesLineChart } from "./chartHelpers";

export function HeartRateChart() {
  const trackA = useStore((s) => s.trackA);
  const trackB = useStore((s) => s.trackB);
  const syncMode = useStore((s) => s.syncMode);
  const progress = useStore((s) => s.progress);
  const segmentM = useStore((s) => s.segmentM);
  const maxValue = useMaxValue();

  const hrData = useMemo(
    () => buildSeriesByDistance(trackA, trackB, (i, t) => t.points[i].hr, 600, segmentM),
    [trackA, trackB, segmentM],
  );
  const cadData = useMemo(
    () => buildSeriesByDistance(trackA, trackB, (i, t) => t.points[i].cad, 600, segmentM),
    [trackA, trackB, segmentM],
  );

  if (!trackA || !trackB) return null;

  const hasHr = hrData.some((d) => d.a !== undefined || d.b !== undefined);
  const hasCad = cadData.some((d) => d.a !== undefined || d.b !== undefined);

  let cursorKm: number | undefined;
  if (syncMode === "distance") cursorKm = (progress * maxValue) / 1000;
  else {
    const elapsed = progress * maxValue;
    const idx = trackA.points.findIndex((p) => p.elapsedSec >= elapsed);
    if (idx >= 0) cursorKm = trackA.points[idx].distFromStart / 1000;
  }

  return (
    <>
      {hasHr && (
        <div className="panel">
          <h3>Heart rate (bpm)</h3>
          <TwoSeriesLineChart
            data={hrData}
            cursorKm={cursorKm}
            yLabel="HR"
            yUnit="bpm"
            riderA={trackA.rider}
            riderB={trackB.rider}
            segmentM={segmentM}
          />
        </div>
      )}
      {hasCad && (
        <div className="panel">
          <h3>Cadence (rpm)</h3>
          <TwoSeriesLineChart
            data={cadData}
            cursorKm={cursorKm}
            yLabel="Cad"
            yUnit="rpm"
            riderA={trackA.rider}
            riderB={trackB.rider}
            segmentM={segmentM}
          />
        </div>
      )}
    </>
  );
}

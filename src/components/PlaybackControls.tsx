import { useEffect, useMemo, useRef } from "react";
import { useStore, useMaxValue } from "../store";
import { buildSyncArrays, positionAtValue, queryValues } from "../gpx/align";

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatKm(m: number): string {
  return `${(m / 1000).toFixed(2)} km`;
}

export function PlaybackControls() {
  const trackA = useStore((s) => s.trackA);
  const trackB = useStore((s) => s.trackB);
  const playing = useStore((s) => s.playing);
  const speed = useStore((s) => s.speed);
  const progress = useStore((s) => s.progress);
  const syncMode = useStore((s) => s.syncMode);
  const offsetSec = useStore((s) => s.offsetSec);
  const togglePlay = useStore((s) => s.togglePlay);
  const setSpeed = useStore((s) => s.setSpeed);
  const setProgress = useStore((s) => s.setProgress);
  const setSyncMode = useStore((s) => s.setSyncMode);
  const setPlaying = useStore((s) => s.setPlaying);
  const maxValue = useMaxValue();

  const progressRef = useRef(progress);
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    if (!playing || !trackA || !trackB) return;
    let raf = 0;
    let last = performance.now();
    const refSeconds =
      syncMode === "time"
        ? maxValue
        : maxValue /
          ((Math.min(trackA.totals.avgSpeedKmh, trackB.totals.avgSpeedKmh) || 20) * (1000 / 3600));
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const dp = (dt * speed) / Math.max(1, refSeconds);
      const next = Math.min(1, progressRef.current + dp);
      progressRef.current = next;
      setProgress(next);
      if (next < 1) raf = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, syncMode, maxValue, trackA, trackB, setProgress, setPlaying]);

  const disabled = !trackA || !trackB;

  const syncA = useMemo(() => (trackA ? buildSyncArrays(trackA) : null), [trackA]);
  const syncB = useMemo(() => (trackB ? buildSyncArrays(trackB) : null), [trackB]);

  // Build the time + distance readout. In time-sync mode "time" is the shared-clock value
  // and "distance" is the leading rider's distance at that moment; in distance-sync it's the reverse.
  let timeLabel = "—";
  let distLabel = "—";
  const tickFractions: { frac: number; km: number }[] = [];
  if (trackA && trackB && syncA && syncB) {
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
    if (syncMode === "time") {
      timeLabel = formatTime(target);
      distLabel = formatKm(Math.max(posA.distFromStart, posB.distFromStart));
    } else {
      distLabel = formatKm(target);
      // Use the faster rider's elapsed (whoever reached that km first) on the shared clock.
      const aSharedT = posA.elapsedSec;
      const bSharedT = posB.elapsedSec + offsetSec;
      timeLabel = formatTime(Math.min(aSharedT, bSharedT));
    }

    // 10 km tick positions, expressed as fractions of the slider range (0..1).
    const maxDistM = Math.max(trackA.totals.distanceM, trackB.totals.distanceM);
    for (let km = 10; km * 1000 <= maxDistM; km += 10) {
      const m = km * 1000;
      let frac: number;
      if (syncMode === "distance") {
        frac = m / maxValue;
      } else {
        // Map this distance back to shared-clock time using whichever rider reaches it first.
        const aIdx = syncA.distance.findIndex((d) => d >= m);
        const bIdx = syncB.distance.findIndex((d) => d >= m);
        const aT = aIdx >= 0 ? trackA.points[aIdx].elapsedSec : Infinity;
        const bT = bIdx >= 0 ? trackB.points[bIdx].elapsedSec + offsetSec : Infinity;
        const t = Math.min(aT, bT);
        if (!Number.isFinite(t)) continue;
        frac = t / maxValue;
      }
      if (frac > 0 && frac < 1) tickFractions.push({ frac, km });
    }
  }

  return (
    <div className="controls">
      <button className="primary" disabled={disabled} onClick={togglePlay}>
        {playing ? "⏸ Pause" : "▶ Play"}
      </button>
      <button disabled={disabled} onClick={() => setProgress(0)}>↺ Reset</button>

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ color: "var(--fg-dim)", fontSize: 12 }}>Speed</span>
        <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
          <option value={1}>1×</option>
          <option value={5}>5×</option>
          <option value={10}>10×</option>
          <option value={50}>50×</option>
          <option value={100}>100×</option>
          <option value={250}>250×</option>
          <option value={500}>500×</option>
        </select>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ color: "var(--fg-dim)", fontSize: 12 }}>Sync</span>
        <select
          value={syncMode}
          onChange={(e) => setSyncMode(e.target.value as "time" | "distance")}
        >
          <option value="distance">Ghost race (distance)</option>
          <option value="time">Real time</option>
        </select>
      </div>

      <div className="scrub-wrap">
        <input
          className="scrub"
          type="range"
          min={0}
          max={1000}
          value={Math.round(progress * 1000)}
          disabled={disabled}
          onChange={(e) => {
            setPlaying(false);
            setProgress(Number(e.target.value) / 1000);
          }}
        />
        {tickFractions.length > 0 && (
          <div className="scrub-ticks">
            {tickFractions.map((t) => (
              <div
                key={t.km}
                className={`scrub-tick ${t.km % 50 === 0 ? "major" : ""}`}
                style={{ left: `${(t.frac * 100).toFixed(3)}%` }}
                title={`${t.km} km`}
              >
                {t.km % 50 === 0 && <span className="scrub-tick-label">{t.km}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <span
        style={{
          fontVariantNumeric: "tabular-nums",
          minWidth: 150,
          textAlign: "right",
          color: "var(--fg-dim)",
          display: "inline-flex",
          gap: 8,
          justifyContent: "flex-end",
        }}
      >
        <span>{timeLabel}</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span>{distLabel}</span>
      </span>
    </div>
  );
}

import { useEffect, useMemo, useRef } from "react";
import { useStore, useMaxValue, useSegmentBounds } from "../store";
import { buildSyncArrays, positionAtValue, queryValues } from "../gpx/align";

const SPEED_PRESETS = [1, 5, 10, 50, 100, 250, 500];

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
  const setPlaying = useStore((s) => s.setPlaying);
  const maxValue = useMaxValue();
  const segBounds = useSegmentBounds();

  const progressRef = useRef(progress);
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    if (!playing || !trackA) return;
    let raf = 0;
    let last = performance.now();
    const refSeconds =
      syncMode === "time"
        ? maxValue
        : maxValue /
          ((Math.min(trackA.totals.avgSpeedKmh, trackB?.totals.avgSpeedKmh ?? trackA.totals.avgSpeedKmh) || 20) * (1000 / 3600));
    const ceiling = segBounds ? segBounds.endFrac : 1;
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const dp = (dt * speed) / Math.max(1, refSeconds);
      const next = Math.min(ceiling, progressRef.current + dp);
      progressRef.current = next;
      setProgress(next);
      if (next < ceiling) raf = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, syncMode, maxValue, trackA, trackB?.totals.avgSpeedKmh, setProgress, setPlaying]);

  // Keyboard shortcuts: + / - to cycle speed presets.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        const idx = SPEED_PRESETS.indexOf(speed);
        const next = SPEED_PRESETS[Math.min(SPEED_PRESETS.length - 1, idx + 1)];
        setSpeed(next);
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        const idx = SPEED_PRESETS.indexOf(speed);
        const next = SPEED_PRESETS[Math.max(0, idx - 1)];
        setSpeed(next);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [speed, setSpeed]);

  const disabled = !trackA;

  const syncA = useMemo(() => (trackA ? buildSyncArrays(trackA) : null), [trackA]);
  const syncB = useMemo(() => (trackB ? buildSyncArrays(trackB) : null), [trackB]);

  let timeLabel = "—";
  let distLabel = "—";
  if (trackA && syncA) {
    const target = progress * maxValue;
    const arrA = syncMode === "time" ? syncA.time : syncA.distance;
    if (trackB && syncB) {
      const arrB = syncMode === "time" ? syncB.time : syncB.distance;
      const { aValue, bValue } = queryValues(
        target, syncMode, arrA[arrA.length - 1], arrB[arrB.length - 1], offsetSec,
      );
      const posA = positionAtValue(trackA, arrA, aValue);
      const posB = positionAtValue(trackB, arrB, bValue);
      if (syncMode === "time") {
        timeLabel = formatTime(target);
        distLabel = formatKm(Math.max(posA.distFromStart, posB.distFromStart));
      } else {
        distLabel = formatKm(target);
        timeLabel = formatTime(Math.min(posA.elapsedSec, posB.elapsedSec + offsetSec));
      }
    } else {
      const posA = positionAtValue(trackA, arrA, target);
      if (syncMode === "time") {
        timeLabel = formatTime(target);
        distLabel = formatKm(posA.distFromStart);
      } else {
        distLabel = formatKm(target);
        timeLabel = formatTime(posA.elapsedSec);
      }
    }
  }

  return (
    <div className="controls">
      <button className={`primary ${playing ? "is-pause" : "is-play"}`} disabled={disabled} onClick={togglePlay}>
        {playing ? "⏸ Pause" : "▶ Play"}
      </button>
      <button disabled={disabled} onClick={() => setProgress(segBounds ? segBounds.startFrac : 0)}>↺ Reset</button>

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ color: "var(--fg-dim)", fontSize: 12 }}>Speed</span>
        <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
          {SPEED_PRESETS.map((v) => (
            <option key={v} value={v}>{v}×</option>
          ))}
        </select>
      </div>

      <div className="scrub-wrap">
        <input
          className="scrub"
          type="range"
          min={segBounds ? Math.round(segBounds.startFrac * 1000) : 0}
          max={segBounds ? Math.round(segBounds.endFrac * 1000) : 1000}
          value={Math.round(progress * 1000)}
          disabled={disabled}
          onChange={(e) => {
            setPlaying(false);
            setProgress(Number(e.target.value) / 1000);
          }}
        />
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

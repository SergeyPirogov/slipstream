import { useState } from "react";
import { useStore } from "../store";
import { RiderNameEditor } from "./RiderNameEditor";

function fmtSigned(sec: number): string {
  if (sec === 0) return "0s";
  const sign = sec > 0 ? "+" : "−";
  const abs = Math.abs(sec);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  if (h > 0) return `${sign}${h}h ${m}m ${s}s`;
  if (m > 0) return `${sign}${m}m ${s}s`;
  return `${sign}${s}s`;
}

const TZ_OPTIONS: { label: string; value: number }[] = [
  { label: "UTC (0)", value: 0 },
  { label: "UTC+1", value: 1 },
  { label: "UTC+2", value: 2 },
  { label: "UTC+3 (Kyiv EEST)", value: 3 },
  { label: "UTC+4", value: 4 },
  { label: "UTC+5", value: 5 },
  { label: "UTC+5:30", value: 5.5 },
  { label: "UTC+6", value: 6 },
  { label: "UTC+7", value: 7 },
  { label: "UTC+8", value: 8 },
  { label: "UTC+9", value: 9 },
  { label: "UTC+10", value: 10 },
  { label: "UTC+11", value: 11 },
  { label: "UTC+12", value: 12 },
  { label: "UTC−1", value: -1 },
  { label: "UTC−2", value: -2 },
  { label: "UTC−3", value: -3 },
  { label: "UTC−4", value: -4 },
  { label: "UTC−5", value: -5 },
  { label: "UTC−6", value: -6 },
  { label: "UTC−7", value: -7 },
  { label: "UTC−8", value: -8 },
  { label: "UTC−9", value: -9 },
  { label: "UTC−10", value: -10 },
  { label: "UTC−11", value: -11 },
  { label: "UTC−12", value: -12 },
];
TZ_OPTIONS.sort((a, b) => a.value - b.value);

export function OffsetControl() {
  const trackA = useStore((s) => s.trackA);
  const trackB = useStore((s) => s.trackB);
  const syncMode = useStore((s) => s.syncMode);
  const offsetSec = useStore((s) => s.offsetSec);
  const setOffsetSec = useStore((s) => s.setOffsetSec);
  const autoDetectOffset = useStore((s) => s.autoDetectOffset);
  const setTzOffsetHours = useStore((s) => s.setTzOffsetHours);
  const trimHeadStart = useStore((s) => s.trimHeadStart);
  const trimHeadStartByDistance = useStore((s) => s.trimHeadStartByDistance);
  const [trimDistA, setTrimDistA] = useState(0);
  const [trimDistB, setTrimDistB] = useState(0);

  if (!trackA || !trackB) return null;

  const startA = trackA.points[0].t;
  const startB = trackB.points[0].t;
  const realGap = Math.round((startB.getTime() - startA.getTime()) / 1000);

  const disabled = false;

  const tzRow = (slot: "A" | "B", track: NonNullable<typeof trackA>) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, flexWrap: "wrap" }}>
      <span
        className="dot"
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: 4,
          background: slot === "A" ? "var(--a)" : "var(--b)",
        }}
      />
      <span style={{ color: "var(--fg)", minWidth: 90, maxWidth: 160 }}>
        <RiderNameEditor slot={slot} />
      </span>
      <select
        value={track.tzOffsetHours}
        onChange={(e) => setTzOffsetHours(slot, Number(e.target.value))}
      >
        {TZ_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <span style={{ color: "var(--fg-dim)", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
        {track.points[0].t.toISOString().replace("T", " ").slice(0, 19)}Z
      </span>
    </div>
  );

  return (
    <div className="panel">
      <h3>Time alignment</h3>

      <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: "var(--fg-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Per-rider TZ shift (fixes head-unit time-zone metadata)
        </div>
        {tzRow("A", trackA)}
        {tzRow("B", trackB)}
        <div style={{ fontSize: 11, color: "var(--fg-dim)" }}>
          Set each rider's TZ to match their head unit. Use "Use real gap" once the times align.
        </div>
      </div>

      <div style={{ fontSize: 12, color: "var(--fg-dim)", marginBottom: 8, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
          Playback offset
        </div>
        <div>Adjusted A start: {startA.toISOString().replace("T", " ").replace(".000Z", " UTC")}</div>
        <div>Adjusted B start: {startB.toISOString().replace("T", " ").replace(".000Z", " UTC")}</div>
        <div>Gap: {fmtSigned(realGap)} · current offset: <span style={{ color: "var(--fg)" }}>{fmtSigned(offsetSec)}</span></div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="range"
          min={-7200}
          max={7200}
          step={1}
          value={offsetSec}
          disabled={disabled}
          onChange={(e) => setOffsetSec(Number(e.target.value))}
          style={{ flex: 1 }}
        />
        <input
          type="number"
          value={offsetSec}
          step={1}
          disabled={disabled}
          onChange={(e) => setOffsetSec(Number(e.target.value))}
          style={{
            width: 90,
            background: "var(--bg-elev-2)",
            color: "var(--fg)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "4px 6px",
            fontSize: 12,
            fontVariantNumeric: "tabular-nums",
          }}
        />
        <span style={{ fontSize: 11, color: "var(--fg-dim)" }}>sec</span>
      </div>

      {Math.abs(realGap) > 2 && (
        <div className="offset-action-row">
          <button disabled={disabled} onClick={autoDetectOffset} title="Use the wall-clock gap between adjusted GPX start times">
            Use real gap
          </button>
        </div>
      )}

      {offsetSec !== 0 && (
        <div className="trim-head-row">
          <button
            onClick={trimHeadStart}
            className="trim-head-btn"
            title={`Drop the first ${Math.abs(offsetSec)}s from ${offsetSec > 0 ? "rider A" : "rider B"} so both tracks start at the same moment. Offset resets to 0.`}
          >
            Trim head start ({Math.abs(offsetSec)}s) from {offsetSec > 0 ? "rider A" : "rider B"}
          </button>
          <div className="trim-head-hint">
            Removes the first {Math.abs(offsetSec)}s of {offsetSec > 0 ? "rider A's" : "rider B's"} data so both tracks effectively begin together. Permanent until you re-load the file.
          </div>
        </div>
      )}

      {syncMode === "distance" && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, marginTop: 4 }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-dim)", marginBottom: 8 }}>
            Trim head start by distance
          </div>
          {(["A", "B"] as const).map((slot) => {
            const trimDist = slot === "A" ? trimDistA : trimDistB;
            const setTrimDist = slot === "A" ? setTrimDistA : setTrimDistB;
            const track = slot === "A" ? trackA : trackB;
            const maxDist = Math.round(track.totals.distanceM);
            return (
              <div key={slot} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span className="dot" style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: slot === "A" ? "var(--a)" : "var(--b)", flexShrink: 0 }} />
                <input
                  type="number"
                  min={0}
                  max={maxDist}
                  step={10}
                  value={trimDist}
                  onChange={(e) => setTrimDist(Math.max(0, Number(e.target.value)))}
                  style={{ width: 80, background: "var(--bg-elev-2)", color: "var(--fg)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 6px", fontSize: 12 }}
                />
                <span style={{ fontSize: 11, color: "var(--fg-dim)" }}>m</span>
                <button
                  className="trim-head-btn"
                  disabled={trimDist <= 0}
                  onClick={() => { trimHeadStartByDistance(slot, trimDist); setTrimDist(0); }}
                  title={`Remove first ${trimDist}m from rider ${slot}`}
                >
                  Trim
                </button>
              </div>
            );
          })}
          <div className="trim-head-hint">Cut leading meters from a track so both routes start at the same point.</div>
        </div>
      )}
    </div>
  );
}

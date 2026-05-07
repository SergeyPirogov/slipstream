import { useStore } from "../store";
import { RiderNameEditor } from "./RiderNameEditor";
import { findCommonStart, findCommonEnd } from "../gpx/align";

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

function fmtDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

function fmtTime(iso: Date): string {
  return iso.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

export function OffsetControl({ onContinue }: { onContinue?: () => void } = {}) {
  const trackA = useStore((s) => s.trackA);
  const trackB = useStore((s) => s.trackB);
  const offsetSec = useStore((s) => s.offsetSec);
  const setOffsetSec = useStore((s) => s.setOffsetSec);
  const setTzOffsetHours = useStore((s) => s.setTzOffsetHours);
  const trimHeadStart = useStore((s) => s.trimHeadStart);
  const trimToCommonStart = useStore((s) => s.trimToCommonStart);

  if (!trackA || !trackB) return null;

  const startA = trackA.points[0].t;
  const startB = trackB.points[0].t;
  const realGap = Math.round((startB.getTime() - startA.getTime()) / 1000);

  const commonStart = findCommonStart(trackA, trackB);
  const commonEnd = findCommonEnd(trackA, trackB);

  const absGap = Math.abs(realGap);
  const hoursGuess = Math.round(realGap / 3600);
  const tzNotFixed = absGap >= 1800 && Math.abs(hoursGuess * 3600 - realGap) < 600;

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

  const startInfoSection = (
    <div style={{ fontSize: 12, color: "var(--fg-dim)", marginBottom: 8, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
        Common starting points
      </div>
      {commonStart ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 10px", alignItems: "baseline" }}>
            <span style={{ color: "var(--a)", fontWeight: 600 }}>A</span>
            <span>
              {fmtTime(new Date(startA.getTime() + commonStart.elapsedA * 1000))}
              {commonStart.distA > 10 && <span style={{ color: "var(--fg-dim)" }}> · {fmtDist(commonStart.distA)} from file start</span>}
            </span>
            <span style={{ color: "var(--b)", fontWeight: 600 }}>B</span>
            <span>
              {fmtTime(new Date(startB.getTime() + commonStart.elapsedB * 1000))}
              {commonStart.distB > 10 && <span style={{ color: "var(--fg-dim)" }}> · {fmtDist(commonStart.distB)} from file start</span>}
            </span>
          </div>
          <div style={{ marginTop: 4, color: "var(--fg-dim)", fontSize: 11 }}>
            {Math.round(commonStart.geoDistM)} m apart · gap: {fmtSigned(realGap)} · offset: <span style={{ color: "var(--fg)" }}>{fmtSigned(offsetSec)}</span>
          </div>
          {commonEnd && (commonEnd.tailA > 10 || commonEnd.tailB > 10) && (
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 10px", alignItems: "baseline", marginTop: 8, fontSize: 12, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
              <div style={{ fontSize: 11, color: "var(--fg-dim)", textTransform: "uppercase", letterSpacing: "0.06em", gridColumn: "1 / -1", marginBottom: 2 }}>Common end point</div>
              {commonEnd.tailA > 10 && (
                <>
                  <span style={{ color: "var(--a)", fontWeight: 600 }}>A</span>
                  <span style={{ color: "var(--fg-dim)" }}>trims {fmtDist(commonEnd.tailA)} tail</span>
                </>
              )}
              {commonEnd.tailB > 10 && (
                <>
                  <span style={{ color: "var(--b)", fontWeight: 600 }}>B</span>
                  <span style={{ color: "var(--fg-dim)" }}>trims {fmtDist(commonEnd.tailB)} tail</span>
                </>
              )}
            </div>
          )}
          {(commonStart.distA > 10 || commonStart.distB > 10 || (commonEnd && (commonEnd.tailA > 10 || commonEnd.tailB > 10))) && (
            <button
              className="trim-head-btn"
              style={{ marginTop: 8 }}
              disabled={tzNotFixed}
              onClick={() => { trimToCommonStart(); onContinue?.(); }}
              title={tzNotFixed ? "Fix the timezone mismatch first" : "Trim each track to its common start and end points"}
            >
              Trim to common segment{onContinue ? " & continue" : ""}
            </button>
          )}
        </>
      ) : (
        <>
          <div>A start: {fmtTime(startA)}</div>
          <div>B start: {fmtTime(startB)}</div>
          <div style={{ marginTop: 4, color: "var(--warn, #f59e0b)", fontSize: 11 }}>
            No common start found within first 5 km
          </div>
          <div style={{ marginTop: 2 }}>Gap: {fmtSigned(realGap)} · offset: <span style={{ color: "var(--fg)" }}>{fmtSigned(offsetSec)}</span></div>
        </>
      )}
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

      {startInfoSection}

      {!onContinue && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="range"
              min={-7200}
              max={7200}
              step={1}
              value={offsetSec}
              disabled={false}
              onChange={(e) => setOffsetSec(Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <input
              type="number"
              value={offsetSec}
              step={1}
              disabled={false}
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

          {offsetSec !== 0 && (
            <div className="trim-head-row">
              <button
                onClick={() => trimHeadStart()}
                className="trim-head-btn"
                disabled={tzNotFixed}
                title={tzNotFixed ? "Fix the timezone mismatch first" : `Drop the first ${Math.abs(offsetSec)}s from ${offsetSec > 0 ? "rider A" : "rider B"} so both tracks start at the same moment. Offset resets to 0.`}
              >
                Apply offset ({Math.abs(offsetSec)}s) to {offsetSec > 0 ? "rider A" : "rider B"}
              </button>
              <div className="trim-head-hint">
                Removes the first {Math.abs(offsetSec)}s of {offsetSec > 0 ? "rider A's" : "rider B's"} data so both tracks effectively begin together. Permanent until you re-load the file.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

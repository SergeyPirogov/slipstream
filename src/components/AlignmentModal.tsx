import { useRef } from "react";
import { useStore } from "../store";
import { OffsetControl } from "./OffsetControl";
import { startOffsetSec } from "../gpx/align";

function fmtGap(sec: number): string {
  const abs = Math.abs(sec);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

type Check = { ok: boolean; title: string; detail?: string };

export function AlignmentModal() {
  const trackA = useStore((s) => s.trackA);
  const trackB = useStore((s) => s.trackB);
  const rawA = useStore((s) => s.rawA);
  const rawB = useStore((s) => s.rawB);
  const offsetSec = useStore((s) => s.offsetSec);
  const syncMode = useStore((s) => s.syncMode);
  const alignmentConfirmed = useStore((s) => s.alignmentConfirmed);
  const confirmAlignment = useStore((s) => s.confirmAlignment);
  const setSyncMode = useStore((s) => s.setSyncMode);

  const needsAttentionRef = useRef(false);
  const pairKey = `${rawA?.filename ?? ""}|${rawB?.filename ?? ""}`;
  const lastPairKeyRef = useRef(pairKey);
  if (lastPairKeyRef.current !== pairKey) {
    needsAttentionRef.current = false;
    lastPairKeyRef.current = pairKey;
  }

  if (!trackA || !trackB) return null;
  if (alignmentConfirmed) return null;

  const gap = startOffsetSec(trackA, trackB);
  const absGap = Math.abs(gap);

  // Tracks from different days — gap > 12 hours. Time sync is meaningless;
  // distance mode is the right way to compare the same route on different dates.
  const differentDays = absGap > 12 * 3600;

  const hoursGuess = Math.round(gap / 3600);
  const nearWholeHour = !differentDays && absGap >= 1800 && Math.abs(hoursGuess * 3600 - gap) < 600;

  const checks: Check[] = [];

  if (differentDays) {
    // Show a single informational item — no TZ fix needed, just mode switch.
    checks.push({
      ok: syncMode === "distance",
      title: syncMode === "distance"
        ? "Distance sync active — comparing same route on different dates"
        : `Tracks are from different dates (gap: ${fmtGap(gap)})`,
      detail: syncMode === "distance"
        ? undefined
        : "These look like the same route ridden on different days. Switch to distance sync to compare them properly.",
    });
  } else {
    // TZ sanity check.
    const tzShiftMismatch = trackA.tzOffsetHours !== trackB.tzOffsetHours;
    const anyTzApplied = trackA.tzOffsetHours !== 0 || trackB.tzOffsetHours !== 0;
    const tzOk = !nearWholeHour;

    let tzTitle: string;
    let tzDetail: string | undefined;
    if (nearWholeHour) {
      tzTitle = `Timezones probably differ by ${Math.abs(hoursGuess)}h — likely a head-unit TZ bug`;
      tzDetail = `Set one rider's TZ to UTC${hoursGuess >= 0 ? "+" : ""}${hoursGuess} below so both files read as the same wall clock.`;
    } else if (tzShiftMismatch && anyTzApplied) {
      tzTitle = `Timezones fixed (A: UTC${trackA.tzOffsetHours >= 0 ? "+" : ""}${trackA.tzOffsetHours}, B: UTC${trackB.tzOffsetHours >= 0 ? "+" : ""}${trackB.tzOffsetHours})`;
    } else if (anyTzApplied) {
      tzTitle = "Timezones adjusted";
    } else {
      tzTitle = "Timezones look consistent";
    }
    checks.push({ ok: tzOk, title: tzTitle, detail: tzDetail });

    // Start gap check.
    const gapOk = absGap <= 2;
    checks.push({
      ok: gapOk,
      title: gapOk
        ? "Start times line up"
        : `Start-time gap: ${fmtGap(gap)}${offsetSec !== 0 ? ` (playback offset set: ${fmtGap(offsetSec)})` : ""}`,
      detail: gapOk
        ? undefined
        : nearWholeHour
          ? "Fix the TZ first — the gap should then collapse to seconds."
          : "Click \"Trim head start\" below to cut the earlier rider's lead-in so both tracks begin together.",
    });
  }

  const allGood = checks.every((c) => c.ok);
  const canContinue = allGood || offsetSec !== 0 || (differentDays && syncMode === "distance");
  if (!allGood) needsAttentionRef.current = true;

  if (!needsAttentionRef.current) return null;

  return (
    <div className="alignment-modal-backdrop">
      <div className="alignment-modal">
        <div className="alignment-modal-header">
          <h2>Align tracks</h2>
          <div className="sub">
            {differentDays
              ? "These tracks are from different dates. Use distance sync to compare the same route."
              : "The two files don't line up on a shared clock. Adjust time alignment before comparing — you can refine it later in the sidebar."}
          </div>
          <ul className="alignment-checklist">
            {checks.map((c, i) => (
              <li key={i} className={c.ok ? "ok" : "warn"}>
                <span className="mark">{c.ok ? "✓" : "!"}</span>
                <div>
                  <div className="title">{c.title}</div>
                  {c.detail && <div className="detail">{c.detail}</div>}
                </div>
              </li>
            ))}
          </ul>
        </div>

        {differentDays ? (
          <div style={{ padding: "12px 20px" }}>
            <button
              className="primary"
              style={{ width: "100%" }}
              onClick={() => { setSyncMode("distance"); }}
            >
              Switch to distance sync
            </button>
          </div>
        ) : (
          <OffsetControl />
        )}

        <div className="alignment-modal-actions">
          <button
            className="primary"
            onClick={confirmAlignment}
            disabled={!canContinue}
            title={canContinue ? "Start comparing" : "Switch to distance sync or set a playback offset to continue"}
          >
            Continue
          </button>
          {!allGood && (
            <button onClick={confirmAlignment} title="Skip alignment and continue anyway">
              Skip
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

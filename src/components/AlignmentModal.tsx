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
  const alignmentConfirmed = useStore((s) => s.alignmentConfirmed);
  const confirmAlignment = useStore((s) => s.confirmAlignment);

  // Track whether this pair of tracks ever needed alignment. Once it did, we stay
  // visible (even as the user's fixes flip checks to green) until they click Continue.
  const needsAttentionRef = useRef(false);
  // Key off filenames — stable across trim operations, changes when a new file loads.
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

  // Build checklist items.
  const checks: Check[] = [];

  // Heuristic: a gap close to a whole hour almost always indicates one head unit
  // stored local-as-UTC. Allow up to ±10 min slack so real rider-start differences
  // (a few minutes) don't hide the TZ bug underneath.
  const hoursGuess = Math.round(gap / 3600);
  const nearWholeHour = absGap >= 1800 && Math.abs(hoursGuess * 3600 - gap) < 600;

  // 1) TZ sanity
  const tzShiftMismatch = trackA.tzOffsetHours !== trackB.tzOffsetHours;
  const anyTzApplied = trackA.tzOffsetHours !== 0 || trackB.tzOffsetHours !== 0;
  const tzOk = !nearWholeHour;

  let tzTitle: string;
  let tzDetail: string | undefined;
  if (nearWholeHour) {
    tzTitle = `Timezones probably differ by ${Math.abs(hoursGuess)}h — likely a head-unit TZ bug`;
    tzDetail = `Set one rider's TZ to UTC${hoursGuess >= 0 ? "+" : ""}${hoursGuess} below so both files read as the same wall clock.`;
  } else if (tzShiftMismatch && anyTzApplied) {
    // Shifts differ but gap is small — user has actively aligned them. Green.
    tzTitle = `Timezones fixed (A: UTC${trackA.tzOffsetHours >= 0 ? "+" : ""}${trackA.tzOffsetHours}, B: UTC${trackB.tzOffsetHours >= 0 ? "+" : ""}${trackB.tzOffsetHours})`;
  } else if (anyTzApplied) {
    tzTitle = "Timezones adjusted";
  } else {
    tzTitle = "Timezones look consistent";
  }

  checks.push({ ok: tzOk, title: tzTitle, detail: tzDetail });

  // 2) Start gap — resolved only when the raw file gap is small.
  // Playback offset alone is NOT accepted; the user must either fix TZ (which
  // changes timestamps) or click Trim head start.
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

  const allGood = checks.every((c) => c.ok);
  // Allow continuing if the user has set a manual offset — they've acknowledged
  // the gap and chosen to handle it via playback sync instead of trimming/TZ fix.
  const canContinue = allGood || offsetSec !== 0;
  if (!allGood) needsAttentionRef.current = true;

  // Don't show if checks were never triggered for this pair.
  if (!needsAttentionRef.current) return null;

  return (
    <div className="alignment-modal-backdrop">
      <div className="alignment-modal">
        <div className="alignment-modal-header">
          <h2>Align tracks</h2>
          <div className="sub">
            The two files don't line up on a shared clock. Adjust time alignment before we start comparing — you can refine it later in the sidebar.
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
        <OffsetControl />
        <div className="alignment-modal-actions">
          <button
            className="primary"
            onClick={confirmAlignment}
            disabled={!canContinue}
            title={canContinue ? "Start comparing" : "Set a playback offset or fix the warnings above to continue"}
          >
            Continue
          </button>
          {!allGood && (
            <button
              onClick={confirmAlignment}
              title="Skip alignment and continue anyway"
            >
              Skip
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

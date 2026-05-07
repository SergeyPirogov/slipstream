import { useRef } from "react";
import { useStore } from "../store";
import { OffsetControl } from "./OffsetControl";
import { startOffsetSec, findCommonStart, findCommonEnd } from "../gpx/align";

function fmtDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

function fmtGap(sec: number): string {
  const abs = Math.abs(sec);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

type Check = { ok: boolean; note?: boolean; title: string; detail?: string };

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

  const commonStartScanKm = useStore((s) => s.commonStartScanKm);
  const setCommonStartScanKm = useStore((s) => s.setCommonStartScanKm);

  const gap = trackA && trackB ? startOffsetSec(trackA, trackB) : 0;
  const commonStart = trackA && trackB ? findCommonStart(trackA, trackB, 500, commonStartScanKm * 1000) : null;
  const commonEnd = trackA && trackB ? findCommonEnd(trackA, trackB) : null;


  if (!trackA || !trackB) return null;
  if (alignmentConfirmed) return null;

  const absGap = Math.abs(gap);

  // Build checklist items.
  const checks: Check[] = [];

  // 1) TZ sanity
  const hoursGuess = Math.round(gap / 3600);
  const nearWholeHour = absGap >= 1800 && Math.abs(hoursGuess * 3600 - gap) < 600;
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

  // 2) Common starting point
  if (commonStart) {
    const parts: string[] = [];
    if (commonStart.distA > 10) parts.push(`A skips ${fmtGap(commonStart.elapsedA)}`);
    if (commonStart.distB > 10) parts.push(`B skips ${fmtGap(commonStart.elapsedB)}`);
    checks.push({
      ok: true,
      title: `Common starting point found (${Math.round(commonStart.geoDistM)} m apart)`,
      detail: parts.length > 0 ? parts.join(", ") + " of lead-in" : undefined,
    });
  } else {
    const nextScanKm = commonStartScanKm < 50 ? commonStartScanKm + 20 : null;
    checks.push({
      ok: false,
      title: `No common starting point detected within first ${commonStartScanKm} km`,
      detail: nextScanKm
        ? `__extend_scan_${nextScanKm}__`
        : "Tracks may be on different routes.",
    });
  }

  // 3) Common end point
  if (commonEnd && (commonEnd.tailA > 10 || commonEnd.tailB > 10)) {
    const parts: string[] = [];
    if (commonEnd.tailA > 10) parts.push(`A trims ${fmtDist(commonEnd.tailA)} tail`);
    if (commonEnd.tailB > 10) parts.push(`B trims ${fmtDist(commonEnd.tailB)} tail`);
    checks.push({
      ok: true,
      title: `Common end point found (${Math.round(commonEnd.geoDistM)} m apart)`,
      detail: parts.join(", "),
    });
  }

  // 4) Start gap
  const gapOk = absGap <= 2;
  const gapMatchesOffset = Math.abs(absGap - Math.abs(offsetSec)) <= 2;
  checks.push({
    ok: true,
    note: !gapOk,
    title: gapOk
      ? "Start times line up"
      : `Note: start-time gap ${fmtGap(gap)}${gapMatchesOffset && offsetSec !== 0 ? " — covered by offset" : ""}`,
    detail: gapOk
      ? undefined
      : nearWholeHour
        ? "Fix the TZ first — the gap should then collapse to seconds."
        : undefined,
  });

  const allGood = checks.every((c) => c.ok);
  if (!allGood || commonStart || commonEnd) needsAttentionRef.current = true;

  // Don't show if checks were never triggered for this pair.
  if (!needsAttentionRef.current) return null;

  // Bail-out gates above (!trackA, alignmentConfirmed, !needsAttentionRef) handle
  // the "nothing to see" cases. Once the modal is open, it stays open until Continue.

  return (
    <div className="alignment-modal-backdrop">
      <div className="alignment-modal">
        <div className="alignment-modal-header">
          <h2>Align tracks</h2>
          <div className="sub">
            Review the checks below and fix any issues before comparing. Use the TZ dropdowns to correct head-unit clock offsets, then trim both tracks to the shared segment.
          </div>
          <ul className="alignment-checklist">
            {checks.map((c, i) => (
              <li key={i} className={c.note ? "note" : c.ok ? "ok" : "warn"}>
                <span className="mark">{c.note ? "·" : c.ok ? "✓" : "!"}</span>
                <div>
                  <div className="title">{c.title}</div>
                  {c.detail && (
                    <div className="detail">
                      {c.detail.startsWith("__extend_scan_") ? (() => {
                        const km = Number(c.detail.replace("__extend_scan_", "").replace("__", ""));
                        return (
                          <button
                            onClick={() => setCommonStartScanKm(km)}
                            style={{ marginTop: 4, fontSize: 11, padding: "3px 10px", background: "var(--bg-elev-2)", color: "var(--fg)", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer" }}
                          >
                            Extend scan to {km} km
                          </button>
                        );
                      })() : c.detail}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
        <OffsetControl onContinue={confirmAlignment} />
        {!commonStart && (
          <div className="alignment-modal-actions">
            <button
              onClick={confirmAlignment}
              style={{ background: "var(--bg-elev-2)", color: "var(--fg-dim)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600, width: "100%" }}
            >
              Compare anyway
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

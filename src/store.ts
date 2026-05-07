import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Track } from "./gpx/analyze";
import { analyze } from "./gpx/analyze";
import type { ParsedGpx } from "./gpx/parse";
import type { SyncMode } from "./gpx/align";
import { maxValueForMode, startOffsetSec } from "./gpx/align";

export type Slot = "A" | "B";

type RawEntry = { parsed: ParsedGpx; filename: string };

type State = {
  trackA: Track | null;
  trackB: Track | null;
  rawA: RawEntry | null;
  rawB: RawEntry | null;
  syncMode: SyncMode;
  playing: boolean;
  speed: number;         // playback multiplier
  progress: number;      // normalized 0..1
  // Seconds that B is offset *after* A on the shared time axis.
  offsetSec: number;
  offsetTouched: boolean;
  alignmentConfirmed: boolean;

  loadTrack: (slot: Slot, parsed: ParsedGpx, filename: string) => void;
  clearTrack: (slot: Slot) => void;
  setRiderName: (slot: Slot, name: string) => void;
  setTzOffsetHours: (slot: Slot, hours: number) => void;
  setSyncMode: (mode: SyncMode) => void;
  setPlaying: (p: boolean) => void;
  setSpeed: (s: number) => void;
  setProgress: (p: number) => void;
  togglePlay: () => void;
  setOffsetSec: (v: number) => void;
  resetOffset: () => void;
  autoDetectOffset: () => void;
  trimHeadStart: () => void;
  trimHeadStartByDistance: (slot: Slot, meters: number) => void;
  confirmAlignment: () => void;
};

function maybeAutofillOffset(
  s: Pick<State, "trackA" | "trackB" | "offsetTouched" | "offsetSec">,
): Pick<State, "offsetSec"> {
  if (s.trackA && s.trackB && !s.offsetTouched) {
    return { offsetSec: startOffsetSec(s.trackA, s.trackB) };
  }
  return { offsetSec: s.offsetSec };
}

// Revive Date objects in ParsedGpx after JSON.parse (dates become strings).
function reviveParsed(parsed: ParsedGpx): ParsedGpx {
  return {
    ...parsed,
    points: parsed.points.map((p) => ({ ...p, t: new Date(p.t) })),
  };
}

function buildTrackFromRaw(raw: RawEntry): Track {
  const revived = reviveParsed(raw.parsed);
  return analyze(revived, raw.filename, 0);
}

export const useStore = create<State>()(persist((set, get) => ({
  trackA: null,
  trackB: null,
  rawA: null,
  rawB: null,
  syncMode: "time",
  playing: false,
  speed: 10,
  progress: 0,
  offsetSec: 0,
  offsetTouched: false,
  alignmentConfirmed: false,

  loadTrack: (slot, parsed, filename) => {
    set((s) => {
      const track = analyze(parsed, filename, 0);
      const next: State = slot === "A"
        ? { ...s, trackA: track, rawA: { parsed, filename }, alignmentConfirmed: false }
        : { ...s, trackB: track, rawB: { parsed, filename }, alignmentConfirmed: false };
      return { ...next, ...maybeAutofillOffset(next) };
    });
  },

  clearTrack: (slot) => {
    set((s) => (slot === "A"
      ? { ...s, trackA: null, rawA: null }
      : { ...s, trackB: null, rawB: null }));
  },

  setRiderName: (slot, name) => {
    set((s) => {
      const track = slot === "A" ? s.trackA : s.trackB;
      if (!track) return s;
      const updated = { ...track, rider: name };
      return slot === "A" ? { ...s, trackA: updated } : { ...s, trackB: updated };
    });
  },

  setTzOffsetHours: (slot, hours) => {
    set((s) => {
      const raw = slot === "A" ? s.rawA : s.rawB;
      const prev = slot === "A" ? s.trackA : s.trackB;
      if (!raw) return s;
      const rebuilt = analyze(raw.parsed, raw.filename, hours);
      // Preserve any custom rider name the user typed.
      if (prev?.rider) rebuilt.rider = prev.rider;
      const next: State = slot === "A"
        ? { ...s, trackA: rebuilt }
        : { ...s, trackB: rebuilt };
      return { ...next, ...maybeAutofillOffset(next) };
    });
  },

  setSyncMode: (mode) => set({ syncMode: mode, progress: 0, playing: false }),
  setPlaying: (p) => set({ playing: p }),
  setSpeed: (s) => set({ speed: s }),
  setProgress: (p) => set({ progress: Math.min(1, Math.max(0, p)) }),
  togglePlay: () => set({ playing: !get().playing }),
  setOffsetSec: (v) => set({ offsetSec: Math.round(v), offsetTouched: true, progress: 0, playing: false }),
  resetOffset: () => set({ offsetSec: 0, offsetTouched: true, progress: 0, playing: false }),
  autoDetectOffset: () =>
    set((s) => {
      if (!s.trackA || !s.trackB) return s;
      return { ...s, offsetSec: startOffsetSec(s.trackA, s.trackB), offsetTouched: true, progress: 0, playing: false };
    }),

  // Trim leading points from the earlier rider so both tracks effectively start at the same shared-clock moment.
  // Offset is collapsed to 0; remaining points keep their absolute timestamps but elapsedSec restarts at 0.
  trimHeadStart: () =>
    set((s) => {
      if (!s.trackA || !s.trackB || !s.rawA || !s.rawB) return s;
      const off = s.offsetSec;
      if (off === 0) return s;

      const trimSlot: Slot = off > 0 ? "A" : "B";
      const trimSec = Math.abs(off);
      const raw = trimSlot === "A" ? s.rawA : s.rawB;
      const prev = trimSlot === "A" ? s.trackA : s.trackB;
      const tzHours = prev?.tzOffsetHours ?? 0;

      const t0 = raw.parsed.points[0]?.t.getTime() ?? 0;
      const threshold = t0 + trimSec * 1000;
      const kept = raw.parsed.points.filter((p) => p.t.getTime() >= threshold);
      if (kept.length < 2) return s; // refuse if that would leave no track

      const trimmedParsed = { ...raw.parsed, points: kept };
      const rebuilt = analyze(trimmedParsed, raw.filename, tzHours);
      if (prev?.rider) rebuilt.rider = prev.rider;

      const base = trimSlot === "A"
        ? { ...s, trackA: rebuilt, rawA: { parsed: trimmedParsed, filename: raw.filename } }
        : { ...s, trackB: rebuilt, rawB: { parsed: trimmedParsed, filename: raw.filename } };

      return { ...base, offsetSec: 0, offsetTouched: true, progress: 0, playing: false };
    }),

  trimHeadStartByDistance: (slot, meters) =>
    set((s) => {
      const raw = slot === "A" ? s.rawA : s.rawB;
      const prev = slot === "A" ? s.trackA : s.trackB;
      if (!raw || meters <= 0) return s;
      const tzHours = prev?.tzOffsetHours ?? 0;

      // Walk cumulative haversine distance until we exceed `meters`, then keep the rest.
      const pts = raw.parsed.points;
      let cumDist = 0;
      let cutIdx = 0;
      for (let i = 1; i < pts.length; i++) {
        const prev = pts[i - 1];
        const curr = pts[i];
        const dLat = (curr.lat - prev.lat) * Math.PI / 180;
        const dLon = (curr.lon - prev.lon) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(prev.lat * Math.PI / 180) * Math.cos(curr.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        cumDist += 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        if (cumDist >= meters) { cutIdx = i; break; }
      }
      if (cutIdx === 0) return s;

      const kept = pts.slice(cutIdx);
      if (kept.length < 2) return s;

      const trimmedParsed = { ...raw.parsed, points: kept };
      const rebuilt = analyze(trimmedParsed, raw.filename, tzHours);
      if (prev?.rider) rebuilt.rider = prev.rider;

      return slot === "A"
        ? { ...s, trackA: rebuilt, rawA: { parsed: trimmedParsed, filename: raw.filename }, progress: 0, playing: false }
        : { ...s, trackB: rebuilt, rawB: { parsed: trimmedParsed, filename: raw.filename }, progress: 0, playing: false };
    }),

  confirmAlignment: () => set({ alignmentConfirmed: true }),
}), {
  name: "slipstream-state",
  storage: createJSONStorage(() => localStorage),
  // Only persist the raw source data + user settings. Derived state (trackA/B)
  // is rebuilt on rehydration via onRehydrateStorage.
  partialize: (s) => ({
    rawA: s.rawA,
    rawB: s.rawB,
    syncMode: s.syncMode,
    offsetSec: s.offsetSec,
    offsetTouched: s.offsetTouched,
    // alignmentConfirmed is intentionally not persisted — modal always re-runs on load.
    // Preserve rider names separately so we can re-apply after rebuild.
    riderNameA: s.trackA?.rider,
    riderNameB: s.trackB?.rider,
  }),
  onRehydrateStorage: () => (state) => {
    if (!state) return;
    const { rawA, rawB } = state as State & { riderNameA?: string; riderNameB?: string };
    const names = state as unknown as { riderNameA?: string; riderNameB?: string };
    if (rawA) {
      const track = buildTrackFromRaw(rawA);
      if (names.riderNameA) track.rider = names.riderNameA;
      state.trackA = track;
    }
    if (rawB) {
      const track = buildTrackFromRaw(rawB);
      if (names.riderNameB) track.rider = names.riderNameB;
      state.trackB = track;
    }
  },
}));

export function useMaxValue(): number {
  const { trackA, trackB, syncMode, offsetSec } = useStore();
  if (!trackA || !trackB) return 1;
  return maxValueForMode(trackA, trackB, syncMode, offsetSec);
}

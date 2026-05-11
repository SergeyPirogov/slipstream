import { create } from "zustand";
import type { Track } from "./gpx/analyze";
import { analyze } from "./gpx/analyze";
import type { ParsedGpx } from "./gpx/parse";
import type { SyncMode } from "./gpx/align";
import { maxValueForMode, startOffsetSec, findCommonStart, findCommonEnd } from "./gpx/align";
import type { HourlyWind, RouteWindAnalysis, RideWeatherSummary } from "./gpx/routeWind";
import { analyzeRouteWind, buildRideWeatherSummary, fetchHourlyWind } from "./gpx/routeWind";
import type { StravaToken } from "./strava/auth";
import { getStoredToken, clearToken as clearStravaToken } from "./strava/auth";

export type AppMode = "compare" | "plan";

export type Slot = "A" | "B";

const STORAGE_KEY_MODE = "slipstream_mode_selected";
const STORAGE_KEY_APP_MODE = "slipstream_app_mode";

type RawEntry = { parsed: ParsedGpx; filename: string };

export type StagedFile = {
  id: number;
  name: string;
  rider: string;
  parsed: ParsedGpx;
  distanceM: number;
  durationSec: number;
};

export type PlanState = {
  route: Track | null;
  rawRoute: RawEntry | null;
  /** ISO date string yyyy-mm-dd */
  departureDate: string;
  /** Local hour 0-23 */
  departureHour: number;
  /** Estimated avg speed for ETAs and wind timing */
  avgSpeedKmh: number;
  hourlyWind: HourlyWind | null;
  windAnalysis: RouteWindAnalysis | null;
  weatherSummary: RideWeatherSummary | null;
  windLoading: boolean;
  /** True while file is being parsed / Strava route is being fetched */
  routeLoading: boolean;
  /** km from start currently hovered on elevation chart, null when not hovering */
  hoverKm: number | null;
};

type State = {
  appMode: AppMode;
  modeSelected: boolean;
  plan: PlanState;
  stravaToken: StravaToken | null;

  setAppMode: (m: AppMode) => void;
  selectMode: (m: AppMode) => void;
  goToLanding: () => void;
  setStravaToken: (token: StravaToken | null) => void;
  disconnectStrava: () => void;
  loadRoute: (parsed: ParsedGpx, filename: string) => void;
  clearRoute: () => void;
  setPlanRouteLoading: (v: boolean) => void;
  setPlanDepartureDate: (d: string) => void;
  setPlanDepartureHour: (h: number) => void;
  setPlanAvgSpeed: (s: number) => void;
  fetchPlanWind: () => void;
  setPlanHoverKm: (km: number | null) => void;

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
  analysisStarted: boolean;
  segmentM: { start: number; end: number } | null;
  commonStartScanKm: number;
  wind: { speedKmh: number; directionDeg: number; tempC?: number; weatherCode?: number } | null;

  stagedFiles: StagedFile[];
  stagedSlotA: number | null;
  stagedSlotB: number | null;

  addStagedFiles: (files: StagedFile[]) => void;
  removeStagedFile: (id: number) => void;
  assignStagedSlot: (slot: "A" | "B", id: number) => void;
  loadTrack: (slot: Slot, parsed: ParsedGpx, filename: string) => void;
  clearTrack: (slot: Slot) => void;
  clearAllTracks: () => void;
  startAnalysis: () => void;
  swapTracks: () => void;
  reassignSlot: (slot: "A" | "B", id: number) => void;
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
  trimToCommonStart: () => void;
  alignmentPreviouslyConfirmed: boolean;
  alignmentSnapshot: { trackA: State["trackA"]; rawA: State["rawA"]; trackB: State["trackB"]; rawB: State["rawB"]; offsetSec: number; stagedSlotA: number | null; stagedSlotB: number | null } | null;
  confirmAlignment: () => void;
  reopenAlignment: () => void;
  cancelAlignment: () => void;
  setSegmentM: (start: number, end: number) => void;
  clearSegmentM: () => void;
  setCommonStartScanKm: (km: number) => void;
  fetchWind: () => void;
};

function maybeAutofillOffset(
  s: Pick<State, "trackA" | "trackB" | "offsetTouched" | "offsetSec">,
): Pick<State, "offsetSec"> {
  if (s.trackA && s.trackB && !s.offsetTouched) {
    return { offsetSec: startOffsetSec(s.trackA, s.trackB) };
  }
  return { offsetSec: s.offsetSec };
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export const useStore = create<State>((set, get) => ({
  appMode: (localStorage.getItem(STORAGE_KEY_APP_MODE) as AppMode) ?? "plan",
  modeSelected: localStorage.getItem(STORAGE_KEY_MODE) === "1",
  stravaToken: getStoredToken(),

  setAppMode: (m) => {
    localStorage.setItem(STORAGE_KEY_APP_MODE, m);
    set({ appMode: m });
  },

  selectMode: (m) => {
    localStorage.setItem(STORAGE_KEY_MODE, "1");
    localStorage.setItem(STORAGE_KEY_APP_MODE, m);
    set({ appMode: m, modeSelected: true });
  },

  goToLanding: () => {
    localStorage.removeItem(STORAGE_KEY_MODE);
    set({ modeSelected: false });
  },

  setStravaToken: (token) => set({ stravaToken: token }),
  disconnectStrava: () => {
    clearStravaToken();
    set({ stravaToken: null });
  },

  plan: {
    route: null,
    rawRoute: null,
    departureDate: todayIso(),
    departureHour: 8,
    avgSpeedKmh: 28,
    hourlyWind: null,
    windAnalysis: null,
    weatherSummary: null,
    windLoading: false,
    routeLoading: false,
    hoverKm: null,
  },

  setPlanRouteLoading: (v) => set((s) => ({ plan: { ...s.plan, routeLoading: v } })),

  loadRoute: (parsed, filename) => {
    const track = analyze(parsed, filename, 0);
    set((s) => ({
      plan: {
        ...s.plan,
        route: track,
        rawRoute: { parsed, filename },
        hourlyWind: null,
        windAnalysis: null,
        weatherSummary: null,
        routeLoading: false,
      },
    }));
    setTimeout(() => get().fetchPlanWind(), 0);
  },

  clearRoute: () =>
    set((s) => ({
      plan: { ...s.plan, route: null, rawRoute: null, hourlyWind: null, windAnalysis: null, weatherSummary: null },
    })),

  setPlanDepartureDate: (d) => {
    set((s) => ({ plan: { ...s.plan, departureDate: d, windAnalysis: null, weatherSummary: null } }));
    setTimeout(() => get().fetchPlanWind(), 0);
  },

  setPlanDepartureHour: (h) => {
    set((s) => {
      const plan = s.plan;
      if (!plan.hourlyWind || !plan.route) return { plan: { ...plan, departureHour: h } };
      const departureMs = new Date(plan.departureDate + "T" + String(h).padStart(2, "0") + ":00:00Z").getTime();
      const windAnalysis = analyzeRouteWind(plan.route.points, plan.hourlyWind, departureMs, plan.avgSpeedKmh);
      const weatherSummary = buildRideWeatherSummary(plan.hourlyWind, departureMs, windAnalysis.estDurationSec);
      return { plan: { ...plan, departureHour: h, windAnalysis, weatherSummary } };
    });
  },

  setPlanAvgSpeed: (s) => {
    set((state) => {
      const plan = state.plan;
      const newPlan = { ...plan, avgSpeedKmh: s };
      if (plan.hourlyWind && plan.route) {
        const departureMs = new Date(plan.departureDate + "T" + String(plan.departureHour).padStart(2, "0") + ":00:00Z").getTime();
        newPlan.windAnalysis = analyzeRouteWind(plan.route.points, plan.hourlyWind, departureMs, s);
        newPlan.weatherSummary = buildRideWeatherSummary(plan.hourlyWind, departureMs, newPlan.windAnalysis.estDurationSec);
      }
      return { plan: newPlan };
    });
  },

  fetchPlanWind: async () => {
    const { plan } = get();
    if (!plan.route || plan.route.points.length === 0) return;
    set((s) => ({ plan: { ...s.plan, windLoading: true, routeLoading: false } }));
    try {
      const mid = plan.route.points[Math.floor(plan.route.points.length / 2)];
      const hw = await fetchHourlyWind(mid.lat, mid.lon, plan.departureDate);
      if (!hw) { set((s) => ({ plan: { ...s.plan, windLoading: false } })); return; }
      const departureMs = new Date(
        plan.departureDate + "T" + String(plan.departureHour).padStart(2, "0") + ":00:00Z",
      ).getTime();
      const windAnalysis = analyzeRouteWind(plan.route.points, hw, departureMs, plan.avgSpeedKmh);
      const weatherSummary = buildRideWeatherSummary(hw, departureMs, windAnalysis.estDurationSec);
      set((s) => ({ plan: { ...s.plan, hourlyWind: hw, windAnalysis, weatherSummary, windLoading: false } }));
    } catch {
      set((s) => ({ plan: { ...s.plan, windLoading: false } }));
    }
  },

  setPlanHoverKm: (km) => set((s) => ({ plan: { ...s.plan, hoverKm: km } })),

  stagedFiles: [],
  stagedSlotA: null,
  stagedSlotB: null,

  addStagedFiles: (incoming) =>
    set((s) => {
      const next = [...s.stagedFiles, ...incoming];
      // Auto-assign first two slots if not yet assigned
      const slotA = s.stagedSlotA ?? (next[0]?.id ?? null);
      const slotB = s.stagedSlotB ?? (next[1]?.id ?? null);
      return { stagedFiles: next, stagedSlotA: slotA, stagedSlotB: slotB };
    }),

  removeStagedFile: (id) =>
    set((s) => ({
      stagedFiles: s.stagedFiles.filter((f) => f.id !== id),
      stagedSlotA: s.stagedSlotA === id ? null : s.stagedSlotA,
      stagedSlotB: s.stagedSlotB === id ? null : s.stagedSlotB,
    })),

  assignStagedSlot: (slot, id) =>
    set((s) => {
      if (slot === "A") {
        return { stagedSlotA: s.stagedSlotA === id ? null : id, stagedSlotB: s.stagedSlotB === id ? null : s.stagedSlotB };
      }
      return { stagedSlotB: s.stagedSlotB === id ? null : id, stagedSlotA: s.stagedSlotA === id ? null : s.stagedSlotA };
    }),

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
  alignmentPreviouslyConfirmed: false,
  alignmentSnapshot: null,
  analysisStarted: false,
  segmentM: null,
  commonStartScanKm: 20,
  wind: null,

  loadTrack: (slot, parsed, filename) => {
    set((s) => {
      const track = analyze(parsed, filename, 0);
      const next: State = slot === "A"
        ? { ...s, trackA: track, rawA: { parsed, filename }, alignmentConfirmed: false, alignmentPreviouslyConfirmed: false, wind: null }
        : { ...s, trackB: track, rawB: { parsed, filename }, alignmentConfirmed: false, alignmentPreviouslyConfirmed: false };
      return { ...next, ...maybeAutofillOffset(next) };
    });
    // Only fetch wind from track A (it provides location + date).
    if (slot === "A") setTimeout(() => get().fetchWind(), 0);
  },

  clearTrack: (slot) => {
    set((s) => {
      if (slot === "B") return { ...s, trackB: null, rawB: null, alignmentConfirmed: false };
      // Removing A: if B exists, promote it to A so the solo view stays intact
      if (s.trackB) {
        return { ...s, trackA: s.trackB, rawA: s.rawB, trackB: null, rawB: null, alignmentConfirmed: false, offsetSec: 0, offsetTouched: false };
      }
      return { ...s, trackA: null, rawA: null };
    });
  },

  clearAllTracks: () => {
    set((s) => ({ ...s, trackA: null, rawA: null, trackB: null, rawB: null, alignmentConfirmed: false, alignmentPreviouslyConfirmed: false, analysisStarted: false, offsetSec: 0, offsetTouched: false, segmentM: null, wind: null, stagedFiles: [], stagedSlotA: null, stagedSlotB: null }));
  },

  startAnalysis: () => {
    set((s) => {
      const fileA = s.stagedFiles.find((f) => f.id === s.stagedSlotA);
      const fileB = s.stagedFiles.find((f) => f.id === s.stagedSlotB);
      if (!fileA) return { analysisStarted: true };
      const trackA = analyze(fileA.parsed, fileA.name, 0);
      const trackB = fileB ? analyze(fileB.parsed, fileB.name, 0) : null;
      const next = {
        ...s,
        trackA, rawA: { parsed: fileA.parsed, filename: fileA.name },
        trackB, rawB: fileB ? { parsed: fileB.parsed, filename: fileB.name } : null,
        alignmentConfirmed: false, alignmentPreviouslyConfirmed: false, analysisStarted: true,
      };
      return { ...next, ...maybeAutofillOffset(next) };
    });
    setTimeout(() => get().fetchWind(), 0);
  },

  swapTracks: () =>
    set((s) => {
      if (!s.trackA || !s.trackB) return s;
      return {
        ...s,
        trackA: s.trackB, rawA: s.rawB,
        trackB: s.trackA, rawB: s.rawA,
        stagedSlotA: s.stagedSlotB, stagedSlotB: s.stagedSlotA,
        offsetSec: -s.offsetSec,
        progress: 0,
        playing: false,
      };
    }),

  reassignSlot: (slot, id) =>
    set((s) => {
      const file = s.stagedFiles.find((f) => f.id === id);
      if (!file) return s;
      const track = analyze(file.parsed, file.name, 0);
      const raw = { parsed: file.parsed, filename: file.name };
      // Snapshot before first change so cancel can fully restore
      const snapshot = s.alignmentSnapshot ?? (s.alignmentPreviouslyConfirmed
        ? { trackA: s.trackA, rawA: s.rawA, trackB: s.trackB, rawB: s.rawB, offsetSec: s.offsetSec, stagedSlotA: s.stagedSlotA, stagedSlotB: s.stagedSlotB }
        : null);
      // Assign to slot, clearing the id from the other slot if it was there
      const finalSlotA = slot === "A" ? id : (s.stagedSlotA === id ? null : s.stagedSlotA);
      const finalSlotB = slot === "B" ? id : (s.stagedSlotB === id ? null : s.stagedSlotB);
      const next = slot === "A"
        ? { ...s, trackA: track, rawA: raw, stagedSlotA: finalSlotA, stagedSlotB: finalSlotB, alignmentConfirmed: false, alignmentSnapshot: snapshot }
        : { ...s, trackB: track, rawB: raw, stagedSlotA: finalSlotA, stagedSlotB: finalSlotB, alignmentConfirmed: false, alignmentSnapshot: snapshot };
      return { ...next, ...maybeAutofillOffset(next) };
    }),

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
        ? { ...s, trackA: rebuilt, offsetTouched: false }
        : { ...s, trackB: rebuilt, offsetTouched: false };
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

  trimToCommonStart: () =>
    set((s) => {
      if (!s.trackA || !s.trackB || !s.rawA || !s.rawB) return s;
      const cs = findCommonStart(s.trackA, s.trackB);
      const ce = findCommonEnd(s.trackA, s.trackB);
      if (!cs && !ce) return s;

      const trimTrack = (
        raw: { parsed: ParsedGpx; filename: string },
        track: Track,
        startDistM: number,
        endDistM: number,
      ) => {
        // Find first point at or past startDistM, last point at or before endDistM
        let points = raw.parsed.points;
        if (startDistM > 10) {
          const idx = track.points.findIndex((p) => p.distFromStart >= startDistM);
          if (idx > 0) points = points.slice(idx);
        }
        if (endDistM < track.points[track.points.length - 1].distFromStart - 10) {
          const idx = track.points.findIndex((p) => p.distFromStart > endDistM);
          if (idx > 0) points = points.slice(0, idx);
        }
        if (points.length < 2) return { raw, track };
        const trimmedParsed = { ...raw.parsed, points };
        const rebuilt = analyze(trimmedParsed, raw.filename, track.tzOffsetHours);
        if (track.rider) rebuilt.rider = track.rider;
        return { raw: { parsed: trimmedParsed, filename: raw.filename }, track: rebuilt };
      };

      const startA = cs?.distA ?? 0;
      const startB = cs?.distB ?? 0;
      const endA = ce?.distA ?? s.trackA.totals.distanceM;
      const endB = ce?.distB ?? s.trackB.totals.distanceM;

      const resA = trimTrack(s.rawA, s.trackA, startA, endA);
      const resB = trimTrack(s.rawB, s.trackB, startB, endB);

      // Preserve the wall-clock gap between the two riders at the common start point.
      // elapsedA/elapsedB are seconds each rider had ridden before reaching the common point;
      // adding them to each track's UTC start gives the moment each rider was there.
      const tA = s.trackA.points[0].t.getTime() + (cs?.elapsedA ?? 0) * 1000;
      const tB = s.trackB.points[0].t.getTime() + (cs?.elapsedB ?? 0) * 1000;
      const commonStartOffsetSec = Math.round((tB - tA) / 1000);

      return {
        ...s,
        trackA: resA.track, rawA: resA.raw,
        trackB: resB.track, rawB: resB.raw,
        offsetSec: commonStartOffsetSec, offsetTouched: true, progress: 0, playing: false,
      };
    }),

  confirmAlignment: () => set({ alignmentConfirmed: true, alignmentPreviouslyConfirmed: true, alignmentSnapshot: null }),
  reopenAlignment: () =>
    set((s) => ({
      alignmentConfirmed: false,
      alignmentSnapshot: { trackA: s.trackA, rawA: s.rawA, trackB: s.trackB, rawB: s.rawB, offsetSec: s.offsetSec, stagedSlotA: s.stagedSlotA, stagedSlotB: s.stagedSlotB },
    })),
  cancelAlignment: () =>
    set((s) => {
      if (!s.alignmentSnapshot) return { alignmentConfirmed: true };
      const { trackA, rawA, trackB, rawB, offsetSec, stagedSlotA, stagedSlotB } = s.alignmentSnapshot;
      return { alignmentConfirmed: true, alignmentSnapshot: null, trackA, rawA, trackB, rawB, offsetSec, stagedSlotA, stagedSlotB, offsetTouched: true };
    }),
  setSegmentM: (start, end) => set({ segmentM: { start, end }, progress: 0, playing: false }),
  clearSegmentM: () => set({ segmentM: null, progress: 0, playing: false }),
  setCommonStartScanKm: (km) => set({ commonStartScanKm: Math.max(1, Math.round(km)) }),

  fetchWind: async () => {
    const { trackA } = get();
    if (!trackA || trackA.points.length === 0) return;

    // Use the midpoint of track A for location, start time for date.
    const mid = trackA.points[Math.floor(trackA.points.length / 2)];
    const t = trackA.points[0].t;
    const date = t.toISOString().slice(0, 10);
    const lat = mid.lat.toFixed(4);
    const lon = mid.lon.toFixed(4);

    const pickBestSlot = (
      json: Record<string, unknown>,
      activityTs: number,
    ): { speedKmh: number; directionDeg: number; tempC?: number; weatherCode?: number } | null => {
      const times: string[] = (json.hourly as Record<string, unknown>)?.time as string[] ?? [];
      const speeds: number[] = (json.hourly as Record<string, unknown>)?.wind_speed_10m as number[] ?? [];
      const dirs: number[] = (json.hourly as Record<string, unknown>)?.wind_direction_10m as number[] ?? [];
      const temps: number[] = (json.hourly as Record<string, unknown>)?.temperature_2m as number[] ?? [];
      const codes: number[] = (json.hourly as Record<string, unknown>)?.weather_code as number[] ?? [];
      if (times.length === 0) return null;
      let bestIdx = 0, bestDiff = Infinity;
      for (let i = 0; i < times.length; i++) {
        const diff = Math.abs(new Date(times[i] + "Z").getTime() - activityTs);
        if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
      }
      if (!times[bestIdx].startsWith(date)) return null; // slot is on wrong date
      return { speedKmh: speeds[bestIdx], directionDeg: dirs[bestIdx], tempC: temps[bestIdx], weatherCode: codes[bestIdx] };
    };

    try {
      const hourlyVars = "wind_speed_10m,wind_direction_10m,temperature_2m,weather_code";
      const activityTs = t.getTime();

      // Forecast API covers today and past_days=7 (no date params — avoids mutual exclusion error).
      const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&past_days=7&forecast_days=1&hourly=${hourlyVars}&wind_speed_unit=kmh`;
      const forecastRes = await fetch(forecastUrl);
      if (forecastRes.ok) {
        const slot = pickBestSlot(await forecastRes.json(), activityTs);
        if (slot) { set({ wind: slot }); return; }
      }

      // Fall back to archive for older rides.
      const archiveUrl = `https://api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${date}&end_date=${date}&hourly=${hourlyVars}&wind_speed_unit=kmh`;
      const archiveRes = await fetch(archiveUrl);
      if (!archiveRes.ok) return;
      const slot = pickBestSlot(await archiveRes.json(), activityTs);
      if (slot) set({ wind: slot });
    } catch (e) {
      // silently ignore network errors
    }
  },
}));

export function useMaxValue(): number {
  const { trackA, trackB, syncMode, offsetSec } = useStore();
  if (!trackA) return 1;
  if (!trackB) return syncMode === "time" ? trackA.totals.durationSec : trackA.totals.distanceM;
  return maxValueForMode(trackA, trackB, syncMode, offsetSec);
}

// When a distance segment is active, returns [startFraction, endFraction] of maxValue.
// PlaybackControls uses this to clamp the scrubber range.
export function useSegmentBounds(): { startFrac: number; endFrac: number } | null {
  const segmentM = useStore((s) => s.segmentM);
  const trackA = useStore((s) => s.trackA);
  const trackB = useStore((s) => s.trackB);
  const syncMode = useStore((s) => s.syncMode);
  const offsetSec = useStore((s) => s.offsetSec);
  if (!segmentM || !trackA || !trackB || syncMode !== "distance") return null;
  const maxVal = maxValueForMode(trackA, trackB, syncMode, offsetSec);
  if (maxVal <= 0) return null;
  return {
    startFrac: segmentM.start / maxVal,
    endFrac: segmentM.end / maxVal,
  };
}

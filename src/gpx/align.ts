import type { Track, TrackPoint } from "./analyze";

function binarySearch(values: number[], target: number): number {
  let lo = 0;
  let hi = values.length - 1;
  if (target <= values[0]) return 0;
  if (target >= values[hi]) return hi;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return lo;
}

function interpolate(a: TrackPoint, b: TrackPoint, t: number): {
  lat: number;
  lon: number;
  ele: number;
  speedKmh: number;
  hr?: number;
  cad?: number;
  power?: number;
  power3s?: number;
  distFromStart: number;
  elapsedSec: number;
} {
  const lerp = (x: number, y: number) => x + (y - x) * t;
  return {
    lat: lerp(a.lat, b.lat),
    lon: lerp(a.lon, b.lon),
    ele: lerp(a.ele, b.ele),
    speedKmh: lerp(a.speedKmh, b.speedKmh),
    hr: a.hr !== undefined && b.hr !== undefined ? lerp(a.hr, b.hr) : a.hr ?? b.hr,
    cad: a.cad !== undefined && b.cad !== undefined ? lerp(a.cad, b.cad) : a.cad ?? b.cad,
    power: a.power !== undefined && b.power !== undefined ? lerp(a.power, b.power) : a.power ?? b.power,
    power3s: a.power3s !== undefined && b.power3s !== undefined ? lerp(a.power3s, b.power3s) : a.power3s ?? b.power3s,
    distFromStart: lerp(a.distFromStart, b.distFromStart),
    elapsedSec: lerp(a.elapsedSec, b.elapsedSec),
  };
}

export type SyncMode = "time" | "distance";

export type Position = ReturnType<typeof interpolate>;

export function positionAtProgress(
  track: Track,
  progress: number,
  mode: SyncMode,
  maxValue: number,
): Position {
  const target = progress * maxValue;
  const pts = track.points;
  const arr =
    mode === "time"
      ? pts.map((p) => p.elapsedSec)
      : pts.map((p) => p.distFromStart);
  // avoid re-map on hot path — use the cached arrays on the track
  const idx = binarySearch(arr, target);
  if (idx === 0) return toPosition(pts[0]);
  const a = pts[idx - 1];
  const b = pts[idx];
  const aVal = mode === "time" ? a.elapsedSec : a.distFromStart;
  const bVal = mode === "time" ? b.elapsedSec : b.distFromStart;
  if (target >= bVal) return toPosition(b);
  const span = bVal - aVal;
  const t = span > 0 ? (target - aVal) / span : 0;
  return interpolate(a, b, t);
}

function toPosition(p: TrackPoint): Position {
  return {
    lat: p.lat,
    lon: p.lon,
    ele: p.ele,
    speedKmh: p.speedKmh,
    hr: p.hr,
    cad: p.cad,
    power: p.power,
    power3s: p.power3s,
    distFromStart: p.distFromStart,
    elapsedSec: p.elapsedSec,
  };
}

// Max value for a given sync mode across two tracks.
// - time: max of (A duration) and (B duration + offsetSec). offsetSec > 0 means B started later than A.
// - distance: max of the two distances (offset is ignored)
export function maxValueForMode(a: Track, b: Track, mode: SyncMode, offsetSec = 0): number {
  if (mode === "time") {
    return Math.max(a.totals.durationSec, b.totals.durationSec + Math.max(0, offsetSec));
  }
  return Math.max(a.totals.distanceM, b.totals.distanceM);
}

// Real UTC gap between the two track starts, in seconds. Positive = B started after A.
export function startOffsetSec(a: Track, b: Track): number {
  const ta = a.points[0]?.t.getTime();
  const tb = b.points[0]?.t.getTime();
  if (!ta || !tb) return 0;
  return Math.round((tb - ta) / 1000);
}

// Cached-array version for hot path.
export function positionAtValue(
  track: Track,
  cachedArr: number[],
  value: number,
): Position {
  const pts = track.points;
  if (pts.length === 0) return { lat: 0, lon: 0, ele: 0, speedKmh: 0, distFromStart: 0, elapsedSec: 0 };
  const idx = binarySearch(cachedArr, value);
  if (idx === 0) return toPosition(pts[0]);
  const a = pts[idx - 1];
  const b = pts[idx];
  const aVal = cachedArr[idx - 1];
  const bVal = cachedArr[idx];
  if (value >= bVal) return toPosition(b);
  const span = bVal - aVal;
  const t = span > 0 ? (value - aVal) / span : 0;
  return interpolate(a, b, t);
}

export function buildSyncArrays(track: Track): { time: number[]; distance: number[] } {
  const time = new Array<number>(track.points.length);
  const distance = new Array<number>(track.points.length);
  for (let i = 0; i < track.points.length; i++) {
    time[i] = track.points[i].elapsedSec;
    distance[i] = track.points[i].distFromStart;
  }
  return { time, distance };
}

// Compute the per-track query value given a "global progress" target.
// - In distance-sync: both riders are queried at the same cumulative distance (offset ignored).
// - In time-sync: A queries at global t; B queries at (global t - offsetSec). Values are
//   clamped into each track's valid range so we never over- or under-shoot.
export function queryValues(
  target: number,
  mode: SyncMode,
  aMaxValue: number,
  bMaxValue: number,
  offsetSec: number,
): { aValue: number; bValue: number } {
  if (mode === "distance") {
    return {
      aValue: Math.min(target, aMaxValue),
      bValue: Math.min(target, bMaxValue),
    };
  }
  // time
  return {
    aValue: Math.max(0, Math.min(target, aMaxValue)),
    bValue: Math.max(0, Math.min(target - offsetSec, bMaxValue)),
  };
}

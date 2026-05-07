import type { Track, TrackPoint } from "./analyze";

const R = 6371000;

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const dφ = toRad(lat2 - lat1), dλ = toRad(lon2 - lon1);
  const x = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export type CommonStart = {
  distA: number;       // metres from A's file start to the common point
  distB: number;       // metres from B's file start to the common point
  geoDistM: number;    // geographic distance between the two common points
  elapsedA: number;    // elapsed seconds at the common point on A
  elapsedB: number;    // elapsed seconds at the common point on B
};

// Scan the first SCAN_M metres of each track to find where it comes closest to the
// other track's first point. Returns null when the nearest approach exceeds thresholdM.
export function findCommonStart(a: Track, b: Track, thresholdM = 500, scanM = 1000): CommonStart | null {
  const SCAN_M = scanM;
  const startA = a.points[0];
  const startB = b.points[0];

  let bestBDist = Infinity, bestBDistFromStart = 0, bestBElapsed = 0;
  for (const p of b.points) {
    if (p.distFromStart > SCAN_M) break;
    const d = haversineM(startA.lat, startA.lon, p.lat, p.lon);
    if (d < bestBDist) { bestBDist = d; bestBDistFromStart = p.distFromStart; bestBElapsed = p.elapsedSec; }
  }

  let bestADist = Infinity, bestADistFromStart = 0, bestAElapsed = 0;
  for (const p of a.points) {
    if (p.distFromStart > SCAN_M) break;
    const d = haversineM(startB.lat, startB.lon, p.lat, p.lon);
    if (d < bestADist) { bestADist = d; bestADistFromStart = p.distFromStart; bestAElapsed = p.elapsedSec; }
  }

  const geoDistM = Math.min(bestADist, bestBDist);
  if (geoDistM > thresholdM) return null;

  return {
    distA: bestADistFromStart,
    distB: bestBDistFromStart,
    geoDistM,
    elapsedA: bestAElapsed,
    elapsedB: bestBElapsed,
  };
}

export type CommonEnd = {
  distA: number;    // metres from A's file start to the common end point
  distB: number;    // metres from B's file start to the common end point
  geoDistM: number;
  tailA: number;    // metres trimmed from A's tail
  tailB: number;    // metres trimmed from B's tail
};

// Scan the last SCAN_M metres of each track to find where it comes closest to the
// other track's last point. Returns null when the nearest approach exceeds thresholdM.
export function findCommonEnd(a: Track, b: Track, thresholdM = 500): CommonEnd | null {
  const SCAN_M = 5000;
  const endA = a.points[a.points.length - 1];
  const endB = b.points[b.points.length - 1];
  const totalA = endA.distFromStart;
  const totalB = endB.distFromStart;

  let bestBDist = Infinity, bestBDistFromStart = totalB;
  for (let i = b.points.length - 1; i >= 0; i--) {
    const p = b.points[i];
    if (totalB - p.distFromStart > SCAN_M) break;
    const d = haversineM(endA.lat, endA.lon, p.lat, p.lon);
    if (d < bestBDist) { bestBDist = d; bestBDistFromStart = p.distFromStart; }
  }

  let bestADist = Infinity, bestADistFromStart = totalA;
  for (let i = a.points.length - 1; i >= 0; i--) {
    const p = a.points[i];
    if (totalA - p.distFromStart > SCAN_M) break;
    const d = haversineM(endB.lat, endB.lon, p.lat, p.lon);
    if (d < bestADist) { bestADist = d; bestADistFromStart = p.distFromStart; }
  }

  const geoDistM = Math.min(bestADist, bestBDist);
  if (geoDistM > thresholdM) return null;

  return {
    distA: bestADistFromStart,
    distB: bestBDistFromStart,
    geoDistM,
    tailA: totalA - bestADistFromStart,
    tailB: totalB - bestBDistFromStart,
  };
}

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
): { aValue: number; bValue: number; aFinished: boolean; bFinished: boolean } {
  if (mode === "distance") {
    return {
      aValue: Math.min(target, aMaxValue),
      bValue: Math.min(target, bMaxValue),
      aFinished: target >= aMaxValue,
      bFinished: target >= bMaxValue,
    };
  }
  // time
  return {
    aValue: Math.max(0, Math.min(target, aMaxValue)),
    bValue: Math.max(0, Math.min(target - offsetSec, bMaxValue)),
    aFinished: target >= aMaxValue,
    bFinished: target - offsetSec >= bMaxValue,
  };
}

import type { ParsedGpx, RawPoint } from "./parse";

export type TrackPoint = RawPoint & {
  distFromStart: number;
  elapsedSec: number;
  speedKmh: number;
  grade?: number;
  power3s?: number; // 3-second rolling avg, populated when power is present
};

export type Climb = {
  startIdx: number;
  endIdx: number;
  startKm: number;
  lengthM: number;
  ascentM: number;
  avgGrade: number;
  vam: number; // m/h vertical
};

export type Split = {
  km: number; // cumulative km at end of split
  elapsedSec: number;
  durationSec: number;
  avgSpeedKmh: number;
  ascentM: number;
};

export type Totals = {
  distanceM: number;
  durationSec: number;
  ascentM: number;
  descentM: number;
  avgSpeedKmh: number;
  avgHr?: number;
  avgCad?: number;
  maxSpeedKmh: number;
  avgPower?: number;
  maxPower?: number;
  normalizedPower?: number;
  avgTemp?: number;
};

export type Track = {
  name: string;
  rider: string;
  description?: string;
  device?: string;
  subSport?: string;
  elapsedSec?: number;
  points: TrackPoint[];
  totals: Totals;
  climbs: Climb[];
  splits: Split[];
  tzOffsetHours: number; // applied shift for this track; 0 = use file timestamps as-is
};

const R = 6371000;

function haversineM(a: RawPoint, b: RawPoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const dφ = toRad(b.lat - a.lat);
  const dλ = toRad(b.lon - a.lon);
  const x =
    Math.sin(dφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function movingAverage(arr: number[], window: number): number[] {
  const n = arr.length;
  const out = new Array<number>(n);
  const half = Math.floor(window / 2);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < Math.min(half, n); i++) {
    sum += arr[i];
    count++;
  }
  for (let i = 0; i < n; i++) {
    const add = i + half;
    const rem = i - half - 1;
    if (add < n) {
      sum += arr[add];
      count++;
    }
    if (rem >= 0) {
      sum -= arr[rem];
      count--;
    }
    out[i] = count > 0 ? sum / count : 0;
  }
  return out;
}

function computeDistancesAndTime(points: RawPoint[]): { dists: number[]; elapsed: number[] } {
  const n = points.length;
  const dists = new Array<number>(n);
  const elapsed = new Array<number>(n);
  dists[0] = 0;
  elapsed[0] = 0;
  const t0 = points[0].t.getTime();
  for (let i = 1; i < n; i++) {
    dists[i] = dists[i - 1] + haversineM(points[i - 1], points[i]);
    elapsed[i] = (points[i].t.getTime() - t0) / 1000;
  }
  return { dists, elapsed };
}

function computeSpeed(points: RawPoint[], dists: number[], elapsed: number[]): number[] {
  const n = points.length;
  const raw = new Array<number>(n);
  raw[0] = 0;
  for (let i = 1; i < n; i++) {
    const dd = dists[i] - dists[i - 1];
    const dt = elapsed[i] - elapsed[i - 1];
    raw[i] = dt > 0 ? (dd / dt) * 3.6 : 0;
  }
  return movingAverage(raw, 11);
}

// Grade computed over ~50m window on each side.
function computeGrade(points: RawPoint[], dists: number[]): number[] {
  const n = points.length;
  const out = new Array<number>(n).fill(0);
  const WIN_M = 50;
  for (let i = 0; i < n; i++) {
    let lo = i;
    let hi = i;
    while (lo > 0 && dists[i] - dists[lo] < WIN_M) lo--;
    while (hi < n - 1 && dists[hi] - dists[i] < WIN_M) hi++;
    const dd = dists[hi] - dists[lo];
    if (dd < 10) continue;
    const de = points[hi].ele - points[lo].ele;
    out[i] = (de / dd) * 100;
  }
  return out;
}

function detectClimbs(
  points: TrackPoint[],
  dists: number[],
  grades: number[],
): Climb[] {
  const climbs: Climb[] = [];
  const n = points.length;
  let i = 0;
  while (i < n) {
    if (grades[i] >= 3) {
      let j = i;
      while (j < n - 1 && grades[j + 1] >= 1.5) j++;
      const lengthM = dists[j] - dists[i];
      const ascent = Math.max(0, points[j].ele - points[i].ele);
      if (lengthM >= 500 && ascent >= 25) {
        const durationH = Math.max(0.001, (points[j].elapsedSec - points[i].elapsedSec) / 3600);
        climbs.push({
          startIdx: i,
          endIdx: j,
          startKm: dists[i] / 1000,
          lengthM,
          ascentM: ascent,
          avgGrade: (ascent / lengthM) * 100,
          vam: ascent / durationH,
        });
      }
      i = j + 1;
    } else {
      i++;
    }
  }
  return climbs;
}

function computeSplits(points: TrackPoint[], splitKm = 10): Split[] {
  const splits: Split[] = [];
  let nextTarget = splitKm * 1000;
  let lastIdx = 0;
  let lastDist = 0;
  let lastElapsed = 0;
  let ascentAccum = 0;
  for (let i = 1; i < points.length; i++) {
    const dEle = points[i].ele - points[i - 1].ele;
    if (dEle > 0) ascentAccum += dEle;
    if (points[i].distFromStart >= nextTarget) {
      const dist = points[i].distFromStart - lastDist;
      const dur = points[i].elapsedSec - lastElapsed;
      splits.push({
        km: nextTarget / 1000,
        elapsedSec: points[i].elapsedSec,
        durationSec: dur,
        avgSpeedKmh: dur > 0 ? (dist / dur) * 3.6 : 0,
        ascentM: ascentAccum,
      });
      lastIdx = i;
      lastDist = points[i].distFromStart;
      lastElapsed = points[i].elapsedSec;
      ascentAccum = 0;
      nextTarget += splitKm * 1000;
    }
  }
  const last = points[points.length - 1];
  const tail = last.distFromStart - lastDist;
  if (tail > 500) {
    const dur = last.elapsedSec - lastElapsed;
    splits.push({
      km: last.distFromStart / 1000,
      elapsedSec: last.elapsedSec,
      durationSec: dur,
      avgSpeedKmh: dur > 0 ? (tail / dur) * 3.6 : 0,
      ascentM: ascentAccum,
    });
  }
  return splits;
}

function riderFromFilename(filename: string): string {
  return filename
    .replace(/\.gpx$/i, "")
    .replace(/_/g, " ")
    .trim();
}

export function analyze(parsed: ParsedGpx, filename: string, tzOffsetHours = 0): Track {
  const shiftMs = tzOffsetHours * 3600 * 1000;
  const raw: RawPoint[] =
    shiftMs === 0
      ? parsed.points
      : parsed.points.map((p) => ({ ...p, t: new Date(p.t.getTime() + shiftMs) }));
  const { dists, elapsed } = computeDistancesAndTime(raw);
  const speeds = computeSpeed(raw, dists, elapsed);
  const grades = computeGrade(raw, dists);

  const points: TrackPoint[] = raw.map((p, i) => ({
    ...p,
    distFromStart: dists[i],
    elapsedSec: elapsed[i],
    speedKmh: speeds[i],
    grade: grades[i],
  }));

  // 3-second rolling average for power (marker display) — time-window based so
  // variable sample rate works. Each sample averages values in [t-1.5s, t+1.5s].
  const hasPower = points.some((p) => p.power !== undefined);
  if (hasPower) {
    const HALF = 1.5;
    let lo = 0;
    let hi = 0;
    for (let i = 0; i < points.length; i++) {
      const t = points[i].elapsedSec;
      while (lo < points.length && points[lo].elapsedSec < t - HALF) lo++;
      while (hi < points.length && points[hi].elapsedSec <= t + HALF) hi++;
      let sum = 0;
      let n = 0;
      for (let k = lo; k < hi; k++) {
        const v = points[k].power;
        if (v !== undefined && v >= 0) { sum += v; n++; }
      }
      if (n > 0) points[i].power3s = sum / n;
    }
  }

  let ascent = 0;
  let descent = 0;
  const smoothEle = movingAverage(raw.map((p) => p.ele), 7);
  for (let i = 1; i < smoothEle.length; i++) {
    const d = smoothEle[i] - smoothEle[i - 1];
    if (d > 0) ascent += d;
    else descent += -d;
  }

  let hrSum = 0, hrN = 0, cadSum = 0, cadN = 0, maxSpeed = 0;
  let pwrSum = 0, pwrN = 0, pwrMax = 0;
  let tempSum = 0, tempN = 0;
  const pwrSeries: number[] = [];
  for (const p of points) {
    if (p.hr !== undefined && p.hr > 0) { hrSum += p.hr; hrN++; }
    if (p.cad !== undefined && p.cad > 0) { cadSum += p.cad; cadN++; }
    if (p.speedKmh > maxSpeed) maxSpeed = p.speedKmh;
    if (p.power !== undefined && p.power >= 0) {
      pwrSum += p.power; pwrN++;
      if (p.power > pwrMax) pwrMax = p.power;
      pwrSeries.push(p.power);
    }
    if (p.atemp !== undefined) { tempSum += p.atemp; tempN++; }
  }

  let normalizedPower: number | undefined;
  if (pwrSeries.length > 30) {
    // 30-sample rolling average, then mean of 4th power, then 4th root.
    const rolling = movingAverage(pwrSeries, 30);
    let sum4 = 0;
    for (const v of rolling) sum4 += v * v * v * v;
    normalizedPower = Math.pow(sum4 / rolling.length, 0.25);
  }

  const last = points[points.length - 1];
  const totals: Totals = {
    distanceM: last.distFromStart,
    durationSec: last.elapsedSec,
    ascentM: ascent,
    descentM: descent,
    avgSpeedKmh: last.elapsedSec > 0 ? (last.distFromStart / last.elapsedSec) * 3.6 : 0,
    avgHr: hrN > 0 ? hrSum / hrN : undefined,
    avgCad: cadN > 0 ? cadSum / cadN : undefined,
    maxSpeedKmh: maxSpeed,
    avgPower: pwrN > 0 ? pwrSum / pwrN : undefined,
    maxPower: pwrN > 0 ? pwrMax : undefined,
    normalizedPower,
    avgTemp: tempN > 0 ? tempSum / tempN : undefined,
  };

  const climbs = detectClimbs(points, dists, grades);
  const splits = computeSplits(points);

  return {
    name: parsed.name,
    rider: parsed.athleteName ?? riderFromFilename(filename),
    description: parsed.description,
    device: parsed.device,
    subSport: parsed.subSport,
    elapsedSec: parsed.elapsedSec,
    points,
    totals,
    climbs,
    splits,
    tzOffsetHours,
  };
}

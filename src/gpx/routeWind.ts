import type { TrackPoint } from "./analyze";

export type HourlyWind = {
  times: string[];
  speedsKmh: number[];
  gustsKmh: number[];
  directionsDeg: number[];
  tempsC: number[];
  apparentTempsC: number[];
  precipProbPct: number[];
  precipMm: number[];
  humidityPct: number[];
  cloudCoverPct: number[];
  uvIndex: number[];
  weatherCodes: number[];
};

export type WindSegment = {
  fromKm: number;
  toKm: number;
  bearingDeg: number;
  /** + tailwind, − headwind (km/h component along direction of travel) */
  windComponent: number;
  windSpeedKmh: number;
  windDirDeg: number;
  segmentTimeMs: number;
  tempC: number;
};

export type RouteWindAnalysis = {
  segments: WindSegment[];
  avgWindComponent: number;
  tailwindKm: number;
  headwindKm: number;
  crosswindKm: number;
  worstHeadwindKmh: number;
  bestTailwindKmh: number;
  estDurationSec: number;
};

/** Hourly weather snapshot for a single point in time */
export type WeatherSnapshot = {
  timeMs: number;
  tempC: number;
  apparentTempC: number;
  windSpeedKmh: number;
  gustKmh: number;
  windDirDeg: number;
  precipProbPct: number;
  precipMm: number;
  humidityPct: number;
  cloudCoverPct: number;
  uvIndex: number;
  weatherCode: number;
};

/** Aggregate weather over the full ride window (start→finish) */
export type RideWeatherSummary = {
  start: WeatherSnapshot;
  mid: WeatherSnapshot;
  finish: WeatherSnapshot;
  /** min/max over the window */
  minTempC: number;
  maxTempC: number;
  maxGustKmh: number;
  maxPrecipProbPct: number;
  totalPrecipMm: number;
  maxUvIndex: number;
  avgCloudCoverPct: number;
  avgHumidityPct: number;
};

function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLon = toRad(lon2 - lon1);
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const y = Math.sin(dLon) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Wind component along direction of travel.
 * Meteorological convention: windFromDeg is where wind comes FROM.
 * Returns: + = tailwind, − = headwind
 */
function windComponentKmh(
  travelBearingDeg: number,
  windFromDeg: number,
  windSpeedKmh: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const windToDeg = (windFromDeg + 180) % 360;
  const angleDiff = toRad(windToDeg - travelBearingDeg);
  return windSpeedKmh * Math.cos(angleDiff);
}

function closestIdx(hw: HourlyWind, utcMs: number): number {
  let bestIdx = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < hw.times.length; i++) {
    const diff = Math.abs(new Date(hw.times[i] + "Z").getTime() - utcMs);
    if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
  }
  return bestIdx;
}

function snapshotAt(hw: HourlyWind, utcMs: number): WeatherSnapshot {
  const i = closestIdx(hw, utcMs);
  return {
    timeMs: new Date(hw.times[i] + "Z").getTime(),
    tempC: hw.tempsC[i] ?? 0,
    apparentTempC: hw.apparentTempsC[i] ?? hw.tempsC[i] ?? 0,
    windSpeedKmh: hw.speedsKmh[i] ?? 0,
    gustKmh: hw.gustsKmh[i] ?? 0,
    windDirDeg: hw.directionsDeg[i] ?? 0,
    precipProbPct: hw.precipProbPct[i] ?? 0,
    precipMm: hw.precipMm[i] ?? 0,
    humidityPct: hw.humidityPct[i] ?? 0,
    cloudCoverPct: hw.cloudCoverPct[i] ?? 0,
    uvIndex: hw.uvIndex[i] ?? 0,
    weatherCode: hw.weatherCodes[i] ?? 0,
  };
}

function pickSlot(
  hw: HourlyWind,
  utcMs: number,
): { speedKmh: number; dirDeg: number; tempC: number; code: number } {
  const i = closestIdx(hw, utcMs);
  return {
    speedKmh: hw.speedsKmh[i] ?? 0,
    dirDeg: hw.directionsDeg[i] ?? 0,
    tempC: hw.tempsC[i] ?? 0,
    code: hw.weatherCodes[i] ?? 0,
  };
}

const SEGMENT_KM = 5;

export function analyzeRouteWind(
  points: TrackPoint[],
  hw: HourlyWind,
  departureMs: number,
  avgSpeedKmh: number,
): RouteWindAnalysis {
  const totalDistKm = points[points.length - 1].distFromStart / 1000;
  const estDurationSec = avgSpeedKmh > 0 ? (totalDistKm / avgSpeedKmh) * 3600 : 0;

  const segments: WindSegment[] = [];
  let fromKm = 0;

  while (fromKm < totalDistKm - 0.1) {
    const toKm = Math.min(fromKm + SEGMENT_KM, totalDistKm);
    const midKm = (fromKm + toKm) / 2;

    const fromM = fromKm * 1000;
    const toM = toKm * 1000;
    const segPts = points.filter((p) => p.distFromStart >= fromM && p.distFromStart <= toM);
    if (segPts.length < 2) { fromKm = toKm; continue; }

    const first = segPts[0];
    const last = segPts[segPts.length - 1];
    const bearing = bearingDeg(first.lat, first.lon, last.lat, last.lon);

    const segTimeMs = departureMs + (midKm / avgSpeedKmh) * 3600 * 1000;
    const slot = pickSlot(hw, segTimeMs);
    const wc = windComponentKmh(bearing, slot.dirDeg, slot.speedKmh);

    segments.push({
      fromKm,
      toKm,
      bearingDeg: bearing,
      windComponent: wc,
      windSpeedKmh: slot.speedKmh,
      windDirDeg: slot.dirDeg,
      segmentTimeMs: segTimeMs,
      tempC: slot.tempC,
    });

    fromKm = toKm;
  }

  let twKm = 0, hwKm = 0, cwKm = 0;
  let wcSum = 0, totalKm = 0;
  let worstHW = 0, bestTW = 0;

  for (const seg of segments) {
    const km = seg.toKm - seg.fromKm;
    const wc = seg.windComponent;
    wcSum += wc * km;
    totalKm += km;
    if (wc > 2) twKm += km;
    else if (wc < -2) hwKm += km;
    else cwKm += km;
    if (wc < worstHW) worstHW = wc;
    if (wc > bestTW) bestTW = wc;
  }

  return {
    segments,
    avgWindComponent: totalKm > 0 ? wcSum / totalKm : 0,
    tailwindKm: twKm,
    headwindKm: hwKm,
    crosswindKm: cwKm,
    worstHeadwindKmh: worstHW,
    bestTailwindKmh: bestTW,
    estDurationSec,
  };
}

/** Build aggregate weather summary for the ride window */
export function buildRideWeatherSummary(
  hw: HourlyWind,
  departureMs: number,
  estDurationSec: number,
): RideWeatherSummary {
  const finishMs = departureMs + estDurationSec * 1000;
  const midMs = (departureMs + finishMs) / 2;

  const start = snapshotAt(hw, departureMs);
  const mid = snapshotAt(hw, midMs);
  const finish = snapshotAt(hw, finishMs);

  // Collect all hourly indices within ride window
  const windowIndices: number[] = [];
  for (let i = 0; i < hw.times.length; i++) {
    const t = new Date(hw.times[i] + "Z").getTime();
    if (t >= departureMs - 1800000 && t <= finishMs + 1800000) windowIndices.push(i);
  }
  if (windowIndices.length === 0) windowIndices.push(closestIdx(hw, departureMs));

  let minT = Infinity, maxT = -Infinity;
  let maxGust = 0, maxPrecipProb = 0, totalPrecip = 0;
  let maxUv = 0, cloudSum = 0, humSum = 0;

  for (const i of windowIndices) {
    const t = hw.tempsC[i] ?? 0;
    if (t < minT) minT = t;
    if (t > maxT) maxT = t;
    const g = hw.gustsKmh[i] ?? 0;
    if (g > maxGust) maxGust = g;
    const pp = hw.precipProbPct[i] ?? 0;
    if (pp > maxPrecipProb) maxPrecipProb = pp;
    totalPrecip += hw.precipMm[i] ?? 0;
    const uv = hw.uvIndex[i] ?? 0;
    if (uv > maxUv) maxUv = uv;
    cloudSum += hw.cloudCoverPct[i] ?? 0;
    humSum += hw.humidityPct[i] ?? 0;
  }

  return {
    start, mid, finish,
    minTempC: minT === Infinity ? start.tempC : minT,
    maxTempC: maxT === -Infinity ? start.tempC : maxT,
    maxGustKmh: maxGust,
    maxPrecipProbPct: maxPrecipProb,
    totalPrecipMm: totalPrecip,
    maxUvIndex: maxUv,
    avgCloudCoverPct: cloudSum / windowIndices.length,
    avgHumidityPct: humSum / windowIndices.length,
  };
}

const HOURLY_VARS = [
  "wind_speed_10m",
  "wind_gusts_10m",
  "wind_direction_10m",
  "temperature_2m",
  "apparent_temperature",
  "precipitation_probability",
  "precipitation",
  "relative_humidity_2m",
  "cloud_cover",
  "uv_index",
  "weather_code",
].join(",");

/** Fetch multi-hour forecast/archive for a lat/lon on a given date */
export async function fetchHourlyWind(
  lat: number,
  lon: number,
  dateIso: string,
): Promise<HourlyWind | null> {
  const latS = lat.toFixed(4);
  const lonS = lon.toFixed(4);

  const tryParse = (json: Record<string, unknown>): HourlyWind | null => {
    const h = json.hourly as Record<string, unknown> | undefined;
    if (!h) return null;
    const times = h.time as string[] | undefined;
    const speeds = h.wind_speed_10m as number[] | undefined;
    const dirs = h.wind_direction_10m as number[] | undefined;
    if (!times?.length || !speeds?.length || !dirs?.length) return null;
    const n = times.length;
    const fill = (arr: unknown, fallback = 0) =>
      Array.isArray(arr) ? (arr as number[]) : new Array(n).fill(fallback);
    return {
      times,
      speedsKmh: speeds,
      gustsKmh: fill(h.wind_gusts_10m),
      directionsDeg: dirs,
      tempsC: fill(h.temperature_2m),
      apparentTempsC: fill(h.apparent_temperature),
      precipProbPct: fill(h.precipitation_probability),
      precipMm: fill(h.precipitation),
      humidityPct: fill(h.relative_humidity_2m),
      cloudCoverPct: fill(h.cloud_cover),
      uvIndex: fill(h.uv_index),
      weatherCodes: fill(h.weather_code),
    };
  };

  try {
    const forecastUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${latS}&longitude=${lonS}` +
      `&past_days=7&forecast_days=14&hourly=${HOURLY_VARS}&wind_speed_unit=kmh`;
    const res = await fetch(forecastUrl);
    if (res.ok) {
      const hw = tryParse(await res.json());
      if (hw) return hw;
    }

    // Archive for older dates (note: archive doesn't have all variables)
    const archiveVars = "wind_speed_10m,wind_gusts_10m,wind_direction_10m,temperature_2m,apparent_temperature,precipitation,relative_humidity_2m,cloud_cover,weather_code";
    const archiveUrl =
      `https://api.open-meteo.com/v1/archive?latitude=${latS}&longitude=${lonS}` +
      `&start_date=${dateIso}&end_date=${dateIso}&hourly=${archiveVars}&wind_speed_unit=kmh`;
    const res2 = await fetch(archiveUrl);
    if (!res2.ok) return null;
    return tryParse(await res2.json());
  } catch {
    return null;
  }
}

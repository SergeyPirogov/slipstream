import FitParser from "fit-file-parser";
import type { ParsedGpx, RawPoint } from "./parse";

function parseFitBuffer(buf: ArrayBuffer): Promise<any> {
  return new Promise((resolve, reject) => {
    const fit = new FitParser({
      force: true,
      speedUnit: "km/h",
      lengthUnit: "m",
      temperatureUnit: "celsius",
      elapsedRecordField: true,
      mode: "cascade",
    });
    fit.parse(buf, (err: string | undefined, data: any) => {
      if (err) return reject(new Error(err));
      resolve(data);
    });
  });
}

export async function parseFitFile(file: File): Promise<ParsedGpx> {
  const buf = await file.arrayBuffer();
  const data = await parseFitBuffer(buf);

  // Records live under data.activity.sessions[].laps[].records (cascade)
  // or under data.records (list). Handle both.
  const records: any[] =
    data?.activity?.sessions?.flatMap((s: any) =>
      (s.laps ?? []).flatMap((l: any) => l.records ?? []),
    ) ?? data?.records ?? [];

  const points: RawPoint[] = [];
  for (const r of records) {
    const lat = r.position_lat;
    const lon = r.position_long;
    if (typeof lat !== "number" || typeof lon !== "number") continue;
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
    const t = r.timestamp instanceof Date ? r.timestamp : new Date(r.timestamp);
    if (Number.isNaN(t.getTime())) continue;
    const ele = typeof r.altitude === "number"
      ? r.altitude
      : typeof r.enhanced_altitude === "number" ? r.enhanced_altitude : 0;
    const point: RawPoint = { lat, lon, ele, t };
    if (typeof r.heart_rate === "number" && r.heart_rate > 0) point.hr = r.heart_rate;
    if (typeof r.cadence === "number") point.cad = r.cadence;
    if (typeof r.temperature === "number") point.atemp = r.temperature;
    if (typeof r.power === "number" && r.power >= 0) point.power = r.power;
    points.push(point);
  }

  if (points.length < 2) {
    throw new Error("FIT file has fewer than 2 GPS-tagged records");
  }

  const sport = data?.activity?.sessions?.[0]?.sport ?? data?.sessions?.[0]?.sport;
  const name = file.name.replace(/\.fit$/i, "");

  return {
    name,
    type: sport,
    points,
  };
}

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

  const session = data?.activity?.sessions?.[0] ?? data?.sessions?.[0];
  const sport = session?.sport;
  const subSport = session?.sub_sport && session.sub_sport !== "generic" ? session.sub_sport : undefined;
  const elapsedSec = typeof session?.total_elapsed_time === "number" ? session.total_elapsed_time : undefined;
  const name = file.name.replace(/\.fit$/i, "");

  const deviceInfos: any[] = data?.device_infos ?? data?.activity?.device_infos ?? [];
  const primaryDevice = deviceInfos.find((d: any) => d.device_index === "creator" || d.device_index === 0) ?? deviceInfos[0];
  let device: string | undefined;
  if (primaryDevice) {
    const parts = [primaryDevice.manufacturer, primaryDevice.product_name].filter(Boolean);
    if (parts.length > 0) device = parts.join(" ");
  }
  // Fall back to file_ids product name (e.g. "Sauce for Strava™")
  if (!device) {
    const fileId = data?.file_ids?.[0];
    if (fileId?.product_name) device = fileId.product_name;
  }

  const athleteName: string | undefined = data?.user_profile?.friendly_name || undefined;
  const weightKg: number | undefined = typeof data?.user_profile?.weight === "number" && data.user_profile.weight > 0
    ? data.user_profile.weight
    : undefined;

  return {
    name,
    type: sport,
    subSport,
    device,
    athleteName,
    weightKg,
    elapsedSec,
    points,
  };
}

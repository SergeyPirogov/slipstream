import { XMLParser } from "fast-xml-parser";

export type RawPoint = {
  lat: number;
  lon: number;
  ele: number;
  t: Date;
  hr?: number;
  cad?: number;
  atemp?: number;
  power?: number;
};

export type ParsedGpx = {
  name: string;
  description?: string;
  type?: string;
  subSport?: string;
  device?: string;
  athleteName?: string;
  weightKg?: number;
  elapsedSec?: number;
  points: RawPoint[];
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: true,
  isArray: (tagName) => ["trk", "trkseg", "trkpt"].includes(tagName),
});

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function extractExtensions(ext: any): Pick<RawPoint, "hr" | "cad" | "atemp"> {
  const out: Pick<RawPoint, "hr" | "cad" | "atemp"> = {};
  if (!ext) return out;
  const tpx = ext.TrackPointExtension ?? ext;
  if (!tpx) return out;
  if (tpx.hr !== undefined) out.hr = Number(tpx.hr);
  if (tpx.cad !== undefined) out.cad = Number(tpx.cad);
  if (tpx.atemp !== undefined) out.atemp = Number(tpx.atemp);
  return out;
}

export function parseGpx(xml: string): ParsedGpx {
  const doc = parser.parse(xml);
  const gpx = doc.gpx;
  if (!gpx) throw new Error("Not a GPX document");

  const trks = toArray<any>(gpx.trk);
  if (trks.length === 0) throw new Error("No <trk> element found");
  const trk = trks[0];

  const points: RawPoint[] = [];
  for (const seg of toArray<any>(trk.trkseg)) {
    for (const tp of toArray<any>(seg.trkpt)) {
      const lat = Number(tp.lat);
      const lon = Number(tp.lon);
      if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
      const timeStr = tp.time;
      if (!timeStr) continue;
      const t = new Date(timeStr);
      if (Number.isNaN(t.getTime())) continue;
      const ele = tp.ele !== undefined ? Number(tp.ele) : 0;
      const ext = extractExtensions(tp.extensions);
      points.push({ lat, lon, ele, t, ...ext });
    }
  }

  if (points.length < 2) throw new Error("Not enough track points to analyze");

  return {
    name: trk.name ?? "Untitled",
    description: trk.desc,
    type: trk.type,
    points,
  };
}

export async function parseGpxFile(file: File): Promise<ParsedGpx> {
  const text = await file.text();
  return parseGpx(text);
}

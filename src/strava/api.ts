import { getValidToken } from "./auth";

async function stravaFetch<T>(path: string): Promise<T> {
  const token = await getValidToken();
  if (!token) throw new Error("Not authenticated");
  const res = await fetch(`https://www.strava.com/api/v3${path}`, {
    headers: { Authorization: `Bearer ${token.accessToken}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("Strava API error", res.status, path, body);
    throw new Error(`Strava API error: ${res.status} — ${(body as any).message ?? ""}`);
  }
  return res.json() as Promise<T>;
}

export type StravaRoute = {
  id: string; // large int — must stay as string to avoid JS precision loss
  name: string;
  distance: number;
  elevation_gain: number;
  type: number;           // 1 = ride, 2 = run
  sub_type: number;       // 1 = road, 2 = mtb, 3 = cx, 4 = trail, 5 = mixed
  starred: boolean;
  created_at: string;
  map: { summary_polyline: string };
};

export type StravaSummaryActivity = {
  id: string; // large int — must stay as string to avoid JS precision loss
  name: string;
  distance: number;
  total_elevation_gain: number;
  type: string;
  start_date: string;
  map: { summary_polyline: string };
};

async function stravaFetchRaw(path: string): Promise<unknown> {
  const token = await getValidToken();
  if (!token) throw new Error("Not authenticated");
  const res = await fetch(`https://www.strava.com/api/v3${path}`, {
    headers: { Authorization: `Bearer ${token.accessToken}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("Strava API error", res.status, path, body);
    throw new Error(`Strava API error: ${res.status} — ${(body as any).message ?? ""}`);
  }
  // Replace bare large integers in JSON text before parsing to avoid JS precision loss
  const text = await res.text();
  const safe = text.replace(/:\s*(\d{16,})/g, (_m, n) => `: "${n}"`);
  return JSON.parse(safe);
}

export async function fetchMyRoutes(page = 1): Promise<StravaRoute[]> {
  const athlete = await stravaFetch<{ id: number }>("/athlete");
  return stravaFetchRaw(`/athletes/${athlete.id}/routes?per_page=30&page=${page}`) as Promise<StravaRoute[]>;
}

export async function fetchRouteGpx(routeId: string): Promise<string> {
  const route = await stravaFetchRaw(`/routes/${routeId}`) as {
    name: string;
    map: { polyline: string; summary_polyline: string };
  };

  const polyline = route.map?.polyline ?? route.map?.summary_polyline;
  if (!polyline) throw new Error("Route has no polyline data");

  const coords = decodePolyline(polyline);
  if (coords.length === 0) throw new Error("Could not decode route polyline");

  const trkpts = coords
    .map(([lat, lon, ele]) =>
      `    <trkpt lat="${lat}" lon="${lon}">${ele !== undefined ? `<ele>${ele}</ele>` : ""}</trkpt>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Slipstream">
  <trk><name>${escapeXml(route.name)}</name><trkseg>
${trkpts}
  </trkseg></trk>
</gpx>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Decode Google encoded polyline (Strava uses precision 5 for latlng, precision 5 for elevation in route polylines)
function decodePolyline(encoded: string): [number, number, number?][] {
  const coords: [number, number, number?][] = [];
  let idx = 0;
  let lat = 0, lon = 0;

  while (idx < encoded.length) {
    let b: number, shift = 0, result = 0;
    do { b = encoded.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0; result = 0;
    do { b = encoded.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lon += result & 1 ? ~(result >> 1) : result >> 1;

    coords.push([lat / 1e5, lon / 1e5]);
  }
  return coords;
}

export async function fetchRecentActivities(page = 1): Promise<StravaSummaryActivity[]> {
  return stravaFetchRaw(`/athlete/activities?per_page=30&page=${page}`) as Promise<StravaSummaryActivity[]>;
}

export async function fetchActivityGpx(activityId: string): Promise<string> {
  const [latlng, altitude, time, activityData] = await Promise.all([
    stravaFetchRaw(`/activities/${activityId}/streams?keys=latlng&key_by_type=true`),
    stravaFetchRaw(`/activities/${activityId}/streams?keys=altitude&key_by_type=true`),
    stravaFetchRaw(`/activities/${activityId}/streams?keys=time&key_by_type=true`),
    stravaFetchRaw(`/activities/${activityId}`),
  ]) as [any, any, any, { start_date: string; name: string }];

  const coords = latlng.latlng?.data as [number, number][] ?? [];
  const alts = altitude.altitude?.data as number[] ?? [];
  const times = time.time?.data as number[] ?? [];
  const startMs = new Date(activityData.start_date).getTime();

  const trkpts = coords.map(([lat, lon], i) => {
    const t = new Date(startMs + (times[i] ?? 0) * 1000).toISOString();
    const ele = alts[i] ?? 0;
    return `    <trkpt lat="${lat}" lon="${lon}"><ele>${ele}</ele><time>${t}</time></trkpt>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Slipstream">
  <trk><name>${activityData.name}</name><trkseg>
${trkpts}
  </trkseg></trk>
</gpx>`;
}

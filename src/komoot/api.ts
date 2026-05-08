export type KomootTour = {
  id: string;
  name: string;
  distance: number;       // metres
  elevation_up: number;   // metres
  sport: string;
  date: string;           // ISO
};

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Parse a Komoot share URL and return { tourId, shareToken } or null */
export function parseKomootUrl(url: string): { tourId: string; shareToken: string } | null {
  try {
    const u = new URL(url.trim());
    const match = u.pathname.match(/\/tour\/(\d+)/);
    if (!match) return null;
    const tourId = match[1];
    const shareToken = u.searchParams.get("share_token");
    if (!shareToken) return null;
    return { tourId, shareToken };
  } catch {
    return null;
  }
}

/** Fetch tour metadata + coordinates and return a GPX string */
export async function fetchKomootTourGpx(tourId: string, shareToken: string): Promise<{ gpx: string; tour: KomootTour }> {
  const base = `https://api.komoot.de/v007/tours/${tourId}?share_token=${encodeURIComponent(shareToken)}`;

  const [tourRes, coordRes] = await Promise.all([
    fetch(base),
    fetch(`https://api.komoot.de/v007/tours/${tourId}/coordinates?share_token=${encodeURIComponent(shareToken)}`),
  ]);

  if (!tourRes.ok) throw new Error(`Komoot: tour not found or link expired (${tourRes.status})`);
  if (!coordRes.ok) throw new Error(`Komoot: could not fetch coordinates (${coordRes.status})`);

  const tourData = await tourRes.json() as {
    id: number;
    name: string;
    distance: number;
    elevation_up: number;
    sport: string;
    date: string;
  };

  const coordData = await coordRes.json() as {
    items: { lat: number; lng: number; alt: number; t: number }[];
  };

  const tour: KomootTour = {
    id: String(tourData.id),
    name: tourData.name,
    distance: tourData.distance,
    elevation_up: tourData.elevation_up,
    sport: tourData.sport,
    date: tourData.date,
  };

  const trkpts = coordData.items.map((p) =>
    `    <trkpt lat="${p.lat}" lon="${p.lng}"><ele>${p.alt}</ele></trkpt>`,
  ).join("\n");

  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Slipstream">
  <trk><name>${escapeXml(tour.name)}</name><trkseg>
${trkpts}
  </trkseg></trk>
</gpx>`;

  return { gpx, tour };
}

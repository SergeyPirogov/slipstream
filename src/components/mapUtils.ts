import L from "leaflet";

/**
 * Place direction-arrow markers along a lat/lon path.
 *
 * Arrows are spaced every `spacingM` metres (default 2 km) and are
 * oriented along the local bearing of the track.
 *
 * Returns the added markers so the caller can remove them on cleanup.
 */
export function addDirectionArrows(
  map: L.Map,
  latlngs: [number, number][],
  color: string,
  spacingM = 2000,
): L.Marker[] {
  if (latlngs.length < 2) return [];

  const markers: L.Marker[] = [];

  // Accumulate distance; plant an arrow each time we cross a spacing boundary
  let nextThreshM = spacingM;
  let accumM = 0;

  for (let i = 1; i < latlngs.length; i++) {
    const [lat0, lon0] = latlngs[i - 1];
    const [lat1, lon1] = latlngs[i];

    // Approximate segment length in metres
    const dLat = (lat1 - lat0) * 111320;
    const dLon = (lon1 - lon0) * 111320 * Math.cos((((lat0 + lat1) / 2) * Math.PI) / 180);
    const segM = Math.sqrt(dLat * dLat + dLon * dLon);

    if (accumM + segM >= nextThreshM) {
      // Interpolate the exact placement point along this segment
      const t = (nextThreshM - accumM) / segM;
      const lat = lat0 + t * (lat1 - lat0);
      const lon = lon0 + t * (lon1 - lon0);

      // Bearing from previous point to next point (degrees, 0 = north)
      const bearingRad = Math.atan2(dLon, dLat);
      const bearingDeg = (bearingRad * 180) / Math.PI;

      const icon = arrowIcon(color, bearingDeg);
      const marker = L.marker([lat, lon], { icon, interactive: false, keyboard: false }).addTo(map);
      markers.push(marker);

      nextThreshM += spacingM;
    }

    accumM += segM;
  }

  return markers;
}

function arrowIcon(color: string, bearingDeg: number): L.DivIcon {
  // Chevron pointing up (north) then rotated by bearingDeg
  return L.divIcon({
    className: "",
    html: `<svg width="16" height="16" viewBox="-8 -8 16 16" style="display:block;pointer-events:none;transform:rotate(${bearingDeg}deg)">
      <polyline points="0,-6 6,2 0,-1 -6,2" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" opacity="0.9"/>
    </svg>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

import { useEffect, useRef } from "react";
import L from "leaflet";
import { useStore } from "../store";
import { addDirectionArrows } from "./mapUtils";

const HEADWIND_THRESHOLD = -2;
const TAILWIND_THRESHOLD = 2;

function segmentColor(wc: number): string {
  if (wc <= HEADWIND_THRESHOLD) {
    const t = Math.min(1, Math.abs(wc) / 20);
    const r = Math.round(220 + 35 * t);
    const gb = Math.round(80 - 60 * t);
    return `rgb(${r},${gb},${gb})`;
  }
  if (wc >= TAILWIND_THRESHOLD) {
    const t = Math.min(1, wc / 20);
    const g = Math.round(160 + 55 * t);
    const rb = Math.round(80 - 60 * t);
    return `rgb(${rb},${g},${rb})`;
  }
  return "#a0a8b0";
}

// Blue (cold) → cyan → green → yellow → orange → red (hot)
function tempColor(tempC: number): string {
  const stops: [number, [number, number, number]][] = [
    [-10, [100, 149, 237]],
    [0,   [70,  200, 240]],
    [10,  [120, 220, 120]],
    [20,  [255, 220,  60]],
    [30,  [255, 140,  20]],
    [40,  [220,  40,  40]],
  ];
  if (tempC <= stops[0][0]) return `rgb(${stops[0][1].join(",")})`;
  if (tempC >= stops[stops.length - 1][0]) return `rgb(${stops[stops.length - 1][1].join(",")})`;
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (tempC >= t0 && tempC <= t1) {
      const f = (tempC - t0) / (t1 - t0);
      return `rgb(${Math.round(c0[0] + f * (c1[0] - c0[0]))},${Math.round(c0[1] + f * (c1[1] - c0[1]))},${Math.round(c0[2] + f * (c1[2] - c0[2]))})`;
    }
  }
  return "#aaa";
}

// Shift a polyline laterally by `metres` perpendicular to its bearing (positive = right)
function offsetPolyline(
  latlngs: [number, number][],
  metres: number,
): [number, number][] {
  if (latlngs.length < 2 || metres === 0) return latlngs;
  const RAD = Math.PI / 180;
  // Average bearing of the segment
  const first = latlngs[0];
  const last = latlngs[latlngs.length - 1];
  const dLat = last[0] - first[0];
  const dLon = (last[1] - first[1]) * Math.cos(((first[0] + last[0]) / 2) * RAD);
  const bearing = Math.atan2(dLon, dLat); // radians
  // Perpendicular bearing (bearing + 90°)
  const perpBearing = bearing + Math.PI / 2;
  // ~111320 m per degree of latitude
  const dLatOff = (metres * Math.cos(perpBearing)) / 111320;
  const dLonOff = (metres * Math.sin(perpBearing)) / (111320 * Math.cos(((first[0] + last[0]) / 2) * RAD));
  return latlngs.map(([lat, lon]) => [lat + dLatOff, lon + dLonOff]);
}

function windArrowIcon(dirDeg: number, wc: number): L.DivIcon {
  const rotateDeg = dirDeg + 180;
  const color = segmentColor(wc);
  return L.divIcon({
    className: "",
    html: `<svg width="28" height="28" viewBox="-14 -14 28 28" style="display:block;opacity:0.75">
      <g transform="rotate(${rotateDeg})">
        <line x1="0" y1="10" x2="0" y2="-6" stroke="#1a1a1a" stroke-width="4.5" stroke-linecap="round"/>
        <line x1="0" y1="10" x2="0" y2="-6" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
        <polygon points="0,-12 -5,0 5,0" fill="#1a1a1a" stroke="#1a1a1a" stroke-width="2.5" stroke-linejoin="round"/>
        <polygon points="0,-12 -5,0 5,0" fill="${color}"/>
      </g>
    </svg>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function tempLabelIcon(tempC: number): L.DivIcon {
  const color = tempColor(tempC);
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};color:#111;font-size:10px;font-weight:700;padding:2px 5px;border-radius:10px;white-space:nowrap;border:1px solid rgba(0,0,0,0.2);box-shadow:0 1px 3px rgba(0,0,0,0.4);transform:translate(-50%,-50%)">${tempC.toFixed(0)}°</div>`,
    iconSize: [40, 20],
    // Anchor shifted down so the label floats 28px above the route point
    iconAnchor: [20, 58],
  });
}

export function RoutePlannerMap() {
  const plan = useStore((s) => s.plan);
  const windLoading = useStore((s) => s.plan.windLoading);
  const routeLoading = useStore((s) => s.plan.routeLoading);
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const arrowsRef = useRef<L.Marker[]>([]);
  const tempLabelsRef = useRef<L.Marker[]>([]);
  const dirArrowsRef = useRef<L.Marker[]>([]);
  const hoverMarkerRef = useRef<L.CircleMarker | null>(null);

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: false,
      preferCanvas: false,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);
    L.control.zoom({ position: "topright" }).addTo(map);
    routeLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Draw route + wind colours + temperature labels
  useEffect(() => {
    const map = mapRef.current;
    const layer = routeLayerRef.current;
    if (!map || !layer) return;

    // Don't draw while loading — avoids grey→colored flash
    if (windLoading || routeLoading) return;

    layer.clearLayers();
    arrowsRef.current.forEach((m) => m.remove());
    arrowsRef.current = [];
    tempLabelsRef.current.forEach((m) => m.remove());
    tempLabelsRef.current = [];
    dirArrowsRef.current.forEach((m) => m.remove());
    dirArrowsRef.current = [];

    const { route, windAnalysis } = plan;
    if (!route || route.points.length < 2) return;

    // Fade in the overlay pane after drawing
    const overlayPane = map.getPane("overlayPane");
    const markerPane = map.getPane("markerPane");
    if (overlayPane) { overlayPane.style.transition = "none"; overlayPane.style.opacity = "0"; }
    if (markerPane) { markerPane.style.transition = "none"; markerPane.style.opacity = "0"; }

    const pts = route.points;

    if (windAnalysis && windAnalysis.segments.length > 0) {
      const totalDistM = pts[pts.length - 1].distFromStart;
      const startPt = pts[0];
      const endPt = pts[pts.length - 1];
      const endDistM = Math.sqrt(
        Math.pow((endPt.lat - startPt.lat) * 111320, 2) +
        Math.pow((endPt.lon - startPt.lon) * 111320 * Math.cos(startPt.lat * Math.PI / 180), 2),
      );
      const isRoundTrip = endDistM < 500;
      const halfDistM = totalDistM / 2;

      for (const seg of windAnalysis.segments) {
        const fromM = seg.fromKm * 1000;
        const toM = seg.toKm * 1000;
        const segPts = pts.filter((p) => p.distFromStart >= fromM && p.distFromStart <= toM);
        if (segPts.length < 2) continue;
        const raw = segPts.map((p) => [p.lat, p.lon] as [number, number]);
        const midM = (fromM + toM) / 2;
        const latlngs = isRoundTrip && midM > halfDistM ? offsetPolyline(raw, 12) : raw;
        L.polyline(latlngs, {
          color: segmentColor(seg.windComponent),
          weight: 5,
          opacity: 0.9,
        }).addTo(layer);
      }

      // Wind arrows + temperature labels every 10 km
      for (const seg of windAnalysis.segments) {
        if (seg.fromKm % 10 >= 5) continue;
        const midM = ((seg.fromKm + seg.toKm) / 2) * 1000;
        const pt = pts.reduce((best, p) =>
          Math.abs(p.distFromStart - midM) < Math.abs(best.distFromStart - midM) ? p : best,
        );

        const arrowMarker = L.marker([pt.lat, pt.lon], { icon: windArrowIcon(seg.windDirDeg, seg.windComponent) }).addTo(map);
        arrowsRef.current.push(arrowMarker);
      }
    } else {
      const latlngs = pts.map((p) => [p.lat, p.lon] as [number, number]);
      L.polyline(latlngs, { color: "#6b7280", weight: 4, opacity: 0.8 }).addTo(layer);
    }

    // Direction arrows along the full route
    const fullLatlngs = pts.map((p) => [p.lat, p.lon] as [number, number]);
    dirArrowsRef.current = addDirectionArrows(map, fullLatlngs, "#e2e8f0");

    // Start / end markers
    const startPt = pts[0];
    const endPt = pts[pts.length - 1];
    L.circleMarker([startPt.lat, startPt.lon], {
      radius: 8, color: "#fff", weight: 2, fillColor: "#22c55e", fillOpacity: 1,
    }).bindTooltip("Start").addTo(layer);
    L.circleMarker([endPt.lat, endPt.lon], {
      radius: 8, color: "#fff", weight: 2, fillColor: "#ef4444", fillOpacity: 1,
    }).bindTooltip("Finish").addTo(layer);

    const latlngs = pts.map((p) => [p.lat, p.lon] as [number, number]);
    map.fitBounds(L.latLngBounds(latlngs), { padding: [40, 40] });

    // Fade in after fitBounds settles
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (overlayPane) { overlayPane.style.transition = "opacity 0.6s ease"; overlayPane.style.opacity = "1"; }
        if (markerPane) { markerPane.style.transition = "opacity 0.6s ease"; markerPane.style.opacity = "1"; }
      });
    });
  }, [plan.route, plan.windAnalysis, windLoading, routeLoading]);

  // Elevation-chart hover → map pointer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const pts = plan.route?.points;
    if (!pts || pts.length === 0 || plan.hoverKm === null) {
      hoverMarkerRef.current?.remove();
      hoverMarkerRef.current = null;
      return;
    }

    const targetM = plan.hoverKm * 1000;
    let lo = 0, hi = pts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pts[mid].distFromStart < targetM) lo = mid + 1;
      else hi = mid;
    }
    const pt = pts[lo];

    const seg = plan.windAnalysis?.segments.find(
      (s) => plan.hoverKm! >= s.fromKm && plan.hoverKm! <= s.toKm,
    );
    const wc = seg?.windComponent;
    const color = wc === undefined ? "#facc15"
      : wc > 2 ? "#22c55e"
      : wc < -2 ? "#ef4444"
      : "#a0a8b0";

    if (hoverMarkerRef.current) {
      hoverMarkerRef.current.remove();
      hoverMarkerRef.current = null;
    }
    hoverMarkerRef.current = L.circleMarker([pt.lat, pt.lon], {
      radius: 7,
      color: "#fff",
      weight: 2,
      fillColor: color,
      fillOpacity: 1,
      pane: "markerPane",
    }).addTo(map);
  }, [plan.hoverKm, plan.route, plan.windAnalysis]);

  const hasWind = !!(plan.windAnalysis && plan.windAnalysis.segments.length > 0);

  return (
    <div className="plan-map-wrap">
      <div ref={containerRef} className="plan-map" />
      {hasWind && (
        <div className="map-legend">
          <span className="ml-tail">▬ Tailwind</span>
          <span className="ml-cross">▬ Cross</span>
          <span className="ml-head">▬ Headwind</span>
        </div>
      )}
      {(routeLoading || plan.windLoading) && (
        <div className="map-loading-overlay">
          <svg className="map-loading-spinner" viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 2a10 10 0 0 1 10 10" />
          </svg>
          <span>{routeLoading ? "Loading route…" : "Fetching wind…"}</span>
        </div>
      )}
    </div>
  );
}

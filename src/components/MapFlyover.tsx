import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { useStore, useMaxValue } from "../store";
import { buildSyncArrays, positionAtValue, queryValues } from "../gpx/align";
import { addDirectionArrows } from "./mapUtils";

const COLOR_A = "#f97316";
const COLOR_B = "#3b82f6";

type Stats = { speedKmh: number; hr?: number; power?: number };

function statsLine(s: Stats): string {
  const parts: string[] = [`${s.speedKmh.toFixed(1)} km/h`];
  if (s.hr !== undefined) parts.push(`${Math.round(s.hr)} bpm`);
  if (s.power !== undefined) parts.push(`${Math.round(s.power)} W`);
  return parts.join(" · ");
}

function makeRiderIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: "rider-marker",
    html: `
      <div style="
        background:${color};
        border:2px solid #fff;
        border-radius:50%;
        width:14px;
        height:14px;
        box-shadow:0 2px 6px rgba(0,0,0,0.5);
        pointer-events:none;
      "></div>
    `,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function setTextIfChanged(el: HTMLElement | null, text: string) {
  if (!el) return;
  if (el.textContent !== text) el.textContent = text;
}

function positionGapOverlay(
  el: HTMLDivElement | null,
  pxA: { x: number; y: number },
  pxB: { x: number; y: number },
  text: string,
  tint: "pos" | "neg" | "neutral" = "neutral",
) {
  if (!el) return;
  const cx = (pxA.x + pxB.x) / 2;
  // Sit above whichever rider is higher on screen (smaller y), clear of the tether labels.
  const cy = Math.min(pxA.y, pxB.y) - 46;
  el.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
  el.style.display = "";
  el.classList.remove("gap-pos", "gap-neg", "gap-neutral");
  el.classList.add(`gap-${tint}`);
  setTextIfChanged(el.querySelector(".gap-overlay-text"), text);
}

function degToCardinal(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}

function weatherLabel(code: number): string {
  if (code === 0) return "Clear";
  if (code === 1) return "Mainly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code <= 49) return "Fog";
  if (code <= 59) return "Drizzle";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Rain showers";
  if (code <= 86) return "Snow showers";
  if (code <= 99) return "Thunderstorm";
  return "";
}

function fmtHMS(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function MapFlyover() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const lineARef = useRef<L.Polyline | null>(null);
  const lineBRef = useRef<L.Polyline | null>(null);
  const segARef = useRef<L.Polyline | null>(null);
  const segBRef = useRef<L.Polyline | null>(null);
  const markerARef = useRef<L.Marker | null>(null);
  const markerBRef = useRef<L.Marker | null>(null);
  const gapOverlayRef = useRef<HTMLDivElement | null>(null);
  const gapLabelTextRef = useRef<string>("");
  const gapTintRef = useRef<"pos" | "neg" | "neutral">("neutral");
  const windArrowsRef = useRef<L.Marker[]>([]);
  const dirArrowsARef = useRef<L.Marker[]>([]);
  const dirArrowsBRef = useRef<L.Marker[]>([]);

  const [liveA, setLiveA] = useState<Stats | null>(null);
  const [liveB, setLiveB] = useState<Stats | null>(null);

  const trackA = useStore((s) => s.trackA);
  const trackB = useStore((s) => s.trackB);
  const syncMode = useStore((s) => s.syncMode);
  const progress = useStore((s) => s.progress);
  const playing = useStore((s) => s.playing);
  const offsetSec = useStore((s) => s.offsetSec);
  const segmentM = useStore((s) => s.segmentM);
  const wind = useStore((s) => s.wind);
  const maxValue = useMaxValue();

  const syncA = useMemo(() => (trackA ? buildSyncArrays(trackA) : null), [trackA]);
  const syncB = useMemo(() => (trackB ? buildSyncArrays(trackB) : null), [trackB]);

  // Init map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [49.8, 24],
      zoom: 10,
      zoomControl: true,
      preferCanvas: false,
      scrollWheelZoom: true,
      wheelPxPerZoomLevel: 100,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      doubleClickZoom: true,
      worldCopyJump: true,
      inertia: true,
      inertiaDeceleration: 2500,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    // Tile layer definitions (first is the initial active layer).
    const LAYER_ICONS = {
      osm: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6z"/><path d="M9 4v16M15 6v16"/></svg>`,
      topo: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 19l5-8 4 6 3-4 6 6"/><path d="M3 15l5-7 4 5 3-3 6 5"/></svg>`,
      sat: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 010 18M12 3a15 15 0 000 18"/></svg>`,
      hot: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-8-5-8-12a8 8 0 0116 0c0 7-8 12-8 12z"/><circle cx="12" cy="9" r="2.5"/></svg>`,
    };
    const LAYERS: { name: string; icon: string; layer: L.TileLayer }[] = [
      {
        name: "OSM",
        icon: LAYER_ICONS.osm,
        layer: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap contributors",
          maxZoom: 19,
        }),
      },
      {
        name: "Topo",
        icon: LAYER_ICONS.topo,
        layer: L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
          attribution: "Map data: © OpenStreetMap, SRTM | style: © OpenTopoMap (CC-BY-SA)",
          maxZoom: 17,
        }),
      },
      {
        name: "Satellite",
        icon: LAYER_ICONS.sat,
        layer: L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          {
            attribution: "Tiles © Esri, Maxar, Earthstar Geographics",
            maxZoom: 19,
          },
        ),
      },
      {
        name: "HOT",
        icon: LAYER_ICONS.hot,
        layer: L.tileLayer("https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap France, © OpenStreetMap contributors",
          maxZoom: 20,
        }),
      },
    ];
    // Remove the placeholder we already added above — we'll manage layers ourselves.
    map.eachLayer((l) => { if (l instanceof L.TileLayer) map.removeLayer(l); });
    let activeLayerIdx = 0;
    LAYERS[0].layer.addTo(map);

    const LayerCycleControl = L.Control.extend({
      onAdd() {
        const a = L.DomUtil.create("a", "leaflet-bar leaflet-control fit-control") as HTMLAnchorElement;
        a.href = "#";
        a.setAttribute("role", "button");
        a.innerHTML = LAYERS[0].icon;
        a.title = `Switch map layer (now: ${LAYERS[0].name})`;
        L.DomEvent.on(a, "click", (ev: Event) => {
          ev.preventDefault();
          map.removeLayer(LAYERS[activeLayerIdx].layer);
          activeLayerIdx = (activeLayerIdx + 1) % LAYERS.length;
          LAYERS[activeLayerIdx].layer.addTo(map);
          a.innerHTML = LAYERS[activeLayerIdx].icon;
          a.title = `Switch map layer (now: ${LAYERS[activeLayerIdx].name})`;
        });
        L.DomEvent.disableClickPropagation(a);
        return a;
      },
    });
    new LayerCycleControl({ position: "topright" }).addTo(map);

    // Custom control: fit the map bounds to both route lines.
    const FitControl = L.Control.extend({
      onAdd() {
        const a = L.DomUtil.create("a", "leaflet-bar leaflet-control fit-control") as HTMLAnchorElement;
        a.href = "#";
        a.title = "Fit routes";
        a.setAttribute("role", "button");
        a.setAttribute("aria-label", "Fit routes");
        a.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>`;
        L.DomEvent.on(a, "click", (ev: Event) => {
          ev.preventDefault();
          const group: L.Layer[] = [];
          if (lineARef.current) group.push(lineARef.current);
          if (lineBRef.current) group.push(lineBRef.current);
          if (group.length > 0) {
            const fg = L.featureGroup(group);
            map.fitBounds(fg.getBounds(), { padding: [40, 40] });
          }
        });
        L.DomEvent.disableClickPropagation(a);
        return a;
      },
    });
    new FitControl({ position: "topright" }).addTo(map);

    // Zoom preset buttons.
    const makeZoomPreset = (level: number) =>
      L.Control.extend({
        onAdd() {
          const a = L.DomUtil.create("a", "leaflet-bar leaflet-control fit-control") as HTMLAnchorElement;
          a.href = "#";
          a.title = `Zoom to ${level}`;
          a.setAttribute("role", "button");
          a.setAttribute("aria-label", `Zoom to ${level}`);
          a.textContent = String(level);
          L.DomEvent.on(a, "click", (ev: Event) => {
            ev.preventDefault();
            map.setZoom(level);
          });
          L.DomEvent.disableClickPropagation(a);
          return a;
        },
      });
    new (makeZoomPreset(10.8))({ position: "topright" }).addTo(map);
    new (makeZoomPreset(12.8))({ position: "topright" }).addTo(map);
    new (makeZoomPreset(15))({ position: "topright" }).addTo(map);
    new (makeZoomPreset(18))({ position: "topright" }).addTo(map);

    // Zoom-level indicator (updates on every zoom event).
    const ZoomIndicator = L.Control.extend({
      onAdd() {
        const div = L.DomUtil.create("div", "leaflet-bar leaflet-control zoom-indicator");
        div.textContent = `z ${map.getZoom().toFixed(1)}`;
        const update = () => {
          div.textContent = `z ${map.getZoom().toFixed(1)}`;
        };
        map.on("zoom zoomend", update);
        (div as any)._cleanup = () => map.off("zoom zoomend", update);
        return div;
      },
      onRemove(_m: L.Map) {
        /* no-op; map is removed whole */
      },
    });
    new ZoomIndicator({ position: "bottomright" }).addTo(map);

    // Keyboard: PageUp / PageDown zoom in/out by 0.5 levels. Home/End zoom to 10 / 15.
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "PageUp") {
        e.preventDefault();
        map.setZoom(map.getZoom() + 0.5);
      } else if (e.key === "PageDown") {
        e.preventDefault();
        map.setZoom(map.getZoom() - 0.5);
      }
    };
    window.addEventListener("keydown", onKey);

    mapRef.current = map;

    // Invalidate size once the container is laid out.
    requestAnimationFrame(() => map.invalidateSize());

    return () => {
      window.removeEventListener("keydown", onKey);
      windArrowsRef.current.forEach((m) => m.remove());
      windArrowsRef.current = [];
      dirArrowsARef.current.forEach((m) => m.remove());
      dirArrowsARef.current = [];
      dirArrowsBRef.current.forEach((m) => m.remove());
      dirArrowsBRef.current = [];
      map.remove();
      mapRef.current = null;
      lineARef.current = null;
      lineBRef.current = null;
      segARef.current = null;
      segBRef.current = null;
      markerARef.current = null;
      markerBRef.current = null;
    };
  }, []);

  // Resize safety: observe container size and invalidate.
  useEffect(() => {
    const el = containerRef.current;
    const map = mapRef.current;
    if (!el || !map) return;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Render/refresh tracks.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear previous direction arrows before redrawing
    dirArrowsARef.current.forEach((m) => m.remove());
    dirArrowsARef.current = [];
    dirArrowsBRef.current.forEach((m) => m.remove());
    dirArrowsBRef.current = [];

    // Track A
    if (trackA) {
      const latlngs = trackA.points.map((p) => [p.lat, p.lon] as [number, number]);
      if (lineARef.current) {
        lineARef.current.setLatLngs(latlngs);
      } else {
        lineARef.current = L.polyline(latlngs, {
          color: COLOR_A,
          weight: 4,
          opacity: 0.9,
        }).addTo(map);
      }
      dirArrowsARef.current = addDirectionArrows(map, latlngs, "#1e3a5f");
      if (!markerARef.current) {
        markerARef.current = L.marker(latlngs[0], { icon: makeRiderIcon(COLOR_A) }).addTo(map);
      } else {
        markerARef.current.setLatLng(latlngs[0]);
      }
    } else {
      if (lineARef.current) { lineARef.current.remove(); lineARef.current = null; }
      if (markerARef.current) { markerARef.current.remove(); markerARef.current = null; }
    }

    // Track B
    if (trackB) {
      const latlngs = trackB.points.map((p) => [p.lat, p.lon] as [number, number]);
      if (lineBRef.current) {
        lineBRef.current.setLatLngs(latlngs);
      } else {
        lineBRef.current = L.polyline(latlngs, {
          color: COLOR_B,
          weight: 4,
          opacity: 0.9,
        }).addTo(map);
      }
      dirArrowsBRef.current = addDirectionArrows(map, latlngs, "#1e3a5f");
      if (!markerBRef.current) {
        markerBRef.current = L.marker(latlngs[0], { icon: makeRiderIcon(COLOR_B) }).addTo(map);
      } else {
        markerBRef.current.setLatLng(latlngs[0]);
      }
    } else {
      if (lineBRef.current) { lineBRef.current.remove(); lineBRef.current = null; }
      if (markerBRef.current) { markerBRef.current.remove(); markerBRef.current = null; }
    }

    // Fit bounds over whatever's loaded.
    const group: L.Layer[] = [];
    if (lineARef.current) group.push(lineARef.current);
    if (lineBRef.current) group.push(lineBRef.current);
    if (group.length > 0) {
      const fg = L.featureGroup(group);
      map.fitBounds(fg.getBounds(), { padding: [40, 40] });
    }
  }, [trackA, trackB]);

  // Segment highlight overlays.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const draw = (
      track: typeof trackA,
      ref: React.MutableRefObject<L.Polyline | null>,
    ) => {
      if (segmentM && track) {
        const pts = track.points
          .filter((p) => p.distFromStart >= segmentM.start && p.distFromStart <= segmentM.end)
          .map((p) => [p.lat, p.lon] as [number, number]);
        if (pts.length > 1) {
          if (ref.current) {
            ref.current.setLatLngs(pts);
          } else {
            ref.current = L.polyline(pts, { color: "#22c55e", weight: 5, opacity: 0.85 }).addTo(map);
          }
          return;
        }
      }
      if (ref.current) { ref.current.remove(); ref.current = null; }
    };

    draw(trackA, segARef);
    draw(trackB, segBRef);
  }, [segmentM, trackA, trackB]);

  // Wind arrows along the route — one every SPACING_M metres.
  useEffect(() => {
    const map = mapRef.current;
    windArrowsRef.current.forEach((m) => m.remove());
    windArrowsRef.current = [];
    if (!map || !wind || !trackA) return;

    const SPACING_M = 5000;
    const rotateDeg = wind.directionDeg + 180;
    const pts = trackA.points;
    let nextDist = SPACING_M;
    for (const p of pts) {
      if (p.distFromStart < nextDist) continue;
      nextDist += SPACING_M;
      const icon = L.divIcon({
        className: "",
        html: `<svg width="32" height="32" viewBox="-16 -16 32 32" style="display:block;opacity:0.5">
          <g transform="rotate(${rotateDeg})">
            <line x1="0" y1="11" x2="0" y2="-11" stroke="#1a1a1a" stroke-width="5" stroke-linecap="round"/>
            <line x1="0" y1="11" x2="0" y2="-11" stroke="#facc15" stroke-width="2.5" stroke-linecap="round"/>
            <polygon points="0,-15 5.5,-6 -5.5,-6" fill="#1a1a1a" stroke="#1a1a1a" stroke-width="3" stroke-linejoin="round"/>
            <polygon points="0,-15 5.5,-6 -5.5,-6" fill="#facc15"/>
          </g>
        </svg>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
      windArrowsRef.current.push(
        L.marker([p.lat, p.lon], { icon, interactive: false, keyboard: false }).addTo(map),
      );
    }
  }, [wind, trackA]);

  // Animate markers + follow camera on playback.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !trackA || !syncA) return;

    const target = progress * maxValue;
    const arrA = syncMode === "time" ? syncA.time : syncA.distance;
    const aValue = target;
    const posA = positionAtValue(trackA, arrA, aValue);
    const pxA = map.latLngToContainerPoint([posA.lat, posA.lon]);
    const statsA: Stats = { speedKmh: posA.speedKmh, hr: posA.hr, power: posA.power3s ?? posA.power };

    markerARef.current?.setLatLng([posA.lat, posA.lon]);

    if (trackB && syncB) {
      const arrB = syncMode === "time" ? syncB.time : syncB.distance;
      const { aValue: aVal2, bValue, aFinished, bFinished } = queryValues(
        target, syncMode, arrA[arrA.length - 1], arrB[arrB.length - 1], offsetSec,
      );
      const posA2 = positionAtValue(trackA, arrA, aVal2);
      const posB = positionAtValue(trackB, arrB, bValue);
      const pxA2 = map.latLngToContainerPoint([posA2.lat, posA2.lon]);
      const pxB = map.latLngToContainerPoint([posB.lat, posB.lon]);
      const statsB: Stats = { speedKmh: bFinished ? 0 : posB.speedKmh, hr: posB.hr, power: bFinished ? undefined : (posB.power3s ?? posB.power) };

      markerARef.current?.setLatLng([posA2.lat, posA2.lon]);
      markerBRef.current?.setLatLng([posB.lat, posB.lon]);
      setLiveA({ ...statsA, speedKmh: aFinished ? 0 : posA2.speedKmh });
      setLiveB(statsB);

      const refDist = Math.max(0, Math.min(posA2.distFromStart, posB.distFromStart, syncA.distance[syncA.distance.length - 1], syncB.distance[syncB.distance.length - 1]));
      const dPosA = positionAtValue(trackA, syncA.distance, refDist);
      const dPosB = positionAtValue(trackB, syncB.distance, refDist);
      const timeDelta = dPosB.elapsedSec + offsetSec - dPosA.elapsedSec;
      const gapKm = Math.abs(posA2.distFromStart - posB.distFromStart) / 1000;
      const timePart = Math.abs(timeDelta) < 0.5 ? "0s" : `${timeDelta > 0 ? "+" : "−"}${fmtHMS(Math.abs(timeDelta))}`;
      const waitSuffix = (aFinished || bFinished) ? ` · ${aFinished ? trackA.rider : trackB.rider} finished` : "";
      const label = `${gapKm.toFixed(2)} km · ${timePart}${waitSuffix}`;
      const tint: "pos" | "neg" | "neutral" = Math.abs(timeDelta) < 0.5 ? "neutral" : timeDelta > 0 ? "pos" : "neg";
      positionGapOverlay(gapOverlayRef.current, pxA2, pxB, label, tint);
      gapLabelTextRef.current = label;
      gapTintRef.current = tint;

      if (playing) {
        map.panTo([(posA2.lat + posB.lat) / 2, (posA2.lon + posB.lon) / 2], { animate: true, duration: 0.3 });
      }
    } else {
      if (gapOverlayRef.current) gapOverlayRef.current.style.display = "none";
      setLiveA(statsA);
      setLiveB(null);
      if (playing) map.panTo([posA.lat, posA.lon], { animate: true, duration: 0.3 });
    }
  }, [progress, syncMode, maxValue, trackA, trackB, syncA, syncB, playing, offsetSec]);

  // Keep gap overlay anchored during map pan/zoom.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handler = () => {
      const mA = markerARef.current;
      const mB = markerBRef.current;
      if (!mA || !mB) return;
      const pxA = map.latLngToContainerPoint(mA.getLatLng());
      const pxB = map.latLngToContainerPoint(mB.getLatLng());
      positionGapOverlay(gapOverlayRef.current, pxA, pxB, gapLabelTextRef.current, gapTintRef.current);
    };
    map.on("move zoom", handler);
    return () => { map.off("move zoom", handler); };
  }, [trackA, trackB]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={containerRef} id="map" style={{ width: "100%", height: "100%" }} />

      <div ref={gapOverlayRef} className="gap-overlay-label">
        <span className="gap-overlay-text">—</span>
      </div>

      {(liveA || liveB) && (trackA || trackB) && (
        <div className="map-live-panel">
          {trackA && liveA && (
            <div className="map-live-row">
              <span className="map-live-dot" style={{ background: COLOR_A }} />
              <div className="map-live-info">
                <span className="map-live-name">{trackA.rider}</span>
                <span className="map-live-stats">
                  <span>{liveA.speedKmh.toFixed(1)} km/h</span>
                  {liveA.hr !== undefined && <span>{Math.round(liveA.hr)} bpm</span>}
                  {liveA.power !== undefined && <span>{Math.round(liveA.power)} W</span>}
                </span>
              </div>
            </div>
          )}
          {trackB && liveB && (
            <div className="map-live-row">
              <span className="map-live-dot" style={{ background: COLOR_B }} />
              <div className="map-live-info">
                <span className="map-live-name">{trackB.rider}</span>
                <span className="map-live-stats">
                  <span>{liveB.speedKmh.toFixed(1)} km/h</span>
                  {liveB.hr !== undefined && <span>{Math.round(liveB.hr)} bpm</span>}
                  {liveB.power !== undefined && <span>{Math.round(liveB.power)} W</span>}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {wind && (
        <div className="map-wind-overlay" style={{
          position: "absolute", bottom: 28, left: 10, zIndex: 1000,
          background: "rgba(30,36,50,0.62)", border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 8, padding: "7px 11px",
          display: "flex", flexDirection: "column", gap: 5,
          fontSize: 11, color: "var(--fg)", backdropFilter: "blur(4px)",
          pointerEvents: "none", lineHeight: 1.4,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="24" height="24" viewBox="-12 -12 24 24" style={{ flexShrink: 0 }}>
              <g transform={`rotate(${wind.directionDeg + 180})`}>
                <line x1="0" y1="9" x2="0" y2="-9" stroke="#facc15" strokeWidth="2" strokeLinecap="round" />
                <polygon points="0,-12 3.5,-5 -3.5,-5" fill="#facc15" />
              </g>
            </svg>
            <div>
              <span style={{ fontWeight: 600 }}>{Math.round(wind.speedKmh)} km/h</span>
              <span style={{ color: "var(--fg-dim)", marginLeft: 5 }}>from {degToCardinal(wind.directionDeg)}</span>
            </div>
          </div>
          {wind.tempC !== undefined && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--fg-dim)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
              </svg>
              <span><span style={{ fontWeight: 600 }}>{Math.round(wind.tempC)}°C</span>{wind.weatherCode !== undefined && <span style={{ color: "var(--fg-dim)", marginLeft: 5 }}>{weatherLabel(wind.weatherCode)}</span>}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

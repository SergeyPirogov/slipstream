import { useEffect, useMemo, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useStore, useMaxValue } from "../store";
import { buildSyncArrays, positionAtValue, queryValues } from "../gpx/align";

const COLOR_A = "#f97316";
const COLOR_B = "#3b82f6";
const TETHER_DX = 140;
const TETHER_DY = 0;

type Stats = { speedKmh: number; hr?: number; power?: number };

function setTextIfChanged(el: HTMLElement | null, text: string) {
  if (!el) return;
  if (el.textContent !== text) el.textContent = text;
}

function fmtHMS(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function positionTetheredLabel(
  labelEl: HTMLDivElement | null,
  leaderEl: SVGLineElement | null,
  anchor: { x: number; y: number },
  name: string,
  stats: Stats | null,
  dx: number,
  dy: number,
) {
  if (!labelEl || !leaderEl) return;
  const lx = anchor.x + dx;
  const ly = anchor.y + dy;
  labelEl.style.transform = `translate(${lx}px, ${ly}px) translate(-50%, -50%)`;
  labelEl.style.display = "";
  leaderEl.style.display = "";
  setTextIfChanged(labelEl.querySelector(".tether-name"), name);
  if (stats) {
    setTextIfChanged(labelEl.querySelector(".tether-speed"), `${stats.speedKmh.toFixed(1)} km/h`);
    const hrEl = labelEl.querySelector(".tether-hr") as HTMLElement | null;
    if (hrEl) {
      if (stats.hr !== undefined) { setTextIfChanged(hrEl, `${Math.round(stats.hr)} bpm`); hrEl.style.display = ""; }
      else hrEl.style.display = "none";
    }
    const powerEl = labelEl.querySelector(".tether-power") as HTMLElement | null;
    if (powerEl) {
      if (stats.power !== undefined) { setTextIfChanged(powerEl, `${Math.round(stats.power)} W`); powerEl.style.display = ""; }
      else powerEl.style.display = "none";
    }
  }
  leaderEl.setAttribute("x1", String(anchor.x));
  leaderEl.setAttribute("y1", String(anchor.y));
  leaderEl.setAttribute("x2", String(lx));
  leaderEl.setAttribute("y2", String(ly));
}

function positionGapOverlay(
  el: HTMLDivElement | null,
  pxA: { x: number; y: number },
  pxB: { x: number; y: number },
  text: string,
  tint: "pos" | "neg" | "neutral",
) {
  if (!el) return;
  const cx = (pxA.x + pxB.x) / 2;
  const cy = Math.min(pxA.y, pxB.y) - 46;
  el.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
  el.style.display = "";
  el.classList.remove("gap-pos", "gap-neg", "gap-neutral");
  el.classList.add(`gap-${tint}`);
  setTextIfChanged(el.querySelector(".gap-overlay-text"), text);
}

function makeMarkerEl(color: string): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = `
    width:14px;height:14px;border-radius:50%;
    background:${color};border:2px solid #fff;
    box-shadow:0 2px 6px rgba(0,0,0,0.5);pointer-events:none;
  `;
  return el;
}

export function Map3D() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerARef = useRef<maplibregl.Marker | null>(null);
  const markerBRef = useRef<maplibregl.Marker | null>(null);
  const labelARef = useRef<HTMLDivElement | null>(null);
  const labelBRef = useRef<HTMLDivElement | null>(null);
  const leaderSvgRef = useRef<SVGSVGElement | null>(null);
  const leaderARef = useRef<SVGLineElement | null>(null);
  const leaderBRef = useRef<SVGLineElement | null>(null);
  const gapOverlayRef = useRef<HTMLDivElement | null>(null);
  const gapLabelTextRef = useRef<string>("");
  const gapTintRef = useRef<"pos" | "neg" | "neutral">("neutral");
  const fittedRef = useRef(false);
  const styleLoadedRef = useRef(false);

  const trackA = useStore((s) => s.trackA);
  const trackB = useStore((s) => s.trackB);
  const syncMode = useStore((s) => s.syncMode);
  const progress = useStore((s) => s.progress);
  const playing = useStore((s) => s.playing);
  const offsetSec = useStore((s) => s.offsetSec);
  const maxValue = useMaxValue();

  const syncA = useMemo(() => (trackA ? buildSyncArrays(trackA) : null), [trackA]);
  const syncB = useMemo(() => (trackB ? buildSyncArrays(trackB) : null), [trackB]);

  // Init map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      // OpenFreeMap liberty style — free, no token
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [24, 49.8],
      zoom: 10,
      pitch: 60,
      bearing: 0,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

    map.on("load", () => {
      styleLoadedRef.current = true;

      map.addSource("track-a", { type: "geojson", data: { type: "Feature", geometry: { type: "LineString", coordinates: [] }, properties: {} } });
      map.addSource("track-b", { type: "geojson", data: { type: "Feature", geometry: { type: "LineString", coordinates: [] }, properties: {} } });

      map.addLayer({ id: "track-a-line", type: "line", source: "track-a", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": COLOR_A, "line-width": 4, "line-opacity": 0.9 } });
      map.addLayer({ id: "track-b-line", type: "line", source: "track-b", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": COLOR_B, "line-width": 4, "line-opacity": 0.9 } });

      // If tracks were already loaded before style finished, render them now.
      const tA = trackA;
      const tB = trackB;
      if (tA) {
        (map.getSource("track-a") as maplibregl.GeoJSONSource).setData({ type: "Feature", geometry: { type: "LineString", coordinates: tA.points.map((p) => [p.lon, p.lat]) }, properties: {} });
        markerARef.current?.setLngLat([tA.points[0].lon, tA.points[0].lat]);
      }
      if (tB) {
        (map.getSource("track-b") as maplibregl.GeoJSONSource).setData({ type: "Feature", geometry: { type: "LineString", coordinates: tB.points.map((p) => [p.lon, p.lat]) }, properties: {} });
        markerBRef.current?.setLngLat([tB.points[0].lon, tB.points[0].lat]);
      }
      if (!fittedRef.current && tA && tB) {
        fitBounds(map, tA.points.concat(tB.points));
        fittedRef.current = true;
      }
    });

    markerARef.current = new maplibregl.Marker({ element: makeMarkerEl(COLOR_A), anchor: "center" }).setLngLat([24, 49.8]).addTo(map);
    markerBRef.current = new maplibregl.Marker({ element: makeMarkerEl(COLOR_B), anchor: "center" }).setLngLat([24, 49.8]).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markerARef.current = null;
      markerBRef.current = null;
      fittedRef.current = false;
      styleLoadedRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render tracks when loaded.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;

    if (trackA) {
      (map.getSource("track-a") as maplibregl.GeoJSONSource)?.setData({ type: "Feature", geometry: { type: "LineString", coordinates: trackA.points.map((p) => [p.lon, p.lat]) }, properties: {} });
      markerARef.current?.setLngLat([trackA.points[0].lon, trackA.points[0].lat]);
    }
    if (trackB) {
      (map.getSource("track-b") as maplibregl.GeoJSONSource)?.setData({ type: "Feature", geometry: { type: "LineString", coordinates: trackB.points.map((p) => [p.lon, p.lat]) }, properties: {} });
      markerBRef.current?.setLngLat([trackB.points[0].lon, trackB.points[0].lat]);
    }
    if (!fittedRef.current && trackA && trackB) {
      fitBounds(map, trackA.points.concat(trackB.points));
      fittedRef.current = true;
    }
  }, [trackA, trackB]);

  // Animate markers + labels.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !trackA || !trackB || !syncA || !syncB) return;

    const target = progress * maxValue;
    const arrA = syncMode === "time" ? syncA.time : syncA.distance;
    const arrB = syncMode === "time" ? syncB.time : syncB.distance;
    const { aValue, bValue } = queryValues(target, syncMode, arrA[arrA.length - 1], arrB[arrB.length - 1], offsetSec);
    const posA = positionAtValue(trackA, arrA, aValue);
    const posB = positionAtValue(trackB, arrB, bValue);

    markerARef.current?.setLngLat([posA.lon, posA.lat]);
    markerBRef.current?.setLngLat([posB.lon, posB.lat]);

    const pxA = map.project([posA.lon, posA.lat]);
    const pxB = map.project([posB.lon, posB.lat]);

    const statsA: Stats = { speedKmh: posA.speedKmh, hr: posA.hr, power: posA.power3s ?? posA.power };
    const statsB: Stats = { speedKmh: posB.speedKmh, hr: posB.hr, power: posB.power3s ?? posB.power };

    positionTetheredLabel(labelARef.current, leaderARef.current, pxA, trackA.rider, statsA, -TETHER_DX, TETHER_DY);
    positionTetheredLabel(labelBRef.current, leaderBRef.current, pxB, trackB.rider, statsB, TETHER_DX, TETHER_DY);

    const gapMeters = Math.abs(posA.distFromStart - posB.distFromStart);
    const refDist = Math.max(0, Math.min(posA.distFromStart, posB.distFromStart, syncA.distance[syncA.distance.length - 1], syncB.distance[syncB.distance.length - 1]));
    const dPosA = positionAtValue(trackA, syncA.distance, refDist);
    const dPosB = positionAtValue(trackB, syncB.distance, refDist);
    const timeDelta = dPosB.elapsedSec + offsetSec - dPosA.elapsedSec;
    const distLabel = `${(gapMeters / 1000).toFixed(2)} km`;
    const timePart = Math.abs(timeDelta) < 0.5 ? "0s" : `${timeDelta > 0 ? "+" : "−"}${fmtHMS(Math.abs(timeDelta))}`;
    const label = `${distLabel} · ${timePart}`;
    const tint: "pos" | "neg" | "neutral" = Math.abs(timeDelta) < 0.5 ? "neutral" : timeDelta > 0 ? "pos" : "neg";

    positionGapOverlay(gapOverlayRef.current, pxA, pxB, label, tint);
    gapLabelTextRef.current = label;
    gapTintRef.current = tint;

    if (playing) {
      map.easeTo({ center: [(posA.lon + posB.lon) / 2, (posA.lat + posB.lat) / 2], duration: 300 });
    }
  }, [progress, syncMode, maxValue, trackA, trackB, syncA, syncB, playing, offsetSec]);

  // Re-anchor labels on pan/zoom.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handler = () => {
      const mA = markerARef.current?.getLngLat();
      const mB = markerBRef.current?.getLngLat();
      if (!mA || !mB) return;
      const pxA = map.project(mA);
      const pxB = map.project(mB);
      positionTetheredLabel(labelARef.current, leaderARef.current, pxA, trackA?.rider ?? "", null, -TETHER_DX, TETHER_DY);
      positionTetheredLabel(labelBRef.current, leaderBRef.current, pxB, trackB?.rider ?? "", null, TETHER_DX, TETHER_DY);
      positionGapOverlay(gapOverlayRef.current, pxA, pxB, gapLabelTextRef.current, gapTintRef.current);
    };
    map.on("move", handler);
    map.on("zoom", handler);
    return () => { map.off("move", handler); map.off("zoom", handler); };
  }, [trackA, trackB]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      <svg ref={leaderSvgRef} className="tether-svg">
        <line ref={leaderARef} className="tether-leader tether-leader-a" stroke={COLOR_A} />
        <line ref={leaderBRef} className="tether-leader tether-leader-b" stroke={COLOR_B} />
      </svg>

      <div ref={gapOverlayRef} className="gap-overlay-label">
        <span className="gap-overlay-text">—</span>
      </div>

      <div ref={labelARef} className="tether-label tether-label-a" style={{ borderColor: COLOR_A }}>
        <span className="tether-dot" style={{ background: COLOR_A }} />
        <div className="tether-lines">
          <span className="tether-name">—</span>
          <span className="tether-stats">
            <span className="tether-speed">—</span>
            <span className="tether-hr">—</span>
            <span className="tether-power">—</span>
          </span>
        </div>
      </div>
      <div ref={labelBRef} className="tether-label tether-label-b" style={{ borderColor: COLOR_B }}>
        <span className="tether-dot" style={{ background: COLOR_B }} />
        <div className="tether-lines">
          <span className="tether-name">—</span>
          <span className="tether-stats">
            <span className="tether-speed">—</span>
            <span className="tether-hr">—</span>
            <span className="tether-power">—</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function fitBounds(map: maplibregl.Map, points: { lat: number; lon: number }[]) {
  const lngs = points.map((p) => p.lon);
  const lats = points.map((p) => p.lat);
  map.fitBounds(
    [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
    { padding: 60, pitch: 60, duration: 1000 },
  );
}

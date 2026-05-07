import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { useStore, useMaxValue } from "../store";
import { buildSyncArrays, positionAtValue, queryValues } from "../gpx/align";

const COLOR_A = "#f97316";
const COLOR_B = "#3b82f6";

// Tether offsets (in screen pixels). A label stays on the left, B on the right.
const TETHER_DX_A = 140;
const TETHER_DX_B = -140;
const TETHER_DY = 0;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  }[c] as string));
}

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
) {
  if (!el) return;
  const cx = (pxA.x + pxB.x) / 2;
  const cy = pxA.y; // align with rider A's row
  el.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
  el.style.display = "";
  setTextIfChanged(el.querySelector(".gap-overlay-text"), text);
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
      if (stats.hr !== undefined) {
        setTextIfChanged(hrEl, `${Math.round(stats.hr)} bpm`);
        hrEl.style.display = "";
      } else {
        hrEl.style.display = "none";
      }
    }
    const powerEl = labelEl.querySelector(".tether-power") as HTMLElement | null;
    if (powerEl) {
      if (stats.power !== undefined) {
        setTextIfChanged(powerEl, `${Math.round(stats.power)} W`);
        powerEl.style.display = "";
      } else {
        powerEl.style.display = "none";
      }
    }
  }
  leaderEl.setAttribute("x1", String(anchor.x));
  leaderEl.setAttribute("y1", String(anchor.y));
  leaderEl.setAttribute("x2", String(lx));
  leaderEl.setAttribute("y2", String(ly));
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
  const markerARef = useRef<L.Marker | null>(null);
  const markerBRef = useRef<L.Marker | null>(null);
  const labelARef = useRef<HTMLDivElement | null>(null);
  const labelBRef = useRef<HTMLDivElement | null>(null);
  const leaderSvgRef = useRef<SVGSVGElement | null>(null);
  const leaderARef = useRef<SVGLineElement | null>(null);
  const leaderBRef = useRef<SVGLineElement | null>(null);
  const gapOverlayRef = useRef<HTMLDivElement | null>(null);
  const gapLabelTextRef = useRef<string>("");

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
    const map = L.map(containerRef.current, {
      center: [49.8, 24],
      zoom: 10,
      zoomControl: true,
      preferCanvas: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    // Invalidate size once the container is laid out.
    requestAnimationFrame(() => map.invalidateSize());

    return () => {
      map.remove();
      mapRef.current = null;
      lineARef.current = null;
      lineBRef.current = null;
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

  // Animate markers + follow camera on playback.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !trackA || !trackB || !syncA || !syncB) return;

    const target = progress * maxValue;
    const arrA = syncMode === "time" ? syncA.time : syncA.distance;
    const arrB = syncMode === "time" ? syncB.time : syncB.distance;
    const { aValue, bValue } = queryValues(
      target,
      syncMode,
      arrA[arrA.length - 1],
      arrB[arrB.length - 1],
      offsetSec,
    );
    const posA = positionAtValue(trackA, arrA, aValue);
    const posB = positionAtValue(trackB, arrB, bValue);

    // Pixel positions for leader-line math.
    const pxA = map.latLngToContainerPoint([posA.lat, posA.lon]);
    const pxB = map.latLngToContainerPoint([posB.lat, posB.lon]);

    // Fixed sides: A label always to the left, B always to the right.
    const dxA = -Math.abs(TETHER_DX_A);
    const dxB = Math.abs(TETHER_DX_A);
    const dyA = TETHER_DY;
    const dyB = TETHER_DY;

    const statsA: Stats = {
      speedKmh: posA.speedKmh,
      hr: posA.hr,
      power: posA.power3s ?? posA.power,
    };
    const statsB: Stats = {
      speedKmh: posB.speedKmh,
      hr: posB.hr,
      power: posB.power3s ?? posB.power,
    };

    // Move markers.
    markerARef.current?.setLatLng([posA.lat, posA.lon]);
    markerBRef.current?.setLatLng([posB.lat, posB.lon]);

    // Tethered labels + leader lines carry the rider name + live stats off the map geometry.
    positionTetheredLabel(labelARef.current, leaderARef.current, pxA, trackA.rider, statsA, dxA, dyA);
    positionTetheredLabel(labelBRef.current, leaderBRef.current, pxB, trackB.rider, statsB, dxB, dyB);

    // Gap line + label between the two riders.
    const gapMeters = Math.abs(posA.distFromStart - posB.distFromStart);
    const MIN_GAP_M = 40; // below this, drop the line (noise) but keep an "even" label
    const showLine = gapMeters > MIN_GAP_M;

    // Ghost-race Δ time at the common distance (shared clock).
    const refDist = Math.max(
      0,
      Math.min(
        posA.distFromStart,
        posB.distFromStart,
        syncA.distance[syncA.distance.length - 1],
        syncB.distance[syncB.distance.length - 1],
      ),
    );
    const dPosA = positionAtValue(trackA, syncA.distance, refDist);
    const dPosB = positionAtValue(trackB, syncB.distance, refDist);
    const timeDelta = dPosB.elapsedSec + offsetSec - dPosA.elapsedSec;

    let label: string;
    if (showLine) {
      const distKm = gapMeters / 1000;
      const distLabel = distKm >= 1 ? `${distKm.toFixed(2)} km` : `${Math.round(gapMeters)} m`;
      const timeLabel = Math.abs(timeDelta) < 0.5 ? "" : ` · ${timeDelta > 0 ? "+" : "−"}${fmtHMS(Math.abs(timeDelta))}`;
      label = distLabel + timeLabel;
    } else {
      label = "even · 0s";
    }

    positionGapOverlay(gapOverlayRef.current, pxA, pxB, label);
    gapLabelTextRef.current = label;

    if (playing) {
      const midLat = (posA.lat + posB.lat) / 2;
      const midLng = (posA.lon + posB.lon) / 2;
      map.panTo([midLat, midLng], { animate: true, duration: 0.3 });
    }
  }, [progress, syncMode, maxValue, trackA, trackB, syncA, syncB, playing, offsetSec]);

  // Keep tethered labels + leader lines anchored during map pan/zoom (these fire outside
  // the animation effect). We reuse each marker's current LatLng, no position lookup.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handler = () => {
      const mA = markerARef.current;
      const mB = markerBRef.current;
      if (!mA || !mB) return;
      const latA = mA.getLatLng();
      const latB = mB.getLatLng();
      const pxA = map.latLngToContainerPoint(latA);
      const pxB = map.latLngToContainerPoint(latB);
      const absDx = Math.abs(TETHER_DX_A);
      positionTetheredLabel(labelARef.current, leaderARef.current, pxA, trackA?.rider ?? "", null, -absDx, TETHER_DY);
      positionTetheredLabel(labelBRef.current, leaderBRef.current, pxB, trackB?.rider ?? "", null, absDx, TETHER_DY);
      positionGapOverlay(gapOverlayRef.current, pxA, pxB, gapLabelTextRef.current);
    };
    map.on("move zoom", handler);
    return () => { map.off("move zoom", handler); };
  }, [trackA, trackB]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={containerRef} id="map" style={{ width: "100%", height: "100%" }} />

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

import { useEffect, useRef } from "react";
import L from "leaflet";
import { useStore } from "../store";

const COLOR = "#f97316";

export function SingleRiderMap() {
  const track = useStore((s) => s.trackA);
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true, attributionControl: false });
    mapRef.current = map;
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
    }).addTo(map);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !track) return;

    const latlngs: [number, number][] = track.points.map((p) => [p.lat, p.lon]);
    const polyline = L.polyline(latlngs, { color: COLOR, weight: 3, opacity: 0.9 }).addTo(map);

    const startPt = latlngs[0];
    const endPt = latlngs[latlngs.length - 1];

    const dotIcon = (color: string) => L.divIcon({
      className: "",
      html: `<div style="background:${color};border:2px solid #fff;border-radius:50%;width:10px;height:10px;box-shadow:0 2px 4px rgba(0,0,0,0.5)"></div>`,
      iconSize: [10, 10],
      iconAnchor: [5, 5],
    });

    const startMarker = L.marker(startPt, { icon: dotIcon("#22c55e") }).addTo(map);
    const endMarker = L.marker(endPt, { icon: dotIcon("#ef4444") }).addTo(map);

    map.fitBounds(polyline.getBounds(), { padding: [24, 24] });

    return () => {
      polyline.remove();
      startMarker.remove();
      endMarker.remove();
    };
  }, [track]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}

import { useStore } from "../store";
import type { RideWeatherSummary, WeatherSnapshot } from "../gpx/routeWind";

// WMO weather interpretation codes → label + emoji
function weatherLabel(code: number): { label: string; emoji: string } {
  if (code === 0) return { label: "Clear sky", emoji: "☀️" };
  if (code === 1) return { label: "Mainly clear", emoji: "🌤️" };
  if (code === 2) return { label: "Partly cloudy", emoji: "⛅" };
  if (code === 3) return { label: "Overcast", emoji: "☁️" };
  if (code <= 9) return { label: "Foggy", emoji: "🌫️" };
  if (code <= 19) return { label: "Drizzle", emoji: "🌧️" };
  if (code <= 29) return { label: "Precipitation", emoji: "🌧️" };
  if (code <= 39) return { label: "Fog", emoji: "🌫️" };
  if (code <= 49) return { label: "Freezing fog", emoji: "🌫️" };
  if (code <= 59) return { label: "Drizzle", emoji: "🌦️" };
  if (code <= 69) return { label: "Rain", emoji: "🌧️" };
  if (code <= 79) return { label: "Snow", emoji: "❄️" };
  if (code <= 84) return { label: "Rain showers", emoji: "🌦️" };
  if (code <= 89) return { label: "Snow showers", emoji: "🌨️" };
  if (code <= 99) return { label: "Thunderstorm", emoji: "⛈️" };
  return { label: "Unknown", emoji: "🌡️" };
}

function degToCardinal(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}

function uvLabel(uv: number): { label: string; cls: string } {
  if (uv < 3) return { label: "Low", cls: "uv-low" };
  if (uv < 6) return { label: "Moderate", cls: "uv-mod" };
  if (uv < 8) return { label: "High", cls: "uv-high" };
  if (uv < 11) return { label: "Very high", cls: "uv-vhigh" };
  return { label: "Extreme", cls: "uv-extreme" };
}

function WindArrowSvg({ dirDeg, size = 16 }: { dirDeg: number; size?: number }) {
  const rotateDeg = dirDeg + 180;
  const h = size;
  const half = h / 2;
  return (
    <svg width={h} height={h} viewBox={`-${half} -${half} ${h} ${h}`} style={{ display: "inline-block", verticalAlign: "middle" }}>
      <g transform={`rotate(${rotateDeg})`}>
        <line x1="0" y1={half - 2} x2="0" y2={-half + 4} stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <polygon points={`0,${-half} ${-half / 2.5},${-half / 3} ${half / 2.5},${-half / 3}`} fill="currentColor" />
      </g>
    </svg>
  );
}

function SnapshotCol({ snap, label }: { snap: WeatherSnapshot; label: string }) {
  const { emoji } = weatherLabel(snap.weatherCode);
  const cardinal = degToCardinal(snap.windDirDeg);
  return (
    <div className="ws-col">
      <div className="ws-col-label">{label}</div>
      <div className="ws-emoji">{emoji}</div>
      <div className="ws-temp">{Math.round(snap.tempC)}°</div>
      <div className="ws-feels">feels {Math.round(snap.apparentTempC)}°</div>
      <div className="ws-wind">
        <WindArrowSvg dirDeg={snap.windDirDeg} size={13} />
        {" "}{Math.round(snap.windSpeedKmh)} km/h {cardinal}
      </div>
      {snap.gustKmh > snap.windSpeedKmh + 5 && (
        <div className="ws-gust">gusts {Math.round(snap.gustKmh)} km/h</div>
      )}
      {snap.precipProbPct > 5 && (
        <div className="ws-precip">💧 {Math.round(snap.precipProbPct)}%</div>
      )}
    </div>
  );
}

export function WeatherSummaryPanel() {
  const plan = useStore((s) => s.plan);
  const { weatherSummary: ws, windLoading } = plan;

  if (windLoading) {
    return (
      <div className="panel">
        <h3>Weather</h3>
        <div className="ws-loading">Fetching forecast…</div>
      </div>
    );
  }

  if (!ws) return null;

  const minT = Math.round(ws.minTempC);
  const maxT = Math.round(ws.maxTempC);
  const uv = uvLabel(ws.maxUvIndex);
  const hasPrecip = ws.maxPrecipProbPct > 5 || ws.totalPrecipMm > 0.1;
  const { label: startLabel } = weatherLabel(ws.start.weatherCode);

  return (
    <div className="panel">
      <h3>Weather forecast</h3>

      {/* Condition headline */}
      <div className="ws-headline">
        <span className="ws-headline-emoji">{weatherLabel(ws.start.weatherCode).emoji}</span>
        <span>{startLabel}</span>
        <span className="ws-temp-range">{minT}° – {maxT}°C</span>
      </div>

      {/* Three-column snapshot: start / mid / finish */}
      <div className="ws-cols">
        <SnapshotCol snap={ws.start} label="Start" />
        <SnapshotCol snap={ws.mid} label="Mid" />
        <SnapshotCol snap={ws.finish} label="Finish" />
      </div>

      {/* Summary stats row */}
      <div className="ws-stats">
        {ws.maxGustKmh > 0 && (
          <div className="ws-stat">
            <span className="ws-stat-label">Max gusts</span>
            <span className="ws-stat-value">{Math.round(ws.maxGustKmh)} km/h</span>
          </div>
        )}
        <div className="ws-stat">
          <span className="ws-stat-label">Humidity</span>
          <span className="ws-stat-value">{Math.round(ws.avgHumidityPct)}%</span>
        </div>
        <div className="ws-stat">
          <span className="ws-stat-label">Cloud cover</span>
          <span className="ws-stat-value">{Math.round(ws.avgCloudCoverPct)}%</span>
        </div>
        {ws.maxUvIndex > 0 && (
          <div className="ws-stat">
            <span className="ws-stat-label">UV index</span>
            <span className={`ws-stat-value ${uv.cls}`}>{ws.maxUvIndex.toFixed(1)} · {uv.label}</span>
          </div>
        )}
        {hasPrecip && (
          <div className="ws-stat">
            <span className="ws-stat-label">Precip chance</span>
            <span className="ws-stat-value ws-precip-warn">{Math.round(ws.maxPrecipProbPct)}%{ws.totalPrecipMm > 0.1 ? ` · ${ws.totalPrecipMm.toFixed(1)} mm` : ""}</span>
          </div>
        )}
      </div>
    </div>
  );
}

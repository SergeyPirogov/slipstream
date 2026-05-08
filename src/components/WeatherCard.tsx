import { useStore } from "../store";

function degToCardinal(deg: number): string {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

// WMO weather interpretation codes → emoji + label
function describeWeatherCode(code: number): { emoji: string; label: string } {
  if (code === 0) return { emoji: "☀️", label: "Clear sky" };
  if (code === 1) return { emoji: "🌤️", label: "Mainly clear" };
  if (code === 2) return { emoji: "⛅", label: "Partly cloudy" };
  if (code === 3) return { emoji: "☁️", label: "Overcast" };
  if (code <= 49) return { emoji: "🌫️", label: "Fog" };
  if (code <= 59) return { emoji: "🌦️", label: "Drizzle" };
  if (code <= 67) return { emoji: "🌧️", label: "Rain" };
  if (code <= 77) return { emoji: "❄️", label: "Snow" };
  if (code <= 82) return { emoji: "🌧️", label: "Rain showers" };
  if (code <= 86) return { emoji: "🌨️", label: "Snow showers" };
  if (code <= 99) return { emoji: "⛈️", label: "Thunderstorm" };
  return { emoji: "🌡️", label: "Unknown" };
}

export function WeatherCard() {
  const wind = useStore((s) => s.wind);
  const trackA = useStore((s) => s.trackA);

  if (!trackA || !wind) return null;

  const { speedKmh, directionDeg, tempC, weatherCode } = wind;
  const cardinal = degToCardinal(directionDeg);
  const weather = weatherCode !== undefined ? describeWeatherCode(weatherCode) : null;
  const date = trackA.points[0].t.toISOString().slice(0, 10);

  return (
    <div className="panel weather-card">
      <h3>Weather · {date}</h3>
      <div className="weather-grid">
        <div className="weather-row">
          <svg width="22" height="22" viewBox="-11 -11 22 22" style={{ flexShrink: 0 }}>
            <g transform={`rotate(${directionDeg + 180})`}>
              <line x1="0" y1="8" x2="0" y2="-8" stroke="#facc15" strokeWidth="2" strokeLinecap="round" />
              <polygon points="0,-11 3.5,-5 -3.5,-5" fill="#facc15" />
            </g>
          </svg>
          <div className="weather-detail">
            <div className="weather-value">{Math.round(speedKmh)} km/h</div>
            <div className="weather-label">Wind · from {cardinal} ({Math.round(directionDeg)}°)</div>
          </div>
        </div>

        {tempC !== undefined && (
          <div className="weather-row">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: "var(--fg-dim)" }}>
              <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
            </svg>
            <div className="weather-detail">
              <div className="weather-value">{Math.round(tempC)}°C</div>
              <div className="weather-label">Temperature at ride start</div>
            </div>
          </div>
        )}

        {weather && (
          <div className="weather-row">
            <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0, width: 22, textAlign: "center" }}>{weather.emoji}</span>
            <div className="weather-detail">
              <div className="weather-value">{weather.label}</div>
              <div className="weather-label">Conditions</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

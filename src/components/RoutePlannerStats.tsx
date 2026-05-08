import { useStore } from "../store";
import { WeatherSummaryPanel } from "./WeatherSummaryPanel";

function fmtDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function fmtDist(m: number): string {
  return (m / 1000).toFixed(1) + " km";
}

function WindBar({ headKm, crossKm, tailKm }: { headKm: number; crossKm: number; tailKm: number }) {
  const total = headKm + crossKm + tailKm;
  if (total <= 0) return null;
  const hw = (headKm / total) * 100;
  const cw = (crossKm / total) * 100;
  const tw = (tailKm / total) * 100;
  return (
    <div className="wind-bar-wrap">
      <div className="wind-bar">
        {hw > 0 && <div className="wb-head" style={{ width: `${hw}%` }} title={`Headwind ${headKm.toFixed(0)} km`} />}
        {cw > 0 && <div className="wb-cross" style={{ width: `${cw}%` }} title={`Crosswind ${crossKm.toFixed(0)} km`} />}
        {tw > 0 && <div className="wb-tail" style={{ width: `${tw}%` }} title={`Tailwind ${tailKm.toFixed(0)} km`} />}
      </div>
      <div className="wind-bar-labels">
        <span className="wbl-head">{headKm.toFixed(0)} km headwind</span>
        <span className="wbl-tail">{tailKm.toFixed(0)} km tailwind</span>
      </div>
    </div>
  );
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function offsetDateStr(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function formatDateLabel(dateStr: string): string {
  const today = todayStr();
  const tomorrow = offsetDateStr(1);
  if (dateStr === today) return "Today";
  if (dateStr === tomorrow) return "Tomorrow";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function RoutePlannerStats() {
  const plan = useStore((s) => s.plan);
  const setPlanAvgSpeed = useStore((s) => s.setPlanAvgSpeed);
  const setPlanDepartureDate = useStore((s) => s.setPlanDepartureDate);
  const setPlanDepartureHour = useStore((s) => s.setPlanDepartureHour);

  const { route, windAnalysis } = plan;
  if (!route) return null;

  const { totals, climbs } = route;
  const wa = windAnalysis;

  const avgWC = wa ? wa.avgWindComponent : null;
  const wcLabel =
    avgWC === null ? null
    : avgWC > 2 ? `+${avgWC.toFixed(1)} km/h avg tailwind`
    : avgWC < -2 ? `${avgWC.toFixed(1)} km/h avg headwind`
    : "Mostly crosswind";

  const quickDates = [
    { label: "Today", value: todayStr() },
    { label: "Tomorrow", value: offsetDateStr(1) },
    { label: "+2d", value: offsetDateStr(2) },
    { label: "+3d", value: offsetDateStr(3) },
    { label: "+7d", value: offsetDateStr(7) },
  ];

  return (
    <div className="plan-stats">
      {/* Departure settings */}
      <div className="panel">
        <h3>Departure</h3>

        {/* Date row */}
        <div className="dep-section-label">Date</div>
        <div className="dep-date-row">
          <div className="dep-quick-dates">
            {quickDates.map((q) => (
              <button
                key={q.value}
                className={`dep-quick-btn${plan.departureDate === q.value ? " active" : ""}`}
                onClick={() => setPlanDepartureDate(q.value)}
              >
                {q.label}
              </button>
            ))}
          </div>
          <input
            type="date"
            className="dep-date-input"
            value={plan.departureDate}
            onChange={(e) => setPlanDepartureDate(e.target.value)}
          />
        </div>
        <div className="dep-date-display">{formatDateLabel(plan.departureDate)}</div>

        {/* Hour grid */}
        <div className="dep-section-label" style={{ marginTop: 12 }}>Start time</div>
        <div className="dep-hour-grid">
          {Array.from({ length: 24 }, (_, h) => (
            <button
              key={h}
              className={`dep-hour-btn${plan.departureHour === h ? " active" : ""}`}
              onClick={() => setPlanDepartureHour(h)}
            >
              {String(h).padStart(2, "0")}
            </button>
          ))}
        </div>

      </div>

      {/* Weather forecast */}
      <WeatherSummaryPanel />

      {/* Route summary */}
      <div className="panel">
        <h3>Route</h3>
        <div className="dep-speed-row" style={{ marginBottom: 10 }}>
          <span className="summary-label" style={{ flexShrink: 0 }}>Avg speed</span>
          <input
            type="range"
            min={10}
            max={60}
            step={1}
            value={plan.avgSpeedKmh}
            onChange={(e) => setPlanAvgSpeed(Number(e.target.value))}
            className="dep-speed-slider"
          />
          <div className="dep-speed-value">
            <input
              type="number"
              min={10}
              max={60}
              step={1}
              value={plan.avgSpeedKmh}
              onChange={(e) => setPlanAvgSpeed(Number(e.target.value))}
              className="dep-speed-num"
            />
            <span className="dep-speed-unit">km/h</span>
          </div>
        </div>
        <table className="summary-table">
          <tbody>
            <tr><td className="summary-label">Distance</td><td>{fmtDist(totals.distanceM)}</td></tr>
            <tr><td className="summary-label">Elevation gain</td><td>{Math.round(totals.ascentM)} m</td></tr>
            <tr><td className="summary-label">Elevation loss</td><td>{Math.round(totals.descentM)} m</td></tr>
            {climbs.length > 0 && (
              <tr><td className="summary-label">Climbs</td><td>{climbs.length}</td></tr>
            )}
            <tr>
              <td className="summary-label">Est. duration</td>
              <td>{wa ? fmtDuration(wa.estDurationSec) : fmtDuration((totals.distanceM / 1000 / plan.avgSpeedKmh) * 3600)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Wind analysis */}
      {wa && (
        <div className="panel">
          <h3>Wind</h3>
          <WindBar headKm={wa.headwindKm} crossKm={wa.crosswindKm} tailKm={wa.tailwindKm} />
          {wcLabel && <div className="plan-wc-label">{wcLabel}</div>}
          <table className="summary-table" style={{ marginTop: 8 }}>
            <tbody>
              <tr>
                <td className="summary-label">Headwind</td>
                <td className="delta-neg">{wa.headwindKm.toFixed(0)} km</td>
              </tr>
              <tr>
                <td className="summary-label">Crosswind</td>
                <td>{wa.crosswindKm.toFixed(0)} km</td>
              </tr>
              <tr>
                <td className="summary-label">Tailwind</td>
                <td className="delta-pos">{wa.tailwindKm.toFixed(0)} km</td>
              </tr>
              {wa.worstHeadwindKmh < -1 && (
                <tr>
                  <td className="summary-label">Worst headwind</td>
                  <td className="delta-neg">{Math.abs(wa.worstHeadwindKmh).toFixed(1)} km/h</td>
                </tr>
              )}
              {wa.bestTailwindKmh > 1 && (
                <tr>
                  <td className="summary-label">Best tailwind</td>
                  <td className="delta-pos">{wa.bestTailwindKmh.toFixed(1)} km/h</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Climbs */}
      {climbs.length > 0 && (
        <div className="panel">
          <h3>Climbs</h3>
          <table className="splits-table">
            <thead>
              <tr>
                <th>km</th>
                <th>length</th>
                <th>ascent</th>
                <th>grade</th>
              </tr>
            </thead>
            <tbody>
              {climbs.map((c, i) => (
                <tr key={i}>
                  <td>{c.startKm.toFixed(1)}</td>
                  <td>{(c.lengthM / 1000).toFixed(1)} km</td>
                  <td>{Math.round(c.ascentM)} m</td>
                  <td>{c.avgGrade.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Per-segment wind splits */}
      {wa && wa.segments.length > 0 && (
        <div className="panel">
          <h3>Wind by segment</h3>
          <table className="splits-table">
            <thead>
              <tr>
                <th>km</th>
                <th>bearing</th>
                <th>wind</th>
                <th>component</th>
              </tr>
            </thead>
            <tbody>
              {wa.segments.map((seg) => {
                const wc = seg.windComponent;
                const cls = wc > 2 ? "delta-pos" : wc < -2 ? "delta-neg" : "";
                return (
                  <tr key={seg.fromKm}>
                    <td>{seg.fromKm.toFixed(0)}–{seg.toKm.toFixed(0)}</td>
                    <td>{Math.round(seg.bearingDeg)}°</td>
                    <td>{seg.windSpeedKmh.toFixed(0)} km/h</td>
                    <td className={cls}>
                      {wc > 0 ? "+" : ""}{wc.toFixed(1)} km/h
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

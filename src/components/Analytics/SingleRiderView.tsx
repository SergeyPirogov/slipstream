import { useMemo } from "react";
import { useStore } from "../../store";
import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceArea,
} from "recharts";
import { buildSingleSeries, SingleSeriesLineChart } from "./chartHelpers";
import type { Track } from "../../gpx/analyze";

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec)) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  const s = Math.floor(sec % 60);
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function fmtDur(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function elapsedAtKm(track: Track, targetKm: number): number | null {
  const targetM = targetKm * 1000;
  if (targetM > track.totals.distanceM + 50) return null;
  const pts = track.points;
  let lo = 0, hi = pts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].distFromStart < targetM) lo = mid + 1;
    else hi = mid;
  }
  return pts[lo].elapsedSec;
}

function avgPowerBetweenKm(track: Track, fromKm: number, toKm: number): number | null {
  const pts = track.points.filter(
    (p) => p.distFromStart >= fromKm * 1000 && p.distFromStart <= toKm * 1000 && p.power !== undefined,
  );
  if (pts.length === 0) return null;
  return pts.reduce((s, p) => s + p.power!, 0) / pts.length;
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className="summary-label">{label}</td>
      <td>{value}</td>
    </tr>
  );
}

function SingleSummary({ track }: { track: Track }) {
  const t = track.totals;
  return (
    <div className="panel">
      <h3>Summary</h3>
      <table className="summary-table">
        <tbody>
          <StatRow label="Distance" value={`${(t.distanceM / 1000).toFixed(2)} km`} />
          <StatRow label="Moving time" value={formatDuration(t.durationSec)} />
          {track.elapsedSec !== undefined && track.elapsedSec - t.durationSec > 60 && (
            <StatRow label="Elapsed time" value={formatDuration(track.elapsedSec)} />
          )}
          <StatRow label="Avg speed" value={`${t.avgSpeedKmh.toFixed(1)} km/h`} />
          <StatRow label="Max speed" value={`${t.maxSpeedKmh.toFixed(1)} km/h`} />
          <StatRow label="Ascent" value={`${Math.round(t.ascentM)} m`} />
          {t.avgHr !== undefined && <StatRow label="Avg HR" value={`${Math.round(t.avgHr)} bpm`} />}
          {t.avgCad !== undefined && <StatRow label="Avg cadence" value={`${Math.round(t.avgCad)} rpm`} />}
          {t.avgPower !== undefined && <StatRow label="Avg power" value={`${Math.round(t.avgPower)} W`} />}
          {t.normalizedPower !== undefined && <StatRow label="NP" value={`${Math.round(t.normalizedPower)} W`} />}
          {t.maxPower !== undefined && <StatRow label="Max power" value={`${Math.round(t.maxPower)} W`} />}
          {track.climbs.length > 0 && <StatRow label="Climbs ≥500m" value={String(track.climbs.length)} />}
        </tbody>
      </table>
    </div>
  );
}

function SingleSplits({ track }: { track: Track }) {
  const limitKm = track.totals.distanceM / 1000;
  const splitKm = 10;
  const boundaries: number[] = [];
  for (let k = splitKm; k <= Math.floor(limitKm * 10) / 10; k += splitKm) {
    boundaries.push(Math.round(k * 10) / 10);
  }
  if (limitKm - (boundaries[boundaries.length - 1] ?? 0) > 0.1) boundaries.push(limitKm);
  if (boundaries.length < 2) return null;

  const rows = boundaries.map((km, i) => {
    const prevKm = i === 0 ? 0 : boundaries[i - 1];
    const endElapsed = elapsedAtKm(track, km) ?? 0;
    const prevElapsed = elapsedAtKm(track, prevKm) ?? 0;
    const dur = endElapsed - prevElapsed;
    const segKm = km - prevKm;
    const spd = dur > 0 ? (segKm / dur) * 3600 : 0;
    const pwr = avgPowerBetweenKm(track, prevKm, km);
    return { km, dur, spd, pwr };
  });

  const hasPower = rows.some((r) => r.pwr !== null);

  return (
    <div className="panel">
      <h3>10 km splits</h3>
      <table className="splits-table">
        <thead>
          <tr>
            <th>km</th>
            <th>Time</th>
            <th>Speed</th>
            {hasPower && <th>Power</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.km}>
              <td>{Number.isInteger(r.km) ? r.km.toFixed(0) : r.km.toFixed(1)}</td>
              <td>{fmtDur(r.dur)}</td>
              <td>{r.spd.toFixed(1)} km/h</td>
              {hasPower && <td>{r.pwr !== null ? `${Math.round(r.pwr)} W` : "—"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SingleElevationChart({ track }: { track: Track }) {
  const data = useMemo(
    () => buildSingleSeries(track, (i, t) => t.points[i].ele),
    [track],
  );
  const xTicks = useMemo(() => {
    const maxKm = track.totals.distanceM / 1000;
    const ticks: number[] = [];
    for (let km = 0; km <= maxKm; km += 10) ticks.push(km);
    return ticks;
  }, [track]);

  return (
    <div className="panel">
      <h3>Elevation (m)</h3>
      <ResponsiveContainer width="100%" height={180}>
        <ComposedChart data={data} margin={{ top: 4, right: 10, bottom: 4, left: 0 }}>
          <defs>
            <linearGradient id="single-ele-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f97316" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#2a2f3a" strokeDasharray="3 3" />
          <XAxis
            dataKey="km"
            stroke="#8e94a0"
            tick={{ fontSize: 10 }}
            type="number"
            domain={["dataMin", "dataMax"]}
            ticks={xTicks}
            tickFormatter={(v) => `${Math.round(v)}`}
          />
          <YAxis stroke="#8e94a0" tick={{ fontSize: 10 }} width={36} domain={["auto", "auto"]} />
          <Tooltip
            contentStyle={{ background: "#171a21", border: "1px solid #2a2f3a", fontSize: 12 }}
            formatter={(v: any) => (typeof v === "number" ? `${Math.round(v)} m` : v)}
            labelFormatter={(l) => `${Number(l).toFixed(1)} km`}
          />
          <Area type="monotone" dataKey="v" stroke="#f97316" strokeWidth={1.5} fill="url(#single-ele-fill)" dot={false} isAnimationActive={false} />
          {track.climbs.map((c, i) => (
            <ReferenceArea key={i} x1={c.startKm} x2={c.startKm + c.lengthM / 1000} fill="#f97316" fillOpacity={0.1} />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
      {track.climbs.length > 0 && (
        <div style={{ fontSize: 11, color: "var(--fg-dim)", marginTop: 6 }}>
          {track.climbs.length} climb{track.climbs.length === 1 ? "" : "s"} detected (≥3% for ≥500m)
        </div>
      )}
    </div>
  );
}

export function SingleRiderMapPaneContent() {
  const track = useStore((s) => s.trackA);

  const speedData = useMemo(
    () => track ? buildSingleSeries(track, (i, t) => t.points[i].speedKmh) : [],
    [track],
  );
  const powerData = useMemo(
    () => track ? buildSingleSeries(track, (i, t) => t.points[i].power) : [],
    [track],
  );
  const hrData = useMemo(
    () => track ? buildSingleSeries(track, (i, t) => t.points[i].hr) : [],
    [track],
  );
  const cadData = useMemo(
    () => track ? buildSingleSeries(track, (i, t) => t.points[i].cad) : [],
    [track],
  );

  if (!track) return null;

  const hasPower = powerData.some((d) => d.v !== undefined);
  const hasHr = hrData.some((d) => d.v !== undefined);
  const hasCad = cadData.some((d) => d.v !== undefined);

  return (
    <>
      <div className="elevation-strip">
        <SingleElevationChart track={track} />
      </div>
      <div className="charts-strip">
        <div className="panel">
          <h3>Speed (km/h)</h3>
          <SingleSeriesLineChart data={speedData} color="#f97316" yUnit="km/h" />
        </div>
        {hasPower && (
          <div className="panel">
            <h3>Power (W)</h3>
            <SingleSeriesLineChart data={powerData} color="#a855f7" yUnit="W" />
          </div>
        )}
        {hasHr && (
          <div className="panel">
            <h3>Heart rate (bpm)</h3>
            <SingleSeriesLineChart data={hrData} color="#ef4444" yUnit="bpm" />
          </div>
        )}
        {hasCad && (
          <div className="panel">
            <h3>Cadence (rpm)</h3>
            <SingleSeriesLineChart data={cadData} color="#22c55e" yUnit="rpm" />
          </div>
        )}
      </div>
    </>
  );
}

export function SingleRiderSidebar() {
  const track = useStore((s) => s.trackA);
  if (!track) return null;
  return (
    <>
      <SingleSummary track={track} />
      <SingleSplits track={track} />
    </>
  );
}

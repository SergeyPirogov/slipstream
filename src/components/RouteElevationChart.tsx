import { useMemo } from "react";
import {
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import type { ReactElement } from "react";
import { useStore } from "../store";
import type { CategoricalChartState } from "recharts/types/chart/types";

function degToCardinal(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}

function ElevationTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const wc: number | undefined = d.wc;
  const windSpeed: number | undefined = d.windSpeed;
  const windDir: number | undefined = d.windDir;

  const wcColor = wc === undefined ? "#8e94a0"
    : wc > 2 ? "#22c55e"
    : wc < -2 ? "#ef4444"
    : "#a0a8b0";
  const wcLabel = wc === undefined ? null
    : wc > 2 ? `+${wc.toFixed(1)} km/h tailwind`
    : wc < -2 ? `${wc.toFixed(1)} km/h headwind`
    : `${Math.abs(wc).toFixed(1)} km/h crosswind`;

  return (
    <div style={{
      background: "#171a21", border: "1px solid #2a2f3a", borderRadius: 6,
      padding: "7px 10px", fontSize: 11, lineHeight: 1.6, minWidth: 140,
    }}>
      <div style={{ color: "#8e94a0", marginBottom: 4, fontWeight: 600 }}>{d.km} km</div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <span style={{ color: "#8e94a0" }}>Elevation</span>
        <span style={{ color: "#e6e8eb" }}>{d.ele} m</span>
      </div>
      {windSpeed !== undefined && windDir !== undefined && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span style={{ color: "#8e94a0" }}>Wind</span>
          <span style={{ color: "#e6e8eb" }}>{Math.round(windSpeed)} km/h {degToCardinal(windDir)}</span>
        </div>
      )}
      {wcLabel && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span style={{ color: "#8e94a0" }}>Impact</span>
          <span style={{ color: wcColor, fontWeight: 600 }}>{wcLabel}</span>
        </div>
      )}
    </div>
  );
}

export function RouteElevationChart() {
  const plan = useStore((s) => s.plan);
  const setPlanHoverKm = useStore((s) => s.setPlanHoverKm);
  const { route, windAnalysis } = plan;

  const handleMouseMove = (state: CategoricalChartState) => {
    const km = state?.activePayload?.[0]?.payload?.km;
    if (km !== undefined) setPlanHoverKm(km);
  };
  const handleMouseLeave = () => setPlanHoverKm(null);

  const data = useMemo(() => {
    if (!route) return [];
    const pts = route.points;
    // Sample every ~200m for performance
    const step = Math.max(1, Math.floor(pts.length / 500));
    return pts
      .filter((_, i) => i % step === 0)
      .map((p) => {
        const km = p.distFromStart / 1000;
        const seg = windAnalysis?.segments.find((s) => km >= s.fromKm && km <= s.toKm);
        const wc = seg?.windComponent;
        const isTail = wc !== undefined && wc > 2;
        const isHead = wc !== undefined && wc < -2;
        return {
          km: Math.round(km * 10) / 10,
          ele: Math.round(p.ele),
          tail: isTail ? wc : 0,
          head: isHead ? wc : 0,
          cross: wc !== undefined && !isTail && !isHead ? Math.abs(wc) || 0.5 : 0,
          windSpeed: seg?.windSpeedKmh,
          windDir: seg?.windDirDeg,
          wc,
        };
      });
  }, [route, windAnalysis]);

  if (!route || data.length === 0) return null;

  const maxKm = route.totals.distanceM / 1000;
  const xTicks: number[] = [];
  for (let km = 0; km <= maxKm; km += 10) xTicks.push(km);

  const hasWind = windAnalysis && windAnalysis.segments.length > 0;

  return (
    <div className="panel route-elev-panel">
      <h3>Elevation{hasWind ? " & wind" : ""}</h3>
      <ResponsiveContainer width="100%" height={120}>
        <ComposedChart
          data={data}
          margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <CartesianGrid strokeDasharray="2 3" stroke="#2a2f3a" vertical={false} />
          <XAxis
            dataKey="km"
            ticks={xTicks}
            tick={{ fontSize: 10, fill: "#8e94a0" }}
            tickLine={false}
            axisLine={{ stroke: "#2a2f3a" }}
            tickFormatter={(v) => `${v}km`}
            domain={[0, "dataMax"]}
            type="number"
          />
          <YAxis
            yAxisId="ele"
            orientation="left"
            tick={{ fontSize: 10, fill: "#8e94a0" }}
            tickLine={false}
            axisLine={false}
            width={36}
            tickFormatter={(v) => `${v}m`}
          />
          {hasWind && (
            <YAxis
              yAxisId="wind"
              orientation="right"
              tick={{ fontSize: 10, fill: "#8e94a0" }}
              tickLine={false}
              axisLine={false}
              width={30}
              tickFormatter={(v) => `${v > 0 ? "+" : ""}${v}`}
              domain={[-20, 20]}
            />
          )}
          <Tooltip content={ElevationTooltip} />
          <Area
            yAxisId="ele"
            dataKey="ele"
            fill="rgba(59,130,246,0.18)"
            stroke="#3b82f6"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
          {hasWind && (
            <>
              <ReferenceLine yAxisId="wind" y={0} stroke="#4b5563" strokeDasharray="3 3" />
              <Bar yAxisId="wind" dataKey="tail" stroke="none" isAnimationActive={false} maxBarSize={8}
                shape={(props: any): ReactElement => {
                  const { x, y, width, height } = props;
                  const h = Math.abs(height);
                  if (h < 1) return <g />;
                  return <rect x={x} y={height < 0 ? y + height : y} width={Math.max(1, width)} height={h} fill="rgba(34,197,94,0.75)" rx={1} />;
                }}
              />
              <Bar yAxisId="wind" dataKey="head" stroke="none" isAnimationActive={false} maxBarSize={8}
                shape={(props: any): ReactElement => {
                  const { x, y, width, height } = props;
                  const h = Math.abs(height);
                  if (h < 1) return <g />;
                  return <rect x={x} y={height < 0 ? y + height : y} width={Math.max(1, width)} height={h} fill="rgba(239,68,68,0.75)" rx={1} />;
                }}
              />
              <Bar yAxisId="wind" dataKey="cross" stroke="none" isAnimationActive={false} maxBarSize={8}
                shape={(props: any): ReactElement => {
                  const { x, y, width, height } = props;
                  const h = Math.abs(height);
                  if (h < 1) return <g />;
                  return <rect x={x} y={height < 0 ? y + height : y} width={Math.max(1, width)} height={h} fill="rgba(160,168,176,0.5)" rx={1} />;
                }}
              />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

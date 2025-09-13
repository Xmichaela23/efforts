// components/run/PowerCadenceChart.tsx
import * as React from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine
} from "recharts";
import clsx from "clsx";

type Sample = number | { t: number; v: number };
type Series = Sample[];
type Tab = "PWR" | "CAD";

function norm(series?: Series) {
  return (series ?? []).map((s, i) =>
    typeof s === "number" ? { t: i, v: s } : s
  );
}
function merge(power?: Series, cadence?: Series) {
  const p = norm(power), c = norm(cadence);
  const n = Math.max(p.length, c.length);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = {
      x: i,
      pwr: p[i]?.v ?? null,
      cad: c[i]?.v ?? null,
    };
  }
  return out;
}

export default function PowerCadenceChart({
  power,
  cadence,
  initial = "PWR",
  height = 210,
  className = "",
}: {
  power?: Series;
  cadence?: Series;
  initial?: Tab;
  height?: number;
  className?: string;
}) {
  const [tab, setTab] = React.useState<Tab>(initial);
  const [hoverIdx, setHoverIdx] = React.useState<number | null>(null);

  const points = React.useMemo(() => merge(power, cadence), [power, cadence]);
  const lastIdx = points.length ? points.length - 1 : 0;
  const idx = hoverIdx ?? lastIdx;

  const curPwr = points[idx]?.pwr ?? null;
  const curCad = points[idx]?.cad ?? null;

  const data = React.useMemo(
    () =>
      points.map((p) => ({
        x: p.x,
        value: tab === "PWR" ? p.pwr : p.cad,
      })),
    [points, tab]
  );

  return (
    <div className={clsx("mt-2", className)}>
      {/* Fixed header (follows crosshair) */}
      <div className="mb-2 grid grid-cols-2 gap-4 px-1">
        <div>
          <div className="text-xs text-muted-foreground">Power</div>
          <div className="text-lg font-semibold tabular-nums">
            {curPwr != null ? Math.round(curPwr) : "—"} W
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Cadence</div>
          <div className="text-lg font-semibold tabular-nums">
            {curCad != null ? Math.round(curCad) : "—"} spm
          </div>
        </div>
      </div>

      {/* Chart card (same as pace/elev) */}
      <div className="rounded-2xl border bg-card">
        <div className="h-[210px]" style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
              onMouseMove={(s: any) => {
                const i = s?.activePayload?.[0]?.payload?.x;
                if (Number.isFinite(i)) setHoverIdx(i);
              }}
              onMouseLeave={() => setHoverIdx(null)}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.1)" />
              <XAxis dataKey="x" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => (tab === "PWR" ? `${v} W` : `${v} spm`)}
              />
              {/* Hide default bubble tooltip; we use header + reference line */}
              <Tooltip content={() => null} />
              {hoverIdx != null && (
                <ReferenceLine x={hoverIdx} stroke="rgba(0,0,0,.3)" />
              )}
              <Line
                type="monotone"
                dataKey="value"
                stroke={tab === "PWR" ? "#3b82f6" : "#10b981"}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tabs row — matches your other panel */}
      <nav className="mt-2 flex gap-3 px-1">
        {(["PWR", "CAD"] as Tab[]).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={clsx(
              "px-3 py-1.5 rounded-lg text-sm font-semibold tracking-wide uppercase text-gray-500",
              tab === k && "text-black underline decoration-2 underline-offset-4"
            )}
          >
            {k}
          </button>
        ))}
      </nav>
    </div>
  );
}

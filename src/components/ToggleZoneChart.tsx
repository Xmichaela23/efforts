// components/ToggleZoneChart.tsx
// Dependencies assumed: tailwindcss, shadcn/ui Tabs, recharts
import * as React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Cell,
} from "recharts";

type Sample = number | { t: number; v: number }; // number => 1s samples; object => timestamped
type Series = Sample[];

type ZoneSpec = {
  id: string;
  label: string;
  inZone: (v: number) => boolean;
};

export interface ToggleZoneChartProps {
  power?: Series;            // watts series (running power)
  cadence?: Series;          // spm series (running cadence)
  ftp?: number;              // required for power zones
  initial?: "power" | "cadence";
  height?: number;           // px, chart area height (mobile safe default below)
  className?: string;
}

export default function ToggleZoneChart({
  power,
  cadence,
  ftp,
  initial = "power",
  height = 140,
  className = "",
}: ToggleZoneChartProps) {
  const [tab, setTab] = React.useState<"power" | "cadence">(initial);

  const powerZones: ZoneSpec[] = React.useMemo(() => {
    const f = Math.max(1, ftp || 250); // fallback if ftp missing
    const pct = (p: number) => (val: number) => val >= p[0] * f && val < p[1] * f;
    return [
      { id: "Z1", label: "Z1 <55%", inZone: (v) => v < 0.55 * f },
      { id: "Z2", label: "Z2 56–75%", inZone: pct([0.56, 0.76]) },
      { id: "Z3", label: "Z3 76–90%", inZone: pct([0.76, 0.91]) },
      { id: "Z4", label: "Z4 91–105%", inZone: pct([0.91, 1.06]) },
      { id: "Z5", label: "Z5 106–120%", inZone: pct([1.06, 1.21]) },
      { id: "Z6", label: "Z6 121–150%", inZone: pct([1.21, 1.51]) },
      { id: "Z7", label: "Z7 >150%", inZone: (v) => v >= 1.5 * f },
    ];
  }, [ftp]);

  // Running cadence bands (spm)
  const cadenceZones: ZoneSpec[] = [
    { id: "<160", label: "<160 spm", inZone: (v) => v < 160 },
    { id: "160-169", label: "160–169", inZone: (v) => v >= 160 && v < 170 },
    { id: "170-179", label: "170–179", inZone: (v) => v >= 170 && v < 180 },
    { id: "≥180", label: "≥180", inZone: (v) => v >= 180 },
  ];

  function seriesToDurations(series?: Series): { values: number[]; times: number[]; total: number } {
    if (!series || series.length === 0) return { values: [], times: [], total: 0 };
    // Normalize to arrays of {t, v} assuming 1s if number
    const norm = series.map((s, i) => {
      if (typeof s === "number") return { t: i, v: s };
      return s;
    });

    let total = 0;
    const values: number[] = [];
    const times: number[] = [];

    for (let i = 0; i < norm.length; i++) {
      const cur = norm[i];
      const nxt = norm[i + 1];
      const dt = Math.max(1, (nxt?.t ?? cur.t + 1) - cur.t);
      values.push(cur.v);
      times.push(dt);
      total += dt;
    }
    return { values, times, total };
  }

  function zoneDistribution(series: Series | undefined, zones: ZoneSpec[]) {
    const { values, times, total } = seriesToDurations(series);
    const bins = zones.map((z) => ({ id: z.id, label: z.label, seconds: 0 }));

    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      const dt = times[i];
      const idx = zones.findIndex((z) => z.inZone(v));
      if (idx >= 0) bins[idx].seconds += dt;
    }

    const pct = (s: number) => (total > 0 ? (s / total) * 100 : 0);
    return {
      totalSeconds: total,
      rows: bins.map((b) => ({
        name: b.label,
        seconds: b.seconds,
        percent: +pct(b.seconds).toFixed(1),
      })),
    };
  }

  const powerDist = React.useMemo(() => zoneDistribution(power, powerZones), [power, powerZones]);
  const cadenceDist = React.useMemo(() => zoneDistribution(cadence, cadenceZones), [cadence]);

  // Build a single-row stacked dataset for each tab
  function stackedRow(dist: ReturnType<typeof zoneDistribution>, zones: ZoneSpec[]) {
    const row: any = { label: "Time in Zone" };
    zones.forEach((z) => {
      const hit = dist.rows.find((r) => r.name === z.label);
      row[z.id] = hit?.percent ?? 0;
    });
    return [row];
  }

  const powerRow = stackedRow(powerDist, powerZones);
  const cadenceRow = stackedRow(cadenceDist, cadenceZones);

  const zoneOrder = (zones: ZoneSpec[]) => zones.map((z) => z.id);

  // Light color mapping (uses CSS vars so it respects theme)
  const fills: Record<string, string> = {
    Z1: "hsl(var(--muted))",
    Z2: "hsl(var(--muted-foreground))",
    Z3: "hsl(var(--secondary))",
    Z4: "hsl(var(--primary) / 0.80)",
    Z5: "hsl(var(--primary))",
    Z6: "hsl(var(--destructive) / 0.85)",
    Z7: "hsl(var(--destructive))",
    "<160": "hsl(var(--muted))",
    "160-169": "hsl(var(--secondary))",
    "170-179": "hsl(var(--primary) / 0.80)",
    "≥180": "hsl(var(--primary))",
  };

  function ZoneBar({
    data,
    zones,
  }: {
    data: any[];
    zones: ZoneSpec[];
  }) {
    return (
      <div className="rounded-2xl border bg-card p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            Percent of moving time in each zone
          </div>
          <div className="text-xs tabular-nums">
            {data[0] &&
              Math.round(
                zoneOrder(zones).reduce((a, k) => a + (data[0][k] ?? 0), 0)
              )}
            %
          </div>
        </div>
        <div className="w-full" style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" stackOffset="expand" margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
              <XAxis type="number" hide domain={[0, 100]} />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 12 }} width={90} />
              <Tooltip
                cursor={{ fill: "transparent" }}
                formatter={(val: any, key: string) => [`${(val as number).toFixed(1)}%`, key]}
              />
              <Legend verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: 11 }} />
              {zoneOrder(zones).map((z) => (
                <Bar key={z} dataKey={z} stackId="1" isAnimationActive={false}>
                  <Cell fill={fills[z] || "hsl(var(--primary))"} />
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className={className}>
      <TabsList className="w-full grid grid-cols-2">
        <TabsTrigger value="power">Power</TabsTrigger>
        <TabsTrigger value="cadence">Cadence</TabsTrigger>
      </TabsList>

      <TabsContent value="power" className="mt-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-medium">Power Zones</div>
          <div className="text-xs text-muted-foreground">
            FTP: <span className="tabular-nums">{ftp ?? "—"}</span> W
          </div>
        </div>
        <ZoneBar data={powerRow} zones={powerZones} />
      </TabsContent>

      <TabsContent value="cadence" className="mt-3">
        <div className="mb-2 text-sm font-medium">Cadence Bands</div>
        <ZoneBar data={cadenceRow} zones={cadenceZones} />
      </TabsContent>
    </Tabs>
  );
}

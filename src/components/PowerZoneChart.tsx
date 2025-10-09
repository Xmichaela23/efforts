import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  Tooltip,
  ResponsiveContainer,
  YAxis,
} from "recharts";

/**
 * Power Zone Chart
 * -------------------------------------------------------------
 * Displays power distribution across zones for cycling workouts.
 * Uses server-computed zone data from workoutData.computed.analysis.zones.power
 *
 * Zone data structure from server:
 * {
 *   bins: [
 *     { i: 0, t_s: 600, min: 50, max: 120 },
 *     { i: 1, t_s: 900, min: 120, max: 180 },
 *     ...
 *   ],
 *   schema: 'auto-range'
 * }
 */

interface PowerZoneChartProps {
  zoneDurationsSeconds: number[];  // Array of seconds spent in each zone
  avgPower?: number;
  maxPower?: number;
  zoneRanges?: { min: number; max: number }[];  // Optional zone ranges from server
  title?: string;
}

const POWER_ZONE_LABELS = [
  "Z1 Active Recovery",
  "Z2 Endurance",
  "Z3 Tempo",
  "Z4 Threshold",
  "Z5 VO2 Max",
  "Z6 Anaerobic",
];

const POWER_ZONE_COLORS = [
  "#10b981", // Z1 - emerald-500
  "#84cc16", // Z2 - lime-500
  "#f59e0b", // Z3 - amber-500
  "#ef4444", // Z4 - red-500
  "#991b1b", // Z5 - red-800
  "#7c2d12", // Z6 - red-950
];

const pctFmt = (x: number) => `${(x * 100).toFixed(0)}%`;
const fmtTime = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
};

const PowerZoneChart: React.FC<PowerZoneChartProps> = ({
  zoneDurationsSeconds,
  avgPower,
  maxPower,
  zoneRanges,
  title = "Power Distribution",
}) => {
  const { zoneData, totalTime } = useMemo(() => {
    if (!zoneDurationsSeconds || zoneDurationsSeconds.length === 0) {
      return { zoneData: [], totalTime: 0 };
    }

    const total = zoneDurationsSeconds.reduce((a, b) => a + b, 0);
    
    const zoneData = zoneDurationsSeconds.map((duration, i) => ({
      zone: POWER_ZONE_LABELS[i] || `Zone ${i + 1}`,
      duration,
      percentage: total > 0 ? duration / total : 0,
      color: POWER_ZONE_COLORS[i % POWER_ZONE_COLORS.length],
      range: zoneRanges?.[i],
    })).filter(z => z.duration > 0);

    return { zoneData, totalTime: total };
  }, [zoneDurationsSeconds, zoneRanges]);

  if (zoneData.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">No power data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold">{fmtTime(totalTime)}</div>
            <div className="text-sm text-muted-foreground">Duration</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{avgPower ? Math.round(avgPower) : "—"}</div>
            <div className="text-sm text-muted-foreground">Avg Power</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{maxPower ? Math.round(maxPower) : "—"}</div>
            <div className="text-sm text-muted-foreground">Max Power</div>
          </div>
        </div>

        <Separator />

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Bar Chart */}
          <div>
            <h3 className="text-sm font-medium mb-3">Time Distribution</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={zoneData} margin={{ top: 8, right: 8, left: 8, bottom: 16 }}>
                <XAxis dataKey="zone" />
                <YAxis />
                <Tooltip 
                  formatter={(value: any) => [fmtTime(value), 'Time']}
                  labelFormatter={(label) => `${label}`}
                />
                <Bar dataKey="duration" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Pie Chart */}
          <div>
            <h3 className="text-sm font-medium mb-3">Zone Distribution</h3>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={zoneData}
                  dataKey="percentage"
                  nameKey="zone"
                  cx="50%"
                  cy="50%"
                  outerRadius={72}
                  label={({ percentage }) => pctFmt(percentage)}
                >
                  {zoneData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any) => [pctFmt(value), 'Percentage']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Zone Table */}
        <div>
          <h3 className="text-sm font-medium mb-3">Zone Details</h3>
          <div className="space-y-2">
            {zoneData.map((zone) => (
              <div key={zone.zone} className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-4 h-4 rounded-full" 
                    style={{ backgroundColor: zone.color }}
                  />
                  <span className="font-medium">{zone.zone}</span>
                  {zone.range && (
                    <span className="text-sm text-muted-foreground">
                      {zone.range.min}-{zone.range.max} W
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <div className="font-medium">{fmtTime(zone.duration)}</div>
                  <div className="text-sm text-muted-foreground">{pctFmt(zone.percentage)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PowerZoneChart;


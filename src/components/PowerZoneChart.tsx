import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
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
 *   schema: 'ftp-based'
 * }
 */

interface PowerZoneBin {
  i: number;  // Zone index (0-6)
  t_s: number;  // Duration in seconds
  min: number;  // Zone min power (W)
  max: number;  // Zone max power (W)
}

interface PowerZoneChartProps {
  zoneBins?: PowerZoneBin[];  // Server bins with i, t_s, min, max fields
  zoneDurationsSeconds?: number[];  // Legacy: Array of seconds spent in each zone (deprecated)
  avgPower?: number;
  maxPower?: number;
  zoneRanges?: { min: number; max: number }[];  // Legacy: Optional zone ranges (deprecated)
  title?: string;
}

const POWER_ZONE_LABELS = [
  "Z1 Active Recovery",
  "Z2 Endurance",
  "Z3 Tempo",
  "Z4 Threshold",
  "Z5 VO2 Max",
  "Z6 Anaerobic",
  "Z6+ Neuromuscular",
];

const POWER_ZONE_COLORS = [
  "#10b981", // Z1 - emerald-500
  "#84cc16", // Z2 - lime-500
  "#f59e0b", // Z3 - amber-500
  "#ef4444", // Z4 - red-500
  "#991b1b", // Z5 - red-800
  "#7c2d12", // Z6 - red-950
  "#581c87", // Z6+ - purple-900
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
  zoneBins,
  zoneDurationsSeconds,  // Legacy support
  avgPower,
  maxPower,
  zoneRanges,  // Legacy support
  title = "Power Distribution",
}) => {
  const { zoneData, totalTime } = useMemo(() => {
    // Use new bins format if available (preferred)
    if (zoneBins && zoneBins.length > 0) {
      const total = zoneBins.reduce((sum, bin) => sum + (Number(bin.t_s) || 0), 0);
      
      // Create array for all 7 zones (0-6), filling in missing ones with 0 duration
      const allZones = Array.from({ length: 7 }, (_, i) => {
        const bin = zoneBins.find(b => Number(b.i) === i);
        return {
          zoneIndex: i,
          zone: POWER_ZONE_LABELS[i] || `Zone ${i + 1}`,
          duration: bin ? (Number(bin.t_s) || 0) : 0,
          percentage: total > 0 ? ((bin ? (Number(bin.t_s) || 0) : 0) / total) : 0,
          color: POWER_ZONE_COLORS[i] || POWER_ZONE_COLORS[POWER_ZONE_COLORS.length - 1],
          range: bin ? { min: Number(bin.min) || 0, max: Number(bin.max) || 0 } : undefined,
        };
      });
      
      return { zoneData: allZones, totalTime: total };
    }
    
    // Legacy support: use zoneDurationsSeconds array
    if (zoneDurationsSeconds && zoneDurationsSeconds.length > 0) {
      const total = zoneDurationsSeconds.reduce((a, b) => a + b, 0);
      
      // Create array for all zones, filling in missing ones with 0 duration
      const allZones = Array.from({ length: Math.max(zoneDurationsSeconds.length, 7) }, (_, i) => ({
        zoneIndex: i,
        zone: POWER_ZONE_LABELS[i] || `Zone ${i + 1}`,
        duration: zoneDurationsSeconds[i] || 0,
        percentage: total > 0 ? ((zoneDurationsSeconds[i] || 0) / total) : 0,
        color: POWER_ZONE_COLORS[i % POWER_ZONE_COLORS.length],
        range: zoneRanges?.[i],
      }));
      
      return { zoneData: allZones, totalTime: total };
    }

    return { zoneData: [], totalTime: 0 };
  }, [zoneBins, zoneDurationsSeconds, zoneRanges]);

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
            <div className="text-sm text-muted-foreground">with power</div>
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

        {/* Pie Chart */}
        <div>
          <h3 className="text-sm font-medium mb-3">Zone Distribution</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={zoneData.filter(z => z.duration > 0)}
                dataKey="percentage"
                nameKey="zone"
                cx="50%"
                cy="50%"
                outerRadius={72}
                label={({ percentage }) => pctFmt(percentage)}
              >
                {zoneData.filter(z => z.duration > 0).map((entry, index) => (
                  <Cell key={`cell-${entry.zoneIndex}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value: any) => [pctFmt(value), 'Percentage']} />
            </PieChart>
          </ResponsiveContainer>
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


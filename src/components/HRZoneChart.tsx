import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  BarChart,
  Bar,
  XAxis,
  Tooltip,
  ResponsiveContainer,
  YAxis,
} from "recharts";

/**
 * Heart Rate Zone Chart — Running-first
 * -------------------------------------------------------------
 * Drop-in, single-file React component (Tailwind + shadcn/ui + Recharts).
 *
 * What it shows
 *  - Stacked bar: distribution of time in zones
 *  - Donut: % share of time
 *  - Table + summary (duration, avg HR, max HR)
 *
 * How zones are chosen (priority order)
 *  1) If `zones` prop is provided (array of {name, min, max}), use it.
 *  2) Else if `useReserve=true` and `restHR` present → Karvonen (HRR) zones.
 *  3) Else → Estimate HRmax from age/sex/formula and apply **running** bands.
 *     - Default estimator: Tanaka (208 − 0.7×age); for female with formula "auto" → Gulati.
 *
 * Usage
 *  <HRZoneChart
 *    samples={[{ t: 0, hr: 118 }, { t: 1, hr: 121 }, ...]} // seconds from start
 *    age={38}
 *    sex="female"
 *    useReserve={false}      // set true to use HRR if restHR provided
 *    restHR={55}
 *    zonePreset="run"       // running defaults (Z1..Z5)
 *    title="Run HR Zones"
 *  />
 *
 *  // Or pass precomputed durations instead of samples:
 *  <HRZoneChart zoneDurationsSeconds={[600, 900, 700, 300, 120]} />
 */

export type HRSample = { t: number; hr: number | null };
export type ZoneDef = { name: string; min: number; max: number };

export interface HRZoneChartProps {
  samples?: HRSample[];              // time-ordered; t in seconds from start
  zoneDurationsSeconds?: number[];   // per-zone seconds [Z1..Z5]
  zones?: ZoneDef[];                 // explicit bpm zones (overrides everything)

  // Auto-zone helpers
  age?: number;                      // used to estimate HRmax if hrMax not supplied
  sex?: "male" | "female" | "other"; // for HRmax formula selection
  hrMax?: number;                    // explicit HRmax; overrides age-based estimate
  restHR?: number;                   // resting HR for Karvonen/HRR
  useReserve?: boolean;              // true → use Karvonen (requires restHR)
  hrMaxFormula?: "auto" | "tanaka" | "fox" | "gellish" | "gulati";
  zonePreset?: "run" | "default";   // running bands vs classic %HRmax

  // Workout summary (when using zoneDurationsSeconds without samples)
  avgHr?: number;
  maxHr?: number;

  // UI
  colors?: string[];
  title?: string;
}

const DEFAULT_COLORS = [
  "#10b981", // Z1 - emerald-500
  "#84cc16", // Z2 - lime-500
  "#f59e0b", // Z3 - amber-500
  "#ef4444", // Z4 - red-500
  "#991b1b", // Z5 - red-800
];

// Classic %HRmax bands (50–60, 60–70, 70–80, 80–90, 90–100)
const DEFAULT_BANDS = [0.50, 0.60, 0.70, 0.80, 0.90, 1.001];
// Running-oriented bands (% of HRmax or %HRR): 60–70, 70–80, 80–87, 87–93, 93–100
const RUN_BANDS = [0.60, 0.70, 0.80, 0.87, 0.93, 1.001];

const pctFmt = (x: number) => `${(x * 100).toFixed(0)}%`;
const fmtTime = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
};

const HRZoneChart: React.FC<HRZoneChartProps> = ({
  samples = [],
  zoneDurationsSeconds,
  zones,
  age,
  sex = "male",
  hrMax,
  restHR,
  useReserve = false,
  hrMaxFormula = "auto",
  zonePreset = "run",
  avgHr: providedAvgHr,
  maxHr: providedMaxHr,
  colors = DEFAULT_COLORS,
  title = "Heart Rate Zones",
}) => {
  // 1) Determine zones
  const { zoneDefs, hrMax: effectiveHrMax, restHr: effectiveRestHr } = useMemo(() => {
    // If explicit zones provided, use them
    if (zones && zones.length > 0) {
      return { zoneDefs: zones, hrMax: 0, restHr: 0 };
    }

    // Estimate HRmax if not provided
    let estimatedHrMax = hrMax;
    if (!estimatedHrMax && age) {
      if (hrMaxFormula === "auto" && sex === "female") {
        // Gulati formula for females: 206 - 0.88 * age
        estimatedHrMax = 206 - 0.88 * age;
      } else if (hrMaxFormula === "tanaka" || hrMaxFormula === "auto") {
        // Tanaka formula: 208 - 0.7 * age
        estimatedHrMax = 208 - 0.7 * age;
      } else if (hrMaxFormula === "fox") {
        estimatedHrMax = 220 - age;
      } else if (hrMaxFormula === "gellish") {
        estimatedHrMax = 207 - 0.7 * age;
      } else if (hrMaxFormula === "gulati") {
        estimatedHrMax = sex === "female" ? 206 - 0.88 * age : 220 - age;
      }
    }

    const effectiveHrMax = estimatedHrMax || 180; // fallback
    const effectiveRestHr = restHR || 60; // fallback

    // Choose bands based on preset
    const bands = zonePreset === "run" ? RUN_BANDS : DEFAULT_BANDS;
    
    // Generate zone definitions
    const zoneDefs: ZoneDef[] = bands.slice(0, -1).map((band, i) => {
      const min = i === 0 ? 0 : bands[i - 1];
      const max = band;
      
      let minBpm: number, maxBpm: number;
      
      if (useReserve && restHR) {
        // Karvonen/HRR method
        const hrr = effectiveHrMax - effectiveRestHr;
        minBpm = effectiveRestHr + min * hrr;
        maxBpm = effectiveRestHr + max * hrr;
      } else {
        // %HRmax method
        minBpm = min * effectiveHrMax;
        maxBpm = max * effectiveHrMax;
      }
      
      return {
        name: `Zone ${i + 1}`,
        min: Math.round(minBpm),
        max: Math.round(maxBpm),
      };
    });

    return { zoneDefs, hrMax: effectiveHrMax, restHr: effectiveRestHr };
  }, [zones, age, sex, hrMax, restHR, useReserve, hrMaxFormula, zonePreset]);

  // 2) Process samples or use provided durations
  const { zoneData, totalTime, avgHr, maxHr } = useMemo(() => {
    if (zoneDurationsSeconds && zoneDurationsSeconds.length > 0) {
      // Use provided durations
      const total = zoneDurationsSeconds.reduce((a, b) => a + b, 0);
      // Include ALL zones (even with 0 duration) so the chart shows all zones
      const zoneData = zoneDurationsSeconds.map((duration, i) => ({
        zone: zoneDefs[i]?.name || `Zone ${i + 1}`,
        duration,
        percentage: total > 0 ? duration / total : 0,
        color: colors[i % colors.length],
        zoneIndex: i, // Store original index for zoneDefs lookup
      }));
      
      return { zoneData, totalTime: total, avgHr: providedAvgHr ?? 0, maxHr: providedMaxHr ?? 0 };
    }

    // Process samples
    if (!samples.length) {
      return { zoneData: [], totalTime: 0, avgHr: 0, maxHr: 0 };
    }

    // Count time in each zone
    const zoneCounts = new Array(zoneDefs.length).fill(0);
    let totalHr = 0;
    let hrCount = 0;
    let maxHr = 0;

    samples.forEach(sample => {
      if (sample.hr && sample.hr > 0) {
        totalHr += sample.hr;
        hrCount++;
        maxHr = Math.max(maxHr, sample.hr);
        
        // Find which zone this HR falls into
        for (let i = 0; i < zoneDefs.length; i++) {
          const zone = zoneDefs[i];
          if (sample.hr >= zone.min && sample.hr < zone.max) {
            zoneCounts[i]++;
            break;
          }
        }
      }
    });

    const totalTime = samples.length; // assuming 1 sample per second
    const avgHr = hrCount > 0 ? totalHr / hrCount : 0;

    const zoneData = zoneCounts.map((count, i) => ({
      zone: zoneDefs[i].name,
      duration: count,
      percentage: totalTime > 0 ? count / totalTime : 0,
      color: colors[i % colors.length],
      zoneIndex: i, // Store original index for zoneDefs lookup
    }));

    return { zoneData, totalTime, avgHr, maxHr };
  }, [samples, zoneDurationsSeconds, zoneDefs, colors]);

  if (zoneData.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">No heart rate data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold">{fmtTime(totalTime)}</div>
            <div className="text-sm text-muted-foreground">Duration</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{Math.round(avgHr)}</div>
            <div className="text-sm text-muted-foreground">Avg HR</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{Math.round(maxHr)}</div>
            <div className="text-sm text-muted-foreground">Max HR</div>
          </div>
        </div>

        <Separator />

        {/* Bar Chart */}
        <div>
          <h3 className="text-sm font-medium mb-3">Time Distribution</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={zoneData} margin={{ top: 8, right: 8, left: 8, bottom: 16 }}>
              <XAxis dataKey="zone" />
              <YAxis 
                tickFormatter={(value) => fmtTime(value)}
              />
              <Tooltip 
                formatter={(value: any) => [fmtTime(value), 'Time']}
                labelFormatter={(label) => `Zone: ${label}`}
              />
              <Bar dataKey="duration" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Zone Table */}
        <div>
          <h3 className="text-sm font-medium mb-3">Zone Details</h3>
          <div className="space-y-2">
            {zoneData.filter(z => z.duration > 0).map((zone) => (
              <div key={zone.zone} className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-4 h-4 rounded-full" 
                    style={{ backgroundColor: zone.color }}
                  />
                  <span className="font-medium">{zone.zone}</span>
                  <span className="text-sm text-muted-foreground">
                    {zoneDefs[(zone as any).zoneIndex]?.min}-{zoneDefs[(zone as any).zoneIndex]?.max} bpm
                  </span>
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

export default HRZoneChart;

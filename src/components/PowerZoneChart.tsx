import React, { useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import ZoneCard, { ZONE_COLORS } from "./ZoneCard";

/**
 * Power Zone Chart
 * -------------------------------------------------------------
 * Displays power distribution across zones for cycling workouts.
 * Uses server-computed zone data from `display_metrics.zones.power` (workout-detail), each bin as
 * compute-workout-analysis cut it, with its share, name and range written beside it on the server.
 *
 * ⛔ THE ZONE NAMES AND RANGES ARE THE SERVER'S (2026-09-26) — `name` ("Z7 Neuromuscular") and `range`
 * ("> 252W") on each bin, from `_shared/endurance/display-zones.ts`, the table Profile prints. This file kept
 * a seven-name list of its own ("Z6+ Neuromuscular") and printed `{min}-{max} W`, so the open top bin, whose
 * `max` is stored as null, read "252-0 W". A bin with no words from the server prints none.
 * The legacy `zoneDurationsSeconds` / `zoneRanges` props went with the list: nothing passed them.
 *
 * ⛔ THE TIME "WITH POWER" IS THE SERVER'S TOO (2026-09-26) — `totalDisplay`, the sum of the bins written by
 * workout-detail (`total_display`). This card added the bins up and formatted the sum itself.
 */

interface PowerZoneBin {
  i: number;  // Zone index (0-6)
  t_s: number;  // Duration in seconds
  /** 2026-09-16: this bin's share of the window (0–1), written on the server beside the bin. */
  share?: number;
  /** 2026-09-26: the level's name and range, written on the server beside the bin. */
  name?: string | null;
  range?: string | null;
}

interface PowerZoneChartProps {
  zoneBins?: PowerZoneBin[];  // Server bins with i, t_s, share, name, range
  /** The time with a power reading, as the server wrote it. */
  totalDisplay?: string | null;
  avgPower?: number;
  maxPower?: number;
  title?: string;
}

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
  totalDisplay,
  avgPower,
  maxPower,
  title = "Power zones",
}) => {
  const zoneData = useMemo(() => {
    if (zoneBins && zoneBins.length > 0) {
      // ⛔ THE SHARE IS THE SERVER'S (2026-09-16) — `share` on each bin. This divided by the sum here.

      // Create array for all 7 zones (0-6), filling in missing ones with 0 duration
      const allZones = Array.from({ length: 7 }, (_, i) => {
        const bin = zoneBins.find(b => Number(b.i) === i);
        return {
          zoneIndex: i,
          zone: typeof bin?.name === "string" && bin.name ? bin.name : null,
          range: typeof bin?.range === "string" && bin.range ? bin.range : null,
          duration: bin ? (Number(bin.t_s) || 0) : 0,
          percentage: bin ? (Number((bin as { share?: unknown }).share) || 0) : 0,
          color: ZONE_COLORS[i] || ZONE_COLORS[ZONE_COLORS.length - 1],
        };
      });

      return allZones;
    }

    return [];
  }, [zoneBins]);

  if (zoneData.length === 0) {
    return <ZoneCard title={title} stats={[]} rows={[]} empty="No power data available" />;
  }

  return (
    <ZoneCard
      title={title}
      stats={[
        { value: totalDisplay || "—", label: "with power" },
        { value: avgPower ? String(Math.round(avgPower)) : "—", label: "Avg Power" },
        { value: maxPower ? String(Math.round(maxPower)) : "—", label: "Max Power" },
      ]}
      chart={
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
                {zoneData.filter(z => z.duration > 0).map((entry) => (
                  <Cell key={`cell-${entry.zoneIndex}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value: any) => [pctFmt(value), 'Percentage']} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      }
      rows={zoneData.map((zone) => ({
        key: `zone-${zone.zoneIndex}`,
        color: zone.color,
        name: zone.zone,
        range: zone.range,
        time: fmtTime(zone.duration),
        share: pctFmt(zone.percentage),
      }))}
    />
  );
};

export default PowerZoneChart;

import React from "react";
// ⛔ ONE ZONE CARD (2026-09-26): drawn through `ZoneCard`, the power card's look — no monospace numbers.
import ZoneCard, { ZONE_COLORS } from "./ZoneCard";

/**
 * Heart-rate zones card
 * -------------------------------------------------------------
 * Prints a session's heart-rate zones as the server wrote them (`display_metrics.zones.hr`, workout-detail):
 * each bin's time, its share, its name ("Zone 5a") and its range ("158–163 bpm"), and the time with a
 * heart-rate reading ("with heart rate").
 *
 * ⛔ THE CARD NAMES NO ZONE AND WORKS OUT NO EDGE (2026-09-26, Michael). The zones are the ones the session was
 * counted in — Friel's zones from the threshold heart rate on Baselines, else % of max heart rate — named and
 * ranged by `_shared/endurance/display-zones.ts`, the same rows the Baselines zone table prints. This file
 * named every zone "Zone N" and printed `{min}-{max} bpm` over whatever table it was handed, and carried its own
 * max-heart-rate formulas (Tanaka / Gulati / Fox / Karvonen) that no caller used.
 */

export interface HRZoneBin {
  i: number;
  /** Seconds in the zone. */
  t_s: number;
  /** This bin's share of the time with a reading (0–1), written on the server. */
  share?: number;
  /** The zone's name and range, written on the server. */
  name?: string | null;
  range?: string | null;
}

export interface HRZoneChartProps {
  zoneBins?: HRZoneBin[];
  /** The time with a heart-rate reading, as the server wrote it. */
  totalDisplay?: string | null;
  avgHr?: number;
  maxHr?: number;
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

const HRZoneChart: React.FC<HRZoneChartProps> = ({
  zoneBins,
  totalDisplay,
  avgHr,
  maxHr,
  title = "Heart rate zones",
}) => {
  if (!zoneBins || zoneBins.length === 0) {
    return <ZoneCard title={title} stats={[]} rows={[]} empty="No heart rate data available" />;
  }

  return (
    <ZoneCard
      title={title}
      stats={[
        { value: totalDisplay || "—", label: "with heart rate" },
        { value: avgHr ? String(Math.round(avgHr)) : "—", label: "Avg HR" },
        { value: maxHr ? String(Math.round(maxHr)) : "—", label: "Max HR" },
      ]}
      // A zone the session never reached prints no row, as before.
      rows={zoneBins.filter((b) => (Number(b.t_s) || 0) > 0).map((b) => ({
        key: `zone-${b.i}`,
        color: ZONE_COLORS[b.i] ?? ZONE_COLORS[ZONE_COLORS.length - 1],
        name: typeof b.name === "string" && b.name ? b.name : null,
        range: typeof b.range === "string" && b.range ? b.range : null,
        time: fmtTime(Number(b.t_s) || 0),
        share: pctFmt(Number(b.share) || 0),
      }))}
    />
  );
};

export default HRZoneChart;

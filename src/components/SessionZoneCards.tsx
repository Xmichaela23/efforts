import React from "react";
import HRZoneChart from "./HRZoneChart";
import PowerZoneChart from "./PowerZoneChart";
import { useWorkoutData } from "@/hooks/useWorkoutData";

/**
 * ⛔ THE ZONE CARDS SIT ON PERFORMANCE (2026-09-26, Michael) — moved whole from the Details tab
 * (`CompletedTab`), below the session's own numbers and readings. Same bins, same gates, same numbers:
 * heart-rate zones whenever the session has heart-rate bins, power zones on a ride with power bins.
 * The caller decides which sessions get them, with the test the Details tab used (UnifiedWorkoutView).
 *
 * ⛔ THE BINS COME WITH THEIR SHARES (2026-09-16, Stage 4 session 3) — `display_metrics.zones`, the
 * analyser's own bins with each one's share of the window written beside it, and since 2026-09-26 every
 * bin's name and range (heart rate and power) and each card's time with a reading (`total_display`).
 * A response without the fields falls back to the raw bins and the cards print no percentages, no zone
 * names and no time, rather than working them out again.
 *
 * ⛔ THE CARD WORDS (Michael, 2026-09-26): "Heart rate zones" / "Power zones", and the time under each
 * "with heart rate" / "with power".
 *
 * A section of the Performance panel, divided by the same hairline as the sections above it.
 */
export default function SessionZoneCards({ workoutData }: { workoutData: any }) {
  const norm = useWorkoutData(workoutData);
  const zonesHr = (norm as any)?.zones?.hr ?? workoutData?.computed?.analysis?.zones?.hr;
  const zonesPower = (norm as any)?.zones?.power ?? workoutData?.computed?.analysis?.zones?.power;
  const hasHRZones = zonesHr?.bins?.length;
  const hasPowerZones = zonesPower?.bins?.length;
  const isRide = String(workoutData?.type || '').toLowerCase().includes('ride') || String(workoutData?.type || '').toLowerCase().includes('bike');

  if (!hasHRZones && !(hasPowerZones && isRide)) return null;

  return (
    <div className="px-3 py-3 space-y-4 border-t border-white/[0.055]">
      {/* HR Zones */}
      {hasHRZones && (
        <HRZoneChart
          zoneBins={zonesHr.bins.map((b:any, i:number)=> ({
            i: Number.isFinite(Number(b.i)) ? Number(b.i) : i,
            t_s: Number(b.t_s) || 0,
            share: Number(b.share) || 0,
            // server-field: the zone's name and range, written by workout-detail from display-zones.ts
            name: typeof b.name === 'string' ? b.name : null,
            range: typeof b.range === 'string' ? b.range : null,
          }))}
          totalDisplay={typeof zonesHr.total_display === 'string' ? zonesHr.total_display : null}
          avgHr={norm.avg_hr ?? undefined}
          maxHr={norm.max_hr ?? undefined}
          title="Heart rate zones"
        />
      )}

      {/* Power Zones - only for rides with power data */}
      {hasPowerZones && isRide && (
        <PowerZoneChart
          zoneBins={zonesPower.bins.map((b:any)=> ({
            i: Number(b.i) || 0,
            t_s: Number(b.t_s) || 0,
            share: Number(b.share) || 0,
            // server-field: the level's name and range, written by workout-detail from display-zones.ts
            name: typeof b.name === 'string' ? b.name : null,
            range: typeof b.range === 'string' ? b.range : null,
          }))}
          totalDisplay={typeof zonesPower.total_display === 'string' ? zonesPower.total_display : null}
          avgPower={norm.avg_power ?? undefined}
          maxPower={norm.max_power ?? undefined}
          title="Power zones"
        />
      )}
    </div>
  );
}

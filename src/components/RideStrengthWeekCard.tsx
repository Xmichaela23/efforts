/**
 * ⛔ THE RIDE + STRENGTH WEEK — THE PAGE'S RIDES, ONE QUESTION (WORKORDER-ride-strength-2026-09-13 §3, §4).
 *
 * p278 fixes the week: sweet spot, endurance, VO2, sprint and endurance rides, every one at level 1,
 * and nothing the athlete types adds a ride or climbs a level (`Frame.printedWeekOnly`). The one
 * answer left open is four rides or five; the four-ride week leaves out the ride the frame declares
 * (`Frame.fewerRidesDropsSlot`, the Day 2 easy ride).
 *
 * ⚠️ A SEPARATE CARD FROM `RunStrengthWeekCard` AND `EnduranceWeekCard`, so neither of those screens
 * changes. Nothing here re-derives a fact: the rows are `frameSlots`, the names are the plan's own
 * session names (`FAMILY_LABEL`), and which row a four-ride week leaves out is the frame's declaration.
 */
import React from 'react';
import { getDisciplineColor } from '@/lib/context-utils';
import { GalaxyButton } from '@/components/ui/galaxy-button';
import { EASY_RIDE_LONGER_LINE, RIDE_COUNT_CHIP, RIDE_COUNT_LABEL, rideCountOptions, rideRowLine, ridesForCount } from '@/lib/ride-strength-week';
import type { FrameId } from '../../supabase/functions/_shared/standing-plan/frames.ts';

type Props = {
  frame: FrameId;
  rideCount: 4 | 5;
  onRideCount: (n: 4 | 5) => void;
};

export default function RideStrengthWeekCard(props: Props) {
  const rideColor = getDisciplineColor('ride');
  const rows = ridesForCount(props.frame, props.rideCount);
  const counts = rideCountOptions(props.frame);

  return (
    <div className="space-y-3">
      <div>
        <p className="text-white/80 text-[13px] mb-2">{RIDE_COUNT_LABEL}</p>
        <div className="flex gap-1.5">
          {counts.map((n) => (
            <GalaxyButton
              key={n}
              shape="chip"
              variant={props.rideCount === n ? 'primary' : 'secondary'}
              data-testid={`ride-count-${n}`}
              onClick={() => props.onRideCount(n)}
            >
              {RIDE_COUNT_CHIP[n]}
            </GalaxyButton>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.key}
            data-testid={`ride-row-${row.key}`}
            className="rounded-xl border border-white/12 bg-white/[0.02] p-3 border-l-2"
            style={{ borderLeftColor: rideColor }}
          >
            <p className="text-white text-[15px]">
              {rideRowLine(row)}
            </p>
          </div>
        ))}
      </div>
      <p className="text-white/55 text-sm leading-relaxed">{EASY_RIDE_LONGER_LINE}</p>
    </div>
  );
}

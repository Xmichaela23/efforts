/**
 * ⛔ THE RIDE + STRENGTH WEEK — THE PAGE'S RIDES, ONE QUESTION (WORKORDER-ride-strength-2026-09-13 §3, §4).
 *
 * p278 fixes the week and the one answer left open is four rides or five. ⛔ EVERYTHING ON THIS CARD IS THE
 * SERVER'S (2026-09-13, punch list "Default picks and per-plan wording move to the server"): the question, its
 * answers, the rides each answer holds and the easy-ride line come in the intake readout
 * (`ride_strength_week`). The card renders them and holds no words of its own.
 */
import React from 'react';
import { getDisciplineColor } from '@/lib/context-utils';
import { GalaxyButton } from '@/components/ui/galaxy-button';
import type { EnduranceIntakeReadout } from '@/lib/builder-readout';

type Props = {
  readout: EnduranceIntakeReadout['ride_strength_week'];
  rideCount: number;
  onRideCount: (n: 4 | 5) => void;
};

export default function RideStrengthWeekCard(props: Props) {
  const rideColor = getDisciplineColor('ride');
  const week = props.readout;
  if (!week) return null;
  const rows = week.counts.find((c) => c.count === props.rideCount)?.rows ?? [];

  return (
    <div className="space-y-3">
      <div>
        <p className="text-white/80 text-[13px] mb-2">{week.count_label}</p>
        <div className="flex gap-1.5">
          {week.counts.map((c) => (
            <GalaxyButton
              key={c.count}
              shape="chip"
              variant={props.rideCount === c.count ? 'primary' : 'secondary'}
              data-testid={`ride-count-${c.count}`}
              onClick={() => props.onRideCount(c.count as 4 | 5)}
            >
              {c.label}
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
            <p className="text-white text-[15px]">{row.line}</p>
          </div>
        ))}
      </div>
      <p className="text-white/55 text-sm leading-relaxed">{week.easy_line}</p>
    </div>
  );
}

/**
 * ⛔⛔ THE RUN + STRENGTH WEEK — FOUR RUN ROWS, ONE QUESTION (Michael, 2026-09-07 evening).
 *
 * `WORKORDER-run-strength-rotate-2026-09-07.md`. The ruling: on this programme the engine rotates
 * the run workouts and the athlete is asked nothing the page already answers. p112 is the rule the
 * rotation implements — hold the load and vary *"across slightly different set durations and
 * intensities"* session to session. p246 fixes the week: MLSS+ level 2, near-threshold level 3, VT1
 * level 1, LSD level 2, with the long run under 100 minutes (p247).
 *
 * ⛔ SO EXACTLY ONE CONTROL SURVIVES: how long the long run is. Everything else this screen used to
 * ask — weekly hours, days a week, the running-experience chips, the sport chips and the two
 * hard-workout pickers — is either the page's answer or a question this frame no longer leaves
 * open. Michael, amending the same evening: *"they choose the length of the runs instead."*
 *
 * ⛔⛔ IT IS A SEPARATE CARD FROM `EnduranceWeekCard`, AND THAT IS THE POINT. That card is the
 * Standard Focus screen and carries every one of the controls above; adding a fourth mode to it to
 * hide them all is how the two programmes' screens come to share a bug. **Standard Focus is
 * byte-identical through this work order and its card is untouched.**
 *
 * ⚠️ NOTHING HERE RE-DERIVES A FACT THE FRAME OR THE LIBRARY STATES. The rows, their day numbers,
 * their labels, the fixed quality doses and the long run's offered lengths all come from the same
 * owners `EnduranceWeekCard` reads — `frameSlots`, `slotFrameDay`, `slotLengthOptions`,
 * `slotFixedMinutes` — so the number on this row and the number in the plan are one number by
 * construction.
 */
import React from 'react';
import { getDisciplineColor } from '@/lib/context-utils';
// ⛔ THE APP'S ONE CHIP SHAPE — `galaxy-button.tsx` is the single owner of button and chip geometry,
// and its lint refuses a hand-rolled radius. A length chip is a chip.
import { GalaxyButton } from '@/components/ui/galaxy-button';
import type { SlotKey } from '@/lib/standing-plan-week-copy';
/**
 * ⛔ THE NUMBERS AND THE WORDS ARE THE SERVER'S (2026-09-10, audit H-P06; words 2026-09-13, punch list "Default
 * picks and per-plan wording move to the server"). The rows, their titles and lengths, the long-run chips and
 * every line come back with the intake readout (`run_strength_week`); the card draws them and owns none of them.
 */
import type { EnduranceIntakeReadout } from '@/lib/builder-readout';

type Props = {
  /** The server's week. Null until it answers — the card then draws nothing. */
  readout: EnduranceIntakeReadout['run_strength_week'];
  /** The athlete's per-session lengths. Only the long row carries a pick; the easy row is a constant. */
  slotMinutes?: Partial<Record<SlotKey, number>>;
  onSlotMinutes: (key: SlotKey, minutes: number) => void;
};

export default function RunStrengthWeekCard(props: Props) {
  const runColor = getDisciplineColor('run');
  const week = props.readout;
  if (!week) return null;
  const pickedLong = props.slotMinutes?.long;

  return (
    <div className="space-y-3">
      <div>
        {week.commitment_line ? (
          <p className="text-white/85 text-sm leading-relaxed">{week.commitment_line}</p>
        ) : null}
        <p className="text-white/55 text-sm leading-relaxed mt-1">{week.sub_line}</p>
      </div>
      <div className="space-y-2">
        {week.rows.map((row) => {
          // ⚠️ The long row's length is the athlete's chip; the others come from the server as written.
          const lengthNow = row.is_long
            ? (pickedLong != null && week.long_run_options.includes(pickedLong) ? week.long_option_labels[String(pickedLong)] : null)
            : row.length;
          return (
            <div
              key={row.key}
              data-testid={`run-row-${row.key}`}
              className="rounded-xl border border-white/12 bg-white/[0.02] p-3 border-l-2"
              style={{ borderLeftColor: runColor }}
            >
              <p className="text-white text-[15px]">{row.title}</p>
              <p className="text-white/55 text-xs mt-1 leading-relaxed">
                {[row.session, lengthNow].filter(Boolean).join(' · ')}
              </p>
              {row.is_long && week.long_run_options.length > 0 ? (
                <div className="mt-2.5">
                  <p className="text-white/80 text-[13px] mb-2">{week.length_label}</p>
                  <div className="flex gap-1.5">
                    {week.long_run_options.map((m) => (
                      <GalaxyButton
                        key={m}
                        shape="chip"
                        variant={pickedLong === m ? 'primary' : 'secondary'}
                        data-testid={`long-run-${m}`}
                        onClick={() => props.onSlotMinutes('long', m)}
                      >
                        {week.long_option_labels[String(m)]}
                      </GalaxyButton>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

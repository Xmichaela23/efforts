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
import {
  frameSlots, sessionLengthLabel, SESSION_LENGTH_LABEL, SESSION_LENGTH_VARIES, slotFrameDay,
  type SlotKey, type SlotSelection,
} from '@/lib/standing-plan-week-copy';
import { runWeekCommitmentLine } from '@/lib/lifting-commitment';
/**
 * ⛔ THE NUMBERS ARE THE SERVER'S (2026-09-10, audit H-P06). The easy run's length, the long-run chips
 * and their default come back with the preview (`readout`); the card draws them and owns none of them.
 */
import { runStrengthWeekSub } from '@/lib/run-strength-week';
import type { EnduranceIntakeReadout } from '@/lib/builder-readout';
import { FAMILIES } from '../../supabase/functions/_shared/endurance-library/index.ts';
import type { FrameId } from '../../supabase/functions/_shared/standing-plan/frames.ts';

/**
 * ⛔ WHAT A ROW SAYS ABOUT ITS SESSION. A pinned shape gets the library's own name for it; an
 * unpinned one rotates and gets the FAMILY'S name, because there is no single workout to name.
 * ⚠️ THE LIBRARY OWNS BOTH WORDS. A name typed here would be a second copy of the page.
 */
function sessionNameFor(family: string, archetype: string | null | undefined): string {
  const fam = (FAMILIES as Record<string, {
    label?: string; archetypes?: { id: string; label?: string }[];
  }>)[family];
  if (!fam) return '';
  if (archetype) {
    const a = (fam.archetypes ?? []).find((x) => x.id === archetype);
    if (a?.label) return a.label;
  }
  return fam.label ?? '';
}

type Props = {
  frame: FrameId;
  /** The server's lengths for this week. Null until it answers — the rows then state no length. */
  readout: EnduranceIntakeReadout['run_strength_week'];
  /** The athlete's per-session lengths. Only the long row carries a pick; the easy row is a constant. */
  slotMinutes?: Partial<Record<SlotKey, number>>;
  onSlotMinutes: (key: SlotKey, minutes: number) => void;
};

export default function RunStrengthWeekCard(props: Props) {
  const frame = props.frame;
  const runColor = getDisciplineColor('run');
  // ⛔ THE FRAME'S OWN DAY ORDER — p246 runs day 1, day 3, day 4, day 6. `frameSlots` walks the
  // column, so the rows cannot drift from the week the composer builds.
  const rows = frameSlots(frame);
  const longOptions = props.readout?.long_run_options ?? [];
  const easyMinutes = props.readout?.easy_run_minutes ?? null;
  const pickedLong = props.slotMinutes?.long;

  return (
    <div className="space-y-3">
      <div>
        {/* ⛔ THE LIFTING LINE, MOVED HERE WITH THE POSTURE CARD'S REMOVAL (2026-09-07). Counted off
            the frame's own column — see `runWeekCommitmentLine` — never typed. */}
        {runWeekCommitmentLine(frame) ? (
          <p className="text-white/85 text-sm leading-relaxed">{runWeekCommitmentLine(frame)}</p>
        ) : null}
        {easyMinutes != null ? (
          <p className="text-white/55 text-sm leading-relaxed mt-1">{runStrengthWeekSub(easyMinutes)}</p>
        ) : null}
      </div>
      <div className="space-y-2">
        {rows.map((row) => {
          const dayNumber = slotFrameDay(row.key, 'standard', frame);
          const isLong = row.role === 'long';
          const isEasy = row.role === 'easy';
          /**
           * ⛔⛔ THE TWO HARD ROWS CARRY NO NUMBER, AND THAT IS A MEASUREMENT RATHER THAN A STYLE
           * CHOICE (2026-09-07). The work order asked them to state a length as a fact. Both were
           * checked against real materialized rows from a throwaway account before the number was
           * printed, and neither can back one today:
           *
           *   · **Day 1 genuinely rotates** (p112, and `rotatedArchetype` implements it): three
           *     different p237 shapes across five weeks, 39 to 45 minutes. There is no single true
           *     length, which is exactly what `SESSION_LENGTH_VARIES` was written for.
           *   · **Day 3 is pinned by the frame** (`below_threshold`) and `slotFixedMinutes` returns
           *     59 for it — but the built plan rows read **25 minutes** every week. ⚠️ THE LADDER
           *     AND THE MATERIALIZED SESSION DISAGREE ON THAT SLOT, and printing 59 over a plan
           *     that says 25 is the "row computed one number and presented it as the dose" defect
           *     `slotFixedMinutes`'s own note was written about. **Reported rather than papered
           *     over; the disagreement is upstream of this screen and is not this order's to fix.**
           *
           * ⛔ SO THE ROW STATES WHAT IS TRUE OF BOTH: the engine rotates them. A number the plan
           * contradicts is worse than no number — this file's standing rule, applied to itself.
           * ⚠️ `slotFixedMinutes` IS DELIBERATELY NOT CALLED HERE. Reinstate it only when a built
           * week can be shown to agree with it on both rows.
           */
          const lengthNow = isLong
            ? (pickedLong != null && longOptions.includes(pickedLong) ? sessionLengthLabel(pickedLong) : null)
            : isEasy
              ? (easyMinutes != null ? sessionLengthLabel(easyMinutes) : null)
              : SESSION_LENGTH_VARIES;
          const session = sessionNameFor(row.family, row.archetype ?? null);
          return (
            <div
              key={row.key}
              data-testid={`run-row-${row.key}`}
              className="rounded-xl border border-white/12 bg-white/[0.02] p-3 border-l-2"
              style={{ borderLeftColor: runColor }}
            >
              <p className="text-white text-[15px]">
                {dayNumber != null ? `Day ${dayNumber} · ` : ''}{row.label}
              </p>
              <p className="text-white/55 text-xs mt-1 leading-relaxed">
                {[session, lengthNow].filter(Boolean).join(' · ')}
              </p>
              {/* ⛔ THE ONE CONTROL ON THIS SCREEN. Chips rather than a select: three values, and the
                  athlete reads all three at once. */}
              {isLong && longOptions.length > 0 ? (
                <div className="mt-2.5">
                  <p className="text-white/80 text-[13px] mb-2">{SESSION_LENGTH_LABEL}</p>
                  <div className="flex gap-1.5">
                    {longOptions.map((m) => (
                      <GalaxyButton
                        key={m}
                        shape="chip"
                        variant={pickedLong === m ? 'primary' : 'secondary'}
                        data-testid={`long-run-${m}`}
                        onClick={() => props.onSlotMinutes('long', m)}
                      >
                        {sessionLengthLabel(m)}
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

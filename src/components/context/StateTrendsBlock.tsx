import React from 'react';
import { readoutPlateStyle } from '@/lib/readout-plate';
import { EnduranceReadCards } from './StrengthReadCards';

/**
 * TRENDS — the endurance cards, one per sport, on one plate.
 * Extracted from StateTab 2026-09-01 (Round 0a), then narrowed by Round 1a the same day.
 *
 * ⛔⛔ ROUND 1a, RULED BY MICHAEL 2026-09-01: "IS THE BAR GOING UP" IS DELETED FROM THIS BLOCK.
 * The four main lifts were drawn twice in one scroll — here as name / estimated max / weekly-heaviest
 * line, and again in the STRENGTH block inside <StatePerformanceSection>. The STRENGTH block SURVIVES
 * because it carries four things this surface never had: the all-history record (`allTimeBestE1rm`,
 * deliberately ungated), the session count and as-of date, the last all-out set with its rep-PR flag,
 * and the training-max climbing / holding / reset line. Both surfaces read the SAME number from the
 * SAME series (`liftSeriesFromExerciseLog` — one point per ISO week, that week's heaviest set, ten-rep
 * ceiling), so neither was "smarter" and the duplicate was pure redundancy.
 *
 * ⛔ THE SERVER SERIES IS UNTOUCHED. `liftSeriesFromExerciseLog` and the 2026-08-29 weekly-heaviest-set
 * replacement of the heavy gate feed BOTH surfaces and stay exactly as they were. This was a
 * client-side deletion only — no edge function changed, no payload field removed.
 *
 * ⚠️ `StrengthReadCards.tsx` IS NOT DELETED. It also exports <EnduranceReadCards>, which is the whole
 * of this block now. Only the <StrengthReadCards> import and its call site went.
 *
 * ⚠️ WHAT WAS DELETED, so a later session does not "restore" it: the "is the bar going up" heading,
 * <StrengthReadCards />, the `seriesByCanonical` / `expectedByCanonical` maps and the three-way
 * `per_lift` fallback that filled them (display → snapshot → coach model), and the `liftCardCount`
 * predicate that gated the heading. All of it existed only to draw the lift cards.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export default function StateTrendsBlock({ wsv }: { wsv: any }) {
  const namedSessions = (wsv.trends?.display as { namedSessions?: React.ComponentProps<typeof EnduranceReadCards>['sessions'] } | undefined)?.namedSessions ?? null;
  // ⛔ THE ATHLETE-SCOPED SPINE (2026-08-28, item 3 / Q-294). Every run and ride, grouped by
  // session type, NO PLAN REQUIRED — the primary endurance read. `namedSessions` above is the
  // overlay that appears when a block exists, and it is drawn after this.
  const enduranceSpine = (wsv.trends?.display as { enduranceSpine?: React.ComponentProps<typeof EnduranceReadCards>['spine'] } | undefined)?.enduranceSpine ?? null;
  /**
   * ⛔ THE GATE NARROWED WITH THE BLOCK (Round 1a), AND THAT IS DELIBERATE — SAID OUT LOUD BECAUSE IT
   * IS THE ONE BEHAVIOUR CHANGE IN THIS DELETE.
   *
   * It used to be a FOUR-way test: a lift history (`me_history_v1`), a named session, the spine, or
   * the week's lifting dose (`viadaWeek`). Two of those doors opened a plate that no longer holds
   * anything they feed:
   *  · `me_history_v1` was the lift cards' door. The lift cards are gone.
   *  · `viadaWeek` stopped being drawn here on 2026-08-29 when the week's dose moved to the LOAD
   *    plate; the old comment admits it was kept in the gate only because "the section's render gate
   *    counts it as substance." It counts nothing now.
   * Leaving either in would draw an EMPTY plate for an athlete who lifts and does not run — exactly
   * the week-1 case this screen keeps producing. The gate is now the endurance cards' own predicate,
   * so the plate and its contents cannot disagree.
   */
  if (!(namedSessions && namedSessions.length > 0) && !(enduranceSpine && enduranceSpine.length > 0)) return null;
  return (
    <div
      className="mb-3 galaxy-card readout-texture readout-texture--spectral rounded-2xl"
      style={readoutPlateStyle(undefined, { galaxy: true })}
    >
      {/* ⛔ ONE PER SPORT. They answer "is the same work getting cheaper" in the endurance
          disciplines, and the block is one thing, not three screens. They render independently of
          anything strength: week 1 of every block is the two strength tests, so a week where the
          runs and rides are logged and no heavy session is yet shows these alone, which is the
          honest state. */}
      <EnduranceReadCards sessions={namedSessions} spine={enduranceSpine} />
    </div>
  );
}

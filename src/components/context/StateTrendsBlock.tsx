import React from 'react';
import { readoutPlateStyle } from '@/lib/readout-plate';
import { EnduranceReadCards } from './StrengthReadCards';

/**
 * TRENDS — the RUN endurance cards, on one plate.
 * Extracted from StateTab 2026-09-01 (Round 0a), narrowed by Round 1a the same day, and narrowed
 * again to RUN ONLY by Round 3 pass 1 (2026-09-01).
 *
 * ⛔⛔ ROUND 3 PASS 1 (A2), 2026-09-01: THE RIDE CARDS MOVED OUT — one owner per sport. Bike's
 * efficiency cards now render under the bike plate in <StatePerformanceSection>, beside the bike
 * fitness/form row, so nothing about the bike appears in two places (Michael: "still seeing rides and
 * bike"). This block is the RUN cards now. ⚠️ RUN KEEPS ITS OWN PLATE FOR ONE MORE PASS, BY DECISION:
 * run has no plate in <StatePerformanceSection> today (its row was deleted in 1b), so giving it one is
 * an appearance change, and that belongs in pass 2 where the card language changes anyway — NOT an
 * oversight. Until then run stays here, faithfully, on this plate.
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
  // ⛔ RUN PRESENCE GATES THIS PLATE NOW (Round 3 pass 1). A ride-only athlete would otherwise get an
  // empty run heading now that the rides have moved to the bike plate. Gate on the same `sport: 'run'`
  // subset the block renders, so the plate and its contents cannot disagree.
  const hasRun = (xs?: Array<{ sport: string }> | null) => Array.isArray(xs) && xs.some((x) => x.sport === 'run');
  if (!hasRun(namedSessions) && !hasRun(enduranceSpine)) return null;
  return (
    <div
      className="mb-3 galaxy-card readout-texture readout-texture--spectral rounded-2xl"
      style={readoutPlateStyle(undefined, { galaxy: true })}
    >
      {/* ⛔ RUN ONLY (Round 3 pass 1). Rides moved to the bike plate. The run cards answer "is the same
          work getting cheaper" and render independently of anything strength: week 1 of every block is
          the two strength tests, so a week where the runs are logged and no heavy session is yet shows
          these alone, which is the honest state. */}
      <EnduranceReadCards sessions={namedSessions} spine={enduranceSpine} sport="run" />
    </div>
  );
}

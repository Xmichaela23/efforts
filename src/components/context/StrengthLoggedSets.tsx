import React, { useState } from 'react';
import { trustedMaxReps } from '@/lib/estimate-1rm';
// ⛔ THE ONE NAME MAP (FIXLIST 1d). The rows arriving here carry TWO other vocabularies: the coach
// builds its own `display_name` from a private `LIFT_DISPLAY` table (`coach/index.ts:2479`, where
// `squat` is "Squat"), and `useExerciseLog` sets `displayName` to `rows[0].exercise_name` — whatever
// the athlete happened to type. `canonicalDisplayName` (`_shared/canonicalize.ts:319`) exists
// precisely to collapse that, and it calls `squat` "Back Squat", which is what the STRENGTH block
// above this section already shows. Read from it so one lift cannot wear two names on one plate.
import { canonicalDisplayName } from '@shared/canonicalize';
import type { LiftTrend, LiftTrendEntry } from '@/hooks/useExerciseLog';

/**
 * "FROM YOUR LOGGED SETS" + "YOUR BEST SETS" — extracted from StateTab 2026-09-01 (Round 0b).
 * NO BEHAVIOUR CHANGE: this is the same JSX, the same comments and the same state, lifted out of
 * the layout so the blocks above and below it can be moved without a brace-matching script.
 *
 * ⛔ THE EMPTY GATE STAYS IN THE CALLER, ON PURPOSE. `StatePerformanceSection` tests
 * `strengthDetail` for TRUTHINESS (its lines 1624 and 1659) to decide whether to draw a standalone
 * detail block. An element that renders null is still truthy, so gating inside this component would
 * have drawn an empty wrapper when there is nothing to show. The caller keeps
 * `(perLiftMain.length > 0 || otherLifts.length > 0)` and passes null otherwise.
 */
export type OtherLift = {
  canonical: string;
  displayName: string;
  best: LiftTrendEntry | null;
  sessions: number;
};

export default function StrengthLoggedSets({
  perLiftMain,
  otherLifts,
  liftTrends,
}: {
  perLiftMain: Array<any>;
  otherLifts: OtherLift[];
  liftTrends: LiftTrend[];
}) {
  // Collapsed by default — the e1RM dot above is the read; this list is drill-down.
  const [strengthDetailOpen, setStrengthDetailOpen] = useState<boolean>(false);

  return (
    // Layout 2026-08-11 (Michael): reclaim the horizontal space — the list used to indent 84px to align
    // under the parent label column, leaving each lift cramped in ~68% width. It now runs near-full-width
    // (a light border-l keeps the nesting cue) so the sets read clean, like Strong's exercise detail.
    <div className="mt-2 ml-1 pl-3 border-l border-white/[0.07] space-y-3.5">
      {/* Collapsed by default — the e1RM dot above is the read; this list is drill-down. */}
      <button
        type="button"
        onClick={() => setStrengthDetailOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[12px] uppercase tracking-wider text-white/55 hover:text-white/55 transition-colors"
        aria-expanded={strengthDetailOpen}
      >
        <span className={`inline-block transition-transform duration-200 ${strengthDetailOpen ? 'rotate-90' : ''}`}>›</span>
        from your logged sets
        {/* ⚠️ THE COUNT NOW INCLUDES THE OTHER LIFTS (item 5) — it named only the main ones while
            accessories had no home, and would understate the section the moment they got one. */}
        <span className="text-white/45 normal-case tracking-normal">· {perLiftMain.length + otherLifts.length} {perLiftMain.length + otherLifts.length === 1 ? 'lift' : 'lifts'}</span>
      </button>
      {strengthDetailOpen && perLiftMain.map((lt: any) => {
        // A SET HISTORY, LIKE STRONG/HEVY (2026-08-11, Michael: *"it should offer what the other apps
        // do"*). This section is titled "from your logged sets" — so it now shows exactly that: each main
        // lift's recent sessions (weight × reps · date · estimated 1RM), newest first. The old "Working
        // vs baseline" coaching line and the tap-to-adjust are GONE from here. Adjusting weight is a
        // Training-Max / baseline control (one number, weekly weights recalc from it — how the previous program apps do
        // it, verified against Strong/Hevy/main-lift apps), and it lives on the Adjust tab (StateAdjustLens),
        // not as a per-row tweak buried in a read-only history. Data is `useExerciseLog`'s liftTrends —
        // already fetched by StateTab, no new query and no server change.
        const trend = liftTrends.find((t) => t.canonical === lt.canonical_name);
        const entries = trend?.entries ?? [];
        if (entries.length === 0) return null;
        const recent = [...entries].reverse().slice(0, 5); // newest first, most-recent handful
        // D-417: "best" is the strongest TRUSTED reading in the window — a high-rep set inflates its
        // estimate, so it can't be your best (that would rank by reps, not weight). Untrusted sets still
        // show in the list, they just can't win the tag. No trusted set → no "best" (bestIdx stays -1).
        const isTrusted = (e: { best_reps?: number | null }) =>
          Number(e.best_reps) > 0 && Number(e.best_reps) <= trustedMaxReps(lt.canonical_name);
        const bestIdx = recent.reduce(
          (bi, e, i) => (isTrusted(e) && (bi < 0 || (Number(e.estimated_1rm) || 0) > (Number(recent[bi].estimated_1rm) || 0))) ? i : bi,
          -1,
        );
        return (
          <div key={lt.canonical_name} className="space-y-1.5">
            <div className="text-[13px] text-white/80">{canonicalDisplayName(lt.canonical_name)}</div>
            <div className="space-y-1">
              {recent.map((e, i) => {
                const dateLabel = e.date
                  ? new Date(e.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : '';
                const est = Number(e.estimated_1rm) || 0;
                const isBest = i === bestIdx; // bestIdx is -1 when no trusted set exists (D-417)
                return (
                  <div key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[12px]">
                    <span className="text-white/75 tabular-nums">{e.best_weight} lb × {e.best_reps}</span>
                    {dateLabel && <span className="text-white/40">{dateLabel}</span>}
                    {est > 0 && isTrusted(e) && <span className="text-white/45 tabular-nums">e1RM {est} lb</span>}
                    {/* Sport colour, not green — green means bike (Michael 2026-08-15, with the PR tags). */}
                    {isBest && <span className="text-strength font-medium">best</span>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {/* ── SECONDARIES AND ACCESSORIES: RECORDS, NOT A LINE (item 5). ── */}
      {strengthDetailOpen && otherLifts.length > 0 && (
        <div className="space-y-1.5 pt-1">
          {/* ⚠️ ITS OWN QUIET HEADING, because these answer a DIFFERENT question from the rows above.
              A main lift shows a history trending toward a max; these show the best you have done.
              Running them together would imply the accessory has a max line, which it does not. */}
          <div className="text-[11px] uppercase tracking-wider text-white/40">your best sets</div>
          {otherLifts.map((l) => (
            <div key={l.canonical} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[12px]">
              <span className="text-white/75">{canonicalDisplayName(l.canonical)}</span>
              <span className="text-white/75 tabular-nums">{l.best!.best_weight} lb × {l.best!.best_reps}</span>
              {/* ⛔ NO e1RM AND NO DIRECTION WORD. Nobody trends a one-rep max on a curl, and this app
                  does not assert a direction it cannot support. The count is the receipt. */}
              <span className="text-white/40 tabular-nums">{l.sessions} {l.sessions === 1 ? 'session' : 'sessions'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

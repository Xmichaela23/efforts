import React, { useState } from 'react';
import type { CoachWeekContextV1 } from '@/hooks/useCoachWeekContext';

/**
 * "FROM YOUR LOGGED SETS" + "YOUR BEST SETS" — extracted from StateTab 2026-09-01 (Round 0b).
 *
 * ⛔ IT PRINTS, IT DOES NOT PICK (audit 2026-09-10, H-S20). Everything in this section is the coach's
 * `weekly_state_v1.strength_logged_sets`: which lifts are main, each main lift's last five sessions with
 * the "best" tag, the e1RM only where the reps can be trusted (D-417), and every other lift's heaviest
 * set. This file used to work those out from its own `exercise_log` query and `trustedMaxReps`.
 * The names are `canonicalDisplayName`'s, sent with the rows (FIXLIST 1d — one lift, one name).
 *
 * ⛔ THE EMPTY GATE STAYS IN THE CALLER, ON PURPOSE. `StatePerformanceSection` tests
 * `strengthDetail` for TRUTHINESS to decide whether to draw a standalone detail block. An element that
 * renders null is still truthy, so gating inside this component would have drawn an empty wrapper when
 * there is nothing to show. The caller keeps the emptiness test and passes null otherwise.
 */
export type StrengthLoggedSetsData = NonNullable<CoachWeekContextV1['weekly_state_v1']['strength_logged_sets']>;

export default function StrengthLoggedSets({ sets }: { sets: StrengthLoggedSetsData }) {
  // Collapsed by default — the e1RM dot above is the read; this list is drill-down.
  const [strengthDetailOpen, setStrengthDetailOpen] = useState<boolean>(false);
  const count = sets.main.length + sets.others.length;

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
        {/* ⚠️ THE COUNT INCLUDES THE OTHER LIFTS (item 5) — it named only the main ones while
            accessories had no home, and would understate the section the moment they got one. */}
        <span className="text-white/45 normal-case tracking-normal">· {count} {count === 1 ? 'lift' : 'lifts'}</span>
      </button>
      {strengthDetailOpen && sets.main.map((lt) => {
        // A SET HISTORY, LIKE STRONG/HEVY (2026-08-11, Michael: *"it should offer what the other apps
        // do"*). Each main lift's recent sessions (weight × reps · date · estimated 1RM), newest first.
        // Adjusting weight lives on the Adjust tab (StateAdjustLens), not as a per-row tweak here.
        if (lt.sets.length === 0) return null;
        return (
          <div key={lt.canonical} className="space-y-1.5">
            <div className="text-[13px] text-white/80">{lt.display_name}</div>
            <div className="space-y-1">
              {lt.sets.map((e, i) => {
                const dateLabel = e.date
                  ? new Date(e.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : '';
                return (
                  <div key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[12px]">
                    <span className="text-white/75 tabular-nums">{e.weight} lb × {e.reps}</span>
                    {dateLabel && <span className="text-white/40">{dateLabel}</span>}
                    {e.e1rm != null && e.e1rm > 0 && <span className="text-white/45 tabular-nums">e1RM {e.e1rm} lb</span>}
                    {/* Sport colour, not green — green means bike (Michael 2026-08-15, with the PR tags). */}
                    {e.best && <span className="text-strength font-medium">best</span>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {/* ── SECONDARIES AND ACCESSORIES: RECORDS, NOT A LINE (item 5). ── */}
      {strengthDetailOpen && sets.others.length > 0 && (
        <div className="space-y-1.5 pt-1">
          {/* ⚠️ ITS OWN QUIET HEADING, because these answer a DIFFERENT question from the rows above.
              A main lift shows a history trending toward a max; these show the best you have done.
              Running them together would imply the accessory has a max line, which it does not. */}
          <div className="text-[11px] uppercase tracking-wider text-white/40">your best sets</div>
          {sets.others.map((l) => (
            <div key={l.canonical} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[12px]">
              <span className="text-white/75">{l.display_name}</span>
              <span className="text-white/75 tabular-nums">{l.weight} lb × {l.reps}</span>
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

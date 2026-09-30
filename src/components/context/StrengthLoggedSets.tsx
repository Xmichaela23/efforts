import React, { useState } from 'react';
import type { CoachWeekContextV1 } from '@/hooks/useCoachWeekContext';

/**
 * "FROM YOUR LOGGED SETS" + "YOUR BEST SETS" — extracted from StateTab 2026-09-01 (Round 0b).
 *
 * ⛔ IT PRINTS, IT DOES NOT PICK (audit 2026-09-10, H-S20). Everything in this section is the coach's
 * `weekly_state_v1.strength_logged_sets`: which lifts are main, each main lift's last five sessions with
 * the "best" tag, the e1RM only where the reps can be trusted (D-417), and every other lift's heaviest
 * set. This file used to work those out from its own `exercise_log` query and `trustedMaxReps`.
 * The names are `shownName`'s (strength/shown-name.ts), sent with the rows (FIXLIST 1d — one lift, one name).
 *
 * ⛔ THE EMPTY GATE STAYS IN THE CALLER, ON PURPOSE. `StatePerformanceSection` tests
 * `strengthDetail` for TRUTHINESS to decide whether to draw a standalone detail block. An element that
 * renders null is still truthy, so gating inside this component would have drawn an empty wrapper when
 * there is nothing to show. The caller keeps the emptiness test and passes null otherwise.
 */
export type StrengthLoggedSetsData = NonNullable<CoachWeekContextV1['weekly_state_v1']['strength_logged_sets']>;

type HistoryRows = { sets: Array<{ date: string; best: boolean }>; set_lines?: string[]; e1rm_lines?: Array<string | null> };

/**
 * ⛔ ONE SET HISTORY, TWO PLACES (2026-09-29): under each main lift, and under a best-sets lift when it is tapped (Strong
 * and Hevy open every exercise's history). DESIGN_GUIDELINES rules 2 and 3: one grid per lift, so the set, the date,
 * the estimate and "best" each sit in a straight column; the set is the payload, one step up and bright.
 */
function SetHistory({ h }: { h: HistoryRows }) {
  return (
    <div className="grid grid-cols-[auto_auto_1fr_auto] items-baseline gap-x-3 gap-y-1">
      {h.sets.map((e, i) => {
        const dateLabel = e.date
          ? new Date(e.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : '';
        // ⛔ THE SET AND ITS ESTIMATE ARRIVE AS TEXT, IN THE ATHLETE'S OWN UNIT (2026-09-15, Stage 4 session 2).
        return (
          <React.Fragment key={i}>
            <span className="text-footnote text-label tabular-nums">{h.set_lines?.[i] ?? ''}</span>
            <span className="text-caption text-label-secondary">{dateLabel}</span>
            <span className="text-caption text-label-secondary tabular-nums text-right">{h.e1rm_lines?.[i] ?? ''}</span>
            {/* Sport colour, not green — green means bike (Michael 2026-08-15, with the PR tags). */}
            <span className="text-caption text-strength font-medium w-8">{e.best ? 'best' : ''}</span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default function StrengthLoggedSets({ sets }: { sets: StrengthLoggedSetsData }) {
  // The best-sets rows open to their history on a tap, one at a time or several.
  const [openLifts, setOpenLifts] = useState<Set<string>>(() => new Set());
  const toggleLift = (k: string) => setOpenLifts((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });
  const count = sets.main.length + sets.others.length;

  return (
    // Layout 2026-08-11 (Michael): reclaim the horizontal space — the list used to indent 84px to align
    // under the parent label column, leaving each lift cramped in ~68% width. It now runs near-full-width
    // (a light border-l keeps the nesting cue) so the sets read clean, like Strong's exercise detail.
    <div className="mt-2 ml-1 pl-3 border-l border-white/[0.07] space-y-3.5">
      {/* ⛔ ALWAYS OPEN (Michael, 2026-09-29: "the whole card should be expanded, no menu drop"). The section label is a
          label now (rule 4, uppercase and tracked), not a toggle. */}
      <div className="flex items-center gap-1.5 text-caption uppercase tracking-wider text-label-secondary">
        from your logged sets
        {/* ⚠️ THE COUNT INCLUDES THE OTHER LIFTS (item 5) — it named only the main ones while
            accessories had no home, and would understate the section the moment they got one. */}
        <span className="text-label-secondary normal-case tracking-normal">· {count} {count === 1 ? 'lift' : 'lifts'}</span>
      </div>
      {sets.main.map((lt) => {
        // A SET HISTORY, LIKE STRONG/HEVY (2026-08-11, Michael: *"it should offer what the other apps
        // do"*). Each main lift's recent sessions (weight × reps · date · estimated 1RM), newest first.
        // Adjusting weight lives on the Adjust tab (StateAdjustLens), not as a per-row tweak here.
        if (lt.sets.length === 0) return null;
        return (
          <div key={lt.canonical} className="space-y-1.5">
            <div className="text-footnote text-label">{lt.display_name}</div>
            <SetHistory h={lt as unknown as HistoryRows} />
          </div>
        );
      })}
      {/* ── SECONDARIES AND ACCESSORIES: RECORDS, NOT A LINE (item 5). ── */}
      {sets.others.length > 0 && (
        <div className="space-y-1.5 pt-1">
          {/* ⚠️ ITS OWN QUIET HEADING, because these answer a DIFFERENT question from the rows above.
              A main lift shows a history trending toward a max; these show the best you have done.
              Running them together would imply the accessory has a max line, which it does not. */}
          <div className="text-caption uppercase tracking-wider text-label-secondary">your best sets</div>
          {/* ⛔ WITH A PLAN: THE PLAN'S LIFTS, UPPER BODY THEN LOWER BODY, EACH "START → BEST" (Michael, 2026-09-29, words
              approved). `group` and `start_line` are the coach's (`coach/strength-logged-sets.ts`); nothing is worked out here. */}
          {sets.others.some((l) => l.group) ? (['upper', 'lower'] as const).map((g) => {
            const rows = sets.others.filter((l) => l.group === g);
            if (rows.length === 0) return null;
            return (
              <div key={g} className="space-y-1.5 pt-1">
                {/* The group's name reads like a lift's name above it (white, one step up) — rule 3. */}
                <div className="text-footnote text-label">{g === 'upper' ? 'Upper body' : 'Lower body'}</div>
                {/* Rule 2: the name on the left edge, the numbers on the right edge. */}
                <div className="space-y-1">
                  {rows.map((l) => {
                    const open = openLifts.has(l.canonical);
                    const canOpen = (l.history?.sets?.length ?? 0) > 0;
                    return (
                      <div key={l.canonical} className="space-y-1.5">
                        {/* The row is the tap (Strong / Hevy). Rule 5: the chevron is full contrast — it opens something. */}
                        <button
                          type="button"
                          disabled={!canOpen}
                          onClick={() => toggleLift(l.canonical)}
                          aria-expanded={open}
                          className="w-full grid grid-cols-[1fr_auto] items-baseline gap-x-3 text-left"
                        >
                          <span className="text-caption text-label-secondary">
                            {canOpen && <span className={`inline-block mr-1.5 text-label transition-transform duration-200 ${open ? 'rotate-90' : ''}`}>›</span>}
                            {l.display_name}
                          </span>
                          <span className="text-footnote text-label tabular-nums text-right">{l.start_line ? `${l.start_line} → ${l.set_line}` : l.set_line}</span>
                        </button>
                        {open && l.history && <div className="pl-4 pb-1"><SetHistory h={l.history} /></div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          }) : sets.others.map((l) => (
            <div key={l.canonical} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-caption">
              <span className="text-label-secondary">{l.display_name}</span>
              {/* The heaviest set as the athlete reads it, from the server (2026-09-15). */}
              {(l as any).set_line && <span className="text-label-secondary tabular-nums">{(l as any).set_line}</span>}
              {/* ⛔ NO e1RM AND NO DIRECTION WORD. Nobody trends a one-rep max on a curl, and this app
                  does not assert a direction it cannot support. The count is the receipt. */}
              <span className="text-label-secondary tabular-nums">{l.sessions} {l.sessions === 1 ? 'session' : 'sessions'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

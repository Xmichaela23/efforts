/**
 * THE WEEK, AS ONE PICTURE — lifts on one line, endurance on the next, per day.
 *
 * ⛔ NO WARNING ON THIS GRID, DELIBERATELY (2026-07-29). It carried a budget line and a Robineau
 * citation warning that an endurance session had landed on a heavy-leg day. Both came out:
 *
 *   - The citation was OUT OF CONDITION. Robineau's 0h arm stacked lifting with HARD endurance;
 *     this is an easy ride. `strength-primary-plan.ts` says so in terms and says not to attach that
 *     citation without a trial that tested lifting + EASY work same-day. There isn't one.
 *   - And stacking is NORMAL. Wendler's own concurrent template is main lift -> assistance ->
 *     conditioning, same session, zero gap (p87), and he explicitly does not care whether it lands
 *     on a lift day (p75).
 *
 * The sound part — lift first, leave time if you can — already rides on the session itself, where
 * the law computes the actual pair. This grid shows the week. It does not editorialise about it.
 *
 * ⛔ STANDALONE ON PURPOSE. The same object is meant to serve intake ("here is the week your picks
 * produce") and, later, rescheduling on the State screen ("here is what moving Thursday costs").
 * The athlete learns it once. That only holds if BOTH surfaces render the same component and the
 * same sentences — so this takes the solver's own compromise strings and prints them verbatim
 * rather than paraphrasing. One source per claim, including the words.
 *
 * ⚠️ IT DOES NOT PLACE ANYTHING. Placement is the solver's, server-side. This renders what came
 * back. A second placement authority on the client is the exact disease this codebase spent weeks
 * removing — if the grid ever needs to "just quickly work out" where a lift goes, that is the
 * signal to add an input to the solver, not logic here.
 */
import React from 'react';

import { WEEK_DAYS as ORDER, isEnduranceSession, type WeekSession } from '@/lib/week-budget';

export type WeekGridSession = WeekSession;

export default function WeekGrid({
  sessions,
  notes = [],
  className = '',
}: {
  sessions: WeekGridSession[];
  /** The solver's own words for what it could not honour. Printed verbatim, never paraphrased. */
  notes?: string[];
  className?: string;
}) {
  // Two upper lifts on consecutive days — worth a word, because it looks like an oversight.
  const UPPER = /Bench Press|Overhead Press/;
  const upperIdx = ORDER
    .map((d, i) => (sessions.some((s) => s.day === d && s.type === 'strength' && UPPER.test(s.name)) ? i : -1))
    .filter((i) => i >= 0);
  const adjacentPressDays = upperIdx.length === 2 && Math.abs(upperIdx[0] - upperIdx[1]) === 1;

  const activeDays = new Set(sessions.map((s) => s.day)).size;
  const mins = sessions.reduce((a, s) => a + (Number(s.duration) || 0), 0);

  return (
    <div className={`space-y-1.5 ${className}`}>
      <p className="text-white/70 text-xs">
        {activeDays} training {activeDays === 1 ? 'day' : 'days'}, {7 - activeDays} rest
        {' · '}about {Math.floor(mins / 60)}h{mins % 60 ? String(mins % 60).padStart(2, '0') : ''} a week
      </p>

      <div>
        {ORDER.map((d) => {
          const on = sessions.filter((s) => s.day === d);
          const lift = on.find((s) => s.type === 'strength');
          const endur = on.filter(isEnduranceSession);
          // ⛔ THE ACCESSORIES ARE SHOWN, because the swaps are the part the athlete cannot predict —
          // a chin-up on bench day and a row on press day is the rule working, and it reads as a
          // mistake if the first time they see it is week one. The MAIN lift and the primer are
          // dropped from this line: they are already named to the left.
          const accessories = (lift?.strength_exercises ?? [])
            .map((e) => e.name)
            .filter((n) => n !== lift?.name.replace('Strength — ', '') && n !== 'Box Jump');
          return (
            <div key={d} className="flex items-baseline gap-2 text-xs leading-tight py-px">
              <span className="text-white/40 w-8 shrink-0">{d.slice(0, 3)}</span>
              <span className="flex-1 min-w-0">
                <span className={lift ? 'text-white/85' : 'text-white/30'}>
                  {lift ? lift.name.replace('Strength — ', '') : '—'}
                </span>
                {endur.length > 0 && (
                  <span className="text-white/55">{'  ·  '}{endur.map((s) => s.name).join(' · ')}</span>
                )}
                {accessories.length > 0 && (
                  <span className="block text-white/35 truncate">{accessories.join(' · ')}</span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {adjacentPressDays && (
        <p className="text-white/40 text-xs leading-tight">Press days sit together on purpose — no recovery gap needed.</p>
      )}

      {/* What the solver could not honour, in its own words. Never hidden, never reworded. */}
      {notes.length > 0 && (
        <div className="pt-2 border-t border-white/10 space-y-1.5">
          {notes.map((n, i) => (
            <p key={i} className="text-white/60 text-sm leading-relaxed">{n}</p>
          ))}
        </div>
      )}
    </div>
  );
}

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

  /** 41 → "41m"; 126 → "2h06". Same shape as the week total above it. */
  const fmtMins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m}m`);

  const activeDays = new Set(sessions.map((s) => s.day)).size;
  const mins = sessions.reduce((a, s) => a + (Number(s.duration) || 0), 0);

  return (
    <div className={`space-y-2 ${className}`}>
      <p className="text-white/75 text-sm">
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
          /**
           * ⛔⛔ THE PAIRED DAY LEAKED BOTH MAIN LIFTS INTO THE ACCESSORY LINE (2026-08-19, Michael's
           * screen). The filter compared each exercise against the session's WHOLE name, and on the
           * three-day week's double session that name is `Deadlift + Overhead Press`. Neither
           * `Deadlift` nor `Overhead Press` equals it, so both main lifts fell through — and the
           * First Set Last row is a SECOND entry also named `Deadlift`, so the line read
           * *"Deadlift · Overhead Press · Deadlift · DB Bench Press · Chin-Up · Weighted Sit-Up"*
           * while Monday and Tuesday read clean. The main lifts are already named to the left; this
           * line is for the swaps the athlete cannot predict.
           *
           * ⚠️ SPLIT ON ` + `, WHICH IS THE SAME SEPARATOR `pairedSlotName` JOINS ON
           * (`strength-primary-plan.ts:3071`). ⛔ AND DEDUPED, because First Set Last repeats the
           * main lift by design — it is the same lift at its opening weight, not a second movement.
           */
          const mainNames = new Set(
            (lift?.name ?? '').replace('Strength — ', '').split(' + ').map((n) => n.trim()),
          );
          const accessories = [...new Set(
            (lift?.strength_exercises ?? [])
              .map((e) => e.name)
              .filter((n) => !mainNames.has(n) && n !== 'Box Jump'),
          )];
          /**
           * ⛔ THE EM-DASH WAS THE LIFT SLOT, AND ON A RUN PLAN IT WAS EVERY ROW (2026-08-06).
           * This grid was built for the strength block, so it printed the lift first and fell back
           * to "—" when there wasn't one. On a run-only marathon week that read as
           * "— · Easy Run" seven times over, which looks like a column that failed to load.
           *
           * The dash now means what it says — nothing is scheduled that day — and every session
           * carries its own duration, which is the number the athlete is actually deciding on.
           */
          const label = (s: WeekGridSession) => {
            const name = s.type === 'strength' ? s.name.replace('Strength — ', '') : s.name;
            const mins = Number(s.duration) || 0;
            return mins > 0 ? `${name} ${fmtMins(mins)}` : name;
          };
          const ordered = [...(lift ? [lift] : []), ...endur];
          return (
            /**
             * ⛔ THE DAY IS NOT A GUTTER LABEL (Michael, 2026-08-19: *"don't hide the days of the
             * week"*). It sat at `white/40` — dimmer than the rest-day dash — against session text
             * at `white/85`, so the column an athlete scans BY read as chrome and the thing they
             * were scanning for read as content. A week is read day-first.
             *
             * ⚠️ STILL BELOW THE SESSION, deliberately: the day names are the same seven every time
             * and the sessions are what changes. Legible, not competing.
             */
            <div key={d} className="flex items-baseline gap-3 text-sm leading-snug py-1">
              <span className="text-white/75 w-9 shrink-0">{d.slice(0, 3)}</span>
              <span className="flex-1 min-w-0">
                {ordered.length === 0 ? (
                  <span className="text-white/40">—</span>
                ) : (
                  <span className={lift ? 'text-white/90' : 'text-white/80'}>
                    {ordered.map(label).join('  ·  ')}
                  </span>
                )}
                {/* ⚠️ THE SWAPS ARE THE PART THE ATHLETE CANNOT PREDICT, and at `white/35` they were
                    close to invisible on a phone. Lifted to `/55` — still secondary to the named
                    session above them, no longer a texture. `truncate` stays: the row is one line
                    by design and the ellipsis is the honest end of a list that does not fit. */}
                {accessories.length > 0 && (
                  <span className="block text-white/55 truncate">{accessories.join(' · ')}</span>
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

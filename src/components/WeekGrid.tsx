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

  /**
   * ⛔ WESTSIDE SHORTHAND DOES NOT SHIP TO A LIFTER (punch item 6, 2026-08-25). The Standing
   * Plan frames title their days `ME: Upper` / `DE: Lower` — max effort and dynamic effort, a
   * conjugate-method vocabulary a Strong or Hevy user has no reason to have met. The day was
   * labelled with the METHOD'S name for the intent instead of the intent.
   *
   * ⚠️ BOTH HALVES OF THE PAIR, OR NEITHER. Renaming `DE` and leaving `ME` reads as two
   * different kinds of thing on the same week; they are one axis with two ends.
   * ⚠️ DISPLAY ONLY. The engine strings are unchanged and stay the thing tests and the
   * composer match on — this maps at the last moment, where an athlete reads it.
   * ⚠️ `Test:` IS LEFT ALONE. It is already the plain word for what the day is.
   */
  const INTENT_WORD: Record<string, string> = { ME: 'Heavy', DE: 'Speed' };
  const plainIntent = (name: string) => name.replace(/^(ME|DE):/, (_m, k: string) => `${INTENT_WORD[k]}:`);

  /**
   * ⛔ ONE CAPITALISATION FOR EVERY MOVEMENT (punch item 5, 2026-08-25). The accessory line read
   * `Bench Press · … · tricep extensions · glute bridge` — the barbell lifts arrive Title Case
   * from the competition-lift table and the accessories arrive lowercase from the exercise library,
   * and printing both raw made the athlete's own picks look like a different class of thing.
   *
   * ⚠️ IT ONLY RAISES A LEADING LOWERCASE LETTER, so `DB Bench Press` and `Chin-Up` survive
   * untouched — a blanket title-case would flatten `DB` to `Db`. Hyphens and slashes count as word
   * starts, which is what keeps `pull-up` reading as `Pull-Up`.
   */
  const titleCase = (n: string) => n.replace(/(^|[\s\-/(])([a-z])/g, (_m, pre: string, c: string) => pre + c.toUpperCase());

  /** 41 → "41m"; 126 → "2h06". Same shape as the week total above it. */
  const fmtMins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m}m`);

  const activeDays = new Set(sessions.map((s) => s.day)).size;
  const mins = sessions.reduce((a, s) => a + (Number(s.duration) || 0), 0);
  /**
   * ⛔ THE LIFTING COUNT IN THE SUMMARY (Michael, 2026-08-25) — the commitment the block is built
   * around, stated where the week is totalled rather than only inferable by reading seven rows.
   *
   * ⛔ COUNTED OFF THE WEEK IN FRONT OF THE ATHLETE, NOT OFF THE FRAME. `lifting-commitment.ts`
   * derives the FRAME's number for the choosing step, where there is no built week yet; here there
   * IS one, and the honest number is what this grid is actually showing. If the two ever disagree,
   * this line is right and the mismatch is the finding.
   * ⚠️ DAYS, NOT SESSIONS. Two strength rows can share one day, and "4 lifts" means four lifting
   * DAYS — the thing the athlete is committing to.
   *
   * ⛔⛔ THE PLYO DAY IS `type: 'strength'` AND IS NOT A LIFTING DAY (found on the dev preview,
   * 2026-08-25). `compose.ts` `plyoSession` emits the frame's day-3 plyo block as a strength
   * session carrying A-Skips and hops — no barbell — so counting `type === 'strength'` read a
   * four-lift week as "5 lifts", two lines under a step that had just promised four.
   * ⚠️ EXCLUDED BY ITS TAG, NOT BY ITS NAME. `tags: ['standing_plan', 'plyo']` is stable; the name
   * is a display string, and matching on one is what the label renames just had to unpick twice.
   */
  const liftDays = new Set(
    sessions
      .filter((s) => s.type === 'strength' && !(s.tags ?? []).includes('plyo'))
      .map((s) => s.day),
  ).size;

  return (
    <div className={`space-y-2 ${className}`}>
      <p className="text-white/75 text-sm">
        {activeDays} training {activeDays === 1 ? 'day' : 'days'}, {7 - activeDays} rest
        {/* ⚠️ SILENT ON A WEEK WITH NO LIFTING — the grid also serves run-only plans, and "0 lifts"
            there is a fact about a discipline that is not in the block. */}
        {liftDays > 0 ? <>{' · '}{liftDays} {liftDays === 1 ? 'lift' : 'lifts'}</> : null}
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
            const name = titleCase(plainIntent(s.type === 'strength' ? s.name.replace('Strength — ', '') : s.name));
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
                    session above them, no longer a texture.
                    ⛔ `truncate` REMOVED (Michael, 2026-08-24, device finding B3): the ellipsis
                    always ate the SAME movements — the athlete's own picks and the floors land last
                    in the list, so the work he went looking for ("where are my abs?") was exactly
                    the work the cut hid. The line wraps; a taller row is cheaper than a lying one. */}
                {accessories.length > 0 && (
                  <span className="block text-white/55">{accessories.map(titleCase).join(' · ')}</span>
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

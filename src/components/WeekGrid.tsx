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

import { getDisciplineColor } from '@/lib/context-utils';
import { isPlyoSession } from '@/lib/utils';
import { WEEK_DAYS as ORDER, isEnduranceSession, type WeekSession } from '@/lib/week-budget';
import { plainIntent } from '@/lib/plain-intent';

export type WeekGridSession = WeekSession;

export default function WeekGrid({
  sessions,
  notes = [],
  className = '',
  title,
}: {
  sessions: WeekGridSession[];
  /** The solver's own words for what it could not honour. Printed verbatim, never paraphrased. */
  notes?: string[];
  className?: string;
  /**
   * ⛔ SAY WHICH WEEK THIS IS (Michael, 2026-08-26: "we should say sample week — week one"). The
   * wizard previews WEEK 1 — the test week — which is the block's least representative week:
   * every later week replaces the test days with the heavy days. Unlabeled, it reads as "your
   * week" for the whole block.
   */
  title?: string;
}) {
  // Two upper lifts on consecutive days — worth a word, because it looks like an oversight.
  const UPPER = /Bench Press|Overhead Press/;
  const upperIdx = ORDER
    .map((d, i) => (sessions.some((s) => s.day === d && s.type === 'strength' && UPPER.test(s.name)) ? i : -1))
    .filter((i) => i >= 0);
  const adjacentPressDays = upperIdx.length === 2 && Math.abs(upperIdx[0] - upperIdx[1]) === 1;

  // ⛔ MOVED TO `@/lib/plain-intent` (2026-08-28). It lived here as two lines and was used HERE
  // ONLY, so the logger header, the calendar and the plan download screen all still printed
  // `DE: Upper` at the athlete. Pasting the two lines into three more files is the private-list
  // disease this codebase keeps paying for; the mapping now has one owner and four readers.

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
      {title && (
        <p className="text-white/50 text-[11px] uppercase tracking-[0.08em]">{title}</p>
      )}
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
          /**
           * ⛔ THE SESSIONS WEAR THEIR SPORT'S COLOUR (Michael, 2026-08-25, step-8 queue item:
           * "color-code the workouts by sport … they just read as a wall of same-colored text").
           * Same palette as the master strip above — `SPORT_COLORS` via `getDisciplineColor`,
           * with the strip's own two mappings copied exactly: plyo by TAG (it is `type: 'strength'`
           * and must not wear lifting's orange), and `ride` → `bike` for the palette key. If the
           * strip and this list ever disagree on a colour, one of those mappings drifted.
           */
          const colorOf = (s: WeekGridSession) =>
            getDisciplineColor(isPlyoSession(s as { tags?: unknown }) ? 'plyo' : (s.type === 'ride' ? 'bike' : s.type));
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
                  /* One span per session so each carries its own sport colour; the separator stays
                     neutral so the row still reads as one line, not a legend. */
                  <span>
                    {ordered.map((s, i) => (
                      <React.Fragment key={i}>
                        {i > 0 && <span className="text-white/40">{'  ·  '}</span>}
                        <span style={{ color: colorOf(s) }}>{label(s)}</span>
                      </React.Fragment>
                    ))}
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

      {/* ⛔ THE WEEK EXPLAINS ITSELF, AND THE POINT IS BALANCING STRESSORS (Michael, 2026-08-26:
          "it should be about balancing stressors — isn't that viada's whole thing"). It is —
          SOURCE-viada p130 (consolidation: examine what each session requires and arrange the week
          so nothing that needs to recover fails to, so no session becomes "a heavily fatigued
          write-off") and p131 (the heavy sessions must come fresh in the systems they need). The
          old notes only spoke when something FAILED, in apology voice; this states what the layout
          is FOR. Derived from the placed week itself, so it can never disagree with the grid above
          it. Silent when there is nothing to explain (no hard/long sessions). */}
      {(() => {
        /**
         * ⛔ ONLY WHEN IT IS TRUE (Michael, 2026-08-26: "and is it true?"). Two honesty gates:
         * (1) it renders only when the solver reported NO conflicts — a week where pins forced
         * stacking is arranged around the athlete's days, not around balance, and the notes below
         * are the true story there; (2) it claims the spacing's PURPOSE, never per-session
         * freshness — the book's own default sends Monday's run into Tuesday's heavy legs and
         * compensates with the 3.5% cut (p247), so "every session starts fresh" would be a lie
         * even on the untouched week.
         */
        if (notes.length > 0) return null;
        const endur = sessions.filter(isEnduranceSession);
        const hardN = endur.filter((s) => /^Hard\b/i.test(s.name)).length;
        const longest = endur.reduce<WeekGridSession | null>(
          (a, s) => ((Number(s.duration) || 0) > (Number(a?.duration) || 0) ? s : a), null);
        const hasLong = longest && (Number(longest.duration) || 0) >= 75;
        if (hardN === 0 && !hasLong) return null;
        const liftDayNames = ORDER.filter((d) =>
          sessions.some((s) => s.day === d && s.type === 'strength' && !(s.tags ?? []).includes('plyo')));
        if (liftDayNames.length === 0) return null;
        const say = (xs: string[]) =>
          xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
        // ⚠️ NO DAY ON THE LONG SESSION (Michael, 2026-08-26: "but the scheduler put it on sat") —
        // its weekday is the scheduler's own output, so citing it as a cause would be circular.
        // The sentence names WHAT is in the week; the grid above shows where everything landed.
        const additions = [
          hardN === 0 ? '' : hardN === 1 ? 'one hard session' : hardN === 2 ? 'two hard sessions' : `${hardN} hard sessions`,
          hasLong ? `a long ${longest!.type === 'ride' ? 'ride' : 'run'}` : '',
        ].filter(Boolean).join(' and ');
        /**
         * ⛔ PRINCIPLE FIRST, PLACEMENT AFTER (Michael, 2026-08-26: "you're thinking backwards").
         * The week is not an outcome to be explained by its sessions — it IS the stress-balanced
         * arrangement, and the sessions were placed into it. So the sentence leads with what the
         * week is, then where things sit. No causality, no agency, no engine internals.
         */
        const hardClause = [
          hardN === 0 ? '' : hardN === 1 ? 'the hard session' : 'the hard sessions',
          hasLong ? `the long ${longest!.type === 'ride' ? 'ride' : 'run'}` : '',
        ].filter(Boolean).join(' and ');
        return (
          <p className="pt-2 border-t border-white/10 text-white/60 text-sm leading-relaxed">
            This week is arranged to balance the stressors — lifting on {say(liftDayNames)},
            {' '}{hardClause} spaced around it.
          </p>
        );
      })()}

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

/**
 * THE WEEK, AS ONE PICTURE — lifts on one line, endurance on the next, per day.
 *
 * ⛔ NO WARNING ON THIS GRID, DELIBERATELY (2026-07-29). It carried a budget line and a Robineau
 * citation warning that an endurance session had landed on a heavy-leg day. Both came out:
 *
 *   - The citation was OUT OF CONDITION. Robineau's 0h arm stacked lifting with HARD endurance;
 *     this is an easy ride. `strength-primary-plan.ts` says so in terms and says not to attach that
 *     citation without a trial that tested lifting + EASY work same-day. There isn't one.
 *   - And stacking is NORMAL. the standard concurrent template is main lift -> assistance ->
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
import type { WeekOneSummary } from '@/lib/builder-readout';

export type WeekGridSession = WeekSession;

export default function WeekGrid({
  sessions,
  notes = [],
  className = '',
  title,
  summary,
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
  /**
   * ⛔ THE SERVER'S SUMMARY OF THIS WEEK (2026-09-10, audit H-P05) — the day counts, the minutes and
   * the two sentences, from `_shared/week-one-summary.ts`. Absent prints no summary and no sentences.
   */
  summary?: WeekOneSummary | null;
}) {
  // ⛔ THE PRESS-DAYS CHECK, THE DAY COUNTS AND THE BALANCE SENTENCE LEFT THIS FILE (2026-09-10, audit
  // H-P05). They are worked out on the server and arrive as `summary`.

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

  return (
    <div className={`space-y-2 ${className}`}>
      {title && (
        <p className="text-white/50 text-[11px] uppercase tracking-[0.08em]">{title}</p>
      )}
      {summary ? (
        <p className="text-white/75 text-sm">
          {summary.training_days} training {summary.training_days === 1 ? 'day' : 'days'}, {summary.rest_days} rest
          {/* ⚠️ SILENT ON A WEEK WITH NO LIFTING — the grid also serves run-only plans, and "0 lifts"
              there is a fact about a discipline that is not in the block. Lifting DAYS, plyo excluded
              — the server counts them. */}
          {summary.lift_days > 0 ? <>{' · '}{summary.lift_days} {summary.lift_days === 1 ? 'lift' : 'lifts'}</> : null}
          {' · '}about {Math.floor(summary.total_minutes / 60)}h{summary.total_minutes % 60 ? String(summary.total_minutes % 60).padStart(2, '0') : ''} a week
        </p>
      ) : null}

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
              // The kit's name where the composer sent one (Michael, 2026-09-11: the week said "Leg Curl"
              // while the logger said "Dumbbell Leg Curl"). The main-lift test keeps the plain name.
              .filter((e) => !mainNames.has(e.name) && e.name !== 'Box Jump')
              .map((e) => (typeof e.execution_name === 'string' && e.execution_name.trim()) ? e.execution_name.trim() : e.name),
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

      {summary?.press_days_note ? (
        <p className="text-white/40 text-xs leading-tight">{summary.press_days_note}</p>
      ) : null}

      {/* ⛔ THE WEEK EXPLAINS ITSELF, AND THE POINT IS BALANCING STRESSORS (Michael, 2026-08-26) —
          SOURCE-viada p130 and p131. The server writes the sentence from the placed week, and only
          when the solver reported no compromise (`_shared/week-one-summary.ts`). */}
      {summary?.balance_note ? (
        <p className="pt-2 border-t border-white/10 text-white/60 text-sm leading-relaxed">
          {summary.balance_note}
        </p>
      ) : null}

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

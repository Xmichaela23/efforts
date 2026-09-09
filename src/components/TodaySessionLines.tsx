import React from 'react';
import { getExerciseConfig } from '@/lib/exercise-config';
import { sportColorFor } from './PlannedSessionHeader';
import { displayDisciplineOf } from '@/lib/utils';
import {
  spacingLineFor,
  liftLinesFor,
  enduranceLinesFor,
  isStrengthRow,
  isEnduranceRow,
  isFromPlan,
  type TodayRow,
} from '@/lib/today-lines';

/**
 * ═══ TODAY ═══════════════════════════════════════════════════════════════════════════════════════
 *
 * docs/WORKORDER-today-screen-2026-09-09.md §2. Brief breakdowns of the day's lifts and ride: how
 * far apart the two sessions go, then, under each session, what kind of set each row is and the cue
 * that goes with it.
 *
 * ⛔ NOT REDUNDANT WITH THE LOGGER. The logger lays the work out and has the time; this says what
 * each set is FOR, so the athlete hits it with the intended purpose. Sets, reps, loads, warm-up
 * ladders, how-to sheets and swap lists stay on the logger (§3). So do scores, badges and streaks.
 *
 * ⛔⛔ THIS FILE CONTAINS NO ATHLETE-FACING STRING. Every word it puts on the screen comes from
 * `@/lib/today-lines` — where each sentence carries the page it was written on — or from the row's
 * own data (its note). `grep` this file for a quoted sentence and there is nothing to find; that is
 * the audit work order §5 asks for.
 *
 * ⛔ SESSIONS ARE IDENTIFIED BY TAG, NEVER BY NAME. See `today-lines`.
 *
 * ⚠️ THE SESSION'S NAME AND TIME ARE NOT HERE. They are the row's own header
 * (`PlannedSessionHeader`), which every surface already shares; this component renders what goes
 * BELOW it, so Today does not grow a second opinion about how a session announces itself.
 */

/**
 * ⛔ ONE CLASSIFIER FOR "IS THIS ON A BAR", and it is the app's existing one — the same
 * `displayFormat === 'total'` test the logger runs before it decides whether a speed row may say
 * "bar". A second opinion about equipment is how two screens end up disagreeing about a dumbbell.
 */
const barLoaded = (movement: string): boolean =>
  getExerciseConfig(movement)?.displayFormat === 'total';

/**
 * The day's spacing, above the sessions. ⛔ IT CARRIES NO SPORT COLOUR (§2b): it belongs to the day,
 * not to either session. Renders nothing unless the day is a lift and a ride or run.
 */
export const TodaySpacingLine: React.FC<{ rows: readonly TodayRow[] }> = ({ rows }) => {
  const spacing = spacingLineFor(rows);
  if (!spacing) return null;
  return (
    <div
      className="text-[13px] font-light leading-snug"
      style={{ color: 'rgba(255,255,255,0.72)', padding: '0 0.35rem 0.35rem' }}
    >
      <div>{spacing.lead}</div>
      {spacing.closer ? (
        <div style={{ marginTop: 2, color: 'rgba(255,255,255,0.55)' }}>
          {spacing.closerLabel} {spacing.closer}
        </div>
      ) : null}
    </div>
  );
};

/**
 * One session's lines, under its header.
 *
 * ⛔ A WORKOUT THE ATHLETE BROUGHT IN GETS NOTHING (§2). A Garmin ride, a Strava run or a typed
 * session carries no intent the book wrote, so there is no line to print over it — name and time
 * only, which is what the header already gives it.
 *
 * ⛔ AND A COMPLETED SESSION GETS NOTHING EITHER. These lines tell an athlete how to do work that is
 * still in front of them; on a finished row they would be instructions for a set already over.
 */
const TodaySessionLines: React.FC<{ session: TodayRow }> = ({ session }) => {
  const status = String((session as { workout_status?: unknown })?.workout_status ?? '').toLowerCase();
  if (status === 'completed' || status === 'skipped') return null;
  if (!isFromPlan(session)) return null;

  // ⛔ THE DISPLAY DISCIPLINE, so the plyo day's lines match its own colour rather than a lifting
  // day's orange. Same seam the calendar and the header colour by; keyed on the tag, never the name.
  const color = sportColorFor(displayDisciplineOf(session as never));

  if (isStrengthRow(session)) {
    const rows = liftLinesFor(session, barLoaded).filter((r) => r.movement);
    if (rows.length === 0) return null;
    return (
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        {rows.map((row) => (
          <div key={row.key}>
            <div
              className="text-[13px] font-medium capitalize leading-snug"
              style={{ color: 'rgba(255,255,255,0.88)' }}
            >
              {row.movement}
            </div>
            {/* ⛔ THE KIND, SPELLED OUT — p218's own word for the slot, in the session's colour. */}
            {row.kind ? (
              <div className="text-[12px] font-light" style={{ color }}>
                {row.kind}
              </div>
            ) : null}
            {/* ⛔ THE CUE REPEATS WHEN THE KIND REPEATS. Three hypertrophy rows print it three times:
                the athlete reads the row in front of them, not a legend elsewhere on the screen. */}
            {row.cue ? (
              <div className="text-[12px] font-light leading-snug" style={{ color: 'rgba(255,255,255,0.60)' }}>
                {row.cue}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    );
  }

  if (!isEnduranceRow(session)) return null;

  const lines = enduranceLinesFor(session);
  return (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
      {lines.map((line) => (
        <div
          key={line}
          className="text-[12px] font-light leading-snug"
          style={{ color: 'rgba(255,255,255,0.60)' }}
        >
          {line}
        </div>
      ))}
    </div>
  );
};

export default TodaySessionLines;

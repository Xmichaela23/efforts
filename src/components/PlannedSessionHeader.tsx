import React from 'react';
import { SPORT_COLORS } from '@/lib/context-utils';
// ⛔ ONE VOCABULARY / ONE DURATION READER (D-403). See `src/lib/discipline.ts` and
// `src/lib/planned-session/duration.ts`.
import { normalizeSessionType } from '@/lib/discipline';
import { plannedDurationMinutes } from '@/lib/planned-session/duration';
// ⛔ A LIFTING SESSION IS PRICED OFF ITS ROWS, NOT OFF A CONSTANT (work order 2026-09-09 §3c).
import { formatStrengthSessionMinutes } from '@/lib/strength-session-minutes';
import { deriveWorkoutTitle } from '@/lib/derive-workout-title';
// ⛔ ONE TAG-KEYED SEAM between the wire type and what an athlete sees — the plyo day's colour, and
// the reader that says a session IS the plyo day. The calendar already colours by these.
import { displayDisciplineOf, isPlyoSession } from '@/lib/utils';

/**
 * ═══ ONE HEADER FOR A PLANNED SESSION. Three surfaces render it; none of them own it. ═══════════
 *
 * ⛔ WHY THIS EXISTS. A planned session is shown in three places — the Today's Effort top card, the
 * Today's Effort drawer, and the full planned screen (`StructuredPlannedView` under
 * `UnifiedWorkoutView`, the one with Reschedule/Delete). Each had its own header, and they disagreed
 * on all four of the things a header decides:
 *
 *   - the TITLE's colour (top card: discipline-coloured · drawer: white · full screen: white)
 *   - the ORDER (drawer put the description ABOVE the title and duration)
 *   - whether the description appeared ONCE (the drawer printed it twice)
 *   - the duration reader (three different ones, before D-403)
 *
 * ⚠️ THIS IS THE SAME DISEASE D-403 CURED FOR READERS, ONE LAYER UP. There, four call sites each
 * resolved "how long is this session" and drifted. Here, three call sites each decided "how does a
 * planned session announce itself" and drifted. The cure is the same: one implementation, and the
 * surfaces render it rather than re-deciding it.
 *
 * ⛔ THE CONTRACT: sport-coloured title and duration on ONE line, description BELOW. A surface that
 * wants a different order should not get one — that difference is the bug this closes.
 */

export type PlannedSessionHeaderProps = {
  /** A planned row — the server's `planned_workout` (D-403), or any row carrying `type`/`name`. */
  workout: unknown;
  /**
   * Rendered under the title. Pass `null` to omit it — the top card is a titles-only list and shows
   * no description at all, which is a DENSITY choice, not a different header.
   */
  description?: React.ReactNode;
  /** Right-hand slot on the title line. The swap control lives here on every surface that has one. */
  action?: React.ReactNode;
  /** Extra chip beside the duration (the swim distance chip). */
  durationExtra?: React.ReactNode;
  size?: 'card' | 'panel';
  className?: string;
};

/**
 * ⛔ THE COLOUR COMES FROM THE CANONICAL VOCABULARY, not from the raw string. `getDisciplineColor`
 * indexes `SPORT_COLORS` by the lowercased type directly, so a spelling the alias table happens not
 * to carry (`Cycling`, `trail running`, `weight_training`) falls through to grey. Normalising first
 * means every spelling of a ride is the same green.
 *
 * ⚠️ `normalizeSessionType`, NOT `normalizeDiscipline` — this LABELS a row rather than gating on one,
 * so walks, mobility and pilates/yoga must keep their own colours instead of collapsing to grey.
 */
export function sportColorFor(type: unknown): string {
  const raw = (typeof type === 'string' ? type : String(type ?? '')).trim().toLowerCase();
  /**
   * ⛔ `plyo` IS A DISPLAY DISCIPLINE, NOT A WIRE TYPE, so it is answered before the canonical
   * normalizer — which correctly returns `null` for it, since the session is `type: 'strength'`
   * everywhere that reasons about it. Callers pass `displayDisciplineOf(row)`, the tag-keyed seam
   * the calendar already colours by; this is the other end of it.
   */
  if (raw === 'plyo') return SPORT_COLORS.plyo;
  const canonical = normalizeSessionType(raw);
  if (!canonical) return '#64748b';                       // unknown stays grey — never a guess
  const key = canonical === 'ride' ? 'bike' : canonical;  // SPORT_COLORS keys the bike as `bike`
  return SPORT_COLORS[key as keyof typeof SPORT_COLORS] ?? '#64748b';
}

/** `63:00` — the same shape the calendar chip and the card have always printed. */
export function formatPlannedDuration(workout: unknown): string | null {
  const mins = plannedDurationMinutes(workout as Record<string, unknown>);
  return mins == null || mins <= 0 ? null : `${mins}:00`;
}

/**
 * ⛔ A LIFT IS PRICED OFF ITS OWN ROWS; A RIDE AND A RUN KEEP THEIR BUILT LENGTH (work order §3c).
 *
 * The two answer different questions and that is why they print differently. An endurance session's
 * length is PRESCRIBED — the plan built a 66-minute ride and the athlete rides for 66 minutes, so
 * `66:00` is a fact. A lifting session's length is a CONSEQUENCE of its sets and its rest clock, and
 * nobody knows it to the minute in advance, so it prints as `30–40 min`.
 *
 * ⚠️ THE FALLBACK IS THE STORED TOTAL, NOT A BLANK. A strength row whose exercises did not travel —
 * a legacy row, a session the athlete typed — still shows the length the plan stored. Losing a
 * number that was on screen is worse than showing a rougher one.
 */
export function formatSessionDuration(workout: unknown): string | null {
  const w = (workout ?? {}) as Record<string, unknown>;
  /**
   * ⛔⛔ THE PLYO DAY SHOWS NO TIME AT ALL (Michael, 2026-09-09). Its rows carry no effort count to
   * price — `compose.ts` puts the band's top in `reps` as *"the row's recorded-efforts capacity; the
   * logger records, never targets"* — and the source gives the drill day no length either. With
   * nothing on the row and nothing on the page, any figure here would be invented, so there is none.
   *
   * ⚠️ BY THE TAG, NEVER THE NAME. `isPlyoSession` is the shared reader; the session is
   * `type: 'strength'` on the wire and its name is a display string.
   */
  if (isPlyoSession(w)) return null;

  const type = String(w.type ?? (w as { workout_type?: unknown }).workout_type ?? '');
  if (normalizeSessionType(type) === 'strength') {
    const estimated = formatStrengthSessionMinutes(w.strength_exercises);
    if (estimated) return estimated;
  }
  return formatPlannedDuration(w);
}

const PlannedSessionHeader: React.FC<PlannedSessionHeaderProps> = ({
  workout,
  description,
  action,
  durationExtra,
  size = 'panel',
  className = '',
}) => {
  const w = (workout ?? {}) as Record<string, unknown>;
  /**
   * ⛔ THE DISPLAY DISCIPLINE, NOT THE WIRE TYPE — the same seam the calendar colours by
   * (`displayDisciplineOf`, keyed on the `plyo` tag). The plyo day is `type: 'strength'` and must
   * not wear strength's orange: it is a drill day, and a four-lift week reading as five lifting
   * sessions is the confusion that colour exists to end.
   */
  const color = sportColorFor(displayDisciplineOf(w));
  const title = deriveWorkoutTitle(w as never);
  /**
   * ⛔⛔ A LIFT NOW SHOWS ITS MINUTES, THE SAME WAY A RIDE DOES (Michael, 2026-09-09, on Today).
   *
   * ⚠️ THIS REVERSES A DELIBERATE SUPPRESSION, so the reason it was suppressed is kept rather than
   * deleted: a strength row's stored total is a FIXED FIGURE PER KIND OF SESSION, not a length
   * computed from the day's rows — the composer stamps 55 on a lifting day, 45 on a test day and 20
   * on the plyo day (`standing-plan/compose.ts`). The old note called that "a number the app made
   * up" and hid it, which was the right reading of a wrong number.
   *
   * ⛔⛔ AND §3c THEN REPLACED THE NUMBER RATHER THAN THE SUPPRESSION. The three constants are gone
   * from the screen: a lifting session is now priced off its own rows and shown as a range — see
   * `formatSessionDuration` and `@/lib/strength-session-minutes`.
   *
   * ⛔ IT CHANGES ALL THREE SURFACES, WHICH IS THE POINT OF THIS COMPONENT. Today's card, the drawer
   * and the full planned screen render the same header; showing the minutes on one and not the
   * others is exactly the divergence this file was written to end.
   */
  const duration = formatSessionDuration(w);

  const titleSize = size === 'card' ? 'text-base' : 'text-base';
  const descSize = size === 'card' ? 'text-[13px]' : 'text-sm';

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {/* ⛔ ROW 1 — TITLE + DURATION. Never below the description. */}
      <div className="flex items-center justify-between gap-3">
        <div
          className={`${titleSize} font-medium tracking-normal min-w-0 truncate`}
          style={{
            color,
            textShadow: '0 1px 1px rgba(0,0,0,0.55), 0 0 10px rgba(0,0,0,0.35)',
          }}
        >
          {title}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {duration ? (
            <span className="text-xs font-light tabular-nums" style={{ color: 'rgba(255,255,255,0.70)' }}>
              {duration}
            </span>
          ) : null}
          {durationExtra}
          {action}
        </div>
      </div>

      {/* ⛔ ROW 2 — THE DESCRIPTION, ONCE. */}
      {description ? (
        <div className={`${descSize} font-light leading-snug`} style={{ color: 'rgba(255,255,255,0.60)' }}>
          {description}
        </div>
      ) : null}
    </div>
  );
};

export default PlannedSessionHeader;

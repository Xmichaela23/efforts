import React from 'react';
import { SPORT_COLORS } from '@/lib/context-utils';
// ⛔ ONE VOCABULARY (D-403). See `src/lib/discipline.ts`.
import { normalizeSessionType } from '@/lib/discipline';
import { deriveWorkoutTitle } from '@/lib/derive-workout-title';
// ⛔ ONE TAG-KEYED SEAM between the wire type and what an athlete sees — the plyo day's colour.
// The calendar already colours by it.
import { displayDisciplineOf } from '@/lib/utils';

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

/**
 * ⛔ HOW LONG A PLANNED SESSION IS — THE SERVER'S NUMBER, READ, NEVER RESOLVED (2026-09-10, audit
 * H-T01). The phone used to answer this with its own five-rung ladder (`plannedDurationSeconds`:
 * stored total, computed total, step sum with distance priced at pace, intervals, minutes scraped out
 * of the description), and the server answered it with a different one, so the Performance chip could
 * grade against a length Today did not print. That ladder is deleted; the server settles the order.
 *
 * ⚠️ TWO ROW SHAPES, ONE SERVER VALUE EACH — this picks the field, it computes nothing:
 *   · a `get-week` row carries `planned_duration_seconds`, the server's one answer;
 *   · a row read straight from `planned_workouts` (a hydrated drawer row, the plan screen's loaders)
 *     carries the `total_duration_seconds` column `materialize-plan` wrote.
 * A row with neither prints nothing.
 */
export function plannedDurationSecondsOf(workout: unknown): number | null {
  const w = (workout ?? {}) as Record<string, unknown>;
  const raw = 'planned_duration_seconds' in w ? w.planned_duration_seconds : w.total_duration_seconds;
  const n = Number(raw);
  return raw != null && Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** `63:00` — the same shape the calendar chip and the card have always printed. */
export function formatPlannedDuration(workout: unknown): string | null {
  const secs = plannedDurationSecondsOf(workout);
  return secs == null ? null : `${Math.max(1, Math.round(secs / 60))}:00`;
}

/**
 * ⛔ THE HEADER'S LENGTH IS `planned_duration_label`, SENT BY THE SERVER (2026-09-10, audit H-T02).
 *
 * The words are unchanged — `66:00` for a ride or run, `30–40 min` for a lift, nothing on the plyo
 * day — but none of them is decided here any more. The lift's range was estimated on the phone from
 * its rows at two to four seconds a rep plus the rest clock (`strength-session-minutes.ts`, deleted),
 * and the plyo day's blank was a tag check here; both are the server's now.
 *
 * ⚠️ A ROW WITHOUT THE LABEL (read straight from the table) prints the stored total in the same
 * `mm:00` shape — the stored column is the server's too — or nothing.
 */
export function formatSessionDuration(workout: unknown): string | null {
  const w = (workout ?? {}) as Record<string, unknown>;
  if ('planned_duration_label' in w) {
    const label = w.planned_duration_label;
    return typeof label === 'string' && label.trim() ? label : null;
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
   * from the screen: a lifting session is priced off its own rows and shown as a range — by the
   * server since 2026-09-10 (`planned_duration_label`, see `formatSessionDuration`).
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

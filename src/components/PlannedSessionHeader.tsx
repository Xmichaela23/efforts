import React from 'react';
import { SPORT_COLORS } from '@/lib/context-utils';
// ⛔ ONE VOCABULARY / ONE DURATION READER (D-403). See `src/lib/discipline.ts` and
// `src/lib/planned-session/duration.ts`.
import { normalizeSessionType } from '@/lib/discipline';
import { plannedDurationMinutes } from '@/lib/planned-session/duration';
import { deriveWorkoutTitle } from '@/lib/derive-workout-title';

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
  const canonical = normalizeSessionType(typeof type === 'string' ? type : String(type ?? ''));
  if (!canonical) return '#64748b';                       // unknown stays grey — never a guess
  const key = canonical === 'ride' ? 'bike' : canonical;  // SPORT_COLORS keys the bike as `bike`
  return SPORT_COLORS[key as keyof typeof SPORT_COLORS] ?? '#64748b';
}

/** `63:00` — the same shape the calendar chip and the card have always printed. */
export function formatPlannedDuration(workout: unknown): string | null {
  const mins = plannedDurationMinutes(workout as Record<string, unknown>);
  return mins == null || mins <= 0 ? null : `${mins}:00`;
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
  const type = String(w.type ?? (w as { workout_type?: unknown }).workout_type ?? '');
  const color = sportColorFor(type);
  const title = deriveWorkoutTitle(w as never);
  /**
   * ⚠️ STRENGTH SHOWS NO DURATION, deliberately and consistently with `PlannedWorkoutSummary` — a
   * strength row's stored total is a placeholder ("45 min") that the session never honours, and
   * printing it invites the athlete to plan around a number the app made up.
   */
  const showDuration = normalizeSessionType(type) !== 'strength';
  const duration = showDuration ? formatPlannedDuration(w) : null;

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

/**
 * THE WEEK'S LIFTING DOSE — Viada's own two counts, over what was actually logged. [2026-08-29]
 *
 * ⛔ IT RENDERS AND DOES NOT DECIDE. Every number and every word arrives resolved on
 * `state_trends_v1.display.viadaWeek`: the muscle lines and their verdicts are `ledgerFor`'s, the
 * per-pattern rep counts are `performedStrengthDose`'s, and both are computed against the same
 * windowed reference max the heavy gate uses. Nothing is derived at this edge.
 *
 * ⛔ WHY IT IS THE PERFORMED WEEK AND NOT THE PLAN'S. The composed week's version of these numbers
 * has existed since 2026-08-27 and is deliberately never drawn — a standing block's twelve weeks are
 * identical by design, so the plan's dose is one picture shown twelve times. What the athlete DID is
 * the number that moves.
 *
 * ⛔ HIS BANDS ARE STATED, NOT GRADED. 8-12 sets a muscle a week (p086), 4-6 reps above 90% and
 * 15-20 velocity reps per pattern (p084) — the figures are printed beside the count so the athlete
 * reads the comparison rather than a word we chose. No colour on a verdict, no imperative, no
 * "you should". The one exception is a muscle under the floor, which is stated as a fact too.
 *
 * ⛔ NO EMPTY STATE. A week with nothing lifted returns null from the server and this does not
 * render — the same rule the lift cards follow.
 */

import React from 'react';

export type ViadaWeekPerformed = {
  since: string;
  perMuscle: Array<{ muscle: string; sets: number; effectiveReps: number; verdict: string }>;
  belowFloor: string[];
  perSession: Array<{ label: string; countedSets: number; totalIfAllCounted: number; verdict: string }>;
  perPattern: Array<{
    pattern: string; heavyReps: number; velocityReps: number;
    heavy: 'below' | 'in_band' | 'above'; velocity: 'below' | 'in_band' | 'above';
  }>;
  unpriced: string[];
};

/** ⚠️ The catalogue's pattern keys are snake_case; the screen speaks English. */
const PATTERN_WORD: Record<string, string> = {
  horizontal_push: 'push',
  vertical_push: 'overhead press',
  horizontal_pull: 'row',
  vertical_pull: 'pull-up',
  knee_dominant: 'squat',
  hip_dominant: 'hinge',
  calf: 'calf',
  core: 'core',
};

const MUSCLE_WORD: Record<string, string> = {
  quadriceps: 'quads',
  deltoids: 'shoulders',
  lats: 'back',
};

const word = (map: Record<string, string>, key: string) => map[key] ?? key.replace(/_/g, ' ');

export default function ViadaWeekCard({ week }: { week: ViadaWeekPerformed | null | undefined }) {
  if (!week || week.perMuscle.length === 0) return null;

  return (
    <div className="px-3 py-3 border-t border-white/[0.055]">
      <div className="text-[11px] uppercase tracking-[0.08em] text-white/55">this week's lifting</div>

      {/* ── SETS PER MUSCLE (p086: 8-12 solid, 18-20 borders overreaching) ───────────────────── */}
      <div className="mt-2 space-y-1">
        {week.perMuscle.map((m) => (
          <div key={m.muscle} className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] text-white/80">{word(MUSCLE_WORD, m.muscle)}</span>
            <span className="text-[12px] text-white/60 tabular-nums">
              <span className="text-white/80">{m.sets}</span> sets · {m.effectiveReps} effective reps
            </span>
          </div>
        ))}
      </div>
      <div className="text-[11px] text-white/55 mt-1">his range is 8–12 sets a muscle a week</div>
      {week.belowFloor.length > 0 && (
        <div className="text-[12px] text-white/50 mt-1">
          nothing this week for {week.belowFloor.map((m) => word(MUSCLE_WORD, m)).join(', ')}
        </div>
      )}

      {/* ── REPS BY PATTERN (p084: 4-6 above 90%, 15-20 at 70-85%) ───────────────────────────── */}
      {week.perPattern.length > 0 && (
        <>
          <div className="mt-3 space-y-1">
            {week.perPattern.map((p) => (
              <div key={p.pattern} className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] text-white/80">{word(PATTERN_WORD, p.pattern)}</span>
                <span className="text-[12px] text-white/60 tabular-nums">
                  <span className="text-white/80">{p.heavyReps}</span> heavy ·{' '}
                  <span className="text-white/80">{p.velocityReps}</span> speed
                </span>
              </div>
            ))}
          </div>
          <div className="text-[11px] text-white/55 mt-1">
            his range is 4–6 reps above 90% and 15–20 at 70–85%, per pattern
          </div>
        </>
      )}

      {/* ⛔ NAMED, NOT COUNTED AS ZERO — a percentage of an unknown max is no number at all. */}
      {week.unpriced.length > 0 && (
        <div className="text-[12px] text-white/50 mt-2">
          no known max yet for {week.unpriced.join(', ')} — those sets are in the muscle counts above,
          not in the percentages
        </div>
      )}

      {/* ── WHAT EACH SESSION COST (p147: 6-8 recovers by the next day, 14+ costs up to three) ── */}
      {week.perSession.length > 0 && (
        <div className="mt-3 space-y-1">
          {week.perSession.map((s, i) => (
            <div key={`${s.label}-${i}`} className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] text-white/80">{s.label}</span>
              <span className="text-[12px] text-white/60 tabular-nums">
                <span className="text-white/80">{s.countedSets}</span> work sets
              </span>
            </div>
          ))}
          <div className="text-[11px] text-white/55">
            6–8 work sets leaves the next day about normal; 14 or more costs it
          </div>
        </div>
      )}
    </div>
  );
}

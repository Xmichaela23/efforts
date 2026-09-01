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
// ⛔ THE ONE NAME MAP AGAIN (FIXLIST 2a, same class of fault as 1d). `unpriced` is built from the RAW
// logged exercise name — `performed-ledger.ts:169` does `unpriced.add(ex.name)` into a Set, and a Set
// is case-sensitive, so "Ab Wheel Rollout" and "ab wheel rollout" are two members and the sentence
// named the same movement twice. Canonicalising collapses every spelling of a movement to one key
// ("Ab Wheel Rollout", "ab wheel rollout", "Ab Wheel Rollouts", "AB WHEEL ROLLOUT" all → `ab_rollout`),
// and `canonicalDisplayName` gives it the same clean label the rest of the screen uses.
// ⚠️ FIXED AT THE EDGE, NOT AT THE SOURCE, DELIBERATELY: `performed-ledger.ts` is server code inside a
// 27-function deploy closure, and this round is client-only. The server still emits both spellings —
// see the FIXLIST's server-side leftovers.
import { canonicalize, canonicalDisplayName } from '@shared/canonicalize';

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
  /** ⛔ Server-resolved: does p084's heavy/velocity band apply to this window at all? False in a
   *  test week. Undefined on a payload written before the field existed → the band applies. */
  patternBandApplies?: boolean;
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
  // One entry per MOVEMENT, not per spelling. Order of first appearance is kept so the sentence reads
  // in the order the athlete's own week produced.
  const unpricedNames = React.useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of week?.unpriced ?? []) {
      const key = canonicalize(raw);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(canonicalDisplayName(key));
    }
    return out;
  }, [week?.unpriced]);

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
      {/**
        * ⛔ THE BAND ROW DOES NOT DRAW IN A TEST WEEK (2026-09-01, ruled by Michael). The server says
        * whether p084's heavy/velocity band applies — `patternBandApplies` — and this renders that
        * answer. It does NOT work out which week it is: the heavy count is structurally zero in a
        * test week (band opens at 90%, the pretest tops out at 86.25%), so a zero that can never
        * resolve would read as a failure.
        * ⛔ BOTH HALVES GO TOGETHER. "16 speed" alone, with the heavy count silently missing, looks
        * like the heavy number was lost rather than that the band does not apply.
        * ⚠️ UNDEFINED MEANS THE BAND APPLIES — a payload written before this field existed keeps
        * today's behaviour rather than silently hiding the row.
        */}
      {week.perPattern.length > 0 && week.patternBandApplies !== false && (
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
      {unpricedNames.length > 0 && (
        <div className="text-[12px] text-white/50 mt-2">
          no known max yet for {unpricedNames.join(', ')} — those sets are in the muscle counts above,
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

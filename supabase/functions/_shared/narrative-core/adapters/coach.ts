// COACH adapter for the shared narrative-reasoning core (D-191, leg 5 — the final narrative path).
// DISTINCT SHAPE: week/state-scoped, not session-scoped. Its context is built from the SPINE
// (fitness_direction = rollupFitnessDirection(state_trends_v1)) + week signals (load/ACWR, readiness state,
// weekly body-response trends) — NOT a single-workout fact packet. Numbers stay single-sourced (the coach
// already reads the spine); this brings only the PROSE under the shared scaffold + validators.
//
// Highest-risk rules at the week level (why the coach is migrated last and most carefully):
//  • Rule 5 — fitness/readiness OVER-CLAIM. hasFitnessTrend gates fitness-state claims on a real spine
//    verdict (improving/stable/declining); 'mixed'/none → NOT grounded → "you're building/getting fitter"
//    is caught. The addendum PINS the direction to the spine verdict — the coach may only claim the
//    direction the spine actually computed (same lever as ride D-188 / strength D-189, at week scope).
//  • Rule 4 — STATE DIAGNOSIS. establishedCauses:[] + the shared STATE_DIAGNOSIS catch → "overreaching /
//    under-recovered / burnt out" is caught; the coach observes the pattern (load up, readiness down) instead.
// Folds in the coach's accumulated rules: D-154 (lead with state+credit; observation-never-prescription)
// and D-155 (describe-don't-prescribe — name the plan's key sessions, never ADD work) into the addendum.
// The hard lexical 'add'-ban stays a coach-specific post-check in the analyzer (wraps validateNarrative).

import type { DisciplineAdapter, NarrativeContext, SignalFlag } from '../types.ts';

const COACH_ADDENDUM = `
This is a WEEKLY check-in over the athlete's whole state — NOT a single workout. Signals: per-discipline fitness DIRECTION (the spine verdict), running load / ACWR, readiness state, weekly body-response trends, plan position, adherence + the plan's marked key sessions.
Honest reads: OPEN with STATE + CREDIT — where the athlete is (readiness, load, fitness direction) and the work they actually did, INCLUDING off-plan sessions (real training, never "behind"); never open on a miss-count or deficit (D-154). State the fitness DIRECTION ONLY as the spine verdict gives it — improving / stable / declining / mixed — never invent, upgrade, or pick a direction the verdict didn't compute. Report load and readiness as OBSERVED patterns, not diagnoses.
DESCRIBE, DON'T PRESCRIBE (D-155): you may NAME the plan's already-marked key sessions ("prioritize", "anchor on", "make X your non-negotiable") — but NEVER ADD or invent sessions/volume; the plan decides volume, not you. The phrasing "add a session / add another / add one more" is forbidden.
Traps (highest-risk at week level): claiming "getting fitter / building / ready / primed / peaking" beyond the spine verdict (rule 5 — a single good week is not a trend); DIAGNOSING a physiological state — "overreaching / overtrained / under-recovered / burnt out" (rule 4) — observe the pattern (load climbed while readiness dipped), never name the diagnosis; prescribing new work; inventing multi-week streaks the data doesn't show.
`;

const str = (v: unknown): string => (typeof v === 'string' ? v.toLowerCase() : '');

export const coachAdapter: DisciplineAdapter = {
  discipline: 'coach',
  leadSignals: ['readiness/load state', 'work done (incl. off-plan)', 'fitness direction'],
  addendum: COACH_ADDENDUM,
  buildContext(week: any): NarrativeContext {
    const dir = str(week?.fitness_direction); // 'improving' | 'stable' | 'declining' | 'mixed' | '' (needs_data)
    const load = str(week?.load_status?.status ?? week?.load_status); // 'under'|'on_target'|'elevated'|'high'
    const readiness = str(week?.readiness_state ?? week?.readinessState);

    // ── Rule 5: a fitness-STATE claim ("building/holding") is grounded only by a DEFINITE single-direction
    // spine verdict. 'mixed' (no single direction) and needs_data/absent → NOT grounded → caught. The
    // addendum pins WHICH direction; this gate is whether ANY single direction exists.
    const hasFitnessTrend = dir === 'improving' || dir === 'stable' || dir === 'declining';
    // weekly body-response trends ground a DIRECTION claim (improving/declining) when present.
    const hasTrendField = hasFitnessTrend || !!(week?.weekly_trends && Object.keys(week.weekly_trends).length > 0);

    // ── Rule 2: CONSERVATIVE — fire only on a CLEAR concern (genuine fatigue/overreach AND high load), so a
    // "steady/easy week" lead that ignores a real concern is caught, WITHOUT nagging the credit-first voice
    // (D-154) on every minor fluctuation.
    const atypicalSignals: SignalFlag[] = [];
    const concerned = (readiness === 'fatigued' || readiness === 'overreached') && (load === 'high' || load === 'elevated');
    if (concerned) {
      atypicalSignals.push({ signal: 'load/readiness', state: 'concern', detail: `readiness ${readiness} while load ${load}` });
    }

    return {
      notableLeadSignals: [], // the credit-first lead is free; nothing forced-notable (unlike run's heat)
      atypicalSignals,
      anchors: {},               // no per-workout HR/pace/power effort anchor at the week level
      hasTrendField,
      hasFitnessTrend,           // ← the Rule-5 lever; direction pinned to the spine verdict by the addendum
      establishedCauses: [],     // ← Rule-4 lever: the coach never diagnoses a cause/state
    };
  },
};

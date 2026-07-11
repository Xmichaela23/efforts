// STRENGTH adapter for the shared narrative-reasoning core (D-189, leg 3). Strength has NO endurance
// effort signal (no pace/HR/zones); its effort signal is RIR (proximity-to-failure) and its progress
// signal is the per-exercise e1RM TREND (Brzycki, canonical from exercise_log — single-sourced).
// PREREQUISITE (wired in the analyzer): the e1RM must come from exercise_log.estimated_1rm, NOT be
// invented — before D-189 the packet carried no e1RM, so the prompt's "estimated-1RM trend" line was a
// rule-6 fabrication vector. `hasFitnessTrend` is the Rule-5 lever: a "getting stronger" claim needs a
// per-exercise e1RM trend (≥2 sessions), never one session.

import type { DisciplineAdapter, NarrativeContext } from '../types.ts';

const STRENGTH_ADDENDUM = `
Signals: estimated 1RM per exercise (Brzycki, canonical from exercise_log — single-sourced), RIR, volume, load, per-exercise history. There is NO pace / HR / zone signal — strength has no endurance effort metric.
Honest reads: e1RM TREND per exercise (comparison-to-self, needs ≥2 sessions); RIR as proximity-to-failure (the effort signal — too_easy / on_target / too_hard); volume/load progression vs prior sessions; progressive-overload read.
Traps: importing ENDURANCE framing (pace, HR, heart rate, zones do NOT apply to strength — never characterize effort by HR); a single-session "getting stronger" / "strength is building" claim with NO per-exercise e1RM trend; fabricating a physiological mechanism ("hypertrophy", "neural adaptation"); diagnosing the CAUSE of a missed lift (low energy / poor sleep) — name it as plausible at most, never proven.
`;

export const strengthAdapter: DisciplineAdapter = {
  discipline: 'strength',
  leadSignals: ['RIR', 'load', 'e1RM-trend'],
  addendum: STRENGTH_ADDENDUM,
  buildContext(packet: any): NarrativeContext {
    const e1rm = Array.isArray(packet?.e1rm_by_exercise) ? packet.e1rm_by_exercise : [];
    // D-270 continuity: a DIRECTION claim ("getting stronger") is grounded only when the SPINE has a
    // per-lift trend (spine_direction present) — NOT merely because a prior session exists (a prior
    // session is a receipt, not a trend; that was the fork that let the narrative say "down" while State
    // said "improving"). Fall back to prior-session presence only for callers that don't thread
    // spine_direction, so their prior behavior is preserved.
    const spineThreaded = e1rm.some((e: any) => e != null && 'spine_direction' in e);
    const hasTrend = spineThreaded
      ? e1rm.some((e: any) => e?.spine_direction != null)
      : e1rm.some((e: any) => e?.prior_e1rm != null && Number(e.prior_e1rm) > 0);
    return {
      notableLeadSignals: [], // no captured-but-dropped lead signal (unlike run's heat)
      atypicalSignals: [],    // strength's single paragraph + RIR discipline rarely contradicts; keep empty (no-regression)
      // NO hr anchor on purpose: if the narrative imports endurance framing ("heart rate elevated"),
      // anchorlessEffort (Rule 3) fires — catching the endurance-framing trap. strength effort is RIR-anchored.
      anchors: { strength: e1rm.length ? 'e1rm-history' : null },
      hasTrendField: hasTrend,   // grounds a DIRECTION claim ("getting stronger")
      hasFitnessTrend: hasTrend, // grounds a fitness-STATE claim ("strength is building"); one session does not
      establishedCauses: [],     // strength never diagnoses the cause of a missed lift
    };
  },
};

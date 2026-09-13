/**
 * ═══ THE DRIFT A SESSION PRINTS — ONE RULE, EVERY READER ═══════════════════════════════════════════
 *
 * The number behind `session_detail_v1.classification.decoupling.pct` (the Drift tile and the
 * heart-rate line on Performance), behind the good-news line on Today ("Drift under 5 percent,
 * N rides in a row"), and behind State's drift chart. All three read THIS function (2026-09-12,
 * Michael: "we need consistent rules across all screens"). It used to be two copies — `build.ts`
 * carried its own inline resolver and this file warned "a change to one must be made to the other"
 * — and on 2026-09-12 the two changed twice in one day without each other.
 *
 * ⛔ AND STATE WAS A THIRD. `compute-snapshot driftReadForPoint` kept its own steadiness test and
 * its own fourth fallback, so a ride it called steady was a ride Performance called intervals. It
 * imports this function now; the comment that said it "keeps the same precedence" was describing an
 * intention rather than the code.
 *
 * THE RULE:
 *   0. ⛔ STEADY SESSIONS ONLY, RUN AND RIDE (p107): cardiac drift is "a general guideline when
 *      assessing the maximum recommended dose of easy/VT1 work in a given session" — a given pace or
 *      output at a given heart rate. An interval session has no such pace or output, so it has no
 *      drift: null, not a labelled number. ⛔ THE TEST IS NOT HERE AND IS NOT A BOOLEAN A CALLER MAY
 *      PASS IN — it is `sessionSteadiness` in `./session-steadiness.ts`, and a caller hands over the
 *      MATERIALS it has (the planned row, the fact packet, the workout row, the rendered rows) so
 *      that no screen can answer the question for itself. A caller with nothing to hand over gets
 *      the ladder's own "nothing said" verdict, which is steady.
 *   1. The analyser's pace-to-heart-rate decoupling, `heart_rate_summary.decouplingPct` (D-036),
 *      basis 'gap' or 'raw', when it computed one (runs).
 *   2. A ride's power-to-heart-rate decoupling, `computed.analysis.efficiency.aerobic_decoupling_pct`
 *      (`_shared/cycling-v1/ride-physiology.ts`), basis 'power' — TrainingPeaks' Pw:Hr, the number
 *      State's bike drift reads.
 *   3. Heart rate alone, second half against first — `hr_drift_v1.pct`, written by both analysers
 *      from `_shared/hr-drift-halves.ts` — basis 'hr'. The fallback when there is no output to
 *      ratio against.
 *   4. Else no read. ⚠️ THERE IS NO FIFTH. State carried one (`workout_facts.drift`) and it was the
 *      only place a drift number could appear that Performance had no way to show.
 * Rounded to one decimal, as the tile prints it — a reader comparing against 5 must see 4.96 as 5.0.
 */
import { sessionSteadiness, type SteadinessInput } from './session-steadiness.ts';

export type { SteadinessInput };

export type DriftBasis = 'gap' | 'raw' | 'hr' | 'power';
export type SessionDrift = {
  pct: number;
  basis: DriftBasis;
  /** The run analyser's own read of its decoupling, when it stamped one. */
  assessment: string | null;
  /** The heat/effort-confounded flag the run analyser sets; State excludes such a run from its verdict. */
  confounded: boolean;
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const RIDE = /^(ride|bike|cycling)$/;

export function resolveSessionDrift(input: {
  workoutAnalysis: unknown;
  computed?: unknown;
  sport?: string | null;
  /**
   * ⛔ THE MATERIALS THE STEADINESS LADDER READS, NOT A VERDICT. Hand over what this caller has;
   * a rung with nothing to read is skipped. `factPacket` defaults to the one on the analysis.
   */
  steadiness?: SteadinessInput;
}): SessionDrift | null {
  let wa = input.workoutAnalysis;
  if (typeof wa === 'string') { try { wa = JSON.parse(wa); } catch { return null; } }
  const a = (wa && typeof wa === 'object' ? wa : {}) as Record<string, any>;
  const sport = String(input.sport ?? '').toLowerCase();
  const isRide = RIDE.test(sport);
  const isRun = sport === 'run';

  // 0. steady sessions only — the ladder decides, never this file and never the caller.
  const st = input.steadiness ?? {};
  const fp = st.factPacket ?? a.fact_packet_v1 ?? null;
  if ((isRun || isRide) && !sessionSteadiness({ ...st, factPacket: fp }).steady) return null;

  // 1. the analyser's decoupling
  const hrs = a.heart_rate_summary && typeof a.heart_rate_summary === 'object' ? a.heart_rate_summary : null;
  const pct = hrs?.decouplingPct;
  if (typeof pct === 'number' && Number.isFinite(pct)) {
    const basis = hrs.decouplingBasis === 'raw' ? 'raw' : 'gap';
    const assessment = typeof hrs.decouplingAssessment === 'string' ? hrs.decouplingAssessment : null;
    return { pct: round1(pct), basis, assessment, confounded: hrs.decouplingConfounded === true };
  }

  // 2. a ride's power-to-heart-rate ratio
  if (isRide) {
    let comp = input.computed;
    if (typeof comp === 'string') { try { comp = JSON.parse(comp); } catch { comp = null; } }
    const pdec = Number((comp as any)?.analysis?.efficiency?.aerobic_decoupling_pct);
    if (Number.isFinite(pdec)) return { pct: round1(pdec), basis: 'power', assessment: null, confounded: false };
  }

  // 3. heart rate alone
  const halves = a.hr_drift_v1;
  if (halves && typeof halves.pct === 'number' && Number.isFinite(halves.pct)) {
    return { pct: round1(halves.pct), basis: 'hr', assessment: null, confounded: false };
  }
  return null;
}

/**
 * The percentage alone — what the boom line compares against 5.
 * ⚠️ `steadiness` IS NOT OPTIONAL IN PRACTICE. Omitting it leaves every rung with nothing to read,
 * so the ladder says "nothing said" and the session counts as steady. That is the right default for
 * a session the app knows nothing about and the wrong one for a caller that simply did not pass what
 * it had — which is exactly how Today's boom line read an interval ride as steady.
 */
export function sessionDriftPct(
  workoutAnalysis: unknown,
  computed?: unknown,
  sport?: string | null,
  steadiness?: SteadinessInput,
): number | null {
  return resolveSessionDrift({ workoutAnalysis, computed, sport, steadiness })?.pct ?? null;
}

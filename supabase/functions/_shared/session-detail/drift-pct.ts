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
 *      MATERIALS it has (the planned row, the fact packet, the workout row, the rendered rows; the
 *      analysis itself is handed over by default, for the planned sets in its breakdown) so
 *      that no screen can answer the question for itself. A caller with nothing to hand over gets
 *      the ladder's own "nothing said" verdict, which is steady.
 *   0b. ⛔ A RIDE WHOSE POWER SWUNG HAS NO DRIFT (2026-09-27, Michael): a variability index above 1.05
 *      means the ride held no given output, so there is nothing to read drift at — null, whatever the
 *      ladder said. `driftReadApplies` below; runs are not touched by it.
 *   1. The analyser's pace-to-heart-rate decoupling, `heart_rate_summary.decouplingPct` (D-036),
 *      basis 'gap' or 'raw', when it computed one (runs) — TrainingPeaks' Pa:Hr.
 *   2. A ride's power-to-heart-rate decoupling, `computed.analysis.efficiency.aerobic_decoupling_pct`
 *      (`_shared/cycling-v1/ride-physiology.ts`), basis 'power' — TrainingPeaks' Pw:Hr, the number
 *      State's bike drift reads. Rungs 1 and 2 are one rule, worked out in `../aerobic-decoupling.ts`: over the
 *      whole session, and only on a session of 20 minutes or more.
 *   3. Else no read. ⛔ NO HEART-RATE-ONLY RUNG (2026-09-27, Michael: "abide by training peaks"). Heart rate
 *      alone (`hr_drift_v1`, `_shared/hr-drift-halves.ts`) used to stand in when there was no ratio — a ride
 *      with no power, a run whose ratio was withheld — with its own start (3 minutes skipped). TrainingPeaks' decoupling is Pa:Hr or Pw:Hr and nothing else, so a session with neither has
 *      no drift, the same null a short session gets. `hr_drift_v1` is still written for the coach and the
 *      daily ledger. ⚠️ THERE IS NO FOURTH. State carried one (`workout_facts.drift`) and it was the only
 *      place a drift number could appear that Performance had no way to show.
 * Rounded to one decimal, as the tile prints it — a reader comparing against 5 must see 4.96 as 5.0.
 */
import { sessionSteadiness, type SteadinessInput } from './session-steadiness.ts';

export type { SteadinessInput };

export type DriftBasis = 'gap' | 'raw' | 'power';
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
  if ((isRun || isRide) && !sessionSteadiness({ ...st, factPacket: fp, workoutAnalysis: st.workoutAnalysis ?? a }).steady) return null;
  // 0b. a ride whose power swung — no given output, so no drift (below). The same packet, else the analysis's own.
  if (isRide && !driftReadApplies(sport, variabilityIndexOf(fp ?? factPacketOf(a)))) return null;

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

  // 3. no read — no heart-rate-only rung (header).
  return null;
}

/**
 * ⛔ A RIDE WHOSE POWER SWUNG HAS NO DRIFT AT ALL (2026-09-27, Michael, "Go" — revised the same day). His Saturday
 * ride was planned steady and ridden as climbs and drops: pedalling power 142 W in the first half, 106 W in the
 * second, normalized power 125 W over an average of 77 W. The Drift tile read "10.8% · 5.8 over the 5% line".
 * The book reads drift at a given output (rule 0 above: a given pace or output at a given heart rate, p107); this
 * ride held none, so it has no drift read — the same null an interval session gets. The first cut that morning
 * kept the percentage and took only the 5% line off; that is gone. Because the null is decided HERE, every reader
 * of this rule agrees without a check of its own: the Drift tile and the Heart rate row on Performance
 * (`build.ts decouplingV1`), the "Drift under 5 percent" line on Today (`session-boom/line.ts`), State's drift
 * chart (`compute-snapshot driftReadForPoint`). The ride
 * paragraph's heart-rate-with-power sentence is handed this function's number (`analyze-cycling-workout`, 2026-09-27).
 *
 * FIELD — TrainingPeaks, "Power Terminology For Cycling" (trainingpeaks.com/blog/power-terminology-for-cycling/,
 * read 2026-09-27): "A steady and even output, like during a triathlon, should have a VI of 1.05 or less."
 * VI is normalized power ÷ average power (TrainingPeaks Help Center, "Variability Index (VI)",
 * help.trainingpeaks.com/hc/en-us/articles/204071734-Variability-Index-VI). ⚠️ That help page carries the
 * definition and a table of rides, not the 1.05; the sentence is on the blog page.
 *
 * ⚠️ THE FACT PACKET'S `variability_index`, the one the cycling packet writes (`cycling-v1/build.ts`). NOT the
 * analyser's `is_mixed_effort` stamp — that one is VI ≥ 1.05 OR power CV ≥ 12% (OURS) and a hedge, never a filter.
 * ⚠️ RIDES ONLY. A run has no power VI and is unchanged (its own steadiness ladder decides); so is a ride with no VI
 * on file (no power meter).
 */
export const STEADY_RIDE_MAX_VI = 1.05;

/** False on a ride whose variability index is above 1.05: no drift read at all. True otherwise. */
export function driftReadApplies(sport: string | null | undefined, variabilityIndex: unknown): boolean {
  if (!RIDE.test(String(sport ?? '').toLowerCase())) return true;
  if (variabilityIndex == null || variabilityIndex === '') return true;
  const vi = Number(variabilityIndex);
  return !(Number.isFinite(vi) && vi > STEADY_RIDE_MAX_VI);
}

/**
 * The fact packet an analysis carries: at the top, else under `session_state_v1.details`, where the ride analyser
 * writes the same packet (`analyze-cycling-workout`). The builder and Today's line already read it in that order.
 */
export function factPacketOf(workoutAnalysis: unknown): unknown {
  let wa = workoutAnalysis;
  if (typeof wa === 'string') { try { wa = JSON.parse(wa); } catch { return null; } }
  const a = (wa && typeof wa === 'object' ? wa : {}) as Record<string, any>;
  return a.fact_packet_v1 ?? a.session_state_v1?.details?.fact_packet_v1 ?? null;
}

/** The packet's `facts.variability_index`, as stored (the gate above reads it). */
export function variabilityIndexOf(factPacket: unknown): unknown {
  return (factPacket as { facts?: { variability_index?: unknown } } | null | undefined)?.facts?.variability_index ?? null;
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

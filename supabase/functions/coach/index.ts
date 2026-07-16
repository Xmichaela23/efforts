// Edge Function: coach
//
// V1: Deterministic week context contract.
// - Week framing is based on active plan's PlanContractV1.week_start (defaults to Monday).
// - Metrics are computed from stored workload_* fields (source of truth).
// - No AI here; AI language should be layered on top of these facts.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type {
  CoachWeekContextRequestV1,
  CoachWeekContextResponseV1,
  MethodologyId,
  WeekStartDow,
  WeekVerdictCode,
  NextActionCode,
  EvidenceItem,
  KeySessionCategory,
  KeySessionItem,
} from './types.ts';
import { getMethodology } from './methodologies/registry.ts';
import type { MethodologyContext } from './methodologies/types.ts';
import { computeMarathonReadiness, type PlanContext } from '../_shared/marathon-readiness/index.ts';
import {
  getAcwrRiskFlag,
  getAcwrStatus,
  isAcwrDetrainedSignal,
  isAcwrFatiguedSignal,
} from '../_shared/acwr-state.ts';
import { computeAcwr, computeEstimatedLoadDisclosure, type LoadRow, type DisclosureRow } from '../_shared/acwr.ts';
import { getRunningFatigueWeight, getCyclingFatigueWeight } from '../_shared/fatigue-weights.ts';
import { isLowTrustWorkload } from '../_shared/workload.ts';
import { reconcileLoadStatus } from '../_shared/load-status-reconcile.ts';
import { resolveCurrentFtp } from '../../../src/lib/resolve-current-ftp.ts';
import { resolvePlanPhaseDetailed, phaseNameToWeekIntent, type PhaseSource } from '../_shared/plan-phase.ts';
import { offPlanAdherenceBanner, offPlanAdherenceResult } from '../_shared/off-plan-banner.ts';
import { computePerDomainLoad, type SliceSession } from '../_shared/per-domain-load.ts';
import { computeFitnessFatigue } from '../_shared/fitness-fatigue.ts';
import { assessAbsorption } from '../_shared/absorption.ts';
import { computeSafetyFloor, resolvePlanPrimary, computePrimaryAdherence, resolvePrimarySport } from '../_shared/load-status-reconcile.ts';
import { computeWtdLoadSummary } from '../_shared/adherence-plan.ts';
import { canonicalize } from '../_shared/canonicalize.ts';
import { rollupFitnessDirection, rollupFitness, rollupHrResponse, type FitnessDirection, resolveStrengthCapacity, canonicalizeLiftKey, decouplingLabel, decouplingBandDisplay, bikeRideIntensityAerobic, bikeEfficiencyDisplay, composeWeekAccent, overReachCandidate, rirCandidate, bannerCandidate, tradeCandidate, leverCandidate, type WeekAccent } from '../_shared/state-trend/index.ts';
import {
  computeWeeklyResponse,
  type WeeklyResponseState,
  type WeeklySignalInputs,
  type BaselineNorms,
  type StrengthLiftSnapshot,
  type CrossDomainPair,
} from '../_shared/response-model/index.ts';
import { resolveProfile, getTargetRir } from '../_shared/strength-profiles.ts';
import { buildReadinessWhy, buildCrossTrainingReceipt, crossTrainingStressReceipt, bodyRpeDriver } from '../_shared/response-model/readiness-receipts.ts';
import { buildLoadedLegsDiagnosis, classifyFatigueLabel, type LoadedLegsDiagnosis } from '../_shared/response-model/loaded-legs.ts';
import { detectNovelMovements, novelMovementsNames, type SessionMovement } from '../_shared/novel-movements.ts';
import { classifyStrengthFocus } from '../_shared/cross-domain-carryover.ts';
import { buildStrengthSessionTypes7d } from '../_shared/strength-session-types.ts';
import { buildSwimSessions7d } from '../_shared/swim-sessions.ts';
import { runGuardedNarrative, type NarrativeContext, type DisciplineVerdict } from '../_shared/narrative-core/index.ts';
import { loadGoalContext, resolveRunGoalIdForRaceProjection, type GoalContext, type GoalLite } from '../_shared/goal-context.ts';
import { coachLegacyPriorRaceLine, coachPromptPriorRaceBlock } from '../_shared/prior-similar-race-coach.ts';
import { runGoalPredictor, responseModelToWeeklyInput } from '../_shared/goal-predictor/index.ts';
import { getBlockAdaptation } from '../_shared/block-adaptation/index.ts';
import { computeRaceReadiness, type RaceReadinessV1 } from '../_shared/race-readiness/index.ts';
import { buildRaceProjectionDisplay } from '../_shared/race-readiness/projection-facts.ts';
import {
  buildRaceFinishProjectionV1,
  type RaceFinishProjectionV1,
} from '../_shared/resolve-server-predicted-finish.ts';
import { resolveGoalTargetTimeSeconds, targetSecondsFromPlanConfig } from '../_shared/resolve-goal-target-time.ts';
import { getPacesFromScore } from '../generate-run-plan/effort-score.ts';
import {
  buildDailyLedger,
  buildIdentity,
  buildPlanPosition,
  buildBodyResponse,
  generateCoaching,
  snapshotToPrompt,
  assessAdaptation,
  adaptationSignalsToPrompt,
  type AthleteSnapshot,
  type SessionInterpretationForPrompt,
  type AdaptationInput,
} from '../_shared/athlete-snapshot/index.ts';
import { computeLongitudinalSignals, longitudinalSignalsToPrompt } from '../_shared/longitudinal-signals.ts';
import {
  isPlanTransitionWindowByWeekIndex,
  resolvePlanWeekIndex,
  resolveWeekStartDowFromPlanConfig,
  weekStartOf,
  planHasStarted,
  planHasEnded,
  planWeek1StartIso,
  buildPlanContextLine,
} from '../_shared/plan-week.ts';
import { getArcContext, type ArcContext } from '../_shared/arc-context.ts';
import { swimSecPer100YdFromArcSwimInputs } from '../_shared/planning-context.ts';
import { normalizeGoalDistanceKey } from '../_shared/race-projections.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Cached rows below this version are ignored (full recompute). Bump when adding response fields (e.g. overall_training_read on response_model). */
/** Bump when adding/changing top-level coach fields so coach_cache rows recompute (not served stale). */
/** Keep `src/lib/coach-contract.ts` COACH_CLIENT_MIN_PAYLOAD_VERSION in sync. */
/** v28: Wire coach to ArcContext + add Arc-aware overall_training_read + weekly_state_v1.empty_state. */
/** v29: Add last_completed_race.projected_seconds (course-model projection at race time). */
/** v31: Coach reads swim_cutoff_pressure_v1 + swim intent guardrails in FACTS. */
/** v32: 70.3 swim yardage gate → Olympic bridge pivot lines in snapshot longitudinal block + legacy FACTS. */
/** v33: Suppress Olympic pivot when Arc swim baseline ≤120 s/100 yd (fast pool swimmer). */
/** v35: Strong swimmer → durability FACT without Olympic pivot; 703 swim safety floors + cutoff→focus in generator. */
/** v36: D-146/D-147 load verdict fixes (spike-on-empty-base guard + unplanned-load ACWR≥1.0 gate + off-plan wording) change load_status/intent_summary VALUES — bump so cached "high load → back off" rows recompute instead of serving stale. */
/** v47: D-231 — response_model.strength.per_lift gains `anchor_1rm` (typed baseline) + the verdict/suggested-weight now consult it (de-alarmed tone on headroom); bump so cached baseline-blind "125→115" rows recompute with the anchor-aware row. */
/** v48: D-232 — glass-box RPE row: visible_signal "How hard it feels" detail is now a plain verdict + receipt ("Sessions feeling a bit harder than usual (avg 6.4 vs your typical 5.5)") instead of "feels 0.9 harder"; bump so cached bare-delta rows recompute. */
/** v49: D-232 — cross_training_signal strain label cites the distinct fired signals ("Effort up (5.3 vs 4.4)", no false "across disciplines" on a single signal) + trends.readiness_why factor breakdown for the FATIGUED "open for more"; bump so cached rows recompute. */
/** v50: D-232 claim-grounding — pre-start plans no longer narrate as "week 1 in-block" (planHasStarted gates the narrative planLine + the week-chip index → null pre-start); bump so cached pre-start rows recompute. */
/** v51: D-232 concision — readiness_why NAMES the marker ("perceived effort up (5.3 vs 4.4 typical) · load balanced") + drops the redundant "N signals declining" count; narrative tightened to ≤3 terse sentences with a NO-DASHBOARD-RECAP rule. Bump so cached verbose rows recompute. */
/** v52: D-232 surgical readiness — the `fatigued` catch-all resolves to LEGS LOADED / LEGS SORE / EFFORT UP / FATIGUED (systemic only); loaded-legs Why names the session+mechanism+effect + a conditional suggestion (readiness_suggestion). Bump so cached "FATIGUED" rows recompute. */
/** v53: D-232 loaded-legs detection now fires on FULL-body days too (legs load from squats inside a full session, not just pure lower); Why says "lower-body work". Bump so cached EFFORT-UP-on-a-full-day rows recompute to LEGS LOADED. */
/** v54: Q-112 narrative-grounding guard — the week narrative is validated against the spine verdicts (no trend-state contradiction, no receipt-number recap); one regeneration, else prose is dropped (honest empty). Bump so cached ungrounded narratives recompute. */
/** v55: Q-112 convergence — the coach week narrative now runs through the ONE shared narrative-core guard (rules 6/7 absorbed into it; standalone response-model/narrative-guard deleted; one retry-then-drop policy + rejection logging). Behavior-equivalent to v54; bump for cleanliness. */
/** v56: Q-111 §2 — the LEGS LOADED Why NAMES the novel movements from a ~6–8wk strength-history read; same novel fact the strength INSIGHTS uses (one fact, two surfaces). */
/** v57: honesty (D-233) — the novel phrase cites the WINDOW actually checked ("in 8 weeks"), not "in months" (a duration the 56-day read can't establish). Bump so cached "in months" rows recompute. */
/** v58: grounding correction (Michael 2026-07-03) — NO time window at all ("8 weeks" still over-claimed a last-performed date the lookback edge can't pin). LEGS LOADED Why now: "{movement} (not in your recent training)". Bump so cached "8 weeks" rows recompute. */
/** v59: stale-anchor class closure — the plan week claim (narrative line + week chip) now END-gated (planActiveNow = planHasStarted && !planHasEnded), so a naturally-expired, never-replaced plan stops narrating "week {duration}". Bump so cached rows for any ended plan recompute. */
/** v61: Q-111 fact-only — a strength DECLINE ("back off weight") no longer emits a `suggested_weight` (the "go lighter" prescription is dropped; the client then renders "Working ~125 vs your 150 baseline" with no action). Progression ("add weight") suggestions unchanged. Bump so cached "suggest 115 / back off" per-lift rows recompute to the fact-only row. */
const COACH_PAYLOAD_VERSION = 104; // 104: State v3 dot-and-arrow — RUN row's aerobic durability now carries a `range` (positionInRange over 12wk) so the client renders a DOT (where you are) + an ARROW (which way) instead of the clipped "aerobic base needs work ↑ improving" that read as a contradiction. Bump so cached rows re-source the range. // 103: the week accent is now an ENFORCED voice ("quant who trains") — fixed templates with number slots + a hard banned-word check that drops any fortune-cookie copy; fact-first; strength is no longer mis-credited as an endurance carrier (only swim/bike carry endurance load). Bump so cached rows re-source the new copy. // 102: fix the false "eased off" — the shortfall check now counts days STRICTLY before today (a session planned FOR today isn't missed this morning), and DONE is bounded to this week-to-date (the ±2-day query pad could bleed last week's tail in). Bump so cached rows re-source. // 101: typo fix in the trade sentence ("runn" -> "run"; the /ing$/ strip mangled the word). Bump so cached rows re-source the corrected copy. // 100: the trade "eased off" sentence now gates on planned-BY-TODAY, not the whole week, so a partial (mid-week) week can't read as "eased off" (the Q-177 partial-week trap). The mix bar still shows the full week's plan. Bump so cached rows re-source. // 99: week_execution_v1 accent is now a warm TRADE sentence (names carriers + benefit + specificity cost, folds in RIR) instead of the terse banner line, and the client renders a planned-vs-actual MIX bar. Bump so cached v98 rows re-source the new accent. // 98: STATE "how your sessions went" is rebuilt (docs/STATE-WEEK-EXECUTION.md) — steady run/bike FITNESS verdicts removed from this section (they duplicated PERFORMANCE; the "aerobic base needs work" said-twice bug), and weekly_state_v1.week_execution_v1 now carries neutral planned-vs-done COUNTS + at most ONE composed accent (over-reach > lever(dormant) > RIR-vs-plan-target > substitution/positive/under-training). Bump so cached rows re-source and the new field lands. // 97: Q-179 — weekly_state_v1.trends.display now carries the per-discipline POSTURE read (posture/postureRead/postureSentence on each card). The coach forwards state_trends_v1.display verbatim (:5359), but coach_cache freezes the whole payload, so a stale cache serves pre-posture cards. Bump so cached rows re-source and the posture line reaches the client. Same move as v75, when display was first added. // 96: Q-177 — compute-snapshot's structuralDirection no longer falls back to strength_volume_trend (a PARTIAL-WEEK artifact: a cumulative SUM of the current week vs the average of COMPLETE prior weeks, so ~-75% on a Monday). That fallback fed interferenceScore, which the coach reads at :2205 — so on a Monday an athlete with no e1RM history was declared 'declining' and the app could assert "endurance is dominating your strength" off nothing but the day of the week. With no e1RM history structuralDirection now stays NULL and interference is simply not computed (Law 2: no inference without evidence). Bump so cached interference/verdict rows re-source instead of passing the `cachedVer >= COACH_PAYLOAD_VERSION` gate with an artifact baked in — the same trap the D-281 and Q-170 reverts both hit. Also retires the strength_volume_trend longitudinal SIGNALS built on the same substrate (the spine's 6-week per-workout volume trend is the single source, and it was RIGHT). // 95: D-283 — hot runs are KEPT in the run durability substrate and in the coach's 7d decoupling receipt (D-275's heat exclusion is dead: not field-standard, and on 81 real steady runs the heat->decoupling slope's 95% CI straddles zero under every specification — hot runs read BEST, so the filter was deleting the athlete's best data). Bump so cached AERO/decoupling rows re-source off the un-filtered substrate. // 94: REVERT of Q-170 (v93) — the heat work is pulled; D-275's exclusion stands. Bumped FORWARD (not back to 92) on purpose: the cache gate is `cachedVer >= COACH_PAYLOAD_VERSION`, so restoring 92 would leave the v93 rows (the '· N of M runs were hot' naming) passing as valid and still being served. Same trap as the D-281 revert. // 92: REVERT of D-281 (v90 + v91) — the total-load ACWR band is removed and the pre-D-281 reconciler restored. Bumped FORWARD (not back to 89) on purpose: the cache gate is `cachedVer >= COACH_PAYLOAD_VERSION`, so reverting the constant to 89 would leave the bad v90/v91 rows (the false "pull back") passing as valid and being served. 92 invalidates them. See the revert commit + Q-166 for why the band was wrong: ACWR alone must never reach the prescriptive band (D-266, Q-137, Item-3 rule "Load-high + body-fine → elevated max"). // 89: acwr_provisional fix — the thin-base flag now keys on the REAL thin-base signal (spikeOnEmptyBase), not "the verdict stayed low" (which wrongly flagged real-base athletes whose spike is cross-training-attributed). Real base → never provisional, any composition. Bump so cached load re-sources. // 88: LOAD verdict — a REAL elevation the body is absorbing (no strain, good readiness, no ≥2 declining signals) now reads 'productive' (Garmin/COROS/Intervals field-standard), not "balanced" (hides it) or "back off" (false alarm); AND an elevated ACWR discounted as thin/empty-base is flagged acwr_provisional so the bare number isn't read as a real spike. Bump so cached load verdicts re-source. // 87: BODY "Heart-rate response" as_of now stamps the OLDEST contributing session (was freshest) so a combined read never looks fresher than its stalest half (a fresh bike + 2-week-old run stamps the run date); provenance also names each discipline's age. Bump so cached BODY rows re-source. // 86: BODY "Heart-rate response" — holistic, SPINE-sourced (run aerobic decoupling + bike HR-at-power, swim excluded), replacing the run-only re-derived HR-drift row. One source across all reliable-HR endurance; provisional-aware; carries as_of + a per-discipline provenance. Bump so cached BODY rows re-source. // 85: BODY endurance signals (How hard it feels / Heart rate drift) carry as_of_date = newest session behind the rolling read, rendered "as of {date}" so a 7d/week window isn't mistaken for today's data. Bump so payloads gain the field. // 84: drop the "Run quality" BODY signal (execution-vs-baseline is plan-adherence, not body response — field keeps adherence in a separate lane; run physiology already in PERFORMANCE). Bump so cached BODY rows re-source. // 83: Q-162 — fitness_direction is now decided by SOLID verdicts only; a provisional (thin/clustered) discipline can no longer ASSERT a confident direction (was un-weighted), and any thin mover held out is named as a data gap in the narrative. Bump so cached fitness_direction recomputes. // 82: SWIM row fix — fetch planned_id in the recentWorkouts query so the "planned → % achieved" branch works (was never selected → every swim read as unplanned); free swims already showed distance. Bump forces a fresh compute so swim_sessions_7d lands. // 81: SWIM sessions row — emit swim_sessions_7d (planned → % achieved, unplanned → distance covered; NEVER pace, Q-038-safe) so the State "how your sessions went" section finally shows swim instead of hiding it. Bump so payloads gain the field. // 80: D-275-bike follow-on — the BIKE "sessions went" row's steady-aerobic efficiency VERDICT now reads the SPINE bike efficiency (HR-at-power) via shared bikeEfficiencyDisplay, not the coach's own HR-drift bands → BIKE row ≡ PERFORMANCE bike Efficiency (the last run↔bike continuity gap closed). Bump so cached BIKE rows re-source. // 79: D-275-bike / Q-117 — the BIKE 7d HR-drift row now excludes hard-RIDDEN rides (best-20 ≥ 90% FTP) from the steady-type drift avg, via the SAME bikeRideIntensityAerobic gate the spine HR-at-power efficiency read uses → both bike engines agree on "too hard to count as aerobic". Bump so cached BIKE rows recompute. // 78: D-275 continuity close — the AERO card's run durability VERDICT (steady types) now reads the SPINE decoupling band (confound-excluded, freshness-gated) via the shared decouplingBandDisplay vocab, instead of the coach's own 7d decoupling average → AERO ≡ PERFORMANCE (no more "durability gap" on AERO while the trend says "holding"). Also skips heat-confounded runs from the 7d decoupling receipt. Bump so cached cards re-source. // 77: Q-129 coach honesty net — the week headline now feeds CONCERNING spine verdicts (sliding) as atypicalSignals so rule 2 catches a "you're cruising / comfortable" headline that contradicts a discipline sliding on-screen (was hardcoded [] → rule 2 dead); AND the guard always runs (cold-start no longer bypasses it → no unguarded narrative for a data-less athlete). Bump so cached headlines re-validate. // 76: FTP fracture #2 — coach FTP reads (per-domain load bins + prose baseline line) route through resolveCurrentFtp (learned-first) instead of a local manual-first fork; bike FTP now agrees across coach/analyzer/compute-facts. Bump so per-domain bins recompute. // 75: S2 — weekly_state_v1.trends.display carries the pre-assembled State display contract (cards + per-discipline fitness reads) from the cached spine, so the client renders it instead of recomputing in-browser. Bump so payloads gain the field. // 74: D-270 strength convergence — per-lift e1rm_trend now READS the spine's per-lift direction (state_trends_v1.strength.per_lift) instead of the dead previous_e1rm delta; the "getting stronger/slipping" verdict fires again (Q-107 H2). Bump so cached always-'stable' rows recompute. // 73: b2 scale-up (Q-149) — primary_discipline now the SPECIFIC lead sport (strength/run/ride/swim/tri/duathlon/hybrid) so bike-forward leads with bike, not run; swim never faked. // 72: b2 — strength_session_types_7d + weekly_state_v1.plan.primary_discipline. // 71: D-268 Phase 3 — the LLM narrative + intent_summary are told the plan's PRIMARY discipline (strength-primary → prose frames around strength, not running). Bump so cached rows recompute. // 70: D-268 Phase 2 — off-plan banner plan-aware; planPrimary hoisted. // 69: D-268 Phase 1 — strength-primary interpretation de-run-framed. // 68: D-267 Fix 1. // 67: N-concerning fallback.
// 66 was: // 66: readiness restructure — RPE driver under BODY (readiness_rpe_driver), chip dropped, Why = non-RPE only.
// 65 was: // 65: Why names the driver session (constant-free) + chip/headline dedup (readiness in chip only).
// 64 was: // 64: BODY row provenance — receipt "you rated X avg vs Y typical" + tap-expand cross-discipline line. // 63: per_lift.last_session_date (as-of date on the strength row). // 62: item 3 — headline "Why" RPE driver is bare-verdict (numeric receipt lives on the BODY row only, rule 7). // 61: Q-111 fact-only — no "go lighter" prescription on strength decline. // 60: shared classifyStrengthFocus (one fact). // 59: plan-week END-gated. // 58: novelty = "not in your recent training". // 57: "in 8 weeks". // 53 (D-232): loaded-legs fires on full-body days. // 52 (D-232): surgical loaded-legs readiness. // 51 (D-232): named marker + terse narrative. // 50 (D-232): pre-start claim-grounding. // 49 (D-232): honest strain label + readiness_why. // 48 (D-232): glass-box RPE detail. // 47 (D-231): per_lift.anchor_1rm. // 46 (D-212 Cut 2): emit fitness_verdict_divergence top-level (spine↔projection cross-check). Additive/optional; bump invalidates cache so the field lands in fresh payloads. // 45 (D-191): coach prose migrated onto the shared narrative core (scaffold + validators); fitness claims pinned to the spine verdict (rule 5), no state-diagnosis (rule 4), describe-don't-prescribe folded in (D-154/D-155). Bump invalidates pre-migration cached narratives. // 44: narrative sentence-4 — forbid "add a session" (describe plan, don't prescribe); name only plan-marked key sessions; max_tokens 300->500 (truncation fix)

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseISODateOnly(iso: string): Date {
  const [y, m, d] = String(iso).split('-').map((x) => parseInt(x, 10));
  return new Date(y, (m || 1) - 1, d || 1);
}

/**
 * Plan Wizard stores `effort_score` on `plans.config` but many athletes have no `user_baselines.effort_paces`
 * row (or empty). Without steady/race paces, VDOT readiness returns null while the plan still has target_time.
 */
function mergedEffortPacesForCoach(
  ubPaces: unknown,
  planConfig: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  const u = ubPaces && typeof ubPaces === 'object' && !Array.isArray(ubPaces)
    ? (ubPaces as Record<string, unknown>)
    : null;
  if (u != null && u.steady != null && Number(u.steady) > 0) return u;
  const es = planConfig?.effort_score != null ? Number(planConfig.effort_score) : NaN;
  if (Number.isFinite(es) && es > 0) {
    try {
      return getPacesFromScore(es) as unknown as Record<string, unknown>;
    } catch {
      return u;
    }
  }
  return u;
}

function addDaysISO(iso: string, deltaDays: number): string {
  const base = parseISODateOnly(iso);
  base.setDate(base.getDate() + deltaDays);
  return toISODate(base);
}

type PrimaryRaceReadinessPayload = NonNullable<CoachWeekContextResponseV1['primary_race_readiness']>;

function parseWorkoutAnalysisJson(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  return {};
}

/**
 * Most recent completed run ≥12 mi with `session_detail_v1.race_readiness` (verdict present).
 * Window: from 21 weeks before race through as_of_date.
 */
async function pickPrimaryRaceReadinessWorkout(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  raceDateYmd: string,
  asOfDate: string,
): Promise<PrimaryRaceReadinessPayload | null> {
  const raceDay = raceDateYmd.slice(0, 10);
  const windowStart = addDaysISO(raceDay, -(21 * 7));

  const { data, error } = await supabase
    .from('workouts')
    .select('id,date,timestamp,type,workout_status,workout_analysis')
    .eq('user_id', userId)
    .eq('workout_status', 'completed')
    .gte('date', windowStart)
    .lte('date', asOfDate)
    .limit(80);

  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];

  const sorted = [...rows].sort((a: any, b: any) => {
    const da = String(a?.date || '').slice(0, 10);
    const db = String(b?.date || '').slice(0, 10);
    if (da !== db) return db.localeCompare(da);
    const ta = new Date(a?.timestamp || `${da}T23:59:59`).getTime();
    const tb = new Date(b?.timestamp || `${db}T23:59:59`).getTime();
    return tb - ta;
  });

  for (const w of sorted) {
    const wtype = String((w as any)?.type || '').toLowerCase();
    if (wtype !== 'run') continue;

    const wa = parseWorkoutAnalysisJson((w as any)?.workout_analysis);
    const sd = wa.session_detail_v1;
    if (!sd || typeof sd !== 'object') continue;
    const sdObj = sd as Record<string, unknown>;
    const rr = sdObj.race_readiness;
    if (!rr || typeof rr !== 'object') continue;
    const verdict = String((rr as { verdict?: string }).verdict || '').trim();
    if (!verdict) continue;

    const ct = sdObj.completed_totals as Record<string, unknown> | undefined;
    const distMRaw = ct?.distance_m;
    const distM = distMRaw != null && Number.isFinite(Number(distMRaw)) ? Number(distMRaw) : null;
    const distMi = distM != null ? distM / 1609.344 : null;
    if (distMi == null || distMi < 12) continue;

    const headline = String((rr as { headline?: string }).headline || '').trim();
    if (!headline) continue;

    return {
      workout_id: String((w as any).id),
      workout_date: String((w as any).date || '').slice(0, 10),
      distance_miles: Math.round(distMi * 10) / 10,
      headline,
      tactical_instruction: String((rr as { tactical_instruction?: string }).tactical_instruction || '').trim(),
      projection: String((rr as { projection?: string }).projection || '').trim(),
    };
  }

  return null;
}

function weekdayFromISODate(iso: string): string {
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  try {
    return names[parseISODateOnly(iso).getDay()] || 'Unknown';
  } catch {
    return 'Unknown';
  }
}

function sessionLocalLabel(workout: any, fallbackIsoDate: string, timezone?: string | null): string {
  const tsRaw = workout?.timestamp || workout?.start_time || null;
  if (tsRaw) {
    try {
      const dt = new Date(String(tsRaw));
      if (!Number.isNaN(dt.getTime())) {
        const opts: Intl.DateTimeFormatOptions = {
          weekday: 'long',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        };
        if (timezone) opts.timeZone = timezone;
        return dt.toLocaleDateString('en-US', opts);
      }
    } catch {
      // fall through to date-only label
    }
  }
  const day = weekdayFromISODate(fallbackIsoDate);
  return `${day}`;
}

function workoutLocalDate(workout: any, fallbackIsoDate: string, timezone?: string | null): string {
  const tsRaw = workout?.timestamp || workout?.start_time || null;
  if (tsRaw) {
    try {
      const dt = new Date(String(tsRaw));
      if (!Number.isNaN(dt.getTime())) {
        const opts: Intl.DateTimeFormatOptions = {};
        if (timezone) opts.timeZone = timezone;
        return dt.toLocaleDateString('en-CA', opts);
      }
    } catch {
      // fall through
    }
  }
  return String(fallbackIsoDate || '').slice(0, 10);
}

function safeNum(n: any): number | null {
  const x = Number(n);
  return Number.isFinite(x) ? x : null;
}

type ActivePlanLite = {
  id: string;
  name: string | null;
  config: any;
  duration_weeks: number | null;
  goal_id?: string | null;
};

async function loadAllActivePlans(supabase: any, userId: string): Promise<ActivePlanLite[]> {
  const { data } = await supabase
    .from('plans')
    .select('id,name,config,duration_weeks,athlete_context_by_week,goal_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(5);
  return Array.isArray(data) ? (data as any[]) : [];
}

// Primary plan = soonest upcoming race date; falls back to most recently created.
function pickPrimaryPlan(plans: ActivePlanLite[]): ActivePlanLite | null {
  if (!plans.length) return null;
  const withRace = plans
    .filter(p => p.config?.race_date)
    .sort((a, b) => new Date(a.config.race_date).getTime() - new Date(b.config.race_date).getTime());
  return (withRace[0] ?? plans[0]) as ActivePlanLite;
}

function isTriGoalLite(g: GoalLite | null | undefined): boolean {
  if (!g) return false;
  const s = String(g.sport || '').toLowerCase();
  return s === 'triathlon' || s === 'tri' || s.includes('triathlon');
}

/** Plan-linked tri goal if it matches active plan; else A-priority tri primary_event; else first active tri goal. */
function activeTriGoalForSwimIntent(ctx: GoalContext, activePlanGoalId: string | null | undefined): GoalLite | null {
  const triGoals = ctx.goals.filter(isTriGoalLite);
  if (!triGoals.length) return null;
  const gid = activePlanGoalId && String(activePlanGoalId).trim() ? String(activePlanGoalId).trim() : null;
  if (gid) {
    const linked = triGoals.find((g) => g.id === gid);
    if (linked) return linked;
  }
  if (ctx.primary_event && isTriGoalLite(ctx.primary_event)) return ctx.primary_event;
  return triGoals[0] ?? null;
}

/** `swim_intent` from plan_contract_v1 (effective schedule), else active tri goal's `training_prefs`. */
function deriveTriSwimIntentForCoach(
  ctx: GoalContext,
  activePlanGoalId: string | null | undefined,
  planConfig: Record<string, unknown> | null | undefined,
): 'focus' | 'race' | null {
  const contract = planConfig?.plan_contract_v1 as Record<string, unknown> | undefined;
  const fromContract = contract?.swim_intent ?? planConfig?.swim_intent;
  if (fromContract === 'focus' || fromContract === 'race') return fromContract;

  const g = activeTriGoalForSwimIntent(ctx, activePlanGoalId);
  if (!g) return null;
  const tp = g.training_prefs;
  if (!tp || typeof tp !== 'object') return 'race';
  const raw = (tp as Record<string, unknown>).swim_intent ?? (tp as Record<string, unknown>).swimIntent;
  if (raw === 'focus') return 'focus';
  return 'race';
}

/** Wizard / Arc-setup tier — engine reads intent separately; Coach uses `strong` for maintenance-vs-survival framing. */
function deriveTriSwimExperienceForCoach(
  ctx: GoalContext,
  activePlanGoalId: string | null | undefined,
): 'learning' | 'steady' | 'strong' | null {
  const g = activeTriGoalForSwimIntent(ctx, activePlanGoalId);
  const tp = g?.training_prefs;
  if (!tp || typeof tp !== 'object') return null;
  const raw =
    (tp as Record<string, unknown>).swim_experience ??
    (tp as Record<string, unknown>).swimExperience;
  const s = String(raw ?? '').toLowerCase().trim();
  if (s === 'learning' || s === 'steady' || s === 'strong') return s;
  return null;
}

function formatSwimPace100Yd(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

/** Many coaches use ~5k yd/week swim durability benchmark before prioritizing a half-distance swim leg. */
const SWIM_YARD_WEEKLY_GATE_703 = 5000;
/** Olympic-distance pivot copy targets OW survival / cutoff stress — misaligned for fast pool baselines (e.g. sub ~2:00/100 yd). */
const SWIM_FAST_BASELINE_SUPPRESS_OLYMPIC_PIVOT_SEC_PER_100YD = 120;

function parseComputedLoose(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  if (typeof v === 'string') {
    try {
      const j = JSON.parse(v) as unknown;
      return j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Sum main-set meters from materialized `computed.steps`, then convert to yards (pool plans use yd display). */
function sumPlannedWeekSwimYards(plannedRows: unknown[]): number | null {
  let meters = 0;
  let sawSwim = false;
  for (const raw of plannedRows) {
    const row = raw as Record<string, unknown>;
    const typ = String(row?.type || '').toLowerCase();
    if (!typ.includes('swim')) continue;
    sawSwim = true;
    const comp = parseComputedLoose(row?.computed);
    if (!comp) continue;
    const steps = Array.isArray(comp.steps) ? (comp.steps as unknown[]) : [];
    let rowM = 0;
    for (const s of steps) {
      if (!s || typeof s !== 'object') continue;
      const st = s as Record<string, unknown>;
      const dm = Number(st.distance_m ?? st.distanceMeters ?? 0);
      if (Number.isFinite(dm) && dm > 0) rowM += dm;
    }
    const totalDm = Number(comp.total_distance_meters ?? comp.total_distance_m ?? 0);
    if (rowM > 0) meters += rowM;
    else if (Number.isFinite(totalDm) && totalDm > 0) meters += totalDm;
  }
  if (!sawSwim) return null;
  if (meters <= 0) return null;
  return meters / 0.9144;
}

/**
 * Strong swimmer + fast baseline + deliberate lean yards (`swim_intent` race): frame low volume as maintenance/agency,
 * not survival failure — optional lever via switching to swim focus (do not force yards).
 */
function strong703LeanMaintenanceCoachLines(opts: {
  primaryTriDistance: string | null | undefined;
  weeklySwimYards: number | null;
  swimSecPer100Yd: number | null;
  swimExperience: 'learning' | 'steady' | 'strong' | null | undefined;
  swimIntent: 'focus' | 'race' | null;
}): string[] {
  const dk = normalizeGoalDistanceKey(opts.primaryTriDistance ?? '');
  if (dk !== '70.3') return [];
  if (opts.swimExperience !== 'strong') return [];
  if (opts.swimIntent !== 'race') return [];

  const belowGate =
    opts.weeklySwimYards != null &&
    Number.isFinite(opts.weeklySwimYards) &&
    opts.weeklySwimYards + 1e-6 < SWIM_YARD_WEEKLY_GATE_703;

  const paceKnownFast =
    opts.swimSecPer100Yd != null &&
    Number.isFinite(opts.swimSecPer100Yd) &&
    opts.swimSecPer100Yd <= SWIM_FAST_BASELINE_SUPPRESS_OLYMPIC_PIVOT_SEC_PER_100YD;

  if (!belowGate || !paceKnownFast || opts.weeklySwimYards == null || opts.swimSecPer100Yd == null) return [];

  const paceStr = formatSwimPace100Yd(opts.swimSecPer100Yd);
  const ydR = Math.round(opts.weeklySwimYards);
  return [
    `SWIM MAINTENANCE vs SURVIVAL (70.3 — strong swimmer): Arc baseline ~${paceStr}/100 yd is well above typical 70.3 cutoff worry; planned ~${ydR} yd this week is maintenance/lean volume, not the ~${SWIM_YARD_WEEKLY_GATE_703}+ yd survival/durability benchmark coaches apply near ~2:30+/100 yd. Treat this as a valid bike/run-protection choice unless OW weakness shows up in execution — one sentence max.`,
    `SWIM LEVER (optional): If they want swimming as a race lever (not just maintenance), they can adopt swim_intent "focus" in setup — adds third weekly swim + reallocates bike/run TSS; do not prescribe extra yards ad hoc.`,
  ];
}

/** Deterministic advisory when 70.3 swim weekly yardage is under common durability benchmarks. */
function olympic703BridgePivotCoachLines(opts: {
  primaryTriDistance: string | null | undefined;
  weeklySwimYards: number | null;
  swimCutoffPressureV1: Record<string, unknown> | null | undefined;
  swimIntent: 'focus' | 'race' | null;
  swimSecPer100Yd: number | null;
  swimExperience?: 'learning' | 'steady' | 'strong' | null;
}): string[] {
  const dk = normalizeGoalDistanceKey(opts.primaryTriDistance ?? '');
  if (dk !== '70.3') return [];

  const belowGate =
    opts.weeklySwimYards != null &&
    Number.isFinite(opts.weeklySwimYards) &&
    opts.weeklySwimYards + 1e-6 < SWIM_YARD_WEEKLY_GATE_703;

  const paceKnownFast =
    opts.swimSecPer100Yd != null &&
    Number.isFinite(opts.swimSecPer100Yd) &&
    opts.swimSecPer100Yd <= SWIM_FAST_BASELINE_SUPPRESS_OLYMPIC_PIVOT_SEC_PER_100YD;

  const paceSlow = opts.swimSecPer100Yd != null && opts.swimSecPer100Yd >= 150;
  const sev = String(opts.swimCutoffPressureV1?.severity ?? '');
  const cutoffRisk = sev === 'elevated' || sev === 'high';
  const compoundUnknownVolume =
    opts.weeklySwimYards == null &&
    opts.swimIntent === 'race' &&
    paceSlow &&
    cutoffRisk;

  if (!belowGate && !compoundUnknownVolume) return [];

  // Strong swimmers: surface durability only — never Olympic-bridge FACTs (fast+race+lean is handled by strong703LeanMaintenanceCoachLines).
  if (opts.swimExperience === 'strong') {
    if (
      belowGate &&
      paceKnownFast &&
      opts.swimIntent === 'race' &&
      opts.weeklySwimYards != null
    ) {
      return [];
    }
    if (belowGate && opts.weeklySwimYards != null) {
      return [
        `SWIM DURABILITY (70.3 — strong swimmer): Planned swims ~${Math.round(opts.weeklySwimYards)} yd — under the ~${SWIM_YARD_WEEKLY_GATE_703}+ yd/week durability benchmark many coaches use for half-distance OW volume (shoulders, chop, time on stroke pattern). Do not suggest Olympic distance as a progression bridge.`,
      ];
    }
    if (compoundUnknownVolume) {
      return [
        `SWIM DURABILITY SIGNAL (70.3 — strong swimmer): Planned yards unavailable; cutoff pressure elevated — note durability/OW exposure without Olympic-distance pivot language.`,
      ];
    }
    return [];
  }

  // Fast pool swimmers: low weekly yards still miss OW durability, but Olympic-as-"bridge" is the wrong story.
  if (belowGate && paceKnownFast) return [];

  if (belowGate && opts.weeklySwimYards != null) {
    return [
      `SWIM SURVIVAL VOLUME BENCHMARK (70.3): Planned swims this week ~${Math.round(opts.weeklySwimYards)} yd — under the ~${SWIM_YARD_WEEKLY_GATE_703}+ yd/week survival/durability floor many coaches use when pool pace is nearer ~2:30+/100 yd (shoulders + neuromuscular exposure + open-water margin before bike/run).`,
      `OLYMPIC BRIDGE (optional pivot): For slower swim baselines or tight cutoff margin, holding a 70.3 on chronically sub-${SWIM_YARD_WEEKLY_GATE_703} yd weeks raises DNF risk vs athletes already holding maintenance yards with a fast baseline. You may suggest Olympic distance once (~1.5 km swim, lower weekly load, OW mass-start practice) until swim consistency supports a half — empathetic; athlete chooses.`,
    ];
  }

  return [
    `SWIM SURVIVAL SIGNAL (70.3): Could not sum planned swim yards; swim_intent race (2×), baseline slow (≥~2:30/100 yd), cutoff pressure elevated — survival-margin pattern where Olympic distance may fit better until weekly swim durability improves — optional pivot; mention once.`,
  ];
}

function swimCutoffPressureCoachFacts(planConfig: Record<string, unknown> | null | undefined): string[] {
  const contract = planConfig?.plan_contract_v1 as Record<string, unknown> | undefined;
  const p =
    (contract?.swim_cutoff_pressure_v1 ?? planConfig?.swim_cutoff_pressure_v1) as Record<
      string,
      unknown
    > | null | undefined;
  if (!p || typeof p !== 'object') return [];

  const lines: string[] = [];
  const hints = Array.isArray(p.narrative_hints) ? p.narrative_hints : [];
  for (const h of hints) {
    if (typeof h === 'string' && h.trim()) lines.push(h.trim());
  }

  if (p.intent_promoted_to_focus === true && Array.isArray(p.intent_promotion_reasons)) {
    const rs = (p.intent_promotion_reasons as unknown[])
      .map((x) => (typeof x === 'string' ? x : ''))
      .filter(Boolean)
      .join(', ');
    if (rs) {
      lines.push(
        `SWIM INTENT GUARDRAIL: schedule uses swim_intent "focus" (engine promotion: ${rs}). Name swim as a limiter until pace/cutoff margin clearly improves.`,
      );
    }
  }

  return lines;
}

function swimPostureFactLine(intent: 'focus' | 'race'): string {
  return intent === 'focus'
    ? 'SWIM_POSTURE: swim_intent is "focus" — treat swim as a primary vector with bike and run; name swim explicitly (pace feel, drills, aerobic quality, CSS/threshold context) when SESSION lines include swims.'
    : 'SWIM_POSTURE: swim_intent is "race" (default) — swims maintain feel and sharpness; foreground bike and run trends unless a swim issue is clearly concerning.';
}

function inferMethodologyId(planConfig: any): MethodologyId {
  const approach = String(planConfig?.approach || '').toLowerCase();
  if (approach === 'performance_build') return 'run:performance_build';
  if (approach === 'sustainable') return 'run:sustainable';
  // Triathlon approaches: map to the closest run methodology for threshold/verdict math.
  // The distinct coaching identity is injected into narrativeFacts separately.
  if (approach === 'race_peak') return 'run:performance_build';
  if (approach === 'base_first') return 'run:sustainable';
  return 'unknown';
}

/** Returns human-readable methodology description for the LLM, or null for run plans. */
function triMethodologyFact(planConfig: any, allActivePlans: any[]): string | null {
  // approach may be at the top-level config (standalone tri plan) OR inside plan_contract_v1 (combined plan)
  const approach = String(
    planConfig?.approach ||
    planConfig?.plan_contract_v1?.tri_approach ||
    '',
  ).toLowerCase();
  const sport = String(planConfig?.sport || planConfig?.plan_type || planConfig?.plan_contract_v1?.sport || '').toLowerCase();
  const isTri = sport.includes('tri') || sport === 'multi_sport' ||
    allActivePlans.some(p =>
      String(p.config?.sport || '').toLowerCase().includes('tri') ||
      String(p.config?.plan_type || '').toLowerCase().includes('tri') ||
      String(p.config?.plan_contract_v1?.sport || '').toLowerCase().includes('tri'),
    );
  if (!isTri && approach !== 'base_first' && approach !== 'race_peak') return null;

  if (approach === 'base_first') {
    return [
      `TRAINING METHODOLOGY: Triathlon — Aerobic Foundation (Completion-Focus).`,
      `Quality sessions are deliberately in Zone 3 tempo, NOT threshold intervals — this is by design.`,
      `Brick sessions are neuromuscular transition practice at Zone 2, not metabolic stress tests.`,
      `Praise consistency, low HR drift, and aerobic comfort. Do NOT suggest adding intervals or pushing harder — durability is the goal.`,
      `Loading is 2:1 (every 3rd week is recovery); flag it positively if the athlete held steady through load weeks.`,
    ].join(' ');
  }
  if (approach === 'race_peak') {
    return [
      `TRAINING METHODOLOGY: Triathlon — Race-Peak (Performance-Focus).`,
      `Quality sessions target Zone 4 threshold and Zone 5 VO2max to raise the aerobic ceiling.`,
      `Race-pace bricks in Build/Race-Specific phases simulate metabolic switching under fatigue — these are key sessions.`,
      `Praise power output, FTP-percentage work, CSS swim adherence, and threshold session completion.`,
      `Loading is 3:1 (every 4th week is recovery); monitor accumulated fatigue across all three disciplines.`,
    ].join(' ');
  }
  if (sport === 'multi_sport' || sport.includes('tri')) {
    return `TRAINING METHODOLOGY: Multi-Sport Combined (80/20 Unified Plan). Training load is budgeted across swim, bike, run, and strength as a single TSS pool. When coaching, consider total systemic load — a hard swim day counts toward the weekly hard quota just like a hard run.`;
  }
  return null;
}

function resolveWeekStartDow(planConfig: any): WeekStartDow {
  return resolveWeekStartDowFromPlanConfig(planConfig) as WeekStartDow;
}

function computeWeekIndex(planConfig: any, focusIso: string, weekStartDow: WeekStartDow, durationWeeks: number | null): number | null {
  void weekStartDow; // week start is resolved canonically from plan config
  return resolvePlanWeekIndex(planConfig, focusIso, durationWeeks);
}

function weekIntentFromContract(planConfig: any, weekIndex: number | null): { intent: CoachWeekContextResponseV1['plan']['week_intent']; focus_label: string | null; phase_source: PhaseSource } {
  if (!weekIndex) return { intent: 'unknown', focus_label: null, phase_source: 'unknown' };
  // D-261: single plan-phase resolver — phase_by_week (standalone run/tri) →
  // config.phases (combined) → config.phase_structure.phases (strength_primary).
  // Was phase_by_week-only → 'unknown' for every multi-sport / strength plan
  // (Q-136 Drop A). `phaseNameToWeekIntent` maps the raw name (deload→recovery,
  // unknown phase → 'unknown' fail-safe). `phase_source` is the glass-box receipt.
  const resolved = resolvePlanPhaseDetailed(planConfig, weekIndex);
  const intent = phaseNameToWeekIntent(resolved.phase) as CoachWeekContextResponseV1['plan']['week_intent'];
  const c = planConfig?.plan_contract_v1;
  const intents: any[] | null = Array.isArray(c?.week_intent_by_week) ? c.week_intent_by_week : null;
  const focus_label = intents ? String((intents.find((x: any) => Number(x?.week_index) === weekIndex)?.focus_label) || '') || null : null;
  return { intent, focus_label, phase_source: resolved.phase_source };
}

// ---------------------------------------------------------------------------
// Reconcile load_status → extracted to _shared/load-status-reconcile.ts (D-259).
// That module is the authority: two gates (runNotOverPlan cross-training +
// build-band plan-phase via ACWR_RATIO_THRESHOLDS), with body-signal / fatigued
// / overreached raises bypassing both. reconcileLoadStatus imported at top.
// ---------------------------------------------------------------------------

/** Deterministic race-window cues — must agree with logged training + plan intent (not LLM). */
function computeGroundedRaceWeekGuidanceV1(args: {
  hasActivePlan: boolean;
  primaryRaceName: string | null;
  weekIntent: string;
  weeksOut: number | null;
  keySessionGapsDetails: Array<{ skip_reason?: string | null }>;
  keySessionsRemaining: Array<{ name?: string | null; type?: string | null; category?: string }>;
  runningAcwr: number | null;
}): { title: string; bullets: string[] } | null {
  if (!args.hasActivePlan || !args.primaryRaceName) return null;
  if (args.weeksOut == null || args.weeksOut > 2) return null;
  const wi = String(args.weekIntent || '').toLowerCase();
  if (wi !== 'taper' && wi !== 'peak') return null;

  const fatigueSkips = args.keySessionGapsDetails.filter((g) => {
    const c = String(g?.skip_reason ?? '').trim().toLowerCase();
    return c === 'fatigued' || c === 'tired';
  }).length;

  const bullets: string[] = [
    'Most race-specific fitness is already in the bank — this week is about freshness and sharpness, not adding volume.',
  ];

  if (fatigueSkips > 0) {
    bullets.push(
      fatigueSkips === 1
        ? 'You skipped a planned session tagged for fatigue or low energy. During taper, that is often the right trade: protect freshness for race day instead of forcing every scheduled run.'
        : `You skipped ${fatigueSkips} planned sessions tagged for fatigue or low energy. During taper, that is often the right trade: protect freshness for race day instead of forcing every scheduled run.`,
    );
  }

  bullets.push(
    'Keep legs sharp with easy running plus short strides or a modest touch of race rhythm if your plan calls for it — avoid extra hard or long work that is not on the plan.',
  );

  const hasUpcomingLong = args.keySessionsRemaining.some((s) => {
    const blob = `${s.name ?? ''} ${s.type ?? ''} ${s.category ?? ''}`.toLowerCase();
    return blob.includes('long');
  });
  if (hasUpcomingLong) {
    bullets.push(
      'For your remaining long or key run, keep effort controlled — a race-specific touch, not a fitness build or empty-the-tank session.',
    );
  }

  if (args.runningAcwr != null && args.runningAcwr < 0.85) {
    bullets.push(
      `Your running load ratio is low versus recent weeks (${args.runningAcwr.toFixed(2)}) — that matches a taper. Do not chase load or ACWR up now unless your plan intentionally adds stress.`,
    );
  }

  const title = args.weeksOut <= 1 ? 'Race week — grounded cues' : 'Final weeks — grounded cues';
  return { title, bullets };
}

function buildVerdict(
  metrics: CoachWeekContextResponseV1['metrics'],
  methodologyId: MethodologyId,
  ctx: MethodologyContext,
  reaction: CoachWeekContextResponseV1['reaction'],
  isPlanTransitionPeriod: boolean = false,
): { code: WeekVerdictCode; label: string; confidence: number; reason_codes: string[]; next: { code: NextActionCode; title: string; details: string } } {
  const reason_codes: string[] = [];
  const acwr = metrics.acwr;
  const completion = metrics.wtd_completion_ratio;
  // Early weeks of a new plan: the 7-day acute window overlaps with the final
  // days of the previous training cycle, making ACWR unreliable. Suppress
  // ACWR-only caution unless the ratio is critically high or execution is poor.
  const isPlanWeek1 = isPlanTransitionPeriod;
  const methodology = getMethodology(methodologyId);
  const t = methodology.thresholds(ctx);
  const warn = t.warn_acwr;
  const high = t.high_acwr;

  if (acwr == null) {
    return {
      code: 'insufficient_data',
      label: 'Not enough data yet',
      confidence: 0.4,
      reason_codes: ['missing_acwr'],
      next: {
        code: 'insufficient_data',
        title: 'Log a few sessions first',
        details: 'Once you have a week or two of logged training, I can give you a confident week verdict.',
      },
    };
  }

  if (acwr >= high) {
    reason_codes.push('acwr_high');
    return {
      code: 'recover_overreaching',
      label: 'Recover',
      confidence: 0.8,
      reason_codes,
      next: {
        code: 'take_rest_or_easy',
        title: 'Make today easy or take rest',
        details: 'Protect recovery so your next quality session lands well.',
      },
    };
  }

  // Execution quality: if key sessions are being executed poorly, bias toward reducing intensity even if ACWR is okay.
  if (
    t.min_execution_score_ok != null &&
    reaction.avg_execution_score != null &&
    reaction.execution_sample_size >= 2 &&
    reaction.avg_execution_score < t.min_execution_score_ok
  ) {
    reason_codes.push('execution_low');
    return {
      code: 'caution_ramping_fast',
      label: 'Caution',
      confidence: 0.72,
      reason_codes,
      next: {
        code: 'swap_quality_for_easy',
        title: 'Dial back intensity for 24–48h',
        details: 'Your execution suggests you’re not absorbing the work. Keep it easy, then re-attempt the next key session.',
      },
    };
  }

  if (acwr >= warn && !isPlanWeek1) {
    reason_codes.push('acwr_elevated');
    return {
      code: 'caution_ramping_fast',
      label: 'Caution',
      confidence: 0.7,
      reason_codes,
      next: {
        code: 'swap_quality_for_easy',
        title: 'If needed, swap intensity for easy volume',
        details: 'Keep the week moving forward without digging a deeper hole.',
      },
    };
  }

  // Under-target is methodology-controlled (and often disabled for taper/recovery).
  if (t.under_target_completion_ratio != null && completion != null && completion < t.under_target_completion_ratio) {
    reason_codes.push('behind_plan');
    return {
      code: 'undertraining',
      label: 'Under target',
      confidence: 0.6,
      reason_codes,
      next: {
        code: 'add_easy_volume',
        title: 'Add easy volume if you can recover',
        details: 'A small, easy session can help you get back toward the plan’s intent.',
      },
    };
  }

  // If key sessions are being missed, bias next action toward prioritizing the next key session, not adding random volume.
  if (reaction.key_sessions_completion_ratio != null && reaction.key_sessions_completion_ratio < 0.6) {
    reason_codes.push('key_sessions_missed');
    return {
      code: 'undertraining',
      label: 'Under target',
      confidence: 0.62,
      reason_codes,
      next: {
        code: 'proceed_as_planned',
        title: 'Prioritize the next key session',
        details: 'Focus on completing the next key workout rather than adding extra volume.',
      },
    };
  }

  // In taper/recovery weeks, default next action leans conservative unless overridden by ACWR logic above.
  if (ctx.week_intent === 'recovery' || ctx.week_intent === 'taper') {
    return {
      code: 'on_track',
      label: 'On track',
      confidence: 0.7,
      reason_codes: ['recovery_week'],
      next: {
        code: 'take_rest_or_easy',
        title: 'Keep it easy',
        details: 'In a recovery/taper week, prioritize freshness over adding stress.',
      },
    };
  }

  return {
    code: 'on_track',
    label: 'On track',
    confidence: 0.75,
    reason_codes: ['acwr_ok'],
    next: {
      code: 'proceed_as_planned',
      title: 'Proceed as planned',
      details: 'Stay consistent and keep easy days truly easy.',
    },
  };
}

function keyCategoryForPlanned(row: any, ctx: MethodologyContext, methodologyId: MethodologyId): KeySessionCategory {
  const methodology = getMethodology(methodologyId);
  try {
    return methodology.classifyKeySession(row, ctx);
  } catch {
    return 'other';
  }
}

type RaceReadinessDriver = { label: string; value: string; tone: 'positive' | 'neutral' | 'warning' };

/** Shared by primary race_readiness block and RFP-mirror path (plan-only / non-primary_event goals). */
function buildRaceReadinessDrivers(args: {
  reaction: {
    key_sessions_planned: number;
    key_sessions_linked: number;
    hr_drift_avg_bpm: number | null;
    hr_drift_sample_size: number;
    avg_session_rpe_7d: number | null;
    rpe_sample_size_7d: number;
    avg_execution_score: number | null;
    execution_sample_size: number;
  };
  norms28d: {
    hr_drift_avg_bpm: number | null;
    session_rpe_avg: number | null;
    execution_score_avg: number | null;
  };
}): RaceReadinessDriver[] {
  const { reaction, norms28d } = args;
  const readinessDrivers: RaceReadinessDriver[] = [];
  const keyPlanned = reaction.key_sessions_planned;
  const keyLinked = reaction.key_sessions_linked;
  if (keyPlanned > 0) {
    const ratio = keyLinked / keyPlanned;
    readinessDrivers.push({
      label: 'Key sessions',
      value: `${keyLinked}/${keyPlanned} completed`,
      tone: ratio >= 0.8 ? 'positive' : ratio >= 0.5 ? 'neutral' : 'warning',
    });
  }

  // D-212 Piece 1 step 3: the spine fitness verdict is NOT folded in here as a "Fitness trend"
  // driver. It stays adjacent on the payload as `trends.fitness_direction` (the D-212-correct
  // home). Re-surfacing it near readiness would recreate the fold; if the spine should appear
  // beside readiness later, the step-2 divergence read is the vehicle, not a driver row.
  if (reaction.hr_drift_avg_bpm != null && norms28d.hr_drift_avg_bpm != null && reaction.hr_drift_sample_size >= 2) {
    const driftDelta = reaction.hr_drift_avg_bpm - norms28d.hr_drift_avg_bpm;
    readinessDrivers.push({
      label: 'Cardiac drift',
      value: `${reaction.hr_drift_avg_bpm > 0 ? '+' : ''}${reaction.hr_drift_avg_bpm.toFixed(1)} bpm`,
      tone: driftDelta <= -1 ? 'positive' : driftDelta >= 3 ? 'warning' : 'neutral',
    });
  }

  if (reaction.avg_session_rpe_7d != null && norms28d.session_rpe_avg != null && reaction.rpe_sample_size_7d >= 2) {
    const rpeDelta = reaction.avg_session_rpe_7d - norms28d.session_rpe_avg;
    readinessDrivers.push({
      label: 'Perceived effort',
      value: `${reaction.avg_session_rpe_7d.toFixed(1)} RPE`,
      tone: rpeDelta <= -0.4 ? 'positive' : rpeDelta >= 0.4 ? 'warning' : 'neutral',
    });
  }

  if (reaction.avg_execution_score != null && norms28d.execution_score_avg != null && reaction.execution_sample_size >= 2) {
    const execDelta = reaction.avg_execution_score - norms28d.execution_score_avg;
    readinessDrivers.push({
      label: 'Execution',
      value: `${Math.round(reaction.avg_execution_score)}%`,
      tone: execDelta >= 3 ? 'positive' : execDelta <= -5 ? 'warning' : 'neutral',
    });
  }

  return readinessDrivers;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  try {
    const payload = (await req.json().catch(() => ({}))) as Partial<CoachWeekContextRequestV1>;
    const skipCache = Boolean(payload?.skip_cache);
    const userId = String(payload?.user_id || '');
    if (!userId) {
      return new Response(JSON.stringify({ error: 'user_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userTz = payload?.timezone ? String(payload.timezone) : null;
    const asOfDate = String(payload?.date || (() => {
      try { return userTz ? new Date().toLocaleDateString('en-CA', { timeZone: userTz }) : new Date().toLocaleDateString('en-CA'); } catch { return new Date().toLocaleDateString('en-CA'); }
    })());

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
    });
    // coach_cache upsert requires INSERT; RLS only allows that for service_role. A user JWT in
    // `global.headers.Authorization` would make PostgREST act as `authenticated`, so upsert fails silently.
    const supabaseService = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // ── Cache read (stale-while-revalidate) ───────────────────────────────────
    const { data: cacheRow } = await supabaseService
      .from('coach_cache')
      .select('payload, generated_at, invalidated_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (cacheRow?.payload && !skipCache) {
      const ageMs = Date.now() - new Date(cacheRow.generated_at).getTime();
      const isStaleByAge = ageMs > 24 * 60 * 60 * 1000;
      const isInvalidated = cacheRow.invalidated_at != null;
      const cachedVer = Number((cacheRow.payload as { coach_payload_version?: number })?.coach_payload_version ?? 0);
      const versionOk = cachedVer >= COACH_PAYLOAD_VERSION;
      if (!isStaleByAge && !isInvalidated && versionOk) {
        return new Response(JSON.stringify(cacheRow.payload), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Coach-Cache': 'hit' },
        });
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ── Arc: single source of athlete truth (identity, learned fitness, goals, plan, snapshot, memory).
    // Per `.cursor/rules/arc-intelligence-layer.mdc`: coach must load ArcContext before deriving athlete state.
    // Loaded after the cache check so cache hits don't pay this cost; populated before any baselines /
    // goals / plans / response-model derivation downstream so everything below speaks from the same Arc.
    const arc: ArcContext = await getArcContext(supabaseService, userId, asOfDate);

    // Use service-role reads for plan + goal lists. The `supabase` client forwards the user JWT,
    // so PostgREST applies RLS — goals can return [] while plans still load, leaving goal_context
    // empty and breaking race_readiness / race_finish_projection_v1 despite data existing (Gate A).
    const allActivePlans = await loadAllActivePlans(supabaseService, userId);
    const activePlan = pickPrimaryPlan(allActivePlans);
    const secondaryPlans = allActivePlans.filter(p => p.id !== activePlan?.id);
    const planConfig = activePlan?.config || null;

    const goalContext = await loadGoalContext(supabaseService, userId, asOfDate, allActivePlans.map(p => p.id));
    const triSwimIntent = deriveTriSwimIntentForCoach(goalContext, activePlan?.goal_id ?? null, planConfig);
    const methodologyId: MethodologyId = inferMethodologyId(planConfig);
    const weekStartDow: WeekStartDow = resolveWeekStartDow(planConfig);

    const weekStartDate = weekStartOf(asOfDate, weekStartDow);
    const weekEndDate = addDaysISO(weekStartDate, 6);
    const weekIndex = activePlan ? computeWeekIndex(planConfig, asOfDate, weekStartDow, activePlan.duration_weeks || null) : null;
    // D-232 claim-grounding: has the plan actually started? resolvePlanWeekIndex clamps pre-start weeks
    // to 1, so a plan starting NEXT week reads as "week 1" — narrated as in-block over this week's
    // off-plan sessions. This gate keeps the narrative + week chip honest about pre-start.
    const planStarted = activePlan ? planHasStarted(planConfig, asOfDate) : true;
    // Stale-anchor class closure (2026-07-03): status→'ended' only fires on plan REPLACEMENT, not natural
    // expiry, and resolvePlanWeekIndex clamps a past date to the last week — so an expired-but-unreplaced
    // plan would narrate "week {duration}" forever. planActiveNow adds the END boundary (covers-today),
    // matching the arc phase gate. Used for the user-facing week CLAIMS (narrative line + week chip); the
    // pre-start branch at ~2884 stays on planStarted (an ended plan is not pre-start).
    const planEnded = activePlan ? planHasEnded(planConfig, activePlan.duration_weeks || null, asOfDate) : false;
    const planActiveNow = planStarted && !planEnded;

    // Plan transition period: first two plan weeks.
    // During this window, load-ratio comparisons are often contaminated by the prior cycle.
    const isPlanTransitionPeriod = isPlanTransitionWindowByWeekIndex(weekIndex);

    const weekIntentInfo = activePlan ? weekIntentFromContract(planConfig, weekIndex) : { intent: 'unknown', focus_label: null, phase_source: 'unknown' as PhaseSource };
    const weekIntent = weekIntentInfo.intent as CoachWeekContextResponseV1['plan']['week_intent'];
    const weekFocusLabel = weekIntentInfo.focus_label as string | null;
    const weekPhaseSource = weekIntentInfo.phase_source as PhaseSource;
    const methodologyCtx: MethodologyContext = { week_intent: weekIntent as any, week_start_dow: weekStartDow };

    // Planned rows within the week window — scoped to all active plans so
    // rows from ended plans in the same date range are excluded.
    let plannedWeekQuery = supabase
      .from('planned_workouts')
      .select('id,date,type,name,description,rendered_description,steps_preset,tags,workout_status,workload_planned,completed_workout_id,skip_reason,skip_note,training_plan_id,total_duration_seconds,computed,strength_exercises')
      .eq('user_id', userId)
      .gte('date', weekStartDate)
      .lte('date', weekEndDate);
    if (allActivePlans.length > 0) {
      plannedWeekQuery = plannedWeekQuery.in('training_plan_id', allActivePlans.map(p => p.id));
    }
    const { data: plannedWeek, error: pErr } = await plannedWeekQuery;
    if (pErr) throw pErr;

    // WTD actual load: completed workouts within [week_start, as_of]
    const { data: actualWtd, error: wErr } = await supabase
      .from('workouts')
      .select('workload_actual,date,workout_status')
      .eq('user_id', userId)
      .gte('date', weekStartDate)
      .lte('date', asOfDate);
    if (wErr) throw wErr;

    const plannedWeekArr = Array.isArray(plannedWeek) ? plannedWeek : [];
    const wtd = computeWtdLoadSummary(plannedWeekArr as any[], (actualWtd || []) as any[], asOfDate);
    const plannedWtdLoad = wtd.planned_wtd_load;
    const plannedWeekTotalLoad = wtd.planned_week_total_load;
    const plannedRemainingLoad = wtd.planned_remaining_load;
    const actualWtdLoad = wtd.actual_wtd_load;
    const wtdCompletionRatio = wtd.wtd_completion_ratio;

    const plannedWtdArr = plannedWeekArr.filter((r: any) => String(r?.date || '') <= asOfDate);

    // Pull completed workouts in-week for execution_score sampling (linked workouts usually have planned_id)
    // IMPORTANT: this must come before keySessionsRemaining so isPlannedCompleted is available.
    const plannedIds = new Set<string>(plannedWeekArr.map((p: any) => String(p?.id || '')).filter(Boolean));
    const workoutQueryFrom = addDaysISO(weekStartDate, -2);
    const workoutQueryTo = addDaysISO(asOfDate, 2);
    const { data: weekWorkoutsRows, error: wwErr } = await supabase
      .from('workouts')
      .select('id,date,timestamp,type,name,workout_status,workload_actual,planned_id,computed,workout_analysis,workout_metadata,rpe,session_rpe,feeling,strength_exercises')
      .eq('user_id', userId)
      .gte('date', workoutQueryFrom)
      .lte('date', workoutQueryTo);
    if (wwErr) throw wwErr;

    const weekWorkouts = (Array.isArray(weekWorkoutsRows) ? weekWorkoutsRows : [])
      .map((w: any) => {
        const localDate = workoutLocalDate(w, String(w?.date || '').slice(0, 10), userTz);
        return { ...w, __local_date: localDate };
      })
      .filter((w: any) => {
        const d = String(w?.__local_date || '');
        return d >= weekStartDate && d <= asOfDate;
      });

    const completedPlannedIdsFromWorkouts = new Set<string>(
      (Array.isArray(weekWorkouts) ? weekWorkouts : [])
        .filter((w: any) => String(w?.workout_status || '').toLowerCase() === 'completed')
        .map((w: any) => (w?.planned_id != null ? String(w.planned_id) : ''))
        .filter((s: string) => Boolean(s))
    );

    const isPlannedCompleted = (r: any): boolean => {
      const statusDone = String(r?.workout_status || '').toLowerCase() === 'completed';
      const hardLinked = r?.completed_workout_id != null;
      const viaWorkoutRef = r?.id != null && completedPlannedIdsFromWorkouts.has(String(r.id));
      return Boolean(statusDone || hardLinked || viaWorkoutRef);
    };

    const keySessionsRemaining: KeySessionItem[] = plannedWeekArr
      .filter((r: any) => String(r?.date || '') > asOfDate || (String(r?.date || '') === asOfDate && !isPlannedCompleted(r)))
      .map((r: any) => {
        const category = keyCategoryForPlanned(r, methodologyCtx, methodologyId);
        return {
          date: String(r?.date || '').slice(0, 10),
          type: String(r?.type || ''),
          name: r?.name != null ? String(r.name) : null,
          category,
          workload_planned: safeNum(r?.workload_planned),
        } as KeySessionItem;
      })
      .filter((x: any) => x.category !== 'other')
      .sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)));

    // Key session completion + execution quality
    // IMPORTANT: this is week-to-date (<= asOfDate), otherwise mid-week counts look wrong.
    const keySessionsPlanned = plannedWtdArr
      .map((r: any) => ({ r, cat: keyCategoryForPlanned(r, methodologyCtx, methodologyId) }))
      .filter((x: any) => x.cat !== 'other');

    // Do not mark same-day sessions as "missed" unless they are already completed.
    // This prevents morning/midday check-ins from prematurely counting today's
    // planned key session as a gap.
    const keySessionsPlannedEffective = keySessionsPlanned.filter((x: any) => {
      const d = String(x?.r?.date || '').slice(0, 10);
      if (d !== asOfDate) return true;
      return isPlannedCompleted(x?.r);
    });
    const keySessionsCompleted = keySessionsPlannedEffective.filter((x: any) => isPlannedCompleted(x?.r));
    const keySessionsCompletionRatio = keySessionsPlannedEffective.length > 0 ? keySessionsCompleted.length / keySessionsPlannedEffective.length : null;

    // Total planned sessions WTD (all types, not just key) — for honest "missed" counts
    const allPlannedWtdEffective = plannedWtdArr.filter((r: any) => {
      const d = String(r?.date || '').slice(0, 10);
      if (d !== asOfDate) return true;
      return isPlannedCompleted(r);
    });
    const allPlannedMissed = allPlannedWtdEffective.filter((r: any) => !isPlannedCompleted(r));
    const totalSessionsGaps = allPlannedMissed.length;

    // Linking breakdown (WTD): linked vs gaps vs extras
    const keySessionGapsDetails = keySessionsPlannedEffective
      .filter((x: any) => !isPlannedCompleted(x?.r))
      .map((x: any) => ({
        planned_id: String(x?.r?.id || ''),
        date: String(x?.r?.date || '').slice(0, 10),
        type: String(x?.r?.type || ''),
        name: x?.r?.name != null ? String(x.r.name) : null,
        category: x?.cat,
        workload_planned: safeNum(x?.r?.workload_planned),
        skip_reason: x?.r?.skip_reason ?? null,
        skip_note: x?.r?.skip_note ?? null,
      }))
      .filter((x: any) => Boolean(x.planned_id));

    const rpeFromWorkout = (w: any): number | null => {
      let meta: any = {};
      try {
        meta = typeof (w as any)?.workout_metadata === 'string' ? JSON.parse((w as any).workout_metadata) : ((w as any)?.workout_metadata || {});
      } catch {}
      const v = meta?.session_rpe ?? (w as any)?.session_rpe ?? (w as any)?.rpe ?? null;
      const n = safeNum(v);
      return n != null && n >= 1 && n <= 10 ? n : null;
    };
    const feelingFromWorkout = (w: any): string | null => {
      const f = String((w as any)?.feeling || '').toLowerCase();
      return ['great', 'good', 'ok', 'tired', 'exhausted'].includes(f) ? f : null;
    };
    const workoutSignalsRecovery = (w: any): boolean => {
      const rpe = rpeFromWorkout(w);
      const feeling = feelingFromWorkout(w);
      return (rpe != null && rpe <= 4) || (feeling != null && ['great', 'good', 'ok'].includes(feeling));
    };

    const extraSessionsDetails = (Array.isArray(weekWorkouts) ? weekWorkouts : [])
      .filter((w: any) => String(w?.workout_status || '').toLowerCase() === 'completed')
      .filter((w: any) => w?.planned_id == null || String(w?.planned_id || '') === '')
      .map((w: any) => ({
        workout_id: String(w?.id || ''),
        date: String(w?.date || '').slice(0, 10),
        type: String(w?.type || ''),
        name: w?.name != null ? String(w.name) : null,
        workload_actual: safeNum((w as any)?.workload_actual),
        rpe: rpeFromWorkout(w),
        feeling: feelingFromWorkout(w),
        signals_recovery: workoutSignalsRecovery(w),
      }))
      .filter((x: any) => Boolean(x.workout_id));

    const keySessionsLinked = keySessionsPlannedEffective.length - keySessionGapsDetails.length;
    const keySessionsGaps = keySessionGapsDetails.length;
    const extraSessions = extraSessionsDetails.length;

    const daysInWindow = Math.max(
      1,
      Math.round((new Date(asOfDate).getTime() - new Date(weekStartDate).getTime()) / (24 * 3600 * 1000)) + 1
    );
    const daysWithActivity = new Set<string>(
      (Array.isArray(weekWorkouts) ? weekWorkouts : [])
        .filter((w: any) => String(w?.workout_status || '').toLowerCase() === 'completed')
        .map((w: any) => String((w as any)?.__local_date || (w as any)?.date || '').slice(0, 10))
        .filter(Boolean)
    ).size;
    const coverageRatio = Math.max(0, Math.min(1, daysWithActivity / daysInWindow));

    const parseJson = (v: any) => {
      try { return typeof v === 'string' ? JSON.parse(v) : (v || null); } catch { return null; }
    };

    const executionScoreFromWorkout = (wAny: any): number | null => {
      try {
        // Prefer the analyzer's adherence score (same number the Performance chip shows).
        // This accounts for terrain, weather, duration, and plan context — so the weekly
        // "run quality" signal agrees with what each individual run tells the athlete.
        const wa = parseJson((wAny as any)?.workout_analysis);

        // 1. analyze-running-workout → performance.execution_adherence (plan-aware adherence)
        const perf = safeNum(wa?.performance?.execution_adherence);
        if (perf != null && perf > 0) return Math.max(0, Math.min(100, perf));

        // 2. session_state_v1.glance.execution_score (same lineage, set by analyzer)
        const glance = safeNum(wa?.session_state_v1?.glance?.execution_score);
        if (glance != null && glance > 0) return Math.max(0, Math.min(100, glance));

        // 3. Legacy fallback: computed.overall.execution_score (raw aerobic decoupling).
        //    Only used for workouts analyzed before the adherence pipeline existed.
        const c = parseJson((wAny as any)?.computed);
        const s1 = safeNum(c?.overall?.execution_score);
        if (s1 != null) return Math.max(0, Math.min(100, s1));

        return null;
      } catch {
        return null;
      }
    };

    const strengthFocusFromWorkout = (wAny: any): 'upper' | 'lower' | 'full' | 'unknown' => {
      try {
        const exRaw = (wAny as any)?.strength_exercises;
        const exercises = Array.isArray(exRaw) ? exRaw : (typeof exRaw === 'string' ? (parseJson(exRaw) || []) : []);
        if (!Array.isArray(exercises) || exercises.length === 0) {
          const name = String((wAny as any)?.name || '').toLowerCase();
          if (/upper|push|pull|chest|back|shoulder|arm|bench|row|press(?!.*leg)/i.test(name)) return 'upper';
          if (/lower|leg|squat|deadlift|lunge|hip|glute|calf/i.test(name)) return 'lower';
          if (/full|total/i.test(name)) return 'full';
          return 'unknown';
        }
        // ONE FACT (coexist hardening 2026-07-03): State + the cards derive "which focus" from the SAME
        // shared classifyStrengthFocus the per-workout carryover cards use — not a private ratio heuristic
        // that agrees by luck. Presence-based (any lower + any upper → full) replaces the old ratio rule.
        return classifyStrengthFocus(exercises.map((e: any) => String(e?.name || '')));
      } catch { return 'unknown'; }
    };

    const hrWorkoutTypeFromWorkout = (wAny: any): string | null => {
      try {
        const wa = parseJson((wAny as any)?.workout_analysis) || {};
        const hr = wa?.granular_analysis?.heart_rate_analysis || {};
        const wt = hr?.workout_type;
        if (wt == null) return null;
        const s = String(wt).toLowerCase();
        return s || null;
      } catch {
        return null;
      }
    };

    const driftBpmFromWorkout = (wAny: any): number | null => {
      try {
        // Prefer analyzer's terrain/weather-adjusted drift (same value the narrative references).
        // Falls back through older storage paths for pre-migration workouts.
        const wa = parseJson(wAny?.workout_analysis) || {};
        const v =
          wa?.granular_analysis?.heart_rate_analysis?.hr_drift_bpm ??
          wa?.heart_rate_summary?.drift_bpm ??
          wa?.detailed_analysis?.workout_summary?.hr_drift ??
          wa?.heart_rate_analysis?.hr_drift_bpm ??
          null;
        const n = safeNum(v);
        return n;
      } catch {
        return null;
      }
    };

    const sessionRpeFromWorkout = (wAny: any): number | null => {
      // Prefer unified workout_metadata.session_rpe, then workouts.rpe if present.
      try {
        const meta = parseJson((wAny as any)?.workout_metadata) || {};
        const v = meta?.session_rpe ?? (wAny as any)?.session_rpe ?? (wAny as any)?.rpe ?? null;
        const n = safeNum(v);
        if (n == null) return null;
        if (n < 1 || n > 10) return null;
        return n;
      } catch {
        return null;
      }
    };

    const avgStrengthRirFromWorkout = (wAny: any): number | null => {
      try {
        const exRaw = (wAny as any)?.strength_exercises;
        const ex = Array.isArray(exRaw) ? exRaw : (typeof exRaw === 'string' ? (parseJson(exRaw) || []) : []);
        if (!Array.isArray(ex) || ex.length === 0) return null;
        const rirs: number[] = [];
        for (const e of ex) {
          const sets = Array.isArray(e?.sets) ? e.sets : [];
          for (const s of sets) {
            const r = safeNum((s as any)?.rir);
            if (r != null && r >= 0 && r <= 10) rirs.push(r);
          }
        }
        if (rirs.length === 0) return null;
        return Math.round((rirs.reduce((a, b) => a + b, 0) / rirs.length) * 10) / 10;
      } catch {
        return null;
      }
    };
    const executionScores: number[] = [];
    const driftBpms: number[] = [];
    const driftDates: string[] = []; // newest-session-date tracking for the BODY hr_drift "as of" stamp
    for (const w of Array.isArray(weekWorkouts) ? weekWorkouts : []) {
      if (String(w?.workout_status || '').toLowerCase() !== 'completed') continue;
      const pid = w?.planned_id != null ? String(w.planned_id) : '';
      if (pid && plannedIds.has(pid)) {
        const s = executionScoreFromWorkout(w as any);
        if (s != null) executionScores.push(s);
        // Aerobic response: HR drift for steady aerobic runs only (avoid intervals/fartlek noise)
        if (String((w as any)?.type || '').toLowerCase() === 'run') {
          if (hrWorkoutTypeFromWorkout(w as any) === 'steady_state') {
            const d = driftBpmFromWorkout(w as any);
            if (d != null) { driftBpms.push(d); driftDates.push(String((w as any)?.date || '')); }
          }
        }
        continue;
      }
      // Fallback: if workout_analysis has a numeric execution adherence, use it.
      const wa = parseJson((w as any).workout_analysis);
      // We intentionally do NOT include unplanned workouts in execution here
      // because "execution" is meant to reflect compliance to planned intent.
      if (String((w as any)?.type || '').toLowerCase() === 'run') {
        if (hrWorkoutTypeFromWorkout(w as any) === 'steady_state') {
          const d = driftBpmFromWorkout(w as any);
          if (d != null) { driftBpms.push(d); driftDates.push(String((w as any)?.date || '')); }
        }
      }
    }
    const avgExecutionScore =
      executionScores.length > 0 ? Math.round(executionScores.reduce((a, b) => a + b, 0) / executionScores.length) : null;

    // Subjective + structural response windows (last 7 days)
    const rpeStart = addDaysISO(asOfDate, -6);
    const { data: recentWorkouts, error: rwErr } = await supabase
      .from('workouts')
      .select('id,date,type,workout_status,workout_metadata,rpe,session_rpe,strength_exercises,workout_analysis,planned_id')
      .eq('user_id', userId)
      .gte('date', rpeStart)
      .lte('date', asOfDate);
    if (rwErr) throw rwErr;

    const rpes: number[] = [];
    const rpeSessions: { date: string; type: string; rpe: number }[] = []; // Why-driver: which session moved the week
    const rirs: number[] = [];
    for (const w of Array.isArray(recentWorkouts) ? recentWorkouts : []) {
      if (String(w?.workout_status || '').toLowerCase() !== 'completed') continue;
      const r = sessionRpeFromWorkout(w as any);
      if (r != null) { rpes.push(r); rpeSessions.push({ date: String((w as any).date || ''), type: String((w as any).type || ''), rpe: r }); }
      if (String((w as any)?.type || '').toLowerCase() === 'strength') {
        const rirAvg = avgStrengthRirFromWorkout(w as any);
        if (rirAvg != null) rirs.push(rirAvg);
      }
    }
    const avgSessionRpe7d = rpes.length ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10 : null;
    const avgStrengthRir7d = rirs.length ? Math.round((rirs.reduce((a, b) => a + b, 0) / rirs.length) * 10) / 10 : null;
    const hrDriftAvg = driftBpms.length ? Math.round((driftBpms.reduce((a, b) => a + b, 0) / driftBpms.length) * 10) / 10 : null;
    // Newest-session date behind each rolling BODY read → the "as of {date}" freshness stamp.
    const maxDate = (ds: string[]): string | null => { const v = ds.filter(Boolean); return v.length ? v.reduce((a, b) => (a > b ? a : b)) : null; };
    const hrDriftNewestDate = maxDate(driftDates);
    const rpeNewestDate = maxDate(rpeSessions.map((s) => s.date));

    // HR drift series — last 6 steady-state runs with a drift reading, for sparkline
    const hr_drift_series: Array<{ date: string; drift_bpm: number }> = (() => {
      const out: Array<{ date: string; drift_bpm: number }> = [];
      const sorted = [...(Array.isArray(recentWorkouts) ? recentWorkouts : [])]
        .filter((w: any) => String(w?.workout_status || '').toLowerCase() === 'completed')
        .filter((w: any) => String(w?.type || '').toLowerCase() === 'run')
        .sort((a: any, b: any) => String(a?.date || '').localeCompare(String(b?.date || '')));
      for (const w of sorted) {
        if (hrWorkoutTypeFromWorkout(w as any) !== 'steady_state') continue;
        const d = driftBpmFromWorkout(w as any);
        if (d != null) out.push({ date: String((w as any)?.date || ''), drift_bpm: d });
      }
      return out.slice(-6);
    })();

    // Run session type classification (7d window)
    type RunSessionType = 'easy' | 'z2' | 'long' | 'tempo' | 'progressive' | 'fartlek' | 'intervals' | 'hills' | 'unknown';
    const runTypeFromWorkout = (wAny: any): RunSessionType => {
      try {
        const wa = parseJson((wAny as any)?.workout_analysis) || {};
        const hr = wa?.granular_analysis?.heart_rate_analysis || {};
        const wt = String(hr?.workout_type || '').toLowerCase();
        const sum = hr?.summary || {};
        const durationMin = safeNum(sum?.durationMinutes);
        const timeInZones = sum?.timeInZones || {};
        const z2Sec = safeNum(timeInZones?.z2Seconds) || 0;
        const totalSec = durationMin != null ? Math.max(1, Math.round(durationMin * 60)) : null;
        const z2Pct = totalSec != null ? (z2Sec / totalSec) * 100 : null;

        if (wt === 'intervals') return 'intervals';
        if (wt === 'hill_repeats') return 'hills';
        if (wt === 'fartlek') return 'fartlek';
        if (wt === 'tempo_finish') return 'tempo';
        if (wt === 'progressive') return 'progressive';
        if (wt === 'steady_state') {
          if (durationMin != null && durationMin >= 80) return 'long';
          if (z2Pct != null && z2Pct >= 60) return 'z2';
          return 'easy';
        }
        return 'unknown';
      } catch {
        return 'unknown';
      }
    };

    const runAgg: Record<RunSessionType, { n: number; exec: number[]; drift: number[]; z2pct: number[]; creep: number[]; decouple: number[] }> = {
      easy: { n: 0, exec: [], drift: [], z2pct: [], creep: [], decouple: [] },
      z2: { n: 0, exec: [], drift: [], z2pct: [], creep: [], decouple: [] },
      long: { n: 0, exec: [], drift: [], z2pct: [], creep: [], decouple: [] },
      tempo: { n: 0, exec: [], drift: [], z2pct: [], creep: [], decouple: [] },
      progressive: { n: 0, exec: [], drift: [], z2pct: [], creep: [], decouple: [] },
      fartlek: { n: 0, exec: [], drift: [], z2pct: [], creep: [], decouple: [] },
      intervals: { n: 0, exec: [], drift: [], z2pct: [], creep: [], decouple: [] },
      hills: { n: 0, exec: [], drift: [], z2pct: [], creep: [], decouple: [] },
      unknown: { n: 0, exec: [], drift: [], z2pct: [], creep: [], decouple: [] },
    };

    for (const w of Array.isArray(recentWorkouts) ? recentWorkouts : []) {
      if (String((w as any)?.workout_status || '').toLowerCase() !== 'completed') continue;
      if (String((w as any)?.type || '').toLowerCase() !== 'run') continue;
      const rt = runTypeFromWorkout(w as any);
      runAgg[rt].n += 1;

      const c = parseJson((w as any)?.computed);
      const ex = safeNum(c?.overall?.execution_score);
      if (ex != null) runAgg[rt].exec.push(ex);

      // Drift is only meaningful for steady/progressive/tempo finish types; don't show it for intervals/fartlek.
      const hrType = hrWorkoutTypeFromWorkout(w as any);
      if (hrType === 'steady_state' || hrType === 'progressive' || hrType === 'tempo_finish') {
        const d = driftBpmFromWorkout(w as any);
        if (d != null) runAgg[rt].drift.push(d);
      }

      try {
        const wa = parseJson((w as any)?.workout_analysis) || {};
        const hr = wa?.granular_analysis?.heart_rate_analysis || {};
        const sum = hr?.summary || {};
        const tz = sum?.timeInZones || {};
        const z2Sec = safeNum(tz?.z2Seconds);
        const durMin = safeNum(sum?.durationMinutes);
        const totalSec = durMin != null ? Math.max(1, Math.round(durMin * 60)) : null;
        if (z2Sec != null && totalSec != null) runAgg[rt].z2pct.push(Math.max(0, Math.min(100, (z2Sec / totalSec) * 100)));
        const creep = safeNum(sum?.intervalHrCreepBpm);
        if (creep != null) runAgg[rt].creep.push(creep);
        const dec = safeNum(sum?.decouplingPct);
        // D-283 (supersedes D-275's heat gate): hot runs are KEPT. This receipt used to skip them, mirroring
        // the spine substrate's exclusion — so the exclusion has to die in BOTH engines together, or they
        // diverge again (exactly the AERO-vs-PERFORMANCE fracture D-275's own follow-on was written to close).
        // The exclusion was neither field-standard nor supported by the data (81 steady runs: the heat->
        // decoupling slope's 95% CI straddles zero under every specification; hot runs read BEST). See the
        // D-283 block in `_shared/state-trend/run.ts` for the full receipts.
        if (dec != null) runAgg[rt].decouple.push(dec);
      } catch {
        // ignore
      }
    }

    const avgArr = (arr: number[], dp: number): number | null => {
      if (!arr.length) return null;
      const v = arr.reduce((a, b) => a + b, 0) / arr.length;
      const m = Math.pow(10, dp);
      return Math.round(v * m) / m;
    };

    const RUN_TYPE_LABELS: Record<string, string> = {
      easy: 'Easy', z2: 'Zone 2', long: 'Long Run', tempo: 'Tempo',
      progressive: 'Progressive', fartlek: 'Fartlek', intervals: 'Intervals', hills: 'Hills', unknown: 'Other',
    };
    // D-239 reconcile: ONE threshold set — the shared frielBand-backed decouplingLabel, not a local
    // ≤3/≤5/≤8 cutoff that disagreed with the RUN row's spine band. runAgg stays the 7d per-type receipt.
    const runEfficiency = (decouple: number | null): { label: string | null; tone: 'positive' | 'warning' | 'danger' | 'neutral' } => {
      const { label, tone } = decouplingLabel(decouple);
      return { label, tone };
    };

    /**
     * Cycling efficiency label — Tier 4 item 14 of running→cycling delta map. Mirrors
     * `runEfficiency` shape (label + tone). Cycling stores HR drift as a percentage
     * (driftPct = (lateAvgHr - earlyAvgHr) / earlyAvgHr * 100). The thresholds match
     * the cycling adherence summary's interpretation bands (analyze-cycling-workout's
     * `generateCyclingAdherenceSummary` uses the same 3% / 8% breakpoints), so the
     * coach's session-type breakdown and the per-workout debrief stay consistent.
     *
     * Bands chosen to align with running's tone semantics: positive when HR held with
     * power, warning when HR climbed beyond normal physiological drift, danger when
     * the ride was clearly aerobic-strained.
     */
    const rideEfficiency = (driftPct: number | null): { label: string | null; tone: 'positive' | 'warning' | 'danger' | 'neutral' } => {
      if (driftPct == null) return { label: null, tone: 'neutral' };
      const abs = Math.abs(driftPct);
      if (abs <= 3) return { label: 'Held power efficiently', tone: 'positive' };
      if (abs <= 5) return { label: 'Solid aerobic effort', tone: 'positive' };
      if (abs <= 8) return { label: 'HR climbed more than usual', tone: 'warning' };
      return { label: 'HR was elevated — likely aerobic strain', tone: 'danger' };
    };

    const runSessionTypes7d: NonNullable<CoachWeekContextResponseV1['run_session_types_7d']> = (Object.keys(runAgg) as RunSessionType[])
      .filter((k) => runAgg[k].n > 0)
      .map((k) => {
        const decouple = avgArr(runAgg[k].decouple, 1);
        const execScore = avgArr(runAgg[k].exec, 0);
        const isIntervalType = k === 'intervals' || k === 'hills';
        // "How your sessions went" is the EXECUTION/shape clock, not a fitness verdict. Intervals keep
        // their execution % (real adherence); steady types no longer emit a decoupling FITNESS verdict
        // here — it duplicated the PERFORMANCE row ("aerobic base needs work" said twice). Fitness lives
        // one section down. avg_decoupling_pct stays on the row as an LLM/detail receipt.
        // See docs/STATE-WEEK-EXECUTION.md.
        const eff = isIntervalType
          ? { label: execScore != null ? `${execScore}% execution` : null, tone: (execScore != null && execScore >= 85 ? 'positive' : execScore != null && execScore >= 70 ? 'warning' : 'neutral') as any }
          : { label: null as string | null, tone: 'neutral' as const };
        return {
          type: k,
          type_label: RUN_TYPE_LABELS[k] || k,
          sample_size: runAgg[k].n,
          avg_execution_score: execScore,
          avg_hr_drift_bpm: avgArr(runAgg[k].drift, 1),
          avg_z2_percent: avgArr(runAgg[k].z2pct, 0),
          avg_interval_hr_creep_bpm: avgArr(runAgg[k].creep, 1),
          avg_decoupling_pct: decouple,
          efficiency_label: eff.label,
          efficiency_tone: eff.tone,
        };
      })
      .sort((a, b) => b.sample_size - a.sample_size);

    // ── Tier 4 item 12 — cycling 7-day session-type breakdown ─────────────
    // Mirrors the running aggregation above. Type detection reads
    // workout_analysis.fact_packet_v1.facts.classified_type (the cycling-v1 taxonomy
    // at _shared/cycling-v1/types.ts:3-15 — 12 categories, richer than running's 8).
    // Aggregation pulls cycling-native signals from workout_analysis: power_adherence
    // from adherence_analysis, hr_drift_pct + intensity_factor + normalized_power
    // from fact_packet_v1.facts. efficiency_label/tone left as placeholder; item 14
    // fills them in via the cycling efficiency_factor heuristic.
    type RideSessionType =
      | 'recovery' | 'endurance' | 'endurance_long' | 'tempo' | 'sweet_spot'
      | 'threshold' | 'vo2' | 'anaerobic' | 'neuromuscular' | 'race_prep'
      | 'brick' | 'unknown';
    const RIDE_TYPE_LABELS: Record<string, string> = {
      recovery: 'Recovery', endurance: 'Endurance', endurance_long: 'Long Ride',
      tempo: 'Tempo', sweet_spot: 'Sweet Spot', threshold: 'Threshold',
      vo2: 'VO2max', anaerobic: 'Anaerobic', neuromuscular: 'Neuromuscular',
      race_prep: 'Race Prep', brick: 'Brick', unknown: 'Other',
    };
    const rideTypeFromWorkout = (wAny: any): RideSessionType => {
      try {
        const wa = parseJson((wAny as any)?.workout_analysis) || {};
        const ct = String(wa?.fact_packet_v1?.facts?.classified_type || '').toLowerCase().trim();
        const valid: Record<string, RideSessionType> = {
          recovery: 'recovery', endurance: 'endurance', endurance_long: 'endurance_long',
          tempo: 'tempo', sweet_spot: 'sweet_spot', threshold: 'threshold',
          vo2: 'vo2', anaerobic: 'anaerobic', neuromuscular: 'neuromuscular',
          race_prep: 'race_prep', brick: 'brick',
        };
        return valid[ct] ?? 'unknown';
      } catch {
        return 'unknown';
      }
    };
    const rideAgg: Record<RideSessionType, {
      n: number; exec: number[]; powerAdh: number[]; driftPct: number[];
      ifs: number[]; nps: number[];
    }> = {
      recovery: { n: 0, exec: [], powerAdh: [], driftPct: [], ifs: [], nps: [] },
      endurance: { n: 0, exec: [], powerAdh: [], driftPct: [], ifs: [], nps: [] },
      endurance_long: { n: 0, exec: [], powerAdh: [], driftPct: [], ifs: [], nps: [] },
      tempo: { n: 0, exec: [], powerAdh: [], driftPct: [], ifs: [], nps: [] },
      sweet_spot: { n: 0, exec: [], powerAdh: [], driftPct: [], ifs: [], nps: [] },
      threshold: { n: 0, exec: [], powerAdh: [], driftPct: [], ifs: [], nps: [] },
      vo2: { n: 0, exec: [], powerAdh: [], driftPct: [], ifs: [], nps: [] },
      anaerobic: { n: 0, exec: [], powerAdh: [], driftPct: [], ifs: [], nps: [] },
      neuromuscular: { n: 0, exec: [], powerAdh: [], driftPct: [], ifs: [], nps: [] },
      race_prep: { n: 0, exec: [], powerAdh: [], driftPct: [], ifs: [], nps: [] },
      brick: { n: 0, exec: [], powerAdh: [], driftPct: [], ifs: [], nps: [] },
      unknown: { n: 0, exec: [], powerAdh: [], driftPct: [], ifs: [], nps: [] },
    };
    for (const w of Array.isArray(recentWorkouts) ? recentWorkouts : []) {
      if (String((w as any)?.workout_status || '').toLowerCase() !== 'completed') continue;
      const t = String((w as any)?.type || '').toLowerCase();
      if (t !== 'ride' && t !== 'cycling' && t !== 'bike') continue;
      const rt = rideTypeFromWorkout(w as any);
      rideAgg[rt].n += 1;
      try {
        const wa = parseJson((w as any)?.workout_analysis) || {};
        const ex = safeNum(wa?.performance?.execution_score);
        if (ex != null) rideAgg[rt].exec.push(ex);
        const pa = safeNum(wa?.adherence_analysis?.power_adherence);
        if (pa != null) rideAgg[rt].powerAdh.push(pa);
        const facts = wa?.fact_packet_v1?.facts || {};
        // hr_drift_pct: cycling stores it on ride_facts (compute-facts) but the analyzer
        // also surfaces it as `hr_drift_bpm + early_avg_hr` on heart_rate_analysis. Compute
        // the % the same way analyze-cycling-workout's adherence_summary does (Tier 3 item 7).
        const hra = wa?.granular_analysis?.heart_rate_analysis || {};
        const driftBpm = safeNum(hra?.hr_drift_bpm);
        const earlyAvg = safeNum(hra?.early_avg_hr);
        // Intensity gate (D-275-bike / Q-117): a ride RIDDEN at threshold contaminates within-ride HR-drift
        // via cardiac lag, so a hard-ridden "endurance" ride mustn't inflate the steady-type durability avg.
        // SAME threshold the spine HR-at-power read uses (bikeRideIntensityAerobic) → both bike engines agree
        // on "too hard to count as aerobic." Power-targeted types already show execution %, not drift, below.
        const bf = wa?.bike_fitness_v1 || {};
        const riddenAerobic = bikeRideIntensityAerobic(safeNum(bf.w20), safeNum(bf.band_hi));
        if (driftBpm != null && earlyAvg != null && earlyAvg > 0 && riddenAerobic) {
          rideAgg[rt].driftPct.push((driftBpm / earlyAvg) * 100);
        }
        const ifv = safeNum(facts.intensity_factor);
        if (ifv != null) rideAgg[rt].ifs.push(ifv);
        const np = safeNum(facts.normalized_power);
        if (np != null) rideAgg[rt].nps.push(np);
      } catch {
        // ignore — partial data on the analysis row is normal during transition
      }
    }
    const rideSessionTypes7d: NonNullable<CoachWeekContextResponseV1['ride_session_types_7d']> = (Object.keys(rideAgg) as RideSessionType[])
      .filter((k) => rideAgg[k].n > 0)
      .map((k) => {
        const driftPct = avgArr(rideAgg[k].driftPct, 1);
        const execScore = avgArr(rideAgg[k].exec, 0);
        // Mirror running's interval-vs-steady branch: high-intensity cycling types use
        // execution score (analog to running's intervals/hills); steady-state types use
        // HR drift through `rideEfficiency`. Brick is a transition workout — drift is
        // less meaningful, treat as steady-state for consistency.
        const isPowerTargetedType =
          k === 'vo2' || k === 'threshold' || k === 'anaerobic' ||
          k === 'neuromuscular' || k === 'sweet_spot' || k === 'race_prep';
        // Mirror the run cut (docs/STATE-WEEK-EXECUTION.md): steady rides no longer emit an HR-drift
        // FITNESS verdict in "how your sessions went" — it duplicated the PERFORMANCE bike Efficiency
        // row. Power-targeted rides keep execution %; steady rides carry no verdict here. avg_hr_drift_pct
        // stays on the row as an LLM/detail receipt.
        const eff = isPowerTargetedType
          ? {
              label: execScore != null ? `${execScore}% execution` : null,
              tone: (execScore != null && execScore >= 85 ? 'positive' : execScore != null && execScore >= 70 ? 'warning' : 'neutral') as 'positive' | 'warning' | 'danger' | 'neutral',
            }
          : { label: null as string | null, tone: 'neutral' as const };
        return {
          type: k,
          type_label: RIDE_TYPE_LABELS[k] || k,
          sample_size: rideAgg[k].n,
          avg_execution_score: execScore,
          avg_power_adherence: avgArr(rideAgg[k].powerAdh, 0),
          avg_hr_drift_pct: driftPct,
          avg_intensity_factor: avgArr(rideAgg[k].ifs, 2),
          avg_normalized_power: avgArr(rideAgg[k].nps, 0),
          efficiency_label: eff.label,
          efficiency_tone: eff.tone,
        };
      })
      .sort((a, b) => b.sample_size - a.sample_size);

    // b2 (Q-149): strength session-type breakdown — the plan-primary key-session read. Renderer of the
    // strength analyzer's per-session verdict (session_state_v1.glance.execution_score; null for 1RM tests
    // at the source). Same recentWorkouts 7d window as run/ride above. No parallel grading (Law-5).
    const strengthSessionTypes7d = buildStrengthSessionTypes7d(Array.isArray(recentWorkouts) ? recentWorkouts : []);
    // SWIM 7d (Q-038-safe): planned → % achieved, unplanned → distance covered — never pace. Feeds the
    // State "how your sessions went" SWIM row so swim is finally visible (was hidden defensively).
    const swimSessions7d = buildSwimSessions7d(Array.isArray(recentWorkouts) ? recentWorkouts : []);

    const linkingConfidence: CoachWeekContextResponseV1['reaction']['linking_confidence'] = (() => {
      const base =
        0.25 +
        0.35 * Math.min(1, coverageRatio / 0.75) +
        0.25 * Math.min(1, keySessionsPlanned.length / 3) +
        0.15 * Math.min(1, executionScores.length / 4);
      const score = Math.max(0.15, Math.min(0.98, base));
      const label = score >= 0.8 ? 'high' : score >= 0.55 ? 'medium' : 'low';
      const explain = `Based on ${daysWithActivity}/${daysInWindow} days with activity and ${executionScores.length} plan-linked execution samples.`;
      return { label, score: Number(score.toFixed(2)), explain };
    })();

    // Key-quality extras: only long/tempo/intervals (not easy/z2) — use for Key sessions display
    const keyQualityExtrasCount = (() => {
      const ww = Array.isArray(weekWorkouts) ? weekWorkouts : [];
      return extraSessionsDetails.filter((e) => {
        const w = ww.find((x: any) => String(x?.id) === e.workout_id);
        if (!w) return false;
        const t = String((w as any)?.type || '').toLowerCase();
        if (t === 'run' || t === 'running') {
          const rt = runTypeFromWorkout(w as any);
          return ['long', 'tempo', 'intervals', 'hills', 'progressive', 'fartlek'].includes(rt);
        }
        return false;
      }).length;
    })();

    // Recovery-signaled extras: user explicitly signaled easy (RPE ≤4 or feeling great/good/ok)
    const recoverySignaledExtrasCount = extraSessionsDetails.filter((e) => e.signals_recovery).length;

    const reaction: CoachWeekContextResponseV1['reaction'] = {
      key_sessions_planned: keySessionsPlannedEffective.length,
      key_sessions_completed: keySessionsCompleted.length,
      key_sessions_completion_ratio: keySessionsCompletionRatio,
      key_sessions_linked: keySessionsLinked,
      key_sessions_gaps: keySessionsGaps,
      extra_sessions: extraSessions,
      key_quality_extras: keyQualityExtrasCount,
      recovery_signaled_extras: recoverySignaledExtrasCount,
      key_session_gaps_details: keySessionGapsDetails.slice(0, 10),
      extra_sessions_details: extraSessionsDetails.slice(0, 10),
      linking_confidence: linkingConfidence,
      avg_execution_score: avgExecutionScore,
      execution_sample_size: executionScores.length,
      hr_drift_avg_bpm: hrDriftAvg,
      hr_drift_sample_size: driftBpms.length,
      avg_session_rpe_7d: avgSessionRpe7d,
      rpe_sample_size_7d: rpes.length,
      avg_strength_rir_7d: avgStrengthRir7d,
      rir_sample_size_7d: rirs.length,
    };

    // =========================================================================
    // Baselines + 28d personal norms (to avoid generic thresholds)
    // Baselines come from ArcContext — a single source of athlete truth shared with
    // generate-training-context, arc-setup-chat, and create-goal-and-materialize-plan.
    // =========================================================================
    const userUnits = String(arc.units || 'imperial').toLowerCase();
    const isImperial = userUnits !== 'metric';
    const wUnit = isImperial ? 'lb' : 'kg';

    const learnedFitness = arc.learned_fitness as Record<string, any> | null;
    const learningStatus = learnedFitness?.learning_status ? String(learnedFitness.learning_status) : null;

    // 28d norms (use completed workouts only)
    const normStart = addDaysISO(asOfDate, -27);
    const { data: normWorkouts, error: nwErr } = await supabase
      .from('workouts')
      .select('id,date,type,workout_status,planned_id,computed,workout_analysis,workout_metadata,rpe,session_rpe,strength_exercises')
      .eq('user_id', userId)
      .gte('date', normStart)
      .lte('date', asOfDate);
    if (nwErr) throw nwErr;

    const normExecution: number[] = [];
    const normDrift: number[] = [];
    const normRpe: number[] = [];
    const normRir: number[] = [];
    for (const w of Array.isArray(normWorkouts) ? normWorkouts : []) {
      if (String((w as any)?.workout_status || '').toLowerCase() !== 'completed') continue;

      // execution score
      // Baseline execution should match the planned-execution definition.
      if ((w as any)?.planned_id != null) {
        const ex = executionScoreFromWorkout(w as any);
        if (ex != null) normExecution.push(ex);
      }

      // HR drift: steady aerobic runs only (TrainingPeaks-style)
      if (String((w as any)?.type || '').toLowerCase() === 'run' && hrWorkoutTypeFromWorkout(w as any) === 'steady_state') {
        const d = driftBpmFromWorkout(w as any);
        if (d != null) normDrift.push(d);
      }

      // session RPE
      const srpe = sessionRpeFromWorkout(w as any);
      if (srpe != null) normRpe.push(srpe);

      // strength RIR
      if (String((w as any)?.type || '').toLowerCase() === 'strength') {
        const r = avgStrengthRirFromWorkout(w as any);
        if (r != null) normRir.push(r);
      }
    }

    const avg = (arr: number[], dp: number = 1): number | null => {
      if (!arr.length) return null;
      const v = arr.reduce((a, b) => a + b, 0) / arr.length;
      const m = Math.pow(10, dp);
      return Math.round(v * m) / m;
    };

    const norms28d = {
      hr_drift_avg_bpm: avg(normDrift, 1),
      hr_drift_sample_size: normDrift.length,
      session_rpe_avg: avg(normRpe, 1),
      session_rpe_sample_size: normRpe.length,
      strength_rir_avg: avg(normRir, 1),
      strength_rir_sample_size: normRir.length,
      execution_score_avg: avg(normExecution, 0),
      execution_score_sample_size: normExecution.length,
    };

    const dismissed = arc.dismissed_suggestions as Record<string, any> | null;
    const dismissedDrift = (dismissed?.baseline_drift as Record<string, string>) || {};

    const baselines: CoachWeekContextResponseV1['baselines'] = {
      performance_numbers: arc.performance_numbers || null,
      effort_paces: arc.effort_paces || null,
      learned_fitness: learnedFitness || null,
      learning_status: learningStatus,
      norms_28d: norms28d,
      dismissed_suggestions: dismissed,
    };

    // Baseline drift suggestions: learned 1RM > baseline by 5%+, medium/high confidence.
    // Plan-aware guardrails:
    // - Hide during transition window, recovery/taper intent, or near-race window.
    // - Require meaningful sample count so suggestions are stable and goal-relevant.
    const perf = (arc.performance_numbers || {}) as Record<string, any>;
    const strength = learnedFitness?.strength_1rms || {};
    const raceDateIso = String(
      planConfig?.race_date ||
      planConfig?.event_date ||
      planConfig?.target_date ||
      '',
    ).slice(0, 10);
    const daysToRace = (() => {
      if (!raceDateIso) return null;
      try {
        const raceMs = parseISODateOnly(raceDateIso).getTime();
        const asOfMs = parseISODateOnly(asOfDate).getTime();
        return Math.floor((raceMs - asOfMs) / (24 * 60 * 60 * 1000));
      } catch {
        return null;
      }
    })();
    const shouldSuppressBaselineDriftSuggestions =
      isPlanTransitionPeriod ||
      weekIntent === 'recovery' ||
      weekIntent === 'taper' ||
      (daysToRace != null && daysToRace <= 28);

    const driftPairs: Array<{ lift: string; label: string; baseline: number; learned: number }> = [
      { lift: 'squat', label: 'Squat', baseline: Number(perf?.squat), learned: Number(strength?.squat?.value) },
      { lift: 'bench_press', label: 'Bench press', baseline: Number(perf?.bench), learned: Number(strength?.bench_press?.value) },
      { lift: 'deadlift', label: 'Deadlift', baseline: Number(perf?.deadlift), learned: Number(strength?.deadlift?.value) },
      { lift: 'overhead_press', label: 'Overhead press', baseline: Number(perf?.overheadPress1RM ?? perf?.ohp ?? perf?.overhead), learned: Number(strength?.overhead_press?.value) },
    ];
    const today = asOfDate;
    const baseline_drift_suggestions: Array<{ lift: string; label: string; baseline: number; learned: number; basis: string }> = [];
    if (!shouldSuppressBaselineDriftSuggestions) {
      for (const p of driftPairs) {
        if (!Number.isFinite(p.baseline) || p.baseline <= 0) continue;
        // D-231: the divergence decision is now the ONE shared capacity gate (typed-anchored baseline,
        // learned computed, ≥5% ∧ ≥3 samples ∧ ≥medium confidence ∧ fresh) — resolveStrengthCapacity's
        // `.suggestion` — instead of a parallel hand-rolled `floor(learned/5)*5 ≥ baseline×1.05`. This is
        // the same "learned surfaces drift as a SUGGESTION, never a verdict" object the resolver owns, so
        // suggestion and verdict can no longer disagree. Plan-aware suppression, the 30-day dismissal, and
        // the ≥4-session surface floor are preserved; the shared gate also adds a freshness bound (≤6wk).
        const cap = resolveStrengthCapacity({ key: p.lift, typed: perf, learnedStrength1rms: strength, asOf: today });
        const sug = cap.suggestion;
        if (!sug || sug.divergencePct <= 0) continue; // upward drift only (learned above typed)
        if (sug.sampleCount < 4) continue;             // preserve the existing ≥4-session surface floor
        const dismissedAt = dismissedDrift[p.lift];
        if (dismissedAt) {
          const d = new Date(dismissedAt).getTime();
          const t = new Date(today).getTime();
          if (t - d < 30 * 24 * 60 * 60 * 1000) continue;
        }
        const rounded = Math.floor(sug.computed / 5) * 5;
        if (rounded < p.baseline) continue;            // display floor: rounded-down learned still above typed
        baseline_drift_suggestions.push({
          lift: p.lift,
          label: p.label,
          baseline: p.baseline,
          learned: rounded,
          basis: `Estimated 1RM from ${sug.sampleCount} session${sug.sampleCount !== 1 ? 's' : ''} (${sug.confidence} confidence)`,
        });
      }
    }

    // Rolling windows (residual context)
    const acuteStart = addDaysISO(asOfDate, -6);
    const chronicStart = addDaysISO(asOfDate, -27);

    const { data: rolling, error: rErr } = await supabase
      .from('workouts')
      .select('id,workload_actual,date,workout_status,type,name,planned_id,workout_metadata,avg_power,avg_heart_rate,avg_pace,sensor_data')
      .eq('user_id', userId)
      .gte('date', chronicStart)
      .lte('date', asOfDate);
    if (rErr) throw rErr;

    const completedRolling = (rolling || []).filter((r: any) => String(r?.workout_status || '').toLowerCase() === 'completed');
    const acute7Rows = completedRolling.filter((r: any) => String(r?.date) >= acuteStart);
    const acute7Load = acute7Rows.reduce((sum: number, r: any) => sum + (safeNum(r?.workload_actual) || 0), 0);
    const chronic28Load = completedRolling.reduce((sum: number, r: any) => sum + (safeNum(r?.workload_actual) || 0), 0);

    // D-237 Stage 2: does a meaningful fraction of the window LOAD rest on a low-trust
    // estimate (default intensity / assumed resting HR)? If so the load receipt discloses it.
    // Rows without a workload_method (pre-Stage-1 history) read as measured — the disclosure
    // is forward-looking and fills in as flagged rows accumulate / are backfilled.
    const loadDisclosureRows: DisclosureRow[] = completedRolling.map((r: any) => ({
      date: String(r?.date),
      workload: safeNum(r?.workload_actual),
      lowTrust: isLowTrustWorkload(r?.workout_metadata?.workload_method),
    }));
    const loadEstimatedDisclosure = computeEstimatedLoadDisclosure(loadDisclosureRows, { asOfDate });
    const loadEstimatedText = loadEstimatedDisclosure.disclose
      ? `Load ~${loadEstimatedDisclosure.chronicPct}% estimated — ${loadEstimatedDisclosure.estimatedCount} recent workout${loadEstimatedDisclosure.estimatedCount === 1 ? '' : 's'} without HR/power.`
      : null;

    // Daily load for sparkline — sum workload_actual per day over the last 7 days
    // dominant_type = whichever discipline contributed most load points that day
    const _normType = (t: any): string => {
      const s = String(t || '').toLowerCase();
      if (!s) return 'other';
      if (s === 'brick' || s.startsWith('brick_') || s.endsWith('_brick')) return 'brick';
      if (s.includes('run')) return 'run';
      if (s.includes('bike') || s.includes('ride') || s.includes('cycl')) return 'bike';
      if (s.includes('swim')) return 'swim';
      if (s.includes('strength')) return 'strength';
      if (s.includes('mobility') || s === 'pt') return 'mobility';
      return s;
    };
    const daily_load_7d: Array<{ date: string; load: number; dominant_type: string; by_type: Array<{ type: string; load: number }> }> = (() => {
      const byDate = new Map<string, number>();
      const byDateType = new Map<string, Map<string, number>>();
      for (let i = 6; i >= 0; i--) {
        const d = addDaysISO(asOfDate, -i);
        byDate.set(d, 0);
        byDateType.set(d, new Map());
      }
      for (const r of acute7Rows) {
        const d = String(r?.date || '');
        if (!byDate.has(d)) continue;
        const load = safeNum(r?.workload_actual) || 0;
        byDate.set(d, (byDate.get(d) || 0) + load);
        const typ = _normType(r?.type);
        const typeMap = byDateType.get(d)!;
        typeMap.set(typ, (typeMap.get(typ) || 0) + load);
      }
      return [...byDate.entries()].map(([date, load]) => {
        const typeMap = byDateType.get(date)!;
        let dominant_type = 'none';
        const by_type = [...typeMap.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([type, load]) => ({ type, load }));
        if (by_type.length > 0) {
          dominant_type = by_type[0].type;
        }
        return { date, load, dominant_type, by_type };
      });
    })();

    // ── Per-discipline profiles ─────────────────────────────────────────
    type DisciplineMaturity = 'building' | 'learning' | 'established';
    type DisciplineProfile = {
      discipline: string;
      maturity: DisciplineMaturity;
      sessions_28d: number;
      sessions_7d: number;
      norms: {
        execution_avg: number | null;
        execution_samples: number;
        rpe_avg: number | null;
        rpe_samples: number;
        hr_drift_avg: number | null;
        hr_drift_samples: number;
        rir_avg: number | null;
        rir_samples: number;
      };
      acwr: number | null;
      acute7_load: number;
      chronic28_load: number;
    };

    const disciplineProfiles: DisciplineProfile[] = (() => {
      const completedNorm = (Array.isArray(normWorkouts) ? normWorkouts : [])
        .filter((w: any) => String(w?.workout_status || '').toLowerCase() === 'completed');
      const byDisc = new Map<string, any[]>();
      for (const w of completedNorm) {
        const d = _normType((w as any)?.type);
        if (d === 'other' || d === 'mobility') continue;
        if (!byDisc.has(d)) byDisc.set(d, []);
        byDisc.get(d)!.push(w);
      }

      return Array.from(byDisc.entries()).map(([disc, workouts]) => {
        const sessions28d = workouts.length;
        const sessions7d = workouts.filter((w: any) => String(w?.date || '') >= acuteStart).length;
        const maturity: DisciplineMaturity =
          sessions28d <= 2 ? 'building' : sessions28d <= 6 ? 'learning' : 'established';

        const execScores: number[] = [];
        const rpeScores: number[] = [];
        const driftScores: number[] = [];
        const rirScores: number[] = [];
        for (const w of workouts) {
          if ((w as any)?.planned_id != null) {
            const ex = executionScoreFromWorkout(w as any);
            if (ex != null) execScores.push(ex);
          }
          const srpe = sessionRpeFromWorkout(w as any);
          if (srpe != null) rpeScores.push(srpe);
          if (disc === 'run' && hrWorkoutTypeFromWorkout(w as any) === 'steady_state') {
            const d = driftBpmFromWorkout(w as any);
            if (d != null) driftScores.push(d);
          }
          if (disc === 'strength') {
            const r = avgStrengthRirFromWorkout(w as any);
            if (r != null) rirScores.push(r);
          }
        }

        const acute = acute7Rows
          .filter((r: any) => _normType((r as any)?.type) === disc)
          .reduce((s: number, r: any) => s + (safeNum(r?.workload_actual) || 0), 0);
        const chronic = completedRolling
          .filter((r: any) => _normType((r as any)?.type) === disc)
          .reduce((s: number, r: any) => s + (safeNum(r?.workload_actual) || 0), 0);
        const discAcwr = chronic > 0 ? (acute / 7) / (chronic / 28) : null;

        return {
          discipline: disc,
          maturity,
          sessions_28d: sessions28d,
          sessions_7d: sessions7d,
          norms: {
            execution_avg: avg(execScores, 0),
            execution_samples: execScores.length,
            rpe_avg: avg(rpeScores, 1),
            rpe_samples: rpeScores.length,
            hr_drift_avg: avg(driftScores, 1),
            hr_drift_samples: driftScores.length,
            rir_avg: avg(rirScores, 1),
            rir_samples: rirScores.length,
          },
          acwr: discAcwr,
          acute7_load: acute,
          chronic28_load: chronic,
        };
      });
    })();

    // Running- and cycling-weighted ACWR via the shared authority (D-236).
    // Same coupled 7/28 window and workout_actual source as the total ACWR
    // above — the ONLY difference is the discipline weight hook, so both are one
    // computeAcwr call with a weightFn instead of two hand-rolled formulas.
    //
    // chronicLoadFloor: 0 preserves the pre-D-236 `weightedChronic > 0` gate.
    // The CHRONIC_LOAD_FLOOR (500) is calibrated for RAW total load and is
    // applied to the total ACWR below; it would over-null on discounted
    // (weighted) load, so the weighted variants intentionally keep the >0 gate.
    const acwrRollingRows: LoadRow[] = completedRolling.map((r: any) => ({
      date: String(r?.date),
      workload: safeNum(r?.workload_actual),
      type: r?.type,
      name: r?.name,
    }));
    // .ratioRaw (unrounded) preserves the old float exactly — runningAcwr feeds
    // a `< 0.85` taper gate where 2-decimal rounding could flip the boundary.
    const runningAcwr = computeAcwr(acwrRollingRows, {
      asOfDate,
      window: { includeAsOfDate: true },
      chronicLoadFloor: 0,
      weightFn: (t, n) => getRunningFatigueWeight({ type: String(t || ''), name: String(n || '') }),
    }).ratioRaw;
    const cyclingAcwr = computeAcwr(acwrRollingRows, {
      asOfDate,
      window: { includeAsOfDate: true },
      chronicLoadFloor: 0,
      weightFn: (t, n) => getCyclingFatigueWeight({ type: String(t || ''), name: String(n || '') }),
    }).ratioRaw;

    // D-263 build-step 3: per-domain load (strength / hard_cardio / easy_cardio),
    // an INPUT to the Q-140 coherence path (off-plan banner). EVERY completed row
    // maps to a SliceSession — a missing power/HR/pace signal leaves those fields
    // null so classifySession cascades to sRPE (bin_signal 'srpe'), the row is NEVER
    // dropped (pin 3). FTP/LTHR from baselines; absent → HR/power bins fall to sRPE too.
    // FTP fracture #2 fix: route through the SINGLE resolver (learned-first, ≥medium confidence). This was a
    // LOCAL manual-first fork — the opposite precedence from resolveCurrentFtp — so per-domain load bins used a
    // different FTP than compute-facts/the analyzer. Now all cycling FTP reads agree. No-learned athlete → typed,
    // unchanged. Absent → HR/power bins still cascade to sRPE (pin 3), so null is safe.
    const ftpForBins = resolveCurrentFtp({ learned_fitness: learnedFitness, performance_numbers: arc.performance_numbers } as any)?.value ?? null;
    const lthrForBins = Number.isFinite(Number((learnedFitness as any)?.run_threshold_hr?.value))
      ? Number((learnedFitness as any).run_threshold_hr.value) : null;
    const perDomainSessions: SliceSession[] = completedRolling.map((r: any) => ({
      date: String(r?.date),
      type: String(r?.type || ''),
      workload: safeNum(r?.workload_actual),
      avgPower: r?.avg_power ?? null,   // null when the row lacks the signal → sRPE cascade, not a drop
      avgHr: r?.avg_heart_rate ?? null,
      avgPace: r?.avg_pace ?? null,
      ftp: ftpForBins,
      thresholdHr: lthrForBins,
      samples: Array.isArray(r?.sensor_data?.samples) ? r.sensor_data.samples : null,
    }));
    const perDomain = computePerDomainLoad(perDomainSessions, { asOfDate });

    // ── Banister fitness/fatigue/form — SIBLING signal, EVALUATION-ONLY (drives nothing) ──
    // Separate 84-day fetch of the SAME workload_actual column (D-264 single source; the 28d
    // `rolling` window is too short for a 42-day fitness constant). Emitted for observation;
    // never fed to the reconciler verdict. THE LAW holds. (Later: persist a running total
    // instead of re-fetching, IF this signal earns a real role — not now.)
    const ffStart = addDaysISO(asOfDate, -83);
    const { data: ffRows } = await supabase
      .from('workouts')
      .select('date, workload_actual, workout_status')
      .eq('user_id', userId)
      .gte('date', ffStart)
      .lte('date', asOfDate);
    const ffLoadRows: LoadRow[] = (ffRows || [])
      .filter((r: any) => String(r?.workout_status || '').toLowerCase() === 'completed')
      .map((r: any) => ({ date: String(r?.date), workload: r?.workload_actual }));
    const fitnessFatigue = computeFitnessFatigue(ffLoadRows, { asOfDate });

    // =========================================================================
    // Unified Response Model (new: shared with block view)
    // =========================================================================
    const responseModelSignals: WeeklySignalInputs = {
      hr_drift_avg_bpm: reaction.hr_drift_avg_bpm,
      hr_drift_sample_size: reaction.hr_drift_sample_size,
      avg_execution_score: reaction.avg_execution_score,
      execution_sample_size: reaction.execution_sample_size,
      avg_session_rpe_7d: reaction.avg_session_rpe_7d,
      rpe_sample_size_7d: reaction.rpe_sample_size_7d,
      avg_strength_rir_7d: reaction.avg_strength_rir_7d,
      rir_sample_size_7d: reaction.rir_sample_size_7d,
      cardiac_efficiency_current: null,
      cardiac_efficiency_sample_size: 0,
      rpe_newest_date: rpeNewestDate,
      hr_drift_newest_date: hrDriftNewestDate,
    };

    const responseModelNorms: BaselineNorms = {
      hr_drift_avg_bpm: norms28d.hr_drift_avg_bpm,
      hr_drift_sample_size: norms28d.hr_drift_sample_size,
      session_rpe_avg: norms28d.session_rpe_avg,
      session_rpe_sample_size: norms28d.session_rpe_sample_size,
      strength_rir_avg: norms28d.strength_rir_avg,
      strength_rir_sample_size: norms28d.strength_rir_sample_size,
      execution_score_avg: norms28d.execution_score_avg,
      execution_score_sample_size: norms28d.execution_score_sample_size,
      cardiac_efficiency_avg: null,
      cardiac_efficiency_sample_size: 0,
    };

    // Per-lift RIR from workout strength_exercises (7d + 28d)
    const perLiftRir = (() => {
      const rirByLift7d = new Map<string, number[]>();
      const rirByLift28d = new Map<string, number[]>();
      const bestWeightByLift = new Map<string, number>();
      const lastDateByLift = new Map<string, string>(); // as-of: newest session date per lift

      const extractLiftRir = (workouts: any[], target: Map<string, number[]>) => {
        for (const w of workouts) {
          if (String(w?.workout_status || '').toLowerCase() !== 'completed') continue;
          if (String(w?.type || '').toLowerCase() !== 'strength') continue;
          const exRaw = (w as any)?.strength_exercises;
          const exArr = Array.isArray(exRaw) ? exRaw : (typeof exRaw === 'string' ? (() => { try { return JSON.parse(exRaw); } catch { return []; } })() : []);
          if (!Array.isArray(exArr)) continue;
          for (const ex of exArr) {
            const canon = canonicalize(String(ex?.name || ''));
            if (!canon || canon === 'unknown') continue;
            const wDate = String((w as any)?.date || '');
            if (wDate && wDate > (lastDateByLift.get(canon) ?? '')) lastDateByLift.set(canon, wDate);
            const sets = Array.isArray(ex?.sets) ? ex.sets : [];
            for (const s of sets) {
              if (s.completed === false) continue;
              const r = typeof s?.rir === 'number' && s.rir >= 0 && s.rir <= 10 ? s.rir : null;
              if (r != null) {
                if (!target.has(canon)) target.set(canon, []);
                target.get(canon)!.push(r);
              }
              const wt = Number(s?.weight);
              if (wt > 0 && wt > (bestWeightByLift.get(canon) ?? 0)) {
                bestWeightByLift.set(canon, wt);
              }
            }
          }
        }
      };

      extractLiftRir(Array.isArray(recentWorkouts) ? recentWorkouts : [], rirByLift7d);
      extractLiftRir(Array.isArray(normWorkouts) ? normWorkouts : [], rirByLift28d);

      const avgArr = (arr: number[]) => arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null;

      return { rirByLift7d, rirByLift28d, bestWeightByLift, lastDateByLift, avgArr };
    })();

    const strengthProfile = resolveProfile(planConfig?.strength_protocol);

    // D-270: the SPINE (state_trends_v1.strength.per_lift) is the single authority for each lift's
    // e1RM DIRECTION. Fetched here (moved up from the interference read below — only needs userId) so
    // the per-lift verdict READS the direction instead of re-deriving a dead one: `previous_e1rm` was
    // always null → the delta was always null → the "getting stronger/slipping" verdict never fired
    // (Q-107 H2). One direction, one substrate (the logged-set e1RM series the trend row also reads).
    let latestSnapshot: any = null;
    try {
      const { data: snapRows } = await supabase
        .from('athlete_snapshot')
        .select('interference, intensity_distribution, state_trends_v1')
        .eq('user_id', userId)
        .order('week_start', { ascending: false })
        .limit(1);
      latestSnapshot = snapRows?.[0] ?? null;
    } catch {}

    // ── Continuity close (D-275 follow-on): the run durability VERDICT on the AERO card reads the SPINE's
    // one decoupling band — NOT the coach's own 7d average — so AERO and the PERFORMANCE trend row can't
    // contradict on the same screen (they did: AERO "durability gap" while PERFORMANCE said "holding" with
    // the hot run excluded). The spine band is confound-excluded + freshness-gated; we render it via the
    // shared `decouplingBandDisplay` vocabulary the PERFORMANCE row also uses → AERO ≡ PERFORMANCE in value
    // AND words. Stale/needs_data → no verdict (honest "no clean recent read"), never a carried-forward gap.
    // Only STEADY-aerobic types map to durability; intervals/hills keep their execution % (spine has no
    // durability read for them). The raw per-type avg_decoupling_pct stays as an LLM/detail receipt. ──
    // ── REMOVED 2026-07-14 (docs/STATE-WEEK-EXECUTION.md): two blocks here used to overwrite the
    // steady run/bike "sessions went" rows with the SPINE fitness verdict (decouplingBandDisplay /
    // bikeEfficiencyDisplay), to make this section ≡ the PERFORMANCE row. That reconciliation cured
    // divergence but created DUPLICATION — the same "aerobic base needs work" appeared twice on one
    // screen and read as nagging. "How your sessions went" is the execution/shape clock; the fitness
    // verdict belongs to PERFORMANCE only (Law 1: one source per fact). Steady types now carry no
    // efficiency verdict here (label null, set above); intervals keep their execution %. ──

    // Spine verdict vocab → coach TrendDirection, keyed by canonical lift (same scheme both sides:
    // bench_press/squat/…). needs_data → omitted → the per-lift falls back. Absent cache (a snapshot
    // written before this deploy) → empty map → old 'stable' behavior until the next snapshot recompute.
    const spineDirByLift: Record<string, 'improving' | 'declining' | 'stable'> = (() => {
      const out: Record<string, 'improving' | 'declining' | 'stable'> = {};
      try {
        const pl = latestSnapshot?.state_trends_v1?.strength?.per_lift;
        if (Array.isArray(pl)) {
          for (const l of pl) {
            if (l?.direction === 'improving') out[l.canonical] = 'improving';
            else if (l?.direction === 'sliding') out[l.canonical] = 'declining';
            else if (l?.direction === 'holding') out[l.canonical] = 'stable';
            // needs_data → omit (fall back to old behavior for that lift)
          }
        }
      } catch {}
      return out;
    })();

    const liftSnapshots: StrengthLiftSnapshot[] = (() => {
      try {
        const s1rms = learnedFitness?.strength_1rms;
        if (!s1rms || typeof s1rms !== 'object') return [];
        const LIFT_DISPLAY: Record<string, string> = {
          squat: 'Squat', bench_press: 'Bench Press', deadlift: 'Deadlift',
          overhead_press: 'Overhead Press', hip_thrust: 'Hip Thrust',
          trap_bar_deadlift: 'Trap Bar Deadlift', barbell_row: 'Barbell Row',
        };
        return Object.entries(s1rms)
          .filter(([_, v]: [string, any]) => v && typeof v === 'object' && v.value > 0)
          .map(([key, v]: [string, any]) => {
            // D-231: `current_e1rm` stays the LEARNED estimate (it feeds the e1rm trend); the TYPED
            // baseline (e.g. bench 150) rides on `anchor_1rm`, which the response-model verdict +
            // suggested-weight now CONSULT — so "125→115 · back off" is no longer baseline-blind
            // (Q-107 H1). Accessory / gap-fill lifts (hip_thrust, trap_bar_deadlift, barbell_row) have
            // no typed anchor → anchor_1rm null → legacy behavior. Full plan/history-aware tone = Q-111.
            const canon = canonicalizeLiftKey(key);
            const cap = canon ? resolveStrengthCapacity({ key, typed: perf, learnedStrength1rms: s1rms, asOf: asOfDate }) : null;
            const anchor1rm = cap && cap.source === 'typed' ? cap.value : null;
            return {
            canonical_name: key,
            display_name: LIFT_DISPLAY[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
            current_e1rm: Number(v.value) || null,
            previous_e1rm: null,
            current_avg_rir: perLiftRir.avgArr(perLiftRir.rirByLift7d.get(key) ?? []) ?? reaction.avg_strength_rir_7d,
            baseline_avg_rir: perLiftRir.avgArr(perLiftRir.rirByLift28d.get(key) ?? []) ?? norms28d.strength_rir_avg,
            target_rir: getTargetRir(strengthProfile, key),
            sessions_in_window: Number(v.sample_count ?? 0),
            best_weight: perLiftRir.bestWeightByLift.get(key) ?? null,
            anchor_1rm: anchor1rm,
            last_session_date: perLiftRir.lastDateByLift.get(key) ?? null,
            spine_e1rm_direction: spineDirByLift[key] ?? null, // D-270: the spine owns direction
            };
          });
      } catch { return []; }
    })();

    const crossDomainPairs: CrossDomainPair[] = (() => {
      try {
        const completed = (Array.isArray(normWorkouts) ? normWorkouts : [])
          .filter((w: any) => String(w?.workout_status || '').toLowerCase() === 'completed')
          .sort((a: any, b: any) => String(a?.date || '').localeCompare(String(b?.date || '')));
        const pairs: CrossDomainPair[] = [];
        for (let i = 0; i < completed.length; i++) {
          const w = completed[i] as any;
          if (String(w?.type || '').toLowerCase() !== 'strength') continue;
          const strengthDate = String(w?.date || '');
          const strengthWorkload = Number(w?.workload_actual || 0);
          const strengthFocus = strengthFocusFromWorkout(w);
          for (let j = i + 1; j < completed.length; j++) {
            const next = completed[j] as any;
            const nextType = String(next?.type || '').toLowerCase();
            if (nextType !== 'run' && nextType !== 'running' && nextType !== 'cycling' && nextType !== 'ride') continue;
            const nextDate = String(next?.date || '');
            const daysDiff = (new Date(nextDate).getTime() - new Date(strengthDate).getTime()) / 86400000;
            if (daysDiff > 2) break;
            if (daysDiff <= 0) continue;
            const nextExec = executionScoreFromWorkout(next);
            // Skip sessions without meaningful execution data (e.g. rides
            // that return 0 because bike analysis isn't built yet). Including
            // them would create false interference signals against the run baseline.
            if (nextExec == null || nextExec <= 0) continue;
            pairs.push({
              strength_date: strengthDate,
              strength_workload: strengthWorkload,
              strength_focus: strengthFocus,
              next_endurance_date: nextDate,
              next_endurance_hr_at_pace: null,
              next_endurance_execution: nextExec,
              baseline_hr_at_pace: null,
              baseline_execution: norms28d.execution_score_avg,
            });
            break;
          }
        }
        return pairs;
      } catch { return []; }
    })();

    const athleteContextByWeek = activePlan?.athlete_context_by_week;
    const athleteContextStr = (() => {
      if (!activePlan || weekIndex == null || !athleteContextByWeek || typeof athleteContextByWeek !== 'object') return null;
      const ctx = athleteContextByWeek[String(weekIndex)] ?? athleteContextByWeek[weekIndex];
      return (typeof ctx === 'string' && ctx.trim()) ? ctx.trim() : null;
    })();
    const athleteContextSuggestsIllness = athleteContextStr && /sick|flu|covid|illness|ill\b|not feeling|under the weather/i.test(athleteContextStr);

    const acwrEarly = chronic28Load > 0 ? (acute7Load / 7) / (chronic28Load / 28) : null;

    const disciplineMixWtd = (() => {
      let runs = 0;
      let rides = 0;
      let strength = 0;
      let swims = 0;
      for (const w of Array.isArray(weekWorkouts) ? weekWorkouts : []) {
        if (String(w?.workout_status || '').toLowerCase() !== 'completed') continue;
        const t = String(w?.type || '').toLowerCase();
        if (t === 'run' || t === 'running' || t === 'walk' || t === 'walking') runs++;
        else if (t === 'ride' || t === 'cycling' || t === 'bike') rides++;
        else if (t.includes('strength')) strength++;
        else if (t.includes('swim')) swims++;
      }
      return { runs, rides, strength, swims };
    })();

    const weeklyResponseModel: WeeklyResponseState = computeWeeklyResponse({
      asOfDate,
      signals: responseModelSignals,
      norms: responseModelNorms,
      lifts: liftSnapshots,
      crossDomainPairs,
      acwr: acwrEarly,
      weekVsPlanPct: wtdCompletionRatio != null ? Math.round(wtdCompletionRatio * 100) : null,
      consecutiveTrainingDays: (() => {
        try {
          const allCompleted = (Array.isArray(normWorkouts) ? normWorkouts : [])
            .filter((w: any) => String(w?.workout_status || '').toLowerCase() === 'completed');
          const dates = [...new Set(allCompleted.map((w: any) => String(w?.date || '')))].sort().reverse();
          let streak = 0;
          const today = new Date(asOfDate);
          for (let d = 0; d < 14; d++) {
            const check = new Date(today);
            check.setDate(check.getDate() - d);
            const iso = check.toISOString().slice(0, 10);
            if (dates.includes(iso)) streak++;
            else if (d > 0) break;
          }
          return streak;
        } catch { return 0; }
      })(),
      acute7Load: Math.round(acute7Load),
      chronic28Load: Math.round(chronic28Load),
      planContext: activePlan ? {
        week_index: weekIndex,
        week_intent: weekIntent,
        total_weeks: activePlan.duration_weeks || null,
        plan_name: activePlan.name || null,
        is_transition_period: isPlanTransitionPeriod,
      } : null,
      goalSummary: goalContext.primary_event ? {
        primary_race: {
          name: goalContext.primary_event.name,
          date: goalContext.primary_event.target_date!,
          weeks_out: goalContext.upcoming_races.find(r => r.name === goalContext.primary_event!.name)?.weeks_out ?? 0,
          distance: goalContext.primary_event.distance || 'unknown',
          sport: goalContext.primary_event.sport || 'unknown',
        },
        race_count: goalContext.upcoming_races.length,
        has_plan: goalContext.primary_event.plan_id != null,
      } : null,
      totalSessionsGaps,
      completionPct: wtdCompletionRatio != null ? Math.round(wtdCompletionRatio * 100) : null,
      existingAthleteContext: athleteContextStr,
      discipline_mix: disciplineMixWtd,
      // Arc-grounded inputs: drive overall_training_read + empty_state from real athlete state
      // (current phase, recent races, goal stack, active plan) instead of generic templates.
      arc: {
        current_phase: (() => {
          const cp = (arc.athlete_identity as Record<string, unknown> | null)?.current_phase;
          if (cp === 'recovery' || cp === 'build' || cp === 'maintenance' || cp === 'taper' || cp === 'unknown') {
            return cp;
          }
          return null;
        })(),
        active_goals: arc.active_goals.map((g) => ({
          id: g.id,
          name: g.name,
          target_date: g.target_date,
          sport: g.sport,
          distance: g.distance,
          goal_type: g.goal_type,
        })),
        recent_completed_events: arc.recent_completed_events,
        active_plan: arc.active_plan,
      },
    });

    // Holistic BODY heart-rate response — read from the SPINE, not re-derived. Replaces the run-only
    // HR-drift row: combines run aerobic decoupling + bike HR-at-power (each discipline's correct HR
    // instrument) into ONE signal covering every discipline whose HR is trustworthy. Swim is excluded
    // (in-water HR unreliable), named in the provenance so it's honest, not silent. Single source, so it
    // can't contradict the PERFORMANCE run/bike reads.
    {
      const hrResp = rollupHrResponse(latestSnapshot?.state_trends_v1);
      if (hrResp.verdict !== 'needs_data' && hrResp.contributors.length > 0) {
        const dir: 'improving' | 'stable' | 'declining' =
          hrResp.verdict === 'improving' ? 'improving' : hrResp.verdict === 'sliding' ? 'declining' : 'stable';
        const detail = hrResp.verdict === 'improving' ? 'settling — HR easing at the same effort'
          : hrResp.verdict === 'sliding' ? 'drifting up — working harder to hold effort'
          : 'holding steady';
        const discLabel = (d: string): string => d === 'run' ? 'runs' : d === 'bike' ? 'bike' : d;
        const partVerdict = (v: string): string => v === 'improving' ? 'settling' : v === 'sliding' ? 'drifting up' : 'holding';
        const partAge = (a: number | null): string => a == null ? '' : ` (${a}d ago)`;
        const parts = hrResp.contributors.map((c) => `${discLabel(c.discipline)} ${partVerdict(c.verdict)}${partAge(c.newestAgeDays)}${c.provisional ? ' · limited data' : ''}`);
        const provenance = `From the spine: ${parts.join(' · ')} — run = aerobic decoupling, bike = HR-at-power. Swim excluded (in-water HR isn't reliable).`;
        // "as of" = the OLDEST contributor, so a combined read never looks fresher than its stalest half.
        const asOf = hrResp.asOfAgeDays != null ? addDaysISO(asOfDate, -hrResp.asOfAgeDays) : null;
        weeklyResponseModel.visible_signals.unshift({
          label: 'Heart-rate response', category: 'endurance',
          trend: dir,
          trend_icon: dir === 'improving' ? '↑' : dir === 'declining' ? '↓' : '—',
          trend_tone: dir === 'improving' ? 'positive' : dir === 'declining' ? 'danger' : 'neutral',
          detail,
          provenance,
          samples: hrResp.contributors.length,
          samples_label: `${hrResp.contributors.length} discipline${hrResp.contributors.length === 1 ? '' : 's'}`,
          as_of_date: asOf,
        });
      }
    }

    // ── D-267/D-268: plan-primary discipline + WTD strength adherence — resolved ONCE here (single
    // source, D-264) and read by every consumer below: the load reconciler, the off-plan banner, and
    // (later phases) the coach copy. Absent/unknown → current behavior everywhere. ─────────────────
    const planPrimary = resolvePlanPrimary(planConfig);
    // b2 scale-up (Q-149): the specific lead discipline for the execution surface (strength/run/ride/swim/
    // triathlon/duathlon/hybrid/unknown). Single source; the client leads with this, never re-derives it.
    const primarySport = resolvePrimarySport(planConfig, (activePlan as any)?.plan_type ?? null);
    const planPrimaryStrengthSessions = (Array.isArray(weekWorkouts) ? weekWorkouts : []).filter(
      (w: any) => String(w?.type || '').toLowerCase() === 'strength'
        && String(w?.workout_status || '').toLowerCase() === 'completed',
    ).length;
    const planPrimaryDayIndex = Math.max(0, Math.min(6, Math.round(
      (new Date(asOfDate).getTime() - new Date(weekStartDate).getTime()) / 86_400_000)));
    const primaryAdherence = computePrimaryAdherence({
      planPrimary,
      strengthSessionsCompleted: planPrimaryStrengthSessions,
      strengthFrequency: Number(planConfig?.strength_frequency) || 0,
      e1rmDirection: weeklyResponseModel?.strength?.overall?.trend ?? null,
      dayIndex: planPrimaryDayIndex,
    });

    // D-212 Piece 4 (wire-now) — feed the block-adaptation substrate so goal_prediction.block_verdict
    // is non-null and sits adjacent to fitness_direction + race_readiness in the payload. The THIRD
    // axis is block_verdict specifically — NEVER weekly_verdict (that's the readiness clone). No focus:
    // getBlockAdaptation self-derives from sample counts. Service client so the cache upsert works.
    // Computed ABOVE the sync IIFE (awaiting inside would make goalPrediction a Promise). Graceful
    // null on failure — a missing block leaves block_verdict null, never a crash.
    let block: {
      aerobic_efficiency_improvement_pct: number | null;
      long_run_improvement_pct: number | null;
      strength_overall_gain_pct: number | null;
    } | null = null;
    try {
      const blockEnd = asOfDate;
      const blockStart = addDaysISO(asOfDate, -28); // 4-week block, matches generate-overall-context weeks_back=4
      const ba: any = await getBlockAdaptation(userId, blockStart, blockEnd, supabaseService);
      block = ba != null ? {
        aerobic_efficiency_improvement_pct: ba.aerobic_efficiency?.improvement_pct ?? null,
        long_run_improvement_pct: ba.long_run_endurance?.improvement_pct ?? null,
        strength_overall_gain_pct: ba.strength_progression?.overall_gain_pct ?? null,
      } : null;
    } catch (baErr: any) {
      console.warn('[coach] getBlockAdaptation failed (non-fatal):', baErr?.message ?? baErr);
      block = null;
    }

    const goalPrediction = (() => {
      const weeklyInput = responseModelToWeeklyInput(weeklyResponseModel);
      const raceName = goalContext.primary_event?.name ?? activePlan?.name ?? null;
      const targetSeconds = (() => {
        if (goalContext.primary_event?.target_time) return goalContext.primary_event.target_time;
        const pc = activePlan?.config;
        if (pc?.target_time) return Number(pc.target_time);
        if (pc?.marathon_target_seconds) return Number(pc.marathon_target_seconds);
        return null;
      })();
      return runGoalPredictor({
        weekly: weeklyInput,
        block,
        plan: raceName ? { target_finish_time_seconds: targetSeconds, race_name: raceName } : null,
        weekly_plan_context: activePlan ? {
          week_intent: weekIntent as any,
          is_recovery_week: weekIntent === 'recovery',
          is_taper_week: weekIntent === 'taper',
          next_week_intent: null,
          weeks_remaining: (() => {
            if (!activePlan.duration_weeks || weekIndex == null) return null;
            return Math.max(0, activePlan.duration_weeks - weekIndex);
          })(),
        } : null,
      });
    })();

    const normalizeType = (t: any): string => {
      const s = String(t || '').toLowerCase();
      if (!s) return 'other';
      // Brick must be checked first — a brick session often contains 'run' or 'bike'
      // in its sub-type (e.g. 'brick_run', 'brick_bike', 'brick'). Identifying it as
      // 'brick' preserves the transition context for the LLM.
      if (s === 'brick' || s.startsWith('brick_') || s.endsWith('_brick')) return 'brick';
      if (s.includes('run')) return 'run';
      if (s.includes('bike') || s.includes('ride') || s.includes('cycl')) return 'bike';
      if (s.includes('swim')) return 'swim';
      if (s.includes('strength')) return 'strength';
      if (s.includes('mobility') || s === 'pt') return 'mobility';
      return s;
    };

    const byType = (rows: any[]): Array<{
      type: string;
      total_sessions: number;
      total_load: number;
      linked_sessions: number;
      linked_load: number;
      extra_sessions: number;
      extra_load: number;
    }> => {
      const m = new Map<string, { total_sessions: number; total: number; linked_sessions: number; linked: number; extra_sessions: number; extra: number }>();
      for (const r of rows) {
        const typ = normalizeType(r?.type);
        const wl = safeNum(r?.workload_actual) || 0;
        const isLinked = r?.planned_id != null && String(r.planned_id) !== '';
        const cur = m.get(typ) || { total_sessions: 0, total: 0, linked_sessions: 0, linked: 0, extra_sessions: 0, extra: 0 };
        cur.total_sessions += 1;
        cur.total += wl;
        if (isLinked) { cur.linked_sessions += 1; cur.linked += wl; }
        else { cur.extra_sessions += 1; cur.extra += wl; }
        m.set(typ, cur);
      }
      return Array.from(m.entries())
        .map(([type, v]) => ({
          type,
          total_sessions: v.total_sessions,
          total_load: Math.round(v.total),
          linked_sessions: v.linked_sessions,
          linked_load: Math.round(v.linked),
          extra_sessions: v.extra_sessions,
          extra_load: Math.round(v.extra),
        }))
        .sort((a, b) => b.total_load - a.total_load);
    };

    const topSessionsAcute7 = acute7Rows
      .map((r: any) => ({
        date: String(r?.date || '').slice(0, 10),
        type: normalizeType(r?.type),
        name: r?.name != null ? String(r.name) : null,
        workload_actual: safeNum(r?.workload_actual) || 0,
        linked: r?.planned_id != null && String(r.planned_id) !== '',
      }))
      .sort((a: any, b: any) => (b.workload_actual || 0) - (a.workload_actual || 0))
      .slice(0, 3);

    // ── Spike-on-empty-base guard (D-146) ──────────────────────────────────
    // A big single session on a thin/empty chronic base makes the discipline-
    // agnostic ACWR explode (one ride in a dead month → ACWR ≈ 4.0) and reads as
    // "high load → back off" when the athlete is actually UNDERtrained —
    // undertraining MAXIMISES the signal instead of dampening it. ACWR is
    // statistically unreliable on a thin chronic base, so we null it there. That
    // single value feeds the gauge dot (:4771), the okTitle/okKicker (:2529),
    // the buildVerdict ACWR branch (:882), and the cross-training-ACWR
    // escalation in reconcileLoadStatus (:3239) — so one null neutralises all
    // four ACWR-driven "high load" surfaces at once.
    //
    // Thresholds (workload = hours × intensity² × 100): a normal ~6-session week
    // is ≈300–420 pts/wk → ≈1300–1700 over 28d and clears CHRONIC_LOAD_FLOOR
    // comfortably (≈2.7×); a light-but-consistent 4-session week ≈800 also
    // clears; one big ride on an otherwise dead month ≈200–300 does not.
    const CHRONIC_LOAD_FLOOR = 500;          // 28-day workload sum below which ACWR / "high load" is unreliable
    const SINGLE_SESSION_DOMINANCE = 0.60;   // one session > 60% of the acute week = a spike, not sustained load
    const acuteSessionCount = acute7Rows.length;
    const topAcuteSessionLoad = acute7Rows.reduce((m: number, r: any) => Math.max(m, safeNum(r?.workload_actual) || 0), 0);
    const thinChronicBase = chronic28Load < CHRONIC_LOAD_FLOOR;
    const oneSessionDominatesAcute = acute7Load > 0 && (topAcuteSessionLoad / acute7Load) > SINGLE_SESSION_DOMINANCE;
    // Master gate = thin chronic base → ACWR unreliable (catches any lumpy thin
    // week, including a multi-small-session ramp-back). The load_status DOWNGRADE
    // additionally requires the week to actually BE a spike (≤1 session or one
    // session dominating), so a thin-base week that is genuinely ramping back
    // isn't told "build more" without cause.
    const isSpikeOnEmptyBase = thinChronicBase && (acuteSessionCount < 2 || oneSessionDominatesAcute);
    const rawAcwr = chronic28Load > 0 ? (acute7Load / 7) / (chronic28Load / 28) : null;
    const acwr = thinChronicBase ? null : rawAcwr;

    const metrics: CoachWeekContextResponseV1['metrics'] = {
      wtd_planned_load: plannedWtdLoad || 0,
      wtd_actual_load: actualWtdLoad || 0,
      wtd_completion_ratio: wtdCompletionRatio,
      acute7_actual_load: completedRolling.length ? acute7Load : null,
      chronic28_actual_load: completedRolling.length ? chronic28Load : null,
      acwr,
    };

    const v = buildVerdict(metrics, methodologyId, methodologyCtx, reaction, isPlanTransitionPeriod);

    // =========================================================================
    // Deterministic training state (plan-aware topline for dumb clients)
    // =========================================================================
    const intentLabel =
      weekIntent === 'build' ? 'Build week'
      : weekIntent === 'peak' ? 'Peak week'
      : weekIntent === 'taper' ? 'Taper week'
      : weekIntent === 'recovery' ? 'Recovery week'
      : weekIntent === 'baseline' ? 'Baseline week'
      : !activePlan && goalContext.primary_event
        ? `${goalContext.primary_event.name} — ${goalContext.upcoming_races[0]?.weeks_out ?? '?'} weeks out`
        : !activePlan ? 'No plan' : 'Plan';

    const primaryDeltaLine = (() => {
      const declining = weeklyResponseModel.visible_signals.filter(s => s.trend === 'declining');
      if (declining.length === 0) return null;
      const s = declining[0];
      return `${s.label}: ${s.detail} (n=${s.samples})`;
    })();

    const training_state: CoachWeekContextResponseV1['training_state'] = (() => {
      const rm = weeklyResponseModel;
      const kicker = `${intentLabel} • Response vs baseline`;
      const conf = rm.assessment.confidence === 'high' ? 0.85 : rm.assessment.confidence === 'medium' ? 0.65 : 0.4;
      const baseline_days = 28;
      const load_ramp_acwr = metrics.acwr;
      const load_ramp = {
        acute7_total_load: completedRolling.length ? Math.round(acute7Load) : null,
        chronic28_total_load: completedRolling.length ? Math.round(chronic28Load) : null,
        acute7_by_type: byType(acute7Rows),
        chronic28_by_type: byType(completedRolling),
        top_sessions_acute7: topSessionsAcute7,
      };

      if (rm.assessment.label === 'insufficient_data') {
        return {
          code: 'need_more_data' as const,
          kicker,
          title: rm.assessment.title,
          subtitle: rm.assessment.explain,
          confidence: conf,
          baseline_days,
          load_ramp_acwr,
          load_ramp,
        };
      }

      if (rm.assessment.label === 'overreaching' || v.code === 'recover_overreaching') {
        return {
          code: 'overstrained' as const,
          kicker,
          title: rm.assessment.title,
          subtitle: primaryDeltaLine || rm.assessment.explain,
          confidence: conf,
          baseline_days,
          load_ramp_acwr,
          load_ramp,
        };
      }

      if (rm.assessment.label === 'stagnating' || v.code === 'caution_ramping_fast' ||
          (rm.assessment.signals_concerning === 1 && !isPlanTransitionPeriod)) {
        if (athleteContextSuggestsIllness && (v.code === 'undertraining' || recoverySignaledExtrasCount > 0)) {
          return {
            code: 'strained' as const,
            kicker,
            title: 'Recovery',
            subtitle: primaryDeltaLine
              ? `Response markers may reflect illness rather than training load. ${primaryDeltaLine}`
              : 'Take the time you need. Response markers can be skewed when sick.',
            confidence: conf,
            baseline_days,
            load_ramp_acwr,
            load_ramp,
          };
        }
        return {
          code: 'strained' as const,
          kicker,
          title: rm.assessment.title,
          subtitle: primaryDeltaLine || rm.assessment.explain,
          confidence: conf,
          baseline_days,
          load_ramp_acwr,
          load_ramp,
        };
      }

      // Title and kicker must match the bar — both derived from the same ACWR value
      const okTitle = (() => {
        if (weekIntent === 'recovery' || weekIntent === 'taper') return 'Recovery week';
        if (load_ramp_acwr == null) return 'On Track';
        if (load_ramp_acwr < 0.8) return 'Light week';
        if (load_ramp_acwr <= 1.3) return 'On Track';
        return 'High load'; // >1.3 but not caught by overreaching branch
      })();
      const okKicker = (() => {
        if (weekIntent === 'recovery' || weekIntent === 'taper') return `Recovery • ${intentLabel}`;
        if (load_ramp_acwr == null) return kicker;
        if (load_ramp_acwr < 0.8) return 'Light week — room to push';
        if (load_ramp_acwr <= 1.3) return 'Building well — stay the course';
        return 'Load is high — protect recovery';
      })();
      return {
        code: 'strain_ok' as const,
        kicker: okKicker,
        title: okTitle,
        subtitle: rm.headline.subtext,
        confidence: conf,
        baseline_days,
        load_ramp_acwr,
        load_ramp,
      };
    })();

    // =========================================================================
    // Fitness direction + Readiness state + Interference
    // =========================================================================

    // latestSnapshot (interference, intensity_distribution, state_trends_v1) is fetched ABOVE — moved up
    // to the strength block (D-270) so the per-lift verdict can read the spine's per-lift e1RM direction.
    // It only depends on userId, so the earlier fetch is equivalent; interference/intensity consumers below
    // read the same object. (Q-109 step-4: the SELECT is trimmed to the columns the coach actually consumes.)

    // Fitness direction is now the SPINE roll-up (athlete_snapshot.state_trends_v1), NOT a separate
    // response-model re-derivation. Coach DESCRIBES the spine verdict; it no longer infers fitness
    // its own way — the same single-source principle as the Step-2 narrative→spine work, one level
    // up. Two coexisting fitness verdicts (response-model vs spine) is exactly how the old
    // contradictions survived; there is now one truth. Absent cache (cold start) → 'stable', which
    // matches the prior derivation's catch-all default, so the degraded contract is unchanged.
    // Q-162: the composite is only as confident as its inputs — a provisional (thin/clustered)
    // discipline can't ASSERT the headline direction; thinHeldOut names any mover we held out so the
    // narrative can be honest about the gap instead of the headline silently reading 'stable'.
    const fitnessRollup = rollupFitness(latestSnapshot?.state_trends_v1);
    const fitnessDirection: FitnessDirection = fitnessRollup.direction;

    // Q-111 §2: the ~6–8wk strength-movement history (5–56d back — excludes the recent trigger window so a
    // session isn't its own baseline), for the novel-movement fact (one detection, two surfaces). Distinct
    // logged movement names; the loaded-legs attribution checks the trigger session against it.
    const strengthHistoryNames: string[] = await (async () => {
      try {
        const { data } = await supabase.from('workouts')
          .select('date, strength_exercises')
          .eq('user_id', userId).eq('type', 'strength').eq('workout_status', 'completed')
          .gte('date', addDaysISO(asOfDate, -56)).lte('date', addDaysISO(asOfDate, -5));
        const names = new Set<string>();
        for (const w of (data ?? []) as any[]) {
          const exRaw = (w as any)?.strength_exercises;
          const ex = Array.isArray(exRaw) ? exRaw : (typeof exRaw === 'string' ? (parseJson(exRaw) || []) : []);
          for (const e of (Array.isArray(ex) ? ex : [])) { const n = String((e as any)?.name || '').trim(); if (n) names.add(n); }
        }
        return [...names];
      } catch { return []; }
    })();
    const sessionMovementsFromWorkout = (w: any): SessionMovement[] => {
      try {
        const exRaw = (w as any)?.strength_exercises;
        const ex = Array.isArray(exRaw) ? exRaw : (typeof exRaw === 'string' ? (parseJson(exRaw) || []) : []);
        return (Array.isArray(ex) ? ex : []).map((e: any) => {
          const sets = Array.isArray(e?.sets) ? e.sets : [];
          const reps = sets.reduce((s: number, st: any) => s + (Number(st?.reps ?? st?.completed_reps ?? st?.actual_reps ?? 0) || 0), 0);
          return { name: String(e?.name || ''), reps } as SessionMovement;
        }).filter((m: SessionMovement) => !!m.name);
      } catch { return []; }
    };

    const readinessState = (() => {
      const rm = weeklyResponseModel;

      // Overreaching is unconditional — body has crossed a real threshold
      if (v.code === 'recover_overreaching') return 'overreached';
      if (rm.assessment.label === 'overreaching' && !isPlanTransitionPeriod) return 'overreached';

      // Body signals are the primary read: execution, HR drift, RPE, cardiac efficiency
      const bodySignalsConcerning = rm.assessment.signals_concerning > 0;
      const bodySignalsImproving = rm.assessment.signals_available >= 2 &&
        rm.assessment.signals_concerning === 0 &&
        rm.assessment.label === 'responding';

      // Execution degraded with enough samples — trust that regardless of ACWR
      if (v.reason_codes.includes('execution_low')) return 'fatigued';

      // ACWR elevated AND body signals confirm it — genuinely fatigued
      if (isAcwrFatiguedSignal(metrics.acwr, isPlanTransitionPeriod, weekIntent as any) && bodySignalsConcerning) return 'fatigued';

      // ACWR elevated BUT body is handling it fine — adapting to load, not fatigued
      if (isAcwrFatiguedSignal(metrics.acwr, isPlanTransitionPeriod, weekIntent as any) && bodySignalsImproving) return 'adapting';

      // ACWR elevated with insufficient signal to confirm either way — use caution label only
      if (v.code === 'caution_ramping_fast' && !bodySignalsImproving) return 'fatigued';

      // Low ACWR vs chronic: "detrained" in data terms — during taper/recovery/deload that is
      // usually intentional (skips, reduced volume). Don't label as loss of fitness.
      if (isAcwrDetrainedSignal(metrics.acwr)) {
        const wi = String(weekIntent || '').toLowerCase();
        if (wi === 'taper' || wi === 'recovery' || wi === 'deload') return 'normal';
        return 'detrained';
      }
      if (bodySignalsConcerning) return 'fatigued';
      if (rm.assessment.label === 'responding' && rm.assessment.signals_concerning === 0) return 'fresh';
      return 'normal';
    })() as 'fresh' | 'normal' | 'fatigued' | 'overreached' | 'detrained' | 'adapting';

    // D-232 surgical readiness: refine the `fatigued` catch-all (over-fires on a single signal) into a
    // load-language display — LEGS LOADED (cross-domain lower-body attribution), LEGS SORE (athlete
    // DECLARED it via Q-049), FATIGUED (genuinely systemic: elevated ACWR or ≥2 signals), or EFFORT UP
    // (single unattributed signal + balanced load). Novel-movement NAMING is deferred to Q-111 (needs
    // 6–8wk exercise history; the coach has 28d).
    const fatigueRefinement: { label: string; loadedLegs: LoadedLegsDiagnosis | null } | null = (() => {
      if (readinessState !== 'fatigued') return null;
      const rm = weeklyResponseModel;
      const e = rm.endurance;
      const effortUp = e.rpe.sufficient && e.rpe.trend === 'declining' && e.rpe.current_avg != null && e.rpe.baseline_avg != null;
      const acwr = metrics.acwr;
      const systemic = (acwr != null && acwr >= 1.2) || rm.assessment.signals_concerning >= 2;
      const loadLabel = (acwr != null && acwr >= 1.2) ? `load elevated (ACWR ${acwr.toFixed(2)})` : 'load balanced';
      const daysAgo = (iso: string) => (parseISODateOnly(asOfDate).getTime() - parseISODateOnly(iso).getTime()) / 86400000;

      // Most recent LOWER-BODY strength session within 4 days (logged day + session RPE + its exercises).
      let lower: { dayName: string; rpe: number | null; w: any } | null = null;
      try {
        const rows = (Array.isArray(normWorkouts) ? normWorkouts : [])
          .filter((w: any) => {
            if (String(w?.workout_status || '').toLowerCase() !== 'completed') return false;
            if (String(w?.type || '').toLowerCase() !== 'strength') return false;
            // 'lower' OR 'full': legs get loaded by the squat/lower work INSIDE a full-body day too
            // (Michael's squat+bench session classifies 'full'). 'upper' has no leg load.
            const f = strengthFocusFromWorkout(w);
            return f === 'lower' || f === 'full';
          })
          .map((w: any) => ({ date: String(w?.date || ''), rpe: sessionRpeFromWorkout(w), w }))
          .filter((r) => r.date && daysAgo(r.date) >= 0 && daysAgo(r.date) <= 4)
          .sort((a, b) => b.date.localeCompare(a.date));
        if (rows.length) lower = { dayName: parseISODateOnly(rows[0].date).toLocaleDateString('en-US', { weekday: 'long' }), rpe: rows[0].rpe, w: rows[0].w };
      } catch { lower = null; }

      // Athlete-DECLARED soreness (Q-049 daily check-in, Hooper 1–7 per D-234, higher = sorer): recent (≤2d)
      // + clearly sore (≥5 = "more than moderate", the linear-rescale equivalent of the old ≥7/10).
      const soreness = (() => {
        const L = arc.readiness?.latest;
        if (!L || L.soreness == null || !L.date) return false;
        return daysAgo(String(L.date)) <= 2 && Number(L.soreness) >= 5;
      })();

      // Plan-start proximity (cheap): plan not started + starts within the clearing window → "{Day}'s opener".
      const planEvent = (() => {
        if (planStarted || !activePlan) return null;
        const startIso = planWeek1StartIso(planConfig);
        if (!startIso) return null;
        const d = -daysAgo(startIso); // days until start
        return (d >= 0 && d <= 4) ? `${parseISODateOnly(startIso).toLocaleDateString('en-US', { weekday: 'long' })}'s opener` : null;
      })();

      let loadedLegs: LoadedLegsDiagnosis | null = null;
      if (lower && (lower.rpe == null || lower.rpe >= 8) && effortUp) {
        // Q-111 §2: novel movements in the trigger session (absent ~6–8wk) name the Why ("first reverse
        // lunges and bulgarian split squats in months"). Same fact the INSIGHTS narrator uses.
        const novels = detectNovelMovements({ sessionMovements: sessionMovementsFromWorkout(lower.w), historyMovementNames: strengthHistoryNames });
        loadedLegs = buildLoadedLegsDiagnosis({
          dayName: lower.dayName,
          sessionRpe: lower.rpe,
          movement: novelMovementsNames(novels),  // names-only (State row is tight); null → non-novel Why
          isNovel: novels.length > 0,
          effortCurrent: Number(e.rpe.current_avg),
          effortBaseline: Number(e.rpe.baseline_avg),
          loadLabel,
          athleteReportedSoreness: soreness,
          planEvent,
        });
      }
      return { label: classifyFatigueLabel({ loadedLegs, systemic }), loadedLegs };
    })();

    // Race-course goal ids + unified run goal (State + terrain + VDOT readiness). Hoisted so race_readiness
    // runs when primary_event is null but the plan still points at a run goal (e.g. race date in the past).
    let raceCourseGoalIdsForRace: string[] = [];
    let resolvedRunGoalIdForRace: string | null = null;
    try {
      const { data: rcGoalRows } = await supabaseService
        .from('race_courses')
        .select('goal_id')
        .eq('user_id', userId);
      raceCourseGoalIdsForRace = [
        ...new Set((rcGoalRows || []).map((r: { goal_id?: string }) => r.goal_id).filter(Boolean).map(String)),
      ];
      resolvedRunGoalIdForRace = resolveRunGoalIdForRaceProjection(goalContext, activePlan, raceCourseGoalIdsForRace);
    } catch (e: any) {
      console.warn('[coach] race course goal resolution failed (non-fatal):', e?.message ?? e);
    }

    /** Merge plans.config race_date / distance / target when plan row omits goal_id or goal.plan_id. */
    const planConfigAppliesToGoalId = (goalId: string | null | undefined): boolean => {
      if (!activePlan || !goalId) return false;
      if (String(activePlan.goal_id || '') === String(goalId)) return true;
      if (resolvedRunGoalIdForRace != null && String(resolvedRunGoalIdForRace) === String(goalId)) return true;
      return goalContext.goals.some(g => g.id === goalId && g.plan_id === activePlan.id);
    };

    /** Also merge when this goal is the A-priority primary event — avoids null race_date/distance when plan.goal_id or race_courses point elsewhere. */
    const mergeActivePlanRaceConfigForGoal = (goalId: string | null | undefined): boolean => {
      if (!goalId) return false;
      if (planConfigAppliesToGoalId(goalId)) return true;
      const pe = goalContext.primary_event;
      return pe != null && String(pe.id) === String(goalId);
    };

    const mergedEffortPacesForRace = mergedEffortPacesForCoach(
      arc.effort_paces,
      activePlan?.config as Record<string, unknown> | null | undefined,
    );

    // =========================================================================
    // Race readiness (VDOT-based, gated on running event goal)
    // =========================================================================
    let raceFinishProjectionV1: RaceFinishProjectionV1 | null = null;
    /** When RFP builds from plan config but primary_event/plan goal resolution skipped readiness — recompute readiness from same distance/date. */
    let rfpMirrorForRaceReadiness: {
      id: string | null;
      name: string;
      distance: string;
      target_date: string;
      target_time: number | null;
      sport: string | null;
      goal_row_id_for_persist: string | null;
    } | null = null;
    let raceReadiness: RaceReadinessV1 | null = null;
    let runGoalForReadiness: GoalLite | null = null;
    try {
      runGoalForReadiness = (() => {
        const pe = goalContext.primary_event;
        if (pe && (pe.sport === 'run' || pe.sport === 'running' || !pe.sport)) return pe;
        const gid =
          resolvedRunGoalIdForRace ||
          (typeof activePlan?.goal_id === 'string' && activePlan.goal_id.trim() ? activePlan.goal_id.trim() : '');
        if (!gid) return null;
        const g = goalContext.goals.find(x => x.id === gid);
        if (!g) return null;
        if (g.sport === 'run' || g.sport === 'running' || !g.sport) return g;
        return null;
      })();

      if (runGoalForReadiness) {
        const planCfg = activePlan?.config as Record<string, unknown> | null | undefined;
        const planOwnsGoal = mergeActivePlanRaceConfigForGoal(runGoalForReadiness.id);
        const planRaceDate =
          planOwnsGoal && planCfg?.race_date ? String(planCfg.race_date).slice(0, 10) : null;
        const planDistance = planOwnsGoal ? (planCfg?.distance ?? planCfg?.race_distance ?? null) : null;
        const distance =
          runGoalForReadiness.distance != null && String(runGoalForReadiness.distance).trim() !== ''
            ? String(runGoalForReadiness.distance)
            : planDistance != null
              ? String(planDistance)
              : null;
        const targetDate =
          runGoalForReadiness.target_date != null
            ? String(runGoalForReadiness.target_date).slice(0, 10)
            : planRaceDate;

        if (distance && targetDate) {
          const weeksOutVal = goalContext.upcoming_races.find(r => r.name === runGoalForReadiness!.name)?.weeks_out ?? 0;

          const readinessDrivers = buildRaceReadinessDrivers({ reaction, norms28d });

          const easyRunType = runSessionTypes7d.find(rt => rt.type === 'easy' || rt.type === 'z2');
          const easyDecoupling = easyRunType?.avg_decoupling_pct ?? null;

          const targetTimeForReadiness = (() => {
            const raw = runGoalForReadiness.target_time;
            if (raw != null && Number.isFinite(Number(raw)) && Number(raw) > 0) return Number(raw);
            if (planOwnsGoal && activePlan?.config) {
              const t = targetSecondsFromPlanConfig(activePlan.config as Record<string, unknown>);
              if (t != null && t > 0) return t;
            }
            return null;
          })();

          const rrComputed = computeRaceReadiness({
            learnedFitness: learnedFitness || null,
            effortPaces: mergedEffortPacesForRace,
            performanceNumbers: arc.performance_numbers || null,
            primaryEvent: {
              id: runGoalForReadiness.id,
              name: runGoalForReadiness.name,
              distance,
              target_date: targetDate,
              target_time: targetTimeForReadiness,
              sport: runGoalForReadiness.sport,
            },
            weeksOut: weeksOutVal,
            weeklyReadinessLabel: readinessState ?? null,
            readinessDrivers,
            hrDriftAvgBpm: reaction.hr_drift_avg_bpm,
            hrDriftNorm28dBpm: norms28d.hr_drift_avg_bpm,
            easyRunDecouplingPct: easyDecoupling,
          });
          raceReadiness = rrComputed
            ? {
              ...rrComputed,
              projection_display: buildRaceProjectionDisplay({
                rr: rrComputed,
                endurance: weeklyResponseModel.endurance,
              }),
            }
            : null;
        }
      }
    } catch (rrErr: any) {
      console.warn('[coach] race readiness failed (non-fatal):', rrErr?.message ?? rrErr);
    }

    let primary_race_readiness: CoachWeekContextResponseV1['primary_race_readiness'] = null;
    try {
      const weeksOutGate =
        goalContext.upcoming_races.find((r) => r.name === goalContext.primary_event?.name)?.weeks_out ?? null;
      const pe = goalContext.primary_event;
      const raceIso = pe?.target_date ? String(pe.target_date).slice(0, 10) : '';
      const sport = String(pe?.sport || '').toLowerCase();
      const runish = Boolean(pe && (sport === 'run' || sport === 'running' || !pe.sport));
      if (weeksOutGate != null && weeksOutGate <= 21 && raceIso && runish) {
        primary_race_readiness = await pickPrimaryRaceReadinessWorkout(supabase, userId, raceIso, asOfDate);
      }
    } catch (prrErr: any) {
      console.warn('[coach] primary_race_readiness failed (non-fatal):', prrErr?.message ?? prrErr);
    }

    let last_completed_race: CoachWeekContextResponseV1['last_completed_race'] = null;
    try {
      const { data: lcrRows, error: lcrErr } = await supabaseService
        .from('goals')
        .select('id, name, target_date, status, current_value, goal_type, target_time, training_prefs')
        .eq('user_id', userId)
        .eq('status', 'completed')
        .eq('goal_type', 'event')
        .not('current_value', 'is', null)
        .order('target_date', { ascending: false, nullsFirst: false })
        .limit(1);
      if (lcrErr) throw lcrErr;
      const lcr = Array.isArray(lcrRows) ? lcrRows[0] : null;
      if (lcr && typeof lcr.current_value === 'number' && Number.isFinite(lcr.current_value) && lcr.current_value > 0) {
        const tp = (lcr.training_prefs as Record<string, unknown> | null | undefined) || {};
        const rr = (tp as {
          race_result?: { completed_at?: string; projected_seconds?: number | string | null };
        })?.race_result;
        const completedAt =
          typeof rr?.completed_at === 'string' && rr.completed_at.trim()
            ? String(rr.completed_at)
            : lcr.target_date
              ? String(lcr.target_date).slice(0, 10) + 'T12:00:00.000Z'
              : asOfDate + 'T12:00:00.000Z';
        const tts = lcr.target_time;
        const goalTargetSec =
          tts != null && Number.isFinite(Number(tts)) && Number(tts) > 0 ? Math.round(Number(tts)) : null;
        // Projection at the time of the race (snapshotted by complete-race or repaired manually).
        // Stored as `training_prefs.race_result.projected_seconds`. Surfaced so the State tab can
        // render actual / goal / projected together — the projection is the deterministic course
        // model number, the goal is the athlete's intent, the actual is what they ran.
        const projRaw = rr?.projected_seconds;
        const projNum = projRaw != null ? Number(projRaw) : NaN;
        const projectedSec = Number.isFinite(projNum) && projNum > 0 ? Math.round(projNum) : null;
        last_completed_race = {
          goal_id: String(lcr.id),
          name: String(lcr.name || 'Race'),
          target_date: lcr.target_date ? String(lcr.target_date).slice(0, 10) : asOfDate,
          goal_target_seconds: goalTargetSec,
          projected_seconds: projectedSec,
          actual_seconds: Math.round(lcr.current_value),
          completed_at: completedAt,
        };
      }
    } catch (lcrE: any) {
      console.warn('[coach] last_completed_race failed (non-fatal):', lcrE?.message ?? lcrE);
    }

    // Unified finish projection (State + Course Strategy). User's plan-wizard target lives on
    // `plans.config.target_time` (see generate-run-plan); read that first, then goal/plan DB.
    // Goal id: race_courses / primary_event / plan link (resolveRunGoalIdForRace), else active plan's goal_id.
    try {
      const projGoalIdForRfp =
        resolvedRunGoalIdForRace ||
        (typeof activePlan?.goal_id === 'string' && activePlan.goal_id.trim() ? activePlan.goal_id.trim() : null);
      const planGoalSecForRfp =
        targetSecondsFromPlanConfig(activePlan?.config) ??
        (projGoalIdForRfp ? await resolveGoalTargetTimeSeconds(supabaseService, userId, projGoalIdForRfp) : null);

      console.log('[coach][rfp] projGoalIdForRfp:', projGoalIdForRfp, '| planGoalSecForRfp:', planGoalSecForRfp, '| resolvedRunGoalIdForRace:', resolvedRunGoalIdForRace, '| activePlan.goal_id:', activePlan?.goal_id ?? null);

      const planCfg = activePlan?.config as Record<string, unknown> | null | undefined;

      // Resolve goal row (may be null if goal was deleted but plan.goal_id not yet cleared).
      let gr: Record<string, unknown> | null = null;
      if (projGoalIdForRfp) {
        const { data: gRow } = await supabaseService
          .from('goals')
          .select('name, distance, target_date, target_time, sport, race_readiness_projection')
          .eq('id', projGoalIdForRfp)
          .eq('user_id', userId)
          .maybeSingle();
        gr = gRow ? (gRow as Record<string, unknown>) : null;
        if (!gr) console.log('[coach][rfp] goal row not found for projGoalIdForRfp:', projGoalIdForRfp);
      }

      // Build projection from goal row when available, otherwise fall back to plan config directly.
      // Plan Wizard stores distance/race_date/target_time in plans.config — no goal row required.
      const rfpGoalId = projGoalIdForRfp ?? activePlan?.id ?? null;
      const planDistance = planCfg?.distance ?? planCfg?.race_distance ?? null;
      const planRaceDate = planCfg?.race_date ? String(planCfg.race_date).slice(0, 10) : null;

      const finalDistance = gr?.distance != null ? String(gr.distance)
        : planDistance != null ? String(planDistance)
        : null;
      const finalTargetDate = gr?.target_date != null ? String(gr.target_date).slice(0, 10)
        : planRaceDate;
      const grTargetSec = gr?.target_time != null ? Number(gr.target_time) : null;
      const targetTimeForProj =
        grTargetSec != null && Number.isFinite(grTargetSec) && grTargetSec > 0
          ? grTargetSec
          : planGoalSecForRfp != null && planGoalSecForRfp > 0
            ? planGoalSecForRfp
            : null;
      const goalSportRaw = gr?.sport != null ? String(gr.sport) : (planCfg?.sport != null ? String(planCfg.sport) : null);
      const goalSportForProjection = (() => {
        if (!goalSportRaw) return null;
        const s = goalSportRaw.toLowerCase();
        if (s === 'triathlon' || s === 'multisport' || s === 'tri') return null;
        return goalSportRaw;
      })();

      if (rfpGoalId && finalDistance && finalTargetDate) {
        console.log('[coach][rfp] building projection:', { finalDistance, finalTargetDate, targetTimeForProj, goalSportForProjection, fromGoalRow: gr != null, 'mergedEffortPaces.steady': (mergedEffortPacesForRace as any)?.steady ?? null });
        raceFinishProjectionV1 = await buildRaceFinishProjectionV1(supabaseService, userId, {
          name: String(gr?.name ?? planCfg?.race_name ?? activePlan?.name ?? ''),
          distance: finalDistance,
          target_date: finalTargetDate,
          target_time: targetTimeForProj,
          sport: goalSportForProjection,
          race_readiness_projection: gr?.race_readiness_projection ?? null,
        }, rfpGoalId, planGoalSecForRfp, mergedEffortPacesForRace);
        console.log('[coach][rfp] result:', raceFinishProjectionV1 ? { source_kind: raceFinishProjectionV1.source_kind, anchor_display: raceFinishProjectionV1.anchor_display, fitness_projection_display: raceFinishProjectionV1.fitness_projection_display } : null);

        const goalRowIdPersist = gr != null && projGoalIdForRfp ? String(projGoalIdForRfp) : null;
        rfpMirrorForRaceReadiness = {
          id: gr?.id != null ? String(gr.id) : (projGoalIdForRfp || String(rfpGoalId)),
          name: String(gr?.name ?? planCfg?.race_name ?? activePlan?.name ?? ''),
          distance: finalDistance,
          target_date: finalTargetDate,
          target_time: targetTimeForProj,
          sport: goalSportForProjection,
          goal_row_id_for_persist: goalRowIdPersist,
        };
      } else {
        console.log('[coach][rfp] insufficient data — rfpGoalId:', rfpGoalId, '| finalDistance:', finalDistance, '| finalTargetDate:', finalTargetDate);
      }
    } catch (rfpErr: any) {
      console.warn('[coach] race_finish_projection_v1 failed (non-fatal):', rfpErr?.message ?? rfpErr);
    }

    // Primary readiness uses primary_event / plan-linked run goal only. RFP can still build from
    // plans.config — mirror those fields so State gets race_readiness.projection_display with the clock.
    if (!raceReadiness && rfpMirrorForRaceReadiness && raceFinishProjectionV1) {
      try {
        const mg = rfpMirrorForRaceReadiness;
        const sportL = String(mg.sport || '').toLowerCase();
        if (!sportL || sportL === 'run' || sportL === 'running') {
          const weeksOutVal = goalContext.upcoming_races.find(r => r.name === mg.name)?.weeks_out ?? 0;
          const planOwnsGoal = mg.id ? mergeActivePlanRaceConfigForGoal(mg.id) : false;
          const readinessDrivers = buildRaceReadinessDrivers({ reaction, norms28d });
          const easyRunType = runSessionTypes7d.find(rt => rt.type === 'easy' || rt.type === 'z2');
          const easyDecoupling = easyRunType?.avg_decoupling_pct ?? null;

          const targetTimeForReadiness = (() => {
            if (mg.target_time != null && Number.isFinite(Number(mg.target_time)) && Number(mg.target_time) > 0) {
              return Number(mg.target_time);
            }
            if (planOwnsGoal && activePlan?.config) {
              const t = targetSecondsFromPlanConfig(activePlan.config as Record<string, unknown>);
              if (t != null && t > 0) return t;
            }
            return null;
          })();

          const rrComputed = computeRaceReadiness({
            learnedFitness: learnedFitness || null,
            effortPaces: mergedEffortPacesForRace,
            performanceNumbers: arc.performance_numbers || null,
            primaryEvent: {
              id: mg.id,
              name: mg.name,
              distance: mg.distance,
              target_date: mg.target_date,
              target_time: targetTimeForReadiness,
              sport: mg.sport,
            },
            weeksOut: weeksOutVal,
            weeklyReadinessLabel: readinessState ?? null,
            readinessDrivers,
            hrDriftAvgBpm: reaction.hr_drift_avg_bpm,
            hrDriftNorm28dBpm: norms28d.hr_drift_avg_bpm,
            easyRunDecouplingPct: easyDecoupling,
          });
          raceReadiness = rrComputed
            ? {
              ...rrComputed,
              projection_display: buildRaceProjectionDisplay({
                rr: rrComputed,
                endurance: weeklyResponseModel.endurance,
              }),
            }
            : null;
        }
      } catch (mirrorErr: any) {
        console.warn('[coach] race readiness RFP mirror failed (non-fatal):', mirrorErr?.message ?? mirrorErr);
      }
    }

    // Persist projection so course-detail / course-strategy use the same finish time as State (SSoT).
    const goalIdForRaceProjPersist = runGoalForReadiness?.id ?? rfpMirrorForRaceReadiness?.goal_row_id_for_persist ?? null;
    if (raceReadiness && goalIdForRaceProjPersist) {
      try {
        const { error: projErr } = await supabaseService
          .from('goals')
          .update({
            race_readiness_projection: {
              predicted_finish_time_seconds: raceReadiness.predicted_finish_time_seconds,
              predicted_finish_display: raceReadiness.predicted_finish_display,
              updated_at: new Date().toISOString(),
            },
          })
          .eq('id', goalIdForRaceProjPersist)
          .eq('user_id', userId);
        if (projErr) console.warn('[coach] race_readiness_projection update failed:', projErr.message);
      } catch (e: any) {
        console.warn('[coach] race_readiness_projection update exception:', e?.message ?? e);
      }
    }

    // Single ability-based finish on the wire: anchor + fitness both = race_readiness.
    // buildRaceFinishProjectionV1 sets anchor from resolvePaceAnchorForCourse / lite computeRaceReadiness;
    // course-detail / terrain read anchor_*, State reads rr — they must match or users see ~10min splits.
    if (raceReadiness && raceFinishProjectionV1) {
      const sec = raceReadiness.predicted_finish_time_seconds;
      const disp = raceReadiness.predicted_finish_display;
      const planG = raceFinishProjectionV1.plan_goal_seconds;
      let mismatch: string | null = null;
      if (planG != null && Number.isFinite(planG) && Math.abs(planG - sec) > 30) {
        mismatch =
          sec > planG
            ? 'Projected time follows current training data; it can differ from the goal time you saved.'
            : 'Pacing uses the slower fitness-based time because your saved goal is faster than that estimate.';
      }
      raceFinishProjectionV1 = {
        ...raceFinishProjectionV1,
        anchor_seconds: sec,
        anchor_display: disp,
        source_kind: 'coach_readiness',
        fitness_projection_seconds: sec,
        fitness_projection_display: disp,
        mismatch_blurb: mismatch,
      };
    }

    const interference = latestSnapshot?.interference ?? null;

    // Plan adaptation suggestions (Phase 3): deload / add recovery when overreaching or fatigued
    const planAdaptationDismissed = (dismissed?.plan_adaptation as Record<string, string>) || {};
    const todayMs = new Date(asOfDate).getTime();
    const cooldownMs = 30 * 24 * 60 * 60 * 1000;
    const plan_adaptation_suggestions: Array<{ code: string; title: string; details: string }> = [];
    if (activePlan && !isPlanTransitionPeriod && (weekIntent !== 'recovery' && weekIntent !== 'taper')) {
      const addSuggestion = (code: string, title: string, details: string) => {
        const dismissedAt = planAdaptationDismissed[code];
        if (dismissedAt) {
          const d = new Date(dismissedAt).getTime();
          if (todayMs - d < cooldownMs) return;
        }
        plan_adaptation_suggestions.push({ code, title, details });
      };
      if (readinessState === 'overreached' || v.code === 'recover_overreaching') {
        addSuggestion(
          'deload',
          'Consider a deload week',
          "You're showing signs of overreaching. A deload or recovery week before continuing to build can help you absorb your gains.",
        );
      } else if (readinessState === 'fatigued' || v.code === 'caution_ramping_fast') {
        // Only surface the recovery suggestion when actual body signals confirm it.
        // If signals_concerning === 0 the body is handling the load fine — ACWR or
        // execution alone isn't enough to warrant a recovery prompt.
        const rm = weeklyResponseModel;
        const bodyConfirmed = rm.assessment.signals_concerning > 0
          || rm.assessment.label === 'overreaching';
        if (bodyConfirmed) {
          addSuggestion(
            'add_recovery',
            'Consider adding recovery',
            'Fatigue is elevated. Swap a quality session for easy or add a rest day this week.',
          );
        }
      }

      // Strength auto-progression suggestions from response model
      for (const lift of weeklyResponseModel.strength.per_lift) {
        if (!lift.sufficient) continue;
        if (lift.e1rm_trend === 'improving' && lift.e1rm_delta_pct != null && lift.e1rm_delta_pct >= 5) {
          const rirOk = lift.rir_current == null || lift.rir_current >= 2;
          if (rirOk) {
            addSuggestion(
              `str_prog_${lift.canonical_name}`,
              `Increase ${lift.display_name} weight`,
              `Your est. 1RM is up ${lift.e1rm_delta_pct.toFixed(0)}%${lift.e1rm_current ? ` (${lift.e1rm_current} ${wUnit})` : ''}. Working weight can increase.`,
            );
          }
        }
        if (lift.rir_trend === 'declining' && lift.rir_current != null && lift.rir_current < 1) {
          addSuggestion(
            `str_deload_${lift.canonical_name}`,
            `Reduce ${lift.display_name} weight`,
            `RIR has dropped to ${lift.rir_current.toFixed(1)} — you're grinding. A small deload helps.`,
          );
        }
      }
    }

    // Athlete-provided context (athleteContextStr computed earlier for training_state)

    // =========================================================================
    // ATHLETE SNAPSHOT — single source of truth for this week
    // =========================================================================
    let athleteSnapshot: AthleteSnapshot | null = null;
    let week_narrative: string | null = null;
    let longitudinalSignalsResult: Awaited<ReturnType<typeof computeLongitudinalSignals>> | null = null;
    try {
      const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');

      // Build the snapshot from data we already have
      const isImperialForSnapshot = (() => {
        try { return String(baselines?.performance_numbers?.units || '').toLowerCase() !== 'metric'; } catch { return true; }
      })();

      const dailyLedger = buildDailyLedger({
        weekStartDate,
        weekEndDate,
        asOfDate,
        plannedRows: plannedWeekArr,
        workoutRows: weekWorkouts,
        imperial: isImperialForSnapshot,
        userTz,
      });

      const goalRows = goalContext?.goals || [];
      const strengthLiftMaxes = (weeklyResponseModel?.strength?.per_lift || [])
        .filter((l: any) => l.e1rm_current != null)
        .map((l: any) => ({ name: l.display_name, e1rm: l.e1rm_current }));

      const snapshotIdentity = buildIdentity({
        goals: goalRows,
        baselines,
        strengthLifts: strengthLiftMaxes,
        imperial: isImperialForSnapshot,
        asOfDate,
      });

      const snapshotPlanPosition = buildPlanPosition({
        activePlan: activePlan,
        allPlans: allActivePlans,
        weekStartDate,
        planContract: activePlan?.config?.plan_contract_v1 || null,
        weekTotalLoadPlanned: plannedWeekTotalLoad || 0,
      });

      const snapshotNorms = {
        // D-237 (no silent impersonation): there is NO stored easy-HR-at-pace norm —
        // only hr_drift_avg_bpm (a within-session drift DELTA) exists. The prior code
        // fabricated `140 + drift`, a made-up population constant plus a dimensionally
        // wrong delta, then surfaced it as "N bpm above YOUR norm for this pace". Refuse:
        // null → the observer emits "HR X bpm." with no false norm claim (matching
        // workout-detail, which already passes null). Restore a real value only if/when
        // an actual easy-HR-at-pace baseline is computed + stored.
        easy_hr_at_pace: null,
        threshold_pace_sec_per_mi: null,
        avg_execution_score: baselines?.norms_28d?.execution_score_avg ?? null,
        avg_rpe: baselines?.norms_28d?.session_rpe_avg ?? null,
        avg_hr_drift_bpm: baselines?.norms_28d?.hr_drift_avg_bpm ?? null,
        avg_decoupling_pct: null,
        avg_rir: baselines?.norms_28d?.strength_rir_avg ?? null,
      };

      const loadPct = (plannedWtdLoad > 0)
        ? Math.round(((actualWtdLoad - plannedWtdLoad) / plannedWtdLoad) * 100)
        : null;

      const snapshotBody = buildBodyResponse(
        dailyLedger,
        snapshotNorms,
        isImperialForSnapshot,
        { actual_vs_planned_pct: loadPct, acwr: acwr ?? null, running_acwr: runningAcwr, cycling_acwr: cyclingAcwr },
        {
          interference: weeklyResponseModel?.cross_domain?.interference_detected || false,
          detail: weeklyResponseModel?.cross_domain?.patterns?.[0]?.description || 'No interference detected.',
        },
        weekIntent,
        disciplineProfiles.map(p => ({ discipline: p.discipline, maturity: p.maturity, sessions_28d: p.sessions_28d })),
      );

      // ── Reconcile load_status with body signals + plan context ─────────
      {
        const weeksOut = goalContext.upcoming_races?.[0]?.weeks_out ?? null;
        const next48hEnd = addDaysISO(asOfDate, 2);
        const keysNext48h = keySessionsRemaining.filter(
          (s: any) => s.date <= next48hEnd && s.date >= asOfDate
        );
        const unplannedWorkouts = (weekWorkouts || []).filter(
          (w: any) => String(w?.workout_status || '').toLowerCase() === 'completed' && !w?.planned_id
        );
        const unplannedTotalLoad = unplannedWorkouts.reduce(
          (sum: number, w: any) => sum + (Number(w?.workload_actual) || 0), 0
        );
        // ── Item 3 (D-265): Key-2 absorption → two-key cap + BODY-row RESPONSE ──
        const trendSig = (t: { trend: string; based_on_sessions: number }) => ({
          available: t.based_on_sessions >= 2,
          elevated: t.based_on_sessions >= 2 && t.trend === 'declining',
          strong: false, // v1: effort/ledger are direction-only (no magnitude tier) → cannot solo-escalate
        });
        // anchorThin from LTHR confidence (Q-146): low/absent → thin (describes, never solo-escalates / no baseline).
        const _lthrConf = String((learnedFitness as any)?.run_threshold_hr?.confidence || '');
        const anchorThin = _lthrConf !== 'medium' && _lthrConf !== 'high';
        // This week's easy runs → mean HR drift, gate-filtered per-session (intent-easy proxy =
        // below-threshold HR; non-negative drift) BEFORE the mean, so it inherits the gate's honesty.
        const _easyRunDrifts = dailyLedger
          .flatMap((d: any) => d.actual || [])
          .filter((a: any) => String(a?.type || '').toLowerCase().startsWith('run')
            && a?.hr_drift_bpm != null && Number(a.hr_drift_bpm) >= 0
            && a?.avg_hr != null && lthrForBins != null && Number(a.avg_hr) < lthrForBins)
          .map((a: any) => Number(a.hr_drift_bpm));
        const _meanDrift = _easyRunDrifts.length
          ? Math.round((_easyRunDrifts.reduce((x: number, y: number) => x + y, 0) / _easyRunDrifts.length) * 10) / 10
          : null;
        const absorption = assessAbsorption({
          effort: trendSig(snapshotBody.weekly_trends.effort_perception),
          ledger: trendSig(snapshotBody.weekly_trends.strength),
          driftSession: _meanDrift != null ? { intentEasy: true, hrDriftBpm: _meanDrift, anchorThin } : null,
          typicalSteadyDriftBpm: null, // v1 cold-start: historical gate-passing baseline deferred (correct for a thin anchor anyway)
          safetyFloor: computeSafetyFloor(snapshotBody.weekly_trends, readinessState),
        });

        // D-267/D-268: plan-primary + adherence resolved ONCE above (single source, D-264). Fed into
        // the reconciler here (sole verdict authority — D-260).
        const reconciled = reconcileLoadStatus(
          {
            status: snapshotBody.load_status.status,
            interpretation: snapshotBody.load_status.interpretation,
            running_acwr: snapshotBody.load_status.running_acwr,
            actual_vs_planned_pct: snapshotBody.load_status.actual_vs_planned_pct,
          },
          snapshotBody.weekly_trends,
          readinessState,
          {
            weekIntent,
            weekIndex,
            totalWeeks: activePlan?.duration_weeks ?? null,
            weeksOut,
            isPlanTransition: isPlanTransitionPeriod,
            planPrimary,
            primaryAdherence,
          },
          acwr ?? null,
          keysNext48h,
          {
            count: unplannedWorkouts.length,
            totalLoad: unplannedTotalLoad,
            plannedWeekLoad: plannedWtdLoad || 0,
          },
          snapshotBody.load_status.run_only_week_load_pct ?? null,
          disciplineProfiles.map(p => ({ discipline: p.discipline, maturity: p.maturity, acwr: p.acwr })),
          isSpikeOnEmptyBase,
          absorption.corroborated_strain, // Item 3 (D-265): the two-key cap — ESCALATION path (separate from the BODY row)
        );
        snapshotBody.load_status.status = reconciled.status;
        snapshotBody.load_status.interpretation = reconciled.interpretation;
        (snapshotBody.load_status as any).acwr_provisional = reconciled.acwrProvisional; // thin-base ratio flag
        // Path 2 (separate, per the pin): the RESPONSE describes the BODY row INDEPENDENT of status.
        (snapshotBody.load_status as any).absorption = absorption;
      }
      // D-237 Stage 2: append the estimated-load disclosure to the load receipt when a
      // meaningful fraction of the window load is a low-trust estimate. A declared estimate,
      // not a correction — the ratio math is honest; the substrate is flagged as soft.
      if (loadEstimatedText) {
        snapshotBody.load_status.interpretation =
          `${snapshotBody.load_status.interpretation} ${loadEstimatedText}`.trim();
        (snapshotBody.load_status as any).load_estimated = {
          disclose: true,
          chronic_pct: loadEstimatedDisclosure.chronicPct,
          estimated_count: loadEstimatedDisclosure.estimatedCount,
          text: loadEstimatedText,
        };
      }

      // Upcoming sessions with full prescription
      const upcomingDays = dailyLedger
        .filter(d => !d.is_past && !(d.is_today && d.actual.length > 0))
        .filter(d => d.planned.length > 0)
        .map(d => ({
          date: d.date,
          day_name: d.day_name,
          sessions: d.planned.map(p => ({
            ...p,
            is_key_session: keyCategoryForPlanned(
              plannedWeekArr.find((r: any) => String(r?.id) === p.planned_id) || {},
              methodologyCtx, methodologyId,
            ) !== 'other',
          })),
        }));

      const partialSnapshot: Omit<AthleteSnapshot, 'coaching'> = {
        version: 1,
        generated_at: new Date().toISOString(),
        user_id: userId,
        as_of_date: asOfDate,
        week_start_date: weekStartDate,
        week_end_date: weekEndDate,
        identity: snapshotIdentity,
        plan_position: snapshotPlanPosition,
        daily_ledger: dailyLedger,
        body_response: snapshotBody,
        upcoming: upcomingDays,
      };

      // Generate coaching narrative from the snapshot
      let coaching: AthleteSnapshot['coaching'] = {
        headline: snapshotBody.load_status.status === 'high' ? 'High load — protect recovery'
          : snapshotBody.load_status.status === 'elevated' ? 'Load is building'
          : 'On track',
        narrative: '',
        next_session_guidance: null,
      };
      let earlyRunAdherenceArtifact = false;

      // Detect real non-IF load concerns (unplanned sessions, declining body,
      // race proximity) that should NOT be suppressed by the IF-artifact heuristic.
      const hasRealLoadConcerns = (() => {
        const unplanned = (weekWorkouts || []).filter(
          (w: any) => String(w?.workout_status || '').toLowerCase() === 'completed' && !w?.planned_id
        );
        const unplannedPts = unplanned.reduce((s: number, w: any) => s + (Number(w?.workload_actual) || 0), 0);
        if (unplannedPts > 50) return true;
        const epTrend = snapshotBody?.weekly_trends?.effort_perception;
        if (epTrend?.trend === 'declining' && (epTrend?.based_on_sessions ?? 0) >= 2) return true;
        const rqTrend = snapshotBody?.weekly_trends?.run_quality;
        if (rqTrend?.trend === 'declining' && (rqTrend?.based_on_sessions ?? 0) >= 2) return true;
        const raceWeeksOut = goalContext.upcoming_races?.[0]?.weeks_out;
        if (raceWeeksOut != null && raceWeeksOut <= 3 && acwr != null && acwr > 1.3) return true;
        return false;
      })();

      try {
        longitudinalSignalsResult = await computeLongitudinalSignals(supabase, userId, asOfDate, 6);
      } catch (longErr: any) {
        console.warn('[coach] longitudinal signals failed (non-fatal):', longErr?.message || longErr);
      }

      if (anthropicKey) {
        try {
          // Build session interpretations from persisted session_detail_v1 (chronological).
          // Include ALL completed workouts: full interpretation when available, minimal stub when not (avoids LLM gap).
          const completedWorkouts = (Array.isArray(weekWorkouts) ? weekWorkouts : [])
            .filter((w: any) => String(w?.workout_status || '').toLowerCase() === 'completed')
            .map((w: any) => {
              const wa = typeof w?.workout_analysis === 'object' ? w.workout_analysis : (() => { try { return w?.workout_analysis ? JSON.parse(w.workout_analysis) : null; } catch { return null; } })();
              const sd = wa?.session_detail_v1;
              const date = String(w?.__local_date || w?.date || '').slice(0, 10);
              const dayEntry = dailyLedger.find((d: any) => d.date === date);
              const dur = w?.moving_time ?? w?.duration ?? null;
              const durMin = typeof dur === 'number' ? (dur < 1000 ? Math.round(dur) : Math.round(dur / 60)) : null;
              const type = String(w?.type || sd?.type || 'workout');
              const name = String(w?.name || sd?.name || type);
              if (sd) {
                return {
                  date,
                  day_name: dayEntry?.day_name ?? null,
                  name,
                  type,
                  narrative_text: sd?.narrative_text ?? null,
                  session_interpretation: sd?.session_interpretation ?? null,
                  has_interpretation: true,
                  __sort: `${date} ${String(w?.timestamp || '')}`,
                } as SessionInterpretationForPrompt & { has_interpretation: boolean; __sort: string };
              }
              // Stub for workouts without stored interpretation — LLM knows something happened
              return {
                date,
                day_name: dayEntry?.day_name ?? null,
                name,
                type,
                narrative_text: `No session interpretation available — ${type}${durMin != null ? `, ${durMin} min` : ''}. See raw signals in the ledger above.`,
                session_interpretation: null,
                has_interpretation: false,
                __sort: `${date} ${String(w?.timestamp || '')}`,
              } as SessionInterpretationForPrompt & { has_interpretation: boolean; __sort: string };
            })
            .sort((a, b) => (a as any).__sort.localeCompare((b as any).__sort));
          const sessionInterpretations: SessionInterpretationForPrompt[] = completedWorkouts.map(({ __sort, has_interpretation, ...rest }) => rest);

          // Adaptation trajectory: multi-week lookback from normWorkouts (28d)
          let adaptationBlock: string | null = null;
          try {
            const adaptationInputs: AdaptationInput[] = (Array.isArray(normWorkouts) ? normWorkouts : [])
              .filter((w: any) => String(w?.workout_status || '').toLowerCase() === 'completed')
              .map((w: any) => {
                const exRaw = (w as any)?.strength_exercises;
                const exArr = Array.isArray(exRaw) ? exRaw : (typeof exRaw === 'string' ? (() => { try { return JSON.parse(exRaw); } catch { return []; } })() : []);
                const dur = Number(w?.moving_time ?? w?.duration ?? 0);
                const dist = Number(w?.distance ?? 0);
                const durSec = dur > 0 ? (dur < 1000 ? Math.round(dur * 60) : Math.round(dur)) : null;
                const distM = dist > 0 ? Math.round(dist * 1000) : null;
                const paceSec = (distM && distM > 0 && durSec && durSec > 0)
                  ? durSec / (distM / 1609.34) : null;
                return {
                  date: String(w?.date || '').slice(0, 10),
                  type: String(w?.type || ''),
                  name: String(w?.name || ''),
                  avg_hr: Number(w?.avg_hr || w?.average_heartrate) || null,
                  pace_sec_per_unit: paceSec,
                  duration_seconds: durSec,
                  rpe: Number(w?.session_rpe || w?.rpe) || null,
                  exercises: exArr.length > 0 ? exArr.map((ex: any) => {
                    const sets = Array.isArray(ex?.sets) ? ex.sets : [];
                    const weights = sets.map((s: any) => Number(s?.weight) || 0).filter((v: number) => v > 0);
                    const rirs = sets.map((s: any) => Number(s?.rir)).filter((r: number) => Number.isFinite(r));
                    return {
                      name: String(ex?.name || ''),
                      best_weight: weights.length ? Math.max(...weights) : 0,
                      avg_rir: rirs.length ? rirs.reduce((a: number, b: number) => a + b, 0) / rirs.length : null,
                      unit: isImperialForSnapshot ? 'lbs' : 'kg',
                    };
                  }) : null,
                } as AdaptationInput;
              });
            const signals = assessAdaptation(adaptationInputs);
            adaptationBlock = adaptationSignalsToPrompt(signals);
          } catch (adaptErr: any) {
            console.warn('[coach] adaptation assessment failed (non-fatal):', adaptErr?.message || adaptErr);
          }

          // Longitudinal patterns (same DB result as weekly_state) are appended after adaptation
          // trajectory for the weekly LLM, with swim_intent-aware ordering/filtering for tri goals.

          // Early artifact detection — needed before generateCoaching so the LLM prompt
          // can suppress spike language when run sessions hit planned duration/distance.
          if (plannedWtdLoad > 0 && actualWtdLoad >= 0) {
            const earlyLoadDeltaPct = Math.round(((actualWtdLoad - plannedWtdLoad) / plannedWtdLoad) * 100);
            if (earlyLoadDeltaPct > 15) {
              const earlyRunSessions = (Array.isArray(weekWorkouts) ? weekWorkouts : [])
                .filter((w: any) => String(w?.workout_status || '').toLowerCase() === 'completed' && normalizeType(w?.type) === 'run');
              if (earlyRunSessions.length > 0) {
                const earlyChecks = earlyRunSessions.map((w: any) => {
                  const pid = w?.planned_id != null ? String(w.planned_id) : null;
                  const localDate = String(w?.__local_date || w?.date || '').slice(0, 10);
                  const matched = pid
                    ? plannedWtdArr.find((p: any) => String(p?.id) === pid)
                    : plannedWtdArr.find((p: any) => String(p?.date || '').slice(0, 10) === localDate && normalizeType(p?.type) === 'run');
                  if (!matched) return null;
                  const pDurSec = safeNum(matched?.total_duration_seconds);
                  const wDurSec = (() => { const raw = safeNum(w?.moving_time); if (raw == null) return null; return raw < 1000 ? Math.round(raw * 60) : Math.round(raw); })();
                  const pDistM = safeNum(matched?.computed?.total_distance_meters) ?? safeNum(matched?.computed?.distance_meters);
                  const wDistM = safeNum(w?.distance) != null ? Math.round(safeNum(w?.distance)! * 1000) : null;
                  return { durPct: pDurSec && wDurSec ? wDurSec / pDurSec : null, distPct: pDistM && wDistM ? wDistM / pDistM : null };
                }).filter(Boolean) as Array<{ durPct: number | null; distPct: number | null }>;
                if (earlyChecks.length > 0 && earlyChecks.every((c: any) =>
                  (c.durPct == null || (c.durPct >= 0.85 && c.durPct <= 1.15)) &&
                  (c.distPct == null || (c.distPct >= 0.85 && c.distPct <= 1.15))
                )) {
                  earlyRunAdherenceArtifact = true;
                }
              }
            }
          }

          const weeklySwimYds703 = sumPlannedWeekSwimYards(plannedWeekArr);
          const pc703 = planConfig as Record<string, unknown> | null | undefined;
          const contract703 = pc703?.plan_contract_v1 as Record<string, unknown> | undefined;
          const swimCut703 = contract703?.swim_cutoff_pressure_v1 as Record<string, unknown> | undefined;
          const primary703Dist =
            goalContext.primary_event && isTriGoalLite(goalContext.primary_event)
              ? goalContext.primary_event.distance
              : null;
          const swimSec703 = swimSecPer100YdFromArcSwimInputs({
            performance_numbers: arc.performance_numbers,
            learned_fitness: arc.learned_fitness,
            units: arc.units,
          });
          const swimExp703 = deriveTriSwimExperienceForCoach(goalContext, activePlan?.goal_id ?? null);
          const olympic703Block = (() => {
            const lines = olympic703BridgePivotCoachLines({
              primaryTriDistance: primary703Dist,
              weeklySwimYards: weeklySwimYds703,
              swimCutoffPressureV1: swimCut703,
              swimIntent: triSwimIntent,
              swimSecPer100Yd: swimSec703,
              swimExperience: swimExp703,
            });
            return lines.length ? lines.join('\n') : null;
          })();
          const strongLean703Block = (() => {
            const lines = strong703LeanMaintenanceCoachLines({
              primaryTriDistance: primary703Dist,
              weeklySwimYards: weeklySwimYds703,
              swimSecPer100Yd: swimSec703,
              swimExperience: swimExp703,
              swimIntent: triSwimIntent,
            });
            return lines.length ? lines.join('\n') : null;
          })();

          const coachingLongitudinalBlock = [
            adaptationBlock,
            longitudinalPatternsText.trim() || null,
            olympic703Block,
            strongLean703Block,
          ]
            .filter((x): x is string => Boolean(x && String(x).trim()))
            .join('\n\n') || null;

          coaching = await generateCoaching(partialSnapshot, anthropicKey, {
            sessionInterpretations,
            longitudinalBlock: coachingLongitudinalBlock,
            suppressRunLoadSpike: earlyRunAdherenceArtifact && !hasRealLoadConcerns,
            priorComparableRaceBlock: coachPromptPriorRaceBlock(goalRows, asOfDate) ?? undefined,
            // D-191: week-scoped grounding for the shared narrative core. fitness_direction is the spine
            // verdict (rollupFitnessDirection) — the Rule-5 grounding; numbers untouched, prose-only.
            weekContext: {
              fitness_direction: fitnessDirection ?? null,
              load_status: (partialSnapshot as any)?.body_response?.load_status ?? null,
              readiness_state: readinessState ?? null,
              weekly_trends: (partialSnapshot as any)?.body_response?.weekly_trends ?? null,
            },
          });
        } catch (llmErr: any) {
          console.warn('[coach] snapshot coaching generation failed:', llmErr?.message || llmErr);
        }
      }

      athleteSnapshot = { ...partialSnapshot, coaching };

      // Patch load bar when run load delta is an IF calculation artifact.
      // The bar reads body_response.load_status — without this patch it shows
      // the elevated dot and "68% above plan" text even when the narrative is correct.
      // Skip the override when real non-IF load sources exist (unplanned sessions,
      // declining body signals, race proximity escalation) — those concerns are
      // genuine even when individual run durations/distances hit the plan.
      if (earlyRunAdherenceArtifact && !hasRealLoadConcerns && athleteSnapshot?.body_response?.load_status) {
        const ls = athleteSnapshot.body_response.load_status;
        const crossTrainingNote = ls.cross_training_load_summary ? ` Cross-training: ${ls.cross_training_load_summary}` : '';
        athleteSnapshot = {
          ...athleteSnapshot,
          body_response: {
            ...athleteSnapshot.body_response,
            load_status: {
              ...ls,
              status: 'on_target' as const,
              interpretation: `Running load on target.${crossTrainingNote}`,
            },
          },
        };
      }

      week_narrative = coaching.narrative || null;

    } catch (snapErr: any) {
      console.warn('[coach] athlete snapshot failed, falling back to legacy:', snapErr?.message || snapErr);
    }

    // Legacy narrative fallback — only if snapshot failed
    if (!week_narrative) try {
      const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
      if (anthropicKey) {
        const narrativeFacts: string[] = [];
        let routeInsightLine: string | null = null;

        // Regular routes intelligence (course-specific progression)
        try {
          const { data: routeWeekRows } = await supabase
            .from('route_progress_metrics')
            .select('route_cluster_id,metric_date,effort_adjusted_pace_sec_per_km,avg_pace_sec_per_km,improvement_score,confidence_score,distance_m')
            .eq('user_id', userId)
            .gte('metric_date', weekStartDate)
            .lte('metric_date', weekEndDate)
            .order('metric_date', { ascending: false })
            .limit(30);

          const weekRouteRows = Array.isArray(routeWeekRows) ? routeWeekRows : [];
          const routeIds = Array.from(new Set(weekRouteRows.map((r: any) => String(r.route_cluster_id || '')).filter(Boolean)));
          if (routeIds.length > 0) {
            const [{ data: clusterRows }, { data: priorRows }] = await Promise.all([
              supabase
                .from('route_clusters')
                .select('id,name')
                .eq('user_id', userId)
                .in('id', routeIds),
              supabase
                .from('route_progress_metrics')
                .select('route_cluster_id,effort_adjusted_pace_sec_per_km,metric_date')
                .eq('user_id', userId)
                .in('route_cluster_id', routeIds)
                .lt('metric_date', weekStartDate)
                .gte('metric_date', addDaysISO(weekStartDate, -84))
                .order('metric_date', { ascending: false }),
            ]);

            const nameById = new Map<string, string>();
            for (const c of (Array.isArray(clusterRows) ? clusterRows : [])) {
              nameById.set(String((c as any)?.id || ''), String((c as any)?.name || 'regular route'));
            }

            const summarize = routeIds.slice(0, 2).map((rid) => {
              const nowRows = weekRouteRows.filter((r: any) => String(r.route_cluster_id) === rid);
              const prevVals = (Array.isArray(priorRows) ? priorRows : [])
                .filter((r: any) => String(r.route_cluster_id) === rid)
                .map((r: any) => safeNum((r as any).effort_adjusted_pace_sec_per_km))
                .filter((n: number | null): n is number => n != null)
                .slice(0, 6);
              const nowVals = nowRows
                .map((r: any) => safeNum((r as any).effort_adjusted_pace_sec_per_km))
                .filter((n: number | null): n is number => n != null);
              if (!nowVals.length || !prevVals.length) return null;
              const nowAvg = nowVals.reduce((a, b) => a + b, 0) / nowVals.length;
              const prevAvg = prevVals.reduce((a, b) => a + b, 0) / prevVals.length;
              if (prevAvg <= 0) return null;
              const pct = ((prevAvg - nowAvg) / prevAvg) * 100;
              const routeName = nameById.get(rid) || 'regular route';
              const direction = pct >= 0 ? 'faster' : 'slower';
              const magnitude = Math.abs(pct);
              const conf = nowRows
                .map((r: any) => safeNum((r as any).confidence_score))
                .filter((n: number | null): n is number => n != null);
              const confAvg = conf.length ? (conf.reduce((a, b) => a + b, 0) / conf.length) : null;
              return `${routeName}: ${magnitude.toFixed(1)}% ${direction}${confAvg != null ? ` (confidence ${Math.round(confAvg * 100)}%)` : ''}`;
            }).filter(Boolean) as string[];

            if (summarize.length) {
              routeInsightLine = `REGULAR ROUTE PROGRESS: ${summarize.join('; ')}.`;
            }
          }
        } catch (routeErr) {
          console.warn('[coach] route progression summary failed (non-fatal):', (routeErr as any)?.message || routeErr);
        }

        // Narrative facts are built from the same canonical weekly inputs used for
        // deterministic state. Do not read parallel fact pipelines here.
        let runAdherenceArtifact = false; // hoisted so per-workout loop can suppress IF load comparisons
        const completedNarrativeWorkouts = (Array.isArray(weekWorkouts) ? weekWorkouts : [])
          .filter((w: any) => String(w?.workout_status || '').toLowerCase() === 'completed')
          .sort((a: any, b: any) => {
            const da = String(a?.__local_date || a?.date || '');
            const db = String(b?.__local_date || b?.date || '');
            if (da !== db) return da.localeCompare(db);
            return String(a?.timestamp || '').localeCompare(String(b?.timestamp || ''));
          });

        // Deterministic completed-session count + list — anchors the narrative so it can't
        // undercount or omit a completed session (the LLM listed 3 of 4, dropping an off-plan ride).
        // Off-plan completed sessions are real training and must be credited, not erased.
        if (completedNarrativeWorkouts.length > 0) {
          const compList = completedNarrativeWorkouts.map((w: any) => {
            const d = String(w?.__local_date || w?.date || '').slice(0, 10);
            return `${d} ${normalizeType(w?.type)}${w?.planned_id ? '' : ' (off-plan)'}`;
          }).join(', ');
          narrativeFacts.push(`COMPLETED THIS WEEK — ${completedNarrativeWorkouts.length} sessions (count ALL of these, including off-plan, which IS real training — do not undercount, omit, or frame off-plan work as "behind"): ${compList}.`);
        }

        // Athlete-provided context (highest priority — never guess over this)
        if (athleteContextStr) {
          narrativeFacts.unshift(`ATHLETE SAYS (use this, do not guess): ${athleteContextStr}`);
        }

        const legacyPriorRaceLine = coachLegacyPriorRaceLine(goalContext?.goals || [], asOfDate);
        if (legacyPriorRaceLine) narrativeFacts.push(legacyPriorRaceLine);

        // Plan context
        if (activePlan) {
          const planName = activePlan.name || 'training plan';
          const totalWeeks = activePlan.duration_weeks || null;
          // D-232: pre-start plans are narrated as pre-start, never as "week 1 in-block".
          const planStartIso = planWeek1StartIso(planConfig);
          const planStartDisplay = planStartIso
            ? parseISODateOnly(planStartIso).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
            : null;
          const planLine = buildPlanContextLine({
            planName,
            totalWeeks,
            weekIndex,
            weekIntent: weekIntent && weekIntent !== 'unknown' ? weekIntent : null,
            hasStarted: planActiveNow,
            planStartDisplay,
          });
          narrativeFacts.push(planLine);
          // D-268 Phase 3: tell the model the plan's PRIMARY discipline so the prose frames load and
          // adherence around it, not running. Strength-primary: strength is the priority, endurance is support.
          if (planPrimary === 'strength') {
            const strengthState = primaryAdherence == null ? ''
              : primaryAdherence.met ? ` ${primaryAdherence.note} — strength on plan.`
              : ` ${primaryAdherence.note} — strength behind plan (the real miss this week).`;
            narrativeFacts.push(
              `PLAN PRIMARY — STRENGTH: This is a strength-primary plan. Strength is the athlete's PRIORITY; running/cycling/swimming are SUPPORT (endurance base). Frame load, adherence, and "on/off plan" around STRENGTH — a light or swapped running week is NOT "behind plan," it is deliberate. Do NOT tell the athlete to run more or describe the week as a running shortfall.${strengthState}`,
            );
          }

          // Multi-event: surface each secondary active plan with its own race date + phase
          if (secondaryPlans.length > 0) {
            narrativeFacts.push(`MULTI-EVENT ATHLETE: training for ${allActivePlans.length} events simultaneously.`);
            for (const sp of secondaryPlans) {
              const spName = sp.config?.race_name || sp.name || 'event';
              const spSport = sp.config?.sport || sp.config?.plan_type || 'sport';
              const spDist  = sp.config?.distance || sp.config?.race_distance || null;
              const spRace  = sp.config?.race_date ? new Date(sp.config.race_date).toDateString() : null;
              const spWeeks = sp.duration_weeks ?? null;
              const spWkIdx = computeWeekIndex(sp.config, asOfDate, 'Monday' as any, spWeeks);
              const spPhase = weekIntentFromContract(sp.config, spWkIdx)?.intent ?? 'unknown';
              let spLine = `ALSO TRAINING FOR: "${spName}"`;
              if (spDist) spLine += ` (${spDist} ${spSport})`;
              if (spRace) spLine += ` on ${spRace}`;
              if (spWkIdx != null) spLine += ` — week ${spWkIdx} of ${spWeeks ?? '?'}`;
              if (spPhase !== 'unknown') spLine += ` (${spPhase} phase)`;
              narrativeFacts.push(spLine + '.');
            }
            narrativeFacts.push('When coaching, address how this week serves BOTH events. Flag any sessions this week that build toward the secondary event. Do not suggest adding extra sessions — all sessions from all plans are already included in the session list.');
          }

          // Triathlon / multi-sport methodology context
          // This is critical: without it, the LLM gives generic "push harder" advice
          // to a completion athlete who is intentionally staying in Zone 3.
          const triMethodFact = triMethodologyFact(planConfig, allActivePlans);
          if (triMethodFact) narrativeFacts.push(triMethodFact);

          narrativeFacts.push('IMPORTANT: There is an active training plan. Do NOT suggest adding extra sessions. If sessions were missed, suggest hitting the planned sessions next week. If suggesting changes, frame them as adjustments within the existing plan.');
          if (isPlanTransitionPeriod) {
            narrativeFacts.push(`NOTE: This is an early week of a new plan (within the first 2 weeks). The 7-day load ratio and 28-day baseline both overlap with the previous training cycle, so any "overreaching" or elevated load signals are unreliable artifacts of the plan transition — do NOT flag load as elevated or suggest recovery based on the load ratio. Focus exclusively on execution quality of the planned sessions and whether the athlete feels good.`);
          }
        } else {
          if (goalContext.upcoming_races.length > 0) {
            const raceLines = goalContext.upcoming_races.map(r =>
              `"${r.name}" (${r.distance} ${r.sport}) on ${r.date} — ${r.weeks_out} weeks away${r.has_plan ? '' : ' (NO plan generated yet)'}`,
            );
            narrativeFacts.push(`The athlete is NOT on a structured plan but has upcoming goals:\n${raceLines.join('\n')}`);
            narrativeFacts.push('Since there is no plan, suggest creating one for their nearest event. In the meantime, provide general training guidance based on their goal timeline and current fitness.');
          } else {
            narrativeFacts.push('The athlete is NOT on a structured plan and has no active goals. Suggestions for adding or adjusting sessions are appropriate.');
          }
        }

        if (goalContext.upcoming_races.length > 0 && activePlan) {
          const unplannedRaces = goalContext.upcoming_races.filter(r => !r.has_plan);
          if (unplannedRaces.length > 0) {
            narrativeFacts.push(`UNPLANNED EVENTS: ${unplannedRaces.map(r => `"${r.name}" (${r.weeks_out} weeks out)`).join(', ')} — no training plan exists for these yet.`);
          }
        }

        // Session completion counts
        const totalDue = reaction.key_sessions_planned;
        const linked = reaction.key_sessions_linked;
        const missed = reaction.key_sessions_gaps;
        const extra = reaction.extra_sessions;
        const completionPct = totalDue > 0 ? Math.round((linked / totalDue) * 100) : null;
        narrativeFacts.push(
          `Session completion: ${linked} of ${totalDue} planned sessions done` +
          (completionPct !== null ? ` (${completionPct}%)` : '') +
          (missed > 0 ? `, ${missed} missed` : '') +
          (extra > 0 ? `, ${extra} extra unplanned sessions` : '') +
          '.'
        );

        // Load delta — only when both sides are TRIMP-based (plannedWtdLoad > 0 means
        // the plan was activated after the TRIMP fix; zero means old duration-estimate
        // data which cannot be compared to actual TRIMP load).
        if (plannedWtdLoad > 0 && actualWtdLoad >= 0) {
          const loadDeltaPct = Math.round(((actualWtdLoad - plannedWtdLoad) / plannedWtdLoad) * 100);

          // Check run session duration/distance adherence to detect TRIMP calculation artifacts.
          // When sessions are on-target by duration+distance, a large TRIMP delta is an IF mismatch,
          // not a real training spike. Only flag as "running hot" if sessions actually ran long.
          const runSessions = completedNarrativeWorkouts.filter((w: any) => normalizeType(w?.type) === 'run');
          if (loadDeltaPct > 15 && runSessions.length > 0) {
            const runAdherenceChecks = runSessions.map((w: any) => {
              // Read-only lookup — does not consume usedPlannedIds (softMatchPlanned not available yet)
              const pid = w?.planned_id != null ? String(w.planned_id) : null;
              const localDate = String(w?.__local_date || w?.date || '').slice(0, 10);
              const matched = pid
                ? plannedWtdArr.find((p: any) => String(p?.id) === pid)
                : plannedWtdArr.find((p: any) =>
                    String(p?.date || '').slice(0, 10) === localDate &&
                    normalizeType(p?.type) === 'run'
                  );
              if (!matched) return null;
              const pDurSec = safeNum(matched?.total_duration_seconds);
              const wDurSec = (() => {
                const raw = safeNum((w as any)?.moving_time);
                if (raw == null) return null;
                return raw < 1000 ? Math.round(raw * 60) : Math.round(raw);
              })();
              const pDistM = safeNum(matched?.computed?.total_distance_meters) ?? safeNum(matched?.computed?.distance_meters);
              const wDistM = safeNum((w as any)?.distance) != null ? Math.round(safeNum((w as any)?.distance)! * 1000) : null;
              const durPct = pDurSec && wDurSec ? wDurSec / pDurSec : null;
              const distPct = pDistM && wDistM ? wDistM / pDistM : null;
              return { durPct, distPct };
            }).filter(Boolean) as Array<{ durPct: number | null; distPct: number | null }>;

            // If all matched run sessions were within 15% of planned duration AND distance, flag as artifact
            const allOnTarget = runAdherenceChecks.length > 0 && runAdherenceChecks.every(c =>
              (c.durPct == null || (c.durPct >= 0.85 && c.durPct <= 1.15)) &&
              (c.distPct == null || (c.distPct >= 0.85 && c.distPct <= 1.15))
            );
            if (allOnTarget) runAdherenceArtifact = true;
          }

          const loadLabel = runAdherenceArtifact
            ? 'TRIMP delta is likely an intensity-factor calculation artifact — run sessions hit planned duration and distance, do NOT headline as a spike'
            : loadDeltaPct > 15
              ? 'running hot — push recovery emphasis'
              : loadDeltaPct < -15
                ? 'running light — room to add stress if feeling good'
                : 'on target';

          narrativeFacts.push(
            `Weekly TRIMP load (ALL DISCIPLINES combined, week-to-date through today): planned ${Math.round(plannedWtdLoad)} pts, actual ${Math.round(actualWtdLoad)} pts` +
            ` (${loadDeltaPct > 0 ? '+' : ''}${loadDeltaPct}% vs plan) — ${loadLabel}. ` +
            'Do not label this figure "running load" unless you are clearly tying it to run SESSION lines; a missed strength session alone does not explain a shortfall in this combined number.',
          );
        }
        if (routeInsightLine) narrativeFacts.push(routeInsightLine);
        if (recoverySignaledExtrasCount > 0) {
          narrativeFacts.push(`ATHLETE SIGNALED RECOVERY: ${recoverySignaledExtrasCount} unplanned session(s) with low RPE or positive feeling (easy/recovery intent).`);
        }

        // ── Temporal anchor: sessions still upcoming this week (not yet due) ──
        // Injected BEFORE missed-session facts so Claude knows what to exclude from
        // "missed" language. Without this, Claude treats future sessions as gaps.
        if (keySessionsRemaining.length > 0) {
          const upcomingLines = keySessionsRemaining.map((s: any) => {
            const dayLabel = (() => {
              try {
                const d = new Date(String(s.date) + 'T12:00:00Z');
                return d.toLocaleDateString('en-US', { weekday: 'long', ...(userTz ? { timeZone: userTz } : {}) });
              } catch { return String(s.date); }
            })();
            const n = s.name && String(s.name).trim();
            return n ? `${dayLabel}: "${n}" (${s.type})` : `${dayLabel}: ${s.type}`;
          });
          narrativeFacts.push(`STILL UPCOMING THIS WEEK (do NOT describe as missed): ${upcomingLines.join(', ')}.`);
        }

        // Missed session reasons — convert ISO dates to day names so Claude never
        // has to infer day-of-week from a raw date string (error-prone near DST).
        const allGaps = reaction.key_session_gaps_details || [];
        const gapsWithReasons = allGaps.filter((g: any) => g.skip_reason || g.skip_note);
        const missedSessionLabel = (g: any) => {
          const dayLabel = (() => {
            try {
              const d = new Date(String(g.date) + 'T12:00:00Z');
              return d.toLocaleDateString('en-US', { weekday: 'long', ...(userTz ? { timeZone: userTz } : {}) });
            } catch { return String(g.date); }
          })();
          const name = g.name && String(g.name).trim();
          // Include planned name so the model does not invent labels like "strides" / "tempo"
          if (name) return `${dayLabel}: "${name}" (${g.type})`;
          return `${dayLabel}: ${g.type}`;
        };
        // Humanize skip_reason codes for FACTS (LLM reads prose; keeps training-load vs same-day tired distinct).
        const SKIP_REASON_NARRATIVE: Record<string, string> = {
          tired: 'tired / low energy (same-day)',
          fatigued: 'fatigued from training load (e.g. after long or hard session — interpret as load signal, not lack of discipline)',
          sick: 'sick or injury',
          travel: 'travel',
          work: 'work or schedule',
          weather: 'weather',
          motivation: 'motivation / not feeling it',
          other: 'other',
          rest: 'rest (athlete-chosen)',
          life: 'life circumstances',
          swapped: 'swapped or rescheduled',
        };
        const humanizeSkipReason = (code: unknown): string => {
          const c = String(code ?? '').trim().toLowerCase();
          if (!c) return 'no tag';
          return SKIP_REASON_NARRATIVE[c] || String(code).trim();
        };
        if (gapsWithReasons.length > 0) {
          const lines = gapsWithReasons.map((g: any) => {
            const reasonText = humanizeSkipReason(g.skip_reason);
            const parts = [`${missedSessionLabel(g)}: ${reasonText}`];
            if (g.skip_note) parts.push(`(${g.skip_note})`);
            return parts.join(' ');
          });
          narrativeFacts.push(
            `MISSED SESSION REASONS (athlete-provided — these are the ONLY days to reference as missed). ` +
              `Use reasons to infer load/recovery context; in narrative, stress impact on the week or block over restating labels. Canonical phrases: ${lines.join('; ')}.`,
          );
        } else if (allGaps.length > 0) {
          // Gaps without reasons — still provide day names so Claude doesn't invent them
          const lines = allGaps.map((g: any) => missedSessionLabel(g));
          narrativeFacts.push(`MISSED SESSIONS (no reason provided — state these as missed without guessing why): ${lines.join('; ')}.`);
        }

        if (allGaps.length > 0) {
          const discCounts = new Map<string, number>();
          for (const g of allGaps) {
            const d = normalizeType(g?.type);
            discCounts.set(d, (discCounts.get(d) || 0) + 1);
          }
          const summary = [...discCounts.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([d, n]) => `${d}: ${n}`)
            .join('; ');
          narrativeFacts.push(
            `MISSED_KEY_SESSIONS_BY_DISCIPLINE: ${summary}. ` +
              'When you mention misses, separate disciplines: do not say "both running sessions" or blame "running load" on a strength miss unless FACTS show multiple run misses. ' +
              'If only one run session was missed, say one run session was missed even if a strength session was also missed the same day.',
          );
        }

        const ksComp = reaction.key_sessions_completion_ratio;
        const primaryWeeksOut = goalContext.primary_event
          ? (goalContext.upcoming_races.find((r) => r.name === goalContext.primary_event!.name)?.weeks_out ?? null)
          : null;
        if (allGaps.length > 0 || (ksComp != null && ksComp < 1)) {
          const fatigueSkipCount = allGaps.filter((g: any) => {
            const c = String(g?.skip_reason ?? '').trim().toLowerCase();
            return c === 'fatigued' || c === 'tired';
          }).length;
          const ratioStr = ksComp != null ? `${Math.round(ksComp * 100)}%` : 'n/a';
          const wi = String(weekIntent || 'unknown');
          const weeksStr = primaryWeeksOut != null ? `Primary goal ~${primaryWeeksOut} week(s) out.` : '';
          narrativeFacts.push(
            `SKIP PATTERN (this week only — do not infer longer streaks): ${allGaps.length} key session gap(s); ` +
              `${gapsWithReasons.length} with athlete skip reason; ${fatigueSkipCount} tagged fatigue/load. ` +
              `Key-session completion ratio: ${ratioStr}. Plan week intent: ${wi}. ${weeksStr} ` +
              'Few misses with taper/recovery/sharpening intent and fatigue context often match smart phase execution; several key misses or a low completion ratio while a race is soon may warrant discussing easing the plan or adjusting goal timing — combine with SESSION and physiology FACTS, not labels alone.',
          );
        }

        narrativeFacts.push(
          'ATHLETE PHYSIOLOGY & SUBJECTIVE INPUTS: SESSION lines include session effort (1–10), feeling when logged, execution percent, and — when present in file — aerobic profile, cardiac drift (bpm, first vs second half), and pace/HR decoupling percent on steady runs. Weekly summaries and run-mix lines compare to this athlete’s norms. Missed-session reasons inform load/recovery — combine with drift and effort to judge impact on the plan (what was missed, what remains, phase stakes); athlete-facing copy should emphasize training consequences over repeating skip tags.',
        );

        // ── Soft-match: pair every completed workout with its planned session ──
        // Uses hard link (planned_id) first, then falls back to date+type match.
        const plannedByDateType = new Map<string, any[]>();
        for (const p of plannedWtdArr) {
          const key = `${String(p?.date || '').slice(0, 10)}::${normalizeType(p?.type)}`;
          if (!plannedByDateType.has(key)) plannedByDateType.set(key, []);
          plannedByDateType.get(key)!.push(p);
        }
        const usedPlannedIds = new Set<string>();

        function softMatchPlanned(w: any): any | null {
          const pid = w?.planned_id != null ? String(w.planned_id) : null;
          if (pid) {
            const found = plannedWtdArr.find((p: any) => String(p?.id) === pid);
            if (found) { usedPlannedIds.add(String(found.id)); return found; }
          }
          const localDate = String(w?.__local_date || w?.date || '').slice(0, 10);
          const discipline = normalizeType(w?.type);
          const key = `${localDate}::${discipline}`;
          const candidates = (plannedByDateType.get(key) || []).filter((p: any) => !usedPlannedIds.has(String(p.id)));
          if (candidates.length === 1) {
            usedPlannedIds.add(String(candidates[0].id));
            return candidates[0];
          }
          if (candidates.length > 1) {
            usedPlannedIds.add(String(candidates[0].id));
            return candidates[0];
          }
          return null;
        }

        function planVsActualLine(planned: any, w: any): string | null {
          const pName = planned?.name ? String(planned.name) : null;
          const pDurSec = safeNum(planned?.total_duration_seconds);
          const pComputed = typeof planned?.computed === 'object' ? planned.computed : (typeof planned?.computed === 'string' ? (parseJson(planned.computed) || {}) : {});
          const pDistM = safeNum(pComputed?.total_distance_meters) ?? safeNum(pComputed?.distance_meters);
          const pLoad = safeNum(planned?.workload_planned);
          const wDurSec = (() => {
            const raw = safeNum((w as any)?.moving_time);
            if (raw == null) return null;
            return raw < 1000 ? Math.round(raw * 60) : Math.round(raw);
          })();
          const wDistM = safeNum((w as any)?.distance) != null ? Math.round(safeNum((w as any)?.distance)! * 1000) : null;
          const wLoad = safeNum((w as any)?.workload_actual);

          const parts: string[] = [];
          if (pName) parts.push(`planned: "${pName}"`);
          if (pDurSec != null && pDurSec > 0 && wDurSec != null && wDurSec > 0) {
            const pMin = Math.round(pDurSec / 60);
            const wMin = Math.round(wDurSec / 60);
            const pct = Math.round((wDurSec / pDurSec) * 100);
            parts.push(`duration: ${wMin} of ${pMin} min planned (${pct}%)`);
          }
          if (pDistM != null && pDistM > 0 && wDistM != null && wDistM > 0) {
            const pMi = (pDistM / 1609.34).toFixed(1);
            const wMi = (wDistM / 1609.34).toFixed(1);
            const pct = Math.round((wDistM / pDistM) * 100);
            parts.push(`distance: ${wMi} of ${pMi} mi planned (${pct}%)`);
          }
          if (pLoad != null && pLoad > 0 && wLoad != null) {
            const pct = Math.round((wLoad / pLoad) * 100);
            parts.push(`load: ${Math.round(wLoad)} of ${Math.round(pLoad)} pts planned (${pct}%)`);
          }
          return parts.length > 0 ? parts.join(' | ') : null;
        }

        // ── Per-workout detail from canonical weekly workouts only ──
        for (const w of completedNarrativeWorkouts) {
          const discipline = normalizeType((w as any)?.type);
          const localDate = String((w as any)?.__local_date || (w as any)?.date || '').slice(0, 10);
          const localWhen = sessionLocalLabel(w, localDate, userTz);
          const parts = [`${localWhen} ${localDate} ${discipline}`];
          const wl = safeNum((w as any)?.workload_actual);
          if (wl != null) parts.push(`${Math.round(wl)} pts load`);
          const rpe = rpeFromWorkout(w);
          if (rpe != null) parts.push(`session effort ${rpe}/10 (1–10)`);
          const feeling = feelingFromWorkout(w);
          if (feeling) parts.push(`feeling: ${feeling}`);
          const hrProf = hrWorkoutTypeFromWorkout(w);
          if (hrProf && (discipline === 'run' || discipline === 'bike' || discipline === 'walk')) {
            parts.push(`aerobic profile: ${hrProf.replace(/_/g, ' ')}`);
          }
          const driftW = driftBpmFromWorkout(w);
          if (driftW != null && (discipline === 'run' || discipline === 'bike' || discipline === 'walk')) {
            const sign = driftW > 0 ? '+' : '';
            parts.push(`cardiac drift ${sign}${Number(driftW).toFixed(1)} bpm`);
          }
          if (discipline === 'run' && hrProf === 'steady_state') {
            try {
              const waSess = parseJson((w as any)?.workout_analysis) || {};
              const decSess = safeNum(waSess?.granular_analysis?.heart_rate_analysis?.summary?.decouplingPct);
              if (decSess != null) parts.push(`pace/HR decoupling ~${Math.round(decSess)}%`);
            } catch { /* ignore */ }
          }
          const ex = executionScoreFromWorkout(w);
          if (ex != null) parts.push(`execution ${Math.round(ex)}%`);
          const matched = softMatchPlanned(w);
          // For run sessions flagged as IF artifacts, suppress the load comparison — it will mislead the LLM
          // into generating "ran long" language even when duration/distance were on target.
          if (runAdherenceArtifact && discipline === 'run' && matched) {
            const pName = matched?.name ? String(matched.name) : null;
            if (pName) parts.push(`planned: "${pName}" — load delta is an intensity-factor calculation artifact, NOT over-volume`);
          } else {
            const pvA = matched ? planVsActualLine(matched, w) : null;
            if (pvA) parts.push(pvA);
            else if (!matched && activePlan) parts.push('unplanned (not in the training plan)');
          }
          narrativeFacts.push(`SESSION: ${parts.join(' | ')}`);
        }

        if (Array.isArray(hr_drift_series) && hr_drift_series.length > 0) {
          const ser = hr_drift_series
            .map((x) => `${String(x.date).slice(0, 10)} ${x.drift_bpm >= 0 ? '+' : ''}${x.drift_bpm}`)
            .join(', ');
          narrativeFacts.push(`Recent steady-run cardiac drift sequence (oldest to newest, bpm): ${ser}.`);
        }

        if (Array.isArray(runSessionTypes7d) && runSessionTypes7d.length > 0) {
          const mix = runSessionTypes7d.map((rt: any) => {
            const bits: string[] = [`${rt.type_label} ×${rt.sample_size}`];
            if (rt.avg_hr_drift_bpm != null) {
              const d = rt.avg_hr_drift_bpm;
              bits.push(`avg cardiac drift ${d > 0 ? '+' : ''}${d} bpm`);
            }
            if (rt.avg_decoupling_pct != null && rt.type !== 'intervals' && rt.type !== 'hills') {
              bits.push(`avg decoupling ~${rt.avg_decoupling_pct}%`);
            }
            if (rt.efficiency_label) bits.push(String(rt.efficiency_label));
            return bits.join(', ');
          });
          narrativeFacts.push(`Run mix and aerobic response (last 7 days): ${mix.join(' | ')}.`);
        }

        // ── Strength exercise summary from workout payloads only ──
        // Planned vs actual adherence belongs in analyze-strength-workout / workout_facts.
        // Coach reads what's already computed — no data assembly here.
        const strengthEntries: Array<{ name: string; best_weight: number; best_reps: number; avg_rir: number | null }> = [];
        for (const w of completedNarrativeWorkouts) {
          if (normalizeType((w as any)?.type) !== 'strength') continue;
          const exRaw = (w as any)?.strength_exercises;
          const exArr = Array.isArray(exRaw) ? exRaw : (typeof exRaw === 'string' ? (parseJson(exRaw) || []) : []);
          if (!Array.isArray(exArr)) continue;

          // Pull pre-computed per-exercise adherence from workout_analysis if available
          const wa = (w as any)?.workout_analysis;
          const waObj = typeof wa === 'object' ? wa : (typeof wa === 'string' ? (parseJson(wa) || {}) : {});
          const exerciseAdherence: Record<string, { planned_weight: number | null; planned_reps: number | null; adherence_pct: number | null }> = {};
          const exAdh = waObj?.strength_facts?.exercises ?? waObj?.exercise_adherence ?? [];
          if (Array.isArray(exAdh)) {
            for (const ea of exAdh) {
              const key = String(ea?.name || ea?.canonical || '').toLowerCase().trim();
              if (key) exerciseAdherence[key] = {
                planned_weight: safeNum(ea?.planned_weight) || null,
                planned_reps: safeNum(ea?.planned_reps) || null,
                adherence_pct: safeNum(ea?.adherence_pct) || null,
              };
            }
          }

          for (const ex of exArr) {
            const sets = Array.isArray(ex?.sets) ? ex.sets : [];
            const weights: number[] = [];
            const reps: number[] = [];
            const rirs: number[] = [];
            for (const s of sets) {
              const wt = safeNum((s as any)?.weight);
              const rp = safeNum((s as any)?.reps);
              const rr = safeNum((s as any)?.rir);
              if (wt != null) weights.push(wt);
              if (rp != null) reps.push(rp);
              if (rr != null) rirs.push(rr);
            }
            const bestWeight = weights.length ? Math.max(...weights) : safeNum(ex?.weight) || 0;
            const bestReps = reps.length ? Math.max(...reps) : safeNum(ex?.reps) || 0;
            const avgRir = rirs.length ? (rirs.reduce((a, b) => a + b, 0) / rirs.length) : null;
            strengthEntries.push({
              name: String(ex?.name || 'exercise'),
              best_weight: bestWeight,
              best_reps: bestReps,
              avg_rir: avgRir,
              ...(exerciseAdherence[String(ex?.name || '').toLowerCase().trim()] || {}),
            } as any);
          }
        }
        if (strengthEntries.length > 0) {
          const exLines = (strengthEntries as any[]).slice(0, 10).map((e: any) => {
            const rirPart = e.avg_rir != null ? `, avg ${Number(e.avg_rir).toFixed(1)} RIR` : '';
            let plannedPart = '';
            if (e.planned_weight && e.planned_weight > 0) {
              const weightDiff = e.best_weight - e.planned_weight;
              const weightStatus = weightDiff > 2
                ? ` [exceeded plan by ${Math.round(weightDiff)}${wUnit}]`
                : weightDiff < -2
                  ? ` [below plan by ${Math.round(Math.abs(weightDiff))}${wUnit}]`
                  : ' [on target]';
              plannedPart = ` (planned ${Math.round(e.planned_weight)}${wUnit}${e.planned_reps ? ` × ${Math.round(e.planned_reps)}` : ''})${weightStatus}`;
            }
            return `${e.name}: ${Math.round(e.best_weight)}${wUnit} × ${Math.round(e.best_reps)}${rirPart}${plannedPart}`;
          });
          narrativeFacts.push(`STRENGTH EXERCISES THIS WEEK: ${exLines.join('; ')}.`);
        }

        // Load by discipline
        const loadLines = training_state.load_ramp.acute7_by_type.map((r: any) => {
          const plannedPct = r.total_load > 0 ? Math.round((r.linked_load / r.total_load) * 100) : 0;
          const extraPct = 100 - plannedPct;
          return `${r.type}: ${Math.round(r.total_load)} pts total (${plannedPct}% planned, ${extraPct}% extra/unplanned)`;
        });
        if (loadLines.length) narrativeFacts.push(`Training load by discipline this week: ${loadLines.join('; ')}.`);

        // Intensity distribution (from athlete_snapshot)
        if (latestSnapshot?.intensity_distribution) {
          const id = latestSnapshot.intensity_distribution;
          const easyPct = id.zone1_2_pct;
          const hardPct = 100 - easyPct;
          let intensityLabel: string;
          if (easyPct >= 78) intensityLabel = 'well-polarized (80/20 pattern)';
          else if (easyPct >= 65) intensityLabel = 'moderately polarized — some zone creep on easy days';
          else if (easyPct >= 50) intensityLabel = 'mixed — significant time above Z2, check if easy sessions are actually easy';
          else intensityLabel = 'high-intensity dominant — sustainable only in short race-prep blocks';
          narrativeFacts.push(`Weekly intensity distribution: ${easyPct}% easy (Z1-2, ${id.zone1_2_minutes} min) / ${hardPct}% hard (Z3+, ${id.zone3_plus_minutes} min) — ${intensityLabel}.`);
        }

        // ── Athlete performance baselines ─────────────────────────────────────
        // Without these, the LLM guesses whether a 200W ride is hard or easy.
        // With them it can say "your 210W average was 88% of your FTP — solid tempo."
        const perfNums = (arc.performance_numbers || {}) as Record<string, any>;
        const effortPaces = (arc.effort_paces || {}) as Record<string, any>;
        const baselineLines: string[] = [];
        // FTP fracture #2: resolver-first (learned when confident, else typed) so this prose line shows the
        // SAME FTP as everything else; legacy `bike_ftp` kept only as a last-resort fallback.
        const ftpVal = resolveCurrentFtp({ learned_fitness: learnedFitness, performance_numbers: perfNums } as any)?.value ?? perfNums?.bike_ftp ?? null;
        if (ftpVal) baselineLines.push(`Bike FTP: ${Math.round(ftpVal)}W`);
        // M2 fix: read the CANONICAL swimPace100 (m:ss /100yd string — what TrainingBaselines writes and the
        // resolver uses), not the orphan keys this line used to read (swim_pace_per_100_sec / swimPacePer100,
        // which were ~always null, leaving this baseline line silently blank). Legacy numeric key kept as fallback.
        let swimCssSec: number | null = null;
        const _swimPaceStr = perfNums?.swimPace100;
        if (typeof _swimPaceStr === 'string') {
          const _sm = _swimPaceStr.match(/^(\d{1,2}):(\d{2})$/);
          if (_sm) swimCssSec = (+_sm[1]) * 60 + (+_sm[2]);
        } else if (Number.isFinite(Number(perfNums?.swim_pace_per_100_sec))) {
          swimCssSec = Number(perfNums.swim_pace_per_100_sec);
        }
        if (swimCssSec) {
          const cssMins = Math.floor(Number(swimCssSec) / 60);
          const cssSecs = Math.round(Number(swimCssSec) % 60);
          baselineLines.push(`Swim CSS: ${cssMins}:${String(cssSecs).padStart(2, '0')}/100yd`);
        }
        const threshPace = effortPaces?.threshold || effortPaces?.z4 || perfNums?.threshold_pace_min_per_mi || null;
        if (threshPace) baselineLines.push(`Run threshold pace: ${threshPace} min/${isImperial ? 'mi' : 'km'}`);
        const fiveKPace = effortPaces?.five_k || perfNums?.five_k_pace_min_per_mi || null;
        if (fiveKPace) baselineLines.push(`5K pace: ${fiveKPace} min/${isImperial ? 'mi' : 'km'}`);
        if (baselineLines.length > 0) {
          narrativeFacts.push(
            `ATHLETE PERFORMANCE BASELINES: ${baselineLines.join('. ')}. ` +
            `Use these when commenting on workout intensity (e.g. "your 210W average was 88% of your FTP — solid tempo work").`
          );
        }

        // ACWR
        if (metrics.acwr != null) {
          const acwrStatus = getAcwrStatus(metrics.acwr, activePlan ? {
            hasActivePlan: true,
            weekIntent: weekIntent as any,
            isRecoveryWeek: weekIntent === 'recovery',
            isTaperWeek: weekIntent === 'taper',
          } : null);
          const acwrRisk = getAcwrRiskFlag(metrics.acwr, isPlanTransitionPeriod);
          const acwrLabel = isPlanTransitionPeriod
            ? 'in plan transition (includes prior training cycle — ignore this ratio)'
            : acwrStatus === 'undertrained'
              ? 'under-reached'
              : acwrStatus === 'optimal' || acwrStatus === 'optimal_recovery'
                ? (acwrStatus === 'optimal_recovery' ? 'planned recovery zone' : 'in the optimal zone')
                : acwrRisk === 'overreaching'
                  ? 'overreaching'
                  : acwrRisk === 'fast'
                    ? 'ramping fast'
                    : 'in the optimal zone';
          narrativeFacts.push(`Training volume ratio (this week vs last 4 weeks): ${metrics.acwr.toFixed(2)} — ${acwrLabel}.`);

          // Taper/race-proximity ACWR reframe — the LLM must not normalize 1.0+ as "fine" during taper
          if ((weekIntent === 'taper' || weekIntent === 'peak') && goalContext.primary_event) {
            const raceWkOut = goalContext.upcoming_races.find(r => r.name === goalContext.primary_event!.name)?.weeks_out ?? null;
            const raceName_ = goalContext.primary_event.name;
            if (raceWkOut != null && raceWkOut <= 21) {
              const acwrVal = metrics.acwr ?? null;
              const acwrNote = acwrVal != null
                ? (acwrVal >= 1.1
                  ? `ACWR ${acwrVal.toFixed(2)} means last week's load is still in the system — this is not "optimal" during taper, it means the unloading hasn't fully happened yet.`
                  : acwrVal < 0.85
                  ? `ACWR ${acwrVal.toFixed(2)} — load has dropped well, the body is freshening.`
                  : `ACWR ${acwrVal.toFixed(2)} — load is coming down appropriately.`)
                : '';
              // Surface recent key sessions (up to 3 from acute7 window) so the LLM
              // knows what drove the ACWR — e.g. yesterday's long run.
              const recentSessions = (training_state.load_ramp.top_sessions_acute7 || []).slice(0, 3);
              const recentLine = recentSessions.length > 0
                ? ` Recent sessions driving this load: ${recentSessions.map((s: any) => `${s.date} ${s.type}${s.name ? ` "${s.name}"` : ''} (${Math.round(s.workload_actual)} pts)`).join(', ')}.`
                : '';
              narrativeFacts.push(
                `TAPER CONTEXT (${raceWkOut}w to ${raceName_}): The goal is to arrive at the start line FRESH — not to maintain or build. ${acwrNote}${recentLine} We are already IN the taper — do not frame it as "heading into" anything. DO NOT say ACWR is appropriate or optimal if it is above 1.0 during taper. The load from last week is still in the system and will clear — that is the point of taper. If no sessions are completed yet this week, that is expected taper behavior, not a problem to fix.`
              );
            }
          }
        }

        // Body response vs baseline (counts so the model knows how much data sits behind each number)
        if (reaction.avg_execution_score != null) {
          const nEx = reaction.execution_sample_size ?? 0;
          narrativeFacts.push(
            `Average execution score: ${reaction.avg_execution_score}% (this athlete’s typical ${baselines.norms_28d.execution_score_avg ?? '?'}%) — from ${nEx} plan-linked session(s) this week.`,
          );
        }
        if (reaction.avg_session_rpe_7d != null) {
          const nRpe = reaction.rpe_sample_size_7d ?? 0;
          narrativeFacts.push(
            `Average session effort (1–10): ${reaction.avg_session_rpe_7d} vs typical ${baselines.norms_28d.session_rpe_avg ?? '?'} — from ${nRpe} session(s) with effort logged in the last 7 days.`,
          );
        } else if ((reaction.rpe_sample_size_7d ?? 0) > 0) {
          narrativeFacts.push(
            `Session effort was logged on ${reaction.rpe_sample_size_7d} day(s) in the last 7 days (average not stable yet).`,
          );
        }
        if (reaction.avg_strength_rir_7d != null) {
          const nRir = reaction.rir_sample_size_7d ?? 0;
          narrativeFacts.push(
            `Average strength reps in reserve: ${reaction.avg_strength_rir_7d} (typical ${baselines.norms_28d.strength_rir_avg ?? '?'}) — from ${nRir} strength session(s).`,
          );
        }
        if (reaction.hr_drift_avg_bpm != null) {
          const nDr = reaction.hr_drift_sample_size ?? 0;
          narrativeFacts.push(
            `Average cardiac drift on steady aerobic runs this week: ${reaction.hr_drift_avg_bpm} bpm vs typical ${baselines.norms_28d.hr_drift_avg_bpm ?? '?'} bpm — from ${nDr} qualifying run(s).`,
          );
        } else if ((reaction.hr_drift_sample_size ?? 0) > 0) {
          narrativeFacts.push(
            `Cardiac drift was measured on ${reaction.hr_drift_sample_size} run(s) this week; week average not computed.`,
          );
        }

        // Per-discipline execution breakdown
        const execByDiscipline: Record<string, number[]> = {};
        for (const w of completedNarrativeWorkouts) {
          const score = executionScoreFromWorkout(w);
          if (score == null) continue;
          const d = normalizeType((w as any)?.type);
          (execByDiscipline[d] = execByDiscipline[d] || []).push(score);
        }
        const execLines = Object.entries(execByDiscipline).map(([d, scores]) => {
          const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
          return `${d}: ${avg}%`;
        });
        if (execLines.length > 1) narrativeFacts.push(`Execution by discipline: ${execLines.join(', ')}.`);

        const deltas: string[] = [];
        for (const s of weeklyResponseModel.visible_signals) {
          if (s.trend === 'stable') continue;
          deltas.push(`${s.label} ${s.trend === 'improving' ? 'improving' : 'declining'} (${s.detail})`);
        }
        if (deltas.length) narrativeFacts.push(`Response trends: ${deltas.join(', ')}.`);

        // Deterministic verdict
        narrativeFacts.push(`Overall status: ${training_state.title}.`);
        narrativeFacts.push(`Fitness direction: ${fitnessDirection}. Readiness: ${readinessState}.`);
        if (fitnessRollup.thinHeldOut.length) {
          // Q-162: these disciplines were MOVING but too thin to trust, so they did NOT set the
          // headline. Name the data gap honestly — do not let them imply a confident direction, and
          // do not pretend everything is flat.
          narrativeFacts.push(`Fitness direction is held to SOLID data — ${fitnessRollup.thinHeldOut.join(', ')} ${fitnessRollup.thinHeldOut.length === 1 ? 'is' : 'are'} moving but on too little recent data to trust yet, so ${fitnessRollup.thinHeldOut.length === 1 ? "it's" : "they're"} excluded from the headline. Name this as a data gap ("not enough recent ${fitnessRollup.thinHeldOut.join('/')} data to call it yet"); never assert a confident trend from it.`);
        }

        // Per-discipline spine breakdown so the narrative can EXPLAIN the direction (coherent, not
        // just a label), names each discipline's state, and NEVER overstates: a provisional trend
        // (sparse/clustered data) is framed as a signal-to-confirm, and a discipline with no data is
        // called too-early, not implied as decline. Faithful-to-the-spine AND honest-about-
        // confidence — both. Sourced from the same state_trends_v1 the roll-up reads.
        {
          const st = latestSnapshot?.state_trends_v1;
          if (st) {
            const moved: string[] = [];
            const noData: string[] = [];
            for (const d of ['strength', 'bike', 'run', 'swim'] as const) {
              const sd = st[d];
              const v = sd?.verdict;
              if (v && v !== 'needs_data') {
                const pct = sd?.pctChange;
                const pctStr = pct != null ? ` ${pct > 0 ? '+' : ''}${pct}%` : '';
                moved.push(`${d} ${v}${pctStr}${sd?.provisional ? ' [provisional — sparse/limited data]' : ''}`);
              } else {
                noData.push(d);
              }
            }
            if (moved.length || noData.length) {
              const parts: string[] = [];
              if (moved.length) parts.push(`trending: ${moved.join('; ')}`);
              if (noData.length) parts.push(`not enough data yet: ${noData.join(', ')}`);
              narrativeFacts.push(`Per-discipline spine (the BASIS for fitness direction — do not infer beyond it): ${parts.join(' | ')}.`);
              narrativeFacts.push(`SPINE FRAMING (required): your narrative MUST include one sentence that explicitly states EACH discipline's current trend from the spine above — name the improving ones, the sliding ones, AND the ones with no data yet. Do not omit a discipline that has a verdict, even when adherence is the bigger story. BUT frame honestly: a [provisional] trend, and any discipline whose recent sessions were largely missed, is a SIGNAL TO CONFIRM — cite the missed/limited sessions as a co-explanation, never state fitness is declining as fact. No-data disciplines are too early to call: say so, do not imply decline from missed sessions.`);
            }
          }
        }

        // Interference signal (aerobic vs structural balance from stored snapshot)
        if (interference && interference.status === 'interference_detected') {
          narrativeFacts.push(`INTERFERENCE ALERT: ${interference.detail}`);
        } else if (interference && interference.aerobic && interference.structural) {
          narrativeFacts.push(`System balance: aerobic is ${interference.aerobic}, structural is ${interference.structural}. No interference detected.`);
        }

        // Cross-domain strength→run pattern (deterministic — was missing from FACTS, so the LLM invented numbers)
        try {
          const cd = weeklyResponseModel?.cross_domain;
          const cdPatterns = Array.isArray(cd?.patterns) ? cd.patterns : [];
          const heavy = cdPatterns.filter(
            (p: any) => p?.code === 'post_strength_hr_elevated' || p?.code === 'post_strength_pace_reduced',
          );
          if (heavy.length > 0) {
            narrativeFacts.push(
              `STRENGTH→RUN CROSS-DOMAIN (from logs — use this wording/numbers verbatim; do not invent different %): ${heavy.map((p: any) => String(p?.description || '').trim()).filter(Boolean).join(' ')}`,
            );
          }
        } catch { /* non-fatal */ }

        const longLegacyBlock =
          longitudinalSignalsResult?.signals?.length
            ? longitudinalSignalsToPrompt(longitudinalSignalsResult, { swimIntent: triSwimIntent })
            : '';
        for (const line of swimCutoffPressureCoachFacts(planConfig)) {
          narrativeFacts.push(line);
        }
        const weeklySwimYdsLegacy = sumPlannedWeekSwimYards(plannedWeekArr);
        const pcLeg = planConfig as Record<string, unknown> | null | undefined;
        const contractLeg = pcLeg?.plan_contract_v1 as Record<string, unknown> | undefined;
        const swimCutLeg = contractLeg?.swim_cutoff_pressure_v1 as Record<string, unknown> | undefined;
        const primaryDistLeg =
          goalContext.primary_event && isTriGoalLite(goalContext.primary_event)
            ? goalContext.primary_event.distance
            : null;
        const swimSecLeg = swimSecPer100YdFromArcSwimInputs({
          performance_numbers: arc.performance_numbers,
          learned_fitness: arc.learned_fitness,
          units: arc.units,
        });
        const swimExpLegacy = deriveTriSwimExperienceForCoach(goalContext, activePlan?.goal_id ?? null);
        for (const line of olympic703BridgePivotCoachLines({
          primaryTriDistance: primaryDistLeg,
          weeklySwimYards: weeklySwimYdsLegacy,
          swimCutoffPressureV1: swimCutLeg,
          swimIntent: triSwimIntent,
          swimSecPer100Yd: swimSecLeg,
          swimExperience: swimExpLegacy,
        })) {
          narrativeFacts.push(line);
        }
        for (const line of strong703LeanMaintenanceCoachLines({
          primaryTriDistance: primaryDistLeg,
          weeklySwimYards: weeklySwimYdsLegacy,
          swimSecPer100Yd: swimSecLeg,
          swimExperience: swimExpLegacy,
          swimIntent: triSwimIntent,
        })) {
          narrativeFacts.push(line);
        }
        if (longLegacyBlock.trim()) narrativeFacts.push(longLegacyBlock);
        else if (triSwimIntent != null) narrativeFacts.push(swimPostureFactLine(triSwimIntent));

        // READINESS CHECK-INS (Q-049 Phase 1, D-144). Surface RAW athlete-reported
        // energy/soreness/sleep from ArcContext.readiness. VISIBLE-ONLY: this is
        // context for narration, NOT a prescription input — the line itself tells
        // the model not to move loads from it (Phase 1 has no autoregulation).
        // Anti-fabrication (Q3): only emitted when a recent check-in exists; raw
        // values, never rescaled or invented.
        {
          const rdy = arc.readiness;
          if (rdy && rdy.latest) {
            const L = rdy.latest;
            const whenStr = L.date === asOfDate ? 'today' : L.date;
            let rdyLine =
              `READINESS CHECK-IN (athlete-reported, raw — do not invent or rescale): latest ${whenStr} — energy ${L.energy}, soreness ${L.soreness}, sleep ${L.sleep}.`;
            // oldest→newest sequences for trend visibility (e.g. "soreness climbing
            // all week") when there are ≥3 check-ins in the window. `recent` is
            // newest-first, so reverse for chronological order.
            if (rdy.recent.length >= 3) {
              const chron = [...rdy.recent].reverse();
              const seq = (k: 'energy' | 'soreness' | 'sleep') => chron.map((c) => c[k]).join('→');
              rdyLine += ` Last ${chron.length} check-ins (oldest→newest) — energy ${seq('energy')}, soreness ${seq('soreness')}, sleep ${seq('sleep')}.`;
            }
            rdyLine += ` Use only as context; do NOT change prescribed loads or RIR from this.`;
            narrativeFacts.push(rdyLine);
          }
        }

        const todayDay = (() => {
          try { return new Date(asOfDate + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', ...(userTz ? { timeZone: userTz } : {}) }); }
          catch { return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date(asOfDate + 'T12:00:00Z').getUTCDay()]; }
        })();
        // Dynamic coach persona based on active sport(s).
        // A triathlete deserves a coach who speaks swim/bike/run fluently — not a
        // running coach who "also sees some cross-training."
        const hasTri = allActivePlans.some(p =>
          String(p.config?.sport || '').toLowerCase().includes('tri') ||
          String(p.config?.plan_type || '').toLowerCase().includes('tri') ||
          String(p.config?.plan_contract_v1?.sport || '').toLowerCase() === 'multi_sport',
        );
        const coachPersona = hasTri
          ? `You are a multi-sport triathlon coach writing a weekly check-in for your athlete.`
          : `You are a personal coach writing a weekly check-in for your athlete.`;

        const narrativePrompt = `${coachPersona} Today is ${todayDay}, ${asOfDate}${userTz ? ` (${userTz})` : ''}. You have detailed facts about plan position, goals, load, readiness, and sessions. Write AT MOST 3 sentences in second person — fewer is better, never more. Be specific, practical, and TERSE: the reader is an experienced self-coached athlete who already sees the numbers. Use day names instead of raw dates when naming a session.

NO DASHBOARD RECAP (hard rule): the athlete already sees, as on-screen receipts, the trend percentages (bike/run/strength), the perceived-effort rating and its delta, load/ACWR, and the readiness "Why" line that names the concerning marker. Do NOT restate any of those numbers, and do NOT re-explain WHY they're fatigued — that line is right above you. Add only the interpretation and the next action (the so-what and the do-this), never a recap of the data on screen.

NARRATIVE CONTRACT (Training Status) — sentences anchor phase and goal tension; they must NOT be a session inventory.
- Sentence 1 — PHASE ANCHOR: Where they are in the macrocycle. Draw from FACTS: plan name/week index, week intent or phase if present, and Overall status, readiness, or fitness direction in plain language. No day-by-day recap; no listing which sessions were skipped or completed.
- Sentence 2 — GOAL TENSION: What the primary race or active goal implies right now. Draw from FACTS: weeks to event, goal or race name, TAPER CONTEXT if present, target vs predicted finish or stretch framing if FACTS mention it. If no race or goal line exists in FACTS, state what this block or week intent is trying to preserve or build toward. Still no session inventory.
- Sentence 3 — INTERPRETATION + NEXT ACTION: What this week does to sentences 1–2 (tradeoffs like volume vs freshness) AND the one concrete next action (see CRITICAL below), in plain language. Do NOT restate the trend/effort/load numbers (they are on-screen receipts) and do NOT run a day-by-day chronology.

SESSION INVENTORY: Forbidden in sentences 1–2. In the final sentence, at most one named session example if it sharpens the action; never a list of days.

OPENING — CREDIT BEFORE DEFICIT (hard rule): Sentences 1–2 lead with where the athlete IS (phase, readiness, fitness direction) and the real training they HAVE done — including off-plan work, which IS real training and is credited as work done, never framed as "behind." Do NOT open with a shortfall or a completion deficit. If consistency is genuinely behind, that is an INTERPRETATION point for sentence 3 — framed as what the block needs next — never the first thing the athlete reads. The athlete already knows what they missed; the opening earns trust by naming the state and the work done, not by leading with the gap.

NO RAW COMPLETION TALLIES (hard lexical rule — applies EVERYWHERE, every sentence): NEVER write completion as raw counts — no "X of Y", no "only one of seven swims", no "four of eleven rides", no per-discipline numeric tally, anywhere in the narrative. Always express consistency QUALITATIVELY: "about a third of planned sessions", "roughly half", "most weeks", "consistent gaps across all four disciplines". A raw per-session ledger reads as scolding and is forbidden even in sentence 3. This overrides any instinct to be precise about counts — qualitative is the required register for completion.

PLAN VS ACTUAL: Session-level gaps (duration, distance, load execution) belong in sentence 3 or 4 only when they illuminate the phase/goal story or the next action — not as an opening recap. The athlete already sees the schedule; prioritize meaning over restatement.

NEVER GUESS WHY: If the facts include athlete-provided reasons, use those reasons. Otherwise, state what happened without speculation. Only explain causes when the athlete explicitly provided them.

SKIP TAGS → TRAINING IMPACT: Skip reasons (fatigued, tired, travel, etc.) are context for load and recovery — use them to judge the week, not to repeat the label. Emphasize consequences for the block (what slot is thin, what still protects the goal, what to do next). At most one short clause naming the reason if it sharpens the story; avoid empty validation of the tag.

PHASE-ALIGNED RESTRAINT (general sensitivity): Whenever FACTS together imply (a) taper, recovery, sharpening, or similar week intent from the plan contract, (b) a miss with fatigue/load-type athlete context (see MISSED SESSION REASONS), and (c) completed sessions afterward that are on prescription and read easy in SESSION lines (effort, execution, drift as given), you may frame that combination as a **sound body read** for the phase — e.g. pulling volume when legs were heavy before a race, then executing the next easy pieces cleanly. Prefer that framing over a neutral "skipped but then completed" ledger tone. When this pattern fits, do **not** let "below plan" aggregate volume be the lead story; freshness and phase fit come first, volume vs plan second or omitted if it undercuts the phase story. Apply whenever those signals co-occur in FACTS, not as a one-off about specific calendar days.

SUBJECTIVE / "FELT" LANGUAGE: Do not say a run "felt tired", "felt heavy", "felt off", etc. unless a SESSION line includes a feeling: field, session RPE, or MISSED SESSIONS include an athlete note. When you cite execution, stick to what FACTS list.

SESSION NAMES: For missed or upcoming key sessions, use the exact strings under MISSED SESSIONS or STILL UPCOMING (including quoted planned names). Do not substitute colloquial labels (e.g. "strides", "tempo") unless that exact word appears there or in the prescription text.

DISCIPLINE-SAFE MISSES: When MISSED_KEY_SESSIONS_BY_DISCIPLINE is in FACTS, respect its per-discipline counts. Do not imply multiple run sessions were missed unless the run count there is greater than one. Do not blame a combined TRIMP shortfall on "running" alone when the only run miss is a single session and strength (or another discipline) also has misses the same day.

LOAD SCOPE: The "Weekly TRIMP load (ALL DISCIPLINES combined...)" line is not run-specific. For running load vs plan, cite run SESSION lines or the per-discipline load FACTS — keep your wording consistent with those sources.

PHASE vs VOLUME: Sentence 1 must follow plan week intent from FACTS (PlanContractV1). Do not rename the phase (e.g. call taper "build") and do not infer phase only from how much was skipped this week. During taper/recovery intent, a strategic miss plus clean easy follow-up is often **correct** for the phase — weight that in interpretation (see PHASE-ALIGNED RESTRAINT) rather than defaulting to volume shortfall as the main takeaway.

SKIP PATTERN: When the SKIP PATTERN line appears in FACTS, use it for this-week-only judgment — aligned strategic misses near a race in taper/recovery vs a pile-up of key misses or a weak key-session completion ratio with the goal close. Do not stretch it into multi-week habit language unless the athlete explicitly said so elsewhere in FACTS.

NUMBERS: Do not invent percentages. Percent signs in your answer must trace to explicit FACTS (weekly load vs plan, SESSION execution %, intensity split, route progress, or STRENGTH→RUN CROSS-DOMAIN). For leg-day effects on runs, only cite STRENGTH→RUN CROSS-DOMAIN when present; otherwise describe the week without a numeric interference claim.

TEMPORAL RULES (strict):
- "SESSION:" entries are COMPLETED workouts — these DEFINITELY happened. Never contradict them.
- "STILL UPCOMING" sessions have NOT happened yet — never describe them as missed, skipped, or incomplete.
- "MISSED SESSION REASONS" lists every session that was genuinely missed before today, with the exact day name already resolved. Use these day names verbatim — do NOT recompute day-of-week from dates.
- "MISSED SESSIONS" (no reason) are also already resolved to day names — use them verbatim.
- If a SESSION entry exists for a day, that session happened — even if other facts seem to imply otherwise.
- Never infer a day name from an ISO date. If a day name isn't provided in the facts, omit the reference.

Connect the dots when you have athlete context: if they said they had the flu, that explains missed sessions. If they said they went heavier on purpose, that explains the weight deviation. If their running efficiency improved, say so. If there is an INTERFERENCE ALERT, explain it in plain language.

CRITICAL: If the athlete has an active training plan, NEVER suggest adding extra sessions or workouts. If sessions were missed, sentence 4 may tell them to prioritize the planned sessions ahead — without turning sentences 1–3 into a missed-workout list. Frame adjustments only as intensity changes within existing planned sessions.

NAMING SESSION PRIORITIES (sentence 4 only — describe the plan, do not decide for it):
- LEXICAL (hard): NEVER write "add a session", "add one more", "add another", or "if you can only add one more". The word "add" reads as extra volume even when you mean a planned session — it is forbidden. Use "prioritize", "anchor on", or "make X your non-negotiable" — and these ALWAYS refer to sessions ALREADY in the plan, never new work.
- DESCRIBE, DON'T DECIDE: When you name which sessions matter most, name ONLY the sessions the FACTS already mark as key (the KEY sessions / STILL UPCOMING key sessions / per-discipline key-session lines). Do NOT invent your own priority ranking across all sessions or elevate a session the plan didn't flag. You are describing the plan's existing key-session marking, not choosing what matters. If the FACTS don't mark any session as key, keep sentence 4 general ("prioritize your planned key sessions this week") and name none.

Do NOT use jargon like ACWR, RIR, RPE, TRIMP, or sample sizes. Speak like a real coach talking to their athlete.

UNITS: The athlete uses ${isImperial ? 'imperial (lb, miles)' : 'metric (kg, km)'}. Always use ${wUnit} for weights and ${isImperial ? 'miles' : 'km'} for distances. The facts below already use the correct units.

${userTz ? `TIMEZONE: The athlete is in ${userTz}. All dates in the facts are in their local time.` : ''}
${isPlanTransitionPeriod ? `TRANSITION MODE (first 2 weeks of a new plan): Do NOT mention percentage-over-plan language, deviation percentages, "more/less than planned" math, or fatigue/load warnings derived from plan-transition data. Still follow the NARRATIVE CONTRACT: anchor sentences 1–3 on phase (new block) and goal tension without session-by-session inventory; emphasize execution quality and consistency in plain language.` : ''}

FACTS:
${narrativeFacts.join('\n')}`;

        // Use Anthropic Sonnet for the athlete-facing narrative (best prose quality)
        const systemPrompt = hasTri
          ? 'You are an expert multi-sport triathlon coach fluent in swim, bike, run, and strength. Write a single paragraph, AT MOST 3 sentences (fewer is better), TERSE — the reader already sees the numbers. No bullets, no headers, no jargon. Second person. Conversational but knowledgeable. Open with plan phase and goal stakes, not a day-by-day workout list. When referencing workouts, use the sport-specific context (e.g., power for bike, pace per 100 for swim, pace per mile for run). For brick sessions, acknowledge the transition component.'
          : 'You are an expert endurance and strength coach. Write a single paragraph, AT MOST 3 sentences (fewer is better), TERSE — the reader already sees the numbers. No bullets, no headers, no jargon. Second person. Conversational but knowledgeable. Open with plan phase and goal stakes, not a day-by-day workout list.';

        if (anthropicKey) {
          // Q-112 convergence: the coach WEEK narrative runs through the ONE shared narrative-core guard
          // (validate → regenerate once → drop). Spine verdicts (state_trends_v1) are the ground truth for
          // the contradiction (rule 6) + recap (rule 7) rules; hasTrendField/hasFitnessTrend=true because
          // the spine verdicts ARE the trend backing (so rules 5b/5c don't false-fire on grounded claims).
          const spineVerdicts: DisciplineVerdict[] = (() => {
            const st: any = latestSnapshot?.state_trends_v1;
            if (!st) return [];
            const out: DisciplineVerdict[] = [];
            for (const d of ['run', 'bike', 'swim', 'strength'] as const) {
              const c = st[d];
              if (c && c.verdict) out.push({ discipline: d, verdict: String(c.verdict), pctChange: c.pctChange ?? null });
            }
            return out;
          })();
          // Q-129 coach net: feed the CONCERNING per-discipline verdicts as atypical signals so rule 2
          // catches a headline that calls the week "comfortable / steady / cruising / in control"
          // while a discipline is sliding (e.g. the AERO "durability gap" row the athlete sees right
          // below the headline). Derived from the SAME spine verdicts the rows render → one source,
          // the headline can't contradict its own screen. Was hardcoded [] → rule 2 could never fire.
          const atypicalFromSpine = spineVerdicts
            .filter((v) => v.verdict === 'sliding')
            .map((v) => ({
              signal: `${v.discipline} fitness`,
              state: 'sliding',
              detail: v.pctChange != null ? `${v.pctChange > 0 ? '+' : ''}${v.pctChange}%` : undefined,
            }));
          const coachCtx: NarrativeContext = {
            notableLeadSignals: [], atypicalSignals: atypicalFromSpine, anchors: {},
            hasTrendField: true, hasFitnessTrend: true, establishedCauses: [],
            disciplineVerdicts: spineVerdicts,
            // App-wide grounding: no active plan → no target/adherence claim (rule 8) and no grounded phase
            // to name (rule 10). planActiveNow already carries the started-AND-not-ended gate.
            hasLinkedPlan: planActiveNow,
            hasGroundedPhase: planActiveNow,
          };

          const generate = async (retryNote: string | null): Promise<string | null> => {
            const content = retryNote ? `${narrativePrompt}\n\n${retryNote}\nRewrite obeying these — describe the plan/state without the flagged claims.` : narrativePrompt;
            const resp = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
              body: JSON.stringify({
                model: 'claude-sonnet-4-5-20250929',
                system: systemPrompt,
                messages: [{ role: 'user', content }],
                max_tokens: 260,
                temperature: 0,
              }),
            });
            if (resp.ok) return String((await resp.json())?.content?.[0]?.text || '').trim() || null;
            console.warn(`[coach] narrative Anthropic non-ok: ${resp.status} ${resp.statusText} — ${(await resp.text().catch(() => '')).slice(0, 200)}`);
            return null;
          };

          // Cold-start hole closed (Q-129): ALWAYS run guarded — previously an athlete with no spine
          // verdicts got a fully UNGUARDED narrative (the LLM could invent readiness/fitness/phase for
          // someone with no data). With empty verdicts, rules 6/7/2 simply don't fire (nothing to
          // contradict) while rules 5/8/10 still hold — so cold-start prose is grounded, not blind.
          const result = await runGuardedNarrative({ surface: 'coach', ctx: coachCtx, generate });
          week_narrative = result.narrative;
        }
      }
    } catch (narErr: any) {
      console.warn('[coach] week narrative generation failed (non-fatal):', narErr?.message || narErr);
    }

    // Phase 3.5: Race readiness checklist (plan-aware)
    let marathon_readiness: CoachWeekContextResponseV1['marathon_readiness'];
    // Tier 4 item 15 — declared here so it's visible in the outer scope where the
    // response payload is constructed. Populated inside the `if (activePlan)` block
    // below alongside the running planCtx; null when no active plan.
    let cyclingLongRideContext: CoachWeekContextResponseV1['cycling_long_ride_context'] = null;
    try {
      // Build plan context for readiness thresholds
      let planCtx: PlanContext | null = null;
      if (activePlan) {
        const raceDistance = activePlan.config?.distance ?? goalContext.primary_event?.distance ?? null;
        const weeksOutVal = goalContext.primary_event?.weeks_out ?? null;
        const currentPhase = weekIntent !== 'unknown' ? weekIntent : null;

        // Query all planned runs to derive peak long run and weekly targets
        const { data: allPlannedRuns } = await supabase
          .from('planned_workouts')
          .select('date,type,description,workload_planned')
          .eq('training_plan_id', activePlan.id)
          .eq('type', 'run')
          .order('date', { ascending: true });

        const miRe = /(\d+\.?\d*)\s*(?:miles|mi\b)/i;
        let peakLongRunMi: number | null = null;
        let nextLongRunMi: number | null = null;
        let nextLongRunDate: string | null = null;
        let longRunStillScheduled = false;
        const weekMiles: Record<string, number> = {};

        // Race week start: 7 days before race date
        const raceDate = activePlan.config?.race_date ? String(activePlan.config.race_date).slice(0, 10) : null;
        const raceWeekStart = raceDate ? (() => {
          const d = new Date(raceDate + 'T12:00:00');
          d.setDate(d.getDate() - 6);
          return d.toISOString().slice(0, 10);
        })() : null;

        for (const pw of (allPlannedRuns ?? [])) {
          const desc = String(pw.description ?? '');
          const m = miRe.exec(desc);
          const mi = m ? parseFloat(m[1]) : 0;
          if (mi <= 0) continue;

          // Skip race day itself for peak calculations
          if (raceDate && pw.date === raceDate) continue;
          // Skip race week for peak weekly mileage
          const isRaceWeek = raceWeekStart && pw.date >= raceWeekStart;

          if (mi > (peakLongRunMi ?? 0)) peakLongRunMi = mi;

          // Track if a long run (>= 10 mi) is still scheduled after today
          if (mi >= 10 && pw.date > asOfDate) {
            longRunStillScheduled = true;
            if (nextLongRunMi == null || pw.date < (nextLongRunDate ?? '9999')) {
              nextLongRunMi = mi;
              nextLongRunDate = pw.date;
            }
          }

          if (!isRaceWeek) {
            // Bucket by Mon-start week using epoch day
            const d = new Date(pw.date + 'T12:00:00');
            const epochDay = Math.floor(d.getTime() / 86400000);
            const weekBucket = Math.floor((epochDay + 3) / 7); // +3 shifts epoch (Thu) to Mon
            weekMiles[weekBucket] = (weekMiles[weekBucket] ?? 0) + mi;
          }
        }

        const weekTotals = Object.values(weekMiles);
        const peakWeekMi = weekTotals.length > 0 ? Math.max(...weekTotals) : null;
        const avgWeekMi = weekTotals.length > 0 ? weekTotals.reduce((a, b) => a + b, 0) / weekTotals.length : null;

        planCtx = {
          peakLongRunMi,
          peakWeekMi,
          avgWeekMi,
          raceDistance,
          weeksOut: weeksOutVal,
          phase: currentPhase,
          longRunStillScheduled,
          nextLongRunMi,
          nextLongRunDate,
        };

        // ── Tier 4 item 15 — cycling long-ride context ────────────────────
        // Mirrors the running block above with cycling units (hours, not miles)
        // and a >=3 hr threshold for "long ride" (rough analog to running's >=10mi).
        // Reads `total_duration_seconds` from planned_workouts (more reliable than
        // regex-parsing the description; cycling stores planned ride duration as a
        // structured column whereas the running block parses miles from text).
        try {
          const { data: allPlannedRides } = await supabase
            .from('planned_workouts')
            .select('date,type,total_duration_seconds,workload_planned')
            .eq('training_plan_id', activePlan.id)
            .eq('type', 'ride')
            .order('date', { ascending: true });

          let peakLongRideHr: number | null = null;
          let nextLongRideHr: number | null = null;
          let nextLongRideDate: string | null = null;
          let longRideStillScheduled = false;
          const weekHrs: Record<string, number> = {};

          for (const pw of (allPlannedRides ?? [])) {
            const sec = Number((pw as any)?.total_duration_seconds);
            if (!Number.isFinite(sec) || sec <= 0) continue;
            const hr = sec / 3600;

            // Skip race day for peak calculations (matches running pattern).
            if (raceDate && pw.date === raceDate) continue;
            const isRaceWeek = raceWeekStart && pw.date >= raceWeekStart;

            if (hr > (peakLongRideHr ?? 0)) peakLongRideHr = hr;

            // Track upcoming long rides — >=3 hr is the cycling analog to running's
            // >=10 mi threshold. 70.3 athletes typically peak at 3-4 hr long rides;
            // full IM athletes at 5-6 hr. 3 hr catches the long-ride zone for both.
            if (hr >= 3 && pw.date > asOfDate) {
              longRideStillScheduled = true;
              if (nextLongRideHr == null || pw.date < (nextLongRideDate ?? '9999')) {
                nextLongRideHr = hr;
                nextLongRideDate = pw.date;
              }
            }

            if (!isRaceWeek) {
              const d = new Date(pw.date + 'T12:00:00');
              const epochDay = Math.floor(d.getTime() / 86400000);
              const weekBucket = Math.floor((epochDay + 3) / 7); // +3 shifts epoch (Thu) to Mon
              weekHrs[weekBucket] = (weekHrs[weekBucket] ?? 0) + hr;
            }
          }

          const weekTotals = Object.values(weekHrs);
          const peakWeekHr = weekTotals.length > 0 ? Math.max(...weekTotals) : null;
          const avgWeekHr = weekTotals.length > 0 ? weekTotals.reduce((a, b) => a + b, 0) / weekTotals.length : null;

          // Round for display — hour precision for longs, hour precision for weekly totals.
          const round1 = (n: number | null) => n != null ? Math.round(n * 10) / 10 : null;
          cyclingLongRideContext = {
            peak_long_ride_hr: round1(peakLongRideHr),
            peak_week_hr: round1(peakWeekHr),
            avg_week_hr: round1(avgWeekHr),
            long_ride_still_scheduled: longRideStillScheduled,
            next_long_ride_hr: round1(nextLongRideHr),
            next_long_ride_date: nextLongRideDate,
          };
        } catch (e) {
          console.warn('[coach] cycling long-ride context build failed (non-fatal):', e);
        }
      }

      const mr = await computeMarathonReadiness(userId, asOfDate, acwr ?? null, supabase, planCtx);
      marathon_readiness = mr ?? undefined;
      // When athlete says they're sick/injured and readiness is needs_work, add a recovery-focused note
      if (marathon_readiness?.summary === 'needs_work' && athleteContextStr) {
        const ctx = athleteContextStr.toLowerCase();
        if (/\b(sick|ill|flu|covid|virus|injured|injury|hurt)\b/.test(ctx)) {
          marathon_readiness = {
            ...marathon_readiness,
            context_note: 'Your gaps may reflect being sick — recover first, then reassess. You can still finish; prioritize health over hitting every number.',
          };
        }
      }
    } catch (mrErr: any) {
      console.warn('[coach] marathon readiness failed (non-fatal):', mrErr?.message ?? mrErr);
    }

    const evidence: EvidenceItem[] = [
      { code: 'week_window', label: 'Week window', value: `${weekStartDate} → ${weekEndDate}` },
      { code: 'wtd_load', label: 'Week-to-date load', value: Math.round(actualWtdLoad), unit: 'pts' },
      { code: 'wtd_vs_plan', label: 'WTD vs planned', value: plannedWtdLoad > 0 ? `${Math.round((wtdCompletionRatio || 0) * 100)}%` : '—' },
      { code: 'acwr', label: 'ACWR', value: acwr != null ? Number(acwr.toFixed(2)) : '—' },
      { code: 'remaining_plan_load', label: 'Remaining planned load', value: Math.round(plannedRemainingLoad), unit: 'pts' },
    ];

    const SIGNAL_METRIC_MAP: Record<string, string> = {
      'Cardiac drift': 'aerobic_efficiency',
      'Cardiac efficiency': 'aerobic_efficiency',
      'Effort level (RPE)': 'effort_level',
      'Execution quality': 'execution_quality',
    };
    const trendSignals: NonNullable<NonNullable<CoachWeekContextResponseV1['weekly_state_v1']>['trends']>['signals'] =
      weeklyResponseModel.visible_signals.map(s => ({
        metric: (SIGNAL_METRIC_MAP[s.label] ?? (s.category === 'strength' ? 'strength_reserve' : 'execution_quality')) as 'aerobic_efficiency' | 'effort_level' | 'execution_quality' | 'strength_reserve',
        direction: s.trend,
        magnitude: (s.trend !== 'stable' ? 'notable' : 'slight') as 'notable' | 'slight',
        delta: null,
      }));

    const groundedRaceWeekGuidanceV1 = computeGroundedRaceWeekGuidanceV1({
      hasActivePlan: Boolean(activePlan),
      primaryRaceName: goalContext.primary_event?.name ?? null,
      weekIntent,
      weeksOut: goalContext.primary_event
        ? (goalContext.upcoming_races.find((r) => r.name === goalContext.primary_event!.name)?.weeks_out ?? null)
        : null,
      keySessionGapsDetails: reaction.key_session_gaps_details ?? [],
      keySessionsRemaining,
      runningAcwr: runningAcwr,
    });

    // ── STATE "how your sessions went" → neutral per-discipline counts + at most ONE accent.
    //    docs/STATE-WEEK-EXECUTION.md. Counts are planned-vs-done FACTS (no grading). The accent is
    //    SELECTED by composeWeekAccent from candidates that each cite a real measurement (never invented):
    //    over-reach (load AND body agree) > lever (dormant, owed by State v3) > RIR vs the PLAN'S target
    //    (plan-aware continuity) > substitution / positive / under-training (the off-plan banner). No
    //    qualifier → accent null (silence is valid). Fitness verdicts do NOT live here — that is PERFORMANCE.
    const weekExecutionV1: NonNullable<CoachWeekContextResponseV1['weekly_state_v1']>['week_execution_v1'] = (() => {
      const normDisc = (t: unknown): string | null => {
        const s = String(t || '').toLowerCase();
        if (s === 'run') return 'run';
        if (s === 'ride' || s === 'bike' || s === 'cycling') return 'ride';
        if (s === 'strength') return 'strength';
        if (s === 'swim') return 'swim';
        return null;
      };
      const isDone = (w: any): boolean => String(w?.workout_status || '').toLowerCase() === 'completed';
      const plannedArr = Array.isArray(plannedWeek) ? plannedWeek : [];
      // Bound DONE explicitly to this week-to-date [weekStart, today] — the weekWorkouts query pads ±2
      // days, so without this a session from the tail of LAST week could count toward this week's mix.
      const doneArr = (Array.isArray(weekWorkouts) ? weekWorkouts : []).filter(
        (w: any) => isDone(w) && String(w?.date || '') >= weekStartDate && String(w?.date || '') <= asOfDate,
      );
      const counts = (['run', 'ride', 'strength', 'swim'] as const).map((d) => ({
        discipline: d,
        planned: plannedArr.filter((p: any) => normDisc(p?.type) === d).length,
        done: doneArr.filter((w: any) => normDisc(w?.type) === d).length,
      })).filter((c) => c.planned > 0 || c.done > 0);

      // substitution / positive / under-training — the off-plan banner (load language only, non-punitive).
      const lsX = athleteSnapshot?.body_response?.load_status;
      const banner = offPlanAdherenceResult({
        loadStatus: lsX?.status, runLoadPct: lsX?.run_only_week_load_pct, weekIntent,
        totalAcwr: lsX?.acwr, perDomain, planPrimary, primaryAdherence,
      });

      // RIR vs the PLAN'S target — the plan-aware continuity read. Each lift's 7d avg RIR vs
      // getTargetRir(profile, lift) (always a number); weekly means. Gate is ≥2 lifts with logged RIR.
      let rirActualSum = 0, rirTargetSum = 0, rirN = 0;
      for (const [lift, rirs] of perLiftRir.rirByLift7d) {
        const actual = perLiftRir.avgArr(rirs as number[]);
        if (actual == null) continue;
        rirActualSum += actual; rirTargetSum += getTargetRir(strengthProfile, lift); rirN += 1;
      }
      const rirActual = rirN >= 2 ? rirActualSum / rirN : null; // ≥2 lifts = a week's pattern
      const rirTarget = rirN >= 2 ? rirTargetSum / rirN : null;

      // THE TRADE (a swap): an endurance discipline eased off (done < planned) while others carried the
      // load. underDone = the endurance discipline with the biggest shortfall; carriers = the disciplines
      // actually done; aerobicCarried = swim/bike among them (only then is "aerobic base covered" honest).
      // RIR folds into the trade sentence as one tail so the week stays ONE sentence, not two accents.
      // Partial-week honesty (Michael, 2026-07-15): judge a shortfall against what was planned BY TODAY,
      // not the whole week — otherwise a Tuesday reads as "eased off" just because the week isn't finished
      // (the exact Q-177 partial-week trap). The MIX BAR still shows the full week's plan (aspiration +
      // progress); only the SENTENCE gates on by-today, so it never cries wolf early in the week.
      const ENDURANCE_DISC = new Set(['run', 'ride', 'swim']);
      // ⛔ STRICTLY BEFORE TODAY. A session planned FOR today is due by tonight — it is NOT missed this
      // morning, so counting it (<=) reads a full-of-runs week as "eased off". Only a day that has fully
      // PASSED can put you behind. (Live bug 2026-07-15: run planned today → false "running eased off"
      // while every due run was done.)
      const plannedBeforeToday = (disc: string) =>
        (Array.isArray(plannedWeek) ? plannedWeek : []).filter(
          (p: any) => normDisc(p?.type) === disc && String(p?.date || '') < asOfDate,
        ).length;
      const shortfalls = counts
        .filter((c) => ENDURANCE_DISC.has(c.discipline))
        .map((c) => ({ discipline: c.discipline, gap: plannedBeforeToday(c.discipline) - c.done }))
        .filter((c) => c.gap >= 1) // behind what was due on a day that has already PASSED
        .sort((a, b) => b.gap - a.gap);
      const underDone = shortfalls.length ? shortfalls[0].discipline : null;
      // Only aerobic cross-training (swim/bike) carries the ENDURANCE load — strength is a different
      // modality and never counts as an endurance carrier. No aerobic carrier → not a trade (silent here).
      const aerobicCarriers = underDone
        ? counts.filter((c) => (c.discipline === 'swim' || c.discipline === 'ride') && c.done > 0).map((c) => c.discipline)
        : [];
      const underCount = counts.find((c) => c.discipline === underDone);
      const trade = tradeCandidate({
        underDone,
        underDoneDone: underCount?.done,
        underDonePlanned: underCount?.planned,
        aerobicCarriers, rirActual, rirTarget,
      });

      const accent: WeekAccent | null = composeWeekAccent([
        overReachCandidate({ loadStatus: lsX?.status, readiness: readinessState, runningAcwr: lsX?.acwr }),
        leverCandidate(),
        // RIR alone only when it is NOT already folded into a trade sentence.
        trade ? null : rirCandidate({ actualRir: rirActual, targetRir: rirTarget, sampleSize: rirN }),
        trade,
        // The banner's positive / behind / under-training reads — but NOT its 'carried' branch when a
        // trade fired (the warm trade sentence replaces it). Positive stays first-class, just lower tier.
        trade ? bannerCandidate(banner?.line, banner?.branch === 'carried' ? null : banner?.branch)
              : bannerCandidate(banner?.line, banner?.branch),
      ]);
      return { counts, accent };
    })();

    const weekly_state_v1: NonNullable<CoachWeekContextResponseV1['weekly_state_v1']> = {
      version: 1,
      owner: 'coach',
      generated_at: new Date().toISOString(),
      as_of_date: asOfDate,
      week_execution_v1: weekExecutionV1,
      week: {
        start_date: weekStartDate,
        end_date: weekEndDate,
        week_start_dow: weekStartDow,
        // D-232: pre-start → null so the chip shows "WEEK", not a false "WK 1" (plan hasn't begun).
        index: planActiveNow ? weekIndex : null,
        intent: weekIntent,
        focus_label: weekFocusLabel,
        phase_source: weekPhaseSource, // D-261: glass-box receipt for how `intent` resolved
        intent_summary: (() => {
          const rs = readinessState;
          const intent = weekIntent;
          const ls = athleteSnapshot?.body_response?.load_status?.status;
          const lsData = athleteSnapshot?.body_response?.load_status;
          const bodyTrends = athleteSnapshot?.body_response?.weekly_trends;
          const weeksOutVal = goalContext.upcoming_races?.[0]?.weeks_out ?? null;

          // Body response quality: are run signals positive despite load?
          const runBodyOk = bodyTrends
            && (bodyTrends.run_quality?.trend === 'stable' || bodyTrends.run_quality?.trend === 'improving')
            && bodyTrends.run_quality?.based_on_sessions >= 2;
          // Is the excess load primarily cross-training (not running)?
          const runLoadPct = lsData?.run_only_week_load_pct;
          const excessIsCrossTraining = runLoadPct != null && runLoadPct <= 100;

          // Build plan-aware context string
          const posLabel = weeksOutVal != null ? `${weeksOutVal}w from race` : null;

          // When load is high, surface load composition + body response
          if (ls === 'high') {
            if (runBodyOk && excessIsCrossTraining) {
              // Running is fine, excess is from cross-training. D-268 Phase 3: name the PRIMARY discipline.
              const primaryNoun = planPrimary === 'strength' ? 'strength sessions' : 'run sessions';
              const ctNote = posLabel ? ` ${posLabel} — keep your ${primaryNoun} on plan.` : ` Keep your ${primaryNoun} on plan.`;
              if (intent === 'peak' || intent === 'taper') return `Extra cross-training is adding load.${ctNote}`;
              if (intent === 'recovery') return 'Recovery week — cross-training is adding load. Keep it easy.';
              return `Cross-training pushing total load high.${ctNote}`;
            }
            // Running itself is elevated + body showing strain
            if (intent === 'peak' || intent === 'taper') {
              const pos = posLabel ? ` ${posLabel}` : '';
              return `Load is elevated${pos} — protect recovery now.`;
            }
            if (intent === 'recovery') return 'Recovery week — but load is still elevated. Rest fully.';
            return 'Load is high — back off and recover before your next key session.';
          }
          if (ls === 'elevated' && (intent === 'peak' || intent === 'taper')) {
            if (runBodyOk && excessIsCrossTraining) {
              return 'Peak week — running is on plan. Watch cross-training volume.';
            }
            return 'Peak week — load is creeping up. Keep it controlled, protect your legs.';
          }

          // ── Off-plan adherence (D-147) — takes precedence over race-phase
          // encouragement on a genuine skip ──────────────────────────────────
          // Substantially under planned running on a normal training week with no
          // overload signal = a SKIPPED-the-plan week, not a light plan. The
          // actionable message is adherence (get back on schedule), NOT added
          // volume — and "final build, every session counts" is worse than useless
          // when the sessions were skipped, so this fires BEFORE the race-aware
          // overrides. Gated on a real planned-running shortfall (runLoadPct ≤ -50,
          // i.e. did ≤ half the planned running) and excluded on intents MEANT to
          // be light (recovery/taper/deload/peak). Only for low/normal
          // load_status; 'high'/'elevated' (real overload) are handled above.
          // D-262: extracted for testability + coherence guard (no "add more"
          // prescription while total load reads high — can't say add-more + rest-now).
          const offPlanLine = offPlanAdherenceBanner({
            loadStatus: ls, runLoadPct, weekIntent: intent,
            totalAcwr: lsData?.acwr,
            perDomain: perDomain ?? null, // D-263 bs3: attribution by acute-load composition
            planPrimary, primaryAdherence, // D-268 Phase 2: strength-primary → key on strength, not a run shortfall
          });
          if (offPlanLine) return offPlanLine;

          // ── Race-aware overrides (≤21 days out) ─────────────────────────
          const raceNameForSummary = goalContext?.primary_event?.name ?? activePlan?.name ?? null;
          if (weeksOutVal != null && weeksOutVal <= 21 && raceNameForSummary) {
            const projection =
              raceFinishProjectionV1?.anchor_display ?? raceReadiness?.predicted_finish_display ?? null;
            const source = raceReadiness?.data_source ?? 'plan_targets';
            const sourceLabel = source === 'observed' ? 'from recent runs' : 'based on plan targets';

            if (intent === 'taper') {
              if (primary_race_readiness) {
                return `${weeksOutVal}w to ${raceNameForSummary} — key run locked in. Protect what you've built.`;
              }
              if (projection) {
                return `${weeksOutVal}w to ${raceNameForSummary} — ${projection} ${sourceLabel}. Protect the legs, keep sessions crisp.`;
              }
              if (rs === 'fresh') return `${weeksOutVal}w to ${raceNameForSummary} — fitness is banked. Taper means protecting what you've built, not adding to it.`;
              if (rs === 'fatigued') return `${weeksOutVal}w to ${raceNameForSummary} — you still need to freshen up. Race is close, prioritize rest.`;
              return `${weeksOutVal}w to ${raceNameForSummary} — freshen up, protect your legs.`;
            }
            if (intent === 'build') {
              return `${weeksOutVal}w to ${raceNameForSummary} — final build. Every session should leave you recovered by race morning.`;
            }
            if (intent === 'recovery') {
              return `${weeksOutVal}w to ${raceNameForSummary} — recovery is the work right now. Don't add stress.`;
            }
            if (intent === 'peak') {
              if (rs === 'fresh') return `${weeksOutVal}w to ${raceNameForSummary} — you're sharp. Keep sessions crisp, the work is done.`;
              return `${weeksOutVal}w to ${raceNameForSummary} — peak week. Quality over volume, protect your legs.`;
            }
          }

          if (intent === 'recovery') {
            if (rs === 'fresh') return 'Recovery week — you\'re absorbing well, keep it easy.';
            if (rs === 'fatigued' || rs === 'overreached') return 'Recovery week — you need this. Back off completely.';
            return 'Recovery week — back off, let the adaptation happen.';
          }
          if (intent === 'taper') {
            if (rs === 'fresh') return 'Tapering — you\'re sharp. Keep sessions crisp, protect your legs.';
            if (rs === 'fatigued') return 'Tapering — you still need to freshen up. Race week, prioritize rest.';
            return 'Tapering — freshen up, race is close.';
          }
          if (intent === 'peak') {
            if (rs === 'fresh') return 'Peak week — you\'re sharp and ready. Keep sessions crisp.';
            if (rs === 'adapting') return 'Peak week — load is high but your body is handling it. Quality over volume.';
            if (rs === 'fatigued') return 'Ease into peak week — you\'re still absorbing last week\'s load.';
            if (rs === 'overreached') return 'Hold on peak work — recover first, then sharpen.';
            return 'Sharpening — quality over volume, protect your legs.';
          }
          if (intent === 'build') {
            if (rs === 'fresh') return 'Building fitness — body is responding well, keep adding stress.';
            if (rs === 'adapting') return 'Building fitness — load is accumulating, your body is absorbing it.';
            if (rs === 'fatigued') return 'Building fitness — carry the work, but keep easy days easy.';
            if (rs === 'overreached') return 'Back off before building more — signs of overreaching.';
            return 'Building fitness — add stress, absorb the work.';
          }
          if (intent === 'baseline') {
            if (rs === 'fresh') return 'Establishing your baseline — body is ready, stay consistent.';
            return 'Establishing your baseline — consistency is the goal.';
          }
          return null;
        })(),
      },
      plan: {
        has_active_plan: Boolean(activePlan),
        plan_id: activePlan?.id || null,
        plan_name: activePlan?.name || null,
        athlete_context_for_week: athleteContextStr || null,
        // b2 (Q-149) + scale-up: the specific lead discipline (resolvePrimarySport). Client reads this to
        // decide which session-type breakdown leads the execution surface — never re-derives it (Law-4).
        // strength/run/ride/swim → that row leads; triathlon/duathlon/hybrid/unknown → no forced single lead.
        primary_discipline: primarySport,
      },
      guards: {
        is_transition_window: isPlanTransitionPeriod,
        suppress_deviation_language: isPlanTransitionPeriod,
        suppress_baseline_deltas: isPlanTransitionPeriod,
        show_trends: training_state.baseline_days >= 14,
        show_readiness: Boolean(marathon_readiness?.applicable),
      },
      glance: {
        training_state_code: training_state.code,
        training_state_title: training_state.title,
        training_state_subtitle: training_state.subtitle,
        verdict_code: v.code,
        verdict_label: v.label,
        next_action_code: v.next.code,
        next_action_title: v.next.title,
        next_action_details: v.next.details,
        completion_ratio: wtdCompletionRatio ?? null,
        key_sessions_linked: reaction.key_sessions_linked,
        key_sessions_planned: reaction.key_sessions_planned,
      },
      coach: {
        narrative: week_narrative,
        baseline_drift_suggestions: baseline_drift_suggestions.length ? baseline_drift_suggestions : undefined,
        plan_adaptation_suggestions: plan_adaptation_suggestions.length ? plan_adaptation_suggestions : undefined,
        ...(groundedRaceWeekGuidanceV1 ? { grounded_race_week_guidance_v1: groundedRaceWeekGuidanceV1 } : {}),
      },
      load: {
        wtd_planned_load: plannedWtdLoad ?? null,
        wtd_actual_load: actualWtdLoad ?? null,
        acute7_actual_load: acute7Load ?? null,
        chronic28_actual_load: chronic28Load ?? null,
        acwr: acwr ?? null,
        acwr_provisional: (athleteSnapshot?.body_response?.load_status as any)?.acwr_provisional ?? false, // thin-base ratio → render "· provisional"
        label: (() => {
          if (acwr == null) return null;
          if (acwr < 0.8) return 'build more';
          if (acwr <= 1.3) return 'balanced';
          if (acwr <= 1.5) return 'back off';
          return 'rest now';
        })(),
        running_acwr: runningAcwr,
        cycling_acwr: cyclingAcwr,
        per_domain: perDomain, // D-263 bs3: strength/hard_cardio/easy_cardio slices (Q-140 input + Item-4 provenance)
        fitness_fatigue: fitnessFatigue, // Banister sibling signal — EVALUATION-ONLY, drives no verdict (2026-07-09)
        run_only_week_load: athleteSnapshot?.body_response?.load_status?.run_only_week_load ?? null,
        run_only_week_load_pct: athleteSnapshot?.body_response?.load_status?.run_only_week_load_pct ?? null,
        running_weighted_week_load: athleteSnapshot?.body_response?.load_status?.running_weighted_week_load ?? null,
        running_weighted_week_load_pct: athleteSnapshot?.body_response?.load_status?.running_weighted_week_load_pct ?? null,
        unplanned_summary: athleteSnapshot?.body_response?.load_status?.unplanned_summary ?? null,
        by_discipline: (training_state.load_ramp.acute7_by_type || []).map((r: any) => {
          const disc = String(r.type || 'other');
          const dp = disciplineProfiles.find(p => p.discipline === disc || (disc === 'ride' && p.discipline === 'bike') || (disc === 'cycling' && p.discipline === 'bike'));
          return {
            discipline: disc,
            planned_load: typeof r.linked_load === 'number' ? r.linked_load : null,
            actual_load: Number(r.total_load || 0),
            extra_load: Number(r.extra_load || 0),
            session_count: Number(r.total_sessions || 0),
            maturity: dp?.maturity ?? null,
            acwr: dp?.acwr ?? null,
          };
        }),
        daily_load_7d,
        hr_drift_series,
        cross_training_signal: (() => {
          const byType = training_state.load_ramp.acute7_by_type || [];
          const activeDisciplines = byType.filter((r: any) => Number(r.total_load || 0) > 0);
          if (activeDisciplines.length < 2) return null;

          // Identify building disciplines among active ones
          const buildingDiscs = activeDisciplines
            .map((r: any) => {
              const disc = String(r.type || 'other');
              const dp = disciplineProfiles.find(p => p.discipline === disc || (disc === 'ride' && p.discipline === 'bike') || (disc === 'cycling' && p.discipline === 'bike'));
              return dp && dp.maturity === 'building' ? dp : null;
            })
            .filter(Boolean) as typeof disciplineProfiles;

          // If cross-training disciplines are all still building, show learning message
          const nonRunActive = activeDisciplines.filter((r: any) => {
            const d = String(r.type || '').toLowerCase();
            return !d.includes('run');
          });
          const allCrossTrainingBuilding = nonRunActive.length > 0 && nonRunActive.every((r: any) => {
            const disc = String(r.type || 'other');
            const dp = disciplineProfiles.find(p => p.discipline === disc || (disc === 'ride' && p.discipline === 'bike') || (disc === 'cycling' && p.discipline === 'bike'));
            return dp && dp.maturity === 'building';
          });

          if (allCrossTrainingBuilding && buildingDiscs.length > 0) {
            const names = buildingDiscs.map(d => `${d.discipline} (${d.sessions_28d} sessions)`).join(', ');
            return { label: `Building baseline: ${names}`, tone: 'info' as const };
          }

          const cd = weeklyResponseModel.cross_domain;
          const endur = weeklyResponseModel.endurance;
          const str = weeklyResponseModel.strength;
          const assess = weeklyResponseModel.assessment;

          if (cd.interference_detected) {
            const hrPattern = cd.patterns.find((p: any) => p.code === 'post_strength_hr_elevated');
            const execPattern = cd.patterns.find((p: any) => p.code === 'post_strength_pace_reduced');
            if (hrPattern) {
              return { label: `HR +${Math.round(hrPattern.data.avg_delta)}bpm after lifting`, tone: 'warning' as const };
            }
            if (execPattern) {
              return { label: 'Execution dips after lower-body days', tone: 'warning' as const };
            }
            return { label: 'Interference detected between disciplines', tone: 'warning' as const };
          }

          if (cd.patterns.some((p: any) => p.code === 'concurrent_gains')) {
            if (buildingDiscs.length > 0) {
              const names = buildingDiscs.map(d => d.discipline).join(', ');
              return { label: `Adapting well — still learning ${names}`, tone: 'positive' as const };
            }
            return { label: 'Adapting well — no interference', tone: 'positive' as const };
          }

          const rpeRising = endur.rpe.sufficient && endur.rpe.trend === 'declining';
          const driftWorsening = endur.hr_drift.sufficient && endur.hr_drift.trend === 'declining';
          const strengthFading = str.overall.trend === 'declining';
          const rirDropping = str.per_lift.some((l: any) =>
            l.sufficient && l.rir_trend === 'declining' && l.rir_current != null && l.rir_current < 2
          );
          const bodyConcerned = assess.signals_concerning > 0;

          const stressSignals = [rpeRising, driftWorsening, strengthFading, rirDropping, bodyConcerned].filter(Boolean).length;

          // D-232 glass-box + D-236 Part C glance-tier dedup: fires on ≥2 stress
          // signals and cites the DISTINCT factors, but SUPPRESSES the row when RPE
          // is the sole distinct signal (the ≥2 met only via bodyConcerned double-
          // counting RPE) — that receipt would just restate the "How hard it feels"
          // row. Multi-factor / non-RPE-single unchanged. (Over-fire history: Q-111.)
          const stressReceipt = crossTrainingStressReceipt({
            rpeRising, driftWorsening, strengthFading, rirDropping, bodyConcerned,
            rpe: { current: endur.rpe.current_avg, baseline: endur.rpe.baseline_avg },
          });
          if (stressReceipt) return stressReceipt;

          if (stressSignals === 0 && assess.signals_concerning === 0) {
            if (buildingDiscs.length > 0) {
              const names = buildingDiscs.map(d => `${d.discipline} (${d.sessions_28d} sessions)`).join(', ');
              return { label: `Handling load well — building ${names}`, tone: 'positive' as const };
            }
            return { label: 'Handling combined load well', tone: 'positive' as const };
          }

          return null;
        })(),
      },
      trends: {
        fitness_direction: fitnessDirection,
        // S2: the pre-assembled State DISPLAY contract (cards + per-discipline fitness reads), read from
        // the cached spine and forwarded verbatim so the client RENDERS it and computes nothing (retires
        // the ~9 in-browser queries + live assembleStateTrends in useStateTrends). null when the snapshot
        // predates the S2 write → the client falls back to its legacy live path for that render.
        display: latestSnapshot?.state_trends_v1?.display ?? null,
        readiness_state: readinessState,
        readiness_label: (() => {
          // The readiness label reflects READINESS ONLY (how the body is responding). Load is a
          // SEPARATE axis — the LoadBar reads the volume verdict (ACWR band). The old `ls==='high'
          // → 'HIGH LOAD'` / `ls==='elevated' → 'WATCH LOAD'` branches put the LOAD verdict onto the
          // READINESS chip — the category error that showed "HIGH LOAD" in green while readiness was
          // 'fresh'. Removed: load never wears the readiness label, readiness never wears load.
          if (readinessState === 'overreached') return 'OVERREACHED';
          // D-232: the `fatigued` catch-all resolves to LEGS LOADED / LEGS SORE / EFFORT UP / FATIGUED.
          if (readinessState === 'fatigued') return fatigueRefinement?.label ?? 'FATIGUED';
          if (readinessState === 'fresh') return 'LOW FATIGUE';
          if (readinessState === 'adapting') return 'ABSORBING';
          if (readinessState === 'normal' && isAcwrDetrainedSignal(metrics.acwr)) {
            const wi = String(weekIntent || '').toLowerCase();
            if (wi === 'taper' || wi === 'recovery' || wi === 'deload') {
              return wi === 'taper' ? 'TAPER' : 'RECOVERY';
            }
          }
          if (readinessState === 'detrained') return 'LOW vs BASELINE';
          return null;
        })(),
        // D-232 glass-box: the FATIGUED/OVERREACHED headline expands to its factors — the real declining
        // signals with values + load + count — instead of a bare state. Rendered in "open for more".
        readiness_why: (() => {
          // D-232: a surgical loaded-legs attribution supplies its own Why (names the session +
          // mechanism + effect); otherwise the generic factor breakdown.
          if (fatigueRefinement?.loadedLegs) return fatigueRefinement.loadedLegs.why;
          if (readinessState !== 'fatigued' && readinessState !== 'overreached') return null;
          const e = weeklyResponseModel.endurance;
          const acwr = metrics.acwr;
          const loadLabel = (acwr != null && acwr >= 1.2) ? `load elevated (ACWR ${acwr.toFixed(2)})` : 'load balanced';
          // The RPE driver now renders under BODY (readiness_rpe_driver, Whoop verdict+driver pairing).
          // rpeUnderBody drops it here so it never double-shows; the Why keeps only the NON-RPE factors.
          // For Michael (RPE-only) this returns null → the "open for more" expand disappears.
          return buildReadinessWhy({
            rpeUnderBody: true,
            signals: {
              rpe: { declining: e.rpe.sufficient && e.rpe.trend === 'declining', current: e.rpe.current_avg, baseline: e.rpe.baseline_avg },
              execution: { declining: e.execution.sufficient && e.execution.trend === 'declining' },
              hrDrift: { declining: e.hr_drift.sufficient && e.hr_drift.trend === 'declining' },
              cardiacEff: { declining: e.cardiac_efficiency.sufficient && e.cardiac_efficiency.trend === 'declining' },
              strength: { declining: weeklyResponseModel.strength.overall.trend === 'declining' },
            },
            loadLabel,
            concerningCount: weeklyResponseModel.assessment.signals_concerning,
          });
        })(),
        // BODY-row driver (Whoop pattern: verdict + its driver, paired): the RPE CLAUSE ONLY of the
        // Why — the session that moved the week — rendered under BODY's "how hard it feels". RPE-only
        // (bodyRpeDriver drops non-RPE factors); null when effort isn't up.
        readiness_rpe_driver: (() => {
          const e = weeklyResponseModel.endurance;
          return bodyRpeDriver({
            rpeDeclining: e.rpe.sufficient && e.rpe.trend === 'declining',
            sessions: rpeSessions,
            currentAvg: e.rpe.current_avg,
            baseline: e.rpe.baseline_avg,
          });
        })(),
        // D-232: the loaded-legs suggestion line (rendered under the Why). Null for systemic/EFFORT-UP.
        readiness_suggestion: fatigueRefinement?.loadedLegs?.suggestion ?? null,
        signals: trendSignals,
      },
      details: {
        evidence,
        reaction,
        training_state,
        marathon_readiness,
        interference,
      },
      longitudinal_signals: longitudinalSignalsResult?.signals?.length
        ? longitudinalSignalsResult.signals.map((s) => ({
            id: s.id,
            category: s.category,
            severity: s.severity,
            headline: s.headline,
            detail: s.detail,
          }))
        : undefined,
      run_session_types_7d: runSessionTypes7d,
      ride_session_types_7d: rideSessionTypes7d,
      strength_session_types_7d: strengthSessionTypes7d,
      swim_sessions_7d: swimSessions7d,
      cycling_long_ride_context: cyclingLongRideContext,
      response_model: weeklyResponseModel,
      race_finish_projection_v1: raceFinishProjectionV1,
      empty_state: weeklyResponseModel.empty_state ?? null,
    };

    const response: CoachWeekContextResponseV1 = {
      version: 1,
      as_of_date: asOfDate,
      week_start_date: weekStartDate,
      week_end_date: weekEndDate,
      methodology_id: methodologyId,
      plan: {
        has_active_plan: Boolean(activePlan),
        plan_id: activePlan?.id || null,
        plan_name: activePlan?.name || null,
        week_index: weekIndex,
        week_intent: weekIntent,
        week_focus_label: weekFocusLabel,
        week_start_dow: weekStartDow,
        athlete_context_for_week: athleteContextStr || null,
        // All concurrent active plans (multi-event support)
        active_plans: allActivePlans.map(p => ({
          plan_id: p.id,
          plan_name: p.name,
          sport: p.config?.sport ?? null,
          distance: p.config?.distance ?? p.config?.race_distance ?? null,
          race_date: p.config?.race_date ?? null,
          race_name: p.config?.race_name ?? null,
          /** Plan Wizard / generate-run-plan: `config.target_time` (race finish seconds). Always sent when present. */
          plan_target_finish_seconds: targetSecondsFromPlanConfig(p.config),
          duration_weeks: p.duration_weeks,
          is_primary: p.id === activePlan?.id,
        })),
      },
      metrics,
      week: {
        planned_total_load: plannedWeekTotalLoad || 0,
        planned_remaining_load: plannedRemainingLoad || 0,
        key_sessions_remaining: keySessionsRemaining,
      },
      reaction,
      baselines,
      baseline_drift_suggestions: baseline_drift_suggestions.length ? baseline_drift_suggestions : undefined,
      run_session_types_7d: runSessionTypes7d,
      ride_session_types_7d: rideSessionTypes7d,
      strength_session_types_7d: strengthSessionTypes7d,
      swim_sessions_7d: swimSessions7d,
      cycling_long_ride_context: cyclingLongRideContext,
      training_state,
      verdict: {
        code: v.code,
        label: v.label,
        confidence: v.confidence,
        reason_codes: v.reason_codes,
      },
      next_action: v.next,
      evidence,
      week_narrative,
      fitness_direction: fitnessDirection,
      readiness_state: readinessState,
      interference,
      plan_adaptation_suggestions: plan_adaptation_suggestions.length ? plan_adaptation_suggestions : undefined,
      marathon_readiness,
      weekly_state_v1,
      response_model: weeklyResponseModel,
      goal_context: goalContext,
      goal_prediction: goalPrediction,
      athlete_snapshot: athleteSnapshot,
      race_readiness: raceReadiness,
      // D-212 Piece 1 step 2 + Cut 2 — the spine↔projection divergence, surfaced top-level beside the
      // other N-way siblings. Computed on the Arc (read-only); coach just emits it. Empty/null = aligned.
      fitness_verdict_divergence: arc.fitness_verdict_divergence ?? null,
      primary_race_readiness,
      last_completed_race,
      race_finish_projection_v1: raceFinishProjectionV1,
      coach_payload_version: COACH_PAYLOAD_VERSION,
    };

    // ── Cache write (service_role so INSERT RLS passes; await so isolate does not exit first)
    try {
      const { error: cacheWriteErr } = await supabaseService.from('coach_cache').upsert(
        { user_id: userId, payload: response, generated_at: new Date().toISOString(), invalidated_at: null },
        { onConflict: 'user_id' }
      );
      if (cacheWriteErr) console.warn('[coach] cache write failed:', cacheWriteErr.message);
    } catch (e: unknown) {
      console.warn('[coach] cache write failed:', (e as any)?.message || e);
    }
    // ─────────────────────────────────────────────────────────────────────────

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[coach] error', e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});


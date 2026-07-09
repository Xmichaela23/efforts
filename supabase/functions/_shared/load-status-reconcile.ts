/**
 * Load-status reconciliation authority (extracted from coach/index.ts, D-259).
 *
 * ONE place that turns a raw body-response load_status + body-signal trends +
 * readiness + plan position + ACWR into the final `load_status.status` the
 * State card banner and coaching copy read. It was a private ~200-line function
 * buried in the ~5k-line @ts-nocheck coach edge file and could not be unit-run;
 * extracting it makes the classifier testable (see load-status-reconcile.test.ts).
 *
 * TWO GATES added on extraction (D-259) — both fix a single point of failure:
 * the escalation AND de-escalation of cross-training-dominated load both hinged
 * on `runBodyOk` (≥2 quality runs this week), which is UNSATISFIABLE exactly when
 * an athlete substitutes cross-training FOR running (few/no runs). Result: a
 * deliberate run→bike/swim swap read as running overload → "back off before your
 * next key session".
 *
 *   Gate 1 — runNotOverPlan (phase-INDEPENDENT). If you're at or under your
 *     planned running (or there is no run signal to compare), the excess load
 *     definitionally cannot be running — so recognise it as cross-training
 *     WITHOUT requiring two quality runs to prove it.
 *
 *   Gate 2 — build-band plan-phase tolerance (fires ONLY for weekIntent ∈
 *     {build, baseline}). Mirrors acwr-state.ts's build bands: in a build phase
 *     an elevated ACWR is the INTENT, so a load-VOLUME 'high'/'elevated' that
 *     isn't corroborated is softened to the band the ACWR earns (≤1.5 optimal,
 *     ≤1.7 elevated, >1.7 high). Fails SAFE — for weekIntent 'unknown'/other it
 *     does nothing and the current strict bands stand (see Q-136: plan_phase is
 *     null on all snapshot rows, so 'unknown' is the live path and Gate 2 is
 *     inert until phase labeling is populated upstream).
 *
 * CARVE-OUT (both gates): genuine overreaching bypasses both. The body-signal
 * raises (nDeclining ≥ 2) and the readiness floor ('overreached'/'fatigued')
 * are computed independently of the gates and act as a hard ceiling, so real
 * overload at any ACWR still reaches 'high'/'elevated'.
 */

import { ACWR_RATIO_THRESHOLDS, isAcwrDetrainedSignal } from './acwr-state.ts';

export type LoadStatusLevel = 'under' | 'on_target' | 'elevated' | 'high';

export type ReconcileLoadInput = {
  status: LoadStatusLevel;
  interpretation: string;
  running_acwr: number | null;
  actual_vs_planned_pct: number | null;
};

export type TrendInfo = { trend: string; based_on_sessions: number };

export const LOAD_RANK: Record<string, number> = { under: 0, on_target: 1, elevated: 2, high: 3 };

export interface BodyTrends {
  cardiac: TrendInfo;
  effort_perception: TrendInfo;
  run_quality: TrendInfo;
  strength: TrendInfo;
}

/**
 * The declining body-signal names (≥2 sessions + declining trend). ONE canonical
 * computation (D-264) — the reconciler's `nDeclining` and Item 3's absorption
 * safety-floor (`nDeclining ≥ 2`) both read this, so they can never disagree.
 */
export function computeDecliningSignals(bodyTrends: BodyTrends): string[] {
  const s: string[] = [];
  if (bodyTrends.cardiac.based_on_sessions >= 2 && bodyTrends.cardiac.trend === 'declining') s.push('HR drift');
  if (bodyTrends.effort_perception.based_on_sessions >= 2 && bodyTrends.effort_perception.trend === 'declining') s.push('RPE');
  if (bodyTrends.run_quality.based_on_sessions >= 2 && bodyTrends.run_quality.trend === 'declining') s.push('execution');
  if (bodyTrends.strength.based_on_sessions >= 2 && bodyTrends.strength.trend === 'declining') s.push('RIR');
  return s;
}

/**
 * The absorption SAFETY FLOOR (Item 3): genuine overreaching that escalates regardless of
 * the two-key rule — ≥2 declining body signals OR fatigued/overreached readiness. Fed into
 * `assessAbsorption` as `safetyFloor`, which makes `corroborated_strain` true, so the
 * reconciler two-key cap lets it through. One shared computation (D-264).
 */
export function computeSafetyFloor(bodyTrends: BodyTrends, readiness: string): boolean {
  // D-266: the strong-evidence leg (effort_perception / RPE) is NECESSARY for the floor to fire.
  // Closes two leaks the safety floor was carrying: (1) two DEMOTED trends (HR drift + RIR) tripping
  // nDeclining≥2 with RPE flat; (2) readiness 'fatigued'/'overreached' fabricated upstream by
  // ACWR-alone (coach:2691) or a single demoted signal (coach:2700) — ACWR can't make RPE decline,
  // so requiring `primaryDeclining` neutralizes both WITHOUT editing the readiness tree (that rework
  // is Q-148). readiness may still DESCRIBE those states; it can no longer ESCALATE load here.
  // 'fatigued' dropped entirely (its productions were the leaks); only a genuine 'overreached'
  // threshold corroborated by the primary survives. THE LAW (D-260) restored on the readiness path.
  // PARKED (revisit post universal-RPE, Q-148): a lone declining RPE trend currently DESCRIBES but
  // does not floor-escalate — conservative "one witness isn't agreement". Relax to solo if warranted.
  const primaryDeclining =
    bodyTrends.effort_perception.based_on_sessions >= 2 &&
    bodyTrends.effort_perception.trend === 'declining';
  const corroboratedDecline = primaryDeclining && computeDecliningSignals(bodyTrends).length >= 2; // primary + ≥1 other
  const readinessHardFloor = readiness === 'overreached' && primaryDeclining;
  return corroboratedDecline || readinessHardFloor;
}

export function reconcileLoadStatus(
  raw: ReconcileLoadInput,
  bodyTrends: {
    cardiac: TrendInfo;
    effort_perception: TrendInfo;
    run_quality: TrendInfo;
    strength: TrendInfo;
  },
  readiness: string,
  planPosition: {
    weekIntent: string;
    weekIndex: number | null;
    totalWeeks: number | null;
    weeksOut: number | null;
    isPlanTransition: boolean;
  },
  unweightedAcwr: number | null,
  keySessionsNext48h: Array<{ date: string; type: string; category: string }>,
  unplannedLoad: { count: number; totalLoad: number; plannedWeekLoad: number },
  runLoadPct: number | null,
  discProfiles?: Array<{ discipline: string; maturity: string; acwr: number | null }>,
  spikeOnEmptyBase: boolean = false,
  /** Item 3 (D-265): Key-2 agreement from absorption. The two-key cap — a LOAD-driven
   *  'high' without corroborated body strain is capped to 'elevated' (descriptive). Because
   *  `corroborated_strain` already folds in the safety floor (nDeclining≥2 / fatigued /
   *  overreached), body/safety-driven highs pass; only load-only highs cap. Default true =
   *  no cap (backward-compat for callers that don't pass it). */
  corroboratedStrain: boolean = true,
): { status: LoadStatusLevel; interpretation: string } {
  const reasons: string[] = [];

  // ── 0. Assess body response quality (shared computation — D-264) ───────
  const decliningSignals = computeDecliningSignals(bodyTrends);
  const nDeclining = decliningSignals.length;

  const runBodyOk =
    (bodyTrends.run_quality.based_on_sessions >= 2 &&
      (bodyTrends.run_quality.trend === 'stable' || bodyTrends.run_quality.trend === 'improving')) &&
    !(bodyTrends.cardiac.based_on_sessions >= 2 && bodyTrends.cardiac.trend === 'declining');
  const excessIsCrossTraining = runLoadPct != null && runLoadPct <= 100;

  // Gate 1 (D-259): you did NOT exceed planned running — or there is no run
  // signal to compare (runLoadPct null). Either way the excess load cannot be
  // running, so the cross-training branches below no longer need runBodyOk.
  const runNotOverPlan = runLoadPct == null || runLoadPct <= 0;
  // The combined "excess is cross-training, not running" predicate: either you're
  // at/under planned running (Gate 1), or the legacy proof (run quality fine AND
  // not way over plan) holds.
  const excessNotFromRunning = runNotOverPlan || (runBodyOk && excessIsCrossTraining);

  // ── 1. Plan-position context ───────────────────────────────────────────
  const { weekIntent, weeksOut, isPlanTransition } = planPosition;
  const isEasyWeek = ['recovery', 'taper', 'deload'].includes(weekIntent);
  const isBuildWeek = weekIntent === 'build';
  const isRaceProximity = weeksOut != null && weeksOut <= 3;

  // Compute escalation ceiling from raw inputs only (ACWR, body trends,
  // readiness, plan position). This is independent of the buildBodyResponse
  // status so de-escalation can't create flicker.
  let ceiling: LoadStatusLevel = 'under';

  const raise = (target: 'on_target' | 'elevated' | 'high', reason: string) => {
    if (LOAD_RANK[target] > LOAD_RANK[ceiling]) {
      ceiling = target;
      reasons.push(reason);
    }
  };

  // Body signal escalation (plan-position-aware)
  if (!isPlanTransition) {
    if (isRaceProximity) {
      if (nDeclining >= 2) raise('high', `${decliningSignals.join(' and ')} declining ${weeksOut}w from race`);
      else if (nDeclining === 1) raise('elevated', `${decliningSignals[0]} declining ${weeksOut}w from race`);
    } else if (isEasyWeek) {
      if (nDeclining >= 2) raise('high', `${decliningSignals.join(' and ')} declining on ${weekIntent} week`);
      else if (nDeclining === 1) raise('elevated', `${decliningSignals[0]} declining on ${weekIntent} week`);
    } else if (isBuildWeek) {
      if (nDeclining >= 2) raise('elevated', `${decliningSignals.join(' and ')} declining during build`);
      else if (nDeclining === 1 && unweightedAcwr != null && unweightedAcwr >= 1.2)
        raise('elevated', `${decliningSignals[0]} declining with ACWR ${unweightedAcwr.toFixed(2)}`);
    } else {
      if (nDeclining >= 2) {
        const target = (unweightedAcwr != null && unweightedAcwr >= 1.2) ? 'high' : 'elevated';
        raise(target as 'elevated' | 'high', `${decliningSignals.join(' and ')} declining`);
      } else if (nDeclining === 1) {
        raise('elevated', `${decliningSignals[0]} trending down`);
      }
    }
  }

  // Readiness-state floor (failsafe) — bypasses both gates (D-259 carve-out).
  if (readiness === 'overreached') {
    raise('high', 'body signals indicate overreaching');
  } else if (readiness === 'fatigued') {
    if (!isEasyWeek || (unweightedAcwr != null && unweightedAcwr >= 1.0)) {
      raise('elevated', 'fatigue markers elevated');
    }
  }

  // Upcoming work: protect key sessions
  if (nDeclining >= 1 && keySessionsNext48h.length > 0 && !isPlanTransition) {
    raise('elevated', `key session upcoming with ${decliningSignals[0]} declining`);
  }

  // Cross-training ACWR gap — skip escalation when cross-training disciplines
  // are still "building" (near-zero chronic baseline makes ACWR meaningless)
  const crossTrainingEstablished = discProfiles
    ? discProfiles.some(p => p.discipline !== 'run' && p.maturity !== 'building' && p.acwr != null && p.acwr > 1.3)
    : true;
  if (unweightedAcwr != null && (raw.running_acwr == null || raw.running_acwr < 1.1) && crossTrainingEstablished) {
    if (unweightedAcwr > 1.5) {
      raise('high', `cross-training spiking total ACWR to ${unweightedAcwr.toFixed(2)}`);
    } else if (unweightedAcwr > 1.3) {
      raise('elevated', `cross-training pushing total ACWR to ${unweightedAcwr.toFixed(2)}`);
    }
  }

  // Unplanned load magnitude — gated on absolute load actually being at/above
  // baseline (D-147). unplanned-as-%-of-planned-week explodes on a LIGHT, off-plan
  // week (skip your planned runs + do one unplanned ride → "89% of planned week")
  // and used to escalate to 'high' → "back off and recover" while ACWR was 0.49
  // (you're UNDER baseline — half a normal week). That's a SWAP, not overload.
  // Require unweightedAcwr ≥ 1.0 (acute ≥ chronic average) before unplanned volume
  // can raise load_status at all; below baseline the status reflects actual (low)
  // load → "build more / off plan". Genuine overload still fires here when ACWR
  // ≥ 1.0, and the body-decline and overreached-readiness paths are independent
  // of this gate, so real overreaching at any ACWR is preserved.
  const loadActuallyElevated = unweightedAcwr != null && unweightedAcwr >= 1.0;
  if (loadActuallyElevated && unplannedLoad.count > 0 && unplannedLoad.plannedWeekLoad > 0) {
    const unplannedPct = Math.round((unplannedLoad.totalLoad / unplannedLoad.plannedWeekLoad) * 100);
    // Gate 1 (D-259): excessNotFromRunning replaces the old `runBodyOk &&
    // excessIsCrossTraining` — a run→cross-training swap (few/no runs, so
    // runBodyOk unsatisfiable) now takes the soft cross-training branch instead
    // of the harsh 'high'.
    if (excessNotFromRunning) {
      if (unplannedPct > 100) raise('elevated', `unplanned cross-training is ${unplannedPct}% of planned week`);
    } else {
      if (unplannedPct > 50) raise('high', `unplanned load is ${unplannedPct}% of planned week`);
      else if (unplannedPct > 25) raise('elevated', `unplanned load is ${unplannedPct}% of planned week`);
    }
  }
  if (loadActuallyElevated && unplannedLoad.count > 0 && unplannedLoad.plannedWeekLoad <= 0 && raw.actual_vs_planned_pct != null) {
    if (raw.actual_vs_planned_pct > 50) raise('high', `actual load ${raw.actual_vs_planned_pct}% above plan`);
    else if (raw.actual_vs_planned_pct > 25) raise('elevated', `actual load ${raw.actual_vs_planned_pct}% above plan`);
  }

  // Race proximity amplifier
  if (isRaceProximity && unplannedLoad.count > 0 && unplannedLoad.totalLoad > 0 && !excessIsCrossTraining) {
    raise('elevated', `unplanned training ${weeksOut}w from race`);
  }

  // ── 2. De-escalation: body handling load well + excess from cross-training
  // Volume metrics may alarm ("high") but if the excess is cross-training (Gate 1
  // or the legacy run-quality proof), and readiness is fresh/adapting, the actual
  // risk is lower. Only applies when escalation checks didn't independently find a
  // reason to be at "high" — ceiling acts as a hard floor.
  let status: LoadStatusLevel = raw.status;
  if (excessNotFromRunning
    && (readiness === 'fresh' || readiness === 'adapting' || readiness === 'normal')
    && status === 'high' && LOAD_RANK[ceiling] < LOAD_RANK['high']) {
    status = 'elevated';
    reasons.push('body responding well — excess is cross-training, not running');
  }

  // ── 3. Apply ceiling: escalation wins if raw inputs demand it ──────────
  if (LOAD_RANK[ceiling] > LOAD_RANK[status]) {
    status = ceiling;
  }

  // Detrained / low running ACWR: reconciler often sets "elevated" from declining
  // execution or key-session caution near a race — not from high workload. "A bit
  // high" then contradicts the ACWR dot + DETRAINED readiness. Soften to on_target
  // unless total ACWR shows real cross-training stress.
  if (
    status === 'elevated' &&
    isAcwrDetrainedSignal(unweightedAcwr) &&
    raw.running_acwr != null &&
    raw.running_acwr < 1.0 &&
    (unweightedAcwr == null || unweightedAcwr < 1.25)
  ) {
    status = LOAD_RANK[raw.status] < LOAD_RANK['on_target'] ? raw.status : 'on_target';
  }

  // ── Gate 2 (D-259): plan-phase build-band tolerance ────────────────────
  // In build/baseline weeks an elevated ACWR is the INTENT (acwr-state.ts:
  // build_optimal_max 1.5 / build_elevated_max 1.7). A load-VOLUME 'high'/
  // 'elevated' that is NOT corroborated by declining body signals or a
  // fatigued/overreached readiness (the carve-out) is softened to the band the
  // ACWR actually earns. Fails SAFE: only build/baseline; 'unknown'/other keep
  // the strict general bands (Q-136 — 'unknown' is currently the live path).
  const isBuildPhase = weekIntent === 'build' || weekIntent === 'baseline';
  const bodyDrivenHigh = nDeclining >= 2 || readiness === 'overreached' || readiness === 'fatigued';
  if (isBuildPhase && !bodyDrivenHigh && unweightedAcwr != null && (status === 'high' || status === 'elevated')) {
    const buildBand: LoadStatusLevel =
      unweightedAcwr <= ACWR_RATIO_THRESHOLDS.build_optimal_max ? 'on_target' :
      unweightedAcwr <= ACWR_RATIO_THRESHOLDS.build_elevated_max ? 'elevated' :
      'high';
    if (LOAD_RANK[buildBand] < LOAD_RANK[status]) {
      status = buildBand;
      reasons.push(`build week — ACWR ${unweightedAcwr.toFixed(2)} within build tolerance`);
    }
  }

  // ── Spike-on-empty-base downgrade (D-146) ──────────────────────────────
  // The escalation paths above can drive 'high'/'elevated' off a SINGLE big
  // session on a thin base — but an undertrained athlete needs volume, not
  // recovery. When the week is a spike on an empty base and there is NO genuine
  // overreaching signal (body trends not declining, readiness not
  // fatigued/overreached) and it isn't a planned easy week, downgrade to 'under'
  // so the verdict reads "build more / get consistent" instead of "back off".
  if (
    spikeOnEmptyBase &&
    (status === 'high' || status === 'elevated') &&
    !isEasyWeek &&
    nDeclining < 2 &&
    readiness !== 'overreached' &&
    readiness !== 'fatigued'
  ) {
    status = 'under';
    reasons.push('one big session on a thin base — build consistency, not recovery');
  }

  // ── Two-key cap (Item 3, D-265): THE LAW needs AGREEMENT ───────────────
  // A LOAD-driven 'high' (Key 1) without corroborated body strain (Key 2) is capped to
  // 'elevated' — descriptive, not prescriptive. `corroboratedStrain` already includes the
  // safety floor (nDeclining≥2 / fatigued / overreached), so body/safety highs pass and
  // only load-only highs cap. This is the structural defense against the false "back off".
  if (status === 'high' && !corroboratedStrain) {
    status = 'elevated';
    reasons.push('load high but body absorbing — no corroborated strain (two-key)');
  }

  // ── Build interpretation ───────────────────────────────────────────────
  let interpretation = raw.interpretation;
  if (reasons.length > 0) {
    interpretation = `${raw.interpretation}. ${reasons.join('; ')}`;
  }

  return { status, interpretation };
}

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

// 'productive' = a REAL load elevation the body is absorbing (Garmin "Productive" / COROS "Optimized" /
// Intervals "Optimal"): non-alarming like on_target, but names the elevation instead of hiding it as
// "balanced". Applied as the final relabel, so it never participates in the rank-based escalation math.
export type LoadStatusLevel = 'under' | 'on_target' | 'productive' | 'elevated' | 'high';

export type ReconcileLoadInput = {
  status: LoadStatusLevel;
  interpretation: string;
  running_acwr: number | null;
  actual_vs_planned_pct: number | null;
};

export type TrendInfo = { trend: string; based_on_sessions: number };

export const LOAD_RANK: Record<string, number> = { under: 0, on_target: 1, productive: 1, elevated: 2, high: 3 };

export interface BodyTrends {
  cardiac: TrendInfo;
  effort_perception: TrendInfo;
  run_quality: TrendInfo;
  strength: TrendInfo;
}

/**
 * Context that de-run-brains the strain signals (D-318). Both flags default to the
 * pre-D-318 behavior, so any caller that omits them is byte-identical to before.
 */
export interface DecliningSignalOpts {
  /** The plan's primary discipline. For a strength-primary plan, declining RIR is the training
   *  INTENT (pushing closer to failure across a build), NOT strain — so it stops counting as a
   *  declining body signal. ⚠️ The onward claim that "the genuine strength-strain signal (e1RM
   *  declining) still flows through computePrimaryAdherence" is DEAD as of D-420: that veto is
   *  deleted, and no weekly strength direction is computed at all. Strength reaches no verdict. */
  planPrimary?: PlanPrimary;
  /** The absorption engine's steady-aerobic gate (absorption.signals.drift.available). When there is
   *  no valid steady session to read HR drift from, the absorption engine excludes drift ("no steady
   *  aerobic effort to corroborate") — so the reconciler's looser all-runs cardiac trend must NOT count
   *  "HR drift declining" as strain either. Default true = pre-D-318 (drift always counted). */
  driftUsable?: boolean;
}

/**
 * The declining body-signal names (≥2 sessions + declining trend). ONE canonical
 * computation (D-264) — the reconciler's `nDeclining` and Item 3's absorption
 * safety-floor (`nDeclining ≥ 2`) both read this, so they can never disagree.
 *
 * D-318: two signals are de-run-brained via `opts` — see DecliningSignalOpts. Both
 * gates default OFF (opts omitted ⇒ identical to the pre-D-318 four-signal set).
 */
export function computeDecliningSignals(bodyTrends: BodyTrends, opts: DecliningSignalOpts = {}): string[] {
  const s: string[] = [];
  const driftUsable = opts.driftUsable !== false; // default true (pre-D-318)
  if (driftUsable && bodyTrends.cardiac.based_on_sessions >= 2 && bodyTrends.cardiac.trend === 'declining') s.push('HR drift');
  if (bodyTrends.effort_perception.based_on_sessions >= 2 && bodyTrends.effort_perception.trend === 'declining') s.push('RPE');
  if (bodyTrends.run_quality.based_on_sessions >= 2 && bodyTrends.run_quality.trend === 'declining') s.push('execution');
  const rirCountsAsStrain = opts.planPrimary !== 'strength'; // strength-primary: declining RIR = intent, not strain
  if (rirCountsAsStrain && bodyTrends.strength.based_on_sessions >= 2 && bodyTrends.strength.trend === 'declining') s.push('RIR');
  return s;
}

/**
 * The absorption SAFETY FLOOR (Item 3): genuine overreaching that escalates regardless of
 * the two-key rule — ≥2 declining body signals OR fatigued/overreached readiness. Fed into
 * `assessAbsorption` as `safetyFloor`, which makes `corroborated_strain` true, so the
 * reconciler two-key cap lets it through. One shared computation (D-264).
 */
export function computeSafetyFloor(bodyTrends: BodyTrends, readiness: string, opts: DecliningSignalOpts = {}): boolean {
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
  const corroboratedDecline = primaryDeclining && computeDecliningSignals(bodyTrends, opts).length >= 2; // primary + ≥1 other
  const readinessHardFloor = readiness === 'overreached' && primaryDeclining;
  return corroboratedDecline || readinessHardFloor;
}

// ── THE ONE OVERLOAD MINT (Slice 1, 2026-08-12) ──────────────────────────────
//
// "Are you overloaded" is decided HERE and nowhere else. Before this there were six places that
// could reach that conclusion independently (the reconciler, computeAssessment's 'overreaching',
// the raw readiness tree, buildVerdict's ACWR bands, weekly.ts's inline acwr_status, and
// body-response's computeTotalLoadStatus) — so one payload could say `glance on_track` and
// "Signs of overreaching — consider backing off" in the same breath.
//
// ⛔ THE YARDSTICK (Michael, 2026-08-12): *a plan you followed can't be "too much" — the plan IS
// the intended load. Flag on what the body reports, never on the numbers the app handed you.*
//
// So the verdict is fed by THREE athlete-owned signals and nothing else:
//   1. RPE — the athlete's own report of how hard it felt (internal load).
//   2. Measured body metrics — HR drift, cardiac efficiency, execution (what the body did).
//   3. Actual-vs-PLANNED load — did the athlete do MORE than the plan asked (external load).
//
// And it is BLIND to, by construction:
//   • absolute ACWR — a ratio the plan itself produces. A build week is SUPPOSED to ramp; a 1.4
//     an athlete was prescribed is the plan working, not the athlete overreaching. ACWR stays a
//     descriptive gauge (the number still renders) and never a verdict input here.
//   • prescribed load — the app cannot hand you a week and then blame you for completing it.
//   • strength e1RM — a the previous program weight wave dips e1RM BY DESIGN in weeks 2-3 and on the deload.
//     That is a protocol artifact, not strain. (The honest strength gauge is Slice 2.)
//
// Field-standard backing: the two-key structure (internal RPE + external load) is the standard
// monitoring pair — Foster's session-RPE work, and the Gabbett load-ratio literature's own caveat
// that a ratio without symptom corroboration is descriptive. It is the same "the ratio DESCRIBES,
// the body PRESCRIBES" law D-260/D-266 already put in the reconciler, applied one level up.

/** Actual load must exceed planned load by more than this (%) to count as "you did more than the
 *  plan asked". 25% matches the reconciler's long-standing unplanned-load escalation step, so the
 *  exceed threshold is one number, not two. Below it, a week is normal execution noise. */
export const EXCEED_PLAN_PCT = 25;

export interface OverloadVerdict {
  /** THE verdict. Every lane reads this and none re-derives it. */
  overloaded: boolean;
  /** 'watch' = the body reported something but nothing corroborates it — describe, never prescribe. */
  level: 'none' | 'watch' | 'overload';
  /** Did the athlete do MORE than the plan asked (the only load input that can escalate)? */
  exceeded_plan: boolean;
  exceeded_plan_pct: number | null;
  /** The athlete-reported / measured signals that are declining (never includes strength e1RM). */
  strain_signals: string[];
  /** One-line receipt so a surface can show WHY without re-deciding. */
  basis: string;
}

/** The neutral verdict, for callers with no signal at all (cold start / no plan). */
export const NO_OVERLOAD: OverloadVerdict = {
  overloaded: false,
  level: 'none',
  exceeded_plan: false,
  exceeded_plan_pct: null,
  strain_signals: [],
  basis: 'no overload signal',
};

/**
 * Mint the overload verdict. Pure; no ACWR, no prescribed load, no e1RM — see the block above.
 *
 * Two ways to be overloaded, both athlete-owned:
 *   (A) you did MORE than the plan asked AND the body reports at least one declining signal;
 *   (B) the body reports TWICE — ≥2 declining signals WITH RPE among them — regardless of load.
 *       RPE is required because it is the one signal the athlete states directly; the measured
 *       markers are confoundable (heat, hills, sleep) and two confounded markers are not a witness.
 *       This mirrors computeSafetyFloor's D-266 rule, so the floor and the mint cannot disagree.
 *
 * Anything less that still has a declining signal is 'watch': it SHOWS, it never prescribes.
 */
export function mintOverloadVerdict(args: {
  /** Declining measured/reported signals, already de-run-brained and e1RM-free. */
  strainSignals: string[];
  /** Is RPE (the athlete's own report) one of them? */
  rpeDeclining: boolean;
  /** (actual − planned) / planned × 100 for the week to date. Null = no plan to compare against. */
  actualVsPlannedPct: number | null;
  /** Unplanned (off-plan) load as a % of the planned week — training added ON TOP of the plan. */
  unplannedShareOfPlannedPct: number | null;
}): OverloadVerdict {
  const signals = (args.strainSignals ?? []).filter(Boolean);
  const overPlan = args.actualVsPlannedPct != null && args.actualVsPlannedPct > EXCEED_PLAN_PCT;
  const overUnplanned = args.unplannedShareOfPlannedPct != null && args.unplannedShareOfPlannedPct > EXCEED_PLAN_PCT;
  const exceeded_plan = overPlan || overUnplanned;

  const keyA = exceeded_plan && signals.length >= 1;
  const keyB = signals.length >= 2 && args.rpeDeclining;
  const overloaded = keyA || keyB;

  const level: OverloadVerdict['level'] = overloaded ? 'overload' : signals.length >= 1 ? 'watch' : 'none';

  const planTxt = args.actualVsPlannedPct != null
    ? `${args.actualVsPlannedPct > 0 ? '+' : ''}${Math.round(args.actualVsPlannedPct)}% vs plan`
    : 'no plan comparison';
  const sigTxt = signals.length ? signals.join(' + ') : 'no declining signals';
  const basis = overloaded
    ? (keyA ? `did more than planned (${planTxt}) with ${sigTxt} declining`
            : `${sigTxt} declining together (reported effort among them)`)
    : level === 'watch'
      ? `${sigTxt} declining, ${planTxt} — worth watching, not overload`
      : `${sigTxt}, ${planTxt}`;

  return { overloaded, level, exceeded_plan, exceeded_plan_pct: args.actualVsPlannedPct, strain_signals: signals, basis };
}

// ── D-267: plan-primary discipline + primary-discipline adherence ────────────
// The load verdict must read the plan's PRIMARY discipline, not hardcoded running. For a
// strength-primary plan a run-only 'under' is NOT under-training when strength is on plan. Pure
// exported helpers — coach resolves + computes, the reconciler applies (§5). Sole authority stays
// the reconciler (D-260). See docs/DESIGN-D267-plan-primary-load-verdict.md.

export type PlanPrimary = 'strength' | 'endurance' | 'hybrid' | 'unknown';
export interface PrimaryAdherence { discipline: string; met: boolean; note: string }

/** Strength sessions may fall short of the (prorated) weekly target by this much and still count on-plan. */
export const STRENGTH_ADHERENCE_TOLERANCE = 1;
/** total acute:chronic ≥ this ⇒ a skipped endurance shortfall was redistributed into cross-training, not lost. */
export const ENDURANCE_COVERED_ACWR_MIN = 1.0;
/** strength-primary 'under' requires total acute:chronic below this (genuinely low total load). */
export const UNDER_TOTAL_ACWR_MAX = 0.8;

/** (§3) Source the plan's PRIMARY discipline from plan config. Unknown/unrecognized → current behavior. */
export function resolvePlanPrimary(planConfig: any): PlanPrimary {
  const source = String(planConfig?.source ?? '').toLowerCase();
  const version = String(planConfig?.plan_version ?? '').toLowerCase();
  if (source === 'strength_primary' || version.startsWith('strength_primary')) return 'strength';
  if (source.startsWith('endurance') || source === 'run' || source === 'triathlon' || source === 'duathlon') return 'endurance';
  if (source.startsWith('hybrid') || source.startsWith('combined')) return 'hybrid';
  return 'unknown';
}

// b2 scale-up (Q-149): the SPECIFIC lead discipline for the execution surface — strength/run/ride/swim,
// or a multi-sport bucket (triathlon/duathlon/hybrid) that must NOT force a single lead. This is a display
// concern distinct from resolvePlanPrimary's load-verdict bucket, but it DELEGATES to it so "is this
// strength-primary" stays one decision (Law-1). Reads the plan's own sport field (config.discipline ||
// config.sport || config.source || plan_type) — the same signal arc-context.ts:684 uses.
export type PrimarySport = 'strength' | 'run' | 'ride' | 'swim' | 'triathlon' | 'duathlon' | 'hybrid' | 'unknown';

export function resolvePrimarySport(planConfig: any, planType?: string | null): PrimarySport {
  // Strength is decided in exactly one place.
  if (resolvePlanPrimary(planConfig) === 'strength') return 'strength';
  const raw = String(
    planConfig?.discipline ?? planConfig?.sport ?? planConfig?.source ?? planType ?? ''
  ).toLowerCase().trim();
  if (/triathlon|(^|[^a-z])tri([^a-z]|$)/.test(raw)) return 'triathlon';
  if (/duathlon|duath/.test(raw)) return 'duathlon';
  if (/cycl|bike|ride/.test(raw)) return 'ride';
  if (/swim/.test(raw)) return 'swim';
  if (/run/.test(raw)) return 'run';
  if (resolvePlanPrimary(planConfig) === 'hybrid') return 'hybrid';
  // Can't tell → no forced single lead (honest: never hoist a discipline we can't confirm is primary).
  return 'unknown';
}

/**
 * (§4) WTD-prorated primary-discipline adherence. Strength-primary v1 only (returns null otherwise).
 * Mid-week the target is prorated by the fraction of the week ELAPSED, so strength done later in the
 * week is not falsely flagged "not met" early. dayIndex = 0..6 within the plan week (0 = week start).
 */
export function computePrimaryAdherence(args: {
  planPrimary: PlanPrimary;
  strengthSessionsCompleted: number;
  strengthFrequency: number;
  /** e1RM-derived strength-progression direction (`weeklyResponseModel.strength.overall.trend`).
   *  ⛔ DESCRIPTIVE ONLY since [D-420] — it appends a clause to `note` and DECIDES NOTHING. See the
   *  deletion notice on the veto below. Null / unrecognised → no clause. */
  e1rmDirection: string | null;
  dayIndex: number;
}): PrimaryAdherence | null {
  if (args.planPrimary !== 'strength') return null;
  const elapsedFrac = Math.min(1, (args.dayIndex + 1) / 7);
  const expectedByNow = args.strengthFrequency * elapsedFrac;
  const sessionsMet = args.strengthSessionsCompleted >= expectedByNow - STRENGTH_ADHERENCE_TOLERANCE;
  // ⛔ THE D-267 "FIX 1" e1RM-DECLINING VETO IS DELETED (D-420, 2026-08-12). DO NOT REINSTATE IT.
  //
  // It read `met = sessionsMet && e1rmDirection !== 'declining'` — an athlete who did every prescribed
  // strength session was still marked as not meeting their primary discipline if a weekly e1RM
  // direction said "declining."
  //
  // TWO INDEPENDENT REASONS, either sufficient:
  //   1. **THE FIELD DOESN'T DO THIS.** Strong and Hevy have no "you're declining" gate anywhere —
  //      adherence is whether you did the work, and a max is tracked as a record beside it. Michael's
  //      call, and it matches `docs/SCIENCE-strength-e1rm-trust.md` §3.
  //   2. **NOTHING CAN PRODUCE THE INPUT.** D-420 retired the weekly strength direction verdict, so
  //      `strength.overall.trend` is now always 'insufficient_data'. The branch was unreachable.
  //
  // ⚠️ DELETED, NOT LEFT DORMANT, AND THAT IS THE POINT. A dead gate that still reads a live field is
  // how a retired verdict grows back: restore any direction upstream and this silently starts vetoing
  // again, from a line nobody remembers is here.
  //
  // ⚠️ EVERYTHING ELSE IN D-267 SURVIVES UNCHANGED — the WTD-prorated session count, the tolerance, and
  // the plan-primary INVARIANT it feeds (§5: `met === true` ⟹ a raw 'under' never survives). Only the
  // strength-decline veto is gone, so `met` is now exactly "did you do the sessions".
  const met = sessionsMet;
  const note = `strength ${args.strengthSessionsCompleted}/${args.strengthFrequency} sessions`
             + (args.e1rmDirection === 'gaining' ? ' · e1RM improving'
                : args.e1rmDirection === 'declining' ? ' · e1RM declining'
                : args.e1rmDirection === 'maintaining' ? ' · e1RM steady' : '');
  return { discipline: 'strength', met, note };
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
    /** D-267: the plan's primary discipline (resolvePlanPrimary). Absent/'unknown' → current behavior. */
    planPrimary?: PlanPrimary;
    /** D-267: primary-discipline adherence (computePrimaryAdherence). Null/absent → current behavior. */
    primaryAdherence?: PrimaryAdherence | null;
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
  /** D-318: the absorption engine's steady-aerobic drift gate. false ⇒ HR drift is not a strain signal
   *  (no valid steady session to read it from). Default true = pre-D-318. Fed into computeDecliningSignals
   *  alongside planPrimary so the escalation and the safety floor read the SAME de-run-brained signal set. */
  driftUsable: boolean = true,
  /** Slice 1 (2026-08-12): THE overload verdict (mintOverloadVerdict), minted once upstream and read
   *  here. When supplied, NO body/readiness path may escalate unless the verdict says overloaded, and
   *  the absolute-ACWR escalators are off — the ratio describes, it never prescribes. Omitted/null ⇒
   *  byte-identical pre-slice behavior (same fail-safe pattern as corroboratedStrain / driftUsable). */
  overload: OverloadVerdict | null = null,
): { status: LoadStatusLevel; interpretation: string; acwrProvisional: boolean } {
  const reasons: string[] = [];

  // ── 0. Assess body response quality (shared computation — D-264) ───────
  // D-318: strength-primary drops RIR-as-strain; an unusable drift gate drops HR-drift-as-strain.
  const decliningOpts: DecliningSignalOpts = { planPrimary: planPosition.planPrimary ?? 'unknown', driftUsable };
  const decliningSignals = computeDecliningSignals(bodyTrends, decliningOpts);
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
  const { weekIntent, weeksOut, isPlanTransition, planPrimary = 'unknown', primaryAdherence = null } = planPosition;
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

  // Slice 1: the ONE verdict gates every escalation below. `mayEscalate` false ⇒ the body/readiness
  // paths can still DESCRIBE (the interpretation still names what's declining) but cannot raise the
  // load word. `loadCorroborates` replaces the old absolute-ACWR corroborator: what makes a single
  // declining signal serious is that the athlete did MORE than the plan asked — not that a ratio the
  // plan itself produced sits above 1.2.
  const mayEscalate = overload == null || overload.overloaded;
  const loadCorroborates = overload != null
    ? overload.exceeded_plan
    : (unweightedAcwr != null && unweightedAcwr >= 1.2); // legacy path (no verdict supplied)

  // Body signal escalation (plan-position-aware)
  if (!isPlanTransition && mayEscalate) {
    if (isRaceProximity) {
      if (nDeclining >= 2) raise('high', `${decliningSignals.join(' and ')} declining ${weeksOut}w from race`);
      else if (nDeclining === 1) raise('elevated', `${decliningSignals[0]} declining ${weeksOut}w from race`);
    } else if (isEasyWeek) {
      if (nDeclining >= 2) raise('high', `${decliningSignals.join(' and ')} declining on ${weekIntent} week`);
      else if (nDeclining === 1) raise('elevated', `${decliningSignals[0]} declining on ${weekIntent} week`);
    } else if (isBuildWeek) {
      if (nDeclining >= 2) raise('elevated', `${decliningSignals.join(' and ')} declining during build`);
      else if (nDeclining === 1 && loadCorroborates)
        raise('elevated', `${decliningSignals[0]} declining while over planned load`);
    } else {
      if (nDeclining >= 2) {
        const target = loadCorroborates ? 'high' : 'elevated';
        raise(target as 'elevated' | 'high', `${decliningSignals.join(' and ')} declining`);
      } else if (nDeclining === 1) {
        raise('elevated', `${decliningSignals[0]} trending down`);
      }
    }
  }

  // Readiness-state floor (failsafe) — bypasses both gates (D-259 carve-out).
  // Slice 1: gated by the one verdict. Readiness is itself minted from that verdict upstream, so this
  // is belt-and-braces for callers that pass a readiness computed some other way.
  if (mayEscalate) {
    if (readiness === 'overreached') {
      raise('high', 'body signals indicate overreaching');
    } else if (readiness === 'fatigued') {
      if (!isEasyWeek || (unweightedAcwr != null && unweightedAcwr >= 1.0)) {
        raise('elevated', 'fatigue markers elevated');
      }
    }
  }

  // Upcoming work: protect key sessions
  if (nDeclining >= 1 && keySessionsNext48h.length > 0 && !isPlanTransition && mayEscalate) {
    raise('elevated', `key session upcoming with ${decliningSignals[0]} declining`);
  }

  // Cross-training ACWR gap — skip escalation when cross-training disciplines
  // are still "building" (near-zero chronic baseline makes ACWR meaningless)
  const crossTrainingEstablished = discProfiles
    ? discProfiles.some(p => p.discipline !== 'run' && p.maturity !== 'building' && p.acwr != null && p.acwr > 1.3)
    : true;
  // Slice 1: this block was a pure ABSOLUTE-ACWR escalator — a planned cross-training block pushed the
  // total ratio past 1.3 and the athlete got told their load was high for following the plan. It now
  // only speaks when the cross-training was added ON TOP of the plan (exceeded_plan).
  const crossTrainingOverPlan = overload == null || overload.exceeded_plan;
  if (crossTrainingOverPlan && unweightedAcwr != null && (raw.running_acwr == null || raw.running_acwr < 1.1) && crossTrainingEstablished) {
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
  // Slice 1: the carve-out that skips the build tolerance is the ONE verdict, not a raw signal count —
  // otherwise two uncorroborated markers keep a build week pinned "high" for doing exactly the plan.
  const bodyDrivenHigh = overload != null
    ? overload.overloaded
    : (nDeclining >= 2 || readiness === 'overreached' || readiness === 'fatigued');
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

  // ── D-267: plan-primary re-classification (UNDER-direction only) ───────────
  // The verdict reads the plan's PRIMARY discipline. For a strength-primary plan a run-only 'under'
  // is NOT under-training when strength is on plan (INVARIANT §5: primaryAdherence.met===true ⟹ a raw
  // 'under' NEVER survives) or when total load is maintained. Endurance-primary / hybrid / unknown:
  // byte-identical current behavior — this block only runs for planPrimary==='strength' AND a still-
  // 'under' status. Only ever corrects the under-direction; escalation is untouched (§9).
  if (status === 'under' && planPrimary === 'strength') {
    const met = primaryAdherence?.met === true;
    const adh = primaryAdherence?.note ?? 'strength on plan';
    const acwrTxt = unweightedAcwr != null ? unweightedAcwr.toFixed(2) : 'n/a';
    const covered = unweightedAcwr != null && unweightedAcwr >= ENDURANCE_COVERED_ACWR_MIN;
    const totalGenuinelyLow = unweightedAcwr == null || unweightedAcwr < UNDER_TOTAL_ACWR_MAX;
    if (met) {
      // INVARIANT: strength on plan ⇒ never under. (a) covered → cross-training evidence; (b) uncovered → headroom.
      status = 'on_target';
      reasons.push(covered
        ? `${adh}; endurance load carried by cross-training (total ACWR ${acwrTxt})`
        : `${adh}; you have headroom to add endurance`);
    } else if (!totalGenuinelyLow) {
      // strength behind plan, BUT total load maintained → attention, not a deficit; never 'under'.
      // The note carries the reason (the sessions shortfall). ⚠️ "OR e1RM declining" was the other way
      // in here until D-420 deleted that veto — `met` is now purely the session count.
      status = 'on_target';
      reasons.push(`${adh} — attention, not under-training (total load maintained)`);
    } else {
      // strength behind plan AND total load genuinely low → 'under' stands (genuine build-more); name it.
      reasons.push(`${adh}; total load low (ACWR ${acwrTxt}) — build more`);
    }
  }

  // ── Two-key cap (Item 3, D-265): THE LAW needs AGREEMENT ───────────────
  // A LOAD-driven 'high' (Key 1) without corroborated body strain (Key 2) is capped to
  // 'elevated' — descriptive, not prescriptive. `corroboratedStrain` already includes the
  // safety floor (nDeclining≥2 / fatigued / overreached), so body/safety highs pass and
  // only load-only highs cap. This is the structural defense against the false "back off".
  // A REAL load elevation the body is ABSORBING (no corroborated strain) is PRODUCTIVE — surface the
  // elevation as a positive, not "balanced" (hides it) and not "back off" (a false alarm). A corroborated
  // -strain high stays 'high' ("pull back"). Only genuine elevations reach here: a thin/empty-base spike
  // was already downgraded to 'under' above, so 'productive' can't fire off an unreliable ratio.
  // …AND requires good readiness (fresh/adapting/normal): a fatigued athlete on a flat-effort week is NOT
  // "productive", so that path still caps to 'elevated' via the else-if.
  // Slice 1: when the one verdict is present it IS the second key — a raw 'high' that came from the
  // absolute-ACWR bands upstream (computeTotalLoadStatus) can no longer wear an overload word just
  // because no one refuted it. Verdict says no overload ⇒ the elevation is real but absorbed.
  const strainCorroborated = overload != null ? overload.overloaded : corroboratedStrain;
  const bodyGenuinelyFine = overload != null
    ? !overload.overloaded
    : ((readiness === 'fresh' || readiness === 'adapting' || readiness === 'normal') && nDeclining < 2);
  if ((status === 'high' || status === 'elevated') && !strainCorroborated && bodyGenuinelyFine) {
    status = 'productive';
    reasons.push(`load elevated (ACWR ${unweightedAcwr != null ? unweightedAcwr.toFixed(2) : 'n/a'}) and the body's absorbing it — productive`);
  } else if (status === 'high' && !strainCorroborated) {
    status = 'elevated';
    reasons.push('load high but body absorbing — no corroborated strain (two-key)');
  }

  // ── Build interpretation ───────────────────────────────────────────────
  // D-268 Phase 1: for a strength-primary plan, running is NOT the framing. Strip body-response's
  // run-only lead ("Running load X% below plan") and lead with the plan-aware reasons; keep the
  // cross-training breakdown. The reconciler owns the final interpretation (THE LAW); body-response
  // supplies the raw breakdown only. Endurance / hybrid / unknown: unchanged (run/endurance framing kept).
  let interpretation: string;
  if (planPrimary === 'strength') {
    const breakdown = raw.interpretation.replace(/^\s*Running load\b[^.]*(?:\.\s*|$)/i, '').trim();
    interpretation = reasons.length > 0
      ? (breakdown ? `${reasons.join('; ')}. ${breakdown}` : reasons.join('; '))
      : (breakdown || raw.interpretation);
  } else {
    interpretation = reasons.length > 0 ? `${raw.interpretation}. ${reasons.join('; ')}` : raw.interpretation;
  }

  // Provisional-ACWR flag (field-standard): an elevated ratio is only trustworthy on an established
  // chronic base (Gabbett: ~4wk chronic; Garmin/COROS/Intervals gate on a real base). Key it on the
  // ACTUAL thin-base signal (`spikeOnEmptyBase` — a big acute load on a near-empty chronic base), NOT on
  // "the verdict stayed low" (which also happens for real-base athletes whose spike is cross-training-
  // attributed — flagging THOSE was wrong). So: a genuinely-thin base with a high ratio → provisional;
  // a real base → never provisional, whatever the composition. Athlete/plan-agnostic.
  const acwrProvisional = spikeOnEmptyBase && unweightedAcwr != null && unweightedAcwr >= 1.3;
  return { status, interpretation, acwrProvisional };
}

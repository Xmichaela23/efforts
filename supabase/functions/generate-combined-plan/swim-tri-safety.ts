/**
 * 70.3 tri swim safety: ability-based weekly floors and cutoff-driven swim_intent promotion.
 * History multiplier still scales templates first; these rules prevent dangerously thin yards
 * when pace shows cutoff-risk profile (Arc swim_threshold_pace).
 */

import { normalizeGoalDistanceKey } from '../_shared/race-projections.ts';
import type { SwimSlotTemplate } from '../_shared/swim-program-templates.ts';
import type { AthleteState, GoalInput, Phase } from './types.ts';

/** Pace at or slower than 2:30/100 yd — ability signal for swim-load floors. */
export const SWIM_SLOW_BASELINE_SEC_PER_100YD = 150;

/** Minimum weekly planned swim yards for 70.3 when slow baseline is known (overrides thin history scaling). */
export const SWIM_703_ABILITY_WEEK_MIN_YD = 4500;

/** At least one swim should exceed this duration (minutes) for slow 70.3 profiles — time-on-body guardrail. */
export const SWIM_LONG_SESSION_MIN_MIN = 45;

function isTriGoal(g: GoalInput): boolean {
  const s = String(g.sport ?? '').toLowerCase();
  return s === 'triathlon' || s === 'tri' || s.includes('triathlon');
}

/** Parse `athlete_state.swim_threshold_pace` ("2:30" / "2:30/100yd") → seconds per 100 yd. */
export function parseSwimThresholdPaceSecPer100Yd(raw: string | undefined | null): number | null {
  if (raw == null || typeof raw !== 'string') return null;
  const s = raw.trim();
  const timePart = s.split(/[\/\s]/)[0]?.trim() ?? '';
  const m = timePart.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const mm = parseInt(m[1]!, 10);
    const ss = parseInt(m[2]!, 10);
    if (!Number.isFinite(mm) || !Number.isFinite(ss)) return null;
    return mm * 60 + ss;
  }
  const n = Number(s);
  if (Number.isFinite(n) && n > 40 && n < 600) return n;
  return null;
}

export function promote703SwimIntentForCutoffRisk(goals: GoalInput[], state: AthleteState): AthleteState {
  const primary = goals.find((g) => g.priority === 'A') ?? goals[0];
  if (!primary || !isTriGoal(primary)) return state;
  const dk = normalizeGoalDistanceKey(primary.distance ?? '');
  if (dk !== '70.3') return state;
  if (state.swim_intent !== 'race') return state;

  const p = state.swim_cutoff_pressure_v1;
  if (!p || (p.severity !== 'elevated' && p.severity !== 'high')) return state;

  const nextPressure = {
    ...p,
    intent_promoted_to_focus: true,
    intent_promotion_reasons: Array.isArray(p.intent_promotion_reasons)
      ? [...p.intent_promotion_reasons, 'cutoff_margin_engine_promoted_focus']
      : ['cutoff_margin_engine_promoted_focus'],
  };

  return {
    ...state,
    swim_intent: 'focus',
    swim_cutoff_pressure_v1: nextPressure,
    swim_load_source: state.swim_load_source ?? 'split',
  };
}

function slotFloorYd(t: SwimSlotTemplate): number {
  if (t.session_type === 'kick_focused' || t.session_type === 'pull_focused') return 1000;
  if (t.session_type === 'endurance') return 1200;
  const easyLike = t.session_type === 'easy' || t.session_type === 'technique_aerobic';
  if (t.session_type === 'technique_aerobic') return 900;
  if (easyLike) return 800;
  return 1000;
}

function impliedDurationMin(sessionType: SwimSlotTemplate['session_type'], yards: number): number {
  switch (sessionType) {
    case 'threshold':
      return yards / 40;
    case 'css_aerobic':
    case 'race_specific_aerobic':
      return yards / 42;
    case 'kick_focused':
    case 'pull_focused':
      return yards / 36;
    case 'endurance':
      return yards / 34;
    default:
      return yards / 35;
  }
}

function snapStepUp(sessionType: SwimSlotTemplate['session_type'], y: number): number {
  const smallStep =
    sessionType === 'easy' ||
    sessionType === 'technique_aerobic' ||
    sessionType === 'kick_focused' ||
    sessionType === 'pull_focused';
  const yy = y + (smallStep ? 50 : 100);
  if (smallStep) {
    return Math.round(yy / 50) * 50;
  }
  return Math.round(yy / 100) * 100;
}

function eligible703SlowSwimmerFloors(opts: {
  primaryGoal: GoalInput;
  athleteState: AthleteState;
  phase: Phase;
  hasTri: boolean;
  swimSingleRecovery: boolean;
  swimPct: number;
  raceThisWeek: boolean;
  isRecovery: boolean;
  recoveryRebuildWeek1: boolean;
  templatesLen: number;
}): boolean {
  if (!opts.hasTri || opts.templatesLen === 0) return false;
  if (!isTriGoal(opts.primaryGoal)) return false;
  if (normalizeGoalDistanceKey(opts.primaryGoal.distance ?? '') !== '70.3') return false;
  if (opts.swimSingleRecovery || opts.swimPct <= 0) return false;
  if (opts.raceThisWeek || opts.isRecovery || opts.recoveryRebuildWeek1) return false;
  if (opts.phase === 'taper') return false;

  const sec = parseSwimThresholdPaceSecPer100Yd(opts.athleteState.swim_threshold_pace);
  if (sec == null || !Number.isFinite(sec)) return false;
  return sec >= SWIM_SLOW_BASELINE_SEC_PER_100YD;
}

/**
 * Raises per-slot yards so weekly sum ≥ {@link SWIM_703_ABILITY_WEEK_MIN_YD} and the longest swim
 * exceeds {@link SWIM_LONG_SESSION_MIN_MIN} active minutes (via session-factory duration model).
 */
export function apply703SlowSwimmerWeeklyFloors(opts: {
  templates: SwimSlotTemplate[];
  slotYards: number[];
  primaryGoal: GoalInput;
  athleteState: AthleteState;
  phase: Phase;
  hasTri: boolean;
  swimSingleRecovery: boolean;
  swimPct: number;
  raceThisWeek: boolean;
  isRecovery: boolean;
  recoveryRebuildWeek1: boolean;
}): number[] {
  const { templates } = opts;
  const n = templates.length;
  if (n === 0 || opts.slotYards.length !== n) return opts.slotYards;

  if (
    !eligible703SlowSwimmerFloors({
      primaryGoal: opts.primaryGoal,
      athleteState: opts.athleteState,
      phase: opts.phase,
      hasTri: opts.hasTri,
      swimSingleRecovery: opts.swimSingleRecovery,
      swimPct: opts.swimPct,
      raceThisWeek: opts.raceThisWeek,
      isRecovery: opts.isRecovery,
      recoveryRebuildWeek1: opts.recoveryRebuildWeek1,
      templatesLen: n,
    })
  ) {
    return [...opts.slotYards];
  }

  const out = opts.slotYards.map((y, i) => Math.max(slotFloorYd(templates[i]!), y));
  const sum = () => out.reduce((a, b) => a + b, 0);

  const bumpToward = (target: number) => {
    let guard = 0;
    while (sum() < target && guard < 500) {
      guard++;
      let bi = 0;
      for (let i = 1; i < n; i++) {
        if (out[i]! > out[bi]!) bi = i;
      }
      const st = templates[bi]!.session_type;
      out[bi] = snapStepUp(st, out[bi]!);
    }
  };

  bumpToward(SWIM_703_ABILITY_WEEK_MIN_YD);

  let longestIdx = 0;
  for (let i = 1; i < n; i++) {
    if (out[i]! > out[longestIdx]!) longestIdx = i;
  }
  const tLong = templates[longestIdx]!;
  let guard2 = 0;
  while (
    impliedDurationMin(tLong.session_type, out[longestIdx]!) < SWIM_LONG_SESSION_MIN_MIN &&
    guard2 < 500
  ) {
    guard2++;
    out[longestIdx] = snapStepUp(tLong.session_type, out[longestIdx]!);
  }

  bumpToward(SWIM_703_ABILITY_WEEK_MIN_YD);

  return out;
}

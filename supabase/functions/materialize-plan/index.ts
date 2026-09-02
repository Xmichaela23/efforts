// @ts-nocheck
// Function: materialize-plan
// Behavior: Expand planned_workouts into computed.steps (stable ids) + total duration.
// Supports run/ride/swim/strength tokens, workout_structure fallback, long_run_* tokens,
// and description-based single-step fallback. CORS enabled. Returns count materialized.
// - Reads planned_workouts rows by training_plan_id or single planned_workout id
// - Expands steps_preset tokens into computed.steps with stable ids
// - Resolves run paces (fiveK/easy) and bike power (FTP %) using user_baselines.performance_numbers
// - Persists computed.steps and duration
// - Applies user plan_adjustments to modify prescribed weights

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  hasBarbellCapability,
  hasCompound1RMSignals,
  resolveStrengthEquipmentTypeForPlan,
} from '../_shared/strength-equipment-tier.ts';
import { resolveSwimStepEquipment } from '../_shared/swim/swim-step-equipment.ts';
import { calculatePlannedStrengthWorkload, resolveBodyweightLb } from '../_shared/workload.ts';
import { fetchLastWeightByMovement } from '../_shared/last-weight-by-movement.ts';
// ⚠️ The SERVER canonicalizer — `exercise_log.canonical_name` is its output, so the lookup key and
// the stored key are the same function's answer. The client mirror lacks the Q-197 plural rule.
import { canonicalize as canonicalizeName } from '../_shared/canonicalize.ts';
import { getExerciseConfig, getBaseline1RM, formatWeightDisplay, getMovementGroup, resolveSwapSeedWeight } from '../../../src/lib/exercise-config.ts';
import { resolveProfile, getTargetRir, protocolUsesRir } from '../_shared/strength-profiles.ts';

/**
 * ⛔ DOES THIS ROW GET A DERIVED RESERVE TARGET? Two answers, and they are different questions.
 *
 *   1. **The PROTOCOL** — `protocolUsesRir`. the previous program auto-regulates nothing: the working number and
 *      the reps are fixed at plan creation, so a reserve target is a second instruction that can
 *      contradict the prescription.
 *   2. **The SLOT** — p218 gives ME *"no RIR target"* in as many words, while giving DE, SKILL and
 *      HYP one each. That is a per-row fact and the protocol flag cannot express it.
 *
 * ⚠️ IT WAS ONLY EVER ASKING (1), AND MICHAEL SAW THE RESULT (2026-08-28). The composer stamps
 * nothing on an ME row precisely because the source states nothing (`compose.ts`
 * `targetRirForIntent` returns null for ME) — and this file then DERIVED one off the RPE chart. His
 * ME pull-up card read *"1-5 reps, stopped short of failure"* above a row reading **"target 1-5 · 2
 * in reserve"**. The plan contradicted itself on one card.
 *
 * ⛔ EXTRACTED SO IT CAN BE TESTED. It was the same expression inlined at two seams (the strength
 * branch runs twice in this file), which is two places for one rule to drift and nowhere to assert
 * it. ⚠️ ABSENT, NEVER ZERO — p219 defines 0 RIR as a real and specific instruction, so a zero here
 * would say something he did not say.
 */
export function stampsTargetRir(protocolTracksRir: boolean, slotIntent: unknown): boolean {
  if (!protocolTracksRir) return false;
  return String(slotIntent ?? '').toUpperCase() !== 'ME';
}

import { resolvePlanPhase } from '../_shared/plan-phase.ts';
import {
  swimDrillDisplayName,
  swimDrillEquipmentFromTokens,
  swimGearLabelForDisplay,
  swimGearNormalized,
} from '../../../src/lib/plan-tokens/swim-drill-tokens.ts';
import { resolveCurrentFtp } from '../../../src/lib/resolve-current-ftp.ts';
import { resolveCurrentRunEasyPace, resolveCurrentRunThresholdPace, describeThresholdBasis } from '../../../src/lib/resolve-current-run-pace.ts';
import { pacesFromThresholdSecPerMi } from '../../../src/lib/run-paces-from-threshold.ts';
import { resolveCurrent5kPace } from '../../../src/lib/resolve-current-5k-pace.ts';
import { resolveCurrentLthr } from '../../../src/lib/resolve-current-lthr.ts';
import { frielZones } from '../_shared/endurance/hr-zones.ts';

// Type for plan adjustments
type PlanAdjustment = {
  id: string;
  exercise_name: string;
  adjustment_factor?: number;
  absolute_weight?: number;
  weight_offset?: number; // Offset maintains plan progression (e.g., -10 lb)
  substitute_exercise_name?: string | null; // Adapt-a-plan swap: slot renders as this exercise
  add_meta?: { sets?: number; reps?: string | number } | null; // Adapt-a-plan add: exercise_name is a NEW lift
  applies_from: string;
  applies_until?: string;
  status: string;
};

// Apply adjustment to a calculated weight
function applyAdjustment(
  exerciseName: string, 
  calculatedWeight: number | undefined, 
  adjustments: PlanAdjustment[], 
  workoutDate: string,
  isMetric = false
): { weight: number | undefined; adjusted: boolean; adjustmentId?: string } {
  if (calculatedWeight == null || !adjustments.length) {
    return { weight: calculatedWeight, adjusted: false };
  }
  
  const normalizedName = String(exerciseName ?? '').toLowerCase().trim();
  
  // Find matching active adjustment for this exercise and date
  const adjustment = adjustments.find(adj => {
    if (adj.status !== 'active') return false;
    const adjName = String(adj.exercise_name ?? '').toLowerCase().trim();
    if (adjName !== normalizedName && !normalizedName.includes(adjName) && !adjName.includes(normalizedName)) return false;
    if (adj.applies_from > workoutDate) return false;
    if (adj.applies_until && adj.applies_until < workoutDate) return false;
    return true;
  });
  
  if (!adjustment) {
    return { weight: calculatedWeight, adjusted: false };
  }
  
  // Apply adjustment - priority: weight_offset > absolute_weight > adjustment_factor
  let adjustedWeight: number;
  if (adjustment.weight_offset != null) {
    // Offset maintains plan progression: 25→27→30 with -10 offset = 15→17→20
    adjustedWeight = roundToIncrement(Math.max(0, calculatedWeight + adjustment.weight_offset), isMetric);
  } else if (adjustment.absolute_weight != null) {
    adjustedWeight = adjustment.absolute_weight;
  } else if (adjustment.adjustment_factor != null) {
    adjustedWeight = roundToIncrement(calculatedWeight * adjustment.adjustment_factor, isMetric);
  } else {
    return { weight: calculatedWeight, adjusted: false };
  }
  
  console.log(`🔧 Applied adjustment to ${exerciseName}: ${calculatedWeight} lb → ${adjustedWeight} lb`);
  return { weight: adjustedWeight, adjusted: true, adjustmentId: adjustment.id };
}

// Adapt-a-plan permanent swap: if an active swap targets this slot on this date, return the substitute
// exercise name (else null). Same name-matching + date-window rules as applyAdjustment, so a swap and a
// weight override read the slot identically. The caller re-resolves the substitute's weight from ITS
// own reference — no weight is carried across a swap.
function resolveSwap(
  exerciseName: string,
  adjustments: PlanAdjustment[],
  workoutDate: string,
): string | null {
  if (!adjustments.length) return null;
  const normalizedName = String(exerciseName ?? '').toLowerCase().trim();
  const swap = adjustments.find(adj => {
    if (adj.status !== 'active') return false;
    if (!adj.substitute_exercise_name) return false;
    const adjName = String(adj.exercise_name ?? '').toLowerCase().trim();
    if (adjName !== normalizedName && !normalizedName.includes(adjName) && !adjName.includes(normalizedName)) return false;
    if (adj.applies_from > workoutDate) return false;
    if (adj.applies_until && adj.applies_until < workoutDate) return false;
    return true;
  });
  return swap?.substitute_exercise_name ?? null;
}

function parseStrengthExercisesRaw(row: any): any[] {
  const raw = row?.strength_exercises;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return []; } }
  return [];
}

// Science-grounded weekly frequency for an ADDED accessory: 2×/week is the hypertrophy sweet spot
// (Schoenfeld/Ogborn/Krieger 2016 meta-analysis — 2× beats 1× at equated volume; 3× adds no reliable
// benefit). The plan still dictates WHICH days (matching focus); this caps HOW MANY per week.
const ADDED_EXERCISE_WEEKLY_CAP = 2;

// Adapt-a-plan add: decide, across the WHOLE plan, exactly which rows each added lift is injected into.
// A lift lands only on strength sessions whose focus matches its movement group (a hip-dominant add goes
// where lower work already is, never an upper-only day; a core/unclassified add fits any strength day),
// within the add's date window, skipping a session that already holds it — then capped to the weekly
// frequency above (earliest matching days per week). Returns row_id -> the lifts to inject there.
// Added-lift periodization — TWO CLOCKS (D-315 follow-up, grounded in SCIENCE-5x5-linear-progression):
//   (1) the lift's OWN age — it ramps block-linear from a conservative start the day you drop it in, so
//       it always starts light wherever inserted (a novel movement started submaximal);
//   (2) the PLAN's deload weeks (phase_by_week recovery/taper) — it backs off WITH the block, gentler
//       than a main-lift deload (it isn't the primary stressor, and RIR already loosens via Step 0).
const ADD_START_PCT = 70;      // conservative first-week %1RM
const ADD_PEAK_PCT = 85;       // block-linear ceiling
const ADD_STEP_PCT = 1.25;     // ~1-3%/wk linear increment
const ADD_DELOAD_MULT = 0.85;  // ~15% cut on the plan's deload weeks (accessory-appropriate)

type PlannedAdd = { name: string; sets: number; reps: string | number; weight?: number; percent_1rm?: number };

function planAddInjections(
  rows: any[],
  adjustments: PlanAdjustment[],
  baselines: Baselines,
  planConfig: any,
): Map<string, PlannedAdd[]> {
  const byRow = new Map<string, PlannedAdd[]>();
  const adds = (adjustments || []).filter(
    (a) => a.status === 'active' && a.add_meta && String(a.exercise_name ?? '').trim(),
  );
  if (!adds.length) return byRow;
  const inc = (baselines as any)?.isMetric ? 2.5 : 5;

  for (const adj of adds) {
    const name = String(adj.exercise_name).trim();
    const group = getMovementGroup(name);
    const sets = typeof adj.add_meta!.sets === 'number' ? adj.add_meta!.sets : 3;
    const reps = adj.add_meta!.reps ?? 10;
    const cfg = getExerciseConfig(name);
    const ref1RM = cfg ? getBaseline1RM(cfg, baselines) : null;
    const ratio = typeof cfg?.ratio === 'number' ? cfg.ratio : 0;

    const candidates: any[] = [];
    for (const row of rows) {
      if (String(row?.type ?? '').toLowerCase() !== 'strength') continue;
      /**
       * ⛔⛔ A MAX TEST TAKES NO ADDED WORK (2026-08-31, Michael on his own Test: Upper: *"the added
       * abs are weird"*). His ab wheel rollout was HIS OWN add — `plan_adjustments`, 22:35 UTC — and
       * this function put it on **every** matching strength day, the two test days included.
       *
       * ⛔ THE COMPOSER'S OWN EXCLUSION DOES NOT REACH HERE, AND THAT IS THE POINT. `fillMuscleFloor`
       * refuses a test day (`PlannedSession.isTest`), but an add is injected at MATERIALIZE time from
       * a different table and never passed through that rule — so the floor fix alone would have left
       * this landing anyway. Two doors onto a test day; this is the second one.
       *
       * ⛔ AND IT IS THE FIELD'S OWN CONVENTION, NOT A PREFERENCE. Volume comes DOWN into a max test
       * — peaking guidance is a 40-50% cut, run in a light week — and no source prescribes accessory
       * work AFTER a max. A test day carrying add-on volume is not standard anywhere.
       * ⚠️ IT WEAKENS NOTHING. The floor rule and its measured cost (week one losing glutes, calves
       * and triceps — Michael ruled on it directly) are untouched; this only stops a SECOND source of
       * volume reaching the same day.
       */
      const rowTags: string[] = Array.isArray((row as any)?.tags)
        ? (row as any).tags.map((t: any) => String(t).toLowerCase())
        : [];
      if (rowTags.includes('1rm_test')) continue;
      const date = String(row?.date ?? '');
      if (adj.applies_from > date) continue;
      if (adj.applies_until && adj.applies_until < date) continue;
      const exs = parseStrengthExercisesRaw(row);
      if (exs.some((e: any) => String(e?.name ?? '').toLowerCase().trim() === name.toLowerCase())) continue;
      if (group === 'lower' || group === 'upper') {
        const sessionGroups = new Set(exs.map((e: any) => getMovementGroup(String(e?.name ?? ''))).filter(Boolean));
        if (!sessionGroups.has(group)) continue;
      }
      candidates.push(row);
    }
    if (!candidates.length) continue;
    // Clock 1: the lift's own start = the earliest week it appears (ownWeek counts from here).
    const startWeek = Math.min(...candidates.map((r) => (typeof r?.week_number === 'number' ? r.week_number : 1)));

    // Cap per week: earliest matching days each week get the lift, up to the weekly frequency.
    const byWeek = new Map<number, any[]>();
    for (const row of candidates) {
      const wk = typeof row?.week_number === 'number' ? row.week_number : 0;
      if (!byWeek.has(wk)) byWeek.set(wk, []);
      byWeek.get(wk)!.push(row);
    }
    for (const weekRows of byWeek.values()) {
      weekRows.sort((a, b) => String(a?.date ?? '').localeCompare(String(b?.date ?? '')));
      for (const row of weekRows.slice(0, ADDED_EXERCISE_WEEKLY_CAP)) {
        const wk = typeof row?.week_number === 'number' ? row.week_number : startWeek;
        const ownWeek = wk - startWeek + 1;                                   // clock 1
        const phase = String(resolvePlanPhase(planConfig, wk) ?? '').toLowerCase();
        const isDeload = phase === 'recovery' || phase === 'taper';           // clock 2
        const rampPct = Math.min(ADD_PEAK_PCT, ADD_START_PCT + Math.max(0, ownWeek - 1) * ADD_STEP_PCT);
        const workingPct = isDeload ? rampPct * ADD_DELOAD_MULT : rampPct;
        const weight = ref1RM && ratio > 0
          ? Math.round((ref1RM * ratio * (workingPct / 100)) / inc) * inc
          : 0;                                                                // 0 → resolver flags baseline-missing → athlete enters
        const rid = String(row.id);
        if (!byRow.has(rid)) byRow.set(rid, []);
        byRow.get(rid)!.push({ name, sets, reps, weight, percent_1rm: Math.round(workingPct) });
      }
    }
  }
  return byRow;
}

/** Manual performance_numbers first, then exercise_log 1RM, then defaultLb (conservative anchor). */
function mergeAnchor1RmLb(
  perfVal: number | null | undefined,
  learned: { value?: number; confidence?: string } | null | undefined,
  defaultLb: number,
): number {
  if (Number.isFinite(perfVal as number) && (perfVal as number) > 0) {
    return Math.round(perfVal as number);
  }
  const v = learned?.value;
  if (Number.isFinite(v as number) && (v as number) > 0) {
    return Math.round(v as number);
  }
  return defaultLb;
}

type StrengthIntentMat = 'support' | 'performance' | null;

type SwimIntentMat = 'focus' | 'race' | null;

import { readAthleteSnapshotOrLive, resolveStrengthNumbers } from '../_shared/athlete-snapshot.ts';

/**
 * Clamp %1RM from goal strength_intent: performance ≥60%; support ≤60% (bench/squat lower).
 * `maxPct` is the upper ceiling (default 0.85 — the safety cap for programmed concurrent sets). The
 * strength-PRIMARY engine periodizes its own peak + 1RM retest (≥100%) and passes maxPct=1.05 so its
 * explicit % (97% singles, 100/102.5% test) render at face value instead of collapsing to 85%.
 */
function resolveStrengthPercentForLift(
  exerciseName: string,
  explicitPercent: number | undefined,
  strengthIntent: StrengthIntentMat,
  maxPct: number = 0.85,
): number {
  const n = String(exerciseName || '').toLowerCase();
  if (strengthIntent === 'performance') {
    const base = typeof explicitPercent === 'number' && explicitPercent > 0 ? explicitPercent : 0.7;
    return Math.max(0.6, Math.min(maxPct, base));
  }
  if (strengthIntent === 'support') {
    let p = typeof explicitPercent === 'number' && explicitPercent > 0
      ? Math.min(explicitPercent, 0.6)
      : 0.5;
    p = Math.min(0.6, p);
    if (n.includes('bench') || (n.includes('squat') && !n.includes('goblet'))) {
      p = Math.min(p, 0.45);
    }
    return p;
  }
  const base = typeof explicitPercent === 'number' && explicitPercent > 0 ? explicitPercent : 0.7;
  return Math.max(0.6, Math.min(maxPct, base));
}

function parseTrainingPrefs(tp: unknown): Record<string, unknown> | null {
  if (!tp) return null;
  if (typeof tp === 'string') {
    try {
      const o = JSON.parse(tp);
      return o && typeof o === 'object' && !Array.isArray(o) ? o as Record<string, unknown> : null;
    } catch {
      return null;
    }
  }
  if (typeof tp === 'object' && !Array.isArray(tp)) return tp as Record<string, unknown>;
  return null;
}

function strengthIntentFromPrefs(prefs: Record<string, unknown> | null): StrengthIntentMat {
  if (!prefs) return null;
  const raw = prefs.strength_intent ?? prefs.strengthIntent;
  if (raw === 'support' || raw === 'performance') return raw;
  return null;
}

async function loadStrengthIntentForPlan(
  trainingPlanId: string | null | undefined,
  supabase: ReturnType<typeof createClient>,
): Promise<StrengthIntentMat> {
  if (!trainingPlanId) return null;
  try {
    const { data: planRow } = await supabase
      .from('plans')
      .select('goal_id, user_id, config')
      .eq('id', trainingPlanId)
      .maybeSingle();
    const cfg = planRow?.config as Record<string, unknown> | null | undefined;
    const contract = cfg?.plan_contract_v1 as Record<string, unknown> | undefined;
    const fromContract = contract?.strength_intent ?? cfg?.strength_intent;
    if (fromContract === 'support' || fromContract === 'performance') return fromContract;

    const uid = planRow?.user_id as string | undefined;
    const gid = planRow?.goal_id as string | undefined;

    if (gid) {
      const { data: gRow } = await supabase.from('goals').select('training_prefs, sport, priority').eq('id', gid).maybeSingle();
      const si = strengthIntentFromPrefs(parseTrainingPrefs(gRow?.training_prefs));
      if (si) return si;
    }

    if (uid) {
      const { data: triGoals } = await supabase
        .from('goals')
        .select('id, training_prefs, sport, priority')
        .eq('user_id', uid)
        .eq('goal_type', 'event')
        .eq('status', 'active');
      const tri = (triGoals || []).filter((g) => ['triathlon', 'tri'].includes(String(g.sport ?? '').toLowerCase()));
      const a = tri.find((g) => g.priority === 'A') ?? tri[0];
      if (a) {
        const si = strengthIntentFromPrefs(parseTrainingPrefs(a.training_prefs));
        if (si) return si;
      }
    }
  } catch (e) {
    console.warn('[materialize-plan] loadStrengthIntentForPlan:', e);
  }
  return null;
}

function swimIntentFromPrefs(prefs: Record<string, unknown> | null): SwimIntentMat {
  if (!prefs) return null;
  const raw = prefs.swim_intent ?? prefs.swimIntent;
  if (raw === 'focus' || raw === 'race') return raw;
  return null;
}

async function loadSwimIntentForPlan(
  trainingPlanId: string | null | undefined,
  supabase: ReturnType<typeof createClient>,
): Promise<SwimIntentMat> {
  if (!trainingPlanId) return null;
  try {
    const { data: planRow } = await supabase
      .from('plans')
      .select('goal_id, user_id, config')
      .eq('id', trainingPlanId)
      .maybeSingle();
    const cfg = planRow?.config as Record<string, unknown> | null | undefined;
    const contract = cfg?.plan_contract_v1 as Record<string, unknown> | undefined;
    const fromContract = contract?.swim_intent ?? cfg?.swim_intent;
    if (fromContract === 'focus' || fromContract === 'race') return fromContract;

    const uid = planRow?.user_id as string | undefined;
    const gid = planRow?.goal_id as string | undefined;

    if (gid) {
      const { data: gRow } = await supabase
        .from('goals')
        .select('training_prefs, sport, priority')
        .eq('id', gid)
        .maybeSingle();
      const sw = swimIntentFromPrefs(parseTrainingPrefs(gRow?.training_prefs));
      if (sw) return sw;
    }

    if (uid) {
      const { data: triGoals } = await supabase
        .from('goals')
        .select('id, training_prefs, sport, priority')
        .eq('user_id', uid)
        .eq('goal_type', 'event')
        .eq('status', 'active');
      const tri = (triGoals || []).filter((g) =>
        ['triathlon', 'tri'].includes(String(g.sport ?? '').toLowerCase()),
      );
      const a = tri.find((g) => g.priority === 'A') ?? tri[0];
      if (a) {
        const sw = swimIntentFromPrefs(parseTrainingPrefs(a.training_prefs));
        if (sw) return sw;
      }
    }
  } catch (e) {
    console.warn('[materialize-plan] loadSwimIntentForPlan:', e);
  }
  return null;
}

/** True for lifts that use the steeper compound performance progression (+5 lb / 2-wk step, deload week 4n). */
function isPerformanceCompoundExercise(n: string): boolean {
  return (
    (n.includes('squat') && !n.includes('goblet') && !n.includes('jump')) ||
    n.includes('deadlift') ||
    n.includes('rdl') ||
    n.includes('bench') ||
    (n.includes('press') && !n.includes('leg')) ||
    n.includes('barbell row') ||
    n.includes('barbell rows') ||
    n.includes('hip thrust')
  );
}

/**
 * Accessories that resolve via getAccessoryRatio / isolation work — shallower curve than compounds.
 * Must not overlap isPerformanceCompoundExercise.
 */
function isPerformanceAccessoryProgressionExercise(n: string): boolean {
  if (isPerformanceCompoundExercise(n)) return false;
  if (
    n.includes('cable row') ||
    n.includes('cable_row') ||
    n.includes('seated cable')
  ) return true;
  if (n.includes('pulldown') || n.includes('pull-down') || n.includes('lat pull')) return true;
  if (n.includes('face pull') || n.includes('face_pull')) return true;
  if (n.includes('inverted row') || n.includes('inverted_row')) return true;
  if (n.includes('chest supported') || n.includes('chest_supported')) return true;
  if (/\bt[- ]?bar\b/.test(n)) return true;
  if (n.includes('reverse fly') || n.includes('rear delt')) return true;
  if (n.includes('lateral raise') || n.includes('front raise')) return true;
  if (n.includes('cable fly') || n.includes('cable_fly')) return true;
  if ((n.includes('dumbbell') || n.includes('db ')) && (n.includes('fly') || n.includes('flye'))) return true;
  if (n.includes('dumbbell row') || n.includes('dumbbell rows')) return true;
  if (/(^|\s)db\s+row|\b1[- ]?arm\s+dumbbell\s+row\b/.test(n)) return true;
  if (n.includes('dumbbell') && n.includes('row') && !n.includes('barbell')) return true;
  if (n.includes('tricep') && n.includes('extension')) return true;
  if (n.includes('leg press') || n.includes('leg_press')) return true;
  if (n.includes('leg extension') || n.includes('leg_extension')) return true;
  if (n.includes('leg curl') || n.includes('leg_curl')) return true;
  if (n.includes('calf raise')) return true;
  if (n.includes('goblet squat')) return true;
  if (n.includes('bulgarian')) return true;
  if (n.includes('step-up') || n.includes('step up')) return true;
  if (n.includes('lunge') && !n.includes('jump')) return true;
  if (n.includes('pallof')) return true;
  if (n.includes('wood chop')) return true;
  return false;
}

/** +2.5 lb per plan week from baseline prescription; same deload as compounds (week 4n → ×0.9). */
function adjustPerformanceAccessoryLoadLb(
  weightLb: number,
  weekNum: number | null | undefined,
): number {
  if (!Number.isFinite(weightLb) || weightLb <= 0) return weightLb;
  const w = Number(weekNum);
  let x = weightLb;
  if (Number.isFinite(w) && w >= 1 && w % 4 === 0) {
    x *= 0.9;
  } else if (Number.isFinite(w) && w >= 1) {
    x += (w - 1) * 2.5;
  }
  return Math.max(2.5, Math.round(x / 2.5) * 2.5);
}

/** Performance intent: compound progression (+5 lb / 2-wk); accessory progression (+2.5 lb / wk); week 4n deload for both. */
/**
 * Performance-intent accessory progression dispatch. The compound branch was removed —
 * see commit notes + `docs/POLISH-PUNCH-LIST.md` for the architectural reasoning. tl;dr:
 *
 *   The legacy compound branch added a plan-week-driven offset (`+5 lb per 2 weeks` + a
 *   `× 0.9` deload on week 4n) on top of the dispatcher's phase-aware %1RM emit AND on
 *   top of `scaleSessionToRebuildLoads`'s pre-resolved rebuild weights. That double-stack
 *   produced description↔delivered drift across every strength session (Week 15 rebuild
 *   delivered 145 lb when the snapshot-computed description said 110 lb, etc.). The fix
 *   is single-source-of-truth: the dispatcher owns progression via phase-aware %1RM and
 *   the rebuild ramp factor. Within-phase progression (e.g., base 65% → 67% → 70%) is a
 *   coaching-protocol question tracked in the punch list; when designed, it belongs in
 *   the dispatcher emit so the description text still matches what's delivered.
 *
 * The accessory branch is preserved — it was added as a deliberate feature in commit
 * `832a8449` with a different cadence (+2.5 lb / week, not week-modulo-4 deload) for
 * isolation lifts that aren't 1RM-anchored. Description text on accessory exercises is
 * qualitative ("Light cable", "Band"), so the description↔delivered contract isn't
 * impacted by the +2.5 lb adjustment.
 */
export function adjustPerformanceWorkingLoadLb(
  weightLb: number | undefined,
  exerciseName: string,
  strengthIntent: StrengthIntentMat,
  weekNum: number | null | undefined,
): number | undefined {
  if (weightLb == null || !Number.isFinite(weightLb) || strengthIntent !== 'performance') return weightLb;
  const n = String(exerciseName || '').toLowerCase();
  if (isPerformanceAccessoryProgressionExercise(n)) {
    return adjustPerformanceAccessoryLoadLb(weightLb, weekNum);
  }
  return weightLb;
}

/**
 * SWIM-PROTOCOL §0.5 effort-tier mapping (2026-05-22 swim arc, LOCKED).
 *
 * Maps each swim token kind — combined with the parent session's tags — to the
 * athlete-facing effort tier (easy / moderate / hard). Used by both the Garmin
 * export (`send-workout-to-garmin`) and the Form Goggles narrator
 * (`src/utils/formGogglesSwimScript.ts`) so per-step labels show the intensity
 * tier athletes actually feel, not internal session-type tags ("css", "threshold").
 *
 * Step-kind rules (always win, independent of session tags):
 *  - Warmup / Cooldown → easy
 *  - Drill steps → easy (drill IS the work, not the intensity)
 *
 * Work-step rules (token + session tags):
 *  - Threshold token (`swim_threshold_*`) → hard
 *  - CSS Aerobic token (`swim_aerobic_css_*`) → moderate
 *  - Plain aerobic / pull / kick token → derived from session tags per the
 *    §0.5 mapping table:
 *      - css_aerobic / endurance / pull_focused / kick_focused / technique → moderate
 *      - threshold / speed / race_specific / time_trial / race_pace → hard
 *      - recovery / easy → easy
 *
 * Unknown / unrecognized tokens fall back to 'easy' — defensive default (a step
 * labeled 'easy' when the intent was harder is safer than vice versa).
 */
export function swimTokenIntensity(
  token: string,
  sessionTags?: string[],
): 'easy' | 'moderate' | 'hard' {
  const s = String(token || '').toLowerCase();
  // Step-kind rules — always win
  if (s.startsWith('swim_warmup_') || s.startsWith('swim_cooldown_')) return 'easy';
  if (s.startsWith('swim_drills_') || s.startsWith('swim_drill_')) return 'easy';

  // Token-keyed work-step rules (deterministic regardless of session)
  if (s.startsWith('swim_threshold_')) return 'hard';
  if (s.startsWith('swim_aerobic_css_')) return 'moderate';

  // Session-tag-driven work-step rules — for plain aerobic / pull / kick tokens
  // whose intensity depends on the surrounding session context.
  const tags = (sessionTags ?? []).map((t) => String(t).toLowerCase());
  const hasTag = (t: string) => tags.includes(t);
  // Hard tier: §5.3 / §5.4 / §5.8 / §5.10 / §7.1
  if (
    hasTag('threshold') ||
    hasTag('speed_swim') ||
    hasTag('race_specific_swim') ||
    hasTag('time_trial') ||
    hasTag('race_pace_sustained')
  ) {
    if (s.startsWith('swim_pull_') || s.startsWith('swim_kick_') || s.startsWith('swim_aerobic_')) {
      return 'hard';
    }
  }
  // Moderate tier: §5.2 / §5.4 (substitution path) / §5.5 / §5.6 / §5.1 main set / endurance
  if (
    hasTag('css_aerobic') ||
    hasTag('endurance_swim') ||
    hasTag('pull_focused') ||
    hasTag('kick_focused') ||
    hasTag('technique_swim')
  ) {
    if (s.startsWith('swim_pull_') || s.startsWith('swim_kick_') || s.startsWith('swim_aerobic_')) {
      return 'moderate';
    }
  }
  // Easy tier: §5.11 / plain Easy Swim
  if (hasTag('recovery_swim')) {
    if (s.startsWith('swim_pull_') || s.startsWith('swim_kick_') || s.startsWith('swim_aerobic_')) {
      return 'easy';
    }
  }

  // Token-only fallback (no session context, or unrecognized tags):
  //  - swim_pull_* → moderate (Z3-anchored per §5.5)
  //  - swim_kick_* → easy (Z1-Z2 per §5.6 main; session-tag path overrides for Kick-Focused)
  //  - swim_aerobic_* → easy (Z2 aerobic-recovery shape between hard sets)
  if (s.startsWith('swim_pull_')) return 'moderate';
  if (s.startsWith('swim_kick_')) return 'easy';
  if (s.startsWith('swim_aerobic_')) return 'easy';
  return 'easy';
}

type Baselines = { 
  ftp?: number; 
  fiveK_pace?: any; fiveKPace?: any; fiveK?: any; 
  easyPace?: any; easy_pace?: any; 
  marathonPace?: any; marathon_pace?: any;
  equipment?: any;
};


/**
 * ⛔ THE PRESCRIPTION ON A RUN STEP (Michael, 2026-09-02, rulings 1 and 2).
 *   · EASY steps carry a HEART-RATE range (`hr_range`, bpm) and `prescription: 'heart_rate'`. The pace
 *     on them is a reference band, not the target.
 *   · HARD steps carry an EFFORT target (`target_rpe`, session RPE): threshold work 5–6, intervals
 *     8–10 — his numbers. The pace on them is the target; the effort is the gauge he trusts more.
 * ⚠️ OURS: which token shapes count as easy / threshold / interval. Labelled below. Strides carry
 * neither — they are neuromuscular, not an effort band.
 * ⚠️ On a long-run token only the steps priced at the easy band (or unpriced) get the heart-rate
 * range; a race-pace finish keeps its pace.
 */
export function stampRunPrescription(tok: string, steps: any[], baselines: Baselines): any[] {
  const t = String(tok ?? '').toLowerCase();
  const hr = (baselines as any)?._easyHrRange as { lower: number; upper: number } | undefined;
  const easyBand = (baselines as any)?._resolvedEasySecPerMi as number | undefined;
  const isEasyToken = /^(warmup_run_|cooldown_run_|run_easy_|longrun_)/.test(t);
  const isThresholdToken = /^(cruise_|tempo_\d+(?:min|mi)_threshold)/.test(t);
  const isIntervalToken = /^(interval_|run_vo2_|round_|tempo_\d+(?:min|mi)_5kpace)/.test(t);
  for (const s of steps) {
    if (!s || typeof s !== 'object') continue;
    const kind = String(s.kind ?? '');
    const atEasyPace = s.pace_sec_per_mi == null || (easyBand != null && s.pace_sec_per_mi === easyBand);
    const easyStep = kind === 'warmup' || kind === 'cooldown' || kind === 'recovery' || (isEasyToken && kind === 'work' && atEasyPace);
    if (easyStep) {
      s.prescription = 'heart_rate';
      if (hr) s.hr_range = { lower: hr.lower, upper: hr.upper };
      continue;
    }
    if (kind === 'work' && isThresholdToken) s.target_rpe = { lo: 5, hi: 6 };
    else if (kind === 'work' && isIntervalToken) s.target_rpe = { lo: 8, hi: 10 };
  }
  return steps;
}

/**
 * The goal's ENTERED finish time ÷ its race distance, in sec/mi. Only the four road distances have a
 * distance to divide by; anything else (a tri, a custom event) returns null rather than a guess.
 */
export function goalRacePaceFromTargetTime(targetTimeSec: unknown, distance: unknown): number | null {
  const t = Number(targetTimeSec);
  if (!Number.isFinite(t) || t <= 0) return null;
  const d = String(distance ?? '').toLowerCase().replace(/[\s_-]+/g, ' ').trim();
  let miles: number | null = null;
  if (/\bhalf\b/.test(d) && /marathon|half$/.test(d) && !/iron/.test(d)) miles = 13.1094;
  else if (/marathon/.test(d) && !/iron/.test(d)) miles = 26.2188;
  else if (/\b10 ?k\b/.test(d)) miles = 6.2137;
  else if (/\b5 ?k\b/.test(d)) miles = 3.1069;
  if (miles == null) return null;
  const pace = Math.round(t / miles);
  return pace >= 180 && pace <= 1200 ? pace : null;   // 3:00–20:00/mi, the same sanity band the 5K resolver uses
}

function secPerMiFromBaseline(b: Baselines, which: 'fivek'|'easy'|'marathon'|'threshold'): number | null {
  // §1 PREFER snapshot-pinned run paces (set by readAthleteSnapshotOrLive at the baselines-
  // load block above). Highest priority so plans with a snapshot see frozen paces for the
  // plan's lifetime even if learned_fitness updates mid-plan. Marathon doesn't have a
  // snapshot field today; falls through to the existing chain below.
  const snapPaces = (b as any)._snapshotRunPaces as
    | { threshold_pace_sec_per_mi?: number | null; easy_pace_sec_per_mi?: number | null; fiveK_pace_sec_per_mi?: number | null }
    | undefined;
  if (snapPaces) {
    if (which === 'easy' && snapPaces.easy_pace_sec_per_mi != null) {
      console.log(`[Paces] Using snapshot easy: ${snapPaces.easy_pace_sec_per_mi}s/mi`);
      return snapPaces.easy_pace_sec_per_mi;
    }
    if (which === 'threshold' && snapPaces.threshold_pace_sec_per_mi != null) {
      console.log(`[Paces] Using snapshot threshold: ${snapPaces.threshold_pace_sec_per_mi}s/mi`);
      return snapPaces.threshold_pace_sec_per_mi;
    }
    if (which === 'fivek' && snapPaces.fiveK_pace_sec_per_mi != null) {
      console.log(`[Paces] Using snapshot 5K: ${snapPaces.fiveK_pace_sec_per_mi}s/mi`);
      return snapPaces.fiveK_pace_sec_per_mi;
    }
  }
  // §1b D-287 — the ONE resolved easy pace (choice -> learned -> manual -> effort_paces). Sits BELOW the
  // snapshot pin (a plan freezes its pace for its lifetime) and ABOVE the ad-hoc chain below, so an UNPINNED
  // plan agrees with the workout card, State, the coach and Baselines about what "easy" is.
  if (which === 'easy') {
    const resolvedEasy = (b as any)._resolvedEasySecPerMi;
    if (typeof resolvedEasy === 'number' && Number.isFinite(resolvedEasy) && resolvedEasy > 0) {
      console.log(`[Paces] Using RESOLVED easy: ${resolvedEasy}s/mi`);
      return resolvedEasy;
    }
  }

  // §1b-threshold (2026-08-19) — the SAME resolver, for the sibling fact. See the assignment site for
  // why this was missing: the two branches below never read `learned_fitness`, so a measured threshold
  // pace could not compete with the typed 5K here — it was not in the running. The value arriving here
  // is already held to the band the athlete's measured easy pace implies, so a stale 5K cannot come
  // through it too fast.
  if (which === 'threshold') {
    const resolvedThr = (b as any)._resolvedThresholdSecPerMi;
    if (typeof resolvedThr === 'number' && Number.isFinite(resolvedThr) && resolvedThr > 0) {
      console.log(`[Paces] Using RESOLVED threshold: ${resolvedThr}s/mi (basis=${(b as any)._thresholdBasis ?? 'unknown'})`);
      return resolvedThr;
    }
  }

  // §1c — THE RULING (2026-09-02, final): threshold is learned or entered, nothing else; 'easy' is
  // threshold × 1.19, a reference band under a heart-rate prescription; 'fivek' is the typed 5K by
  // division; 'marathon' is the goal's entered time ÷ distance. Nothing is derived from the 5K, from
  // the easy runs, or from the vDOT table.
  //
  // ⛔ THE TABLE IS GONE FROM HERE. `effort_paces.base` / `.race`, the raw `easyPace` / `marathonPace`
  // parses, the `easy − 30` marathon guess and the `5K + 20` threshold branch all lived below this
  // line as second authorities on facts the resolvers own. Every one prescribed a different number
  // from the surface next to it. No number is invented here: no threshold → null (D-285).
  // ⛔ 5K PACE IS THE TYPED 5K BY DIVISION, NOT THRESHOLD MATH (Michael, 2026-09-02, final). Resolved
  // once at the baselines-load block (`_fiveKSecPerMi`, from `resolveCurrent5kPace`: a typed pace, or
  // the race clock ÷ 3.107). No 5K on file → no target on 5K-pace work (D-285).
  if (which === 'fivek') {
    const fk = (b as any)._fiveKSecPerMi;
    if (typeof fk === 'number' && Number.isFinite(fk) && fk > 0) {
      console.log(`[Paces] Using 5K pace: ${fk}s/mi (typed / race clock)`);
      return fk;
    }
    console.log('[Paces] No 5K on file — 5K-pace work ships without a pace target (D-285)');
    return null;
  }
  // ⛔ RACE PACE = the plan's ENTERED goal time ÷ distance (`_racePaceSecPerMi`, set at the
  // baselines-load block from the linked goal). Entered, not derived. No goal time → no target.
  if (which === 'marathon') {
    const rp = (b as any)._racePaceSecPerMi;
    if (typeof rp === 'number' && Number.isFinite(rp) && rp > 0) {
      console.log(`[Paces] Using race pace from the goal time: ${rp}s/mi`);
      return rp;
    }
    console.log('[Paces] No goal time on the plan — race-pace work ships without a pace target (D-285)');
    return null;
  }
  const resolvedThr = (b as any)._resolvedThresholdSecPerMi;
  const derived = pacesFromThresholdSecPerMi(
    typeof resolvedThr === 'number' && Number.isFinite(resolvedThr) && resolvedThr > 0 ? resolvedThr : null,
  );
  if (!derived) {
    console.log(`[Paces] No threshold pace on file — '${which}' ships without a pace target (D-285)`);
    return null;
  }
  if (which === 'easy') {
    // Reached only when the easy resolver abstained; the resolver's own derived-from-threshold tier
    // normally answers first with this exact number.
    console.log(`[Paces] Using easy pace from threshold: ${derived.easy}s/mi`);
    return derived.easy;
  }
  return null;
}

// Strength helpers: map exercise name to baseline key and compute prescribed weight
function firstPositive1RM(...vals: unknown[]): number | null {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function oneRmFromBaselines(b: any, exerciseName: string): number | null {
  try {
    const n = String(exerciseName || '').toLowerCase();
    if (n.includes('bench')) return firstPositive1RM(b?.bench, b?.bench_press, b?.benchPress);
    if (n.includes('deadlift')) return firstPositive1RM(b?.deadlift, b?.dead_lift);
    if (n.includes('squat')) return firstPositive1RM(b?.squat, b?.squat1RM, b?.squat_1rm);
    if (n.includes('overhead') || n.includes('ohp') || (n.includes('press') && !n.includes('bench'))) {
      return firstPositive1RM(b?.overheadPress1RM, b?.ohp, b?.overhead_press, b?.overhead);
    }
    // Unknown or bodyweight: no 1RM baseline
    return null;
  } catch { return null; }
}

// Calculate weight using research-based exercise config
function calculateWeightFromConfig(
  exerciseName: string,
  targetPercent: number,
  baselines: any,
  reps?: number,
  applyRepScale: boolean = true,
): { weight: number | null; displayFormat: string; notes?: string } {
  const config = getExerciseConfig(exerciseName);
  
  if (!config) {
    // Fallback to legacy calculation for unknown exercises
    return { weight: null, displayFormat: 'total' };
  }
  
  if (config.displayFormat === 'bodyweight' || config.displayFormat === 'band') {
    return { weight: 0, displayFormat: config.displayFormat, notes: config.notes };
  }
  
  const base1RM = getBaseline1RM(config, baselines);
  if (!base1RM) {
    return { weight: null, displayFormat: config.displayFormat, notes: config.notes };
  }
  
  // Calculate inferred 1RM for this exercise
  const inferred1RM = base1RM * config.ratio;
  
  // Apply target percentage and rep adjustment. Strength-primary passes applyRepScale=false: its
  // explicit % ALREADY encodes intensity (the composer periodized it), so the rep-scale would
  // double-count — the % renders straight off the entered 1RM (100% = the real max, not 106%).
  const repScale = applyRepScale ? repScaleFor(reps) : 1;
  let prescribedWeight = inferred1RM * targetPercent * repScale;
  
  // For perHand exercises: divide BEFORE rounding (so we round to real dumbbell weights)
  if (config.displayFormat === 'perHand' && config.ratioIsTotal) {
    prescribedWeight = prescribedWeight / 2;
  }
  
  // Round to nearest 5 lbs (matches real gym equipment)
  prescribedWeight = Math.max(5, Math.round(prescribedWeight / 5) * 5);
  
  return { 
    weight: prescribedWeight, 
    displayFormat: config.displayFormat,
    notes: config.notes
  };
}
// Round to the nearest equipment increment:
// - imperial: 5 lb plates → round to nearest 5
// - metric: 2.5 kg plates → round to nearest 2.5
function roundToIncrement(n: number, isMetric = false): number {
  const increment = isMetric ? 2.5 : 5;
  const min = isMetric ? 2.5 : 5;
  return Math.max(min, Math.round(n / increment) * increment);
}
// Backwards-compat alias (default imperial)
function round5(n: number): number { return roundToIncrement(n, false); }
function pctWeight(oneRm: number | null, pct?: number, isMetric = false): number | undefined {
  if (oneRm == null) return undefined;
  if (!(typeof pct === 'number' && isFinite(pct) && pct > 0)) return undefined;
  return roundToIncrement(oneRm * pct, isMetric);
}

// Smart exercise type detection (matches client-side logic)
function isDumbbellExercise(exerciseName: string): boolean {
  const name = String(exerciseName ?? '').toLowerCase();
  
  // Explicit dumbbell naming
  if (name.includes('dumbbell') || name.includes('db ')) return true;
  
  // Common dumbbell exercise patterns
  const dbPatterns = [
    'bicep curl', 'biceps curl', 'hammer curl', 'concentration curl',
    'lateral raise', 'front raise', 'chest fly', 'chest flye',
    'arnold press', 'goblet squat', 'bulgarian split squat',
    'farmer walk', 'farmer walks'
  ];
  
  return dbPatterns.some(p => name.includes(p));
}

function parseWeightInput(input: any, oneRm: number | null): { weight?: number; percent_1rm?: number } {
  try {
    if (typeof input === 'number' && isFinite(input) && input >= 0) return { weight: Math.round(input) };
    const s = String(input || '').trim().toLowerCase();
    if (!s) return {};
    if (/(^|\b)(bw|body\s*weight|bodyweight)(\b|$)/.test(s)) return { weight: 0 };
    if (/amrap/.test(s)) return {}; // reps-only hint, not a weight
    // Match "70% 1RM" or "70%" or "0.7" style
    let m = s.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
    if (m) {
      const pct = parseFloat(m[1]) / 100;
      const w = pctWeight(oneRm, pct);
      return { weight: w, percent_1rm: pct };
    }
    m = s.match(/([0-9]+(?:\.[0-9]+)?)\s*1\s*rm/);
    if (m) {
      const pct = parseFloat(m[1]) / 100;
      const w = pctWeight(oneRm, pct);
      return { weight: w, percent_1rm: pct };
    }
    // Plain number inside string
    m = s.match(/([0-9]+(?:\.[0-9]+)?)/);
    if (m) {
      const n = Math.round(parseFloat(m[1]));
      if (isFinite(n)) return { weight: n };
    }
  } catch {}
  return {};
}

// Accessory mapping → primary 1RM with ratio
function getAccessoryRatio(movement: string): number {
  const m = String(movement || '').toLowerCase();
  // Primary lifts default to 1.0
  if (/bench|squat|deadlift|dead_lift|ohp|overhead/.test(m)) return 1.0;
  // Upper body pull (bench reference)
  if (m.includes('barbell_row') || m.includes('bent_over_row') || m.includes('pendlay_row') || m.includes('barbell row') || m.includes('bent over row') || m.includes('pendlay')) return 0.90;
  if (m.includes('t_bar_row') || /\bt[-_ ]?bar[-_ ]?row\b/.test(m)) return 0.80;
  if (m.includes('chest_supported_row') || m.includes('chest supported row')) return 0.85;
  if (m.includes('cable_row') || m.includes('cable row')) return 0.70;
  if (m.includes('lat_pulldown') || m.includes('pulldown') || m.includes('lat pulldown')) return 0.65;
  if (m.includes('inverted_row') || m.includes('inverted row')) return 0.65;
  if (m.includes('face_pull') || m.includes('face pull')) return 0.35;
  if (m.includes('reverse_fly') || m.includes('reverse_flye') || m.includes('reverse fly')) return 0.30;
  if (m.includes('chinup') || m.includes('chin_up') || m.includes('pullup') || m.includes('pull_up') || m.includes('chin-up') || m.includes('pull-up')) return 0.65;
  // Upper body push (bench reference)
  if (m.includes('dip')) return 0.90;
  if (m.includes('incline_bench') || m.includes('incline bench')) return 0.85;
  if (m.includes('close_grip_bench') || m.includes('close grip bench')) return 0.90;
  if (m.includes('db_bench_press') || m.includes('dumbbell_bench')) return 0.75;
  if (m.includes('db_incline_press') || m.includes('dumbbell_incline')) return 0.70;
  if (m.includes('db_fly') || m.includes('db_flye') || m.includes('dumbbell_fly')) return 0.45;
  if (m.includes('cable_fly') || m.includes('cable_flye')) return 0.40;
  if (m.includes('diamond_pushup') || m.includes('close_grip_pushup')) return 0.0;
  if (m.includes('pike_pushup')) return 0.0;
  if (m.includes('pushup') || m.includes('push_up')) return 0.0;
  // Shoulders (overhead reference)
  if (m.includes('lateral_raise')) return 0.35;
  if (m.includes('front_raise')) return 0.40;
  if (m.includes('rear_delt_fly') || m.includes('rear_delt_flye')) return 0.30;
  if (m.includes('db_shoulder_press') || m.includes('dumbbell_shoulder')) return 0.65;
  if (m.includes('overhead_tricep_extension') || m.includes('tricep_extension')) return 0.40;
  if (m.includes('push_press')) return 1.10;
  // Hip dominant (deadlift reference)
  if (m.includes('hip_thrust') || m.includes('hip thrust')) return 0.80;
  if (m.includes('romanian_deadlift') || m.includes('rdl')) return 0.70;
  if (m.includes('good_morning') || m.includes('good morning')) return 0.45;
  if (m.includes('single_leg_rdl') || m.includes('single leg rdl')) return 0.25;
  if (m.includes('glute_bridge') || m.includes('glute bridge')) return 0.60;
  if (m.includes('leg_curl') || m.includes('leg curl')) return 0.60;
  if (m.includes('sumo_deadlift') || m.includes('sumo')) return 0.95;
  if (m.includes('nordic_curl')) return 0.0;
  // Knee dominant (squat reference)
  if (m.includes('bulgarian_split_squat')) return 0.30;
  if (m.includes('walking_lunge') || m.includes('lunge')) return 0.35;
  if (m.includes('reverse_lunge')) return 0.35;
  if (m.includes('lateral_lunge')) return 0.30;
  if (m.includes('goblet_squat')) return 0.40;
  if (m.includes('step_up') || m.includes('step up')) return 0.25;
  if (m.includes('leg_press')) return 1.20;
  if (m.includes('leg_extension')) return 0.55;
  if (m.includes('front_squat')) return 0.85;
  if (m.includes('overhead_squat')) return 0.60;
  if (m.includes('jump_squat') || m.includes('box_jump')) return 0.0;
  if (m.includes('wall_sit')) return 0.0;
  if (m.includes('pistol_squat') || m.includes('pistol')) return 0.0;
  // Core & BW
  if (m.includes('plank') || m.includes('side_plank')) return 0.0;
  if (m.includes('ab_rollout') || m.includes('rollout')) return 0.0;
  if (m.includes('hanging_leg_raise')) return 0.0;
  if (m.includes('russian_twist')) return 0.0;
  if (m.includes('dead_bug')) return 0.0;
  if (m.includes('bird_dog')) return 0.0;
  if (m.includes('pallof_press')) return 0.0;
  if (m.includes('burpee')) return 0.0;
  if (m.includes('mountain_climber')) return 0.0;
  return 1.0;
}

function pickPrimary1RMAndBase(name: string, baselines: any): { base: number | null; ref: 'bench'|'squat'|'deadlift'|'overhead'|null; ratio: number; unilateral: boolean } {
  const n = String(name || '').toLowerCase();
  const bench = firstPositive1RM(baselines?.bench, baselines?.bench_press, baselines?.benchPress);
  const squat = firstPositive1RM(baselines?.squat, baselines?.squat1RM, baselines?.squat_1rm);
  const deadlift = firstPositive1RM(baselines?.deadlift, baselines?.dead_lift);
  const overhead = firstPositive1RM(
    baselines?.overheadPress1RM,
    baselines?.ohp,
    baselines?.overhead_press,
    baselines?.overhead,
  );
  const unilateral = /(single|bulgarian|split|one arm|one leg|unilateral|pistol)/i.test(n);

  // Get accessory ratio for all exercises
  const ratio = getAccessoryRatio(n);
  
  // Direct primary lifts
  if (n.includes('bench')) return { base: bench, ref: 'bench', ratio: 1.0, unilateral };
  if (n.includes('squat') && !n.includes('goblet')) return { base: squat, ref: 'squat', ratio: 1.0, unilateral };
  if (n.includes('deadlift') || n.includes('dead_lift')) return { base: deadlift, ref: 'deadlift', ratio: 1.0, unilateral };
  if (n.includes('overhead') || n.includes('ohp')) return { base: overhead, ref: 'overhead', ratio: 1.0, unilateral };
  if (n.includes('push press')) return { base: overhead, ref: 'overhead', ratio, unilateral };

  // Accessory aliases
  
  // Upper body pull (bench reference)
  if (n.includes('row')) return { base: bench, ref: 'bench', ratio, unilateral };
  if (n.includes('pulldown') || n.includes('pull down')) return { base: bench, ref: 'bench', ratio, unilateral };
  if (n.includes('pullup') || n.includes('pull up') || n.includes('pull-up')) return { base: bench, ref: 'bench', ratio, unilateral };
  if (n.includes('chinup') || n.includes('chin up') || n.includes('chin-up')) return { base: bench, ref: 'bench', ratio, unilateral };
  if (n.includes('face pull')) return { base: bench, ref: 'bench', ratio, unilateral };
  if (n.includes('reverse fly') || n.includes('reverse flye')) return { base: bench, ref: 'bench', ratio, unilateral };
  
  // Upper body push (bench reference)
  if (n.includes('dip')) return { base: bench, ref: 'bench', ratio, unilateral };
  if (n.includes('incline')) return { base: bench, ref: 'bench', ratio, unilateral };
  if (n.includes('fly') || n.includes('flye')) return { base: bench, ref: 'bench', ratio, unilateral };
  if (n.includes('dumbbell') && (n.includes('press') || n.includes('bench'))) return { base: bench, ref: 'bench', ratio, unilateral };
  
  // Shoulders (overhead reference)
  if (n.includes('lateral raise')) return { base: overhead, ref: 'overhead', ratio, unilateral };
  if (n.includes('front raise')) return { base: overhead, ref: 'overhead', ratio, unilateral };
  if (n.includes('rear delt')) return { base: overhead, ref: 'overhead', ratio, unilateral };
  if (n.includes('shoulder')) return { base: overhead, ref: 'overhead', ratio, unilateral };
  if (n.includes('tricep')) return { base: overhead, ref: 'overhead', ratio, unilateral };
  
  // Hip dominant (deadlift reference)
  if (n.includes('hip thrust')) return { base: deadlift, ref: 'deadlift', ratio, unilateral };
  if (n.includes('rdl') || n.includes('romanian')) return { base: deadlift, ref: 'deadlift', ratio, unilateral };
  if (n.includes('sumo')) return { base: deadlift, ref: 'deadlift', ratio, unilateral };
  if (n.includes('good morning')) return { base: deadlift, ref: 'deadlift', ratio, unilateral };
  if (n.includes('leg curl')) return { base: deadlift, ref: 'deadlift', ratio, unilateral };
  if (n.includes('glute bridge')) return { base: deadlift, ref: 'deadlift', ratio, unilateral };
  
  // Knee dominant (squat reference)
  if (n.includes('lunge') || n.includes('split squat') || n.includes('goblet') || n.includes('step up')) return { base: squat, ref: 'squat', ratio, unilateral };
  if (n.includes('leg press')) return { base: squat, ref: 'squat', ratio, unilateral };
  if (n.includes('leg extension')) return { base: squat, ref: 'squat', ratio, unilateral };

  // Unknown
  return { base: null, ref: null, ratio: 1.0, unilateral };
}

function repScaleFor(reps?: number | string): number {
  if (typeof reps === 'string' && /amrap/i.test(reps)) return 1.00;
  const r = Number(reps);
  if (!Number.isFinite(r)) return 1.0;
  if (r <= 6) return 1.05;
  if (r <= 9) return 1.00;
  if (r <= 12) return 0.95;
  if (r <= 15) return 0.90;
  return 0.85;
}

// Extract percentage from weight string (e.g., "30% 1RM" -> 0.30)
function extractPercentageFromWeight(weight: any): number | undefined {
  try {
    const s = String(weight || '').trim().toLowerCase();
    if (!s) return undefined;
    // Match "70% 1RM" or "70%" or "0.7 1rm"
    let m = s.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
    if (m) return parseFloat(m[1]) / 100;
    m = s.match(/([0-9]+(?:\.[0-9]+)?)\s*1\s*rm/);
    if (m) return parseFloat(m[1]) / 100;
  } catch {}
  return undefined;
}

// Some strength prescriptions are qualitative (e.g., "Light") rather than %1RM.
// In those cases we should display the text and NOT mark baselines as missing.
function isQualitativeStrengthWeight(weight: any): boolean {
  try {
    const s = String(weight || '').trim().toLowerCase();
    if (!s) return false;
    // If it has numbers or % it's not qualitative.
    if (/\d/.test(s) || s.includes('%')) return false;
    // Common coaching-style prescriptions we want to preserve.
    if (s === 'light' || s === 'moderate' || s === 'heavy' || s === 'standard') return true;
    if (s.includes('add weight')) return true; // "Add weight if able"
    if (s.includes('activation')) return true;
    if (s.includes('mobility')) return true;
    if (s.includes('technique')) return true;
    if (s.includes('light cable')) return true;
    if (s.includes('bodyweight')) return true;
    if (s.includes('band')) return true;
  } catch {}
  return false;
}

function qualitativeWeightDisplay(weight: any): string | undefined {
  try {
    const raw = String(weight || '').trim();
    if (!raw) return undefined;
    if (/bodyweight/i.test(raw)) return 'Bodyweight';
    if (/band/i.test(raw)) return 'Band';
    return raw;
  } catch {
    return undefined;
  }
}

/**
 * D-071: when materialize-plan can't resolve a "% 1RM" prescription to a
 * numeric weight (athlete hasn't entered a relevant 1RM baseline), don't leave
 * the raw "65% 1RM (DB ≈ 70% barbell load)" string for the client to render —
 * it's engine-internal grammar, not athlete-facing language. Return an
 * RIR-anchored coaching cue based on the rep count.
 *
 * Returns undefined when the input doesn't look like a "% 1RM" string — the
 * caller should fall through to whatever other display logic exists. Exported
 * for pin tests in index.test.ts (D-071 regression sentinel).
 */
export function fallbackUnresolvedPercentDisplay(weight: any, reps: any): string | undefined {
  if (weight == null) return undefined;
  const s = String(weight);
  if (!/%\s*1rm/i.test(s)) return undefined;
  let repText: string | null = null;
  if (typeof reps === 'number' && reps > 0) repText = String(reps);
  else {
    const m = String(reps ?? '').match(/(\d+)/);
    if (m) repText = m[1]!;
  }
  if (!repText) return 'Moderate weight — leave 2 reps in reserve';
  return `Pick a weight you can do for ${repText} reps with 2 in reserve`;
}

/**
 * THE PER-SET PRESCRIPTION, carried through to the phone.
 *
 * the previous program is three sets at three weights (SPEC-get-stronger §1). The authored row states them in
 * `set_plan`; `weight`/`reps` carry the TOP set so every pre-existing consumer is unchanged. Without
 * this pass-through the logger prefills the top weight onto all three sets — a number the athlete was
 * not asked to lift, twice a session, four days a week, for twelve weeks.
 *
 * If anything downstream moved the top-set weight (an athlete adjustment, an equipment substitution),
 * the ramp is rescaled by the SAME factor and re-rounded, so the three sets stay in proportion instead
 * of the ramp silently pointing at a load the top set no longer uses. Round DOWN, as everywhere else.
 *
 * Returns undefined for any row without an authored `set_plan` — which is every row that is not a
 * the previous program main lift, so nothing else changes shape.
 */
export function carrySetPlan(ex: any, finalWeight: number | null | undefined): any[] | undefined {
  const authored = Array.isArray(ex?.set_plan) ? ex.set_plan : null;
  if (!authored || authored.length === 0) return undefined;
  const authoredTop = Number(authored[authored.length - 1]?.weight);
  const top = Number(finalWeight);
  const scale = Number.isFinite(authoredTop) && authoredTop > 0 && Number.isFinite(top) && top > 0
    ? top / authoredTop
    : 1;
  return authored.map((s: any) => {
    const w = Number(s?.weight);
    const scaled = Number.isFinite(w) && w > 0
      ? (scale === 1 ? w : Math.max(5, Math.floor((w * scale) / 5) * 5))
      : w;
    return { weight: scaled, reps: s?.reps, ...(s?.amrap ? { amrap: true } : null), ...(s?.warmup ? { warmup: true } : null) };
  });
}

// Map percentage intensity to band resistance level
function getBandResistanceFromPercentage(originalPercent: number): string {
  if (originalPercent <= 35) return "Light Band";
  if (originalPercent <= 55) return "Medium Band";
  if (originalPercent <= 75) return "Heavy Band";
  return "Extra Heavy Band";
}

// Equipment substitution based on user's available equipment
// Q-180: `reps` added to the return. A substitution that swaps a DISTANCE-native station (a 20 m sled
// push) for a REP exercise (a loaded lunge, a row) must rewrite the UNIT too — otherwise it hands a
// dumbbell row a prescription of '20 m'. It used to rewrite only the name and the notes.
function substituteExerciseForEquipment(exerciseName: string, userEquipment: string[], percentOf1RM?: number): { name: string; notes?: string; reps?: number | string } {
  const name = String(exerciseName || '').toLowerCase();
  const equipment = Array.isArray(userEquipment) ? userEquipment : [];
  // Q-180: set when a substitution changes the exercise's UNIT (distance station -> rep exercise).
  let repsOverride: number | string | undefined;
  
  // Check for gym access (old and new naming conventions)
  const hasGymAccess = equipment.includes('Full commercial gym access') || equipment.includes('Commercial gym');
  
  // Check for specific equipment (supporting both old and new names)
  const hasBarbell = hasGymAccess || equipment.includes('Full barbell + plates') || equipment.includes('Barbell + plates') || equipment.includes('Squat rack or power cage') || equipment.includes('Squat rack / Power cage');
  const hasDumbbells = hasGymAccess || equipment.includes('Adjustable dumbbells') || equipment.includes('Fixed dumbbells') || equipment.includes('Dumbbells');
  const hasBench = hasGymAccess || equipment.includes('Bench (flat/adjustable)');
  // Added 2026-08-13 with the Forever assistance catalog. ⛔ `hasAbWheel` deliberately does NOT read
  // `hasGymAccess`: a rack and a cable stack are what a commercial gym IS, a ten-dollar ab wheel is
  // not, and plenty of gyms stock none. Same reasoning as `hasAbWheel` in
  // `_shared/strength-equipment-tier.ts`, which is the detector these strings feed.
  const hasInclineBench = hasGymAccess || equipment.includes('Incline bench');
  const hasAbWheel = equipment.includes('Ab wheel');
  // ⚠️ BACK TO `hasGymAccess` ALONE (Slice 7). The "Leg curl machine" chip was cut with the rest of
  // the niche itemization, so gym access is the only signal again — and this substitution is now the
  // ONLY thing standing between a home athlete and a machine they do not own, since the gate on
  // `Leg Curl` was removed for the same reason. Do not weaken both halves.
  const hasLegCurlMachine = hasGymAccess;
  const hasPullUpBar = hasGymAccess || equipment.includes('Pull-up bar');
  const hasCable = hasGymAccess || equipment.includes('Cable machine/functional trainer') || equipment.includes('Cable machine');
  const hasKettlebells = hasGymAccess || equipment.includes('Kettlebells');
  const hasResistanceBands = equipment.includes('Resistance bands');
  const bodyweightOnly = equipment.includes('Bodyweight only') || equipment.length === 0;
  
  let resultName = exerciseName;
  let notes: string | undefined = undefined;
  
  // Face Pulls (typically require cable)
  if (name.includes('face pull') && !hasCable) {
    if (hasResistanceBands) {
      resultName = 'Band Face Pulls';
      notes = percentOf1RM ? getBandResistanceFromPercentage(percentOf1RM * 100) : 'light-medium resistance';
    } else if (hasDumbbells) {
      resultName = 'Bent-Over Reverse Flyes';
    } else if (bodyweightOnly) {
      resultName = 'Reverse Flyes (bodyweight)';
    }
  }
  
  // Machine exercises - only substitute if no gym access
  if (name.includes('leg curl') && !hasLegCurlMachine) {
    if (hasBarbell) {
      resultName = 'Nordic Curls';
    } else if (hasResistanceBands) {
      resultName = 'Band Leg Curls';
      notes = percentOf1RM ? getBandResistanceFromPercentage(percentOf1RM * 100) : 'medium resistance';
    } else {
      resultName = 'Nordic Curls';
    }
  }
  
  if (name.includes('leg extension') && !hasGymAccess) {
    if (hasDumbbells) {
      resultName = 'Bulgarian Split Squats';
    } else {
      resultName = 'Bodyweight Lunges';
    }
  }

  // ── Forever assistance catalog gear (added 2026-08-13) ──────────────────────────────────────────
  // ⛔ EVERY NAME EMITTED BELOW RESOLVES EXACTLY IN `exercise-config.ts` — checked, not assumed
  // (D-322: an unresolved name silently borrows another movement's prescription).
  //
  // Incline pressing without an incline bench is not harder, it is impossible. Fall to the FLAT
  // version of the same press — same pattern, same muscles, one bench angle down — and to the floor
  // when there is no bench at all. ⚠️ The `press` guard keeps this off "Incline Push Up" and anything
  // else that merely says incline.
  if (name.includes('incline') && name.includes('press') && !hasInclineBench) {
    if (hasDumbbells && hasBench) {
      resultName = 'Dumbbell Bench Press';
      notes = 'No incline bench — flat dumbbell press instead';
    } else if (hasDumbbells) {
      resultName = 'DB Floor Press';
      notes = 'No bench — press from the floor';
    } else {
      resultName = 'Push Up';
      notes = 'No incline bench — push-ups, feet raised if you want the upper-chest angle';
    }
  }

  // The ab wheel is the one movement on the previous program's abs list (the previous program) that needs a piece of kit.
  // Fall back inside HIS OWN abs list rather than to a generic core movement: hanging leg raise when
  // there is a bar, sit-up otherwise. Both are on p.30 / the previous program.
  if ((name.includes('ab wheel') || name.includes('ab rollout')) && !hasAbWheel) {
    resultName = hasPullUpBar ? 'Hanging Leg Raise' : 'Sit Up';
    notes = 'No ab wheel — same slot, no kit needed';
  }
  
  // Lateral Raises
  if (name.includes('lateral raise')) {
    if (name.includes('dumbbell') && !hasDumbbells) {
      if (hasResistanceBands) {
        resultName = exerciseName.replace(/Dumbbell/gi, 'Band');
        notes = percentOf1RM ? getBandResistanceFromPercentage(percentOf1RM * 100) : 'light resistance';
      } else if (bodyweightOnly) {
        resultName = 'Scaption (bodyweight shoulder raises)';
      }
    } else if (name.includes('cable') && !hasCable) {
      if (hasDumbbells) {
        resultName = exerciseName.replace(/Cable/gi, 'Dumbbell');
      } else if (hasResistanceBands) {
        resultName = exerciseName.replace(/Cable/gi, 'Band');
        notes = percentOf1RM ? getBandResistanceFromPercentage(percentOf1RM * 100) : 'light resistance';
      }
    } else if (!name.includes('dumbbell') && !name.includes('band') && !name.includes('cable')) {
      // No equipment specified - default to dumbbell or substitute
      if (hasDumbbells) {
        resultName = `Dumbbell ${exerciseName}`;
      } else if (hasResistanceBands) {
        resultName = `Band ${exerciseName}`;
        notes = percentOf1RM ? getBandResistanceFromPercentage(percentOf1RM * 100) : 'light resistance';
      } else if (bodyweightOnly) {
        resultName = 'Scaption (bodyweight shoulder raises)';
      }
    }
  }
  
  // ── Accessory-bias add-on (glute | hyrox) — equipment fallbacks (direction-agnostic; also honors user
  // gear prefs via the same userEquipment signal) ────────────────────────────────────────────────────
  // Glute: the barbell hip thrust needs a barbell + bench; a bodyweight-only home falls to a glute bridge.
  if (name.includes('barbell hip thrust') && !hasBarbell) {
    resultName = 'Single-Leg Glute Bridge';
    notes = 'No barbell — single-leg glute bridge; add weight on the hip if able';
  }
  // Hyrox stations: sled/sandbag need commercial-gym (turf/sled/prowler) access → same-PATTERN barbell/DB
  // fallbacks for a home gym.
  if (name.includes('sled push') && !hasGymAccess) {
    resultName = hasDumbbells ? 'Dumbbell Walking Lunge' : hasBarbell ? 'Barbell Walking Lunge' : 'Walking Lunge';
    notes = 'No sled — loaded walking lunge (forward horizontal drive under load)';
    repsOverride = '10/leg'; // Q-180: a loaded walking lunge is dosed in reps, not metres
  }
  if (name.includes('sandbag lunge') && !hasGymAccess) {
    resultName = hasDumbbells ? 'Dumbbell Walking Lunge' : hasBarbell ? 'Barbell Walking Lunge' : 'Walking Lunge';
    notes = 'No sandbag — loaded walking lunge';
    repsOverride = '10/leg'; // Q-180: same
  }
  if (name.includes('sled pull') && !hasGymAccess) {
    resultName = hasDumbbells ? 'Dumbbell Row' : hasBarbell ? 'Bent-Over Row' : hasResistanceBands ? 'Band Row' : 'Inverted Row';
    notes = 'No sled — heavy horizontal pull';
    repsOverride = '8-12'; // Q-180: a row is dosed in reps, not metres
  }
  // Farmers carry works with any load (DB/KB/barbell); only fall back when there is none at all.
  if (name.includes('farmers carry') && !hasDumbbells && !hasKettlebells && !hasBarbell && !hasGymAccess) {
    resultName = 'Backpack Carry';
    notes = 'Load a backpack — any carry stimulus works';
  }

  // Add band notes for any band exercises that don't already have them (fallback)
  const finalName = String(resultName).toLowerCase();
  if (finalName.includes('band') && !notes) {
    if (percentOf1RM) {
      notes = getBandResistanceFromPercentage(percentOf1RM * 100);
    } else {
      // Legacy fallback if no percentage provided
      if (finalName.includes('face pull')) {
        notes = 'light-medium resistance';
      } else if (finalName.includes('leg curl')) {
        notes = 'medium resistance';
      } else if (finalName.includes('lateral raise') || finalName.includes('front raise')) {
        notes = 'light resistance';
      } else if (finalName.includes('row')) {
        notes = 'medium-heavy resistance';
      } else if (finalName.includes('pull') || finalName.includes('pushdown')) {
        notes = 'medium resistance';
      }
    }
  }
  
  return { name: resultName == null || resultName === '' ? 'exercise' : String(resultName), notes, reps: repsOverride };
}

function parseIntSafe(s?: string | number | null): number | null { const n = typeof s === 'number' ? s : parseInt(String(s||''), 10); return Number.isFinite(n) ? n : null; }

function uid(): string { try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; } }

/**
 * Pre-built steps for assessment week sessions.
 * No pace targets — the athlete discovers their pace; that's the point of the test.
 * Steps use duration_s or distance_m matching the session's test protocol.
 */
function buildAssessmentSteps(tags: string[]): { id: string; kind: string; duration_s?: number; distance_m?: number; label: string }[] {
  // Swim CSS Test: 400 yd warmup → 3 min rest → 400 yd TT → 3 min rest → 200 yd TT → 200 yd cool-down
  if (tags.includes('css_test')) {
    return [
      { id: uid(), kind: 'warmup',   distance_m: 366, label: 'Easy warmup — 400 yd' },
      { id: uid(), kind: 'recovery', duration_s: 180, label: 'Rest — 3 min' },
      { id: uid(), kind: 'work',     distance_m: 366, label: '400 yd time trial — max effort' },
      { id: uid(), kind: 'recovery', duration_s: 180, label: 'Rest — 3 min' },
      { id: uid(), kind: 'work',     distance_m: 183, label: '200 yd time trial — max effort' },
      { id: uid(), kind: 'cooldown', distance_m: 183, label: 'Easy cool-down — 200 yd' },
    ];
  }
  // Bike FTP Test: 10 min easy → 2 × 1 min hard / 1 min easy → 20 min TT → 5 min cool-down
  if (tags.includes('ftp_test')) {
    return [
      { id: uid(), kind: 'warmup',   duration_s: 600,  label: 'Easy spin — 10 min' },
      { id: uid(), kind: 'work',     duration_s: 60,   label: 'Hard effort opener — 1 min' },
      { id: uid(), kind: 'recovery', duration_s: 60,   label: 'Easy — 1 min' },
      { id: uid(), kind: 'work',     duration_s: 60,   label: 'Hard effort opener — 1 min' },
      { id: uid(), kind: 'recovery', duration_s: 60,   label: 'Easy — 1 min' },
      { id: uid(), kind: 'work',     duration_s: 1200, label: '20-min FTP time trial — max sustainable effort' },
      { id: uid(), kind: 'cooldown', duration_s: 300,  label: 'Easy cool-down — 5 min' },
    ];
  }
  // Run 12-min TT: 15 min easy → 4 × 30 sec strides / 30 sec walk → 12 min TT → 10 min cool-down
  if (tags.includes('run_test')) {
    return [
      { id: uid(), kind: 'warmup',   duration_s: 900, label: 'Easy warmup — 15 min' },
      { id: uid(), kind: 'work',     duration_s: 30,  label: 'Stride — fast' },
      { id: uid(), kind: 'recovery', duration_s: 30,  label: 'Walk recovery' },
      { id: uid(), kind: 'work',     duration_s: 30,  label: 'Stride — fast' },
      { id: uid(), kind: 'recovery', duration_s: 30,  label: 'Walk recovery' },
      { id: uid(), kind: 'work',     duration_s: 30,  label: 'Stride — fast' },
      { id: uid(), kind: 'recovery', duration_s: 30,  label: 'Walk recovery' },
      { id: uid(), kind: 'work',     duration_s: 30,  label: 'Stride — fast' },
      { id: uid(), kind: 'recovery', duration_s: 30,  label: 'Walk recovery' },
      { id: uid(), kind: 'work',     duration_s: 720, label: '12-min time trial — max sustainable effort' },
      { id: uid(), kind: 'cooldown', duration_s: 600, label: 'Easy cool-down — 10 min' },
    ];
  }
  return [];
}

function minutesTokenToSeconds(tok: string): number | null {
  const m = tok.match(/(\d+)\s*min/i); if (m) return parseInt(m[1],10)*60; return null;
}

export function expandRunToken(tok: string, baselines: Baselines): any[] {
  const out: any[] = [];
  const lower = String(tok ?? '').toLowerCase();
  
  // Helper: convert miles to meters
  const milesToMeters = (mi: number) => Math.round(mi * 1609.34);
  
  // warmup/cooldown - TIME based
  if (/warmup/.test(lower) && /min/.test(lower)) {
    const sec = minutesTokenToSeconds(lower) ?? 600; out.push({ id: uid(), kind:'warmup', duration_s: sec, pace_sec_per_mi: secPerMiFromBaseline(baselines,'easy')||undefined }); return out;
  }
  if (/cooldown/.test(lower) && /min/.test(lower)) {
    const sec = minutesTokenToSeconds(lower) ?? 600; out.push({ id: uid(), kind:'cooldown', duration_s: sec, pace_sec_per_mi: secPerMiFromBaseline(baselines,'easy')||undefined }); return out;
  }
  
  // warmup/cooldown - DISTANCE based (1mi)
  if (/warmup.*1mi/.test(lower)) {
    out.push({ id: uid(), kind:'warmup', distance_m: milesToMeters(1), pace_sec_per_mi: secPerMiFromBaseline(baselines,'easy')||undefined }); return out;
  }
  if (/cooldown.*1mi/.test(lower)) {
    out.push({ id: uid(), kind:'cooldown', distance_m: milesToMeters(1), pace_sec_per_mi: secPerMiFromBaseline(baselines,'easy')||undefined }); return out;
  }
  
  // Long run DISTANCE based with MP segment: longrun_18mi_easypace_last3mi_MP
  if (/longrun_\d+mi_easypace_last\d+mi_mp/.test(lower)) {
    const m = lower.match(/longrun_(\d+)mi_easypace_last(\d+)mi_mp/);
    if (m) {
      const totalMiles = parseInt(m[1], 10);
      const mpMiles = parseInt(m[2], 10);
      const easyMiles = totalMiles - mpMiles;
      const easyPace = secPerMiFromBaseline(baselines, 'easy') || undefined;
      const mpPace = secPerMiFromBaseline(baselines, 'marathon') || easyPace; // Fall back to easy if no MP baseline
      // Easy portion
      out.push({ id: uid(), kind: 'work', distance_m: milesToMeters(easyMiles), pace_sec_per_mi: easyPace });
      // MP portion
      out.push({ id: uid(), kind: 'work', distance_m: milesToMeters(mpMiles), pace_sec_per_mi: mpPace });
      return out;
    }
  }
  
  // Long run DISTANCE based: longrun_18mi_easypace — AND longrun_26.2mi_easypace (2026-08-06).
  //
  // ⛔ DECIMALS WERE ALWAYS IN THE GRAMMAR AND NEVER IN THE EXPANDER. `validation.ts:312` accepts
  // `/^longrun_[\d.]+mi_easypace$/` and `run_mp_[\d.]+mi` right below this even carries a comment
  // saying it supports them — this one matched `\d+` and `parseInt`, so `longrun_26.2mi_easypace`
  // fell through every branch to the time-based ones and the race materialised as a DURATION. The
  // renderer then back-derived distance from that duration ÷ the athlete's easy pace and printed a
  // 26.2-mile marathon as 21.3 miles, because the duration had been written at the fitness-tier
  // pace (11:00/mi) and re-read at the athlete's real one (13:30/mi).
  //
  // ⚠️ EVERY RACE DISTANCE IS A DECIMAL — 26.2, 13.1, 6.2, 3.1. There is no version of this that
  // works on integers.
  if (/longrun_[\d.]+mi_easypace/.test(lower)) {
    const m = lower.match(/longrun_([\d.]+)mi/);
    if (m) {
      const miles = parseFloat(m[1]);
      if (Number.isFinite(miles) && miles > 0) {
        out.push({ id: uid(), kind: 'work', distance_m: milesToMeters(miles), pace_sec_per_mi: secPerMiFromBaseline(baselines, 'easy') || undefined });
        return out;
      }
    }
  }
  
  // Long run TIME based with MP segment: longrun_160min_easypace_last20min_MP
  if (/longrun_\d+min_easypace_last\d+min_mp/i.test(lower)) {
    const m = lower.match(/longrun_(\d+)min_easypace_last(\d+)min_mp/i);
    if (m) {
      const totalMin = parseInt(m[1], 10);
      const mpMin = parseInt(m[2], 10);
      const easyMin = totalMin - mpMin;
      const easyPace = secPerMiFromBaseline(baselines, 'easy') || undefined;
      const mpPace = secPerMiFromBaseline(baselines, 'marathon') || easyPace; // Fall back to easy if no MP baseline
      // Easy portion
      out.push({ id: uid(), kind: 'work', duration_s: easyMin * 60, pace_sec_per_mi: easyPace });
      // MP portion
      out.push({ id: uid(), kind: 'work', duration_s: mpMin * 60, pace_sec_per_mi: mpPace });
      return out;
    }
  }
  
  // long run TIME based (support longrun_Xmin, longrun_Xmin_easypace, and long_run_Xmin)
  if (/long[_-]?run_\d+min(?:_easypace)?/.test(lower)) {
    const m = lower.match(/long[_-]?run_(\d+)min/);
    if (m) {
      const sec = parseInt(m[1], 10) * 60;
      out.push({ id: uid(), kind: 'work', duration_s: sec, pace_sec_per_mi: secPerMiFromBaseline(baselines, 'easy') || undefined });
      return out;
    }
  }
  
  // easy run TIME based: run_easy_Xmin (CHECK FIRST to avoid matching "min" in distance pattern)
  if (/run_easy_\d+min/.test(lower)) {
    const m = lower.match(/run_easy_(\d+)min/); const sec = m ? parseInt(m[1],10)*60 : 1800; out.push({ id: uid(), kind:'work', duration_s: sec, pace_sec_per_mi: secPerMiFromBaseline(baselines,'easy')||undefined }); return out;
  }
  
  // Easy run DISTANCE based: run_easy_5mi (CHECK AFTER time-based to avoid false matches)
  if (/run_easy_\d+mi\b/.test(lower)) {
    const m = lower.match(/run_easy_(\d+)mi\b/);
    if (m) {
      const miles = parseInt(m[1], 10);
      out.push({ id: uid(), kind: 'work', distance_m: milesToMeters(miles), pace_sec_per_mi: secPerMiFromBaseline(baselines, 'easy') || undefined });
      return out;
    }
  }
  
  // Tri race-pace block: run_race_pace_70_3_5mi, run_race_pace_ironman_8mi, etc.
  if (/^run_race_pace_[a-z0-9_]+_[\d.]+mi$/.test(lower)) {
    const m = lower.match(/^run_race_pace_([a-z0-9_]+)_([\d.]+)mi$/);
    if (m) {
      const key = m[1];
      const miles = parseFloat(m[2]);
      if (Number.isFinite(miles) && miles > 0) {
        let paceWhich: 'fivek' | 'marathon' | 'threshold' = 'threshold';
        if (key === 'ironman') paceWhich = 'marathon';
        else if (key === 'sprint') paceWhich = 'fivek';
        const pace = secPerMiFromBaseline(baselines, paceWhich) || secPerMiFromBaseline(baselines, 'easy') || undefined;
        out.push({ id: uid(), kind: 'work', distance_m: milesToMeters(miles), pace_sec_per_mi: pace });
        return out;
      }
    }
  }
  
  // Marathon pace run DISTANCE based: run_mp_5mi or run_mp_26.2mi (supports decimals)
  if (/run_mp_[\d.]+mi/.test(lower)) {
    const m = lower.match(/run_mp_([\d.]+)mi/);
    if (m) {
      const miles = parseFloat(m[1]);
      if (Number.isFinite(miles) && miles > 0) {
        const mpPace = secPerMiFromBaseline(baselines, 'marathon') || secPerMiFromBaseline(baselines, 'easy') || undefined;
        out.push({ id: uid(), kind: 'work', distance_m: milesToMeters(miles), pace_sec_per_mi: mpPace });
        return out;
      }
    }
  }
  // Tempo: tempo_25min_threshold (new style)
  if (/tempo_\d+min_threshold/.test(lower)) {
    const m = lower.match(/tempo_(\d+)min_threshold/);
    const sec = m ? parseInt(m[1],10)*60 : 1500;
    // Threshold pace is ~5K pace + 15-20 sec
    const pace = secPerMiFromBaseline(baselines, 'threshold') ?? undefined;   // threshold IS the anchor (2026-09-02); was 5K + 20
    out.push({ id: uid(), kind:'work', duration_s: sec, pace_sec_per_mi: pace }); 
    return out;
  }
  
  // Tempo: tempo_5mi_threshold (distance-based threshold)
  if (/tempo_\d+mi_threshold/.test(lower)) {
    const m = lower.match(/tempo_(\d+)mi_threshold/);
    if (m) {
      const miles = parseInt(m[1],10);
      const pace = secPerMiFromBaseline(baselines, 'threshold') ?? undefined;   // threshold IS the anchor (2026-09-02); was 5K + 20
      out.push({ id: uid(), kind:'work', distance_m: milesToMeters(miles), pace_sec_per_mi: pace });
      return out;
    }
  }
  
  // Tempo: tempo_25min_5kpace_plus0:45 (legacy style)
  if (/tempo_\d+min_5kpace/.test(lower)) {
    const m = lower.match(/tempo_(\d+)min_5kpace(?:_plus(\d+):(\d+))?/);
    const sec = m ? parseInt(m[1],10)*60 : 1500;
    const fkp = secPerMiFromBaseline(baselines,'fivek');
    const plus = (m && m[2] && m[3]) ? (parseInt(m[2],10)*60 + parseInt(m[3],10)) : 0;
    const pace = (fkp!=null) ? (fkp + plus) : undefined;
    out.push({ id: uid(), kind:'work', duration_s: sec, pace_sec_per_mi: pace }); return out;
  }
  // Tempo: tempo_5mi_5kpace_plus1:00 (legacy distance-based)
  if (/tempo_\d+mi_5kpace/.test(lower)) {
    const m = lower.match(/tempo_(\d+)mi_5kpace(?:_plus(\d+):(\d+))?/);
    if (m) {
      const miles = parseInt(m[1],10);
      const dist_m = Math.round(miles * 1609.34);
      const fkp = secPerMiFromBaseline(baselines,'fivek');
      const plus = (m[2] && m[3]) ? (parseInt(m[2],10)*60 + parseInt(m[3],10)) : 0;
      const pace = (fkp!=null) ? (fkp + plus) : undefined;
      out.push({ id: uid(), kind:'work', distance_m: dist_m, pace_sec_per_mi: pace });
      return out;
    }
  }
  
  // Fartlek: fartlek_6x30-60s_moderate
  if (/fartlek_\d+x\d+-\d+s/.test(lower)) {
    const m = lower.match(/fartlek_(\d+)x(\d+)-(\d+)s/);
    if (m) {
      const reps = parseInt(m[1], 10);
      const minSec = parseInt(m[2], 10);
      const maxSec = parseInt(m[3], 10);
      const avgSec = Math.round((minSec + maxSec) / 2);
      const fkp = secPerMiFromBaseline(baselines, 'fivek');
      const easyPace = secPerMiFromBaseline(baselines, 'easy') || undefined;
      // Fartlek pickups are ~10K pace (5K + 10-15 sec)
      const pickupPace = fkp != null ? (fkp + 12) : undefined;
      for (let i = 0; i < reps; i++) {
        out.push({ id: uid(), kind: 'work', duration_s: avgSec, pace_sec_per_mi: pickupPace });
        // Recovery is roughly equal duration at easy pace
        if (i < reps - 1) out.push({ id: uid(), kind: 'recovery', duration_s: avgSec, pace_sec_per_mi: easyPace });
      }
      return out;
    }
  }
  
  // VO2 run: run_vo2_5x3min_z5 — 5×3 min Z5, 90s float (main set ~22 min)
  //
  // ⛔ THE RECOVERY IS NOW OPTIONAL IN THE TOKEN, AND ABSENT STILL MEANS 90 s (2026-08-06).
  // `run_vo2_{reps}x{min}min[_r{n}s]_z5` — the same optional-group pattern `cruise_*` uses below at
  // its `(?:_r(\d+)s)?`. The bare form is byte-identical to what it was: every plan already built on
  // `run_vo2_5x3min_z5` expands to the same steps it did yesterday, which is the only reason this
  // was done as an optional group rather than a required one.
  //
  // ⚠️ WHY IT WAS NEEDED: the flat hard-run option (the last-resort terrain — see
  // `strength-primary-plan.ts` `flatSession`) prescribes a 3-minute float, and a 90 s float turns
  // 4 × 3 min into a materially harder session than the one the doctrine costed.
  //
  // ⛔ THIS BRANCH STILL BRACKETS NOTHING, DELIBERATELY. No warm-up, no cool-down — unlike the hill
  // tokens, which build their own. Its callers pass `warmup_run_10min_easy` and
  // `cooldown_run_10min_easy` as separate presets (`generate-combined-plan/session-factory.ts:443`
  // has done this since it shipped), and the flat session does the same. Adding bracketing here
  // would silently double the warm-up on every existing caller.
  // ⛔ THE RUN'S THRESHOLD INTERVALS — `run_thr_{reps}x{min}min_r{sec}s` (§7, 2026-08-17).
  //
  // ⚠️ ADDED, NOT REBUILT, AND THE SEARCH CAME FIRST. `bike_thr_*` already existed for the ride;
  // `tempo_Nmin_threshold` exists but is ONE continuous block with no reps; `cruise_Nx{mi}mi` is
  // distance-based and §7's spec is in MINUTES (4 × 5 → 3 × 7 → 2 × 10). There was no time-based
  // run threshold interval token, so this is the gap, shaped exactly like `run_vo2_*` above.
  //
  // ⛔ THE PACE IS THE ONE THE APP ALREADY OWNS. `secPerMiFromBaseline(_, 'threshold')` is the
  // single reader — measured threshold if the athlete has one, otherwise 5K + 20 s/mi, which is
  // this file's own long-standing rule. No second derivation here.
  // ⛔ `_f{sec}` — FASTER THAN THRESHOLD BY THAT MANY SEC/MI (2026-08-17, doctrine §2 wave 2).
  // Wave 2 is the same structure run 5-10 s/mi quicker; without a way to say so in the token, wave 2
  // materialized byte-identical to wave 1 and the block had no progression in it.
  // ⚠️ OPTIONAL. A token without the suffix is the pre-2026-08-17 form exactly.
  if (/^run_thr_\d+x\d+min(?:_r\d+s)?(?:_f\d+)?$/.test(lower)) {
    const m = lower.match(/^run_thr_(\d+)x(\d+)min(?:_r(\d+)s)?(?:_f(\d+))?$/);
    if (m) {
      const reps = parseInt(m[1], 10);
      const work_s = parseInt(m[2], 10) * 60;
      const rest_s = m[3] ? parseInt(m[3], 10) : 60;
      const faster = m[4] ? parseInt(m[4], 10) : 0;
      const thrBase = secPerMiFromBaseline(baselines, 'threshold');
      // ⚠️ FLOORED AT 5K PACE. A pace drop is a progression, not a licence to cross into VO2 work —
      // the doctrine's whole point is that this session stays below the redline.
      const fiveK = secPerMiFromBaseline(baselines, 'fivek');
      const thr = thrBase == null
        ? undefined
        : (faster > 0 ? Math.max(fiveK ?? 0, thrBase - faster) : thrBase);
      const easyPace = secPerMiFromBaseline(baselines, 'easy') || undefined;
      for (let i = 0; i < reps; i++) {
        out.push({ id: uid(), kind: 'work', duration_s: work_s, pace_sec_per_mi: thr, label: 'Threshold' });
        if (i < reps - 1 && rest_s > 0) {
          out.push({ id: uid(), kind: 'recovery', duration_s: rest_s, pace_sec_per_mi: easyPace });
        }
      }
      return out;
    }
  }
  // ⛔ FLAT SPRINTS — `run_sprint_{reps}x{sec}s_r{sec}s` (2026-08-18, the speed track).
  //
  // ⛔ NO PACE, AND THAT IS THE PRESCRIPTION. Every other run token prices off a baseline; this one
  // asks for MAXIMUM EFFORT over 10-15 seconds, and a pace target would cap the very thing the
  // session exists to train. The recovery is a WALK, not an easy jog — a paced recovery would turn a
  // neural session into a lactate one, which is the one thing it must not become in a block that
  // already carries a threshold day.
  if (/^run_sprint_\d+x\d+s_r\d+s$/.test(lower)) {
    const m = lower.match(/^run_sprint_(\d+)x(\d+)s_r(\d+)s$/);
    if (m) {
      const reps = parseInt(m[1], 10);
      const work_s = parseInt(m[2], 10);
      const rest_s = parseInt(m[3], 10);
      for (let i = 0; i < reps; i++) {
        out.push({ id: uid(), kind: 'work', duration_s: work_s, label: 'Sprint' });
        if (i < reps - 1) {
          out.push({ id: uid(), kind: 'recovery', duration_s: rest_s, label: 'Walk back' });
        }
      }
      return out;
    }
  }
  if (/^run_vo2_\d+x\d+min(?:_r\d+s)?_z5$/.test(lower)) {
    const m = lower.match(/^run_vo2_(\d+)x(\d+)min(?:_r(\d+)s)?_z5$/);
    if (m) {
      const reps = parseInt(m[1], 10);
      const workMin = parseInt(m[2], 10);
      const work_s = workMin * 60;
      const rest_s = m[3] ? parseInt(m[3], 10) : 90;
      const fkp = secPerMiFromBaseline(baselines, 'fivek');
      const vo2Pace = fkp != null ? Math.max(270, fkp - 12) : undefined;
      const easyPace = secPerMiFromBaseline(baselines, 'easy') || undefined;
      for (let i = 0; i < reps; i++) {
        out.push({ id: uid(), kind: 'work', duration_s: work_s, pace_sec_per_mi: vo2Pace, label: 'Z5' });
        if (i < reps - 1) {
          out.push({ id: uid(), kind: 'recovery', duration_s: rest_s, pace_sec_per_mi: easyPace, label: 'Float' });
        }
      }
      return out;
    }
  }

  // Cruise intervals: cruise_4x1mi_threshold_r60s or cruise_3x1.5mi_threshold_r60s
  if (/cruise_\d+x[\d.]+mi_threshold/.test(lower)) {
    const m = lower.match(/cruise_(\d+)x([\d.]+)mi_threshold(?:_r(\d+)s)?/);
    if (m) {
      const reps = parseInt(m[1], 10);
      const miles = parseFloat(m[2]);
      const rest_s = m[3] ? parseInt(m[3], 10) : 60;
      // ⛔ THRESHOLD IS THE ANCHOR (2026-09-02). This read `5K + 20` — a private copy of the seed
      // rule — so an athlete with a MEASURED threshold and no typed 5K got NO pace on their cruise
      // intervals (measured before/after 2026-09-02: learned thr 400 → work=[-]). One authority now.
      const thresholdPace = secPerMiFromBaseline(baselines, 'threshold') ?? undefined;
      const easyPace = secPerMiFromBaseline(baselines, 'easy') || undefined;
      for (let i = 0; i < reps; i++) {
        out.push({ id: uid(), kind: 'work', distance_m: milesToMeters(miles), pace_sec_per_mi: thresholdPace });
        if (rest_s > 0 && i < reps - 1) out.push({ id: uid(), kind: 'recovery', duration_s: rest_s, pace_sec_per_mi: easyPace });
      }
      return out;
    }
  }
  /**
   * ⛔⛔ THE COMPOUND ROUND — `round_3x_28s130-53s115-70svt1_R120s` (2026-08-30).
   *
   * ⛔ BOOK-SANCTIONED, p231-232 MLSS, level 2: *"2 sets of 4 rounds of: 15s @ 130% / 45s @ 105% /
   * 1 min @ VT1; 2-min recovery walk/jog between sets."* Several intensities INSIDE one round is the
   * shape, and no token could hold it — `interval_Nx{dist}_5kpace` flattened all three to six equal
   * reps at one pace, which is what a runner's hardest session of the week was arriving as.
   *
   * ⚠️ SEGMENTS ARE `{seconds}s{percent}`, or `{seconds}svt1` / `{seconds}seasy` for the untargeted
   * ones. The list is the round's own sequence, in order; `Nx` is how many rounds; `_R{secs}s` is the
   * rest BETWEEN rounds and is skipped after the last, matching every other interval branch here.
   * ⚠️ PERCENT OF THRESHOLD **SPEED**, SO THE PACE DIVIDES — 130% is the threshold pace over 1.30.
   * The same trap as the p235 inserts, and it would read as an easy jog if multiplied.
   * ⚠️ ADDITIVE. No existing token changes shape or meaning.
   */
  {
    const mRound = lower.match(/^round_(\d+)x_((?:r?\d+s(?:\d+|vt1|easy|racepace))(?:-r?\d+s(?:\d+|vt1|easy|racepace))*)(?:_r(\d+)s)?$/);
    if (mRound) {
      const rounds = parseInt(mRound[1], 10);
      const segs = mRound[2].split('-');
      const rest_s = mRound[3] ? parseInt(mRound[3], 10) : 0;
      const thr = secPerMiFromBaseline(baselines, 'threshold') || undefined;
      const easy = secPerMiFromBaseline(baselines, 'easy') || undefined;
      for (let r = 0; r < rounds; r += 1) {
        for (const seg of segs) {
          // ⚠️ A LEADING `r` MARKS A RECOVERY the source named — see `compoundRoundToken`. Without
          // it a 50% segment would arrive as a work step at half of threshold.
          const m2 = seg.match(/^(r?)(\d+)s(\d+|vt1|easy|racepace)$/);
          if (!m2) continue;
          const isRec = m2[1] === 'r';
          const secs = parseInt(m2[2], 10);
          const at = m2[3];
          /**
           * ⛔ `racepace` IS PRESCRIBED WORK WITH NO PACE, and that is honest rather than lazy. The
           * library says so itself: *"Race pace — set by the race being trained for, not by this
           * library."* p235 states the finish and its duration; no page gives it a percentage. Same
           * treatment the all-out strides already get — the step reaches the watch, the number does
           * not, because there is no number.
           */
          if (at === 'racepace') {
            out.push({ id: uid(), kind: 'work', duration_s: secs });
          } else if (at === 'vt1' || at === 'easy' || isRec) {
            const pct = at === 'vt1' || at === 'easy' ? 0 : parseInt(at, 10) / 100;
            out.push({
              id: uid(), kind: 'recovery', duration_s: secs,
              pace_sec_per_mi: pct > 0 && thr ? Math.round(thr / pct) : easy,
            });
          } else {
            const pct = parseInt(at, 10) / 100;
            out.push({
              id: uid(), kind: 'work', duration_s: secs,
              pace_sec_per_mi: thr && pct > 0 ? Math.round(thr / pct) : undefined,
            });
          }
        }
        if (rest_s > 0 && r < rounds - 1) {
          out.push({ id: uid(), kind: 'recovery', duration_s: rest_s, pace_sec_per_mi: easy });
        }
      }
      return out;
    }
  }
  /**
   * ⛔⛔ TIME-BASED RUN INTERVALS AT A PERCENTAGE OF THRESHOLD — `interval_2x90s_115pct_R30s`.
   *
   * ⛔ WHY IT HAD TO EXIST (2026-08-30). Every run interval token here is DISTANCE-based at a NAMED
   * pace (`5kpace`, `base`, `build`, …). p235's long-run inserts are neither: *"1-hour VT1 run with
   * 2 sets added at any point; the sets are 2 rounds of 1:30 @ 115% / 30s @ VT1"* — seconds, at a
   * percentage. There was no token that could carry them, so `run_lsd` emitted only the easy long
   * run and the inserts vanished between the composer and the row the athlete opens.
   *
   * ⚠️ PERCENT OF THRESHOLD **SPEED**, so the pace DIVIDES: 115% of threshold speed is the threshold
   * pace over 1.15. Multiplying would have made the hard insert slower than the easy running.
   * ⚠️ THE FLOAT IS AT EASY PACE and is skipped after the last rep, matching the distance branch.
   * ⚠️ ADDITIVE — no existing token changes shape or meaning.
   */
  {
    const mPct = lower.match(/^interval_(\d+)x(\d+)s_(\d+)pct(?:_[rR](\d+)s)?$/);
    if (mPct) {
      const reps = parseInt(mPct[1], 10);
      const work_s = parseInt(mPct[2], 10);
      const pct = parseInt(mPct[3], 10) / 100;
      const float_s = mPct[4] ? parseInt(mPct[4], 10) : 0;
      const thr = secPerMiFromBaseline(baselines, 'threshold') || undefined;
      const pace = thr && pct > 0 ? Math.round(thr / pct) : undefined;
      for (let i = 0; i < reps; i += 1) {
        out.push({ id: uid(), kind: 'work', duration_s: work_s, pace_sec_per_mi: pace });
        if (float_s > 0 && i < reps - 1) {
          out.push({
            id: uid(),
            kind: 'recovery',
            duration_s: float_s,
            pace_sec_per_mi: secPerMiFromBaseline(baselines, 'easy') || undefined,
          });
        }
      }
      return out;
    }
  }
  // Intervals: interval_5x800m_5kpace_r90s, interval_6x800m_base (phase suffix from session-factory), etc.
  if (/interval_\d+x/.test(lower)) {
    const mLegacy = lower.match(/^interval_(\d+)x(\d+)(m|mi)_5kpace(?:_[rR](\d+)(s|min)?)?$/);
    const mPhase = !mLegacy
      ? lower.match(/^interval_(\d+)x(\d+)(m|mi)_(base|build|race_specific|taper)(?:_[rR](\d+)(s|min)?)?$/)
      : null;
    const m = mLegacy || mPhase;
    if (m) {
      const reps = parseInt(m[1], 10);
      const val = parseInt(m[2], 10);
      const unit = m[3];
      const dist_m = unit === 'mi' ? Math.round(val * 1609.34) : val;
      let rest_s = 0;
      let paceWhich: 'fivek' | 'marathon' | 'threshold' = 'fivek';
      if (mLegacy) {
        const restNum = m[4];
        rest_s = restNum ? (m[5] === 'min' ? parseInt(restNum, 10) * 60 : parseInt(restNum, 10)) : 0;
        if (!rest_s) rest_s = 90;
        paceWhich = 'fivek';
      } else {
        const phase = m[4];
        const restNum = m[5];
        rest_s = restNum ? (m[6] === 'min' ? parseInt(restNum, 10) * 60 : parseInt(restNum, 10)) : 0;
        if (!rest_s) rest_s = phase === 'base' || phase === 'build' ? 90 : 120;
        if (phase === 'base') paceWhich = 'fivek';
        else if (phase === 'build' || phase === 'race_specific') paceWhich = 'threshold';
        else paceWhich = 'marathon';
      }
      const pace = secPerMiFromBaseline(baselines, paceWhich) || undefined;
      for (let i = 0; i < reps; i += 1) {
        out.push({ id: uid(), kind: 'work', distance_m: dist_m, pace_sec_per_mi: pace });
        if (rest_s > 0 && i < reps - 1) {
          out.push({
            id: uid(),
            kind: 'recovery',
            duration_s: rest_s,
            pace_sec_per_mi: secPerMiFromBaseline(baselines, 'easy') || undefined,
          });
        }
      }
      return out;
    }
  }
  
  // ── HILL REPEATS — the run-only athlete's one hard aerobic session ──────────────────────────
  // Tokens: run_hills_{reps}x{work}s_rlap_g{lo}_{hi}[_d{walk|jog}]      — open, lap-button descent
  //         run_hills_{reps}x{work}s_r{rest}s_g{lo}_{hi}[_d{walk|jog}][_tm] — fixed recovery
  //
  // ⚠️ THIS LINE USED TO NAME `run_hills_10x40s_r20s_g5_8`, WHICH NO LONGER EXISTS. That token was
  // built on 2026-08-06 and reverted the same day (Q-260) — see the 40-second warning in the
  // lap-button branch below. It is the first thing a session skims, and it named a dead session.
  // Spec: docs/DOCTRINE-aerobic-maintenance-run-only.md §2, §3, §5.
  //
  // ⛔ NO PACE TARGET, AND THAT IS THE POINT (§2.2). The pace-effort relationship changes with
  // gradient, so the app's velocity anchor is INVALID on a hill — every other run-quality token here
  // prescribes off 5K pace (run_vo2 at 5K−12s/mi, cruise at 5K+20s/mi) and doing that uphill emits a
  // measured-looking number with nothing behind it. Prescribe duration at effort, name the grade,
  // and say nothing about pace. (Same shape the strides expander below already uses deliberately.)
  //
  // ⚠️ SECONDS, not minutes. Every other quality token parses `\d+min`, which is why the short-format
  // work this protocol is built on could not previously be written down at all.
  //
  // ⚠️ RECOVERY IS SHORT AND IT IS THE MECHANISM (§3). The point of 40/20 is that VO2 stays elevated
  // THROUGH the recovery, so time-at-target accumulates across the set rather than only within each
  // rep. A long float defeats it. Do not inherit run_vo2's 90s.
  //
  // ⛔ Grade travels IN the token because the cost row is not "run VO2" — it is "run VO2 at 4-8%"
  // (D-325 §1). A token that cannot carry the constraint has an unverifiable cost, and the athlete
  // gets a session the engine cannot price.
  // ⛔ THE DESCENT TRAVELS IN THE TOKEN TOO, AND FOR THE SAME REASON AS THE GRADE.
  // Uphill is concentric; the way back down is where the eccentric load in this session actually is,
  // and it is the part that reaches tomorrow. So whether the athlete jogs or walks it is NOT a
  // property of the hill session — it is a property of WHERE THE SESSION LANDED. A hill day sitting
  // 24h from a heavy lower day has no eccentric budget left and must walk; a hill day 48h clear of
  // one can jog and bank the aerobic time. Only the composer knows the placed week, so the composer
  // decides and stamps it here.
  // ⚠️ Suffix is OPTIONAL and absent means WALK. An unstamped token is one whose week we cannot see,
  // and the conservative arm is the one that adds no damage.
  // ⛔ THE LAP-BUTTON HILL DRILL — 3:00 reps, recovery ends when the athlete presses lap.
  //
  // `run_hills_{reps}x180s_rlap_g{lo}_{hi}[_d{walk|jog}]`
  //
  // Separate token, separate branch, and the existing `_r{n}s_` hill workout below is UNTOUCHED.
  // The two are different sessions: the fixed-recovery one prescribes the float, this one hands it
  // to the athlete.
  //
  // ⛔ ONLY THE RECOVERY IS OPEN. The 3:00 work rep is always a fixed timer — that is the dose, and
  // an open work rep is a different session entirely. Do not "simplify" this by making both open.
  //
  // ⚠️ THE RECOVERY STEP CARRIES NO `duration_s` AT ALL, and that absence is the instruction. It
  // reaches Garmin as `durationType: 'OPEN'`, which is the lap-button step. ⛔ Three places in
  // `send-workout-to-garmin` treat a step with no time and no distance as MALFORMED and drop it —
  // and one of them, the interval builder's rest branch, does not drop it but coerces it to
  // `Math.max(1, ...)`, i.e. a **one-second rest**, which is worse because it looks like it worked.
  // All three are taught about `lap_button`; if this token is ever consumed by a new exporter, that
  // exporter needs the same three answers.
  //
  // ⚠️ Descent suffix means the same thing it does below: absent → walk, the conservative arm.
  if (/^run_hills_\d+x\d+s_rlap_g\d+_\d+(?:_d(?:walk|jog))?$/.test(lower)) {
    const m = lower.match(/^run_hills_(\d+)x(\d+)s_rlap_g(\d+)_(\d+)(?:_d(walk|jog))?$/);
    if (m) {
      const reps = parseInt(m[1], 10);
      const work_s = parseInt(m[2], 10);
      const gradeLo = parseInt(m[3], 10);
      const gradeHi = parseInt(m[4], 10);
      const descentJogged = m[5] === 'jog';
      const easyPace = secPerMiFromBaseline(baselines, 'easy') || undefined;
      const gradeLabel = `${gradeLo}-${gradeHi}% grade`;
      out.push({ id: uid(), kind: 'warmup', duration_s: 600, pace_sec_per_mi: easyPace, label: 'Warm-up' });
      for (let i = 0; i < reps; i++) {
        out.push({
          id: uid(),
          kind: 'work',
          duration_s: work_s,
          // ⛔ Deliberately no `pace_sec_per_mi` — same reason as the fixed-recovery hill below.
          label: `Hill · ${gradeLabel}`,
        });
        if (i < reps - 1) {
          out.push({
            id: uid(),
            kind: 'recovery',
            // ⛔ NO `duration_s`. The lap button ends this step, not a clock.
            lap_button: true,
            ...(descentJogged ? { pace_sec_per_mi: easyPace } : {}),
            label: descentJogged ? 'Jog down — press lap when ready' : 'Walk down — press lap when ready',
          });
        }
      }
      // ⚠️ 10 MINUTES EITHER SIDE ON THIS DRILL (Michael, 2026-08-05) — the fixed-recovery hill below
      // cools down in 8. Not copied from it; stated for this session.
      out.push({ id: uid(), kind: 'cooldown', duration_s: 600, pace_sec_per_mi: easyPace, label: 'Cool-down' });
      return out;
    }
  }
  // ⚠️ `_tm` IS A LABEL SWITCH AND NOTHING ELSE (2026-08-06). A treadmill session is structurally
  // identical to the outdoor fixed-recovery hill — same reps, same work, same recovery, same grade
  // band — so it reuses this branch rather than forking one. What it cannot reuse is the WORDING:
  // "Hill · 5-8% grade" and "Jog down" describe a hill and a descent, and the athlete is on a belt
  // in a room. A step label that names a session the athlete is not doing is the same species of
  // error as a pace target on a gradient, and it reaches the watch face.
  // ⛔ Do NOT hang any structural difference off this suffix. The moment `_tm` changes a duration or
  // a rep count, the two sessions are two sessions and this branch is lying about being one.
  if (/^run_hills_\d+x\d+s_r\d+s_g\d+_\d+(?:_d(?:walk|jog))?(?:_tm)?$/.test(lower)) {
    const m = lower.match(/^run_hills_(\d+)x(\d+)s_r(\d+)s_g(\d+)_(\d+)(?:_d(walk|jog))?(_tm)?$/);
    if (m) {
      const reps = parseInt(m[1], 10);
      const work_s = parseInt(m[2], 10);
      const rest_s = parseInt(m[3], 10);
      const gradeLo = parseInt(m[4], 10);
      const gradeHi = parseInt(m[5], 10);
      const descentJogged = m[6] === 'jog';
      const treadmill = m[7] === '_tm';
      const easyPace = secPerMiFromBaseline(baselines, 'easy') || undefined;
      const gradeLabel = treadmill
        ? `${gradeLo}-${gradeHi}% incline`
        : `${gradeLo}-${gradeHi}% grade`;
      // ⛔ WARM-UP AND COOL-DOWN. Without these the session was 21 minutes that opened with a maximal
      // uphill rep from cold — the athlete walks out the door and straight into it. Helgerud's own
      // protocol brackets the work with ~10 min either side, and it is the difference between a 21-min
      // session and the ~35-40 min this doctrine specifies (run-only companion §5).
      out.push({ id: uid(), kind: 'warmup', duration_s: 600, pace_sec_per_mi: easyPace, label: 'Warm-up' });
      for (let i = 0; i < reps; i++) {
        out.push({
          id: uid(),
          kind: 'work',
          duration_s: work_s,
          // ⛔ Deliberately no `pace_sec_per_mi`. See above. Do not "fix" this by adding one.
          // ⚠️ Nor on the treadmill: the belt speed that means "hard" at 6% is not the flat one.
          label: treadmill ? `Incline · ${gradeLabel}` : `Hill · ${gradeLabel}`,
        });
        if (i < reps - 1) {
          // ⛔ A JOGGED DESCENT IS THE ECCENTRIC LOAD IN THIS SESSION. Downhill running is the
          // standard laboratory model for inducing muscle damage; uphill is not. Walking it removes
          // essentially all of that at the cost of nothing the session is for — the stimulus is the
          // climb. So the descent is prescribed, never assumed.
          // ⚠️ A WALKED DESCENT CARRIES NO PACE. Pacing a walk is the same false precision the
          // uphill reps refuse; and if the athlete is walking, the recovery duration is the target.
          out.push({
            id: uid(),
            kind: 'recovery',
            duration_s: rest_s,
            ...(descentJogged ? { pace_sec_per_mi: easyPace } : {}),
            // ⚠️ THE TREADMILL HAS NO DESCENT AND THAT IS WHY IT NEVER WALKS. There is nothing to
            // run down, so the eccentric load the walk/jog rule exists to ration is simply absent
            // here — the recovery is the incline dropped to easy, and it is always jogged.
            label: treadmill
              ? 'Easy — incline down'
              : (descentJogged ? 'Jog down' : 'Walk down'),
          });
        }
      }
      out.push({ id: uid(), kind: 'cooldown', duration_s: 480, pace_sec_per_mi: easyPace, label: 'Cool-down' });
      return out;
    }
  }

  // Strides: strides_4x100m or strides_6x20s
  // Strides are fast accelerations done AFTER the main run (warm-up)
  // For "Easy + Strides" workouts, strides come at the END
  if (/strides_\d+x/.test(lower)) {
    const m = lower.match(/strides_(\d+)x(\d+)(m|s)/);
    if (m) {
      const reps = parseInt(m[1], 10);
      const val = parseInt(m[2], 10);
      const unit = m[3];
      const easyPace = secPerMiFromBaseline(baselines, 'easy') || undefined;
      
      /**
       * ⛔⛔ THE RECOVERY IS UNTIMED, AND THE NINETY SECONDS THAT STOOD HERE WERE OURS
       * (Michael, 2026-08-28): *"Rest as long as you want between them. The card says 3 minutes of
       * strides. The watch beeps six times."*
       *
       * ⛔ THE COMMENT THAT JUSTIFIED THE NUMBER WAS FALSE, AND THIS APP DISPROVES IT. It read *"a
       * watch step cannot be untimed, so somebody had to pick a number."* `send-workout-to-garmin`
       * has carried a `lap_button` step the whole time and maps it to Garmin's `OPEN` duration
       * type, whose own note reads *"a lap-button step has no duration to state — Garmin ends it
       * when the athlete presses lap."* So the honest step existed and was not being used.
       *
       * ⛔ AND THE INVENTED NUMBER WAS EXPENSIVE. Six strides charged the session ELEVEN AND A HALF
       * MINUTES of walking the source never prescribes — the easy run read 35 minutes where the plan
       * said 27, and the athlete's weekly hours overshot their own ask because of it.
       *
       * ⚠️ p229's recovery for the all-out effort is `open` — full recovery, no stated duration — and
       * `source-rules.ts` has always said so. This is the materializer catching up to the library.
       */
      
      for (let i = 0; i < reps; i++) {
        if (unit === 'm') {
          // Distance-based: 100m strides
          out.push({ 
            id: uid(), 
            kind: 'work', 
            distance_m: val,
            // No pace target - strides are "fast but relaxed", not a specific pace
            label: 'Stride'
          });
        } else {
          // Time-based: 20s strides
          out.push({ 
            id: uid(), 
            kind: 'work', 
            duration_s: val,
            label: 'Stride'
          });
        }
        // ⛔ UNTIMED RECOVERY, NOT A NUMBER WE PICKED — see the note above. The watch ends it on the
        // lap press; the clock charges it nothing, which is what makes six strides cost 3 minutes.
        // ⚠️ STILL SKIPPED AFTER THE LAST ONE: the session ends there, it does not rest first.
        if (i < reps - 1) {
          out.push({
            id: uid(),
            kind: 'recovery',
            lap_button: true,
            pace_sec_per_mi: easyPace,
            label: 'Walk/Jog — as long as you need',
          });
        }
      }
      return out;
    }
  }
  
  return out;
}

/**
 * ⚠️ EXPORTED 2026-08-20 so `scripts/dump-plans.ts` can re-expand what the composer emitted and
 * assert the two agree. `expandRunToken` has been exported for the same reason since the
 * lap-button hill tests; the bike half was the one nothing could reach.
 */
export function expandBikeToken(tok: string, baselines: Baselines): any[] {
  const out: any[] = []; const lower = String(tok ?? '').toLowerCase(); const ftp = typeof baselines.ftp==='number'? baselines.ftp: undefined;
  console.log(`🔍 [BIKE DEBUG] Token: ${tok}, FTP: ${ftp}`);
  const pctRange = (lo:number, hi:number)=> {
    if (!ftp) return undefined;
    const result = { lower: Math.round(lo*ftp), upper: Math.round(hi*ftp) };
    console.log(`🔍 [BIKE DEBUG] pctRange(${lo}, ${hi}) = ${result.lower}-${result.upper}W`);
    return result;
  };
  
  // Warmup tokens with proper FTP-based power ranges
  if (/warmup_bike_quality_\d+min_fastpedal/.test(lower)) { 
    const sec = minutesTokenToSeconds(lower) ?? 900; 
    out.push({ id: uid(), kind:'warmup', duration_s: sec, power_range: pctRange(0.55, 0.70) }); 
    return out; 
  }
  if (/warmup_.*_\d+min/.test(lower)) { 
    const sec = minutesTokenToSeconds(lower) ?? 900; 
    out.push({ id: uid(), kind:'warmup', duration_s: sec, power_range: pctRange(0.50, 0.65) }); 
    return out; 
  }
  
  // Cooldown tokens with proper FTP-based power ranges
  if (/cooldown.*\d+min/.test(lower)) { 
    const sec = minutesTokenToSeconds(lower) ?? 600; 
    out.push({ id: uid(), kind:'cooldown', duration_s: sec, power_range: pctRange(0.40, 0.55) }); 
    return out; 
  }
  // Recovery zone tokens: bike_recovery_5min_Z1
  if (/bike_recovery_\d+min/.test(lower)) {
    const sec = minutesTokenToSeconds(lower) ?? 300;
    out.push({ id: uid(), kind:'recovery', duration_s: sec, power_range: pctRange(0.40, 0.55), label: 'Recovery' });
    return out;
  }
  // FTP Test: bike_ftp_test_20min - maximal sustainable effort (no upper cap!)
  if (/bike_ftp_test_\d+min/.test(lower)) {
    const sec = minutesTokenToSeconds(lower) ?? 1200;
    // No power_range - this is a maximal test, not a zone workout
    out.push({ id: uid(), kind:'work', duration_s: sec, label: 'FTP Test - Maximal Effort', notes: 'All-out sustainable effort' });
    return out;
  }
  /**
   * ⛔⛔ THE REST BETWEEN BLOCKS IS HIS; THE ONE AFTER THE LAST BLOCK WAS OURS
   * (Michael, 2026-08-28): *"Five minutes easy spin between blocks is printed right there in his
   * cycling pages. What's ours is the third one — the app adds a rest after the last block, and he
   * never wrote one."*
   *
   * ⛔ WHAT IT COST, MEASURED ON HIS OWN BLOCK. `bike_ss_3x18min_R5min` expanded to seven steps —
   * three work and THREE recoveries — so a 13-minute warm-up plus three 18-minute blocks read as 82
   * minutes where the session is 77. Every hard ride in every plan this app has ever materialised
   * carried one rest it does not prescribe, and the athlete's weekly hours overshot by that much.
   *
   * ⚠️ THE INTERVAL COUNT AND THE REST LENGTH ARE UNTOUCHED — they are his, off p238-239. Only the
   * trailing one goes: you do not rest after the final block, you stop.
   * ⚠️ `reps - 1`, NOT a trailing pop, so a single-block session emits no recovery at all rather
   * than emitting one and removing it.
   */
  /**
   * ⛔⛔ THE COMPOUND ROUND ON THE BIKE — same shape, same grammar as the run branch.
   * ⛔ p237 anaerobic: *"5 rounds of: 30s @ 120% / 2:30 @ 90% / 30s @ 120% / 4-min easy spin."*
   * `bike_vo2_Nx{min}min_R{min}min` could only carry ONE intensity, so the 90% middle vanished.
   * ⚠️ PERCENT OF FTP, and power MULTIPLIES where run pace divides — opposite arithmetic, same word.
   * ⚠️ AN UNTARGETED SEGMENT CARRIES NO POWER, which is p237's own *"easy spin"* and its stated
   * preference for a power FLOOR over a target.
   */
  {
    const mRound = lower.match(/^round_(\d+)x_((?:r?\d+s(?:\d+|vt1|easy|racepace))(?:-r?\d+s(?:\d+|vt1|easy|racepace))*)(?:_r(\d+)s)?$/);
    if (mRound) {
      const rounds = parseInt(mRound[1], 10);
      const segs = mRound[2].split('-');
      const rest_s = mRound[3] ? parseInt(mRound[3], 10) : 0;
      for (let r = 0; r < rounds; r += 1) {
        for (const seg of segs) {
          const m2 = seg.match(/^(r?)(\d+)s(\d+|vt1|easy|racepace)$/);
          if (!m2) continue;
          const isRec = m2[1] === 'r';
          const secs = parseInt(m2[2], 10);
          const at = m2[3];
          if (at === 'racepace') out.push({ id: uid(), kind: 'work', duration_s: secs });
          else if (at === 'vt1' || at === 'easy') out.push({ id: uid(), kind: 'recovery', duration_s: secs });
          else if (isRec) {
            const pct = parseInt(at, 10) / 100;
            out.push({ id: uid(), kind: 'recovery', duration_s: secs, power_range: pctRange(pct, pct) });
          } else {
            const pct = parseInt(at, 10) / 100;
            out.push({ id: uid(), kind: 'work', duration_s: secs, power_range: pctRange(pct, pct) });
          }
        }
        if (rest_s > 0 && r < rounds - 1) out.push({ id: uid(), kind: 'recovery', duration_s: rest_s });
      }
      return out;
    }
  }
  // SS: bike_ss_3x12min_R4min
  let m = lower.match(/bike_ss_(\d+)x(\d+)min_r(\d+)min/);
  if (m) {
    const reps=parseInt(m[1],10), work=parseInt(m[2],10)*60, rest=parseInt(m[3],10)*60;
    for(let i=0;i<reps;i++){
      out.push({ id: uid(), kind:'work', duration_s: work, power_range: pctRange(0.85,0.95) });
      if(rest && i < reps - 1) out.push({ id: uid(), kind:'recovery', duration_s: rest });
    }
    return out;
  }
  // Threshold: bike_thr_4x8min_R5min
  m = lower.match(/bike_thr_(\d+)x(\d+)min_r(\d+)min/);
  if (m) { const reps=parseInt(m[1],10), work=parseInt(m[2],10)*60, rest=parseInt(m[3],10)*60; for(let i=0;i<reps;i++){ out.push({ id: uid(), kind:'work', duration_s: work, power_range: pctRange(0.95,1.05) }); if(rest && i < reps - 1) out.push({ id: uid(), kind:'recovery', duration_s: rest }); } return out; }
  // VO2: bike_vo2_5x4min_R4min
  m = lower.match(/bike_vo2_(\d+)x(\d+)min_r(\d+)min/);
  if (m) { const reps=parseInt(m[1],10), work=parseInt(m[2],10)*60, rest=parseInt(m[3],10)*60; for(let i=0;i<reps;i++){ out.push({ id: uid(), kind:'work', duration_s: work, power_range: pctRange(1.1,1.2) }); if(rest && i < reps - 1) out.push({ id: uid(), kind:'recovery', duration_s: rest }); } return out; }
  // Endurance z2 time: bike_endurance_90min_Z2
  m = lower.match(/bike_endurance_(\d+)min/);
  if (m) { const sec=parseInt(m[1],10)*60; out.push({ id: uid(), kind:'work', duration_s: sec, power_range: pctRange(0.65,0.75) }); return out; }
  // Tempo steady time: bike_tempo_Xmin (map to race power ~80-85% FTP)
  m = lower.match(/bike_tempo_(\d+)min/);
  if (m) { const sec=parseInt(m[1],10)*60; out.push({ id: uid(), kind:'work', duration_s: sec, power_range: pctRange(0.80,0.85) }); return out; }
  // Race prep short efforts: bike_race_prep_4x90s
  m = lower.match(/bike_race_prep_(\d+)x(\d+)s/);
  if (m) { const reps=parseInt(m[1],10), work=parseInt(m[2],10); for(let i=0;i<reps;i++){ out.push({ id: uid(), kind:'work', duration_s: work }); out.push({ id: uid(), kind:'recovery', duration_s: work }); } return out; }
  // Openers quick: bike_openers
  if (/bike_openers/.test(lower)) { out.push({ id: uid(), kind:'work', duration_s: 8*60 }); return out; }
  return out;
}

/**
 * Session gear hints from planner tags only (`req:*`, `optional:*`, `recommended:*`).
 * Never mirrors athlete baseline inventory — that caused bogus full gear lists on
 * CSS/threshold/easy swims.
 *
 * **Upstream emission contract (SWIM-PROTOCOL §8.4 + §6.6):** the inventory + per-tier
 * filtering happens at session-factory tag-emission time (`swimSessionOptionalGear` +
 * `swimSessionRecommendedGear` helpers). When an `optional:<gear>` or
 * `recommended:<gear>` tag appears on a row, the session-factory has already verified
 * the athlete owns that gear AND that §8.4/§6.6 prescribes it for that session-type
 * × tier. So this function safely surfaces the tag as-is without re-checking
 * inventory.
 *
 * §6.6 (2026-05-22): `recommended:*` carries stronger surface semantics in the
 * description prose ("this helps, grab it" vs optional's "fine either way"), but
 * on the chip surface — which is space-constrained and binary — recommended gear
 * is bundled into `suggestedOptional`. The athlete sees the recommendation in the
 * Pool gear line of the description; the chip just shows "Fins" as a gear hint.
 */
function inferSwimEquipmentPack(row: any): {
  suggestedRequired: string[];
  suggestedOptional: string[];
} {
  const required: string[] = [];
  const optional: string[] = [];
  const addR = (s: string) => {
    if (!required.includes(s)) required.push(s);
  };
  const addO = (s: string) => {
    const lr = s.toLowerCase();
    if (required.some((x) => x.toLowerCase() === lr)) return;
    if (!optional.includes(s)) optional.push(s);
  };
  try {
    const tags: string[] = Array.isArray((row as any)?.tags)
      ? (row as any).tags.map((t: any) => String(t).toLowerCase())
      : [];

    for (const t of tags) {
      if (t === 'optional:paddles') {
        addO('paddles');
        continue;
      }
      if (t === 'optional:snorkel') {
        addO('snorkel');
        continue;
      }
      if (t === 'optional:fins') {
        addO('fins');
        continue;
      }
      if (t === 'optional:buoy') {
        // §8.4 — CSS Aerobic / Technique Aerobic non-beginner buoy hint. Upstream
        // session-factory emits this only when athlete owns a pull buoy AND tier !== beginner.
        addO('buoy');
        continue;
      }
      // §6.6 (2026-05-22) — recommended gear merges into suggestedOptional on the
      // chip surface (the prose carries the recommended/optional distinction).
      if (t === 'recommended:fins') {
        addO('fins');
        continue;
      }
      if (t === 'recommended:snorkel') {
        addO('snorkel');
        continue;
      }
      if (t === 'recommended:buoy') {
        addO('buoy');
        continue;
      }
      if (t === 'recommended:paddles') {
        // §6.6 does NOT currently recommend paddles for any drill (paddles bypass
        // catch feedback). Surfacing path kept for defensive parsing only.
        addO('paddles');
        continue;
      }
      if (/req:board|req:kickboard/.test(t)) addR('board');
      if (/req:fins/.test(t)) addR('fins');
      if (/req:buoy/.test(t)) addR('buoy');
      if (/req:snorkel/.test(t)) addR('snorkel');
      if (/req:paddles/.test(t)) addR('paddles');
    }

    return { suggestedRequired: required, suggestedOptional: optional };
  } catch {
    return { suggestedRequired: [], suggestedOptional: [] };
  }
}

export function expandTokensForRow(
  row: any,
  baselines: Baselines,
  adjustments: PlanAdjustment[] = [],
  strengthIntent: StrengthIntentMat = null,
  planWeekNumber: number | null = null,
  // Step 0 (adapt-plan foundation): the protocol + this row's phase, so a strength row that carries no
  // explicit target RIR still materializes with the correct lift- and phase-aware target — the SAME
  // number getTargetRir hands the analyzer. Lets an EXISTING plan pick up the target on re-materialize
  // (no full regen). Null/absent → getTargetRir falls back to the durability base, still lift-aware.
  strengthProtocolId: string | null = null,
  rowPhase: string | null = null,
  addsToInject: PlannedAdd[] = [],
  // ⛔ THE ATHLETE'S OWN LAST WEIGHT PER MOVEMENT — PASSED IN, NOT REACHED FOR (2026-08-30).
  // This map is loaded inside the request handler; this function lives at module top level, so
  // reading it as a free identifier threw a ReferenceError on the FIRST exercise of every strength
  // row, which the catch below swallowed into a single generic 'strength block'. Threaded
  // explicitly, mirroring the way calculatePlannedStrengthWorkload already receives it.
  // Default {} → no history, the ratio-derived suggestion stands, exactly as before 6f1996d3.
  lastWeightByMovement: Record<string, number> = {},
): { steps: any[]; total_s: number; swim_equipment_suggested?: string[]; swim_equipment_optional_suggested?: string[] } {
  const tokens: string[] = Array.isArray(row?.steps_preset) ? row.steps_preset : [];
  // Strength-PRIMARY rows (Get Strong arc) periodize their own peak + 1RM retest: lift the 0.85 clamp
  // to 1.05 so 97% singles / 100–102.5% test render at face value, and skip the auto working-load
  // progression (the composer already owns the ramp). Concurrent strength is untouched.
  const isStrengthPrimary = Array.isArray((row as any)?.tags)
    && (row as any).tags.some((t: any) => String(t).toLowerCase() === 'protocol:strength_primary');
  const strengthMaxPct = isStrengthPrimary ? 1.05 : 0.85;
  const discipline = String(row?.type||'').toLowerCase();
  const workoutDate = row?.date || new Date().toISOString().split('T')[0];
  const steps: any[] = [];
  const swimEquipPack =
    discipline === 'swim'
      ? inferSwimEquipmentPack(row)
      : { suggestedRequired: [] as string[], suggestedOptional: [] as string[] };

  // Early path: Strength without tokens → expand from strength_exercises so computed is written
  if (discipline === 'strength' && tokens.length === 0) {
    try {
      const rawStrength: any = (row as any)?.strength_exercises;
      const exs: any[] = Array.isArray(rawStrength)
        ? rawStrength
        : (typeof rawStrength === 'string' ? (()=>{ try { return JSON.parse(rawStrength); } catch { return []; } })() : []);
      if (Array.isArray(exs) && exs.length > 0) {
        // Get user equipment for substitution
        const userEquipment: string[] = Array.isArray((baselines as any)?.equipment?.strength) ? (baselines as any).equipment.strength : [];
        // Adapt-a-plan add: inject the added lifts assigned to THIS row by planAddInjections (matching
        // focus + weekly-frequency cap decided across the whole plan). Idempotent — adds live in
        // plan_adjustments, never persisted into strength_exercises, so re-materialize re-injects fresh.
        // They flow through the loop below, so weight seeds from their own reference.
        for (const _add of addsToInject) exs.push(_add);
        
        for (const ex of exs) {
          const originalName = String(ex?.name||'exercise');
          let reps = (typeof ex?.reps==='number'? ex.reps : (typeof ex?.reps==='string'? ex.reps : undefined)); // Q-180: `let` — a substitution may rewrite the rep UNIT below
          const sets = (typeof ex?.sets==='number'? ex.sets : undefined);
          
          // Get percentage for band resistance guidance (from percent_1rm field OR weight string)
          let percentRaw = (typeof ex?.percent_1rm === 'number' ? ex.percent_1rm : (typeof ex?.load?.percent_1rm === 'number' ? ex.load.percent_1rm : undefined));
          if (!percentRaw) {
            // Try to extract from weight string (e.g., "30% 1RM")
            percentRaw = extractPercentageFromWeight((ex as any)?.weight);
          }
          
          // Apply equipment substitution with percentage for intelligent band guidance
          const substituted = substituteExerciseForEquipment(originalName, userEquipment, percentRaw);
          let name = substituted.name;
          const equipmentNotes = substituted.notes;
          // Adapt-a-plan permanent swap: an active athlete swap renames this slot to the substitute,
          // AFTER equipment sub and BEFORE weight resolution. isSlotSwapped forces the weight to
          // re-resolve from the NEW exercise's own reference below (no old weight carried across). With
          // no swap row, isSlotSwapped is false and everything below is byte-identical to before.
          const swapTarget = resolveSwap(name, adjustments, workoutDate);
          const isSlotSwapped = !!swapTarget && String(swapTarget).toLowerCase().trim() !== String(name).toLowerCase().trim();
          if (isSlotSwapped) name = swapTarget as string;
          // Q-180: a substitution can change the UNIT, not just the name. A 20 m sled push swapped for a
          // loaded walking lunge (or a sled pull swapped for a dumbbell row) is a REP exercise — it must
          // not inherit the sled's distance. Previously it did: a dumbbell row prescribed in metres.
          if (substituted.reps !== undefined) reps = substituted.reps;
          
          // Debug band exercises
          if (String(name ?? '').toLowerCase().includes('band') && originalName.toLowerCase().includes('face pull')) {
            console.log(`🎯 Face Pulls substitution:`, { originalName, weight: (ex as any)?.weight, extractedPercent: percentRaw, finalNotes: equipmentNotes });
          }
          
          // Use research-based exercise config for weight calculation
          const exerciseConfig = getExerciseConfig(name);
          // D-322: a BODYWEIGHT row must never carry a %1RM. The composers stamp the session's
          // percentage onto every lift in the session, including pull-ups — and "78.5% 1RM" on a
          // pull-up is not a small mislabel, it is a number three separate consumers have now
          // re-derived a bug from: the legacy fallback priced it as a barbell load, the RPE chart
          // turned it into RIR 0.5, and the display copy told the athlete to pick a weight. Killing
          // it HERE, before anything reads it, is what makes the class of bug can't-happen rather
          // than a fourth patch. The three-way modality assertion below stays as the guard.
          const isBodyweightModality = exerciseConfig?.displayFormat === 'bodyweight';
          if (isBodyweightModality) percentRaw = undefined;
          const isBandExercise = exerciseConfig?.displayFormat === 'band' || String(name).toLowerCase().includes('band');
          
          let prescribed: number | undefined = undefined;
          let percent_1rm: number | undefined = undefined;
          let resolved_from: string | undefined = undefined;
          let weightDisplay: string | undefined = undefined;
          let baselineMissing = false;
          let requiredBaseline: string | undefined = undefined;
          
          // Pre-resolved numeric weight (dispatcher computed absolute lb at plan-gen time using
          // the dispatcher's view of the athlete's 1RM). Used by the rebuild scaler to close the
          // description-vs-delivered contract: both come from the same emit-time computation, so
          // they can't drift even if `user_baselines.performance_numbers` changes between plan
          // generation and materialization. See
          // `shared/strength-system/protocols/triathlon_performance.ts:scaleSessionToRebuildLoads`.
          //
          // Also accept pure-numeric strings ("115" without unit or %) so JSONB round-trips
          // that incidentally stringify the number don't drop the athlete into the default
          // 0.7 fallback path (= 105 lb vs the dispatcher's intended 115 lb safety bug).
          const preResolvedRaw = (ex as any)?.weight;
          const preResolvedNum =
            typeof preResolvedRaw === 'number' && Number.isFinite(preResolvedRaw) && preResolvedRaw > 0
              ? preResolvedRaw
              : (typeof preResolvedRaw === 'string' && /^\s*\d+(?:\.\d+)?\s*$/.test(preResolvedRaw)
                  ? parseFloat(preResolvedRaw)
                  : null);
          const isPreResolvedNumeric = preResolvedNum != null && preResolvedNum > 0;

          // ⛔ THE COMPOSER CAN SAY "THIS ROW CARRIES NO PRESCRIBED LOAD", AND UNTIL NOW NOTHING LISTENED.
          //
          // `load_prescribed: false` is set on every assistance row the Get Stronger composer authors
          // (D-324). It appeared in exactly TWO files — the composer that sets it and the composer's
          // test — and no consumer had ever read it. So this branch chain priced them anyway, off
          // `exerciseConfig.ratio`, and the athlete was handed `Dips: 1×25 @ 95 lb` and
          // `Single Leg Hip Thrust: 1×25 @ 95 lb` (0.90 × deadlift × ~70%; identical numbers only
          // because that athlete's bench and deadlift both happened to be 150).
          //
          // `assistance-menu.ts` is explicit about why this must not happen, and names the trap: the
          // ratios for these movements are KNOWN-WRONG (Single Leg Hip Thrust carries the TWO-LEGGED
          // 0.9× deadlift ratio; Dumbbell Overhead Press resolves to the barbell entry) — harmless
          // ONLY because nothing on that menu is ever supposed to be priced.
          // ⛔ Its own words: "Do not 'fix' this by deriving a weight — the absence is the design."
          //
          // Assistance is auto-regulated on purpose: the app states the MOVEMENT and a REP TOTAL, and
          // the athlete picks a load that feels about 7/10. A derived number replaces that judgement
          // with a wrong one, and 25 reps at a fabricated load turns an assistance slot into the
          // session's hardest work.
          if ((ex as any)?.load_prescribed === false) {
            weightDisplay = undefined;
            prescribed = undefined;
            percent_1rm = undefined;
            resolved_from = undefined;
            // ⚠️ NOT a missing baseline. There is nothing to look up and nothing for the athlete to
            // enter — flagging it would invite the resolver to ask for a number that must not exist.
            baselineMissing = false;
            requiredBaseline = undefined;
          // If the prescription is qualitative (e.g., "Light"), preserve it as display text.
          } else if (!isSlotSwapped && isQualitativeStrengthWeight((ex as any)?.weight)) {
            weightDisplay = qualitativeWeightDisplay((ex as any)?.weight);
            baselineMissing = false;
            requiredBaseline = undefined;
            percent_1rm = undefined;
            resolved_from = undefined;
          } else if (!isSlotSwapped && isPreResolvedNumeric) {
            // Pass-through: dispatcher already resolved this against its 1RM snapshot.
            const isMetricA = !!(baselines as any).isMetric;
            const wUnitA = isMetricA ? 'kg' : 'lb';
            prescribed = preResolvedNum as number;
            if (exerciseConfig?.displayFormat === 'perHand') {
              weightDisplay = `${prescribed} ${wUnitA} each`;
            } else {
              weightDisplay = `${prescribed} ${wUnitA}`;
            }
            percent_1rm = typeof (ex as any)?.percent_1rm === 'number'
              ? ((ex as any).percent_1rm as number)
              : (typeof percentRaw === 'number' ? percentRaw : undefined);
            resolved_from = exerciseConfig?.primaryRef ?? 'pre_resolved';
          } else if (!isBandExercise && exerciseConfig) {
            // Use new research-based config for percentage-based weights
            const targetPercent = resolveStrengthPercentForLift(
              name,
              typeof percentRaw === 'number' ? percentRaw : undefined,
              strengthIntent,
              strengthMaxPct,
            );
            // D-322: a SWAPPED slot derives through the SHARED resolver — the same function the
            // logger's swap sheet calls, at the same authored `targetPercent` this row carries.
            // That is what makes "just today" and "rest of plan" agree by construction instead of
            // by coincidence. An unswapped slot takes the derivation directly, exactly as before.
            // (Both expressions are the same arithmetic today; the shared call is the guarantee
            // they STAY the same when one side is edited.)
            const result = isSlotSwapped
              ? resolveSwapSeedWeight(name, targetPercent, baselines as any, reps, !isStrengthPrimary)
              : calculateWeightFromConfig(name, targetPercent, baselines as any, reps, !isStrengthPrimary);
            if (result.weight != null && result.weight > 0) {
              prescribed = result.weight;
              weightDisplay = formatWeightDisplay(result.weight, result.displayFormat);
            } else if (exerciseConfig.primaryRef) {
              // Weight couldn't be calculated - baseline is missing
              baselineMissing = true;
              requiredBaseline = exerciseConfig.primaryRef;
            }
            percent_1rm = targetPercent;
            resolved_from = exerciseConfig.primaryRef || undefined;
          } else if (!isBandExercise) {
            // Fallback to legacy calculation for unknown exercises
            const pick = pickPrimary1RMAndBase(name, baselines as any);
            const base1RM = pick.base;
            const ratio = pick.ratio;
            const inferred1RM = (base1RM != null && ratio != null) ? base1RM * ratio : base1RM;
            const isMetric = !!(baselines as any).isMetric;
            const wUnit = isMetric ? 'kg' : 'lb';
            const parsed = parseWeightInput((ex as any)?.weight, inferred1RM);
            let resolvedPctLegacy0: number | undefined = undefined;
            if (parsed.weight != null) prescribed = parsed.weight;
            else if (inferred1RM != null) {
              resolvedPctLegacy0 = resolveStrengthPercentForLift(
                name,
                typeof percentRaw === 'number' ? percentRaw : undefined,
                strengthIntent,
                strengthMaxPct,
              );
              const scaled = inferred1RM * resolvedPctLegacy0 * repScaleFor(reps);
              prescribed = roundToIncrement(scaled, isMetric);
            }
            if (prescribed != null && isDumbbellExercise(name)) {
              prescribed = roundToIncrement(prescribed / 2, isMetric);
              weightDisplay = `${prescribed} ${wUnit} each`;
            } else if (prescribed != null) {
              weightDisplay = `${prescribed} ${wUnit}`;
            }
            // Check if baseline is missing for non-bodyweight exercises
            if (prescribed == null && pick.ref != null) {
              baselineMissing = true;
              requiredBaseline = pick.ref;
            }
            percent_1rm = resolvedPctLegacy0 ?? (typeof percentRaw==='number' ? percentRaw : (parsed.percent_1rm != null ? parsed.percent_1rm : undefined));
            resolved_from = pick.ref || undefined;
          }
          
          // Map baseline key to human-readable name
          const baselineLabel = requiredBaseline === 'squat' ? 'Squat' 
            : requiredBaseline === 'deadlift' ? 'Deadlift'
            : requiredBaseline === 'bench' ? 'Bench Press'
            : requiredBaseline === 'overhead' ? 'Overhead Press'
            : requiredBaseline;
          
          // Extract target RIR from the exercise (if present from overlay)
          // ⛔ THE RIR STAMP SEAM. A protocol that does not auto-regulate gets NO target — see
          // `protocolUsesRir`. Today that is Strength Focus (the previous program) and nothing else: the working
          // number and the reps are fixed at plan creation, so a reserve target is a second
          // instruction that can contradict the prescription. Every other protocol is unchanged.
          const strengthProfile = resolveProfile(strengthProtocolId);
          /**
           * ⛔⛔ AND p218 GIVES **ME** NO RESERVE TARGET, IN AS MANY WORDS (2026-08-28).
           *
           * ⚠️ THE DEFECT, FROM MICHAEL'S SCREEN: the ME pull-up card's cue read *"1-5 reps, stopped
           * short of failure"* — correct — and the row directly under it read **"target 1-5 · 2 in
           * reserve"**. The composer stamps nothing on an ME row precisely because the source states
           * no target (`compose.ts` `targetRirForIntent` returns null for ME), and this seam then
           * DERIVED one off the RPE chart, because `protocolUsesRir` is protocol-wide rather than
           * per-slot. The plan contradicted itself on one card.
           *
           * ⛔ THE GATE IS PER-SLOT AND THE ROW ALREADY CARRIES IT. `slot_intent` is stamped by the
           * standing-plan composer and is read eighty lines below this one; nothing new is plumbed.
           * ⚠️ ABSENT, NEVER ZERO. p219 defines 0 RIR as a real and specific instruction — the last
           * rep still completes, very slowly — so a zero here would say something he did not say.
           * ⚠️ `compose.ts:684-687` RECORDED THIS AS A GAP for "the slice that touches the RIR seam".
           * This is that slice; that comment is now history.
           */
          const tracksRir = stampsTargetRir(protocolUsesRir(strengthProfile), (ex as any)?.slot_intent);
          const target_rir = !tracksRir ? undefined : getTargetRir(
            strengthProfile,
            String(name ?? ''),
            typeof ex?.target_rir === 'number' ? ex.target_rir : null,
            rowPhase,
            typeof reps === 'number' ? reps : (Number.parseInt(String(reps ?? ''), 10) || null),
            typeof percent_1rm === 'number' ? percent_1rm : null,
            // D-322: bodyweight lifts resolve RIR from reps vs the tested max, never a percentage.
            isBodyweightModality && typeof (baselines as any)?.pullupMaxReps === 'number'
              && /pull\s*up|chin\s*up/i.test(String(name ?? ''))
              ? (baselines as any).pullupMaxReps
              : null
          );
          
          const progressed = isStrengthPrimary ? prescribed : adjustPerformanceWorkingLoadLb(prescribed, name, strengthIntent, planWeekNumber);
          // Apply plan adjustments if any
          const adjustResult = applyAdjustment(name, progressed, adjustments, workoutDate);
          const finalWeight = adjustResult.weight;
          const wasAdjusted = adjustResult.adjusted;
          const originalWeight = wasAdjusted ? progressed : undefined; // Store original for UI display
          
          let finalWeightDisplay = weightDisplay;
          if (finalWeight != null) {
            const config = getExerciseConfig(name);
            finalWeightDisplay = formatWeightDisplay(finalWeight, config?.displayFormat || 'total');
          }
          // D-071: prevent raw "% 1RM" strings from leaking to athlete UI when
          // the resolution chain bailed (no 1RM baseline). Override with an
          // RIR-anchored cue instead. Numeric weights computed above are
          // preserved — this only fires when display would otherwise be empty.
          if (finalWeightDisplay == null) {
            // D-322: never on a bodyweight row. This fallback reads the RAW authored string, so
            // stripping the derived percent above is not enough — a stored "72% 1RM" on a pull-up
            // still reaches it and produces "Pick a weight you can do for 5 reps…" for a lift with
            // no bar. This is the third consumer to re-derive a bug from that one value.
            finalWeightDisplay = isBodyweightModality
              ? 'Bodyweight'
              : fallbackUnresolvedPercentDisplay((ex as any)?.weight, reps);
          }

          // D-322 modality guard. Three-way, and only the third case fires here:
          //   bodyweight/band with no weight        -> allow (39 such rows in prod, all correct)
          //   loaded lift with no resolvable 1RM    -> caught upstream at plan creation
          //   BODYWEIGHT LIFT CARRYING A WEIGHT     -> strip it, loudly
          // The third was live: "Pull Up" missed the hyphenated `pull-up` key, fell to the legacy
          // barbell fallback, and rendered "110 lb" off the athlete's BENCH. The lookup fold fixes
          // the cause; this is the backstop, because a bodyweight lift showing a plate number is
          // the kind of wrong an athlete acts on. Corrects rather than throws — materialize also
          // runs over EXISTING plans, and a throw would brick re-materialize on legacy rows.
          const modalityCfg = getExerciseConfig(String(name ?? ''));
          if (modalityCfg?.displayFormat === 'bodyweight' || modalityCfg?.displayFormat === 'band') {
            // Clear the intensity fields on EVERY bodyweight row, not only ones that arrived
            // carrying a load. Stripping the authored percentage upstream left a hole that
            // `resolveStrengthPercentForLift` filled with its own 0.70 default, so the row still
            // shipped `percent_1rm: 0.7` — a fabricated intensity for a lift that has none, and
            // exactly the value the next consumer would have re-derived a bug from.
            percent_1rm = undefined;
            resolved_from = undefined;
            if (typeof finalWeight === 'number' && finalWeight > 0) {
              console.error(`⛔ [materialize] ${name}: bodyweight/band lift carried ${finalWeight} lb — stripped.`);
              finalWeight = undefined as any;
              finalWeightDisplay = modalityCfg.displayFormat === 'band' ? 'Band' : 'Bodyweight';
            }
          }
          const strength = { name, sets, reps, weight: finalWeight, weight_display: finalWeightDisplay, percent_1rm, resolved_from, notes: equipmentNotes, baseline_missing: baselineMissing, required_baseline: baselineLabel, target_rir, adjusted: wasAdjusted, original_weight: originalWeight, set_plan: carrySetPlan(ex, finalWeight), rir_tracked: tracksRir,
            /**
             * ⛔ THE EXECUTION LABEL, CARRIED — DISPLAY ONLY (2026-08-31). The composer sets
             * `execution_name` when the athlete's kit reaches a movement on its FREE-WEIGHT route and
             * the canonical name says machine (`rear delt machine` at a home gym). This object is a
             * WHITELIST, so without this line the fact dies here and every surface prints the station
             * again. ⚠️ `name` is untouched and stays canonical — it is what logged-vs-planned
             * matching keys on, and moving it would unmatch every set logged against the old spelling.
             */
            /**
             * ⚠️ AND ONLY WHILE THE ROW IS STILL THE MOVEMENT THE COMPOSER LABELLED. An equipment
             * substitution or an athlete swap rewrites `name` a few lines above; the label describes
             * the ORIGINAL movement's execution and would be a lie on the replacement. Dropped rather
             * than re-derived — this seam does not own the naming rule.
             */
            execution_name: (String(name).toLowerCase().trim() === String(originalName).toLowerCase().trim()
              ? ((ex as any)?.execution_name ?? undefined)
              : undefined),
            /**
             * ⛔ HOW THE WEIGHT WAS ARRIVED AT, OR WHY THERE ISN'T ONE — carried (2026-09-01). This
             * object is a WHITELIST and `load_basis` was never on it, so the composer's marker died
             * here and every surface downstream saw a bare "By feel" with no way to tell an
             * auto-regulated row from one still waiting on a test. That ambiguity is the most-reported
             * false alarm in this project.
             * ⚠️ Dropped alongside `execution_name` when a substitution or swap rewrote the row: the
             * basis describes how the ORIGINAL movement was priced.
             */
            load_basis: (String(name).toLowerCase().trim() === String(originalName).toLowerCase().trim()
              ? ((ex as any)?.load_basis ?? undefined)
              : undefined),
            // ⛔ CARRY THE ASSISTANCE MARKER (2026-07-30). This object is a WHITELIST, and
            // `load_prescribed: false` — set on every assistance row the composer authors — was not on
            // it. The flag reached materialize (it is read twenty lines above, to stop a weight being
            // derived) and then died here, so nothing downstream could tell an assistance slot from a
            // main lift. The Swap sheet offered the whole exercise library where the block had already
            // defined a three-option shortlist.
            // ⚠️ Only ever `false` or absent — never `true`. Absent means "not stated", and a reader
            // that treats absent as assistance would turn every main lift into one.
            ...(((ex as any)?.load_prescribed === false) ? { load_prescribed: false } : {}),
            // ⛔ AND CARRY THE SLOT INTENT (2026-08-26) — the same whitelist, the fourth time. The
            // composer stopped writing its slot notation into `notes` (jargon in the athlete-notes
            // box); the intent now travels as `slot_intent` and the logger's ME/DE cues read it.
            // Unlisted it dies here, and every standing cue falls back to the legacy notes regex.
            ...((['ME','DE','SKILL','HYP'].includes(String((ex as any)?.slot_intent))) ? { slot_intent: (ex as any).slot_intent } : {}),
            // ⛔ AND CARRY LAST TIME'S RESULT (2026-08-26) — the same whitelist, the fifth time. The
            // heavy slot prints a rep BAND and nothing else, so a block that is progressing correctly
            // looks frozen for eight weeks; `last_reps` is what the athlete actually got, and both the
            // plan row and the logger read it. Unlisted it dies here and the row goes back to silence.
            // ⚠️ Guarded on a non-empty array of finite numbers: an empty one means "no last time at
            // this weight" and must stay ABSENT rather than render as a result of nothing.
            ...(Array.isArray((ex as any)?.last_reps)
              && (ex as any).last_reps.length > 0
              && (ex as any).last_reps.every((n: unknown) => Number.isFinite(Number(n)))
              ? { last_reps: (ex as any).last_reps.map((n: unknown) => Number(n)) } : {}),
            // ⛔ AND CARRY THE SUGGESTION (2026-08-09, D-406) — SAME WHITELIST, SAME TRAP. This is the
            // second field the composer authors for assistance rows, and it dies here exactly as
            // `load_prescribed` did for four days unless it is listed. It is NOT a prescribed load:
            // `weight_suggested` is a starting point for the logger's entry box, and the block above
            // still clears `weightDisplay`/`prescribed`/`percent_1rm` for these rows. The two coexist
            // on purpose — the plan names no weight, and the athlete is handed somewhere to start.
            // ⚠️ GUARDED ON A FINITE POSITIVE. Absent means "no suggestion"; a zero would render as a
            // prescribed nothing, which is the shape of the bug this field exists to avoid.
            // ⛔⛔ AND THE ATHLETE'S OWN LAST WEIGHT BEATS THE RATIO (2026-08-29, Michael: *"no
            // history user adds whatever they went to failure or 1 RIR — get carried onto the next
            // round"*). The composer's suggestion is derived from the parent lift's max times a
            // catalogue ratio — a reasonable guess for a movement never performed, and strictly
            // worse than the number the athlete actually used last time. Fitbod, the closest app
            // that both writes the program and fills the box, works the same way round: your own
            // history first, a population estimate only when you have none.
            // ⚠️ STILL A SUGGESTION, NOT A PRESCRIPTION. The row's weight stays unset — Viada
            // auto-regulates this work and the athlete picks the load.
            ...(() => {
              const own = lastWeightByMovement[canonicalizeName(String((ex as any)?.name ?? ''))];
              if (Number.isFinite(own) && own > 0) return { weight_suggested: own };
              return Number.isFinite((ex as any)?.weight_suggested) && (ex as any).weight_suggested > 0
                ? { weight_suggested: (ex as any).weight_suggested } : {};
            })(),
            // ⛔ AND CARRY THE SUPPLEMENTAL MARKER (2026-08-15, §1e) — THE SAME WHITELIST, THE THIRD
            // TIME. An FSL row shares its main lift's NAME on purpose, so this flag is the only thing
            // that tells the logger it is a second block of the same movement rather than a duplicate
            // row. Unlisted, the athlete would see "Bench Press" twice with nothing to distinguish
            // them, which reads as a bug in the plan.
            ...(((ex as any)?.supplemental === true) ? { supplemental: true } : {}),
          } as any;
          // ⛔ THE AUTHORED LABEL SURVIVES WHEN NOTHING WAS SUBSTITUTED. `notes` above is
          // `equipmentNotes` — the substitution sentence — and it is `undefined` on every row nothing
          // was swapped on. That would silently erase the composer's own "First Set Last" label, so
          // the authored note fills the gap rather than competing with it.
          // ⚠️ EQUIPMENT NOTES WIN when both exist: a substitution is a change to what the athlete is
          // doing, and the label is a description of what it already was.
          if (!(strength as any).notes && typeof (ex as any)?.notes === 'string' && String((ex as any).notes).trim()) {
            (strength as any).notes = String((ex as any).notes).trim();
          }
          if (String(name ?? '').toLowerCase().includes('band')) {
            console.log(`🎸 Band exercise created:`, { name, notes: equipmentNotes, hasNotes: !!equipmentNotes });
          }
          steps.push({ id: uid(), kind:'strength', strength });
        }
        return { steps, total_s: 0 };
      }
    } catch (err) {
      // ⛔ NEVER SILENT AGAIN (2026-08-30). A bare `catch {}` here turned a hard crash into a
      // plan full of empty 'strength block' rows for a full day. The fallback below still runs —
      // an athlete gets a row rather than nothing — but the reason is now in the logs.
      console.error('❌ expandTokensForRow: strength (no tokens) expansion threw, falling back to generic block:', err);
    }
    // No details present: still emit a generic block so computed exists
    steps.push({ id: uid(), kind:'strength', strength: { name: 'strength block' } });
    return { steps, total_s: 0 };
  }

  // Strength WITH tokens: expand authored strength_exercises ONCE (not per-token)
  // Tokens are used for UI copy; the load prescription comes from strength_exercises.
  // Avoid the per-token duplication by handling this branch before iterating tokens.
  if (discipline === 'strength' && tokens.length > 0) {
    try {
      const rawStrength: any = (row as any)?.strength_exercises;
      const exs: any[] = Array.isArray(rawStrength)
        ? rawStrength
        : (typeof rawStrength === 'string' ? (()=>{ try { return JSON.parse(rawStrength); } catch { return []; } })() : []);
      if (exs.length) {
        // Get user equipment for substitution
        const userEquipment: string[] = Array.isArray((baselines as any)?.equipment?.strength) ? (baselines as any).equipment.strength : [];
        // Adapt-a-plan add: inject the added lifts assigned to THIS row by planAddInjections (matching
        // focus + weekly-frequency cap decided across the whole plan). Idempotent — adds live in
        // plan_adjustments, never persisted into strength_exercises, so re-materialize re-injects fresh.
        // They flow through the loop below, so weight seeds from their own reference.
        for (const _add of addsToInject) exs.push(_add);
        
        for (const ex of exs) {
          const originalName = String(ex?.name||'exercise');
          let reps = (typeof ex?.reps==='number'? ex.reps : (typeof ex?.reps==='string'? ex.reps : undefined)); // Q-180: `let` — a substitution may rewrite the rep UNIT below
          const sets = (typeof ex?.sets==='number'? ex.sets : undefined);
          
          // Get percentage for band resistance guidance (from percent_1rm field OR weight string)
          let percentRaw = (typeof ex?.percent_1rm === 'number' ? ex.percent_1rm : (typeof ex?.load?.percent_1rm === 'number' ? ex.load.percent_1rm : undefined));
          if (!percentRaw) {
            // Try to extract from weight string (e.g., "30% 1RM")
            percentRaw = extractPercentageFromWeight((ex as any)?.weight);
          }
          
          // Apply equipment substitution with percentage for intelligent band guidance
          const substituted = substituteExerciseForEquipment(originalName, userEquipment, percentRaw);
          let name = substituted.name;
          const equipmentNotes = substituted.notes;
          // Adapt-a-plan permanent swap: an active athlete swap renames this slot to the substitute,
          // AFTER equipment sub and BEFORE weight resolution. isSlotSwapped forces the weight to
          // re-resolve from the NEW exercise's own reference below (no old weight carried across). With
          // no swap row, isSlotSwapped is false and everything below is byte-identical to before.
          const swapTarget = resolveSwap(name, adjustments, workoutDate);
          const isSlotSwapped = !!swapTarget && String(swapTarget).toLowerCase().trim() !== String(name).toLowerCase().trim();
          if (isSlotSwapped) name = swapTarget as string;
          // Q-180: a substitution can change the UNIT, not just the name. A 20 m sled push swapped for a
          // loaded walking lunge (or a sled pull swapped for a dumbbell row) is a REP exercise — it must
          // not inherit the sled's distance. Previously it did: a dumbbell row prescribed in metres.
          if (substituted.reps !== undefined) reps = substituted.reps;
          
          // Use research-based exercise config for weight calculation
          const exerciseConfig = getExerciseConfig(name);
          // D-322: a BODYWEIGHT row must never carry a %1RM. The composers stamp the session's
          // percentage onto every lift in the session, including pull-ups — and "78.5% 1RM" on a
          // pull-up is not a small mislabel, it is a number three separate consumers have now
          // re-derived a bug from: the legacy fallback priced it as a barbell load, the RPE chart
          // turned it into RIR 0.5, and the display copy told the athlete to pick a weight. Killing
          // it HERE, before anything reads it, is what makes the class of bug can't-happen rather
          // than a fourth patch. The three-way modality assertion below stays as the guard.
          const isBodyweightModality = exerciseConfig?.displayFormat === 'bodyweight';
          if (isBodyweightModality) percentRaw = undefined;
          const isBandExercise = exerciseConfig?.displayFormat === 'band' || String(name).toLowerCase().includes('band');
          
          let prescribed: number | undefined = undefined;
          let percent_1rm: number | undefined = undefined;
          let resolved_from: string | undefined = undefined;
          let weightDisplay: string | undefined = undefined;
          let baselineMissing = false;
          let requiredBaseline: string | undefined = undefined;
          
          // Pre-resolved numeric weight from the rebuild scaler (see first call site for the
          // contract). Mirror the same pass-through branch here so the regenerate path honors it.
          // Also accept pure-numeric strings — see the first site for the JSONB round-trip rationale.
          const preResolvedRaw2 = (ex as any)?.weight;
          const preResolvedNum2 =
            typeof preResolvedRaw2 === 'number' && Number.isFinite(preResolvedRaw2) && preResolvedRaw2 > 0
              ? preResolvedRaw2
              : (typeof preResolvedRaw2 === 'string' && /^\s*\d+(?:\.\d+)?\s*$/.test(preResolvedRaw2)
                  ? parseFloat(preResolvedRaw2)
                  : null);
          const isPreResolvedNumeric2 = preResolvedNum2 != null && preResolvedNum2 > 0;

          // ⛔ THE COMPOSER CAN SAY "THIS ROW CARRIES NO PRESCRIBED LOAD", AND UNTIL NOW NOTHING LISTENED.
          //
          // `load_prescribed: false` is set on every assistance row the Get Stronger composer authors
          // (D-324). It appeared in exactly TWO files — the composer that sets it and the composer's
          // test — and no consumer had ever read it. So this branch chain priced them anyway, off
          // `exerciseConfig.ratio`, and the athlete was handed `Dips: 1×25 @ 95 lb` and
          // `Single Leg Hip Thrust: 1×25 @ 95 lb` (0.90 × deadlift × ~70%; identical numbers only
          // because that athlete's bench and deadlift both happened to be 150).
          //
          // `assistance-menu.ts` is explicit about why this must not happen, and names the trap: the
          // ratios for these movements are KNOWN-WRONG (Single Leg Hip Thrust carries the TWO-LEGGED
          // 0.9× deadlift ratio; Dumbbell Overhead Press resolves to the barbell entry) — harmless
          // ONLY because nothing on that menu is ever supposed to be priced.
          // ⛔ Its own words: "Do not 'fix' this by deriving a weight — the absence is the design."
          //
          // Assistance is auto-regulated on purpose: the app states the MOVEMENT and a REP TOTAL, and
          // the athlete picks a load that feels about 7/10. A derived number replaces that judgement
          // with a wrong one, and 25 reps at a fabricated load turns an assistance slot into the
          // session's hardest work.
          if ((ex as any)?.load_prescribed === false) {
            weightDisplay = undefined;
            prescribed = undefined;
            percent_1rm = undefined;
            resolved_from = undefined;
            // ⚠️ NOT a missing baseline. There is nothing to look up and nothing for the athlete to
            // enter — flagging it would invite the resolver to ask for a number that must not exist.
            baselineMissing = false;
            requiredBaseline = undefined;
          // If the prescription is qualitative (e.g., "Light"), preserve it as display text.
          } else if (!isSlotSwapped && isQualitativeStrengthWeight((ex as any)?.weight)) {
            weightDisplay = qualitativeWeightDisplay((ex as any)?.weight);
            baselineMissing = false;
            requiredBaseline = undefined;
            percent_1rm = undefined;
            resolved_from = undefined;
          } else if (!isSlotSwapped && isPreResolvedNumeric2) {
            const isMetricB = !!(baselines as any).isMetric;
            const wUnitB = isMetricB ? 'kg' : 'lb';
            prescribed = preResolvedNum2 as number;
            if (exerciseConfig?.displayFormat === 'perHand') {
              weightDisplay = `${prescribed} ${wUnitB} each`;
            } else {
              weightDisplay = `${prescribed} ${wUnitB}`;
            }
            percent_1rm = typeof (ex as any)?.percent_1rm === 'number'
              ? ((ex as any).percent_1rm as number)
              : (typeof percentRaw === 'number' ? percentRaw : undefined);
            resolved_from = exerciseConfig?.primaryRef ?? 'pre_resolved';
          } else if (!isBandExercise && exerciseConfig) {
            // Use new research-based config for percentage-based weights
            const targetPercent = resolveStrengthPercentForLift(
              name,
              typeof percentRaw === 'number' ? percentRaw : undefined,
              strengthIntent,
              strengthMaxPct,
            );
            // D-322: a SWAPPED slot derives through the SHARED resolver — the same function the
            // logger's swap sheet calls, at the same authored `targetPercent` this row carries.
            // That is what makes "just today" and "rest of plan" agree by construction instead of
            // by coincidence. An unswapped slot takes the derivation directly, exactly as before.
            // (Both expressions are the same arithmetic today; the shared call is the guarantee
            // they STAY the same when one side is edited.)
            const result = isSlotSwapped
              ? resolveSwapSeedWeight(name, targetPercent, baselines as any, typeof reps === 'number' ? reps : undefined, !isStrengthPrimary)
              : calculateWeightFromConfig(name, targetPercent, baselines as any, typeof reps === 'number' ? reps : undefined, !isStrengthPrimary);
            if (result.weight != null && result.weight > 0) {
              prescribed = result.weight;
              weightDisplay = formatWeightDisplay(result.weight, result.displayFormat);
            } else if (exerciseConfig.primaryRef) {
              // Weight couldn't be calculated - baseline is missing
              baselineMissing = true;
              requiredBaseline = exerciseConfig.primaryRef;
            }
            percent_1rm = targetPercent;
            resolved_from = exerciseConfig.primaryRef || undefined;
          } else if (!isBandExercise) {
            // Fallback to legacy calculation
            const isMetric = !!(baselines as any).isMetric;
            const wUnit = isMetric ? 'kg' : 'lb';
            const pick = pickPrimary1RMAndBase(name, baselines as any);
            const base1RM = pick.base;
            const ratio = pick.ratio;
            const inferred1RM = (base1RM != null && ratio != null) ? base1RM * ratio : base1RM;
            const parsed = parseWeightInput((ex as any)?.weight, inferred1RM);
            let resolvedPctLegacy: number | undefined = undefined;
            if (parsed.weight != null) prescribed = parsed.weight;
            else if (inferred1RM != null) {
              resolvedPctLegacy = resolveStrengthPercentForLift(
                name,
                typeof percentRaw === 'number' ? percentRaw : undefined,
                strengthIntent,
                strengthMaxPct,
              );
              const scaled = inferred1RM * resolvedPctLegacy * repScaleFor(typeof reps==='number'? reps : undefined);
              prescribed = roundToIncrement(scaled, isMetric);
            }
            if (prescribed != null && isDumbbellExercise(name)) {
              prescribed = roundToIncrement(prescribed / 2, isMetric);
              weightDisplay = `${prescribed} ${wUnit} each`;
            } else if (prescribed != null) {
              weightDisplay = `${prescribed} ${wUnit}`;
            }
            // Check if baseline is missing for non-bodyweight exercises
            if (prescribed == null && pick.ref != null) {
              baselineMissing = true;
              requiredBaseline = pick.ref;
            }
            percent_1rm = (typeof percentRaw==='number' ? percentRaw : (parsed.percent_1rm != null ? parsed.percent_1rm : undefined));
            resolved_from = pick.ref || undefined;
          }
          
          // Map baseline key to human-readable name
          const baselineLabel = requiredBaseline === 'squat' ? 'Squat' 
            : requiredBaseline === 'deadlift' ? 'Deadlift'
            : requiredBaseline === 'bench' ? 'Bench Press'
            : requiredBaseline === 'overhead' ? 'Overhead Press'
            : requiredBaseline;
          
          // Extract target RIR from the exercise (if present from overlay)
          // ⛔ THE RIR STAMP SEAM. A protocol that does not auto-regulate gets NO target — see
          // `protocolUsesRir`. Today that is Strength Focus (the previous program) and nothing else: the working
          // number and the reps are fixed at plan creation, so a reserve target is a second
          // instruction that can contradict the prescription. Every other protocol is unchanged.
          const strengthProfile = resolveProfile(strengthProtocolId);
          /**
           * ⛔⛔ AND p218 GIVES **ME** NO RESERVE TARGET, IN AS MANY WORDS (2026-08-28).
           *
           * ⚠️ THE DEFECT, FROM MICHAEL'S SCREEN: the ME pull-up card's cue read *"1-5 reps, stopped
           * short of failure"* — correct — and the row directly under it read **"target 1-5 · 2 in
           * reserve"**. The composer stamps nothing on an ME row precisely because the source states
           * no target (`compose.ts` `targetRirForIntent` returns null for ME), and this seam then
           * DERIVED one off the RPE chart, because `protocolUsesRir` is protocol-wide rather than
           * per-slot. The plan contradicted itself on one card.
           *
           * ⛔ THE GATE IS PER-SLOT AND THE ROW ALREADY CARRIES IT. `slot_intent` is stamped by the
           * standing-plan composer and is read eighty lines below this one; nothing new is plumbed.
           * ⚠️ ABSENT, NEVER ZERO. p219 defines 0 RIR as a real and specific instruction — the last
           * rep still completes, very slowly — so a zero here would say something he did not say.
           * ⚠️ `compose.ts:684-687` RECORDED THIS AS A GAP for "the slice that touches the RIR seam".
           * This is that slice; that comment is now history.
           */
          const tracksRir = stampsTargetRir(protocolUsesRir(strengthProfile), (ex as any)?.slot_intent);
          const target_rir = !tracksRir ? undefined : getTargetRir(
            strengthProfile,
            String(name ?? ''),
            typeof ex?.target_rir === 'number' ? ex.target_rir : null,
            rowPhase,
            typeof reps === 'number' ? reps : (Number.parseInt(String(reps ?? ''), 10) || null),
            typeof percent_1rm === 'number' ? percent_1rm : null,
            // D-322: bodyweight lifts resolve RIR from reps vs the tested max, never a percentage.
            isBodyweightModality && typeof (baselines as any)?.pullupMaxReps === 'number'
              && /pull\s*up|chin\s*up/i.test(String(name ?? ''))
              ? (baselines as any).pullupMaxReps
              : null
          );
          
          const progressed = isStrengthPrimary ? prescribed : adjustPerformanceWorkingLoadLb(prescribed, name, strengthIntent, planWeekNumber);
          const adjustResult = applyAdjustment(name, progressed, adjustments, workoutDate);
          const finalWeight = adjustResult.weight;
          const wasAdjusted = adjustResult.adjusted;
          const originalWeight = wasAdjusted ? progressed : undefined; // Store original for UI display
          
          let finalWeightDisplay = weightDisplay;
          if (finalWeight != null) {
            const config = getExerciseConfig(name);
            finalWeightDisplay = formatWeightDisplay(finalWeight, config?.displayFormat || 'total');
          }
          // D-071: mirror first call site — RIR-anchored fallback when
          // resolution bailed on a "% 1RM" prescription and 1RM is missing.
          if (finalWeightDisplay == null) {
            // D-322: never on a bodyweight row. This fallback reads the RAW authored string, so
            // stripping the derived percent above is not enough — a stored "72% 1RM" on a pull-up
            // still reaches it and produces "Pick a weight you can do for 5 reps…" for a lift with
            // no bar. This is the third consumer to re-derive a bug from that one value.
            finalWeightDisplay = isBodyweightModality
              ? 'Bodyweight'
              : fallbackUnresolvedPercentDisplay((ex as any)?.weight, reps);
          }

          // D-322 modality guard. Three-way, and only the third case fires here:
          //   bodyweight/band with no weight        -> allow (39 such rows in prod, all correct)
          //   loaded lift with no resolvable 1RM    -> caught upstream at plan creation
          //   BODYWEIGHT LIFT CARRYING A WEIGHT     -> strip it, loudly
          // The third was live: "Pull Up" missed the hyphenated `pull-up` key, fell to the legacy
          // barbell fallback, and rendered "110 lb" off the athlete's BENCH. The lookup fold fixes
          // the cause; this is the backstop, because a bodyweight lift showing a plate number is
          // the kind of wrong an athlete acts on. Corrects rather than throws — materialize also
          // runs over EXISTING plans, and a throw would brick re-materialize on legacy rows.
          const modalityCfg = getExerciseConfig(String(name ?? ''));
          if (modalityCfg?.displayFormat === 'bodyweight' || modalityCfg?.displayFormat === 'band') {
            // Clear the intensity fields on EVERY bodyweight row, not only ones that arrived
            // carrying a load. Stripping the authored percentage upstream left a hole that
            // `resolveStrengthPercentForLift` filled with its own 0.70 default, so the row still
            // shipped `percent_1rm: 0.7` — a fabricated intensity for a lift that has none, and
            // exactly the value the next consumer would have re-derived a bug from.
            percent_1rm = undefined;
            resolved_from = undefined;
            if (typeof finalWeight === 'number' && finalWeight > 0) {
              console.error(`⛔ [materialize] ${name}: bodyweight/band lift carried ${finalWeight} lb — stripped.`);
              finalWeight = undefined as any;
              finalWeightDisplay = modalityCfg.displayFormat === 'band' ? 'Band' : 'Bodyweight';
            }
          }
          const strength = { name, sets, reps, weight: finalWeight, weight_display: finalWeightDisplay, percent_1rm, resolved_from, notes: equipmentNotes, baseline_missing: baselineMissing, required_baseline: baselineLabel, target_rir, adjusted: wasAdjusted, original_weight: originalWeight, set_plan: carrySetPlan(ex, finalWeight), rir_tracked: tracksRir,
            /**
             * ⛔ THE EXECUTION LABEL, CARRIED — DISPLAY ONLY (2026-08-31). The composer sets
             * `execution_name` when the athlete's kit reaches a movement on its FREE-WEIGHT route and
             * the canonical name says machine (`rear delt machine` at a home gym). This object is a
             * WHITELIST, so without this line the fact dies here and every surface prints the station
             * again. ⚠️ `name` is untouched and stays canonical — it is what logged-vs-planned
             * matching keys on, and moving it would unmatch every set logged against the old spelling.
             */
            /**
             * ⚠️ AND ONLY WHILE THE ROW IS STILL THE MOVEMENT THE COMPOSER LABELLED. An equipment
             * substitution or an athlete swap rewrites `name` a few lines above; the label describes
             * the ORIGINAL movement's execution and would be a lie on the replacement. Dropped rather
             * than re-derived — this seam does not own the naming rule.
             */
            execution_name: (String(name).toLowerCase().trim() === String(originalName).toLowerCase().trim()
              ? ((ex as any)?.execution_name ?? undefined)
              : undefined),
            /**
             * ⛔ HOW THE WEIGHT WAS ARRIVED AT, OR WHY THERE ISN'T ONE — carried (2026-09-01). This
             * object is a WHITELIST and `load_basis` was never on it, so the composer's marker died
             * here and every surface downstream saw a bare "By feel" with no way to tell an
             * auto-regulated row from one still waiting on a test. That ambiguity is the most-reported
             * false alarm in this project.
             * ⚠️ Dropped alongside `execution_name` when a substitution or swap rewrote the row: the
             * basis describes how the ORIGINAL movement was priced.
             */
            load_basis: (String(name).toLowerCase().trim() === String(originalName).toLowerCase().trim()
              ? ((ex as any)?.load_basis ?? undefined)
              : undefined),
            // ⛔ CARRY THE ASSISTANCE MARKER (2026-07-30). This object is a WHITELIST, and
            // `load_prescribed: false` — set on every assistance row the composer authors — was not on
            // it. The flag reached materialize (it is read twenty lines above, to stop a weight being
            // derived) and then died here, so nothing downstream could tell an assistance slot from a
            // main lift. The Swap sheet offered the whole exercise library where the block had already
            // defined a three-option shortlist.
            // ⚠️ Only ever `false` or absent — never `true`. Absent means "not stated", and a reader
            // that treats absent as assistance would turn every main lift into one.
            ...(((ex as any)?.load_prescribed === false) ? { load_prescribed: false } : {}),
            // ⛔ AND CARRY THE SLOT INTENT (2026-08-26) — the same whitelist, the fourth time. The
            // composer stopped writing its slot notation into `notes` (jargon in the athlete-notes
            // box); the intent now travels as `slot_intent` and the logger's ME/DE cues read it.
            // Unlisted it dies here, and every standing cue falls back to the legacy notes regex.
            ...((['ME','DE','SKILL','HYP'].includes(String((ex as any)?.slot_intent))) ? { slot_intent: (ex as any).slot_intent } : {}),
            // ⛔ AND CARRY LAST TIME'S RESULT (2026-08-26) — the same whitelist, the fifth time. The
            // heavy slot prints a rep BAND and nothing else, so a block that is progressing correctly
            // looks frozen for eight weeks; `last_reps` is what the athlete actually got, and both the
            // plan row and the logger read it. Unlisted it dies here and the row goes back to silence.
            // ⚠️ Guarded on a non-empty array of finite numbers: an empty one means "no last time at
            // this weight" and must stay ABSENT rather than render as a result of nothing.
            ...(Array.isArray((ex as any)?.last_reps)
              && (ex as any).last_reps.length > 0
              && (ex as any).last_reps.every((n: unknown) => Number.isFinite(Number(n)))
              ? { last_reps: (ex as any).last_reps.map((n: unknown) => Number(n)) } : {}),
            // ⛔ AND CARRY THE SUGGESTION (2026-08-09, D-406) — SAME WHITELIST, SAME TRAP. This is the
            // second field the composer authors for assistance rows, and it dies here exactly as
            // `load_prescribed` did for four days unless it is listed. It is NOT a prescribed load:
            // `weight_suggested` is a starting point for the logger's entry box, and the block above
            // still clears `weightDisplay`/`prescribed`/`percent_1rm` for these rows. The two coexist
            // on purpose — the plan names no weight, and the athlete is handed somewhere to start.
            // ⚠️ GUARDED ON A FINITE POSITIVE. Absent means "no suggestion"; a zero would render as a
            // prescribed nothing, which is the shape of the bug this field exists to avoid.
            // ⛔⛔ AND THE ATHLETE'S OWN LAST WEIGHT BEATS THE RATIO (2026-08-29, Michael: *"no
            // history user adds whatever they went to failure or 1 RIR — get carried onto the next
            // round"*). The composer's suggestion is derived from the parent lift's max times a
            // catalogue ratio — a reasonable guess for a movement never performed, and strictly
            // worse than the number the athlete actually used last time. Fitbod, the closest app
            // that both writes the program and fills the box, works the same way round: your own
            // history first, a population estimate only when you have none.
            // ⚠️ STILL A SUGGESTION, NOT A PRESCRIPTION. The row's weight stays unset — Viada
            // auto-regulates this work and the athlete picks the load.
            ...(() => {
              const own = lastWeightByMovement[canonicalizeName(String((ex as any)?.name ?? ''))];
              if (Number.isFinite(own) && own > 0) return { weight_suggested: own };
              return Number.isFinite((ex as any)?.weight_suggested) && (ex as any).weight_suggested > 0
                ? { weight_suggested: (ex as any).weight_suggested } : {};
            })(),
            // ⛔ AND CARRY THE SUPPLEMENTAL MARKER (2026-08-15, §1e) — THE SAME WHITELIST, THE THIRD
            // TIME. An FSL row shares its main lift's NAME on purpose, so this flag is the only thing
            // that tells the logger it is a second block of the same movement rather than a duplicate
            // row. Unlisted, the athlete would see "Bench Press" twice with nothing to distinguish
            // them, which reads as a bug in the plan.
            ...(((ex as any)?.supplemental === true) ? { supplemental: true } : {}),
          } as any;
          // ⛔ THE AUTHORED LABEL SURVIVES WHEN NOTHING WAS SUBSTITUTED. `notes` above is
          // `equipmentNotes` — the substitution sentence — and it is `undefined` on every row nothing
          // was swapped on. That would silently erase the composer's own "First Set Last" label, so
          // the authored note fills the gap rather than competing with it.
          // ⚠️ EQUIPMENT NOTES WIN when both exist: a substitution is a change to what the athlete is
          // doing, and the label is a description of what it already was.
          if (!(strength as any).notes && typeof (ex as any)?.notes === 'string' && String((ex as any).notes).trim()) {
            (strength as any).notes = String((ex as any).notes).trim();
          }
          if (String(name ?? '').toLowerCase().includes('band')) {
            console.log(`🎸 Band exercise created:`, { name, notes: equipmentNotes, hasNotes: !!equipmentNotes });
          }
          steps.push({ id: uid(), kind:'strength', strength });
        }
        return { steps, total_s: 0 };
      }
    } catch (err) {
      // ⛔ NEVER SILENT AGAIN (2026-08-30) — see the twin branch above.
      console.error('❌ expandTokensForRow: strength (with tokens) expansion threw, falling back to generic block:', err);
    }
    // Fallback placeholder if no details present
    steps.push({ id: uid(), kind:'strength', strength: { name: 'strength block' } });
    return { steps, total_s: 0 };
  }
  console.log(`🔍 Parsing ${tokens.length} tokens for ${discipline}:`, tokens);
  for (const tok of tokens) {
    let added: any[] = [];
    if (discipline==='run' || discipline==='walk') added = stampRunPrescription(tok, expandRunToken(tok, baselines), baselines);
    else if (discipline==='ride' || discipline==='bike' || discipline==='cycling') added = expandBikeToken(tok, baselines);
    else if (discipline==='swim') {
      // Detailed swim expansion — one line per rep
      const s = String(tok).toLowerCase();
      const ydToM = (yd:number)=> Math.round(yd*0.9144);
      const pushWUCD = (n:number, unit:string, warm:boolean) => {
        const distM = unit==='yd'? ydToM(n) : n;
        steps.push({ id: uid(), kind: warm?'warmup':'cooldown', distance_m: distM, intensity: 'easy' });
      };
      let m: RegExpMatchArray | null = null;
      // Warmup/Cooldown distance tokens: swim_warmup_300yd_easy / swim_cooldown_200yd
      // Allow optional suffix after unit (e.g., _easy)
      m = s.match(/swim_(warmup|cooldown)_(\d+)(yd|m)(?:_[a-z0-9_]+)?/);
      if (m) { pushWUCD(parseInt(m[2],10), m[3], m[1]==='warmup'); continue; }
      // Open water practice: duration from row; continuous steady effort, optional short time warmup, no interval rests
      if (s === 'swim_open_water_practice') {
        const totalMin = Number(row?.duration);
        const totalSec =
          Number.isFinite(totalMin) && totalMin > 0 ? Math.round(totalMin * 60) : 40 * 60;
        const warmupSec = Math.min(5 * 60, Math.floor(totalSec * 0.15));
        const owLabel =
          'open water steady — sight every 6–8 strokes, pick a landmark; bilateral breathing into chop or sun glare';
        if (warmupSec >= 120) {
          steps.push({ id: uid(), kind: 'warmup', duration_s: warmupSec });
          steps.push({
            id: uid(),
            kind: 'work',
            duration_s: Math.max(60, totalSec - warmupSec),
            label: owLabel,
          });
        } else {
          steps.push({ id: uid(), kind: 'work', duration_s: totalSec, label: owLabel });
        }
        console.log(
          `  ✅ Matched open water practice: total=${totalSec}s warmup=${warmupSec >= 120 ? warmupSec : 0}s`,
        );
        continue;
      }
      // Infer Garmin equipmentType from drill name when no explicit suffix is present.
      // Covers swim_drills_* tokens where equipment is encoded in the drill name itself.
      const inferEquipFromDrillName = (name: string): string | null => {
        if (/snorkel/.test(name)) return 'snorkel';
        if (/\bkick\b/.test(name)) return 'board';
        if (/scull/.test(name)) return 'buoy';
        return null;
      };
      // 2026-05-22 swim arc: per-token effort tier (easy/moderate/hard) attached to
      // each swim work + drill step so Garmin export + Form Goggles narrator render
      // the intensity athletes actually feel, not the internal session-type tag.
      // Session-tag-aware so a `swim_kick_*` token inside a Kick-Focused session
      // (tag `kick_focused`) reads as 'moderate' per §0.5, while the same token
      // shape elsewhere falls back to 'easy'.
      const swimSessionTags: string[] = Array.isArray((row as any)?.tags)
        ? (row as any).tags.map((t: any) => String(t))
        : [];
      const swimIntensity = swimTokenIntensity(s, swimSessionTags);
      // §6.6 (2026-05-22) — athlete's owned swim gear, derived once per row from
      // baselines for use in drill step labels (Step 4 of the CSS-kill arc).
      const athleteOwnedSwimGear = swimGearNormalized(
        Array.isArray((baselines as any)?.equipment?.swimming)
          ? (baselines as any).equipment.swimming
          : null,
      );
      // §6.6 drill-label equipment hint (2026-05-22, Step 4 of CSS-kill arc).
      // When the athlete owns the drill's §6.6 recommended gear, append it to the
      // step label so Garmin + Form Goggles render "Drill — Fingertip Drag (fins)"
      // instead of just "Drill — Fingertip Drag". Required equipment still flows
      // via the separate `equipment` field on the step (attachSwimMeta in Garmin
      // export, formatEquipment in Form Goggles).
      const drillLabelWithGear = (drillToken: string, baseName: string): string => {
        const eq = swimDrillEquipmentFromTokens([drillToken]);
        const ownedRec: string[] = [];
        for (const r of eq.recommended ?? []) {
          if (athleteOwnedSwimGear.has(String(r).toLowerCase())) {
            const lbl = swimGearLabelForDisplay(r);
            if (lbl) ownedRec.push(lbl.toLowerCase());
          }
        }
        return ownedRec.length ? `Drill — ${baseName} (${ownedRec.join(', ')})` : `Drill — ${baseName}`;
      };
      // Drill (name first): swim_drill_<name>_4x50yd(_r15)?(_equipment)?
      m = s.match(/swim_drill_([a-z0-9_]+)_(\d+)x(\d+)(yd|m)(?:_r(\d+))?(?:_(fins|board|buoy|snorkel))?/);
      if (m) {
        const name = swimDrillDisplayName(m[1]); const reps=parseInt(m[2],10); const dist=parseInt(m[3],10); const unit=m[4]; const rest=parseInt(m[5]||'0',10); const equip=m[6]||inferEquipFromDrillName(m[1]);
        const distM = unit==='yd'? ydToM(dist) : dist;
        const drillLabel = drillLabelWithGear(s, name);
        for(let i=0;i<reps;i++) { steps.push({ id: uid(), kind:'drill', distance_m: distM, label: drillLabel, equipment: equip||undefined, intensity: swimIntensity, equipment_detail: resolveSwimStepEquipment(drillLabel, 'drill', swimIntensity) }); if(rest) steps.push({ id: uid(), kind:'recovery', duration_s: rest }); }
        continue;
      }
      // Drill (count first): swim_drills_6x50yd_fingertipdrag (optional _r15, optional equipment)
      // Use negative lookahead to prevent drill name from consuming _r\d+ pattern
      m = s.match(/swim_drills_(\d+)x(\d+)(yd|m)_([a-z0-9_]+?)(?:_r(\d+))?(?:_(fins|board|buoy|snorkel))?$/);
      if (m) {
        const reps=parseInt(m[1],10); const dist=parseInt(m[2],10); const unit=m[3]; const name = swimDrillDisplayName(m[4]); const rest=parseInt(m[5]||'0',10); const equip=m[6]||inferEquipFromDrillName(m[4]);
        console.log(`  ✅ Matched drill (count first): name="${name}", reps=${reps}, dist=${dist}${unit}, rest=${rest}s, equip=${equip}`);
        const distM = unit==='yd'? ydToM(dist) : dist;
        const drillLabel = drillLabelWithGear(s, name);
        for(let i=0;i<reps;i++) {
          steps.push({ id: uid(), kind:'drill', distance_m: distM, label: drillLabel, equipment: equip||undefined, intensity: swimIntensity, equipment_detail: resolveSwimStepEquipment(drillLabel, 'drill', swimIntensity) });
          // Only add rest BETWEEN reps, not after the last rep
          if(rest && i < reps - 1) {
            steps.push({ id: uid(), kind:'recovery', duration_s: rest });
            console.log(`    🔄 Added recovery step: ${rest}s`);
          }
        }
        continue;
      }
      // CSS-paced aerobic main set: swim_aerobic_css_15x100yd_r15 (label segment breaks naive aerobic regex)
      // §0.5 (2026-05-22): step label is the athlete-facing tier word — same as `intensity`.
      // Internal kind ('css_aerobic' in session tags) NEVER reaches the athlete export surface.
      m = s.match(/^swim_aerobic_css_(\d+)x(\d+)(yd|m)(?:_r(\d+))?$/);
      if (m) {
        const reps = parseInt(m[1], 10);
        const dist = parseInt(m[2], 10);
        const unit = m[3];
        const rest = parseInt(m[4] || '0', 10);
        const distM = unit === 'yd' ? ydToM(dist) : dist;
        console.log(`  ✅ Matched aerobic-moderate: reps=${reps}, dist=${dist}${unit}, rest=${rest}s`);
        for (let i = 0; i < reps; i++) {
          steps.push({ id: uid(), kind: 'work', distance_m: distM, label: swimIntensity, intensity: swimIntensity });
          if (rest && i < reps - 1) {
            steps.push({ id: uid(), kind: 'recovery', duration_s: rest });
            console.log(`    🔄 Added recovery step: ${rest}s`);
          }
        }
        continue;
      }
      // Aerobic sets: swim_aerobic_6x150yd[_easy](_r20)?
      m = s.match(/swim_aerobic_(\d+)x(\d+)(yd|m)(?:_([a-z]+?))?(?:_r(\d+))?$/);
      if (m) {
        const reps=parseInt(m[1],10); const dist=parseInt(m[2],10); const unit=m[3]; const rest=parseInt(m[5]||'0',10); const distM = unit==='yd'? ydToM(dist) : dist;
        console.log(`  ✅ Matched aerobic: reps=${reps}, dist=${dist}${unit}, intensity="${swimIntensity}", rest=${rest}s`);
        for(let i=0;i<reps;i++){
          steps.push({ id: uid(), kind:'work', distance_m: distM, label: swimIntensity, intensity: swimIntensity });
          // Only add rest BETWEEN reps, not after the last rep
          if(rest && i < reps - 1) {
            steps.push({ id: uid(), kind:'recovery', duration_s: rest });
            console.log(`    🔄 Added recovery step: ${rest}s`);
          }
        }
        continue;
      }
      // Threshold sets: swim_threshold_8x100yd(_r10)?
      m = s.match(/swim_threshold_(\d+)x(\d+)(yd|m)(?:_r(\d+))?$/);
      if (m) {
        const reps=parseInt(m[1],10); const dist=parseInt(m[2],10); const unit=m[3]; const rest=parseInt(m[4]||'0',10); const distM = unit==='yd'? ydToM(dist) : dist;
        console.log(`  ✅ Matched threshold-hard: reps=${reps}, dist=${dist}${unit}, rest=${rest}s`);
        for(let i=0;i<reps;i++){
          steps.push({ id: uid(), kind:'work', distance_m: distM, label: swimIntensity, intensity: swimIntensity });
          // Only add rest BETWEEN reps, not after the last rep
          if(rest && i < reps - 1) {
            steps.push({ id: uid(), kind:'recovery', duration_s: rest });
            console.log(`    🔄 Added recovery step: ${rest}s`);
          }
        }
        continue;
      }
      // Pull/Kick sets: swim_pull_4x100yd_r20_buoy
      m = s.match(/swim_(pull|kick)_(\d+)x(\d+)(yd|m)(?:_r(\d+))?(?:_(fins|board|buoy|snorkel))?$/);
      if (m) {
        const kind=m[1];
        const reps=parseInt(m[2],10);
        const dist=parseInt(m[3],10);
        const unit=m[4];
        const rest=parseInt(m[5]||'0',10);
        const eq=m[6]|| (kind==='pull'?'buoy': (kind==='kick'?'board':null));
        const distM=unit==='yd'? ydToM(dist):dist;
        console.log(`  ✅ Matched ${kind}: reps=${reps}, dist=${dist}${unit}, intensity="${swimIntensity}", rest=${rest}s, equip=${eq}`);
        for(let i=0;i<reps;i++){
          steps.push({ id: uid(), kind:'work', distance_m: distM, label: swimIntensity, equipment:eq||undefined, intensity: swimIntensity, equipment_detail: resolveSwimStepEquipment(null, 'work', swimIntensity) });
          // Only add rest BETWEEN reps, not after the last rep
          if(rest && i < reps - 1) {
            steps.push({ id: uid(), kind:'recovery', duration_s: rest });
            console.log(`    🔄 Added recovery step: ${rest}s`);
          }
        }
        continue;
      }
      // Fallback distance/time
      if (/\d+yd/.test(s)) { const mm=s.match(/(\d+)yd/); const yd=mm?parseInt(mm[1],10):0; const mtr=ydToM(yd); steps.push({ id: uid(), kind:'work', distance_m: mtr }); continue; }
      if (/\d+min/.test(s)) { const sec=minutesTokenToSeconds(s) ?? 600; steps.push({ id: uid(), kind:'work', duration_s: sec }); continue; }
      steps.push({ id: uid(), kind:'work', duration_s: 300 });
      continue;
    }
    steps.push(...added);
  }
  // Fallback: if no tokens yielded steps, try to expand from workout_structure when present
  try {
    if (steps.length === 0 && row?.workout_structure && typeof row.workout_structure === 'object') {
      const ws: any = row.workout_structure;
      const struct: any[] = Array.isArray(ws?.structure) ? ws.structure : [];
      const toSec = (val?: string | number | null): number => {
        if (typeof val === 'number' && isFinite(val) && val>0) return Math.round(val);
        const txt = String(val||'').trim();
        let m = txt.match(/(\d+)\s*min/i); if (m) return parseInt(m[1],10)*60;
        m = txt.match(/(\d+)\s*s(ec)?\b/i); if (m) return parseInt(m[1],10);
        m = txt.match(/^(\d{1,2}):(\d{2})$/); if (m) return parseInt(m[1],10)*60 + parseInt(m[2],10);
        return 0;
      };
      const toMeters = (txt?: string | number | null): number => {
        if (typeof txt === 'number' && isFinite(txt) && txt>0) return Math.round(txt);
        const t = String(txt||'');
        let m = t.match(/(\d+(?:\.\d+)?)\s*(yd|yard|yards)\b/i); if (m) return Math.round(parseFloat(m[1])*0.9144);
        m = t.match(/(\d+(?:\.\d+)?)\s*m\b/i); if (m) return Math.round(parseFloat(m[1]));
        m = t.match(/(\d+(?:\.\d+)?)\s*(mi|mile|miles)\b/i); if (m) return Math.round(parseFloat(m[1])*1609.34);
        m = t.match(/(\d+(?:\.\d+)?)\s*km\b/i); if (m) return Math.round(parseFloat(m[1])*1000);
        return 0;
      };

      for (const seg of struct) {
        const kind = String(seg?.type||'').toLowerCase();
        if (kind === 'warmup' || kind === 'cooldown') {
          const dSec = toSec(seg?.duration);
          const dM = toMeters(seg?.distance);
          if (dM>0) steps.push({ id: uid(), kind: kind==='warmup'?'warmup':'cooldown', distance_m: dM });
          else if (dSec>0) steps.push({ id: uid(), kind: kind==='warmup'?'warmup':'cooldown', duration_s: dSec });
          continue;
        }
        if (kind === 'main_set' && String(seg?.set_type||'').toLowerCase()==='intervals') {
          const reps = Number(seg?.repetitions)||1;
          const work = seg?.work_segment || {};
          const rec = seg?.recovery_segment || {};
          const wSec = toSec(work?.duration);
          const wM = toMeters(work?.distance);
          const rSec = toSec(rec?.duration);
          for (let r=0;r<Math.max(1,reps);r+=1) {
            if (wM>0) steps.push({ id: uid(), kind: 'work', distance_m: wM });
            else if (wSec>0) steps.push({ id: uid(), kind: 'work', duration_s: wSec });
            if (r<reps-1 && rSec>0) steps.push({ id: uid(), kind: 'recovery', duration_s: rSec });
          }
          continue;
        }
        if (kind === 'main_set' && /aerobic/i.test(String(seg?.set_type||''))) {
          const reps = Number(seg?.repetitions)||1; const dist = toMeters(seg?.distance);
          for (let r=0;r<Math.max(1,reps);r+=1) {
            if (dist>0) steps.push({ id: uid(), kind: 'work', distance_m: dist, label: 'aerobic' });
          }
          continue;
        }
        if (kind === 'main_effort' || kind === 'main') {
          const dSec = toSec(seg?.duration); if (dSec>0) steps.push({ id: uid(), kind: 'work', duration_s: dSec });
          const dM = toMeters(seg?.distance); if (dM>0) steps.push({ id: uid(), kind: 'work', distance_m: dM });
          continue;
        }
      }
    }
  } catch {}
  // Final fallback (no parsing of description): if this is a run and row.duration is set,
  // create a single steady step using user's easy pace baseline
  try {
    if (steps.length === 0 && String(row?.type||'').toLowerCase()==='run') {
      const min = Number(row?.duration);
      if (Number.isFinite(min) && min>0) {
        const easy = secPerMiFromBaseline(baselines, 'easy');
        steps.push({ id: uid(), kind: 'work', duration_s: Math.round(min*60), pace_sec_per_mi: easy||undefined });
      }
    }
  } catch {}
  // Final fallback: parse rendered_description/description for a single steady step
  try {
    if (steps.length === 0) {
      const desc = String(row?.rendered_description || row?.description || '').toLowerCase();
      // Duration: prefer an explicit "total duration" marker
      let dMatch = desc.match(/total\s*duration\s*:\s*(\d{1,3}):(\d{2})/);
      if (!dMatch) dMatch = desc.match(/\b(\d{1,3}):(\d{2})\b/);
      const durSec = dMatch ? (parseInt(dMatch[1],10)*60 + parseInt(dMatch[2],10)) : 0;
      // Pace text like 10:30/mi or 5:00/km
      let pMatch = desc.match(/(\d{1,2}):(\d{2})\s*\/mi/);
      let paceSecPerMi: number | null = null;
      if (pMatch) {
        paceSecPerMi = parseInt(pMatch[1],10)*60 + parseInt(pMatch[2],10);
      } else {
        pMatch = desc.match(/(\d{1,2}):(\d{2})\s*\/km/);
        if (pMatch) {
          const spk = parseInt(pMatch[1],10)*60 + parseInt(pMatch[2],10);
          paceSecPerMi = Math.round(spk * 1.60934);
        }
      }
      if (durSec > 0 || (paceSecPerMi!=null)) {
        steps.push({ id: uid(), kind: 'work', duration_s: durSec>0?durSec:1800, pace_sec_per_mi: paceSecPerMi || undefined });
      }
    }
  } catch {}
  // Parse textual target ranges from description and attach as structured fields when missing
  try {
    const desc = String(row?.rendered_description || row?.description || '').toLowerCase();
    const parsePaceRange = (s:string): [number,number] | null => {
      // 10:00-10:30/mi or 5:00-5:15/km
      let m = s.match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})\s*\/(mi|km)/i);
      if (!m) return null;
      const a = parseInt(m[1],10)*60 + parseInt(m[2],10);
      const b = parseInt(m[3],10)*60 + parseInt(m[4],10);
      const unit = m[5].toLowerCase();
      if (unit === 'mi') return [Math.min(a,b), Math.max(a,b)];
      const aMi = Math.round(a * 1.60934); const bMi = Math.round(b * 1.60934);
      return [Math.min(aMi,bMi), Math.max(aMi,bMi)];
    };
    const parsePowerRange = (s:string): {lower:number, upper:number} | null => {
      // Handle absolute watt ranges like "200-250W"
      let m = s.match(/(\d{2,4})\s*[–-]\s*(\d{2,4})\s*w/i);
      if (m) {
        const lo = parseInt(m[1],10); const hi = parseInt(m[2],10);
        if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo<=0 || hi<=0) return null;
        return { lower: Math.min(lo,hi), upper: Math.max(lo,hi) };
      }
      
      // Handle FTP percentage ranges like "85-95% FTP" or "90% FTP"
      const ftp = baselines?.ftp;
      if (typeof ftp === 'number' && ftp > 0) {
        // Range format: "85-95% FTP"
        m = s.match(/(\d{1,3})\s*[–-]\s*(\d{1,3})\s*%\s*(?:ftp)?/i);
        if (m) {
          const lo = parseInt(m[1],10); const hi = parseInt(m[2],10);
          if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo<=0 || hi<=0) return null;
          return { lower: Math.round(ftp * (lo/100)), upper: Math.round(ftp * (hi/100)) };
        }
        
        // Single percentage format: "90% FTP"
        m = s.match(/(\d{1,3})\s*%\s*(?:ftp)?/i);
        if (m) {
          const pct = parseInt(m[1],10);
          if (!Number.isFinite(pct) || pct<=0) return null;
          const center = Math.round(ftp * (pct/100));
          const tolerance = 0.05; // ±5% tolerance
          return { lower: Math.round(center * (1-tolerance)), upper: Math.round(center * (1+tolerance)) };
        }
      }
      
      return null;
    };
    const pr = parsePaceRange(desc);
    const pow = parsePowerRange(desc);
    if (pr || pow) {
      for (const st of steps) {
        const kind = String((st as any)?.kind || '').toLowerCase();
        if (kind === 'recovery' || kind === 'rest') continue;
        // Don't apply default power to maximal effort steps (like FTP tests)
        const label = String((st as any)?.label || '').toLowerCase();
        const isMaximalEffort = label.includes('maximal') || label.includes('ftp test') || label.includes('all-out');
        if (pr && !(Array.isArray((st as any)?.pace_range))) (st as any).pace_range = pr;
        if (pow && !isMaximalEffort && !((st as any)?.power_range && typeof (st as any).power_range.lower==='number')) (st as any).power_range = pow;
      }
    }
  } catch {}
  
  // For swim steps with distance but no duration, estimate duration using baseline pace
  if (discipline === 'swim') {
    try {
      // Parse baseline swim pace from various formats (string "mm:ss" or number seconds)
      // D-088: the `row.baselines_template` / `row.baselines` reads here pointed at
      // columns that don't exist on planned_workouts (same class as D-081 — verified
      // by REST probe; PostgREST 42703 on both). Removed the dead tertiary fallbacks
      // so the lookup is the actual working path: user_baselines.performance_numbers
      // via `baselines` (constructed at line ~2587). Behavior unchanged — the dead
      // paths always returned undefined.
      const swimPacePer100Sec = (() => {
        // Try numeric format first (seconds per 100)
        const numPace = baselines?.swim_pace_per_100_sec;
        if (typeof numPace === 'number' && numPace > 0) {
          console.log(`  🏊 Using numeric baseline pace: ${numPace}s per 100`);
          return numPace;
        }

        // Try string format "mm:ss" (e.g., "2:10")
        const strPace = (baselines as any)?.swimPace100;
        if (typeof strPace === 'string' && /^\d{1,2}:\d{2}$/.test(strPace)) {
          const [mm, ss] = strPace.split(':').map((t:string)=>parseInt(t,10));
          const sec = mm*60 + ss;
          if (sec > 0) {
            console.log(`  🏊 Using string baseline pace: ${strPace} (${sec}s per 100)`);
            return sec;
          }
        }
        
        // Default fallback: 1:30/100 (90 seconds)
        console.log(`  🏊 No baseline found, using default: 90s per 100 (1:30/100)`);
        return 90;
      })();
      
      // Determine baseline unit from user's preferred units (imperial=yards, metric=meters)
      const userUnits = String((row as any)?.units || '').toLowerCase();
      const baselineUnit = (userUnits === 'imperial') ? 'yd' : 'm';
      const poolUnit = ((row as any)?.pool_unit as 'yd' | 'm' | null) || baselineUnit;
      
      console.log(`  🏊 Baseline unit: ${baselineUnit}, Pool unit: ${poolUnit}`);
      
      for (const st of steps) {
        // Skip if step already has duration
        if (typeof st.duration_s === 'number' && st.duration_s > 0) continue;
        
        // Check both camelCase and snake_case field names
        const distM = typeof st.distanceMeters === 'number' ? st.distanceMeters : (typeof st.distance_m === 'number' ? st.distance_m : 0);
        if (distM > 0) {
          // Convert distance to baseline unit, calculate duration, then apply
          let dist100: number;
          if (baselineUnit === 'yd') {
            // Baseline is per 100 yards
            const distYd = distM / 0.9144;
            dist100 = distYd / 100;
          } else {
            // Baseline is per 100 meters
            dist100 = distM / 100;
          }
          const calcDur = Math.round(dist100 * swimPacePer100Sec);
          st.duration_s = calcDur;
          console.log(`    ⏱️  ${distM}m → ${Math.round(distM/0.9144)}yd → ${dist100.toFixed(2)} × ${swimPacePer100Sec}s = ${calcDur}s`);
        }
      }
    } catch {}
  }

  const total_s = steps.reduce((s,st)=> s + (Number(st.duration_s)||0), 0);
  const swim_equipment_suggested =
    discipline === 'swim' && swimEquipPack.suggestedRequired.length ? swimEquipPack.suggestedRequired : undefined;
  const swim_equipment_optional_suggested =
    discipline === 'swim' && swimEquipPack.suggestedOptional.length ? swimEquipPack.suggestedOptional : undefined;
  return { steps, total_s, swim_equipment_suggested, swim_equipment_optional_suggested };
}

Deno.env.get; // keep Deno type active

function mmss(sec: number): string {
  const s = Math.max(1, Math.round(sec));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${String(ss).padStart(2,'0')}`;
}

export function toV3Step(st: any, row?: any): any {
  const out: any = { id: st?.id || uid() };
  
  // Duration: explicit or calculated from distance + pace
  if (typeof st?.duration_s === 'number') {
    out.seconds = Math.max(1, Math.round(st.duration_s));
  } else if (typeof st?.distance_m === 'number' && st.distance_m > 0) {
    // Calculate duration from distance and pace for distance-based steps
    const distM = st.distance_m;
    let paceSecPerMi: number | null = null;
    
    // Try to get pace from pace_range (use midpoint)
    if (Array.isArray(st?.pace_range) && st.pace_range.length === 2) {
      const a = Number(st.pace_range[0]);
      const b = Number(st.pace_range[1]);
      if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0) {
        paceSecPerMi = (a + b) / 2;
      }
    }
    // Fallback to single pace target
    if (!paceSecPerMi && typeof st?.pace_sec_per_mi === 'number' && st.pace_sec_per_mi > 0) {
      paceSecPerMi = st.pace_sec_per_mi;
    }
    
    // Calculate duration: distance (meters) / 1609.34 * pace (sec/mi)
    if (paceSecPerMi && paceSecPerMi > 0) {
      const miles = distM / 1609.34;
      const durationSec = miles * paceSecPerMi;
      out.seconds = Math.max(1, Math.round(durationSec));
    }
  }
  
  // Distance: explicit or calculated from duration + pace (for time-based steps)
  // CRITICAL: If step has duration_s (time-based), ALWAYS calculate distance from duration + pace
  // NEVER use distance_m for time-based steps, even if it exists (it's likely incorrect).
  // SWIM EXCEPTION: swim steps with distance_m have duration_s added by the pace estimator for
  // total-duration accounting only. Treat them as distance-based — use distance_m for distanceMeters
  // and keep seconds for duration display. Do not try to re-derive distance from pace (swim steps
  // have no pace_sec_per_mi, so the calculation would produce undefined and lose the distance).
  const isSwimRow = String(row?.type||'').toLowerCase() === 'swim';
  const hasExplicitDuration = typeof st?.duration_s === 'number' && st.duration_s > 0;
  const hasExplicitDistance = typeof st?.distance_m === 'number' && st.distance_m > 0;

  if (hasExplicitDuration && hasExplicitDistance && isSwimRow) {
    // Swim distance-based step: distance_m is authoritative; duration_s is pace-estimated.
    out.distanceMeters = Math.max(1, Math.round(st.distance_m));
  } else if (hasExplicitDuration && typeof out.seconds === 'number' && out.seconds > 0) {
    // Time-based step: calculate distance from duration and pace (IGNORE any existing distance_m)
    let paceSecPerMi: number | null = null;
    
    // Try to get pace from pace_range (use midpoint)
    if (Array.isArray(st?.pace_range) && st.pace_range.length === 2) {
      const a = Number(st.pace_range[0]);
      const b = Number(st.pace_range[1]);
      if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0) {
        paceSecPerMi = (a + b) / 2;
      }
    }
    // Fallback to single pace target
    if (!paceSecPerMi && typeof st?.pace_sec_per_mi === 'number' && st.pace_sec_per_mi > 0) {
      paceSecPerMi = st.pace_sec_per_mi;
    }
    
    // Calculate distance: (duration_seconds / pace_sec_per_mi) * 1609.34 meters
    if (paceSecPerMi && paceSecPerMi > 0) {
      const miles = out.seconds / paceSecPerMi;
      const distanceMeters = miles * 1609.34;
      out.distanceMeters = Math.max(1, Math.round(distanceMeters));
      /**
       * ⛔⛔⛔ THIS DISTANCE IS DERIVED, AND IT SAYS SO — Michael's plan, 2026-08-31.
       *
       * The source prescribes this step in TIME. The distance above is `seconds ÷ pace`, kept for
       * total accounting, and it is only true if the athlete is already running the target pace.
       * **Two readers were treating it as the prescription**: the planned view printed *"101 yd"*
       * for a fifteen-second surge and never showed the time, and `send-workout-to-garmin` sent
       * `durationType: 'DISTANCE'` — so his watch counted down 101 metres for an interval the page
       * prescribes as fifteen seconds. On a slow day it runs long, on a fast day short: **the
       * prescription inverts exactly when it matters.**
       *
       * ⚠️ THE NUMBER IS NOT REMOVED — the accounting needs it. What is added is the fact that it is
       * derived, so a reader can tell a prescription from a by-product. Same shape as the plan token
       * taking a band's top: a derived value read as an instruction.
       * ⚠️ FIX-FORWARD. Rows materialized before this carry no flag and keep the old reading; a
       * rebuild or a restate re-materializes them.
       */
      out.distanceDerived = true;
      // Log if we're overriding an incorrect distance_m
      if (hasExplicitDistance) {
        console.log(`  ⚠️  Overriding incorrect distance_m=${st.distance_m}m (${(st.distance_m/1609.34).toFixed(1)}mi) with calculated ${distanceMeters.toFixed(0)}m (${miles.toFixed(2)}mi) from duration_s=${st.duration_s}s`);
      }
    } else {
      console.log(`  ⚠️  Time-based step (duration_s=${st.duration_s}s) but no pace available to calculate distance`);
    }
  } else if (hasExplicitDistance && !hasExplicitDuration) {
    // Distance-based step (no duration_s): use explicit distance
    out.distanceMeters = Math.max(1, Math.round(st.distance_m));
  }
  if (typeof st?.pace_sec_per_mi === 'number') {
    out.paceTarget = `${mmss(st.pace_sec_per_mi)}/mi`;
    
    // RACE DAY: No pace range - fixed M pace only (matches generator logic)
    // Check if this is a race day workout (from tags or description)
    const isRaceDay = (() => {
      if (!row) return false;
      const rowTags: string[] = Array.isArray((row as any)?.tags) ? (row as any).tags.map((t:any)=>String(t).toLowerCase()) : [];
      const desc: string = String((row as any)?.description || '').toLowerCase();
      return rowTags.includes('race_day') || rowTags.includes('marathon_pace') || /race\s+day/i.test(desc);
    })();
    
    if (isRaceDay) {
      // Race day: fixed pace, no range (exact M pace target)
      out.pace_range = { lower: st.pace_sec_per_mi, upper: st.pace_sec_per_mi };
    } else {
      // Calculate pace range with appropriate tolerance
      // Use strict tolerance for quality work (matches Garmin/TrainingPeaks standards)
      // Use lenient tolerance for easy/recovery/long runs (accounts for terrain, fatigue)
      const paceSec = st.pace_sec_per_mi;
      const tolerance = (st?.kind === 'work') 
        ? 0.02   // ±2% for quality work (~10-20s for most paces)
        : 0.06;  // ±6% for easy runs (~30-60s for most paces)
      
      const lower = Math.round(paceSec * (1 - tolerance));
      const upper = Math.round(paceSec * (1 + tolerance));
      out.pace_range = { lower, upper };
    }
  }
  if (Array.isArray(st?.pace_range) && st.pace_range.length===2) {
    const a = Number(st.pace_range[0]); const b = Number(st.pace_range[1]);
    if (Number.isFinite(a) && Number.isFinite(b) && a>0 && b>0) {
      // Store as object with numeric properties for analysis
      out.pace_range = { lower: a, upper: b };
    }
  }
  if (st?.power_range && typeof st.power_range.lower === 'number' && typeof st.power_range.upper === 'number') {
    const lo = Math.round(st.power_range.lower);
    const up = Math.round(st.power_range.upper);
    out.powerTarget = `${Math.round((lo + up) / 2)} W`;
    out.powerRange = { lower: lo, upper: up };
  }
  if (typeof st?.label === 'string') out.label = st.label;
  if (st?.equipment) out.equipment = st.equipment;
  if (st?.equipment_detail) out.equipment_detail = st.equipment_detail; // D-197
  if (st?.strength) out.strength = st.strength;
  if (typeof st?.planned_index === 'number') out.planned_index = st.planned_index;
  if (st?.kind) out.kind = st.kind;
  /**
   * ⛔ THE PRESCRIPTION FIELDS RIDE THROUGH (2026-09-02, found on the verification pass the same
   * evening they shipped). This object is a WHITELIST — the same trap the strength rows hit five
   * times (`load_basis`, `slot_intent`, …). `stampRunPrescription` put `prescription`, `hr_range`
   * and `target_rpe` on the expanded step, and this function rebuilt the step without them, so the
   * calendar row, the phone summary and the Garmin push all read `computed.steps` and found nothing.
   * Deployed inert for a few hours. Carried now; the round-trip test pins it.
   */
  if (st?.prescription === 'heart_rate') out.prescription = 'heart_rate';
  if (st?.hr_range && typeof st.hr_range.lower === 'number' && typeof st.hr_range.upper === 'number') {
    out.hr_range = { lower: Math.round(st.hr_range.lower), upper: Math.round(st.hr_range.upper) };
  }
  if (st?.target_rpe && typeof st.target_rpe.lo === 'number' && typeof st.target_rpe.hi === 'number') {
    out.target_rpe = { lo: st.target_rpe.lo, hi: st.target_rpe.hi };
  }
  return out;
}

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  } as Record<string,string>;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  try {
    const payload = await req.json();
    // adapt-plan and some callers send `training_plan_id`; activate-plan uses `plan_id`.
    const planId: string | null = payload?.plan_id ?? payload?.training_plan_id ?? null;
    const plannedRowId: string | null = payload?.planned_workout_id ?? null;
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Find rows to materialize
    let rows: any[] = [];
    if (plannedRowId) {
      console.log(`[materialize-plan] Looking for planned_workout_id: ${plannedRowId}`);
      const { data, error } = await supabase.from('planned_workouts').select('*').eq('id', plannedRowId).limit(1);
      if (error) console.error(`[materialize-plan] Error querying planned_workout_id:`, error);
      rows = data || [];
      console.log(`[materialize-plan] Found ${rows.length} row(s) for planned_workout_id`);
    } else if (planId) {
      console.log(`[materialize-plan] Looking for plan_id: ${planId}`);
      const { data, error } = await supabase.from('planned_workouts').select('*').eq('training_plan_id', planId).order('date');
      if (error) console.error(`[materialize-plan] Error querying plan_id:`, error);
      rows = data || [];
      console.log(`[materialize-plan] Found ${rows.length} row(s) for plan_id`);
      if (rows.length > 0) {
        console.log(`[materialize-plan] Sample row: type=${rows[0].type}, has_steps_preset=${Array.isArray(rows[0].steps_preset) && rows[0].steps_preset.length > 0}, steps_preset=${JSON.stringify(rows[0].steps_preset)}`);
      }
    } else {
      return new Response(JSON.stringify({ error:'plan_id or planned_workout_id required' }), { status:400, headers:{ ...corsHeaders, 'Content-Type':'application/json'} });
    }
    if (!rows.length) {
      console.warn(`[materialize-plan] No rows found to materialize - returning early`);
      return new Response(JSON.stringify({ success:true, materialized:0 }), { headers:{ ...corsHeaders, 'Content-Type':'application/json'} });
    }

    // Load baselines for user inferred from first row
    const userId = rows[0]?.user_id;
    // D1: null when never recorded — planned bodyweight sets then score exactly as they do today.
    let plannedBodyweightLb: number | null = null;
    let lastWeightByMovement: Record<string, number> = {};
    let baselines: Baselines = {};
    try {
      // `weight` rides along for D1 — planned bodyweight sets are priced at the athlete's own body
      // weight, exactly as the completed side prices them, or the two stop reconciling.
      const { data: ub } = await supabase.from('user_baselines').select('performance_numbers, learned_fitness, locked_baselines, equipment, effort_source_distance, effort_source_time, configured_hr_zones, units, weight').eq('user_id', userId).maybeSingle();
      plannedBodyweightLb = resolveBodyweightLb(ub as any);
      // ⛔ AND WHAT THE ATHLETE LIFTS ON EACH MOVEMENT (2026-08-29). Viada leaves hypertrophy work
      // auto-regulated, so an accessory is authored "By feel" with no weight and stays that way —
      // this is the SCORE's number for it, and it is the athlete's own logged weight rather than a
      // figure we invented. Empty on a new athlete, which falls back to the bar exactly as before.
      lastWeightByMovement = await fetchLastWeightByMovement(supabase, userId);

      // Audit: strength tier + raw baselines (generate-combined-plan uses effectiveProtocolTier; materialize uses equipment list for substitutions)
      const strengthEquipArr = Array.isArray(ub?.equipment?.strength) ? (ub.equipment.strength as string[]) : [];
      let explicitGoalEquipmentType: string | undefined;
      // ⛔ RACE PACE IS THE ENTERED GOAL TIME ÷ THE RACE DISTANCE (Michael, 2026-09-02, final). Not a
      // ratio off threshold, not the vDOT table. No goal time → no race-pace target (effort only).
      let goalRacePaceSecPerMi: number | null = null;
      try {
        const planIdRef = rows[0]?.training_plan_id;
        if (planIdRef) {
          const { data: planRow } = await supabase.from('plans').select('goal_id').eq('id', planIdRef).maybeSingle();
          const gid = planRow?.goal_id as string | undefined;
          if (gid) {
            const { data: goalRow } = await supabase.from('goals').select('training_prefs, target_time, distance').eq('id', gid).maybeSingle();
            const tp = goalRow?.training_prefs as Record<string, unknown> | null | undefined;
            const et = tp?.equipment_type ?? tp?.equipmentType;
            if (et != null && String(et).trim()) explicitGoalEquipmentType = String(et).trim();
            goalRacePaceSecPerMi = goalRacePaceFromTargetTime(goalRow?.target_time, goalRow?.distance);
            if (goalRacePaceSecPerMi != null) console.log(`[Paces] Goal race pace: ${goalRacePaceSecPerMi}s/mi (target_time ${goalRow?.target_time}s over ${goalRow?.distance})`);
          }
        }
      } catch (e) {
        console.warn('[materialize] audit: could not load goal training_prefs / target_time:', e);
      }
      const hasFullBarbell = hasBarbellCapability(strengthEquipArr);
      const compoundSignals = hasCompound1RMSignals(ub?.performance_numbers);
      const effectiveProtocolTier = resolveStrengthEquipmentTypeForPlan(
        explicitGoalEquipmentType,
        strengthEquipArr,
        ub?.performance_numbers,
      );
      console.log('[materialize] performance_numbers (raw user_baselines):', JSON.stringify(ub?.performance_numbers ?? null, null, 2));
      console.log('[materialize] equipment.strength:', JSON.stringify(strengthEquipArr, null, 2));
      console.log('[materialize] equipment_type (from linked goal.training_prefs):', explicitGoalEquipmentType ?? '(none)');
      console.log('[materialize] hasFullBarbell:', hasFullBarbell);
      console.log('[materialize] compound1rmSignals:', compoundSignals);
      console.log('[materialize] effectiveProtocolTier (same rule as generate-combined-plan):', effectiveProtocolTier);
      
      // Recalculate effort_paces from effort_score if source is 'calculated' (fixes outdated paces)
      // ⛔ READ ONLY (2026-09-02, D-461). This used to recompute `effort_paces` from `effort_score` on
      // every materialization and WRITE the result back to user_baselines — a background process
      // rewriting the athlete's row. The row has one writer now; this reads what it finds.
      // ⛔ `effort_paces` IS NOT READ HERE ANY MORE (2026-09-02, the threshold-anchor cut). D-461 made
      // this a read-only consumer of the vDOT table; this cut removes the read. Every run pace comes
      // off the resolved threshold (`secPerMiFromBaseline`); the typed 5K reaches it only as the
      // resolver's seed.
      baselines = {
        ...(ub?.performance_numbers || {}),
        equipment: ub?.equipment || {},
        isMetric: ub?.units === 'metric',
      } as any;

      // D-287 — EASY PACE via the shared resolver, exactly as FTP does below. Before this, a plan WITHOUT a
      // snapshot pin resolved easy pace as `effort_paces.base -> performance_numbers.easyPace`, which is a
      // DIFFERENT precedence from every other surface (and ignored the athlete's Q-174 choice entirely). The
      // pin still wins for a plan's lifetime (§1 — that is correct and unchanged); this only fixes what an
      // UNPINNED plan resolves to. The resolver already considers effort_paces as its own third tier, so
      // nothing is lost — it is simply consulted in the one agreed order.
      const easyResolved = resolveCurrentRunEasyPace(ub as any);
      if (easyResolved.sec_per_mi != null) {
        (baselines as any)._resolvedEasySecPerMi = easyResolved.sec_per_mi;
        console.log(`[Paces] Resolved easy: ${easyResolved.sec_per_mi}s/mi (source=${easyResolved.source})`);
      }

      // ⛔ THRESHOLD PACE VIA THE SAME RESOLVER — AND IT HAD NEVER BEEN CONSULTED HERE AT ALL
      // (2026-08-19). Easy pace got the D-287 treatment above; threshold did not, and the omission
      // was not a smaller version of the same gap — it was a bigger one. The chain below resolves
      // threshold as `effort_paces.steady` and then `5K pace + 20 s/mi`, **neither of which reads
      // `learned_fitness`**. So a MEASURED threshold pace did not lose to the athlete's typed 5K on
      // this path; it was never entered. The 5K won by walkover, on every unpinned plan.
      //
      // ⚠️ AND THE 5K IS TYPED ONCE, MEASURED BY NOTHING, AND DATED BY NOTHING. As fitness changes
      // it goes stale, and a stale 5K prescribes a threshold that is too FAST — which in a
      // strength-led block is the expensive direction, because the session stops being threshold
      // and starts eating the lifting. The resolver now holds an inferred threshold to the band the
      // athlete's own measured easy pace implies (`src/lib/run-threshold-from-easy.ts`), so the
      // number that arrives here is already bounded.
      //
      // Sits BELOW the snapshot pin (§1 — a plan freezes its paces for its lifetime, unchanged) and
      // ABOVE the ad-hoc chain, exactly as easy pace does. `_thresholdBasis` travels with it so the
      // session copy can say which of the three states the athlete is in rather than guessing from
      // whether the number is non-null.
      // ⚠️ RESOLVED AGAINST `effortPaces`, NOT `ub.effort_paces`. The block above may have
      // RECALCULATED the paces from `effort_score` and used the new ones for everything downstream;
      // handing the resolver the stale row would make it answer about a different set of numbers
      // than the chain below it reads, which is the divergence this whole file keeps deleting.
      const thrResolved = resolveCurrentRunThresholdPace(ub as any);
      if (thrResolved.sec_per_mi != null) {
        (baselines as any)._resolvedThresholdSecPerMi = thrResolved.sec_per_mi;
        (baselines as any)._thresholdBasis = describeThresholdBasis(thrResolved).state;
        console.log(`[Paces] Resolved threshold: ${thrResolved.sec_per_mi}s/mi (source=${thrResolved.source})`);
      } else {
        // LAW 2 / D-285 — no number, and we say so rather than letting the chain below invent one.
        console.log('[Paces] No threshold pace on file — the chain below is the last word');
      }


      // ⛔ THE 5K, FOR 5K-PACE WORK ONLY (2026-09-02). A typed pace, or the race clock ÷ 3.107 — the
      // one 5K resolver. It seeds nothing and derives nothing; it prices `_5kpace` tokens and that is
      // all. The whole row goes in so a pre-D-461 wizard row (`effort_source_time`) still counts.
      const fiveKResolved = resolveCurrent5kPace(ub as any);
      if (fiveKResolved.sec_per_mi != null) {
        (baselines as any)._fiveKSecPerMi = fiveKResolved.sec_per_mi;
        console.log(`[Paces] Resolved 5K: ${fiveKResolved.sec_per_mi}s/mi (source=${fiveKResolved.source})`);
      }
      if (goalRacePaceSecPerMi != null) (baselines as any)._racePaceSecPerMi = goalRacePaceSecPerMi;
      // ⛔ PROVENANCE, written onto every row's `computed.anchors` (2026-09-02): the numbers this
      // materialization priced off. The six-week checkpoint diffs these against the live resolvers to
      // say what would change on the rows not yet started. Facts only; nothing reads them to prescribe.
      (baselines as any)._anchors = {
        as_of: new Date().toISOString().slice(0, 10),
        threshold_sec_per_mi: (baselines as any)._resolvedThresholdSecPerMi ?? null,
        threshold_basis: (baselines as any)._thresholdBasis ?? null,
        easy_sec_per_mi: (baselines as any)._resolvedEasySecPerMi ?? null,
        fiveK_sec_per_mi: (baselines as any)._fiveKSecPerMi ?? null,
        race_pace_sec_per_mi: goalRacePaceSecPerMi,
        ftp_w: typeof (baselines as any).ftp === 'number' ? (baselines as any).ftp : null,
      };

      // ⛔ EASY DAYS ARE PRESCRIBED AS A HEART-RATE ZONE (Michael, 2026-09-02, ruling 1). Off the
      // athlete's threshold heart rate through the one LTHR resolver; the band is Friel zone 2
      // (85–90% of LTHR), the zone Garmin and TrainingPeaks call aerobic / easy, which is where
      // Viada's VT1 (talk test, p235) sits. ⚠️ OURS: choosing Z2 as "easy" — the book gives a talk
      // test, not a percentage. No LTHR on file → no range (Law 2); the pace band still shows.
      const lthrResolved = resolveCurrentLthr(ub as any, { sport: 'run' });
      if (lthrResolved.bpm != null) {
        const z2 = frielZones(lthrResolved.bpm)[1];
        (baselines as any)._easyHrRange = { lower: z2.min, upper: z2.max };
        if ((baselines as any)._anchors) { (baselines as any)._anchors.lthr_bpm = lthrResolved.bpm; (baselines as any)._anchors.easy_hr_range = { lower: z2.min, upper: z2.max }; }
        console.log(`[HR] Easy zone: ${z2.min}–${z2.max} bpm (LTHR ${lthrResolved.bpm}, source=${lthrResolved.source})`);
      } else {
        console.log('[HR] No threshold heart rate on file — easy steps ship without a heart-rate range');
      }

      // FTP via shared precedence helper. Quality-gated for plan baking — accepts learned
      // (≥medium) > manual but REJECTS 'learned-low' (low-confidence values shouldn't get
      // baked into multi-week plan targets). Documented behavior change: prior code used
      // manual only (`...(ub?.performance_numbers || {})` spread sets baselines.ftp from
      // manual); now high-confidence learned overrides stale manual entries.
      const ftpResolved = resolveCurrentFtp(ub as any);
      if (ftpResolved.source === 'learned' || ftpResolved.source === 'manual') {
        (baselines as any).ftp = ftpResolved.value;
      }

      // Strength 1RM: manual performance_numbers wins, then learned_fitness.strength_1rms, then defaults.
      const learned = (typeof ub?.learned_fitness === 'string' ? JSON.parse(ub.learned_fitness || '{}') : ub?.learned_fitness) || {};
      const strength = learned?.strength_1rms || {};
      const perfRaw =
        ub?.performance_numbers && typeof ub.performance_numbers === 'object' && !Array.isArray(ub.performance_numbers)
          ? (ub.performance_numbers as Record<string, unknown>)
          : {};
      const perfSquat = Number(perfRaw.squat ?? perfRaw.squat1RM ?? perfRaw.squat_1rm);
      const perfBench = Number(perfRaw.bench ?? perfRaw.bench_press ?? perfRaw.benchPress);
      const perfDl = Number(perfRaw.deadlift ?? perfRaw.dead_lift);
      const perfOhp = Number(
        perfRaw.overheadPress1RM ?? perfRaw.ohp ?? perfRaw.overhead_press ?? perfRaw.overhead,
      );

      // D-322 line 10: pull-ups are a REP COUNT, not a 1RM, and the five-key assembly below
      // dropped them entirely — a value that saves and reads back perfectly (verified end-to-end
      // on a throwaway user) was discarded at the last hop, so no generator could ever see it.
      // Deliberately NOT routed through mergeAnchor1RmLb: that resolver exists to pick a LOAD and
      // falls back to a default pounds figure, which is meaningless here. Pass through only when
      // the athlete actually gave a number. **0 is valid** — "goal: your first pull-up" (Q-102) —
      // so the guard is `>= 0`, not truthy.
      const perfPullups = Number(
        perfRaw.pullupMaxReps ?? perfRaw.pullup_max_reps ?? perfRaw.pullups ?? perfRaw.pullup,
      );
      if (Number.isFinite(perfPullups) && perfPullups >= 0) {
        (baselines as any).pullupMaxReps = Math.round(perfPullups);
      }

      // ⛔ SINGLE SOURCE (2026-09-02): the legacy pre-snapshot defaults route through the SAME resolver
      // as the pin and live paths (locked > trusted-learned > typed seed). This block is overridden by
      // the athlete-snapshot read right below whenever a plan id exists; routing it too closes the
      // no-snapshot edge so the three plan-weight spots can never disagree again.
      const _legacyAsOf = new Date().toISOString().slice(0, 10);
      const _legacy = resolveStrengthNumbers(perfRaw, ub?.learned_fitness, (ub as any)?.locked_baselines, _legacyAsOf);
      (baselines as any).squat = _legacy.squat ?? 135;
      (baselines as any).bench = _legacy.bench ?? 135;
      let dlMerged = _legacy.deadlift ?? 0;
      if (dlMerged <= 0) {
        dlMerged = mergeAnchor1RmLb(undefined, strength.trap_bar_deadlift, 0); // trap-bar: accessory, no resolver key
      }
      if (dlMerged <= 0) dlMerged = 135;
      (baselines as any).deadlift = dlMerged;
      (baselines as any).overheadPress1RM = _legacy.overheadPress1RM ?? 95;
      const perfHip = Number(perfRaw.hipThrust ?? perfRaw.hip_thrust);
      const dlNum = (baselines as any).deadlift as number;
      (baselines as any).hipThrust = mergeAnchor1RmLb(
        Number.isFinite(perfHip) && perfHip > 0 ? perfHip : undefined,
        strength.hip_thrust,
        Math.max(75, Math.round(dlNum * 0.55)),
      );
      // **Athlete snapshot override** — read the plan-pinned snapshot AFTER the legacy merge so
      // the snapshot wins for new plans while legacy plans (no snapshot) fall back to the merge
      // result. Single read point at the top of the baseline-loading section ensures every
      // downstream materializer branch (research-config, legacy fallback, pre-resolved-numeric)
      // sees the same baselines — closes the per-session divergence (Week 16 vs Week 17 reading
      // different 1RMs in the same plan).
      try {
        const planIdForSnap = rows[0]?.training_plan_id;
        if (planIdForSnap) {
          const { data: planRowForSnap } = await supabase
            .from('plans')
            .select('config')
            .eq('id', planIdForSnap)
            .maybeSingle();
          const planConfigForSnap = (planRowForSnap?.config && typeof planRowForSnap.config === 'object'
            ? planRowForSnap.config
            : null) as Record<string, unknown> | null;
          const resolved = readAthleteSnapshotOrLive(
            planConfigForSnap,
            { performance_numbers: ub?.performance_numbers ?? null, learned_fitness: ub?.learned_fitness ?? null, locked_baselines: (ub as any)?.locked_baselines ?? null },
          );
          // Snapshot wins per field; preserve existing baselines.* (default fallbacks) when
          // snapshot has no value for that lift.
          if (resolved.performance_numbers.deadlift != null) (baselines as any).deadlift = resolved.performance_numbers.deadlift;
          if (resolved.performance_numbers.squat != null) (baselines as any).squat = resolved.performance_numbers.squat;
          if (resolved.performance_numbers.bench != null) (baselines as any).bench = resolved.performance_numbers.bench;
          if (resolved.performance_numbers.overheadPress1RM != null) (baselines as any).overheadPress1RM = resolved.performance_numbers.overheadPress1RM;
          if (resolved.performance_numbers.hipThrust != null) (baselines as any).hipThrust = resolved.performance_numbers.hipThrust;
          // Bike snapshot pin overrides the live `resolveCurrentFtp(ub)` value set above.
          // For plans with snapshots: frozen FTP for the plan's lifetime even if baselines
          // change. For plans without snapshots: live resolver value flows through unchanged.
          if (resolved.bike.ftp_w != null) (baselines as any).ftp = resolved.bike.ftp_w;
          // Run pace pin: stash on baselines so `secPerMiFromBaseline` finds it at the
          // highest-priority branch. Snapshot wins over PlanWizard effort_paces and
          // legacy performance_numbers — same single-source-of-truth principle as bike.
          // Field name prefixed with `_` to signal "internal materializer-only state",
          // not part of the persisted Baselines schema.
          if (
            resolved.run.threshold_pace_sec_per_mi != null ||
            resolved.run.easy_pace_sec_per_mi != null ||
            resolved.run.fiveK_pace_sec_per_mi != null
          ) {
            (baselines as any)._snapshotRunPaces = resolved.run;
          }
          console.log(`[materialize-plan] athlete-snapshot source=${resolved.source}`, {
            performance_numbers: resolved.performance_numbers,
            bike: resolved.bike,
            run: resolved.run,
          });
        }
      } catch (e) {
        console.warn('[materialize-plan] athlete-snapshot read failed; using merged baselines:', e);
      }

      console.log('[materialize-plan] strength 1RM (post-snapshot, manual > learned > default):', {
        squat: (baselines as any).squat,
        bench: (baselines as any).bench,
        deadlift: (baselines as any).deadlift,
        overheadPress1RM: (baselines as any).overheadPress1RM,
        hipThrust: (baselines as any).hipThrust,
      });
      console.log(`🔍 [FTP DEBUG] User ${userId} baselines:`, baselines);
      console.log(`🔍 [FTP DEBUG] FTP value:`, baselines?.ftp);
      console.log(`🔍 [EQUIPMENT DEBUG] Equipment:`, baselines?.equipment);
    } catch (e) {
      console.error(`❌ [FTP DEBUG] Error loading baselines:`, e);
    }

    // Load active plan adjustments for this user
    let adjustments: PlanAdjustment[] = [];
    try {
      const { data: adjData } = await supabase
        .from('plan_adjustments')
        .select('id, exercise_name, adjustment_factor, absolute_weight, weight_offset, substitute_exercise_name, add_meta, applies_from, applies_until, status')
        .eq('user_id', userId)
        .eq('status', 'active');
      adjustments = adjData || [];
      if (adjustments.length > 0) {
        console.log(`🔧 Found ${adjustments.length} active plan adjustments for user`);
      }
    } catch (e) {
      console.error(`❌ Error loading plan adjustments:`, e);
    }

    const strengthIntent = await loadStrengthIntentForPlan(rows[0]?.training_plan_id, supabase);
    const swimIntentMat = await loadSwimIntentForPlan(rows[0]?.training_plan_id, supabase);

    // Step 0 (adapt-plan foundation): the plan's protocol + per-week phase, so strength rows without an
    // explicit target RIR materialize with the correct lift/phase-aware target. Loaded once; per-row
    // phase resolved below via the canonical resolver. Failure is graceful (null → durability base).
    let rirPlanConfig: any = null;
    let rirProtocolId: string | null = null;
    try {
      const { data: planRowForRir } = await supabase
        .from('plans')
        .select('config')
        .eq('id', rows[0]?.training_plan_id)
        .maybeSingle();
      rirPlanConfig = planRowForRir?.config ?? null;
      rirProtocolId = (rirPlanConfig?.strength_protocol as string | undefined) ?? null;
      // D-322: strength-PRIMARY plans ("Get Strong") never write `config.strength_protocol` —
      // they aren't produced by the run/tri protocol selector at all. So `rirProtocolId` stayed
      // null and every one of them resolved to the `durability` default: a flat RIR 2.5 across a
      // block that ends in 94% doubles. The plan says what it is in `config.source`; read it.
      if (!rirProtocolId && String(rirPlanConfig?.source ?? '').toLowerCase() === 'strength_primary') {
        rirProtocolId = 'strength_primary';
      }
    } catch (_e) { /* graceful: null → getTargetRir uses the durability base, still lift-aware */ }

    // Adapt-a-plan add: decide once, across all rows, which added lifts land on which strength days
    // (matching focus + the 2×/week science cap), then hand each row only its share below.
    const addInjectionsByRow = planAddInjections(rows, adjustments, baselines, rirPlanConfig);
    if (swimIntentMat) {
      console.log('[materialize-plan] swim_intent:', swimIntentMat);
    }

    let count = 0;
    for (const row of rows) {
      try {
        console.log(`📋 Materializing: ${row.type} - ${row.name} (${row.id})`);
        const tokens: string[] = Array.isArray(row?.steps_preset) ? row.steps_preset : [];
        const rowTags: string[] = Array.isArray((row as any)?.tags)
          ? (row as any).tags.map((t: any) => String(t).toLowerCase())
          : [];

        // Assessment sessions bypass token expansion — inject pre-built steps directly.
        if (rowTags.includes('assessment')) {
          const assessSteps = buildAssessmentSteps(rowTags);
          if (assessSteps.length > 0) {
            const withIndex = assessSteps.map((st, idx) => ({ ...st, planned_index: idx }));
            const v3 = withIndex.map((st: any) => toV3Step(st, row));
            const actualTotal = v3.reduce((sum: number, st: any) => sum + (Number(st?.seconds) || 0), 0);
            const originalDuration = typeof row.duration === 'number' && row.duration > 0 ? row.duration : 0;
            const finalTotalSeconds = actualTotal > 0 ? actualTotal : (originalDuration * 60);
            const finalDuration = actualTotal > 0 ? Math.round(actualTotal / 60) : (originalDuration > 0 ? originalDuration : 1);
            const update: any = {
              computed: { normalization_version: 'v3', steps: v3, total_duration_seconds: finalTotalSeconds, anchors: (baselines as any)._anchors ?? null },
              total_duration_seconds: finalTotalSeconds,
              duration: Math.max(1, finalDuration),
            };
            await supabase.from('planned_workouts').update(update).eq('id', String(row.id));
            count++;
            continue;
          }
        }

        const weekNum =
          typeof row?.week_number === 'number' && Number.isFinite(row.week_number)
            ? row.week_number
            : null;
        const rowPhaseForRir = resolvePlanPhase(rirPlanConfig, weekNum);
        const addsForRow = addInjectionsByRow.get(String(row.id)) || [];
        const { steps, total_s, swim_equipment_suggested, swim_equipment_optional_suggested } = expandTokensForRow(row, baselines, adjustments, strengthIntent, weekNum, rirProtocolId, rowPhaseForRir, addsForRow, lastWeightByMovement);
        console.log(`  ✅ Generated ${steps.length} steps, total_s: ${total_s} (${Math.floor(total_s/60)}:${String(total_s%60).padStart(2,'0')})`);
        
        // Log error if materialization failed but tokens exist
        if (steps.length === 0 && tokens.length > 0) {
          console.error(`❌ Materialization failed for ${row.id}:`);
          console.error(`   Type: ${row.type}`);
          console.error(`   Name: ${row.name}`);
          console.error(`   Tokens: ${tokens.join(', ')}`);
          console.error(`   This indicates tokens did not match any patterns or fallbacks failed`);
        }
        
        if (steps && steps.length) {
          // Count recovery steps
          const recoverySteps = steps.filter((st:any) => st.kind === 'recovery' || st.kind === 'rest').length;
          console.log(`  🔄 Recovery steps: ${recoverySteps}`);
          // Assign stable planned_index per step
          const withIndex = steps.map((st:any, idx:number)=> ({ ...st, planned_index: idx }));
          const v3 = withIndex.map((st: any) => toV3Step(st, row));
          // Recalculate total from v3 steps (which have calculated durations for distance-based steps)
          const actualTotal = v3.reduce((sum:number, st:any) => sum + (Number(st?.seconds) || 0), 0);
          // For strength workouts with no calculated duration, preserve the original duration from the plan
          const originalDuration = typeof row.duration === 'number' && row.duration > 0 ? row.duration : 0;
          const finalTotalSeconds = actualTotal > 0 ? actualTotal : (originalDuration * 60);
          const finalDuration = actualTotal > 0 ? Math.round(actualTotal / 60) : (originalDuration > 0 ? originalDuration : 1);
          const update: any = {
            computed: {
              normalization_version: 'v3',
              steps: v3,
              total_duration_seconds: finalTotalSeconds,
              anchors: (baselines as any)._anchors ?? null,
              ...(Array.isArray(swim_equipment_suggested) && swim_equipment_suggested.length > 0
                ? { swim_equipment_suggested }
                : {}),
              ...(Array.isArray(swim_equipment_optional_suggested) && swim_equipment_optional_suggested.length > 0
                ? { swim_equipment_optional_suggested }
                : {}),
            },
            total_duration_seconds: finalTotalSeconds,
            duration: Math.max(1, finalDuration),
          };
          
          // Update race day description to match actual pace used in computed steps
          const isRaceDay = (() => {
            const rowTags: string[] = Array.isArray((row as any)?.tags) ? (row as any).tags.map((t:any)=>String(t).toLowerCase()) : [];
            const desc: string = String((row as any)?.description || '').toLowerCase();
            return rowTags.includes('race_day') || rowTags.includes('marathon_pace') || /race\s+day/i.test(desc);
          })();
          
          if (isRaceDay) {
            // Find the actual pace used in computed steps (should be from corrected baselines)
            const raceStep = v3.find((st: any) => st?.pace_sec_per_mi || st?.paceTarget);
            if (raceStep) {
              const paceSec = raceStep.pace_sec_per_mi || (() => {
                const match = String(raceStep.paceTarget || '').match(/(\d+):(\d+)/);
                if (match) return parseInt(match[1]) * 60 + parseInt(match[2]);
                return null;
              })();
              
              if (paceSec) {
                // Always update description to match the pace actually used in computed steps
                const paceMin = Math.floor(paceSec / 60);
                const paceSecRem = Math.round(paceSec % 60);
                const paceFormatted = `${paceMin}:${String(paceSecRem).padStart(2, '0')}/mi`;
                
                // Update description to reflect actual pace used
                const oldDesc = String((row as any)?.description || '');
                const newDesc = oldDesc.replace(/\((\d+):(\d+)\/mi\)/, `(${paceFormatted})`);
                if (newDesc !== oldDesc) {
                  update.description = newDesc;
                  update.rendered_description = newDesc; // Also update rendered_description
                  console.log(`[Paces] 🔧 Updated race day description: "${oldDesc}" → "${newDesc}"`);
                  console.log(`[Paces] 🔧 Pace: ${oldDesc.match(/\((\d+):(\d+)\/mi\)/)?.[0] || 'unknown'} → ${paceFormatted} (${paceSec}s/mi)`);
                } else {
                  console.log(`[Paces] ✓ Race day description already matches computed pace: ${paceFormatted} (${paceSec}s/mi)`);
                }
              } else {
                console.log(`[Paces] ⚠️  Race day workout but no pace found in computed steps`);
              }
            } else {
              console.log(`[Paces] ⚠️  Race day workout but no steps found`);
            }
          }
          
          // Planned STRENGTH load = weight lifted, not the clock. The activate-plan estimate is
          // duration-based (calculateDurationWorkload) while the DONE side is tonnage-based, so a session
          // read e.g. 56 planned / 25 done for identical work. Here the weights are resolved to lb, so
          // recompute workload_planned on the SAME tonnage basis as actual — they now reconcile. Carries
          // (weight 0) contribute 0 on both sides for now; capturing carry load is a separate fix (Q-180).
          if (row.type === 'strength') {
            const strengthEx = steps
              .filter((st:any) => st?.kind === 'strength' && st?.strength && typeof st.strength === 'object')
              // ⚠️ `name` now rides along: pricing a set has to ask the exercise whether a band on
              // it is the load or is assistance (D1), and the name is the only way to ask.
              .map((st:any) => ({ name: st.strength.name, sets: st.strength.sets, reps: st.strength.reps, weight: st.strength.weight, target_rir: st.strength.target_rir }));
            const plannedLoad = calculatePlannedStrengthWorkload(strengthEx, { bodyweightLb: plannedBodyweightLb, lastWeightByMovement });
            if (plannedLoad > 0) update.workload_planned = plannedLoad;
          }

          // Debug: Log band exercises before DB write
          const bandSteps = v3.filter((st:any) => st?.kind === 'strength' && String(st?.strength?.name ?? '').toLowerCase().includes('band'));
          if (bandSteps.length > 0) {
            console.log(`💾 Writing ${bandSteps.length} band exercises to DB:`, bandSteps.map((st:any) => ({ name: st.strength.name, notes: st.strength.notes })));
          }

          await supabase.from('planned_workouts').update(update).eq('id', String(row.id));
          count += 1;
        }
      } catch (err) {
        console.error(`❌ Error materializing ${row.id}:`, err);
      }
    }
    return new Response(JSON.stringify({ success:true, materialized: count }), { headers:{ ...corsHeaders, 'Content-Type':'application/json'} });
  } catch (e) {
    return new Response(JSON.stringify({ error:String(e) }), { status:500, headers:{ ...corsHeaders, 'Content-Type':'application/json'} });
  }
});



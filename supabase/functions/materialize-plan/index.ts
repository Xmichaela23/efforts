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
import { calculatePlannedStrengthWorkload } from '../_shared/workload.ts';
import { getExerciseConfig, getBaseline1RM, formatWeightDisplay } from '../../../src/lib/exercise-config.ts';
import { getPacesFromScore } from '../generate-run-plan/effort-score.ts';
import {
  swimDrillDisplayName,
  swimDrillEquipmentFromTokens,
  swimGearLabelForDisplay,
  swimGearNormalized,
} from '../../../src/lib/plan-tokens/swim-drill-tokens.ts';
import { resolveCurrentFtp } from '../../../src/lib/resolve-current-ftp.ts';
import { resolveCurrentRunEasyPace } from '../../../src/lib/resolve-current-run-pace.ts';

// Type for plan adjustments
type PlanAdjustment = {
  id: string;
  exercise_name: string;
  adjustment_factor?: number;
  absolute_weight?: number;
  weight_offset?: number; // Offset maintains plan progression (e.g., -10 lb)
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

import { readAthleteSnapshotOrLive } from '../_shared/athlete-snapshot.ts';

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
  // New effort_paces from PlanWizard (seconds per mile)
  effort_paces?: {
    base: number;    // Easy pace
    race: number;    // Marathon pace
    steady: number;  // Threshold pace
    power: number;   // Interval/5K pace
    speed: number;   // Repetition pace
  };
};

function parsePaceToSecPerMi(v: any): number | null {
  try {
    if (v == null) return null;
    if (typeof v === 'number' && v > 0) return v; // already sec/mi
    const txt = String(v).trim();
    if (!txt) return null;
    // formats: mm:ss/mi or mm:ss /km
    const m = txt.match(/(\d{1,2}):(\d{2})\s*\/(mi|km)/i);
    if (m) {
      const sec = parseInt(m[1],10)*60 + parseInt(m[2],10);
      const unit = m[3].toLowerCase();
      if (unit === 'mi') return sec;
      if (unit === 'km') return Math.round(sec * 1.60934);
      return sec;
    }
    // plain mm:ss
    const m2 = txt.match(/(\d{1,2}):(\d{2})/);
    if (m2) return parseInt(m2[1],10)*60 + parseInt(m2[2],10);
  } catch {}
  return null;
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

  // §2 PREFER effort_paces from PlanWizard (already in seconds per mile)
  if (b.effort_paces) {
    if (which === 'fivek' && b.effort_paces.power) {
      console.log(`[Paces] Using effort_paces.power for 5K: ${b.effort_paces.power}s/mi`);
      return b.effort_paces.power;
    }
    if (which === 'easy' && b.effort_paces.base) {
      const paceSec = b.effort_paces.base;
      const min = Math.floor(paceSec / 60);
      const sec = paceSec % 60;
      console.log(`[Paces] Using effort_paces.base for easy: ${paceSec}s/mi (${min}:${String(sec).padStart(2,'0')}/mi)`);
      return b.effort_paces.base;
    }
    if (which === 'marathon' && b.effort_paces.race) {
      const paceSec = b.effort_paces.race;
      const min = Math.floor(paceSec / 60);
      const sec = paceSec % 60;
      console.log(`[Paces] Using effort_paces.race for marathon: ${paceSec}s/mi (${min}:${String(sec).padStart(2,'0')}/mi)`);
      return b.effort_paces.race;
    }
    if (which === 'threshold' && b.effort_paces.steady) {
      console.log(`[Paces] Using effort_paces.steady for threshold: ${b.effort_paces.steady}s/mi`);
      return b.effort_paces.steady;
    }
  }
  
  // FALLBACK to legacy performance_numbers
  let raw: any;
  if (which === 'fivek') {
    raw = b.fiveK_pace ?? b.fiveKPace ?? b.fiveK;
  } else if (which === 'marathon') {
    raw = b.marathonPace ?? b.marathon_pace;
    // If no marathon pace, estimate from easy pace (+30sec slower)
    if (raw == null && (b.easyPace || b.easy_pace)) {
      const easyPace = parsePaceToSecPerMi(b.easyPace ?? b.easy_pace);
      if (easyPace) return easyPace - 30; // Marathon is faster than easy, typically ~30s/mi
    }
  } else if (which === 'threshold') {
    // Threshold not in legacy - estimate from 5K pace + 20s
    const fkp = secPerMiFromBaseline(b, 'fivek');
    if (fkp) return fkp + 20;
    return null;
  } else {
    raw = b.easyPace ?? b.easy_pace;
  }
  return parsePaceToSecPerMi(raw);
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
  if (name.includes('leg curl') && !hasGymAccess) {
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

function expandRunToken(tok: string, baselines: Baselines): any[] {
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
  
  // Long run DISTANCE based: longrun_18mi_easypace
  if (/longrun_\d+mi_easypace/.test(lower)) {
    const m = lower.match(/longrun_(\d+)mi/);
    if (m) {
      const miles = parseInt(m[1], 10);
      out.push({ id: uid(), kind: 'work', distance_m: milesToMeters(miles), pace_sec_per_mi: secPerMiFromBaseline(baselines, 'easy') || undefined });
      return out;
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
    const fkp = secPerMiFromBaseline(baselines,'fivek');
    const pace = fkp != null ? (fkp + 20) : undefined;
    out.push({ id: uid(), kind:'work', duration_s: sec, pace_sec_per_mi: pace }); 
    return out;
  }
  
  // Tempo: tempo_5mi_threshold (distance-based threshold)
  if (/tempo_\d+mi_threshold/.test(lower)) {
    const m = lower.match(/tempo_(\d+)mi_threshold/);
    if (m) {
      const miles = parseInt(m[1],10);
      const fkp = secPerMiFromBaseline(baselines,'fivek');
      const pace = fkp != null ? (fkp + 20) : undefined;
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
  if (/^run_vo2_\d+x\d+min_z5$/.test(lower)) {
    const m = lower.match(/^run_vo2_(\d+)x(\d+)min_z5$/);
    if (m) {
      const reps = parseInt(m[1], 10);
      const workMin = parseInt(m[2], 10);
      const work_s = workMin * 60;
      const rest_s = 90;
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
      const fkp = secPerMiFromBaseline(baselines, 'fivek');
      const thresholdPace = fkp != null ? (fkp + 20) : undefined;
      const easyPace = secPerMiFromBaseline(baselines, 'easy') || undefined;
      for (let i = 0; i < reps; i++) {
        out.push({ id: uid(), kind: 'work', distance_m: milesToMeters(miles), pace_sec_per_mi: thresholdPace });
        if (rest_s > 0 && i < reps - 1) out.push({ id: uid(), kind: 'recovery', duration_s: rest_s, pace_sec_per_mi: easyPace });
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
      
      // Strides are fast but relaxed - no specific pace target, just "fast"
      // They're done at ~95% max speed but staying relaxed
      // Recovery is walk/jog (90s is standard)
      const rest_s = 90;
      
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
        // Recovery between strides: walk/jog (except after last one)
        if (i < reps - 1) {
          out.push({ 
            id: uid(), 
            kind: 'recovery', 
            duration_s: rest_s, 
            pace_sec_per_mi: easyPace,
            label: 'Walk/Jog'
          });
        }
      }
      return out;
    }
  }
  
  return out;
}

function expandBikeToken(tok: string, baselines: Baselines): any[] {
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
  // SS: bike_ss_3x12min_R4min
  let m = lower.match(/bike_ss_(\d+)x(\d+)min_r(\d+)min/);
  if (m) { 
    const reps=parseInt(m[1],10), work=parseInt(m[2],10)*60, rest=parseInt(m[3],10)*60; 
    console.log(`🔍 [BIKE DEBUG] Sweet spot match: ${reps}x${work/60}min, rest=${rest/60}min`);
    for(let i=0;i<reps;i++){ 
      const powerRange = pctRange(0.85,0.95);
      console.log(`🔍 [BIKE DEBUG] Adding work step ${i+1}/${reps} with power_range:`, powerRange);
      out.push({ id: uid(), kind:'work', duration_s: work, power_range: powerRange }); 
      if(rest) out.push({ id: uid(), kind:'recovery', duration_s: rest }); 
    } 
    return out; 
  }
  // Threshold: bike_thr_4x8min_R5min
  m = lower.match(/bike_thr_(\d+)x(\d+)min_r(\d+)min/);
  if (m) { const reps=parseInt(m[1],10), work=parseInt(m[2],10)*60, rest=parseInt(m[3],10)*60; for(let i=0;i<reps;i++){ out.push({ id: uid(), kind:'work', duration_s: work, power_range: pctRange(0.95,1.05) }); if(rest) out.push({ id: uid(), kind:'recovery', duration_s: rest }); } return out; }
  // VO2: bike_vo2_5x4min_R4min
  m = lower.match(/bike_vo2_(\d+)x(\d+)min_r(\d+)min/);
  if (m) { const reps=parseInt(m[1],10), work=parseInt(m[2],10)*60, rest=parseInt(m[3],10)*60; for(let i=0;i<reps;i++){ out.push({ id: uid(), kind:'work', duration_s: work, power_range: pctRange(1.1,1.2) }); if(rest) out.push({ id: uid(), kind:'recovery', duration_s: rest }); } return out; }
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

function expandTokensForRow(
  row: any,
  baselines: Baselines,
  adjustments: PlanAdjustment[] = [],
  strengthIntent: StrengthIntentMat = null,
  planWeekNumber: number | null = null,
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
          const name = substituted.name;
          const equipmentNotes = substituted.notes;
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

          // If the prescription is qualitative (e.g., "Light"), preserve it as display text.
          if (isQualitativeStrengthWeight((ex as any)?.weight)) {
            weightDisplay = qualitativeWeightDisplay((ex as any)?.weight);
            baselineMissing = false;
            requiredBaseline = undefined;
            percent_1rm = undefined;
            resolved_from = undefined;
          } else if (isPreResolvedNumeric) {
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
            const result = calculateWeightFromConfig(name, targetPercent, baselines as any, reps, !isStrengthPrimary);
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
          const target_rir = typeof ex?.target_rir === 'number' ? ex.target_rir : undefined;
          
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
            finalWeightDisplay = fallbackUnresolvedPercentDisplay((ex as any)?.weight, reps);
          }

          const strength = { name, sets, reps, weight: finalWeight, weight_display: finalWeightDisplay, percent_1rm, resolved_from, notes: equipmentNotes, baseline_missing: baselineMissing, required_baseline: baselineLabel, target_rir, adjusted: wasAdjusted, original_weight: originalWeight } as any;
          if (String(name ?? '').toLowerCase().includes('band')) {
            console.log(`🎸 Band exercise created:`, { name, notes: equipmentNotes, hasNotes: !!equipmentNotes });
          }
          steps.push({ id: uid(), kind:'strength', strength });
        }
        return { steps, total_s: 0 };
      }
    } catch {}
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
          const name = substituted.name;
          const equipmentNotes = substituted.notes;
          // Q-180: a substitution can change the UNIT, not just the name. A 20 m sled push swapped for a
          // loaded walking lunge (or a sled pull swapped for a dumbbell row) is a REP exercise — it must
          // not inherit the sled's distance. Previously it did: a dumbbell row prescribed in metres.
          if (substituted.reps !== undefined) reps = substituted.reps;
          
          // Use research-based exercise config for weight calculation
          const exerciseConfig = getExerciseConfig(name);
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

          // If the prescription is qualitative (e.g., "Light"), preserve it as display text.
          if (isQualitativeStrengthWeight((ex as any)?.weight)) {
            weightDisplay = qualitativeWeightDisplay((ex as any)?.weight);
            baselineMissing = false;
            requiredBaseline = undefined;
            percent_1rm = undefined;
            resolved_from = undefined;
          } else if (isPreResolvedNumeric2) {
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
            const result = calculateWeightFromConfig(name, targetPercent, baselines as any, typeof reps === 'number' ? reps : undefined, !isStrengthPrimary);
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
          const target_rir = typeof ex?.target_rir === 'number' ? ex.target_rir : undefined;
          
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
            finalWeightDisplay = fallbackUnresolvedPercentDisplay((ex as any)?.weight, reps);
          }

          const strength = { name, sets, reps, weight: finalWeight, weight_display: finalWeightDisplay, percent_1rm, resolved_from, notes: equipmentNotes, baseline_missing: baselineMissing, required_baseline: baselineLabel, target_rir, adjusted: wasAdjusted, original_weight: originalWeight } as any;
          if (String(name ?? '').toLowerCase().includes('band')) {
            console.log(`🎸 Band exercise created:`, { name, notes: equipmentNotes, hasNotes: !!equipmentNotes });
          }
          steps.push({ id: uid(), kind:'strength', strength });
        }
        return { steps, total_s: 0 };
      }
    } catch {}
    // Fallback placeholder if no details present
    steps.push({ id: uid(), kind:'strength', strength: { name: 'strength block' } });
    return { steps, total_s: 0 };
  }
  console.log(`🔍 Parsing ${tokens.length} tokens for ${discipline}:`, tokens);
  for (const tok of tokens) {
    let added: any[] = [];
    if (discipline==='run' || discipline==='walk') added = expandRunToken(tok, baselines);
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

function toV3Step(st: any, row?: any): any {
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
    let baselines: Baselines = {};
    try {
      const { data: ub } = await supabase.from('user_baselines').select('performance_numbers, learned_fitness, equipment, effort_paces, effort_score, effort_paces_source, units').eq('user_id', userId).maybeSingle();

      // Audit: strength tier + raw baselines (generate-combined-plan uses effectiveProtocolTier; materialize uses equipment list for substitutions)
      const strengthEquipArr = Array.isArray(ub?.equipment?.strength) ? (ub.equipment.strength as string[]) : [];
      let explicitGoalEquipmentType: string | undefined;
      try {
        const planIdRef = rows[0]?.training_plan_id;
        if (planIdRef) {
          const { data: planRow } = await supabase.from('plans').select('goal_id').eq('id', planIdRef).maybeSingle();
          const gid = planRow?.goal_id as string | undefined;
          if (gid) {
            const { data: goalRow } = await supabase.from('goals').select('training_prefs').eq('id', gid).maybeSingle();
            const tp = goalRow?.training_prefs as Record<string, unknown> | null | undefined;
            const et = tp?.equipment_type ?? tp?.equipmentType;
            if (et != null && String(et).trim()) explicitGoalEquipmentType = String(et).trim();
          }
        }
      } catch (e) {
        console.warn('[materialize] audit: could not load goal training_prefs.equipment_type:', e);
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
      let effortPaces = ub?.effort_paces;
      if (ub?.effort_score && ub?.effort_paces_source === 'calculated' && effortPaces) {
        // Recalculate all paces from effort_score using shared calculation function
        // This fixes plans created before the race pace calculation fix
        const score = Number(ub.effort_score);
        if (Number.isFinite(score) && score > 0) {
          try {
            const recalculatedPaces = getPacesFromScore(score);
            
            // Always recalculate if stored pace differs (even by 1 second) to ensure consistency
            if (Math.abs((effortPaces.race || 0) - recalculatedPaces.race) > 0) {
              console.log(`[Paces] 🔧 Recalculating paces from effort_score ${score}: race ${effortPaces.race}s/mi → ${recalculatedPaces.race}s/mi`);
              effortPaces = recalculatedPaces; // Use all recalculated paces for consistency
              
              // Also update user_baselines to persist the correction
              try {
                await supabase.from('user_baselines').update({
                  effort_paces: recalculatedPaces,
                  effort_updated_at: new Date().toISOString()
                }).eq('user_id', userId);
                console.log(`[Paces] ✅ Updated user_baselines.effort_paces with corrected race pace`);
              } catch (updateErr) {
                console.error(`[Paces] ⚠️  Failed to update user_baselines:`, updateErr);
                // Continue - baselines object is already updated in memory
              }
            }
          } catch (e) {
            console.error(`[Paces] ⚠️  Error recalculating paces from effort_score:`, e);
            // Continue with stored paces if recalculation fails
          }
        }
      }
      
      baselines = {
        ...(ub?.performance_numbers || {}),
        equipment: ub?.equipment || {},
        effort_paces: effortPaces || undefined,
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

      (baselines as any).squat = mergeAnchor1RmLb(
        Number.isFinite(perfSquat) && perfSquat > 0 ? perfSquat : undefined,
        strength.squat,
        135,
      );
      (baselines as any).bench = mergeAnchor1RmLb(
        Number.isFinite(perfBench) && perfBench > 0 ? perfBench : undefined,
        strength.bench_press,
        135,
      );
      let dlMerged = mergeAnchor1RmLb(
        Number.isFinite(perfDl) && perfDl > 0 ? perfDl : undefined,
        strength.deadlift,
        0,
      );
      if (dlMerged <= 0) {
        dlMerged = mergeAnchor1RmLb(undefined, strength.trap_bar_deadlift, 0);
      }
      if (dlMerged <= 0) dlMerged = 135;
      (baselines as any).deadlift = dlMerged;
      (baselines as any).overheadPress1RM = mergeAnchor1RmLb(
        Number.isFinite(perfOhp) && perfOhp > 0 ? perfOhp : undefined,
        strength.overhead_press,
        95,
      );
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
            { performance_numbers: ub?.performance_numbers ?? null, learned_fitness: ub?.learned_fitness ?? null },
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
      if (ub?.effort_paces) {
        console.log(`[Paces] Found effort_paces from PlanWizard:`, baselines.effort_paces);
        console.log(`[Paces] Effort Score: ${ub?.effort_score || 'not set'}, Source: ${ub?.effort_paces_source || 'unknown'}`);
      } else {
        console.log(`[Paces] ⚠️  No effort_paces found - will fall back to legacy performance_numbers`);
      }
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
        .select('id, exercise_name, adjustment_factor, absolute_weight, weight_offset, applies_from, applies_until, status')
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
              computed: { normalization_version: 'v3', steps: v3, total_duration_seconds: finalTotalSeconds },
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
        const { steps, total_s, swim_equipment_suggested, swim_equipment_optional_suggested } = expandTokensForRow(row, baselines, adjustments, strengthIntent, weekNum);
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
              .map((st:any) => ({ sets: st.strength.sets, reps: st.strength.reps, weight: st.strength.weight, target_rir: st.strength.target_rir }));
            const plannedLoad = calculatePlannedStrengthWorkload(strengthEx);
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



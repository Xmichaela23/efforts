// ============================================================================
// STRENGTH OVERLAY SYSTEM v3.0 - Protocol-based architecture
// 
// Uses shared strength-system module with protocol/placement/guardrails separation.
// ============================================================================

import { TrainingPlan, Session, StrengthExercise, Phase, PhaseStructure } from './types.ts';
import { getProtocol } from '../shared/strength-system/protocols/selector.ts';
import { simplePlacementPolicy } from '../shared/strength-system/placement/simple.ts';
import { mapApproachToMethodology } from '../shared/strength-system/placement/strategy.ts';
import {
  ProtocolContext,
  StrengthPhase,
  PlacedSession,
  IntentSession,
} from '../shared/strength-system/protocols/types.ts';
import type { PlanningMemoryContext } from '../_shared/athlete-memory.ts';

/** Interference risk threshold above which we force noDoubles. Science: AMPK/mTOR conflict is highest within 6 hrs of concurrent sessions. */
const INTERFERENCE_RISK_NO_DOUBLES_THRESHOLD = 0.65;

/** Minimum confidence required to display computed weight instead of "X% 1RM" text. */
const WEIGHT_RESOLUTION_CONFIDENCE_THRESHOLD = 0.7;

// ============================================================================
// STRENGTH 1RM WEIGHT RESOLVER
// ============================================================================

/**
 * Maps protocol exercise display names to their canonical anchor lift keys.
 * Must match the canonical keys in canonicalize.ts and STRENGTH_ANCHORS.
 */
const DISPLAY_TO_ANCHOR: Record<string, string> = {
  'back squat':          'squat',
  'squat':               'squat',
  'trap bar deadlift':   'trap_bar_deadlift',
  'deadlift':            'deadlift',
  'hip thrusts':         'hip_thrust',
  'hip thrust':          'hip_thrust',
  'bench press':         'bench_press',
  'barbell rows':        'barbell_row',
  'barbell row':         'barbell_row',
  'bent over row':       'barbell_row',
  'overhead press':      'overhead_press',
  'ohp':                 'overhead_press',
  'shoulder press':      'overhead_press',
};

/**
 * Parse a percentage from a weight string like "85% 1RM" or "75% 1RM".
 * Returns the percentage as a decimal (0.85), or null if not parseable.
 */
function parsePercentage(weight: string): number | null {
  const match = weight.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!match) return null;
  const pct = parseFloat(match[1]);
  return Number.isFinite(pct) && pct > 0 && pct <= 100 ? pct / 100 : null;
}

/**
 * Post-process all exercises in placed sessions to substitute computed weights
 * when the athlete's 1RM is known with sufficient confidence.
 *
 * "85% 1RM" → "225 lbs (85%)"  [when confidence >= 0.7]
 * "85% 1RM" → "85% 1RM"        [when confidence < 0.7 or no data]
 *
 * Also applies auto-regulatory set reduction for drift-flagged lifts:
 * a lift that dropped >7% since last memory snapshot gets sets cut by 1
 * (e.g., 3×3 → 2×3) and a note added.
 */
function resolveExerciseWeights(
  sessions: PlacedSession[],
  memoryContext: PlanningMemoryContext,
  isMetric = false,
): PlacedSession[] {
  const { strength1RMs, driftFlaggedLifts } = memoryContext;
  if (Object.keys(strength1RMs).length === 0) return sessions;

  return sessions.map(session => {
    if (!session.exercises?.length) return session;

    const resolvedExercises = session.exercises.map((ex: StrengthExercise) => {
      const nameLower = (ex.name ?? '').toLowerCase().trim();
      const anchorKey = DISPLAY_TO_ANCHOR[nameLower];
      if (!anchorKey) return ex;

      const ruleKey = `${anchorKey}_1rm_est`;
      const rule = strength1RMs[ruleKey];
      if (!rule) return ex;

      let updatedEx = { ...ex };

      // Weight resolution: substitute actual weight when confidence is sufficient
      if (rule.confidence >= WEIGHT_RESOLUTION_CONFIDENCE_THRESHOLD) {
        const pct = parsePercentage(String(ex.weight ?? ''));
        if (pct !== null) {
          const increment = isMetric ? 2.5 : 5;
          const minWeight = isMetric ? 2.5 : 5;
          const computedWeight = Math.max(minWeight, Math.round((rule.value * pct) / increment) * increment);
          const unitLabel = isMetric ? 'kg' : 'lbs';
          updatedEx.weight = `${computedWeight} ${unitLabel} (${Math.round(pct * 100)}%)`;
        }
      }

      // Auto-regulatory drift reduction: if this lift is flagged, cut sets by 1
      if (driftFlaggedLifts.includes(anchorKey) && typeof updatedEx.sets === 'number' && updatedEx.sets > 1) {
        updatedEx.sets = updatedEx.sets - 1;
        updatedEx.notes = (updatedEx.notes ? updatedEx.notes + ' · ' : '')
          + 'Auto-reduced: strength dipping as mileage increases. Maintain intensity, cut volume.';
      }

      return updatedEx;
    });

    return { ...session, exercises: resolvedExercises };
  });
}

type StrengthTier = 'bodyweight' | 'barbell';
type StrengthFrequency = 2 | 3;

// ============================================================================
// SENSITIVITY-GATED TAPER STEP-DOWN
// ============================================================================

interface TaperStrengthParams {
  /** How many strength sessions to include this taper week. */
  effectiveFrequency: 0 | 1 | 2;
  /** 0–1 multiplier applied to exercise sets. Keeps intensity high, cuts volume. */
  taperLoadScale: number;
  strategy: 'aggressive' | 'standard' | 'extended';
}

/**
 * Compute taper strength parameters based on taper_sensitivity from athlete_memory.
 *
 * Science (Mujika & Padilla 2003, Bosquet et al. 2007):
 * - Maintain intensity; cut volume 40–60%
 * - Frequency drop of ≤ 1 session/week preserves neuromuscular readiness
 * - High-sensitivity athletes peak faster → steeper step-down is safe
 * - Low-sensitivity athletes need gradual de-fatigue → maintain load longer
 *
 * Edge case: 1-week taper → normalise to the "final stage" cutback since
 * the athlete arrives at race week after only one reduced-load week.
 */
function getTaperStrengthParams(
  weekInTaper: number,
  taperLength: number,
  taperSensitivity: number | null,
): TaperStrengthParams {
  // Short taper (≤ 1 week): treat as final-stage immediately
  const effectiveWeek = taperLength <= 1 ? 2 : weekInTaper;
  const sensitivity = taperSensitivity ?? 0.5; // default: moderate

  if (sensitivity >= 0.65) {
    // Aggressive: cut to 1 session immediately; minimal load in final stage
    return {
      effectiveFrequency: 1,
      taperLoadScale: effectiveWeek === 1 ? 0.6 : 0.4,
      strategy: 'aggressive',
    };
  }

  if (sensitivity >= 0.35) {
    // Standard: 2 sessions at reduced load → 1 session light
    return {
      effectiveFrequency: weekInTaper === 1 ? 2 : 1,
      taperLoadScale: weekInTaper === 1 ? 0.75 : 0.55,
      strategy: 'standard',
    };
  }

  // Extended: gradual step-down, maintain 2 sessions longer
  if (weekInTaper <= 2) {
    return {
      effectiveFrequency: 2,
      taperLoadScale: weekInTaper === 1 ? 0.85 : 0.65,
      strategy: 'extended',
    };
  }
  return { effectiveFrequency: 1, taperLoadScale: 0.5, strategy: 'extended' };
}

/**
 * Scale exercise sets by taperLoadScale, floor at 1 set.
 * Intensity (weight prescription) is deliberately preserved — the golden rule of tapering.
 * Appends a taper note to the session description so athletes understand the rationale.
 */
function applyTaperLoadScale(
  sessions: IntentSession[],
  taperLoadScale: number,
  strategy: TaperStrengthParams['strategy'],
): IntentSession[] {
  if (taperLoadScale >= 1.0) return sessions;

  const strategyLabel: Record<TaperStrengthParams['strategy'], string> = {
    aggressive: 'Aggressive taper: volume cut, intensity preserved.',
    standard: 'Standard taper: reduced volume, maintained intensity.',
    extended: 'Extended taper: gradual volume reduction.',
  };

  return sessions.map(s => ({
    ...s,
    description: `${s.description} [${strategyLabel[strategy]}]`,
    exercises: s.exercises.map(ex => ({
      ...ex,
      sets: Math.max(1, Math.round(ex.sets * taperLoadScale)),
    })),
    tags: [...s.tags, `taper_load_scale:${taperLoadScale.toFixed(2)}`],
  }));
}

/**
 * After protocol generates taper sessions, filter to effectiveFrequency.
 * Preference order for a single session: upper/full-body > lower.
 * Lower sessions avoided when only 1 slot — protects pre-race legs.
 */
function filterToTaperFrequency(
  sessions: IntentSession[],
  effectiveFrequency: number,
): IntentSession[] {
  if (effectiveFrequency === 0 || sessions.length === 0) return [];
  if (sessions.length <= effectiveFrequency) return sessions;

  if (effectiveFrequency === 1) {
    // Prefer upper/full-body; only fall back to lower if that's all that exists
    const preferred = sessions.find(
      s => !s.intent.startsWith('LOWER') || s.intent === 'FULLBODY_MAINTENANCE'
    );
    return [preferred ?? sessions[0]];
  }

  return sessions.slice(0, effectiveFrequency);
}

// ============================================================================
// MAIN OVERLAY FUNCTION
// ============================================================================

export function overlayStrength(
  plan: TrainingPlan,
  frequency: StrengthFrequency,
  phaseStructure: PhaseStructure,
  tier: StrengthTier = 'bodyweight',
  protocolId?: string,
  methodology?: 'hal_higdon_complete' | 'jack_daniels_performance',
  noDoubles?: boolean,
  memoryContext?: PlanningMemoryContext,
  isMetric = false,
): TrainingPlan {
  const modifiedPlan = { ...plan };
  const modifiedSessions: Record<string, Session[]> = {};
  const totalWeeks = Object.keys(plan.sessions_by_week).length;

  // Memory-driven noDoubles: if interference_risk is high, separate all sessions.
  const memoryDrivenNoDoubles =
    memoryContext?.interferenceRisk != null &&
    memoryContext.interferenceRisk >= INTERFERENCE_RISK_NO_DOUBLES_THRESHOLD;
  const effectiveNoDoubles = (noDoubles ?? false) || memoryDrivenNoDoubles;
  if (memoryDrivenNoDoubles && !noDoubles) {
    console.log(
      `[PlanGen] Memory: interference_risk=${memoryContext!.interferenceRisk!.toFixed(2)} ≥ ${INTERFERENCE_RISK_NO_DOUBLES_THRESHOLD} → noDoubles forced`
    );
  }

  for (const [weekStr, sessions] of Object.entries(plan.sessions_by_week)) {
    const week = parseInt(weekStr, 10);
    const phase = getCurrentPhase(week, phaseStructure);
    const isTaperPhase = phase.name === 'Taper';
    if (isTaperPhase) {
      const taperParams = getTaperStrengthParams(
        week - phase.start_week + 1,
        phase.end_week - phase.start_week + 1,
        memoryContext?.taperSensitivity ?? null,
      );
      console.log(
        `[PlanGen] Taper week ${week}: strategy=${taperParams.strategy}, freq=${taperParams.effectiveFrequency}, loadScale=${taperParams.taperLoadScale} (sensitivity=${memoryContext?.taperSensitivity ?? 'default'})`
      );
    }

    const primarySchedule = methodology
      ? extractPrimaryScheduleForWeekSessions(sessions)
      : extractPrimarySchedule(plan);

    const strengthSessions = computeStrengthForPlanWeek({
      week,
      totalWeeks,
      primarySchedule,
      phaseStructure,
      frequency,
      tier,
      protocolId,
      methodology,
      effectiveNoDoubles,
      memoryContext,
      isMetric,
    });

    modifiedSessions[weekStr] = [...sessions, ...strengthSessions];
  }

  modifiedPlan.sessions_by_week = modifiedSessions;
  
  // Baselines depend on tier
  modifiedPlan.baselines_required = {
    ...modifiedPlan.baselines_required,
    strength: tier === 'barbell' 
      // Use the canonical keys stored in user_baselines.performance_numbers.
      // materialize-plan reads these directly (bench/squat/deadlift/overheadPress1RM),
      // and the baseline prompt UI writes overheadPress1RM (not overhead1RM).
      ? ['squat', 'deadlift', 'bench', 'overheadPress1RM']
      : [] // Bodyweight tier doesn't need 1RM baselines
  };

  return modifiedPlan;
}

// ============================================================================
// CONVERSION HELPERS
// ============================================================================

function convertPhase(phase: Phase): StrengthPhase {
  return {
    name: phase.name,
    start_week: phase.start_week,
    end_week: phase.end_week,
    weeks_in_phase: phase.end_week - phase.start_week + 1,
  };
}

function convertToSession(placed: PlacedSession, tier: StrengthTier): Session {
  return {
    day: placed.day,
    type: 'strength',
    name: placed.name,
    description: placed.description,
    duration: placed.duration,
    strength_exercises: placed.exercises.map(ex => ({
      name: ex.name,
      sets: ex.sets,
      reps: ex.reps,
      weight: ex.weight,
      target_rir: ex.target_rir,
      notes: ex.notes,
    })),
    tags: [
      ...placed.tags,
      `tier:${tier}`,
      ...(placed.isOptional ? ['optional'] : []),
    ],
  };
}

/**
 * Normalize schedule to ensure all fields are arrays (never undefined)
 * This avoids ?. logic in placement/guardrails code
 */
function normalizePrimarySchedule(
  schedule: Partial<ProtocolContext['primarySchedule']>
): ProtocolContext['primarySchedule'] {
  return {
    longSessionDays: schedule.longSessionDays ?? [],
    qualitySessionDays: schedule.qualitySessionDays ?? [],
    easySessionDays: schedule.easySessionDays ?? [],
  };
}

const DEFAULT_LONG_DAYS = ['Sunday'];
const DEFAULT_QUALITY_DAYS = ['Tuesday', 'Thursday'];
const DEFAULT_EASY_DAYS = ['Monday', 'Wednesday', 'Friday', 'Saturday'];

/** Calendar order (not alphabetical — avoid Friday-before-Monday sorts). */
const WEEKDAY_ORDER = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

function sortDaysCalendar(days: string[]): string[] {
  const rank = (d: string) => {
    const i = WEEKDAY_ORDER.indexOf(d as (typeof WEEKDAY_ORDER)[number]);
    return i === -1 ? 99 : i;
  };
  return [...new Set(days)].sort((a, b) => rank(a) - rank(b));
}

function dayVoteTop(votes: Record<string, number>, minCount = 1): string[] {
  const entries = Object.entries(votes).filter(([, c]) => c >= minCount);
  if (entries.length === 0) return [];
  const max = Math.max(...entries.map(([, c]) => c));
  return sortDaysCalendar(entries.filter(([, c]) => c === max).map(([d]) => d));
}

/** When tags are missing, pick the run day whose long runs accumulate the most planned minutes. */
function pickDominantLongRunDay(plan: TrainingPlan): string {
  const score: Record<string, number> = {};
  for (const sessions of Object.values(plan.sessions_by_week)) {
    const weekRuns = sessions.filter(s => s.type === 'run');
    if (weekRuns.length === 0) continue;
    const longest = weekRuns.reduce((a, b) => (a.duration >= b.duration ? a : b));
    score[longest.day] = (score[longest.day] ?? 0) + longest.duration;
  }
  const sorted = Object.entries(score).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] ?? 'Sunday';
}

/**
 * Derive long / quality / easy run days from the **actual** generated plan so strength
 * placement respects each athlete's schedule instead of a fixed Sun / Tue–Thu template.
 */
export function extractPrimarySchedule(plan: TrainingPlan): ProtocolContext['primarySchedule'] {
  const longVotes: Record<string, number> = {};
  const qualityVotes: Record<string, number> = {};
  const runDaysSeen = new Set<string>();

  const qualityTag = (tags: string[]) => {
    const t = new Set(tags.map(x => x.toLowerCase()));
    if (t.has('long_run')) return false;
    return (
      t.has('hard_run') ||
      t.has('intervals') ||
      t.has('vo2max') ||
      t.has('tempo') ||
      t.has('fartlek') ||
      t.has('strides') ||
      t.has('marathon_pace')
    );
  };

  for (const sessions of Object.values(plan.sessions_by_week)) {
    const weekRuns = sessions.filter(s => s.type === 'run');
    let hasLongTag = false;
    for (const s of weekRuns) {
      runDaysSeen.add(s.day);
      const tags = (s.tags || []).map(x => String(x).toLowerCase());
      const tset = new Set(tags);
      if (tset.has('long_run')) {
        hasLongTag = true;
        longVotes[s.day] = (longVotes[s.day] ?? 0) + 1;
      }
      if (qualityTag(tags)) {
        qualityVotes[s.day] = (qualityVotes[s.day] ?? 0) + 1;
      }
    }
    // Longest run this week only when no explicit long_run tag (legacy / odd templates)
    if (!hasLongTag && weekRuns.length > 0) {
      const longest = weekRuns.reduce((a, b) => (a.duration >= b.duration ? a : b));
      if (longest.duration >= 50) {
        longVotes[longest.day] = (longVotes[longest.day] ?? 0) + 1;
      }
    }
  }

  let longSessionDays = dayVoteTop(longVotes, 1);
  let qualitySessionDays = dayVoteTop(qualityVotes, 1);

  // Name/description hint for quality when tags are sparse (legacy weeks)
  if (qualitySessionDays.length === 0) {
    const hintVotes: Record<string, number> = {};
    const qre =
      /\b(tempo|interval|intervals|repeats|vo2|speed|fartlek|cruise|threshold|strides|400m|800m|mile repeat|m pace|marathon pace)\b/i;
    for (const sessions of Object.values(plan.sessions_by_week)) {
      for (const s of sessions) {
        if (s.type !== 'run') continue;
        const tags = (s.tags || []).map(x => String(x).toLowerCase());
        if (tags.includes('long_run')) continue;
        if (qre.test(`${s.name} ${s.description}`)) {
          hintVotes[s.day] = (hintVotes[s.day] ?? 0) + 1;
        }
      }
    }
    qualitySessionDays = dayVoteTop(hintVotes, 1);
  }

  if (longSessionDays.length === 0) longSessionDays = [...DEFAULT_LONG_DAYS];
  if (qualitySessionDays.length === 0) qualitySessionDays = [...DEFAULT_QUALITY_DAYS];

  // Template defaults (Sun / Tue–Thu) are wrong for many schedules — keep only days this plan runs on.
  if (runDaysSeen.size > 0) {
    const longOnPlan = longSessionDays.filter(d => runDaysSeen.has(d));
    if (longOnPlan.length > 0) {
      longSessionDays = sortDaysCalendar(longOnPlan);
    } else {
      longSessionDays = [pickDominantLongRunDay(plan)];
    }

    const qualityOnPlan = qualitySessionDays.filter(d => runDaysSeen.has(d));
    if (qualityOnPlan.length > 0) {
      qualitySessionDays = sortDaysCalendar(qualityOnPlan);
    } else {
      qualitySessionDays = [];
    }
  }

  const hard = new Set([...longSessionDays, ...qualitySessionDays]);
  const easySessionDays = [...runDaysSeen].filter(d => !hard.has(d));
  const easyFallback = easySessionDays.length > 0 ? easySessionDays : DEFAULT_EASY_DAYS.filter(d => !hard.has(d));

  return normalizePrimarySchedule({
    longSessionDays,
    qualitySessionDays,
    easySessionDays: easyFallback.length > 0 ? easyFallback : [...DEFAULT_EASY_DAYS],
  });
}

/** Primary schedule from a single week's sessions (taper / adapt / relayout). */
export function extractPrimaryScheduleForWeekSessions(
  weekSessions: Session[],
): ProtocolContext['primarySchedule'] {
  return extractPrimarySchedule({ sessions_by_week: { '0': weekSessions } } as unknown as TrainingPlan);
}

export function primaryScheduleSignature(sched: ProtocolContext['primarySchedule']): string {
  return JSON.stringify({
    l: [...sched.longSessionDays].sort(),
    q: [...sched.qualitySessionDays].sort(),
    e: [...sched.easySessionDays].sort(),
  });
}

// ============================================================================
// HELPERS
// ============================================================================

function getCurrentPhase(weekNumber: number, phaseStructure: PhaseStructure): Phase {
  for (const phase of phaseStructure.phases) {
    if (weekNumber >= phase.start_week && weekNumber <= phase.end_week) {
      return phase;
    }
  }
  return phaseStructure.phases[phaseStructure.phases.length - 1];
}

function computeStrengthForPlanWeek(args: {
  week: number;
  totalWeeks: number;
  primarySchedule: ProtocolContext['primarySchedule'];
  phaseStructure: PhaseStructure;
  frequency: StrengthFrequency;
  tier: StrengthTier;
  protocolId?: string;
  methodology?: 'hal_higdon_complete' | 'jack_daniels_performance';
  effectiveNoDoubles: boolean;
  memoryContext?: PlanningMemoryContext;
  isMetric?: boolean;
}): Session[] {
  const protocol = getProtocol(args.protocolId);
  const week = args.week;
  const phase = getCurrentPhase(week, args.phaseStructure);
  const isRecovery = args.phaseStructure.recovery_weeks.includes(week);
  let weekInPhase = 0;
  for (let w = phase.start_week; w <= week; w++) {
    if (!args.phaseStructure.recovery_weeks.includes(w)) {
      weekInPhase++;
    }
  }

  const isTaperPhase = phase.name === 'Taper';
  const taperParams = isTaperPhase
    ? getTaperStrengthParams(
        week - phase.start_week + 1,
        phase.end_week - phase.start_week + 1,
        args.memoryContext?.taperSensitivity ?? null,
      )
    : null;

  const context: ProtocolContext = {
    weekIndex: week,
    weekInPhase,
    phase: convertPhase(phase),
    totalWeeks: args.totalWeeks,
    isRecovery,
    primarySchedule: args.primarySchedule,
    strengthFrequency: args.frequency,
    userBaselines: {
      equipment: args.tier === 'barbell' ? 'commercial_gym' : 'home_gym',
    },
    constraints: {
      maxSessionDuration: 60,
      taperLoadScale: taperParams?.taperLoadScale,
    },
  };

  let intentSessions = protocol.createWeekSessions(context);

  if (taperParams) {
    intentSessions = applyTaperLoadScale(intentSessions, taperParams.taperLoadScale, taperParams.strategy);
    intentSessions = filterToTaperFrequency(intentSessions, taperParams.effectiveFrequency);
  }

  let filteredSessions = intentSessions;
  if (protocol.id === 'upper_aesthetics' && args.frequency === 2) {
    filteredSessions = intentSessions.filter(
      s => s.intent !== 'UPPER_STRENGTH' && s.intent !== 'UPPER_MAINTENANCE',
    );
  }

  const guardrails: any[] = [];
  const placementFrequency = taperParams
    ? (taperParams.effectiveFrequency as 0 | 1 | 2 | 3)
    : args.frequency;

  const placedSessions = simplePlacementPolicy.assignSessions(
    filteredSessions,
    args.primarySchedule,
    guardrails,
    args.methodology
      ? {
          methodology: args.methodology,
          protocol: args.protocolId,
          strengthFrequency: placementFrequency,
          noDoubles: args.effectiveNoDoubles,
          injuryHotspots: args.memoryContext?.injuryHotspots ?? [],
        }
      : undefined,
  );

  const resolvedPlaced = args.memoryContext
    ? resolveExerciseWeights(placedSessions, args.memoryContext, args.isMetric ?? false)
    : placedSessions;

  return resolvedPlaced.map(placed => convertToSession(placed, args.tier));
}

/** Recompute strength sessions for one plan week (e.g. adapt-plan when run shape changes). */
export function buildStrengthSessionsForPlanWeek(params: {
  weekNumber: number;
  totalWeeks: number;
  enduranceSessions: Session[];
  phaseStructure: PhaseStructure;
  frequency: 2 | 3;
  tier: 'bodyweight' | 'barbell';
  protocolId?: string;
  methodology: 'hal_higdon_complete' | 'jack_daniels_performance';
  noDoubles?: boolean;
  memoryContext?: PlanningMemoryContext;
  isMetric?: boolean;
}): Session[] {
  const memoryDrivenNoDoubles =
    params.memoryContext?.interferenceRisk != null &&
    params.memoryContext.interferenceRisk >= INTERFERENCE_RISK_NO_DOUBLES_THRESHOLD;
  const effectiveNoDoubles = (params.noDoubles ?? false) || memoryDrivenNoDoubles;

  const primarySchedule = extractPrimaryScheduleForWeekSessions(params.enduranceSessions);

  return computeStrengthForPlanWeek({
    week: params.weekNumber,
    totalWeeks: params.totalWeeks,
    primarySchedule,
    phaseStructure: params.phaseStructure,
    frequency: params.frequency,
    tier: params.tier,
    protocolId: params.protocolId,
    methodology: params.methodology,
    effectiveNoDoubles,
    memoryContext: params.memoryContext,
    isMetric: params.isMetric,
  });
}

// ============================================================================
// LEGACY SUPPORT - Map old tier names to new
// ============================================================================

export function overlayStrengthLegacy(
  plan: TrainingPlan,
  frequency: 2 | 3,
  phaseStructure: PhaseStructure,
  tier: 'injury_prevention' | 'strength_power' = 'injury_prevention',
  _equipment: 'home_gym' | 'commercial_gym' = 'home_gym',
  protocolId?: string,
  methodology?: 'hal_higdon_complete' | 'jack_daniels_performance',
  noDoubles?: boolean,
  memoryContext?: PlanningMemoryContext,
  isMetric = false,
): TrainingPlan {
  // Map old tier names to new
  const newTier: StrengthTier = tier === 'injury_prevention' ? 'bodyweight' : 'barbell';
  return overlayStrength(plan, frequency, phaseStructure, newTier, protocolId, methodology, noDoubles, memoryContext, isMetric);
}

// OLD FUNCTIONS REMOVED - Now in protocol system
// The following functions have been moved to:
// - supabase/functions/shared/strength-system/protocols/upper-priority-hybrid.ts
//
// Removed:
// - createMondayLowerBody
// - createWednesdayUpperBody
// - createFridayLowerBody
// - createTaperSessions
// - getTargetRIR
// - applyTargetRIR
//
// These are now handled by the protocol system.

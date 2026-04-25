// =============================================================================
// POST-RACE FEEDBACK CHAIN
// =============================================================================
// After a goal race finishes and analyze-running-workout writes the debrief,
// the race result should flow back into the athlete's intelligence layer:
//
//   1. Update `learned_fitness.run_threshold_pace_sec_per_km` if the
//      Riegel projection from the race materially diverges (>5%) from
//      what we currently know. Marked source: 'race_result', confidence: 'high'.
//   2. Recompute athlete memory (`recompute-athlete-memory`).
//   3. Refresh the full learned-fitness profile (`learn-fitness-profile`).
//
// Idempotency: a marker is written into `workouts.workout_analysis.post_race_feedback`
// keyed on { goal_id, finish_seconds }. Re-running with the same finish is a no-op;
// a different finish (re-import, manual edit) re-fires the chain.
// =============================================================================

import { riegelThresholdPaceSecPerKm } from './riegel.ts';

// ── Constants ────────────────────────────────────────────────────────────────

/** Material threshold-pace divergence from existing learned value. */
const PACE_DIVERGENCE_THRESHOLD = 0.05; // 5%
/** Don't allow a race result to set unrealistically fast paces (sec/km). */
const PACE_SANITY_MIN_SEC_KM = 150; // ~2:30/km — sub-elite floor
/** Don't allow it to set unrealistically slow paces (sec/km). */
const PACE_SANITY_MAX_SEC_KM = 720; // ~12:00/km

// ── Types ────────────────────────────────────────────────────────────────────

export type PostRaceFeedbackInput = {
  userId: string;
  workoutId: string;
  goalId: string | null;
  /** Run race finish time in seconds (elapsed/chip preferred). */
  finishSeconds: number;
  /** Run race official/measured distance in meters. */
  distanceMeters: number;
  /**
   * Existing `workout_analysis` from this workout BEFORE this run, used to
   * read the prior idempotency marker. Pass null if you don't have it.
   */
  prevWorkoutAnalysis: Record<string, unknown> | null;
};

export type PostRaceFeedbackMarker = {
  applied_at: string;
  goal_id: string | null;
  finish_seconds: number;
  riegel_threshold_sec_per_km: number;
  pace_updated: boolean;
  pace_delta_pct: number | null;
  prior_threshold_sec_per_km: number | null;
};

export type PostRaceFeedbackResult = {
  /** True if any side effect ran (pace update, memory recompute, or learn invoke). */
  ran: boolean;
  /** True if we skipped because the same race result was already processed. */
  skippedIdempotent: boolean;
  marker: PostRaceFeedbackMarker | null;
  /** Whether each side-effect succeeded (false on error, null when not attempted). */
  paceUpdated: boolean;
  memoryRecomputed: boolean | null;
  profileRelearned: boolean | null;
  errors: string[];
};

// ── Idempotency marker check ─────────────────────────────────────────────────

/**
 * Has this exact race result (goal_id + finish) already been fed back?
 * If true, the chain is a no-op.
 */
export function alreadyAppliedFeedback(
  prevWorkoutAnalysis: Record<string, unknown> | null,
  goalId: string | null,
  finishSeconds: number,
): boolean {
  const m = prevWorkoutAnalysis?.post_race_feedback as PostRaceFeedbackMarker | undefined;
  if (!m || typeof m !== 'object') return false;
  if (!Number.isFinite(m.finish_seconds)) return false;
  // Allow ±1s drift for rounding noise.
  if (Math.abs(m.finish_seconds - finishSeconds) > 1) return false;
  if ((m.goal_id ?? null) !== (goalId ?? null)) return false;
  return true;
}

// ── learned_fitness pace nudge ───────────────────────────────────────────────

type LearnedMetric = {
  value: number | null;
  confidence?: string;
  source?: string;
  sample_count?: number;
  updated_at?: string;
};

function isLearnedMetric(v: unknown): v is LearnedMetric {
  return !!v && typeof v === 'object' && 'value' in (v as Record<string, unknown>);
}

function readPaceSecPerKm(metric: unknown): number | null {
  if (!isLearnedMetric(metric)) return null;
  const v = Number(metric.value);
  return Number.isFinite(v) && v > 0 ? v : null;
}

function clampPaceSecPerKm(p: number): number {
  return Math.max(PACE_SANITY_MIN_SEC_KM, Math.min(PACE_SANITY_MAX_SEC_KM, p));
}

/**
 * Compare Riegel-derived threshold pace against existing learned value.
 * Returns the new pace if it materially diverges (or no prior exists).
 */
export function computeThresholdPaceUpdate(args: {
  raceTimeSeconds: number;
  raceDistanceMeters: number;
  existingThresholdPaceSecPerKm: number | null;
}): { riegelPaceSecPerKm: number; shouldUpdate: boolean; deltaPct: number | null } {
  const riegelRaw = riegelThresholdPaceSecPerKm({
    raceTimeSeconds: args.raceTimeSeconds,
    raceDistanceMeters: args.raceDistanceMeters,
  });
  if (riegelRaw <= 0) {
    return { riegelPaceSecPerKm: 0, shouldUpdate: false, deltaPct: null };
  }
  const riegel = clampPaceSecPerKm(riegelRaw);
  if (args.existingThresholdPaceSecPerKm == null || args.existingThresholdPaceSecPerKm <= 0) {
    return { riegelPaceSecPerKm: riegel, shouldUpdate: true, deltaPct: null };
  }
  const delta = (riegel - args.existingThresholdPaceSecPerKm) / args.existingThresholdPaceSecPerKm;
  return {
    riegelPaceSecPerKm: riegel,
    shouldUpdate: Math.abs(delta) > PACE_DIVERGENCE_THRESHOLD,
    deltaPct: delta,
  };
}

// ── Chain runner ─────────────────────────────────────────────────────────────

type SupabaseLike = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: unknown) => {
        maybeSingle: () => Promise<{ data: any; error: any }>;
      };
    };
    update: (payload: Record<string, unknown>) => {
      eq: (col: string, val: unknown) => Promise<{ error: any }>;
    };
  };
  rpc?: (fn: string, args?: Record<string, unknown>) => Promise<{ error: any }>;
};

/**
 * Run the post-race feedback chain. Best-effort: failures in any step are
 * logged into `result.errors` and never thrown — the race debrief is the
 * primary contract; this is enrichment.
 */
export async function runPostRaceFeedbackChain(args: {
  supabase: SupabaseLike;
  supabaseUrl: string;
  serviceRoleKey: string;
  input: PostRaceFeedbackInput;
}): Promise<PostRaceFeedbackResult> {
  const { supabase, supabaseUrl, serviceRoleKey, input } = args;
  const errors: string[] = [];
  const result: PostRaceFeedbackResult = {
    ran: false,
    skippedIdempotent: false,
    marker: null,
    paceUpdated: false,
    memoryRecomputed: null,
    profileRelearned: null,
    errors,
  };

  if (!input.userId || !input.workoutId) {
    errors.push('missing user_id or workout_id');
    return result;
  }
  if (!Number.isFinite(input.finishSeconds) || input.finishSeconds <= 0) {
    errors.push('invalid finish_seconds');
    return result;
  }
  if (!Number.isFinite(input.distanceMeters) || input.distanceMeters <= 0) {
    errors.push('invalid distance_meters');
    return result;
  }

  if (alreadyAppliedFeedback(input.prevWorkoutAnalysis, input.goalId, input.finishSeconds)) {
    result.skippedIdempotent = true;
    return result;
  }
  result.ran = true;

  // ── Step 1: read existing learned_fitness, decide whether to nudge pace ────
  let priorThreshold: number | null = null;
  let nextThreshold: number | null = null;
  let deltaPct: number | null = null;
  try {
    const { data: baseline, error: baselineErr } = await supabase
      .from('user_baselines')
      .select('id, learned_fitness')
      .eq('user_id', input.userId)
      .maybeSingle();

    if (baselineErr) {
      errors.push(`user_baselines read: ${String(baselineErr.message ?? baselineErr)}`);
    }

    const learned = (baseline?.learned_fitness ?? null) as Record<string, unknown> | null;
    priorThreshold = readPaceSecPerKm(learned?.run_threshold_pace_sec_per_km);

    const { riegelPaceSecPerKm, shouldUpdate, deltaPct: dp } = computeThresholdPaceUpdate({
      raceTimeSeconds: input.finishSeconds,
      raceDistanceMeters: input.distanceMeters,
      existingThresholdPaceSecPerKm: priorThreshold,
    });
    deltaPct = dp;

    if (shouldUpdate && riegelPaceSecPerKm > 0 && baseline?.id) {
      const priorMetric = (learned?.run_threshold_pace_sec_per_km ?? {}) as LearnedMetric;
      const nextSampleCount = Number.isFinite(Number(priorMetric.sample_count))
        ? Number(priorMetric.sample_count) + 1
        : 1;

      const updatedLearned: Record<string, unknown> = {
        ...(learned ?? {}),
        run_threshold_pace_sec_per_km: {
          value: Math.round(riegelPaceSecPerKm * 10) / 10,
          confidence: 'high',
          source: 'race_result',
          sample_count: nextSampleCount,
          updated_at: new Date().toISOString(),
        },
        last_updated: new Date().toISOString(),
      };

      const { error: updErr } = await supabase
        .from('user_baselines')
        .update({
          learned_fitness: updatedLearned,
          updated_at: new Date().toISOString(),
        })
        .eq('id', baseline.id);

      if (updErr) {
        errors.push(`learned_fitness update: ${String(updErr.message ?? updErr)}`);
      } else {
        result.paceUpdated = true;
        nextThreshold = updatedLearned.run_threshold_pace_sec_per_km
          ? (updatedLearned.run_threshold_pace_sec_per_km as LearnedMetric).value as number
          : null;
      }
    } else {
      // No update needed — Riegel pace is close enough to existing learned.
      nextThreshold = priorThreshold;
    }
  } catch (e: unknown) {
    errors.push(`pace step: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── Step 2: recompute-athlete-memory ───────────────────────────────────────
  result.memoryRecomputed = await invokeFunctionBestEffort({
    supabaseUrl,
    serviceRoleKey,
    name: 'recompute-athlete-memory',
    body: { user_id: input.userId, entry_type: 'automated' },
    errors,
  });

  // ── Step 3: learn-fitness-profile (full re-learn including this race) ──────
  result.profileRelearned = await invokeFunctionBestEffort({
    supabaseUrl,
    serviceRoleKey,
    name: 'learn-fitness-profile',
    body: { user_id: input.userId },
    errors,
  });

  // ── Marker for idempotency ─────────────────────────────────────────────────
  const marker: PostRaceFeedbackMarker = {
    applied_at: new Date().toISOString(),
    goal_id: input.goalId,
    finish_seconds: Math.round(input.finishSeconds),
    riegel_threshold_sec_per_km: Math.round(
      (nextThreshold ?? riegelThresholdPaceSecPerKm({
        raceTimeSeconds: input.finishSeconds,
        raceDistanceMeters: input.distanceMeters,
      })) * 10,
    ) / 10,
    pace_updated: result.paceUpdated,
    pace_delta_pct: deltaPct,
    prior_threshold_sec_per_km: priorThreshold,
  };
  result.marker = marker;

  return result;
}

// ── Sibling-function invocation helper ───────────────────────────────────────

async function invokeFunctionBestEffort(args: {
  supabaseUrl: string;
  serviceRoleKey: string;
  name: string;
  body: Record<string, unknown>;
  errors: string[];
}): Promise<boolean> {
  const { supabaseUrl, serviceRoleKey, name, body, errors } = args;
  if (!supabaseUrl || !serviceRoleKey) {
    errors.push(`${name}: missing supabase env`);
    return false;
  }
  try {
    const r = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      errors.push(`${name}: HTTP ${r.status} ${t.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (e: unknown) {
    errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

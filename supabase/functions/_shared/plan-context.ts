/**
 * Plan context: fetch plan/phase and week intent for a workout date.
 * Shared between analyzers (running/cycling/etc).
 */
import { resolvePlanWeekIndex } from './plan-week.ts';
import { resolveBlockIdentity, type BlockIdentity } from './block-identity.ts';

function planConfigHasTaperPhase(config: Record<string, unknown>): boolean {
  const phases = config.phases;
  if (!phases || typeof phases !== 'object') return false;
  return Object.keys(phases as Record<string, unknown>).some((k) =>
    String(k).toLowerCase().includes('taper'),
  );
}

function computeDaysUntilRace(workoutDateIso: string, config: Record<string, unknown>): number | null {
  const raceRaw = config.race_date ?? config.raceDate;
  if (!raceRaw || typeof raceRaw !== 'string') return null;
  const wPart = String(workoutDateIso).slice(0, 10);
  const rPart = String(raceRaw).slice(0, 10);
  const w = new Date(`${wPart}T12:00:00`);
  const r = new Date(`${rPart}T12:00:00`);
  if (Number.isNaN(w.getTime()) || Number.isNaN(r.getTime())) return null;
  const ms = r.getTime() - w.getTime();
  const days = Math.round(ms / 86400000);
  return days > 0 ? days : null;
}

/** Race-day fields from plan config only (no week index / start_date required). */
function extractPlanRaceFieldsFromConfig(
  workoutDate: string,
  config: Record<string, unknown>,
): Pick<
  PlanContext,
  | 'daysUntilRace'
  | 'raceDateIso'
  | 'raceName'
  | 'goalProfileOrDistance'
  | 'courseProfileJson'
  | 'targetFinishTimeSeconds'
> {
  const daysUntilRace = computeDaysUntilRace(workoutDate, config);
  const raceRaw = config.race_date ?? config.raceDate;
  const raceDateIso =
    raceRaw && typeof raceRaw === 'string' ? String(raceRaw).slice(0, 10) : null;
  const raceName =
    typeof config.race_name === 'string' ? String(config.race_name) : null;
  const goalProfileOrDistance =
    typeof config.goal_profile === 'string'
      ? String(config.goal_profile)
      : typeof config.distance_key === 'string'
        ? String(config.distance_key)
        : typeof config.event_type === 'string'
          ? String(config.event_type)
          : null;
  let courseProfileJson: string | null = null;
  try {
    const cp = config.course_profile;
    if (cp && typeof cp === 'object') {
      courseProfileJson = JSON.stringify(cp).slice(0, 500);
    } else if (typeof cp === 'string' && cp.trim()) {
      courseProfileJson = cp.trim().slice(0, 500);
    }
  } catch {
    /* */
  }
  const targetFinishTimeSeconds =
    typeof config.target_finish_time_seconds === 'number' &&
    Number.isFinite(config.target_finish_time_seconds)
      ? Math.round(config.target_finish_time_seconds)
      : null;

  return {
    daysUntilRace,
    raceDateIso,
    raceName,
    goalProfileOrDistance,
    courseProfileJson,
    targetFinishTimeSeconds,
  };
}

/**
 * Minimal plan context for race date / goal fields when full week resolution fails
 * (missing start_date, week index out of range, etc.). Does not populate weekIntent / phase.
 */
/** Single active plan id for the user (plans.status = active). */
export async function fetchActivePlanId(supabase: any, userId: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('plans')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();
    return data?.id ? String(data.id) : null;
  } catch {
    return null;
  }
}

export async function fetchPlanRaceMetaForWorkout(
  supabase: any,
  userId: string,
  planId: string,
  workoutDate: string,
): Promise<PlanContext | null> {
  try {
    const { data: plan } = await supabase
      .from('plans')
      .select('name, config')
      .eq('id', planId)
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();
    if (!plan) return null;
    const config = (plan.config || {}) as Record<string, unknown>;
    const raceRaw = config.race_date ?? config.raceDate;
    if (!raceRaw || typeof raceRaw !== 'string') return null;
    const fields = extractPlanRaceFieldsFromConfig(workoutDate, config);
    if (!fields.raceDateIso || fields.daysUntilRace == null || fields.daysUntilRace <= 0) return null;
    const hasTaper = planConfigHasTaperPhase(config);
    return {
      hasActivePlan: true,
      plan_id: String(planId),
      weekIndex: null,
      weekIntent: 'unknown',
      isRecoveryWeek: false,
      isTaperWeek: false,
      phaseName: null,
      weekFocusLabel: null,
      planName: plan.name ?? null,
      has_taper_phase: hasTaper,
      current_phase: hasTaper ? 'taper_phase_in_plan' : null,
      ...fields,
    };
  } catch (e) {
    console.warn('[plan-context] fetchPlanRaceMetaForWorkout:', e);
    return null;
  }
}

export interface PlanContext {
  hasActivePlan: boolean;
  /** `plans.id` for the context row (required for race readiness gate when planned_workout link is absent). */
  plan_id: string | null;
  weekIndex: number | null;
  weekIntent: 'build' | 'recovery' | 'taper' | 'peak' | 'baseline' | 'unknown';
  isRecoveryWeek: boolean;
  isTaperWeek: boolean;
  phaseName: string | null;
  weekFocusLabel: string | null;
  planName: string | null;
  /** Calendar days from workout date to plan race_date (inclusive-ish); null if unknown or race in the past. */
  daysUntilRace: number | null;
  /** ISO date string YYYY-MM-DD from plan config when set. */
  raceDateIso: string | null;
  raceName: string | null;
  /** e.g. goal_profile, distance_key — best-effort label for LLM context. */
  goalProfileOrDistance: string | null;
  /** Truncated JSON or string course profile from plan config. */
  courseProfileJson: string | null;
  targetFinishTimeSeconds: number | null;
  /** True when plan config includes a taper phase or current context is taper week. */
  has_taper_phase: boolean;
  /** Resolved phase label: config phase name, week intent, or null when unknown. */
  current_phase: string | null;
}

/**
 * Fetch plan context for a workout date.
 *
 * Notes:
 * - Plan week indexing is relative to the plan's configured start date, normalized to Monday.
 * - Requires `plans.status='active'` for the given planId and userId.
 */
export async function fetchPlanContextForWorkout(
  supabase: any,
  userId: string,
  planId: string,
  workoutDate: string
): Promise<PlanContext | null> {
  try {
    const { data: plan } = await supabase
      .from('plans')
      .select('id, name, config, duration_weeks, sessions_by_week')
      .eq('id', planId)
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (!plan) return null;

    const config = plan.config || {};
    const startDateStr = config.user_selected_start_date || config.start_date;
    if (!startDateStr) return null;

    const durationWeeks = plan.duration_weeks || config.duration_weeks || 0;
    const weekIndex = resolvePlanWeekIndex(config, workoutDate, durationWeeks > 0 ? durationWeeks : null);
    if (weekIndex == null) return null;

    // Get weekly summaries
    let weeklySummaries = config.weekly_summaries || {};
    if (!weeklySummaries || Object.keys(weeklySummaries).length === 0) {
      const sessionsByWeek = plan.sessions_by_week || {};
      weeklySummaries = {};
      const weekKeys = Object.keys(sessionsByWeek).sort((a, b) => parseInt(a) - parseInt(b));

      for (const weekKey of weekKeys) {
        const sessions = Array.isArray(sessionsByWeek[weekKey]) ? sessionsByWeek[weekKey] : [];
        if (sessions.length === 0) continue;

        const hasIntervals = sessions.some((s: any) => {
          const tokens = Array.isArray(s?.steps_preset) ? s.steps_preset : [];
          const tags = Array.isArray(s?.tags) ? s.tags : [];
          const desc = String(s?.description || s?.name || '').toLowerCase();
          return (
            tokens.some((t: string) => /interval|vo2|5kpace|tempo|threshold/.test(String(t).toLowerCase())) ||
            tags.some((t: string) => /interval|vo2|tempo|threshold|hard/.test(String(t).toLowerCase())) ||
            /interval|vo2|tempo|threshold/.test(desc)
          );
        });

        const hasLongRun = sessions.some((s: any) => {
          const tokens = Array.isArray(s?.steps_preset) ? s.steps_preset : [];
          const tags = Array.isArray(s?.tags) ? s.tags : [];
          const desc = String(s?.description || s?.name || '').toLowerCase();
          return (
            tokens.some((t: string) => /longrun|long_run/.test(String(t).toLowerCase())) ||
            tags.some((t: string) => /longrun|long_run/.test(String(t).toLowerCase())) ||
            /long run|longrun/.test(desc)
          );
        });

        let focus = '';
        if (hasIntervals && hasLongRun) focus = 'Build Phase';
        else if (hasIntervals) focus = 'Speed Development';
        else if (hasLongRun) focus = 'Endurance Building';
        else focus = 'Training Week';

        weeklySummaries[weekKey] = { focus };
      }
    }

    const weekSummary = weeklySummaries[String(weekIndex)] || {};
    const weekFocusLabel = weekSummary.focus || null;

    // Determine recovery/taper status
    let isRecoveryWeek = false;
    let isTaperWeek = false;
    let weekIntent: PlanContext['weekIntent'] = 'build';
    let phaseName: string | null = null;

    // PRIORITY 1: Explicit per-week tag
    if (weekFocusLabel) {
      const focusLower = weekFocusLabel.toLowerCase();
      if (focusLower.includes('recovery') || focusLower.includes('recovery week')) {
        isRecoveryWeek = true;
        weekIntent = 'recovery';
      } else if (focusLower.includes('taper') || focusLower.includes('taper week')) {
        isTaperWeek = true;
        weekIntent = 'taper';
      } else if (focusLower.includes('peak')) {
        weekIntent = 'peak';
      }
    }

    // PRIORITY 2: Explicit phase metadata
    if (!isRecoveryWeek && !isTaperWeek && config.phases) {
      for (const [phaseKeyName, phaseData] of Object.entries(config.phases)) {
        const phase = phaseData as any;
        if (phase.weeks && phase.weeks.includes(weekIndex)) {
          phaseName = phaseKeyName;

          if (phase.recovery_weeks && Array.isArray(phase.recovery_weeks) && phase.recovery_weeks.includes(weekIndex)) {
            isRecoveryWeek = true;
            weekIntent = 'recovery';
          }

          if (phaseKeyName.toLowerCase().includes('taper')) {
            isTaperWeek = true;
            weekIntent = 'taper';
          }

          if (weekIntent === 'build') {
            if (phaseKeyName.toLowerCase().includes('peak')) weekIntent = 'peak';
            else if (phaseKeyName.toLowerCase().includes('base')) weekIntent = 'baseline';
          }

          break;
        }
      }
    }

    // PRIORITY 3: Pattern-based
    if (!isRecoveryWeek && !isTaperWeek && config.recoveryPattern === 'every_4th') {
      const taperPhase = config.phases
        ? Object.values(config.phases).find((p: any) => p.name && p.name.toLowerCase().includes('taper'))
        : null;
      const isInTaper = taperPhase && (taperPhase as any).weeks && (taperPhase as any).weeks.includes(weekIndex);
      if (!isInTaper && weekIndex % 4 === 0) {
        isRecoveryWeek = true;
        weekIntent = 'recovery';
      }
    }

    if (weekIntent === 'unknown') weekIntent = 'build';

    const raceFields = extractPlanRaceFieldsFromConfig(workoutDate, config as Record<string, unknown>);
    const cfg = config as Record<string, unknown>;
    const hasTaper =
      planConfigHasTaperPhase(cfg) ||
      isTaperWeek ||
      (weekFocusLabel != null && String(weekFocusLabel).toLowerCase().includes('taper'));
    const currentPhase =
      phaseName != null && String(phaseName).trim()
        ? String(phaseName)
        : isTaperWeek || weekIntent === 'taper'
          ? 'taper'
          : weekIntent !== 'unknown' && weekIntent !== 'build'
            ? weekIntent
            : weekFocusLabel != null && String(weekFocusLabel).trim()
              ? String(weekFocusLabel)
              : null;

    return {
      hasActivePlan: true,
      plan_id: plan.id != null ? String(plan.id) : null,
      weekIndex,
      weekIntent,
      isRecoveryWeek,
      isTaperWeek,
      phaseName,
      weekFocusLabel,
      planName: plan.name,
      has_taper_phase: hasTaper,
      current_phase: currentPhase,
      ...raceFields,
    };
  } catch (error) {
    console.error('⚠️ Error fetching plan context:', error);
    return null;
  }
}


/**
 * ⛔ WHAT BLOCK DID THIS SESSION BELONG TO — the same card State reads (Q-230, audit F9/F10).
 *
 * The per-session read and the block read used to open the plan through two different doors and
 * answer "what plan is this?" separately. This is the second door, pointed at the one resolver:
 * `_shared/block-identity.ts`. Performance and State now agree by construction rather than by luck.
 *
 * ⛔ AND IT DOES NOT REQUIRE `status = 'active'` — that is the point of a separate function.
 * `fetchPlanContextForWorkout` above filters on it, so a session on a FINISHED or REPLACED plan
 * returns null context: no week index, no phase, no framing (Q-208, audit F10). A Performance screen
 * showing history across blocks is exactly where that bites — every session from a completed block
 * reads as though it were never on a plan. Ownership is still enforced (`user_id`), which is what
 * `status` was never doing; identity is `plans.id`, and a plan does not stop being the plan a session
 * was done on because the athlete has since moved to another one.
 *
 * ⚠️ ONE ROW, NO JOINS — cheap enough to run on the strength fast path, which deliberately skips the
 * heavier weekly-readiness and full-week-context fetches.
 */
export async function fetchBlockIdentityForWorkout(
  supabase: any,
  userId: string,
  planId: string,
  workoutDate: string,
): Promise<BlockIdentity | null> {
  try {
    const { data: plan } = await supabase
      .from('plans')
      .select('id, name, config, duration_weeks, goal_id')
      .eq('id', planId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!plan) return null;

    // The goal is optional: it carries the non-race focus (Q-230 Part B) and the race fields. A plan
    // with no goal row still resolves everything the config can answer.
    let goal: any = null;
    if (plan.goal_id) {
      const { data: g } = await supabase
        .from('goals')
        .select('id, name, goal_type, target_date, sport, distance, training_prefs')
        .eq('id', plan.goal_id)
        .eq('user_id', userId)
        .maybeSingle();
      goal = g ?? null;
    }

    return resolveBlockIdentity({
      planId: String(plan.id),
      planName: plan.name ?? null,
      planConfig: plan.config ?? null,
      durationWeeks: plan.duration_weeks ?? null,
      goal,
      onDateIso: String(workoutDate).slice(0, 10),
    });
  } catch (e) {
    console.warn('[plan-context] fetchBlockIdentityForWorkout:', e);
    return null;
  }
}

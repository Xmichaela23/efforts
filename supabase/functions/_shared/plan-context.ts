/**
 * Plan context: fetch plan/phase and week intent for a workout date.
 * Shared between analyzers (running/cycling/etc).
 */
import { resolvePlanWeekIndex } from './plan-week.ts';

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
    return {
      hasActivePlan: true,
      weekIndex: null,
      weekIntent: 'unknown',
      isRecoveryWeek: false,
      isTaperWeek: false,
      phaseName: null,
      weekFocusLabel: null,
      planName: plan.name ?? null,
      ...fields,
    };
  } catch (e) {
    console.warn('[plan-context] fetchPlanRaceMetaForWorkout:', e);
    return null;
  }
}

export interface PlanContext {
  hasActivePlan: boolean;
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

    return {
      hasActivePlan: true,
      weekIndex,
      weekIntent,
      isRecoveryWeek,
      isTaperWeek,
      phaseName,
      weekFocusLabel,
      planName: plan.name,
      ...raceFields,
    };
  } catch (error) {
    console.error('⚠️ Error fetching plan context:', error);
    return null;
  }
}


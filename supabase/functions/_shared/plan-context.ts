/**
 * Plan context: fetch plan/phase and week intent for a workout date.
 * Shared between analyzers (running/cycling/etc).
 */

export interface PlanContext {
  hasActivePlan: boolean;
  weekIndex: number | null;
  weekIntent: 'build' | 'recovery' | 'taper' | 'peak' | 'baseline' | 'unknown';
  isRecoveryWeek: boolean;
  isTaperWeek: boolean;
  phaseName: string | null;
  weekFocusLabel: string | null;
  planName: string | null;
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

    // Normalize start date to Monday
    const mondayOf = (iso: string): string => {
      const d = new Date(iso);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setDate(diff));
      return monday.toLocaleDateString('en-CA');
    };

    const startDateMonday = mondayOf(startDateStr);
    const startDate = new Date(startDateMonday);
    const viewedDate = new Date(workoutDate);
    startDate.setHours(0, 0, 0, 0);
    viewedDate.setHours(0, 0, 0, 0);
    const diffMs = viewedDate.getTime() - startDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    let weekIndex = Math.max(1, Math.floor(diffDays / 7) + 1);

    const durationWeeks = plan.duration_weeks || config.duration_weeks || 0;
    if (durationWeeks > 0) {
      weekIndex = Math.min(weekIndex, durationWeeks);
    }

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

    return {
      hasActivePlan: true,
      weekIndex,
      weekIntent,
      isRecoveryWeek,
      isTaperWeek,
      phaseName,
      weekFocusLabel,
      planName: plan.name,
    };
  } catch (error) {
    console.error('⚠️ Error fetching plan context:', error);
    return null;
  }
}


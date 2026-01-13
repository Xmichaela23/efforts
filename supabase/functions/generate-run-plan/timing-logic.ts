// ============================================================================
// AM/PM TIMING LOGIC FOR DOUBLE DAYS
// ============================================================================

import type { TrainingPlan, Session, WeeklySummary } from './types.ts';

/**
 * Adds AM/PM timing logic for days that have both Run and Strength sessions.
 * 
 * Rules:
 * - Run is always Priority 1 (AM)
 * - Strength is always Priority 2 (PM)
 * - Adds timing_note to weekly summaries explaining the interference buffer
 */
export function addTimingLogic(plan: TrainingPlan): TrainingPlan {
  const updatedPlan = { ...plan };
  const updatedSessionsByWeek: Record<string, Session[]> = {};
  const updatedWeeklySummaries: Record<string, WeeklySummary> = { ...(plan.weekly_summaries || {}) };

  // Process each week
  for (const [weekStr, sessions] of Object.entries(plan.sessions_by_week)) {
    const weekSessions = [...sessions]; // Copy to avoid mutating original
    const sessionsByDay = new Map<string, Session[]>();

    // Group sessions by day
    for (const session of weekSessions) {
      const day = session.day;
      if (!sessionsByDay.has(day)) {
        sessionsByDay.set(day, []);
      }
      sessionsByDay.get(day)!.push(session);
    }

    // Check each day for double sessions (run + strength)
    let hasDoubleDays = false;
    const doubleDays: string[] = [];

    for (const [day, daySessions] of sessionsByDay.entries()) {
      const runSession = daySessions.find(s => s.type === 'run');
      const strengthSession = daySessions.find(s => s.type === 'strength');

      if (runSession && strengthSession) {
        hasDoubleDays = true;
        doubleDays.push(day);

        // Add timing fields
        runSession.timing = 'AM (Priority)';
        strengthSession.timing = 'PM (6hr+ gap recommended)';
      }
    }

    // Add timing note to weekly summary if there are double days
    if (hasDoubleDays && updatedWeeklySummaries[weekStr]) {
      const summary = updatedWeeklySummaries[weekStr];
      const daysList = doubleDays.join(', ');
      summary.timing_note = `**Optimal:** Run AM, Lift PM (6+ hours apart) on ${daysList}. **Real-world:** Run first, then lift immediately after. Never lift before a quality run.`;
    } else if (hasDoubleDays) {
      // Create summary if it doesn't exist
      const daysList = doubleDays.join(', ');
      updatedWeeklySummaries[weekStr] = {
        focus: '',
        key_workouts: [],
        estimated_hours: 0,
        hard_sessions: 0,
        notes: '',
        timing_note: `**Optimal:** Run AM, Lift PM (6+ hours apart) on ${daysList}. **Real-world:** Run first, then lift immediately after. Never lift before a quality run.`
      };
    }

    updatedSessionsByWeek[weekStr] = weekSessions;
  }

  updatedPlan.sessions_by_week = updatedSessionsByWeek;
  updatedPlan.weekly_summaries = updatedWeeklySummaries;

  return updatedPlan;
}

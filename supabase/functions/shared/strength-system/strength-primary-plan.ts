// ============================================================================
// STRENGTH-PRIMARY PLAN  (SPEC-product-shape Program 1; replaces the (b)-run stopgap)
//
// Strength is the SPINE. The conductor's phased arc (base→power→sharpen→retest)
// IS the plan structure; maintenance endurance (run OR bike — sport-agnostic)
// fills the off-days underneath. Materializes through the same activate-plan
// pipe (emits the standard sessions_by_week shape).
//
// Assembly, not invention:
//   - the strength weeks: the conductor (strength-arc.ts) → the chassis
//     (getProtocol → createWeekSessions), already built + proven.
//   - the endurance: light maintenance sessions, ~2×/wk (SPEC-getstronger cell).
//   - the pipe: standard sessions_by_week → activate-plan → planned_workouts.
// ============================================================================

import { getProtocol } from './protocols/selector.ts';
import { resolveStrengthArcProtocol } from './strength-arc.ts';
import type { ProtocolContext } from './protocols/types.ts';

export type StrengthPrimaryArgs = {
  durationWeeks: number;
  strengthFrequency: 3 | 4;
  tier: 'barbell' | 'bodyweight';
  /** The athlete's maintained endurance discipline (sport-agnostic). null = strength-only. */
  enduranceSport: 'run' | 'bike' | null;
  enduranceFrequency: number; // ~2 maintenance sessions/week
  goalName?: string;
};

type PlanSession = {
  day: string;
  type: string;
  name: string;
  description: string;
  duration: number;
  strength_exercises?: { name: string; sets: number; reps: number | string; weight: string }[];
  tags: string[];
};

type ArcPhase = { name: string; start_week: number; end_week: number; weeks_in_phase: number };

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

// Strength-primary day grids: strength owns the prime days; endurance fills the gaps; Sunday rests.
// Keyed by `${strengthFreq}+${enduranceFreq}`.
const GRID: Record<string, { strength: string[]; endurance: string[] }> = {
  '4+2': { strength: ['Monday', 'Tuesday', 'Thursday', 'Friday'], endurance: ['Wednesday', 'Saturday'] },
  '4+1': { strength: ['Monday', 'Tuesday', 'Thursday', 'Friday'], endurance: ['Saturday'] },
  '4+0': { strength: ['Monday', 'Tuesday', 'Thursday', 'Friday'], endurance: [] },
  '3+2': { strength: ['Monday', 'Wednesday', 'Friday'], endurance: ['Tuesday', 'Saturday'] },
  '3+3': { strength: ['Monday', 'Wednesday', 'Friday'], endurance: ['Tuesday', 'Thursday', 'Saturday'] },
  '3+1': { strength: ['Monday', 'Wednesday', 'Friday'], endurance: ['Saturday'] },
};

/**
 * The Get Strong arc timeline: base → power → sharpen → strength retest. Proportional to the block
 * length; the final week is always the retest (1RM re-baseline). Phase NAMES match what the conductor
 * + periodization authority canonicalize ('Base'→base, 'Build'→build/power, 'Race Prep'→sharpen,
 * 'Retest'→the rested terminal).
 */
export function buildArcPhases(weeks: number): { phases: ArcPhase[]; recovery_weeks: number[] } {
  const body = Math.max(1, weeks - 1); // reserve the last week for the retest
  const baseLen = Math.max(1, Math.round(body * 0.45));
  const powerLen = Math.max(1, Math.round(body * 0.35));
  const sharpenLen = Math.max(0, body - baseLen - powerLen);
  const phases: ArcPhase[] = [];
  let w = 1;
  phases.push({ name: 'Base', start_week: w, end_week: w + baseLen - 1, weeks_in_phase: baseLen }); w += baseLen;
  phases.push({ name: 'Build', start_week: w, end_week: w + powerLen - 1, weeks_in_phase: powerLen }); w += powerLen;
  if (sharpenLen > 0) {
    phases.push({ name: 'Race Prep', start_week: w, end_week: w + sharpenLen - 1, weeks_in_phase: sharpenLen });
    w += sharpenLen;
  }
  phases.push({ name: 'Retest', start_week: weeks, end_week: weeks, weeks_in_phase: 1 });
  return { phases, recovery_weeks: [] };
}

function phaseFor(week: number, phases: ArcPhase[]): ArcPhase {
  return phases.find((p) => week >= p.start_week && week <= p.end_week) ?? phases[phases.length - 1];
}

function enduranceSession(sport: 'run' | 'bike', day: string, isRetestWeek: boolean): PlanSession {
  // Maintenance: easy aerobic, ~constant volume (held, not built). Lighter on the retest week.
  const mins = sport === 'bike' ? (isRetestWeek ? 35 : 45) : (isRetestWeek ? 25 : 35);
  const label = sport === 'bike' ? 'Easy Ride' : 'Easy Run';
  return {
    day,
    type: sport === 'bike' ? 'ride' : 'run',
    name: label,
    description: `~${mins} min easy aerobic, conversational — maintenance only (held so strength leads).`,
    duration: mins,
    tags: ['easy', 'maintenance', 'aerobic'],
  };
}

/**
 * Compose a strength-primary plan: the conductor's arc as the spine + maintenance endurance underneath.
 * Returns the standard plan structure (name / description / duration_weeks / sessions_by_week /
 * phaseStructure) — the caller persists it and runs activate-plan.
 */
export function composeStrengthPrimaryPlan(args: StrengthPrimaryArgs): {
  name: string;
  description: string;
  duration_weeks: number;
  sessions_by_week: Record<string, PlanSession[]>;
  phaseStructure: { phases: ArcPhase[]; recovery_weeks: number[] };
} {
  const { durationWeeks, strengthFrequency, tier, enduranceSport, enduranceFrequency } = args;
  const phaseStructure = buildArcPhases(durationWeeks);
  const grid = GRID[`${strengthFrequency}+${enduranceSport ? enduranceFrequency : 0}`]
    ?? GRID[`${strengthFrequency}+2`] ?? GRID['4+2'];

  const sessions_by_week: Record<string, PlanSession[]> = {};

  for (let week = 1; week <= durationWeeks; week++) {
    const phase = phaseFor(week, phaseStructure.phases);
    const isRetestWeek = phase.name === 'Retest';
    const protocolId = resolveStrengthArcProtocol(phase.name, 'get_strong');
    const weekInPhase = week - phase.start_week + 1;

    const context: ProtocolContext = {
      weekIndex: week,
      weekInPhase,
      phase: { name: phase.name, start_week: phase.start_week, end_week: phase.end_week, weeks_in_phase: phase.weeks_in_phase },
      totalWeeks: durationWeeks,
      isRecovery: isRetestWeek, // retest week deloads
      primarySchedule: { longSessionDays: [], qualitySessionDays: [], easySessionDays: grid.endurance },
      userBaselines: { equipment: tier === 'barbell' ? 'commercial_gym' : 'home_gym' },
      strengthFrequency: strengthFrequency,
      constraints: { maxSessionDuration: 60 },
    };

    const intentSessions = getProtocol(protocolId).createWeekSessions(context);
    const weekSessions: PlanSession[] = [];

    // Strength = the spine: place the arc's sessions (U/L/U/L) on the prime days, in order.
    intentSessions.slice(0, grid.strength.length).forEach((s, i) => {
      weekSessions.push({
        day: grid.strength[i],
        type: 'strength',
        name: isRetestWeek ? `${s.name} (retest week — deload + test top sets)` : s.name,
        description: s.description,
        duration: s.duration,
        strength_exercises: s.exercises.map((e) => ({ name: e.name, sets: e.sets, reps: e.reps, weight: e.weight })),
        tags: [...s.tags, `phase:${phase.name.toLowerCase().replace(/\s+/g, '_')}`, ...(isRetestWeek ? ['retest'] : [])],
      });
    });

    // Endurance = maintenance, underneath, on the off-days.
    if (enduranceSport) {
      grid.endurance.forEach((day) => weekSessions.push(enduranceSession(enduranceSport, day, isRetestWeek)));
    }

    // Stable day order.
    weekSessions.sort((a, b) => DAYS.indexOf(a.day as typeof DAYS[number]) - DAYS.indexOf(b.day as typeof DAYS[number]));
    sessions_by_week[String(week)] = weekSessions;
  }

  const enduranceNote = enduranceSport
    ? ` ${enduranceSport === 'bike' ? 'Riding' : 'Running'} held at maintenance underneath.`
    : '';
  return {
    name: args.goalName?.trim() || `Get Stronger — ${durationWeeks} Weeks`,
    description:
      `Strength-led block: a base→power→sharpen arc on heavy compounds (balanced upper/lower), ` +
      `ending in a 1RM retest.${enduranceNote} The athlete picked the outcome; the engine runs the arc.`,
    duration_weeks: durationWeeks,
    sessions_by_week,
    phaseStructure,
  };
}

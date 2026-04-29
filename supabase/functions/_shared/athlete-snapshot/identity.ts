// =============================================================================
// IDENTITY + PLAN POSITION — Slow-changing athlete context
// =============================================================================

import type { AthleteIdentity, PlanPosition, LiftMax, PlannedSession } from './types.ts';

import { parseLocalDate } from '../parse-local-date.ts';

// ---------------------------------------------------------------------------
// Identity: who the athlete is (goals, key numbers, preferences)
// ---------------------------------------------------------------------------

export function buildIdentity(opts: {
  goals: any[];
  baselines: any;
  strengthLifts: Array<{ name: string; e1rm: number }>;
  imperial: boolean;
  asOfDate: string;
}): AthleteIdentity {
  const { goals, baselines, strengthLifts, imperial, asOfDate } = opts;

  const perfNumbers = baselines?.performance_numbers || {};
  const activeGoals = (goals || []).filter((g: any) => String(g?.status || '') === 'active');

  const events = activeGoals
    .filter((g: any) => g?.goal_type === 'event' && g?.target_date)
    .map((g: any) => {
      const weeksOut = Math.max(0, Math.round(
        (parseLocalDate(String(g.target_date).slice(0, 10)).getTime() - parseLocalDate(String(asOfDate).slice(0, 10)).getTime()) / (7 * 24 * 3600 * 1000)
      ));
      return {
        name: String(g.name || ''),
        date: String(g.target_date).slice(0, 10),
        weeks_out: weeksOut,
        distance: String(g.distance || ''),
        sport: String(g.sport || 'run'),
        priority: (String(g.priority || 'B').toUpperCase()) as 'A' | 'B' | 'C',
        has_plan: false, // will be set by caller if plan exists
        target_time: g.target_time ? formatTargetTime(Number(g.target_time)) : null,
      };
    })
    .sort((a: any, b: any) => a.date.localeCompare(b.date));

  const primary = events.find((e: any) => e.priority === 'A') || events[0] || null;
  const others = events.filter((e: any) => e !== primary);

  const liftMaxes: LiftMax[] = strengthLifts
    .filter(l => l.e1rm > 0)
    .map(l => ({ name: l.name, e1rm: Math.round(l.e1rm), unit: imperial ? 'lbs' as const : 'kg' as const }));

  return {
    primary_event: primary ? {
      name: primary.name,
      date: primary.date,
      weeks_out: primary.weeks_out,
      distance: primary.distance,
      sport: primary.sport,
      priority: primary.priority,
      target_time: primary.target_time,
    } : null,
    other_events: others.map((e: any) => ({
      name: e.name, date: e.date, weeks_out: e.weeks_out,
      distance: e.distance, sport: e.sport, has_plan: e.has_plan,
    })),
    key_numbers: {
      threshold_pace: perfNumbers.threshold_pace || null,
      ftp: Number(perfNumbers.ftp) || null,
      max_hr: Number(perfNumbers.max_hr) || null,
      resting_hr: Number(perfNumbers.resting_hr) || null,
      lift_maxes: liftMaxes,
    },
    unit_preference: imperial ? 'imperial' : 'metric',
  };
}

function formatTargetTime(seconds: number): string {
  if (!seconds || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Plan Position: where in the plan this week falls
// ---------------------------------------------------------------------------

export function buildPlanPosition(opts: {
  activePlan: any | null;
  allPlans: any[];
  weekStartDate: string;
  planContract: any | null;
  weekTotalLoadPlanned: number;
}): PlanPosition {
  const { activePlan, allPlans, weekStartDate, planContract, weekTotalLoadPlanned } = opts;

  if (!activePlan) {
    return {
      has_plan: false,
      plan_name: null,
      plan_id: null,
      week_index: null,
      total_weeks: null,
      phase: null,
      methodology: null,
      week_intent: null,
      week_total_load_planned: weekTotalLoadPlanned,
      secondary_plans: [],
    };
  }

  const config = activePlan.config || {};
  const startDate = config.start_date || activePlan.start_date;
  let weekIndex: number | null = null;
  if (startDate) {
    const diffMs = new Date(weekStartDate).getTime() - new Date(startDate).getTime();
    weekIndex = Math.floor(diffMs / (7 * 24 * 3600 * 1000)) + 1;
  }

  const totalWeeks = config.duration_weeks || activePlan.duration_weeks || null;
  const weekIntent = planContract?.weeks?.[weekIndex ? weekIndex - 1 : 0]?.intent || null;

  // Derive phase from week position
  let phase: string | null = null;
  if (weekIndex != null && totalWeeks != null) {
    const pct = weekIndex / totalWeeks;
    if (pct <= 0.25) phase = 'base';
    else if (pct <= 0.70) phase = 'build';
    else if (pct <= 0.90) phase = 'peak';
    else phase = 'taper';
  }
  if (weekIntent?.toLowerCase().includes('recovery')) phase = 'recovery';
  if (weekIntent?.toLowerCase().includes('taper')) phase = 'taper';
  if (config.phase) phase = String(config.phase);

  const methodology = config.focus || config.methodology || config.approach || null;

  const secondaryPlans = allPlans
    .filter(p => p.id !== activePlan.id)
    .map(p => ({
      name: p.config?.race_name || p.name || '',
      week_index: null as number | null,
      phase: null as string | null,
    }));

  return {
    has_plan: true,
    plan_name: config.race_name || activePlan.name || null,
    plan_id: activePlan.id,
    week_index: weekIndex,
    total_weeks: totalWeeks,
    phase,
    methodology: methodology ? String(methodology) : null,
    week_intent: weekIntent,
    week_total_load_planned: weekTotalLoadPlanned,
    secondary_plans: secondaryPlans,
  };
}

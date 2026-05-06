/**
 * Scheduler contract: `buildWeek` preserves `quality_bike` intent from optimizer-derived prefs.
 * Asserts `PlannedSession.session_kind === 'quality_bike'` (not titles).
 *
 * Run from `supabase/functions`: see root README § Contract tests.
 */
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { deriveOptimalWeek, type DayName, type WeekOptimizerInputs } from '../_shared/week-optimizer.ts';
import { buildPhaseTimeline, blockForWeek } from './phase-structure.ts';
import { buildWeek } from './week-builder.ts';
import { DAYS_OF_WEEK } from './science.ts';
import type { AthleteState, GoalInput } from './types.ts';

function sunIndex(d: DayName): number {
  const m: Record<DayName, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  return m[d];
}

function weekdayTitle(d: DayName): string {
  return d.charAt(0).toUpperCase() + d.slice(1);
}

function dayNameFromSunIndex(n: number): string {
  return DAYS_OF_WEEK[(n + 6) % 7]!;
}

/** Preferred strength weekdays for `buildWeek` (title case). */
function strengthPreferredTitles(
  strength: ReturnType<typeof deriveOptimalWeek>['preferred_days']['strength'],
): string[] | undefined {
  if (!strength?.length) return undefined;
  return strength.map((s) => weekdayTitle(typeof s === 'string' ? s : s.day));
}

function athleteStateFromOptimizedWeek(
  pd: ReturnType<typeof deriveOptimalWeek>['preferred_days'],
): AthleteState {
  return {
    current_ctl: 50,
    weekly_hours_available: 14,
    loading_pattern: '3:1',
    tri_approach: 'race_peak',
    training_intent: 'performance',
    strength_intent: 'performance',
    swim_intent: 'race',
    long_ride_day: sunIndex(pd.long_ride!),
    long_run_day: sunIndex(pd.long_run!),
    bike_quality_day: sunIndex(pd.quality_bike!),
    bike_easy_day: pd.easy_bike != null ? sunIndex(pd.easy_bike) : undefined,
    run_quality_day: pd.quality_run != null ? sunIndex(pd.quality_run) : undefined,
    run_easy_day: pd.easy_run != null ? sunIndex(pd.easy_run) : undefined,
    swim_easy_day: pd.swim?.[0] != null ? sunIndex(pd.swim[0]) : undefined,
    swim_quality_day: pd.swim?.[1] != null ? sunIndex(pd.swim[1]) : undefined,
    strength_preferred_days: strengthPreferredTitles(pd.strength),
    bike_quality_label: 'Group Ride',
    has_cable_machine: true,
    has_ghd: false,
    equipment_type: 'commercial_gym',
    strength_protocol: 'triathlon_performance',
  };
}

Deno.test({
  name: 'scheduler: Wed hard-group anchor emits session_kind quality_bike on that weekday (fixture 01)',
  fn() {
    const optInputs: WeekOptimizerInputs = {
      anchors: {
        long_ride: 'saturday',
        long_run: 'sunday',
        quality_bike: { day: 'wednesday', intensity: 'quality' },
      },
      preferences: {
        swims_per_week: 2,
        strength_frequency: 2,
        training_days: 6,
      },
      athlete: {
        training_intent: 'performance',
        strength_intent: 'performance',
        weeks_into_plan: 8,
      },
    };
    const optimal = deriveOptimalWeek(optInputs);
    assert(optimal.preferred_days.quality_bike === 'wednesday');

    const athleteState = athleteStateFromOptimizedWeek(optimal.preferred_days);
    const goals: GoalInput[] = [
      {
        id: 'g1',
        event_name: 'Contract Test 70.3',
        event_date: '2026-10-04',
        distance: '70.3',
        sport: 'triathlon',
        priority: 'A',
      },
    ];
    const startDate = new Date('2026-05-11T12:00:00Z');
    const { blocks, totalWeeks, raceAnchors } = buildPhaseTimeline(goals, startDate, athleteState);
    const block = blockForWeek(blocks, 2);
    const prevTss = 400;
    const week = buildWeek(2, block, prevTss, goals, athleteState, undefined, {
      totalWeeks,
      raceAnchors,
      phaseBlocks: blocks,
    });

    const expectedDay = dayNameFromSunIndex(athleteState.bike_quality_day!);
    const qbSessions = week.sessions.filter(
      (s) =>
        s.session_kind === 'quality_bike' &&
        s.day === expectedDay &&
        s.type === 'bike',
    );
    assert(
      qbSessions.length >= 1,
      `expected at least one bike session with session_kind quality_bike on ${expectedDay}; got: ${
        JSON.stringify(week.sessions.map((s) => ({ day: s.day, type: s.type, session_kind: s.session_kind, name: s.name })))
      }`,
    );
  },
});

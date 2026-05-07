/**
 * Item 9 — scheduling authority: derive combined-plan anchor geometry once via the shared
 * week optimizer and merge into AthleteState so week-builder stops silently relocating sessions.
 */

import type { AthleteState } from './types.ts';
import type { DayName, StrengthPreferredSlot, WeekOptimizerInputs } from '../_shared/week-optimizer.ts';
import { deriveOptimalWeekWithCoEqualRecovery } from '../_shared/week-optimizer.ts';

const SUN_DAY_NAMES: DayName[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

function sunIndexToDayName(idx: number): DayName {
  const i = ((idx % 7) + 7) % 7;
  return SUN_DAY_NAMES[i]!;
}

function titleCaseWeekday(d: DayName): string {
  return d.charAt(0).toUpperCase() + d.slice(1).toLowerCase();
}

function dayNameToSunIndex(d: DayName): number {
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

function inferSwimsPerWeek(state: AthleteState): 0 | 1 | 2 | 3 {
  if (state.swim_third_day != null) return 3;
  if (state.swim_quality_day != null && state.swim_easy_day != null) return 2;
  if (state.swim_intent === 'focus') return 3;
  return 2;
}

function inferStrengthFrequency(state: AthleteState): 0 | 1 | 2 | 3 {
  if (state.strength_sessions_cap === 1) return 1;
  const prefLen = state.strength_preferred_days?.length;
  if (prefLen != null && prefLen > 0) return Math.min(3, prefLen) as 0 | 1 | 2 | 3;
  const intent = String(state.strength_intent ?? '').toLowerCase();
  return intent === 'performance' ? 2 : 1;
}

function qualityBikeAnchorFromState(
  state: AthleteState,
): { day: DayName; intensity: 'quality' } | undefined {
  if (state.bike_quality_day != null) {
    return { day: sunIndexToDayName(state.bike_quality_day), intensity: 'quality' };
  }
  const hasGroupRideDuration =
    state.bike_quality_route_estimated_hours != null ||
    state.bike_quality_route_estimated_minutes != null ||
    state.bike_quality_group_ride_hours != null ||
    state.bike_quality_group_ride_minutes != null;
  const lbl = String(state.bike_quality_label ?? '').trim();
  const looksGroupRide =
    hasGroupRideDuration ||
    /\b(group|hammer|club)\b/i.test(lbl);
  if (!looksGroupRide) return undefined;
  return { day: 'wednesday', intensity: 'quality' };
}

function buildWeekOptimizerInputs(state: AthleteState): WeekOptimizerInputs | null {
  const lr = state.long_ride_day != null ? sunIndexToDayName(state.long_ride_day) : undefined;
  const lrun = state.long_run_day != null ? sunIndexToDayName(state.long_run_day) : undefined;
  if (!lr || !lrun) return null;

  const qb = qualityBikeAnchorFromState(state);
  const masters =
    state.swim_easy_day != null
      ? { day: sunIndexToDayName(state.swim_easy_day), intensity: 'easy' as const }
      : undefined;
  const qr =
    state.run_quality_day != null ? sunIndexToDayName(state.run_quality_day) : undefined;

  const restDays: DayName[] = (state.rest_days ?? []).map(sunIndexToDayName);

  const trainingDays = Math.max(
    4,
    Math.min(7, Math.round(state.days_per_week ?? 6)),
  ) as 4 | 5 | 6 | 7;

  let strengthFreq = inferStrengthFrequency(state);

  const trainingIntent = state.training_intent;
  let strengthIntent: 'performance' | 'support' =
    state.strength_intent === 'performance' ? 'performance' : 'support';
  if (strengthFreq >= 2) strengthIntent = 'performance';

  const inputs: WeekOptimizerInputs = {
    anchors: {
      long_ride: lr,
      long_run: lrun,
      ...(qb ? { quality_bike: qb } : {}),
      ...(masters ? { masters_swim: masters } : {}),
    },
    preferences: {
      swims_per_week: inferSwimsPerWeek(state),
      strength_frequency: strengthFreq,
      training_days: trainingDays,
      ...(restDays.length ? { rest_days: restDays } : {}),
      ...(qr ? { quality_run: qr } : {}),
    },
    athlete: {
      ...(trainingIntent ? { training_intent: trainingIntent } : {}),
      strength_intent: strengthIntent,
      ...(state.swim_intent ? { swim_intent: state.swim_intent } : {}),
      weeks_into_plan: 8,
    },
  };

  return inputs;
}

/** Combined tri entry — mutates a shallow copy of athlete_state with optimizer truth + placement hints. */
export function reconcileAthleteStateWithWeekOptimizer(state: AthleteState): AthleteState {
  const inputs = buildWeekOptimizerInputs(state);
  if (!inputs) return state;

  const { week: optimal, used_co_equal_1x_fallback } = deriveOptimalWeekWithCoEqualRecovery(inputs);
  const pd = optimal.preferred_days;

  const strength_slots: { weekday: string; session_index: 0 | 1 }[] = [];
  const rawStr = pd.strength;
  if (rawStr?.length) {
    const first = rawStr[0];
    const entries: StrengthPreferredSlot[] =
      typeof first === 'object' && first !== null && 'kind' in first
        ? (rawStr as StrengthPreferredSlot[])
        : (rawStr as DayName[]).map((d, i) => ({
            day: d,
            kind: i === 0 ? 'upper_body_strength' : 'lower_body_strength',
          }));
    for (const e of entries) {
      strength_slots.push({
        weekday: titleCaseWeekday(e.day),
        session_index: e.kind === 'upper_body_strength' ? 1 : 0,
      });
    }
  }

  const merged: AthleteState = {
    ...state,
    enforce_optimizer_anchor_days: true,
    ...(strength_slots.length ? { strength_optimizer_slots: strength_slots } : {}),
    ...(pd.long_ride ? { long_ride_day: dayNameToSunIndex(pd.long_ride) } : {}),
    ...(pd.long_run ? { long_run_day: dayNameToSunIndex(pd.long_run) } : {}),
    ...(pd.quality_bike ? { bike_quality_day: dayNameToSunIndex(pd.quality_bike) } : {}),
    ...(pd.easy_bike != null ? { bike_easy_day: dayNameToSunIndex(pd.easy_bike) } : {}),
    ...(pd.quality_run ? { run_quality_day: dayNameToSunIndex(pd.quality_run) } : {}),
    ...(pd.easy_run ? { run_easy_day: dayNameToSunIndex(pd.easy_run) } : {}),
    ...(pd.swim?.[0] != null ? { swim_easy_day: dayNameToSunIndex(pd.swim[0]) } : {}),
    ...(pd.swim?.[1] != null ? { swim_quality_day: dayNameToSunIndex(pd.swim[1]) } : {}),
    ...(pd.swim?.[2] != null ? { swim_third_day: dayNameToSunIndex(pd.swim[2]) } : {}),
    ...(strength_slots.length ? { strength_preferred_days: strength_slots.map((s) => s.weekday) } : {}),
    ...(used_co_equal_1x_fallback ? { strength_sessions_cap: 1 } : {}),
    ...(strength_slots.length >= 2 ? { strength_intent: 'performance' } : {}),
  };

  if (optimal.rest_days?.length) {
    merged.rest_days = optimal.rest_days.map(dayNameToSunIndex);
  }

  const hasGroupRideDuration =
    merged.bike_quality_route_estimated_hours != null ||
    merged.bike_quality_route_estimated_minutes != null ||
    merged.bike_quality_group_ride_hours != null ||
    merged.bike_quality_group_ride_minutes != null;
  if (!String(merged.bike_quality_label ?? '').trim() && hasGroupRideDuration) {
    merged.bike_quality_label = 'Group Ride';
  }

  console.log('[generate-combined-plan] reconcileAthleteStateWithWeekOptimizer:', JSON.stringify({
    preferred_days_keys: Object.keys(pd),
    strength_slots,
    trade_off_sample: optimal.trade_offs.slice(0, 4),
    conflict_sample: optimal.conflicts.slice(0, 4),
  }));

  return merged;
}

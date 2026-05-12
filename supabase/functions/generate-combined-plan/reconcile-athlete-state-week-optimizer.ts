/**
 * Scheduling authority for the combined-plan engine: derive anchor geometry once via the shared
 * week optimizer and merge into AthleteState so week-builder stops silently relocating sessions.
 * Runs for ALL combined-plan invocations (tri and single-sport). Short-circuits if the AthleteState
 * lacks a `long_run_day` anchor — that case keeps the original state and skips reconciliation.
 */

import type { AthleteState } from './types.ts';
import type { DayName, StrengthPreferredSlot, WeekOptimizerInputs } from '../_shared/week-optimizer.ts';
import { deriveOptimalWeekWithCoEqualRecovery } from '../_shared/week-optimizer.ts';
import { lineLooksLikeQualityRunUnplaced } from '../_shared/plan-generation-trade-offs.ts';
import {
  computeSessionFrequencyDefaults,
  type SessionFrequencyDefaults,
  type SessionFrequencyInputs,
} from '../../../src/lib/session-frequency-defaults.ts';

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
    state.bike_quality_group_ride_minutes != null ||
    Boolean(String(state.group_ride_route_url ?? '').trim());
  const lbl = String(state.bike_quality_label ?? '').trim();
  const looksGroupRide =
    hasGroupRideDuration ||
    /\b(group|hammer|club)\b/i.test(lbl);
  if (!looksGroupRide) return undefined;
  return { day: 'wednesday', intensity: 'quality' };
}

/** Convert AthleteState `strength_preferred_days` (mixed-case strings) to lowercase DayName[]. */
function normalizeStrengthPreferredDays(state: AthleteState): DayName[] | undefined {
  const raw = state.strength_preferred_days;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const valid = new Set<DayName>(SUN_DAY_NAMES);
  const normalized: DayName[] = [];
  for (const d of raw) {
    const lower = String(d ?? '').trim().toLowerCase();
    if (valid.has(lower as DayName)) normalized.push(lower as DayName);
  }
  return normalized.length > 0 ? normalized : undefined;
}

/**
 * Resolve session frequency defaults: wizard-supplied (athlete override) wins over
 * reconciler-computed. Maps AthleteState fields to the helper's input shape; treats
 * `strength_sessions_cap === 0` as `strength_intent: 'none'` per Phase A spec decision.
 */
function resolveSessionFrequencyDefaults(state: AthleteState): SessionFrequencyDefaults {
  if (state.session_frequency_defaults) {
    return { ...state.session_frequency_defaults, source: 'override' };
  }
  // Clamp arbitrary day counts to the matrix-supported {4, 5, 6, 7} range. AthleteState
  // can carry any number; downstream uses Math.max(4, Math.min(7, ...)) already (see
  // week-optimizer.ts:145-148), but the frequency matrix narrows to a tighter type.
  const dayInput = Math.round(state.days_per_week ?? 7);
  const days_per_week: 4 | 5 | 6 | 7 =
    dayInput <= 4 ? 4 : dayInput === 5 ? 5 : dayInput === 6 ? 6 : 7;

  const inputs: SessionFrequencyInputs = {
    weekly_hours_available: state.weekly_hours_available,
    days_per_week,
    ...(state.limiter_sport === 'swim' || state.limiter_sport === 'bike' || state.limiter_sport === 'run'
      ? { limiter_sport: state.limiter_sport }
      : {}),
    ...(state.swim_intent ? { swim_intent: state.swim_intent } : {}),
    ...(state.strength_sessions_cap === 0
      ? { strength_intent: 'none' as const }
      : state.strength_intent === 'performance'
        ? { strength_intent: 'performance' as const }
        : state.strength_intent === 'support'
          ? { strength_intent: 'support' as const }
          : {}),
  };
  return computeSessionFrequencyDefaults(inputs);
}

function buildWeekOptimizerInputs(state: AthleteState): WeekOptimizerInputs | null {
  const lr = state.long_ride_day != null ? sunIndexToDayName(state.long_ride_day) : undefined;
  const lrun = state.long_run_day != null ? sunIndexToDayName(state.long_run_day) : undefined;
  // Task 7: long_run is the minimum anchor; long_ride is optional (run-only plans).
  if (!lrun) return null;

  const qb = qualityBikeAnchorFromState(state);
  const masters =
    state.swim_easy_day != null
      ? { day: sunIndexToDayName(state.swim_easy_day), intensity: 'easy' as const }
      : undefined;
  const qr =
    state.run_quality_day != null ? sunIndexToDayName(state.run_quality_day) : undefined;

  const swimPref: DayName[] = [];
  if (state.swim_easy_day != null) swimPref.push(sunIndexToDayName(state.swim_easy_day));
  if (state.swim_quality_day != null) swimPref.push(sunIndexToDayName(state.swim_quality_day));
  if (state.swim_third_day != null) swimPref.push(sunIndexToDayName(state.swim_third_day));

  const restDays: DayName[] = (state.rest_days ?? []).map(sunIndexToDayName);

  const trainingDays = Math.max(
    4,
    Math.min(7, Math.round(state.days_per_week ?? 6)),
  ) as 4 | 5 | 6 | 7;

  // Frequency defaults: hours-derived (or athlete override). Drives swim/bike/run/strength counts.
  const freq = resolveSessionFrequencyDefaults(state);

  // For frequencies derived from hours, the athlete-pinned anchor count is a *floor* (athlete's
  // explicit choice wins when they pinned MORE days than the default), not a ceiling. Without
  // pinned days, `inferSwimsPerWeek` returns 2 even at 12hr/wk — that's the legacy default; we
  // shouldn't let it cap the freq-derived 3.
  const inferredStrengthFreq = inferStrengthFrequency(state);
  const strengthFreq = Math.max(inferredStrengthFreq, freq.strength_per_week) as 0 | 1 | 2 | 3;
  const inferredSwims = inferSwimsPerWeek(state);
  const swimsPerWeek = Math.max(inferredSwims, freq.swims_per_week) as 0 | 1 | 2 | 3;

  const trainingIntent = state.training_intent;
  let strengthIntent: 'performance' | 'support' =
    state.strength_intent === 'performance' ? 'performance' : 'support';
  if (strengthFreq >= 2) strengthIntent = 'performance';

  const strengthPreferredDays = normalizeStrengthPreferredDays(state);

  const inputs: WeekOptimizerInputs = {
    anchors: {
      ...(lr ? { long_ride: lr } : {}),
      long_run: lrun,
      ...(qb ? { quality_bike: qb } : {}),
      ...(masters ? { masters_swim: masters } : {}),
    },
    preferences: {
      swims_per_week: swimsPerWeek,
      strength_frequency: strengthFreq,
      training_days: trainingDays,
      bikes_per_week: freq.bikes_per_week,
      runs_per_week: freq.runs_per_week,
      ...(restDays.length ? { rest_days: restDays } : {}),
      ...(qr ? { quality_run: qr } : {}),
      ...(state.run_easy_day != null ? { easy_run: sunIndexToDayName(state.run_easy_day) } : {}),
      ...(state.bike_easy_day != null ? { easy_bike: sunIndexToDayName(state.bike_easy_day) } : {}),
      ...(swimPref.length ? { swim: swimPref } : {}),
      ...(strengthPreferredDays ? { strength_preferred_days: strengthPreferredDays } : {}),
    },
    athlete: {
      ...(trainingIntent ? { training_intent: trainingIntent } : {}),
      strength_intent: strengthIntent,
      // §6.1.5 / W-007: surface ordering preference to optimizer so the consolidated AM/PM
      // path is gated by athlete intent. `endurance_first` (default) keeps stricter separation;
      // `strength_first` unlocks consolidation outside the full performance-intent path.
      ...(state.strength_ordering_preference
        ? { strength_ordering_preference: state.strength_ordering_preference }
        : {}),
      ...(state.swim_intent ? { swim_intent: state.swim_intent } : {}),
      weeks_into_plan: 8,
    },
  };

  return inputs;
}

/**
 * Combined-plan entry — mutates a shallow copy of `athlete_state` with optimizer truth +
 * placement hints. Returns state unchanged when no `long_run_day` anchor is present (e.g.
 * bike-only / swim-only configurations the optimizer can't anchor).
 */
export function reconcileAthleteStateWithWeekOptimizer(state: AthleteState): AthleteState {
  const incomingPins = {
    bike_quality_day: state.bike_quality_day,
    bike_quality_label: state.bike_quality_label,
    run_quality_day: state.run_quality_day,
    run_easy_day: state.run_easy_day,
    bike_easy_day: state.bike_easy_day,
    has_group_ride_url: Boolean(String(state.group_ride_route_url ?? '').trim()),
  };

  const inputs = buildWeekOptimizerInputs(state);
  if (!inputs) {
    console.log('[generate-combined-plan] reconcileAthleteStateWithWeekOptimizer: skipped_no_long_run_anchor', incomingPins);
    return state;
  }

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

  // Recompute frequency defaults from input state so the builder sees the same numbers
  // the optimizer was given. (Helper is pure — recomputing is cheaper than threading
  // the value down through buildWeekOptimizerInputs's return.)
  const freqOut = resolveSessionFrequencyDefaults(state);

  const merged: AthleteState = {
    ...state,
    enforce_optimizer_anchor_days: true,
    session_frequency_defaults: freqOut,
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
    merged.bike_quality_group_ride_minutes != null ||
    Boolean(String(merged.group_ride_route_url ?? '').trim());
  if (!String(merged.bike_quality_label ?? '').trim() && hasGroupRideDuration) {
    merged.bike_quality_label = 'Group Ride';
  }

  const qrUnplacedNoise =
    !pd.quality_run &&
    [...optimal.conflicts, ...optimal.trade_offs].some((x) => lineLooksLikeQualityRunUnplaced(String(x)));

  // §6.3: surface §4.15 strength_preferred_days rejections in the telemetry path so
  // callers see when the athlete's stated preference couldn't be honored.
  const strengthPrefRejections = optimal.conflicts.filter((c) =>
    c.startsWith('strength_preferred_days:'),
  );

  console.log('[generate-combined-plan] reconcileAthleteStateWithWeekOptimizer:', JSON.stringify({
    incoming_schedule_pins: incomingPins,
    optimizer_inputs_quality_bike_anchor: inputs?.anchors?.quality_bike ?? null,
    optimizer_inputs_quality_run_pref: inputs?.preferences?.quality_run ?? null,
    preferred_days_keys: Object.keys(pd),
    strength_slots,
    quality_run_in_optimizer_output: Boolean(pd.quality_run),
    pd_quality_bike: pd.quality_bike ?? null,
    pd_quality_run: pd.quality_run ?? null,
    outgoing_pins: {
      bike_quality_day: merged.bike_quality_day,
      bike_quality_label: merged.bike_quality_label,
      run_quality_day: merged.run_quality_day,
      run_easy_day: merged.run_easy_day,
      bike_easy_day: merged.bike_easy_day,
    },
    trade_off_sample: optimal.trade_offs.slice(0, 4),
    conflict_sample: optimal.conflicts.slice(0, 4),
    ...(strengthPrefRejections.length > 0
      ? { strength_preferred_days_rejections: strengthPrefRejections }
      : {}),
    ...(qrUnplacedNoise
      ? {
        note:
          'Optimizer reported quality_run unplaced on its micro-grid; combined week-builder may still place structured quality from Arc defaults — see week_trade_offs after buildWeek.',
      }
      : {}),
  }));

  return merged;
}

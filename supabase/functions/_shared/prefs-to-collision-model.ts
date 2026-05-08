/**
 * Integration Point A: map athlete `training_prefs` / merged schedule prefs onto the coarse
 * collision model so setup/save paths can validate before persisting (`strict_schedule_prefs`).
 */

import type { CombinedSchedulePrefs } from './combined-schedule-prefs.ts';
import { mergeCombinedSchedulePrefs, parseSunFirstDayIndex } from './combined-schedule-prefs.ts';
import { normalizeDayName } from './week-optimizer.ts';
import {
  normalizeGoalDistanceToTriCollisionDistance,
  resolveScheduleRules,
  ScheduleCollisionError,
  type DayOfWeek,
  type PlannedIntensityZone,
  type PlannedSession,
  type PlannedSessionType,
  type ScheduleCollisionCode,
  type TriathlonDistance,
} from './resolve-schedule-collisions.ts';

export type { ScheduleCollisionCode, TriathlonDistance };

function triDistanceFromPrefs(
  trainingPrefs: Record<string, unknown>,
  override?: TriathlonDistance,
): TriathlonDistance {
  if (override) return override;
  const raw =
    trainingPrefs.distance ??
    trainingPrefs.event_distance ??
    trainingPrefs.eventDistance ??
    trainingPrefs.goal_distance;
  return normalizeGoalDistanceToTriCollisionDistance(raw);
}

const SUN_IX: DayOfWeek[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

export function collisionDayToken(raw: unknown): DayOfWeek | undefined {
  const n = parseSunFirstDayIndex(raw);
  if (n !== undefined && n >= 0 && n <= 6) return SUN_IX[n];
  const s = normalizeDayName(raw);
  return (s ?? undefined) as DayOfWeek | undefined;
}

function pushSingleton(
  out: PlannedSession[],
  type: Exclude<PlannedSessionType, 'swim'>,
  day: DayOfWeek | undefined,
  intensity: PlannedIntensityZone,
  isWeightBearing: boolean,
): void {
  if (!day) return;
  out.push({
    id: type,
    type,
    day,
    intensity,
    isWeightBearing,
  });
}

/** Arc-style nested `preferred_days` object (string weekdays or 0–6 Sun-first indices). */
export function preferredDaysObjectToCollisionSessions(pd: Record<string, unknown>): PlannedSession[] {
  const out: PlannedSession[] = [];

  pushSingleton(out, 'long_ride', collisionDayToken(pd.long_ride ?? pd.longRide), 'Z3', false);
  pushSingleton(out, 'long_run', collisionDayToken(pd.long_run ?? pd.longRun), 'Z3', true);
  pushSingleton(out, 'quality_bike', collisionDayToken(pd.quality_bike ?? pd.qualityBike ?? pd.bike_quality), 'Z4', false);
  pushSingleton(out, 'quality_run', collisionDayToken(pd.quality_run ?? pd.qualityRun ?? pd.run_quality), 'Z4', true);
  pushSingleton(out, 'easy_bike', collisionDayToken(pd.easy_bike ?? pd.easyBike ?? pd.bike_easy), 'Z2', false);
  pushSingleton(out, 'easy_run', collisionDayToken(pd.easy_run ?? pd.easyRun ?? pd.run_easy), 'Z2', true);

  const strRaw = pd.strength ?? pd.strength_days;
  let swimIdx = 0;
  if (Array.isArray(strRaw) && strRaw.length > 0) {
    const d0 = collisionDayToken(strRaw[0]);
    if (d0) {
      out.push({
        id: 'lower_body_lift',
        type: 'lower_body_lift',
        day: d0,
        intensity: 'Z3',
        isWeightBearing: false,
      });
    }
    if (strRaw.length >= 2) {
      const d1 = collisionDayToken(strRaw[1]);
      if (d1) {
        out.push({
          id: 'upper_body_lift',
          type: 'upper_body_lift',
          day: d1,
          intensity: 'Z3',
          isWeightBearing: false,
        });
      }
    }
  }

  const swimRaw = pd.swim;
  if (Array.isArray(swimRaw)) {
    swimRaw.forEach((slot, i) => {
      const day = collisionDayToken(slot);
      if (!day) return;
      const intensity: PlannedIntensityZone = i === 0 ? 'Z2' : i === 1 ? 'Z4' : 'Z3';
      out.push({
        id: `swim-${swimIdx++}`,
        type: 'swim',
        day,
        intensity,
        isWeightBearing: false,
      });
    });
  }

  return out;
}

/** Output of `mergeCombinedSchedulePrefs` (Sun-first numeric day indices on schedule fields). */
export function combinedSchedulePrefsToCollisionSessions(prefs: CombinedSchedulePrefs): PlannedSession[] {
  const out: PlannedSession[] = [];
  const ix = (n: number | undefined): DayOfWeek | undefined => {
    if (n == null || !Number.isFinite(n)) return undefined;
    const i = Math.round(n);
    if (i < 0 || i > 6) return undefined;
    return SUN_IX[i];
  };

  pushSingleton(out, 'long_run', ix(prefs.long_run_day), 'Z3', true);
  pushSingleton(out, 'long_ride', ix(prefs.long_ride_day), 'Z3', false);
  pushSingleton(out, 'quality_bike', ix(prefs.bike_quality_day), 'Z4', false);
  pushSingleton(out, 'quality_run', ix(prefs.run_quality_day), 'Z4', true);
  pushSingleton(out, 'easy_bike', ix(prefs.bike_easy_day), 'Z2', false);
  pushSingleton(out, 'easy_run', ix(prefs.run_easy_day), 'Z2', true);

  const strDays = prefs.strength_preferred_days;
  let swimIdx = 0;
  if (Array.isArray(strDays) && strDays.length > 0) {
    const d0 = collisionDayToken(strDays[0]);
    if (d0) {
      out.push({
        id: 'lower_body_lift',
        type: 'lower_body_lift',
        day: d0,
        intensity: 'Z3',
        isWeightBearing: false,
      });
    }
    if (strDays.length >= 2) {
      const d1 = collisionDayToken(strDays[1]);
      if (d1) {
        out.push({
          id: 'upper_body_lift',
          type: 'upper_body_lift',
          day: d1,
          intensity: 'Z3',
          isWeightBearing: false,
        });
      }
    }
  }

  const se = ix(prefs.swim_easy_day);
  const sq = ix(prefs.swim_quality_day);
  const st = ix(prefs.swim_third_day);
  if (se) {
    out.push({
      id: `swim-${swimIdx++}`,
      type: 'swim',
      day: se,
      intensity: 'Z2',
      isWeightBearing: false,
    });
  }
  if (sq) {
    out.push({
      id: `swim-${swimIdx++}`,
      type: 'swim',
      day: sq,
      intensity: 'Z4',
      isWeightBearing: false,
    });
  }
  if (st) {
    out.push({
      id: `swim-${swimIdx++}`,
      type: 'swim',
      day: st,
      intensity: 'Z3',
      isWeightBearing: false,
    });
  }

  return out;
}

/** Merge nested Arc `preferred_days` with flat optimizer-style fields derived via `mergeCombinedSchedulePrefs`. */
export function trainingPrefsToCollisionSessions(trainingPrefs: Record<string, unknown>): PlannedSession[] {
  const nestedPd = trainingPrefs.preferred_days ?? trainingPrefs.preferredDays;
  const nested =
    nestedPd && typeof nestedPd === 'object' && !Array.isArray(nestedPd)
      ? preferredDaysObjectToCollisionSessions(nestedPd as Record<string, unknown>)
      : [];
  const merged = mergeCombinedSchedulePrefs(trainingPrefs);
  const flat = combinedSchedulePrefsToCollisionSessions(merged);

  if (nested.length >= 4) return nested;
  if (nested.length === 0) return flat;
  return mergeCollisionByTypePreferFirst(nested, flat);
}

function mergeCollisionByTypePreferFirst(primary: PlannedSession[], secondary: PlannedSession[]): PlannedSession[] {
  const byType = new Map<Exclude<PlannedSessionType, 'swim'>, PlannedSession>();
  const swims: PlannedSession[] = [];
  for (const s of primary) {
    if (s.type === 'swim') swims.push(s);
    else byType.set(s.type, s);
  }
  for (const s of secondary) {
    if (s.type === 'swim') swims.push(s);
    else if (!byType.has(s.type)) byType.set(s.type, s);
  }
  return [...byType.values(), ...swims];
}

/** Returns ok:false only when resolver throws — rare; used with `strict_schedule_prefs`. */
export function validateTrainingPrefsScheduleCollision(
  trainingPrefs: Record<string, unknown> | null | undefined,
  triDistance?: TriathlonDistance,
): {
  ok: true;
} | { ok: false; code: ScheduleCollisionCode; message: string } {
  if (!trainingPrefs || typeof trainingPrefs !== 'object' || Array.isArray(trainingPrefs)) {
    return { ok: true };
  }
  const sessions = trainingPrefsToCollisionSessions(trainingPrefs);
  if (sessions.length === 0) return { ok: true };
  try {
    resolveScheduleRules(sessions, triDistanceFromPrefs(trainingPrefs, triDistance));
    return { ok: true };
  } catch (e) {
    if (e instanceof ScheduleCollisionError) {
      return { ok: false, code: e.code, message: e.message };
    }
    throw e;
  }
}

export function validateCombinedSchedulePrefsCollision(
  prefs: CombinedSchedulePrefs,
  triDistance?: TriathlonDistance,
): {
  ok: true;
} | { ok: false; code: ScheduleCollisionCode; message: string } {
  const sessions = combinedSchedulePrefsToCollisionSessions(prefs);
  if (sessions.length === 0) return { ok: true };
  try {
    resolveScheduleRules(sessions, triDistance ?? '70.3');
    return { ok: true };
  } catch (e) {
    if (e instanceof ScheduleCollisionError) {
      return { ok: false, code: e.code, message: e.message };
    }
    throw e;
  }
}

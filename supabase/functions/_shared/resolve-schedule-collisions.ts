/**
 * Production collision handler for coarse weekly slot kinds (tri / combined planner vocabulary).
 * Pure: no IO. Clone-on-input; callers receive a new array.
 *
 * Throws ScheduleCollisionError when constraints cannot be satisfied without violating doctrine.
 */

export type DayOfWeek =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export type PlannedSessionType =
  | 'quality_bike'
  | 'quality_run'
  | 'easy_bike'
  | 'easy_run'
  | 'long_ride'
  | 'long_run'
  | 'lower_body_lift'
  | 'upper_body_lift'
  | 'swim';

export type PlannedIntensityZone = 'Z1' | 'Z2' | 'Z3' | 'Z4' | 'Z5';

export interface PlannedSession {
  id: string;
  type: PlannedSessionType;
  day: DayOfWeek;
  intensity: PlannedIntensityZone;
  isWeightBearing: boolean;
}

export const SCHEDULE_COLLISION_DAYS: readonly DayOfWeek[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type ScheduleCollisionCode =
  | 'SCHEDULE_GRIDLOCK_QUALITY_COLLISION'
  | 'SCHEDULE_GRIDLOCK_LOWER_BODY';

/** Thrown when resolveScheduleRules cannot produce a safe week. UI/Arc can catch by instanceof or `code`. */
export class ScheduleCollisionError extends Error {
  readonly code: ScheduleCollisionCode;

  constructor(code: ScheduleCollisionCode, message: string) {
    super(message);
    this.name = 'ScheduleCollisionError';
    this.code = code;
  }
}

function cloneSessions(sessions: PlannedSession[]): PlannedSession[] {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(sessions) as PlannedSession[];
  }
  return JSON.parse(JSON.stringify(sessions)) as PlannedSession[];
}

function uniqDays(days: Array<DayOfWeek | undefined>): DayOfWeek[] {
  const out: DayOfWeek[] = [];
  const seen = new Set<DayOfWeek>();
  for (const d of days) {
    if (!d || seen.has(d)) continue;
    seen.add(d);
    out.push(d);
  }
  return out;
}

function getSession(resolved: PlannedSession[], type: PlannedSessionType): PlannedSession | undefined {
  return resolved.find((s) => s.type === type);
}

function highStressDaysFrom(resolved: PlannedSession[]): DayOfWeek[] {
  return uniqDays([
    getSession(resolved, 'quality_bike')?.day,
    getSession(resolved, 'quality_run')?.day,
    getSession(resolved, 'long_ride')?.day,
    getSession(resolved, 'long_run')?.day,
  ]);
}

/**
 * Final gatekeeper: quality_run ≠ quality_bike same day; lower_body_lift ∉ high-stress days.
 */
export function validateScheduleCollisionInvariants(resolved: PlannedSession[]): void {
  const qBike = getSession(resolved, 'quality_bike');
  const qRun = getSession(resolved, 'quality_run');
  if (qBike && qRun && qBike.day === qRun.day) {
    throw new ScheduleCollisionError(
      'SCHEDULE_GRIDLOCK_QUALITY_COLLISION',
      'SCHEDULE_GRIDLOCK: Quality bike and quality run cannot share the same day with the current anchors.',
    );
  }

  const stress = highStressDaysFrom(resolved);
  const lb = getSession(resolved, 'lower_body_lift');
  if (lb && stress.includes(lb.day)) {
    throw new ScheduleCollisionError(
      'SCHEDULE_GRIDLOCK_LOWER_BODY',
      'SCHEDULE_GRIDLOCK: Cannot safely place Lower Body Lift without violating endurance constraints.',
    );
  }
}

export function resolveScheduleRules(sessions: PlannedSession[]): PlannedSession[] {
  const resolved = cloneSessions(sessions);

  const qBike = getSession(resolved, 'quality_bike');
  const qRun = getSession(resolved, 'quality_run');

  // RULE 1: Quality collision — move quality_run off quality_bike day
  if (qBike && qRun && qBike.day === qRun.day) {
    const invalidDays = uniqDays([
      qBike.day,
      getSession(resolved, 'long_ride')?.day,
      getSession(resolved, 'long_run')?.day,
      getSession(resolved, 'easy_run')?.day,
    ]);

    const newDay = SCHEDULE_COLLISION_DAYS.find((d) => !invalidDays.includes(d));
    if (!newDay) {
      throw new ScheduleCollisionError(
        'SCHEDULE_GRIDLOCK_QUALITY_COLLISION',
        'SCHEDULE_GRIDLOCK: No valid day to separate quality run from quality bike under current anchors.',
      );
    }
    qRun.day = newDay;
  }

  // RULE 2: Lower body lift — ranked scoring; forbidden only on high-stress days
  const lbLift = getSession(resolved, 'lower_body_lift');
  if (lbLift) {
    const highStressDays = highStressDaysFrom(resolved);

    if (highStressDays.includes(lbLift.day)) {
      const FORBIDDEN = -999;
      const dayScores = SCHEDULE_COLLISION_DAYS.map((day) => {
        if (highStressDays.includes(day)) return { day, score: FORBIDDEN };

        const sessionsOnDay = resolved.filter((s) => s.day === day);
        const hasWeightBearing = sessionsOnDay.some((s) => s.isWeightBearing);
        const sessionCount = sessionsOnDay.length;

        let score = 100;
        if (hasWeightBearing) score -= 20;
        score -= sessionCount * 10;

        return { day, score };
      });

      const candidates = dayScores
        .filter((d) => d.score > FORBIDDEN)
        .sort((a, b) => b.score - a.score);

      if (candidates.length > 0) {
        lbLift.day = candidates[0].day;
      }
    }
  }

  // RULE 3: Swim overflow — rest-day protection + herd prevention + never “move” to self
  const swims = resolved.filter((s) => s.type === 'swim');
  for (const swim of swims) {
    const sessionsOnThisDay = resolved.filter((s) => s.day === swim.day);
    const highIntensityCount = sessionsOnThisDay.filter((s) =>
      s.intensity === 'Z4' || s.intensity === 'Z5'
    ).length;

    if (sessionsOnThisDay.length > 2 || highIntensityCount > 1) {
      const dayLoads = SCHEDULE_COLLISION_DAYS.map((day) => {
        const count = resolved.filter((s) => s.day === day).length;
        let effectiveLoad = count;
        if (count === 0) effectiveLoad += 50;
        if (day === swim.day) effectiveLoad += 100;
        return { day, effectiveLoad };
      }).sort((a, b) => a.effectiveLoad - b.effectiveLoad);

      swim.day = dayLoads[0].day;
    }
  }

  validateScheduleCollisionInvariants(resolved);
  return resolved;
}

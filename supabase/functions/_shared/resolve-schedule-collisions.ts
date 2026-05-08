/**
 * Production collision handler for coarse weekly slot kinds (tri / combined planner vocabulary).
 * Pure: no IO. Clone-on-input; callers receive a new array.
 *
 * Distance-aware thresholds (sprint → 140.6) tune density / long-day stacking only;
 * core doctrine (quality separation, LB off hard days) is universal.
 */

export type DayOfWeek =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

/** Normalized tri distances used by collision tuning (goal `distance` strings map here). */
export type TriathlonDistance = 'sprint' | 'olympic' | '70.3' | '140.6';

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

type CollisionDistanceConfig = {
  /** Swim-overflow trigger: relocate swim when this many+ sessions share a day (with Z4/Z5 rule). */
  maxSessionsPerDay: number;
  /** When false, long_ride and long_run may not share a calendar day (70.3 / 140.6). */
  allowLongStack: boolean;
};

const DISTANCE_CONFIG: Record<TriathlonDistance, CollisionDistanceConfig> = {
  sprint: { maxSessionsPerDay: 2, allowLongStack: true },
  olympic: { maxSessionsPerDay: 2, allowLongStack: true },
  '70.3': { maxSessionsPerDay: 3, allowLongStack: false },
  '140.6': { maxSessionsPerDay: 3, allowLongStack: false },
};

/** Map plan goal `distance` / UI strings into collision tier (default 70.3). */
export function normalizeGoalDistanceToTriCollisionDistance(raw: unknown): TriathlonDistance {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!s) return '70.3';
  if (/\bsprint\b/.test(s) || s === 'sprint') return 'sprint';
  if (/\bolympic\b/.test(s) || s === 'olympic') return 'olympic';
  if (/\b70\.3\b/.test(s) || /\bhalf[\s_-]*iron/.test(s) || s === 'half_iron') return '70.3';
  if (/\b140\.6\b/.test(s) || /\bironman\b/.test(s) || /\bfull[\s_-]*iron/.test(s)) return '140.6';
  return '70.3';
}

export type ScheduleCollisionCode =
  | 'SCHEDULE_GRIDLOCK_QUALITY_COLLISION'
  | 'SCHEDULE_GRIDLOCK_LOWER_BODY'
  | 'SCHEDULE_GRIDLOCK_LONG_COLLISION';

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

export type ScheduleCollisionInvariantOptions = {
  allowLongStack?: boolean;
};

/**
 * Final gatekeeper: quality_run ≠ quality_bike same day; optional long_ride/long_run split;
 * lower_body_lift ∉ high-stress days.
 */
export function validateScheduleCollisionInvariants(
  resolved: PlannedSession[],
  options?: ScheduleCollisionInvariantOptions,
): void {
  const allowLongStack = options?.allowLongStack === true;

  const qBike = getSession(resolved, 'quality_bike');
  const qRun = getSession(resolved, 'quality_run');
  if (qBike && qRun && qBike.day === qRun.day) {
    throw new ScheduleCollisionError(
      'SCHEDULE_GRIDLOCK_QUALITY_COLLISION',
      'SCHEDULE_GRIDLOCK: Quality bike and quality run cannot share the same day with the current anchors.',
    );
  }

  const longRide = getSession(resolved, 'long_ride');
  const longRun = getSession(resolved, 'long_run');
  if (!allowLongStack && longRide && longRun && longRide.day === longRun.day) {
    throw new ScheduleCollisionError(
      'SCHEDULE_GRIDLOCK_LONG_COLLISION',
      'SCHEDULE_GRIDLOCK: Long ride and long run cannot share the same day under current constraints.',
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

export function resolveScheduleRules(
  sessions: PlannedSession[],
  distance: TriathlonDistance = '70.3',
): PlannedSession[] {
  const resolved = cloneSessions(sessions);
  const config = DISTANCE_CONFIG[distance] ?? DISTANCE_CONFIG['70.3'];

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

  // RULE 1.5: Long endurance stack (70.3 / 140.6 — separate long run from long ride day)
  const longRide = getSession(resolved, 'long_ride');
  const longRun = getSession(resolved, 'long_run');
  if (!config.allowLongStack && longRide && longRun && longRide.day === longRun.day) {
    const invalidDays = uniqDays([
      longRide.day,
      getSession(resolved, 'quality_bike')?.day,
      getSession(resolved, 'quality_run')?.day,
      getSession(resolved, 'lower_body_lift')?.day,
    ]);
    const newDay = SCHEDULE_COLLISION_DAYS.find((d) => !invalidDays.includes(d));
    if (!newDay) {
      throw new ScheduleCollisionError(
        'SCHEDULE_GRIDLOCK_LONG_COLLISION',
        'SCHEDULE_GRIDLOCK: No valid day to separate long ride and long run under current anchors.',
      );
    }
    longRun.day = newDay;
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

  // RULE 3: Swim overflow — density limit + rest/self inflation (distance-tuned)
  const swims = resolved.filter((s) => s.type === 'swim');
  for (const swim of swims) {
    const sessionsOnThisDay = resolved.filter((s) => s.day === swim.day);
    const highIntensityCount = sessionsOnThisDay.filter((s) =>
      s.intensity === 'Z4' || s.intensity === 'Z5'
    ).length;

    if (sessionsOnThisDay.length > config.maxSessionsPerDay || highIntensityCount > 1) {
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

  validateScheduleCollisionInvariants(resolved, { allowLongStack: config.allowLongStack });
  return resolved;
}

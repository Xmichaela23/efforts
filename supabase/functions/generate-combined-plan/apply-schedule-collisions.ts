/**
 * Bridges combined-plan PlannedSession rows to coarse collision resolver passes
 * (_shared/resolve-schedule-collisions.ts). Mutates session `day` in place — grid holds refs.
 */

import type { PlannedSession as GenPlannedSession, ConflictEvent } from './types.ts';
import {
  plannedSessionToScheduleSlot,
  type ScheduleSlotKind,
} from '../_shared/schedule-session-constraints.ts';
import {
  resolveScheduleRules,
  ScheduleCollisionError,
  SCHEDULE_COLLISION_DAYS,
  type DayOfWeek as CollisionDay,
  type PlannedSession as CollisionPlannedSession,
  type PlannedSessionType,
  type PlannedIntensityZone,
  type TriathlonDistance,
} from '../_shared/resolve-schedule-collisions.ts';

export type ScheduleCollisionGridSlot = { sessions: GenPlannedSession[] };
export type ScheduleCollisionGrid = Map<string, ScheduleCollisionGridSlot>;

function scheduleSlotForCollision(s: GenPlannedSession): ScheduleSlotKind | null {
  const tags = (s.tags ?? []).map((t) => String(t).toLowerCase());
  const ty = String(s.type || '').toLowerCase();
  if (tags.includes('tri_race') || tags.includes('race_day')) return null;
  if (ty === 'bike' && tags.includes('brick') && tags.includes('bike')) {
    return 'long_ride';
  }
  const base = plannedSessionToScheduleSlot(s);
  if (base === 'race_event') return null;
  // Brick run leg maps to easy_run but is not the athlete's weekday easy pillar — omit.
  if (base === 'easy_run' && tags.includes('brick')) return null;
  return base;
}

function slotToCollisionType(slot: ScheduleSlotKind): PlannedSessionType | null {
  switch (slot) {
    case 'quality_bike':
      return 'quality_bike';
    case 'quality_run':
      return 'quality_run';
    case 'easy_bike':
      return 'easy_bike';
    case 'easy_run':
      return 'easy_run';
    case 'long_ride':
      return 'long_ride';
    case 'long_run':
      return 'long_run';
    case 'lower_body_strength':
      return 'lower_body_lift';
    case 'upper_body_strength':
      return 'upper_body_lift';
    case 'easy_swim':
    case 'quality_swim':
      return 'swim';
    default:
      return null;
  }
}

function generatorDayToCollision(day: string): CollisionDay {
  const lo = String(day || 'Monday').trim().toLowerCase();
  return (SCHEDULE_COLLISION_DAYS as readonly string[]).includes(lo) ? (lo as CollisionDay) : 'monday';
}

function collisionDayToGenerator(d: CollisionDay): string {
  return d.charAt(0).toUpperCase() + d.slice(1);
}

function intensityToZone(ic: GenPlannedSession['intensity_class']): PlannedIntensityZone {
  if (ic === 'HARD') return 'Z4';
  if (ic === 'MODERATE') return 'Z3';
  return 'Z2';
}

function weightBearingForSlot(slot: ScheduleSlotKind): boolean {
  return slot === 'easy_run' || slot === 'quality_run' || slot === 'long_run';
}

export type CollisionExtractResult = {
  payload: CollisionPlannedSession[];
  idToFlatIndices: Map<string, number[]>;
};

/** Order must match grid iteration order used by callers (typically Mon-first week map). */
export function extractCollisionModel(flat: GenPlannedSession[]): CollisionExtractResult {
  const idToFlatIndices = new Map<string, number[]>();
  const payload: CollisionPlannedSession[] = [];
  const seenSingleton = new Set<PlannedSessionType>();
  let swimIdx = 0;

  for (let i = 0; i < flat.length; i++) {
    const s = flat[i];
    const slot = scheduleSlotForCollision(s);
    if (!slot) continue;
    const ct = slotToCollisionType(slot);
    if (!ct) continue;

    if (ct === 'swim') {
      const id = `swim-${swimIdx++}`;
      idToFlatIndices.set(id, [i]);
      payload.push({
        id,
        type: 'swim',
        day: generatorDayToCollision(s.day),
        intensity: intensityToZone(s.intensity_class),
        isWeightBearing: false,
      });
      continue;
    }

    if (!seenSingleton.has(ct)) {
      seenSingleton.add(ct);
      payload.push({
        id: ct,
        type: ct,
        day: generatorDayToCollision(s.day),
        intensity: intensityToZone(s.intensity_class),
        isWeightBearing: weightBearingForSlot(slot),
      });
      idToFlatIndices.set(ct, [i]);
    } else {
      const arr = idToFlatIndices.get(ct);
      if (arr) arr.push(i);
    }
  }

  return { payload, idToFlatIndices };
}

export function applyResolvedCollisionDays(
  flat: GenPlannedSession[],
  extracted: CollisionExtractResult,
  resolved: CollisionPlannedSession[],
): void {
  const afterById = new Map(resolved.map((row) => [row.id, row]));
  for (const row of extracted.payload) {
    const out = afterById.get(row.id);
    if (!out || out.day === row.day) continue;
    const newDay = collisionDayToGenerator(out.day);
    for (const idx of extracted.idToFlatIndices.get(row.id) ?? []) {
      flat[idx].day = newDay;
    }
  }
}

function flattenGrid(grid: ScheduleCollisionGrid): GenPlannedSession[] {
  return [...grid.values()].flatMap((s) => s.sessions);
}

function removeFirstMatchingFromGrid(grid: ScheduleCollisionGrid, pred: (s: GenPlannedSession) => boolean): boolean {
  for (const slot of grid.values()) {
    const i = slot.sessions.findIndex(pred);
    if (i >= 0) {
      slot.sessions.splice(i, 1);
      return true;
    }
  }
  return false;
}

function recordCollisionFailure(args: {
  weekNum: number;
  seq: number;
  err: ScheduleCollisionError;
  conflictEvents: ConflictEvent[];
  weekTradeOffs: string[];
}): void {
  const { weekNum, seq, err, conflictEvents, weekTradeOffs } = args;
  const isQuality = err.code === 'SCHEDULE_GRIDLOCK_QUALITY_COLLISION';
  const isLong = err.code === 'SCHEDULE_GRIDLOCK_LONG_COLLISION';
  const conflict_type = isQuality
    ? 'quality_bike_blocked'
    : isLong
      ? 'long_stack_blocked'
      : 'heavy_lower_blocked';
  const session_kind = isQuality ? 'quality_run' : isLong ? 'long_run' : 'lower_body_strength';
  conflictEvents.push({
    conflict_id: `w${weekNum}-collision-pass-${seq}`,
    conflict_type,
    blocked_intent: {
      session_kind,
      intensity_class: 'HARD',
    },
    blocking_reasons: ['anchor_conflict'],
    anchors_involved: [],
    applied_resolution: {
      type: 'none',
      note: err.message,
    },
  });
  weekTradeOffs.push(
    isQuality
      ? 'Weekly schedule collision pass skipped: quality bike and quality run anchors could not be separated automatically — review hard sessions.'
      : isLong
        ? 'Weekly schedule collision pass skipped: long ride and long run could not be separated on the calendar — review weekend anchors.'
        : 'Weekly schedule collision pass skipped: lower-body strength could not be moved off heavy endurance days without breaking constraints.',
  );
}

/**
 * Runs resolveScheduleRules against a coarse pillar map derived from the grid, then rewrites matching session days.
 * On failure: one retry after dropping one easy swim (if present); otherwise records conflict_events + trade-off.
 */
export function tryApplyScheduleCollisionsToGrid(
  grid: ScheduleCollisionGrid,
  ctx: {
    weekNum: number;
    conflictEvents: ConflictEvent[];
    weekTradeOffs: string[];
    /** Goal distance key (sprint / olympic / 70.3 / ironman) → collision tier. */
    triDistance?: TriathlonDistance;
  },
): void {
  const { weekNum, conflictEvents, weekTradeOffs, triDistance = '70.3' } = ctx;
  let attempt = 0;
  const maxAttempts = 2;

  while (attempt < maxAttempts) {
    const flat = flattenGrid(grid);
    const extracted = extractCollisionModel(flat);
    if (extracted.payload.length === 0) return;

    try {
      const resolved = resolveScheduleRules(extracted.payload, triDistance);
      applyResolvedCollisionDays(flat, extracted, resolved);
      if (attempt > 0) {
        weekTradeOffs.push(
          'Weekly schedule collision pass: removed one easy swim to satisfy coarse placement constraints.',
        );
      }
      return;
    } catch (e) {
      if (e instanceof ScheduleCollisionError && attempt === 0) {
        const dropped = removeFirstMatchingFromGrid(
          grid,
          (s) => scheduleSlotForCollision(s) === 'easy_swim',
        );
        if (dropped) {
          attempt++;
          continue;
        }
      }
      if (e instanceof ScheduleCollisionError) {
        recordCollisionFailure({
          weekNum,
          seq: attempt,
          err: e,
          conflictEvents,
          weekTradeOffs,
        });
      } else {
        console.error('[tryApplyScheduleCollisionsToGrid] unexpected error', e);
      }
      return;
    }
  }
}

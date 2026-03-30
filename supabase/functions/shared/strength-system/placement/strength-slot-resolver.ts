// ============================================================================
// ROLE-BASED STRENGTH SLOT RESOLVER
// Strategies declare semantic roles (day after long, mid-week easy, …); this
// module maps them to real weekdays using long/quality/run-day context.
// ============================================================================

import type { Weekday, Slot } from './types.ts';

export type SlotRole =
  | 'day_after_long'
  | 'mid_week_easy'
  | 'second_easy'
  | 'pre_long_buffer'
  | 'any_easy';

export type StrengthFocus = 'upper' | 'lower' | 'full' | 'durability';

export interface StrengthRoleSlot {
  role: SlotRole;
  focus: StrengthFocus;
  optional?: boolean;
}

export interface ResolverSchedule {
  longRunDay: Weekday;
  qualityDays: Weekday[];
  /** Days with a planned run; when non-empty, strength is limited to these days. */
  runDays: Weekday[];
}

export interface ResolveStrengthRoleOptions {
  /** Exclude the calendar day immediately before the long run. */
  excludeDayBeforeLong?: boolean;
  /** For lower/durability, exclude the day before each quality session. */
  lowerBufferQuality?: boolean;
}

const SUN_RING: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function widx(d: Weekday): number {
  return SUN_RING.indexOf(d);
}

function wfrom(i: number): Weekday {
  return SUN_RING[(i % 7 + 7) % 7];
}

function circDist(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, 7 - d);
}

export function focusToSlot(focus: StrengthFocus, optional?: boolean): Slot {
  const o = optional === true;
  switch (focus) {
    case 'upper':
      return o ? 'upper_optional' : 'upper_primary';
    case 'lower':
      return o ? 'lower_optional' : 'lower_primary';
    case 'full':
      return o ? 'upper_optional' : 'upper_primary';
    case 'durability':
      return 'lower_optional';
    default:
      return 'upper_optional';
  }
}

function buildEasyDays(sched: ResolverSchedule): Weekday[] {
  const long = sched.longRunDay;
  const qual = new Set(sched.qualityDays);
  const run =
    sched.runDays.length > 0 ? new Set(sched.runDays) : new Set(SUN_RING);
  const out: Weekday[] = [];
  for (const d of SUN_RING) {
    if (!run.has(d)) continue;
    if (d === long) continue;
    if (qual.has(d)) continue;
    out.push(d);
  }
  return out;
}

function scoreDay(day: Weekday, longIdx: number, qualityIdxs: number[]): number {
  const di = widx(day);
  const distLong = circDist(di, longIdx);
  const distQuality =
    qualityIdxs.length === 0
      ? 3
      : Math.min(...qualityIdxs.map(qi => circDist(di, qi)));
  return distLong + distQuality * 0.8;
}

function isLowerish(spec: StrengthRoleSlot): boolean {
  return spec.focus === 'lower' || spec.focus === 'durability';
}

/**
 * Map ordered role slots to weekday → placement Slot. Respects runDays, buffers
 * around long run and (for lower) around quality days.
 */
export function resolveStrengthRoleSlots(
  slots: StrengthRoleSlot[],
  sched: ResolverSchedule,
  opts: ResolveStrengthRoleOptions = {},
): Partial<Record<Weekday, Slot>> {
  const {
    excludeDayBeforeLong = true,
    lowerBufferQuality = true,
  } = opts;

  const longIdx = widx(sched.longRunDay);
  const qualityIdxs = sched.qualityDays.map(widx).filter(i => i >= 0);
  const dayBeforeLong = wfrom(longIdx - 1);
  const dayAfterLong = wfrom(longIdx + 1);

  const easyBase = buildEasyDays(sched);
  const sortedEasy = [...easyBase].sort(
    (a, b) => scoreDay(b, longIdx, qualityIdxs) - scoreDay(a, longIdx, qualityIdxs),
  );

  const forbiddenAll = new Set<Weekday>();
  if (excludeDayBeforeLong) forbiddenAll.add(dayBeforeLong);

  const forbiddenLower = new Set<Weekday>(forbiddenAll);
  if (lowerBufferQuality && sched.qualityDays.length > 0) {
    for (const q of sched.qualityDays) {
      forbiddenLower.add(wfrom(widx(q) - 1));
    }
  }

  const used = new Set<Weekday>();
  const out: Partial<Record<Weekday, Slot>> = {};

  const runOk = (d: Weekday) =>
    sched.runDays.length === 0 || sched.runDays.includes(d);

  const pick = (orderedCandidates: Weekday[], spec: StrengthRoleSlot): Weekday | null => {
    const forbid = isLowerish(spec) ? forbiddenLower : forbiddenAll;
    for (const d of orderedCandidates) {
      if (used.has(d)) continue;
      if (!runOk(d)) continue;
      if (forbid.has(d)) continue;
      used.add(d);
      return d;
    }
    // Last resort: any unused run day not long/quality (ignore soft forbids except long day)
    for (const d of SUN_RING) {
      if (used.has(d)) continue;
      if (!runOk(d)) continue;
      if (d === sched.longRunDay) continue;
      if (sched.qualityDays.includes(d)) continue;
      if (isLowerish(spec) && forbiddenLower.has(d)) continue;
      if (!isLowerish(spec) && forbiddenAll.has(d)) continue;
      used.add(d);
      return d;
    }
    return null;
  };

  for (const spec of slots) {
    const slotKind = focusToSlot(spec.focus, spec.optional);
    let ordered: Weekday[] = [];

    switch (spec.role) {
      case 'day_after_long':
        ordered = [dayAfterLong, ...sortedEasy, ...SUN_RING];
        break;
      case 'mid_week_easy':
        ordered = [...sortedEasy, ...SUN_RING];
        break;
      case 'second_easy':
        ordered = [...sortedEasy, ...SUN_RING];
        break;
      case 'pre_long_buffer': {
        const twoBefore = wfrom(longIdx - 2);
        ordered = [twoBefore, ...sortedEasy, ...SUN_RING];
        break;
      }
      case 'any_easy':
        ordered = [...sortedEasy, ...SUN_RING];
        break;
    }

    const chosen = pick(ordered, spec);
    if (chosen) out[chosen] = slotKind;
  }

  return out;
}

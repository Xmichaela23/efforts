// ============================================================================
// PLACEMENT STRATEGY FACTORY
// 
// Methodology-aware strength placement strategies
// ============================================================================

import {
  PlacementContext,
  PlacementStrategy,
  MethodologyId,
  StrengthProtocolId,
  Weekday,
  Slot,
} from './types.ts';
import {
  resolveStrengthRoleSlots,
  type StrengthRoleSlot,
  type ResolverSchedule,
} from './strength-slot-resolver.ts';

/**
 * Get placement strategy based on methodology and constraints
 */
export function getPlacementStrategy(ctx: PlacementContext): PlacementStrategy {
  if (ctx.methodology === 'triathlon') {
    return getTriathlonStrategy(ctx);
  }
  if (ctx.methodology === 'hal_higdon_complete') {
    return getHigdonStrategy(ctx);
  } else {
    return getDanielsStrategy(ctx);
  }
}

/** Returns true if the hotspot list contains any lower-body injury flags. */
function hasLowerBodyHotspot(hotspots: string[]): boolean {
  const lowerTerms = [
    'it_band', 'iliotibial', 'knee', 'hip', 'achilles', 'quad', 'quadricep',
    'hamstring', 'calf', 'shin', 'plantar', 'glute', 'ankle', 'foot',
    'tibial', 'peroneal', 'patellar', 'femoral',
  ];
  return hotspots.some(h =>
    lowerTerms.some(t => String(h ?? '').toLowerCase().includes(t))
  );
}

function resolverScheduleFromCtx(ctx: PlacementContext): ResolverSchedule {
  const runDays =
    ctx.runDays && ctx.runDays.length > 0
      ? ctx.runDays
      : [...new Set<Weekday>([ctx.longRunDay, ...ctx.qualityDays])];
  return {
    longRunDay: ctx.longRunDay,
    qualityDays: ctx.qualityDays,
    runDays,
  };
}

/**
 * Hal Higdon (Completion) Strategy — role-based placement resolved against the real plan week.
 */
function getHigdonStrategy(ctx: PlacementContext): PlacementStrategy {
  const lowerBodyRisk = hasLowerBodyHotspot(ctx.injuryHotspots ?? []);
  const sched = resolverScheduleFromCtx(ctx);
  const roleSlots: StrengthRoleSlot[] = [
    { role: 'day_after_long', focus: 'upper' },
    { role: 'mid_week_easy', focus: 'lower' },
  ];
  if (ctx.strengthFrequency >= 3) {
    roleSlots.push({
      role: 'second_easy',
      focus: lowerBodyRisk ? 'upper' : 'lower',
      optional: true,
    });
  }
  const slotsByDay = resolveStrengthRoleSlots(roleSlots, sched, {
    excludeDayBeforeLong: true,
    lowerBufferQuality: true,
  });

  return {
    name: 'Hal Higdon (Completion)',
    slotsByDay,
    notes:
      'Upper after the long run; lower on the best-buffered easy day; optional third slot respects injury flags.',
  };
}

/**
 * Jack Daniels (Performance) Strategy
 * 
 * Philosophy: Polarization. Tue/Thu are true quality/speed days.
 * Wednesday must remain a recovery valley.
 * 
 * Preferred (with doubles):
 * - Monday: Upper Body (Recovery/Flush)
 * - Tuesday: Lower Body (PM, post-run) -> Consolidate Stress
 * - Wednesday: REST (No strength)
 * - Friday: Optional Upper / Mobility
 * 
 * Fallback (no doubles):
 * - neural_speed: Wed lower_primary (CNS fatigue OK, low structural damage)
 * - durability: Sat lower_primary but force it to "light durability" (cap volume)
 * - upper_aesthetics: Mon/Wed/Fri upper work; lower optional on Sat or none
 */
function getDanielsStrategy(ctx: PlacementContext): PlacementStrategy {
  if (!ctx.noDoubles) {
    const sched = resolverScheduleFromCtx(ctx);
    const roleSlots: StrengthRoleSlot[] = [
      { role: 'day_after_long', focus: 'upper' },
      { role: 'mid_week_easy', focus: 'lower' },
    ];
    if (ctx.strengthFrequency >= 3) {
      roleSlots.push({ role: 'second_easy', focus: 'upper', optional: true });
    }
    const slotsByDay = resolveStrengthRoleSlots(roleSlots, sched, {
      excludeDayBeforeLong: true,
      lowerBufferQuality: true,
    });
    // JD distributed: strength is intentionally confined to **easy** days only (resolver never
    // picks quality). We still stamp quality weekdays as `none` so any future slot logic or
    // guardrails cannot stack sessions on I/T/M days — this is a hard polarisation rule, not
    // masking a failed resolve (easy candidates are already excluded from the role picks).
    for (const q of ctx.qualityDays) {
      slotsByDay[q] = 'none';
    }

    return {
      name: 'Jack Daniels (Performance) - Distributed',
      slotsByDay,
      notes:
        'Upper after long run; lower on the most buffered easy day; quality days stay clear; optional upper on another easy day.',
    };
  }

  return getDanielsFallbackStrategy(ctx);
}

/**
 * Jack Daniels Fallback Strategy (No Doubles)
 */
function getDanielsFallbackStrategy(ctx: PlacementContext): PlacementStrategy {
  const sched = resolverScheduleFromCtx(ctx);
  const baseOpts = {
    excludeDayBeforeLong: true,
    lowerBufferQuality: true,
  } as const;

  if (ctx.protocol === 'neural_speed') {
    const roleSlots: StrengthRoleSlot[] = [
      { role: 'day_after_long', focus: 'upper' },
      { role: 'mid_week_easy', focus: 'lower' },
    ];
    if (ctx.strengthFrequency >= 3) {
      roleSlots.push({ role: 'second_easy', focus: 'upper', optional: true });
    }
    const slotsByDay = resolveStrengthRoleSlots(roleSlots, sched, baseOpts);

    return {
      name: 'Jack Daniels (Performance) - Neural Speed Fallback',
      slotsByDay,
      notes:
        'No doubles: upper after long run; lower neural on the best mid-week easy day; optional upper if frequency allows.',
    };
  }

  if (ctx.protocol === 'durability') {
    const lowerBodyRisk = hasLowerBodyHotspot(ctx.injuryHotspots ?? []);
    const roleSlots: StrengthRoleSlot[] = [
      { role: 'day_after_long', focus: 'upper' },
    ];
    if (!lowerBodyRisk) {
      roleSlots.push({ role: 'pre_long_buffer', focus: 'lower' });
    }
    if (ctx.strengthFrequency >= 3) {
      roleSlots.push({ role: 'second_easy', focus: 'upper', optional: true });
    }
    const slotsByDay = resolveStrengthRoleSlots(roleSlots, sched, baseOpts);

    const hotspotNote = lowerBodyRisk
      ? ' Lower omitted: lower-body injury flags — protecting the long run.'
      : '';

    return {
      name: 'Jack Daniels (Performance) - Durability Fallback',
      slotsByDay,
      notes: `Lower on a buffered day two steps before long when safe; upper after long.${hotspotNote}`,
    };
  }

  const roleSlots: StrengthRoleSlot[] = [
    { role: 'day_after_long', focus: 'upper' },
  ];
  if (ctx.strengthFrequency >= 2) {
    roleSlots.push({ role: 'mid_week_easy', focus: 'upper', optional: true });
  }
  if (ctx.strengthFrequency >= 3) {
    roleSlots.push({ role: 'second_easy', focus: 'lower', optional: true });
  }
  const slotsByDay = resolveStrengthRoleSlots(roleSlots, sched, baseOpts);

  return {
    name: 'Jack Daniels (Performance) - Upper Aesthetics Fallback',
    slotsByDay,
    notes: 'Upper-dominant: stacked on easy days away from long/quality; optional lower on another easy day.',
  };
}

/**
 * Triathlon Placement Strategy
 *
 * Hard rules:
 *   1. NEVER place on a brick day (neuromuscular fatigue + injury risk).
 *   2. NEVER place on Sunday (long run).
 *   3. NEVER place on Saturday when it carries a brick or long ride.
 *   4. If the candidate day has a HARD endurance session, append a 6-h
 *      interference warning to the session description (cannot rearrange at
 *      this layer — coaches should AM/PM split).
 *
 * Preferred slot order:
 *   Slot 1 (lower/posterior): Monday (easy swim day) → Tuesday if Mon blocked.
 *   Slot 2 (upper/swim, base phase only): Wednesday → Thursday if Wed blocked.
 *   Optional slot: Tuesday if frequency ≥ 3 and Mon/Wed are the primary slots.
 *
 * This mirrors how elite tri coaches place strength — on the lightest aerobic
 * days, well away from the long brick and the long run.
 */
function getTriathlonStrategy(ctx: PlacementContext): PlacementStrategy {
  const brickSet = new Set<Weekday>(ctx.brickDays ?? []);
  const hardSet  = new Set<Weekday>(ctx.hardEnduranceDays ?? []);

  // Days that can never receive strength
  const blocked = new Set<Weekday>(['sat', 'sun', ...brickSet]);

  // Helper: find first available weekday from an ordered preference list
  function firstAvailable(preferences: Weekday[]): Weekday | null {
    return preferences.find(d => !blocked.has(d)) ?? null;
  }

  const slots: Partial<Record<Weekday, Slot>> = {};

  // Slot 1 — lower/posterior chain
  const lowerDay = firstAvailable(['mon', 'tue', 'wed']);
  if (lowerDay) {
    slots[lowerDay] = 'lower_primary';
    // Interference warning: if this is also a HARD day, note it
    if (hardSet.has(lowerDay)) {
      // Can't modify the slot type but caller reads hardEnduranceDays to inject warning
    }
  }

  // Slot 2 — upper/swim (only when frequency ≥ 2)
  if (ctx.strengthFrequency >= 2 && lowerDay) {
    // Prefer a day that isn't the same as lowerDay and isn't hard endurance
    const upperPrefs: Weekday[] = (['mon', 'tue', 'wed', 'thu', 'fri'] as Weekday[]).filter(
      d => d !== lowerDay && !blocked.has(d)
    );
    // Prefer days that don't have HARD endurance (interference avoidance)
    const softPrefs = upperPrefs.filter(d => !hardSet.has(d));
    const upperDay  = softPrefs[0] ?? upperPrefs[0] ?? null;
    if (upperDay) slots[upperDay] = 'upper_primary';
  }

  // Optional slot (frequency ≥ 3)
  if (ctx.strengthFrequency >= 3) {
    const usedDays = new Set(Object.keys(slots) as Weekday[]);
    const optPrefs: Weekday[] = (['tue', 'wed', 'thu', 'fri'] as Weekday[]).filter(
      d => !usedDays.has(d) && !blocked.has(d) && !hardSet.has(d)
    );
    if (optPrefs[0]) slots[optPrefs[0]] = 'mobility_optional';
  }

  // Explicitly block brick days and long-session days
  for (const d of blocked) {
    if (!slots[d]) slots[d] = 'none';
  }

  const blockedNote = brickSet.size > 0
    ? ` Brick day(s) (${[...brickSet].join(', ')}) are hard-blocked.`
    : '';
  const hardNote = hardSet.size > 0
    ? ` 6-h separation recommended on ${[...hardSet].join(', ')} (HARD endurance day).`
    : '';

  return {
    name: 'Triathlon Multi-Sport',
    slotsByDay: slots,
    notes: `Strength placed on lightest aerobic days only.${blockedNote}${hardNote}`,
  };
}

/**
 * Map run approach to methodology ID
 */
export function mapApproachToMethodology(approach: string): MethodologyId {
  if (approach === 'sustainable') {
    return 'hal_higdon_complete';
  } else if (approach === 'performance_build') {
    return 'jack_daniels_performance';
  }
  // Default fallback
  return 'hal_higdon_complete';
}

/**
 * Convert weekday string to Weekday type
 */
export function normalizeWeekday(day: string): Weekday {
  const normalized = String(day ?? '').toLowerCase().substring(0, 3);
  const weekdays: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  return weekdays.includes(normalized as Weekday) ? (normalized as Weekday) : 'mon';
}

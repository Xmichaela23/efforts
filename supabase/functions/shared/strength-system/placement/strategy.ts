// ============================================================================
// PLACEMENT STRATEGY FACTORY
// 
// Methodology-aware strength placement strategies
// ============================================================================

import {
  PlacementContext,
  PlacementStrategy,
  MethodologyId,
  Weekday,
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
  // ⛔ The `'triathlon'` branch and `getTriathlonStrategy` were DELETED 2026-07-27 as unreachable.
  // `mapApproachToMethodology` returns only `hal_higdon_complete` or `jack_daniels_performance`,
  // and both live entry points (`generate-run-plan`, `adapt-plan`) type the field as that two-value
  // union. Nothing could ever set `'triathlon'`, so the branch — and its own hardcoded weekday
  // preference lists, its own Sat/Sun block, and its own first-available scan — never ran.
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
  if (ctx.strengthFrequency >= 4) {
    // Q-088 strength-focus mode: a full 4-day U/L/U/L (2 upper + 2 lower) on 4
    // distinct days. Endurance is maintained/parked, so allow non-run (rest) days.
    roleSlots.push({ role: 'second_easy', focus: 'upper' });
    roleSlots.push({ role: 'any_easy', focus: 'lower' });
  } else if (ctx.strengthFrequency >= 3) {
    roleSlots.push({
      role: 'second_easy',
      focus: lowerBodyRisk ? 'upper' : 'lower',
      optional: true,
    });
  }
  const slotsByDay = resolveStrengthRoleSlots(roleSlots, sched, {
    excludeDayBeforeLong: true,
    lowerBufferQuality: true,
    allowNonRunDays: ctx.strengthFrequency >= 4,
  });

  return {
    name: 'Hal Higdon (Completion)',
    slotsByDay,
    notes: ctx.strengthFrequency >= 4
      ? 'Strength-focus 4-day U/L/U/L: upper after the long run, lower mid-week, plus a second upper and lower on the best-buffered days (rest days allowed).'
      : 'Upper after the long run; lower on the best-buffered easy day; optional third slot respects injury flags.',
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
    if (ctx.strengthFrequency >= 4) {
      // Q-088 strength-focus 4-day U/L/U/L (2 upper + 2 lower) on distinct days.
      roleSlots.push({ role: 'second_easy', focus: 'upper' });
      roleSlots.push({ role: 'any_easy', focus: 'lower' });
    } else if (ctx.strengthFrequency >= 3) {
      roleSlots.push({ role: 'second_easy', focus: 'upper', optional: true });
    }
    const slotsByDay = resolveStrengthRoleSlots(roleSlots, sched, {
      excludeDayBeforeLong: true,
      lowerBufferQuality: true,
      allowNonRunDays: ctx.strengthFrequency >= 4,
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

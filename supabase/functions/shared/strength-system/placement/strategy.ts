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
    lowerTerms.some(t => h.toLowerCase().includes(t))
  );
}

/**
 * Hal Higdon (Completion) Strategy
 * 
 * Philosophy: Long run (Sunday) is the dominant stressor.
 * Tue/Thu are aerobic volume, not high-intensity quality.
 * 
 * Schedule:
 * - Monday: Upper Body (Priority)
 * - Wednesday: Lower Body (Priority) - furthest from Sunday long run
 * - Friday: Optional / Durability (Light) — upper only when lower-body hotspots are flagged
 */
function getHigdonStrategy(ctx: PlacementContext): PlacementStrategy {
  const slots: Partial<Record<Weekday, Slot>> = {
    mon: 'upper_primary',
    wed: 'lower_primary',
  };

  if (ctx.strengthFrequency >= 3) {
    // Friday lower creates fatigue the day before Saturday easy run and two days before Sunday long run.
    // When lower-body hotspots are flagged (e.g. achilles, IT band), protect that window.
    const lowerBodyRisk = hasLowerBodyHotspot(ctx.injuryHotspots ?? []);
    slots.fri = lowerBodyRisk ? 'upper_optional' : 'lower_optional';
  }

  return {
    name: 'Hal Higdon (Completion)',
    slotsByDay: slots,
    notes: 'Wednesday lower is ideal as it is furthest from Sunday long run and there is no Tuesday/Thursday intensity interference.',
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
    // Mon upper + Wed lower: Wednesday is always an easy-run day in JD plans,
    // so lower neural here never conflicts with quality work. Thursday stays
    // clean for T-pace / I-pace sessions. 72h from Wed lower → Sat, 96h → Sun
    // long run — plenty of recovery on both ends.
    const slots: Partial<Record<Weekday, Slot>> = {
      mon: 'upper_primary',
      wed: 'lower_primary',
      thu: 'none', // Quality run day — no strength stacking
    };

    // Always include Friday as an optional upper slot — athletes doing 2x/week
    // can skip it, but it should always be offered.
    slots.fri = 'upper_optional';

    return {
      name: 'Jack Daniels (Performance) - Distributed',
      slotsByDay: slots,
      notes: 'Upper Monday, lower Thursday. Wednesday stays clean. Thursday lower is 48h after Tuesday quality and 72h before Sunday long run.',
    };
  }

  // Fallback: No doubles allowed
  return getDanielsFallbackStrategy(ctx);
}

/**
 * Jack Daniels Fallback Strategy (No Doubles)
 */
function getDanielsFallbackStrategy(ctx: PlacementContext): PlacementStrategy {
  const slots: Partial<Record<Weekday, Slot>> = {
    mon: 'upper_primary',
    wed: 'none', // Protected recovery valley
  };

  if (ctx.protocol === 'neural_speed') {
    // Neural Speed: Lower on Wednesday is acceptable
    // (CNS fatigue is high, but metabolic/structural damage is low)
    slots.wed = 'lower_primary';

    if (ctx.strengthFrequency >= 3) {
      slots.fri = 'upper_optional';
    }

    return {
      name: 'Jack Daniels (Performance) - Neural Speed Fallback',
      slotsByDay: slots,
      notes: 'Lower neural on Wednesday acceptable because CNS fatigue is high but structural damage is low.',
    };
  }

  if (ctx.protocol === 'durability') {
    // Saturday is adjacent to Sunday long run. When lower-body hotspots are flagged,
    // skip the lower session entirely — the long run is the priority stressor.
    const lowerBodyRisk = hasLowerBodyHotspot(ctx.injuryHotspots ?? []);
    slots.sat = lowerBodyRisk ? 'none' : 'lower_primary';

    if (ctx.strengthFrequency >= 3) {
      slots.fri = 'upper_optional';
    }

    const hotspotNote = lowerBodyRisk
      ? ' Saturday lower omitted: lower-body injury flags detected — protecting Sunday long run.'
      : '';

    return {
      name: 'Jack Daniels (Performance) - Durability Fallback',
      slotsByDay: slots,
      notes: `Lower durability on Saturday (light/maintenance) to preserve Sunday long run performance.${hotspotNote}`,
    };
  }

  // upper_aesthetics: Keep upper-dominant, lower optional on Sat or none
  if (ctx.strengthFrequency >= 2) {
    slots.wed = 'upper_optional'; // Additional upper work
  }

  if (ctx.strengthFrequency >= 3) {
    slots.fri = 'upper_optional';
    slots.sat = 'lower_optional'; // Optional lower maintenance
  }

  return {
    name: 'Jack Daniels (Performance) - Upper Aesthetics Fallback',
    slotsByDay: slots,
    notes: 'Upper-dominant protocol. Lower work is optional on Saturday or omitted.',
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
  const normalized = day.toLowerCase().substring(0, 3);
  const weekdays: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  return weekdays.includes(normalized as Weekday) ? (normalized as Weekday) : 'mon';
}

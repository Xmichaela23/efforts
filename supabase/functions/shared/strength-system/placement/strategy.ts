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
  if (ctx.methodology === 'hal_higdon_complete') {
    return getHigdonStrategy(ctx);
  } else {
    return getDanielsStrategy(ctx);
  }
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
 * - Friday: Optional / Durability (Light)
 */
function getHigdonStrategy(ctx: PlacementContext): PlacementStrategy {
  const slots: Partial<Record<Weekday, Slot>> = {
    mon: 'upper_primary',
    wed: 'lower_primary',
  };

  // Add optional slot on Friday if frequency >= 3
  if (ctx.strengthFrequency >= 3) {
    slots.fri = 'lower_optional'; // Protocol decides what goes here
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
    // Preferred: Stack on Tuesday
    const slots: Partial<Record<Weekday, Slot>> = {
      mon: 'upper_primary',
      tue: 'lower_primary', // Stacked PM after quality run
      wed: 'none', // Recovery valley
    };

    // Add optional slot on Friday if frequency >= 3
    if (ctx.strengthFrequency >= 3) {
      slots.fri = 'upper_optional';
    }

    return {
      name: 'Jack Daniels (Performance) - Stacked',
      slotsByDay: slots,
      notes: 'Lower body stacked on Tuesday PM to consolidate stress. Wednesday remains recovery valley.',
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
    // Durability: Lower on Saturday (light/maintenance only)
    slots.sat = 'lower_primary'; // Will be forced to light durability

    if (ctx.strengthFrequency >= 3) {
      slots.fri = 'upper_optional';
    }

    return {
      name: 'Jack Daniels (Performance) - Durability Fallback',
      slotsByDay: slots,
      notes: 'Lower durability on Saturday (light/maintenance) to preserve Sunday long run performance.',
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
 * Map run approach to methodology ID
 */
export function mapApproachToMethodology(approach: string): MethodologyId {
  if (approach === 'simple_completion') {
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

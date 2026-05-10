/**
 * Strength "equipment type" for protocol selection.
 * `commercial_gym` in generate-combined-plan / triathlon.ts means barbell-access tier
 * (commercial membership OR well-equipped home with barbell + rack).
 */

export function normStrengthEquipmentStrings(strengthEquipment: unknown): string[] {
  if (!Array.isArray(strengthEquipment)) return [];
  return strengthEquipment.map((s) => String(s).toLowerCase());
}

/**
 * True only when the athlete has a GHD machine, dedicated Nordic bench, or similar
 * fixed floor anchor (e.g. "ghd", "nordic bench", "glute ham raise").
 * No current equipment UI option produces this — so Nordics will not fire until one is added.
 */
export function hasGHD(strengthEquipment: string[]): boolean {
  const n = normStrengthEquipmentStrings(strengthEquipment);
  return n.some(
    (s) => s.includes('ghd') || s.includes('nordic bench') || s.includes('glute ham raise'),
  );
}

export function hasCableMachine(strengthEquipment: string[]): boolean {
  const n = normStrengthEquipmentStrings(strengthEquipment);
  return (
    n.some((s) => s.includes('cable')) ||
    n.some((s) => s.includes('commercial gym'))
  );
}

export function hasBarbellCapability(strengthEquipment: string[]): boolean {
  const n = normStrengthEquipmentStrings(strengthEquipment);
  const some = (sub: string) => n.some((s) => s.includes(sub));
  return (
    some('commercial gym') ||
    (some('barbell') && some('plate')) ||
    some('squat rack') ||
    some('power cage')
  );
}

/** Two+ positive compound 1RM fields → treat as barbell-capable if equipment list is stale. */
export function hasCompound1RMSignals(performanceNumbers: unknown): boolean {
  const p =
    performanceNumbers && typeof performanceNumbers === 'object' && !Array.isArray(performanceNumbers)
      ? (performanceNumbers as Record<string, unknown>)
      : null;
  if (!p) return false;
  const ok = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0;
  };
  const hits = [
    ok(p.squat ?? p.squat1RM ?? p.squat_1rm),
    ok(p.deadlift ?? p.dead_lift),
    ok(p.bench ?? p.bench_press ?? p.benchPress),
    ok(p.overheadPress1RM ?? p.ohp ?? p.overhead_press ?? p.overhead),
  ].filter(Boolean).length;
  return hits >= 2;
}

/**
 * Resolves athlete_state.equipment_type for generate-combined-plan / generate-triathlon-plan.
 * Arc may save home_gym while baselines list a full barbell setup — barbell signals win.
 */
export function resolveStrengthEquipmentTypeForPlan(
  explicitEquipmentType: unknown,
  strengthEquipment: string[],
  performanceNumbers: unknown,
): 'home_gym' | 'commercial_gym' {
  if (hasBarbellCapability(strengthEquipment) || hasCompound1RMSignals(performanceNumbers)) {
    return 'commercial_gym';
  }
  const ex = String(explicitEquipmentType ?? '').trim().toLowerCase();
  if (ex === 'home_gym' || ex === 'commercial_gym') return ex;
  return 'home_gym';
}

// ── Three-tier equipment (docs/STRENGTH-PROTOCOL.md §2 + §8) ────────────────

/** Detect dumbbell access (any DB chip). Adjustable, fixed, or pair counts all qualify. */
export function hasDumbbells(strengthEquipment: string[]): boolean {
  const n = normStrengthEquipmentStrings(strengthEquipment);
  return n.some(
    (s) =>
      s.includes('dumbbell') ||
      /\bdb\b/.test(s) ||
      s.includes('adjustable dumb'),
  );
}

/** Detect kettlebell access (used by performance Maintenance + Power phase). */
export function hasKettlebell(strengthEquipment: string[]): boolean {
  const n = normStrengthEquipmentStrings(strengthEquipment);
  return n.some((s) => s.includes('kettlebell') || /\bkb\b/.test(s));
}

/** Detect bench access. */
export function hasBench(strengthEquipment: string[]): boolean {
  const n = normStrengthEquipmentStrings(strengthEquipment);
  return n.some((s) => s.includes('bench'));
}

/**
 * Three-tier equipment classification per spec §8.
 * - `commercial_gym` — full barbell + rack + bench (covers spec's "Full barbell tier")
 * - `dumbbell_based` — DBs + (usually) bench, no barbell
 * - `bodyweight_bands` — bands only, possibly pull-up bar
 */
export type StrengthEquipmentTier3 = 'commercial_gym' | 'dumbbell_based' | 'bodyweight_bands';

/**
 * Resolve to 3-tier classification. Strict precedence:
 *   barbell signals → commercial_gym (matches `resolveStrengthEquipmentTypeForPlan`)
 *   DBs detected   → dumbbell_based
 *   else           → bodyweight_bands
 *
 * `performanceNumbers` only upgrades to commercial_gym (consistent with the 2-tier resolver):
 * an athlete with logged compound 1RMs probably has barbell access even if the chip list is stale.
 */
export function resolveStrengthEquipmentTier3(
  explicitEquipmentType: unknown,
  strengthEquipment: string[],
  performanceNumbers: unknown,
): StrengthEquipmentTier3 {
  if (hasBarbellCapability(strengthEquipment) || hasCompound1RMSignals(performanceNumbers)) {
    return 'commercial_gym';
  }
  if (hasDumbbells(strengthEquipment)) {
    return 'dumbbell_based';
  }
  // Honor an explicit "commercial_gym" tag if the user typed it manually but their chip list
  // is otherwise sparse — treat as commercial_gym (matches 2-tier behavior).
  const ex = String(explicitEquipmentType ?? '').trim().toLowerCase();
  if (ex === 'commercial_gym') return 'commercial_gym';
  return 'bodyweight_bands';
}

/**
 * Performance-without-loadable-resistance gate (spec §2). Returns the effective intent +
 * a downgrade message when an athlete asked for performance but lacks barbell AND DBs —
 * progressive loading isn't possible at the bodyweight_bands tier.
 */
export function gateStrengthIntentByTier(
  intent: 'performance' | 'support' | 'none' | 'co-equal' | string | null | undefined,
  tier3: StrengthEquipmentTier3,
): {
  effectiveIntent: 'performance' | 'support' | 'none';
  downgraded: boolean;
  message: string | null;
} {
  const norm = String(intent ?? '').trim().toLowerCase();
  const wantsPerf = norm === 'performance' || norm === 'co-equal';
  const isNone = norm === 'none';

  if (isNone) {
    return { effectiveIntent: 'none', downgraded: false, message: null };
  }

  if (wantsPerf && tier3 === 'bodyweight_bands') {
    return {
      effectiveIntent: 'support',
      downgraded: true,
      message:
        'Performance strength requires barbell or dumbbell access for progressive loading. ' +
        "With your current equipment we'll deliver the durability protocol instead. " +
        'Add dumbbells or barbell access to unlock performance protocol.',
    };
  }

  return {
    effectiveIntent: wantsPerf ? 'performance' : 'support',
    downgraded: false,
    message: null,
  };
}

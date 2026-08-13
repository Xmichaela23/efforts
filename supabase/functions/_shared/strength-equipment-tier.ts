/**
 * Strength equipment helpers. Two distinct concepts:
 * - **Equipment location** (literal): `home_gym | commercial_gym` — athlete's choice from the wizard.
 *   Preserved on AthleteState as `equipment_location`. Never overwritten by capability inference.
 * - **Equipment tier** (capability): `full_barbell | dumbbell_based | bodyweight_bands` — derived from
 *   chips + 1RM signals via {@link resolveStrengthEquipmentTier3}. Drives protocol prescription.
 *
 * The legacy 2-tier `equipment_type` (`home_gym | commercial_gym`) historically conflated these;
 * `resolveStrengthEquipmentTypeForPlan` is retained for backward compat with stored data, but new
 * code should read `equipment_location` (literal) and `equipment_tier` (capability) separately.
 *
 * ⛔ THE GEAR VOCABULARY MOVED TO `src/lib/strength-gear.ts` ON 2026-08-13 (slice 4) AND IS
 * RE-EXPORTED BELOW — every existing importer of this file is unchanged, and there is still exactly
 * one definition. It had to move because the BUILDER (client) now gates on the same maps the composer
 * (edge) does, and `src/` cannot value-import `supabase/functions/`. `src/lib/` is where anything the
 * two sides must agree on lives — the home `exercise-config.ts` established.
 *
 * ⚠️ DO NOT RE-ADD A LOCAL COPY OF ANY OF THESE. Slice 3 pinned a duplicated key union with a contract
 * test; slice 4 deleted the duplicate. A tripwire over a copy is not the same thing as one definition.
 */
export {
  ALWAYS,
  ASSISTANCE_GEAR,
  athleteEquipmentToKeys,
  canPerform,
  exerciseRequiredGearKeys,
  gearRoutesFor,
  normStrengthEquipmentStrings,
  STRENGTH_GEAR_LABEL,
} from '../../../src/lib/strength-gear.ts';
export type { GearKey, GearRoutes } from '../../../src/lib/strength-gear.ts';

import {
  athleteEquipmentToKeys as _athleteEquipmentToKeys,
  exerciseRequiredGearKeys as _exerciseRequiredGearKeys,
  normStrengthEquipmentStrings,
  STRENGTH_GEAR_LABEL,
} from '../../../src/lib/strength-gear.ts';

/**
 * True only when the athlete has a GHD machine, dedicated Nordic bench, or similar
 * fixed floor anchor (e.g. "ghd", "nordic bench", "glute ham raise").
 * ⚠️ A "GHD" chip now exists on the picker (2026-08-13, slice 4) — this used to say no UI option
 * produced it, and Nordics could therefore never fire.
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

/** Detect pull-up / chin-up bar access. Drives Pull-ups vs band-assisted pull-down (spec §8.2). */
export function hasPullUpBar(strengthEquipment: string[]): boolean {
  const n = normStrengthEquipmentStrings(strengthEquipment);
  return n.some(
    (s) =>
      s.includes('pull-up bar') ||
      s.includes('pull up bar') ||
      s.includes('pullup bar') ||
      s.includes('chin-up bar') ||
      s.includes('chin up bar') ||
      s.includes('commercial gym') ||
      // Doorframe and tower-style trainers also count.
      s.includes('power tower') ||
      (s.includes('rack') && (s.includes('pull') || s.includes('chin'))),
  );
}

/**
 * Detect bench access.
 *
 * ⚠️ THIS MATCHES ANY CHIP CONTAINING "bench", AND THAT NOW INCLUDES THE TWO ADDED 2026-08-13
 * ("Incline bench", "Decline bench"). Left deliberately wide: an athlete who owns an incline bench
 * can press on it, and the alternative — a decline-only owner being told they have no bench — strands
 * far more people than the reverse over-reach. The narrow questions have their own detectors below.
 */
export function hasBench(strengthEquipment: string[]): boolean {
  const n = normStrengthEquipmentStrings(strengthEquipment);
  return n.some((s) => s.includes('bench'));
}

/**
 * Detect an INCLINE-capable bench. Forever p.25 offers DB Incline Press as a push option, and
 * without the bench that movement is not harder — it is impossible.
 *
 * ⛔ "Bench (flat/adjustable)" DELIBERATELY DOES NOT COUNT, and this is the one judgement call in
 * the slice. That chip is an OR: it is worn by flat-only owners and adjustable owners alike, so
 * reading it as incline would hand an incline press to everyone with a flat bench. An adjustable-bench
 * owner ticks both chips, which is one extra tap; the other direction is a prescription nobody can
 * perform. ⚠️ Revisit if the flat chip is ever split — see the note on the picker list.
 */
export function hasInclineBench(strengthEquipment: string[]): boolean {
  const n = normStrengthEquipmentStrings(strengthEquipment);
  return n.some((s) => s.includes('incline bench') || s.includes('commercial gym'));
}

/**
 * Detect a DECLINE-capable bench. Same rule as incline.
 *
 * ⚠️ NOTHING CONSUMES THIS YET, and that is stated rather than hidden. No movement on the Forever
 * assistance catalog requires a decline bench; it is in the inventory so the athlete can DECLARE it
 * and so slice 3's `requires` tagging has a real key to point at. If nothing ever claims it, delete
 * the chip rather than leave it as scenery.
 */
export function hasDeclineBench(strengthEquipment: string[]): boolean {
  const n = normStrengthEquipmentStrings(strengthEquipment);
  return n.some((s) => s.includes('decline bench') || s.includes('commercial gym'));
}

/**
 * Detect an ab wheel. Forever p.30 lists the rollout on the abs menu.
 *
 * ⛔ "commercial gym" DOES NOT IMPLY ONE, unlike every other detector in this file. A rack, a bench
 * and a cable stack are what a commercial gym IS; an ab wheel is a ten-dollar accessory that many
 * gyms simply do not stock. Implying it would silently prescribe a rollout to an athlete standing in
 * a gym that has none, which is the exact failure the inventory exists to prevent.
 */
export function hasAbWheel(strengthEquipment: string[]): boolean {
  const n = normStrengthEquipmentStrings(strengthEquipment);
  return n.some((s) => s.includes('ab wheel') || s.includes('ab roller'));
}

/**
 * Detect box / step / plyo platform. Used by Box Jumps + Step-ups + Bulgarian Split Squat.
 * "Commercial gym" implies a box is on hand. Doorframe pull-up bars don't count.
 */
export function hasBox(strengthEquipment: string[]): boolean {
  const n = normStrengthEquipmentStrings(strengthEquipment);
  return n.some(
    (s) =>
      s.includes('box') ||
      s.includes('plyo box') ||
      s.includes('plyo step') ||
      s.includes('step') && !s.includes('stepper') ||
      s.includes('commercial gym'),
  );
}

/**
 * Three-tier equipment **capability** classification per spec §8. Distinct from
 * `equipment_location` (the athlete's literal home_gym | commercial_gym choice).
 * - `full_barbell`     — barbell + rack + bench for full progressive loading (regardless of where the athlete trains)
 * - `dumbbell_based`   — DBs + (usually) bench, no barbell
 * - `bodyweight_bands` — bands only, possibly pull-up bar
 *
 * Renamed 2025-12: previously the `full_barbell` tier was called `commercial_gym`,
 * which conflated capability with location. Existing data with the old value is
 * normalized via {@link normalizeEquipmentTier3}.
 */
export type StrengthEquipmentTier3 = 'full_barbell' | 'dumbbell_based' | 'bodyweight_bands';

/**
 * Map raw / legacy values to the canonical capability tier. Existing plans + AthleteState rows
 * may carry the old `commercial_gym` value — normalize on read.
 */
export function normalizeEquipmentTier3(raw: unknown): StrengthEquipmentTier3 {
  const s = String(raw ?? '').trim();
  if (s === 'full_barbell' || s === 'commercial_gym') return 'full_barbell';
  if (s === 'dumbbell_based') return 'dumbbell_based';
  if (s === 'bodyweight_bands') return 'bodyweight_bands';
  return 'dumbbell_based';
}

/**
 * Resolve to 3-tier capability classification. Strict precedence:
 *   barbell signals → full_barbell
 *   DBs detected    → dumbbell_based
 *   else            → bodyweight_bands
 *
 * `performanceNumbers` upgrades to full_barbell (an athlete with logged compound 1RMs almost
 * always has barbell access even if the chip list is stale).
 *
 * NOTE: The athlete's literal location choice (home_gym | commercial_gym) is preserved
 * separately as `equipment_location` — this resolver classifies CAPABILITY only.
 */
export function resolveStrengthEquipmentTier3(
  explicitEquipmentType: unknown,
  strengthEquipment: string[],
  performanceNumbers: unknown,
): StrengthEquipmentTier3 {
  if (hasBarbellCapability(strengthEquipment) || hasCompound1RMSignals(performanceNumbers)) {
    return 'full_barbell';
  }
  if (hasDumbbells(strengthEquipment)) {
    return 'dumbbell_based';
  }
  // Honor an explicit "commercial_gym" tag if the user typed it manually but their chip list
  // is otherwise sparse — even though location ≠ capability, the explicit tag is a strong hint
  // that gear is available. Same legacy behavior preserved.
  const ex = String(explicitEquipmentType ?? '').trim().toLowerCase();
  if (ex === 'commercial_gym') return 'full_barbell';
  return 'bodyweight_bands';
}

/**
 * Performance-without-loadable-resistance gate (spec §2). Returns the effective intent +
 * a downgrade message when an athlete asked for performance but lacks barbell AND DBs —
 * progressive loading isn't possible at the bodyweight_bands tier.
 */
// ── Strength equipment summary line (docs/STRENGTH-PROTOCOL.md §9.3) ───────-
//
// Mirror of the swim Pool-gear pattern. Generated from the session's exercise list
// (canonical name patterns → equipment labels) intersected with the athlete's
// inventory for the "Optional" half. Returns null when nothing required and no
// owned optional applies.

/** Optional gear the athlete might own that this session benefits from (without strict need). */
function exerciseSuggestedOptionalGearKeys(name: string): string[] {
  const n = String(name ?? '').toLowerCase();
  if (!n) return [];
  // Hip Thrusts: bench is required (above); KB or DB add load on BW/BB tiers.
  if (/hip\s+thrusts?\b/.test(n) && !/barbell|heavy|moderate/.test(n)) return ['kettlebell', 'dumbbells'];
  // Calf raises: optional DB load.
  if (/calf\s+raises?/.test(n)) return ['dumbbells'];
  // Goblet squat: KB also works (DBs already required above).
  if (/goblet\s+squat/.test(n)) return ['kettlebell'];
  return [];
}

export type StrengthSessionGearLineOpts = {
  /** Exercise names from the session (intent.exercises[].name). */
  exerciseNames: string[];
  /** Athlete inventory chips from baselines.equipment.strength. */
  athleteEquipment: string[];
};

/**
 * Athlete-facing equipment summary for a strength session. Mirror of the swim
 * `buildSwimGearLine` pattern.
 *
 * Format examples (spec §9.3):
 * - `Equipment — Required: Barbell, Rack, Bench. Optional: Kettlebell.`
 * - `Equipment — Required: Dumbbells, Bench.`
 * - `Equipment — Required: Bands.`
 *
 * Returns null when no required gear and no athlete-owned optional gear applies.
 */
export function buildStrengthEquipmentLine(opts: StrengthSessionGearLineOpts): string | null {
  const required = new Set<string>();
  const optionalPool = new Set<string>();
  for (const n of opts.exerciseNames ?? []) {
    for (const k of _exerciseRequiredGearKeys(n)) required.add(k);
    for (const k of exerciseSuggestedOptionalGearKeys(n)) optionalPool.add(k);
  }

  const owned = _athleteEquipmentToKeys(opts.athleteEquipment ?? []);
  const optional = new Set<string>();
  for (const k of optionalPool) {
    if (required.has(k)) continue;
    if (!owned.has(k)) continue;
    optional.add(k);
  }

  // Render in a stable order — keeps the output deterministic and easier to test/eyeball.
  // ⛔ A KEY MISSING FROM THIS ORDER IS SILENTLY DROPPED FROM THE LINE — the filter is the renderer.
  // The three added 2026-08-13 sit beside their nearest relative.
  const orderRequired = ['barbell', 'rack', 'bench', 'incline_bench', 'decline_bench', 'dumbbells',
    'kettlebell', 'cable', 'pull_up_bar', 'box', 'rings', 'ab_wheel', 'bands'];
  const orderOptional = orderRequired;
  const reqLabels = orderRequired.filter((k) => required.has(k)).map((k) => STRENGTH_GEAR_LABEL[k]);
  const optLabels = orderOptional.filter((k) => optional.has(k)).map((k) => STRENGTH_GEAR_LABEL[k]);

  if (reqLabels.length === 0 && optLabels.length === 0) return null;

  const parts: string[] = [];
  if (reqLabels.length > 0) parts.push(`Required: ${reqLabels.join(', ')}.`);
  if (optLabels.length > 0) parts.push(`Optional: ${optLabels.join(', ')}.`);
  return `Equipment — ${parts.join(' ')}`;
}

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

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

/** Detect bench access. */
export function hasBench(strengthEquipment: string[]): boolean {
  const n = normStrengthEquipmentStrings(strengthEquipment);
  return n.some((s) => s.includes('bench'));
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
// ── Strength equipment summary line (docs/STRENGTH-PROTOCOL.md §9.3) ───────-
//
// Mirror of the swim Pool-gear pattern. Generated from the session's exercise list
// (canonical name patterns → equipment labels) intersected with the athlete's
// inventory for the "Optional" half. Returns null when nothing required and no
// owned optional applies.

const STRENGTH_GEAR_LABEL: Record<string, string> = {
  barbell: 'Barbell',
  rack: 'Rack',
  bench: 'Bench',
  dumbbells: 'Dumbbells',
  kettlebell: 'Kettlebell',
  bands: 'Bands',
  cable: 'Cable',
  pull_up_bar: 'Pull-up Bar',
  box: 'Box',
  rings: 'Rings',
};

/**
 * Map a single strength exercise name → set of canonical equipment keys it requires.
 * Order doesn't matter; the formatter de-dupes and rendering uses {@link STRENGTH_GEAR_LABEL}.
 */
function exerciseRequiredGearKeys(name: string): string[] {
  const n = String(name ?? '').toLowerCase();
  if (!n) return [];
  // Barbell-anchored compounds — rack required for back squat / OHP / standing press.
  if (/barbell\s+back\s+squat|back\s+squat\s*\(barbell/.test(n)) return ['barbell', 'rack'];
  if (/standing\s+barbell\s+overhead\s+press|standing\s+ohp|barbell\s+ohp|push\s+press/.test(n)) {
    return ['barbell', 'rack'];
  }
  if (/conventional\s+deadlift|trap\s+bar\s+deadlift/.test(n)) return ['barbell'];
  if (/^bench\s+press$|^bench\s+press\s+\(barbell/.test(n)) return ['barbell', 'rack', 'bench'];
  if (/barbell\s+row/.test(n)) return ['barbell'];
  if (/hip\s+thrusts?\b/.test(n)) {
    // Performance protocol uses Heavy/Moderate barbell hip thrusts. DB tier uses backpack/BW.
    return /barbell|moderate|heavy|fast\s+concentric/.test(n) ? ['barbell', 'bench'] : ['bench'];
  }
  // Dumbbell-anchored compounds.
  if (/db\s+bench\s+press|dumbbell\s+bench/.test(n)) return ['dumbbells', 'bench'];
  if (/db\s+shoulder\s+press|db\s+ohp/.test(n)) return ['dumbbells'];
  if (/db\s+row|chest-supported\s+row/.test(n)) return ['dumbbells', 'bench'];
  if (/db\s+romanian\s+deadlift|dumbbell\s+rdl/.test(n)) return ['dumbbells'];
  if (/single-leg\s+rdl\s*\(heavy\s*db|single-leg\s+rdl\s*\(.*db/.test(n)) return ['dumbbells'];
  if (/goblet\s+squat/.test(n)) return ['dumbbells']; // KB also works — counted via optional pool
  // Cable / pulley.
  if (/lat\s*pull-?down/.test(n)) return ['cable'];
  // Pull-up patterns.
  if (/^pull-?ups?\b|^pull-?ups\s+\(explosive/.test(n)) return ['pull_up_bar'];
  if (/band-?assisted\s+pull-?up/.test(n)) return ['pull_up_bar', 'bands'];
  if (/inverted\s+(ring\s+)?rows?|ring\s+rows?/.test(n)) return ['rings'];
  // Plyo / power.
  if (/box\s+jumps?/.test(n)) return ['box'];
  // Kettlebell-specific.
  if (/^kb\s+swings?|^kettlebell\s+swings?/.test(n)) return ['kettlebell'];
  // Bands.
  if (/band\s+pull-?aparts?|band\s+pull-?down|band\s+lateral\s+walks|band\s+overhead\s+press|band\s+row/.test(n)) {
    return ['bands'];
  }
  if (/face\s+pulls?/.test(n)) {
    // Cable when available, band otherwise — depends on prescription text.
    return /cable/.test(n) ? ['cable'] : ['bands'];
  }
  if (/external\s+rotation/.test(n)) return ['bands'];
  // Step-ups / lunges land on a bench-class platform; box jumps already handled.
  if (/step-?ups?/.test(n)) return ['bench'];
  // Bodyweight-only patterns: push-ups, plank variants, bird dog, dead bug, glute bridges,
  // calf raises, BW squat, single-leg RDL (BW), broad jumps, jump squats, plyo.
  return [];
}

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

/** Athlete equipment chip → canonical key (for matching against session needs). */
function athleteEquipmentToKeys(strengthEquipment: string[]): Set<string> {
  const out = new Set<string>();
  const n = normStrengthEquipmentStrings(strengthEquipment);
  for (const s of n) {
    if (s.includes('barbell') || s.includes('plate')) out.add('barbell');
    if (s.includes('rack') || s.includes('cage')) out.add('rack');
    if (s.includes('bench')) out.add('bench');
    if (s.includes('dumbbell') || /\bdb\b/.test(s)) out.add('dumbbells');
    if (s.includes('kettlebell') || /\bkb\b/.test(s)) out.add('kettlebell');
    if (s.includes('band')) out.add('bands');
    if (s.includes('cable')) out.add('cable');
    if (s.includes('pull-up bar') || s.includes('pull up bar') || s.includes('chin-up')) out.add('pull_up_bar');
    if (s.includes('box') || s.includes('plyo box')) out.add('box');
    if (s.includes('ring')) out.add('rings');
    // Commercial gym implies most fixed equipment is on hand.
    if (s.includes('commercial gym')) {
      out.add('barbell');
      out.add('rack');
      out.add('bench');
      out.add('dumbbells');
      out.add('cable');
      out.add('pull_up_bar');
    }
  }
  return out;
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
    for (const k of exerciseRequiredGearKeys(n)) required.add(k);
    for (const k of exerciseSuggestedOptionalGearKeys(n)) optionalPool.add(k);
  }

  const owned = athleteEquipmentToKeys(opts.athleteEquipment ?? []);
  const optional = new Set<string>();
  for (const k of optionalPool) {
    if (required.has(k)) continue;
    if (!owned.has(k)) continue;
    optional.add(k);
  }

  // Render in a stable order — keeps the output deterministic and easier to test/eyeball.
  const orderRequired = ['barbell', 'rack', 'bench', 'dumbbells', 'kettlebell', 'cable', 'pull_up_bar', 'box', 'rings', 'bands'];
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

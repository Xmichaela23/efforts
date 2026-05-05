/**
 * Canonical swim drill tokens understood by materialize-plan (`swim_drills_*` / `swim_drill_*`)
 * and the client bake map. Used by plan DSL and combined/tri generators so drills are not
 * hard-coded in session-factory.
 */

/** DSL short names → full tokens (expandSession / plan_dsl). */
export const SWIM_DRILL_ALIAS: Record<string, string> = {
  catchup: 'swim_drills_4x50yd_catchup',
  singlearm: 'swim_drills_4x50yd_singlearm',
  fist: 'swim_drills_4x50yd_fist',
  scull: 'swim_drills_4x50yd_scull',
  scullfront: 'swim_drills_2x100yd_scullfront',
  fingertipdrag: 'swim_drills_4x50yd_fingertipdrag',
  '616': 'swim_drills_4x50yd_616',
  zipper: 'swim_drills_4x50yd_zipper',
  doggypaddle: 'swim_drills_4x50yd_doggypaddle',
  kick: 'swim_drills_4x50yd_kick',
};

/**
 * Full pool for generators (matches client bake + materialize plural drill regex).
 * Order is stable so week-based picks are deterministic.
 */
export const SWIM_DRILL_TOKEN_POOL: readonly string[] = [
  'swim_drills_4x50yd_catchup',
  'swim_drills_4x50yd_singlearm',
  'swim_drills_4x50yd_fist',
  'swim_drills_4x50yd_fingertipdrag',
  'swim_drills_4x50yd_616',
  'swim_drills_4x50yd_scull',
  'swim_drills_4x50yd_scullfront',
  'swim_drills_4x50yd_kick',
  'swim_drills_4x50yd_zipper',
  'swim_drills_4x50yd_doggypaddle',
  'swim_drills_4x50yd_snorkel_freeswim',
  'swim_drills_2x50yd_catchup',
  'swim_drills_2x50yd_singlearm',
  'swim_drills_2x50yd_fist',
  'swim_drills_2x50yd_fingertipdrag',
  'swim_drills_2x50yd_616',
  'swim_drills_2x100yd_scullfront',
  'swim_drills_2x100yd_snorkel_freeswim',
  'swim_drills_1x100yd_scullfront',
];

/** Yards implied by a `swim_drills_*` token (for subtracting from aerobic main). */
export function swimDrillYardsFromToken(token: string): number {
  const m = String(token).match(/swim_drills_(\d+)x(\d+)yd_/i);
  if (m) return parseInt(m[1], 10) * parseInt(m[2], 10);
  return 0;
}

export type SwimDrillPhase = 'base' | 'build' | 'peak' | 'taper';

/** Normalize combined-plan phases, tri `TriPhase.name`, and contract `peak` → drill phase buckets. */
export function resolveSwimDrillPhase(phaseName: string): SwimDrillPhase {
  const p = String(phaseName).toLowerCase().replace(/-/g, '_');
  if (p === 'base') return 'base';
  if (p === 'build') return 'build';
  if (p === 'race_specific' || p === 'peak') return 'peak';
  if (p === 'taper' || p === 'recovery') return 'taper';
  return 'build';
}

/** Phase-specific drill pools (existing `swim_drills_*` tokens only; no pull/paddles). */
const SWIM_DRILL_POOLS: Record<SwimDrillPhase, readonly string[]> = {
  // Base: technique-forward — snorkel isolates body position without breathing interruption.
  base: [
    'swim_drills_4x50yd_catchup',
    'swim_drills_4x50yd_fingertipdrag',
    'swim_drills_4x50yd_fist',
    'swim_drills_4x50yd_kick',
    'swim_drills_4x50yd_snorkel_freeswim',
    'swim_drills_2x50yd_catchup',
    'swim_drills_2x50yd_fingertipdrag',
  ],
  // Build: maintain technique under accumulating load; snorkel at longer interval for efficiency focus.
  build: [
    'swim_drills_4x50yd_catchup',
    'swim_drills_4x50yd_fist',
    'swim_drills_2x100yd_snorkel_freeswim',
    'swim_drills_2x50yd_fingertipdrag',
    'swim_drills_2x50yd_catchup',
  ],
  // Peak / race-specific: familiar patterns only — no new equipment demands.
  peak: ['swim_drills_2x50yd_catchup', 'swim_drills_2x50yd_fingertipdrag'],
  taper: ['swim_drills_2x50yd_catchup'],
};

// ── Equipment annotation ──────────────────────────────────────────────────────

export type DrillEquipment = {
  /** Must be present for the drill to work as prescribed. */
  required: string[];
  /** Worthwhile to bring — enhances drill quality but not blocking. */
  optional: string[];
};

const NO_EQUIPMENT: DrillEquipment = { required: [], optional: [] };

/**
 * Maps the trailing drill name (e.g. `kick`, `snorkel_freeswim`) to gear requirements.
 * Drills not listed here map to `NO_EQUIPMENT`.
 */
export const DRILL_EQUIPMENT_MAP: Record<string, DrillEquipment> = {
  kick:             { required: ['kickboard'], optional: [] },
  scull:            { required: ['pull buoy'], optional: [] },
  scullfront:       { required: ['pull buoy'], optional: [] },
  snorkel_freeswim: { required: ['snorkel'],   optional: [] },
  // Following drills are better with a snorkel but work fine without.
  catchup:          { required: [], optional: ['snorkel'] },
  fingertipdrag:    { required: [], optional: ['snorkel'] },
  singlearm:        { required: [], optional: ['snorkel'] },
  fist:             { required: [], optional: ['snorkel'] },
};

/**
 * Derives deduplicated required + optional equipment from a set of `swim_drills_*` tokens.
 * Safe to call with any token list — non-drill tokens are ignored.
 */
export function swimDrillEquipmentFromTokens(tokens: string[]): DrillEquipment {
  const required = new Set<string>();
  const optional = new Set<string>();
  for (const tok of tokens) {
    // Token format: swim_drills_NxDist(yd|m)_<drill_name>
    const m = String(tok).match(/^swim_drills_\d+x\d+(?:yd|m)_(.+)$/i);
    if (!m) continue;
    const eq = DRILL_EQUIPMENT_MAP[m[1].toLowerCase()] ?? NO_EQUIPMENT;
    for (const r of eq.required) required.add(r);
    for (const o of eq.optional) optional.add(o);
  }
  return { required: [...required], optional: [...optional] };
}

/**
 * Deterministic drill selection for plan weeks (no randomness in edge).
 * @param planWeek 1-based week index from buildWeek
 * @param slotSalt separates easy vs quality vs other swims the same week
 * @param phase when set, uses phase-specific pool; when omitted, legacy `SWIM_DRILL_TOKEN_POOL` + index formula (no regression)
 */
export function pickSwimDrillTokens(
  planWeek: number,
  slotSalt: number,
  count: number,
  phase?: string,
): string[] {
  const usePhase = phase != null && String(phase).length > 0;
  const pool: readonly string[] = usePhase
    ? SWIM_DRILL_POOLS[resolveSwimDrillPhase(phase!)]
    : SWIM_DRILL_TOKEN_POOL;
  if (count <= 0 || pool.length === 0) return [];
  const n = pool.length;
  const start = usePhase
    ? (planWeek * 3 + slotSalt) % n
    : ((planWeek - 1) * 13 + slotSalt * 7) % n;
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(pool[(start + i) % n]!);
  return out;
}

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
  'swim_drills_2x50yd_catchup',
  'swim_drills_2x50yd_singlearm',
  'swim_drills_2x50yd_fist',
  'swim_drills_2x50yd_fingertipdrag',
  'swim_drills_2x50yd_616',
  'swim_drills_2x100yd_scullfront',
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
  base: [
    'swim_drills_4x50yd_catchup',
    'swim_drills_4x50yd_fingertipdrag',
    'swim_drills_4x50yd_fist',
    'swim_drills_4x50yd_kick',
    'swim_drills_2x50yd_catchup',
    'swim_drills_2x50yd_fingertipdrag',
  ],
  build: [
    'swim_drills_4x50yd_catchup',
    'swim_drills_4x50yd_fist',
    'swim_drills_2x50yd_fingertipdrag',
    'swim_drills_2x50yd_catchup',
  ],
  peak: ['swim_drills_2x50yd_catchup', 'swim_drills_2x50yd_fingertipdrag'],
  taper: ['swim_drills_2x50yd_catchup'],
};

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

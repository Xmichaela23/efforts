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
 * Normalize Training Baselines swimming chips (`equipment.swimming`) to canonical gear keys
 * used in `DRILL_EQUIPMENT_MAP.required`.
 */
export function swimGearNormalized(labels: string[] | null | undefined): Set<string> {
  const s = new Set<string>();
  if (!labels?.length) return s;
  for (const raw of labels) {
    const x = String(raw).trim().toLowerCase();
    if (!x) continue;
    if (x.includes('kick')) s.add('kickboard');
    if (x.includes('pull')) s.add('pull buoy');
    if (x.includes('snorkel')) s.add('snorkel');
    if (x === 'fins' || /\bfins?\b/.test(x)) s.add('fins');
    if (x.includes('paddle')) s.add('paddles');
  }
  return s;
}

function drillSuffixFromToken(tok: string): string | null {
  const m = String(tok).match(/^swim_drills_\d+x\d+(?:yd|m)_(.+)$/i);
  return m ? m[1].toLowerCase() : null;
}

/** True if athlete gear satisfies every required item for this drill token. */
export function swimDrillTokenAllowedByGear(tok: string, gear: Set<string>): boolean {
  const suf = drillSuffixFromToken(tok);
  if (!suf) return true;
  const eq = DRILL_EQUIPMENT_MAP[suf] ?? NO_EQUIPMENT;
  return eq.required.every((r) => gear.has(r));
}

export function filterSwimDrillTokensByGear(tokens: readonly string[], gear: Set<string>): string[] {
  return tokens.filter((t) => swimDrillTokenAllowedByGear(t, gear));
}

function phaseDrillCandidates(phase: string | undefined, gear: Set<string>): string[] {
  const usePhase = phase != null && String(phase).length > 0;
  const rawPool: readonly string[] = usePhase
    ? SWIM_DRILL_POOLS[resolveSwimDrillPhase(phase!)]
    : SWIM_DRILL_TOKEN_POOL;
  let eligible = filterSwimDrillTokensByGear(rawPool, gear);
  if (!eligible.length) eligible = filterSwimDrillTokensByGear(SWIM_DRILL_TOKEN_POOL, gear);
  return eligible;
}

function rotatePool<T>(arr: readonly T[], start: number): T[] {
  if (!arr.length) return [];
  const n = arr.length;
  const s = ((start % n) + n) % n;
  return [...arr.slice(s), ...arr.slice(0, s)];
}

/** Main-set floor (yards) we preserve after inserting drills — keeps aerobic stimulus honest. */
export const SWIM_DRILL_MAIN_FLOOR_YD = 350;
/** When only short drill reps fit, allow a slightly smaller main remainder (time-efficient sessions). */
export const SWIM_DRILL_COMPACT_FLOOR_YD = 260;

export type SwimDrillSessionKind = 'easy' | 'css_aerobic' | 'threshold';

const SWIM_DRILL_KIND_SALT: Record<SwimDrillSessionKind, number> = {
  easy: 0,
  css_aerobic: 5,
  threshold: 11,
};

function pickFirstDrillFittingBudget(
  eligible: string[],
  planWeek: number,
  salt: number,
  mainBudgetYd: number,
): { tok: string; dy: number } | null {
  if (!eligible.length) return null;
  const n = eligible.length;
  const start = (planWeek * 3 + salt) % n;
  const rotated = rotatePool(eligible, start);
  const ranked = [...rotated].sort((a, b) => swimDrillYardsFromToken(a) - swimDrillYardsFromToken(b));

  for (const tok of ranked) {
    const dy = swimDrillYardsFromToken(tok);
    if (dy <= 0) continue;
    if (mainBudgetYd - dy >= SWIM_DRILL_MAIN_FLOOR_YD) return { tok, dy };
  }
  for (const tok of ranked) {
    const dy = swimDrillYardsFromToken(tok);
    if (dy <= 0 || dy > 150) continue;
    if (mainBudgetYd - dy >= SWIM_DRILL_COMPACT_FLOOR_YD) return { tok, dy };
  }
  return null;
}

/**
 * Shared drill inset for combined-plan `session-factory` and tri `tri-generator`.
 * Honors swim gear from baselines, prefers smallest drill reps when time/yards are tight,
 * and stacks up to three drills on technique-emphasis easy swims when budget allows.
 */
export function pickSwimDrillInset(opts: {
  totalYards: number;
  wuYd: number;
  cdYd: number;
  planWeek: number | undefined;
  drillSlotSalt: number;
  phase: string | undefined;
  sessionKind: SwimDrillSessionKind;
  techniqueDrillEmphasis?: boolean;
  swimGearLabels?: string[] | null;
}): { mainBudgetYd: number; drillTokens: string[] } {
  let mainBudgetYd = opts.totalYards - opts.wuYd - opts.cdYd;
  const planWeek = opts.planWeek;
  if (planWeek == null || mainBudgetYd < 50) {
    return { mainBudgetYd, drillTokens: [] };
  }

  const gear = swimGearNormalized(opts.swimGearLabels ?? undefined);
  const eligible = phaseDrillCandidates(opts.phase, gear);
  const salt = opts.drillSlotSalt + SWIM_DRILL_KIND_SALT[opts.sessionKind];

  if (opts.techniqueDrillEmphasis && opts.sessionKind === 'easy') {
    // Technique swims must keep drills even when weekly scaling pins totals near the easy floor (~800–900 yd):
    // legacy gate used MAIN_FLOOR+50 on total main budget, which stripped every drill from typical technique sessions.
    const techniqueMinMain = SWIM_DRILL_COMPACT_FLOOR_YD + 100;
    if (mainBudgetYd < techniqueMinMain) {
      return { mainBudgetYd, drillTokens: [] };
    }
    const n = eligible.length;
    const start = n ? (planWeek * 3 + salt) % n : 0;
    const rotated = n ? rotatePool(eligible, start) : [];
    const ranked = [...rotated].sort((a, b) => swimDrillYardsFromToken(a) - swimDrillYardsFromToken(b));
    const chosen: string[] = [];
    let budget = mainBudgetYd;
    const firstRemainderFloor =
      mainBudgetYd < 520 ? SWIM_DRILL_COMPACT_FLOOR_YD : SWIM_DRILL_MAIN_FLOOR_YD;
    for (const tok of ranked) {
      if (chosen.length >= 3) break;
      const dy = swimDrillYardsFromToken(tok);
      if (dy <= 0) continue;
      const nextFloor =
        chosen.length === 0 ? firstRemainderFloor : SWIM_DRILL_COMPACT_FLOOR_YD;
      if (budget - dy >= nextFloor) {
        chosen.push(tok);
        budget -= dy;
      }
    }
    if (chosen.length) return { mainBudgetYd: budget, drillTokens: chosen };
    return { mainBudgetYd, drillTokens: [] };
  }

  if (mainBudgetYd < SWIM_DRILL_MAIN_FLOOR_YD + 50) {
    return { mainBudgetYd, drillTokens: [] };
  }

  const picked = pickFirstDrillFittingBudget(eligible, planWeek, salt, mainBudgetYd);
  if (!picked) return { mainBudgetYd, drillTokens: [] };
  return { mainBudgetYd: mainBudgetYd - picked.dy, drillTokens: [picked.tok] };
}

// ── Coach-facing copy (philosophy + specific drill cues) ──────────────────────

const SWIM_DRILL_CUE: Record<string, string> = {
  catchup: 'front-quadrant timing',
  singlearm: 'rotation + balanced pull',
  fist: 'early vertical forearm',
  fingertipdrag: 'high-elbow recovery',
  '616': 'kick-driven side balance',
  scull: 'hand pitch / pressure',
  scullfront: 'front-quadrant pressure',
  kick: 'body line + small fast kick',
  zipper: 'compact recovery',
  doggypaddle: 'catch pathway',
  snorkel_freeswim: 'stroke rhythm without breathing turnover',
};

/** Opening sentence for session copy when drills are included (training philosophy). */
export function swimSessionPhilosophyLead(sessionKind: SwimDrillSessionKind): string {
  switch (sessionKind) {
    case 'easy':
      return 'Efficiency-first: sharpen one or two mechanics before aerobic volume so every yard transfers to the race.';
    case 'css_aerobic':
      return 'Race rhythm session: groove stroke quality early, then hold sustainable pacing.';
    case 'threshold':
      return 'Hard swim day: prime stroke integrity before high-output repeats.';
    default:
      return '';
  }
}

/** Compact drill roster for workout description (specific + purposeful). */
export function swimDrillBlockAthleteCopy(tokens: string[]): string {
  if (!tokens.length) return '';
  const parts: string[] = [];
  for (const tok of tokens) {
    const m = String(tok).match(/^swim_drills_(\d+)x(\d+)yd_(.+)$/i);
    if (!m) continue;
    const label = m[3].replace(/_/g, ' ');
    const cue = SWIM_DRILL_CUE[m[3].toLowerCase()] ?? '';
    parts.push(cue ? `${m[1]}×${m[2]} ${label} (${cue})` : `${m[1]}×${m[2]} ${label}`);
  }
  if (!parts.length) return '';
  return ` Prescribed drills: ${parts.join('; ')}.`;
}

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

/** Normalize token / baseline key / step.equipment to a single display chip label (dedupe by lowercase). */
export function swimGearLabelForDisplay(raw: string): string {
  const t = String(raw).trim().toLowerCase();
  if (!t || t === 'none') return '';
  if (t === 'buoy' || t === 'pull buoy' || (t.includes('pull') && t.includes('buoy'))) return 'Pull buoy';
  if (t === 'board' || t === 'kickboard' || t.includes('kickboard')) return 'Kickboard';
  if (t === 'fins' || /\bfins?\b/.test(t)) return 'Fins';
  if (t.includes('snorkel')) return 'Snorkel';
  if (t.includes('paddle')) return 'Paddles';
  if (t.includes('goggle')) return 'Goggles';
  return String(raw).trim();
}

/**
 * Pool gear for planned swim rows: drill-token requirements + materializer tag-derived hints
 * + explicit step.equipment. Does NOT mirror athlete baseline inventory (that's Training Baselines, not prescription).
 */
export function swimPlannedEquipmentFromWorkout(workout: {
  type?: string;
  steps_preset?: unknown[];
  computed?: {
    swim_equipment_suggested?: string[];
    swim_equipment_optional_suggested?: string[];
    steps?: Array<{ equipment?: string; kind?: string }>;
  };
}): DrillEquipment | null {
  const workoutType = String(workout?.type ?? '').toLowerCase();
  if (workoutType !== 'swim') return null;

  const requiredByKey = new Map<string, string>();
  const optionalByKey = new Map<string, string>();

  const addRequired = (raw: string) => {
    const label = swimGearLabelForDisplay(raw);
    if (!label) return;
    requiredByKey.set(label.toLowerCase(), label);
  };
  const addOptional = (raw: string) => {
    const label = swimGearLabelForDisplay(raw);
    if (!label) return;
    const k = label.toLowerCase();
    if (requiredByKey.has(k)) return;
    optionalByKey.set(k, label);
  };

  const toks: string[] = Array.isArray(workout?.steps_preset)
    ? workout.steps_preset.map((t: unknown) => String(t))
    : [];
  const drillToks = toks.filter((t) => t.startsWith('swim_drills_'));
  const drillEq = swimDrillEquipmentFromTokens(drillToks);
  for (const r of drillEq.required) addRequired(r);
  for (const o of drillEq.optional) addOptional(o);

  const suggested = workout?.computed?.swim_equipment_suggested;
  if (Array.isArray(suggested)) {
    for (const x of suggested) addRequired(String(x));
  }

  const suggestedOpt = workout?.computed?.swim_equipment_optional_suggested;
  if (Array.isArray(suggestedOpt)) {
    for (const x of suggestedOpt) addOptional(String(x));
  }

  const steps = workout?.computed?.steps;
  if (Array.isArray(steps)) {
    for (const st of steps) {
      const kind = String(st?.kind ?? '').toLowerCase();
      if (kind !== 'work' && kind !== 'drill') continue;
      const eq = st?.equipment;
      if (typeof eq === 'string' && eq.trim()) addRequired(eq);
    }
  }

  const required = [...requiredByKey.values()];
  const optional = [...optionalByKey.values()];
  if (!required.length && !optional.length) return null;
  return { required, optional };
}

/**
 * Deterministic drill selection for plan weeks (no randomness in edge).
 * @param planWeek 1-based week index from buildWeek
 * @param slotSalt separates easy vs quality vs other swims the same week
 * @param phase when set, uses phase-specific pool; when omitted, legacy `SWIM_DRILL_TOKEN_POOL` + index formula (no regression)
 * @param swimGearLabels optional baselines `equipment.swimming` labels — filters out drills that need gear the athlete lacks
 */
export function pickSwimDrillTokens(
  planWeek: number,
  slotSalt: number,
  count: number,
  phase?: string,
  swimGearLabels?: string[] | null,
): string[] {
  const gear = swimGearNormalized(swimGearLabels ?? undefined);
  const usePhase = phase != null && String(phase).length > 0;
  const rawPool: readonly string[] = usePhase
    ? SWIM_DRILL_POOLS[resolveSwimDrillPhase(phase!)]
    : SWIM_DRILL_TOKEN_POOL;
  let pool = filterSwimDrillTokensByGear(rawPool, gear);
  if (!pool.length) pool = filterSwimDrillTokensByGear([...SWIM_DRILL_TOKEN_POOL], gear);
  if (count <= 0 || pool.length === 0) return [];
  const n = pool.length;
  const start = usePhase
    ? (planWeek * 3 + slotSalt) % n
    : ((planWeek - 1) * 13 + slotSalt * 7) % n;
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(pool[(start + i) % n]!);
  return out;
}

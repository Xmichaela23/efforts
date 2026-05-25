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
  sighting: 'swim_drills_4x50yd_sighting',
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
  'swim_drills_4x50yd_sighting',
  'swim_drills_2x50yd_catchup',
  'swim_drills_2x50yd_singlearm',
  'swim_drills_2x50yd_fist',
  'swim_drills_2x50yd_fingertipdrag',
  'swim_drills_2x50yd_616',
  'swim_drills_2x50yd_sighting',
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
  // Base: technique-forward — SWIM-PROTOCOL §6.2 base primaries (Catch-Up, Fingertip Drag,
  // Single-Arm, 6-3-6) + retained fist/kick/snorkel_freeswim for pool depth; snorkel
  // isolates body position without breathing interruption.
  base: [
    'swim_drills_4x50yd_catchup',
    'swim_drills_4x50yd_fingertipdrag',
    'swim_drills_4x50yd_singlearm',
    'swim_drills_4x50yd_616',
    'swim_drills_4x50yd_fist',
    'swim_drills_4x50yd_kick',
    'swim_drills_4x50yd_snorkel_freeswim',
    'swim_drills_2x50yd_catchup',
    'swim_drills_2x50yd_fingertipdrag',
  ],
  // Build: SWIM-PROTOCOL §6.2 build primaries (Fist Swim, Sculling, Zipper) + retained
  // catchup/fingertipdrag for maintenance; snorkel at longer interval for efficiency focus.
  // scull/scullfront are pull-buoy-gated — filterSwimDrillTokensByGear drops them when
  // the athlete has no buoy.
  build: [
    'swim_drills_4x50yd_catchup',
    'swim_drills_4x50yd_fist',
    'swim_drills_4x50yd_scull',
    'swim_drills_4x50yd_scullfront',
    'swim_drills_4x50yd_zipper',
    'swim_drills_2x100yd_snorkel_freeswim',
    'swim_drills_2x50yd_fingertipdrag',
    'swim_drills_2x50yd_catchup',
  ],
  // Peak / race-specific: SWIM-PROTOCOL §6.2 — Sighting + Single-Arm race rotation
  // ("Race skills under fatigue"); familiar patterns retained.
  peak: [
    'swim_drills_2x50yd_catchup',
    'swim_drills_2x50yd_fingertipdrag',
    'swim_drills_2x50yd_sighting',
    'swim_drills_2x50yd_singlearm',
  ],
  // Taper: SWIM-PROTOCOL §6.2 — light reminders only (Catch-Up + Fingertip Drag).
  taper: [
    'swim_drills_2x50yd_catchup',
    'swim_drills_2x50yd_fingertipdrag',
  ],
};

// ── Equipment annotation ──────────────────────────────────────────────────────

export type DrillEquipment = {
  /** Must be present for the drill to work as prescribed. */
  required: string[];
  /** Worthwhile to bring — enhances drill quality but not blocking. */
  optional: string[];
  /**
   * SWIM-PROTOCOL §6.6 (LOCKED 2026-05-22) — research-backed body-position aid.
   * Soft-recommend layer between required and optional: "this helps, grab it"
   * vs optional's "fine either way". Surfaced as `recommended:<gear>` tags and
   * a distinct "Recommended:" section in the Pool gear line.
   * Empty / undefined when the drill has no §6.6 recommendation.
   */
  recommended?: string[];
};

const NO_EQUIPMENT: DrillEquipment = { required: [], optional: [] };

/**
 * Maps the trailing drill name (e.g. `kick`, `snorkel_freeswim`) to gear requirements.
 * Drills not listed here map to `NO_EQUIPMENT`.
 *
 * §6.6 (2026-05-22) updates: fingertip-drag + fist drill now carry a fins recommendation
 * (body-position aid lets the swimmer focus on the mechanic the drill targets without
 * fighting drift). 616 carries a tier-gated fins recommendation (beginner only) — see
 * `swimDrillEquipmentFromTokens` for the tier dispatch.
 */
export const DRILL_EQUIPMENT_MAP: Record<string, DrillEquipment> = {
  kick:             { required: ['kickboard'], optional: [] },
  scull:            { required: ['pull buoy'], optional: [] },
  scullfront:       { required: ['pull buoy'], optional: [] },
  snorkel_freeswim: { required: ['snorkel'],   optional: [] },
  // Following drills are better with a snorkel but work fine without.
  catchup:          { required: [], optional: ['snorkel'] },
  fingertipdrag:    { required: [], optional: ['snorkel'], recommended: ['fins'] },
  singlearm:        { required: [], optional: ['snorkel'] },
  // Fist: fins recommended (maintains swim speed while catch is compromised). NO paddles.
  // §6.6 deliberately drops the prior snorkel-optional — the table prescribes fins only.
  fist:             { required: [], optional: [],            recommended: ['fins'] },
  // Sighting / 6-3-6 / zipper / doggypaddle: no gear; head-up sighting is open-water race prep.
  sighting:         { required: [], optional: [] },
  // 616 has a beginner-only fins recommendation per §6.6 — see swimDrillEquipmentFromTokens
  // for the tier-gated dispatch (the static map doesn't carry tier context).
  '616':            { required: [], optional: [] },
  zipper:           { required: [], optional: [] },
  doggypaddle:      { required: [], optional: [] },
};

/**
 * Drill suffixes that carry a tier-gated §6.6 fins recommendation — beginner only.
 * 6-3-6 / kick-switch helps beginners hold body position; intermediate+ rotation
 * work doesn't need the aid.
 */
const SWIM_DRILL_RECOMMENDED_FINS_BEGINNER_ONLY: Set<string> = new Set(['616']);

// ── Stroke-phase annotation (SWIM-PROTOCOL §6.1 column 2) ─────────────────────

/**
 * Canonical stroke phases targeted by each drill, per `docs/SWIM-PROTOCOL.md §6.1`.
 * Consumed by Path A's §6.3 distinct-phase pairing rule (Slice 3b, 2026-05-19).
 */
export type SwimDrillStrokePhase =
  | 'timing'
  | 'recovery'
  | 'catch'
  | 'rotation'
  | 'body_position'
  | 'race_specific';

/**
 * Drill suffix → primary stroke phase per SWIM-PROTOCOL §6.1.
 * `snorkel_freeswim` and `doggypaddle` are not in the §6.1 table — assigned by
 * coaching role (snorkel removes breathing turnover → body position; doggypaddle
 * isolates the catch pathway per `SWIM_DRILL_CUE`).
 */
export const SWIM_DRILL_STROKE_PHASE: Record<string, SwimDrillStrokePhase> = {
  catchup: 'timing',
  fingertipdrag: 'recovery',
  fist: 'catch',
  singlearm: 'rotation',
  '616': 'rotation',
  zipper: 'recovery',
  scull: 'catch',
  scullfront: 'catch',
  sighting: 'race_specific',
  kick: 'body_position',
  snorkel_freeswim: 'body_position',
  doggypaddle: 'catch',
};

/**
 * Returns the §6.1 stroke phase for a `swim_drills_*` token, or null when the
 * suffix isn't mapped. Tolerant of trailing `_r\d+` rest and `_equip` markers.
 */
export function swimDrillStrokePhase(token: string): SwimDrillStrokePhase | null {
  const m = String(token).match(
    /^swim_drills_\d+x\d+(?:yd|m)_(.+?)(?:_r\d+)?(?:_(?:fins|board|buoy|snorkel))?$/i,
  );
  if (!m) return null;
  return SWIM_DRILL_STROKE_PHASE[m[1].toLowerCase()] ?? null;
}

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

export type SwimDrillSessionKind =
  | 'easy'
  | 'css_aerobic'
  | 'threshold'
  // SWIM-PROTOCOL §5.5 / §6.5 — pull_focused gets an explicit kind so the picker
  // can emit a drill block per spec (current pullFocusedSwim hardcodes no drills).
  // Beginner pull-focused uses the §6.5 one-focus path; intermediate/advanced use
  // Path B single drill.
  | 'pull_focused'
  // SWIM-PROTOCOL §5.11 / §6.5 — recovery for beginners is drill-led per the
  // beginner variant; non-beginners get no drill block (caller skips the picker).
  | 'recovery';

const SWIM_DRILL_KIND_SALT: Record<SwimDrillSessionKind, number> = {
  easy: 0,
  css_aerobic: 5,
  threshold: 11,
  pull_focused: 17,
  recovery: 23,
};

/**
 * SWIM-PROTOCOL §6.3 fitness-tier biasing (Slice 3d, 2026-05-19).
 *
 * - Beginner "can repeat foundation drills more often" — §6.2 base primaries
 *   (catchup / fingertipdrag / singlearm / 616) get a -1 sort offset so the
 *   picker prefers them when they fit budget.
 * - Competitive "focus on race-specific drills only" — sighting gets a -1
 *   sort offset (only fires in peak phase where sighting is in the pool).
 *
 * Intermediate tier is unbiased — preserves prior behavior exactly.
 */
const FOUNDATION_DRILL_SUFFIXES: Set<string> = new Set([
  'catchup', 'fingertipdrag', 'singlearm', '616',
]);
const RACE_SPECIFIC_DRILL_SUFFIXES: Set<string> = new Set(['sighting']);

function drillSuffixForBias(token: string): string | null {
  const m = String(token).match(
    /^swim_drills_\d+x\d+(?:yd|m)_(.+?)(?:_r\d+)?(?:_(?:fins|board|buoy|snorkel))?$/i,
  );
  return m ? m[1].toLowerCase() : null;
}

function tierBias(
  token: string,
  fitness: 'beginner' | 'intermediate' | 'advanced' | undefined,
): number {
  if (!fitness || fitness === 'intermediate') return 0;
  const suffix = drillSuffixForBias(token);
  if (!suffix) return 0;
  if (fitness === 'beginner' && FOUNDATION_DRILL_SUFFIXES.has(suffix)) return -1;
  if (fitness === 'advanced' && RACE_SPECIFIC_DRILL_SUFFIXES.has(suffix)) return -1;
  return 0;
}

/**
 * SWIM-PROTOCOL §6.5 beginner one-focus drill block.
 *
 * Fires for beginner × css_aerobic (§5.2 / D-025 substitution target) and
 * beginner × pull_focused (§5.5). Picks 2-3 drills sharing ONE §6.1 stroke
 * phase (catch, recovery, rotation, etc.) — inverse of Path A's distinct-
 * phase pairing. Foundation-biased via tierBias. Smallest-yards-first as
 * tiebreaker so 2-3 drills fit the 200-300yd target band.
 *
 * Permissive fallback: when same-phase pairing starves the count below 2
 * (e.g., only one foundation drill matches the first drill's phase given
 * the pool/gear constraints), the picker fills remaining slots without the
 * same-phase gate — the 2-3 count is the bigger training lever; the
 * one-focus rule is the polish.
 *
 * Returns `null` if no drill block fits the budget (caller falls back to
 * the standard Path B single-drill picker).
 */
function pickBeginnerOneFocusDrillBlock(opts: {
  eligible: string[];
  planWeek: number;
  salt: number;
  mainBudgetYd: number;
  targetMin: number;
  targetMax: number;
  countCap: number;
}): { drillTokens: string[]; consumedYd: number } | null {
  const { eligible, planWeek, salt, mainBudgetYd, targetMin, targetMax, countCap } = opts;
  if (!eligible.length) return null;
  const n = eligible.length;
  const start = (planWeek * 3 + salt) % n;
  const rotated = rotatePool(eligible, start);
  // Foundation bias as primary sort key (beginners), smallest-yards-first secondary.
  const ranked = [...rotated].sort((a, b) => {
    const ab = tierBias(a, 'beginner');
    const bb = tierBias(b, 'beginner');
    if (ab !== bb) return ab - bb;
    return swimDrillYardsFromToken(a) - swimDrillYardsFromToken(b);
  });

  // Pass 1: pick the seed drill (largest-yards foundation OR smallest-yards
  // foundation depending on budget headroom — start with smallest so the
  // remaining 1-2 drills have room).
  let firstPhase: SwimDrillStrokePhase | null = null;
  const chosen: string[] = [];
  let budget = mainBudgetYd;
  let consumed = 0;
  for (const tok of ranked) {
    const dy = swimDrillYardsFromToken(tok);
    if (dy <= 0) continue;
    if (budget - dy < SWIM_DRILL_COMPACT_FLOOR_YD) continue;
    chosen.push(tok);
    firstPhase = swimDrillStrokePhase(tok);
    budget -= dy;
    consumed += dy;
    break;
  }
  if (chosen.length === 0) return null;

  // Pass 2: pick additional drills with the SAME stroke phase as the seed.
  for (const tok of ranked) {
    if (chosen.length >= countCap) break;
    if (chosen.includes(tok)) continue;
    if (consumed >= targetMax) break;
    const phase = swimDrillStrokePhase(tok);
    if (firstPhase != null && phase !== firstPhase) continue;
    const dy = swimDrillYardsFromToken(tok);
    if (dy <= 0) continue;
    if (budget - dy < SWIM_DRILL_COMPACT_FLOOR_YD) continue;
    chosen.push(tok);
    budget -= dy;
    consumed += dy;
  }

  // Permissive fallback: if pool/gear filtering starved the same-phase pass,
  // fill remaining slots without the phase gate to keep the count near target.
  if (chosen.length < 2 && consumed < targetMin) {
    for (const tok of ranked) {
      if (chosen.length >= countCap) break;
      if (chosen.includes(tok)) continue;
      if (consumed >= targetMax) break;
      const dy = swimDrillYardsFromToken(tok);
      if (dy <= 0) continue;
      if (budget - dy < SWIM_DRILL_COMPACT_FLOOR_YD) continue;
      chosen.push(tok);
      budget -= dy;
      consumed += dy;
    }
  }

  return { drillTokens: chosen, consumedYd: consumed };
}

function pickFirstDrillFittingBudget(
  eligible: string[],
  planWeek: number,
  salt: number,
  mainBudgetYd: number,
  fitness?: 'beginner' | 'intermediate' | 'advanced',
): { tok: string; dy: number } | null {
  if (!eligible.length) return null;
  const n = eligible.length;
  const start = (planWeek * 3 + salt) % n;
  const rotated = rotatePool(eligible, start);
  // §6.3 fitness-tier bias as primary sort key; smallest-yards-first as secondary.
  const ranked = [...rotated].sort((a, b) => {
    const ab = tierBias(a, fitness);
    const bb = tierBias(b, fitness);
    if (ab !== bb) return ab - bb;
    return swimDrillYardsFromToken(a) - swimDrillYardsFromToken(b);
  });

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
 *
 * Per-session drill **count** is governed by `docs/SWIM-PROTOCOL.md §5` per-type
 * prescriptions — these are authoritative; §6.3's "rotates 2-3 drills" is the
 * global default (temporal rotation across sessions, NOT multiple drills within
 * one session). See §6.3 ratification note (Phase 3 Slice 3a, 2026-05-19).
 *
 *   §5.1 Technique Aerobic        → 2-3 drills (150-300yd) — Path A below
 *   §5.2 CSS Aerobic              → 1 drill ("short drill block 100-150yd")
 *   §5.3 Threshold                → 1 drill (100yd)
 *   §5.4 Race-Specific Aerobic    → 1 drill (sighting 100-200yd)
 *   §5.7 Mixed/Fartlek            → 1 drill (100yd)
 *   §5.10 Race-Pace Sustained     → 1 drill (100yd)
 *
 * Honors swim gear from baselines, prefers smallest drill reps when time/yards
 * are tight, and stacks up to three drills on technique-emphasis easy swims
 * when budget allows.
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
  /** SWIM-PROTOCOL §6.3 fitness-tier biasing — beginner→foundation drills, advanced→race-specific (Slice 3d). */
  athleteFitness?: 'beginner' | 'intermediate' | 'advanced';
  /**
   * D-043 item 6 / Q-015 — drill repeat-pick memory. When provided, the picker
   * excludes any drill (by name-suffix key) already in this set BEFORE
   * salt-rotation, so consecutive sessions don't pick the same drill.
   * In-memory per-build posture (per Q-015 locked decision). Read-only from
   * the picker's perspective — caller maintains the set and adds the returned
   * `drillTokens` to it after each call to seed the next week's filter.
   *
   * Falls back to the unfiltered eligible pool when filtering would leave it
   * empty — small phase pools (e.g. taper has 2 candidates) can't avoid
   * repetition forever. Matches the terrain/route fallback pattern.
   */
  prevWeekDrillTokens?: Set<string> | null;
}): { mainBudgetYd: number; drillTokens: string[] } {
  let mainBudgetYd = opts.totalYards - opts.wuYd - opts.cdYd;
  const planWeek = opts.planWeek;
  if (planWeek == null || mainBudgetYd < 50) {
    return { mainBudgetYd, drillTokens: [] };
  }

  const gear = swimGearNormalized(opts.swimGearLabels ?? undefined);
  // §6.1 / §6.6 (2026-05-22) — sculling is hard-banned from the beginner inset.
  // Beginners lack the catch fluency to feel the pressure changes the drill teaches;
  // surfacing sculling for them is wasted volume. Filter post phaseDrillCandidates so
  // gear-availability + phase-pool logic stays uniform across tiers.
  const baseEligible = ((): string[] => {
    const raw = phaseDrillCandidates(opts.phase, gear);
    if (opts.athleteFitness !== 'beginner') return raw;
    return raw.filter((tok) => {
      const m = String(tok).match(/^swim_drills_\d+x\d+(?:yd|m)_(.+?)(?:_r\d+)?(?:_(?:fins|board|buoy|snorkel))?$/i);
      const suf = m ? m[1].toLowerCase() : '';
      return suf !== 'scull' && suf !== 'scullfront';
    });
  })();
  // D-043 item 6 / Q-015 — apply repeat-pick memory filter. Compare on the
  // drill-name suffix (suffix is the stable identity; exact token strings
  // differ by rep/distance/gear suffix decorations across sessions).
  const drillKey = (tok: string): string => {
    const m = String(tok).match(/^swim_drills?_\d+x\d+(?:yd|m)_(.+?)(?:_r\d+)?(?:_(?:fins|board|buoy|snorkel))?$/i);
    return m ? m[1].toLowerCase() : String(tok).toLowerCase();
  };
  const eligible = ((): string[] => {
    const prev = opts.prevWeekDrillTokens;
    if (!prev || prev.size === 0) return baseEligible;
    const prevKeys = new Set<string>();
    prev.forEach((t) => prevKeys.add(drillKey(t)));
    const filtered = baseEligible.filter((tok) => !prevKeys.has(drillKey(tok)));
    // Fall back to unfiltered when the filter would empty the pool —
    // small phase pools (taper has 2 candidates per ENGINE-STATE swim §6.2)
    // can't avoid repetition forever.
    return filtered.length > 0 ? filtered : baseEligible;
  })();
  const salt = opts.drillSlotSalt + SWIM_DRILL_KIND_SALT[opts.sessionKind];

  if (opts.techniqueDrillEmphasis && opts.sessionKind === 'easy') {
    // Path A — SWIM-PROTOCOL §5.1 Technique Aerobic: 2-3 drills (150-300yd).
    // Technique swims must keep drills even when weekly scaling pins totals near the easy floor (~800–900 yd):
    // legacy gate used MAIN_FLOOR+50 on total main budget, which stripped every drill from typical technique sessions.
    const techniqueMinMain = SWIM_DRILL_COMPACT_FLOOR_YD + 100;
    if (mainBudgetYd < techniqueMinMain) {
      return { mainBudgetYd, drillTokens: [] };
    }
    // D-057 / Q-016 — drill yardage target by experience tier (LOCKED 2026-05-25).
    // SWIM-PROTOCOL §2's higher ratios (75/30/10) are aspirational; per the Q-016
    // audit (2026-05-25), session-count layer + band-volume layer already
    // differentiate drill exposure by experience. Adding aggressive within-session
    // ratio scaling on top risks double-counting. Locked at 30/20/10 — material
    // tier differentiation while keeping the main-set aerobic floor honest.
    //   beginner    → 30% of total session yards
    //   intermediate → 20%
    //   advanced    → 10%
    // Used as a SOFT CAP on cumulative drill yardage in Path A; existing
    // SWIM_DRILL_MAIN_FLOOR_YD remains the hard floor on the aerobic main set.
    const drillRatioByTier: Record<'beginner' | 'intermediate' | 'advanced', number> = {
      beginner: 0.30,
      intermediate: 0.20,
      advanced: 0.10,
    };
    const tier = opts.athleteFitness ?? 'intermediate';
    const targetDrillYd = Math.round(opts.totalYards * (drillRatioByTier[tier] ?? 0.20));
    const n = eligible.length;
    const start = n ? (planWeek * 3 + salt) % n : 0;
    const rotated = n ? rotatePool(eligible, start) : [];
    // §6.3 fitness-tier bias as primary sort key. Secondary sort: for beginners
    // (target 30%), prefer LARGER tokens so we hit target with fewer picks;
    // for advanced (target 10%), smallest-first to stay tight to the cap.
    const preferLarger = tier === 'beginner';
    const ranked = [...rotated].sort((a, b) => {
      const ab = tierBias(a, opts.athleteFitness);
      const bb = tierBias(b, opts.athleteFitness);
      if (ab !== bb) return ab - bb;
      const ay = swimDrillYardsFromToken(a);
      const by = swimDrillYardsFromToken(b);
      return preferLarger ? by - ay : ay - by;
    });
    const chosen: string[] = [];
    const usedPhases = new Set<SwimDrillStrokePhase>();
    let budget = mainBudgetYd;
    let drillYdSoFar = 0;
    const firstRemainderFloor =
      mainBudgetYd < 520 ? SWIM_DRILL_COMPACT_FLOOR_YD : SWIM_DRILL_MAIN_FLOOR_YD;
    // First pass: SWIM-PROTOCOL §6.3 strict-distinct stroke-phase rule.
    // D-057: also stops when cumulative drill yards meets/exceeds the
    // experience-tier target (soft cap — won't add a drill that would
    // overshoot target by more than half its size).
    for (const tok of ranked) {
      if (chosen.length >= 3) break;
      const dy = swimDrillYardsFromToken(tok);
      if (dy <= 0) continue;
      // D-057 soft cap: skip if adding this drill would overshoot the
      // target by more than dy/2 (lets us land close to target without
      // emitting zero drills when target is tiny vs token sizes).
      if (drillYdSoFar >= targetDrillYd && chosen.length >= 1) break;
      if (drillYdSoFar + dy > targetDrillYd + Math.floor(dy / 2) && chosen.length >= 1) continue;
      const phase = swimDrillStrokePhase(tok);
      if (phase && usedPhases.has(phase)) continue;
      const nextFloor =
        chosen.length === 0 ? firstRemainderFloor : SWIM_DRILL_COMPACT_FLOOR_YD;
      if (budget - dy >= nextFloor) {
        chosen.push(tok);
        if (phase) usedPhases.add(phase);
        budget -= dy;
        drillYdSoFar += dy;
      }
    }
    // Permissive 2nd pass: when pool diversity / gear filtering starves the
    // distinct-phase pass below the §5.1 2-3-drill count, fill remaining slots
    // without the phase gate. The 2-3 count is the bigger training lever; the
    // pairing rule is variety polish. Soft cap still applies.
    if (chosen.length < 2) {
      for (const tok of ranked) {
        if (chosen.length >= 3) break;
        if (chosen.includes(tok)) continue;
        const dy = swimDrillYardsFromToken(tok);
        if (dy <= 0) continue;
        if (drillYdSoFar >= targetDrillYd && chosen.length >= 1) break;
        if (drillYdSoFar + dy > targetDrillYd + Math.floor(dy / 2) && chosen.length >= 1) continue;
        const nextFloor =
          chosen.length === 0 ? firstRemainderFloor : SWIM_DRILL_COMPACT_FLOOR_YD;
        if (budget - dy >= nextFloor) {
          chosen.push(tok);
          budget -= dy;
          drillYdSoFar += dy;
        }
      }
    }
    if (chosen.length) return { mainBudgetYd: budget, drillTokens: chosen };
    return { mainBudgetYd, drillTokens: [] };
  }

  if (mainBudgetYd < SWIM_DRILL_MAIN_FLOOR_YD + 50) {
    return { mainBudgetYd, drillTokens: [] };
  }

  // SWIM-PROTOCOL §6.5 beginner one-focus path. Fires for:
  //   - beginner × css_aerobic (§5.2 / D-025 substitution target): 2-3 drills,
  //     200-300yd, ONE stroke phase per session.
  //   - beginner × pull_focused (§5.5 beginner variant): 2 drills, ~200yd,
  //     ONE stroke phase (foundation only — no sculling, no fist swim).
  // Anti-regression: intermediate/advanced fall through to Path B unchanged.
  if (
    opts.athleteFitness === 'beginner' &&
    (opts.sessionKind === 'css_aerobic' || opts.sessionKind === 'pull_focused')
  ) {
    const oneFocus = pickBeginnerOneFocusDrillBlock({
      eligible,
      planWeek,
      salt,
      mainBudgetYd,
      targetMin: opts.sessionKind === 'pull_focused' ? 150 : 200,
      targetMax: opts.sessionKind === 'pull_focused' ? 250 : 300,
      countCap: opts.sessionKind === 'pull_focused' ? 2 : 3,
    });
    if (oneFocus && oneFocus.drillTokens.length > 0) {
      return {
        mainBudgetYd: mainBudgetYd - oneFocus.consumedYd,
        drillTokens: oneFocus.drillTokens,
      };
    }
    // Graceful fallback to Path B single-drill if the one-focus block can't be
    // assembled (e.g. pool diversity / gear constraints starved the eligible set).
  }

  // Path B — SWIM-PROTOCOL §5.2 / §5.3 / §5.4 / §5.7 / §5.10: single drill per session.
  // Also serves: §5.5 Pull-Focused (intermediate/advanced — 1 drill 100yd per spec);
  // §5.11 Recovery (beginner only — single foundation drill; non-beginners skip the
  // picker entirely upstream).
  // §6.3's "rotates 2-3 drills" is temporal rotation across sessions; per-session count is 1 here.
  // Fitness-tier bias applies here too (Slice 3d): the ONE drill the athlete sees in
  // a threshold/CSS session reflects their experience tier.
  const picked = pickFirstDrillFittingBudget(eligible, planWeek, salt, mainBudgetYd, opts.athleteFitness);
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
  sighting: 'head-up race-day navigation',
};

/**
 * Display name (athlete-facing) keyed by the drill suffix used in tokens like
 * `swim_drills_4x50yd_<suffix>`. Suffixes are no-underscore for backward compatibility with the
 * existing materializer regex and persisted plan rows; the display map handles formatting.
 */
const SWIM_DRILL_DISPLAY_NAME: Record<string, string> = {
  catchup: 'Catch-Up',
  singlearm: 'Single-Arm Freestyle',
  fist: 'Fist Swim',
  fingertipdrag: 'Fingertip Drag',
  '616': '6-3-6 Rotation',
  scull: 'Sculling',
  scullfront: 'Front Sculling',
  kick: 'Kick',
  zipper: 'Zipper Drill',
  doggypaddle: 'Doggy Paddle',
  snorkel_freeswim: 'Snorkel Freestyle',
  sighting: 'Sighting Drill',
};

/**
 * Athlete-facing label for a drill suffix or `drill_type` field. Falls back to a Title-Cased
 * underscore-replaced version of the input when the suffix isn't in {@link SWIM_DRILL_DISPLAY_NAME}.
 */
export function swimDrillDisplayName(rawSuffix: string): string {
  const key = String(rawSuffix ?? '').trim().toLowerCase();
  if (!key) return '';
  if (SWIM_DRILL_DISPLAY_NAME[key]) return SWIM_DRILL_DISPLAY_NAME[key];
  return key
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Drill display name from a full `swim_drills_*` token. Returns '' when the token doesn't match. */
export function swimDrillDisplayNameFromToken(token: string): string {
  const m = String(token ?? '').match(/^swim_drills_\d+x\d+(?:yd|m)_(.+?)(?:_r\d+)?(?:_(?:fins|board|buoy|snorkel))?$/i);
  if (!m) return '';
  return swimDrillDisplayName(m[1]);
}

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
    // Pull the suffix off the trailing `_r<rest>` / `_fins|board|buoy|snorkel` decorations so the
    // display lookup matches the canonical drill key (e.g. `fingertipdrag`, not `fingertipdrag_r15`).
    const suffix = m[3].toLowerCase().replace(/_r\d+$/, '').replace(/_(?:fins|board|buoy|snorkel)$/, '');
    const label = swimDrillDisplayName(suffix);
    const cue = SWIM_DRILL_CUE[suffix] ?? '';
    parts.push(cue ? `${m[1]}×${m[2]} ${label} (${cue})` : `${m[1]}×${m[2]} ${label}`);
  }
  if (!parts.length) return '';
  return ` Prescribed drills: ${parts.join('; ')}.`;
}

/**
 * Derives deduplicated required + optional + recommended equipment from a set of
 * `swim_drills_*` tokens. Safe to call with any token list — non-drill tokens are ignored.
 *
 * §6.6 recommendations (LOCKED 2026-05-22) layer on top of the existing required +
 * optional channels. `athleteFitness` is consulted ONLY for tier-gated recommendations
 * (currently 616 → fins for beginners only); other §6.6 recommendations are tier-
 * agnostic. Pass undefined for back-compat.
 */
export function swimDrillEquipmentFromTokens(
  tokens: string[],
  athleteFitness?: 'beginner' | 'intermediate' | 'advanced',
): DrillEquipment {
  const required = new Set<string>();
  const optional = new Set<string>();
  const recommended = new Set<string>();
  for (const tok of tokens) {
    // Token format: swim_drills_NxDist(yd|m)_<drill_name>(_r<rest>)?(_<gear>)?
    // Strip trailing `_r\d+` rest marker and `_(fins|board|buoy|snorkel)` equipment
    // marker so the lookup keys on the canonical drill name (matches the same
    // pattern used by `swimDrillStrokePhase` and the bias helpers).
    const m = String(tok).match(/^swim_drills_\d+x\d+(?:yd|m)_(.+?)(?:_r\d+)?(?:_(?:fins|board|buoy|snorkel))?$/i);
    if (!m) continue;
    const suffix = m[1].toLowerCase();
    const eq = DRILL_EQUIPMENT_MAP[suffix] ?? NO_EQUIPMENT;
    for (const r of eq.required) required.add(r);
    for (const o of eq.optional) optional.add(o);
    for (const r of eq.recommended ?? []) recommended.add(r);
    // §6.6 tier-gated recommendations: 6-3-6 → fins for beginners only.
    if (athleteFitness === 'beginner' && SWIM_DRILL_RECOMMENDED_FINS_BEGINNER_ONLY.has(suffix)) {
      recommended.add('fins');
    }
  }
  return {
    required: [...required],
    optional: [...optional],
    ...(recommended.size ? { recommended: [...recommended] } : {}),
  };
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

// ── Per-session gear summary line ────────────────────────────────────────────

export type SwimSessionGearLineOpts = {
  /** Session-type-specific required gear (e.g. `['pull buoy']` for pull_focused). Empty if none. */
  sessionRequired?: string[];
  /** Drill tokens for this session. Drill required + optional + recommended gear pulled from the equipment map. */
  drillTokens?: string[];
  /** Athlete's swim equipment chips from baselines.equipment.swimming (raw labels). Optional gear
   *  is filtered to what the athlete actually owns — no point naming a snorkel they don't have. */
  athleteGearLabels?: string[] | null;
  /**
   * SWIM-PROTOCOL §8.4 — session-type-specific OPTIONAL gear (e.g. `['snorkel']` on CSS Aerobic
   * when athlete owns snorkel; `['buoy', 'paddles']` on intermediate CSS Aerobic). Pre-filtered
   * to athlete inventory by the caller (session-factory's `swimSessionOptionalGear` helper).
   * Mirror channel of `sessionRequired` — caller controls the per-session-type / per-tier rules.
   */
  sessionOptional?: string[];
  /**
   * SWIM-PROTOCOL §8.4 + §6.6 (LOCKED 2026-05-22) — session-type-specific RECOMMENDED gear.
   * Distinct from optional: "this helps, grab it" vs optional's "fine either way". Caller pre-
   * filters to athlete inventory (session-factory's `swimSessionRecommendedGear` helper).
   * Rendered as a separate "Recommended:" section in the Pool gear line.
   */
  sessionRecommended?: string[];
  /**
   * Athlete fitness tier — threads through to `swimDrillEquipmentFromTokens` for §6.6
   * tier-gated recommendations (e.g. 6-3-6 → fins for beginners only).
   */
  athleteFitness?: 'beginner' | 'intermediate' | 'advanced';
};

/**
 * Athlete-facing pool gear summary line for a swim session description.
 *
 * Format examples:
 * - `Pool gear — Required: Pull buoy. Optional: Paddles, Snorkel.`
 * - `Pool gear — Optional: Snorkel.`
 * - (returns null when nothing required and athlete owns no useful optional)
 *
 * Required is unconditional (the session needs it regardless of whether the athlete has it — that's
 * a separate check via {@link checkSwimEquipmentRequirements} or session substitution upstream).
 * Optional is filtered to what the athlete owns so the line doesn't suggest gear they lack.
 */
export function buildSwimGearLine(opts: SwimSessionGearLineOpts): string | null {
  const required = new Set<string>();
  for (const r of opts.sessionRequired ?? []) {
    const lbl = swimGearLabelForDisplay(r);
    if (lbl) required.add(lbl);
  }

  // §6.6 (2026-05-22) — drill-level required + optional + recommended derived from tokens.
  // athleteFitness threads through for tier-gated §6.6 rules (e.g. 616 → fins beginner only).
  const drillEq = swimDrillEquipmentFromTokens(opts.drillTokens ?? [], opts.athleteFitness);
  for (const r of drillEq.required) {
    const lbl = swimGearLabelForDisplay(r);
    if (lbl) required.add(lbl);
  }

  const athleteGearKeys = swimGearNormalized(opts.athleteGearLabels ?? null);

  // §6.6 recommended section — populated FIRST so it takes priority over optional dedupe.
  // Drill-level recommendations from DRILL_EQUIPMENT_MAP are filtered to athlete inventory
  // (no point naming fins they don't own).
  const recommended = new Set<string>();
  for (const r of drillEq.recommended ?? []) {
    const k = String(r).toLowerCase();
    if (!athleteGearKeys.has(k)) continue;
    const lbl = swimGearLabelForDisplay(r);
    if (!lbl) continue;
    if (required.has(lbl)) continue;
    recommended.add(lbl);
  }
  // SWIM-PROTOCOL §8.4 — session-level recommended (e.g. fins on beginner Technique
  // Aerobic / CSS Aerobic). Caller pre-filters to athlete inventory + tier rules.
  for (const r of opts.sessionRecommended ?? []) {
    const lbl = swimGearLabelForDisplay(r);
    if (!lbl) continue;
    if (required.has(lbl)) continue;
    recommended.add(lbl);
  }

  const optional = new Set<string>();
  for (const o of drillEq.optional) {
    const k = String(o).toLowerCase();
    if (!athleteGearKeys.has(k)) continue; // only mention optional gear the athlete actually owns
    const lbl = swimGearLabelForDisplay(o);
    if (!lbl) continue;
    if (required.has(lbl)) continue; // de-dupe against required
    if (recommended.has(lbl)) continue; // de-dupe against recommended (§6.6 priority)
    optional.add(lbl);
  }

  // SWIM-PROTOCOL §8.4 — session-type-specific optionals (e.g. snorkel on Technique
  // Aerobic / CSS Aerobic / Pull-Focused; buoy on intermediate+ CSS Aerobic; paddles
  // on intermediate+ Threshold). Caller pre-filters to athlete inventory and applies
  // per-tier rules; we just merge + dedupe against required + recommended.
  for (const o of opts.sessionOptional ?? []) {
    const lbl = swimGearLabelForDisplay(o);
    if (!lbl) continue;
    if (required.has(lbl)) continue;
    if (recommended.has(lbl)) continue;
    optional.add(lbl);
  }

  const reqArr = [...required];
  const recArr = [...recommended];
  const optArr = [...optional];
  if (reqArr.length === 0 && recArr.length === 0 && optArr.length === 0) return null;

  const parts: string[] = [];
  if (reqArr.length > 0) parts.push(`Required: ${reqArr.join(', ')}.`);
  if (recArr.length > 0) parts.push(`Recommended: ${recArr.join(', ')}.`);
  if (optArr.length > 0) parts.push(`Optional: ${optArr.join(', ')}.`);
  return `Pool gear — ${parts.join(' ')}`;
}

// ── Equipment-aware session-type substitution ────────────────────────────────

/**
 * Swim session types that can be substituted when the athlete lacks required gear. Mirror of the
 * `template.session_type` discriminator in `session-factory.ts#swimSessionFromTemplate` /
 * `tri-generator.ts`. Anything not listed here is unaffected (no gear dependency).
 */
export type SwimSessionTypeForGear =
  | 'easy'
  | 'css_aerobic'
  | 'threshold'
  | 'race_specific_aerobic'
  | 'speed'
  | 'kick_focused'
  | 'pull_focused'
  | 'endurance'
  | 'technique_aerobic';

export type SwimGearSubstitutionResult = {
  /** Effective session type to dispatch — equal to `requested` when no substitution fired. */
  resolvedType: SwimSessionTypeForGear;
  /** True when the requested type was substituted because of missing gear. */
  substituted: boolean;
  /** Gear keys (canonical: `pull buoy`, `kickboard`, `fins`, `snorkel`) that were missing. */
  missingRequired: string[];
  /** The session type that was originally requested. */
  requestedType: SwimSessionTypeForGear;
};

/**
 * Decides whether to substitute a swim session type when the athlete's gear can't support it.
 *
 * - `pull_focused` requires `pull buoy` (per `pullFocusRequiredGear`).
 * - `kick_focused` requires `kickboard` (sprint/oly) OR `fins` (70.3/full) per `kickFocusRequiredGear`.
 *   The caller passes the resolved required list to keep this module independent of the v21 module.
 *
 * When required gear is missing, the function returns the substitute type (`endurance` — closest
 * functional match: same duration profile, no special gear). All other session types pass through.
 */
export function resolveSwimSessionTypeForGear(opts: {
  requestedType: SwimSessionTypeForGear;
  athleteGearLabels?: string[] | null;
  /** Required gear keys for kick_focused — passed by the caller because they vary by race distance. */
  kickFocusedRequiredGear?: string[];
}): SwimGearSubstitutionResult {
  const gear = swimGearNormalized(opts.athleteGearLabels ?? null);
  const requested = opts.requestedType;

  let required: string[] = [];
  if (requested === 'pull_focused') required = ['pull buoy'];
  else if (requested === 'kick_focused') required = opts.kickFocusedRequiredGear ?? ['kickboard'];

  if (required.length === 0) {
    return { resolvedType: requested, substituted: false, missingRequired: [], requestedType: requested };
  }

  const missing = required.filter((r) => !gear.has(r.toLowerCase()));
  if (missing.length === 0) {
    return { resolvedType: requested, substituted: false, missingRequired: [], requestedType: requested };
  }

  return {
    resolvedType: 'endurance',
    substituted: true,
    missingRequired: missing,
    requestedType: requested,
  };
}

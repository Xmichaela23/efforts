/**
 * THE ASSISTANCE CATALOG — Wendler 5/3/1 **Forever**, per-day picker model.
 *
 * ⛔ THIS SUPERSEDES THE BLOCK-WIDE 3-PICK MODEL AND ITS RE-ROLING (D-385 / D-404 / D-405).
 *
 * The old model asked for THREE picks for the whole block and then re-roled them across the week: a
 * push pick became core on a squat day, the single-leg pick became triceps on a press day, and the
 * app printed an apology explaining why the athlete's choice was not what they saw. Every one of
 * those rules was sourced and defensible, and the whole arrangement existed to answer a question the
 * athlete is better placed to answer themselves.
 *
 * The new model is Forever p.24: **four lift days, each carrying push · pull · single-leg/core, one
 * movement per category, chosen by the athlete.** No re-roling, no substitution notes, nothing to
 * apologise for — the frame is locked and the movement inside it is theirs.
 *
 * ── WHAT DOES NOT CHANGE ──────────────────────────────────────────────────────────────────────────
 *
 * **No load, ever (D-406).** A row is a MOVEMENT and a REP TOTAL, "by feel". The rep total is still
 * scaled to tested capacity by `assistanceTotalReps` — floor 50, ceiling 75, anchor cycles hold the
 * floor. The mock showed a flat 50; the scaling is kept, because dropping a sourced behaviour to
 * match a mock is how engines quietly lose their reasoning.
 *
 * ── THE STORED NAME AND THE DISPLAYED NAME ARE ALLOWED TO DIFFER ─────────────────────────────────
 *
 * `name` is what is STORED and what every downstream stage resolves (D-322 — an unresolved name
 * silently borrows another movement's prescription). `display` is **Wendler's own word**, which for
 * three movements is not the config's canonical spelling: Back Extension is his "Back Raise",
 * Dumbbell Curl his "Curls", Ab Wheel Rollout his "Ab Wheel". A display alias, never a second token.
 */

import { canPerform, equipmentFitRank } from './strength-gear.ts';

/** Wendler's three categories. One movement each, every lifting day. Forever p.24. */
export type AssistanceCategory = 'push' | 'pull' | 'single_leg_core';

export const ASSISTANCE_CATEGORIES: AssistanceCategory[] = ['push', 'pull', 'single_leg_core'];

export const CATEGORY_LABEL: Record<AssistanceCategory, string> = {
  push: 'Push',
  pull: 'Pull',
  single_leg_core: 'Single-leg / core',
};

/**
 * The four lift days. ⛔ THESE KEYS ARE STORAGE — they are persisted on
 * `goals.training_prefs.assistance_picks` and renaming one strands every goal that carries it.
 */
export type LiftDay = 'press' | 'bench' | 'squat' | 'deadlift';
export const LIFT_DAYS: LiftDay[] = ['press', 'bench', 'squat', 'deadlift'];
export const LIFT_DAY_LABEL: Record<LiftDay, string> = {
  press: 'Press',
  bench: 'Bench',
  squat: 'Squat',
  deadlift: 'Deadlift',
};

/**
 * Main-lift name → day key. ⛔ THE NAMES ARE `MAIN_LIFTS` IN `strength-primary-plan.ts` VERBATIM
 * ("Overhead Press", "Bench Press", "Back Squat", "Deadlift"). If that table is renamed this map
 * must move with it, or the composer silently falls back to the balanced default for every day.
 */
export function liftDayForMainLift(mainLiftName: string | null | undefined): LiftDay | null {
  const n = String(mainLiftName ?? '').trim().toLowerCase();
  if (!n) return null;
  if (n.includes('overhead press') || n === 'press' || n === 'ohp') return 'press';
  if (n.includes('bench')) return 'bench';
  if (n.includes('squat')) return 'squat';
  if (n.includes('deadlift')) return 'deadlift';
  return null;
}

/**
 * Body-part emphasis. Multi-select, capped at {@link FOCUS_CAP}.
 *
 * ⛔ A FOCUS RE-POINTS MOVEMENT CHOICE INSIDE A CATEGORY — IT IS NOT A NEW AXIS. Push serves
 * chest / shoulders / triceps; pull serves back / biceps; single-leg-core serves glutes / abs. There
 * is no Legs or Quads chip: this athlete runs, and the doc's call is that leg volume is not something
 * to encourage. Glutes covers hamstrings (Forever p.29 groups them).
 */
export type FocusChip = 'arms' | 'chest' | 'shoulders' | 'back' | 'glutes' | 'abs';
export const FOCUS_CHIPS: FocusChip[] = ['arms', 'chest', 'shoulders', 'back', 'glutes', 'abs'];
export const FOCUS_LABEL: Record<FocusChip, string> = {
  arms: 'Arms',
  chest: 'Chest',
  shoulders: 'Shoulders',
  back: 'Back',
  glutes: 'Glutes',
  abs: 'Abs',
};
/** ⛔ THREE. Past that every day is a focus day and the emphasis means nothing. */
export const FOCUS_CAP = 3;

export type CatalogEntry = {
  /** ⛔ STORED, and it resolves `exact` or `folded` in `exercise-config.ts`. Verified by test. */
  name: string;
  /** What the athlete reads. Wendler's word where it differs from the config's spelling. */
  display: string;
  category: AssistanceCategory;
  /**
   * ⛔ WENDLER'S OWN MUSCLE WORD where he itemizes one. Three movements he names without assigning a
   * muscle take his movement-FAMILY word instead of invented anatomy: Push-Up → chest (it is in his
   * press list), Face Pull → upper back (his row list), Reverse Lunge → legs (his single-leg list).
   */
  muscle: string;
  /** Page in Forever unless noted. Every movement here is his. */
  source: string;
  /** Which focus chips this movement serves. Empty = it is never a focus answer, only a default. */
  focus: FocusChip[];
  /** On the add-abs menu (Forever p.30 / 2nd ed p.43). */
  isAbs?: boolean;
};

/**
 * ⛔ 25 MOVEMENTS, ALL WENDLER. No Plank — it is not his. Sit-Up and Side Bend ARE his (2nd ed).
 * Nothing may be added here that is not in the book.
 */
export const ASSISTANCE_CATALOG: CatalogEntry[] = [
  // ── PUSH ────────────────────────────────────────────────────────────────────────────────────────
  { name: 'Dips', display: 'Dips', category: 'push', muscle: 'triceps / chest', source: 'p.24', focus: ['arms', 'chest'] },
  { name: 'Push-Up', display: 'Push-Up', category: 'push', muscle: 'chest', source: 'p.25', focus: ['chest'] },
  { name: 'DB Bench Press', display: 'DB Bench Press', category: 'push', muscle: 'chest', source: 'p.25', focus: ['chest'] },
  { name: 'DB Incline Press', display: 'DB Incline Press', category: 'push', muscle: 'chest', source: 'p.25', focus: ['chest'] },
  { name: 'DB Shoulder Press', display: 'DB Shoulder Press', category: 'push', muscle: 'shoulders', source: 'p.25', focus: ['shoulders'] },
  { name: 'Plate Raise', display: 'Plate Raise', category: 'push', muscle: 'shoulders', source: 'p.26', focus: ['shoulders'] },
  { name: 'Triceps Pushdown', display: 'Triceps Pushdown', category: 'push', muscle: 'triceps', source: 'p.26', focus: ['arms'] },
  { name: 'Triceps Extension', display: 'Triceps Extension', category: 'push', muscle: 'triceps', source: 'p.26', focus: ['arms'] },

  // ── PULL ────────────────────────────────────────────────────────────────────────────────────────
  { name: 'Chin-Up', display: 'Chin-Up', category: 'pull', muscle: 'lats / biceps', source: 'p.26', focus: ['back', 'arms'] },
  { name: 'Dumbbell Row', display: 'Dumbbell Row', category: 'pull', muscle: 'upper back', source: 'p.27', focus: ['back'] },
  { name: 'Barbell Row', display: 'Barbell Row', category: 'pull', muscle: 'upper back', source: 'p.27', focus: ['back'] },
  { name: 'Lat Pulldown', display: 'Lat Pulldown', category: 'pull', muscle: 'lats', source: 'p.27', focus: ['back'] },
  { name: 'Inverted Row', display: 'Inverted Row', category: 'pull', muscle: 'back', source: 'p.26', focus: ['back'] },
  { name: 'Face Pull', display: 'Face Pull', category: 'pull', muscle: 'upper back', source: 'p.28', focus: ['back'] },
  // Stored canonical, displayed as Wendler writes it.
  { name: 'Dumbbell Curl', display: 'Curls', category: 'pull', muscle: 'biceps', source: 'p.27', focus: ['arms'] },

  // ── SINGLE-LEG / CORE ───────────────────────────────────────────────────────────────────────────
  { name: 'Reverse Lunge', display: 'Reverse Lunge', category: 'single_leg_core', muscle: 'legs', source: 'p.30', focus: [] },
  { name: 'Bulgarian Split Squat', display: 'Bulgarian Split Squat', category: 'single_leg_core', muscle: 'legs', source: 'p.30', focus: [] },
  { name: 'Front Squat', display: 'Front Squat', category: 'single_leg_core', muscle: 'legs', source: 'p.30', focus: [] },
  { name: 'Glute-Ham Raise', display: 'Glute-Ham Raise', category: 'single_leg_core', muscle: 'glutes', source: 'p.29', focus: ['glutes'] },
  { name: 'Back Extension', display: 'Back Raise', category: 'single_leg_core', muscle: 'lower back / glutes', source: 'p.29', focus: ['glutes'] },
  { name: 'Reverse Hyper', display: 'Reverse Hyper', category: 'single_leg_core', muscle: 'glutes', source: 'p.29', focus: ['glutes'] },
  { name: 'Hanging Leg Raise', display: 'Hanging Leg Raise', category: 'single_leg_core', muscle: 'abs', source: 'p.30', focus: ['abs'], isAbs: true },
  { name: 'Ab Wheel Rollout', display: 'Ab Wheel', category: 'single_leg_core', muscle: 'abs', source: 'p.30', focus: ['abs'], isAbs: true },
  { name: 'Weighted Sit-Up', display: 'Weighted Sit-Up', category: 'single_leg_core', muscle: 'abs', source: '2nd ed p.43', focus: ['abs'], isAbs: true },
  { name: 'DB Side Bend', display: 'DB Side Bend', category: 'single_leg_core', muscle: 'abs / obliques', source: '2nd ed p.51', focus: ['abs'], isAbs: true },
];

const BY_NAME = new Map(ASSISTANCE_CATALOG.map((e) => [e.name.toLowerCase(), e]));

export function catalogEntry(name: string | null | undefined): CatalogEntry | null {
  return BY_NAME.get(String(name ?? '').trim().toLowerCase()) ?? null;
}

/** What the athlete reads for a stored name. Falls back to the stored name for anything off-catalog
 *  (an equipment substitution's output, a legacy pick) rather than rendering blank. */
export function displayName(name: string | null | undefined): string {
  return catalogEntry(name)?.display ?? String(name ?? '');
}

export function catalogFor(category: AssistanceCategory): CatalogEntry[] {
  return ASSISTANCE_CATALOG.filter((e) => e.category === category);
}

/** The abs add-on menu — four movements, all Wendler's. */
export function absCatalog(): CatalogEntry[] {
  return ASSISTANCE_CATALOG.filter((e) => e.isAbs);
}

/**
 * The options this athlete can actually perform, in catalog order.
 *
 * ⛔ SLICE 4's GATE, APPLIED AT THE POINT OF OFFER. An empty inventory means "we do not know" and
 * everything is offered — see `canPerform`. ⚠️ NEVER RETURNS EMPTY: if the athlete's kit rules out
 * an entire category, the full list is returned rather than a blank picker, because a picker with no
 * options is a dead end and the substitution backstop can still rewrite what they choose.
 */
/**
 * ⚠️ THE DROPDOWN STAYS IN CATALOG ORDER, DELIBERATELY. Ranking is applied where the APP picks for
 * the athlete (focus pools, the default fallback) — not to the menu they scroll themselves. A list
 * that reshuffles as equipment changes is harder to learn than one that is always in the same order,
 * and here the athlete is choosing on purpose rather than being handed a default.
 */
export function optionsFor(
  category: AssistanceCategory,
  athleteEquipment?: string[] | null,
): CatalogEntry[] {
  const all = catalogFor(category);
  const usable = all.filter((e) => canPerform(e.name, athleteEquipment));
  return usable.length > 0 ? usable : all;
}

export function absOptions(athleteEquipment?: string[] | null): CatalogEntry[] {
  const all = absCatalog();
  const usable = all.filter((e) => canPerform(e.name, athleteEquipment));
  return usable.length > 0 ? usable : all;
}

// ── THE BALANCED DEFAULT ──────────────────────────────────────────────────────────────────────────

/**
 * ⛔ WENDLER'S OWN PAIRINGS, NOT A ROTATION SOMEONE INVENTED.
 *
 *   Press    → Dips + Chin-Ups            Triumvirate p.48, verbatim
 *   Bench    → DB Bench + DB Row          Triumvirate p.48, verbatim
 *   Squat    → low back                   Periodization Bible p.51 ("Squat day → low back, quads, abs")
 *   Deadlift → hamstrings                 Periodization Bible p.51 ("Deadlift day → hamstrings, quads, abs")
 *
 * ⛔ THE DEFAULT IS ALL-COMPOUND, AND ARMS ARE ALREADY IN IT. Confirmed 2026-08-13. There is no
 * Curls and no Triceps Pushdown anywhere in this table, and that is not an omission: **Dips are
 * triceps and a Chin-Up is biceps** (the catalog's own muscle words, which are Wendler's), so the
 * default week trains both arms with compounds. It is also what the book itself defaults to —
 * Triumvirate p.48 pairs the press day with Dips and Chin-Ups and prescribes no isolation.
 *
 * ⚠️ THE ISOLATION MOVEMENTS ARE STILL REACHABLE, VIA THE **ARMS FOCUS** — that is what a focus chip
 * is for. Do not "fix" this by adding Curls or a Pushdown to the default; opt-in isolation is the
 * design, and putting it in the default spends rep budget the compounds already cover.
 *
 * ⚠️ ABS LAND ON PRESS DAY, ONCE. The three categories are fixed, so the abs movement occupies the
 * single-leg/core slot on the day where leg work is least useful — the press day, which carries no
 * lower-body main lift. An athlete who wants more taps "+ abs" on any day; that is an ADD-ON sharing
 * the slot's rep budget, never a fourth category.
 */
export const BALANCED_WEEK: Record<LiftDay, Record<AssistanceCategory, string>> = {
  press: { push: 'Dips', pull: 'Chin-Up', single_leg_core: 'Hanging Leg Raise' },
  bench: { push: 'DB Bench Press', pull: 'Dumbbell Row', single_leg_core: 'Reverse Lunge' },
  // ⛔ INVERTED ROW, NOT LAT PULLDOWN (Slice 7). The default block must be performable BY A NORMAL
  // HOME GYM with nothing swapped — that is Slice 7's guardrail — and a lat pulldown needs a cable
  // stack or a band, which barbell/rack/bench/pull-up-bar does not include. It is still on the pull
  // menu for anyone who has the stack; it is no longer what the app hands someone by default.
  squat: { push: 'Push-Up', pull: 'Inverted Row', single_leg_core: 'Back Extension' },
  deadlift: { push: 'DB Shoulder Press', pull: 'Barbell Row', single_leg_core: 'Glute-Ham Raise' },
};

/**
 * The movements a focus chip re-points a category to, in preference order.
 *
 * ⛔ DERIVED FROM THE CATALOG'S OWN `focus` TAGS — not a second table. A chip that matched nothing
 * would silently do nothing, so `focusPool` returning empty is the tell that a tag is missing.
 */
export function focusPool(
  chip: FocusChip,
  category: AssistanceCategory,
  /**
   * ⛔ WHEN THE ATHLETE'S KIT IS KNOWN, THE MOVEMENT THAT BEST MATCHES IT LEADS. Absent → catalog
   * order, unchanged.
   *
   * ⚠️ THE ROUGH EDGE THIS FIXES, and it is worth stating because the old behaviour was not a bug in
   * the gate: a bands+dumbbells home gym asking for an **Arms** focus led with **Triceps Pushdown**.
   * That IS performable — the pushdown's backup route is a band — but it reads as a cable movement,
   * while **Triceps Extension** is a dumbbell movement the athlete owns outright. Both passed
   * `canPerform`; only one of them is what the athlete would actually reach for. Same shape on a
   * bands-only **Back** focus, which led with Lat Pulldown over Inverted Row.
   */
  athleteEquipment?: string[] | null,
): CatalogEntry[] {
  const pool = catalogFor(category).filter((e) => e.focus.includes(chip));
  return athleteEquipment ? rankByEquipmentFit(pool, athleteEquipment) : pool;
}

/**
 * Stable sort by {@link equipmentFitRank} — natural-equipment movements first, catalog order kept
 * within a tie. ⛔ NOTHING IS DROPPED: this reorders a pool, it does not filter one. Un-performable
 * movements sort last rather than vanishing, so a caller that has not filtered still sees them.
 */
export function rankByEquipmentFit(
  entries: CatalogEntry[],
  athleteEquipment?: string[] | null,
): CatalogEntry[] {
  if (!athleteEquipment) return entries;
  const rank = (e: CatalogEntry) => equipmentFitRank(e.name, athleteEquipment) ?? Number.MAX_SAFE_INTEGER;
  // Array.prototype.sort is stable, so equal ranks keep the catalog's own order — which is Wendler's
  // page order, and the tie-break we want.
  return [...entries].sort((a, b) => rank(a) - rank(b));
}

/** Which category a focus chip speaks to. Arms is the one chip that reaches two. */
const CATEGORY_FOR_FOCUS: Record<FocusChip, AssistanceCategory[]> = {
  arms: ['push', 'pull'],
  chest: ['push'],
  shoulders: ['push'],
  back: ['pull'],
  glutes: ['single_leg_core'],
  abs: ['single_leg_core'],
};

// ── STORAGE ───────────────────────────────────────────────────────────────────────────────────────

export type DayPicks = {
  push: string;
  pull: string;
  single_leg_core: string;
  /** The optional add-abs movement for this day. Null / absent = the default three. */
  abs?: string | null;
};

/**
 * ⛔ THE PERSISTED SHAPE, on `goals.training_prefs.assistance_picks`.
 *
 * `version: 2` is what tells a reader this is not the old flat `{push, pull, single_leg_core}`. The
 * old shape is still out there on every existing goal, and {@link normalizeAssistancePrefs} migrates
 * it rather than stranding it (D-322 class — these keys are persisted).
 */
export type AssistanceWeekPrefs = {
  version: 2;
  by_day: Record<LiftDay, DayPicks>;
  focus: FocusChip[];
  /**
   * ⛔ A PERFORMANCE GOAL, AND IT IS A DIFFERENT AXIS FROM `focus` — do not fold the two together.
   * A focus chip biases WHICH movement fills a category. This PINS the pull category to chins across
   * the week, pushes the volume to Wendler's prescription, and tracks a number that climbs. One is a
   * preference, the other is a programme. See `src/lib/pullup-progression.ts`.
   *
   * ⚠️ Absent/null is the norm — this is opt-in, and the balanced week is unaffected by it.
   */
  performance_focus?: PerformanceFocus | null;
};

/** The tracked performance goals. One today; the type exists so a second cannot be bolted on as a
 *  boolean and quietly become a second vocabulary. */
export type PerformanceFocus = 'pullups';

/**
 * ⛔ LEGACY PICKS THE OLD MENU OFFERED THAT THE CATALOG DOES NOT. Mapped to their nearest catalog
 * movement so an existing goal keeps something recognisably its own choice instead of silently
 * reverting to the default.
 *
 * ⚠️ `Single Leg Hip Thrust` HAS NO CATALOG EQUIVALENT and is deliberately absent: it is not in
 * Forever's assistance chapter, and mapping it to a lunge would be inventing a preference. It falls
 * back to the balanced default, which is the honest answer.
 */
const LEGACY_PICK_ALIAS: Record<string, string> = {
  'pull up': 'Chin-Up',
  'pull-up': 'Chin-Up',
  'chin up': 'Chin-Up',
  'push up': 'Push-Up',
  'dumbbell bench press': 'DB Bench Press',
  'incline bench press': 'DB Incline Press',
  'dumbbell shoulder press': 'DB Shoulder Press',
  'ab wheel rollout': 'Ab Wheel Rollout',
  'sit up': 'Weighted Sit-Up',
};

/** A stored name → the catalog entry it means, honouring the legacy aliases. Null when nothing fits. */
function resolvePick(raw: unknown, category: AssistanceCategory): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const direct = catalogEntry(s);
  if (direct && direct.category === category) return direct.name;
  const aliased = LEGACY_PICK_ALIAS[s.toLowerCase()];
  if (aliased) {
    const e = catalogEntry(aliased);
    if (e && e.category === category) return e.name;
  }
  return null;
}

function isFocusChip(v: unknown): v is FocusChip {
  return typeof v === 'string' && (FOCUS_CHIPS as string[]).includes(v);
}

/**
 * ⛔ READ ANY STORED SHAPE, RETURN THE CURRENT ONE. Never throws, never returns a partial week.
 *
 * Three inputs it must survive, because all three exist in the wild:
 *   · **absent / null** — the athlete skipped the card. → the balanced default.
 *   · **v1, the flat 3-pick shape** `{push, pull, single_leg_core}` — every goal created before
 *     2026-08-13. → the same three picks applied to all four days, which is exactly what the old
 *     model MEANT before its re-roling machinery moved them around. A pick with no catalog
 *     equivalent falls back to that day's balanced default rather than stranding the goal.
 *   · **v2** — validated per day; anything unrecognised falls back per slot, not per week, so one
 *     bad key cannot wipe an athlete's other eleven choices.
 */
export function normalizeAssistancePrefs(raw: unknown): AssistanceWeekPrefs {
  const focusOf = (v: unknown): FocusChip[] =>
    (Array.isArray(v) ? v.filter(isFocusChip) : []).slice(0, FOCUS_CAP);

  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  const byDayRaw = obj && obj.by_day && typeof obj.by_day === 'object'
    ? (obj.by_day as Record<string, unknown>)
    : null;

  // v1: the flat shape. Its three picks become every day's three picks.
  const legacy = !byDayRaw && obj
    ? {
        push: obj.push,
        pull: obj.pull,
        single_leg_core: obj.single_leg_core,
      }
    : null;

  const by_day = {} as Record<LiftDay, DayPicks>;
  for (const day of LIFT_DAYS) {
    const src = byDayRaw && byDayRaw[day] && typeof byDayRaw[day] === 'object'
      ? (byDayRaw[day] as Record<string, unknown>)
      : null;
    const pickFor = (category: AssistanceCategory): string =>
      resolvePick(src ? src[category] : legacy?.[category], category)
        ?? BALANCED_WEEK[day][category];
    const absRaw = src ? src.abs : null;
    const absEntry = absRaw ? catalogEntry(String(absRaw)) : null;
    by_day[day] = {
      push: pickFor('push'),
      pull: pickFor('pull'),
      single_leg_core: pickFor('single_leg_core'),
      abs: absEntry?.isAbs ? absEntry.name : null,
    };
  }

  // ⚠️ ONLY A RECOGNISED GOAL SURVIVES THE READ. An unknown string is dropped rather than stored, so
  // a stale or hand-edited value cannot pin the pull category to a movement that does not exist.
  const pf = obj?.performance_focus;
  const performance_focus: PerformanceFocus | null = pf === 'pullups' ? 'pullups' : null;

  return { version: 2, by_day, focus: focusOf(obj?.focus), performance_focus };
}

/**
 * Build a week from the focus chips — the "set it once" answer the picker opens on.
 *
 * ⛔ A FOCUS REPLACES ONLY THE CATEGORY IT SPEAKS TO, and it rotates through that category's pool
 * across the four days rather than putting the same movement on all of them. 200 reps a week of one
 * movement is the complaint D-328 was written to solve and it is not being reintroduced through the
 * focus door.
 *
 * ⚠️ EQUIPMENT IS HONOURED HERE TOO. A default the athlete cannot perform is worse than a default
 * they did not choose, so each slot falls to the first performable option in its own pool.
 */
export function buildDefaultWeek(
  focus: FocusChip[] = [],
  athleteEquipment?: string[] | null,
): Record<LiftDay, DayPicks> {
  const chips = focus.filter(isFocusChip).slice(0, FOCUS_CAP);
  const out = {} as Record<LiftDay, DayPicks>;

  // Per category, the ordered pool the focus chips imply. No chip for a category → keep the balanced
  // movement for that day.
  const pools: Partial<Record<AssistanceCategory, CatalogEntry[]>> = {};
  for (const chip of chips) {
    for (const category of CATEGORY_FOR_FOCUS[chip]) {
      const pool = focusPool(chip, category, athleteEquipment).filter((e) => canPerform(e.name, athleteEquipment));
      if (pool.length === 0) continue;
      pools[category] = [...(pools[category] ?? []), ...pool.filter((e) => !(pools[category] ?? []).some((p) => p.name === e.name))];
    }
  }

  LIFT_DAYS.forEach((day, dayIndex) => {
    const picks = {} as DayPicks;
    for (const category of ASSISTANCE_CATEGORIES) {
      const pool = pools[category];
      if (pool && pool.length > 0) {
        picks[category] = pool[dayIndex % pool.length].name;
      } else {
        const fallback = BALANCED_WEEK[day][category];
        // ⚠️ THE REPLACEMENT IS RANKED TOO. When the balanced default is un-performable the app is
        // PICKING for the athlete, so it should reach for the natural-equipment fit rather than
        // whatever sits first in the catalog.
        picks[category] = canPerform(fallback, athleteEquipment)
          ? fallback
          : (rankByEquipmentFit(optionsFor(category, athleteEquipment), athleteEquipment)[0]?.name ?? fallback);
      }
    }
    picks.abs = null;
    out[day] = picks;
  });

  return out;
}

// ── RESOLUTION ────────────────────────────────────────────────────────────────────────────────────

export type ResolvedAssistanceRow = {
  category: AssistanceCategory;
  /** Stored/canonical name — what goes on the row and what downstream resolves. */
  name: string;
  /** Wendler's word — what the athlete reads. */
  display: string;
  totalReps: number;
  /** True for the add-abs row: it SHARES the single-leg/core budget, it does not add one. */
  isAbsAddOn?: boolean;
};

/**
 * ⛔ THE ADD-ABS SPLIT. Forever p.32 allows "one or two exercises per category", so a second
 * single-leg/core movement is his — but it must SHARE the slot's rep total, never stack a fresh one.
 * A fourth 50 would be pure added fatigue charged against the endurance budget, which is the one
 * thing this whole model is arranged to protect.
 *
 * Rounded to fives so the numbers read like a lifter's: 50 → 25/25, 75 → 40/35.
 */
export function splitRepsForAbs(total: number): [number, number] {
  const half = Math.round(total / 2 / 5) * 5;
  const first = Math.max(5, Math.min(total - 5, half));
  return [first, total - first];
}

/**
 * The rows for one lifting day.
 *
 * ⛔ NO RE-ROLING, NO SUBSTITUTION NOTE, NOTHING TO APOLOGISE FOR. The athlete's pick for this day
 * IS the row. The only thing that can change a name after this point is
 * `substituteExerciseForEquipment`, which is the backstop for kit the picker's gate did not catch.
 *
 * @param totalReps the slot budget from `assistanceTotalReps` — capacity-scaled, anchor-aware.
 */
export function resolveDayAssistance(
  prefs: AssistanceWeekPrefs,
  day: LiftDay,
  totalReps: number,
  /**
   * ⛔ THE PULL-UP PROGRESSION OVERRIDES THE PULL PICK, AND THAT IS THE ONE PLACE D-423's "the
   * athlete's pick is what appears" bends. It is not the old re-roling coming back: the athlete opted
   * INTO a programme whose whole content is "chins, on every lifting day, at this volume". Honouring
   * a Barbell Row pick inside a pull-up progression would be honouring the letter of a preference
   * against the thing they actually asked for. It is opt-in, reversible by turning the goal off, and
   * the copy names it.
   */
  pullup?: { movement: string; totalReps: number } | null,
): ResolvedAssistanceRow[] {
  const picks: DayPicks = prefs.by_day[day] ?? { ...BALANCED_WEEK[day], abs: null };
  const row = (category: AssistanceCategory, name: string, reps: number): ResolvedAssistanceRow => ({
    category,
    name,
    display: displayName(name),
    totalReps: reps,
  });

  const legName = picks.single_leg_core || BALANCED_WEEK[day].single_leg_core;
  const absName = picks.abs || null;
  const [legReps, absReps] = absName ? splitRepsForAbs(totalReps) : [totalReps, 0];

  const rows = [
    row('push', picks.push || BALANCED_WEEK[day].push, totalReps),
    pullup
      ? row('pull', pullup.movement, pullup.totalReps)
      : row('pull', picks.pull || BALANCED_WEEK[day].pull, totalReps),
    row('single_leg_core', legName, legReps),
  ];
  if (absName) {
    rows.push({ ...row('single_leg_core', absName, absReps), isAbsAddOn: true });
  }
  return rows;
}

/**
 * Peers for the in-session swap sheet: the rest of the movement's own category, gated by kit.
 *
 * ⛔ THE PLAN'S OWN FRAMEWORK, NOT THE EXERCISE LIBRARY'S. Michael, 2026-07-30: *"we need to work
 * with the framework of the plan."* A generic pattern-matched swap offers movements this block never
 * considered, at a rep total the slot was never scaled for.
 *
 * @returns null when the movement is not part of the assistance framework at all — the caller keeps
 *   its own pattern logic. **Null means "not mine", never "none available".**
 */
export function assistancePeersFor(
  exerciseName: string,
  athleteEquipment?: string[] | null,
): string[] | null {
  const entry = catalogEntry(exerciseName);
  if (!entry) return null;
  const gated = optionsFor(entry.category, athleteEquipment).filter((e) => e.name !== entry.name);
  // ⛔ THE NEVER-EMPTY GUARANTEE HAS TO BE RE-CHECKED AFTER REMOVING SELF, AND THIS IS THE BUG THE
  // "never hands back an empty sheet" test caught. `optionsFor` guarantees a non-empty list — but an
  // athlete with no kit at all leaves exactly ONE performable push (Push-Up), so the gate returned
  // `['Push-Up']`, removing self emptied it, and the athlete who tapped Swap got a blank sheet.
  // Falling back to the ungated category is the same instinct as `optionsFor`'s own: the substitution
  // backstop can still rewrite whatever they choose, and a dead end cannot.
  const peers = gated.length > 0
    ? gated
    : catalogFor(entry.category).filter((e) => e.name !== entry.name);
  return peers.map((e) => e.name);
}

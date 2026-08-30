/**
 * THE ASSISTANCE CATALOG — the previous program **Forever**, per-day picker model.
 *
 * ⛔ THIS SUPERSEDES THE BLOCK-WIDE 3-PICK MODEL AND ITS RE-ROLING (D-385 / D-404 / D-405).
 *
 * The old model asked for THREE picks for the whole block and then re-roled them across the week: a
 * push pick became core on a squat day, the single-leg pick became triceps on a press day, and the
 * app printed an apology explaining why the athlete's choice was not what they saw. Every one of
 * those rules was sourced and defensible, and the whole arrangement existed to answer a question the
 * athlete is better placed to answer themselves.
 *
 * The new model is the previous program: **each lift day carries push · pull · single-leg/core, one movement
 * per category, chosen by the athlete.** No re-roling, no substitution notes, nothing to apologise
 * for — the frame is locked and the movement inside it is theirs.
 *
 * ⚠️ THERE ARE THREE DAYS, NOT FOUR (slice 5, 2026-08-17) — Squat · Bench · Deadlift + Press. The
 * per-day frame is unchanged; what changed is how many days there are to frame. See {@link LIFT_DAYS}.
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
 * silently borrows another movement's prescription). `display` is **the standard word**, which for
 * three movements is not the config's canonical spelling: Back Extension is his "Back Raise",
 * Dumbbell Curl his "Curls", Ab Wheel Rollout his "Ab Wheel". A display alias, never a second token.
 */

import { canPerform, equipmentFitRank, hasLoadableFit } from './strength-gear.ts';
/**
 * ⛔ TYPE-ONLY, AND THAT IS LOAD-BEARING. `accessory-picks.ts` reaches the strength grid, which
 * reaches this file's neighbours; a runtime import would build a cycle for a shape this file only
 * carries. The type is erased at build, so nothing here depends on that module at run time.
 */
import type { ViadaAccessoryPrefs } from '../../supabase/functions/_shared/standing-plan/accessory-picks.ts';

/** the previous program's three categories. One movement each, every lifting day. the previous program. */
export type AssistanceCategory = 'push' | 'pull' | 'single_leg_core';

export const ASSISTANCE_CATEGORIES: AssistanceCategory[] = ['push', 'pull', 'single_leg_core'];

export const CATEGORY_LABEL: Record<AssistanceCategory, string> = {
  push: 'Push',
  pull: 'Pull',
  single_leg_core: 'Single-leg / core',
};

/**
 * ⛔ THE THREE LIFT DAYS — ONE KEY PER DAY, NOT ONE PER LIFT (§1f-0 / slice 5, 2026-08-17).
 *
 * This was four keys, one per main lift, and that was only ever correct while four lifts meant four
 * days. Every Strong Focus block is three days now: **Squat · Bench · Deadlift + Press**. The press
 * has no day of its own — it stacks onto the deadlift's — so a `press` key was a bucket nothing
 * could read: the merge takes the heavier lift's block (`strength-primary-plan.ts`, §1e — the previous program's
 * stacked day is the mains plus ONE round, p.77), and an athlete's press-day picks were discarded in
 * silence. Asking for twelve movements and building nine.
 *
 * ⛔ THE `press` KEY IS DELETED, NOT KEPT, AND THERE IS NO READ-PATH FOR IT. Pre-launch, one
 * athlete, no external users — a stored `by_day.press` from an older goal is simply not read, and
 * `normalizeAssistancePrefs` returns the current shape from any input, so nothing strands. Do not
 * add a fallback, a shim, or a tolerance branch: *"if a change cannot delete what it replaces, stop
 * and say so."*
 *
 * ⚠️ THESE KEYS ARE STORAGE — they are persisted on `goals.training_prefs.assistance_picks`.
 * ⚠️ THE ORDER IS THE ORDER THE ATHLETE SEES (work order §1f: "Picker shows three cards: Squat ·
 * Bench · Deadlift + Press"), and it is load-bearing beyond display — `buildDefaultWeek` rotates a
 * focus pool by day INDEX, so reordering this array reassigns which movement lands on which day.
 */
export type LiftDay = 'squat' | 'bench' | 'deadlift';
export const LIFT_DAYS: LiftDay[] = ['squat', 'bench', 'deadlift'];
/** ⛔ ONE OWNER FOR THE DAY'S NAME. The shared day says so — the athlete picks for both lifts at once. */
export const LIFT_DAY_LABEL: Record<LiftDay, string> = {
  squat: 'Squat',
  bench: 'Bench',
  deadlift: 'Deadlift + Press',
};

/**
 * Main-lift name → day key. ⛔ THE NAMES ARE `MAIN_LIFTS` IN `strength-primary-plan.ts` VERBATIM
 * ("Overhead Press", "Bench Press", "Back Squat", "Deadlift"). If that table is renamed this map
 * must move with it, or the composer silently falls back to the balanced default for every day.
 *
 * ⛔ THE OVERHEAD PRESS RESOLVES TO THE DEADLIFT'S DAY, because that is the day it is trained on.
 * It used to return its own `'press'` key, and the composer then authored a full assistance block
 * for a session the merge threw away. Pointing it at the merged day is what makes an athlete's picks
 * for "Deadlift + Press" actually reach the built session.
 */
export function liftDayForMainLift(mainLiftName: string | null | undefined): LiftDay | null {
  const n = String(mainLiftName ?? '').trim().toLowerCase();
  if (!n) return null;
  if (n.includes('overhead press') || n === 'press' || n === 'ohp') return 'deadlift';
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
 * to encourage. Glutes covers hamstrings (the previous program groups them).
 */
/**
 * ⛔ FOUR CHIPS, NOT SIX — `back` AND `abs` ARE DELETED (Michael, 2026-08-17).
 *
 * Both were REDUNDANT UI: a second control pointing at a slot another control already owns, which
 * is how an athlete spends the same recovery budget twice without being told.
 *
 *   • **`abs`** pointed at `single_leg_core` — the slot the **Add abs** button already governs, and
 *     the button is the better control because it SPLITS the bucket's rep total rather than
 *     re-pointing it. Two ways to reach one slot, one of which silently displaces the leg work.
 *   • **`back`** pointed at `pull` — the slot the **pull-up progression** takes outright when it is
 *     on, and which defaults sensibly when it is off. A Back chip beside a live progression toggle
 *     reads as "you get both"; the chins do not double.
 *
 * ⚠️ NOTHING STRANDS. A goal stored with `focus: ['back','abs']` degrades through `isFocusChip`,
 * which filters unknown values — so an old goal simply builds its balanced default for that
 * category, exactly as an athlete who picked no chip at all. ⛔ Do not add a migration or a
 * tolerance branch; the filter IS the migration.
 *
 * ⚠️ AND THE CATALOG'S `focus` TAGS FOR THEM GO WITH THE CHIPS. A tag no chip can name is a pool
 * nothing can reach — see `focusPool`'s own warning that an empty pool is the tell of a missing tag.
 * `isAbs` is UNTOUCHED: the add-abs menu reads that flag, never the focus tag, so the button keeps
 * every movement it had.
 */
export type FocusChip = 'arms' | 'chest' | 'shoulders' | 'glutes';
export const FOCUS_CHIPS: FocusChip[] = ['arms', 'chest', 'shoulders', 'glutes'];
export const FOCUS_LABEL: Record<FocusChip, string> = {
  arms: 'Arms',
  chest: 'Chest',
  shoulders: 'Shoulders',
  glutes: 'Glutes',
};
/** ⛔ THREE. Past that every day is a focus day and the emphasis means nothing. */
export const FOCUS_CAP = 3;

export type CatalogEntry = {
  /** ⛔ STORED, and it resolves `exact` or `folded` in `exercise-config.ts`. Verified by test. */
  name: string;
  /** What the athlete reads. the previous program's word where it differs from the config's spelling. */
  display: string;
  category: AssistanceCategory;
  /**
   * ⛔ THE PREVIOUS PROGRAM'S OWN MUSCLE WORD where he itemizes one. Three movements he names without assigning a
   * muscle take his movement-FAMILY word instead of invented anatomy: Push-Up → chest (it is in his
   * press list), Face Pull → upper back (his row list), Reverse Lunge → legs (his single-leg list).
   */
  muscle: string;
  /** Page in Forever unless noted. Every movement here is his. */
  source: string;
  /** Which focus chips this movement serves. Empty = it is never a focus answer, only a default. */
  focus: FocusChip[];
  /** On the add-abs menu (the previous program / the previous program). */
  isAbs?: boolean;
  /**
   * ⛔ HOW MUCH LOCAL TISSUE DAMAGE THIS MOVEMENT LEAVES BEHIND — the axis this catalog was missing,
   * and the reason the default block put Reverse Lunges on the one pure upper day (2026-08-17).
   *
   * ⚠️ IT IS NOT A CNS COST, AND CONFLATING THE TWO IS THE MISTAKE THIS TAG EXISTS TO PREVENT.
   * The nervous system is taxed by heavy BILATERAL AXIAL loading — a bar on the back compressing the
   * spine. Single-leg work carries a fraction of the absolute load and does not load the spine that
   * way, so it is CHEAP on the CNS. What it is expensive on is the muscle itself: deep flexion under
   * eccentric load micro-tears the glutes, hamstrings and VMO, and the athlete wakes up with legs
   * that cannot hold a stride. Their threshold run collapses and they blame the barbell programme.
   *
   * ⚠️ ONLY MEANINGFUL ON `single_leg_core`. Push and pull rows leave it absent — a category-3 tag
   * on a triceps pushdown would be a number nobody can read.
   *
   * `high` — deep flexion under eccentric load; the leg is trashed for ~48h.
   * `mild` — hip-hinge posterior chain; loaded, but not through deep knee flexion.
   * `none` — trunk only; the legs are untouched and the run is unaffected.
   */
  eccentricCost?: 'high' | 'mild' | 'none';
};

/**
 * ⛔ 28 MOVEMENTS. TWENTY-SEVEN ARE THE PREVIOUS PROGRAM'S; ONE IS NOT, AND IT IS MARKED WHERE IT SITS.
 *
 * No Plank — it is not his. Sit-Up and Side Bend ARE his (the previous program). The single exception is the HIP
 * THRUST pair, flagged in place below with its justification. **Nothing else may be added here that
 * is not in the book**, and a second exception is a conversation, not a commit.
 */
export const ASSISTANCE_CATALOG: CatalogEntry[] = [
  // ── PUSH ────────────────────────────────────────────────────────────────────────────────────────
  { name: 'Dips', display: 'Dips', category: 'push', muscle: 'triceps / chest', source: 'p.24', focus: ['arms', 'chest'] },
  // ⛔ THE PREVIOUS PROGRAM'S OWN, AND THE MEATY TRICEPS OPTION — the Simplest Strength Template's big assistance
  // lift, not a cable accessory. No exception needed: it is in the book, so the "strictly the previous program"
  // guardrail is intact.
  //
  // ⚠️ PLACED WITH THE COMPOUNDS RATHER THAN IN PAGE ORDER, and that is the tie-break doing real
  // work. Every loadable movement in this pool ranks 0 for an athlete who owns the kit, so
  // `equipmentFitRank` cannot separate them — catalog order is what breaks the tie, and a loaded
  // press belongs ahead of an isolation movement. It has no position in the p.24-26 sequence anyway;
  // it comes from a different template.
  { name: 'Close-Grip Bench Press', display: 'Close-Grip Bench', category: 'push', muscle: 'triceps', source: 'Simplest Strength', focus: ['arms'] },
  { name: 'Push-Up', display: 'Push-Up', category: 'push', muscle: 'chest', source: 'p.25', focus: ['chest'] },
  { name: 'DB Bench Press', display: 'DB Bench Press', category: 'push', muscle: 'chest', source: 'p.25', focus: ['chest'] },
  { name: 'DB Incline Press', display: 'DB Incline Press', category: 'push', muscle: 'chest', source: 'p.25', focus: ['chest'] },
  { name: 'DB Shoulder Press', display: 'DB Shoulder Press', category: 'push', muscle: 'shoulders', source: 'p.25', focus: ['shoulders'] },
  { name: 'Plate Raise', display: 'Plate Raise', category: 'push', muscle: 'shoulders', source: 'p.26', focus: ['shoulders'] },
  { name: 'Triceps Pushdown', display: 'Triceps Pushdown', category: 'push', muscle: 'triceps', source: 'p.26', focus: ['arms'] },
  { name: 'Triceps Extension', display: 'Triceps Extension', category: 'push', muscle: 'triceps', source: 'p.26', focus: ['arms'] },

  // ── PULL ────────────────────────────────────────────────────────────────────────────────────────
  { name: 'Chin-Up', display: 'Chin-Up', category: 'pull', muscle: 'lats / biceps', source: 'p.26', focus: ['arms'] },
  { name: 'Dumbbell Row', display: 'Dumbbell Row', category: 'pull', muscle: 'upper back', source: 'p.27', focus: [] },
  { name: 'Barbell Row', display: 'Barbell Row', category: 'pull', muscle: 'upper back', source: 'p.27', focus: [] },
  { name: 'Lat Pulldown', display: 'Lat Pulldown', category: 'pull', muscle: 'lats', source: 'p.27', focus: [] },
  { name: 'Inverted Row', display: 'Inverted Row', category: 'pull', muscle: 'back', source: 'p.26', focus: [] },
  { name: 'Face Pull', display: 'Face Pull', category: 'pull', muscle: 'upper back', source: 'p.28', focus: [] },
  // Stored canonical, displayed as the previous program writes it.
  { name: 'Dumbbell Curl', display: 'Curls', category: 'pull', muscle: 'biceps', source: 'p.27', focus: ['arms'] },

  // ── SINGLE-LEG / CORE ───────────────────────────────────────────────────────────────────────────
  { name: 'Reverse Lunge', display: 'Reverse Lunge', category: 'single_leg_core', muscle: 'legs', source: 'p.30', focus: [] , eccentricCost: 'high' },
  { name: 'Bulgarian Split Squat', display: 'Bulgarian Split Squat', category: 'single_leg_core', muscle: 'legs', source: 'p.30', focus: [] , eccentricCost: 'high' },
  { name: 'Front Squat', display: 'Front Squat', category: 'single_leg_core', muscle: 'legs', source: 'p.30', focus: [] , eccentricCost: 'high' },
  // ⛔ THE ONE DELIBERATE DEPARTURE FROM THE PREVIOUS PROGRAM'S LIST, AND IT IS HERE RATHER THAN IN A CHANGELOG SO
  // NOBODY "CORRECTS" IT BACK OUT.
  //
  // Forever's assistance chapter has NO TRUE GLUTE MOVEMENT. The Glutes focus was therefore served by
  // a hamstring raise, a back raise and a reverse hyper — posterior chain, all three, and none of
  // them what an athlete means when they ask for glutes. A focus chip that cannot answer its own name
  // is worse than no chip.
  //
  // ⚠️ THE WARRANT IS HIS, EVEN THOUGH THE MOVEMENT IS NOT: p.24 — *"it is the work that matters."*
  // The book is explicit that the assistance list is a menu, not a boundary. This is the only place
  // that licence is spent, and spending it twice needs a better reason than this one.
  //
  // ⚠️ BARBELL LEADS ON PURPOSE. The loaded version is the movement; the single-leg version is the
  // answer for someone with no barbell, and it ranks itself there automatically (ALWAYS route) rather
  // than by being listed first.
  { name: 'Barbell Hip Thrust', display: 'Barbell Hip Thrust', category: 'single_leg_core', muscle: 'glutes', source: 'ours — see note', focus: ['glutes'] , eccentricCost: 'mild' },
  { name: 'Single-Leg Hip Thrust', display: 'Single-Leg Hip Thrust', category: 'single_leg_core', muscle: 'glutes', source: 'ours — see note', focus: ['glutes'] , eccentricCost: 'mild' },
  { name: 'Glute-Ham Raise', display: 'Glute-Ham Raise', category: 'single_leg_core', muscle: 'glutes', source: 'p.29', focus: ['glutes'] , eccentricCost: 'high' },
  { name: 'Back Extension', display: 'Back Raise', category: 'single_leg_core', muscle: 'lower back / glutes', source: 'p.29', focus: ['glutes'] , eccentricCost: 'mild' },
  { name: 'Reverse Hyper', display: 'Reverse Hyper', category: 'single_leg_core', muscle: 'glutes', source: 'p.29', focus: ['glutes'] , eccentricCost: 'mild' },
  { name: 'Hanging Leg Raise', display: 'Hanging Leg Raise', category: 'single_leg_core', muscle: 'abs', source: 'p.30', focus: [], isAbs: true , eccentricCost: 'none' },
  { name: 'Ab Wheel Rollout', display: 'Ab Wheel', category: 'single_leg_core', muscle: 'abs', source: 'p.30', focus: [], isAbs: true , eccentricCost: 'none' },
  { name: 'Weighted Sit-Up', display: 'Weighted Sit-Up', category: 'single_leg_core', muscle: 'abs', source: '2nd ed p.43', focus: [], isAbs: true , eccentricCost: 'none' },
  { name: 'DB Side Bend', display: 'DB Side Bend', category: 'single_leg_core', muscle: 'abs / obliques', source: '2nd ed p.51', focus: [], isAbs: true , eccentricCost: 'none' },
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

/** The abs add-on menu — four movements, all the previous program's. */
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
  /**
   * ⛔ WHICH DAY THE PICKER IS OPEN ON. Absent → today's order exactly, so every existing caller is
   * unchanged. Given, and on `single_leg_core`, the menu is ranked by {@link orderByEccentricCost}.
   */
  day?: LiftDay | null,
): CatalogEntry[] {
  const all = catalogFor(category);
  const usable = all.filter((e) => canPerform(e.name, athleteEquipment));
  const list = usable.length > 0 ? usable : all;
  return day && category === 'single_leg_core' ? orderByEccentricCost(list, day) : list;
}

export function absOptions(athleteEquipment?: string[] | null): CatalogEntry[] {
  const all = absCatalog();
  const usable = all.filter((e) => canPerform(e.name, athleteEquipment));
  return usable.length > 0 ? usable : all;
}

// ── THE BALANCED DEFAULT ──────────────────────────────────────────────────────────────────────────

/**
 * ⛔ THE PREVIOUS PROGRAM'S OWN PAIRINGS, NOT A ROTATION SOMEONE INVENTED.
 *
 *   Bench    → DB Bench + DB Row          Triumvirate p.48, verbatim
 *   Squat    → low back                   Periodization Bible p.51 ("Squat day → low back, quads, abs")
 *   Deadlift → hamstrings                 Periodization Bible p.51 ("Deadlift day → hamstrings, quads, abs")
 *
 * ⛔ THE DEFAULT IS ALL-COMPOUND, AND ARMS ARE ALREADY IN IT. Confirmed 2026-08-13. There is no
 * Curls and no Triceps Pushdown anywhere in this table, and that is not an omission: **Dips are
 * triceps and a Chin-Up is biceps** (the catalog's own muscle words, which are the previous program's), so the
 * default week trains both arms with compounds. It is also what the book itself defaults to —
 * Triumvirate p.48 pairs the press day with Dips and Chin-Ups and prescribes no isolation.
 *
 * ⚠️ THE ISOLATION MOVEMENTS ARE STILL REACHABLE, VIA THE **ARMS FOCUS** — that is what a focus chip
 * is for. Do not "fix" this by adding Curls or a Pushdown to the default; opt-in isolation is the
 * design, and putting it in the default spends rep budget the compounds already cover.
 *
 * ⛔ THE PRESS ROW IS DELETED WITH ITS DAY (slice 5, 2026-08-17). It was Dips + Chin-Up + Hanging
 * Leg Raise — Triumvirate p.48's press pairing, verbatim — and it is gone because the day is gone,
 * not because the pairing was wrong. The press is trained on the deadlift's day now and that day
 * keeps ITS block (§1e: one round per stacked day).
 *
 * ⚠️ AND THE DEFAULT WEEK NO LONGER CARRIES AN ABS MOVEMENT. The old note read *"abs land on press
 * day, once"* — the single-leg/core slot on the one day with no lower-body main lift. There is no
 * such day left: bench is the only upper day and its slot is Reverse Lunge. **This is a real content
 * consequence of the merge, not an oversight** — an athlete who wants abs taps "+ abs" on any day
 * (an ADD-ON sharing the slot's rep budget, never a fourth category), and the Abs focus chip still
 * re-points the category. ⛔ Do not quietly swap the bench day's Reverse Lunge for a leg raise to
 * restore it: that is a default-content decision, and it belongs to whoever owns §1f's card copy.
 */
export const BALANCED_WEEK: Record<LiftDay, Record<AssistanceCategory, string>> = {
  // ⛔ SINGLE-LEG/CORE IS ROUTED BY `eccentricCost`, NOT PICKED FOR VARIETY (2026-08-17).
  //
  // This day's single-leg pick WAS `Reverse Lunge` — a `high` movement on the one PURE UPPER day in
  // the block. An athlete who never opened the picker got deep-flexion eccentric leg damage on their
  // cleanest day, woke with legs that could not hold a stride, and ran their threshold session on
  // them. The squat day meanwhile got `Back Extension`, the mildest option in the category. Exactly
  // inverted. ⛔ Do not "rebalance" these back for variety: the ordering IS the rule.
  bench: { push: 'DB Bench Press', pull: 'Dumbbell Row', single_leg_core: 'Hanging Leg Raise' },
  // ⛔ INVERTED ROW, NOT LAT PULLDOWN (Slice 7). The default block must be performable BY A NORMAL
  // HOME GYM with nothing swapped — that is Slice 7's guardrail — and a lat pulldown needs a cable
  // stack or a band, which barbell/rack/bench/pull-up-bar does not include. It is still on the pull
  // menu for anyone who has the stack; it is no longer what the app hands someone by default.
  // ⚠️ THE HIGH-ECCENTRIC WORK LIVES HERE. The legs are already taking the day's systemic hit, so the
  // local tissue damage is quarantined into one 24h window that the 48h heavy-legs clearance then
  // covers. Bulgarian split squats need a bench, which Slice 7's home gym has.
  squat: { push: 'Push-Up', pull: 'Inverted Row', single_leg_core: 'Bulgarian Split Squat' },
  // ⚠️ MILD, NOT HIGH, AND THAT IS THE ONE PLACE THIS RULE IS NOT "LOWER DAY → HEAVY". The deadlift
  // already loads the hamstrings eccentrically; `Glute-Ham Raise` — the old default here — is one of
  // the most eccentric hamstring movements there is, and stacking it on deadlift day is the same
  // tissue twice. A hip-hinge that does not go through deep knee flexion is the answer.
  deadlift: { push: 'DB Shoulder Press', pull: 'Barbell Row', single_leg_core: 'Back Extension' },
};

/**
 * ⛔ IS THIS DAY A PURE UPPER DAY — the one that must stay clean for the cardio around it?
 * Squat and Deadlift + Press both carry a heavy barbell through the legs; bench does not.
 * ⚠️ THIS IS THE COST NOTE'S QUESTION ONLY. The ROUTING has three answers, not two — see
 * {@link ECCENTRIC_RANK}.
 */
export function isUpperOnlyDay(day: LiftDay): boolean {
  return day === 'bench';
}

/**
 * ⛔ THE ROUTING, PER DAY — and it is THREE answers, not "upper vs lower" (corrected 2026-08-17).
 *
 * | day               | wants | why                                                                |
 * |-------------------|-------|--------------------------------------------------------------------|
 * | bench (pure upper)| none  | the legs must stay clean for the cardio on either side of it        |
 * | squat             | high  | the legs already took the day's hit; quarantine the damage here     |
 * | deadlift + press  | mild  | the deadlift already loaded the hamstrings — high is the same tissue twice |
 *
 * ⚠️ A BINARY UPPER/LOWER RANK STOOD HERE FIRST AND IT DISAGREED WITH ITS OWN DEFAULTS. It put
 * `high` at the top of the deadlift day's menu while `BALANCED_WEEK.deadlift` was deliberately
 * `mild` — so the picker recommended the thing the default had just been fixed to avoid.
 */
const ECCENTRIC_RANK: Record<LiftDay, Record<'high' | 'mild' | 'none', number>> = {
  bench: { none: 0, mild: 1, high: 2 },
  squat: { high: 0, mild: 1, none: 2 },
  deadlift: { mild: 0, high: 1, none: 2 },
};

/**
 * ⛔ THE ADVICE, NOT A GATE (2026-08-17). The menu is ORDERED for the day; nothing is removed and
 * nothing is substituted. **The athlete may still pick anything on the list** — D-407/D-423 is that
 * the athlete's pick is what appears, and a build-time substitution here would bring back the
 * apology sentence those decisions were written to delete. What a costly pick gets is
 * {@link eccentricCostNote}, not a swap.
 */
export function orderByEccentricCost(entries: CatalogEntry[], day: LiftDay): CatalogEntry[] {
  const rank = ECCENTRIC_RANK[day] ?? ECCENTRIC_RANK.bench;
  return [...entries].sort((a, b) =>
    (rank[a.eccentricCost ?? 'none'] ?? 0) - (rank[b.eccentricCost ?? 'none'] ?? 0));
}

/**
 * ⛔ WHICH TIERS MAY LAND ON A DAY AT ALL. This is a QUARANTINE, not a magnet.
 *
 * ⚠️ AND THAT DISTINCTION IS A BUG I WROTE AND THE GLUTES CHIP CAUGHT. The first version SORTED the
 * focus pool by day, which made the squat day actively PREFER `high` — so an athlete asking for
 * Glutes got a Glute-Ham Raise (a hamstring raise) over a Barbell Hip Thrust, and the chip stopped
 * answering its own name. The law never said high-eccentric work is REQUIRED on the squat day; it
 * said it is the only day that can AFFORD it. So the day filters what may land and the pool's own
 * order — equipment fit, then the catalog — still decides which one does.
 */
const ALLOWED_ECCENTRIC: Record<LiftDay, ReadonlyArray<'high' | 'mild' | 'none'>> = {
  // The one day that must stay clean for the cardio either side of it.
  bench: ['none', 'mild'],
  // The deadlift already loaded those hamstrings; `high` on top is the same tissue twice.
  deadlift: ['mild', 'none'],
  // The legs took the day's hit already. Everything is affordable here.
  squat: ['high', 'mild', 'none'],
};

/**
 * ⛔ WHICH MOVEMENT A FOCUS POOL GIVES THIS DAY — QUARANTINED, THEN ROTATED (2026-08-17).
 *
 * Every other category rotates its focus pool by day index so the week has variety. Bucket 3 cannot
 * do that blind: the rotation put a Glute-Ham Raise (`high`) on the deadlift day for anyone who
 * picked the Glutes chip, reintroducing through the chip exactly the stack the defaults had just
 * been fixed to remove.
 *
 * ⚠️ IT NEVER STRANDS. If the day's allowed tiers empty the pool — a kit whose only glute option is
 * a `high` movement — the whole pool rotates as before. A missing movement is worse than a costly
 * one, and the athlete still gets {@link eccentricCostNote} on the card.
 */
export function pickForDay(pool: CatalogEntry[], day: LiftDay, dayIndex: number): CatalogEntry {
  const allowed = ALLOWED_ECCENTRIC[day] ?? ALLOWED_ECCENTRIC.bench;
  const safe = pool.filter((e) => allowed.includes(e.eccentricCost ?? 'none'));
  const usable = safe.length > 0 ? safe : pool;
  return usable[dayIndex % usable.length];
}

/**
 * The cost of the pick, when there is one. `null` on every safe choice — a note on every row is a
 * note nobody reads.
 *
 * ⚠️ FACT THEN CONSEQUENCE, NO IMPERATIVE. It does not tell the athlete to change their mind.
 */
export function eccentricCostNote(name: string, day: LiftDay): string | null {
  if (!isUpperOnlyDay(day)) return null;
  if (catalogEntry(name)?.eccentricCost !== 'high') return null;
  return 'This puts heavy eccentric leg work on an upper-body day. '
    + 'The soreness peaks a day later, which is when your cardio has to run on it.';
}
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
   *
   * ⛔ AND A BAND SORTS BELOW EVERY LOADABLE IMPLEMENT, not merely below its own movement's better
   * route — see `equipmentFitRank`. Leading the pool correctly was not enough on its own: the
   * ROTATION below still walked the whole pool, so a band-only movement surfaced on day two anyway.
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
  // Array.prototype.sort is stable, so equal ranks keep the catalog's own order — which is the previous program's
  // page order, and the tie-break we want.
  return [...entries].sort((a, b) => rank(a) - rank(b));
}

/** Which category a focus chip speaks to. Arms is the one chip that reaches two. */
const CATEGORY_FOR_FOCUS: Record<FocusChip, AssistanceCategory[]> = {
  arms: ['push', 'pull'],
  chest: ['push'],
  shoulders: ['push'],
  glutes: ['single_leg_core'],
};

// ── STORAGE ───────────────────────────────────────────────────────────────────────────────────────

export type DayPicks = {
  push: string;
  pull: string;
  single_leg_core: string;
  /** ⚠️ `abs` IS GONE (2026-08-18) AND A STORED ONE IS DROPPED ON READ, not honoured — see
   *  `normalizeAssistancePrefs`. Same "nothing strands" rule this file already applies to an
   *  unrecognised focus chip: an old value degrades to the current shape rather than erroring. */
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
   * the week, pushes the volume to the previous program's prescription, and tracks a number that climbs. One is a
   * preference, the other is a programme. See `src/lib/pullup-progression.ts`.
   *
   * ⚠️ Absent/null is the norm — this is opt-in, and the balanced week is unaffected by it.
   */
  performance_focus?: PerformanceFocus | null;
  /**
   * ⛔ THE STANDING PLAN'S OWN BLOCK, CARRIED BESIDE THE PREVIOUS PROGRAM'S — NOT INSTEAD OF IT (2026-08-24).
   *
   * The Viada frame's accessory screen asks six questions about ITS OWN slots
   * (`_shared/standing-plan/accessory-picks.ts`), which the nine `by_day` keys cannot express: this
   * week has four differently shaped lifting days, no core slot, and no open compound-pull slot.
   * Its answers live here.
   *
   * ⛔ `by_day` IS NOT MIGRATED AND MUST NOT BE. Every existing goal carries it, Get Stronger reads
   * it, and that screen is untouched. Two paths, two blocks, one envelope — and which block a goal
   * carries is how a reader knows which screen it came from without being told.
   *
   * ⚠️ PASSED THROUGH UNVALIDATED BY {@link normalizeAssistancePrefs}, deliberately.
   * `normalizeViadaPrefs` owns this shape and it needs the athlete's equipment to check a pick
   * against its own pool — which this function does not have and is not going to grow a parameter
   * for. One owner per shape.
   */
  viada?: ViadaAccessoryPrefs | null;
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
 *     2026-08-13. → the same three picks applied to every day, which is exactly what the old
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
    /**
     * ⛔ A STORED `abs` IS DROPPED HERE, DELIBERATELY (2026-08-18). This is the "nothing strands"
     * rule the file already applies to an unrecognised focus chip: an old shape degrades to the
     * current one rather than erroring, and it does not resurrect a control the athlete can no
     * longer see. The movement itself is not lost to them — every abs entry is a `single_leg_core`
     * option, so it is one pick away in the slot that now owns the whole rep budget.
     */
    by_day[day] = {
      push: pickFor('push'),
      pull: pickFor('pull'),
      single_leg_core: pickFor('single_leg_core'),
    };
  }

  // ⚠️ ONLY A RECOGNISED GOAL SURVIVES THE READ. An unknown string is dropped rather than stored, so
  // a stale or hand-edited value cannot pin the pull category to a movement that does not exist.
  const pf = obj?.performance_focus;
  const performance_focus: PerformanceFocus | null = pf === 'pullups' ? 'pullups' : null;

  // ⚠️ CARRIED, NOT PARSED — see `AssistanceWeekPrefs.viada`. Dropping an unrecognised block here
  // would strand a Standing Plan athlete's six picks the first time this function ran over them.
  const viada = obj?.viada && typeof obj.viada === 'object' && !Array.isArray(obj.viada)
    ? obj.viada as ViadaAccessoryPrefs
    : null;
  return { version: 2, by_day, focus: focusOf(obj?.focus), performance_focus, ...(viada ? { viada } : {}) };
}

/**
 * Build a week from the focus chips — the "set it once" answer the picker opens on.
 *
 * ⛔ A FOCUS REPLACES ONLY THE CATEGORY IT SPEAKS TO, and it rotates through that category's pool
 * across the days rather than putting the same movement on all of them. 200 reps a week of one
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
        // ⛔ THE ROTATION WALKS THE LOADABLE MOVEMENTS ONLY, WHEN THERE ARE ANY. Ranking the pool
        // fixes which movement LEADS; it does not stop the rotation reaching a band-only movement on
        // day two or three, which is the same wrong answer arriving a day later. A dumbbells+bands
        // gym asking for Arms must get Triceps Extension on every day it can, never a banded
        // pushdown on the rotation's second turn.
        //
        // ⚠️ AND IT MUST NOT STRAND A BANDS-ONLY KIT. If nothing in the pool is reachable without a
        // band, the whole pool rotates exactly as before — a band is a real route and the athlete
        // who has only bands keeps every movement they can do.
        const loadable = pool.filter((e) => hasLoadableFit(e.name, athleteEquipment));
        const rotation = loadable.length > 0 ? loadable : pool;
        // ⛔ BUCKET 3 IS ROUTED BY THE DAY, NOT ROTATED BLIND — see `pickForDay`. A Glutes chip used
        // to hand the deadlift day a Glute-Ham Raise, which is the exact stack the defaults were
        // fixed to remove; the chip was reintroducing it one layer up.
        picks[category] = category === 'single_leg_core'
          ? pickForDay(rotation, day, dayIndex).name
          : rotation[dayIndex % rotation.length].name;
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
    // ⚠️ `picks.abs = null` STOOD HERE — the focus-built week never set an abs movement, and now
    // there is no field to set. A focus chip has never spoken to abs and still does not.
    out[day] = picks;
  });

  return out;
}

// ── RESOLUTION ────────────────────────────────────────────────────────────────────────────────────

export type ResolvedAssistanceRow = {
  category: AssistanceCategory;
  /** Stored/canonical name — what goes on the row and what downstream resolves. */
  name: string;
  /** the previous program's word — what the athlete reads. */
  display: string;
  totalReps: number;
  /** ⚠️ `isAbsAddOn` WENT WITH THE ADD-ABS ROW (2026-08-18). Every row now owns its slot's whole
   *  budget, so there is no longer a row that means "I share someone else's". */
};

/**
 * ⛔⛔ `splitRepsForAbs` LIVED HERE AND IS DELETED (Michael, 2026-08-18: *"kill add abs, but let
 * users still choose their preferred exercises like the other"*). ⛔ DO NOT REINTRODUCE IT.
 *
 * It halved the single-leg/core budget between the slot's movement and an optional abs movement —
 * 50 -> 25/25, 30 -> 15/15 — on the reasoning that the previous program allows two movements per category
 * but a fourth full slot would be pure added fatigue charged against the endurance budget. That
 * reasoning was sound and the FEATURE was still wrong, for a reason upstream of it:
 *
 * **Abs were never a fourth category. They are single-leg/core movements.** Hanging Leg Raise, Ab
 * Wheel, Weighted Sit-Up and DB Side Bend are all `category: 'single_leg_core'`, and
 * `BALANCED_WEEK.bench` already defaults to Hanging Leg Raise. So the add-on was a SECOND control
 * for a choice the slot already offered — and the only one of the two that charged half the reps.
 * An athlete who wanted abs was trading away half their leg work to ask a question they could have
 * asked for free.
 *
 * ⚠️ SO THE SLOT IS WHOLE AGAIN AND ABS ARE PICKED LIKE ANYTHING ELSE. On a 30-rep week, choosing
 * Hanging Leg Raise now means 30 reps of it, not 15 beside 15 of a split squat.
 */

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
  /**
   * ⛔ THE BUILD-TIME EQUIPMENT GATE (2026-08-13). Until this parameter existed, the gate ran only
   * where picks are MADE (the wizard picker, the swap sheet — D-424/D-425) and never where the plan
   * is BUILT — so picks stored while the arc was unloaded, equipment changed after picking, and the
   * `BALANCED_WEEK` fallbacks all reached the plan unchecked. Michael, 2026-08-13, from a Triceps
   * Extension on his squat day: "it's not reading users equipment."
   *
   * A performable pick is KEPT — even a band pick, because the athlete chose it (D-423: the
   * athlete's pick is what appears). Only an un-performable name is replaced, and the replacement is
   * the book's rule, not an invention: same category (the previous program lists each slot as a muscle-category
   * menu, pp.50-51, and licenses the swap — "you can change exercises however you see fit"), best
   * gear first, bodyweight before bands (`equipmentFitRank` ranks band routes last-resort; the
   * Bodyweight template p.52 is the no-gear floor and bands appear nowhere in the chapter).
   *
   * Absent/empty → every gate here no-ops (`canPerform` returns true on unknown inventory), which
   * is the pre-existing behaviour exactly. ⚠️ `optionsFor` is NEVER EMPTY: if the athlete's kit
   * rules out an entire category it returns the full list, so the "replacement" can itself be
   * un-performable — the same deliberate compromise the picker makes rather than a blank slot.
   */
  athleteEquipment?: string[] | null,
): ResolvedAssistanceRow[] {
  /**
   * ⛔ §0h — AN UNRECOGNISED DAY DEGRADES TO A COMPLETE BLOCK, NEVER TO A THROW. This resolved
   * `BALANCED_WEEK[day]` in two places and neither was guarded; while every `LiftDay` was a key of
   * that table it could not misfire. Slice 5 deleted the `press` key (2026-08-17), so an unknown
   * key is now genuinely reachable — a stale caller, an older stored shape, a main lift the map does
   * not recognise — and the second dereference threw `undefined.single_leg_core` mid-build.
   *
   * ⚠️ THE FALLBACK IS A REAL DAY'S BLOCK, NOT AN EMPTY ONE. `LIFT_DAYS[0]` is a complete, sourced
   * set of three picks, which is what §0h asks for: unknown means "we have not been told", never
   * "this athlete trains nothing".
   */
  const dayDefaults = BALANCED_WEEK[day] ?? BALANCED_WEEK[LIFT_DAYS[0]];
  const picks: DayPicks = prefs.by_day[day] ?? { ...dayDefaults };
  const row = (category: AssistanceCategory, name: string, reps: number): ResolvedAssistanceRow => ({
    category,
    name,
    display: displayName(name),
    totalReps: reps,
  });
  /** Keep a performable name; replace an un-performable one from its own category's ranked pool. */
  const gated = (category: AssistanceCategory, name: string): string => {
    if (canPerform(name, athleteEquipment)) return name;
    const pool = rankByEquipmentFit(optionsFor(category, athleteEquipment), athleteEquipment);
    return pool[0]?.name ?? name;
  };

  /**
   * ⛔ ONE MOVEMENT, THE WHOLE BUDGET (2026-08-18). The add-abs branch stood here and split
   * `totalReps` between this movement and an optional second one. It is gone with the field that
   * fed it — see the note above `resolveDayAssistance`'s neighbours. A stored `abs` on an OLD goal
   * is now simply not read, which is deliberate: the alternative is two athletes on the same
   * settings getting different rep totals because of a control one of them can no longer see.
   */
  const legName = gated('single_leg_core', picks.single_leg_core || dayDefaults.single_leg_core);

  const rows = [
    row('push', gated('push', picks.push || dayDefaults.push), totalReps),
    // ⚠️ THE PULL-UP PROGRESSION ROW IS DELIBERATELY NOT GATED. It is an opt-in programme whose
    // whole content is "chins, every lifting day" — an athlete who opted in and owns no bar is a
    // contradiction the intake should catch, and silently rewriting the programme's movement here
    // would be worse than showing them what they signed up for.
    pullup
      ? row('pull', pullup.movement, pullup.totalReps)
      : row('pull', gated('pull', picks.pull || dayDefaults.pull), totalReps),
    row('single_leg_core', legName, totalReps),
  ];
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

// ============================================================================
// THE GRID'S TAXONOMY — A FOURTH ACCESSOR OVER A VOCABULARY THAT ALREADY EXISTS.
//
// ⛔ READ THIS BEFORE ADDING ANYTHING. Three accessors already sit over `MovementPattern`
// (`src/lib/exercise-config.ts`), and each was added because it asked a question the others could
// not answer:
//
//   `MovementPattern`   (Q-181, 9 values)  "which movement slot is this?"          — the vocabulary
//   `MovementGroup`     (D-315, 3 values)  "upper day or lower day?"               — placement
//   `MovementFamily`    (Q-212, 7 values)  "do these two collide on one day?"      — collision
//   ↓
//   THIS FILE                              "how braced, how compound, in Viada's   — the grid
//                                           four-tier scheme, and which of his
//                                           four patterns is it?"
//
// **Same data, four questions, four accessors, side by side.** That is the shape `CLAUDE.md`
// prescribes and the shape `exercise-config.ts` already demonstrates twice. Nothing here adds a
// value to `MovementPattern` and nothing here is a second exercise catalogue.
//
// ⛔ AND IT IS NOT `StrengthIntent` EITHER. `protocols/intent-taxonomy.ts` names whole SESSIONS —
// `LOWER_NEURAL`, `UPPER_STRENGTH`, `FULLBODY_MAINTENANCE`. Viada's ME/DE/SKILL/HYP name how ONE
// movement's sets are loaded. A `LOWER_NEURAL` day contains an ME slot and several HYP slots. Its
// header sentence — *"protocols output intents, placement policies assign intents to days"* — stays
// exactly true and describes the other axis.
//
// ── WHAT IS HIS AND WHAT IS OURS ─────────────────────────────────────────────────────────────────
//
// ⛔ HIS CATEGORY DEFINITIONS ARE METHOD AND ARE CITED. "Primary: compound, barbell or bar, cardinal
// plane" is a definition; "bench press, military press, push press" is his LIST, and a list is
// expression. **This file ships the definitions as a CLASSIFIER and runs it over OUR OWN catalogue.**
// His lists appear once, in the test file, as the classifier's ground truth — the author's own worked
// examples are the right thing to verify a classifier against, and that is the only place they are.
// ============================================================================

import {
  EXERCISE_CONFIG,
  foldExerciseName,
  getExerciseConfig,
  type MovementPattern,
} from '../../../../src/lib/exercise-config.ts';
import {
  ASSISTANCE_GEAR,
  canPerform,
  equipmentFitRank,
  gearRoutesFor,
} from '../../../../src/lib/strength-gear.ts';

/**
 * ⛔ FIVE CATEGORIES PLUS CORE. There is no sixth, and in particular there is no `asymmetrical` —
 * that is a MODIFIER (see {@link isAsymmetrical}), settled 2026-08-21 after a page-by-page check.
 *
 * ⚠️ CORE IS ITS OWN HEADING ON p223, not one of the five, which is why it is a member of this union
 * but never a substitution target for the others.
 */
export type ViadaCategory = 'primary' | 'secondary' | 'braced' | 'focused' | 'carry' | 'core';

export const VIADA_CATEGORIES: ViadaCategory[] = [
  'primary', 'secondary', 'braced', 'focused', 'carry', 'core',
];

/** His own one-line definitions, from the page each category opens on. */
export const CATEGORY_DEFINITION: Record<ViadaCategory, { text: string; cite: string }> = {
  primary: {
    text: 'Compound movements, barbell or bar, cardinal plane of movement (vertical/horizontal), or '
      + 'contest- or assessment-specific movement with or without minor modifications to setup.',
    cite: 'Viada pp218-219',
  },
  secondary: {
    text: 'Compound noncontested movements, dumbbell variants — variable form and plane of movement.',
    cite: 'Viada p220',
  },
  braced: { text: 'More externally braced movements.', cite: 'Viada pp221-222' },
  focused: {
    text: 'Single-joint emphasis (chest / deltoid / lat / hamstring / quad / calf / biceps / triceps).',
    cite: 'Viada pp222-223',
  },
  carry: {
    text: 'Movements where the weight is transported from one place to another. A "pick" is picking '
      + 'the implement up and putting it down without forward movement.',
    cite: 'Viada p226',
  },
  core: { text: 'Trunk work.', cite: 'Viada p223' },
};

/**
 * ⛔ FOUR PATTERNS, AND THEY ARE HIS, NOT OURS. Every category heading on pp218-223 is one of
 * `push upper` · `pull upper` · `hinge lower` · `press/push lower`, and each category page repeats
 * the same parenthetical: *"(push/pull/hinge/lower push)"*. His FOCUSED headings name a muscle after
 * the pattern — "focused push lower/QUADS", "focused hinge lower/HAMSTRINGS" — but the pattern axis
 * underneath is the same four.
 *
 * ⚠️ IT IS A COARSENING OF `MovementPattern`, not a rival: our nine values collapse onto his four.
 * Horizontal and vertical push are one thing to him; knee and hip dominant are his two lower halves.
 */
export type ViadaPattern = 'push_upper' | 'pull_upper' | 'hinge_lower' | 'press_lower';

export const VIADA_PATTERNS: ViadaPattern[] = ['push_upper', 'pull_upper', 'hinge_lower', 'press_lower'];

export const PATTERN_LABEL: Record<ViadaPattern, string> = {
  push_upper: 'Push (upper)',
  pull_upper: 'Pull (upper)',
  hinge_lower: 'Hinge (lower)',
  press_lower: 'Press (lower)',
};

/**
 * Our nine-value pattern → his four.
 *
 * ⚠️ `calf` MAPS TO PRESS LOWER ON HIS OWN AUTHORITY, not by our convenience: freestanding barbell
 * calf raises are in his SECONDARY PRESS LOWER list and seated calf raises in his FOCUSED PUSH
 * LOWER/QUADS list. Both sit under the lower-press heading.
 *
 * ⚠️ `core` AND `plyometric` RETURN NULL. Core is its own heading (p223) and plyometrics are their
 * own chapter section with their own rules (p227) — neither is a pattern within the lifting grid,
 * and forcing them into one would put an ab wheel in a pressing slot.
 */
export function viadaPatternOfMovementPattern(p: MovementPattern | null | undefined): ViadaPattern | null {
  switch (p) {
    case 'horizontal_push':
    case 'vertical_push':
      return 'push_upper';
    case 'horizontal_pull':
    case 'vertical_pull':
      return 'pull_upper';
    case 'hip_dominant':
      return 'hinge_lower';
    case 'knee_dominant':
    case 'calf':
      return 'press_lower';
    default:
      return null;
  }
}

// ── THE CLASSIFIER ──────────────────────────────────────────────────────────────────────────────
//
// ⛔ ORDER IS THE WHOLE ALGORITHM, and it is taken from how HE resolves his own overlaps. A pec deck
// is both a machine and single-joint, and he files it under FOCUSED, not BRACED — so single-joint is
// tested BEFORE external bracing. A machine chest press is a machine and multi-joint, so it lands in
// BRACED. Reversing those two tests moves half his focused list into braced.

/** Transports the load, or picks it up and puts it down (p226). */
const CARRY_RE = /\b(carry|carries|farmer|farmers|yoke|sled|drag|tire flip|suitcase|walk|walks)\b/;

/**
 * ⚠️ THE EXCLUSION'S REAL SUBJECT IS THE BAND WALK, not the walking lunge — checked rather than
 * assumed. `\bwalk\b` does not match "walking lunge" at all, so the lunge clause never fired; what
 * DOES match is `lateral band walk`, a banded hip-abduction drill that transports nothing. The
 * lunge clause is kept because a "walk lunge" spelling would reach it, and it costs nothing.
 */
const CARRY_EXCLUDE_RE = /\blunge|band walk|lateral walk\b/;

/**
 * Single-joint emphasis (pp222-223). ⚠️ `armIsolation` on the config answers the arm half of this
 * already and is READ rather than re-derived — it is the existing accessor for exactly this question
 * one axis over. The name test covers the leg and shoulder half, which no existing flag answers.
 */
const SINGLE_JOINT_RE =
  /\b(raise|raises|extension|extensions|curl|curls|fly|flye|flyes|flies|pushdown|pressdown|kickback|kickbacks|pec deck|adduction|abduction|pullover|pullovers|scaption|crossover)\b/;

/**
 * ⛔ THE SINGLE-JOINT TEST'S EXCLUSIONS, EACH FOR A NAMED REASON — a bare regex over "extension" and
 * "raise" swallows four movements that are hinges, and his own lists put every one of them under a
 * lower-body heading rather than under FOCUSED.
 *
 *   back extension / hyperextension  — his BRACED HINGE LOWER list, by name
 *   glute-ham raise                  — the same list's GHD entry; it is a two-joint posterior chain lift
 *   hip thrust                       — a hinge; his FOCUSED entry is specifically the MACHINE version
 *   knee raise / leg raise (hanging) — trunk flexion; his CORE list, by name
 */
const SINGLE_JOINT_EXCLUDE_RE =
  /\b(back extension|hyperextension|hyper|glute ham|glute-ham|hip thrust|knee raise|knee raises|leg raise|leg raises|hip extension)\b/;

/**
 * ⛔ AND THE SECOND SET OF EXCLUSIONS, WHICH THE `armIsolation` FLAG MAKES NECESSARY. That flag
 * answers *"is this direct arm work?"* — and it is TRUE for a close-grip bench press and a diamond
 * push-up, correctly, because both are triceps movements. **Neither is single-joint.** Viada files
 * close-grip bench under SECONDARY PUSH UPPER by name.
 *
 * ⚠️ This is the `armIsolation` header's own warning arriving: *"same data, two questions."* The arm
 * flag is right about arms and silent about joint count, so joint count is asked separately here.
 */
const COMPOUND_DESPITE_ARM_RE = /\b(bench press|push up|push-up|pushup|dip|dips|row|pull up|chin up)\b/;

/** More externally braced (pp221-222): a machine, a Smith rack, a cable stack, a sled-guided path. */
const BRACED_RE =
  /\b(machine|smith|hack squat|leg press|lever|pulldown|pull down|cable|assisted|pec deck|chest supported|chest-supported|ghd|back extension|hyperextension|hyper|glute ham|glute-ham)\b/;

/**
 * ⛔ DOES THE NAME READ AS MACHINE-BRACED — the same axis {@link BRACED_RE} already owns, asked a
 * different question.
 *
 * `viadaCategoryOf` cannot answer this one. Its order is deliberate — single-joint is tested BEFORE
 * bracing so a pec deck files under FOCUSED — so a `lat pulldown` comes back `focused` and a
 * `leg extension` comes back `focused`, and neither category tells a caller whether the movement
 * needs a machine to exist. That is the question the equipment gate has, and it is asked here.
 *
 * ⚠️ IT IS A NAME TEST AND IT IS DELIBERATELY COARSE. It exists to stop an UNTAGGED movement being
 * handed to an athlete who declared a home gym — `leg press`, `hack squat`, `chest supported row`,
 * `GHD back extension`. A movement with a real {@link ASSISTANCE_GEAR} tag never reaches it: a tag
 * is a better answer than a regex, and `canPerform` reads it.
 *
 * ⚠️ NO NEW GEAR KEY. The stage-2 notes asked for a `machine` key in the equipment vocabulary; this
 * is not it, and it does not pretend to be. It is a local reading of a name, in the one place that
 * needs it, so the vocabulary is not grown for a single caller.
 */
export function readsAsMachineBraced(exerciseName: string): boolean {
  const key = foldExerciseName(String(exerciseName ?? ''));
  return BRACED_RE.test(key) && !MACHINE_BRACED_EXCLUDE_RE.test(key);
}

/**
 * ⛔ A MOVEMENT THAT NAMES ITS OWN IMPLEMENT IS NOT A MACHINE, and without this the guard ejects two
 * movements that need nothing but a band.
 *
 * `band pull down` matches `BRACED_RE` on *"pull down"* and `band assisted pull up` matches it on
 * *"assisted"* — both correctly, for the classifier's purpose: they ARE externally braced in Viada's
 * sense. Neither is a machine, and neither is untagged by accident: `band pull down` is a real
 * `EXERCISE_CONFIG` entry with `displayFormat: 'band'`, and `band assisted pull up`'s own config note
 * says the band is ASSISTANCE, not load. Ejecting them takes two movements away from a bands-owning
 * athlete for having the word "band" in the name — the false exclusion the gate exists to avoid.
 *
 * ⚠️ IT DOES NOT LOOSEN THE CATEGORY. `viadaCategoryOf` still calls both `braced`; this exclusion is
 * read only by {@link readsAsMachineBraced}, which asks the equipment question and nothing else.
 */
const MACHINE_BRACED_EXCLUDE_RE = /\bband\b/;

/**
 * ⛔ CONTEST LIFT — the PRIMARY test, and it is derived from OUR data rather than from his list.
 *
 * His definition has two halves: *compound, barbell or bar, cardinal plane* AND *contest- or
 * assessment-specific*. The app already records which movements are the assessment lifts: they are
 * the ones a 1RM is held for (`primaryRef`) which load at their own reference — `ratio === 1`. That
 * is `back squat`, `deadlift` and its bar variants, `bench press`, the overhead presses. Everything
 * else that references a primary loads at some fraction of it, which is precisely Viada's
 * "noncontested" secondary.
 *
 * ⚠️ TWO NAMED ADDITIONS, BOTH COMPETITION LIFTS THAT OUR RATIOS PRICE BELOW 1.0 BECAUSE THEY ARE
 * HARDER, NOT BECAUSE THEY ARE ACCESSORIES: the front squat (0.85 of a back squat) and the pull-up.
 * Both are contest/assessment movements — the front squat is a competition lift in weightlifting and
 * an assessment lift here, and the pull-up has a tested capacity field of its own
 * (`performance_numbers.pullupMaxReps`). Leaving them out would file a pull-up as "secondary pull".
 */
const PRIMARY_NAMED_RE = /\b(front squat|pull up|pull-up|pullup|chin up|chin-up|chinup|box squat)\b/;

/** Anything the app itself treats as bar work. Used only to keep bodyweight out of PRIMARY. */
function isBarMovement(name: string): boolean {
  const routes = gearRoutesFor(name);
  return routes.some((r) => r.includes('barbell'));
}

/**
 * ⛔ WHICH OF VIADA'S CATEGORIES THIS MOVEMENT IS IN.
 *
 * Returns `null` when the movement is not in the app's catalogue at all — the caller must not treat
 * an unknown name as a secondary by default, because that is how a movement with no prescription
 * reaches an athlete.
 */
export function viadaCategoryOf(exerciseName: string): ViadaCategory | null {
  const raw = String(exerciseName ?? '').trim();
  if (!raw) return null;
  const key = foldExerciseName(raw);
  const cfg = getExerciseConfig(raw);
  if (!cfg) return null;

  // 1. Transported load. His own category, and nothing else can claim it.
  if (CARRY_RE.test(key) && !CARRY_EXCLUDE_RE.test(key)) return 'carry';

  /**
   * ⛔ PLYOMETRICS ARE NOT IN THE LIFTING KEY, and neither is anything the app cannot give a pattern.
   *
   * p227 is its own section with its own rules — drills done separately, ample rest, stop when the
   * movement is optimised for the day, and "fatigue, poor form and imprecise movements are absolute
   * no-no's". None of that is a set-and-rep prescription, and running a box jump through the ME/DE/
   * SKILL/HYP table would produce one. The All Rounder's day 3 is a *plyo warm-up*, not a lifting
   * slot, and the composer owns it.
   *
   * ⚠️ The pattern-less remainder — dead hangs, wall sits, burpees — has no place in a grid indexed
   * by pattern either. Excluding them is what stops them being offered as "secondary, no pattern".
   */
  if (cfg.pattern === 'plyometric') return null;
  if (cfg.pattern == null) return null;

  // 2. Trunk. `core` is already the app's own pattern value for exactly this.
  if (cfg.pattern === 'core') return 'core';

  // 3. Single-joint BEFORE bracing — his pec deck sits in FOCUSED, not BRACED.
  const singleJoint = (cfg.armIsolation === true || cfg.pattern === 'calf' || SINGLE_JOINT_RE.test(key))
    && !SINGLE_JOINT_EXCLUDE_RE.test(key)
    && !COMPOUND_DESPITE_ARM_RE.test(key);
  if (singleJoint) return 'focused';

  // 4. Externally braced.
  if (BRACED_RE.test(key)) return 'braced';

  // 5. Contest / assessment lift on a bar.
  /**
   * ⚠️ NO DUMBBELL EXCLUSION HERE, AND THAT IS MEASURED RATHER THAN ASSUMED. A guard reading
   * `!/db|dumbbell|kettlebell|band|goblet/` stood here to keep his "dumbbell variants" out of
   * PRIMARY. Mutation-testing removed it and nothing moved: **no movement in the catalogue has
   * `ratio === 1` and a `primaryRef` and a dumbbell name**, because a dumbbell variant is priced at
   * a fraction of the lift it references, which is exactly what makes it secondary. The guard had no
   * subject, no test could reach it, and an unread branch is the disease this codebase keeps
   * deleting — so it is deleted rather than kept as decoration.
   */
  const contest = (cfg.ratio === 1 && cfg.primaryRef != null) || PRIMARY_NAMED_RE.test(key);
  if (contest && (isBarMovement(raw) || cfg.primaryRef != null || PRIMARY_NAMED_RE.test(key))) {
    return 'primary';
  }

  // 6. Everything else compound and free — his secondary.
  return 'secondary';
}

/** His four patterns, for a movement, via the app's own nine. */
export function viadaPatternOf(exerciseName: string): ViadaPattern | null {
  const cfg = getExerciseConfig(String(exerciseName ?? ''));
  return viadaPatternOfMovementPattern(cfg?.pattern ?? null);
}

/**
 * ⛔ ASYMMETRICAL IS A MODIFIER, NOT A CATEGORY — and this function is the entire implementation of
 * that ruling. There is no sixth list anywhere in the movement key; a braced push done one limb at a
 * time is a *braced asymmetrical*, and a split squat is a *secondary asymmetrical*.
 *
 * The app already records it: `ExerciseConfig.isUnilateral`. Nothing new is derived.
 */
export function isAsymmetrical(exerciseName: string): boolean {
  return getExerciseConfig(String(exerciseName ?? ''))?.isUnilateral === true;
}

// ── THE CATALOGUE, INDEXED ──────────────────────────────────────────────────────────────────────

export type GridMovement = {
  /** ⛔ THE STORED NAME. It resolves EXACTLY in `EXERCISE_CONFIG` — asserted by the gate, because a
   *  name that only fuzzy-matches silently borrows another movement's ratio (D-322). */
  name: string;
  category: ViadaCategory;
  pattern: ViadaPattern | null;
  asymmetrical: boolean;
};

/**
 * ⚠️ PLURALS ARE COLLAPSED, AND ONLY PLURALS. `EXERCISE_CONFIG` holds "lateral raise" and "lateral
 * raises" as separate keys (316 keys, 316 distinct folds — `foldExerciseName` does not collapse
 * them). Offering both as two choices is noise. The singular wins, because it is the form the
 * catalogue's canonical entries use.
 */
function dedupeKey(name: string): string {
  return foldExerciseName(name).replace(/(\w)s\b/g, '$1').replace(/\s+/g, ' ').trim();
}

/**
 * ⛔ IN THE LIBRARY, NEVER PRESCRIBED (Michael, 2026-08-26).
 *
 * Each of these needs kit `GearKey` cannot express — a GHD, a roman chair, a captain's chair, a
 * sled, a landmine, a sandbag, a ruck, gymnastic rings. Slice 7's rule is *"gate only on gear that
 * is BOTH required AND commonly declarable"*, and none of them clears the second half: an itemized
 * picker asking about a glute-ham developer is the exact trade that ruling reversed, after drawing
 * Michael's *"I wouldn't know what that is."*
 *
 * ⛔ SO THE RULE IS CARRIED THROUGH RATHER THAN BENT: not commonly declarable means not gateable
 * means never prescribed. Leaving them in the pool untagged was the 2026-08-26 defect — measured on
 * a declared home gym, every one of them reached an athlete who had declared none of its kit.
 *
 * ⚠️ THIS DROPS THEM FROM THE ENGINE'S POOL ONLY. `EXERCISE_CONFIG` still holds them, the exercise
 * library still lists them, and an athlete who CHOOSES a sled push can still log one — that is their
 * call to make and it always was. The engine simply never makes it for them.
 *
 * ⚠️ NOT THE SAME LIST AS THE UNTAGGED ONE. `trx fallout`, `stir the pot` and `stability ball
 * rollout` were on it until the same ruling gave suspension trainers and stability balls their own
 * chips — those pass "commonly declarable", so they are tagged and offered rather than dropped.
 */
export const PRESCRIPTION_EXCLUDED: readonly string[] = [
  'backpack carry',
  'captain s chair knee raise',
  "captain's chair knee raise",
  'ghd sit up',
  'landmine twist',
  'ring dips',
  'roman chair sit up',
  'sandbag lunge',
  'sled pull',
  'sled push',
];

/**
 * ⛔ MATCHED ON THE DEDUPE STEM, NOT THE FOLD, and the difference showed up immediately. Naming
 * `ring dips` alone dropped the plural and handed the dedupe slot to `ring dip` — the catalogue's
 * other spelling of the same movement — which then sailed back into the pool untagged. Every
 * spelling of a dropped movement has to go with it; see {@link dedupeKey}, the same collapse
 * `allGridMovements` already uses to pick between twins.
 */
const EXCLUDED_STEMS = new Set(PRESCRIPTION_EXCLUDED.map((n) => dedupeKey(n)));

/** Is this movement barred from anything the engine PRESCRIBES? See {@link PRESCRIPTION_EXCLUDED}. */
export function isPrescribable(exerciseName: string): boolean {
  return !EXCLUDED_STEMS.has(dedupeKey(String(exerciseName ?? '')));
}

let INDEX: GridMovement[] | null = null;

/** Every catalogued movement, classified. Built once, lazily; the catalogue is a module constant. */
export function allGridMovements(): GridMovement[] {
  if (INDEX) return INDEX;
  const seen = new Set<string>();
  const out: GridMovement[] = [];
  for (const name of Object.keys(EXERCISE_CONFIG)) {
    const dk = dedupeKey(name);
    if (seen.has(dk)) continue;
    const category = viadaCategoryOf(name);
    if (!category) continue;
    // ⛔ DROPPED BEFORE `seen` IS MARKED, deliberately. Marking first would let an excluded spelling
    // consume the dedupe slot and take a legitimate twin down with it.
    if (!isPrescribable(name)) continue;
    seen.add(dk);
    out.push({
      name,
      category,
      pattern: viadaPatternOf(name),
      asymmetrical: isAsymmetrical(name),
    });
  }
  INDEX = out;
  return out;
}

/**
 * ⛔⛔ A MOVEMENT MAY SIT IN TWO OF HIS CATEGORIES, BECAUSE HIS OWN KEY DOES THAT (Michael's ruling,
 * 2026-08-29: *"I would just put them in both and don't complicate it, the only gates that matter are
 * equipment gates"*).
 *
 * ⛔ THE CASE, AND IT IS THE ONLY ONE IN THE KEY: **calf raises are printed in two categories.**
 *   · p220, SECONDARY press lower — *"freestanding barbell calf raises"*
 *   · p223, FOCUSED push lower / quads — *"seated calf raises"*
 *
 * ⚠️ `viadaCategoryOf` CANNOT EXPRESS THIS AND IS NOT ASKED TO. It answers "what IS this movement"
 * with one value, by rule (single-joint → focused), and every other caller depends on that single
 * answer. This table answers a different question — *"which cells may OFFER it"* — and it is
 * additive only: nothing is removed from the category the classifier gives it. Same data, two
 * questions, two accessors, which is the shape `CLAUDE.md` names.
 *
 * ⚠️ IT IS NOT A LICENCE TO CROSS-FILE ANYTHING. A movement belongs here only when HE prints it in
 * two lists. Everything else is the classifier's business.
 */
const ALSO_OFFERED_IN: { match: RegExp; categories: ViadaCategory[] }[] = [
  // ⛔ Every calf variant, both ways. The rule-based classifier files them all `focused` (single
  // joint); p220 puts the barbell one in `secondary`. Rather than adjudicate per variant — which is
  // the complication the ruling refuses — both cells offer all of them and the EQUIPMENT GATE
  // decides what an athlete actually sees: the barbell one needs a barbell, the seated one a station.
  { match: /\bcalf\b|\bsoleus\b/i, categories: ['secondary', 'focused'] },
  /**
   * ⚠️ THE RAISE CROSSOVER WAS BUILT AND BACKED OUT, 2026-08-29 — recorded so the next attempt starts
   * from the finding rather than from the idea.
   *
   * ⛔ MICHAEL ASKED FOR IT and the page supports it: p223 prints **hanging leg raises** under CORE
   * and **weighted knee raises (hip flexors)** under FOCUSED PUSH LOWER/QUADS — the same family,
   * filed twice on one page. `{ match: /(leg|knee)\s+raise/i, categories: ['core', 'focused'] }`.
   *
   * ⛔⛔ WHAT STOPPED IT: a weighted knee raise's PRIME MOVER is `core`. Offering it in the leg cell
   * makes it the default there for a home athlete, which satisfies the week's core floor — and the
   * floor is how an explicitly chosen core movement reaches the week, so the athlete's own pick is
   * then silently dropped. **Two of his own filings collide through the muscle map, not through the
   * category map.**
   *
   * ⛔ SO IT IS THE SAME PIECE OF WORK AS THE OPT-IN CORE ROW: an added row must not depend on the
   * floor being hungry. Fix that first and this crossover lands with it.
   */
];

/**
 * ⚠️ CUTTING THE CORE CELL TO HIS FIVE WAS BUILT AND BACKED OUT, 2026-08-29 — recorded so the next
 * attempt starts from the finding.
 *
 * ⛔ THE CASE FOR IT IS REAL: the cell offers 43 movements where p223 names five, and four of the 43
 * are not movements at all (`core work`, `core circuit`, and `core work (5 min - your choice)` twice
 * with different punctuation). A picker was offering "core work 5 min your choice" as an exercise.
 *
 * ⛔⛔ WHAT STOPPED IT: `fillMuscleFloor` reaches core THROUGH THIS CELL. Closing it to five
 * movements left the floor unable to find a core movement a given athlete could perform, and a week
 * came out with no core work at all.
 *
 * ⛔ AND RULE 4 (p142) SAYS THE LIST IS NOT CLOSED ANYWAY: *"Note that this doesn't necessarily mean
 * crunches. It could be referring to dynamic throws, rotational work with med balls or the landmine,
 * and more."* So p223 is examples. **The defensible cut is the four placeholder non-movements, not a
 * cut to five.**
 */

/** Movements in one cell of the grid. Unfiltered by equipment — that is the grid's job. */
export function movementsIn(category: ViadaCategory, pattern: ViadaPattern | null): GridMovement[] {
  return allGridMovements()
    .filter((m) => {
      if (pattern != null && m.pattern !== pattern) return false;
      if (m.category === category) return true;
      // ⛔ THE SECOND HOME, IF HE GAVE IT ONE.
      return ALSO_OFFERED_IN.some((r) => r.categories.includes(category) && r.match.test(m.name));
    })
    // ⚠️ The cell reports the category it was ASKED for, so a caller reading `m.category` back off a
    // cell's own list never sees a movement claiming to belong somewhere it was not offered from.
    .map((m) => (m.category === category ? m : { ...m, category }));
}

/**
 * ⛔ IS THIS MOVEMENT TAGGED FOR EQUIPMENT AT ALL — and why the grid has to ask.
 *
 * `gearRoutesFor` returns ALWAYS for an untagged movement and prints a warning saying so: *"treated
 * as needing nothing. Add it in src/lib/strength-gear.ts before anything gates on equipment."* That
 * default is RIGHT for its own consumers, who read a curated 28-movement assistance menu where
 * everything is tagged — offer rather than hide.
 *
 * ⛔ IT IS WRONG OVER THE FULL 316-MOVEMENT CATALOGUE, and this grid is the first thing to read that
 * catalogue. Measured 2026-08-22: ~180 of the movements the grid classifies carry no tag, including
 * `leg press`, `leg extension`, `chest fly` and `back extension`. Under the ALWAYS default a
 * bodyweight-only athlete is handed a leg press, which is exactly the false offer the gate exists to
 * prevent.
 *
 * ⚠️ SO THE GRID TREATS UNTAGGED AS UNKNOWN, NOT AS FREE — but only for an athlete who HAS declared
 * equipment. An athlete who declared nothing is in the §0h case ("we have not asked"), and there
 * everything is offered exactly as before.
 *
 * ⚠️ THIS IS A LOCAL READING, NOT A CHANGE TO THE GATE. `strength-gear.ts` is untouched; its default
 * still serves its own callers. The structural fix — tags for the wider catalogue, and a `machine`
 * gear key, which the vocabulary currently has no way to express — is written up in the stage notes.
 */
export function isGearTagged(exerciseName: string): boolean {
  return Object.prototype.hasOwnProperty.call(
    ASSISTANCE_GEAR,
    foldExerciseName(String(exerciseName ?? '')),
  );
}

/** Re-exported so consumers gate through the ONE owner of "can this athlete do this movement". */
export { canPerform, equipmentFitRank };

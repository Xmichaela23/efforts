// Strength exercise ROLE classifier (D-208).
//
// Role is a deterministic function of the exercise NAME, so we classify at read-time from a
// curated table rather than persisting a `role` field on every emitted exercise (that would be
// ~425 edit sites across the protocol files; this is one table). The table is built from the
// protocols' KNOWN prescription vocabulary — it is NOT free-text guessing, so it has Option-1
// correctness (declared roles) at the heuristic's blast radius.
//
// WHY ROLE EXISTS: the execution score weights exercise-completion. A skipped prehab/postural
// accessory should ding LESS than a skipped main lift — see ROLE_WEIGHT + D-208.
//
// TRIPWIRE: a name that isn't in the table is the one failure mode (the table drifting out of
// sync with the protocols). On a miss we log LOUDLY and default to 'primary' (full weight) — so
// an unmapped exercise scores exactly as it does today (no silent discount, no free pass), and
// the warning tells us to add it. Never make the default quiet.

export type StrengthRole = 'primary' | 'secondary' | 'accessory';

// D-208: accessory = 0.5 (not 0.0, not 1.0). For a triathlete's strength block, prehab/postural
// accessories are durability insurance, not the primary adaptation driver — a skip is a
// proportionate nudge, not equivalence to dropping a main lift, nor a free pass. 'secondary'
// weights the same as 'primary' today; it's kept as a distinct tier for future granularity and
// for display/microcopy, not because it changes the score.
export const ROLE_WEIGHT: Record<StrengthRole, number> = {
  primary: 1.0,
  secondary: 1.0,
  accessory: 0.5,
};

// Canonicalize an emitted exercise name to a table key: lowercase, strip parenthetical variants
// ("(Light)", "(3-sec descent)"), take the first option of an "X or Y" name, reduce punctuation/
// hyphens/slashes to spaces ("Y/T/W" → "y t w"), and depluralize words (keeping "press"/"ss").
function canonical(name: string): string {
  const base = String(name || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')      // drop parenthetical variants
    .split(/\bor\b/)[0]              // "goblet squat or bodyweight squat" → first
    .replace(/[^a-z0-9]+/g, ' ')     // hyphens/slashes/punct → space
    .trim();
  // Depluralize the LAST word only — the plural marker always lands there ("Soleus Raises",
  // "Barbell Rows", "Push ups"). Depluralizing every word wrongly stripped singular words that
  // end in 's' (soleus→soleu, tibialis→tibiali). "ss" guard keeps "press"; len>2 so "ups"→"up".
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length) {
    const last = parts[parts.length - 1];
    if (last.length > 2 && last.endsWith('s') && !last.endsWith('ss')) parts[parts.length - 1] = last.slice(0, -1);
  }
  return parts.join(' ');
}

// Curated over the actual emitted vocabulary (grep of shared/strength-system/protocols/*.ts).
// Only ACCESSORY changes the score; primary/secondary both weight 1.0. When unsure between
// secondary and accessory, choose SECONDARY (full weight) — never accidentally discount work.
const ROLE_TABLE: Record<string, StrengthRole> = {
  // ── PRIMARY: heavy compound drivers, the adaptation target ──────────────────────────────
  'back squat': 'primary',
  'barbell back squat': 'primary',
  'goblet squat': 'primary',
  'bench press': 'primary',
  'db bench press': 'primary',
  'db floor press': 'primary',
  'conventional deadlift': 'primary',
  'trap bar deadlift': 'primary',
  'romanian deadlift': 'primary',
  'db romanian deadlift': 'primary',
  'overhead press': 'primary',
  'standing barbell overhead press': 'primary',
  'push press': 'primary',
  'db push press': 'primary',
  'db shoulder press': 'primary',
  'shoulder press': 'primary',
  'barbell row': 'primary',
  'lat pull down': 'primary',
  'pull up': 'primary',
  'hip thrust': 'primary',

  // ── SECONDARY: supporting compounds / unilateral / plyo / assistance (full weight, 1.0) ──
  'bulgarian split squat': 'secondary',
  'reverse lunge': 'secondary',
  'lateral lunge': 'secondary',
  'walking lunge': 'secondary',
  'step up': 'secondary',
  'box step up': 'secondary',
  'explosive step up': 'secondary',
  'single leg rdl': 'secondary',
  'bodyweight squat': 'secondary',
  'box jump': 'secondary',
  'broad jump': 'secondary',
  'jump lunge': 'secondary',
  'jump squat': 'secondary',
  'squat jump': 'secondary',
  'skater hop': 'secondary',
  'kb swing': 'secondary',
  'kb db swing': 'secondary',
  'inverted row': 'secondary',
  'inverted ring row': 'secondary',
  'cable row': 'secondary',
  'row': 'secondary',
  'resistance band row': 'secondary',
  'light db row': 'secondary',
  'band assisted pull up': 'secondary',
  'band overhead press': 'secondary',
  'band pull down': 'secondary',
  'explosive lat pull down': 'secondary',
  'push up': 'secondary',
  'pike push up': 'secondary',
  'nordic hamstring curl': 'secondary',

  // ── ACCESSORY: prehab / postural / activation / core / isolation (durability insurance) ──
  'band face pull': 'accessory',
  'cable face pull': 'accessory',
  'face pull': 'accessory',
  'band pull apart': 'accessory',
  'band lateral raise': 'accessory',
  'lateral raise': 'accessory',
  'band lateral walk': 'accessory',
  'lateral band walk': 'accessory',
  'clamshell': 'accessory',
  'glute bridge': 'accessory',
  'single leg glute bridge': 'accessory',
  // Accessory-bias add-on (glute | hyrox) — strength-primary. Keys are canonical() space-forms (hyphens
  // are stripped to spaces, so "Single Leg Squat" → "single leg squat"). Qualitative-loaded, accessory role.
  // NOTE: bare 'hip thrust' already maps to 'primary' above (line ~75) — looks inconsistent with S-005
  // (hip thrust = required ACCESSORY), but left untouched to avoid changing other protocols' scoring.
  // The glute bias uses the precise 'barbell hip thrust' → accessory. FLAGGED for review.
  'barbell hip thrust': 'accessory',
  'single leg squat': 'accessory',
  'back extension': 'accessory',
  'sled push': 'accessory',
  'sled pull': 'accessory',
  'sandbag lunge': 'accessory',
  'farmers carry': 'accessory',
  // Equipment-fallback names (substituteExerciseForEquipment) for the bias stations — accessory role.
  'dumbbell walking lunge': 'accessory',
  'barbell walking lunge': 'accessory',
  // (bare 'walking lunge' already mapped to 'secondary' above — bodyweight fallback inherits that.)
  'dumbbell row': 'accessory',
  'bent over row': 'accessory',
  'band row': 'accessory',
  'backpack carry': 'accessory',
  'prone y t w raise': 'accessory',
  'external rotation': 'accessory',
  'bird dog': 'accessory',
  'dead bug': 'accessory',
  'pallof press': 'accessory',
  'plank hold': 'accessory',
  'plank with shoulder tap': 'accessory',
  'side plank': 'accessory',
  'side plank abduction': 'accessory',
  'copenhagen plank': 'accessory',
  'core circuit': 'accessory',
  'dead hang': 'accessory',
  'calf raise': 'accessory',
  'single leg calf raise': 'accessory',
  'weighted single leg calf raise': 'accessory',
  'wall angel': 'accessory',
  'soleus raise': 'accessory',
  'tibialis raise': 'accessory',
  'foot doming': 'accessory',
};

/**
 * Classify an exercise by name. Unknown names log LOUDLY and default to 'primary' (full weight =
 * today's behavior) — the tripwire for the table drifting out of sync with the protocols.
 */
export function roleForExercise(name: string): StrengthRole {
  const key = canonical(name);
  const role = ROLE_TABLE[key];
  if (!role) {
    console.warn(
      `[exercise-role] UNMAPPED strength exercise "${name}" (key "${key}") — defaulting to 'primary' (full weight). ` +
        `Add it to ROLE_TABLE in _shared/strength/exercise-role.ts so completion scoring stays correct.`,
    );
    return 'primary';
  }
  return role;
}

/**
 * ⛔ IS THIS ONE OF 5/3/1'S FOUR MAIN LIFTS? A NARROWER QUESTION THAN `roleForExercise`.
 *
 * `primary` answers "does skipping this cost full completion weight", and it is deliberately wide —
 * a goblet squat, an RDL, a trap-bar deadlift and a DB bench are all `primary`. That is right for
 * scoring and wrong for the bar-speed cue, which describes **the lift the block prescribes a
 * percentage of a training max for**: squat, bench, deadlift, press. Wendler's four.
 *
 * ⚠️ WHY THIS IS NOT `roleForExercise(x) === 'primary'`. `roleForExercise` DEFAULTS to `primary` on
 * an unmapped name (loudly, on purpose, so nothing is silently discounted). Gate a cue on it and
 * every exercise the table has never heard of inherits a 5/3/1 instruction — the failure mode is a
 * default, so it grows on its own as the library does.
 *
 * ⚠️ AND WHY IT IS NOT A CONTAINMENT TEST. "Jump Squat" contains "squat" and is not a squat here,
 * exactly as `canonicalize.ts` warns for 1RM purposes. Every entry below must be an explicit,
 * curated key — variants that genuinely ARE the main lift under another name (trap-bar deadlift as
 * the deadlift slot, push press as the press slot) are listed; everything else is out.
 *
 * ⚠️ A MISS RETURNS FALSE, which is the safe direction: an unmapped lift gets no cue rather than the
 * wrong one. The opposite default is what leaked the speed cue onto a box jump.
 */
const MAIN_531_LIFTS = new Set<string>([
  'back squat', 'barbell back squat', 'squat', 'front squat',
  'bench press', 'barbell bench press', 'close grip bench press',
  'deadlift', 'conventional deadlift', 'trap bar deadlift', 'sumo deadlift',
  'overhead press', 'standing barbell overhead press', 'press', 'military press', 'push press',
  'ohp',
]);
// ⛔ `ohp` JOINED THIS SET ON 2026-08-03, BECAUSE THE SERVER ALREADY PUT IT HERE.
// `canonicalize('ohp')` returns `overhead_press`, so the strength trend, the learned max and
// `per_lift` have been folding Michael's logged "ohp" sessions into the overhead press all along —
// while this set did not, so one session was a main lift to one reader and an unmapped accessory to
// the other. That is the "one movement, two vocabularies, two answers" defect this file exists to
// prevent. Found by reconciling against his REAL logs, not the library.
// ⚠️ CONSEQUENCE, STATED: sessions logged as "ohp" now get main-lift treatment — coaching language
// and an AMRAP/e1RM read — which is what the trend already gave them.
// ⚠️ AND THE COMMENT LIVES OUT HERE ON PURPOSE. `exercise-role.type.test.ts` reads this set by
// splitting the source on `MAIN_531_LIFTS` and regexing quoted strings out of it, so prose with
// apostrophes INSIDE the literal is parsed as though it were exercise names.

export function isMain531Lift(name: string): boolean {
  return MAIN_531_LIFTS.has(canonical(name));
}

export function weightForExercise(name: string): number {
  return ROLE_WEIGHT[roleForExercise(name)];
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// AXIS 2 — TYPE (what KIND of movement). SPEC-strength-language.md, Step 1.
//
// Role (above) answers "what job does this do in the block". Type answers "what can this movement
// SUPPORT" — can it carry weight, can it have a 1RM, may the app coach it, how is a set logged.
// Two questions, two axes, answered for every movement. Never one list.
//
// ⛔ NOTHING READS THIS YET. It was added on its own, ahead of any reader, deliberately: the spec's
// method is build the shared axis FIRST, migrate readers ONE AT A TIME, delete the six private
// duplicates LAST. Steps 2-6 are the migration. If you are here to wire a reader, that is Step 2+.
//
// ⚠️ THE EIGHT TYPES ARE CAPABILITY PROFILES, NOT ANATOMY. A row means "no load, no max, no
// coaching, logged as time" — not "this is anatomically a hold". That is why `core circuit` sits in
// `mobility`: its capability profile is exact (done-or-time, unloaded, uncoached) even though the
// label reads oddly. Michael ruled on that one: leave it, it is never shown to the athlete.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export type ExerciseType =
  | 'barbell_main'      // the four 5/3/1 lifts — percentages of a training max, AMRAP, coached
  | 'loaded_accessory'  // barbell / DB / cable accessory work — weight x reps, no max, no commands
  | 'bodyweight'        // push-up, pull-up, glute bridge — reps, and D-348 says the body IS load
  | 'plyo'              // box jump, bounding — reps only, no external load, never coached
  | 'isometric'         // plank, dead hang, wall sit — time
  | 'mobility'          // wall angel, foot doming — done or time
  | 'carry'             // farmers carry, sled push — loaded, but measured in distance or time
  | 'band';             // band pull-apart, band row — the band IS the load; priced by workload.ts

/**
 * What a type can support. Four capabilities, per the table in SPEC-strength-language.md.
 *
 * ⚠️ `load` IS THREE-VALUED, NOT A BOOLEAN, and the spec's own table is why — its weight column
 * reads yes / bodyweight / no. Collapsing `bodyweight` into `false` would contradict [D-348], which
 * made bodyweight count as load and shipped a backfill to prove it. A push-up is not weightless.
 */
export interface TypeCapability {
  /**
   * 'external' = an implement is loaded. 'bodyweight' = the body IS the load (D-348). 'none'.
   *
   * ⛔ 'band' MEANS "ASK `workload.ts`, DO NOT MULTIPLY POUNDS BY REPS." A band has no clean load —
   * manufacturers do not standardise colours or tensions, and the same "Medium" is a different
   * force at the top of a rep than the bottom. That problem is already SOLVED, once, in
   * `_shared/workload.ts::strengthSetVolume`, and this row exists to point at it rather than to
   * restate it. See the `band` entry in the capability table below for the whole contract.
   */
  load: 'external' | 'bodyweight' | 'none' | 'band';
  /** May an estimated 1RM be computed from this? Only true where a max is genuinely tested. */
  hasOneRepMax: boolean;
  /** May the app issue coaching LANGUAGE (direction, AMRAP target, bar speed) about this? */
  coached: boolean;
  /** The shape of one logged set. */
  loggedAs: 'weight_x_reps' | 'reps' | 'time' | 'done_or_time' | 'distance_or_time' | 'band_resistance_lb';
}

/**
 * ⛔ THE ONE TYPE TABLE. Eight rows. Adding a plyo or a mobility move is ONE ROW HERE plus a name —
 * the app then already knows how to render it, whether to score it, and whether to coach it. That
 * scalability is the requirement Michael set (more plyo + mobility are coming).
 *
 * ⛔ `coached` IS TRUE ON EXACTLY ONE ROW, and that is the whole point of [D-373]. A hard-feeling
 * Hip Thrust printed a red "back off weight" because the language layer never asked what kind of
 * movement it was. Strong and Hevy issue no commands on any row; the field's answer is numbers.
 *
 * ⛔ THE `band` ROW IS A POINTER, NOT A PRICING RULE, AND THAT IS THE ENTIRE DESIGN OF IT.
 * Band load is already fully built, argued and tested in `_shared/workload.ts` — three paths, none
 * of them re-derivable from a capability flag:
 *
 *   1. **ADD vs ASSIST is a property of the MOVEMENT, not the set.** `bandMeansAssistance(canonical)`
 *      (`_shared/canonicalize.ts`) is the authority, and its set is exactly {pullup, chinup, dip}.
 *      On a band pull-apart the band IS the load; on a chin-up the band CANCELS load. `resistance_level`
 *      is one deliberately-overloaded field with opposite meanings, and only the exercise says which.
 *   2. **ADD path** — `bandLb × reps` when the athlete typed a poundage, and `BAND_SET_VOLUME_TOKEN`
 *      (100, deliberately non-zero and deliberately too small to move a verdict) when they typed a
 *      word like "Heavy". Both encodings live in the same field on purpose; there is no migration.
 *   3. **ASSIST path** — `max(MIN_ASSISTED_EFFECTIVE_LB, bodyweight − bandLb) × reps` (D-351), and
 *      zero when no body weight was ever recorded, because there is nothing to subtract FROM.
 *
 * ⚠️ SO THIS ROW ONLY CARRIES THE ROUTING: `load: 'band'` means "that function decides", and
 * `loggedAs: 'band_resistance_lb'` means "the athlete records a resistance in pounds, and what it
 * MEANS depends on `bandMeansAssistance`". A reader that multiplies pounds by reps here has
 * reinvented rule 2 and silently lost rules 1 and 3.
 *
 * ⚠️ AND THE ASSIST MOVEMENTS ARE NOT IN THIS ROW. A pull-up, chin-up and dip are `bodyweight` —
 * the body is still what moved. `band` is the ADD case only. The fixtures pin that split against
 * `bandMeansAssistance` directly, so the two cannot drift apart.
 */
export const EXERCISE_TYPE_CAPABILITIES: Record<ExerciseType, TypeCapability> = {
  barbell_main:     { load: 'external',   hasOneRepMax: true,  coached: true,  loggedAs: 'weight_x_reps' },
  loaded_accessory: { load: 'external',   hasOneRepMax: false, coached: false, loggedAs: 'weight_x_reps' },
  bodyweight:       { load: 'bodyweight', hasOneRepMax: false, coached: false, loggedAs: 'reps' },
  plyo:             { load: 'none',       hasOneRepMax: false, coached: false, loggedAs: 'reps' },
  isometric:        { load: 'none',       hasOneRepMax: false, coached: false, loggedAs: 'time' },
  mobility:         { load: 'none',       hasOneRepMax: false, coached: false, loggedAs: 'done_or_time' },
  carry:            { load: 'external',   hasOneRepMax: false, coached: false, loggedAs: 'distance_or_time' },
  band:             { load: 'band',       hasOneRepMax: false, coached: false, loggedAs: 'band_resistance_lb' },
};

/**
 * Name → type, curated over the SAME vocabulary the rest of this file is built from: every key in
 * `ROLE_TABLE`, every key in `MAIN_531_LIFTS`, and every key in `exercise-config.ts` (140 distinct
 * canonical names). The fixtures assert that coverage, so a protocol adding a name fails a test
 * rather than falling quietly onto the default.
 *
 * ⛔ THE FOUR MAIN LIFTS ARE NOT IN THIS TABLE. `typeForExercise` reads `MAIN_531_LIFTS` directly,
 * so `barbell_main` and `isMain531Lift` cannot disagree — one set, two readers. Listing them twice
 * is how a second vocabulary starts, which is the disease this whole spec exists to cure.
 *
 * ⚠️ A NAME IS TYPED `band` BY WHAT THE BAND DOES, NOT BY THE WORD "BAND" IN IT. "Band Assisted
 * Pull Up" is `bodyweight`: the band is help, the body is what moved. The discriminator is
 * `bandMeansAssistance`, and a fixture asserts every `band` row is one it answers false for.
 */
const TYPE_TABLE: Record<string, ExerciseType> = {
  // ── LOADED ACCESSORY: an implement, no tested max, no commands ───────────────────────────────
  'barbell row': 'loaded_accessory',
  'bent over row': 'loaded_accessory',
  'chest supported row': 'loaded_accessory',
  'cable row': 'loaded_accessory',
  'dumbbell row': 'loaded_accessory',
  // ⚠️ `canonicalize()` (the SERVER's keying, `_shared/canonicalize.ts`) emits `db_row` for both
  // "Dumbbell Row" and "Dumbbell Rows", and `per_lift.canonical_name` carries that form — not the
  // space form this table was first built from. Found by the synthetic-athlete harness, not by the
  // original coverage test, which only walked the raw display vocabulary.
  'db row': 'loaded_accessory',
  'light db row': 'loaded_accessory',
  'row': 'loaded_accessory',
  'lat pull down': 'loaded_accessory',
  'lat pulldown': 'loaded_accessory',
  'explosive lat pull down': 'loaded_accessory',
  'db bench press': 'loaded_accessory',
  'dumbbell bench press': 'loaded_accessory',
  'db floor press': 'loaded_accessory',
  'incline bench': 'loaded_accessory',
  'incline bench press': 'loaded_accessory',
  'dumbbell incline press': 'loaded_accessory',
  'chest fly': 'loaded_accessory',
  'dumbbell fly': 'loaded_accessory',
  // ⚠️ 'shoulder press' / 'db push press' are NOT the 5/3/1 press slot — a dumbbell press is not
  // pressed off a training max. `overhead press` and `push press` (bare) are, and they live in
  // MAIN_531_LIFTS. This is the same narrow-vs-wide split isMain531Lift's own docblock argues.
  'shoulder press': 'loaded_accessory',
  'db shoulder press': 'loaded_accessory',
  'dumbbell shoulder press': 'loaded_accessory',
  // ⚠️ ADDED 2026-08-03 with the config reconciliation. These three sat in the add-picker list with
  // no config entry and no type row — visible to the athlete, invisible to both tables. They earn a
  // type here because the coverage test below demands one for every config key, which is exactly the
  // drift guard working: adding the config forced the classification instead of letting it default.
  'dumbbell press': 'loaded_accessory',
  'kettlebell press': 'loaded_accessory',
  'single arm row': 'loaded_accessory',
  'db push press': 'loaded_accessory',
  'lateral raise': 'loaded_accessory',
  'dumbbell lateral raise': 'loaded_accessory',
  'front raise': 'loaded_accessory',
  'rear delt fly': 'loaded_accessory',
  'rear delt flye': 'loaded_accessory',
  'reverse fly': 'loaded_accessory',
  'reverse flye': 'loaded_accessory',
  'prone y t w raise': 'loaded_accessory',
  'ytw raise': 'loaded_accessory',
  'external rotation': 'loaded_accessory',
  'face pull': 'loaded_accessory',
  'cable face pull': 'loaded_accessory',
  'romanian deadlift': 'loaded_accessory',
  'db romanian deadlift': 'loaded_accessory',
  'rdl': 'loaded_accessory',
  'single leg rdl': 'loaded_accessory',
  'single leg romanian deadlift': 'loaded_accessory',
  'good morning': 'loaded_accessory',
  'hip thrust': 'loaded_accessory',
  'barbell hip thrust': 'loaded_accessory',
  // ⚠️ ADDED 2026-08-03 (second reconciliation, against the athlete's REAL plans and logs rather
  // than the library). Every one of these is a movement he has actually planned or logged that
  // neither table had heard of — `single leg hip thrust` was inheriting the BILATERAL hip thrust's
  // 0.9x deadlift prescription, and `db thruster` / `nordic curls` resolved to nothing at all.
  // ⚠️ ADDED 2026-08-03 (third pass) — the type rows the vocabulary guard's backlog demanded. Each
  // one is a movement that now carries a config entry, so the coverage test below requires it to
  // declare a type rather than fall to the default. The type follows the config: a `bodyweight`
  // displayFormat is `bodyweight`, an implement is `loaded_accessory`, a hold is `isometric`.
  // ⚠️ KEYS ARE THE DEPLURALIZED `canonical()` FORM — that function strips the trailing 's' and the
  // parentheticals, so "Flutter Kicks" arrives here as `flutter kick`.
  'chest flye': 'loaded_accessory',
  'dumbbell flye': 'loaded_accessory',
  'ring dip': 'bodyweight',
  'side plank with hip dip': 'isometric',
  'decline bench press': 'loaded_accessory',
  'pistol squat': 'bodyweight',
  'handstand push up': 'bodyweight',
  'kettlebell row': 'loaded_accessory',
  'glute bridge march': 'bodyweight',
  'lunge': 'loaded_accessory',
  'barbell curl': 'loaded_accessory',
  'dumbbell curl': 'loaded_accessory',
  'hammer curl': 'loaded_accessory',
  'cable curl': 'loaded_accessory',
  'tricep extension': 'loaded_accessory',
  'tricep pushdown': 'loaded_accessory',
  // Wendler's own plurals + the DB shorthands the catalog stores (2026-08-13).
  'triceps pushdown': 'loaded_accessory',
  'triceps extension': 'loaded_accessory',
  'db incline press': 'loaded_accessory',
  'plate raise': 'loaded_accessory',
  'db side bend': 'loaded_accessory',
  'dumbbell side bend': 'loaded_accessory',
  'bent over reverse flye': 'loaded_accessory',
  'bent over reverse flyes': 'loaded_accessory',
  'cable crossover': 'loaded_accessory',
  'cable crunch': 'loaded_accessory',
  'ab machine crunch': 'loaded_accessory',
  'cable woodchopper': 'loaded_accessory',
  'landmine twist': 'loaded_accessory',
  'kettlebell snatche': 'loaded_accessory',
  'turkish get up': 'loaded_accessory',
  'overhead carry': 'carry',
  'hip extension': 'bodyweight',
  'reverse hyperextension': 'bodyweight',
  'crunch': 'bodyweight',
  'reverse crunch': 'bodyweight',
  'cross body crunch': 'bodyweight',
  'bicycle crunch': 'bodyweight',
  'sit up': 'bodyweight',
  'ghd sit up': 'bodyweight',
  'roman chair sit up': 'bodyweight',
  'v up': 'bodyweight',
  'flutter kick': 'bodyweight',
  'scissor kick': 'bodyweight',
  'toe touche': 'bodyweight',
  'russian twist': 'bodyweight',
  'l sit': 'isometric',
  'superman hold': 'isometric',
  'stir the pot': 'isometric',
  'stability ball rollout': 'bodyweight',
  'ab wheel rollout': 'bodyweight',
  'trx fallout': 'bodyweight',
  'hanging knee raise': 'bodyweight',
  'toes to bar': 'bodyweight',
  'hanging windshield wiper': 'bodyweight',
  'captain s chair knee raise': 'bodyweight',
  'burpee': 'bodyweight',
  'mountain climber': 'bodyweight',
  // ⚠️ SERVER-KEYING FORMS. `canonicalize()` (the SERVER's normalizer, `_shared/canonicalize.ts`)
  // emits its own shapes — it strips parentheticals differently and collapses "Get ups" to `getup`.
  // These are the keys that reach `per_lift.canonical_name` and the State row, so the type axis has
  // to resolve them too, not only the display spellings.
  'core work 5 min your choice': 'mobility',
  'turkish getup': 'loaded_accessory',
  'ab rollout': 'bodyweight',
  'single leg hip thrust': 'loaded_accessory',
  'db thruster': 'loaded_accessory',
  'nordic curl': 'bodyweight',
  'tricep dip': 'bodyweight',
  'goblet squat': 'loaded_accessory',
  'bulgarian split squat': 'loaded_accessory',
  'walking lunge': 'loaded_accessory',
  'dumbbell walking lunge': 'loaded_accessory',
  'barbell walking lunge': 'loaded_accessory',
  'reverse lunge': 'loaded_accessory',
  'lateral lunge': 'loaded_accessory',
  'sandbag lunge': 'loaded_accessory',
  'step up': 'loaded_accessory',
  'box step up': 'loaded_accessory',
  'explosive step up': 'loaded_accessory',
  'leg press': 'loaded_accessory',
  'leg curl': 'loaded_accessory',
  'leg extension': 'loaded_accessory',
  'kb swing': 'loaded_accessory',
  'kb db swing': 'loaded_accessory',
  'db swing': 'loaded_accessory',
  'dumbbell swing': 'loaded_accessory',
  'kettlebell swing': 'loaded_accessory',
  'pallof press': 'loaded_accessory',
  'weighted single leg calf raise': 'loaded_accessory',
  // ⚠️ 'bench' and 'incline bench' are shorthand the plan emits; `isMain531Lift` does NOT recognise
  // bare 'bench', so it cannot be `barbell_main` here without breaking the one-set invariant below.
  // That mismatch is real and pre-existing — filed in the Step 1 review note, NOT fixed here,
  // because widening MAIN_531_LIFTS would change what D-373 coaches on a live screen.
  'bench': 'loaded_accessory',

  // ── BODYWEIGHT: the body is the load (D-348), logged as reps ─────────────────────────────────
  'push up': 'bodyweight',
  'pushup': 'bodyweight',
  'archer push up': 'bodyweight',
  'decline push up': 'bodyweight',
  'diamond push up': 'bodyweight',
  'pike push up': 'bodyweight',
  'pull up': 'bodyweight',
  'pullup': 'bodyweight',
  'chin up': 'bodyweight',
  // ⚠️ Same as `db row` below — `canonicalize()` emits `chinup`, which `canonical()` leaves as one
  // word, so the space form alone did not cover the key the State payload actually carries. A
  // chin-up typed as a loaded accessory is a silent capability error, not a cosmetic one.
  'chinup': 'bodyweight',
  'band assisted pull up': 'bodyweight',
  'inverted row': 'bodyweight',
  'inverted ring row': 'bodyweight',
  'dip': 'bodyweight',
  'air squat': 'bodyweight',
  'bodyweight squat': 'bodyweight',
  'single leg squat': 'bodyweight',
  'glute bridge': 'bodyweight',
  'single leg glute bridge': 'bodyweight',
  'back extension': 'bodyweight',
  'nordic hamstring curl': 'bodyweight',
  'hanging leg raise': 'bodyweight',
  'bird dog': 'bodyweight',
  'dead bug': 'bodyweight',
  'calf raise': 'bodyweight',
  'single leg calf raise': 'bodyweight',
  'soleus raise': 'bodyweight',
  'tibialis raise': 'bodyweight',

  // ── WENDLER FOREVER ASSISTANCE CATALOG + the equipment-substitution outputs (2026-08-13).
  // ⛔ THE DEFAULT WOULD HAVE BEEN 'loaded_accessory' — "counts as load, says nothing" — AND THAT IS
  // WRONG FOR EVERY BODYWEIGHT ENTRY BELOW. A glute-ham raise counting as external load is a silent
  // over-count in the logger and the language layer, and the coverage test is what caught it rather
  // than a screenshot months later.
  'glute ham raise': 'bodyweight',
  'reverse hyper': 'bodyweight',
  'weighted sit up': 'bodyweight',
  'bodyweight lunges': 'bodyweight',
  'bodyweight lunge': 'bodyweight',
  // The three the substitution emits when the athlete owns nothing — bodyweight by construction.
  // ⚠️ BOTH SPELLINGS, AND THE SECOND ONE IS THE SERVER'S. `canonicalize()` emits
  // `reverse_flyes_bodyweight` / `scaption_bodyweight_shoulder_raises` — underscores, parentheses
  // stripped — and those keys reach `per_lift.canonical_name` and the State row. The lookup folds
  // underscores to spaces, so the table needs the FOLDED form, not the underscored one.
  // ⚠️ FOLDED FORMS ONLY — the lookup strips parentheses before matching, so a key spelled
  // `reverse flyes (bodyweight)` here is unreachable and the name falls to the default anyway. Both
  // the athlete-facing name and `canonicalize()`'s `reverse_flyes_bodyweight` fold to these.
  'reverse flyes bodyweight': 'bodyweight',
  'scaption': 'bodyweight',
  'scaption bodyweight shoulder raise': 'bodyweight',
  'scaption bodyweight shoulder raises': 'bodyweight',

  // ── PLYO: reps only. No external load, no bar, no bar-speed cue — the intent is maximal every
  // rep by definition, so "keep every rep at the same speed" describes a different exercise.
  // (That was the live bug on Michael's Box Jump, 2026-08-01.) ─────────────────────────────────
  'box jump': 'plyo',
  'bench jump': 'plyo',
  'broad jump': 'plyo',
  'jump squat': 'plyo',
  'squat jump': 'plyo',
  'jump lunge': 'plyo',
  'skater hop': 'plyo',
  'bounding': 'plyo',

  // ── ISOMETRIC: held, logged as time ─────────────────────────────────────────────────────────
  'plank': 'isometric',
  'plank hold': 'isometric',
  'plank with shoulder tap': 'isometric',
  'side plank': 'isometric',
  'side plank abduction': 'isometric',
  'copenhagen plank': 'isometric',
  'dead hang': 'isometric',
  'wall sit': 'isometric',

  // ── MOBILITY: done, or done for time ────────────────────────────────────────────────────────
  'wall angel': 'mobility',
  'foot doming': 'mobility',
  // ⚠️ Containers, not holds — filed here for the capability profile, not the anatomy. See the
  // header note. The logger already treats both as duration (`isDurationLogged`, strength-logging-mode).
  'core circuit': 'mobility',
  'core work': 'mobility',

  // ── CARRY: loaded, but the measure is distance or time, never reps ───────────────────────────
  'farmers carry': 'carry',
  'farmer carry': 'carry',
  'farmer walk': 'carry',
  'suitcase carry': 'carry',
  'backpack carry': 'carry',
  'sled push': 'carry',
  'sled pull': 'carry',

  // ── BAND: the band IS the resistance. Priced by `strengthSetVolume`'s ADD path, never by
  // multiplying a poundage here. ⚠️ `band assisted pull up` is deliberately NOT in this list — it
  // sits in `bodyweight` above, because there the band is help. Same word, opposite meaning, and
  // `bandMeansAssistance` is the only thing that gets to say which. ────────────────────────────
  'band row': 'band',
  'resistance band row': 'band',
  'band pull down': 'band',
  'band overhead press': 'band',
  'band lateral raise': 'band',
  'band face pull': 'band',
  // ⛔ A BAND, NOT A MACHINE. `Band Leg Curls` is what `substituteExerciseForEquipment` writes when
  // the athlete has no leg-curl machine, and the config gives it `displayFormat: 'band'` for the same
  // reason. Typing it `loaded_accessory` (the silent default) would have multiplied a band by reps.
  'band leg curl': 'band',
  'band leg curls': 'band',
  'band pull apart': 'band',
  'band lateral walk': 'band',
  'lateral band walk': 'band',
  // ⚠️ No "band" in the name, and the app already treats it as one — `equipmentForExercise` routes
  // `clamshell` to its band branch (`strength-logging-mode.ts`). Typed to match what the app does
  // today rather than to what the word looks like; Step 3 has to reproduce that behavior.
  'clamshell': 'band',
};

/** Names already warned about, so the tripwire fires once per name instead of once per render. */
const warnedUnmappedTypes = new Set<string>();

/**
 * Raw lookup — returns `null` for a name the table has never heard of.
 *
 * Exported as the fixtures' seam: the coverage test asserts this is non-null for the whole known
 * vocabulary, which is what stops a new protocol name from landing silently on the default.
 * Callers should use `typeForExercise` / `capabilitiesForExercise` instead.
 */
export function lookupExerciseType(name: string): ExerciseType | null {
  const key = canonical(name);
  if (!key) return null;
  if (MAIN_531_LIFTS.has(key)) return 'barbell_main';
  return TYPE_TABLE[key] ?? null;
}

/**
 * Classify an exercise by TYPE.
 *
 * ⛔ AN UNMAPPED NAME DEFAULTS TO `loaded_accessory`, AND THE DIRECTION IS THE DECISION. It splits
 * exactly the way [D-373] split: the LOAD system should count a movement it does not recognise
 * (`load: 'external'`, so nothing is silently discounted), and the LANGUAGE system should say
 * nothing about it (`coached: false`, `hasOneRepMax: false`). Silence is the safe failure.
 *
 * ⚠️ THE OPPOSITE DEFAULT HAS BEEN THE BUG THREE TIMES — the equipment axis defaults to `barbell`,
 * and that default drew a loaded bar over a Farmers Carry (Q-180), then over a single-leg hip
 * thrust, then a plate calculator and a bar-speed cue over a Box Jump. A default that grants
 * capability grows on its own as the exercise library does. This one grants none.
 */
export function typeForExercise(name: string): ExerciseType {
  const type = lookupExerciseType(name);
  if (!type) {
    const key = canonical(name);
    if (!warnedUnmappedTypes.has(key)) {
      warnedUnmappedTypes.add(key);
      console.warn(
        `[exercise-role] UNMAPPED exercise TYPE "${name}" (key "${key}") — defaulting to ` +
          `'loaded_accessory' (counts as load, says nothing). Add it to TYPE_TABLE in ` +
          `src/lib/exercise-role.ts so the logger and the language layer read it correctly.`,
      );
    }
    return 'loaded_accessory';
  }
  return type;
}

/** The four capabilities for an exercise, resolved through its type. */
export function capabilitiesForExercise(name: string): TypeCapability {
  return EXERCISE_TYPE_CAPABILITIES[typeForExercise(name)];
}

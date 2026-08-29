/**
 * What the LOGGER asks for, per movement. SPEC-strength-language, Step 3.
 *
 * ⛔ TWO AXES LIVE IN HERE AND THEY ARE NOT THE SAME QUESTION. This is the whole finding of Step 3:
 * the logger's `getExerciseType` looked like one classifier and was actually two fused together.
 *
 *   1. **LOGGING MODE** — *what does this row ask the athlete for?* weight × reps, reps, time,
 *      distance, a band's resistance. This is `loggedAs` on the shared type table, and it is the
 *      axis Step 1 built. `loggingModeForExercise` reads it. **This is the real migration.**
 *
 *   2. **EQUIPMENT PRESENTATION** — *how is the weight input drawn?* a bar with a plate calculator,
 *      a per-hand dumbbell label, one implement on the hip, a resistance box. The type table does
 *      NOT carry this: `barbell_main`, a DB bench and a goblet squat are three different pieces of
 *      equipment and the table has one row for two of them (`loaded_accessory`). Measured over the
 *      189-name vocabulary: the legacy `goblet` and `dumbbell` buckets BOTH collapse into
 *      `loaded_accessory`, so the table cannot tell them apart.
 *
 * ⛔ SO EQUIPMENT IS NOT DERIVED FROM THE TABLE — IT IS TRANSCRIBED, BYTE-FOR-BYTE, and a fixture
 * pins it against the original over every known name. Deriving it would have deleted the per-hand
 * label and the single-implement treatment, which is exactly Q-180 (a Farmers Carry priced as one
 * loaded bar) and the single-leg hip thrust that got drawn a 45 lb bar. The file's own comments call
 * that default "the third time it has been the bug." It is not being re-created here.
 *
 * ⚠️ WHAT THIS MODULE IS FOR, THEN: it takes both axes OUT of the 6,000-line `StrengthLogger.tsx`
 * where nothing could test them, and puts them beside the table that owns axis 1. Axis 2 is now a
 * named, tested, single-source classifier instead of an inline regex ladder — and when it earns a
 * row on the shared table (Axis 3, not scoped yet), there is exactly one place to change.
 */
// ⚠️ THE `.ts` IS LOAD-BEARING (2026-08-29). This module is now reached from the edge functions'
// load path (`_shared/workload.ts` asks it whether a movement has a bar), and Deno will not resolve
// an extensionless specifier — the deploy fails at bundle time with "Maybe add a '.ts' extension".
// Vite resolves it either way, and `assistance-catalog.ts` already imports this way.
import { capabilitiesForExercise, lookupExerciseType, type TypeCapability } from './exercise-role.ts';

/** The question a row asks. Identical to the type table's `loggedAs` — named for the caller. */
export type LoggingMode = TypeCapability['loggedAs'];

/**
 * What does this movement's row ask for? Straight off the shared type table.
 *
 * ⚠️ THIS CHANGES FIVE MOVEMENTS, AND ALL FIVE ARE FIXES. The regex it replaces
 * (`isDurationBasedExercise`, matching `plank|hold|carry|farmer|…`) missed **sled push**, **sled
 * pull**, **dead hang**, **wall angel** and **foot doming** — so a sled push asked for weight × reps
 * and a dead hang asked for reps. Everything else in the 189-name vocabulary is unchanged. See the
 * fixtures, which assert both the agreement and this exact list of differences.
 */
export function loggingModeForExercise(name: string): LoggingMode {
  return capabilitiesForExercise(name).loggedAs;
}

/**
 * Is this movement logged against the clock (or a distance) rather than in reps?
 *
 * Replaces `isDurationBasedExercise`. ⚠️ A CARRY IS IN HERE: it is measured in distance OR time,
 * never reps, and the legacy regex agreed for "farmers carry" and disagreed for "sled push" only
 * because one has the word "carry" in it.
 */
export function isDurationLogged(name: string): boolean {
  const mode = loggingModeForExercise(name);
  return mode === 'time' || mode === 'done_or_time' || mode === 'distance_or_time';
}

/**
 * ⛔ IS THE BODY THE LOAD? THE LOGGER'S FIFTH PRIVATE CLASSIFIER, RETIRED (2026-08-27).
 *
 * ⚠️ THE DEFECT, AS FOUND: an **Ab Wheel Rollout** on Michael's live session was drawn a weight box,
 * a plate calculator and a 45 lb bar picker. `StrengthLogger.tsx` carried its own substring regex
 * for this question with no `rollout` stem, so the row answered "not bodyweight", fell through to
 * `equipmentForExercise`'s `barbell` default, and got the whole barbell treatment. ⛔ **THREE OTHER
 * PLACES ALREADY KNEW**: `exercise-role.ts`'s type table says `bodyweight`, `exercise-config.ts`
 * says `displayFormat: 'bodyweight'`, and Viada p223 lists ab wheel rollouts under CORE.
 *
 * ⛔ SO THE FIX IS NOT A STEM. Adding `rollout` would have fixed the one movement on the screenshot
 * and left the rest: **measured over the type table, the regex missed 55 movements it calls
 * bodyweight, isometric, plyo or mobility** — sit-ups, crunches, pistol squats, hanging leg raises,
 * air squats, glute bridges, back extensions, dead hangs, wall sits, burpees, mountain climbers.
 * Every one of them would have kept a bar and a plate calculator until someone photographed it.
 *
 * ⚠️ AND IT WAS WRONG IN THE OTHER DIRECTION TWICE, WHICH IS THE MORE INSTRUCTIVE HALF:
 *   · **Cable Woodchopper** answered "bodyweight" — because `woodc`**`hop`**`per` contains the `hop`
 *     stem meant for plyometrics. A loaded cable movement was being denied its load box by a
 *     substring collision.
 *   · **Weighted Single Leg Calf Raise** answered "bodyweight" off the `calfraise` stem, weighted or
 *     not, so the weight had nowhere to go.
 * Both are fixed by asking the table, and both are pinned in the fixtures.
 *
 * ⛔ THE UNKNOWN-NAME PATH IS THE REGEX, DELIBERATELY, AND IT IS NOT A SIXTH CLASSIFIER. The table
 * is an EXACT-key lookup: a name it has never heard of resolves to `loaded_accessory` — the right
 * default for the load system (count it) and the wrong one here (draw it a bar). The freestyle
 * logger lets an athlete type any name at all, so switching cold would have taken the weight box off
 * nothing and ADDED one to every unrecognised bodyweight movement someone typed by hand. The table
 * answers wherever it knows; the old regex covers only what it has never seen, and
 * `typeForExercise` already warns once per unmapped name so those names surface rather than sit.
 *
 * ⚠️ `equipmentForExercise`'s `barbell` DEFAULT IS NOT TOUCHED. That is the header's Axis 3 line and
 * it stays where it is — this changes which movements reach the default, never what it answers.
 */
export function isBodyweightLogged(name: string): boolean {
  // ⛔ `none` COUNTS. Plyometrics, isometric holds and mobility work have no external load either;
  // the regex this replaces matched `jump`, `plank` and `plyo` for exactly that reason.
  if (lookupExerciseType(name) !== null) {
    const load = capabilitiesForExercise(name).load;
    return load === 'bodyweight' || load === 'none';
  }
  return LEGACY_BODYWEIGHT_NAME_RE.test(
    String(name || '').toLowerCase().replace(/[\s-]/g, ''),
  );
}

/**
 * ⛔ THE OLD LOGGER REGEX, VERBATIM, AND ONLY FOR NAMES THE TABLE HAS NEVER HEARD OF.
 *
 * ⚠️ ITS NORMALIZER STRIPS SPACES **AND** HYPHENS, which is why the stems are spelt closed up
 * (`stiffleggedrun`, `ladderdrill`, `askip` reached via `skip`). It is NOT
 * `normalizeExerciseNameForMatch` below — that one keeps spaces. Do not merge them.
 *
 * ⚠️ EVERY NAME THAT REACHES THIS IS A NAME THE TYPE TABLE SHOULD PROBABLY HOLD. The right fix for a
 * recurring one is a row in `TYPE_TABLE`, not a stem here.
 */
const LEGACY_BODYWEIGHT_NAME_RE =
  /dip|chinup|pullup|pushup|plank|nordic|nordiccurl|nordiccurls|swissballwalk|swissball|walkout|jump|bound|hop|plyo|skip|shuffle|ladderdrill|stiffleggedrun|calfraise|corecircuit|corework/;

/** How the weight input is DRAWN. Axis 2 — see the header. Not on the shared table. */
export type ExerciseEquipment = 'barbell' | 'dumbbell' | 'band' | 'bodyweight' | 'goblet' | 'plyo';

/**
 * Q-180: normalize before ANY substring match. The plan writes "Farmers Carry"; the exercise library
 * and the athlete write "Farmer's Carry". `"farmer's carry".includes('farmers carry')` is FALSE, so
 * the apostrophe alone dropped the exercise through every dbPattern and it defaulted to BARBELL —
 * the logger offered a plate calculator and a 45 lb bar for a dumbbell carry. Strip punctuation,
 * collapse whitespace, then match. (Screenshot, 2026-07-14.)
 *
 * ⚠️ NOT the same normalizer as `canonical()` in `exercise-role.ts` (which depluralizes and splits
 * on "or") or `canonicalize()` on the server (which emits `bench_press`). Three normalizers, three
 * jobs; this one exists so the equipment rules below match the strings they were written against.
 */
const normalizeExerciseNameForMatch = (name: string): string =>
  String(name || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

/**
 * ⛔ A FAITHFUL TRANSCRIPTION OF THE LOGGER'S OLD `getExerciseType`, RULE ORDER INTACT.
 * (That function was deleted in Step 6; this is now the only copy. It lived in `StrengthLogger.tsx`.)
 * Every comment below came with it, because each rule is a bug someone already paid for. Changing
 * the ORDER is as breaking as changing a rule: "Jump Squat" contains "squat", and "Box Jump" fell
 * through every rule to the `barbell` default until the plyo test was moved to the top.
 *
 * ⚠️ `clamshell` → `band` HAS NO "BAND" IN THE NAME and is deliberately kept. It is a mini-band
 * movement, the logger has always drawn it that way, and the shared type table agrees (its `band`
 * row carries `clamshell` for this reason). Reproducing today's routing means keeping it.
 *
 * ⚠️ THE `barbell` DEFAULT IS PRESERVED AS-IS, INCLUDING WHERE IT IS WRONG. Measured, it currently
 * answers `barbell` for 42 bodyweight movements and 8 isometric holds. That is NOT live breakage:
 * in the render chain, `isDurationBased` and `isBodyweightMove` both short-circuit ahead of it
 * (`StrengthLogger.tsx:5575-5581`), so a plank and a pull-up never reach it. Narrowing the default
 * here would change routing at the call sites that are NOT behind those guards, which is precisely
 * the "reproduce exactly" line this step must not cross. It belongs to the Axis 3 step.
 */
export function equipmentForExercise(exerciseName: string): ExerciseEquipment {
  const name = normalizeExerciseNameForMatch(exerciseName);

  // ⛔ PLYOMETRICS ARE REPS AND NOTHING ELSE (2026-08-01, Michael: a Box Jump was being shown a bar,
  // a plate calculator AND a bar-speed cue). A jump has no external load to record, no bar to load,
  // and no bar-speed conversation — the intent is maximal every rep by definition.
  // ⚠️ CHECKED FIRST, ABOVE EVERY OTHER PATTERN.
  //
  // ⛔ FOUR WORDS ADDED 2026-08-24 FOR VIADA'S NAMED DRILLS (p227), AND THE LEGACY YARDSTICK IN
  // `strength-logging-mode.test.ts` GAINED THE SAME FOUR IN THE SAME CHANGE. The Standing Plan now
  // prescribes `A-Skip`, `Ickey Shuffle`, `Ladder Drills` and `Stiff-Legged Run` by name; none of
  // them carries a jump/hop/bound word, so every one fell through to the `barbell` default and the
  // logger would have drawn a bar and a plate calculator over a skip — the exact 2026-08-01 defect,
  // re-entering through new vocabulary rather than through a rule change.
  // ⚠️ `stiff legged run` IS ITS OWN EXACT TEST, NOT A `stiff` ALTERNATIVE. `stiff leg deadlift` is a
  // real barbell lift in this catalogue and a `stiff` stem would route it to plyo.
  // ⚠️ `[ab]?skip` AND `stifflegged` ARE SPELT FOR **THIS** NORMALIZER, AND A TEST CAUGHT IT.
  // `normalizeExerciseNameForMatch` DELETES the hyphen rather than replacing it with a space, so
  // `A-Skip` arrives as `askip` and `Stiff-Legged Run` as `stifflegged run`. A plain `\bskip` can
  // never match `askip` — there is no boundary in front of it — and the drill fell straight through
  // to the barbell default. ⛔ Each of the three private plyo lists normalizes differently; spell the
  // stem for the list you are editing and let the tests prove it.
  if (/\b(jump|hop|bound|plyo|skater|shuffle|ladder|[ab]?skip|stifflegged)\w*/.test(name)) return 'plyo';

  // Bodyweight / core exercises (no equipment needed)
  if (name.includes('core circuit') || name.includes('core work') || name.includes('calf raise')) return 'bodyweight';

  // Band exercises (including those that commonly use bands)
  if (name.includes('band') || name.includes('banded') || name.includes('clamshell')) return 'band';

  // ⛔ A SINGLE-LEG HIP THRUST IS NOT A BARBELL LIFT (Michael, screenshot 2026-07-31). It matched no
  // pattern and fell through to the `barbell` default, so the logger drew a 45 lb bar and a plate
  // calculator over a movement loaded with one dumbbell or plate on the hip.
  // ⚠️ `goblet`, NOT `dumbbell`: the load is ONE implement, so the per-hand label a dumbbell row
  // prints ("lb/hand") would be wrong in the other direction.
  // ⚠️ SINGLE-LEG ONLY. A bilateral barbell hip thrust genuinely is a barbell lift.
  if (name.includes('lateral lunge') || name.includes('goblet squat')) return 'goblet';
  if (/(single leg|singleleg|one leg|1 leg|unilateral)/.test(name) && name.includes('thrust')) return 'goblet';

  if (name.includes('dumbbell') || name.includes('db ')) return 'dumbbell';

  // Common dumbbell exercise patterns (two weights, per-hand).
  // Q-180: the plan calls it "Farmers Carry", and only 'farmer walk' was listed — so a Farmers Carry
  // fell through to 'barbell' and would have been labelled a single total load instead of per-hand.
  const dbPatterns = [
    'bicep curl', 'biceps curl', 'hammer curl', 'concentration curl',
    'lateral raise', 'front raise', 'chest fly', 'chest flye',
    'arnold press', 'bulgarian split squat',
    'farmer walk', 'farmer walks', 'farmers carry', 'farmer carry', 'farmers walk', 'suitcase carry',
    'walking lunge', 'reverse lunge', 'forward lunge', 'lunge',
    'single leg rdl', 'single leg rdl',
    'step up', 'step up',
  ];
  if (dbPatterns.some((p) => name.includes(p))) return 'dumbbell';

  // Default: barbell
  return 'barbell';
}

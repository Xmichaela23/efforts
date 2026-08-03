/**
 * THE ADD-PICKER / CONFIG / TYPE-TABLE RECONCILIATION (2026-08-03).
 *
 *   ~/.deno/bin/deno test --allow-read src/lib/exercise-config.reconcile.test.ts --no-check
 *
 * ⛔ THE BUG CLASS THIS PINS. Three tables describe one vocabulary: `exercise-role.ts`'s TYPE_TABLE
 * says WHAT a movement is, `exercise-config.ts` says how it is PRICED and DRAWN, and a hand-curated
 * array inside `StrengthLogger.tsx` decides whether the athlete can TYPE IT IN. Nothing held them
 * together, so a movement could be fully classified by the engine and unreachable in the logger —
 * and, worse, a name with no config entry does NOT resolve to null. `getExerciseConfig` ends in a
 * longest-substring fuzzy fallback, so it silently lands on a neighbour and renders that
 * neighbour's prescription. `press` — 5/3/1's own name for the overhead press — matched `leg press`
 * and was priced at 1.5x the SQUAT.
 *
 * ⚠️ THE PICKER ARRAY IS PARSED WITH A REAL JS PARSE, NOT A REGEX. The first version of this fixture
 * used `matchAll(/['"]([^'"]+)['"]/g)` and QUIETLY LIED: the apostrophe in `"Farmer's Carry"` runs
 * the match into the following entries, so `Suitcase Carry` — which is right there in the array —
 * read as missing. A test that under-reports the thing it is testing is worse than no test.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { EXERCISE_CONFIG, getExerciseConfig } from './exercise-config.ts';
import { EXERCISE_TYPE_CAPABILITIES, lookupExerciseType } from './exercise-role.ts';
import { equipmentForExercise, isDurationLogged, loggingModeForExercise } from './strength-logging-mode.ts';

const fold = (s: string) => s.toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();

/** The logger's `getFilteredExercises` fold, transcribed. Same comparison the screen makes. */
const foldForSearch = fold;

/**
 * The add-picker's list, read out of `StrengthLogger.tsx` and EVALUATED as the array literal it is.
 * ⚠️ Comments are stripped first; they contain apostrophes and quoted words.
 */
async function pickerList(): Promise<string[]> {
  const src = await Deno.readTextFile(new URL('../components/StrengthLogger.tsx', import.meta.url));
  const body = src.split('const commonExercises = [')[1].split('\n  ];')[0];
  const noComments = body.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  const arr = new Function(`return [${noComments}]`)() as string[];
  assert(arr.length > 120, `expected the picker array to parse, got ${arr.length}`);
  return arr;
}

/** The classified vocabulary: TYPE_TABLE keys + MAIN_531_LIFTS, read from source (both private). */
async function classifiedVocabulary(): Promise<Array<{ name: string; type: string }>> {
  const src = await Deno.readTextFile(new URL('./exercise-role.ts', import.meta.url));
  const typeBlock = src.split('const TYPE_TABLE')[1];
  const typed = [...typeBlock.matchAll(
    /^ {2}'([^']+)':\s*'(barbell_main|loaded_accessory|bodyweight|plyo|isometric|mobility|carry|band)'/gm,
  )].map((m) => ({ name: m[1], type: m[2] }));
  const mainBlock = src.split('MAIN_531_LIFTS')[1].split(']')[0];
  const main = [...mainBlock.matchAll(/'([^']+)'/g)].map((m) => ({ name: m[1], type: 'barbell_main' }));
  assert(typed.length > 100, `expected TYPE_TABLE to parse, got ${typed.length}`);
  return [...main, ...typed];
}

/** What display formats are honest for a type's logging mode. */
const FORMATS_FOR_MODE: Record<string, string[]> = {
  weight_x_reps: ['total', 'perHand', 'perLeg', 'dipsAdded'],
  reps: ['bodyweight'],
  time: ['bodyweight'],
  done_or_time: ['bodyweight'],
  distance_or_time: ['total', 'perHand'],
  band_resistance_lb: ['band'],
};

/**
 * ⛔ A DEBT LEDGER, AND IT MAY ONLY SHRINK. (Same device as `exercise-name-lint.test.ts`.)
 *
 * These four are GENUINE cross-table disagreements that PRE-DATE the 2026-08-03 reconciliation, and
 * they are listed rather than fixed because that pass was additive-only — every one of them is an
 * EXISTING entry, and changing a shipped `displayFormat` moves a live prescription. Each is a real
 * product question, not an oversight:
 *
 *   face pull / pallof press — TYPE_TABLE calls them `loaded_accessory` (a cable stack), the config
 *     draws them as `band`. Both are true of the movement; the tables disagree about which is the
 *     default. ⚠️ `cable face pull` was ADDED as an explicit loaded entry, which is why the cable
 *     case is now reachable without touching this one.
 *   dip / glute bridge — TYPE_TABLE calls them `bodyweight`, the config prices them off a barbell
 *     (bench × 0.9 / deadlift × 0.4) because both are commonly loaded. `dipsAdded` exists as a
 *     format for exactly this, which suggests the config is the considered side here.
 *
 * ⚠️ DO NOT ADD TO THIS LIST TO MAKE A TEST PASS. A new disagreement is a new bug — the whole point
 * of the invariant is that the fuzzy fallback silently creates them.
 */
const PRE_EXISTING_TYPE_CONFIG_DISAGREEMENTS = new Set([
  'face pull',
  'pallof press',
  'dip',
  // ⚠️ `tricep dip` IS THE SAME MOVEMENT AS `dip`, NOT A FIFTH CASE. It joined this list on
  // 2026-08-03 only because it gained a key that day — before that it fuzzy-matched `dips` and
  // carried the identical contradiction unmeasured. The ledger tracks MOVEMENTS; a second spelling
  // of one already on it is not a new bug, and typing it differently from `dip` to dodge this would
  // have created exactly the one-movement-two-answers defect the same pass was fixing.
  'tricep dip',
  // ⚠️ `ring dip` — same movement again, third spelling. Added 2026-08-03 when it gained a key.
  'ring dip',
  'glute bridge',
]);

Deno.test('⛔ EVERY CLASSIFIED MOVEMENT RESOLVES TO A CONFIG WHOSE FORMAT MATCHES ITS TYPE', async () => {
  // This is the invariant the whole reconciliation exists to establish. It catches the fuzzy-fallback
  // bug class directly: a band movement drawn as a dumbbell, a bodyweight pistol priced off a barbell.
  const bad: string[] = [];
  for (const { name } of await classifiedVocabulary()) {
    if (PRE_EXISTING_TYPE_CONFIG_DISAGREEMENTS.has(name)) continue;
    const type = lookupExerciseType(name);
    if (!type) continue; // covered by exercise-role.type.test.ts, not this file's job
    const cap = EXERCISE_TYPE_CAPABILITIES[type];
    const cfg = getExerciseConfig(name);
    if (!cfg) { bad.push(`${name} (${type}) → NO CONFIG AT ALL`); continue; }
    const allowed = FORMATS_FOR_MODE[cap.loggedAs];
    if (!allowed.includes(cfg.displayFormat)) {
      bad.push(`${name} (${type}/${cap.loggedAs}) → displayFormat '${cfg.displayFormat}', expected one of ${allowed.join('|')}`);
    }
  }
  assertEquals(bad, [], `these resolve to a config that contradicts their declared type:\n  ${bad.join('\n  ')}`);
});

Deno.test('⛔ THE DEBT LEDGER IS REAL — every listed name still disagrees, so none is carried for free', async () => {
  // An allowlist that outlives the problem it names becomes a lie. If one of these gets fixed, this
  // fails and tells you to delete the line.
  const stillWrong = new Set<string>();
  for (const { name } of await classifiedVocabulary()) {
    const type = lookupExerciseType(name);
    if (!type) continue;
    const cfg = getExerciseConfig(name);
    if (!cfg) continue;
    if (!FORMATS_FOR_MODE[EXERCISE_TYPE_CAPABILITIES[type].loggedAs].includes(cfg.displayFormat)) {
      stillWrong.add(name);
    }
  }
  const stale = [...PRE_EXISTING_TYPE_CONFIG_DISAGREEMENTS].filter((n) => !stillWrong.has(n));
  assertEquals(stale, [], `these no longer disagree — remove them from the ledger:\n  ${stale.join('\n  ')}`);
});

Deno.test('⛔ THE NAMED REGRESSIONS — each was a live mis-resolution before 2026-08-03', () => {
  // `press` is one of the app's own MAIN_531_LIFTS and matched `leg press` at 1.5x SQUAT.
  const press = getExerciseConfig('press')!;
  assertEquals(press.primaryRef, 'overhead');
  assertEquals(press.ratio, 1.0);
  assertEquals(press.displayFormat, 'total');

  // A bodyweight pistol squat matched `squat` and was priced at 100% of the barbell back squat.
  const sls = getExerciseConfig('single leg squat')!;
  assertEquals(sls.primaryRef, null);
  assertEquals(sls.ratio, 0);
  assertEquals(sls.displayFormat, 'bodyweight');

  // A band overhead press matched `overhead press` and was priced off the barbell 1RM.
  assertEquals(getExerciseConfig('band overhead press')!.displayFormat, 'band');
  assertEquals(getExerciseConfig('band overhead press')!.ratio, 0);

  // A band lateral raise was drawn as a per-hand dumbbell.
  assertEquals(getExerciseConfig('band lateral raise')!.displayFormat, 'band');

  // A CABLE face pull matched `face pull`, which is configured `band` — a stack drawn as a band.
  const cfp = getExerciseConfig('cable face pull')!;
  assertEquals(cfp.displayFormat, 'total');
  assertEquals(cfp.primaryRef, 'overhead');

  // A WEIGHTED single-leg calf raise matched the bodyweight one, so the load had nowhere to go.
  assertEquals(getExerciseConfig('weighted single leg calf raise')!.displayFormat, 'perHand');
});

Deno.test('⛔ RATIOS ARE INHERITED FROM SIBLINGS, NOT INVENTED', () => {
  // Each pair below is (variant, the entry it is a variant of). The ratio must be IDENTICAL — the
  // equipment may change the display, never the prescription. A first pass at this section picked
  // its own numbers; this fixture is what stops that happening again.
  const inherits: Array<[string, string]> = [
    ['press', 'overhead press'],
    ['military press', 'overhead press'],
    ['push press', 'overhead press'],
    ['barbell bench press', 'bench press'],
    ['db row', 'dumbbell row'],
    ['light db row', 'dumbbell row'],
    ['single arm row', 'dumbbell row'],
    ['cable row', 'barbell row'],
    ['row', 'barbell row'],
    ['lat pull down', 'lat pulldown'],
    ['explosive lat pull down', 'lat pulldown'],
    ['db floor press', 'dumbbell bench press'],
    ['db push press', 'dumbbell shoulder press'],
    ['dumbbell press', 'dumbbell shoulder press'],
    ['db romanian deadlift', 'romanian deadlift'],
    ['barbell hip thrust', 'hip thrust'],
    ['barbell walking lunge', 'walking lunge'],
    ['dumbbell walking lunge', 'walking lunge'],
    ['sandbag lunge', 'walking lunge'],
    ['explosive step up', 'step up'],
    ['prone y t w raise', 'ytw raise'],
    ['external rotation', 'ytw raise'],
    ['cable face pull', 'ytw raise'],
  ];
  for (const [variant, sibling] of inherits) {
    const v = EXERCISE_CONFIG[variant];
    const s = EXERCISE_CONFIG[sibling];
    assert(v, `missing entry: ${variant}`);
    assert(s, `missing sibling: ${sibling}`);
    assertEquals(v.ratio, s.ratio, `${variant} must inherit ${sibling}'s ratio (${s.ratio}), got ${v.ratio}`);
    assertEquals(v.primaryRef, s.primaryRef, `${variant} must inherit ${sibling}'s primaryRef`);
  }
});

Deno.test('⛔ ratioIsTotal TRAVELS WITH THE RATIO — dropping it doubles the prescription', () => {
  // On `dumbbell bench press` the ratio is the TOTAL load and the display halves it per hand.
  // A perHand variant that inherited the ratio without the flag would prescribe twice the weight.
  for (const key of ['db floor press', 'db push press', 'dumbbell press', 'kettlebell press',
                     'db romanian deadlift', 'dumbbell walking lunge']) {
    const c = EXERCISE_CONFIG[key];
    assert(c, `missing entry: ${key}`);
    assertEquals(c.displayFormat, 'perHand', `${key} should display per hand`);
    assertEquals(c.ratioIsTotal, true, `${key} carries a TOTAL ratio and must say so`);
  }
});

Deno.test('THE BAND ROW: the band is the load, and a ratio would fabricate a prescription', () => {
  for (const [key, cfg] of Object.entries(EXERCISE_CONFIG)) {
    if (cfg.displayFormat !== 'band') continue;
    assertEquals(cfg.ratio, 0, `${key} is a band movement — it has no fraction of any barbell max`);
    assertEquals(cfg.primaryRef, null, `${key} is a band movement — it derives from no lift`);
  }
});

Deno.test('CARRIES: loaded, timed, and split per-hand vs total the way equipmentForExercise already draws them', () => {
  // ⚠️ NOT A NEW OPINION — transcribed from `strength-logging-mode.ts`, which already answers
  // `dumbbell` (per hand) for farmer/suitcase carries. Q-180 is the precedent AND the warning.
  const perHand = ['farmers carry', 'farmer carry', 'farmer walk', 'suitcase carry'];
  const total = ['sled push', 'sled pull', 'backpack carry'];
  for (const k of perHand) {
    assertEquals(EXERCISE_CONFIG[k]?.displayFormat, 'perHand', `${k} is two implements / one per hand`);
    assertEquals(equipmentForExercise(k), 'dumbbell', `${k} is already drawn as a dumbbell movement`);
  }
  for (const k of total) {
    assertEquals(EXERCISE_CONFIG[k]?.displayFormat, 'total', `${k} is ONE implement — a single total load`);
  }
  // And every one of them is measured against the clock or a distance, never in reps.
  for (const k of [...perHand, ...total]) {
    assertEquals(loggingModeForExercise(k), 'distance_or_time', `${k} is a carry`);
    assert(isDurationLogged(k), `${k} must not ask for reps`);
  }
});

Deno.test('⛔ HOLDS AND CARRIES CARRY NO SWAP SLOT — they substitute for nothing', () => {
  // `pattern` is the swap slot: getInSlotAlternatives offers every entry sharing a pattern. Typing a
  // wall sit `knee_dominant` would offer it as a substitute for a Back Squat. MovementPattern has no
  // `hold` or `carry` member, so null is the honest answer — and it means zero ripple.
  for (const k of ['dead hang', 'wall sit', 'wall angel', 'foot doming',
                   'farmers carry', 'farmer carry', 'farmer walk', 'suitcase carry',
                   'backpack carry', 'sled push', 'sled pull']) {
    const c = EXERCISE_CONFIG[k];
    assert(c, `missing entry: ${k}`);
    assertEquals(c.pattern ?? null, null, `${k} must carry no swap slot`);
  }
});

Deno.test('⛔ THE DEVICE REPORT — band, sled and dead hang now return results in the add search', async () => {
  const list = await pickerList();
  const search = (q: string) => list.filter((e) => foldForSearch(e).includes(foldForSearch(q)));
  // The three confirmed-on-device misses, as the athlete typed them.
  assert(search('ban').length > 0, '"ban" returned nothing');
  assert(search('sled').length > 0, '"sled" returned nothing');
  assert(search('dead hang').length > 0, '"dead hang" returned nothing');
  // …and the control: "fa" already worked, and must keep working.
  const fa = search('fa');
  assert(fa.length >= 3, `"fa" regressed — got ${fa.join(', ')}`);
});

Deno.test('⛔ EVERY NEWLY-ADDED PICKER NAME RESOLVES TO THE RIGHT LOGGING MODE', async () => {
  const list = await pickerList();
  // Each pair is (what the athlete types, the mode the row must open in).
  const expectations: Array<[string, string]> = [
    ['Dead Hang', 'time'],
    ['Wall Sit', 'time'],
    ['Plank Hold', 'time'],
    ['Side Plank Abduction', 'time'],
    ['Wall Angel', 'done_or_time'],
    ['Foot Doming', 'done_or_time'],
    ['Sled Push', 'distance_or_time'],
    ['Sled Pull', 'distance_or_time'],
    ['Farmers Carry', 'distance_or_time'],
    ['Backpack Carry', 'distance_or_time'],
    ['Band Pull Apart', 'band_resistance_lb'],
    ['Band Row', 'band_resistance_lb'],
    ['Band Pull Down', 'band_resistance_lb'],
    ['Band Overhead Press', 'band_resistance_lb'],
    ['Band Lateral Raise', 'band_resistance_lb'],
    ['Box Jump', 'reps'],
    ['Broad Jump', 'reps'],
    ['Bench Jump', 'reps'],
    ['Single Leg Squat', 'reps'],
    ['Nordic Hamstring Curl', 'reps'],
    ['Soleus Raise', 'reps'],
    ['Tibialis Raise', 'reps'],
    ['Band Assisted Pull up', 'reps'],
    ['Press', 'weight_x_reps'],
    ['Military Press', 'weight_x_reps'],
    ['Push Press', 'weight_x_reps'],
    ['Barbell Hip Thrust', 'weight_x_reps'],
    ['Cable Face Pull', 'weight_x_reps'],
  ];
  const missing: string[] = [];
  const wrongMode: string[] = [];
  for (const [name, mode] of expectations) {
    if (!list.some((e) => foldForSearch(e) === foldForSearch(name))) missing.push(name);
    const actual = loggingModeForExercise(name);
    if (actual !== mode) wrongMode.push(`${name} → ${actual}, expected ${mode}`);
  }
  assertEquals(missing, [], `not in the add picker:\n  ${missing.join('\n  ')}`);
  assertEquals(wrongMode, [], `wrong logging mode:\n  ${wrongMode.join('\n  ')}`);
});

Deno.test('⛔ THE PER-HAND AUDIT, AS A STANDING CHECK', () => {
  // Every two-handed DUMBBELL movement shows a per-hand number. ⚠️ THE EXEMPTIONS ARE NOT LAZINESS:
  // a swing is ONE bell held with TWO hands, so a per-hand label would be wrong in the other
  // direction — the same mistake Q-180 made about a Farmers Carry, pointing the opposite way.
  const singleImplementTwoHands = /swing|goblet/;
  const unilateralByName = /single arm|one arm|single-arm|suitcase/;
  const offenders: string[] = [];
  for (const [key, cfg] of Object.entries(EXERCISE_CONFIG)) {
    const k = fold(key);
    if (!/\b(dumbbell|db)\b/.test(k)) continue;
    if (singleImplementTwoHands.test(k) || unilateralByName.test(k)) continue;
    if (cfg.displayFormat !== 'perHand') offenders.push(`${key} → ${cfg.displayFormat}`);
  }
  assertEquals(offenders, [], `two-handed dumbbell moves must display per hand:\n  ${offenders.join('\n  ')}`);
});

Deno.test('ADDITIVE — no config key was removed, and the picker list only grew', async () => {
  // A cheap structural guard. The reconciliation was additive by construction; this fails loudly if
  // a future edit deletes an entry while claiming to add one.
  for (const k of ['squat', 'deadlift', 'bench press', 'overhead press', 'hip thrust',
                   'walking lunge', 'step up', 'dumbbell row', 'lat pulldown', 'face pull',
                   'plank', 'box jump', 'pull up', 'leg press']) {
    assert(EXERCISE_CONFIG[k], `pre-existing config key went missing: ${k}`);
  }
  const list = await pickerList();
  for (const k of ['Deadlift', 'Squat', 'Bench Press', 'Face Pulls', "Farmer's Carry", 'TRX Fallout',
                   'Hip Thrust', 'Suitcase Carry', 'Overhead Carry']) {
    assert(list.includes(k), `pre-existing picker entry went missing: ${k}`);
  }
});

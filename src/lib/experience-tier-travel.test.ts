/**
 * ⛔⛔ THE EXPERIENCE ANSWER HAS TO TRAVEL THE WHOLE PATH, AND THE LAST HOP IS THE ONE THAT KILLS
 * (work order `WORKORDER-experience-tiers-2026-08-27.md` §2b).
 *
 * The answer is the SOLE input to how long every hard session and the long session are. It leaves
 * the wizard's own state and has to reach four more places:
 *
 *   1. the wizard's payload  (`endurance_experience`)
 *   2. `create-goal-and-materialize-plan`, which forwards the goal's prefs into the generator's BODY
 *   3. `generate-strength-plan`, which reads that body into the composer
 *   4. the PLAN ROW's config — and back off it in `rematerialize-standing-block`
 *
 * ⛔ STEP 4 IS NOT OPTIONAL AND IT IS THE SILENT ONE. `rematerialize-standing-block` rewrites every
 * week the athlete has not started yet, from the stored row. A block that rematerialises without the
 * answer re-composes those weeks at the frame's own printed levels: an athlete who said "Newer"
 * watches their hard sessions and long session grow mid-block, on a calendar they were already
 * training against, with nothing said.
 *
 * ⚠️ THIS IS A SOURCE-TEXT GUARD AND ITS LIMIT IS STATED RATHER THAN HIDDEN — the same shape and the
 * same reason as `volume-units.test.ts`. It pins the WIRING as written across five files that no
 * single runtime test spans (two are HTTP handlers, one is a 7,000-line TSX component `deno test`
 * cannot import). It catches a hop being dropped; it is not proof the value arrives.
 *
 * Run from repo root:
 *   ~/.deno/bin/deno test --allow-read --no-check src/lib/experience-tier-travel.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const read = (rel: string) => Deno.readTextFile(new URL(rel, import.meta.url));

const WIZARD = await read('../components/NonRaceBuilder.tsx');
const CARD = await read('../components/EnduranceWeekCard.tsx');
const CREATE_GOAL = await read('../../supabase/functions/create-goal-and-materialize-plan/index.ts');
const GENERATE = await read('../../supabase/functions/generate-strength-plan/index.ts');
const PLAN_ROW = await read('../../supabase/functions/_shared/standing-plan/plan-row.ts');
const REMATERIALIZE = await read('../../supabase/functions/rematerialize-standing-block/index.ts');
const COMPOSE = await read('../../supabase/functions/_shared/standing-plan/compose.ts');

Deno.test('⛔⛔ HOP 1 — the wizard sends the answer', () => {
  assert(/enduranceExperience\?: EnduranceExperience;/.test(WIZARD),
    'the wizard no longer holds the experience answer in its own state');
  assert(/\{ endurance_experience: out \}/.test(WIZARD),
    'the wizard payload no longer carries endurance_experience');
});

Deno.test('⛔⛔ HOP 2 — create-goal forwards it into the generator body', () => {
  assert(/endurance_experience/.test(CREATE_GOAL),
    '⛔ create-goal drops the experience answer — generate-strength-plan reads it off the BODY, so '
    + 'a hop that does not forward it hands the composer nothing');
  assert(/\{ endurance_experience: out \}/.test(CREATE_GOAL),
    'create-goal reads the key but never puts it on the body it forwards');
});

Deno.test('⛔⛔ HOP 3 — generate-strength-plan reads it into the composer', () => {
  assert(/endurance_experience/.test(GENERATE),
    'generate-strength-plan no longer reads endurance_experience off its body');
  assert(/enduranceExperience:/.test(GENERATE),
    'generate-strength-plan reads the key but never hands it to the composer');
});

Deno.test('⛔⛔ HOP 4 — the plan row stores it, and the restate reads it back', () => {
  assert(/endurance_experience: EnduranceExperience \| null;/.test(PLAN_ROW),
    'the plan row config no longer declares endurance_experience');
  assert(/endurance_experience: \(\(\) =>/.test(PLAN_ROW),
    'the plan row declares the field but never writes it');
  assert(/enduranceExperience: sp\.endurance_experience/.test(REMATERIALIZE),
    '⛔ THE RESTATE DOES NOT READ THE ANSWER BACK. Every unstarted week will re-compose at the '
    + 'frame\'s own levels — the hard sessions and the long session growing mid-block, silently');
});

Deno.test('⛔⛔ THE COMPOSER TAKES THE ANSWER AND NOT THE HISTORY', () => {
  assert(/const tierLevels = experienceLevels\(args\.enduranceExperience\)/.test(COMPOSE),
    'the endurance level is no longer decided by the athlete\'s own answer');
  assert(!/lowVolumeSports\(/.test(COMPOSE),
    '⛔ THE 28-DAY HISTORY GATE IS BACK IN THE COMPOSER. It was ruled out on 2026-08-27 — '
    + '"im coming off a marathon a few months ago I was training less, this is the wrong thing"');
});

Deno.test('⛔ THE SCREEN ASKS IT, GATES ON IT, AND FALLS THE ANSWER BACK', () => {
  // ⛔ CHIPS, NOT A DROPDOWN — two options behind a dropdown costs two taps and hides half the choice.
  assert(/data-testid=\{`experience-\$\{sport\}-\$\{chip\.tier\}`\}/.test(CARD),
    'the two experience chips are no longer rendered per sport');
  assert(!/<select[^>]*experience/i.test(CARD),
    '⛔ the experience answer became a dropdown — rejected explicitly');
  // ⛔ CONTINUE IS GATED ON IT, exactly as it is on all four slots.
  assert(/experienceUnanswered\.length === 0/.test(WIZARD),
    'Continue no longer waits on the experience answer');
  // ⛔ LOWERING THE HOURS AFTER PICKING FALLS THE SELECTION BACK TO "Newer", VISIBLY.
  assert(/enduranceExperience: \{ \.\.\.\(st\.enduranceExperience \?\? \{\}\), \[sport\]: 'newer' \}/.test(WIZARD),
    '⛔ dropping the hours no longer falls a stale "Experienced" back — the screen and the block '
    + 'would disagree about a decision the athlete made');
});

Deno.test('⛔ THE SUBTITLE CLAIMS THE HARD SESSIONS AND NOTHING ELSE', async () => {
  // ⚠️ THE VALUES, NOT THE FILE TEXT. The tombstone above the constant quotes the discarded wording
  // on purpose, so a source-text match would read the note as the copy.
  const { EXPERIENCE_SUBTITLE } = await import('./standing-plan-week-copy.ts');
  const COPY = Object.values(EXPERIENCE_SUBTITLE).join(' | ');
  /**
   * ⛔ MICHAEL, 2026-08-27: *"the chip programs the HARD SESSION. That is what this control is for
   * and it is the only thing its number may claim."* A draft read *"hard runs and your long run"*,
   * and aiming the number at that wider claim let the Saturday long run swallow it — both chips
   * printing 90 and 100 while the hard run the athlete was choosing sat around 42-50.
   * ⚠️ THE LONG SESSION STILL MOVES with the answer (p247); it is not what the chip prints.
   */
  assert(/Sets how long your hard runs are\./.test(COPY), 'the run subtitle changed');
  assert(/Sets how long your hard rides are\./.test(COPY), 'the ride subtitle changed');
  assert(!/hard runs and your long run/.test(COPY),
    '⛔ the wider claim came back into the subtitle — it is what sent the number to the long run');
});

Deno.test('⛔⛔ EVERY HARD ROW OFFERS ITS WORKOUT, AND THE LONG ROW STILL DOES NOT', async () => {
  /**
   * ⛔⛔ SUPERSEDES `THE HARD ROW OFFERS THE SPORT AND NOTHING ELSE` (2026-08-27), WHICH PINNED THE
   * OPPOSITE. Michael, 2026-08-31: *"they can choose their hard work."* That test asserted exactly
   * one `<HardSlotChoices>` in the wizard — the long slot's club control — and it was right for the
   * ruling it was written under. **Everything below is the new ruling; the old one is history.**
   *
   * ⚠️ ITS FIRST REASON WAS RE-CHECKED RATHER THAN WAVED PAST, and is measured false for these rows:
   * *"a picked shape can cease to exist when the experience answer changes the level."* Exactly two
   * archetypes in the whole library carry a `levels` gate and both are p241 open-water SWIMS — every
   * shape in `run_mlss`, `run_near_threshold`, `ride_anaerobic` and `ride_sweet_spot` is offered at
   * all three levels. The other reason, the chip measuring a resolved shape, is what `hardArchetypes`
   * already solves. Both are asserted below rather than trusted.
   */
  const code = WIZARD.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  // ⛔ TWO CALL SITES: the long slot's club control, and the one that serves every hard row.
  const uses = code.match(/<HardSlotChoices/g) ?? [];
  assertEquals(uses.length, 2, `the wizard renders ${uses.length} HardSlotChoices, expected 2`);
  assert(/slotKey="long"/.test(code), 'the long slot lost its club-session control');
  assert(/slotKey=\{hk\}/.test(code), 'the hard rows lost their workout picker');

  /**
   * ⛔ NO HARD SHAPE IS LEVEL-GATED, which is what makes the picker safe. If a gated archetype is
   * ever added to one of these families this fails, and `slotVariantOptions` — which ignores
   * `levels` — has to learn about it before the option can ship.
   */
  const { FAMILIES } = await import('../../supabase/functions/_shared/endurance-library/index.ts');
  for (const fam of ['run_mlss', 'run_near_threshold', 'ride_anaerobic', 'ride_sweet_spot'] as const) {
    for (const a of (FAMILIES as Record<string, { archetypes: { id: string; levels?: number[] }[] }>)[fam].archetypes) {
      assert(!a.levels, `${fam}.${a.id} is level-gated and the picker does not filter by level`);
    }
  }

  // ⛔ AND THE CHIP MEASURES THE PICKED SHAPE, on every row the FRAME has rather than a fixed pair.
  assert(/hardArchetypes=\{Object\.fromEntries\(hardSlotKeysFor\(wizardFrame\)/.test(WIZARD),
    'the chip reads a hardcoded hard-row pair again — the third row\'s pick would not reach it');
});

Deno.test('⛔⛔ THE SCREEN PUTS THE HARD PAIR IN HIS ORDER, VISIBLY', async () => {
  /**
   * ⛔ ONE HARD RIDE ON HIS DAY 1, ONE HARD RUN ON HIS DAY 3, whichever row was answered
   * (p278 / p246+p247). ⚠️ APPLIED ON THE SCREEN AS WELL AS IN THE ENGINE so the rows swap where the
   * athlete can see it — a screen that showed one week while the block built another is the
   * ask-15-get-20 defect in a different coat.
   */
  assert(/hardPairInFrameOrder\(picked\.hard1/.test(WIZARD),
    'the screen no longer normalises the hard pair — it would show a week the engine will not build');
  const BOUNDS = await read('./standing-plan-week-bounds.ts');
  assert(/hardPairInFrameOrder/.test(BOUNDS),
    '⛔ the chips and the caps are computed off the RAW answers again — they would quote the hard '
    + 'run at day 1\'s easier dose while the block builds day 3\'s');
});

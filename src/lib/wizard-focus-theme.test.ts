/**
 * ⛔ THE FOCUS THEME — the two screens Michael renamed, and the mark they carry (2026-08-26).
 *
 *   ~/.deno/bin/deno test -A --no-check --sloppy-imports src/lib/wizard-focus-theme.test.ts
 *
 * ⛔ FOCUS IS A SECTION THEME, NOT A LABEL. His words: *"its broader its a theme for this section I
 * want to use"*. It was already the pattern — the nav tab reads Focus with the eye, the Focus
 * screen's heading carries the same mark, and the Train screen offers Strength / Run / Ride /
 * Athletic Focus. These two wizard steps were the ones outside it.
 *
 * ⚠️ READ AS SOURCE TEXT, because these are JSX titles inside a 6,900-line component and the Deno
 * suite cannot import TSX. Same idiom as `wizard-identifiers.test.ts` and `gs-allowlist.test.ts`,
 * and with the same limit stated rather than hidden: it proves the STRING is in the file on the
 * right prop, not that the screen renders.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const ROOT = new URL('../../', import.meta.url);
const WIZARD = await Deno.readTextFile(new URL('src/components/NonRaceBuilder.tsx', ROOT));
const APP_LAYOUT = await Deno.readTextFile(new URL('src/components/AppLayout.tsx', ROOT));
const CSS = await Deno.readTextFile(new URL('src/index.css', ROOT));

Deno.test('⛔⛔ THE TWO RENAMED STEPS CARRY THE THEME WORD AND THE EYE', () => {
  /**
   * ⛔ "Accessory work" → "Build focus". It carried the same defect as the old subtitle: "accessory"
   * is HIS term for a NON-COMPETITION movement in the same gross pattern (§E1b — paused deadlifts,
   * box squats, Larsen presses), not for muscle work. ⚠️ And "build" is LITERAL: all seven picks
   * claim HYP accessory cells, and p219 defines that intent as standard bodybuilding-style work.
   *
   * ⛔ "Your endurance week" → "Endurance focus" — the one step in the flow that named itself after
   * the WEEK rather than after the theme.
   */
  assert(WIZARD.includes("title={eyeTitle('Build focus')}"), 'the accessory step lost the theme title');
  assert(WIZARD.includes("title={eyeTitle('Endurance focus')}"), 'the endurance step lost the theme title');
  // ⛔ AND THE OLD NAMES ARE GONE FROM THOSE PROPS.
  assertEquals(WIZARD.includes('title="Your endurance week"'), false, 'the old endurance title is back');
  // ⚠️ "Accessory work" STILL APPEARS ONCE — the OTHER accessory screen, on the non-strength path,
  // which Michael has not ruled on. Pinned at ONE so a rename of the wrong screen fails here, and so
  // does silently renaming the one he did not name.
  assertEquals((WIZARD.match(/title="Accessory work"/g) ?? []).length, 1,
    'the untouched second accessory screen was renamed, or the wrong one was');
});

Deno.test('⛔⛔ IT IS THE APP\'S OWN EYE, NOT A FRESH ICON', () => {
  /**
   * ⛔ MICHAEL ASKED FOR "the luci eye icon" AND THE APP'S EYE IS NOT LUCIDE — that is the point of
   * this test. `index.css` draws `.eye-mark` in CSS and says why: *"Drawn in CSS like the tab bar's
   * other sigils rather than dropped in as an icon component: that bar's whole language is abstract
   * marks, and one real glyph among them reads as a mistake."*
   *
   * ⚠️ SO IMPORTING `Eye` FROM `lucide-react` WOULD HAVE PUT TWO NEARLY-IDENTICAL EYES IN ONE THEME,
   * which is the one thing his instruction rules out. `eyeTitle` reuses the same `.eye-mark` the nav
   * tab and the Focus screen heading already draw.
   */
  assert(/const eyeTitle = /.test(WIZARD), 'the shared title helper is gone');
  assert(/eye-mark eye-heading/.test(WIZARD), 'the wizard stopped drawing the shared mark');
  assert(/sigilClass\('eye-mark'/.test(APP_LAYOUT), 'the nav tab no longer uses the mark these match');
  assert(/\.eye-mark\b/.test(CSS), 'the one CSS definition of the mark is gone');
  // ⛔ NO SECOND EYE. A lucide import here would be the drift the instruction exists to prevent.
  const lucideImports = WIZARD.match(/from 'lucide-react'/g) ?? [];
  for (const line of WIZARD.split('\n')) {
    if (line.includes("lucide-react")) {
      assertEquals(/\bEye\b/.test(line), false, `a second eye was imported: ${line.trim()}`);
    }
  }
  assert(lucideImports.length <= 1, 'lucide is imported more than once — check for a stray eye');
});

Deno.test('⛔ AND ONLY THE STEPS HE NAMED CHANGED', () => {
  /**
   * ⚠️ THE WHOLE FLOW'S OTHER TITLES ARE UNTOUCHED, DELIBERATELY. Several of them could carry the
   * theme — "Strength work", "Your week", "Per-discipline focus" already uses the word without the
   * mark — and NONE of them is mine to rename. He ruled on exactly two.
   */
  for (const untouched of ['Which race?', 'What can you sustain?', 'Your week', 'Strength work',
                           'Per-discipline focus', 'How long is this block?']) {
    assert(WIZARD.includes(`title="${untouched}"`), `"${untouched}" was renamed without a ruling`);
  }
  // ⚠️ AND THE THREE THAT ALREADY CARRIED THE MARK STILL DO — this change added to the theme rather
  // than reshuffling it.
  for (const kept of ['Choose your focus', 'Train', 'Strength']) {
    assert(WIZARD.includes(`title={eyeTitle('${kept}')}`), `"${kept}" lost the mark it already had`);
  }
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE ENDURANCE FOCUS SCREEN — the audit fixes (2026-08-26)
// ════════════════════════════════════════════════════════════════════════════════════════════════

const CARD = await Deno.readTextFile(new URL('src/components/EnduranceWeekCard.tsx', ROOT));

Deno.test('⛔⛔ THE AUTO-ASSIGN READS THE CONSTANT, NEVER A SPELLED-OUT SET OF SLOTS', () => {
  /**
   * ⛔ THIS EFFECT HAS BEEN WRONG IN BOTH DIRECTIONS, which is why the assertion is about HOW it
   * decides rather than about which slots it fills. It filled every slot from 2026-08-24; hard
   * sessions became opt-in on 2026-08-25 and it was not revisited, so a run-only athlete — the
   * 10-30 mi/wk single-sport runner this plan is FOR — arrived carrying two hard sessions they had
   * never picked. It was narrowed to the required two on 2026-08-26, and the same evening p119 made
   * all four required.
   *
   * ⛔ READING THE FRAME IS WHAT MADE THAT LAST CHANGE FREE. A spelled-out list here is a second
   * owner of the frame's membership, and it is how this went stale the first time.
   *
   * ⛔⛔ IT READS `frameSlots` DIRECTLY NOW, NOT `REQUIRED_SLOT_KEYS` (2026-08-30), and that is a
   * STRENGTHENING of this assertion rather than a relaxation of it. Two frames exist; the constant
   * is `strength_5k`'s membership, so a five-slot week auto-assigned only its first four and left
   * the fifth blank. The effect asks the CURRENT frame instead.
   * ⚠️ AND IT SKIPS A SLOT THE FRAME PRESCRIBES AS A RIDE when the athlete's single sport is running
   * — there is no ride-to-run conversion, so filling it with `run` would claim an answer the engine
   * would ignore. The assertion below still forbids a spelled-out list, which is the real rule.
   */
  assert(/for \(const k of fillable\) slots\[k\] = only;/.test(WIZARD),
    'the auto-assign no longer fills exactly the frame\'s own slots');
  assert(/frameSlots\(wizardFrame\)/.test(WIZARD),
    'the auto-assign no longer derives its slots from the frame');
  assertEquals(/const slots = \{ hard1: only, hard2: only/.test(WIZARD), false,
    'the auto-assign names its slots again instead of reading the frame');
});

Deno.test('⛔⛔ THE HOUR DIALS ARE NOT GATED BEHIND ANSWERING THE OTHER ROWS', () => {
  /**
   * ⛔ THE HOURS ARE THE PRIMARY THING THIS SCREEN COLLECTS and they did not exist until Recovery
   * and Long had both been expanded and answered — four taps, with Continue blocked the whole way.
   * The gate was `allSlotsChosen`, which is true of the CAPS line and was never true of the dial.
   *
   * ⚠️ AND THE SPORTS COME FROM THE POSTURE STEP, not from the slots. The hours are the week's
   * TOTAL; the slots are the structured sessions inside it — Michael's own line says so ("Your miles
   * and hours default to easy pace and recovery if none is picked"). Reading the slots is what left
   * a mixed athlete with no dials on arrival.
   */
  assert(/const sportsWithHours/.test(CARD), 'the dials lost their own gate');
  assert(/props\.allowedSports\?\.includes\(sp\)/.test(CARD),
    'the dials no longer read the posture answer — a mixed athlete sees none on arrival');
  assertEquals(/\{allSlotsChosen\(props\.slots\) && \(bounds\.runMilesInput/.test(CARD), false,
    'the dials are gated on every slot being answered again');
  /**
   * ⛔⛔ THE CAPS LINE IS DELETED, NOT GATED (Michael, 2026-08-30). Everything below is history.
   *
   * It printed the SUM of a sport's hard sessions — "The hard runs come to about 1h40" — beside a
   * chip printing the LONGEST single one, with nothing saying they were different quantities. Two
   * true numbers that cannot be reconciled by looking is what made the screen read as
   * self-contradictory, and counting the numbers on it is his acceptance test. The chip now carries
   * the session COUNT as well as the duration, so the sum has nothing left to add.
   *
   * ─────────────── history ───────────────
   * ⛔ AND THE CAPS LINE IS STILL GATED — it is genuinely summed from the slots.
   *   assert(/allSlotsChosen\(props\.slots\) && line \?/.test(CARD), …)
   */
  assertEquals(/data-testid=\{`\$\{sport\}-fixed-hours`\}/.test(CARD), false,
    'the fixed-hours sentence came back — the screen is printing a second number again');
});

Deno.test('⛔ THE RATE FOOTER IS GONE AND THE SPLIT LINE IS IN THE CARD', () => {
  // ⛔ Michael, 2026-08-26: "E kill it". The footer existed for the rate; the p247 split line that
  // shared it survived and moved beside the volume note, where the sentence it refines already is.
  assertEquals(/EnduranceWeekRate/.test(WIZARD), false, 'the rate footer is back in the wizard');
  assertEquals(/footer=\{<EnduranceWeekRate/.test(WIZARD), false, 'the footer prop is back');
  assert(/data-testid="upper-lower-split"/.test(CARD), 'the split line lost its home in the card');
  // ⚠️ AND IT SITS WITH THE VOLUME NOTE, not floating: the general claim then the specific one.
  const noteAt = CARD.indexOf('VOLUME_HONESTY_LINES.map');
  const splitAt = CARD.indexOf('data-testid="upper-lower-split"');
  assert(noteAt > 0 && splitAt > noteAt, 'the split line is not beside the volume note it refines');
});

Deno.test('⛔⛔ THE INTRO RENDERS AS TWO PARTS, AND THE PICKER LEADS WITH LONG', () => {
  /**
   * ⛔ THE SPLIT IS THE RULING, NOT A DECORATION (Michael, 2026-08-26). Three kinds of information
   * were at one visual weight — what the week IS, what a choice COSTS, and the instruction — and
   * the eye could not find the seams. Same words, same place, read as two things.
   */
  /**
   * ⚠️ THE NAMES CHANGED 2026-08-30, THE RULING DID NOT. The four lines are read off the CHOSEN
   * frame now (`introStructureFor` → `introLines`) because the constant was `strength_5k`'s and said
   * "4 endurance slots … Two hard sessions" above a five-row screen. Same two parts, same order.
   */
  assert(/introLines\[0\]/.test(CARD), 'the opening line is not rendered on its own');
  assert(/introLines\.slice\(1\)\.map/.test(CARD), 'the slots are not rendered as a list');
  assert(/ENDURANCE_WEEK_INTRO_CONSEQUENCE\.map/.test(CARD), 'the consequence lines are not rendered');
  // ⛔ AND THEY ARE SEPARATE ELEMENTS. One `.map` over all seven would be the wall this replaced.
  assertEquals(/ENDURANCE_WEEK_INTRO\.map/.test(CARD), false, 'the block was flattened back into one list');

  /**
   * ⛔⛔ THE CONSEQUENCE LINES STAY AT THE TOP. Michael ruled out moving them onto the hard-session
   * card: *"they already went into the restaurant so they will feel they should order something"* —
   * by the time that card opens the athlete has committed. ⚠️ THIS IS THE ASSERTION THAT STOPS THE
   * TIDY-UP: a later pass will want them "beside the control they are about".
   */
  const introAt = CARD.indexOf('ENDURANCE_WEEK_INTRO_CONSEQUENCE.map');
  // ⚠️ `rowKeys` IS THE FRAME'S OWN DRAW ORDER — see `displayOrderFor`.
  const requiredAt = CARD.indexOf('rowKeys.map');
  assert(introAt > 0 && requiredAt > 0);
  // ⚠️ MEASURED AGAINST THE **ROWS**. The lines have to be read BEFORE the athlete is among the
  // choices at all, not sitting immediately on top of the control they are about.
  assert(requiredAt > introAt, 'the consequence lines dropped below the picker rows');

  /**
   * ⛔⛔ THE ADD CONTROL AND THE DISMISS ARE DELETED, NOT HIDDEN (2026-08-26 evening, p119). Both
   * quality sessions are the frame's — Michael: *"lets not make them optional that was not
   * understanding things on my part"* — so the screen is one block of four required rows.
   * ⚠️ ASSERTED ABSENT, because a partial restoration is the failure mode: an X on one row, or an
   * add control for a slot the frame already owns.
   */
  assertEquals(/data-testid="add-hard-session"/.test(CARD), false, 'the opt-in add control is back');
  assertEquals(/data-testid={`dismiss-hard-/.test(CARD), false, 'a required row can be emptied again');
  assertEquals(/restoreOnDismiss/.test(CARD), false, 'the add-then-undo state is back');
  // ⛔ AND ONE LIST DRAWS ALL FOUR — a second `.map` over the hard slots is the two-block screen.
  assertEquals(/HARD_SLOT_KEYS\.filter/.test(CARD), false, 'the hard rows are drawn as a separate block again');

  // ⛔ AND THE SUPERSEDED PARAGRAPHS ARE GONE FROM THE SCREEN.
  assertEquals(/HARD_SESSIONS_OPT_IN_LINE/.test(CARD), false, 'the old opt-in paragraph is back');
  assertEquals(/ENDURANCE_WEEK_PREAMBLE/.test(CARD), false, 'the old first paragraph is back');
});

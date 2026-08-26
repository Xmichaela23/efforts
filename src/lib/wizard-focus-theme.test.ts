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

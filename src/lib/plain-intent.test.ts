/**
 * ⛔ WESTSIDE SHORTHAND NEVER REACHES A LIFTER (2026-08-28).
 *
 *   ~/.deno/bin/deno test --no-check src/lib/plain-intent.test.ts
 *
 * The mapping existed from 2026-08-25 and was used in ONE place — the week overview grid — so the
 * logger header, the calendar and the plan download screen all still printed `DE: Upper` at the
 * athlete. That is what Michael saw on a device. These fixtures pin the mapping AND the fact that it
 * has one owner, because the failure was never the two lines being wrong; it was them being private.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { INTENT_WORD, plainIntent } from './plain-intent.ts';

Deno.test('the pair, and both halves of it', () => {
  assertEquals(plainIntent('ME: Upper'), 'Heavy: Upper');
  assertEquals(plainIntent('DE: Lower'), 'Speed: Lower');
  // ⚠️ BOTH OR NEITHER. Renaming one and leaving the other reads as two different kinds of thing on
  // the same week; they are one axis with two ends.
  assertEquals(Object.keys(INTENT_WORD).sort(), ['DE', 'ME']);
});

Deno.test('⚠️ THE "Strength — " PREFIX IS HANDLED, and that is not cosmetic', () => {
  /**
   * ⛔ THE ORIGINAL TWO-LINER ANCHORED ON `^(ME|DE):`. Some surfaces render the composer's label as
   * `Strength — ME: Upper`, where that anchor cannot match — so a surface could be wired to the
   * helper, look correct in review, and still print the shorthand. The prefix is put back rather
   * than stripped, so nothing but the two letters ever changes.
   */
  assertEquals(plainIntent('Strength — ME: Upper'), 'Strength — Heavy: Upper');
  assertEquals(plainIntent('Strength - DE: Lower'), 'Strength - Speed: Lower');
  assertEquals(plainIntent('Strength – DE: Lower'), 'Strength – Speed: Lower');
});

Deno.test('⛔ TOTAL AND IDEMPOTENT — it cannot damage a string it does not recognise', () => {
  // A display helper called from a render path must be safe on every input that reaches it.
  assertEquals(plainIntent('Heavy: Upper'), 'Heavy: Upper', 'not idempotent');
  assertEquals(plainIntent('Test: Upper'), 'Test: Upper', '`Test:` is already the plain word');
  assertEquals(plainIntent('Long Run'), 'Long Run');
  assertEquals(plainIntent(''), '');
  assertEquals(plainIntent(null), '');
  assertEquals(plainIntent(undefined), '');
  // ⚠️ ONLY AT THE START, AND ONLY THE LABEL. A movement name that happens to contain the letters
  // must survive — "ME" is also two thirds of a lot of English.
  assertEquals(plainIntent('Bench Press (ME: reference)'), 'Bench Press (ME: reference)');
  assertEquals(plainIntent('DEADLIFT'), 'DEADLIFT');
});

Deno.test('⛔ ONE OWNER — no surface may re-declare the mapping', async () => {
  /**
   * ⛔ THE ACTUAL DEFECT, AS A GATE. Two private lines used in one file is how three other surfaces
   * kept printing the shorthand for three days. The repair everyone reaches for is pasting them into
   * the other files, and this codebase has paid for that repeatedly — six private exercise
   * classifiers in the audit, the rest timer as a seventh, the plyo regex an eighth, the logger's
   * bodyweight test a fifth answer to a question three files already held.
   */
  const roots = ['../components', '../lib', '../pages'];
  const offenders: string[] = [];
  for (const root of roots) {
    let dir: URL;
    try {
      dir = new URL(`${root}/`, import.meta.url);
      Deno.statSync(dir);
    } catch {
      continue; // a directory this repo does not have is not a failure
    }
    for await (const entry of walk(dir)) {
      if (entry.endsWith('plain-intent.ts') || entry.endsWith('plain-intent.test.ts')) continue;
      const src = await Deno.readTextFile(entry);
      // The mapping itself, in any of the shapes someone would write it.
      if (/ME:\s*'Heavy'|'Heavy'\s*,\s*DE|DE:\s*'Speed'/.test(src)) offenders.push(entry);
    }
  }
  assertEquals(offenders, [], 'the Heavy/Speed mapping was re-declared outside `plain-intent.ts`');
});

async function* walk(dir: URL): AsyncGenerator<string> {
  for await (const e of Deno.readDir(dir)) {
    const child = new URL(`${e.name}${e.isDirectory ? '/' : ''}`, dir);
    if (e.isDirectory) yield* walk(child);
    else if (/\.tsx?$/.test(e.name)) yield child.pathname;
  }
}

Deno.test('⛔ EVERY SURFACE THAT PRINTS A SESSION NAME ASKS FOR IT', async () => {
  /**
   * ⚠️ A UNIT TEST CANNOT RENDER THESE COMPONENTS, so this asserts the import rather than the
   * output — which is the shape of the failure. The defect was never a wrong string; it was a
   * surface that never called the helper at all.
   */
  for (const file of SURFACES) {
    const src = await Deno.readTextFile(new URL(`../${file}`, import.meta.url));
    assert(src.includes('plainIntent'), `${file} prints a session name without asking plainIntent`);
  }
});

/**
 * ⛔ ADD A ROW WHEN A NEW SURFACE PRINTS A STRENGTH SESSION NAME. That is the whole maintenance.
 *
 * ⚠️ `lib/derive-workout-title.ts` IS THE IMPORTANT ONE and it is why this list is short. It calls
 * itself the single source of truth for display titles, and mapping there covers the plan detail
 * list, the Today card, the planned drawer and the full planned screen in one place — every surface
 * that goes through `deriveWorkoutTitle` is mapped without appearing here.
 *
 * ⚠️ THE REST OF THIS LIST IS THE SURFACES THAT PRINT `workout.name` RAW, which is the shape of the
 * original defect: a screen that never asked anybody.
 */
const SURFACES = [
  'lib/derive-workout-title.ts',
  'components/WeekGrid.tsx',
  'components/StrengthLogger.tsx',
  'components/AllPlansInterface.tsx',
  'components/RescheduleValidationPopup.tsx',
  'components/UnifiedWorkoutView.tsx',
];

/**
 * ⚠️ KNOWN STILL-UNMAPPED, RECORDED RATHER THAN QUIETLY LEFT (2026-08-28). Each prints a raw
 * `workout.name` in a low-traffic confirmation or an accessibility label. None is on the path an
 * athlete reads mid-session, which is why they are not in `SURFACES` yet — but "not yet" is a
 * decision and it belongs in writing, not in nobody's head:
 *
 *   · `WorkoutDetail.tsx:202` — the delete confirm, `Delete "{workout.name}"?`
 *   · `TodaysEffort.tsx:2187` → `planned/SkipSessionReasonPanel.tsx:111` — the skip panel's title
 *   · `TodaysEffort.tsx:2145`, `UnifiedWorkoutView.tsx:547` — the pairing/conflict sentence's label
 *   · `AppLayout.tsx:1844` → `PostWorkoutFeedback.tsx:520` — the post-workout feedback header
 *   · `context/StateTab.tsx:1836` — the NEXT chip
 *   · `SessionNarrative.tsx:141` — `NextUp`, whose name is SERVER-supplied
 *     (`session_detail_v1.next_session.name`) and therefore cannot be fixed on the client at all
 *   · `AssociatePlannedDialog.tsx:238, :261` — the planned-session picker
 */

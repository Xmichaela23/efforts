/**
 * The synthetic-athlete harness, as assertions (SPEC-strength-language, Step 2).
 *
 *   deno test --allow-read src/lib/strength-language.harness.test.ts --no-check
 *
 * ⛔ THESE READ THE ASSEMBLED ROW, NOT A PIECE OF IT. `computeLiftVerdict` already had unit tests
 * and they all passed while a red "back off weight" sat on Michael's Hip Thrust — because the bug
 * was in what the row DID with a correct verdict. Every assertion below runs the real server
 * computation into the real client composition and reads the sentence.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { ATHLETES, renderAthlete } from './strength-language.harness.ts';
import { containsCommand } from './strength-row-text.ts';
import type { ExerciseType } from './exercise-role.ts';

Deno.test('⛔ THE INVARIANT — no uncoached movement carries a command, on any athlete', () => {
  for (const a of ATHLETES) {
    for (const { lift, row } of renderAthlete(a)) {
      if (row.coached) continue;
      const name = String((lift as { display_name?: string }).display_name ?? '');
      assert(
        !containsCommand(row.text),
        `${a.name}: "${name}" (${row.type}) is not coached but its row says "${row.text}"`,
      );
    }
  }
});

Deno.test('⛔ AND NO UNCOACHED ROW IS TAPPABLE OR TONED', () => {
  for (const a of ATHLETES) {
    for (const { lift, row } of renderAthlete(a)) {
      if (row.coached) continue;
      const name = String((lift as { display_name?: string }).display_name ?? '');
      // The adjust modal writes a prescribed weight. Offering it for a movement we decline to coach
      // would be a command with extra steps.
      assertEquals(row.tappable, false, `${a.name}: "${name}" must not open the adjust modal`);
      // A colour is a claim. Amber on a row whose sentence we removed is the alarm without the words.
      assertEquals(row.tone, 'neutral', `${a.name}: "${name}" must render neutral`);
    }
  }
});

Deno.test('⛔ SILENCE IS NOT BLANKET — main lifts still get coached', () => {
  // The failure mode opposite to the bug: gate too wide and the strength card says nothing at all.
  const coachedTexts: string[] = [];
  for (const a of ATHLETES) {
    for (const { row } of renderAthlete(a)) {
      if (row.coached && row.text) coachedTexts.push(row.text);
    }
  }
  assert(coachedTexts.length >= 10, `expected coached rows to still speak, got ${coachedTexts.length}`);
  // …and the commands still reach the lifts they were written for.
  assert(coachedTexts.some((t) => t.includes('back off weight')), 'the back-off verdict never fired');
  assert(coachedTexts.some((t) => t.includes('add to') || t.includes('→')), 'progression never fired');
  assert(coachedTexts.some((t) => t.includes('vs your')), 'the anchor sentence never rendered');
});

Deno.test('⛔ THE STALE CACHE CASE — a pre-D-373 payload cannot put its command back on screen', () => {
  const stale = ATHLETES.find((a) => a.name.startsWith('A11'))!;
  const rows = renderAthlete(stale);
  assert(rows.length === 3, 'expected the three cached accessory rows');
  for (const { lift, row } of rows) {
    const name = String((lift as { display_name?: string }).display_name ?? '');
    // Every one of these arrives carrying a live verdict_label and (for two of them) a suggestion.
    assertEquals(row.coached, false, `${name} must not be coached`);
    assert(!containsCommand(row.text), `${name} leaked "${row.text}" out of the cache`);
  }
  // ⚠️ The OLD client rule was `verdict_label !== ''`. Every one of these rows has a non-empty
  // label, so the old rule would have rendered all three commands verbatim. That is the regression
  // this test exists for.
});

Deno.test('the harness actually covers every type row', () => {
  const seen = new Set<ExerciseType>();
  for (const a of ATHLETES) for (const { row } of renderAthlete(a)) seen.add(row.type);
  for (const t of ['barbell_main', 'loaded_accessory', 'bodyweight', 'plyo', 'isometric', 'mobility', 'carry', 'band'] as ExerciseType[]) {
    assert(seen.has(t), `no synthetic athlete exercises the '${t}' row — the harness has a hole`);
  }
});

Deno.test('every week intent is exercised, including the phase branches', () => {
  const intents = new Set(ATHLETES.map((a) => a.weekIntent));
  for (const i of ['base', 'build', 'recovery', 'taper', 'peak']) {
    assert(intents.has(i), `no athlete runs the '${i}' branch of computeLiftVerdict`);
  }
});

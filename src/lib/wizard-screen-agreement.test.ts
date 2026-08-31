/**
 * ⛔⛔ WHAT THE SCREEN COMPOSES FROM A CHOSEN FOCUS — the test that would have caught it (2026-08-30).
 *
 * ⛔ TWICE NOW A GREEN SUITE HAS MISSED A LIVE DEFECT ON THIS PATH, and both times for the same
 * reason: the tests asserted the MODULE that had just been changed, never the composition an actual
 * screen performs from the athlete's choice.
 *   · the tap landed on the 5K path's tier screen while four "the focus travels" tests passed.
 *   · the endurance screen rendered FOUR rows while its blocked-Continue sentence named FIVE, and a
 *     five-row acceptance test passed the whole time — it called `frameSlots('all_rounder')`
 *     directly, which is not what the card did. The card read module constants bound to one frame.
 *
 * ⛔ SO THIS FILE STARTS WHERE THE ATHLETE STARTS — a focus — and walks the SAME derivations the
 * screens walk. If a screen ever reads a constant instead of the frame again, the numbers here stop
 * agreeing with each other.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  allSlotsChosen,
  displayOrderFor,
  emptySlotSports,
  frameSlots,
  hardSlotKeysFor,
  introStructureFor,
  slotKeysFor,
  slotOptionsNow,
  unansweredLine,
  unansweredSlots,
} from './standing-plan-week-copy.ts';
import { builtFamily, experienceChips, familyMapFor, slotsForEngine } from './standing-plan-week-bounds.ts';
import {
  hardSlotDefault, slotFamilyFact, slotFamilyFor, slotVariantOptions,
} from './hard-slot-choices.ts';
import { FAMILIES } from '../../supabase/functions/_shared/endurance-library/index.ts';
import { FRAMES, type FrameId } from '../../supabase/functions/_shared/standing-plan/frames.ts';

/** ⛔ THE ONE MAPPING THE WIZARD USES. A second copy here would defeat the point of the file. */
const FOCUS_FRAME: Record<'standard' | 'run', FrameId> = {
  standard: 'all_rounder',
  run: 'strength_5k',
};

/** Everything the endurance screen derives, from a focus — in the order the card derives it. */
function screenFor(focus: 'standard' | 'run') {
  const frame = FOCUS_FRAME[focus];
  const rows = displayOrderFor(frame);
  const empty = emptySlotSports(frame);
  return {
    frame,
    rows,
    intro: introStructureFor(frame),
    hardRows: hardSlotKeysFor(frame),
    blockedNames: unansweredSlots(empty, frame),
    blockedLine: unansweredLine(empty, frame) ?? '',
    complete: allSlotsChosen(
      Object.fromEntries(slotKeysFor(frame).map((k) => [k, 'run'])) as never,
      frame,
    ),
    payloadKeys: Object.keys(slotsForEngine(
      Object.fromEntries(slotKeysFor(frame).map((k) => [k, 'run'])) as never,
      frame,
    )),
    programmeName: FRAMES[frame].displayName ?? null,
  };
}

Deno.test('⛔⛔ THE ROWS, THE HEADER AND THE BLOCKED SENTENCE ALL COUNT THE SAME WEEK', () => {
  for (const focus of ['run', 'standard'] as const) {
    const s = screenFor(focus);
    /**
     * ⛔ THIS IS THE EXACT CONTRADICTION MICHAEL SAW. The header said four, four rows drew, and the
     * blocked sentence named five — so Continue was disabled and could not be satisfied, because the
     * fifth row it demanded was not on the screen.
     */
    assertEquals(s.rows.length, s.blockedNames.length,
      `${focus}: ${s.rows.length} rows drawn but ${s.blockedNames.length} named as unanswered`);
    assertEquals(s.rows.length, s.payloadKeys.length,
      `${focus}: the screen draws ${s.rows.length} rows and sends ${s.payloadKeys.length} answers`);
    assert(s.intro[0].includes(String(s.rows.length)),
      `${focus}: the header says "${s.intro[0]}" above ${s.rows.length} rows`);
    // ⛔ AND EVERY NAMED ROW IS A ROW THAT EXISTS — the fifth name with no fifth row is the defect.
    for (const k of s.blockedNames) {
      assert(s.rows.includes(k), `${focus}: the blocked sentence names ${k}, which is not drawn`);
    }
    // ⚠️ ANSWERING EVERY DRAWN ROW MUST SATISFY THE GATE. If it does not, the screen is a dead end.
    assert(s.complete, `${focus}: every row answered and Continue is still blocked`);
    assertEquals(unansweredLine(
      Object.fromEntries(slotKeysFor(s.frame).map((k) => [k, 'run'])) as never, s.frame), null);
  }
});

Deno.test('⛔ THE 5K SCREEN IS UNCHANGED — its four rows, its header, his wording', () => {
  const s = screenFor('run');
  assertEquals(s.rows, ['long', 'easy', 'hard1', 'hard2']);
  assertEquals(s.hardRows, ['hard1', 'hard2']);
  // ⛔ MICHAEL'S OWN FOUR LINES, BYTE-IDENTICAL. The frame-aware version must reproduce them exactly.
  assertEquals(s.intro, [
    'Your week has 4 endurance slots.',
    'One long session',
    'One easy session',
    'Two hard sessions',
  ]);
  assertEquals(s.payloadKeys, ['1:0', '3:0', '4:0', '6:0']);
  // ⚠️ AND IT CARRIES NO ATHLETE-FACING PROGRAMME NAME — it falls through to the goal's label, which
  // is what every screen on that path already prints.
  assertEquals(s.programmeName, null);
});

Deno.test('⛔ STANDARD FOCUS DRAWS ITS OWN FIVE, AND SAYS SO', () => {
  const s = screenFor('standard');
  assertEquals(s.rows, ['long', 'easy', 'hard1', 'hard2', 'hard3']);
  assertEquals(s.hardRows, ['hard1', 'hard2', 'hard3']);
  assertEquals(s.intro, [
    'Your week has 5 endurance slots.',
    'One long session',
    'One easy session',
    'Three hard sessions',
  ]);
  assertEquals(s.payloadKeys, ['1:0', '2:0', '3:0', '4:0', '6:0']);
  assertEquals(s.programmeName, 'Standard Focus');
  // ⛔ AND THE BLOCKED SENTENCE NAMES ALL FIVE, in the order they are drawn.
  assert(/hard session 3/.test(s.blockedLine), `the blocked line lost a row: ${s.blockedLine}`);
});

Deno.test('⛔⛔ NO SCREEN IMPORTS A FRAME-BOUND SLOT CONSTANT', () => {
  /**
   * ⛔ THE LINT THAT CLOSES THE CLASS. `SLOT_KEYS`, `SLOT_LABEL`, `SLOT_OPTIONS`,
   * `REQUIRED_SLOT_KEYS`, `REQUIRED_SLOT_DISPLAY_ORDER`, `HARD_SLOT_KEYS`, `SLOT_FAMILY` and
   * `SLOT_FRAME_KEY` are all ONE frame's membership, computed at module load. A screen that imports
   * one cannot be told apart, at the call site, from a screen that asks the frame — which is exactly
   * how the endurance card came to draw four rows while its own gate demanded five.
   *
   * ⚠️ THE CONSTANTS ARE NOT DELETED. Non-screen callers that genuinely mean "the 5K frame" still
   * use them, and deleting them would be a much larger change than the defect warrants. What is
   * forbidden is a SCREEN reading one.
   */
  const FORBIDDEN = [
    'SLOT_KEYS', 'SLOT_LABEL', 'SLOT_OPTIONS', 'REQUIRED_SLOT_KEYS',
    'REQUIRED_SLOT_DISPLAY_ORDER', 'HARD_SLOT_KEYS', 'SLOT_FAMILY', 'SLOT_FRAME_KEY',
  ];
  const card = Deno.readTextFileSync(new URL('../components/EnduranceWeekCard.tsx', import.meta.url));
  // ⚠️ THE IMPORT LIST ONLY — a prose mention in a comment is a pointer, not a read.
  const imports = card.slice(0, card.indexOf('export ')).split('\n')
    .filter((l) => /^\s+[A-Z_]+,\s*$/.test(l)).map((l) => l.trim().replace(',', ''));
  for (const name of FORBIDDEN) {
    assert(!imports.includes(name),
      `EnduranceWeekCard imports ${name} — that is one frame's slot list, not the chosen frame's`);
  }
});

Deno.test('⛔⛔ EVERY ROW OF EVERY FRAME RESOLVES THROUGH EVERY LOOKUP THE TAP PATH USES', () => {
  /**
   * ⛔⛔ THIS IS THE TEST FOR THE BLANK SCREEN (2026-08-30). Michael answered the FIFTH endurance row
   * on Standard Focus and the whole app went white:
   *
   *     TypeError: undefined is not an object (evaluating 'cr.family')
   *
   * The wizard's fixed-hours sentence walked the CHOSEN frame's row keys and looked each one up in
   * `SLOT_FAMILY` — the 5K frame's FOUR-entry map. `SLOT_FAMILY['hard3']` is undefined, `.family` on
   * it throws, and it throws inside a render path so the page has nothing to draw. It only runs once
   * EVERY row is answered, which is why it landed on the fifth tap rather than the first.
   *
   * ⛔ SO THE ASSERTION IS NOT ABOUT THAT ONE MAP. Every frame-keyed lookup on the tap path is walked
   * with every row key of every frame. A four-entry structure indexed by a five-row frame is the
   * shape, and this catches it wherever it is — including in a lookup written next week.
   *
   * ⚠️ IT THROWS RATHER THAN RETURNING FALSE, deliberately: the failure being reproduced IS a throw,
   * so a lookup that starts returning undefined again fails here exactly as the app failed.
   */
  for (const frame of ['strength_5k', 'all_rounder'] as const) {
    const families = familyMapFor(frame);
    for (const key of slotKeysFor(frame)) {
      const slot = frameSlots(frame).find((x) => x.key === key);
      assert(slot, `${frame}/${key}: the frame's own row is missing from frameSlots`);

      // ⛔ THE CRASHING READ, EXACTLY AS THE WIZARD MAKES IT.
      const fam = families[key];
      assert(fam, `${frame}/${key}: no family — this is the read that blanked the app`);
      assert(fam.family, `${frame}/${key}: the family entry carries no family`);

      for (const sport of ['run', 'ride'] as const) {
        // ⚠️ A ROW THE FRAME PRESCRIBES AS A RIDE HAS NO RUN ANSWER, and the screen offers none.
        const offered = slotOptionsNow(key, emptySlotSports(frame), frame)
          .options.map((o) => o.value);
        if (!offered.includes(sport)) continue;

        const built = builtFamily(fam, sport);
        assert(built?.family, `${frame}/${key}/${sport}: resolves to no family`);
        assert(FAMILIES[built.family], `${frame}/${key}/${sport}: ${built.family} is not a real family`);

        if (slot.role === 'hard') {
          const hk = key as 'hard1' | 'hard2' | 'hard3';
          // ⚠️ THESE THREE FAILED QUIETLY RATHER THAN LOUDLY — an empty variant menu and a missing
          // session title on the third row. Same map, same defect, no crash to find it by.
          assert(slotFamilyFor(hk, sport, frame), `${frame}/${key}/${sport}: no slot family`);
          assert(slotVariantOptions(hk, sport, frame).length > 0,
            `${frame}/${key}/${sport}: the variant menu is empty`);
          assert(slotFamilyFact(hk, sport, frame), `${frame}/${key}/${sport}: no session fact`);
          assert(hardSlotDefault(sport, hk, frame).role,
            `${frame}/${key}/${sport}: no default session`);
        }
      }
    }
  }
});

Deno.test('⛔ THE WIZARD DOES NOT INDEX A FRAME-BOUND MAP BY A FRAME\'S ROW KEYS', () => {
  /**
   * ⛔ THE IMPORT LINT, EXTENDED TO THE BUILDER. `SLOT_FAMILY` and `SLOT_FRAME_KEY` are the 5K
   * frame's four rows; the builder imported the first and indexed it by the chosen frame's keys.
   * ⚠️ `SLOT_KEYS` / `HARD_SLOT_KEYS` / `REQUIRED_SLOT_KEYS` are still imported there — they are
   * unused by the live paths and their removal is a tidy-up, not a fix — but nothing may INDEX a
   * frame-bound map, which is what this asserts.
   */
  const wizard = Deno.readTextFileSync(new URL('../components/NonRaceBuilder.tsx', import.meta.url));
  const code = wizard.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\/.*$/gm, '');
  for (const name of ['SLOT_FAMILY', 'SLOT_FRAME_KEY', 'HARD_SLOT_RUN_FAMILY']) {
    assert(!new RegExp(`${name}\\s*\\[`).test(code),
      `NonRaceBuilder indexes ${name}, which holds one frame's rows`);
  }
});

Deno.test('⛔⛔ EVERY CHIP THE SCREEN DRAWS SAYS SOMETHING, ON EVERY FRAME', () => {
  /**
   * ⛔ WHAT MICHAEL SAW, LIVE. The two riding chips on Standard Focus rendered as bare
   * "Less experienced" / "More experienced" — no session count, no duration — while the running pair
   * beside them read correctly, and he could not answer the riding question, so Continue stayed
   * blocked on "riding experience has no answer yet".
   *
   * ⛔ THE CAUSE WAS A MODULE CONSTANT AGAIN. `specFor` took each row's session SHAPE from a table
   * built out of `strength_5k`, then indexed it by the chosen frame's row keys — so p274's ride row
   * was handed the 5K frame's day-3 RUN archetype, its ladder came back empty, and the chip lost its
   * duration. The line prints the count and the duration together, so losing one loses both and the
   * chip falls back to its label alone.
   *
   * ⚠️ A BARE LABEL IS LEGITIMATE IN ONE CASE and this test must not forbid it: a sport that fills no
   * HARD slot has no duration to state, which is `strength_5k` with both quality rows on the run and
   * only the long session on the bike. So the assertion is "if this sport has a hard row, the chip
   * carries its number", not "every chip is long".
   */
  for (const focus of ['run', 'standard'] as const) {
    const frame = FOCUS_FRAME[focus];
    const answers: Record<string, string> = {};
    for (const k of slotKeysFor(frame)) {
      const offered = slotOptionsNow(k, emptySlotSports(frame), frame).options.map((o) => o.value);
      answers[k] = offered.includes('run') ? 'run' : 'ride';
    }
    answers.long = 'ride';
    const chips = experienceChips(answers as never, {
      baselines: { performance_numbers: { easyPace: 540, ftp: 220 } } as never,
      frame,
    });
    for (const sport of ['run', 'ride'] as const) {
      const pair = chips[sport];
      // ⚠️ NO CHIP AT ALL is right for a sport with no slot — nothing to size.
      const hasSlot = frameSlots(frame).some((s) => answers[s.key] === sport);
      if (!hasSlot) { assert(!pair, `${focus}/${sport}: a chip for a sport with no session`); continue; }
      assert(pair, `${focus}/${sport}: no chip for a sport that fills a slot`);
      const hardRows = frameSlots(frame)
        .filter((s) => s.role === 'hard' && answers[s.key] === sport).length;
      assertEquals(pair.newer.hardCount, hardRows,
        `${focus}/${sport}: the chip counts ${pair.newer.hardCount} hard sessions, the week has ${hardRows}`);
      if (hardRows > 0) {
        // ⛔ THE NUMBER THE ATHLETE PICKS BETWEEN. Null here is the empty chip he could not read.
        assert(pair.newer.longestMin != null && pair.newer.longestMin > 0,
          `${focus}/${sport}: the chip has ${hardRows} hard session(s) and no duration`);
        assert(pair.experienced.longestMin != null && pair.experienced.longestMin > 0,
          `${focus}/${sport}: the experienced chip has no duration`);
      }
    }
  }
});

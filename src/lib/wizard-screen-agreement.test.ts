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
  unansweredLine,
  unansweredSlots,
} from './standing-plan-week-copy.ts';
import { slotsForEngine } from './standing-plan-week-bounds.ts';
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

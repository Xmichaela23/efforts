// ============================================================================
// THE GATE — stage 5: the endurance-week screen's copy, its bounds, and the wire.
//
// ⚠️ EVERY ASSERTION HERE WAS MUTATION-TESTED. See
// `docs/NOTES-stage5-endurance-week-2026-08-24.md`.
//
// Run: deno test --no-check --allow-read --allow-env src/lib/standing-plan-week-copy.test.ts
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
// ⚠️ A NAMESPACE IMPORT ALONGSIDE THE NAMED ONES, so the kill-pin below can assert an ABSENCE. A
// named import of a deleted symbol is a module-load error, not a failing assertion — it would take
// the whole file down instead of naming what came back.
import * as api from './standing-plan-week-copy.ts';
import { voiceViolation } from '../../supabase/functions/_shared/state-trend/week-accent.ts';
import { SLOT_FAMILY, SLOT_FRAME_KEY, boundsLine, slotsForEngine, weekBounds } from './standing-plan-week-bounds.ts';
import { sessionDurationBandSeconds } from '../../supabase/functions/_shared/endurance-library/index.ts';
import {
  ENDURANCE_WEEK_HEADER,
  LIFTING_RATE_TIERS_ARE_OURS,
  LONG_SLOT_NOTE,
  SLOT_KEYS,
  SLOT_LABEL,
  SLOT_OPTIONS,
  ENDURANCE_WEEK_INTRO,
  ENDURANCE_WEEK_INTRO_CONSEQUENCE,
  ENDURANCE_WEEK_INTRO_STRUCTURE,
  REQUIRED_SLOT_DISPLAY_ORDER,
  RUN_TAX_LINES,
  slotSummary,
  allSlotsChosen,
  defaultSportForAddedSlot,
  HARD_SLOT_KEYS,
  MAX_HARD_SESSIONS,
  REQUIRED_SLOT_KEYS,
  hardSessionCount,
  emptySlotSports,
  unansweredLine,
  unansweredSlots,
  liftingRateTier,
  upperLowerSplitLine,
  type SlotKey,
  type SlotSport,
} from './standing-plan-week-copy.ts';

const mix = (hard1: SlotSport, hard2: SlotSport, easy: SlotSport = 'run', long: SlotSport = 'run') =>
  ({ hard1, hard2, easy, long }) as Record<SlotKey, SlotSport>;

// ════════════════════════════════════════════════════════════════════════════════════════════════
// A — MICHAEL'S HEADER IS VERBATIM
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test("the header is Michael's copy, word for word", () => {
  /**
   * ⛔ VERBATIM (2026-08-24). Not paraphrased, not re-voiced, not trimmed. This test exists because
   * every other athlete-facing string in this repo goes through a voice gate that would happily
   * "improve" his sentences — and his are the specification.
   */
  // First line superseded by Michael 2026-08-25: "Add your regular weekly endurance here."
  assertEquals(ENDURANCE_WEEK_HEADER, [
    'Add your regular weekly endurance here.',
    '4 sessions:',
    '2 sessions to maintain speed, VO2 max or power',
    '1 recovery session',
    '1 long session',
    'Running is the most taxing on your system — the more running, the more your strength progress may slow.',
    'Cycling is more forgiving when working concurrently with strength.',
  ]);
  assertEquals(LONG_SLOT_NOTE, 'one per week, run or ride');

  /**
   * ⛔ THE PREAMBLE IS ONE SENTENCE (Michael, 2026-08-24 evening — supersedes the same-day split).
   * Lines 1–4 (the "4 sessions" list) are RETIRED from the screen on his instruction: the four slot
   * rows carry the same words as their labels, so the list was the rows said twice. The header above
   * stays whole as the one verbatim source; the tax lines still render inside the hard rows.
   */
  assertEquals(RUN_TAX_LINES, [ENDURANCE_WEEK_HEADER[5], ENDURANCE_WEEK_HEADER[6]]);
});

Deno.test('the four slots are the four the frame has, labelled as the athlete sees them', () => {
  assertEquals(SLOT_KEYS, ['hard1', 'hard2', 'easy', 'long']);
  /**
   * ⛔ NEVER "Hard 1 / Hard 2" ON A SCREEN (Michael, 2026-08-24). Those are internal keys; an athlete
   * has two hard sessions, not a first and a second. The labels are the ones his own preamble uses.
   */
  // ⛔ NUMBERED (Michael, 2026-08-24 — supersedes the earlier "never show Hard 1/2"). With the rows
  // starting empty, two identical labels are two identical rows.
  assertEquals(SLOT_LABEL.hard1, 'Hard session 1');
  assertEquals(SLOT_LABEL.hard2, 'Hard session 2');
  assertEquals(SLOT_LABEL.easy, 'Recovery session');
  assertEquals(SLOT_LABEL.long, 'Long session');
  // ⛔ A COLLAPSED ROW STATES ITS WHOLE ANSWER — the screen opens finished.
  assertEquals(slotSummary('hard1', 'ride', 'Sustained threshold'), 'Hard session 1 · Ride · Sustained threshold');
  assertEquals(slotSummary('easy', 'run'), 'Recovery session · Run');
  assertEquals(slotSummary('long', 'ride'), 'Long session · Long ride');
  // ⛔ AN UNANSWERED ROW IS ITS LABEL ALONE — no sport, and nothing invented to fill the gap.
  assertEquals(slotSummary('hard1', null), 'Hard session 1');
  assertEquals(slotSummary('long', null), 'Long session');
  // ⛔ THE LONG SLOT OFFERS BOTH, and its own note says so — p275's permission.
  assertEquals(SLOT_OPTIONS.long.map((o) => o.label), ['Long run', 'Long ride']);
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// B — THE PRE-FILL AND THE DERIVED MIX
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('every row starts neutral, and Continue waits only on the frame\'s own two', () => {
  /**
   * ⛔ MICHAEL, 2026-08-24 — **supersedes the pre-fill**. It put both hard slots on the bike before
   * the athlete had said anything, which made a screen full of decisions look like a screen full of
   * answers; an athlete who scrolled past it had a mix nobody chose.
   *
   * ⛔⛔ AND MICHAEL, 2026-08-25 — **hard sessions are OPT-IN, up to two, default ZERO.** This test
   * was called *"Continue is gated on all four"* and that is exactly what had to change: gating on
   * the hard slots makes the default path unreachable, and the screen would sit naming two rows as
   * missing that the athlete deliberately left alone. An empty hard slot is a complete answer.
   */
  const empty = emptySlotSports();
  assertEquals(empty, { hard1: null, hard2: null, easy: null, long: null });
  assert(!allSlotsChosen(empty), 'an untouched screen let Continue through');
  // ⛔ ONLY THE REQUIRED TWO ARE EVER "UNANSWERED". The hard slots are never named as missing.
  assertEquals(unansweredSlots(empty), REQUIRED_SLOT_KEYS);
  assert(!unansweredSlots(empty).some((k) => HARD_SLOT_KEYS.includes(k)),
    'an unadded hard session was reported as a missing answer');

  const partial = { ...empty, hard1: 'ride' as const, easy: 'run' as const };
  assert(!allSlotsChosen(partial), 'a week with no long session let Continue through');
  assertEquals(unansweredSlots(partial), ['long']);

  // ⛔ THE DEFAULT PATH: no hard sessions at all, and the week is complete.
  const zeroHard = { hard1: null, hard2: null, easy: 'run', long: 'run' } as const;
  assert(allSlotsChosen(zeroHard), 'the zero-hard default could not reach Continue');
  assertEquals(unansweredLine(zeroHard), null, 'the default week named something missing');
  assertEquals(hardSessionCount(zeroHard), 0);

  const full = { hard1: 'ride', hard2: 'ride', easy: 'run', long: 'run' } as const;
  assert(allSlotsChosen(full));
  assertEquals(hardSessionCount(full), MAX_HARD_SESSIONS);
  assertEquals(unansweredLine(full), null, 'a finished week still named something missing');
});

Deno.test('⛔⛔ MICHAEL\'S INTRO, VERBATIM — every character his', () => {
  /**
   * ⛔ SHIP IT AS WRITTEN (2026-08-26). His capitalisation, his missing full stops, "weightloads" as
   * one word, and the double space in "4  endurance". ⚠️ THE DOUBLE SPACE COLLAPSES IN THE BROWSER —
   * HTML folds runs of whitespace — and he has been told; `white-space: pre-wrap` was ruled OUT
   * because it would preserve every other whitespace choice in the block as a side effect.
   */
  assertEquals(ENDURANCE_WEEK_INTRO, [
    'Your week has 4  endurance slots.',
    'One Long session',
    'One recovery session',
    '2 that can be filled with hard or easy session.',
    'Rides are easier on your legs than runs.',
    'Lower body weightloads will automatically be reduced if you add a hard run',
    'Easy sessions are the default pick hard session below to add',
  ]);
  // ⛔ THE DOUBLE SPACE IS IN THE STRING. A "helpful" trim would be a silent edit of his copy.
  assert(ENDURANCE_WEEK_INTRO[0].includes('4  endurance'), 'his double space was normalised away');
  // ⛔ AND THE CAPITAL L, which every spellcheck wants to fix.
  assert(ENDURANCE_WEEK_INTRO[1].includes('One Long session'));

  /**
   * ⛔⛔ TWO PARTS, NOT ONE WALL — the split is the point of the change, not a decoration on it.
   * Lines 1-4 are what the week IS; 5-7 are what a choice COSTS plus the instruction. Three kinds of
   * information at one visual weight left the eye no seams to find.
   */
  assertEquals(ENDURANCE_WEEK_INTRO_STRUCTURE.length, 4);
  assertEquals(ENDURANCE_WEEK_INTRO_CONSEQUENCE.length, 3);
  assertEquals([...ENDURANCE_WEEK_INTRO_STRUCTURE, ...ENDURANCE_WEEK_INTRO_CONSEQUENCE], ENDURANCE_WEEK_INTRO);

  // ⚠️ ALL SEVEN PASS THE GATE UNAIDED — measured, so no exemption is recorded and none is needed.
  for (const line of ENDURANCE_WEEK_INTRO) assertEquals(voiceViolation(line), null, line);

  /**
   * ⛔⛔ AND THE OLD FRAMING MAY NOT COME BACK. The line this replaced ended *"— which may improve
   * your lower body lifts"*, and that had the causality backwards: skipping a hard run improves
   * nothing. No reduction is the baseline; a hard run CAUSES the reduction, which is what his own
   * line now says.
   */
  const whole = ENDURANCE_WEEK_INTRO.join(' ');
  assertEquals(/may improve your lower body lifts/.test(whole), false, 'the backwards framing is back');
  assert(/reduced if you add a hard run/.test(whole), 'the causality line was lost');
  assertEquals(MAX_HARD_SESSIONS, 2);
});

Deno.test('⛔ THE PICKER DRAWS LONG FIRST, AND IT IS A RENDER ORDER ONLY', () => {
  /**
   * ⛔ MICHAEL, 2026-08-26. The screen led with the OPTIONAL control and buried the two rows that
   * GATE Continue — which is also why "recovery session and long session have no sport yet" read as
   * a surprise. Long · Recovery · + Add a hard session.
   *
   * ⚠️ `REQUIRED_SLOT_KEYS` IS THE MODEL ORDER AND IS UNTOUCHED. It drives `allSlotsChosen`,
   * `unansweredSlots`, the blocked line's wording and the single-sport auto-assign; reordering IT
   * would change what the blocked sentence says as a side effect of a layout ruling.
   */
  assertEquals(REQUIRED_SLOT_DISPLAY_ORDER, ['long', 'easy']);
  assertEquals(REQUIRED_SLOT_KEYS, ['easy', 'long'], 'the MODEL order moved — the layout ruling leaked');
  // ⛔ A PERMUTATION, NOT A SECOND LIST. A slot added to one must not be silently missed by the other.
  assertEquals([...REQUIRED_SLOT_DISPLAY_ORDER].sort(), [...REQUIRED_SLOT_KEYS].sort());
});

Deno.test('the blocked line names what is missing, and nothing else', () => {
  const one = unansweredLine({ hard1: 'ride', hard2: 'ride', easy: 'run', long: null })!;
  assert(/long session/i.test(one), one);
  assert(/has no sport yet/.test(one), one);
  // ⛔ AND IT NEVER NAMES A HARD SESSION (2026-08-25). They are opt-in; an unadded one is not
  // missing, and telling the athlete it is would be the screen asking a question it stopped asking.
  const two = unansweredLine({ hard1: 'ride', hard2: null, easy: null, long: 'run' })!;
  assert(/has no sport yet/.test(two), two);
  assert(/recovery session/i.test(two), two);
  assert(!/hard session/i.test(two), `the line named an unadded hard session: ${two}`);
  // ⚠️ VOICE: it states the fact, it does not instruct.
  for (const line of [one, two]) {
    assertEquals(voiceViolation(line), null, line);
    assert(!/^(Pick|Choose|Select|Set|Tap)\b/i.test(line), `imperative: ${line}`);
  }
});

Deno.test('⛔⛔ THE LIFTING-RATE LINE IS GONE, AND MAY NOT COME BACK', () => {
  /**
   * ⛔ MICHAEL, 2026-08-26: *"E kill it."* The audit measured what it actually did:
   *   · three tiers off the count of hard RUNS only;
   *   · the last two the SAME NUMBER said twice — every four weeks IS about 1% a month;
   *   · hours did not move it at all, on the screen whose primary control is the hours;
   *   · two of the three were already labelled ours, because the book prints two rates not three;
   *   · and its BEST state was the zero-touch default, so the screen rewarded the empty week and on
   *     the path it was designed for the number never moved once.
   *
   * ⚠️ THE MODULE MUST NOT RE-EXPORT IT. Asserting the ABSENCE is deliberate: the line had four
   * supporting exports and a pinned footer, so a partial restoration is easy to do by accident.
   */
  const mod = api as Record<string, unknown>;
  for (const gone of ['liftingRateLine', 'RATE_TEXT', 'RATE_PENDING_LINE', 'RATE_CITE']) {
    assertEquals(mod[gone], undefined, `${gone} is back — the rate line was rebuilt`);
  }

  /**
   * ⚠️ AND THIS SUPERSEDES THE POUND-CLAUSE BAN OF EARLIER THE SAME DAY, whose test lived here and
   * is deleted with the line it guarded. That sentence used to close *"— about 5 lb a step on a
   * 110 lb squat"*, off `Math.max(5, Math.round((squat * 0.01) / 5) * 5)`: on a 110 lb squat one per
   * cent is 1.1, which rounds to ZERO, and the floor supplied the five — a floored plate presented
   * as though it were the one per cent, false for any squat under 250. Deleting the whole line is a
   * stronger guarantee than banning a clause inside it, so the narrower test is gone rather than
   * kept as an assertion about a function that no longer exists.
   */
});

Deno.test('⛔ BUT THE SPLIT LINE SURVIVED, AND KEEPS ITS GATE', () => {
  /**
   * ⚠️ IT IS NOT WHAT HE KILLED. p247's reduction is LOWER BODY ONLY, and this is the only sentence
   * on the screen that names which lifts the running costs. It moved out of the deleted footer and
   * into the volume note, beside "More running will slow your strength progress" — the general
   * claim, then the specific one.
   */
  const line = upperLowerSplitLine(mix('run', 'run'))!;
  assert(/squat and deadlift/.test(line), line);
  assert(/presses are largely unaffected/.test(line), line);
  assertEquals(voiceViolation(line), null, line);
  // ⛔ AND ITS GATE IS INTACT: nothing to explain when no hard slot is a run, or when the week is
  // not yet described. `liftingRateTier` survives for exactly this — it is not orphaned.
  assertEquals(upperLowerSplitLine(mix('ride', 'ride')), null);
  assertEquals(upperLowerSplitLine({ hard1: 'run', hard2: null, easy: 'run', long: null }), null);
  assertEquals(liftingRateTier(mix('ride', 'ride')), 'hard_on_bike');
  assertEquals(liftingRateTier(mix('run', 'run')), 'two_hard_runs');
  assert(LIFTING_RATE_TIERS_ARE_OURS.length > 60, 'the tier reading ships unlabelled');
});

Deno.test('⛔ NO ENDURANCE-IMPROVEMENT PERCENTAGE APPEARS ANYWHERE', () => {
  /**
   * ⛔ THE WORK ORDER FORBIDS IT: *"NO invented precision, NO endurance-improvement percentages
   * anywhere (no source gives one — direction words only)."* Every percentage this screen can print
   * is a LIFTING rate; what running costs the endurance side is direction words or nothing.
   */
  const everything = [
    ...ENDURANCE_WEEK_HEADER,
    LONG_SLOT_NOTE,
    ...SLOT_KEYS.flatMap((k) => [SLOT_LABEL[k], ...SLOT_OPTIONS[k].map((o) => o.label)]),
    ...[mix('ride', 'ride'), mix('ride', 'run'), mix('run', 'run')]
      .flatMap((m) => [upperLowerSplitLine(m) ?? '']),
  ].filter(Boolean);

  for (const line of everything) {
    const pcts = [...String(line).matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) => m[0]);
    for (const p of pcts) {
      // The only percentage any of these may carry is the lifting rate's own "1%".
      assertEquals(p.replace(/\s/g, ''), '1%', `a percentage that is not the lifting rate: "${p}" in "${line}"`);
      assert(/plan advances the bar/.test(String(line)), `a percentage outside the rate line: "${line}"`);
    }
  }
});

Deno.test('the upper/lower split is shown only when a hard RUN is in the mix', () => {
  // ⛔ p247's reduction is LOWER BODY ONLY. With the intensity on the bike there is no split to
  // explain, and printing one would name a cost the mix is not paying.
  assertEquals(upperLowerSplitLine(mix('ride', 'ride')), null);
  assert(upperLowerSplitLine(mix('ride', 'run')));
  assert(upperLowerSplitLine(mix('run', 'run')));
  // ⚠️ DIRECTION WORDS, NO NUMBER — the corpus gives no figure for how much less the presses pay.
  assert(!/%|\bpercent\b/.test(upperLowerSplitLine(mix('run', 'run'))!));
});

Deno.test('every sentence this file GENERATES passes the voice gate', () => {
  /**
   * ⛔⛔ MICHAEL'S HEADER IS EXCLUDED FROM THE BANNED-WORD GATE, AND THE REASON IS THE FINDING.
   *
   * `voiceViolation` bans `focus` as an imperative — the list is `stay / keep / try / consider /
   * focus` — and his first line is *"**The focus** of this block is strength…"*, where it is a NOUN.
   * A whole-word matcher cannot tell those apart.
   *
   * ⛔ THE GATE EXISTS TO CATCH THE APP EDITORIALISING, NOT TO OVERRULE THE PERSON SPECIFYING THE
   * COPY. His header is quoted verbatim and IS the specification; re-voicing it to satisfy a house
   * rule would be editing the spec to fit the linter. So the gate runs over everything this file
   * WRITES, and his own sentences are pinned verbatim by the first test in this file instead.
   */
  const generated = [
    LONG_SLOT_NOTE,
    ...SLOT_KEYS.flatMap((k) => [SLOT_LABEL[k], ...SLOT_OPTIONS[k].map((o) => o.label)]),
    ...[mix('ride', 'ride'), mix('ride', 'run'), mix('run', 'run')]
      .flatMap((m) => [upperLowerSplitLine(m) ?? '']),
  ].filter((s) => s && s.trim().length > 0);
  assert(generated.length >= 12, `the voice gate is reading almost nothing: ${generated.length}`);
  for (const line of generated) {
    assertEquals(voiceViolation(line), null, line);
    assert(!/^(Keep|Try|Consider|Focus|Make sure|Push|Add|Drop|Go|Start)\b/.test(line.trim()),
      `imperative: ${line}`);
  }
  // ⚠️ AND HIS HEADER IS STILL CHECKED FOR THE THINGS A QUOTE CANNOT EXCUSE.
  for (const line of ENDURANCE_WEEK_HEADER) {
    assert(!line.includes('!'), `exclamation mark in the header: ${line}`);
    assert(!/nice work|great job|well done|crushing/i.test(line), `praise in the header: ${line}`);
  }
  /**
   * ⚠️ MICHAEL'S HEADER USES "your" AND THAT IS DELIBERATE. Voice rule 1 ("the", not "your") governs
   * lines the APP writes about a number that moved; this header is his own copy, quoted verbatim, and
   * re-voicing it to satisfy a house rule would be editing the specification. The rule still holds
   * for every sentence this file generates — asserted above.
   */
  for (const line of [upperLowerSplitLine(mix('run', 'run'))!]) {
    assert(!/\byou\b|\byour\b/i.test(line), `second person in generated copy: ${line}`);
  }
});


// ════════════════════════════════════════════════════════════════════════════════════════════════
// D — THE BOUNDS: OUTWARD, OR ABSENT
// ════════════════════════════════════════════════════════════════════════════════════════════════

const BASELINES = {
  learned_fitness: {
    run_threshold_pace_sec_per_km: { value: 340, confidence: 'high', sample_count: 10 },
    run_easy_pace_sec_per_km: { value: 340, confidence: 'high', sample_count: 20 },
  },
  performance_numbers: { ftp: 250 },
};
const PACE = 340 * 1.609344;

Deno.test('the bounds round OUTWARD — a cap that rounds in is a cap that lies', () => {
  /**
   * ⛔ FLOOR THE FLOOR, CEIL THE CAP. Rounding a band inward makes it refuse numbers the engine
   * would in fact have built — the same shape as the ask-15-get-20 defect, pointing the other way.
   * ⚠️ Mutation testing found the composer's own week still landing inside a tightened band, so the
   * direction is asserted against the raw arithmetic rather than only against a built week.
   */
  const slots = { hard1: 'run', hard2: 'run', easy: 'run', long: 'run' } as const;
  const b = weekBounds(slots, { baselines: BASELINES as never, easyPaceSecPerMi: PACE });
  assert(b.runMiles);
  // ⛔ AGAINST THE RAW ARITHMETIC, not against its own rounding. `min === floor(min)` is true of a
  // ceiled integer too, which is why the first version of this test survived the mutation.
  let rawShort = 0;
  let rawLong = 0;
  for (const key of Object.keys(SLOT_FRAME_KEY) as (keyof typeof SLOT_FRAME_KEY)[]) {
    const band = sessionDurationBandSeconds(SLOT_FAMILY[key].family, SLOT_FAMILY[key].level, {
      baselines: BASELINES as never,
    });
    rawShort += band.shortest;
    rawLong += band.longest;
  }
  assert(b.runMiles!.min <= rawShort / PACE + 1e-9,
    `the floor rounded IN: ${b.runMiles!.min} > ${(rawShort / PACE).toFixed(2)}`);
  assert(b.runMiles!.max >= rawLong / PACE - 1e-9,
    `the cap rounded IN: ${b.runMiles!.max} < ${(rawLong / PACE).toFixed(2)}`);
  const tight = weekBounds({ hard1: 'ride', hard2: 'ride', easy: 'run', long: 'run' }, { baselines: BASELINES as never, easyPaceSecPerMi: PACE });
  assert(tight.runMiles && tight.runMiles.max < b.runMiles!.max,
    'moving slots to the bike did not lower the running cap');
});

Deno.test('no easy pace on file means no running cap — never one computed off nothing', () => {
  /**
   * ⛔ THE SAME REFUSAL `end-plan-core.ts` MAKES: *"if we do not know the pace we CANNOT do this
   * conversion."* A cap derived from an invented pace is a number the athlete would plan against.
   */
  for (const pace of [null, undefined, 0, -1, NaN]) {
    const b = weekBounds({ hard1: 'run', hard2: 'run', easy: 'run', long: 'run' }, {
      baselines: BASELINES as never, easyPaceSecPerMi: pace as never,
    });
    assertEquals(b.runMiles, null, `a running cap was invented from a pace of ${String(pace)}`);
  }
  // ⚠️ THE RIDE CAP DOES NOT NEED A PACE — it is already in the unit the screen asks for.
  const rides = weekBounds({ hard1: 'ride', hard2: 'ride', easy: 'ride', long: 'ride' }, {
    baselines: BASELINES as never, easyPaceSecPerMi: null,
  });
  assert(rides.rideHours, 'the ride cap vanished with the run pace');
  assertEquals(boundsLine(null, 'miles a week'), null);
});

Deno.test('a slot the athlete did not answer keeps the frame\'s own session', () => {
  // ⛔ THE OVERRIDE IS PER SLOT AND PARTIAL BY DESIGN. A map naming three slots must not silently
  // decide the fourth — mutation testing showed the loop treating "unnamed" and "run" alike.
  const full = slotsForEngine({ hard1: 'ride', hard2: 'ride', easy: 'run', long: 'run' });
  assertEquals(Object.keys(full).sort(), Object.values(SLOT_FRAME_KEY).sort());
  assertEquals(full[SLOT_FRAME_KEY.hard1], 'ride');
  assertEquals(full[SLOT_FRAME_KEY.long], 'run');
});


// ════════════════════════════════════════════════════════════════════════════════════════════════
// E — THE INLINE-STYLE TRAP THAT COST THE FIRST ROW ITS EDGE
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('no shorthand beside its own longhand in a React style object', async () => {
  /**
   * ⛔ MICHAEL'S PHONE SCREENSHOT, 2026-08-24 EVENING: *"the FIRST hard row is missing its colored
   * sport edge; the second has it."*
   *
   * The row's style object carried `borderColor` AND `borderLeftColor`. React diffs inline styles key
   * by key and applies only what CHANGED — so when a row opened and closed, the shorthand changed,
   * the longhand did not, and React set `border-color` alone. **A shorthand rewrites all four edges,
   * including the one it was not asked about**, and the longhand was never re-applied. Only a row
   * whose open state had changed lost its edge, which is why exactly one row was wrong.
   *
   * ⚠️ A BROWSER-ONLY FAILURE THAT A SOURCE LINT CAN STILL HOLD. Nothing in a unit test renders CSS;
   * what IS checkable is the shape that causes it.
   */
  const files = ['../components/EnduranceWeekCard.tsx', '../components/HardSlotChoices.tsx'];
  const PAIRS: [string, string[]][] = [
    ['borderColor', ['borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor']],
    ['borderWidth', ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth']],
    ['border', ['borderColor', 'borderWidth', 'borderLeftColor', 'borderLeftWidth']],
    ['padding', ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft']],
    ['margin', ['marginTop', 'marginRight', 'marginBottom', 'marginLeft']],
  ];
  for (const rel of files) {
    const src = await Deno.readTextFile(new URL(rel, import.meta.url).pathname);
    // Each `style={{ … }}` object, taken on its own — a shorthand in one object and a longhand in
    // another is not the bug.
    for (const m of src.matchAll(/style=\{\{([\s\S]*?)\}\}/g)) {
      const obj = m[1];
      for (const [shorthand, longhands] of PAIRS) {
        const hasShort = new RegExp(`(^|[\\s,{])${shorthand}\\s*:`).test(obj);
        if (!hasShort) continue;
        for (const lh of longhands) {
          const hasLong = new RegExp(`(^|[\\s,{])${lh}\\s*:`).test(obj);
          assert(!hasLong,
            `${rel}: \`${shorthand}\` sits beside \`${lh}\` in one style object — React will apply `
            + 'the shorthand alone on an update and silently reset the longhand.');
        }
      }
    }
  }
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// A4 — THE HARD SLOT'S SESSION IS THE FRAME'S FACT, NOT A CHOICE (Michael, 2026-08-24)
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('⛔ THE FRAME\'S FACT IS STATED PER SLOT AND PER SPORT, and the two slots differ', async () => {
  /**
   * ⛔ THE RULING. The card offered top-end versus sustained as buttons and the athlete never owned
   * that decision: p246 fixes the two hard slots as different families — `run_mlss` on frame day 1,
   * `run_near_threshold` on day 3 — and the composer builds those whatever the card writes.
   *
   * ⚠️ THE FACT COMES OFF `hardSlotDefault`, the same owner the wizard sends from, so the sentence
   * the screen states and the value that reaches the composer cannot come apart.
   */
  const { hardSlotFact, hardSlotDefault, HARD_SLOT_FACT_NOTE } = await import('./hard-slot-choices.ts');
  for (const sport of ['run', 'ride'] as const) {
    const one = hardSlotFact(sport, 'hard1');
    const two = hardSlotFact(sport, 'hard2');
    assert(one && two, `${sport}: a slot has no session to state`);
    assert(one!.title !== two!.title, `${sport}: both hard slots state the same session`);
    // ⛔ SLOT TWO IS THE SUSTAINED ONE ON EITHER SPORT — `run_near_threshold` / the sweet-spot blocks.
    assertEquals(two!.title, 'Sustained threshold');
    // ⚠️ AND THE FACT MATCHES WHAT THE WIZARD ACTUALLY SENDS.
    assertEquals(hardSlotDefault(sport, 'hard2').role, 'threshold');
    assertEquals(hardSlotDefault(sport, 'hard1').role, 'intensity');
  }
  // ⛔ AND THE ATHLETE IS TOLD WHO DECIDED. A fact with no explanation reads as a control that broke.
  assert(/programme/i.test(HARD_SLOT_FACT_NOTE));
  assert(/sport/i.test(HARD_SLOT_FACT_NOTE) && /club/i.test(HARD_SLOT_FACT_NOTE),
    'the note does not say what IS still the athlete\'s');
});

Deno.test('⛔ THE CHOICE CONTROL IS GONE FROM THE CARD, AND THE CLUB CONTROL IS NOT', async () => {
  /**
   * ⚠️ A SOURCE LINT, because no unit test renders this component. What is checkable is the shape:
   * the option list is no longer mapped into buttons, and the club checkbox still is.
   *
   * ⛔ THE FAILURE IT CATCHES IS A REVERT. A future session restoring `hardSlotOptions(...).map(...)`
   * here would silently reinstate a control over a decision the programme owns — which is the defect
   * this card has now been rebuilt around three times.
   */
  const src = await Deno.readTextFile(new URL('../components/HardSlotChoices.tsx', import.meta.url).pathname);
  assert(!/hardSlotOptions/.test(src), 'the session option list is being mapped into controls again');
  assert(!/opts\.map/.test(src), 'the card renders a list of session buttons');
  // ⛔ Widened 2026-08-24: the fact now reads the LIBRARY (`slotFamilyFact`) — the old tables' copy
  // said "VO2 max focus" over an MLSS slot. The card still STATES the session; the only choice
  // beside club is the WITHIN-FAMILY variant (Michael's ruling), whose options are the library's
  // own archetypes (`slotVariantOptions`), never the old session-type buttons.
  assert(/slotFamilyFact/.test(src), 'the card no longer states the frame\'s session');
  assert(/slotVariantOptions/.test(src), 'the variant options stopped reading the library');
  assert(/hard-\$\{props\.slotKey\}-club/.test(src), 'the club control was removed with the choices');
  assert(/ownership: club \? 'prescribed' : 'club'/.test(src), 'the club control stopped replacing the slot');
});

Deno.test('⛔ THE WIZARD RE-STAMPS THE FRAME\'S SESSION, so a stale role cannot travel', async () => {
  /**
   * ⛔ `syncHardDays` USED TO RETURN `prev` UNTOUCHED when the discipline matched, which was right
   * while the athlete could pick the session — their answer had to survive. With the picker gone the
   * frame's fact is the only legal value, and returning `prev` would leave a stale `role`, or a
   * leftover `goal` from an earlier draft, travelling to the composer as an allocation nobody made.
   *
   * ⚠️ SOURCE LINT AGAIN — the function is a closure inside a six-thousand-line component. What is
   * checkable is that the early return is gone and `goal` is written unconditionally.
   */
  const src = await Deno.readTextFile(new URL('../components/NonRaceBuilder.tsx', import.meta.url).pathname);
  const fn = src.split('const syncHardDays')[1]?.split('const derivedCounts')[0] ?? '';
  assert(fn.length > 100, 'syncHardDays could not be found — it moved or was renamed');
  assert(!/if \(prev && prev\.discipline === want\.discipline\) return prev;/.test(fn),
    'a slot with an unchanged sport keeps whatever role was already on it');
  assert(/goal: want\.goal,/.test(fn), 'goal is not written every time, so a stale one can survive');
});


// ════════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ AN ADDED HARD SESSION OPENS ON A SPORT THE ATHLETE HAS (Michael, 2026-08-25)
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('⛔ A RUN-ONLY ATHLETE IS NEVER HANDED A RIDE', () => {
  /**
   * ⛔ THE DEFECT, and it shipped for one commit: the add handler read `allowedSports[0]`, and
   * `allowedSlotSports` is built RUN-FIRST off the posture step — so the array's order carries the
   * POSTURE screen's order, not a preference. A mixed athlete's added session opened on Run and a
   * ride-only athlete got Ride by luck of the filter.
   */
  for (const key of HARD_SLOT_KEYS) {
    assertEquals(defaultSportForAddedSlot(key, ['run']), 'run', `${key}: run-only got a ride`);
    assertEquals(defaultSportForAddedSlot(key, ['ride']), 'ride', `${key}: ride-only got a run`);
  }
});

Deno.test('⛔ RIDE LEADS ONLY WHEN RIDING IS IN THE WEEK', () => {
  for (const key of HARD_SLOT_KEYS) {
    // ⛔ MIXED — Ride leads a hard slot. p280: no impact, so the intensity does not tax the lifts.
    assertEquals(defaultSportForAddedSlot(key, ['run', 'ride']), 'ride', `${key}: mixed did not lead on ride`);
    // ⚠️ AND THE POSTURE ORDER MUST NOT DECIDE IT — same mix, other order, same answer. This is the
    // exact assertion the shipped bug would have failed.
    assertEquals(defaultSportForAddedSlot(key, ['ride', 'run']), 'ride', `${key}: the answer moved with the input order`);
  }
});

Deno.test('the default is the chip the card highlights — one owner for the order', () => {
  // ⚠️ IT MUST BE `SLOT_OPTIONS`' OWN FIRST OFFERED VALUE, because that is the order the row renders
  // its chips in. A default derived anywhere else is how the highlighted chip and the stored answer
  // start disagreeing — which is the class of defect this whole screen has been fixing.
  for (const key of SLOT_KEYS) {
    for (const allowed of [undefined, ['run'], ['ride'], ['run', 'ride']] as const) {
      const expected = SLOT_OPTIONS[key]
        .map((o) => o.value)
        .filter((v) => !allowed || allowed.includes(v))[0] ?? null;
      assertEquals(defaultSportForAddedSlot(key, allowed as never), expected, `${key} / ${JSON.stringify(allowed)}`);
    }
  }
});

Deno.test('an unconstrained or empty mix still answers, and never with null', () => {
  // ⚠️ `allowedSlotSports` is passed as `undefined` when it is empty, and an added session with no
  // sport would be an unanswered row on a screen that just stopped having any.
  for (const key of HARD_SLOT_KEYS) {
    assertEquals(defaultSportForAddedSlot(key, undefined), 'ride');
    assertEquals(defaultSportForAddedSlot(key, []), 'ride');
  }
});

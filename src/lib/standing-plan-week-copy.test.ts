// ============================================================================
// THE GATE — stage 5: the endurance-week screen's copy, its bounds, and the wire.
//
// ⚠️ EVERY ASSERTION HERE WAS MUTATION-TESTED. See
// `docs/NOTES-stage5-endurance-week-2026-08-24.md`.
//
// Run: deno test --no-check --allow-read --allow-env src/lib/standing-plan-week-copy.test.ts
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { voiceViolation } from '../../supabase/functions/_shared/state-trend/week-accent.ts';
import { SLOT_FAMILY, SLOT_FRAME_KEY, boundsLine, slotsForEngine, weekBounds } from './standing-plan-week-bounds.ts';
import { sessionDurationBandSeconds } from '../../supabase/functions/_shared/endurance-library/index.ts';
import {
  ENDURANCE_WEEK_HEADER,
  LIFTING_RATE_TIERS_ARE_OURS,
  LONG_SLOT_NOTE,
  RATE_CITE,
  SLOT_KEYS,
  SLOT_LABEL,
  SLOT_OPTIONS,
  ENDURANCE_WEEK_PREAMBLE,
  RUN_TAX_LINES,
  slotSummary,
  defaultSlotSports,
  liftingRateLine,
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
  assertEquals(ENDURANCE_WEEK_HEADER, [
    'The focus of this block is strength while maintaining your endurance.',
    '4 sessions:',
    '2 sessions to maintain speed, VO2 max or power',
    '1 recovery session',
    '1 long session',
    'Running is the most taxing on your system — the more running, the more your strength progress may slow.',
    'Cycling is more forgiving when working concurrently with strength.',
  ]);
  assertEquals(LONG_SLOT_NOTE, 'one per week, run or ride');

  /**
   * ⛔ THE PREAMBLE TIGHTENED AND THE TWO SENTENCES MOVED — **not rewritten** (Michael, 2026-08-24).
   * They are the same strings, taken from the header rather than retyped, so his verbatim copy above
   * is still the one source and a trim to either place fails this test rather than the screen.
   */
  assertEquals(ENDURANCE_WEEK_PREAMBLE, ENDURANCE_WEEK_HEADER.slice(0, 5));
  assertEquals(RUN_TAX_LINES, [ENDURANCE_WEEK_HEADER[5], ENDURANCE_WEEK_HEADER[6]]);
  assertEquals([...ENDURANCE_WEEK_PREAMBLE, ...RUN_TAX_LINES], ENDURANCE_WEEK_HEADER,
    'a line was lost or invented when the preamble was split');
});

Deno.test('the four slots are the four the frame has, labelled as the athlete sees them', () => {
  assertEquals(SLOT_KEYS, ['hard1', 'hard2', 'easy', 'long']);
  /**
   * ⛔ NEVER "Hard 1 / Hard 2" ON A SCREEN (Michael, 2026-08-24). Those are internal keys; an athlete
   * has two hard sessions, not a first and a second. The labels are the ones his own preamble uses.
   */
  assertEquals(SLOT_LABEL.hard1, 'Hard session');
  assertEquals(SLOT_LABEL.hard2, 'Hard session');
  assertEquals(SLOT_LABEL.easy, 'Recovery session');
  assertEquals(SLOT_LABEL.long, 'Long session');
  for (const k of SLOT_KEYS) {
    assert(!/\b(hard|slot)\s*[12]\b/i.test(SLOT_LABEL[k]), `an internal key leaked onto a label: ${SLOT_LABEL[k]}`);
  }

  // ⛔ A COLLAPSED ROW STATES ITS WHOLE ANSWER — the screen opens finished.
  assertEquals(slotSummary('hard1', 'ride', 'Sustained threshold'), 'Hard session · Ride · Sustained threshold');
  assertEquals(slotSummary('easy', 'run'), 'Recovery session · Run');
  assertEquals(slotSummary('long', 'ride'), 'Long session · Long ride');
  // ⛔ THE LONG SLOT OFFERS BOTH, and its own note says so — p275's permission.
  assertEquals(SLOT_OPTIONS.long.map((o) => o.label), ['Long run', 'Long ride']);
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// B — THE PRE-FILL AND THE DERIVED MIX
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('strength leading with a bike kept pre-fills both hard slots on the bike', () => {
  // ⛔ PLACED BY THE DIAL, NEVER ASKED (pivot §2, p280: no impact, so it does not tax the lifts).
  const withBike = defaultSlotSports(true);
  assertEquals(withBike.hard1, 'ride');
  assertEquals(withBike.hard2, 'ride');
  // ⛔ AND THE RUNNING KEEPS ITS LONG SESSION AND ITS EASY ONE.
  assertEquals(withBike.easy, 'run');
  assertEquals(withBike.long, 'run');
  // No bike in the mix → every slot is a run and the screen is a read-out.
  assertEquals(defaultSlotSports(false), { hard1: 'run', hard2: 'run', easy: 'run', long: 'run' });
});

Deno.test('the default option is the one shown first, on every slot', () => {
  // ⚠️ THE ORDER STATES THE DEFAULT before anything is tapped — a screen whose first chip is not the
  // pre-filled one reads as though nothing is chosen.
  const withBike = defaultSlotSports(true);
  for (const key of SLOT_KEYS) {
    assertEquals(SLOT_OPTIONS[key][0].value, withBike[key], `${key}'s first option is not its default`);
  }
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// C — THE RATE LINE: HIS ANCHORS, AND NOTHING ELSE
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('the three tiers are his two published rates and the floor they imply', () => {
  assertEquals(liftingRateTier(mix('ride', 'ride')), 'hard_on_bike');
  assertEquals(liftingRateTier(mix('ride', 'run')), 'one_hard_run');
  assertEquals(liftingRateTier(mix('run', 'ride')), 'one_hard_run');
  assertEquals(liftingRateTier(mix('run', 'run')), 'two_hard_runs');

  assert(/1% every 3 weeks/.test(liftingRateLine(mix('ride', 'ride'))));
  assert(/1% every 4 weeks/.test(liftingRateLine(mix('ride', 'run'))));
  // ⚠️ THE LOOSEST OF THE THREE, ON PURPOSE — the floor his numbers imply, not a figure he prints.
  assert(/1% a month/.test(liftingRateLine(mix('run', 'run'))));

  assertEquals(RATE_CITE.hard_on_bike, 'Viada p247');
  assertEquals(RATE_CITE.one_hard_run, 'Viada p251');
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
      .flatMap((m) => [liftingRateLine(m), liftingRateLine(m, 300), upperLowerSplitLine(m) ?? '']),
  ].filter(Boolean);

  for (const line of everything) {
    const pcts = [...String(line).matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) => m[0]);
    for (const p of pcts) {
      // The only percentage any of these may carry is the lifting rate's own "1%".
      assertEquals(p.replace(/\s/g, ''), '1%', `a percentage that is not the lifting rate: "${p}" in "${line}"`);
      assert(/lifting climbs/.test(String(line)), `a percentage outside the rate line: "${line}"`);
    }
  }
});

Deno.test('the rate line prints pounds when there is a squat to print them off, and not otherwise', () => {
  // ⚠️ A percentage of an unnamed number is not a fact anyone can feel — but an invented squat is
  // worse. Absent, the sentence stands without it.
  const withSquat = liftingRateLine(mix('ride', 'ride'), 300);
  assert(/300 lb squat/.test(withSquat), withSquat);
  assert(/about 5 lb a step/.test(withSquat), withSquat);
  for (const missing of [null, undefined, 0, -10, NaN]) {
    const line = liftingRateLine(mix('ride', 'ride'), missing as never);
    assert(!/lb/.test(line), `a pound figure was invented from ${String(missing)}: ${line}`);
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
      .flatMap((m) => [liftingRateLine(m), liftingRateLine(m, 300), upperLowerSplitLine(m) ?? '']),
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
  for (const line of [liftingRateLine(mix('run', 'run'), 300), upperLowerSplitLine(mix('run', 'run'))!]) {
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
  const slots = defaultSlotSports(false);
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
  const tight = weekBounds(defaultSlotSports(true), { baselines: BASELINES as never, easyPaceSecPerMi: PACE });
  assert(tight.runMiles && tight.runMiles.max < b.runMiles!.max,
    'moving slots to the bike did not lower the running cap');
});

Deno.test('no easy pace on file means no running cap — never one computed off nothing', () => {
  /**
   * ⛔ THE SAME REFUSAL `end-plan-core.ts` MAKES: *"if we do not know the pace we CANNOT do this
   * conversion."* A cap derived from an invented pace is a number the athlete would plan against.
   */
  for (const pace of [null, undefined, 0, -1, NaN]) {
    const b = weekBounds(defaultSlotSports(false), {
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
  const full = slotsForEngine(defaultSlotSports(true));
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

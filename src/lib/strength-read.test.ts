/**
 * Fixtures for the strength read's card assembly (2026-08-28).
 *
 * ⛔ WHAT THESE PIN. The word is a LABEL over the ladder's own outcome, and the weight and the reps
 * are ONE reading — a card that sourced them apart would print a rep count earned at a different
 * weight. And a lift with nothing to say does not render: no placeholder, ruled.
 *
 * Run: deno test --no-check src/lib/strength-read.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { strengthReadCards, wordForOutcome } from './strength-read.ts';

const entry = (week: number, movement: string, outcome: string) =>
  ({ week, day: 'Monday', movement, outcome });

Deno.test('⛔ THE THREE WORDS, AND SILENCE IS NOT ONE OF THEM', () => {
  assertEquals(wordForOutcome('setback'), 'Stalled');
  assertEquals(wordForOutcome('mid_band'), 'On track');
  // ⚠️ `clean` is "every set within one rep of the band top" — what earns the next set. The word
  // states what happens next; it does not claim he beat the prescription. Ruled 2026-08-28.
  assertEquals(wordForOutcome('clean'), 'Moving up');
  // Nothing logged is not a failure.
  assertEquals(wordForOutcome('no_evidence'), null);
  assertEquals(wordForOutcome(null), null);
  assertEquals(wordForOutcome('something_new'), null);
});

Deno.test('⛔ THE MOST RECENT HEAVY SESSION OWNS THE WORD', () => {
  const cards = strengthReadCards({
    history: { push_upper: [entry(2, 'Bench Press', 'clean'), entry(4, 'Bench Press', 'setback')] },
    atWeight: { push_upper: 135 },
    lastReps: { push_upper: [4, 3] },
  });
  assertEquals(cards.length, 1);
  assertEquals(cards[0].word, 'Stalled');
  assertEquals(cards[0].week, 4);
  assertEquals(cards[0].movement, 'Bench Press');
  assertEquals(cards[0].atWeight, 135);
  assertEquals(cards[0].recentReps, [4, 3]);
});

Deno.test('⛔⛔ NO WEIGHT → NO CARD, AND NO FALLBACK NUMBER', () => {
  /**
   * The weight and the reps are one reading (`barState.atWeight` and its own `recentReps`). A card
   * that filled the weight from somewhere else would read as one fact and be two. Rendering nothing
   * is the ruled answer — no placeholder, no dashes.
   */
  const cards = strengthReadCards({
    history: { push_upper: [entry(3, 'Bench Press', 'clean')] },
    lastReps: { push_upper: [4] },
    atWeight: {},
  });
  assertEquals(cards, []);
});

Deno.test('⛔ A LIFT WITH NO HEAVY SESSION IN THE BLOCK DOES NOT RENDER', () => {
  // Week 1 is the two tests, so this is the block's shape on day one, not a defect.
  assertEquals(strengthReadCards({ history: {}, atWeight: { push_upper: 135 } }), []);
  assertEquals(strengthReadCards({ history: { push_upper: [] }, atWeight: { push_upper: 135 } }), []);
  assertEquals(strengthReadCards({}), []);
});

Deno.test('⚠️ A SESSION WITH NOTHING TO SAY DOES NOT PRODUCE A CARD', () => {
  const cards = strengthReadCards({
    history: { push_upper: [entry(3, 'Bench Press', 'no_evidence')] },
    atWeight: { push_upper: 135 },
  });
  assertEquals(cards, []);
});

Deno.test('⚠️ EMPTY REPS ARE LEGAL — right after a jump there is no last time at the new weight', () => {
  const cards = strengthReadCards({
    history: { push_upper: [entry(5, 'Bench Press', 'clean')] },
    atWeight: { push_upper: 140 },
    lastReps: { push_upper: [] },
  });
  assertEquals(cards.length, 1);
  assertEquals(cards[0].recentReps, []);
});

Deno.test('⚠️ THE CARDS SIT IN THE BLOCK\'S OWN PATTERN ORDER', () => {
  const cards = strengthReadCards({
    history: {
      press_lower: [entry(3, 'Back Squat', 'clean')],
      push_upper: [entry(3, 'Bench Press', 'mid_band')],
      hinge_lower: [entry(3, 'Deadlift', 'clean')],
    },
    atWeight: { press_lower: 105, push_upper: 135, hinge_lower: 160 },
  });
  assertEquals(cards.map((c) => c.movement), ['Bench Press', 'Deadlift', 'Back Squat']);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ⛔ THE CONTRACT, THROUGH THE REAL PRODUCER — not a hand-built fixture.
//
// The helper tests above pass on any shape I invent. This one runs the actual server walk
// (`earnedMeSets`, the function `rematerialize-standing-block` calls) over a composed block and
// feeds its output straight into the card assembly. If the ladder ever renames `outcome`, reorders
// the walk, or stops pairing `atWeight` with `recentReps`, the cards go blank and THIS fails —
// which a fixture built by hand never would.
// ─────────────────────────────────────────────────────────────────────────────────────────────
import { composeBlock, defaultCompetitionLifts, earnedMeSets } from '../../supabase/functions/_shared/standing-plan/index.ts';

Deno.test('⛔⛔ THE LADDER\'S OWN OUTPUT PRODUCES A CARD — producer to consumer, end to end', () => {
  const baselines = {
    learned_fitness: {
      run_threshold_pace_sec_per_km: { value: 261, confidence: 'high', sample_count: 10 },
      run_easy_pace_sec_per_km: { value: 340, confidence: 'high', sample_count: 20 },
    },
    performance_numbers: { ftp: 250 },
  };
  const composed = composeBlock({
    frame: 'strength_5k', competitionLifts: defaultCompetitionLifts(),
    seed1RMs: { bench: 200, squat: 265, deadlift: 340, overheadPress: 125 },
    workingNumbers: { bench: { value: 135, movement: 'Bench Press' } },
    baselines, equipment: ['Commercial gym'], roundTo: 5, weeks: 12,
    sportMix: { runs: 3, rides: 2, swimDays: 0, slots: { '1:0': 'run', '3:0': 'ride', '4:0': 'run', '6:0': 'run' } },
    enduranceDaysBySport: { run: 3, ride: 2 }, targetRunHours: 3, targetRideHours: 4,
    demonstratedWeeklyMinutes: { run: 180, ride: 240 },
  } as never) as never as Array<{ week: number; meRows: Array<{ week: number; day: string; movement: string; sets: number; weight: number | null }> }>;

  // The block's own ME rows are the index the walk matches on, so the "logged" sessions are built
  // from them — week, weekday and movement name, the same three keys `restateFromTest` uses.
  const DAY_ISO: Record<string, string> = {
    Monday: '2026-09-07', Tuesday: '2026-09-08', Wednesday: '2026-09-09',
    Thursday: '2026-09-10', Friday: '2026-09-11', Saturday: '2026-09-12', Sunday: '2026-09-13',
  };
  const wk2 = composed.find((w) => w.week === 2);
  assert(wk2 && wk2.meRows.length > 0, 'the composed block carried no ME rows to log against');
  const row = wk2!.meRows[0];
  const logged = [{
    week_number: 2,
    date: DAY_ISO[row.day],
    strength_exercises: [{
      name: row.movement,
      // Mid-band: completed every prescribed set, stopped short of the top. → 'On track'.
      sets: Array.from({ length: row.sets }, () => ({
        completed: true, reps: 3, weight: row.weight ?? 135, rir: 2,
      })),
    }],
  }];

  const ladder = earnedMeSets({ composed: composed as never, logged: logged as never, throughWeek: 2 }) as {
    history: Record<string, Array<{ week: number; day: string; movement: string; outcome: string }>>;
    lastReps: Record<string, number[]>;
    barState: Record<string, { atWeight: number | null }>;
  };

  const atWeight: Record<string, number> = {};
  for (const [pattern, st] of Object.entries(ladder.barState ?? {})) {
    if (st?.atWeight != null && st.atWeight > 0) atWeight[pattern] = st.atWeight;
  }

  const cards = strengthReadCards({ history: ladder.history, lastReps: ladder.lastReps, atWeight });
  assert(cards.length > 0, `the ladder's own walk produced no card: ${JSON.stringify(ladder.history)}`);
  const card = cards[0];
  assertEquals(card.movement, row.movement);
  assertEquals(card.week, 2);
  // ⛔ The word is one of the three, never a raw outcome name leaking to the screen.
  assert(['Stalled', 'On track', 'Moving up'].includes(card.word), `unmapped word: ${card.word}`);
  // ⛔ AND THE PAIRING HOLDS: the weight is the one those reps were performed at.
  assertEquals(card.atWeight, row.weight ?? 135);
});

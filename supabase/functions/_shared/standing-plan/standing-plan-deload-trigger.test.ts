// ============================================================================
// THE DELOAD TRIGGER — p245, and the two absence readings it refuses.
//
//   deno test --allow-read --allow-env --no-check supabase/functions/_shared/standing-plan/standing-plan-deload-trigger.test.ts
//
// ⛔ HIS ONE STATED TRIGGER, and the only deload a block with no race in it can have:
//
//   > "If performance begins to suffer, particularly if the ME lifts underperform 2 weeks in a row,
//    consider running a single deload week." — p245
//
// ⛔ WHAT THIS FILE IS REALLY GUARDING is not the happy path — it is what a week nobody logged means.
//
//   ⛔ A MISSED WEEK RESETS THE RUN, AND IT IS NOT A BAD WEEK. Those are two different refusals and
//   both are load-bearing. The field treats a whole missed week as an UNPLANNED RECOVERY WEEK,
//   resumed from where you left off — so the athlete already had the rest a deload would give them,
//   and two short weeks either side of a break are not "2 weeks in a row". But counting that week as
//   a BAD week would read absence as failure, which this codebase refuses everywhere.
//
// ⚠️ THIS FILE SHIPPED THE OTHER WAY FOR AN HOUR ON 2026-08-29 — silent weeks were SKIPPED, so weeks
// 2 and 4 read as consecutive across an untrained week 3. The reasoning was internally sound and
// rested on a wrong premise: that a missed week is information the app does not have. It is.
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  DELOAD_CONSECUTIVE_BAD_WEEKS,
  DELOAD_MISSED_WEEK_RESETS_IS_OURS,
  deloadProposal,
  type MeLadderReading,
} from './me-history.ts';
import type { MeSessionOutcome } from './progression.ts';
import type { ViadaPattern } from '../strength-grid/index.ts';

/**
 * A reading carrying only what the trigger reads. ⚠️ Deliberately hand-built rather than composed
 * from a block: `deloadProposal` takes a reading and touches only `history`, so composing twelve
 * weeks to test a run-length rule would test the composer instead of the rule.
 */
function reading(
  sessions: { week: number; outcome: MeSessionOutcome; pattern?: ViadaPattern; movement?: string }[],
): MeLadderReading {
  const history: MeLadderReading['history'] = {};
  for (const s of sessions) {
    const pattern = s.pattern ?? ('push_upper' as ViadaPattern);
    (history[pattern] ??= []).push({
      week: s.week,
      day: 'Monday',
      movement: s.movement ?? 'Bench Press',
      outcome: s.outcome,
      bar: s.outcome === 'setback' ? 'failed' : 'held',
      barOffsetLb: 0,
    });
  }
  return { sets: {}, bar: {}, barState: {}, lastReps: {}, history, unread: 0 };
}

const BLOCK = { throughWeek: 12, totalWeeks: 12 };

Deno.test('⛔ p245 — two bad weeks in a row propose the NEXT week', () => {
  const p = deloadProposal({
    reading: reading([
      { week: 1, outcome: 'clean' },
      { week: 2, outcome: 'setback' },
      { week: 3, outcome: 'setback' },
    ]),
    ...BLOCK,
  });
  assert(p, 'two consecutive short weeks must produce a proposal');
  assertEquals(p.week, 4);
  assertEquals(p.because, [2, 3]);
  assertEquals(p.cite, 'Viada p245');
});

Deno.test('⛔ ONE bad week is a bad day, not a deload — his number is two', () => {
  assertEquals(DELOAD_CONSECUTIVE_BAD_WEEKS, 2);
  assertEquals(
    deloadProposal({ reading: reading([{ week: 2, outcome: 'setback' }]), ...BLOCK }),
    null,
  );
});

Deno.test('⛔ A GOOD WEEK BETWEEN TWO BAD ONES BREAKS THE RUN', () => {
  assertEquals(
    deloadProposal({
      reading: reading([
        { week: 2, outcome: 'setback' },
        { week: 3, outcome: 'clean' },
        { week: 4, outcome: 'setback' },
      ]),
      ...BLOCK,
    }),
    null,
  );
  // ⚠️ AND `mid_band` BREAKS IT TOO. It is a completed session that landed inside the range —
  // evidence that the week was trained and did not come up short.
  assertEquals(
    deloadProposal({
      reading: reading([
        { week: 2, outcome: 'setback' },
        { week: 3, outcome: 'mid_band' },
        { week: 4, outcome: 'setback' },
      ]),
      ...BLOCK,
    }),
    null,
  );
});

Deno.test('⛔⛔ A MISSED WEEK RESETS THE RUN — the athlete already got the rest', () => {
  /**
   * ⛔ CORRECTED 2026-08-29, the same day this shipped the other way. The first version SKIPPED a
   * silent week, so weeks 2 and 4 read as "two in a row" across an untrained week 3.
   *
   * The field is consistent: a whole missed week is an UNPLANNED RECOVERY WEEK, resumed from where
   * you left off — so proposing a deload after one offers a thing that already happened. Two short
   * weeks either side of a break are not two in a row.
   */
  assertEquals(
    deloadProposal({
      reading: reading([
        { week: 2, outcome: 'setback' },
        { week: 4, outcome: 'setback' },
      ]),
      ...BLOCK,
    }),
    null,
  );
});

Deno.test('⛔ A MISSED WEEK STILL IS NOT A BAD WEEK — resetting is not the same as counting', () => {
  // Two clean weeks, then nothing at all. Absence must never manufacture a proposal on its own.
  assertEquals(
    deloadProposal({
      reading: reading([
        { week: 1, outcome: 'clean' },
        { week: 2, outcome: 'clean' },
      ]),
      throughWeek: 8,
      totalWeeks: 12,
    }),
    null,
  );
  // ⛔ AND ONE SHORT WEEK FOLLOWED BY SILENCE PROPOSES NOTHING. The break is the deload.
  assertEquals(
    deloadProposal({
      reading: reading([{ week: 3, outcome: 'setback' }]),
      throughWeek: 8,
      totalWeeks: 12,
    }),
    null,
  );
});

Deno.test('⛔ `no_evidence` IS NOT A BAD WEEK, and does not mark the week as trained', () => {
  // A matched row whose sets were never completed. Silence holds.
  assertEquals(
    deloadProposal({
      reading: reading([
        { week: 2, outcome: 'no_evidence' },
        { week: 3, outcome: 'no_evidence' },
      ]),
      ...BLOCK,
    }),
    null,
  );
  // ⛔ AND IT READS AS A MISSED WEEK, SO IT BREAKS THE RUN. A row that was prescribed and never
  // completed is not a week the athlete trained — same as never opening the app.
  assertEquals(
    deloadProposal({
      reading: reading([
        { week: 2, outcome: 'setback' },
        { week: 3, outcome: 'no_evidence' },
        { week: 4, outcome: 'setback' },
      ]),
      ...BLOCK,
    }),
    null,
  );
});

Deno.test('⛔ ANY heavy session coming up short makes the week short (OURS, p245 is ambiguous)', () => {
  const p = deloadProposal({
    reading: reading([
      { week: 2, outcome: 'setback', pattern: 'push_upper' as ViadaPattern, movement: 'Bench Press' },
      { week: 2, outcome: 'clean', pattern: 'hinge_lower' as ViadaPattern, movement: 'Deadlift' },
      { week: 3, outcome: 'clean', pattern: 'push_upper' as ViadaPattern, movement: 'Bench Press' },
      { week: 3, outcome: 'setback', pattern: 'hinge_lower' as ViadaPattern, movement: 'Deadlift' },
    ]),
    ...BLOCK,
  });
  assert(p, 'one short lift is enough to mark the week');
  assertEquals(p.week, 4);
  // ⛔ THE EVIDENCE NAMES THE SESSIONS, so a surface can say WHY rather than asserting a verdict.
  assertEquals(p.evidence.length, 2);
  assertEquals(p.evidence.map((e) => e.movement).sort(), ['Bench Press', 'Deadlift']);
});

Deno.test('⛔ A WEEK ALREADY RUNNING TAPER IS NOT PROPOSED AGAIN', () => {
  // ⛔ THIS IS ALSO THE RE-OFFER GUARD: once a proposal is accepted and week 4 becomes taper, the
  // same two bad weeks must not raise it again on every restate.
  assertEquals(
    deloadProposal({
      reading: reading([
        { week: 2, outcome: 'setback' },
        { week: 3, outcome: 'setback' },
      ]),
      alreadyTaper: [4],
      ...BLOCK,
    }),
    null,
  );
});

Deno.test('⛔ NOTHING IS PROPOSED PAST THE END OF THE BLOCK', () => {
  assertEquals(
    deloadProposal({
      reading: reading([
        { week: 11, outcome: 'setback' },
        { week: 12, outcome: 'setback' },
      ]),
      throughWeek: 12,
      totalWeeks: 12,
    }),
    null,
  );
});

Deno.test('⛔ EVIDENCE STOPS AT `throughWeek` — the live week is still being trained', () => {
  // Weeks 3 and 4 are both short, but the reader has only been given evidence through week 3.
  assertEquals(
    deloadProposal({
      reading: reading([
        { week: 3, outcome: 'setback' },
        { week: 4, outcome: 'setback' },
      ]),
      throughWeek: 3,
      totalWeeks: 12,
    }),
    null,
  );
});

Deno.test('⛔ THE LATEST RUN WINS — one live decision, not a history of them', () => {
  const p = deloadProposal({
    reading: reading([
      { week: 2, outcome: 'setback' },
      { week: 3, outcome: 'setback' },
      { week: 5, outcome: 'clean' },
      { week: 8, outcome: 'setback' },
      { week: 9, outcome: 'setback' },
    ]),
    ...BLOCK,
  });
  assert(p);
  assertEquals(p.because, [8, 9]);
  assertEquals(p.week, 10);
});

Deno.test('⛔ AN EMPTY BLOCK PROPOSES NOTHING — silence is the starting state', () => {
  assertEquals(deloadProposal({ reading: reading([]), ...BLOCK }), null);
});

Deno.test('⛔ THE RULE IN FORCE IS NAMED, so a future reader finds the reasoning not just the loop', () => {
  assert(DELOAD_MISSED_WEEK_RESETS_IS_OURS.includes('RESETS'));
  assert(DELOAD_MISSED_WEEK_RESETS_IS_OURS.includes('unplanned recovery week'));
  // ⛔ AND THE REFUSAL SURVIVES THE CORRECTION: a missed week is still never a bad week.
  assert(DELOAD_MISSED_WEEK_RESETS_IS_OURS.includes('absence as failure'));
});

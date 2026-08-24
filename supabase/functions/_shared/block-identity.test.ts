import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { resolveBlockIdentity, NON_RACE_GOAL_FOCUS } from './block-identity.ts';
import { protocolEffortRead, protocolUsesRir, PROTOCOL_PROFILES } from './strength-profiles.ts';
import { computeLiftVerdict } from './response-model/weekly.ts';
import { readStrengthProtocol, protocolExpectsE1rmToDip } from './insights/strength-protocol-read.ts';

/**
 * BLOCK IDENTITY — the card that tells every surface what block the athlete is in.
 *
 * ⛔ THE POINT OF THIS FILE. The card exists because three surfaces each answered "what plan is this?"
 * for themselves and disagreed (Q-230, audit F3/F9). These tests pin the answers so the next reader
 * that needs one does not add a fourth derivation.
 *
 * ⚠️ LAW 6 NOTE: at the time of writing NOTHING reads this card. That is deliberate — the card ships
 * first and the readers are wired one at a time behind their own proofs. The behaviour-unchanged
 * proof for THIS change is the `protocolUsesRir` / `resolveProfile` block at the bottom: the registry
 * gained a field and a reader, and every existing protocol still behaves exactly as it did.
 */

// A twelve-week strength-primary block as the builder actually stores it. ⚠️ THE SHAPE HERE IS THE
// PRE-2026-08-15 ONE ON PURPOSE — three anchor cycles, each written as a work phase (weeks 1-3) plus
// its own deload (week 4). **Every block already on an athlete's calendar looks like this**, and the
// card must keep reading them correctly after the restructure. The new shape is pinned below.
const ALL_ANCHOR_12 = {
  source: 'strength_primary',
  user_selected_start_date: '2026-07-27', // a Monday
  duration_weeks: 12,
  phase_structure: {
    phases: [
      { name: 'Anchor', start_week: 1, end_week: 3, weeks_in_phase: 3 },
      { name: 'Deload', start_week: 4, end_week: 4, weeks_in_phase: 1 },
      { name: 'Anchor', start_week: 5, end_week: 7, weeks_in_phase: 3 },
      { name: 'Deload', start_week: 8, end_week: 8, weeks_in_phase: 1 },
      { name: 'Anchor', start_week: 9, end_week: 11, weeks_in_phase: 3 },
      { name: 'Deload', start_week: 12, end_week: 12, weeks_in_phase: 1 },
    ],
    recovery_weeks: [4, 8, 12],
  },
};

/** The post-2026-08-15 shape: test · leader · leader · deload · anchor · test (work order §0). */
const FOREVER_12 = {
  source: 'strength_primary',
  user_selected_start_date: '2026-07-27',
  duration_weeks: 12,
  phase_structure: {
    phases: [
      { name: 'TM Test', start_week: 1, end_week: 1, weeks_in_phase: 1 },
      { name: 'Leader', start_week: 2, end_week: 4, weeks_in_phase: 3 },
      { name: 'Leader', start_week: 5, end_week: 7, weeks_in_phase: 3 },
      { name: 'Deload', start_week: 8, end_week: 8, weeks_in_phase: 1 },
      { name: 'Anchor', start_week: 9, end_week: 11, weeks_in_phase: 3 },
      { name: 'TM Test', start_week: 12, end_week: 12, weeks_in_phase: 1 },
    ],
    recovery_weeks: [8],
  },
};

const card = (config: any, onDateIso: string, goal?: any) =>
  resolveBlockIdentity({ planConfig: config, onDateIso, goal, planId: 'p1', planName: 'Strength Focus' });

// ---------------------------------------------------------------------------
// The protocol — one answer, from either dialect
// ---------------------------------------------------------------------------

Deno.test('protocol: a strength-primary block identifies itself even though it never writes strength_protocol', () => {
  const c = card(ALL_ANCHOR_12, '2026-07-29');
  assertEquals(c.protocolId, 'strength_primary');
  assertEquals(c.protocolKnown, true);
  // ⛔ THIS IS AUDIT F3. `coach` read only `config.strength_protocol` and got null here, which left
  // the generic "estimated one-rep maxes have been sliding" line un-suppressed on a block designed
  // to dip. One resolver, both dialects.
});

Deno.test('protocol: a run/tri plan is read off the stamped key', () => {
  const c = card({ strength_protocol: 'five_by_five', user_selected_start_date: '2026-07-27', duration_weeks: 8 }, '2026-07-29');
  assertEquals(c.protocolId, 'five_by_five');
  assertEquals(c.protocolKnown, true);
});

Deno.test('protocol: strength_protocol "none" is not a protocol', () => {
  const c = card({ strength_protocol: 'none', user_selected_start_date: '2026-07-27', duration_weeks: 8 }, '2026-07-29');
  assertEquals(c.protocolId, null);
  assertEquals(c.protocolKnown, false);
});

Deno.test('protocol: an UNRECOGNISED id reads as unknown — it does NOT resolve to durability', () => {
  const c = card({ strength_protocol: 'wendler_forever_2027', user_selected_start_date: '2026-07-27', duration_weeks: 8 }, '2026-07-29');
  assertEquals(c.protocolId, 'wendler_forever_2027'); // carried so it can be logged
  assertEquals(c.protocolKnown, false);
  // ⛔ Q-192 / D-322, third instance prevented: `resolveProfile()` returns `durability` for ANY
  // unrecognised id, so a missing entry and a deliberate choice were indistinguishable. Here they
  // are not, and the effort read goes silent rather than confidently wrong.
  assertEquals(c.effortRead, 'none');
});

// ---------------------------------------------------------------------------
// How effort is read — the RIR → AMRAP switch, stated once
// ---------------------------------------------------------------------------

Deno.test('effort: a 5/3/1 block reads AMRAP, never RIR', () => {
  assertEquals(card(ALL_ANCHOR_12, '2026-07-29').effortRead, 'amrap');
});

Deno.test('effort: every auto-regulated protocol still reads RIR', () => {
  for (const id of ['durability', 'neural_speed', 'upper_aesthetics', 'five_by_five', 'minimum_dose'] as const) {
    assertEquals(card({ strength_protocol: id, user_selected_start_date: '2026-07-27', duration_weeks: 8 }, '2026-07-29').effortRead, 'rir', id);
  }
});

Deno.test('effort: a plan with no strength at all says nothing', () => {
  assertEquals(card({ user_selected_start_date: '2026-07-27', duration_weeks: 8 }, '2026-07-29').effortRead, 'none');
});

// ---------------------------------------------------------------------------
// Where in the block — read off what the BUILDER stored, never re-derived
// ---------------------------------------------------------------------------

Deno.test('cycle: week 1 opens at 85% — an all-out set, but NOT the reading', () => {
  const c = card(ALL_ANCHOR_12, '2026-07-29'); // Wed of week 1
  assertEquals(c.weekIndex, 1);
  assertEquals(c.cycle, { kind: 'anchor', weekInCycle: 1, isDeload: false, isTest: false });
  assertEquals(c.topSetPct, 0.85);
  // ⛔ THE DISTINCTION THIS TEST EXISTS FOR, and the first draft of the card got it wrong.
  // EVERY non-deload anchor week ends on an open set, so weeks 1, 2 and 3 all produce a rep count.
  // Only the 95% week is the one that moves the working number. A surface that treats week 1's
  // eight-rep set as "the measurement" would advance the bar off a set never meant to decide it.
  assertEquals(c.hasAllOutSet, true);
  assertEquals(c.isMeasurementWeek, false);
});

Deno.test('cycle: week 2 is the same — open set at 90%, still not the reading', () => {
  const c = card(ALL_ANCHOR_12, '2026-08-05');
  assertEquals(c.cycle, { kind: 'anchor', weekInCycle: 2, isDeload: false, isTest: false });
  assertEquals(c.topSetPct, 0.90);
  assertEquals(c.hasAllOutSet, true);
  assertEquals(c.isMeasurementWeek, false);
});

Deno.test('cycle: week 3 is THE reading — the all-out set at 95%', () => {
  const c = card(ALL_ANCHOR_12, '2026-08-12'); // week 3
  assertEquals(c.weekIndex, 3);
  assertEquals(c.cycle, { kind: 'anchor', weekInCycle: 3, isDeload: false, isTest: false });
  assertEquals(c.hasAllOutSet, true);
  assertEquals(c.isMeasurementWeek, true);
  assertEquals(c.topSetPct, 0.95);
  // ⚠️ Week 3 is the protected one and week 4 is the deload — this pins the pair, because they were
  // remembered backwards more than once.
});

Deno.test('cycle: week 4 is the deload — no open set, nothing to read', () => {
  const c = card(ALL_ANCHOR_12, '2026-08-19'); // week 4
  assertEquals(c.weekIndex, 4);
  // ⛔ `weekInCycle: 0` — a light week is inside no cycle (§1c). It used to report 4, which was the
  // deload's position in the old four-week cycle; there is no week 4 any more, and an OLD stored
  // block's deload entry is read the same way a new standalone one is.
  assertEquals(c.cycle, { kind: 'anchor', weekInCycle: 0, isDeload: true, isTest: false });
  assertEquals(c.hasAllOutSet, false);
  assertEquals(c.isMeasurementWeek, false);
  // ⚠️ 1.00, NOT 0.60. The 7th-week deload's last set is a single AT the training max (Forever p.21);
  // the old 40/50/60 deload topped out at 60% of it. The set is one rep either way.
  assertEquals(c.topSetPct, 1.00);
  // ⛔ This is the fact audit F2/F4 needed: an e1RM that drops in week 5 dropped because week 4 was
  // prescribed at 40-60%, not because the athlete is sliding. A reader with this card cannot make
  // that mistake — and cannot tell him to ease off his running because of it.
});

Deno.test('cycle: the second cycle keeps counting — week 7 measures, week 8 deloads', () => {
  assertEquals(card(ALL_ANCHOR_12, '2026-09-09').cycle, { kind: 'anchor', weekInCycle: 3, isDeload: false, isTest: false });
  assertEquals(card(ALL_ANCHOR_12, '2026-09-09').isMeasurementWeek, true);
  assertEquals(card(ALL_ANCHOR_12, '2026-09-16').cycle, { kind: 'anchor', weekInCycle: 0, isDeload: true, isTest: false });
});

// ── The post-2026-08-15 shape ───────────────────────────────────────────────────────────────────

Deno.test('⛔ A TM-TEST WEEK IS READ AS A TEST, AND ITS TOP SET IS THE GATE', () => {
  // Week 1 of the new shape. It carries an open set at the TRAINING MAX — that rep count is what
  // decides the next block's number (§1d), so a card reporting "no all-out set" would hide it.
  const c = card(FOREVER_12, '2026-07-29');
  assertEquals(c.weekIndex, 1);
  assertEquals(c.cycle, { kind: 'leader', weekInCycle: 0, isDeload: false, isTest: true });
  assertEquals(c.hasAllOutSet, true);
  assertEquals(c.isMeasurementWeek, true, 'the TM single is at 100% — past the 95% validity mark');
  assertEquals(c.topSetPct, 1.00);
  assertEquals(c.phase, 'TM Test');
  // ⛔ RULED as taper (arrive rested — `normalizePhaseKey` still says 'taper'), PRINTED as test
  // (2026-08-24): the card's phaseWord is the word a screen shows, and week 1 of a Strong Focus
  // block was reading "Taper" on the Today card.
  assertEquals(c.phaseWord, 'test', 'a test week prints as a test, not a taper');
});

Deno.test('⛔ THE NEW MAP\u2019S CYCLE WEEKS STILL RESOLVE — including week 3 of a cycle', () => {
  // ⛔ THE REGRESSION THIS PINS. `resolveCycle`'s bound was `weekInCycle < WEEKS_PER_CYCLE`, correct
  // for a four-week cycle and silently excluding the 95% week once the constant became 3.
  assertEquals(card(FOREVER_12, '2026-08-05').cycle, { kind: 'leader', weekInCycle: 1, isDeload: false, isTest: false });
  assertEquals(card(FOREVER_12, '2026-08-19').cycle, { kind: 'leader', weekInCycle: 3, isDeload: false, isTest: false });
  // Week 11 — the anchor's 95% week, the one the whole card exists to identify.
  assertEquals(card(FOREVER_12, '2026-10-07').cycle, { kind: 'anchor', weekInCycle: 3, isDeload: false, isTest: false });
  assertEquals(card(FOREVER_12, '2026-10-07').isMeasurementWeek, true);
  // Week 8 — the standalone 7th-week deload, between the leaders and the anchor.
  assertEquals(card(FOREVER_12, '2026-09-16').cycle, { kind: 'leader', weekInCycle: 0, isDeload: true, isTest: false });
});

Deno.test('cycle: a LEADER cycle never measures, at any week', () => {
  const leaderFirst = {
    ...ALL_ANCHOR_12,
    phase_structure: {
      phases: [
        { name: 'Leader', start_week: 1, end_week: 3, weeks_in_phase: 3 },
        { name: 'Deload', start_week: 4, end_week: 4, weeks_in_phase: 1 },
      ],
      recovery_weeks: [4],
    },
  };
  assertEquals(card(leaderFirst, '2026-08-12').cycle, { kind: 'leader', weekInCycle: 3, isDeload: false, isTest: false });
  assertEquals(card(leaderFirst, '2026-08-12').hasAllOutSet, false);
  assertEquals(card(leaderFirst, '2026-08-12').isMeasurementWeek, false);
  assertEquals(card(leaderFirst, '2026-08-12').topSetPct, 0.95); // the weight is the same; the open set is not there
  // ⛔ A leader cycle is every-set-five by design — dropping the open set is HALF of what makes the
  // lowered working number lower-fatigue. So a leader block produces no reading at all, and a
  // surface waiting for one must not read its silence as a miss.
});

// ---------------------------------------------------------------------------
// The phase WORD — what a screen is allowed to print
// ---------------------------------------------------------------------------

Deno.test('phase word: the internal cycle names never reach a screen', () => {
  // ⛔ 'Leader' and 'Anchor' are Wendler's words for the two cycle kinds. They are correct, they are
  // what the builder stores, and they mean nothing to an athlete looking at a fitness row. The card
  // hands out a plain word so no screen has to keep its own translation table — the moment two do,
  // they disagree, and a plan that is not 5/3/1 falls through whichever table's default it hits.
  assertEquals(card(ALL_ANCHOR_12, '2026-07-29').phase, 'Anchor');   // stored
  assertEquals(card(ALL_ANCHOR_12, '2026-07-29').phaseWord, 'build'); // printed
  assertEquals(card(ALL_ANCHOR_12, '2026-08-19').phase, 'Deload');
  assertEquals(card(ALL_ANCHOR_12, '2026-08-19').phaseWord, 'recovery');
});

Deno.test('phase word: a plan that already speaks plainly is passed through, not re-mapped', () => {
  // The endurance vocabulary IS the display vocabulary — base/build/peak/taper/recovery. A run plan
  // renders correctly through the same field with nothing 5/3/1-shaped involved.
  const runPlan = {
    strength_protocol: 'durability',
    user_selected_start_date: '2026-07-27',
    duration_weeks: 16,
    phases: [
      { name: 'base', start_week: 1 },
      { name: 'build', start_week: 7 },
      { name: 'taper', start_week: 15 },
    ],
  };
  assertEquals(card(runPlan, '2026-08-12').phaseWord, 'base');
  assertEquals(card(runPlan, '2026-09-23').phaseWord, 'build');
  assertEquals(card(runPlan, '2026-11-11').phaseWord, 'taper');
});

Deno.test('phase word: an unplaceable week is NULL, and a screen then says only "week N of M"', () => {
  // ⚠️ Null is the honest answer and it has to survive to the render: the fallback for "the plan did
  // not say" is silence about the phase, never a default word. Q-192's whole failure mode was a
  // default that looked exactly like a deliberate choice.
  const noPhases = { source: 'strength_primary', user_selected_start_date: '2026-07-27', duration_weeks: 12 };
  const c = card(noPhases, '2026-07-29');
  assertEquals(c.weekIndex, 1);
  assertEquals(c.phase, null);
  assertEquals(c.phaseWord, null);
});

Deno.test('cycle: an ENDURANCE plan has phases but no cycles, and says so with null', () => {
  const runPlan = {
    strength_protocol: 'durability',
    user_selected_start_date: '2026-07-27',
    duration_weeks: 16,
    phases: [
      { name: 'base', start_week: 1 },
      { name: 'build', start_week: 7 },
      { name: 'taper', start_week: 15 },
    ],
  };
  const c = card(runPlan, '2026-08-12');
  assertEquals(c.phase, 'base');
  assertEquals(c.phaseSource, 'config_phases_fallback');
  assertEquals(c.cycle, null);
  // ⛔ NOT `false`, NOT `0`. A run block has no week-in-cycle, and inventing one would be a
  // fabricated fact travelling as a measured one.
  assertEquals(c.hasAllOutSet, null);
  assertEquals(c.isMeasurementWeek, null);
  assertEquals(c.topSetPct, null);
});

// ---------------------------------------------------------------------------
// The goal — both families, and silence when the plan does not say
// ---------------------------------------------------------------------------

Deno.test('goal: a race block carries the event, the date and the target', () => {
  const c = card(
    { user_selected_start_date: '2026-07-27', duration_weeks: 16, race_name: 'Oceanside', target_finish_time_seconds: 19800 },
    '2026-08-12',
    { goal_type: 'event', target_date: '2027-04-03', sport: 'triathlon', distance: '70.3' },
  );
  assertEquals(c.goal, {
    kind: 'race',
    known: true,
    sport: 'triathlon',
    distance: '70.3',
    raceDateIso: '2027-04-03',
    raceName: 'Oceanside',
    targetFinishSeconds: 19800,
  });
});

Deno.test('goal: a non-race block carries what it is chasing', () => {
  const c = card({ ...ALL_ANCHOR_12, goal_focus: 'get_stronger' }, '2026-07-29');
  assertEquals(c.goal, { kind: 'non_race', known: true, focus: 'get_stronger' });
});

Deno.test('goal: speed and distance are DIFFERENT goals, not both "run: develop"', () => {
  const base = { user_selected_start_date: '2026-07-27', duration_weeks: 8 };
  assertEquals(card({ ...base, goal_focus: 'build_speed' }, '2026-07-29').goal, { kind: 'non_race', known: true, focus: 'build_speed' });
  assertEquals(card({ ...base, goal_focus: 'build_endurance' }, '2026-07-29').goal, { kind: 'non_race', known: true, focus: 'build_endurance' });
  // ⛔ Michael: *"and state knows the goal? from race to stregnth to vo2 max to speed to distance"*.
  // Today both arrive as "run: develop" and are indistinguishable. This is the field that separates them.
});

Deno.test('goal: an UNRECOGNISED focus is carried for the log but marked unknown', () => {
  const c = card({ user_selected_start_date: '2026-07-27', duration_weeks: 8, goal_focus: 'build_vo2max' }, '2026-07-29');
  assertEquals(c.goal, { kind: 'non_race', known: false, focus: 'build_vo2max' });
  // ⚠️ A newer client offering a goal this build has not shipped yet. The surface renders nothing;
  // it does not guess, and it does not crash. Adding the goal later is ONE entry in NON_RACE_GOAL_FOCUS.
});

Deno.test('goal: a block that does not say is unknown — never a default', () => {
  assertEquals(card(ALL_ANCHOR_12, '2026-07-29').goal, { kind: 'unknown', known: false });
  // ⚠️ This is every plan built before Q-230 step 2, INCLUDING the live one. The athlete's pick was
  // collapsed to capacity/maintenance at the builder and never persisted. Unknown is the honest answer.
});

Deno.test('goal: the vocabulary matches the client picker', () => {
  // ⛔ DRIFT GUARD. `src/lib/non-race-goal-seeds.ts` is the authority for what an athlete can choose;
  // this list must not fall behind it, or a real pick renders as "unknown".
  assertEquals([...NON_RACE_GOAL_FOCUS].sort(), [
    'build_endurance', 'build_muscle', 'build_speed', 'get_stronger', 'maintain', 'starting_over',
  ]);
});

// ---------------------------------------------------------------------------
// Silence, and the pre-start edge
// ---------------------------------------------------------------------------

Deno.test('a plan with no start date knows nothing and admits it', () => {
  const c = card({ source: 'strength_primary' }, '2026-07-29');
  assertEquals(c.weekIndex, null);
  assertEquals(c.cycle, null);
  assertEquals(c.known, false);
  // The protocol is still resolved — that is a plan fact, not a date fact.
  assertEquals(c.protocolId, 'strength_primary');
});

Deno.test('a null config produces a card that says nothing, and does not throw', () => {
  const c = resolveBlockIdentity({ planConfig: null, onDateIso: '2026-07-29' });
  assertEquals(c.known, false);
  assertEquals(c.protocolId, null);
  assertEquals(c.effortRead, 'none');
  assertEquals(c.goal.kind, 'unknown');
});

// ---------------------------------------------------------------------------
// LAW 6 — the registry gained a field and a reader; nothing else moved
// ---------------------------------------------------------------------------

Deno.test('step 2 write side: an OLD block and a NEW one produce the SAME card', () => {
  // ⛔ THE CONTINUITY PROOF FOR THE STAMP. `generate-strength-plan` now writes
  // `strength_protocol: 'strength_primary'` alongside the `source` it always wrote. Every block built
  // before that — including the live one — carries only `source`. Both must read identically, or the
  // stamp has split the fleet in two instead of ending a split.
  const oldBlock = card(ALL_ANCHOR_12, '2026-08-12');
  const newBlock = card({ ...ALL_ANCHOR_12, strength_protocol: 'strength_primary' }, '2026-08-12');
  assertEquals(newBlock, oldBlock);
});

Deno.test('step 2 write side: the stamp itself changes nothing the athlete reads', () => {
  // ⚠️ LAW 6, STATED HONESTLY. Stamping the protocol makes the coach resolve a `strength_primary`
  // profile where it used to fall through to `durability`. That is the ONLY thing it changes, and the
  // change is inert: the profile's sole use in coach is `getTargetRir`, and `computeLiftVerdict`
  // ignores the target entirely when the athlete's RIR is null — which it always is on a protocol
  // that does not collect it. Same words on screen, before and after.
  const durabilityTarget = 2.5;
  const strengthPrimaryTarget = 2;
  for (const trend of ['improving', 'declining', 'holding'] as const) {
    assertEquals(
      computeLiftVerdict(null, durabilityTarget, trend, 'build', 'squat'),
      computeLiftVerdict(null, strengthPrimaryTarget, trend, 'build', 'squat'),
      trend,
    );
  }

  // ⚠️ HISTORY, KEPT ON PURPOSE. When step 2 shipped, these two read `false` and `null` — the stamp
  // deliberately did not touch the narrative, so the write side could land on its own proof. Step 3
  // then taught the reader, and THAT is where the words on screen changed. The assertions below are
  // the post-step-3 values; the change is proved in `block-identity-readers.test.ts`.
  assertEquals(protocolExpectsE1rmToDip('strength_primary'), true);
  // Still silent week to week — the protocol reader speaks only on a missed prescription.
  assertEquals(readStrengthProtocol({ protocolId: 'strength_primary' } as any), null);
});

Deno.test('behaviour unchanged: every protocol answers protocolUsesRir exactly as before', () => {
  assertEquals(protocolUsesRir(PROTOCOL_PROFILES.durability), true);
  assertEquals(protocolUsesRir(PROTOCOL_PROFILES.neural_speed), true);
  assertEquals(protocolUsesRir(PROTOCOL_PROFILES.upper_aesthetics), true);
  assertEquals(protocolUsesRir(PROTOCOL_PROFILES.triathlon_performance), true);
  assertEquals(protocolUsesRir(PROTOCOL_PROFILES.minimum_dose), true);
  assertEquals(protocolUsesRir(PROTOCOL_PROFILES.five_by_five), true);
  assertEquals(protocolUsesRir(PROTOCOL_PROFILES.strength_primary), false);
});

Deno.test('behaviour unchanged: an absent readsEffortAs falls back to usesRir', () => {
  // Only `strength_primary` declares the axis; everything else inherits its existing meaning.
  assertEquals(protocolEffortRead(PROTOCOL_PROFILES.strength_primary), 'amrap');
  assertEquals(protocolEffortRead(PROTOCOL_PROFILES.five_by_five), 'rir');
  assertEquals(protocolEffortRead({ defaultTargetRir: { lower: 2, upper: 2 }, usesRir: false, progression: { minDeviation: 0, minGainPct: 0 }, deload: { maxDeviation: 0, minSessions: 0 } }), 'none');
  assertEquals(protocolEffortRead(null), 'none');
});

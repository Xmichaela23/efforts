/**
 * ⛔ THE REPORTED BUG IS THE FIRST TEST, AND IT IS PERMANENT.
 *
 * On device, 2026-08-10: a fully built week on screen — six training days, long run Sunday, long
 * ride Saturday, hill repeats Thursday — and Continue dead, with nothing on the card saying why.
 * The athlete could not finish intake. Any change that lets a complete week block again fails here.
 *
 * Run: ~/.deno/bin/deno test --no-check src/lib/schedule-gate.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { voiceViolation } from '../../supabase/functions/_shared/state-trend/week-accent.ts';
import {
  longDayCalledFor,
  scheduleBlockedReason,
  scheduleCanContinue,
  type ScheduleGateInput,
} from './schedule-gate.ts';

/** A run+bike athlete who has answered everything the card asks. */
const complete = (over: Partial<ScheduleGateInput> = {}): ScheduleGateInput => ({
  runShown: true,
  rideShown: true,
  longRunDay: 'sunday',
  longRideDay: 'saturday',
  runDays: 3,
  rideDays: 2,
  targetMiles: 14,
  rideHours: 3,
  qualityDays: { run: 'thursday' },
  ...over,
});

// ── THE REGRESSION ───────────────────────────────────────────────────────────────────────────────
Deno.test('⛔ A COMPLETE WEEK CONTINUES', () => {
  // The original report: a fully built week on screen and Continue dead. Everything answered must
  // always pass — this is the assertion the whole module exists to keep true.
  assertEquals(scheduleBlockedReason(complete()), null);
  assertEquals(scheduleCanContinue(complete()), true);
});

Deno.test('⛔ THE GATE ONLY EVER MOVES TOWARD ENABLED — answering never adds a requirement', () => {
  /**
   * THE TRAP THIS KILLS, reported on device: the counts were OPTIONAL, so with `runDays` unset
   * `longDayCalledFor` was false, no long run was demanded, and Continue was LIVE. Picking a count
   * then made the long run required and Continue DIED. Answering an optional question created a new
   * requirement — the athlete's own progress moved the goalposts.
   *
   * The property that forbids it: walking the card in order, every step either keeps the reason it
   * had or replaces it with the NEXT one, and the final step enables. A step that goes from
   * "no reason" back to "a reason" is the bug.
   */
  const steps: Array<[string, ScheduleGateInput]> = [
    ['nothing answered', complete({ runDays: 0, rideDays: 0, longRunDay: '', longRideDay: '', qualityDays: {} })],
    ['runs picked', complete({ runDays: 4, rideDays: 0, longRunDay: '', longRideDay: '', qualityDays: {} })],
    ['rides picked', complete({ runDays: 4, rideDays: 2, longRunDay: '', longRideDay: '', qualityDays: {} })],
    ['long run picked', complete({ runDays: 4, rideDays: 2, longRideDay: '', qualityDays: {} })],
    ['long ride picked', complete({ runDays: 4, rideDays: 2, qualityDays: {} })],
    ['hard day declined', complete({ runDays: 4, rideDays: 2, qualityDays: {} })],
  ];
  const reasons = steps.map(([, s]) => scheduleBlockedReason(s));
  // Every intermediate step is blocked for a REASON, and the last one is open.
  assertEquals(reasons[0], 'Runs a week has no number yet.');
  assertEquals(reasons[1], 'Rides a week has no number yet.');
  assertEquals(reasons[2], 'The long run has no day yet.');
  assertEquals(reasons[3], 'The long ride has no day yet.');
  assertEquals(reasons[4], null, 'the hard day is optional — the week is finishable without it');
  assertEquals(reasons[5], null);
  // ⛔ MONOTONIC: once the gate opens it never closes again on further input.
  const firstOpen = reasons.indexOf(null);
  assertEquals(
    reasons.slice(firstOpen).every((r) => r === null),
    true,
    'the gate re-closed after opening — answering must never add a requirement',
  );
});

Deno.test('⛔ FREQUENCY IS REQUIRED — there is no silent server default to fall back on', () => {
  // `create-goal-and-materialize-plan:2583` falls back to a hardcoded 2 when `run_days` is absent.
  // Leaving the count unset does not mean "the engine decides", it means the engine got 2 and
  // nobody said so. The gate is what stops that from being possible.
  assertEquals(scheduleBlockedReason(complete({ runDays: 0 })), 'Runs a week has no number yet.');
  assertEquals(scheduleBlockedReason(complete({ runDays: 1 })), 'Runs a week has no number yet.');
  assertEquals(scheduleBlockedReason(complete({ runDays: 2 })), null);
  assertEquals(scheduleBlockedReason(complete({ rideDays: 0 })), 'Rides a week has no number yet.');
  // ⚠️ ONE ride is a complete answer — the pills offer 1/2/3 and a single ride is a real week.
  assertEquals(scheduleBlockedReason(complete({ rideDays: 1, longRideDay: '' })), null);
});

Deno.test('⛔ A QUESTION THE CARD DOES NOT SHOW CANNOT BLOCK THE CARD', () => {
  // The gate used to ask about disciplines by POSTURE ("not out") while the rows render on a
  // narrower test — so a bike the card never asked about demanded an answer, with no control on
  // screen able to give one. The caller now passes the row predicates themselves.
  const bikeHidden = complete({
    rideShown: false, longRideDay: '', rideDays: 0, rideHours: 4,
  });
  assertEquals(scheduleBlockedReason(bikeHidden), null, 'a hidden bike asks for nothing');

  const runHidden = complete({
    runShown: false, longRunDay: '', runDays: 0, targetMiles: 30,
  });
  assertEquals(scheduleBlockedReason(runHidden), null, 'a hidden run asks for nothing');
});

// ── THE HARD DAY IS OPTIONAL ─────────────────────────────────────────────────────────────────────
Deno.test('declining the hard day entirely is a COMPLETE answer', () => {
  // D-327 permits one hard aerobic day; it never required one. A strength-led block with no club
  // night and no appetite for intervals is a normal week, not an unfinished form.
  assertEquals(scheduleCanContinue(complete({ qualityDays: {} })), true);
});

Deno.test('a HALF-answered hard day blocks, and names itself', () => {
  // A discipline with no day leaves an anchor the solver cannot place. This is the one hard-day
  // state that should stop the flow, and the sentence has to say how to get out of it BOTH ways.
  const reason = scheduleBlockedReason(complete({ qualityDays: { run: '' } }));
  assertEquals(reason, 'The hard day has a discipline but no day. Tapping the discipline again drops it.');
  assertEquals(scheduleBlockedReason(complete({ qualityDays: { bike: '' } })), reason, 'same for a ride');
});

// ── THE LONG DAYS ────────────────────────────────────────────────────────────────────────────────
Deno.test('a long run is required once there is a frequency and a volume to anchor', () => {
  const base = complete({ longRunDay: '' });
  // ⚠️ THE RUNS PILLS OFFER 2/3/4, so the only states this row can be in are unpicked (0) or >= 2.
  // A frequency of 1 is unreachable and is no longer asserted as a passing case — the count gate
  // catches 0 first, and everything else is >= 2.
  assertEquals(scheduleBlockedReason({ ...base, runDays: 3, targetMiles: 14 }), 'The long run has no day yet.');
  assertEquals(scheduleBlockedReason({ ...base, runDays: 0, targetMiles: 14 }), 'Runs a week has no number yet.');
  // No volume typed on the previous screen — nothing to spread, so nothing to anchor. That screen
  // has no gate of its own, so this state is genuinely reachable.
  assertEquals(scheduleBlockedReason({ ...base, runDays: 3, targetMiles: '' }), null);
  assertEquals(longDayCalledFor({ ...base, runDays: 2, targetMiles: 1 }, 'run'), true);
  assertEquals(longDayCalledFor({ ...base, runDays: 2, targetMiles: 0 }, 'run'), false);
});

Deno.test('⛔ ONE RIDE A WEEK NEEDS NO LONG-RIDE DAY, and that threshold is the rule', () => {
  // With a single ride there is nothing to distinguish it FROM — it is the week's ride, long by
  // default. Two or more, and which one is the long one becomes a real question.
  const base = complete({ longRideDay: '' });
  assertEquals(scheduleBlockedReason({ ...base, rideDays: 2, rideHours: 3 }), 'The long ride has no day yet.');
  assertEquals(scheduleBlockedReason({ ...base, rideDays: 1, rideHours: 3 }), null, 'one ride is complete');
  assertEquals(scheduleBlockedReason({ ...base, rideDays: 3, rideHours: 3 }), 'The long ride has no day yet.');
  assertEquals(scheduleBlockedReason({ ...base, rideDays: 2, rideHours: '' }), null, 'no hours typed');
  assertEquals(longDayCalledFor({ ...base, rideDays: 1, rideHours: 3 }, 'bike'), false);
  assertEquals(longDayCalledFor({ ...base, rideDays: 2, rideHours: 3 }, 'bike'), true);
});

Deno.test('the run is reported before the ride when both are missing', () => {
  // Order is declared so the sentence is stable rather than whichever branch happened to run first.
  const both = complete({ longRunDay: '', longRideDay: '' });
  assertEquals(scheduleBlockedReason(both), 'The long run has no day yet.');
});

// ── THE SENTENCE ITSELF ──────────────────────────────────────────────────────────────────────────
Deno.test('every reason is in voice, and there is always a reason when blocked', () => {
  const blocked: ScheduleGateInput[] = [
    complete({ runDays: 0 }),
    complete({ rideDays: 0 }),
    complete({ longRunDay: '' }),
    complete({ longRideDay: '' }),
    complete({ qualityDays: { run: '' } }),
  ];
  for (const state of blocked) {
    const reason = scheduleBlockedReason(state);
    assertEquals(typeof reason, 'string', 'a blocked gate must say why');
    assertEquals(voiceViolation(reason as string), null, `voice: ${reason}`);
    // ⛔ THE BUTTON AND THE SENTENCE ARE ONE DECISION. If these ever disagree, the athlete is back
    // to a dead control with no cause — which is the whole defect this module was extracted for.
    assertEquals(scheduleCanContinue(state), false);
  }
});

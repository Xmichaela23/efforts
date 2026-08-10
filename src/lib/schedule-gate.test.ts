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
Deno.test('⛔ A BUILT WEEK CONTINUES — the counts left at 0 must not block', () => {
  // The exact reported state: every anchor placed, the preview showing six days, and the two COUNTS
  // never opened — which is legal, because `assemblePayload` omits them and the engine places what
  // it likes. The old gate returned false on `rideDays <= 0` and said nothing.
  const state = complete({ runDays: 0, rideDays: 0 });
  assertEquals(scheduleBlockedReason(state), null);
  assertEquals(scheduleCanContinue(state), true);
});

Deno.test('a count left at 0 blocks nothing on its own, in any combination', () => {
  for (const [runDays, rideDays] of [[0, 0], [0, 2], [3, 0], [2, 1]] as const) {
    const state = complete({ runDays, rideDays });
    assertEquals(scheduleCanContinue(state), true, `runDays ${runDays}, rideDays ${rideDays}`);
  }
});

Deno.test('⛔ A QUESTION THE CARD DOES NOT SHOW CANNOT BLOCK THE CARD', () => {
  // The second half of the bug: the gate asked about disciplines by POSTURE ("not out") while the
  // rows render on a narrower test — so a bike the card never asked about demanded an answer, with
  // no control on screen able to give one. The caller now passes the row predicates themselves.
  const bikeHidden = complete({
    rideShown: false, longRideDay: '', rideDays: 2, rideHours: 4,
  });
  assertEquals(scheduleBlockedReason(bikeHidden), null, 'a hidden long ride is not required');

  const runHidden = complete({
    runShown: false, longRunDay: '', runDays: 4, targetMiles: 30,
  });
  assertEquals(scheduleBlockedReason(runHidden), null, 'a hidden long run is not required');
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
Deno.test('a long day is required only once it has been made to matter', () => {
  const base = complete({ longRunDay: '' });
  // Two-plus runs AND a volume — then the anchor matters and its absence blocks.
  assertEquals(scheduleBlockedReason({ ...base, runDays: 3, targetMiles: 14 }), 'The long run has no day yet.');
  // One run, or no volume typed — nothing to anchor, so nothing to demand.
  assertEquals(scheduleBlockedReason({ ...base, runDays: 1, targetMiles: 14 }), null);
  assertEquals(scheduleBlockedReason({ ...base, runDays: 3, targetMiles: '' }), null);
  assertEquals(longDayCalledFor({ ...base, runDays: 2, targetMiles: 1 }, 'run'), true);
  assertEquals(longDayCalledFor({ ...base, runDays: 2, targetMiles: 0 }, 'run'), false);
});

Deno.test('the long ride follows the same rule on its own inputs', () => {
  const base = complete({ longRideDay: '' });
  assertEquals(scheduleBlockedReason({ ...base, rideDays: 2, rideHours: 3 }), 'The long ride has no day yet.');
  assertEquals(scheduleBlockedReason({ ...base, rideDays: 1, rideHours: 3 }), null);
  assertEquals(scheduleBlockedReason({ ...base, rideDays: 2, rideHours: '' }), null);
});

Deno.test('the run is reported before the ride when both are missing', () => {
  // Order is declared so the sentence is stable rather than whichever branch happened to run first.
  const both = complete({ longRunDay: '', longRideDay: '' });
  assertEquals(scheduleBlockedReason(both), 'The long run has no day yet.');
});

// ── THE SENTENCE ITSELF ──────────────────────────────────────────────────────────────────────────
Deno.test('every reason is in voice, and there is always a reason when blocked', () => {
  const blocked: ScheduleGateInput[] = [
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

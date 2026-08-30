import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { readStrengthProtocol, protocolExpectsE1rmToDip } from './insights/strength-protocol-read.ts';
import { composeCoachEye } from './insights/cross-training-read.ts';

/**
 * STEP 3 — THE READERS. What State actually says once it can identify the block (Q-230, audit F3/F4).
 *
 * ⛔ THESE ARE THE VALUE CHANGES. Steps 1 and 2 were deliberately inert; this file is where words on
 * the screen change, so each test states the sentence that used to appear and why it was wrong.
 */

// ---------------------------------------------------------------------------
// F3 — the false "sliding" claim
// ---------------------------------------------------------------------------

Deno.test('F3: a the previous program block no longer gets accused of sliding', () => {
  // WAS: "Estimated one-rep maxes have been sliding — the one being built." on a block that prescribes
  // 40-60% in week 4 and only reaches 95% once per cycle. True about the number, false about the athlete.
  assertEquals(protocolExpectsE1rmToDip('strength_primary'), true);
});

Deno.test('F3: every other protocol keeps the answer it had', () => {
  assertEquals(protocolExpectsE1rmToDip('five_by_five'), true);
  assertEquals(protocolExpectsE1rmToDip('upper_aesthetics'), true);
  assertEquals(protocolExpectsE1rmToDip('durability'), true);
  assertEquals(protocolExpectsE1rmToDip('minimum_dose'), false);   // holding IS the job — sliding is real news
  assertEquals(protocolExpectsE1rmToDip('neural_speed'), false);   // built to raise the number
  assertEquals(protocolExpectsE1rmToDip('triathlon_performance'), false);
  assertEquals(protocolExpectsE1rmToDip(null), false);             // unchanged; see the note in the source
});

Deno.test('F3: the block speaks only when the reps are missed — not every week', () => {
  const base = { protocolId: 'strength_primary', weekInBlock: 3, isDeloadWeek: false, workingPct: 95 };
  // A working block is silent. Most weeks of a working block are simply the block working.
  assertEquals(readStrengthProtocol({ ...base, e1rmVerdict: 'holding' }), null);
  assertEquals(readStrengthProtocol({ ...base, e1rmVerdict: 'sliding' }), null);

  // The miss is the event. the previous program: you keep increasing until you can no longer hit the
  // prescribed sets and reps.
  const miss = readStrengthProtocol({ ...base, e1rmVerdict: 'sliding', missedPrescribedReps: true });
  assertEquals(typeof miss, 'string');
  assertEquals(String(miss).includes('came up short'), true);
});

Deno.test('F3: a deload week says nothing, on any protocol', () => {
  assertEquals(readStrengthProtocol({ protocolId: 'strength_primary', isDeloadWeek: true, workingPct: 60, e1rmVerdict: 'sliding', missedPrescribedReps: true }), null);
  // ⚠️ This guard already existed and could NEVER FIRE — the coach passed 3 of the reader's 6 fields
  // and `isDeloadWeek` was one of the three it dropped. Built, spec'd, starved.
});

Deno.test('F3: the previous program claims no ceiling, because the protocol does not have one', () => {
  // 5×5 ends at 85% — a real terminal condition, and the reader says so.
  const fiveByFive = readStrengthProtocol({ protocolId: 'five_by_five', workingPct: 85, e1rmVerdict: 'holding' });
  assertEquals(String(fiveByFive).includes('top of the 5×5 ramp'), true);
  // the previous program cycles indefinitely. At 95% it says nothing, because there is nothing to say.
  assertEquals(readStrengthProtocol({ protocolId: 'strength_primary', workingPct: 95, e1rmVerdict: 'holding' }), null);
});

// ---------------------------------------------------------------------------
// F4 — the row that told him to ease off his running
// ---------------------------------------------------------------------------

const RUN_PUSHED = { discipline: 'run', posture: 'maintain', verdict: 'holding', acwr: 1.3 } as any;

Deno.test('F4: a protocol-designed dip no longer prescribes cutting the running', () => {
  const before = composeCoachEye({
    disciplines: [{ discipline: 'strength', posture: 'develop', verdict: 'sliding', acwr: null } as any, RUN_PUSHED],
  });
  // The line that used to fire, verbatim in shape: focus slipping + something else climbing.
  assertEquals(before?.kind, 'ceiling');
  assertEquals(String(before?.detail).includes('easing the running is the lever'), true);

  const after = composeCoachEye({
    disciplines: [
      { discipline: 'strength', posture: 'develop', verdict: 'sliding', acwr: null, verdictTrusted: false } as any,
      RUN_PUSHED,
    ],
  });
  // ⛔ The whole point: the same numbers, and no prescription. This is the only output on the screen
  // that asks him to change what he is doing, and it was firing off a number the plan moved.
  assertEquals(after, null);
});

Deno.test('F4: a REAL slide still fires — this suppresses a cause, not a symptom', () => {
  const real = composeCoachEye({
    disciplines: [
      // minimum_dose / neural_speed style block: nothing about the protocol explains a dip.
      { discipline: 'strength', posture: 'develop', verdict: 'sliding', acwr: null, verdictTrusted: true } as any,
      RUN_PUSHED,
    ],
  });
  assertEquals(real?.kind, 'ceiling');
});

Deno.test('F4: an untrusted verdict does not silence the FLOOR — that reads declared targets, not the verdict', () => {
  const floor = composeCoachEye({
    disciplines: [
      { discipline: 'strength', posture: 'develop', verdict: 'sliding', acwr: null, verdictTrusted: false } as any,
      { discipline: 'run', posture: 'maintain', verdict: 'holding', acwr: 0.9, underTarget: true, actualPerWeek: 6, targetPerWeek: 18, unit: 'mile' } as any,
    ],
  });
  assertEquals(floor?.kind, 'floor');
  // ⚠️ Suppressing the ceiling must not go wide. A discipline under the target the athlete themselves
  // declared is a hard fact, and it has nothing to do with which strength protocol is running.
});

Deno.test('F4: absent verdictTrusted behaves exactly as before', () => {
  // Every existing caller that has not been taught the field keeps its behaviour — the flag is opt-in.
  const legacy = composeCoachEye({
    disciplines: [{ discipline: 'strength', posture: 'develop', verdict: 'sliding', acwr: null } as any, RUN_PUSHED],
  });
  assertEquals(legacy?.kind, 'ceiling');
});

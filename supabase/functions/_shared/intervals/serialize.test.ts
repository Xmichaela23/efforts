import { assert, assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { serializeRide, formatDuration, IntervalsSerializeError } from './serialize.ts';

// Step shapes copied from rides built by the deployed create-goal chain on a throwaway account (2026-09-12, FTP 210).
const anchors = { ftp_w: 210 };

Deno.test('durations', () => {
  assertEquals(formatDuration(45), '45s');
  assertEquals(formatDuration(780), '13m');
  assertEquals(formatDuration(530), '8m50s');
  assertEquals(formatDuration(3600), '1h');
  assertEquals(formatDuration(5430), '1h30m30s');
});

Deno.test('easy ride: one steady step, plan percentages recovered from watts', () => {
  const ev = serializeRide({
    id: 'a', date: '2026-09-10', type: 'ride', name: 'Ride', description: 'Easy ride below 75%.',
    computed: { anchors, steps: [{ kind: 'work', seconds: 3600, powerRange: { lower: 137, upper: 158 } }] },
  });
  assertEquals(ev.description, 'Easy ride below 75%.\n\n- 1h 65-75%');
  assertEquals(ev.moving_time, 3600);
  assertEquals(ev.start_date_local, '2026-09-10T00:00:00');
  assertEquals(ev.external_id, 'a');
});

Deno.test('intervals: warmup and recovery cues, single-value targets', () => {
  const ev = serializeRide({
    id: 'b', date: '2026-09-15', type: 'ride', name: 'Anaerobic Ride', description: null,
    computed: { anchors, steps: [
      { kind: 'warmup', seconds: 780, powerRange: { lower: 116, upper: 147 } },
      { kind: 'work', seconds: 60, powerRange: { lower: 231, upper: 231 } },
      { kind: 'recovery', seconds: 60, powerRange: { lower: 105, upper: 105 } },
    ] },
  });
  assertEquals(ev.description, '- Warmup 13m 55-70%\n- 1m 110%\n- Recovery 1m 50%');
});

Deno.test('sprint with no power goes out as freeride', () => {
  const ev = serializeRide({
    id: 'c', date: '2026-09-17', type: 'ride', name: 'Ride',
    computed: { anchors, steps: [
      { kind: 'work', seconds: 530, powerRange: { lower: 137, upper: 158 } },
      { kind: 'work', label: 'Sprint', seconds: 10 },
    ] },
  });
  assertEquals(ev.description, '- 8m50s 65-75%\n- Sprint 10s freeride');
});

Deno.test('same input, same output', () => {
  const row = { id: 'd', date: '2026-09-15', type: 'ride', name: 'R', computed: { anchors, steps: [{ kind: 'work', seconds: 60, powerRange: { lower: 231, upper: 231 } }] } };
  assertEquals(JSON.stringify(serializeRide(row)), JSON.stringify(serializeRide(structuredClone(row))));
});

Deno.test('explicit failures', () => {
  assertThrows(() => serializeRide({ id: 'e', date: '2026-09-15', type: 'ride', computed: { anchors, steps: [] } }), IntervalsSerializeError, 'no saved steps');
  assertThrows(() => serializeRide({ id: 'f', date: '2026-09-15', type: 'ride', computed: { steps: [{ kind: 'work', seconds: 60 }] } }), IntervalsSerializeError, 'no FTP');
  assertThrows(() => serializeRide({ id: 'g', date: '2026-09-15', type: 'run', computed: { anchors, steps: [{ kind: 'work', seconds: 60 }] } }), IntervalsSerializeError, 'not a ride');
  assertThrows(() => serializeRide({ id: 'h', date: '2026-09-15', type: 'ride', computed: { anchors, steps: [{ kind: 'work', label: 'twice 3x', seconds: 180 }] } }), IntervalsSerializeError, 'repeat');
  assertThrows(() => serializeRide({ id: 'i', date: '2026-09-15', type: 'ride', computed: { anchors, steps: [{ kind: 'work', powerRange: { lower: 100, upper: 120 } }] } }), IntervalsSerializeError, 'no duration');
});

/**
 * ⛔ A LABEL WITH DIGITS PRINTS ON ITS OWN LINE ABOVE THE STEP (2026-09-18, book-language pass 4). The FTP test's page
 * words ("3 minutes at high intensity. Push yourself at a 9/10 effort") refused the whole ride before.
 */
Deno.test('a step labelled with the page\'s numbers goes out with the words above it, not refused', () => {
  const ev = serializeRide({ id: 'h2', date: '2026-09-15', type: 'ride', name: 'FTP', computed: { anchors, steps: [
    { kind: 'work', label: 'high intensity. Push yourself at a 9/10 effort', seconds: 180 },
  ] } });
  assertEquals(ev.description, 'high intensity. Push yourself at a 9/10 effort\n- 3m freeride');
});

/**
 * ⛔ p239's easy step (0 up to 75% of FTP) goes to Intervals.icu / Zwift with no target (Michael, 2026-09-18), under the
 * same words the screen prints (2026-09-18, round 3: `oneSidedPowerText`).
 */
Deno.test('a ceiling-only easy step goes out as freeride, with the screen\'s words above it', () => {
  const ev = serializeRide({
    id: 'j', date: '2026-09-15', type: 'ride', name: 'Easy', description: 'Easy ride below 75%.',
    computed: { anchors, steps: [{ kind: 'work', seconds: 3600, powerRange: { lower: 0, upper: 158 } }] },
  });
  assertEquals(ev.description, 'Easy ride below 75%.\n\nunder 158 W\n- 1h freeride');
});

/**
 * ⛔ A floor saved with no top at all (a step written before round 5) goes as its words and ERG off (2026-09-18, round 3,
 * audit item 16). Since round 5 the plan saves p237's shown top and the step goes as floor to 130% — pinned in
 * `plan-tokens/single-target-band.test.ts`.
 */
Deno.test('a floor saved with no shown top goes out as freeride under "N W and up"', () => {
  const ev = serializeRide({
    id: 'f', date: '2026-09-15', type: 'ride', name: 'Anaerobic',
    computed: { anchors, steps: [{ kind: 'work', seconds: 45, powerRange: { lower: 253 } }] },
  });
  assert(ev.description.includes('253 W and up\n- 45s freeride'), ev.description);
  assert(!/\d+-\d+%/.test(ev.description), ev.description);
});

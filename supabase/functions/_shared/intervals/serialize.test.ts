import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
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
    id: 'a', date: '2026-09-10', type: 'ride', name: 'Ride', description: 'Easy ride, under 75 percent of FTP the whole way.',
    computed: { anchors, steps: [{ kind: 'work', seconds: 3600, powerRange: { lower: 137, upper: 158 } }] },
  });
  assertEquals(ev.description, 'Easy ride, under 75 percent of FTP the whole way.\n\n- 1h 65-75%');
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
  assertThrows(() => serializeRide({ id: 'h', date: '2026-09-15', type: 'ride', computed: { anchors, steps: [{ kind: 'work', label: 'Hard — 3 min', seconds: 180 }] } }), IntervalsSerializeError, 'contains digits');
  assertThrows(() => serializeRide({ id: 'i', date: '2026-09-15', type: 'ride', computed: { anchors, steps: [{ kind: 'work', powerRange: { lower: 100, upper: 120 } }] } }), IntervalsSerializeError, 'no duration');
});

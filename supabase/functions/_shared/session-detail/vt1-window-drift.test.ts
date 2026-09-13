/**
 * Drift over the VT1 portions of a long session that carries sets (p107 / p235).
 *   ~/.deno/bin/deno test --no-check supabase/functions/_shared/session-detail/vt1-window-drift.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { vt1WindowDrift } from './vt1-window-drift.ts';
import { VT1_MIN_BOUT_S } from './vt1-bout.ts';

const vt1 = (duration_s: number, avg_hr: number, pace: number) =>
  ({ interval_type: 'work', executed: { duration_s, avg_hr, actual_pace_sec_per_mi: pace, actual_gap_sec_per_mi: null, power_watts: null } });
const set = (duration_s: number, avg_hr: number, pace: number) =>
  ({ interval_type: 'work', executed: { duration_s, avg_hr, actual_pace_sec_per_mi: pace, actual_gap_sec_per_mi: null, power_watts: null } });
const rec = (duration_s: number) =>
  ({ interval_type: 'recovery', executed: { duration_s, avg_hr: 150, actual_pace_sec_per_mi: 700, actual_gap_sec_per_mi: null, power_watts: null } });
const ride = (duration_s: number, avg_hr: number, power_watts: number, interval_type = 'work') =>
  ({ interval_type, executed: { duration_s, avg_hr, power_watts, actual_pace_sec_per_mi: null, actual_gap_sec_per_mi: null } });

Deno.test('a plain long run has no sets, so it keeps its whole-session read', () => {
  assertEquals(vt1WindowDrift({ intervals: [vt1(3600, 140, 600)], sport: 'run' }), { kind: 'not_applicable' });
  assertEquals(
    vt1WindowDrift({ intervals: [vt1(1800, 140, 600), vt1(1800, 145, 605)], sport: 'run' }),
    { kind: 'not_applicable' },
  );
});

Deno.test('a plain long ride keeps its whole-session read too', () => {
  assertEquals(vt1WindowDrift({ intervals: [ride(3600, 135, 160)], sport: 'ride' }), { kind: 'not_applicable' });
});

Deno.test('an LSD with sets reads over the VT1 portions only', () => {
  // 30 min VT1, a 90s set at 115% and its recovery, then 30 min VT1 at the same pace but 5% more HR.
  const r = vt1WindowDrift({
    intervals: [vt1(1800, 140, 600), set(90, 178, 380), rec(30), vt1(1800, 147, 600)],
    sport: 'run',
  });
  assertEquals(r.kind, 'read');
  if (r.kind === 'read') {
    assertEquals(r.seconds, 3600);          // the set and its recovery are out
    assertEquals(r.basis, 'raw');
    // speed held, heart rate rose 140 → 147: efficiency fell by 1 − 140/147 = 4.8%
    assertEquals(r.pct, 4.8);
  }
});

Deno.test('the sets cannot drag the number — the same session without them reads the same', () => {
  const withSets = vt1WindowDrift({
    intervals: [vt1(1800, 140, 600), set(90, 178, 380), rec(30), set(90, 180, 375), rec(30), vt1(1800, 147, 600)],
    sport: 'run',
  });
  const without = vt1WindowDrift({
    intervals: [vt1(1800, 140, 600), rec(30), vt1(1800, 147, 600)],
    sport: 'run',
  });
  assertEquals(withSets.kind === 'read' && withSets.pct, 4.8);
  assertEquals(without.kind === 'read' && without.pct, 4.8);
});

Deno.test('a long ride with sets reads on power, Friel\'s sign', () => {
  const r = vt1WindowDrift({
    intervals: [ride(1800, 130, 160), ride(240, 168, 300), ride(60, 140, 90, 'recovery'), ride(1800, 130, 152)],
    sport: 'ride',
  });
  assertEquals(r.kind, 'read');
  if (r.kind === 'read') {
    assertEquals(r.basis, 'power');
    assertEquals(r.seconds, 3600);
    assertEquals(r.pct, 5);  // 160 → 152 W at the same heart rate
  }
});

Deno.test('under p107\'s bout floor the session says so instead of printing a number', () => {
  // A 9-minute easy portion is BELOW the bout floor, so it is not a VT1 bout — nothing qualifies and
  // no VT1 time is left. ⚠️ With a row-wise read these are one question, not two: a row is a bout or
  // it is not, so `seconds` here is always 0. The floor is the same p107 number on both sides.
  const r = vt1WindowDrift({
    intervals: [vt1(540, 140, 600), set(90, 178, 380), rec(30), set(90, 180, 375)],
    sport: 'run',
  });
  assertEquals(r, { kind: 'too_short', seconds: 0 });
  assertEquals(VT1_MIN_BOUT_S, 600);
});

Deno.test('the warm-up is out, the way every other drift read drops it', () => {
  const r = vt1WindowDrift({
    intervals: [
      { interval_type: 'warmup', executed: { duration_s: 900, avg_hr: 110, actual_pace_sec_per_mi: 700, actual_gap_sec_per_mi: null, power_watts: null } },
      vt1(1800, 140, 600), set(90, 178, 380), rec(30), vt1(1800, 147, 600),
    ],
    sport: 'run',
  });
  assertEquals(r.kind === 'read' && r.seconds, 3600);   // the 15-minute warm-up is not in it
  assertEquals(r.kind === 'read' && r.pct, 4.8);        // and has not flattened the number
});

Deno.test('one VT1 row cannot be halved, so the session falls back rather than inventing a half', () => {
  assertEquals(
    vt1WindowDrift({ intervals: [vt1(3600, 140, 600), set(90, 178, 380), rec(30)], sport: 'run' }),
    { kind: 'not_applicable' },
  );
});

Deno.test('graded pace is preferred, and never mixed with raw across the halves', () => {
  const g = (duration_s: number, avg_hr: number, gap: number) =>
    ({ interval_type: 'work', executed: { duration_s, avg_hr, actual_pace_sec_per_mi: gap + 20, actual_gap_sec_per_mi: gap, power_watts: null } });
  const all = vt1WindowDrift({ intervals: [g(1800, 140, 600), rec(30), g(1800, 147, 600)], sport: 'run' });
  assertEquals(all.kind === 'read' && all.basis, 'gap');
  // one row without graded pace drops the whole read to raw
  const mixed = vt1WindowDrift({ intervals: [g(1800, 140, 600), rec(30), vt1(1800, 147, 620)], sport: 'run' });
  assertEquals(mixed.kind === 'read' && mixed.basis, 'raw');
});

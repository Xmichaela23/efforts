/**
 * Drift over the VT1 portions of a long session that carries sets (p107 / p235).
 *   ~/.deno/bin/deno test --no-check supabase/functions/_shared/session-detail/vt1-window-drift.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { vt1WindowDrift } from './vt1-window-drift.ts';
import { VT1_MIN_BOUT_S } from './vt1-bout.ts';

// A VT1 row: the plan asked for one easy pace (the library resolves `vt1` to a single value).
const vt1 = (duration_s: number, avg_hr: number, pace: number, target = 600) =>
  ({ interval_type: 'work', planned_pace_range: { lower_sec_per_mi: target, upper_sec_per_mi: target },
     executed: { duration_s, avg_hr, actual_pace_sec_per_mi: pace, actual_gap_sec_per_mi: null, power_watts: null } });
// A set: a genuine band, and faster than the easy target above.
const set = (duration_s: number, avg_hr: number, pace: number) =>
  ({ interval_type: 'work', planned_pace_range: { lower_sec_per_mi: 360, upper_sec_per_mi: 420 },
     executed: { duration_s, avg_hr, actual_pace_sec_per_mi: pace, actual_gap_sec_per_mi: null, power_watts: null } });
const rec = (duration_s: number) =>
  ({ interval_type: 'recovery', executed: { duration_s, avg_hr: 150, actual_pace_sec_per_mi: 700, actual_gap_sec_per_mi: null, power_watts: null } });
// A ride row: `below_pct` resolves to a band starting at zero, a set to a real band.
const ride = (duration_s: number, avg_hr: number, power_watts: number, interval_type = 'work', upper_w = 150) =>
  ({ interval_type, planned_power_range: { lower_w: 0, upper_w },
     executed: { duration_s, avg_hr, power_watts, actual_pace_sec_per_mi: null, actual_gap_sec_per_mi: null } });
const rideSet = (duration_s: number, avg_hr: number, power_watts: number) =>
  ({ interval_type: 'work', planned_power_range: { lower_w: 250, upper_w: 290 },
     executed: { duration_s, avg_hr, power_watts, actual_pace_sec_per_mi: null, actual_gap_sec_per_mi: null } });

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

Deno.test('the sets cannot drag the number — more of them changes nothing', () => {
  const one = vt1WindowDrift({
    intervals: [vt1(1800, 140, 600), set(90, 178, 380), rec(30), vt1(1800, 147, 600)],
    sport: 'run',
  });
  const four = vt1WindowDrift({
    intervals: [
      vt1(1800, 140, 600),
      set(90, 178, 380), rec(30), set(90, 180, 375), rec(30),
      set(90, 182, 372), rec(30), set(90, 184, 370), rec(30),
      vt1(1800, 147, 600),
    ],
    sport: 'run',
  });
  assertEquals(one.kind === 'read' && one.pct, 4.8);
  assertEquals(four.kind === 'read' && four.pct, 4.8);
  assertEquals(four.kind === 'read' && four.seconds, 3600);
});

Deno.test('a long ride with sets reads on power, Friel\'s sign', () => {
  const r = vt1WindowDrift({
    intervals: [ride(1800, 130, 160), rideSet(240, 168, 300), ride(60, 140, 90, 'recovery'), ride(1800, 130, 152)],
    sport: 'ride',
  });
  assertEquals(r.kind, 'read');
  if (r.kind === 'read') {
    assertEquals(r.basis, 'power');
    assertEquals(r.seconds, 3600);
    assertEquals(r.pct, 5);  // 160 → 152 W at the same heart rate
  }
});

Deno.test('under p107\'s floor the session says so instead of printing a number', () => {
  // Two easy segments of four minutes each: they ARE VT1 (the plan asked for the easy pace) and they
  // stay in, but eight minutes is under the floor, so there is not enough easy running to read over.
  const r = vt1WindowDrift({
    intervals: [vt1(240, 140, 600), set(90, 178, 380), rec(30), vt1(240, 145, 600)],
    sport: 'run',
  });
  assertEquals(r, { kind: 'too_short', seconds: 480 });
  assertEquals(VT1_MIN_BOUT_S, 600);
});

Deno.test('⛔ AN EASY 8-MINUTE SEGMENT STAYS IN THE READING — it is not a set', () => {
  // The overruled rule called any row under ten minutes a set. This one is at the session's own easy
  // target, so it is VT1 work however short it is, and it counts toward the reading.
  const r = vt1WindowDrift({
    intervals: [vt1(1800, 140, 600), set(90, 178, 380), rec(30), vt1(480, 146, 600), vt1(1320, 147, 600)],
    sport: 'run',
  });
  assertEquals(r.kind, 'read');
  assertEquals(r.kind === 'read' && r.seconds, 3600);   // 1800 + 480 + 1320, the set and rec out
});

Deno.test('a row with no target cannot be called a set', () => {
  const untargeted = { interval_type: 'work', executed: { duration_s: 600, avg_hr: 142, actual_pace_sec_per_mi: 610, actual_gap_sec_per_mi: null, power_watts: null } };
  const r = vt1WindowDrift({ intervals: [vt1(1800, 140, 600), set(90, 178, 380), rec(30), untargeted, vt1(1200, 147, 600)], sport: 'run' });
  assertEquals(r.kind === 'read' && r.seconds, 3600);   // the untargeted row is in the reading
});

Deno.test('no targets anywhere means no window — the whole-session read stands', () => {
  const bare = (duration_s: number, avg_hr: number) =>
    ({ interval_type: 'work', executed: { duration_s, avg_hr, actual_pace_sec_per_mi: 600, actual_gap_sec_per_mi: null, power_watts: null } });
  assertEquals(vt1WindowDrift({ intervals: [bare(1800, 140), rec(30), bare(1800, 147)], sport: 'run' }), { kind: 'not_applicable' });
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
    ({ interval_type: 'work', planned_pace_range: { lower_sec_per_mi: 600, upper_sec_per_mi: 600 },
       executed: { duration_s, avg_hr, actual_pace_sec_per_mi: gap + 20, actual_gap_sec_per_mi: gap, power_watts: null } });
  const all = vt1WindowDrift({ intervals: [g(1800, 140, 600), set(90, 178, 380), rec(30), g(1800, 147, 600)], sport: 'run' });
  assertEquals(all.kind === 'read' && all.basis, 'gap');
  // one row without graded pace drops the whole read to raw
  const mixed = vt1WindowDrift({ intervals: [g(1800, 140, 600), set(90, 178, 380), rec(30), vt1(1800, 147, 620)], sport: 'run' });
  assertEquals(mixed.kind === 'read' && mixed.basis, 'raw');
});

/**
 * ⛔⛔ THE WINDOW INHERITS p107's GATE (2026-09-15, Michael's ruling). All three callers ran the window
 * BEFORE the steadiness ladder, so an interval family's session got a drift number without the ladder
 * ever being asked. The relative "easiest work step is the VT1 level" test then crowned the least-hard
 * step — on p237's sandwich, the 90%-of-FTP middles — as this rider's easy riding.
 */
Deno.test('a band-above family gets no window, however the rows look', () => {
  const rows = [
    vt1(1800, 140, 600), set(90, 178, 380), rec(30), vt1(1800, 147, 600),
  ];
  // With no materials the window still reads — the ladder is only consulted when it is handed something.
  assertEquals(vt1WindowDrift({ intervals: rows, sport: 'run' }).kind, 'read');
  // The plan's own family tag says this is above threshold: no drift, whatever the rows show.
  assertEquals(
    vt1WindowDrift({
      intervals: rows, sport: 'run',
      steadiness: { plannedRow: { tags: ['family:run_mlss'] } },
    }),
    { kind: 'not_applicable' },
  );
  assertEquals(
    vt1WindowDrift({
      intervals: rows, sport: 'run',
      steadiness: { plannedRow: { tags: ['family:run_near_threshold'] } },
    }),
    { kind: 'not_applicable' },
  );
});

Deno.test('an anaerobic ride gets no window — its 90% middles are not easy riding', () => {
  /**
   * p237's sandwich, level 1 at FTP 168, AS THE ROWS STOOD BEFORE this session's floor-only change:
   * 5 rounds of 30s at 202-202 W / 2:30 at 151-151 W. That is the shape the 3.4% was read off — the
   * five 2:30 middles were the session's easiest work step, so the window called them VT1 riding,
   * 750 seconds cleared p107's floor, and their first half was compared against their second.
   * ⚠️ THE FIXTURE KEEPS THE OLD SHAPE ON PURPOSE. The floor-only change happens to hide the surges
   * from `demand` (a row with no upper carries no demand), which closes this by accident. The GATE is
   * the fix; this pins that it holds on the rows that actually produced the number.
   */
  const surge = (hr: number, w: number) =>
    ({ interval_type: 'work', planned_power_range: { lower_w: 202, upper_w: 202 },
       executed: { duration_s: 30, avg_hr: hr, power_watts: w, actual_pace_sec_per_mi: null, actual_gap_sec_per_mi: null } });
  const sustained = (hr: number, w: number) =>
    ({ interval_type: 'work', planned_power_range: { lower_w: 151, upper_w: 151 },
       executed: { duration_s: 150, avg_hr: hr, power_watts: w, actual_pace_sec_per_mi: null, actual_gap_sec_per_mi: null } });
  const rows: unknown[] = [];
  for (let i = 0; i < 5; i += 1) {
    rows.push(surge(165 + i, 230), sustained(150 + i, 152), surge(168 + i, 228), rec(240));
  }
  // Ungated, the window reads — this is the number that printed and counted in the streak.
  assertEquals(vt1WindowDrift({ intervals: rows as never, sport: 'ride' }).kind, 'read');
  // Gated by the plan's family, it says nothing.
  assertEquals(
    vt1WindowDrift({
      intervals: rows as never, sport: 'ride',
      steadiness: { plannedRow: { tags: ['family:ride_anaerobic'] } },
    }),
    { kind: 'not_applicable' },
  );
  assertEquals(
    vt1WindowDrift({
      intervals: rows as never, sport: 'ride',
      steadiness: { plannedRow: { tags: ['family:ride_vo2'] } },
    }),
    { kind: 'not_applicable' },
  );
});

Deno.test('a vt1-or-easier family still gets its window', () => {
  const r = vt1WindowDrift({
    intervals: [vt1(1800, 140, 600), set(90, 178, 380), rec(30), vt1(1800, 147, 600)],
    sport: 'run',
    steadiness: { plannedRow: { tags: ['family:run_lsd'] } },
  });
  assertEquals(r.kind, 'read');
});

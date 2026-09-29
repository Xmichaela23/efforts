/**
 * ⛔ EVERY RIDE ON THE RIDES SCREEN SHOWS A TIME (Michael, 2026-09-28: "this section should show all the times"). A ride
 * with no length pick states its shortest to longest across the block's standard weeks, both parts of a joined ride
 * together, in the Run + Strength screen's range format (approved 2026-09-28: "37 min–1h08").
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { enduranceIntakeReadout } from './intake-readout.ts';

for (const frame of ['cycling_base', 'cycling_long'] as const) {
  Deno.test(`${frame}: a ride with chips shows none; every other ride states a time`, () => {
    const r = enduranceIntakeReadout({ frame, answers: {}, baselines: { performance_numbers: { ftp: 200 } } } as never);
    const rows = r.ride_strength_week!.rows;
    assert(rows.length >= 5);
    for (const row of rows) {
      if (row.length) assertEquals(row.time_line, null, row.line);
      else assert(typeof row.time_line === 'string' && /\d/.test(row.time_line!), `${row.line}: ${row.time_line}`);
    }
  });
}

Deno.test('cycling_base Day 3 (VO2, then sweet spot) states both parts together, longer than either part alone', () => {
  const r = enduranceIntakeReadout({ frame: 'cycling_base', answers: {}, baselines: { performance_numbers: { ftp: 200 } } } as never);
  const day3 = r.ride_strength_week!.rows.find((x) => x.line.startsWith('Day 3'))!;
  const day1 = r.ride_strength_week!.rows.find((x) => x.line.startsWith('Day 1'))!;
  assert(/^\dh\d\d–\dh\d\d$/.test(day3.time_line!), day3.time_line!);
  assert(day1.time_line !== day3.time_line);
});

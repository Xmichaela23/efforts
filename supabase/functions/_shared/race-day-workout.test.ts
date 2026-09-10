/**
 * The race-day pick — pinned to the two picks it replaced (2026-09-10, audit H-B10).
 *
 * ⛔ BEHAVIOUR-UNCHANGED PROOF. `oldCompleteRacePick` is complete-race's inline pick and `oldStatePick` is
 * State's, both copied from ab40b9d2 before they were deleted. For a run goal the shared pick must return the
 * same workout as both; for a ride or swim goal, the same as complete-race's.
 *
 * Run: deno test --no-check supabase/functions/_shared/race-day-workout.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { pickRaceDayWorkout } from './race-day-workout.ts';

type Row = { id: string; type?: string | null; computed?: { overall?: { distance_m?: number } } | null };

function oldCompleteRacePick(rows: Row[], goalSport: unknown): Row | null {
  const s = String(goalSport || '').toLowerCase();
  const matches = s === 'ride' || s.startsWith('bike') || s.includes('cycl')
    ? (t: string) => ['ride', 'bike', 'cycling'].includes((t || '').toLowerCase())
    : s.startsWith('swim')
      ? (t: string) => ['swim', 'swimming'].includes((t || '').toLowerCase())
      : (t: string) => { const x = (t || '').toLowerCase(); return x === 'run' || x === 'running' || !x; };
  let pick: Row | null = null;
  const same = rows.filter((r) => matches(String((r as { type?: string }).type || '')));
  if (same.length === 1) pick = same[0];
  else if (same.length > 1) {
    const dist = (r: any) => { const m = Number(r?.computed?.overall?.distance_m); return Number.isFinite(m) && m > 0 ? m : 0; };
    pick = same.reduce((a, b) => (dist(a) >= dist(b) ? a : b));
  }
  return pick;
}

function oldStatePick(rows: Row[]): Row | null {
  const runish = (t: string) => { const x = (t || '').toLowerCase(); return x === 'run' || x === 'running' || !x; };
  const runs = rows.filter((r) => runish(String((r as { type?: string }).type || '')));
  let pick: Row | null = null;
  if (runs.length === 1) pick = runs[0] ?? null;
  else if (runs.length > 1) {
    const dist = (r: Row) => { const m = Number(r?.computed?.overall?.distance_m); return Number.isFinite(m) && m > 0 ? m : 0; };
    pick = runs.reduce((a, b) => (dist(a) >= dist(b) ? a : b));
  }
  return pick;
}

const km = (n: number) => ({ overall: { distance_m: n * 1000 } });
const DAYS: Row[][] = [
  [],
  [{ id: 'ride', type: 'ride', computed: km(40) }],
  [{ id: 'race', type: 'run', computed: km(42.2) }],
  [{ id: 'warm', type: 'run', computed: km(2) }, { id: 'race', type: 'run', computed: km(42.3) }, { id: 'ride', type: 'ride', computed: km(20) }],
  [{ id: 'a', type: 'Running', computed: km(10) }, { id: 'b', type: 'run', computed: km(10) }],
  [{ id: 'notype', type: null, computed: null }, { id: 'nodist', type: 'run' }],
  [{ id: 'swim', type: 'swim', computed: km(1.9) }, { id: 'bike', type: 'bike', computed: km(90) }, { id: 'run', type: 'run', computed: km(21.1) }],
];

Deno.test('a run goal gets the workout complete-race and State both picked', () => {
  for (const [i, rows] of DAYS.entries()) {
    for (const sport of ['run', 'running', null, '']) {
      const got = pickRaceDayWorkout(rows, sport)?.id ?? null;
      assertEquals(got, oldCompleteRacePick(rows, sport)?.id ?? null, `day ${i} sport ${sport}: complete-race`);
      assertEquals(got, oldStatePick(rows)?.id ?? null, `day ${i} sport ${sport}: State`);
    }
  }
});

Deno.test('ride and swim goals get the workout complete-race picked', () => {
  for (const [i, rows] of DAYS.entries()) {
    for (const sport of ['ride', 'bike', 'cycling', 'swim']) {
      assertEquals(pickRaceDayWorkout(rows, sport)?.id ?? null, oldCompleteRacePick(rows, sport)?.id ?? null, `day ${i} sport ${sport}`);
    }
  }
});

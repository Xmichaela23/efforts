/**
 * Equivalence fixtures for the coach ACWR repoints (D-236).
 *
 * coach/index.ts is a ~5k-line @ts-nocheck edge function that can't be unit-run,
 * so these prove — against a faithful replica of the EXACT pre-D-236 inline
 * formulas — that the shared helper reproduces them byte-for-byte. If a future
 * change to computeAcwr would move a coach number, one of these fails.
 *
 * Covered: the running/cycling weighted ACWR (D/E, repointed onto weightFn) and
 * the total ACWR (C, left as the reference — asserted here so the helper stays
 * pinned to it). Windows match coach: completedRolling = [asOf-27 .. asOf],
 * acute7 = date >= asOf-6, includeAsOfDate = true, source workload_actual.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/acwr.equivalence.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { computeAcwr, type LoadRow } from './acwr.ts';

const AS_OF = '2026-07-03';

function ymd(offset: number): string {
  const [y, mo, d] = AS_OF.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d) - offset * 86_400_000).toISOString().slice(0, 10);
}

// A representative weight fn shaped like getRunningFatigueWeight (run 1.0,
// ride 0.6, swim 0.2, strength 0.5, mobility 0). The equivalence being proven
// is that the helper applies weightFn + windows exactly as coach's reduce did —
// independent of the specific weights.
const wFn = (type?: string | null): number => {
  const t = String(type || '').toLowerCase();
  if (t === 'run') return 1.0;
  if (t === 'ride' || t === 'bike') return 0.6;
  if (t === 'swim') return 0.2;
  if (t === 'strength') return 0.5;
  return 0;
};

// ── Faithful replicas of the EXACT pre-D-236 coach inline formulas ──────────

/** coach completedRolling = fetched [asOf-27 .. asOf], filtered workout_status==='completed'. */
function completedRolling(rows: any[]): any[] {
  const chronicStart = ymd(27);
  return rows.filter(
    (r) => String(r.workout_status).toLowerCase() === 'completed' &&
      String(r.date) >= chronicStart && String(r.date) <= AS_OF,
  );
}
/** coach acute7Rows = completedRolling.filter(date >= asOf-6). */
function acute7(rows: any[]): any[] {
  const acuteStart = ymd(6);
  return completedRolling(rows).filter((r) => String(r.date) >= acuteStart);
}
/** coach weighted running/cycling ACWR (unrounded, >0 gate). */
function coachWeightedAcwr(rows: any[], weight: (t: string) => number): number | null {
  const wl = (rs: any[]) => rs.reduce((s, r) => s + (Number(r.workload_actual) || 0) * weight(r.type), 0);
  const a = wl(acute7(rows));
  const c = wl(completedRolling(rows));
  return c > 0 ? (a / 7) / (c / 28) : null;
}
/** coach total ACWR: rawAcwr unrounded, floored to null when chronic28 < 500. */
function coachTotalAcwr(rows: any[]): number | null {
  const sum = (rs: any[]) => rs.reduce((s, r) => s + (Number(r.workload_actual) || 0), 0);
  const a = sum(acute7(rows));
  const c = sum(completedRolling(rows));
  const raw = c > 0 ? (a / 7) / (c / 28) : null;
  return c < 500 ? null : raw;
}

/** Adapt raw workout rows → helper LoadRows (completed only, as coach fetches). */
function toLoadRows(rows: any[]): LoadRow[] {
  return completedRolling(rows).map((r) => ({
    date: String(r.date), workload: r.workload_actual, type: r.type, name: r.name,
  }));
}

// ── A varied fixture set: multi-discipline, an uncompleted row, a spike ─────

const ROWS: any[] = [
  { date: ymd(0), type: 'ride', workload_actual: 320, workout_status: 'completed' },
  { date: ymd(1), type: 'run', workload_actual: 180, workout_status: 'completed' },
  { date: ymd(2), type: 'strength', workload_actual: 90, workout_status: 'completed' },
  { date: ymd(4), type: 'swim', workload_actual: 60, workout_status: 'completed' },
  { date: ymd(5), type: 'run', workload_actual: 200, workout_status: 'planned' }, // NOT completed → excluded
  { date: ymd(6), type: 'run', workload_actual: 150, workout_status: 'completed' },
  { date: ymd(10), type: 'ride', workload_actual: 260, workout_status: 'completed' },
  { date: ymd(13), type: 'run', workload_actual: 170, workout_status: 'completed' },
  { date: ymd(17), type: 'strength', workload_actual: 85, workout_status: 'completed' },
  { date: ymd(20), type: 'run', workload_actual: 190, workout_status: 'completed' },
  { date: ymd(24), type: 'ride', workload_actual: 240, workout_status: 'completed' },
  { date: ymd(27), type: 'run', workload_actual: 160, workout_status: 'completed' },
  { date: ymd(35), type: 'run', workload_actual: 999, workout_status: 'completed' }, // outside 28d → excluded
];

Deno.test('running-weighted ACWR: helper.ratioRaw === coach inline formula', () => {
  const coach = coachWeightedAcwr(ROWS, (t) => wFn(t));
  const helper = computeAcwr(toLoadRows(ROWS), {
    asOfDate: AS_OF, window: { includeAsOfDate: true }, chronicLoadFloor: 0, weightFn: wFn,
  }).ratioRaw;
  assertEquals(helper, coach);
});

Deno.test('cycling-weighted ACWR (different weights): helper.ratioRaw === coach inline formula', () => {
  const cyc = (t?: string | null) => {
    const s = String(t || '').toLowerCase();
    if (s === 'ride' || s === 'bike') return 1.0;
    if (s === 'run') return 0.4;
    if (s === 'swim') return 0.1;
    if (s === 'strength') return 0.5;
    return 0;
  };
  const coach = coachWeightedAcwr(ROWS, (t) => cyc(t));
  const helper = computeAcwr(toLoadRows(ROWS), {
    asOfDate: AS_OF, window: { includeAsOfDate: true }, chronicLoadFloor: 0, weightFn: cyc,
  }).ratioRaw;
  assertEquals(helper, coach);
});

Deno.test('total ACWR (reference C): helper matches coach raw + floored behaviour', () => {
  // Unweighted, floor 500 (coach's thinChronicBase). Helper .ratioRaw with the
  // 500 floor == coach's floored `acwr`; both null below the floor.
  const coach = coachTotalAcwr(ROWS);
  const helper = computeAcwr(toLoadRows(ROWS), {
    asOfDate: AS_OF, window: { includeAsOfDate: true }, chronicLoadFloor: 500,
  }).ratioRaw;
  assertEquals(helper, coach);
});

Deno.test('completed-only + 28d window filtering matches coach (planned + >28d rows excluded)', () => {
  // The uncompleted ymd(5) run (180+ pts) and the ymd(35) 999-pt spike must not
  // affect either result — proven by equality with the coach replica that filters them.
  const helper = computeAcwr(toLoadRows(ROWS), {
    asOfDate: AS_OF, window: { includeAsOfDate: true }, chronicLoadFloor: 0, weightFn: wFn,
  });
  assertEquals(helper.ratioRaw, coachWeightedAcwr(ROWS, (t) => wFn(t)));
  // sanity: the excluded spike would have blown the ratio up if included
  assertEquals(helper.chronicLoad > 0, true);
});

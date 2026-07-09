/**
 * Fixtures for D-263 per-domain load slicing (build-step 2).
 * Run: deno test supabase/functions/_shared/per-domain-load.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { classifySession, computePerDomainLoad, type SliceSession } from './per-domain-load.ts';

const LTHR = 150, FTP = 176;
const cleanSeries = (n: number, hr = 130) => Array.from({ length: n }, () => ({ heartRate: hr }));
const gappySeries = (n: number) => Array.from({ length: n }, (_, i) => ({ heartRate: i % 2 === 0 ? 0 : 130 })); // 50% dropout

// ── classifySession: discipline-primary signal + HR gate ANY time HR is used ──
Deno.test('ride with power → power bin, easy at 0.62 IF', () => {
  const c = classifySession({ date: 'x', type: 'ride', workload: 70, avgPower: 110, ftp: FTP, avgHr: 130, thresholdHr: LTHR, samples: cleanSeries(100) });
  assertEquals(c.bin_signal, 'power');
  assertEquals(c.slice, 'easy_cardio'); // 110/176 = 0.62 → easy
});
Deno.test('ride NO power, clean HR → HR-fallback bin (fix 1)', () => {
  const c = classifySession({ date: 'x', type: 'ride', workload: 70, avgHr: 170, thresholdHr: LTHR, samples: cleanSeries(100, 170) });
  assertEquals(c.bin_signal, 'hr');          // fell back to HR because no power
  assertEquals(c.hr_quality, 'ok');
  assertEquals(c.slice, 'hard_cardio');      // 170/150 high → hard
});
Deno.test('ride NO power, LOW-quality HR → sRPE fallback → easy (fix 1 gate bites)', () => {
  const c = classifySession({ date: 'x', type: 'ride', workload: 70, avgHr: 170, thresholdHr: LTHR, samples: gappySeries(100) });
  assertEquals(c.hr_quality, 'low');
  assertEquals(c.bin_signal, 'srpe');        // HR dropped → sRPE
  assertEquals(c.slice, 'easy_cardio');      // never hard on a guess
});
Deno.test('run with clean HR → HR bin; low-quality HR → sRPE→easy', () => {
  assertEquals(classifySession({ date: 'x', type: 'run', workload: 60, avgHr: 145, thresholdHr: LTHR, samples: cleanSeries(200, 145) }).bin_signal, 'hr');
  assertEquals(classifySession({ date: 'x', type: 'run', workload: 60, avgHr: 145, thresholdHr: LTHR, samples: gappySeries(200) }).slice, 'easy_cardio');
});
Deno.test('swim → easy_cardio, pace_unanchored (never hard on a guess)', () => {
  const c = classifySession({ date: 'x', type: 'swim', workload: 15, avgPace: 130 });
  assertEquals(c.slice, 'easy_cardio');
  assertEquals(c.bin_signal, 'pace_unanchored');
});
Deno.test('strength → strength slice, srpe', () => {
  const c = classifySession({ date: 'x', type: 'strength', workload: 30 });
  assertEquals(c.slice, 'strength');
  assertEquals(c.bin_signal, 'srpe');
});

// ── The July 6–8 receipts case (must reproduce or the design is wrong) ──
// asOf 2026-07-08. Acute week = easy cross-training spike + strength, NO run.
// Prior 3 weeks lighter → easy_cardio is a genuine spike; strength present.
function ymd(offset: number): string { // offset days before 2026-07-08
  return new Date(Date.UTC(2026, 6, 8) - offset * 86_400_000).toISOString().slice(0, 10);
}
function ride(date: string, load: number, power: number): SliceSession {
  return { date, type: 'ride', workload: load, avgPower: power, ftp: FTP };
}
function swim(date: string, load: number): SliceSession { return { date, type: 'swim', workload: load, avgPace: 130 }; }
function strength(date: string, load: number): SliceSession { return { date, type: 'strength', workload: load }; }

const JULY_WEEK: SliceSession[] = [
  // Acute (Jul 2–8) — his real swaps, no run
  ride(ymd(6), 76, 105), strength(ymd(6), 25),   // Jul 2
  swim(ymd(5), 14),                              // Jul 3
  ride(ymd(2), 77, 108), strength(ymd(2), 25),   // Jul 6
  strength(ymd(1), 18), swim(ymd(1), 6), swim(ymd(1), 15), // Jul 7
  // Chronic (prior 3 weeks, lighter easy cardio + strength)
  ride(ymd(8), 70, 100), ride(ymd(10), 48, 100), swim(ymd(12), 15), strength(ymd(9), 30), strength(ymd(11), 30),
  ride(ymd(15), 70, 100), ride(ymd(17), 48, 100), swim(ymd(19), 15), strength(ymd(16), 30), strength(ymd(18), 30),
  ride(ymd(22), 70, 100), ride(ymd(24), 48, 100), swim(ymd(26), 15), strength(ymd(23), 30), strength(ymd(25), 30),
];

Deno.test('RECEIPTS July 6–8: easy_cardio spike, hard_cardio empty, strength on plan', () => {
  const pd = computePerDomainLoad(JULY_WEEK, { asOfDate: '2026-07-08' });

  // easy_cardio: the load is here, and it's a spike (acute > chronic average).
  assertEquals(pd.easy_cardio.status, 'ok');
  if (pd.easy_cardio.acwr == null || pd.easy_cardio.acwr <= 1.0) {
    throw new Error(`easy_cardio should be a spike (>1.0), got ${pd.easy_cardio.acwr}`);
  }

  // hard_cardio: no hard sessions → nothing to say (insufficient_base, not silently absent).
  assertEquals(pd.hard_cardio.acute_load, 0);
  assertEquals(pd.hard_cardio.status, 'insufficient_base');
  assertEquals(pd.hard_cardio.acwr, null);

  // strength (fix 2 — explicit): being executed this week (acute load > 0 = "on plan").
  if (!(pd.strength.acute_load > 0)) throw new Error(`strength should be on plan (acute>0), got ${pd.strength.acute_load}`);
  assertEquals(pd.strength.bin_signal, 'srpe');

  // All three slices always present (no silent nulls).
  assertEquals([pd.strength.key, pd.hard_cardio.key, pd.easy_cardio.key], ['strength', 'hard_cardio', 'easy_cardio']);
});

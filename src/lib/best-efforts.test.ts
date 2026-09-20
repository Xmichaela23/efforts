/**
 * Run: ~/.deno/bin/deno test src/lib/best-efforts.test.ts --no-check
 *
 * Windows with a KNOWN answer. The one that matters most is the straddle fixture: the old finder
 * (`compute-workout-analysis calculateBestRunEfforts`) accepted any stretch between 98% and 102% of
 * the distance and stored that stretch's clock time, so a "5K" could be the time for 5,100 m. Every
 * test here pins the time to the distance.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  bestDistanceEfforts,
  fastestWindowForDistance,
  RUN_RECORD_DISTANCES,
  RIDE_RECORD_DISTANCES,
  RUN_MAX_SPEED_MPS,
  RIDE_MAX_SPEED_MPS,
} from './best-efforts.ts';

/** A trace at a constant pace: `n` samples, one per second, `mps` metres each. */
function steady(n: number, mps: number) {
  const cumDistM: number[] = [];
  const cumElapsedS: number[] = [];
  for (let i = 0; i < n; i++) { cumDistM.push(i * mps); cumElapsedS.push(i); }
  return { cumDistM, cumElapsedS };
}

Deno.test('the lists are the published ones', () => {
  assertEquals(RUN_RECORD_DISTANCES.length, 14);
  assertEquals(RUN_RECORD_DISTANCES.map((d) => d.label), [
    '400m', 'half_mile', '1km', '1mi', '2mi', '5k', '10k', '15k', '10mi', '20k', 'half_marathon', '30k', 'marathon', '50k',
  ]);
  assertEquals(RIDE_RECORD_DISTANCES.length, 13);
  assertEquals(RIDE_RECORD_DISTANCES.find((d) => d.label === '40k')!.meters, 40000);
});

Deno.test('a steady trace returns exactly distance ÷ speed', () => {
  // 4 m/s for 1500 s = 6000 m. A 5K at 4 m/s is 1250 s exactly.
  const { cumDistM, cumElapsedS } = steady(1501, 4);
  const w = fastestWindowForDistance(cumDistM, cumElapsedS, 5000);
  assert(w != null);
  assertEquals(Math.round(w!.elapsedS * 1000) / 1000, 1250);
});

/**
 * ⛔ THE ±2% BUG, PINNED. Samples land every 150 m, so no sample boundary sits on 5,000 m: the
 * tightest whole-sample window covering 5K is 5,100 m. The old finder accepted that window (5,100 is
 * inside 102% of 5,000) and stored its clock time. At 5 m/s that is 1,020 s — twenty seconds slow.
 * The right answer is 1,000 s.
 */
Deno.test('a sample straddling the boundary is interpolated, not accepted whole', () => {
  const cumDistM: number[] = [];
  const cumElapsedS: number[] = [];
  for (let i = 0; i <= 40; i++) { cumDistM.push(i * 150); cumElapsedS.push(i * 30); } // 150 m / 30 s = 5 m/s
  const w = fastestWindowForDistance(cumDistM, cumElapsedS, 5000);
  assert(w != null);
  assertEquals(Math.round(w!.elapsedS * 1000) / 1000, 1000);
  // The window it measured really is 5,100 m wide — the overshoot came off the time, not the window.
  assertEquals(cumDistM[w!.endIdx] - cumDistM[w!.startIdx], 5100);
});

Deno.test('the fastest stretch is found anywhere in the run, not at the start', () => {
  // 600 s of 3 m/s, then 400 s of 5 m/s, then 600 s of 3 m/s.
  const cumDistM: number[] = [0];
  const cumElapsedS: number[] = [0];
  const speeds = [...Array(600).fill(3), ...Array(400).fill(5), ...Array(600).fill(3)];
  speeds.forEach((v, i) => { cumDistM.push(cumDistM[i] + v); cumElapsedS.push(i + 1); });
  const w = fastestWindowForDistance(cumDistM, cumElapsedS, 1000);
  assert(w != null);
  assertEquals(Math.round(w!.elapsedS), 200); // 1000 m at 5 m/s
  assert(w!.startIdx >= 600 && w!.endIdx <= 1000, `window ${w!.startIdx}-${w!.endIdx}`);
});

Deno.test('a workout shorter than the distance returns nothing for it', () => {
  const { cumDistM, cumElapsedS } = steady(500, 4); // 1,996 m
  assertEquals(fastestWindowForDistance(cumDistM, cumElapsedS, 5000), null);
  const out = bestDistanceEfforts(RUN_RECORD_DISTANCES, {
    cumDistM, cumElapsedS, maxSpeedMps: RUN_MAX_SPEED_MPS,
  });
  assert(out != null);
  assertEquals(Object.keys(out!).sort(), ['1km', '1mi', '400m', 'half_mile']);
});

Deno.test('a trace too sparse to measure returns nothing at all', () => {
  const cumDistM = [0, 2500, 5000];
  const cumElapsedS = [0, 600, 1200];
  assertEquals(fastestWindowForDistance(cumDistM, cumElapsedS, 5000), null);
});

Deno.test('OURS — a GPS glitch faster than 3:00/mi is refused', () => {
  const { cumDistM, cumElapsedS } = steady(300, 12); // 12 m/s ≈ 2:14/mi, not a run
  const out = bestDistanceEfforts(RUN_RECORD_DISTANCES, {
    cumDistM, cumElapsedS, maxSpeedMps: RUN_MAX_SPEED_MPS,
  });
  assertEquals(out, null);
  // The same trace is a plausible ride, so the ride ceiling lets it through.
  assert(12 < RIDE_MAX_SPEED_MPS);
});

Deno.test('heart rate and net elevation come off the same window', () => {
  const { cumDistM, cumElapsedS } = steady(1501, 4);
  const hrBpm = cumElapsedS.map(() => 150);
  const elevationM = cumElapsedS.map((_, i) => 100 + i * 0.02); // +30 m over 1,500 s
  const out = bestDistanceEfforts([{ label: '5k', meters: 5000 }], {
    cumDistM, cumElapsedS, hrBpm, elevationM, maxSpeedMps: RUN_MAX_SPEED_MPS,
  });
  assertEquals(out!['5k'].avg_hr, 150);
  assertEquals(out!['5k'].net_elev_m, 25); // 1,250 samples × 0.02 m
});

/**
 * ⛔ ONE WINDOW, TWO NUMBERS. The record is the clock time over the ground; the trend is the
 * grade-adjusted pace over moving seconds. This run climbed, so the grade-adjusted pace is FASTER
 * than the as-run pace, and it stopped for 250 s, so moving time is shorter than elapsed.
 */
Deno.test('the grade-adjusted pace is measured over the same window as the record', () => {
  const { cumDistM, cumElapsedS } = steady(1501, 4);
  // Grade-adjusted: the hill makes it worth 10% more metres. Moving clock: 20% of the time was stopped.
  const cumFlatM = cumDistM.map((d) => d * 1.1);
  const cumMovingS = cumElapsedS.map((t) => t * 0.8);
  const out = bestDistanceEfforts([{ label: '5k', meters: 5000 }], {
    cumDistM, cumElapsedS, cumFlatM, cumMovingS, maxSpeedMps: RUN_MAX_SPEED_MPS,
  });
  const e = out!['5k'];
  assertEquals(Math.round(e.elapsed_s), 1250);                       // the record: 4 m/s over the ground
  // 5,500 flat metres in 1,000 moving seconds = 5.5 m/s = 292 s/mi.
  assertEquals(e.gap_s_per_mi, 293);
});

Deno.test('a ride carries no grade-adjusted pace', () => {
  const { cumDistM, cumElapsedS } = steady(1501, 10); // 36 km/h for 15 km
  const out = bestDistanceEfforts(RIDE_RECORD_DISTANCES, {
    cumDistM, cumElapsedS, maxSpeedMps: RIDE_MAX_SPEED_MPS,
  });
  assertEquals(Object.keys(out!).sort(), ['10k', '5mi']);
  assertEquals(out!['10k'].gap_s_per_mi, undefined);
  assertEquals(Math.round(out!['10k'].elapsed_s), 1000);
});

Deno.test('the same trace twice gives the same answer — it is deterministic', () => {
  const { cumDistM, cumElapsedS } = steady(2000, 4.3);
  const hrBpm = cumElapsedS.map((_, i) => 140 + (i % 11));
  const a = bestDistanceEfforts(RUN_RECORD_DISTANCES, { cumDistM, cumElapsedS, hrBpm, maxSpeedMps: RUN_MAX_SPEED_MPS });
  const b = bestDistanceEfforts(RUN_RECORD_DISTANCES, { cumDistM, cumElapsedS, hrBpm, maxSpeedMps: RUN_MAX_SPEED_MPS });
  assertEquals(JSON.stringify(a), JSON.stringify(b));
});

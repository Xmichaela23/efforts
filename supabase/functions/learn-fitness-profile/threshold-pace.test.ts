/**
 * THRESHOLD PACE MUST BE FASTER THAN EASY PACE.
 *
 * ⛔ THE DEFECT (2026-08-19, seen on real baselines): easy pace 12:35/mi, threshold pace 14:44/mi,
 * 5K time 25:21 = 8:10/mi. A threshold pace SLOWER than easy is not a low-confidence reading — it
 * is not a reading at all, and it shipped at `medium` confidence, which the resolver trusts.
 *
 * ⛔ THE MECHANISM. The learner took any run ≥15 min whose AVERAGE HR sat within ±5 bpm of
 * threshold HR, then took the median of that run's AVERAGE PACE over the whole activity. A
 * hill-repeat session averages near threshold HR and its average pace includes the walk-back
 * descents; an interval session includes its recoveries. Two such sessions were enough — the
 * minimum was 2.
 *
 * ⛔ THE GUARD IS AN INVARIANT, NOT A CONTAMINATION LIST. Detecting hills, then intervals, then
 * stops is a guard per source, forever. "A threshold effort is faster than an easy effort" holds
 * for every athlete, so it filters the candidates AND checks the answer.
 *
 * ⚠️ `avg_pace` IS SECONDS PER KILOMETRE. Larger is SLOWER. Every number below is sec/km.
 *
 * Run: ~/.deno/bin/deno test --allow-all --no-check supabase/functions/learn-fitness-profile/threshold-pace.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { analyzeRuns } from './index.ts';

let seq = 0;
const run = (partial: Record<string, unknown>): any => ({
  id: `w${++seq}`,
  type: 'run',
  date: '2026-08-01',
  duration: 40,
  moving_time: 40,
  distance: 6,
  avg_heart_rate: 140,
  max_heart_rate: 175,
  avg_pace: 420,
  avg_power: 0,
  normalized_power: 0,
  avg_speed: 0,
  workout_status: 'completed',
  computed: null,
  ...partial,
});

/**
 * A believable athlete: max HR 180, threshold HR ~155, easy HR ~132.
 * Easy pace 480 s/km (12:52/mi). A genuine threshold effort runs ~390 s/km (10:27/mi).
 */
const MAX_HR = 180;
const THRESHOLD_HR = 155;   // 86% of max — inside the 85-92% detection band
const EASY_HR = 132;        // below 89% of threshold HR (Friel Z2 ceiling ≈ 138)

/** Enough easy runs to learn an easy pace: needs ≥3, each ≥20 min. */
const easyRuns = (pace: number, n = 4) =>
  Array.from({ length: n }, (_, i) => run({
    avg_heart_rate: EASY_HR, max_heart_rate: MAX_HR, avg_pace: pace,
    duration: 45, moving_time: 45, date: `2026-08-0${i + 1}`,
  }));

/** Sustained efforts at threshold HR — these both set threshold HR and feed the pace read. */
const thresholdRuns = (pace: number, n = 3) =>
  Array.from({ length: n }, (_, i) => run({
    avg_heart_rate: THRESHOLD_HR, max_heart_rate: MAX_HR, avg_pace: pace,
    duration: 35, moving_time: 35, date: `2026-08-1${i + 1}`,
  }));

// ── THE BUG, PINNED ──────────────────────────────────────────────────────────

Deno.test('⛔⛔ A THRESHOLD READ SLOWER THAN EASY PACE PUBLISHES NOTHING', () => {
  // The exact shape of the defect: every threshold-HR session is a hill or interval workout whose
  // whole-activity average pace (600 s/km) is slower than the athlete's easy pace (480 s/km).
  const p = analyzeRuns([...easyRuns(480), ...thresholdRuns(600)]);
  assert(p.easy_pace, 'the fixture must learn an easy pace or it proves nothing');
  assertEquals(p.easy_pace!.value, 480);
  assertEquals(
    p.threshold_pace,
    null,
    `published ${p.threshold_pace?.value} s/km against an easy pace of 480 s/km`,
  );
});

Deno.test('⛔ AND THE INDIVIDUAL DIRTY SESSIONS ARE DROPPED, NOT JUST THE ANSWER', () => {
  // Three clean threshold efforts at 390 and two contaminated ones at 620. If the dirty sessions
  // survived into the pool the median would move toward them; filtering them leaves 390.
  const p = analyzeRuns([
    ...easyRuns(480),
    ...thresholdRuns(390, 3),
    ...thresholdRuns(620, 2),
  ]);
  assert(p.threshold_pace, 'three clean efforts should still produce a reading');
  assertEquals(p.threshold_pace!.value, 390, 'the walk-back sessions moved the median');
  assertEquals(p.threshold_pace!.sample_count, 3, 'the contaminated pair was counted');
});

Deno.test('a clean athlete still gets a threshold pace, and it is faster than easy', () => {
  const p = analyzeRuns([...easyRuns(480), ...thresholdRuns(390, 3)]);
  assert(p.threshold_pace, 'clean data must still publish');
  assert(
    p.threshold_pace!.value < p.easy_pace!.value,
    `threshold ${p.threshold_pace!.value} is not faster than easy ${p.easy_pace!.value}`,
  );
});

// ── THE CONFIDENCE TIER ──────────────────────────────────────────────────────

Deno.test('⛔ TWO RUNS IS `low` — the resolver trusts medium, and two of Michael\'s were dirty', () => {
  // `resolveCurrentRunThresholdPace` treats medium and high as TRUSTED. At two samples this used to
  // publish `medium` and drive real prescriptions off a pair of sessions.
  const two = analyzeRuns([...easyRuns(480), ...thresholdRuns(390, 2)]);
  assert(two.threshold_pace, 'two clean runs still publish — visible, just not trusted');
  assertEquals(two.threshold_pace!.confidence, 'low');

  const three = analyzeRuns([...easyRuns(480), ...thresholdRuns(390, 3)]);
  assertEquals(three.threshold_pace!.confidence, 'medium', 'three earns the trusted tier');
});

// ── THE HONEST GAP, STATED RATHER THAN HIDDEN ────────────────────────────────

Deno.test('⚠️ WITH NO EASY PACE LEARNED THERE IS NO CEILING, AND THE READ STANDS', () => {
  // Fewer than three easy runs, so `easy_pace` is null and there is nothing to measure against.
  // ⛔ INVENTING a ceiling here would be the fabrication LAW 2 deleted from this file. The reading
  // is published unfiltered, which is the honest position — and it is why this test exists rather
  // than an assertion that the guard always fires.
  const p = analyzeRuns([...easyRuns(480, 2), ...thresholdRuns(600, 3)]);
  assertEquals(p.easy_pace, null, 'the fixture must NOT learn an easy pace');
  assert(p.threshold_pace, 'with no reference, the read is published as measured');
});

// ── THE INVARIANT, OVER EVERY SHAPE ──────────────────────────────────────────

Deno.test('the two paces never contradict each other, whatever the input', () => {
  for (const [name, rows] of [
    ['all dirty', [...easyRuns(480), ...thresholdRuns(600)]],
    ['all clean', [...easyRuns(480), ...thresholdRuns(390)]],
    ['mixed', [...easyRuns(480), ...thresholdRuns(390, 3), ...thresholdRuns(700, 3)]],
    ['threshold barely faster', [...easyRuns(480), ...thresholdRuns(479, 3)]],
    ['identical paces', [...easyRuns(480), ...thresholdRuns(480, 3)]],
  ] as Array<[string, any[]]>) {
    const p = analyzeRuns(rows);
    if (p.threshold_pace == null || p.easy_pace == null) continue;
    assert(
      p.threshold_pace.value < p.easy_pace.value,
      `${name}: threshold ${p.threshold_pace.value} is not faster than easy ${p.easy_pace.value}`,
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// STEP 5c — THE FITTED THRESHOLD OUTRANKS THE AVERAGED ONE (2026-08-20)
// ═══════════════════════════════════════════════════════════════════════════

/** A run carrying a stored pace curve, the shape `compute-workout-analysis` writes. */
const runWithCurve = (
  date: string,
  windows: Record<string, { distanceM: number; timeS: number; avgHr: number }>,
) => run({
  date, duration: 40, moving_time: 40,
  avg_heart_rate: EASY_HR, max_heart_rate: MAX_HR, avg_pace: 480,
  computed: { pace_curve: Object.fromEntries(
    Object.entries(windows).map(([k, w]) => [k, { ...w, netAscentM: 0 }]),
  ) },
});

/** Points exactly on distance = CS·t + D'. */
const onCurve = (csMps: number, dPrimeM: number, timeS: number, avgHr: number) =>
  ({ distanceM: csMps * timeS + dPrimeM, timeS, avgHr });

Deno.test('5c: two hard efforts in different bands publish a FITTED threshold', () => {
  const CS = 3.4, DP = 160, HARD = 168;
  const runs = [
    runWithCurve('2026-08-01', { '360': onCurve(CS, DP, 360, HARD) }),
    runWithCurve('2026-08-08', { '1200': onCurve(CS, DP, 1200, HARD) }),
  ];
  const out = analyzeRuns([...easyRuns(480), ...thresholdRuns(390), ...runs] as never);
  const tp = out.threshold_pace;
  assert(tp != null, 'no threshold published');
  assert(/critical speed/i.test(String(tp!.source)), `not the fitted tier: ${tp!.source}`);
  // Recovers the curve it was built from, not an average of anything.
  assertEquals(tp!.value, Math.round(1000 / CS));
});

Deno.test('5c: one session cannot publish — it is one duration band', () => {
  const CS = 3.4, DP = 160, HARD = 168;
  const runs = [runWithCurve('2026-08-01', { '720': onCurve(CS, DP, 720, HARD) })];
  const out = analyzeRuns([...easyRuns(480), ...thresholdRuns(390), ...runs] as never);
  const src = String(out.threshold_pace?.source ?? '');
  assert(!/critical speed/i.test(src), `a single band published a fit: ${src}`);
});

Deno.test('5c: JOGGING never becomes a threshold — caught by pace, not heart rate', () => {
  // ⛔ THIS TEST CHANGED SIDES 2026-08-20 AND THE OLD VERSION IS WORTH KNOWING ABOUT. It used to pin
  // the fit's heart-rate gate: same fast windows, easy HR, refused. That gate is GONE — it required
  // 92% of a threshold heart rate, which a base-training athlete does not have, and on a real account
  // it sat at 134 while that athlete's easy runs ran 133-141, so it would have admitted his easy
  // running as threshold work. Critical-power modelling does not heart-rate gate.
  //
  // ⚠️ AND THE OLD FIXTURE WAS WRONG ABOUT ITSELF. Its windows were at 294 s/km — genuinely fast,
  // merely labelled with an easy heart rate. Covering that distance in that time IS a hard effort
  // whatever the strap says, and straps drop out and cadence-lock. Publishing there is correct.
  //
  // What actually catches jogging is the invariant: windows at the athlete's OWN EASY PACE fit a
  // perfectly good curve whose answer is not faster than easy, which is impossible for a threshold.
  const EASY = 480;   // s/km — the same easy pace `easyRuns(480)` teaches the learner below
  const runs = [
    runWithCurve('2026-08-21', { '360': onCurve(1000 / EASY, 160, 360, 120) }),
    runWithCurve('2026-08-22', { '1200': onCurve(1000 / EASY, 160, 1200, 120) }),
  ];
  const out = analyzeRuns([...easyRuns(EASY), ...thresholdRuns(390), ...runs] as never);
  const src = String(out.threshold_pace?.source ?? '');
  assert(!/critical speed/i.test(src), `jogging was fitted as a threshold: ${src}`);
});

Deno.test('5c: runs with no pace curve leave the older tier untouched', () => {
  // No backfill — old runs carry no curve, and the behaviour is exactly what it was before 5c.
  const out = analyzeRuns([...easyRuns(480), ...thresholdRuns(390)] as never);
  const src = String(out.threshold_pace?.source ?? '');
  assert(!/critical speed/i.test(src), src);
});

Deno.test('5c: a fit slower than the learned EASY pace publishes nothing', () => {
  // ⛔ THE ORIGINAL BUG, ARRIVING AT THE NEW TIER — and the test that was missing until mutation
  // showed the wiring was unpinned. The fit's own gate is tested in `run-critical-speed.test.ts`;
  // this pins that the LEARNER actually hands it the easy pace it just learned. With `null` passed
  // instead, the gate has no reference and this impossible read would publish.
  const HARD = 168;
  const SLOW = 1.9;   // 1.9 m/s = 526 s/km, slower than the fixtures' 480 s/km easy pace
  const runs = [
    runWithCurve('2026-08-21', { '360': onCurve(SLOW, 160, 360, HARD) }),
    runWithCurve('2026-08-22', { '1200': onCurve(SLOW, 160, 1200, HARD) }),
  ];
  const out = analyzeRuns([...easyRuns(480), ...thresholdRuns(390), ...runs] as never);
  const src = String(out.threshold_pace?.source ?? '');
  assert(!/critical speed/i.test(src), `published a threshold slower than easy: ${src}`);
});

/**
 * compute-workout-summary fixtures — WORKORDER-outdoor-ride-matching-2026-09-24 (A–H), plus the run and ride paths
 * that must not move (their computed JSON is snapshotted before and after with `EFFORTS_SNAPSHOT_DIR`).
 *
 * Run from the repo root:
 *   deno test --allow-env --allow-net --allow-read --allow-write --no-check supabase/functions/compute-workout-summary/index.test.ts
 *   EFFORTS_SNAPSHOT_DIR=/some/dir <same command>      → also writes one JSON per fixture for a before/after diff
 *
 * Supabase is stubbed at the fetch layer (the style of `_shared/require-user.test.ts`): the workouts and
 * planned_workouts reads answer from an in-memory row, `merge_computed` captures what would be written, and the
 * function's `Deno.serve` handler is captured on import and called directly. No database anywhere.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

Deno.env.set('SUPABASE_URL', 'http://stub.local');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
Deno.env.set('SUPABASE_ANON_KEY', 'anon-key');

// ── the stub database ────────────────────────────────────────────────────────────────────────────────────────────
type Db = { workout: Record<string, unknown>; planned: Record<string, unknown> | null };
let db: Db = { workout: {}, planned: null };
let merged: unknown = null;

const json = (body: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith('http://stub.local/')) return realFetch(input as any, init);
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const path = new URL(url).pathname;
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  if (path === '/rest/v1/rpc/try_advisory_lock') return json(true);
  if (path === '/rest/v1/rpc/merge_computed') { merged = body?.p_partial_computed ?? null; return json(null, 204); }
  if (path === '/rest/v1/workouts') return method === 'GET' ? json([db.workout]) : json([]);
  if (path === '/rest/v1/planned_workouts') return json(db.planned ? [db.planned] : []);
  if (path === '/rest/v1/garmin_activities') return json([]);
  return json({ message: `unstubbed ${method} ${path}` }, 500);
}) as typeof fetch;

// ── capture the function's handler instead of listening ─────────────────────────────────────────────────────────
let handler: ((req: Request) => Promise<Response>) | null = null;
const realServe = Deno.serve;
(Deno as any).serve = (a: any, b?: any) => {
  handler = typeof a === 'function' ? a : b;
  return { addr: { hostname: '0.0.0.0', port: 0, transport: 'tcp' }, finished: Promise.resolve(), shutdown: async () => {}, ref() {}, unref() {} };
};
await import('./index.ts');
(Deno as any).serve = realServe;
assert(handler, 'the function registered no handler');

const quiet = { log: console.log, error: console.error, warn: console.warn };
async function compute(name: string, workout: Record<string, unknown>, planned: Record<string, unknown> | null) {
  db = { workout: { id: 'w-' + name, user_id: 'u-1', planned_id: planned ? planned.id : null, ...workout }, planned };
  merged = null;
  console.log = () => {}; console.error = () => {}; console.warn = () => {};
  let res: Response;
  try {
    res = await handler!(new Request('http://stub.local/functions/v1/compute-workout-summary', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workout_id: 'w-' + name }),
    }));
  } finally { console.log = quiet.log; console.error = quiet.error; console.warn = quiet.warn; }
  const out = await res.json();
  const computed = (merged ?? out?.computed ?? null) as any;
  const dir = Deno.env.get('EFFORTS_SNAPSHOT_DIR');
  if (dir) {
    await Deno.mkdir(dir, { recursive: true });
    await Deno.writeTextFile(`${dir}/${name}.json`, JSON.stringify({ mode: out?.mode ?? null, computed }, null, 1));
  }
  return { status: res.status, mode: out?.mode ?? null, computed };
}

// ── synthetic streams ───────────────────────────────────────────────────────────────────────────────────────────
const T0 = 1_800_000_000; // the recording's first clock second (epoch)
/** A deterministic ±jitter so every run of a fixture is byte-identical. */
function lcg(seed: number) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
type Seg = { sec: number; mps: number; w?: number; hr?: number };
/** One sample per second, Garmin field names: clock, timer, speed, cumulative distance, watts, heart rate. */
function samplesFor(segs: Seg[], seed = 7, jitterW = 10) {
  const rnd = lcg(seed);
  const out: Record<string, number>[] = [];
  let t = 0, d = 0;
  for (const s of segs) {
    for (let i = 0; i < s.sec; i += 1) {
      const row: Record<string, number> = { startTimeInSeconds: T0 + t, timerDurationInSeconds: t, speedMetersPerSecond: s.mps, totalDistanceInMeters: Math.round(d * 10) / 10 };
      if (s.w != null) row.powerInWatts = Math.max(0, Math.round(s.w + (s.w > 0 ? (rnd() * 2 - 1) * jitterW : 0)));
      if (s.hr != null) row.heartRateInBeatsPerMinute = Math.round(s.hr + (rnd() * 2 - 1) * 2);
      out.push(row);
      t += 1; d += s.mps;
    }
  }
  return out;
}
const totalSec = (segs: Seg[]) => segs.reduce((a, s) => a + s.sec, 0);
const totalM = (segs: Seg[]) => segs.reduce((a, s) => a + s.sec * s.mps, 0);
/** Laps with a start and an end on the clock (the shape `normalizeLaps` reads first). */
function lapsAt(bounds: number[]): Record<string, number>[] {
  const out: Record<string, number>[] = [];
  for (let i = 0; i + 1 < bounds.length; i += 1) out.push({ start_ts: T0 + bounds[i], end_ts: T0 + bounds[i + 1], time_s: bounds[i + 1] - bounds[i] });
  return out;
}
/** Garmin laps: a start only, each ends where the next begins, the last with the recording. */
const garminLaps = (starts: number[]) => starts.map((s) => ({ startTimeInSeconds: T0 + s }));

function workout(type: 'ride' | 'run' | 'walk', segs: Seg[], laps: unknown, extra: Record<string, unknown> = {}) {
  const sec = totalSec(segs), m = totalM(segs);
  return {
    type, computed: null, metrics: { moving_time_seconds: sec }, gps_track: null, sensor_data: { samples: samplesFor(segs) },
    swim_data: null, laps, distance: m / 1000, moving_time: sec / 60, avg_speed: (m / sec) * 3.6, avg_pace: null, avg_power: null,
    avg_temperature: null, weather_data: null, elevation_gain: null, ...extra,
  };
}

// ── the plans, as materialize-plan saves them (v3 steps) ─────────────────────────────────────────────────────────
/**
 * The One-to-One Repeats L1 ride (Viada p237) as the composer builds it at FTP 250: the p237 box's 12:30 easy spin
 * (no power target on an easy spin), 10 × 1:00 @ 110% (a p237 floor: 275 W, shown top 325) / 1:00 @ 50% (a stated
 * number, 125 W ± 10%). No cycling page prints a cool-down box, so the composer builds none (`source-rules.ts`
 * RIDE_EASY_SPIN_WRAPPER); `withCooldown` adds one for the fixtures that lay a trailing step.
 */
function oneToOneL1(opts: { withCooldown?: boolean } = {}) {
  const steps: Record<string, unknown>[] = [
    { id: 'w0', kind: 'warmup', seconds: 750, label: '10- to 15-minute easy spin', page_label: true },
  ];
  for (let k = 1; k <= 10; k += 1) {
    steps.push({ id: `wk${k}`, kind: 'work', seconds: 60, powerRange: { lower: 275, shown_upper: 325 }, powerTarget: '275 W' });
    steps.push({ id: `rk${k}`, kind: 'recovery', seconds: 60, powerRange: { lower: 113, upper: 138 }, powerTarget: '126 W' });
  }
  if (opts.withCooldown) steps.push({ id: 'c0', kind: 'cooldown', seconds: 300 });
  const total = steps.reduce((a, s) => a + Number(s.seconds), 0);
  return {
    id: 'p-one-to-one', intervals: null, tags: ['family:ride_anaerobic', 'archetype:one_to_one', 'level:1'],
    computed: { normalization_version: 'v3', steps, total_duration_seconds: total, anchors: { as_of: '2026-09-24', ftp_w: 250 } },
  };
}
/** A steady ride plan (one work step) — not structured, so no rung and no finder. */
const steadyRidePlan = {
  id: 'p-steady-ride', intervals: null, tags: ['family:ride_endurance'],
  computed: { normalization_version: 'v3', steps: [{ id: 'e0', kind: 'work', seconds: 3600, powerRange: { lower: 0, upper: 188 } }], total_duration_seconds: 3600, anchors: { ftp_w: 250 } },
};
/** 10:00 easy, 6 × 4:00 near threshold / 1:00 jog, 8:00 easy — the run plan the lap rungs were written on. */
function sixByFourRun() {
  const steps: Record<string, unknown>[] = [{ id: 'w0', kind: 'warmup', seconds: 600, pace_range: { lower: 560, upper: 660 } }];
  for (let k = 1; k <= 6; k += 1) {
    steps.push({ id: `wk${k}`, kind: 'work', seconds: 240, distanceMeters: 1287, distanceDerived: true, pace_range: { lower: 460, upper: 520 } });
    if (k < 6) steps.push({ id: `rk${k}`, kind: 'recovery', seconds: 60, pace_range: { lower: 560, upper: 700 } });
  }
  steps.push({ id: 'c0', kind: 'cooldown', seconds: 480, pace_range: { lower: 560, upper: 660 } });
  return { id: 'p-6x4', intervals: null, tags: ['family:run_near_threshold'], computed: { normalization_version: 'v3', steps, total_duration_seconds: 2280 } };
}
const steadyRunPlan = { id: 'p-steady-run', intervals: null, tags: ['family:run_vt1'], computed: { normalization_version: 'v3', steps: [{ id: 'w0', kind: 'warmup', seconds: 300 }, { id: 'e0', kind: 'work', seconds: 1800, pace_range: { lower: 560, upper: 660 } }, { id: 'c0', kind: 'cooldown', seconds: 300 }], total_duration_seconds: 2400 } };

// ── ride streams ────────────────────────────────────────────────────────────────────────────────────────────────
const WU = (sec: number): Seg => ({ sec, mps: 8, w: 150, hr: 120 });
const EFFORT: Seg = { sec: 60, mps: 11, w: 290, hr: 165 }; // clear of the step's 275 W floor with the ±10 W jitter
const SPIN: Seg = { sec: 60, mps: 7, w: 125, hr: 140 };
const HOME = (sec: number): Seg => ({ sec, mps: 8, w: 140, hr: 125 });
const STOP = (sec: number): Seg => ({ sec, mps: 0, w: 0, hr: 110 });
function rideWith(warmupSec: number, efforts: number, homeSec: number, opts: { stopAfter?: number; stopSec?: number } = {}): Seg[] {
  const segs: Seg[] = [WU(warmupSec)];
  for (let k = 1; k <= efforts; k += 1) {
    segs.push(EFFORT, SPIN);
    if (opts.stopAfter === k) segs.push(STOP(opts.stopSec ?? 90));
  }
  segs.push(HOME(homeSec));
  return segs;
}
const effortStart = (warmupSec: number, k: number) => warmupSec + (k - 1) * 120;
const workRows = (c: any) => (c.intervals as any[]).filter((r) => r.role === 'work');
const near = (a: number, b: number, tol: number, what: string) => assert(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (±${tol})`);

// ── A ───────────────────────────────────────────────────────────────────────────────────────────────────────────
Deno.test('A · 20-min warm-up, no laps, efforts on the clock from 20:00 → the finder lays the 10 work rows on the efforts', async () => {
  const segs = rideWith(1200, 10, 600);
  const r = await compute('ride-A-finder', workout('ride', segs, []), oneToOneL1());
  assertEquals(r.status, 200);
  assertEquals(r.computed.alignment_mode, 'aligned-on-efforts');
  assertEquals(r.computed.intervals.length, 21);
  assertEquals(r.computed.steps_not_done, 0);
  const work = workRows(r.computed);
  assertEquals(work.length, 10);
  work.forEach((row, i) => {
    near(row.sample_idx_start, effortStart(1200, i + 1), 2, `work ${i + 1} start`);
    near(row.executed.duration_s, 60, 3, `work ${i + 1} seconds`);
    // The row shares its last sample with the recovery after it (the file's window convention), so 60 of 61 seconds.
    assert(row.executed.in_range_s >= 58, `work ${i + 1}: ${row.executed.in_range_s} s of 60 in range`);
    assertEquals(row.pass_state, 'pass', `work ${i + 1}`);
    assertEquals(row.not_done, undefined);
  });
  near(r.computed.intervals[0].executed.duration_s, 1200, 2, 'the warm-up is everything before the first effort');
  assertEquals(r.computed.mismatch_reason, null);
});

Deno.test('A · the same ride against a plan with a cool-down → the cool-down is laid after the last recovery', async () => {
  const r = await compute('ride-A-cooldown', workout('ride', rideWith(1200, 10, 600), []), oneToOneL1({ withCooldown: true }));
  assertEquals(r.computed.alignment_mode, 'aligned-on-efforts');
  assertEquals(r.computed.intervals.length, 22);
  const last = r.computed.intervals[21];
  assertEquals(last.role, 'cooldown');
  assert(last.executed.duration_s >= 500, `cool-down ${last.executed.duration_s}s should cover the ride home`);
  assertEquals(r.computed.steps_not_done, 0);
});

Deno.test('A · a 3-second dip under the floor inside an effort does not split it', async () => {
  const segs: Seg[] = [WU(1200)];
  for (let k = 1; k <= 10; k += 1) segs.push({ sec: 30, mps: 11, w: 290, hr: 165 }, { sec: 3, mps: 11, w: 200, hr: 165 }, { sec: 27, mps: 11, w: 290, hr: 165 }, SPIN);
  segs.push(HOME(600));
  const r = await compute('ride-A-dip', workout('ride', segs, []), oneToOneL1());
  assertEquals(r.computed.alignment_mode, 'aligned-on-efforts');
  assertEquals(workRows(r.computed).length, 10);
  workRows(r.computed).forEach((row, i) => near(row.executed.duration_s, 60, 3, `work ${i + 1} seconds`));
});

Deno.test('A · a plan that ends on a work step (no trailing recovery) → the last effort keeps its own end, the ride home is no row', async () => {
  const plan = oneToOneL1(); plan.id = 'p-one-to-one-ends-on-work';
  (plan.computed.steps as any[]).pop(); // drop the 10th recovery
  const r = await compute('ride-A-ends-on-work', workout('ride', rideWith(1200, 10, 600), []), plan);
  assertEquals(r.computed.alignment_mode, 'aligned-on-efforts');
  assertEquals(r.computed.intervals.length, 20);
  const last = r.computed.intervals[19];
  assertEquals(last.role, 'work');
  near(last.executed.duration_s, 60, 3, 'the last effort');
});

// ── B ───────────────────────────────────────────────────────────────────────────────────────────────────────────
Deno.test('B · 20-min warm-up, ONE lap at 20:00, efforts on the clock → the walk starts at the press; same rows as A', async () => {
  const segs = rideWith(1200, 10, 600);
  const r = await compute('ride-B-one-lap', workout('ride', segs, lapsAt([1200, totalSec(segs)])), oneToOneL1());
  assertEquals(r.computed.alignment_mode, 'aligned-from-lap');
  assertEquals(r.computed.intervals.length, 21);
  const work = workRows(r.computed);
  assertEquals(work.length, 10);
  work.forEach((row, i) => {
    near(row.sample_idx_start, effortStart(1200, i + 1), 1, `work ${i + 1} start`);
    near(row.executed.duration_s, 60, 1, `work ${i + 1} seconds`);
    assertEquals(row.pass_state, 'pass', `work ${i + 1}`);
  });
  near(r.computed.intervals[0].executed.duration_s, 1200, 1, 'the warm-up is everything before the press');
  assertEquals(r.computed.steps_not_done, 0);
});

Deno.test('B · the same press as a Garmin records it (two laps: before and after the press) → anchored the same way', async () => {
  const segs = rideWith(1200, 10, 600);
  const r = await compute('ride-B-garmin-two-laps', workout('ride', segs, garminLaps([0, 1200])), oneToOneL1());
  assertEquals(r.computed.alignment_mode, 'aligned-from-lap');
  workRows(r.computed).forEach((row, i) => near(row.sample_idx_start, effortStart(1200, i + 1), 1, `work ${i + 1} start`));
});

Deno.test('B · a lone lap that starts with the recording is the device\'s whole-ride lap, not a press → the finder', async () => {
  const segs = rideWith(1200, 10, 600);
  const r = await compute('ride-B-whole-ride-lap', workout('ride', segs, garminLaps([0])), oneToOneL1());
  assertEquals(r.computed.alignment_mode, 'aligned-on-efforts');
});

// ── C ───────────────────────────────────────────────────────────────────────────────────────────────────────────
Deno.test('C · ONE lap at 20:00 and a 90-s stop after effort 4 → anchored walk; rows 5–10 drift 90 s late (expected: the walk is by time, the finder is not invoked once a lap anchored)', async () => {
  const segs = rideWith(1200, 10, 600, { stopAfter: 4, stopSec: 90 });
  const r = await compute('ride-C-one-lap-stop', workout('ride', segs, lapsAt([1200, totalSec(segs)])), oneToOneL1());
  assertEquals(r.computed.alignment_mode, 'aligned-from-lap');
  const work = workRows(r.computed);
  for (let i = 0; i < 4; i += 1) near(work[i].sample_idx_start, effortStart(1200, i + 1), 1, `work ${i + 1} start`);
  // effort 5 was ridden at 1200 + 480 + 90 = 1770; the walk lays row 5 at 1680 — 90 s early, the stop's length.
  near(work[4].sample_idx_start, 1680, 1, 'row 5 sits where the clock says, not where effort 5 was');
  near(1770 - work[4].sample_idx_start, 90, 1, 'the drift is the stop');
});

// ── D ───────────────────────────────────────────────────────────────────────────────────────────────────────────
Deno.test('D · 22 laps, each within tolerance → snap-to-laps, as today', async () => {
  const segs = rideWith(750, 10, 600);
  const bounds = [0, 750]; for (let k = 0; k < 20; k += 1) bounds.push(750 + (k + 1) * 60); bounds.push(totalSec(segs));
  const r = await compute('ride-D-snap', workout('ride', segs, lapsAt(bounds)), oneToOneL1());
  assertEquals(r.mode, 'snap-to-laps');
  assertEquals(r.computed.alignment_mode, 'snap-to-laps');
  assertEquals(r.computed.intervals.length, 21);
  workRows(r.computed).forEach((row, i) => near(row.executed.duration_s, 60, 1, `work ${i + 1} seconds`));
});

Deno.test('D · the Edge ends the open warm-up on the press: a 20:00 warm-up lap + 20 interval laps → snap-to-laps, work rows in range', async () => {
  const segs = rideWith(1200, 10, 600);
  const bounds = [0, 1200]; for (let k = 0; k < 20; k += 1) bounds.push(1200 + (k + 1) * 60); bounds.push(totalSec(segs));
  const plan = oneToOneL1(); plan.id = 'p-one-to-one-open-warmup';
  (plan.computed.steps as any[])[0].lap_button = true; // the wrapper's open warm-up; its 750 s stay on the row
  const r = await compute('ride-D-open-warmup', workout('ride', segs, lapsAt(bounds)), plan);
  assertEquals(r.computed.alignment_mode, 'snap-to-laps');
  assertEquals(r.computed.intervals.length, 21);
  near(r.computed.intervals[0].executed.duration_s, 1200, 1, 'the warm-up row is the 20:00 lap');
  workRows(r.computed).forEach((row, i) => { near(row.executed.duration_s, 60, 1, `work ${i + 1} seconds`); assert(row.executed.in_range_s >= 58, `work ${i + 1} in range`); });
});

Deno.test('D · a row written before the open warm-up (no lap_button) snaps the same way — a ride warm-up lap of any length is its step', async () => {
  const segs = rideWith(1200, 10, 600);
  const bounds = [0, 1200]; for (let k = 0; k < 20; k += 1) bounds.push(1200 + (k + 1) * 60); bounds.push(totalSec(segs));
  const r = await compute('ride-D-long-warmup-lap', workout('ride', segs, lapsAt(bounds)), oneToOneL1());
  assertEquals(r.computed.alignment_mode, 'snap-to-laps');
  near(r.computed.intervals[0].executed.duration_s, 1200, 1, 'the warm-up row is the 20:00 lap');
});

// ── E ───────────────────────────────────────────────────────────────────────────────────────────────────────────
Deno.test('E · 21 laps, work laps 56 s against 60-s steps (outside the ±2 s) → laps-in-order on a ride', async () => {
  const segs: Seg[] = [WU(750)];
  const bounds = [0, 750]; let t = 750;
  for (let k = 1; k <= 10; k += 1) {
    segs.push({ sec: 56, mps: 11, w: 290, hr: 165 }, { sec: 64, mps: 7, w: 125, hr: 140 });
    t += 56; bounds.push(t); t += 64; bounds.push(t);
  }
  segs.push(HOME(600));
  const r = await compute('ride-E-in-order', workout('ride', segs, lapsAt(bounds)), oneToOneL1());
  assertEquals(r.computed.alignment_mode, 'laps-in-order');
  assertEquals(r.computed.intervals.length, 21);
  const work = workRows(r.computed);
  assertEquals(work.length, 10);
  work.forEach((row, i) => { assertEquals(row.lap_number, 2 * (i + 1), `work ${i + 1} lap`); near(row.executed.duration_s, 56, 1, `work ${i + 1} seconds`); });
});

// ── F ───────────────────────────────────────────────────────────────────────────────────────────────────────────
Deno.test('F · no laps, 6 of the 10 efforts done → the finder lays 6; work rows 7–10 (and their recoveries) not done', async () => {
  const r = await compute('ride-F-six-of-ten', workout('ride', rideWith(1200, 6, 900), []), oneToOneL1());
  assertEquals(r.computed.alignment_mode, 'aligned-on-efforts');
  assertEquals(r.computed.intervals.length, 21);
  const work = workRows(r.computed);
  for (let i = 0; i < 6; i += 1) { near(work[i].sample_idx_start, effortStart(1200, i + 1), 2, `work ${i + 1} start`); assertEquals(work[i].not_done, undefined); }
  for (let i = 6; i < 10; i += 1) assertEquals(work[i].not_done, true, `work ${i + 1} not done`);
  assertEquals(r.computed.steps_not_done, 8);
});

// ── G ───────────────────────────────────────────────────────────────────────────────────────────────────────────
Deno.test('G · no laps, a steady 60-min ride under the floor against the structured plan → nothing found → today\'s walk, no mismatch', async () => {
  const r = await compute('ride-G-steady', workout('ride', [{ sec: 3600, mps: 9, w: 200, hr: 135 }], []), oneToOneL1());
  assertEquals(r.computed.alignment_mode, 'aligned');
  assertEquals(r.computed.mismatch_reason, null);
  assertEquals(r.computed.intervals.length, 21);
});

Deno.test('G · a steady 60-min ride ABOVE the floor → one 60-min stretch is no 1:00 effort → today\'s walk', async () => {
  const r = await compute('ride-G-steady-hard', workout('ride', [{ sec: 3600, mps: 10, w: 262, hr: 160 }], []), oneToOneL1());
  assertEquals(r.computed.alignment_mode, 'aligned');
  assertEquals(r.computed.mismatch_reason, null);
});

Deno.test('G · a ride 2.5× the plan with no laps and no efforts → the mismatch detector as today', async () => {
  const r = await compute('ride-G-mismatch', workout('ride', [{ sec: 5400, mps: 9, w: 200, hr: 135 }], []), oneToOneL1());
  assertEquals(r.computed.alignment_mode, 'overall-only');
  assert(String(r.computed.mismatch_reason).startsWith('duration_ratio_'));
});

// ── rides on the unchanged paths (snapshotted) ──────────────────────────────────────────────────────────────────
Deno.test('ride · no plan, laps → laps-no-plan', async () => {
  const segs = rideWith(750, 3, 300);
  const r = await compute('ride-noplan-laps', workout('ride', segs, lapsAt([0, 750, 810, 870, 930, 990, 1050, 1110, totalSec(segs)])), null);
  assertEquals(r.mode, 'laps-no-plan');
});
Deno.test('ride · no plan, no laps → splits-no-plan', async () => {
  const r = await compute('ride-noplan-splits', workout('ride', rideWith(750, 3, 300), []), null);
  assertEquals(r.mode, 'splits-no-plan');
});
Deno.test('ride · steady plan (one work step), no laps → the walk', async () => {
  const r = await compute('ride-steady-plan', workout('ride', [{ sec: 3600, mps: 9, w: 170, hr: 135 }], []), steadyRidePlan);
  assertEquals(r.computed.alignment_mode, 'aligned');
});
Deno.test('ride · steady plan, laps with no plan match (auto laps every 5 km) → the walk', async () => {
  const segs: Seg[] = [{ sec: 3600, mps: 9, w: 170, hr: 135 }];
  const r = await compute('ride-steady-autolaps', workout('ride', segs, lapsAt([0, 556, 1111, 1667, 2222, 2778, 3333, 3600])), steadyRidePlan);
  assertEquals(r.computed.alignment_mode, 'aligned');
});

// ── runs: every rung, byte-identical before and after (H) ───────────────────────────────────────────────────────
const RUN_WU: Seg = { sec: 600, mps: 2.7, hr: 135 };
const RUN_REP = (sec = 240): Seg => ({ sec, mps: 3.3, hr: 165 });
const RUN_JOG = (sec = 60): Seg => ({ sec, mps: 2.4, hr: 150 });
const RUN_CD: Seg = { sec: 480, mps: 2.6, hr: 140 };
function sixByFourSegs(rep = 240, jog = 60): Seg[] {
  const segs: Seg[] = [RUN_WU];
  for (let k = 1; k <= 6; k += 1) { segs.push(RUN_REP(rep)); if (k < 6) segs.push(RUN_JOG(jog)); }
  segs.push(RUN_CD);
  return segs;
}
const boundsOf = (segs: Seg[]) => { const b = [0]; let t = 0; for (const s of segs) { t += s.sec; b.push(t); } return b; };

Deno.test('run · 14 laps on the steps → laps-matched', async () => {
  const segs = sixByFourSegs();
  const r = await compute('run-laps-matched', workout('run', segs, lapsAt(boundsOf(segs))), sixByFourRun());
  assertEquals(r.computed.alignment_mode, 'laps-matched');
  assertEquals(r.computed.intervals.length, 13);
});
Deno.test('run · 12 laps (last jog joined the cool-down), reps fit → laps-paired', async () => {
  const segs = sixByFourSegs();
  const b = boundsOf(segs); const laps = lapsAt([...b.slice(0, 12), b[14]]); // 11 laps + one joined tail
  const r = await compute('run-laps-paired', workout('run', segs, laps), sixByFourRun());
  assertEquals(r.computed.alignment_mode, 'laps-paired');
});
Deno.test('run · 14 laps, reps 200 s against 240-s steps → laps-in-order', async () => {
  const segs = sixByFourSegs(200, 100);
  const r = await compute('run-laps-in-order', workout('run', segs, lapsAt(boundsOf(segs))), sixByFourRun());
  assertEquals(r.computed.alignment_mode, 'laps-in-order');
});
Deno.test('run · 5 laps that fit nothing → laps-unmatched', async () => {
  const segs = sixByFourSegs();
  const r = await compute('run-laps-unmatched', workout('run', segs, lapsAt([0, 500, 1300, 1700, 2100, totalSec(segs)])), sixByFourRun());
  assertEquals(r.computed.alignment_mode, 'laps-unmatched');
});
Deno.test('run · structured plan, no laps → no-laps-whole-run', async () => {
  const r = await compute('run-no-laps', workout('run', sixByFourSegs(), []), sixByFourRun());
  assertEquals(r.computed.alignment_mode, 'no-laps-whole-run');
});
Deno.test('run · structured plan, one lap → no-laps-whole-run (a run never anchors)', async () => {
  const segs = sixByFourSegs();
  const r = await compute('run-one-lap', workout('run', segs, lapsAt([600, totalSec(segs)])), sixByFourRun());
  assertEquals(r.computed.alignment_mode, 'no-laps-whole-run');
});
Deno.test('run · steady plan, no laps → the walk', async () => {
  const r = await compute('run-steady-walk', workout('run', [{ sec: 300, mps: 2.6, hr: 130 }, { sec: 1800, mps: 2.9, hr: 150 }, { sec: 300, mps: 2.5, hr: 135 }], []), steadyRunPlan);
  assertEquals(r.computed.alignment_mode, 'aligned');
});
Deno.test('run · no plan, laps → laps-no-plan', async () => {
  const segs = sixByFourSegs();
  const r = await compute('run-noplan-laps', workout('run', segs, lapsAt(boundsOf(segs))), null);
  assertEquals(r.mode, 'laps-no-plan');
});
Deno.test('run · no plan, no laps → splits-no-plan', async () => {
  const r = await compute('run-noplan-splits', workout('run', sixByFourSegs(), []), null);
  assertEquals(r.mode, 'splits-no-plan');
});
Deno.test('walk · 14 laps on the steps → laps-matched (the walk sport takes the run path)', async () => {
  const segs = sixByFourSegs().map((s) => ({ ...s, mps: s.mps / 2 }));
  const plan = sixByFourRun(); plan.id = 'p-6x4-walk';
  for (const st of plan.computed.steps as any[]) if (st.pace_range) st.pace_range = { lower: st.pace_range.lower * 2, upper: st.pace_range.upper * 2 };
  const r = await compute('walk-laps-matched', workout('walk', segs, lapsAt(boundsOf(segs))), plan);
  assertEquals(r.computed.alignment_mode, 'laps-matched');
});

// ── runs: the laps walked onto the steps in order (2026-09-25, Michael's 5 × 6:00) ──────────────────────────────
/**
 * The p233-234 level 2 near-threshold run as materialize-plan saves it: the p233 box's 10-minute easy jog and its two
 * drills (lap-button steps: no clock, the athlete ends them with the press), 5 × 6:00 @ 88% with 1:00 @ VT1 between
 * (four rests: between rounds only), the box's 8-minute easy jog. Thirteen steps.
 */
function fiveBySixRun(opts: { drills?: boolean } = { drills: true }) {
  const steps: Record<string, unknown>[] = [
    { id: 'w0', kind: 'warmup', duration_s: 600, label: '10-minute easy jog', page_label: true, watch_target: 'none' },
  ];
  if (opts.drills !== false) {
    steps.push({ id: 'w1', kind: 'warmup', label: '3 sets of 20m walking lunges', page_label: true, watch_target: 'none', lap_button: true });
    steps.push({ id: 'w2', kind: 'warmup', label: '2 sets of 10 (per side) Cossack squats', page_label: true, watch_target: 'none', lap_button: true });
  }
  for (let k = 1; k <= 5; k += 1) {
    steps.push({ id: `wk${k}`, kind: 'work', seconds: 360, distanceMeters: 887, distanceDerived: true, pace_range: { lower: 588, upper: 718 } });
    if (k < 5) steps.push({ id: `rk${k}`, kind: 'recovery', seconds: 60, pace_range: { lower: 700, upper: 840 } });
  }
  steps.push({ id: 'c0', kind: 'cooldown', duration_s: 480, label: '8-minute easy jog', page_label: true, watch_target: 'none' });
  return { id: opts.drills === false ? 'p-5x6-no-drills' : 'p-5x6', intervals: null, tags: ['family:run_near_threshold'], computed: { normalization_version: 'v3', steps, total_duration_seconds: 2280 } };
}
const mps = (paceSecPerMi: number) => 1609.34 / paceSecPerMi;
/** Michael's 2026-09-25 laps: 10:00 · 0:14 · 0:23 · 6:00 · 0:57 · 6:00 · 0:24 · 6:00 · 0:50 · 5:56 · 1:00 · 5:29 · 7:07. */
const OWNER_SEGS: Seg[] = [
  { sec: 600, mps: mps(750), hr: 135 }, { sec: 14, mps: 1.0, hr: 130 }, { sec: 23, mps: 1.0, hr: 128 },
  { sec: 360, mps: mps(661), hr: 160 }, { sec: 57, mps: mps(810), hr: 150 },
  { sec: 360, mps: mps(613), hr: 165 }, { sec: 24, mps: mps(810), hr: 152 },
  { sec: 360, mps: mps(639), hr: 166 }, { sec: 50, mps: mps(810), hr: 153 },
  { sec: 356, mps: mps(636), hr: 167 }, { sec: 60, mps: mps(810), hr: 154 },
  { sec: 329, mps: mps(625), hr: 168 }, { sec: 427, mps: mps(760), hr: 145 },
];
const labels = (c: any) => (c.intervals as any[]).map((r) => r.planned_label);

Deno.test('run · 13 laps on 13 steps, two reps off the tolerance (5:56, 5:29) → laps-in-order, every row named, nothing not done', async () => {
  const r = await compute('run-5x6-in-order', workout('run', OWNER_SEGS, lapsAt(boundsOf(OWNER_SEGS))), fiveBySixRun());
  assertEquals(r.computed.alignment_mode, 'laps-in-order');
  assertEquals(r.computed.intervals.length, 13);
  assertEquals(r.computed.steps_not_done, 0);
  assertEquals(labels(r.computed), [
    '10:00', '3 sets of 20m walking lunges', '2 sets of 10 (per side) Cossack squats',
    '6:00', '1:00', '6:00', '1:00', '6:00', '1:00', '6:00', '1:00', '6:00', '8:00',
  ]);
  const work = workRows(r.computed);
  assertEquals(work.length, 5);
  assertEquals(work.map((w) => w.executed.duration_s), [360, 360, 360, 356, 329]);
  assertEquals(work.map((w) => w.executed.avg_pace_s_per_mi), [661, 613, 639, 636, 625]);
  work.forEach((w, i) => assert(w.executed.in_range_s >= w.executed.duration_s - 1, `rep ${i + 1}: ${w.executed.in_range_s} s of ${w.executed.duration_s} in range`));
  assertEquals((r.computed.intervals as any[]).filter((x) => x.role === 'recovery').map((x) => x.executed.duration_s), [57, 24, 50, 60]);
  assertEquals(r.computed.intervals[12].role, 'cooldown');
  assertEquals((r.computed.intervals as any[]).map((x) => x.lap_number), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
});

Deno.test('run · the same laps against the plan without the drill steps → the 0:14 and 0:23 are strays ("Lap 2", "Lap 3"), the 0:24 is still the rest', async () => {
  const r = await compute('run-5x6-strays', workout('run', OWNER_SEGS, lapsAt(boundsOf(OWNER_SEGS))), fiveBySixRun({ drills: false }));
  assertEquals(r.computed.alignment_mode, 'laps-in-order');
  assertEquals(r.computed.intervals.length, 13);
  assertEquals(r.computed.steps_not_done, 0);
  assertEquals(labels(r.computed), ['10:00', 'Lap 2', 'Lap 3', '6:00', '1:00', '6:00', '1:00', '6:00', '1:00', '6:00', '1:00', '6:00', '8:00']);
  assertEquals(workRows(r.computed).map((w) => w.executed.duration_s), [360, 360, 360, 356, 329]);
});

Deno.test('run · stopped after rep 3 of 5, reps 4 s off the tolerance → laps-in-order lays out 3, the rest not done', async () => {
  const segs: Seg[] = [
    { sec: 600, mps: mps(750), hr: 135 }, { sec: 14, mps: 1.0, hr: 130 }, { sec: 23, mps: 1.0, hr: 128 },
    { sec: 356, mps: mps(661), hr: 160 }, { sec: 60, mps: mps(810), hr: 150 },
    { sec: 356, mps: mps(613), hr: 165 }, { sec: 60, mps: mps(810), hr: 152 },
    { sec: 356, mps: mps(639), hr: 166 },
  ];
  const r = await compute('run-5x6-cut-short', workout('run', segs, lapsAt(boundsOf(segs))), fiveBySixRun());
  assertEquals(r.computed.alignment_mode, 'laps-in-order');
  assertEquals(r.computed.intervals.length, 13);
  assertEquals(r.computed.steps_not_done, 5);
  assertEquals(labels(r.computed), [
    '10:00', '3 sets of 20m walking lunges', '2 sets of 10 (per side) Cossack squats',
    '6:00', '1:00', '6:00', '1:00', '6:00', '1:00', '6:00', '1:00', '6:00', '8:00',
  ]);
  assertEquals((r.computed.intervals as any[]).filter((x) => x.not_done).map((x) => x.planned_step_id), ['rk3', 'wk4', 'rk4', 'wk5', 'c0']);
  // The recording ends with the third rep, so its last lap has no sample after it: 355 of 356 (the file's window convention).
  assertEquals(workRows(r.computed).filter((w) => !w.not_done).map((w) => w.executed.duration_s), [356, 356, 355]);
});

Deno.test('run · the drills done inside the warm-up (no press for them) → the two lap-button steps are skipped, the reps still land', async () => {
  const segs: Seg[] = [
    { sec: 600, mps: mps(750), hr: 135 },
    { sec: 356, mps: mps(661), hr: 160 }, { sec: 60, mps: mps(810), hr: 150 },
    { sec: 356, mps: mps(613), hr: 165 }, { sec: 24, mps: mps(810), hr: 152 },
    { sec: 356, mps: mps(639), hr: 166 }, { sec: 50, mps: mps(810), hr: 153 },
    { sec: 356, mps: mps(636), hr: 167 }, { sec: 60, mps: mps(810), hr: 154 },
    { sec: 329, mps: mps(625), hr: 168 }, { sec: 427, mps: mps(760), hr: 145 },
  ];
  const r = await compute('run-5x6-no-drill-press', workout('run', segs, lapsAt(boundsOf(segs))), fiveBySixRun());
  assertEquals(r.computed.alignment_mode, 'laps-in-order');
  assertEquals(r.computed.intervals.length, 13);
  assertEquals((r.computed.intervals as any[]).filter((x) => x.not_done).map((x) => x.planned_step_id), ['w1', 'w2']);
  assertEquals(workRows(r.computed).map((w) => w.executed.duration_s), [356, 356, 356, 356, 329]);
});


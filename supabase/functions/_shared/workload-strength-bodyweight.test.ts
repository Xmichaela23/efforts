/**
 * D1 — BODYWEIGHT COUNTS AS LOAD, AND RE-PRICING HISTORY IS PART OF THE CHANGE (2026-08-01).
 *
 * Run: deno test --no-check supabase/functions/_shared/workload-strength-bodyweight.test.ts
 *
 * Two things are pinned here, and the second one is the reason this file exists.
 *
 *   1. The SET RULE — what a chin-up, a band pull-apart and a barbell set are each worth.
 *   2. THE FALSE-SPIKE GUARD — that re-pricing a whole history leaves the load ratio and the
 *      verdict where they were, and that re-pricing only recent days does NOT. The load verdict is
 *      a ratio of the last 7 days against the last 28, computed from STORED per-workout scores. Make
 *      calisthenics count without re-pricing the 28-day window and the ratio climbs on a week the
 *      athlete trained identically to the three before it — the fix manufacturing the exact false
 *      alarm it was written to remove.
 *
 * ⚠️ The hazard test is a PERMANENT REGRESSION FIXTURE, not a demonstration. If someone later drops
 * the backfill from this change, `deploying the pricing WITHOUT re-pricing history spikes the ratio`
 * still passes — it is the honest record of why the pass exists. What must never start failing is
 * `a normal week reads the same before and after`.
 */
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  calculateStrengthWorkload,
  calculatePlannedStrengthWorkload,
  strengthSetVolume,
  resolveBodyweightLb,
  BAND_SET_VOLUME_TOKEN,
} from './workload.ts';
import { computeAcwr } from './acwr.ts';
import { computeTotalLoadStatus } from './athlete-snapshot/body-response.ts';

const BW = 175; // the fixture athlete's body weight in lb — never Michael's, never tuned to anyone

// ---------------------------------------------------------------------------
// 1. THE SET RULE
// ---------------------------------------------------------------------------

Deno.test('a barbell set is priced exactly as it always was', () => {
  // ⛔ THE CONTINUITY PROOF. Most sets in the app are loaded, and this change must not move one of
  // them by a single point, or every existing load number in every athlete's history shifts.
  assertEquals(strengthSetVolume({ weight: 185, reps: 5 }, { bodyweightLb: BW }), 925);
  assertEquals(strengthSetVolume({ weight: 185, reps: 5 }, { bodyweightLb: null }), 925);
});

Deno.test('a chin-up is worth the body it moved, not zero', () => {
  assertEquals(strengthSetVolume({ weight: 0, reps: 8 }, { bodyweightLb: BW }), 1400);
});

Deno.test('no recorded body weight → scored exactly as today, never a guessed weight', () => {
  // The decision (2026-08-01): an athlete who never filled in their weight keeps current behaviour.
  // Inventing a body weight to make a number move is the one thing this must not do.
  assertEquals(strengthSetVolume({ weight: 0, reps: 8 }, { bodyweightLb: null }), 0);
  assertEquals(strengthSetVolume({ weight: 0, reps: 8 }, {}), 0);
});

Deno.test('a band set gets the flat token, and the token can never rival real work', () => {
  const band = strengthSetVolume({ weight: 0, reps: 15, resistance_level: 'Medium' }, { bodyweightLb: BW });
  assertEquals(band, BAND_SET_VOLUME_TOKEN);
  // The magnitude IS the design: ten band sets must stay smaller than one honest set of chin-ups.
  assertEquals(band * 10 < strengthSetVolume({ weight: 0, reps: 8 }, { bodyweightLb: BW }), true);
});

Deno.test('a band on a chin-up is HELP — the body still moved, so it is not priced as band work', () => {
  // ⚠️ `resistance_level` is deliberately overloaded (the logger stores assistance on it), so the
  // exercise decides. Assistance is not modelled: the set counts as full bodyweight, which
  // over-counts by an unknown fraction and under-counts by nothing.
  const assisted = strengthSetVolume(
    { weight: 0, reps: 8, resistance_level: 'Medium' },
    { bodyweightLb: BW, bandIsAssistance: true },
  );
  assertEquals(assisted, BW * 8);
});

Deno.test('a plank still scores zero, and that is known and left', () => {
  // Duration with no reps — there is nothing for a per-rep rule to multiply. Scoring isometric time
  // needs its own basis; flagged in the audit doc rather than fudged inside this one.
  assertEquals(strengthSetVolume({ weight: 0, reps: 0, duration_seconds: 60 } as any, { bodyweightLb: BW }), 0);
});

Deno.test('body weight is read in the athlete\'s own units, and refused when implausible', () => {
  assertEquals(resolveBodyweightLb({ weight: 175, units: 'imperial' }), 175);
  assertEquals(resolveBodyweightLb({ weight: 80, units: 'metric' }), 176.4); // kg → lb
  assertEquals(resolveBodyweightLb({ weight: 0, units: 'imperial' }), null);
  assertEquals(resolveBodyweightLb({ weight: 20, units: 'imperial' }), null);  // not a person
  assertEquals(resolveBodyweightLb(null), null);
});

// ---------------------------------------------------------------------------
// 2. PLANNED AND ACTUAL STILL RECONCILE
// ---------------------------------------------------------------------------

Deno.test('prescribed == performed, WITH bodyweight work → planned still equals actual', () => {
  // ⛔ THE INVARIANT THIS CHANGE COULD MOST EASILY HAVE BROKEN. If completed chin-ups start counting
  // and prescribed ones do not, every strength session on every screen reads as heavier than planned.
  const prescription = [
    { name: 'Back Squat', sets: 3, reps: 5, weight: 185, target_rir: 3 },
    { name: 'Chin Up', sets: 3, reps: 8, weight: 0, target_rir: 3 },
  ];
  const mkSets = (n: number, reps: number, weight: number, rir: number) =>
    Array.from({ length: n }, () => ({ reps, weight, rir, completed: true }));
  const performed = [
    { name: 'Back Squat', sets: mkSets(3, 5, 185, 3) },
    { name: 'Chin Up', sets: mkSets(3, 8, 0, 3) },
  ];
  assertEquals(
    calculatePlannedStrengthWorkload(prescription, { bodyweightLb: BW }),
    calculateStrengthWorkload(performed, undefined, { bodyweightLb: BW }),
  );
});

Deno.test('a prescribed BAND row is priced as a band on both sides, not as bodyweight', () => {
  // The two sides speak different dialects about a band — a prescription puts the word where the
  // number goes. Without the translation the planned row reads as full bodyweight against a token.
  const planned = calculatePlannedStrengthWorkload(
    [{ name: 'Band Face Pull', sets: 3, reps: 15, weight: 'Band', target_rir: 3 }],
    { bodyweightLb: BW },
  );
  const performed = calculateStrengthWorkload(
    [{ name: 'Band Face Pull', sets: Array.from({ length: 3 }, () => ({ reps: 15, weight: 0, resistance_level: 'Medium', rir: 3, completed: true })) }],
    undefined,
    { bodyweightLb: BW },
  );
  assertEquals(planned, performed);
});

// ---------------------------------------------------------------------------
// 3. THE FALSE-SPIKE GUARD — the point of the whole stage
// ---------------------------------------------------------------------------

/** One ordinary strength day: three loaded lifts, three calisthenic ones, one band accessory. */
const STRENGTH_DAY = [
  { name: 'Back Squat', sets: Array.from({ length: 3 }, () => ({ reps: 5, weight: 185, completed: true })) },
  { name: 'Romanian Deadlift', sets: Array.from({ length: 3 }, () => ({ reps: 8, weight: 135, completed: true })) },
  { name: 'Chin Up', sets: Array.from({ length: 3 }, () => ({ reps: 8, weight: 0, completed: true })) },
  { name: 'Box Jump', sets: Array.from({ length: 3 }, () => ({ reps: 5, weight: 0, completed: true })) },
  { name: 'Hip Thrust', sets: Array.from({ length: 3 }, () => ({ reps: 10, weight: 0, completed: true })) },
  { name: 'Band Face Pull', sets: Array.from({ length: 3 }, () => ({ reps: 15, weight: 0, resistance_level: 'Medium', completed: true })) },
];

const EASY_RUN_LOAD = 61; // a 47-minute easy run, the figure the audit measured against

const ASOF = '2026-08-01';
function dayBefore(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * FOUR IDENTICAL WEEKS: three strength days, three easy runs, one rest — every week the same.
 * `strengthPricedNewFrom` is how many days back the NEW pricing has been applied: 28 = the whole
 * window (what the backfill does), 7 = only this week (what shipping without it does).
 */
function buildHistory(strengthPricedNewFrom: number) {
  const rows: Array<{ date: string; workload: number; type: string; name: string }> = [];
  for (let back = 0; back < 28; back++) {
    const date = dayBefore(ASOF, back);
    const dow = back % 7;
    const priceNew = back < strengthPricedNewFrom;
    if (dow === 0 || dow === 2 || dow === 4) {
      rows.push({
        date,
        workload: calculateStrengthWorkload(STRENGTH_DAY, undefined, { bodyweightLb: priceNew ? BW : null }),
        type: 'strength',
        name: 'Lower A',
      });
    } else if (dow === 1 || dow === 3 || dow === 5) {
      rows.push({ date, workload: EASY_RUN_LOAD, type: 'run', name: 'Easy Run' });
    }
  }
  return rows;
}

Deno.test('the new pricing is a real change — a strength day roughly triples', () => {
  const before = calculateStrengthWorkload(STRENGTH_DAY, undefined, { bodyweightLb: null });
  const after = calculateStrengthWorkload(STRENGTH_DAY, undefined, { bodyweightLb: BW });
  // Sanity that the fixture exercises the thing being tested at all: half this session was invisible.
  assertEquals(after > before * 2.5, true, `expected a large move, got ${before} → ${after}`);
  // And it lands in the same order of magnitude as an easy run, which was the whole complaint:
  // a full strength day scoring 34 against a 47-minute jog's 61, on a strength block.
  assertEquals(after > EASY_RUN_LOAD, true, `strength day ${after} should now out-rank an easy run`);
});

Deno.test('A NORMAL WEEK READS THE SAME BEFORE AND AFTER — no false spike', () => {
  // ⛔ THE ONE THAT MATTERS. Four identical weeks, priced entirely the old way, then entirely the
  // new way (i.e. after the backfill). The athlete did the same thing throughout, so the ratio must
  // not move and the verdict must not change. Everything else in this stage is in service of this.
  const oldWay = computeAcwr(buildHistory(0), { asOfDate: ASOF });
  const newWay = computeAcwr(buildHistory(28), { asOfDate: ASOF });

  assertEquals(oldWay.thinBase, false);
  assertEquals(newWay.thinBase, false);

  // Same shape of week → same ratio, within rounding.
  assertEquals(Math.abs((newWay.ratio ?? 0) - (oldWay.ratio ?? 0)) <= 0.02, true,
    `ratio moved: ${oldWay.ratio} → ${newWay.ratio}`);

  // And the verdict the athlete actually reads is unchanged, in a build phase and out of one.
  for (const phase of ['build', 'unknown'] as const) {
    const before = computeTotalLoadStatus(oldWay.ratio, null, phase);
    const after = computeTotalLoadStatus(newWay.ratio, null, phase);
    assertEquals(after.status, before.status, `verdict moved in ${phase}: ${before.status} → ${after.status}`);
    assertEquals(after.status, 'on_target');
  }
});

Deno.test('deploying the pricing WITHOUT re-pricing history spikes the ratio — why the backfill ships with it', () => {
  // ⚠️ PERMANENT REGRESSION FIXTURE. This test PASSING is not a problem — it documents the hazard.
  // The same four identical weeks, but only the last 7 days carry the new price: the numerator is
  // re-priced and the denominator is not.
  const unbackfilled = computeAcwr(buildHistory(7), { asOfDate: ASOF });
  const backfilled = computeAcwr(buildHistory(28), { asOfDate: ASOF });

  assertEquals((unbackfilled.ratio ?? 0) > (backfilled.ratio ?? 0) + 0.25, true,
    `expected a spike, got ${backfilled.ratio} → ${unbackfilled.ratio}`);

  // And it reaches the athlete as a worse verdict on an identical week — the false alarm itself.
  const spiked = computeTotalLoadStatus(unbackfilled.ratio, null, 'unknown');
  const honest = computeTotalLoadStatus(backfilled.ratio, null, 'unknown');
  assertEquals(honest.status, 'on_target');
  assertEquals(spiked.status !== 'on_target', true, `expected a degraded verdict, got ${spiked.status}`);
});

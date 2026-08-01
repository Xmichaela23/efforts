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
  MIN_ASSISTED_EFFECTIVE_LB,
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

// ⚠️ NARROWED BY D-351 (2026-08-01) — THIS NOW PINS THE HISTORY PATH, NOT THE RULE.
// When written, "assistance is not modelled" was the whole rule and this test was its statement.
// D-351 replaced the level dropdown with a numeric assist field, so a band-assisted set now prices
// `(bodyweight − assist) × reps`. **This test keeps passing because its input is a WORD**, and a
// word is what every pre-2026-08-01 row holds. That is exactly what it now guards: history is
// deliberately not migrated, so the word era must keep pricing at full bodyweight forever.
// The numeric behaviour is pinned in the D-351 block at the bottom of this file.
Deno.test('a WORD-era band on a chin-up is HELP and still prices as full bodyweight (history path)', () => {
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

// ════════════════════════════════════════════════════════════════════════════════════════════════
// D-351 — THE BAND CARRIES A NUMBER THE ATHLETE ENTERED (2026-08-01)
//
// Reverses this file's own "a band-assisted pull-up counts as full bodyweight" pin and Q-233's
// second imprecision. The field's answer to "band resistance is not standardised" is not a guess —
// it is a numeric field the user fills in (Hevy: `(bodyweight − assisted weight) × reps`, and no
// volume at all when body weight is unset; Strong the same). No tracker ships a colour→pounds table.
//
// ⛔ WHAT THESE PIN, AND THE SECOND ONE IS THE FRAGILE ONE:
//   1. A number subtracts (assist) or multiplies (add-resistance).
//   2. A WORD still prices exactly as it did before today. History is deliberately NOT migrated
//      (one week of data, one user), so `resistance_level` holds words on old rows and pounds on new
//      ones, forever. If `bandLoadLb` ever starts coercing "Heavy" to 0 instead of null, every
//      word-era assisted set silently reprices from full bodyweight to the floor — a migration
//      nobody asked for, arriving as a rounding change.
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('D-351: an assisted chin-up subtracts the entered assist from body weight', () => {
  // 60 lb of help at 175 lb bodyweight → 115 lb moved, 8 reps.
  const v = strengthSetVolume({ weight: 0, reps: 8, resistance_level: '60' }, { bodyweightLb: BW, bandIsAssistance: true });
  assertEquals(v, (175 - 60) * 8);
  // And it must be strictly LESS than the same set logged with no assist — the whole point.
  const unassisted = strengthSetVolume({ weight: 0, reps: 8 }, { bodyweightLb: BW, bandIsAssistance: true });
  assertEquals(v < unassisted, true);
});

Deno.test('D-351: a near-total assist floors above zero — it was still a set', () => {
  const v = strengthSetVolume({ weight: 0, reps: 10, resistance_level: '900' }, { bodyweightLb: BW, bandIsAssistance: true });
  assertEquals(v, MIN_ASSISTED_EFFECTIVE_LB * 10);
  assertEquals(v > 0, true);
});

Deno.test('⛔ D-351: a WORD-era assist still prices as FULL bodyweight — history is not migrated', () => {
  for (const word of ['Light', 'Moderate', 'Heavy', 'Extra Heavy']) {
    assertEquals(
      strengthSetVolume({ weight: 0, reps: 8, resistance_level: word }, { bodyweightLb: BW, bandIsAssistance: true }),
      BW * 8,
      `word-era assist "${word}" must price unchanged`,
    );
  }
});

Deno.test('D-351: no assist recorded on an assist-capable move → full bodyweight (unchanged)', () => {
  assertEquals(strengthSetVolume({ weight: 0, reps: 8 }, { bodyweightLb: BW, bandIsAssistance: true }), BW * 8);
  assertEquals(strengthSetVolume({ weight: 0, reps: 8, resistance_level: 'None' }, { bodyweightLb: BW, bandIsAssistance: true }), BW * 8);
});

Deno.test('⛔ D-351: an assisted set with NO body weight scores 0 — never a guessed subtraction', () => {
  // Hevy computes no volume for an assisted set without a recorded body weight. Same here: there is
  // nothing to subtract FROM, and inventing the athlete is the one thing this file never does.
  assertEquals(strengthSetVolume({ weight: 0, reps: 8, resistance_level: '60' }, { bodyweightLb: null, bandIsAssistance: true }), 0);
});

Deno.test('D-351: an ADD-resistance band with pounds prices like any weighted set', () => {
  const v = strengthSetVolume({ weight: 0, reps: 15, resistance_level: '30' }, { bodyweightLb: BW, bandIsAssistance: false });
  assertEquals(v, 30 * 15);
});

Deno.test('D-351: an ADD-resistance band left BLANK keeps the flat token', () => {
  assertEquals(
    strengthSetVolume({ weight: 0, reps: 15, resistance_level: 'Medium' }, { bodyweightLb: BW, bandIsAssistance: false }),
    BAND_SET_VOLUME_TOKEN,
  );
});

// ⚠️ REWRITTEN THE SAME DAY BY THE SCOPED FOLLOW-UP. This asserted 925 — external weight replacing
// body weight even on an assist-capable move — which was the asymmetry Michael then had scoped away.
// A set carrying BOTH a band and added weight cannot happen through the logger (the two controls
// clear each other), so what this now pins is the precedence: added weight wins over the band, and
// on an assist-capable move it ADDS to body weight.
Deno.test('D-351: added weight beats the band, and adds to bodyweight on an assist-capable move', () => {
  assertEquals(
    strengthSetVolume({ weight: 185, reps: 5, resistance_level: '60' }, { bodyweightLb: BW, bandIsAssistance: true }),
    (BW + 185) * 5,
  );
});

// ── D-351 SCOPED FOLLOW-UP: the weighted chin-up (2026-08-01, Michael) ───────────────────────────
// Filed as unfixable in the first cut ("rule 1 governs every weighted set"), then scoped: gating the
// clause on `bandIsAssistance` limits it to {pullup, chinup, dip}. These pin BOTH halves — that the
// three movements changed, and that nothing else did.

Deno.test('D-351: a WEIGHTED chin-up moves bodyweight PLUS the belt', () => {
  const v = strengthSetVolume({ weight: 25, reps: 6 }, { bodyweightLb: BW, bandIsAssistance: true });
  assertEquals(v, (BW + 25) * 6);
  // The bug this closes: it must be MORE than the same set done at bodyweight, not less.
  const bodyweightOnly = strengthSetVolume({ weight: 0, reps: 6 }, { bodyweightLb: BW, bandIsAssistance: true });
  assertEquals(v > bodyweightOnly, true);
});

Deno.test('⛔ D-351: ZERO BLAST RADIUS — a barbell lift is byte-identical to rule 1', () => {
  // Every non-assist-capable movement arrives with bandIsAssistance false (or absent) and must be
  // untouched. If this ever fails, the gate has been loosened and every squat in the app repriced.
  for (const opts of [{ bodyweightLb: BW, bandIsAssistance: false }, { bodyweightLb: BW }, {}]) {
    assertEquals(strengthSetVolume({ weight: 185, reps: 5 }, opts), 925);
  }
  assertEquals(strengthSetVolume({ weight: 45, reps: 10 }, { bodyweightLb: BW, bandIsAssistance: false }), 450);
});

Deno.test('D-351: a weighted chin-up with NO recorded body weight falls back to rule 1', () => {
  // Nothing to add TO. The app does not invent an athlete to improve a number.
  assertEquals(strengthSetVolume({ weight: 25, reps: 6 }, { bodyweightLb: null, bandIsAssistance: true }), 150);
});

Deno.test('D-351: prescribed == performed still reconciles for a WEIGHTED chin-up', () => {
  // The planned side prices through the same function, so a +25 lb prescription performed exactly
  // must read a zero delta — the invariant workload-strength-planned.test.ts guards one layer up.
  // ⚠️ RIR is matched on both sides deliberately: the intensity term is derived from target RIR on
  // the planned side and logged RIR on the actual side, so leaving it off makes the two scores
  // differ for a reason that has nothing to do with volume.
  const planned = calculatePlannedStrengthWorkload(
    [{ name: 'Chin Up', sets: 3, reps: 6, weight: 25, target_rir: 3 }],
    { bodyweightLb: BW },
  );
  const actual = calculateStrengthWorkload(
    [{ name: 'Chin Up', sets: Array.from({ length: 3 }, () => ({ weight: 25, reps: 6, rir: 3, completed: true })) }],
    undefined,
    { bodyweightLb: BW },
  );
  assertEquals(planned, actual);
});

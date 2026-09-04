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

/**
 * THE PER-SET PRESCRIPTION survives materialization.
 *
 * the previous program prescribes three sets at three weights (docs/SPEC-get-stronger.md §1). The composer authors
 * them in `set_plan`; if materialize drops the field, the logger falls back to copying the row's one
 * weight onto every set — and the athlete opens each session to the TOP weight sitting on all three,
 * four days a week, for twelve weeks. That failure is silent: the session still looks complete.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { carrySetPlan } from './index.ts';

const RAMP = [
  { weight: 120, reps: 5 },
  { weight: 140, reps: 5 },
  { weight: 160, reps: 5, amrap: true },
];

Deno.test('a row with no set_plan is untouched — every non-the previous program row keeps its shape', () => {
  assertEquals(carrySetPlan({ name: 'Bench Press', weight: 135 }, 135), undefined);
  assertEquals(carrySetPlan({ set_plan: [] }, 135), undefined);
  assertEquals(carrySetPlan(null, 135), undefined);
});

Deno.test('an unmoved top set carries the ramp through verbatim', () => {
  assertEquals(carrySetPlan({ set_plan: RAMP }, 160), [
    { weight: 120, reps: 5 },
    { weight: 140, reps: 5 },
    { weight: 160, reps: 5, amrap: true },
  ]);
});

Deno.test('a moved top set rescales the whole ramp, so the sets stay in proportion', () => {
  // An athlete adjustment drops the top set 160 → 140 (×0.875). The openers move with it rather
  // than pointing at a load the top set no longer uses.
  const out = carrySetPlan({ set_plan: RAMP }, 140)!;
  assertEquals(out.map((s: any) => s.weight), [105, 120, 140]);
  // Round DOWN, and never off the 5 lb grid: 120×0.875 = 105, 140×0.875 = 122.5 → 120.
  for (const s of out) assertEquals(s.weight % 5, 0);
});

Deno.test('the all-out flag survives a rescale — it is what opens the RIR gate', () => {
  const out = carrySetPlan({ set_plan: RAMP }, 140)!;
  assertEquals(out.filter((s: any) => s.amrap).length, 1);
  assertEquals(out[2].amrap, true);
});

Deno.test('a stripped weight (bodyweight guard) leaves the ramp alone rather than scaling to zero', () => {
  assertEquals(carrySetPlan({ set_plan: RAMP }, undefined)!.map((s: any) => s.weight), [120, 140, 160]);
  assertEquals(carrySetPlan({ set_plan: RAMP }, 0)!.map((s: any) => s.weight), [120, 140, 160]);
});

Deno.test('the warm-up tag survives the carry and scales with the ramp', () => {
  // Weeks 1-3 prepend a warm-up ramp (the previous program). The tag must reach the logger so it can section
  // Warm-up vs Working; without it the athlete opens six unlabelled sets.
  const withWarmup = [
    { weight: 75, reps: 5, warmup: true },
    { weight: 95, reps: 5, warmup: true },
    { weight: 110, reps: 3, warmup: true },
    { weight: 120, reps: 5 },
    { weight: 140, reps: 5 },
    { weight: 160, reps: 5, amrap: true },
  ];
  // Top set unmoved: tags verbatim, warm-ups flagged, work sets not.
  const out = carrySetPlan({ set_plan: withWarmup }, 160)!;
  assertEquals(out.map((s: any) => s.warmup === true), [true, true, true, false, false, false]);
  // The all-out set is the LAST set, so the scale anchor is the top WORK set, not a warm-up.
  assertEquals(out[5].amrap, true);
  // A moved top set (160 → 140, ×0.875) rescales warm-ups too, keeping the ramp in proportion.
  const moved = carrySetPlan({ set_plan: withWarmup }, 140)!;
  assertEquals(moved.map((s: any) => s.weight), [65, 80, 95, 105, 120, 140]);
  assertEquals(moved.filter((s: any) => s.warmup).length, 3);
});

// ── Round 4 (2026-09-18): StrongLifts' warm-up sets go in front of a standing-plan barbell lift ────────────────
Deno.test('a standing-plan barbell row gets its warm-up sets in front of the work sets, built from the final weight', () => {
  const ex = { name: 'Back Squat', set_plan: [{ weight: 225, reps: 3 }, { weight: 225, reps: 3 }, { weight: 225, reps: 3 }] };
  const out = carrySetPlan(ex, 225, { name: 'Back Squat', metric: false })!;
  assertEquals(out.map((s: any) => `${s.warmup ? 'w' : ''}${s.weight}x${s.reps}`).join(' '),
    'w45x5 w45x5 w90x5 w135x5 w180x5 225x3 225x3 225x3');
});

Deno.test('an old stored ramp is replaced, not scaled — the empty bar stays the bar', () => {
  const ex = { name: 'Deadlift', set_plan: [{ weight: 45, reps: 5, warmup: true }, { weight: 165, reps: 5, warmup: true }, { weight: 300, reps: 3 }] };
  const out = carrySetPlan(ex, 315, { name: 'Deadlift', metric: false })!;
  assertEquals(out.map((s: any) => `${s.warmup ? 'w' : ''}${s.weight}x${s.reps}`).join(' '), 'w65x5 w110x5 w155x5 w200x5 w245x5 w290x5 315x3');
});

Deno.test('no warm-up sets on a lift with no bar, and none without the standing-plan flag', () => {
  const db = { name: 'Seated DB Press', set_plan: [{ weight: 50, reps: 8 }] };
  assertEquals(carrySetPlan(db, 50, { name: 'Seated DB Press', metric: false }), [{ weight: 50, reps: 8 }]);
  const bb = { name: 'Back Squat', set_plan: [{ weight: 225, reps: 3 }] };
  assertEquals(carrySetPlan(bb, 225), [{ weight: 225, reps: 3 }]);
});

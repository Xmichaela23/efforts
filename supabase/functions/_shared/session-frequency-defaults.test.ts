/**
 * Unit tests for `computeSessionFrequencyDefaults`. Covers the (hours_tier × days_per_week)
 * matrix (added 2026-05-11), tier boundaries, §4 limiter shifts, §5 swim_intent floor, and
 * §7 strength_intent variants. Brick caps remain tier-only here; phase-aware brick
 * reconciliation lands in Theme A commit 3.
 *
 * Run from repo root:
 *   deno test --no-lock --allow-all supabase/functions/_shared/session-frequency-defaults.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  brickCapForPhaseWeek,
  computeSessionFrequencyDefaults,
  type FrequencyPhase,
  type SessionFrequencyInputs,
} from '../../../src/lib/session-frequency-defaults.ts';

function compute(inputs: SessionFrequencyInputs) {
  return computeSessionFrequencyDefaults(inputs);
}

// ── §2 (hours_tier × days_per_week) matrix — empirical 2026-05-11 ─────────────
//
// Reference:
//                  5 days        6 days         7 days
//   5-7 hr        2/2/2/1/0     2/2/3/1/0      2/2/3/1/0
//   8-10 hr       2/2/3/1/1     2/2/3/1/1      2/3/3/1/1
//   10-12 hr      2/3/3/1/1     3/3/3/1/1      3/3/3/1/1
//   12-14 hr      3/3/3/1/1     3/3/3/1/1      3/3/3/1/1
//   14+ hr        gate-block    3/3/4/1/2      3/3/4/1/2

interface CellExpect { swims: number; bikes: number; runs: number }
const CELLS: Array<[number, 5 | 6 | 7, CellExpect]> = [
  // 5-7 hr tier
  [6, 5, { swims: 2, bikes: 2, runs: 2 }],
  [6, 6, { swims: 2, bikes: 2, runs: 3 }],
  [6, 7, { swims: 2, bikes: 2, runs: 3 }],
  // 8-10 hr tier
  [9, 5, { swims: 2, bikes: 2, runs: 3 }],
  [9, 6, { swims: 2, bikes: 2, runs: 3 }],
  [9, 7, { swims: 2, bikes: 3, runs: 3 }],
  // 10-12 hr tier
  [11, 5, { swims: 2, bikes: 3, runs: 3 }],
  [11, 6, { swims: 3, bikes: 3, runs: 3 }],
  [11, 7, { swims: 3, bikes: 3, runs: 3 }],
  // 12-14 hr tier
  [13, 5, { swims: 3, bikes: 3, runs: 3 }],
  [13, 6, { swims: 3, bikes: 3, runs: 3 }],
  [13, 7, { swims: 3, bikes: 3, runs: 3 }],
  // 14+ hr tier (5d is gate-block but still returns 6d fallback values)
  [16, 5, { swims: 3, bikes: 3, runs: 4 }],
  [16, 6, { swims: 3, bikes: 3, runs: 4 }],
  [16, 7, { swims: 3, bikes: 3, runs: 4 }],
];

for (const [hours, days, expect] of CELLS) {
  Deno.test(`§2 matrix cell (${hours}hr × ${days}d) → ${expect.swims}/${expect.bikes}/${expect.runs}`, () => {
    const out = compute({ weekly_hours_available: hours, days_per_week: days });
    assertEquals(out.swims_per_week, expect.swims, `swims at ${hours}hr×${days}d`);
    assertEquals(out.bikes_per_week, expect.bikes, `bikes at ${hours}hr×${days}d`);
    assertEquals(out.runs_per_week, expect.runs, `runs at ${hours}hr×${days}d`);
  });
}

// ── Tier-label boundary checks (preserve from pre-matrix tests) ───────────────

Deno.test('tier boundary at 8: 7.99hr is 5-7, 8.0hr is 8-10', () => {
  assertEquals(compute({ weekly_hours_available: 7.99, days_per_week: 6 }).tier_label, '5-7');
  assertEquals(compute({ weekly_hours_available: 8.0, days_per_week: 6 }).tier_label, '8-10');
});

Deno.test('tier boundary at 12: 11.99hr is 10-12, 12.0hr is 12-14', () => {
  assertEquals(compute({ weekly_hours_available: 11.99, days_per_week: 6 }).tier_label, '10-12');
  assertEquals(compute({ weekly_hours_available: 12.0, days_per_week: 6 }).tier_label, '12-14');
});

Deno.test('tier 14+ unbounded: 50hr still maps to 14+ tier', () => {
  const out = compute({ weekly_hours_available: 50, days_per_week: 7 });
  assertEquals(out.tier_label, '14+');
});

// ── Gate-block: 14+ hr × 5 days has no reference-plan support ─────────────────

Deno.test('§2 gate-block: 14+ hr × 5 days → gate_block flag set, fallback to 6d values', () => {
  const out = compute({ weekly_hours_available: 14, days_per_week: 5 });
  assertEquals(out.gate_block, 'hours_too_high_for_days');
  // Fallback values match the 6d cell (3/3/4) so plan generation can continue.
  assertEquals(out.swims_per_week, 3);
  assertEquals(out.bikes_per_week, 3);
  assertEquals(out.runs_per_week, 4);
  assert(
    out.notes.some((n) => /gate-block/i.test(n) && /≥6 training days/.test(n)),
    `expected §2 gate-block note citing ≥6 training days; got ${JSON.stringify(out.notes)}`,
  );
});

Deno.test('§2 gate-block: 12-13.99 hr × 5 days does NOT gate-block (only 14+)', () => {
  const out = compute({ weekly_hours_available: 13, days_per_week: 5 });
  assertEquals(out.gate_block, undefined);
  assert(!out.notes.some((n) => /gate-block/i.test(n)));
});

// ── Days clamping: <5 days clamps to 5; ≥7 days clamps to 7 ───────────────────

Deno.test('days clamp: 4 days clamps to 5d cell (no 4-day reference plan)', () => {
  const out = compute({ weekly_hours_available: 8, days_per_week: 4 });
  // Should pull the 5d cell for 8-10hr: 2/2/3
  assertEquals(out.swims_per_week, 2);
  assertEquals(out.bikes_per_week, 2);
  assertEquals(out.runs_per_week, 3);
  assert(out.notes.some((n) => /days-clamp/i.test(n)));
});

Deno.test('days_per_week default: omitting → uses 6d cell', () => {
  const out = compute({ weekly_hours_available: 11 });
  // 10-12 × 6d = 3/3/3
  assertEquals(out.swims_per_week, 3);
  assertEquals(out.bikes_per_week, 3);
  assertEquals(out.runs_per_week, 3);
});

// ── §5 swim_intent='focus' floor ──────────────────────────────────────────────

Deno.test('§5 swim_intent=focus at 7hr × 6d → swims raised to 3 (floor regardless of tier)', () => {
  const out = compute({ weekly_hours_available: 7, days_per_week: 6, swim_intent: 'focus' });
  assertEquals(out.swims_per_week, 3);
  assert(out.notes.some((n) => n.startsWith('§5:')), `expected §5 note; got ${JSON.stringify(out.notes)}`);
});

Deno.test('§5 swim_intent=focus at 12hr × 6d → already at 3, no change', () => {
  const out = compute({ weekly_hours_available: 12, days_per_week: 6, swim_intent: 'focus' });
  assertEquals(out.swims_per_week, 3);
});

Deno.test('§5 swim_intent=race uses matrix baseline (5-7 × 6d = 2 swims)', () => {
  const out = compute({ weekly_hours_available: 7, days_per_week: 6, swim_intent: 'race' });
  assertEquals(out.swims_per_week, 2);
});

// ── §4 limiter shifts ─────────────────────────────────────────────────────────

Deno.test('§4 swim limiter at 8-10hr × 6d (2/2/3) → swims +1 to 3, bikes unchanged at 2', () => {
  const out = compute({ weekly_hours_available: 9, days_per_week: 6, limiter_sport: 'swim' });
  assertEquals(out.swims_per_week, 3);
  assertEquals(out.bikes_per_week, 2);
});

Deno.test('§4 swim limiter at 10-12hr × 5d (2/3/3) → swims +1 to 3, bikes 3→2 (drop easy)', () => {
  const out = compute({ weekly_hours_available: 11, days_per_week: 5, limiter_sport: 'swim' });
  assertEquals(out.swims_per_week, 3);
  assertEquals(out.bikes_per_week, 2, 'easy bike dropped to keep total session budget');
});

Deno.test('§4 swim limiter at 14+ × 6d (already 3 swims) → no change', () => {
  const out = compute({ weekly_hours_available: 14, days_per_week: 6, limiter_sport: 'swim' });
  assertEquals(out.swims_per_week, 3);
  assertEquals(out.bikes_per_week, 3);
  assert(out.notes.some((n) => n.includes('already at 3')));
});

Deno.test('§4 bike limiter at 8-10hr × 6d (2 bikes) → bikes +1 to 3, swims unchanged at 2', () => {
  const out = compute({ weekly_hours_available: 9, days_per_week: 6, limiter_sport: 'bike' });
  assertEquals(out.bikes_per_week, 3);
  assertEquals(out.swims_per_week, 2);
});

Deno.test('§4 bike limiter at 12-14hr × 6d (3 bikes, 3 swims) → no change', () => {
  const out = compute({ weekly_hours_available: 13, days_per_week: 6, limiter_sport: 'bike' });
  assertEquals(out.bikes_per_week, 3);
  assertEquals(out.swims_per_week, 3);
});

Deno.test('§4 run limiter at any hours/days → no frequency change (handled via intensity)', () => {
  const out7 = compute({ weekly_hours_available: 7, days_per_week: 5, limiter_sport: 'run' });
  assertEquals(out7.runs_per_week, 2, 'run limiter does NOT bump runs (5-7 × 5d = 2 runs)');

  const out12 = compute({ weekly_hours_available: 12, days_per_week: 6, limiter_sport: 'run' });
  assertEquals(out12.runs_per_week, 3);

  const out14 = compute({ weekly_hours_available: 14, days_per_week: 6, limiter_sport: 'run' });
  assertEquals(out14.runs_per_week, 4, '14+ × 6d already at 4 runs from matrix');
});

// ── §7 strength_intent (hours-driven, days-agnostic) ──────────────────────────

Deno.test('§7 strength_intent=performance at <10hr → 1× full-body', () => {
  const out = compute({ weekly_hours_available: 8, days_per_week: 6, strength_intent: 'performance' });
  assertEquals(out.strength_per_week, 1);
});

Deno.test('§7 strength_intent=performance at ≥10hr → 2× (upper + lower)', () => {
  const out = compute({ weekly_hours_available: 10, days_per_week: 6, strength_intent: 'performance' });
  assertEquals(out.strength_per_week, 2);
});

Deno.test('§7 strength_intent=support → 1× regardless of hours / days', () => {
  for (const [h, d] of [[7, 5], [12, 6], [16, 7]] as Array<[number, 5 | 6 | 7]>) {
    assertEquals(
      compute({ weekly_hours_available: h, days_per_week: d, strength_intent: 'support' }).strength_per_week,
      1,
      `support intent at ${h}hr × ${d}d`,
    );
  }
});

Deno.test('§7 strength_intent=none → 0× regardless of hours / days', () => {
  for (const [h, d] of [[7, 5], [16, 7]] as Array<[number, 5 | 6 | 7]>) {
    assertEquals(
      compute({ weekly_hours_available: h, days_per_week: d, strength_intent: 'none' }).strength_per_week,
      0,
    );
  }
});

Deno.test('§7 strength_intent unset → tier baseline (0 at 5-7, 1 at 8-13.99, 2 at 14+)', () => {
  assertEquals(compute({ weekly_hours_available: 6, days_per_week: 6 }).strength_per_week, 0);
  assertEquals(compute({ weekly_hours_available: 9, days_per_week: 6 }).strength_per_week, 1);
  assertEquals(compute({ weekly_hours_available: 13, days_per_week: 6 }).strength_per_week, 1);
  assertEquals(compute({ weekly_hours_available: 14, days_per_week: 6 }).strength_per_week, 2);
});

// ── source / notes / output-shape ─────────────────────────────────────────────

Deno.test('source defaults to "derived"', () => {
  const out = compute({ weekly_hours_available: 10, days_per_week: 6 });
  assertEquals(out.source, 'derived');
});

Deno.test('notes always include the tier-from-hours line (now annotated with days)', () => {
  const out = compute({ weekly_hours_available: 11.5, days_per_week: 6 });
  assert(out.notes.some((n) => n.includes('tier=10-12') && n.includes('11.5hr/week') && n.includes('days=6')));
});

Deno.test('hours_per_week echoes input', () => {
  const out = compute({ weekly_hours_available: 9.5, days_per_week: 6 });
  assertEquals(out.hours_per_week, 9.5);
});

Deno.test('days_per_week echoed in output', () => {
  const out = compute({ weekly_hours_available: 10, days_per_week: 7 });
  assertEquals(out.days_per_week, 7);
});

// ── sport parameter (forward-compat) ──────────────────────────────────────────

Deno.test('sport defaults to triathlon when omitted', () => {
  const out = compute({ weekly_hours_available: 10, days_per_week: 6 });
  assert(out.notes.some((n) => n.includes('sport=triathlon')));
});

Deno.test('sport=triathlon explicit is identical to omitted', () => {
  const omitted = compute({ weekly_hours_available: 11, days_per_week: 6 });
  const explicit = compute({ weekly_hours_available: 11, days_per_week: 6, sport: 'triathlon' });
  assertEquals(omitted.swims_per_week, explicit.swims_per_week);
  assertEquals(omitted.bikes_per_week, explicit.bikes_per_week);
  assertEquals(omitted.runs_per_week, explicit.runs_per_week);
});

Deno.test('sport=running throws — matrix not yet populated (forward-compat stub)', () => {
  let caught: Error | undefined;
  try {
    compute({ weekly_hours_available: 10, days_per_week: 6, sport: 'running' });
  } catch (err) {
    caught = err as Error;
  }
  assert(caught, 'expected throw for unsupported sport');
  assert(
    /running/.test(String(caught?.message)) && /not yet populated/.test(String(caught?.message)),
    `expected error to name the unsupported sport + roadmap note; got: ${caught?.message}`,
  );
});

Deno.test('sport=cycling throws (forward-compat stub)', () => {
  let caught: Error | undefined;
  try {
    compute({ weekly_hours_available: 10, days_per_week: 6, sport: 'cycling' });
  } catch (err) {
    caught = err as Error;
  }
  assert(caught, 'expected throw for sport=cycling');
});

Deno.test('sport=hybrid throws (forward-compat stub for no-event athletes)', () => {
  let caught: Error | undefined;
  try {
    compute({ weekly_hours_available: 10, days_per_week: 6, sport: 'hybrid' });
  } catch (err) {
    caught = err as Error;
  }
  assert(caught, 'expected throw for sport=hybrid');
});

// ── docs/BRICK-PROTOCOL.md — phase × hours-tier cap matrix ────────────────────

Deno.test('bricks 5-7 tier: base=0, build=1, race=1 (commit 3 cell decisions)', () => {
  const out = compute({ weekly_hours_available: 6, days_per_week: 6 });
  assertEquals(out.bricks_per_week_by_phase.base, 0);
  assertEquals(out.bricks_per_week_by_phase.build, 1, 'build now 1 (was 0 pre-commit-3)');
  assertEquals(out.bricks_per_week_by_phase.race_specific, 1, 'race now 1 (was 0 pre-commit-3)');
  assertEquals(out.bricks_per_week_by_phase.taper, 0);
  assertEquals(out.bricks_per_week_by_phase.recovery, 0);
  assertEquals(out.bricks_per_week_by_phase.rebuild, 0);
});

Deno.test('bricks 8-10 tier: base=0, build=1, race=1', () => {
  const out = compute({ weekly_hours_available: 9, days_per_week: 6 });
  assertEquals(out.bricks_per_week_by_phase.base, 0);
  assertEquals(out.bricks_per_week_by_phase.build, 1);
  assertEquals(out.bricks_per_week_by_phase.race_specific, 1, 'race now 1 (was 0 pre-commit-3)');
});

Deno.test('bricks 10-12 tier: base=0, build=1, race=1', () => {
  const out = compute({ weekly_hours_available: 11, days_per_week: 6 });
  assertEquals(out.bricks_per_week_by_phase.base, 0);
  assertEquals(out.bricks_per_week_by_phase.build, 1);
  assertEquals(out.bricks_per_week_by_phase.race_specific, 1, 'race now 1 (was 0 pre-commit-3)');
});

Deno.test('bricks 12-14 tier: base=0, build=1, race=2 (tier-aware split)', () => {
  const out = compute({ weekly_hours_available: 13, days_per_week: 6 });
  assertEquals(out.bricks_per_week_by_phase.base, 0);
  assertEquals(out.bricks_per_week_by_phase.build, 1);
  assertEquals(out.bricks_per_week_by_phase.race_specific, 2, 'race now 2 at 12+ hr (was 1)');
});

Deno.test('bricks 14+ tier: base=0, build=1 (FIX — was 0), race=2', () => {
  const out = compute({ weekly_hours_available: 16, days_per_week: 6 });
  assertEquals(out.bricks_per_week_by_phase.base, 0);
  assertEquals(out.bricks_per_week_by_phase.build, 1, 'build now 1 (was 0 anomaly pre-commit-3)');
  assertEquals(out.bricks_per_week_by_phase.race_specific, 2);
});

Deno.test('bricks: recovery, taper(matrix), rebuild are 0 (Taper-W1 lives in helper)', () => {
  for (const hours of [6, 9, 11, 13, 16]) {
    const out = compute({ weekly_hours_available: hours, days_per_week: 6 });
    assertEquals(out.bricks_per_week_by_phase.recovery, 0, `recovery hours=${hours}`);
    assertEquals(out.bricks_per_week_by_phase.taper, 0, `taper matrix value (W2+) hours=${hours}`);
    assertEquals(out.bricks_per_week_by_phase.rebuild, 0, `rebuild hours=${hours}`);
  }
});

// ── brickCapForPhaseWeek — Taper-W1 race-rehearsal + recovery/rebuild guards ──

function defaultsFor(hours: number) {
  return compute({ weekly_hours_available: hours, days_per_week: 6 });
}

Deno.test('brickCapForPhaseWeek: taper W1 = 1 race-rehearsal regardless of tier', () => {
  for (const hours of [6, 9, 11, 13, 16]) {
    const cap = brickCapForPhaseWeek(defaultsFor(hours), 'taper', 1);
    assertEquals(cap, 1, `taper W1 hours=${hours}`);
  }
});

Deno.test('brickCapForPhaseWeek: taper W2 = 0 (volume reduction)', () => {
  for (const hours of [6, 9, 11, 13, 16]) {
    const cap = brickCapForPhaseWeek(defaultsFor(hours), 'taper', 2);
    assertEquals(cap, 0, `taper W2 hours=${hours}`);
  }
});

Deno.test('brickCapForPhaseWeek: taper W3+ = 0', () => {
  assertEquals(brickCapForPhaseWeek(defaultsFor(11), 'taper', 3), 0);
  assertEquals(brickCapForPhaseWeek(defaultsFor(11), 'taper', 10), 0);
});

Deno.test('brickCapForPhaseWeek: rebuild always 0 regardless of matrix', () => {
  for (const wip of [1, 2, 3]) {
    assertEquals(brickCapForPhaseWeek(defaultsFor(14), 'rebuild', wip), 0, `rebuild W${wip}`);
  }
});

Deno.test('brickCapForPhaseWeek: recovery always 0 regardless of matrix', () => {
  for (const wip of [1, 2]) {
    assertEquals(brickCapForPhaseWeek(defaultsFor(13), 'recovery', wip), 0, `recovery W${wip}`);
  }
});

Deno.test('brickCapForPhaseWeek: base / build / race_specific delegate to matrix', () => {
  const d11 = defaultsFor(11); // 10-12 tier: build=1, race=1
  assertEquals(brickCapForPhaseWeek(d11, 'base', 1), 0);
  assertEquals(brickCapForPhaseWeek(d11, 'base', 5), 0);
  assertEquals(brickCapForPhaseWeek(d11, 'build', 1), 1);
  assertEquals(brickCapForPhaseWeek(d11, 'build', 4), 1);
  assertEquals(brickCapForPhaseWeek(d11, 'race_specific', 1), 1);
  assertEquals(brickCapForPhaseWeek(d11, 'race_specific', 2), 1);

  const d14 = defaultsFor(14); // 14+ tier: build=1, race=2
  assertEquals(brickCapForPhaseWeek(d14, 'build', 1), 1);
  assertEquals(brickCapForPhaseWeek(d14, 'race_specific', 1), 2);
});

Deno.test('brickCapForPhaseWeek: weekInPhase is 1-indexed (W1 = first active week)', () => {
  const d = defaultsFor(10);
  // W1 is the special case for taper; verify it's the FIRST week, not week 0
  assertEquals(brickCapForPhaseWeek(d, 'taper', 1), 1, 'W1 = first taper week, gets rehearsal');
  assertEquals(brickCapForPhaseWeek(d, 'taper', 0), 0, 'W0 (impossible / legacy) defaults to W2+ behavior');
});

// ── BRICK-PROTOCOL.md §2 invariants — every tier × phase cell ─────────────────

Deno.test('brick matrix invariant: every tier emits ≥1 brick at race-specific (no 0-brick race phase)', () => {
  for (const hours of [6, 9, 11, 13, 16]) {
    const cap = brickCapForPhaseWeek(defaultsFor(hours), 'race_specific', 1);
    assert(cap >= 1, `race-specific cap should be ≥1 at hours=${hours}; got ${cap}`);
  }
});

Deno.test('brick matrix invariant: every tier emits 1 brick at build (no 0-brick build phase)', () => {
  for (const hours of [6, 9, 11, 13, 16]) {
    const cap = brickCapForPhaseWeek(defaultsFor(hours), 'build', 1);
    assertEquals(cap, 1, `build cap should be exactly 1 at hours=${hours}`);
  }
});

Deno.test('brick matrix invariant: base phase always 0 (per protocol)', () => {
  for (const hours of [6, 9, 11, 13, 16]) {
    const cap = brickCapForPhaseWeek(defaultsFor(hours), 'base', 1);
    assertEquals(cap, 0, `base cap should be 0 at hours=${hours}`);
  }
});

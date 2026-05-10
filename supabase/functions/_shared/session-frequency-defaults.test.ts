/**
 * Unit tests for `computeSessionFrequencyDefaults`. Covers tier boundaries (especially the
 * exact-12-hour pivot from acceptance criteria), §4 limiter shifts, §5 swim_intent floor,
 * and §7 strength_intent variants.
 *
 * Run from repo root:
 *   deno test --no-lock --allow-all supabase/functions/_shared/session-frequency-defaults.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  computeSessionFrequencyDefaults,
  type SessionFrequencyInputs,
} from './session-frequency-defaults.ts';

function compute(inputs: SessionFrequencyInputs) {
  return computeSessionFrequencyDefaults(inputs);
}

// ── §2 base table: tier boundaries ────────────────────────────────────────────

Deno.test('tier 5-7: 5hr → 2/2/2/0', () => {
  const out = compute({ weekly_hours_available: 5 });
  assertEquals(out.tier_label, '5-7');
  assertEquals(out.swims_per_week, 2);
  assertEquals(out.bikes_per_week, 2);
  assertEquals(out.runs_per_week, 2);
  assertEquals(out.strength_per_week, 0);
});

Deno.test('tier 5-7: 7hr → 2/2/2 (6 S/B/R sessions)', () => {
  const out = compute({ weekly_hours_available: 7 });
  assertEquals(out.tier_label, '5-7');
  assertEquals(
    out.swims_per_week + out.bikes_per_week + out.runs_per_week,
    6,
    'acceptance: 7hr → 6 S/B/R sessions',
  );
});

Deno.test('tier boundary at 8: 7.99hr is 5-7, 8.0hr is 8-10', () => {
  assertEquals(compute({ weekly_hours_available: 7.99 }).tier_label, '5-7');
  assertEquals(compute({ weekly_hours_available: 8.0 }).tier_label, '8-10');
});

Deno.test('tier 8-10: 8hr → 2/2/3', () => {
  const out = compute({ weekly_hours_available: 8 });
  assertEquals(out.tier_label, '8-10');
  assertEquals(out.swims_per_week, 2);
  assertEquals(out.bikes_per_week, 2);
  assertEquals(out.runs_per_week, 3);
});

Deno.test('tier 10-12: 10hr → 2/3/3 (third bike added)', () => {
  const out = compute({ weekly_hours_available: 10 });
  assertEquals(out.tier_label, '10-12');
  assertEquals(out.swims_per_week, 2);
  assertEquals(out.bikes_per_week, 3);
  assertEquals(out.runs_per_week, 3);
});

Deno.test('tier boundary at 12: 11.99hr is 10-12, 12.0hr is 12-14', () => {
  assertEquals(compute({ weekly_hours_available: 11.99 }).tier_label, '10-12');
  assertEquals(compute({ weekly_hours_available: 12.0 }).tier_label, '12-14');
});

Deno.test('tier 12-14: 12hr → 3/3/3 (9 S/B/R sessions, acceptance criterion)', () => {
  const out = compute({ weekly_hours_available: 12 });
  assertEquals(out.tier_label, '12-14');
  assertEquals(out.swims_per_week, 3);
  assertEquals(out.bikes_per_week, 3);
  assertEquals(out.runs_per_week, 3);
  assertEquals(
    out.swims_per_week + out.bikes_per_week + out.runs_per_week,
    9,
    'acceptance: 12hr → 9 S/B/R sessions',
  );
});

Deno.test('tier 14+: 14hr → 3/3/3 + 2 strength baseline', () => {
  const out = compute({ weekly_hours_available: 14 });
  assertEquals(out.tier_label, '14+');
  assertEquals(out.strength_per_week, 2);
});

Deno.test('tier 14+ unbounded: 50hr stays 3/3/3 + 2', () => {
  const out = compute({ weekly_hours_available: 50 });
  assertEquals(out.tier_label, '14+');
  assertEquals(out.swims_per_week, 3);
  assertEquals(out.bikes_per_week, 3);
  assertEquals(out.runs_per_week, 3);
});

// ── §5 swim_intent='focus' floor ──────────────────────────────────────────────

Deno.test('§5 swim_intent=focus at 7hr → swims raised to 3 (floor regardless of tier)', () => {
  const out = compute({ weekly_hours_available: 7, swim_intent: 'focus' });
  assertEquals(out.swims_per_week, 3);
  assert(out.notes.some((n) => n.startsWith('§5:')), `expected §5 note; got ${JSON.stringify(out.notes)}`);
});

Deno.test('§5 swim_intent=focus at 12hr → already at 3, no change', () => {
  const out = compute({ weekly_hours_available: 12, swim_intent: 'focus' });
  assertEquals(out.swims_per_week, 3);
});

Deno.test('§5 swim_intent=race uses base table', () => {
  const out = compute({ weekly_hours_available: 7, swim_intent: 'race' });
  assertEquals(out.swims_per_week, 2);
});

// ── §4 limiter shifts ─────────────────────────────────────────────────────────

Deno.test('§4 swim limiter at 8-10hr (2 swims, 2 bikes) → swims +1 to 3, bikes unchanged', () => {
  const out = compute({ weekly_hours_available: 9, limiter_sport: 'swim' });
  assertEquals(out.swims_per_week, 3);
  assertEquals(out.bikes_per_week, 2);
});

Deno.test('§4 swim limiter at 10-12hr (2 swims, 3 bikes) → swims +1 to 3, bikes 3→2 (drop easy)', () => {
  const out = compute({ weekly_hours_available: 11, limiter_sport: 'swim' });
  assertEquals(out.swims_per_week, 3);
  assertEquals(out.bikes_per_week, 2, 'easy bike dropped to keep total session budget');
});

Deno.test('§4 swim limiter at 14+ (already 3 swims) → no change', () => {
  const out = compute({ weekly_hours_available: 14, limiter_sport: 'swim' });
  assertEquals(out.swims_per_week, 3);
  assertEquals(out.bikes_per_week, 3);
  assert(out.notes.some((n) => n.includes('already at 3')));
});

Deno.test('§4 bike limiter at 8-10hr (2 bikes, 2 swims) → bikes +1 to 3, swims unchanged', () => {
  const out = compute({ weekly_hours_available: 9, limiter_sport: 'bike' });
  assertEquals(out.bikes_per_week, 3);
  assertEquals(out.swims_per_week, 2);
});

Deno.test('§4 bike limiter at 12-14hr (3 bikes, 3 swims) → no change (bikes already at 3)', () => {
  const out = compute({ weekly_hours_available: 13, limiter_sport: 'bike' });
  assertEquals(out.bikes_per_week, 3);
  assertEquals(out.swims_per_week, 3);
});

Deno.test('§4 run limiter at any hours → no frequency change (handled via intensity)', () => {
  const out7 = compute({ weekly_hours_available: 7, limiter_sport: 'run' });
  assertEquals(out7.runs_per_week, 2, 'run limiter does NOT add a 4th run below 14hr');

  const out12 = compute({ weekly_hours_available: 12, limiter_sport: 'run' });
  assertEquals(out12.runs_per_week, 3);

  const out14 = compute({ weekly_hours_available: 14, limiter_sport: 'run' });
  assertEquals(out14.runs_per_week, 3, 'phase A: 4th-run case at 14+ with history not implemented');
});

// ── §7 strength_intent ────────────────────────────────────────────────────────

Deno.test('§7 strength_intent=performance at <10hr → 1× full-body', () => {
  const out = compute({ weekly_hours_available: 8, strength_intent: 'performance' });
  assertEquals(out.strength_per_week, 1);
});

Deno.test('§7 strength_intent=performance at ≥10hr → 2× (upper + lower)', () => {
  const out = compute({ weekly_hours_available: 10, strength_intent: 'performance' });
  assertEquals(out.strength_per_week, 2);
});

Deno.test('§7 strength_intent=support → 1× regardless of hours', () => {
  assertEquals(compute({ weekly_hours_available: 7, strength_intent: 'support' }).strength_per_week, 1);
  assertEquals(compute({ weekly_hours_available: 12, strength_intent: 'support' }).strength_per_week, 1);
  assertEquals(compute({ weekly_hours_available: 16, strength_intent: 'support' }).strength_per_week, 1);
});

Deno.test('§7 strength_intent=none → 0× regardless of hours', () => {
  assertEquals(compute({ weekly_hours_available: 7, strength_intent: 'none' }).strength_per_week, 0);
  assertEquals(compute({ weekly_hours_available: 16, strength_intent: 'none' }).strength_per_week, 0);
});

Deno.test('§7 strength_intent unset → tier baseline (0 at 5-7, 1 at 8-13.99, 2 at 14+)', () => {
  assertEquals(compute({ weekly_hours_available: 6 }).strength_per_week, 0);
  assertEquals(compute({ weekly_hours_available: 9 }).strength_per_week, 1);
  assertEquals(compute({ weekly_hours_available: 13 }).strength_per_week, 1);
  assertEquals(compute({ weekly_hours_available: 14 }).strength_per_week, 2);
});

// ── source / notes shape ──────────────────────────────────────────────────────

Deno.test('source defaults to "derived"', () => {
  const out = compute({ weekly_hours_available: 10 });
  assertEquals(out.source, 'derived');
});

Deno.test('notes always include the tier-from-hours line', () => {
  const out = compute({ weekly_hours_available: 11.5 });
  assert(out.notes.some((n) => n.includes('tier=10-12') && n.includes('11.5hr/week')));
});

Deno.test('hours_per_week echoes input', () => {
  const out = compute({ weekly_hours_available: 9.5 });
  assertEquals(out.hours_per_week, 9.5);
});

// ── bricks_per_week_by_phase (Phase A.5 — §9 default-shape tables) ────────────

Deno.test('bricks 5-7 tier: 0 in all phases', () => {
  const out = compute({ weekly_hours_available: 6 });
  assertEquals(out.bricks_per_week_by_phase, {
    base: 0, build: 0, race_specific: 0, taper: 0, recovery: 0,
  });
});

Deno.test('bricks 8-10 tier: 1 in build only', () => {
  const out = compute({ weekly_hours_available: 9 });
  assertEquals(out.bricks_per_week_by_phase.build, 1);
  assertEquals(out.bricks_per_week_by_phase.race_specific, 0);
  assertEquals(out.bricks_per_week_by_phase.base, 0);
  assertEquals(out.bricks_per_week_by_phase.taper, 0);
});

Deno.test('bricks 10-12 tier: 1 in build only', () => {
  const out = compute({ weekly_hours_available: 11 });
  assertEquals(out.bricks_per_week_by_phase.build, 1);
  assertEquals(out.bricks_per_week_by_phase.race_specific, 0);
});

Deno.test('bricks 12-14 tier: 1 build + 1 race_specific', () => {
  const out = compute({ weekly_hours_available: 13 });
  assertEquals(out.bricks_per_week_by_phase.build, 1);
  assertEquals(out.bricks_per_week_by_phase.race_specific, 1);
  assertEquals(out.bricks_per_week_by_phase.base, 0);
  assertEquals(out.bricks_per_week_by_phase.taper, 0);
});

Deno.test('bricks 14+ tier: 2 in race_specific only (build = 0)', () => {
  const out = compute({ weekly_hours_available: 16 });
  assertEquals(out.bricks_per_week_by_phase.race_specific, 2);
  assertEquals(out.bricks_per_week_by_phase.build, 0);
  assertEquals(out.bricks_per_week_by_phase.base, 0);
});

Deno.test('bricks: recovery and taper are always 0 (handled by builder regardless)', () => {
  for (const hours of [6, 9, 11, 13, 16]) {
    const out = compute({ weekly_hours_available: hours });
    assertEquals(out.bricks_per_week_by_phase.recovery, 0, `hours=${hours}`);
    assertEquals(out.bricks_per_week_by_phase.taper, 0, `hours=${hours}`);
  }
});

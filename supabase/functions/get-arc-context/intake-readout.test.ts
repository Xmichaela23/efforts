/**
 * The intake readout — each field against the rule the build uses.
 *
 * Run: ~/.deno/bin/deno test --no-check --no-lock supabase/functions/get-arc-context/intake-readout.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildIntakeReadout } from './intake-readout.ts';
import { computeSessionFrequencyDefaults } from '../../../src/lib/session-frequency-defaults.ts';

const AS_OF = '2026-09-10';
const arc = (over: Record<string, unknown> = {}) => ({
  learned_fitness: null,
  performance_numbers: null,
  locked_baselines: null,
  equipment: null,
  effort_paces: null,
  swim_training_from_workouts: null,
  ...over,
}) as never;

Deno.test('equipment tier: a dumbbell chip with two compound 1RMs is full barbell (the phone said dumbbell)', () => {
  const r = buildIntakeReadout({
    arc: arc({ equipment: { strength: ['Dumbbells'] }, performance_numbers: { squat: 225, deadlift: 275 } }),
    effort: null, asOf: AS_OF,
  });
  assertEquals(r.equipment_tier, 'full_barbell');
  assertEquals(r.performance_downgraded, false);
  assertEquals(r.barbell_lifts_on_file, 'some');
  assertEquals(r.strength_default, 'use');
});

Deno.test('no gear and no lifts: bodyweight and bands, performance downgraded, test week default', () => {
  const r = buildIntakeReadout({ arc: arc(), effort: null, asOf: AS_OF });
  assertEquals(r.equipment_tier, 'bodyweight_bands');
  assertEquals(r.performance_downgraded, true);
  assertEquals(r.barbell_lifts_on_file, 'none');
  assertEquals(r.strength_default, 'test');
  assertEquals(r.lifts.squat, null);
});

Deno.test('lifts: a trusted learned squat outranks the typed one; a thin one does not', () => {
  const trusted = buildIntakeReadout({
    arc: arc({
      performance_numbers: { squat: 200, bench: 150, deadlift: 250, overheadPress1RM: 95, pullupMaxReps: 0 },
      learned_fitness: { strength_1rms: { squat: { value: 231.4, confidence: 'medium', sample_count: 4, last_logged: '2026-09-01' } } },
    }),
    effort: null, asOf: AS_OF,
  });
  assertEquals(trusted.lifts.squat, { value: 231, source: 'learned' });
  assertEquals(trusted.lifts.bench, { value: 150, source: 'typed' });
  assertEquals(trusted.lifts.pullupMaxReps, { value: 0, source: 'typed' });
  assertEquals(trusted.barbell_lifts_on_file, 'all');

  const thin = buildIntakeReadout({
    arc: arc({
      performance_numbers: { squat: 200 },
      learned_fitness: { strength_1rms: { squat: { value: 231, confidence: 'medium', sample_count: 2, last_logged: '2026-09-01' } } },
    }),
    effort: null, asOf: AS_OF,
  });
  assertEquals(thin.lifts.squat, { value: 200, source: 'typed' });

  const locked = buildIntakeReadout({
    arc: arc({ performance_numbers: { squat: 200 }, locked_baselines: { squat: 185 } }),
    effort: null, asOf: AS_OF,
  });
  assertEquals(locked.lifts.squat, { value: 185, source: 'locked' });
});

Deno.test('pace benchmark: a learned threshold object at medium confidence counts', () => {
  const r = buildIntakeReadout({
    arc: arc({ learned_fitness: { run_threshold_pace_sec_per_km: { value: 250, confidence: 'medium' } } }),
    effort: null, asOf: AS_OF,
  });
  assert(r.has_pace_benchmark);
  assertEquals(buildIntakeReadout({ arc: arc(), effort: { effort_score: 44 }, asOf: AS_OF }).has_pace_benchmark, true);
  assertEquals(buildIntakeReadout({ arc: arc(), effort: null, asOf: AS_OF }).has_pace_benchmark, false);
});

Deno.test('hard days: a 5K alone prices no hard run; a typed threshold pace does; an FTP prices the ride', () => {
  const fiveK = buildIntakeReadout({ arc: arc({ performance_numbers: { fiveK_pace: 420 } }), effort: null, asOf: AS_OF });
  assertEquals(fiveK.hard_days_priceable, { run: false, bike: false });
  const thr = buildIntakeReadout({
    arc: arc({ performance_numbers: { threshold_pace_sec_per_mi: 440, ftp: 250 } }), effort: null, asOf: AS_OF,
  });
  assertEquals(thr.hard_days_priceable, { run: true, bike: true });
});

Deno.test('session counts: only when asked, with the limiter and 4 days as the engine clamps them', () => {
  assertEquals(buildIntakeReadout({ arc: arc(), effort: null, asOf: AS_OF }).session_frequency_by_tier, undefined);
  // No swims in 90 days → swim is the limiter.
  const swimArc = arc({ swim_training_from_workouts: { completed_swim_sessions_last_90_days: 0 } });
  const r = buildIntakeReadout({
    arc: swimArc, effort: null, asOf: AS_OF,
    sessionFrequency: { hours: [6, 11], days_per_week: 4, strength_intent: 'performance', swim_intent: 'race' },
  });
  for (const h of [6, 11]) {
    const d = computeSessionFrequencyDefaults({
      weekly_hours_available: h, days_per_week: 4, limiter_sport: 'swim', swim_intent: 'race', strength_intent: 'performance',
    });
    assertEquals(r.session_frequency_by_tier?.[String(h)], { swims: d.swims_per_week, bikes: d.bikes_per_week, runs: d.runs_per_week });
  }
  // An unknown strength intent is left out, as create-goal leaves it off the plan's state.
  const none = buildIntakeReadout({ arc: arc(), effort: null, asOf: AS_OF, sessionFrequency: { hours: [9], strength_intent: 'none' } });
  const d9 = computeSessionFrequencyDefaults({ weekly_hours_available: 9, days_per_week: 7, limiter_sport: 'run' });
  assertEquals(none.session_frequency_by_tier?.['9'], { swims: d9.swims_per_week, bikes: d9.bikes_per_week, runs: d9.runs_per_week });
});

/**
 * ⛔ THE SECOND TIMELINE WALL — demoted with the first (2026-08-06).
 *
 * `create-goal-and-materialize-plan` stopped refusing a race closer than the usual block (Michael:
 * *same "warn, no wall" as the mileage floor*). This validator rejected the identical case one call
 * later: a beginner marathon under 14 weeks came back `400 Invalid request`. Demoting only the
 * caller would have moved the wall, not removed it — and moved it somewhere with worse manners,
 * since a validation error reaches the athlete as "the week could not be built".
 *
 * ⚠️ THE FOUR-WEEK MINIMUM IS STILL AN ERROR, and the split is the whole point: four weeks is what
 * `determinePhaseStructure` can physically lay out (it throws below that). Everything above it is a
 * judgement about whether the block is long enough to be GOOD, which is the athlete's to make.
 *
 * Run from repo root:
 *   ~/.deno/bin/deno test --allow-read --no-check supabase/functions/generate-run-plan/duration-warn-not-error.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { validateRequest } from './validation.ts';

const REQUEST = {
  user_id: 'test',
  distance: 'marathon',
  fitness: 'beginner',
  goal: 'complete',
  approach: 'sustainable',
  duration_weeks: 9,
  days_per_week: '4-5',
} as never;

const req = (extra: Record<string, unknown>) => ({ ...(REQUEST as object), ...extra } as never);

Deno.test('⛔ THE CASE: a 9-week beginner marathon VALIDATES, and says what is short about it', () => {
  const v = validateRequest(REQUEST);
  assert(v.valid, `a 9-week beginner marathon was rejected: ${v.errors.join(' | ')}`);
  assert(
    v.warnings.some((w) => /marathon plan usually takes 14 weeks/.test(w)),
    `expected the shortfall to be stated as a warning, got: ${JSON.stringify(v.warnings)}`,
  );
});

Deno.test('the warning names both numbers — what it usually takes, and what this is', () => {
  const w = validateRequest(REQUEST).warnings.find((x) => /usually takes/.test(x))!;
  assert(w.includes('14'), `missing the usual length: ${w}`);
  assert(w.includes('9'), `missing the actual length: ${w}`);
  // A warning states, it does not instruct — the same rule the advisory copy follows.
  assert(!/pick|choose|should/i.test(w), `a warning must not issue instructions: ${w}`);
});

Deno.test('⛔ FOUR WEEKS IS STILL A WALL — it is the phase builder\'s floor, not a verdict', () => {
  const v = validateRequest(req({ duration_weeks: 3 }));
  assertEquals(v.valid, false);
  assert(
    v.errors.some((e) => /at least 4/.test(e)),
    `expected the structural minimum to still refuse: ${JSON.stringify(v.errors)}`,
  );
});

Deno.test('an athlete with a base gets the shorter reference, and still no wall', () => {
  // intermediate/advanced carry `base: 6`; a 5-week block warns rather than refusing.
  const v = validateRequest(req({ fitness: 'intermediate', duration_weeks: 5 }));
  assert(v.valid, `a 5-week intermediate marathon was rejected: ${v.errors.join(' | ')}`);
  assert(v.warnings.some((w) => /Even with your training base/.test(w)));
});

Deno.test('a full-length block says nothing at all — the notice stays rare', () => {
  const v = validateRequest(req({ duration_weeks: 16 }));
  assert(v.valid);
  assertEquals(v.warnings.filter((w) => /usually takes/.test(w)).length, 0);
});

Deno.test('the other distances came with it — half, 10K and 5K warn too', () => {
  for (const [distance, weeks] of [['half', 5], ['10k', 4], ['5k', 4]] as const) {
    const v = validateRequest(req({ distance, duration_weeks: weeks }));
    assert(v.valid, `${distance} @ ${weeks}wk was rejected: ${v.errors.join(' | ')}`);
  }
});

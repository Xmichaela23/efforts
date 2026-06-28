// Q-087 regression — `upper_aesthetics` at frequency 2 must emit its UPPER session. A filter at
// strength-overlay.ts:620 stripped UPPER_STRENGTH/UPPER_MAINTENANCE at freq 2, shipping a single
// lower-only week for a protocol the athlete explicitly chose for upper development. This test FAILS on
// HEAD (upper stripped) and PASSES after the filter removal.
// Run: ~/.deno/bin/deno test --no-check supabase/functions/generate-run-plan/strength-overlay-q087.test.ts
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildStrengthSessionsForPlanWeek } from './strength-overlay.ts';

// A non-taper, non-recovery Base week so upper_aesthetics emits [LOWER_MAINTENANCE, UPPER_STRENGTH].
const phaseStructure = {
  phases: [{ name: 'Base', start_week: 1, end_week: 12 }],
  recovery_weeks: [],
} as unknown as Parameters<typeof buildStrengthSessionsForPlanWeek>[0]['phaseStructure'];

// Run sessions so placement can derive a schedule (long Sun, quality Tue, easy Thu/Sat).
const enduranceSessions = [
  { day: 'sunday', type: 'run', tags: ['long_run'], name: 'Long Run' },
  { day: 'tuesday', type: 'run', tags: ['quality'], name: 'Intervals' },
  { day: 'thursday', type: 'run', tags: ['easy'], name: 'Easy Run' },
  { day: 'saturday', type: 'run', tags: ['easy'], name: 'Easy Run' },
] as unknown as Parameters<typeof buildStrengthSessionsForPlanWeek>[0]['enduranceSessions'];

const isUpper = (s: { name?: string; tags?: string[]; exercises?: Array<{ name?: string }> }) =>
  /upper/i.test(s.name ?? '') ||
  (s.tags ?? []).some((t) => /upper/i.test(String(t))) ||
  (s.exercises ?? []).some((e) => /bench|overhead press|pull-?up/i.test(e.name ?? ''));

Deno.test('Q-087 — upper_aesthetics @ freq 2 emits the UPPER session (was stripped → lower-only)', () => {
  const sessions = buildStrengthSessionsForPlanWeek({
    weekNumber: 2,
    totalWeeks: 12,
    enduranceSessions,
    phaseStructure,
    frequency: 2,
    tier: 'barbell',
    protocolId: 'upper_aesthetics',
    methodology: 'jack_daniels_performance',
  }) as unknown as Array<{ name?: string; tags?: string[]; exercises?: Array<{ name?: string }> }>;

  assert(sessions.length >= 2, `freq-2 upper_aesthetics must emit 2 strength sessions, got ${sessions.length}`);
  assert(
    sessions.some(isUpper),
    `an UPPER session must be present (Q-087); got: ${sessions.map((s) => s.name).join(', ')}`,
  );
});

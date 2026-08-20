/**
 * ⛔ A PRESCRIBED THRESHOLD RUN NEVER TELLS THE ATHLETE IT HAS NO NUMBER (2026-08-19).
 *
 * Two rules could have disagreed here and one of them was wrong. §7's `hardDayGate` drops a hard RUN
 * unless a 5K pace or a threshold pace exists — it tests the 5K deliberately, because
 * `materialize-plan` derives threshold as 5K + 20 s/mi when nothing measured exists. The new
 * provenance copy asked a DIFFERENT question — "did the threshold resolver answer" — and on a null
 * answer said *"no threshold pace is on file, so this one has no number yet."*
 *
 * A session can pass the gate on its 5K, get `unknown` from the resolver, and then be priced at
 * materialization anyway. The athlete would read "no number yet" on a card showing a pace target.
 * The gate was right; the copy was wrong.
 *
 * Run: deno test supabase/functions/shared/strength-system/threshold-basis.test.ts --no-check
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeStrengthPrimaryPlan } from './strength-primary-plan.ts';

const MAXES = { bench: 185, squat: 245, deadlift: 315, overheadPress: 115 };
const RUN = {
  enduranceSport: 'run', enduranceFrequency: 4, targetWeeklyMiles: 25,
  easyPaceMinPerMile: 9, longRunDay: 'sunday',
  hardDays: [{ day: 'tuesday', discipline: 'run' }, { day: 'thursday', discipline: 'run' }],
};

function thresholdRunDescriptions(extra: Record<string, unknown>): string[] {
  const p = composeStrengthPrimaryPlan({
    durationWeeks: 12, oneRepMaxes: MAXES, ...RUN, ...extra,
  } as never) as { sessions_by_week?: Record<string, { name?: string; description?: string }[]> };
  const weeks = p.sessions_by_week ?? {};
  return Object.values(weeks)
    .flat()
    .filter((s) => /Threshold Run/.test(String(s?.name ?? '')))
    .map((s) => String(s?.description ?? ''));
}

Deno.test('a 5K-only athlete gets a threshold run that names the 5K, not "no number"', () => {
  const descs = thresholdRunDescriptions({ fiveKPaceSecPerMi: 480, thresholdPaceBasis: 'derived-from-5k' });
  assert(descs.length > 0, 'no threshold run was built for a 5K-only athlete');
  for (const d of descs) {
    assert(!/no number yet/i.test(d), `a priced session claimed it had no number: ${d}`);
    assert(/derived from your 5K/i.test(d), `the 5K basis was not named: ${d}`);
  }
});

Deno.test('an absent basis falls back to the 5K wording, never to "no number"', () => {
  // An older caller that passes no basis at all still reaches the session only after the gate.
  const descs = thresholdRunDescriptions({ fiveKPaceSecPerMi: 480 });
  assert(descs.length > 0);
  for (const d of descs) assert(!/no number yet/i.test(d), `fallback claimed no number: ${d}`);
});

Deno.test('a measured threshold still says measured', () => {
  const descs = thresholdRunDescriptions({
    fiveKPaceSecPerMi: 480, thresholdPaceSecPerMi: 545, thresholdPaceBasis: 'measured',
  });
  assert(descs.length > 0);
  for (const d of descs) assert(/measured threshold/i.test(d), d);
});

Deno.test('the easy-pace derivation says so, and carries its weakness', () => {
  const descs = thresholdRunDescriptions({
    fiveKPaceSecPerMi: 480, thresholdPaceSecPerMi: 634, thresholdPaceBasis: 'derived-from-easy',
  });
  assert(descs.length > 0);
  for (const d of descs) {
    assert(/easy runs/i.test(d), d);
    assert(!/measured threshold/i.test(d), `a derived pace claimed to be measured: ${d}`);
  }
});

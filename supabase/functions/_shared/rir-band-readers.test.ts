/**
 * ⛔ PASS 7 (book-language fix, 2026-09-18): every reader that judges a logged reserve against the plan uses the
 * one p218 band rule (`strength-grid/intents.ts` rirTargetFor / rirOffTarget). A HYP set at 0 RIR is inside
 * p218's 0-2 band; a row with no intent keeps its own number.
 *
 *   ~/.deno/bin/deno test -A --no-check --sloppy-imports supabase/functions/_shared/rir-band-readers.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { rirOffTarget, rirTargetFor, rirTargetText } from './strength-grid/intents.ts';
import { buildActualSession } from './athlete-snapshot/daily-ledger.ts';
import { buildSessionObservations } from './athlete-snapshot/body-response.ts';
import { computeLiftVerdict } from './response-model/weekly.ts';

Deno.test('the rule: HYP band 0-2, DE 3-4, ME none, a plain row keeps its number', () => {
  assertEquals(rirTargetFor({ slot_intent: 'HYP', target_rir: 1 }), { lo: 0, hi: 2, band: true });
  assertEquals(rirTargetFor({ slot_intent: 'DE', target_rir: 3.5 }), { lo: 3, hi: 4, band: true });
  assertEquals(rirTargetFor({ slot_intent: 'ME', target_rir: 2 }), null);
  assertEquals(rirTargetFor({ target_rir: 2 }), { lo: 2, hi: 2, band: false });
  assertEquals(rirOffTarget(0, { lo: 0, hi: 2, band: true }), 0);
  assertEquals(rirOffTarget(2.5, { lo: 3, hi: 4, band: true }), -0.5);
  assertEquals(rirOffTarget(1, { lo: 2, hi: 2, band: false }), -1);
  assertEquals(rirTargetText({ lo: 0, hi: 2, band: true }), '0 to 2');
});

const hypRow = (rir: number) => ({
  id: 'w1', type: 'strength', name: 'Upper body: Pull',
  strength_exercises: [{ name: 'Leg Curl', slot_intent: 'HYP', target_rir: 1, sets: [{ weight: 50, reps: 10, rir }, { weight: 50, reps: 10, rir }] }],
});

Deno.test('daily-ledger: a HYP lift logged at 0 RIR is 0 off target, and its target prints "0 to 2"', () => {
  const s = buildActualSession(hypRow(0), true);
  const ex = s.strength_actual![0];
  assertEquals(ex.rir_delta, 0);
  assertEquals(ex.target_rir_text, '0 to 2');
  assertEquals(ex.target_rir_band, { lo: 0, hi: 2 });
});

Deno.test('daily-ledger: a row with no intent keeps avg minus its number', () => {
  const s = buildActualSession({ id: 'w2', type: 'strength', name: 'x', strength_exercises: [{ name: 'Curl', target_rir: 2, sets: [{ weight: 20, reps: 10, rir: 0 }] }] }, true);
  assertEquals(s.strength_actual![0].rir_delta, -2);
  assertEquals(s.strength_actual![0].target_rir_text, '2');
});

Deno.test('body-response: a HYP session at 0 RIR reads as on target against "0 to 2", not "pushed harder"', () => {
  const actual = buildActualSession(hypRow(0), true);
  const obs = buildSessionObservations(
    [{ date: '2026-09-21', is_past: true, is_today: false, actual: [actual], planned: [], matches: [] }] as never,
    { strength_rir_avg: null, strength_rir_sample_size: 0 } as never,
    true,
  );
  const lines = obs.flatMap((o) => o.observations);
  assert(lines.some((l) => l.includes('Hit prescribed intensity') && l.includes('target 0 to 2')), JSON.stringify(lines));
  assert(!lines.some((l) => /Pushed harder/.test(l)), JSON.stringify(lines));
});

Deno.test('weekly verdict: judged against the band when one is passed', () => {
  // A coached main lift in a p218 SKILL slot logged at 3 RIR: inside 3-4. Against a single target of 1 it would
  // read "add weight" (3 - 1 = 2).
  const withBand = computeLiftVerdict(3, 1, 'stable', 'build', 'bench_press', null, null, null, { lo: 3, hi: 4 });
  assertEquals(withBand.label, 'on track');
  const noBand = computeLiftVerdict(3, 1, 'stable', 'build', 'bench_press', null, null, null, null);
  assertEquals(noBand.label, 'add weight');
});

Deno.test('analyze-strength-workout and coach read the one rule (source pin — the functions serve on import)', () => {
  const analyze = Deno.readTextFileSync(new URL('../analyze-strength-workout/index.ts', import.meta.url));
  assert(analyze.includes('rirAdherence = Math.round(rirOffTarget(readRir, rirTarget) * 10) / 10;'));
  assert(analyze.includes("rirTargetFor({ slot_intent: planned?.slot_intent })"));
  const coach = Deno.readTextFileSync(new URL('../coach/index.ts', import.meta.url));
  assert(coach.includes('target_rir_band: protocolUsesRir(strengthProfile) ? (rirBandFor(perLiftRir.intentByLift.get(key)?.intent) ?? null) : null,'));
});

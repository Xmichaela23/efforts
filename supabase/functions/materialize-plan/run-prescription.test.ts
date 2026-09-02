/**
 * The prescription on a run step (Michael, 2026-09-02, rulings 1 and 2): easy steps carry a
 * heart-rate range and say so; hard steps carry an effort target beside their pace.
 *
 * Run: deno test --allow-read --allow-env --allow-net --no-check supabase/functions/materialize-plan/run-prescription.test.ts
 * Athlete-agnostic: synthetic numbers, never tuned to the primary user.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { expandRunToken, stampRunPrescription, toV3Step } from './index.ts';

const HR = { lower: 136, upper: 144 };   // Friel Z2 off an LTHR of 160
const baselines: any = { _resolvedThresholdSecPerMi: 450, _resolvedEasySecPerMi: 536, _fiveKSecPerMi: 425, _easyHrRange: HR };
const expand = (tok: string, b: any = baselines) => stampRunPrescription(tok, expandRunToken(tok, b), b);
const work = (steps: any[]) => steps.filter((s) => s.kind === 'work');

Deno.test('an easy run is prescribed by heart rate: every step carries the zone and says so; the pace stays as a reference', () => {
  for (const tok of ['run_easy_30min', 'longrun_90min_easypace', 'warmup_run_10min_easy', 'cooldown_run_8min_easy']) {
    const steps = expand(tok);
    assert(steps.length > 0, tok);
    for (const s of steps) {
      assertEquals(s.prescription, 'heart_rate', `${tok}: ${s.kind}`);
      assertEquals(s.hr_range, HR, `${tok}: ${s.kind}`);
      assertEquals(s.pace_sec_per_mi, 536, `${tok}: the reference band still travels`);
      assertEquals(s.target_rpe, undefined, `${tok}: an easy step carries no effort target`);
    }
  }
});

Deno.test('threshold work carries effort 5–6 on the work steps and heart rate on the recoveries', () => {
  const steps = expand('cruise_4x1mi_threshold');
  const w = work(steps);
  assertEquals(w.length, 4);
  for (const s of w) {
    assertEquals(s.target_rpe, { lo: 5, hi: 6 });
    assertEquals(s.pace_sec_per_mi, 450);
    assertEquals(s.hr_range, undefined);
  }
  const rec = steps.filter((s) => s.kind === 'recovery');
  assert(rec.length > 0, 'cruise intervals carry recoveries');
  for (const s of rec) assertEquals(s.hr_range, HR);
});

Deno.test('intervals carry effort 8–10 on the work steps', () => {
  const steps = expand('interval_6x800m_5kpace_R90s');
  const w = work(steps);
  assertEquals(w.length, 6);
  for (const s of w) {
    assertEquals(s.target_rpe, { lo: 8, hi: 10 });
    assertEquals(s.pace_sec_per_mi, 425);
    assertEquals(s.prescription, undefined);
  }
});

Deno.test('a long run with a race-pace finish: easy miles by heart rate, the finish keeps its pace and no zone', () => {
  const steps = expand('longrun_16mi_easypace_last4mi_mp', { ...baselines, _racePaceSecPerMi: 492 });
  const w = work(steps);
  assertEquals(w.length, 2);
  assertEquals(w[0].hr_range, HR);
  assertEquals(w[0].prescription, 'heart_rate');
  assertEquals(w[1].pace_sec_per_mi, 492);
  assertEquals(w[1].hr_range, undefined);
});

Deno.test('LAW 2: no threshold heart rate on file → the step still says heart-rate, but carries no range', () => {
  const { _easyHrRange: _drop, ...noLthr } = baselines;
  const steps = expand('run_easy_30min', noLthr);
  for (const s of steps) {
    assertEquals(s.prescription, 'heart_rate');
    assertEquals(s.hr_range, undefined);
  }
});

Deno.test('strides carry neither a zone nor an effort target', () => {
  const steps = expand('strides_6x20s');
  for (const s of work(steps)) {
    assertEquals(s.target_rpe, undefined);
    assertEquals(s.hr_range, undefined);
  }
});

// ═══ THE WHITELIST TRAP — the fields must survive the v3 normalization the calendar row is written in ═══
Deno.test('v3 round-trip: prescription, hr_range and target_rpe reach computed.steps (found dropped 2026-09-02)', () => {
  const row = { type: 'run', date: '2026-09-05' };
  const easy = expand('run_easy_30min').map((st) => toV3Step(st, row));
  for (const s of easy) {
    assertEquals(s.prescription, 'heart_rate');
    assertEquals(s.hr_range, HR);
  }
  const hard = expand('cruise_4x1mi_threshold').map((st) => toV3Step(st, row));
  const w = hard.filter((s) => s.kind === 'work');
  assertEquals(w.length, 4);
  for (const s of w) assertEquals(s.target_rpe, { lo: 5, hi: 6 });
  for (const s of hard.filter((x) => x.kind === 'recovery')) assertEquals(s.hr_range, HR);
});

// Run: deno test --no-check supabase/functions/_shared/insights/cross-training-read.test.ts
import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { composeCrossTrainingRead, type CrossDisciplineState } from './cross-training-read.ts';

const S = (discipline: string, posture: any, verdict: any, acwr: number | null): CrossDisciplineState =>
  ({ discipline, posture, verdict, acwr });

// ── THE ANTI-"UNPRODUCTIVE" CASE (Michael, live on Garmin) ──────────────────────────────────────────
Deno.test('trade working: building strength, it is coming, running eased → names the trade, not lost fitness', () => {
  const r = composeCrossTrainingRead([
    S('strength', 'develop', 'improving', 1.0),
    S('run', 'maintain', 'holding', 0.6),   // eased off
    S('bike', 'maintain', 'holding', 0.9),
  ])!;
  assertEquals(r.kind, 'trade_working');
  assertEquals(r.tone, 'positive');
  assertStringIncludes(r.label, 'building strength');
  assertStringIncludes(r.label, 'running eased');
  assertStringIncludes(r.label, 'not lost fitness'); // the exact reframe Garmin cannot make
});

// ── THE COST ────────────────────────────────────────────────────────────────────────────────────────
Deno.test('cost: strength sliding while riding is pushed → names the tipping trade + a real lever', () => {
  const r = composeCrossTrainingRead([
    S('strength', 'develop', 'sliding', 1.0),
    S('bike', 'maintain', 'improving', 1.4), // being pushed
  ])!;
  assertEquals(r.kind, 'cost');
  assertEquals(r.tone, 'warning');
  assertStringIncludes(r.label, 'riding is up');
  assertStringIncludes(r.label, 'strength has started to give');
  assertStringIncludes(r.label, 'ease one'); // a lever, not a scold
});

// ── ROOM ──────────────────────────────────────────────────────────────────────────────────────────
Deno.test('room: pushing riding, strength still holding → the green light', () => {
  const r = composeCrossTrainingRead([
    S('strength', 'develop', 'holding', 1.0),
    S('bike', 'maintain', 'improving', 1.4),
  ])!;
  assertEquals(r.kind, 'room');
  assertEquals(r.tone, 'positive');
  assertStringIncludes(r.label, "you've got room");
});

// ── SILENCE — the honesty gates ─────────────────────────────────────────────────────────────────────
Deno.test('no declared focus → null (nothing to trade off; caller reassures)', () => {
  assertEquals(composeCrossTrainingRead([
    S('strength', 'maintain', 'holding', 1.0),
    S('run', 'maintain', 'holding', 0.6),
  ]), null);
});

Deno.test('focus has no verdict yet → null (cannot speak to a focus we cannot read)', () => {
  assertEquals(composeCrossTrainingRead([
    S('strength', 'develop', 'needs_data', 1.0),
    S('run', 'maintain', 'holding', 0.6),
  ]), null);
});

Deno.test('focus sliding but NOTHING pushed → null (not a cross-training story; the strength read owns it)', () => {
  assertEquals(composeCrossTrainingRead([
    S('strength', 'develop', 'sliding', 0.9),
    S('run', 'maintain', 'holding', 0.9), // nothing eased, nothing pushed
  ]), null);
});

Deno.test('focus working, nothing eased or pushed → null (a boring good week is silent, not a false all-clear)', () => {
  assertEquals(composeCrossTrainingRead([
    S('strength', 'develop', 'improving', 1.0),
    S('run', 'maintain', 'holding', 0.95),
  ]), null);
});

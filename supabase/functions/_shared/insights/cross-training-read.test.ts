// Run: deno test --no-check supabase/functions/_shared/insights/cross-training-read.test.ts
import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { composeCrossTrainingRead, type CrossDisciplineState } from './cross-training-read.ts';

const S = (discipline: string, posture: any, verdict: any, acwr: number | null, underTarget?: boolean): CrossDisciplineState =>
  ({ discipline, posture, verdict, acwr, underTarget });

// ── GLANCE + OPEN — every fired read carries a headline AND a detail ────────────────────────────────
Deno.test('shape: fired reads return a non-empty headline and a detail', () => {
  const r = composeCrossTrainingRead([S('strength', 'develop', 'improving', null), S('run', 'maintain', 'holding', 0.6)])!;
  assertEquals(typeof r.headline, 'string');
  assertEquals(r.headline.length > 0, true);
  assertEquals(typeof r.detail, 'string');
});

// ── THE ANTI-"UNPRODUCTIVE" CASE, RUNNING (Michael) — run gets the STRONG fade language ─────────────
Deno.test('trade working, RUN eased: frank "running fades" at the glance; specificity in the detail', () => {
  const r = composeCrossTrainingRead([
    S('strength', 'develop', 'improving', null),
    S('run', 'maintain', 'holding', 0.6),
    S('bike', 'maintain', 'holding', 0.9),
  ])!;
  assertEquals(r.kind, 'trade_working');
  assertStringIncludes(r.headline, 'Building strength');
  assertStringIncludes(r.headline, "running's starting to fade"); // frank AT the glance
  assertStringIncludes(r.detail!, 'Running is specific');          // mechanism on tap
  assertStringIncludes(r.detail!, 'chosen one');                   // trade, not a scold
});

// ── SAME STRUCTURE, DIFFERENT DISCIPLINE — bike eased gets SOFTER language (not "fades") ────────────
Deno.test('trade working, BIKE eased: softer "easing", never the run-specific "fades"', () => {
  const r = composeCrossTrainingRead([
    S('strength', 'develop', 'improving', null),
    S('bike', 'maintain', 'holding', 0.6),
  ])!;
  assertEquals(r.kind, 'trade_working');
  assertStringIncludes(r.headline, "riding's easing");
  assertEquals(r.headline.includes('fade'), false);          // bike is NOT use-it-or-lose-it
  assertStringIncludes(r.detail!, 'holds better than running');
});

// ── GENERALISES OFF STRENGTH — a MARATHONER developing RUNNING, adding strength on the side ─────────
Deno.test('generalises: run-focus marathoner, running holding, strength being pushed → "room" (focus=run)', () => {
  const r = composeCrossTrainingRead([
    S('run', 'develop', 'holding', 0.9),     // the FOCUS is running
    S('strength', 'maintain', 'improving', 1.4), // pushing strength on the side
  ])!;
  assertEquals(r.kind, 'room');
  assertStringIncludes(r.headline, 'Pushing your strength'); // the non-focus pushed discipline
  assertStringIncludes(r.headline, 'your running is holding');
});

// ── developing+pushing your OWN focus, nothing else moving → null (not a cross-training story) ───────
Deno.test('pushing your own focus, nothing else → null (the strength/run read owns it, not cross-training)', () => {
  assertEquals(composeCrossTrainingRead([
    S('run', 'develop', 'improving', 1.3),
    S('strength', 'maintain', 'holding', 0.9),
  ]), null);
});

// ── THE WINDOW-MISMATCH REGRESSION (device 2026-07-21): under-target run + weekly uptick = TRADE ─────
Deno.test('under-target maintain run with a weekly uptick reads as the TRADE, never "pushing"', () => {
  const r = composeCrossTrainingRead([
    S('strength', 'develop', 'improving', null),
    S('run', 'maintain', 'holding', 1.2, /* underTarget */ true),
    S('bike', 'maintain', 'holding', 0.9),
  ])!;
  assertEquals(r.kind, 'trade_working');
  assertEquals(r.headline.includes('Pushing'), false);
});

// ── THE COST ────────────────────────────────────────────────────────────────────────────────────────
Deno.test('cost: strength sliding while riding pushed → tipping trade at the glance, lever in the detail', () => {
  const r = composeCrossTrainingRead([
    S('strength', 'develop', 'sliding', null),
    S('bike', 'maintain', 'improving', 1.4),
  ])!;
  assertEquals(r.kind, 'cost');
  assertEquals(r.tone, 'warning');
  assertStringIncludes(r.headline, 'riding is up');
  assertStringIncludes(r.headline, 'strength has started to give');
  assertStringIncludes(r.detail!, 'Ease one');
});

// ── ROOM ──────────────────────────────────────────────────────────────────────────────────────────
Deno.test('room: pushing riding, strength holding → green light + a watch-the-numbers detail', () => {
  const r = composeCrossTrainingRead([
    S('strength', 'develop', 'holding', null),
    S('bike', 'maintain', 'improving', 1.4),
  ])!;
  assertEquals(r.kind, 'room');
  assertStringIncludes(r.headline, "you've got room");
  assertStringIncludes(r.detail!, 'lift numbers');
});

// ── SILENCE — the honesty gates (a FREEBALLER with no focus, thin data, boring week) ────────────────
Deno.test('freeballer / no declared focus → null (caller reassures)', () => {
  assertEquals(composeCrossTrainingRead([S('strength', 'maintain', 'holding', 1.0), S('run', 'maintain', 'holding', 0.6)]), null);
});
Deno.test('thin data: focus has no verdict yet → null', () => {
  assertEquals(composeCrossTrainingRead([S('strength', 'develop', 'needs_data', null), S('run', 'maintain', 'holding', 0.6)]), null);
});
Deno.test('boring good week: focus working, nothing eased or pushed → null', () => {
  assertEquals(composeCrossTrainingRead([S('strength', 'develop', 'improving', null), S('run', 'maintain', 'holding', 0.95)]), null);
});

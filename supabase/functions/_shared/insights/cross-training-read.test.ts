// Run: deno test --no-check supabase/functions/_shared/insights/cross-training-read.test.ts
import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { composeCoachEye, type CoachEyeDiscipline } from './cross-training-read.ts';

const D = (discipline: string, posture: any, verdict: any, acwr: number | null, extra: Partial<CoachEyeDiscipline> = {}): CoachEyeDiscipline =>
  ({ discipline, posture, verdict, acwr, ...extra });
const eye = (disciplines: CoachEyeDiscipline[], readinessDeclining = false) => composeCoachEye({ disciplines, readinessDeclining });

// ── FLOOR — a maintain discipline under its DECLARED target (Michael's live case) ───────────────────
Deno.test('FLOOR: maintain running under its 18-mile target → the number + specificity, tone info', () => {
  const r = eye([
    D('strength', 'develop', 'improving', null),
    D('run', 'maintain', 'holding', 0.6, { underTarget: true, actualPerWeek: 6, targetPerWeek: 18, unit: 'mile' }),
  ])!;
  assertEquals(r.kind, 'floor');
  assertEquals(r.tone, 'info');
  assertStringIncludes(r.headline, '6 of your 18-mile');
  assertStringIncludes(r.detail!, 'Running is specific');
  assertEquals(r.headline.includes('trade'), false); // no editorializing
});

// ── CEILING — focus slipping while a supplement climbs → PROMPT + lever + the ⓘ, never a verdict ────
Deno.test('CEILING: strength slipping while riding pushed → correlation prompt, a lever, and the info popup', () => {
  const r = eye([
    D('strength', 'develop', 'sliding', null),
    D('bike', 'maintain', 'improving', 1.4),
  ])!;
  assertEquals(r.kind, 'ceiling');
  assertEquals(r.tone, 'warning');
  assertStringIncludes(r.headline, 'strength is slipping');
  assertStringIncludes(r.headline, 'riding climbs');
  assertStringIncludes(r.detail!, 'the lever');
  assertStringIncludes(r.detail!, "isn't a number anyone can hand you"); // no false precision
  assertStringIncludes(r.info!, 'you find your ceiling');                // the honest hand-back
});

// ── CEILING via recovery — focus HOLDING but recovery dipping while pushing ─────────────────────────
Deno.test('CEILING: focus holding but recovery dipping while riding pushed → the flat-and-dipping prompt', () => {
  const r = eye([
    D('strength', 'develop', 'holding', null),
    D('bike', 'maintain', 'improving', 1.4),
  ], /* readinessDeclining */ true)!;
  assertEquals(r.kind, 'ceiling');
  assertStringIncludes(r.headline, 'recovery is dipping');
});

// ── ROOM — pushing a supplement, focus holding, no cost → the maximiser's green light ───────────────
Deno.test('ROOM: pushing riding, strength holding, recovery fine → room to push + watch-the-numbers', () => {
  const r = eye([
    D('strength', 'develop', 'holding', null),
    D('bike', 'maintain', 'improving', 1.4),
  ])!;
  assertEquals(r.kind, 'room');
  assertEquals(r.tone, 'positive');
  assertStringIncludes(r.headline, 'room to push');
  assertStringIncludes(r.detail!, 'ceiling shows first');
});

// ── GENERALISES — a marathoner (run focus) with strength being pushed on the side ──────────────────
Deno.test('generalises: run-focus marathoner, running holding, strength pushed → room (focus=run)', () => {
  const r = eye([
    D('run', 'develop', 'holding', 0.9),
    D('strength', 'maintain', 'improving', 1.4),
  ])!;
  assertEquals(r.kind, 'room');
  assertStringIncludes(r.headline, 'strength is up');
  assertStringIncludes(r.headline, 'running is holding');
});

// ── the window regression: under-target maintain + weekly uptick is NEVER read as "pushed" ──────────
Deno.test('under-target run with a weekly acwr uptick is the FLOOR, never a ceiling/room "push"', () => {
  const r = eye([
    D('strength', 'develop', 'improving', null),
    D('run', 'maintain', 'holding', 1.2, { underTarget: true, actualPerWeek: 6, targetPerWeek: 18, unit: 'mile' }),
  ])!;
  assertEquals(r.kind, 'floor');       // NOT room — underTarget suppresses "pushed"
});

// ── SILENCE — the honesty gates ─────────────────────────────────────────────────────────────────────
Deno.test('no declared focus (freeballer) → null', () => {
  assertEquals(eye([D('strength', 'maintain', 'holding', 1.0), D('run', 'maintain', 'holding', 0.6)]), null);
});
Deno.test('thin data: focus has no verdict → null', () => {
  assertEquals(eye([D('strength', 'develop', 'needs_data', null), D('run', 'maintain', 'holding', 0.6)]), null);
});
Deno.test('nothing crosses a line: focus holding, nothing pushed, nothing under target → null', () => {
  assertEquals(eye([D('strength', 'develop', 'improving', null), D('run', 'maintain', 'holding', 0.95)]), null);
});
Deno.test('overdoing at NO cost is silent: riding pushed but focus improving + recovery fine → room, not a cost flag', () => {
  const r = eye([D('strength', 'develop', 'improving', null), D('bike', 'maintain', 'holding', 1.3)])!;
  assertEquals(r.kind, 'room'); // the gate: overdoing only "costs" when the goal is actually impacted
});

/**
 * EVERY PHASE NAME A COMPOSER EMITS MUST RESOLVE. This is the Q-192 class, not another instance.
 *
 * `resolvePlanPhase` hands a plan's own phase NAME to two mappers:
 *   `normalizePhaseKey`   → the effort-target rule (base / build / peak / taper / recovery)
 *   `phaseNameToWeekIntent` → the coach's read of the week
 *
 * Both return a DEFAULT for a name they do not recognise, so a name nobody registered looks
 * identical to one that was chosen deliberately, at every call site. That is exactly how a deload
 * ended up prescribing a TIGHTER target than the weeks it was meant to recover from (D-322), and
 * how `five_by_five` ran a whole block on the wrong profile (Q-192, found twice).
 *
 * The 5/3/1 composer emits Leader / Anchor / Deload / **TM Test**. This test fails if any of them
 * stops resolving. ⚠️ `TM Test` joined the list 2026-08-15 with the standalone-week restructure.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildBlockPhases } from '../shared/strength-system/strength-primary-plan.ts';
import { normalizePhaseKey, PHASE_RULES } from './strength-profiles.ts';
import { phaseNameToWeekIntent, resolvePlanPhase } from './plan-phase.ts';

const PHASES = buildBlockPhases(12);
const NAMES = [...new Set(PHASES.phases.map((p) => p.name))];

Deno.test('every phase name the composer emits resolves to an effort rule', () => {
  for (const name of NAMES) {
    const key = normalizePhaseKey(name);
    assertEquals(key !== null, true, `"${name}" falls through to the silent default`);
    assertEquals(key! in PHASE_RULES, true, `"${name}" → "${key}", which is not a rule`);
  }
});

Deno.test('every phase name the composer emits resolves to a coach week intent', () => {
  for (const name of NAMES) {
    assertEquals(phaseNameToWeekIntent(name) === 'unknown', false, `"${name}" reads as unknown to the coach`);
  }
});

Deno.test('a LEADER accumulates and an ANCHOR intensifies — and a deload is looser than both', () => {
  assertEquals(normalizePhaseKey('Leader'), 'base');
  assertEquals(normalizePhaseKey('Anchor'), 'build');
  assertEquals(normalizePhaseKey('Deload'), 'recovery');
  // ⛔ The direction is the point: a deload must LOOSEN the target, never tighten it.
  const deload = PHASE_RULES[normalizePhaseKey('Deload')!].targetRirOffset;
  const leader = PHASE_RULES[normalizePhaseKey('Leader')!].targetRirOffset;
  const anchor = PHASE_RULES[normalizePhaseKey('Anchor')!].targetRirOffset;
  assertEquals(deload > leader && leader > anchor, true, `offsets out of order: ${deload} / ${leader} / ${anchor}`);
});

Deno.test('a real plan config resolves every one of its twelve weeks', () => {
  const config = { phase_structure: PHASES };
  for (let week = 1; week <= 12; week++) {
    const phase = resolvePlanPhase(config, week);
    assertEquals(phase !== null, true, `week ${week} placed nowhere`);
    assertEquals(normalizePhaseKey(phase) !== null, true, `week ${week} → "${phase}" does not resolve`);
  }
  // Spot-check the placement itself rather than trusting the loop. ⛔ THE WEEKS MOVED (§1c): week 1
  // is the TM test, weeks 2-7 are the two leader cycles, week 8 is the standalone deload, weeks 9-11
  // the anchor, week 12 the closing test.
  assertEquals(resolvePlanPhase(config, 1), 'TM Test');
  assertEquals(resolvePlanPhase(config, 4), 'Leader');
  assertEquals(resolvePlanPhase(config, 8), 'Deload');
  assertEquals(resolvePlanPhase(config, 11), 'Anchor');
  assertEquals(resolvePlanPhase(config, 12), 'TM Test');
});

Deno.test('⛔ A TEST WEEK TAPERS AND A DELOAD RECOVERS — different postures, on purpose', () => {
  // Both weeks are light and they are light for different reasons: a deload UNLOADS, a test week
  // arrives rested in order to measure. Collapsing them would grade a measured set as recovery work.
  assertEquals(normalizePhaseKey('TM Test'), 'taper');
  assertEquals(normalizePhaseKey('Deload'), 'recovery');
  assertEquals(phaseNameToWeekIntent('TM Test'), 'taper');
  // ⛔ NEITHER MAY TIGHTEN THE TARGET relative to a working week — that is the D-322 direction check.
  const test = PHASE_RULES[normalizePhaseKey('TM Test')!];
  const anchor = PHASE_RULES[normalizePhaseKey('Anchor')!];
  assertEquals(test.targetRirOffset > anchor.targetRirOffset, true);
  assertEquals(test.allowProgress, false, 'a test week never auto-progresses load');
});

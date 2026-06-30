// THE CONDUCTOR — strength arc tests. Run: ~/.deno/bin/deno test --no-check strength-arc.test.ts
import { assertEquals, assert } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { isGetStrongArc, resolveStrengthArcProtocol } from './strength-arc.ts';

Deno.test('isGetStrongArc — only the strength-focus lanes signal the arc', () => {
  assert(isGetStrongArc('strength_focus_build'));
  assert(isGetStrongArc('strength_focus_power'));
  for (const p of ['durability', 'neural_speed', 'five_by_five', 'upper_aesthetics', undefined]) {
    assert(!isGetStrongArc(p as string), `${p} must NOT trigger the arc`);
  }
});

Deno.test('Get Strong arc — base → power → sharpen across phases', () => {
  // base → build lane (5×5-derived compound base)
  for (const n of ['Base', 'base', 'Base Building']) {
    assertEquals(resolveStrengthArcProtocol(n, 'get_strong'), 'strength_focus_build');
  }
  // build / speed → power lane
  for (const n of ['Build', 'Speed', 'build']) {
    assertEquals(resolveStrengthArcProtocol(n, 'get_strong'), 'strength_focus_power');
  }
  // sharpen (race prep / peak) → power, volume trimmed downstream
  assertEquals(resolveStrengthArcProtocol('Race Prep', 'get_strong'), 'strength_focus_power');
  // hold / deload terminals → build-lane content (taper logic deloads it)
  for (const n of ['Taper', 'Retest', 'Recovery']) {
    assertEquals(resolveStrengthArcProtocol(n, 'get_strong'), 'strength_focus_build');
  }
});

Deno.test('Maintain program — flat support, no arc (durability every phase)', () => {
  for (const n of ['Base', 'Build', 'Speed', 'Race Prep', 'Taper', 'Retest']) {
    assertEquals(resolveStrengthArcProtocol(n, 'maintain'), 'durability');
  }
});

Deno.test('arc resolves to REGISTERED protocols only (no validation 400s)', () => {
  const seen = new Set<string>();
  for (const n of ['Base', 'Build', 'Speed', 'Race Prep', 'Taper', 'Retest', 'Recovery', 'Unknown']) {
    seen.add(resolveStrengthArcProtocol(n, 'get_strong'));
    seen.add(resolveStrengthArcProtocol(n, 'maintain'));
  }
  const valid = new Set(['strength_focus_build', 'strength_focus_power', 'durability']);
  for (const p of seen) assert(valid.has(p), `arc produced unregistered protocol ${p}`);
});

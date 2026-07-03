/**
 * D-232 glass-box RPE row — final word-mapping + color-escalation for "How hard it feels".
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/response-model/weekly-rpe-verdict.test.ts --no-check
 *
 * The row LABEL carries the subject ("How hard it feels"), so the sentence starts with the magnitude
 * (Michael-approved tighter prefix). Buckets: |Δ|<0.5 neutral · 0.5–1.0 "A bit" · ≥1.0 "Noticeably";
 * mirrored harder/easier; receipt "(avg X vs your typical Y)". Tone escalates on the HARDER side only
 * (neutral → danger → warning/amber); easier never alarms (positive).
 */

import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { rpeFeelVerdict, rpeFeelTone } from './weekly.ts';

// ── strings ─────────────────────────────────────────────────────────────────────────────────────
Deno.test('harder 0.5–1.0 → "A bit harder than usual" + receipt', () => {
  assertEquals(rpeFeelVerdict(6.4, 5.5, 0.9), 'A bit harder than usual (avg 6.4 vs your typical 5.5)');
});

Deno.test('harder ≥1.0 → "Noticeably harder than usual"', () => {
  assertEquals(rpeFeelVerdict(6.8, 5.5, 1.3), 'Noticeably harder than usual (avg 6.8 vs your typical 5.5)');
});

Deno.test('neutral |Δ|<0.5 → "About as hard as usual"', () => {
  assertEquals(rpeFeelVerdict(5.7, 5.5, 0.2), 'About as hard as usual (avg 5.7 vs your typical 5.5)');
});

Deno.test('easier 0.5–1.0 → "A bit easier than usual"', () => {
  assertEquals(rpeFeelVerdict(4.8, 5.5, -0.7), 'A bit easier than usual (avg 4.8 vs your typical 5.5)');
});

Deno.test('easier ≥1.0 → "Noticeably easier than usual"', () => {
  assertEquals(rpeFeelVerdict(4.3, 5.5, -1.2), 'Noticeably easier than usual (avg 4.3 vs your typical 5.5)');
});

// ── string boundaries ─────────────────────────────────────────────────────────────────────────────
Deno.test('string boundary: exactly 0.5 → "A bit" (not neutral)', () => {
  assert(rpeFeelVerdict(6.0, 5.5, 0.5).startsWith('A bit harder'));
});
Deno.test('string boundary: exactly 1.0 → "Noticeably" (not "A bit")', () => {
  assert(rpeFeelVerdict(6.5, 5.5, 1.0).startsWith('Noticeably harder'));
});
Deno.test('string boundary: 0.4 → neutral', () => {
  assert(rpeFeelVerdict(5.9, 5.5, 0.4).startsWith('About as hard as usual'));
});

Deno.test('missing data → "steady"', () => {
  assertEquals(rpeFeelVerdict(6.4, 5.5, null), 'steady');
  assertEquals(rpeFeelVerdict(null, 5.5, 0.9), 'steady');
});

// ── color escalation (harder escalates; easier never alarms) ────────────────────────────────────
Deno.test('tone: harder <0.5 → neutral', () => assertEquals(rpeFeelTone(0.3), 'neutral'));
Deno.test('tone: harder 0.5–1.0 → danger (current default)', () => assertEquals(rpeFeelTone(0.9), 'danger'));
Deno.test('tone: harder ≥1.0 → warning (amber)', () => assertEquals(rpeFeelTone(1.3), 'warning'));
Deno.test('tone: harder boundary 1.0 → warning', () => assertEquals(rpeFeelTone(1.0), 'warning'));
Deno.test('tone: easier 0.5–1.0 → positive (no alarm)', () => assertEquals(rpeFeelTone(-0.7), 'positive'));
Deno.test('tone: easier ≥1.0 → positive (never warning/danger)', () => assertEquals(rpeFeelTone(-1.3), 'positive'));
Deno.test('tone: easier <0.5 → neutral', () => assertEquals(rpeFeelTone(-0.3), 'neutral'));
Deno.test('tone: null → neutral', () => assertEquals(rpeFeelTone(null), 'neutral'));

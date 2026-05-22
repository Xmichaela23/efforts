// @ts-nocheck
/**
 * SWIM-PROTOCOL §6.6 per-step drill equipment hint in materialize-plan label.
 *
 * Step 4 of the 2026-05-22 CSS-kill arc. The recommended-gear hint surfaces in
 * the drill step's `label` field — Garmin step labels and Form Goggles
 * narrator both consume this. The hint surfaces ONLY for gear the athlete
 * owns; no nag for ungear-ed athletes.
 *
 * Format: "Drill — Fingertip Drag (fins)" when athlete owns fins.
 *
 * Note: materialize-plan's main `expandTokensForRow` flow is inside the
 * Deno.serve handler, so this test exercises the inputs deterministically via
 * the swimDrillEquipmentFromTokens helper that drives the label hint. The
 * helper is the single source of truth — if it returns the right `recommended`
 * array, the materialize-plan label-with-gear formatter renders correctly.
 *
 * Run from repo root:
 *   deno test --no-lock --allow-all \
 *     supabase/functions/materialize-plan/swim-drill-equipment-label.test.ts
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  swimDrillEquipmentFromTokens,
  swimGearLabelForDisplay,
  swimGearNormalized,
} from '../../../src/lib/plan-tokens/swim-drill-tokens.ts';

// Mirror of materialize-plan's `drillLabelWithGear` helper. Kept identical so
// the unit test exercises the exact logic.
function drillLabelWithGear(drillToken: string, baseName: string, owned: Set<string>): string {
  const eq = swimDrillEquipmentFromTokens([drillToken]);
  const ownedRec: string[] = [];
  for (const r of eq.recommended ?? []) {
    if (owned.has(String(r).toLowerCase())) {
      const lbl = swimGearLabelForDisplay(r);
      if (lbl) ownedRec.push(lbl.toLowerCase());
    }
  }
  return ownedRec.length ? `Drill — ${baseName} (${ownedRec.join(', ')})` : `Drill — ${baseName}`;
}

const owns = (...labels: string[]) => swimGearNormalized(labels);

// ── §6.6 fingertip drag — fins recommended (all tiers) ─────────────────────

Deno.test('§6.6 fingertipdrag + fins owned → "Drill — Fingertip Drag (fins)"', () => {
  const label = drillLabelWithGear(
    'swim_drills_3x100yd_fingertipdrag_r15',
    'Fingertip Drag',
    owns('fins', 'snorkel'),
  );
  assertEquals(label, 'Drill — Fingertip Drag (fins)');
});

Deno.test('§6.6 fingertipdrag + fins NOT owned → "Drill — Fingertip Drag" (no nag)', () => {
  const label = drillLabelWithGear(
    'swim_drills_3x100yd_fingertipdrag_r15',
    'Fingertip Drag',
    owns('snorkel'),
  );
  assertEquals(label, 'Drill — Fingertip Drag');
});

Deno.test('§6.6 fingertipdrag + no swim gear → "Drill — Fingertip Drag"', () => {
  const label = drillLabelWithGear(
    'swim_drills_3x100yd_fingertipdrag',
    'Fingertip Drag',
    owns(),
  );
  assertEquals(label, 'Drill — Fingertip Drag');
});

// ── §6.6 fist drill — fins recommended ──────────────────────────────────────

Deno.test('§6.6 fist + fins owned → "Drill — Fist (fins)"', () => {
  const label = drillLabelWithGear(
    'swim_drills_3x100yd_fist',
    'Fist',
    owns('fins'),
  );
  assertEquals(label, 'Drill — Fist (fins)');
});

// ── §6.6 catchup — no recommended (snorkel is optional, not recommended) ─

Deno.test('§6.6 catchup + fins+snorkel owned → "Drill — Catch-up" (no recommended)', () => {
  // Catch-Up has snorkel in `optional`, NOT `recommended`. The hint only
  // surfaces recommended gear. Optional gear stays in the session's Pool
  // gear line (drill-side does not surface optional).
  const label = drillLabelWithGear(
    'swim_drills_3x100yd_catchup_r15',
    'Catch-up',
    owns('fins', 'snorkel'),
  );
  assertEquals(label, 'Drill — Catch-up');
});

// ── §6.6 zipper / sighting — no equipment per spec ─────────────────────────

Deno.test('§6.6 zipper → "Drill — Zipper" regardless of owned gear', () => {
  const label = drillLabelWithGear(
    'swim_drills_3x50yd_zipper',
    'Zipper',
    owns('fins', 'snorkel', 'paddles'),
  );
  assertEquals(label, 'Drill — Zipper');
});

Deno.test('§6.6 sighting → "Drill — Sighting" (no equipment, race-specific only)', () => {
  const label = drillLabelWithGear(
    'swim_drills_4x50yd_sighting',
    'Sighting',
    owns('fins'),
  );
  assertEquals(label, 'Drill — Sighting');
});

// ── Token-suffix robustness: trailing _r15 / _fins should not break lookup ─

Deno.test('§6.6 robustness: token with _r15 + _fins decorations still resolves drill key', () => {
  const label = drillLabelWithGear(
    'swim_drills_3x100yd_fingertipdrag_r15_fins',
    'Fingertip Drag',
    owns('fins'),
  );
  assert(label.includes('fins'), `expected fins hint; got: ${label}`);
});

// ── Multiple owned recommendations — alpha order, comma-joined ──────────────

Deno.test('§6.6 fingertipdrag with multiple owned recommendations stays single ("fins")', () => {
  // Fingertipdrag only recommends fins (snorkel is optional, not recommended).
  // Athlete owns paddles too — paddles must NOT appear (not in §6.6 recommendation table).
  const label = drillLabelWithGear(
    'swim_drills_3x100yd_fingertipdrag',
    'Fingertip Drag',
    owns('fins', 'snorkel', 'paddles'),
  );
  assertEquals(label, 'Drill — Fingertip Drag (fins)');
});

// ── Form Goggles + Garmin consumption ───────────────────────────────────────

Deno.test('§6.6 label format: lowercase gear inside parens, no period (Garmin-friendly)', () => {
  const label = drillLabelWithGear(
    'swim_drills_3x100yd_fist',
    'Fist',
    owns('fins'),
  );
  assert(/\(fins\)$/.test(label), `expected "(fins)" suffix; got: ${label}`);
  assert(!/Fins/.test(label.split('—')[1] || ''), `gear inside parens should be lowercase; got: ${label}`);
});

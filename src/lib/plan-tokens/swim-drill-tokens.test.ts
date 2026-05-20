/**
 * Unit tests for the swim drill token system: display name lookup, sighting drill presence,
 * gear-line formatter, and equipment-aware session-type substitution.
 *
 * Run from repo root:
 *   deno test --no-lock --allow-all src/lib/plan-tokens/swim-drill-tokens.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildSwimGearLine,
  DRILL_EQUIPMENT_MAP,
  filterSwimDrillTokensByGear,
  pickSwimDrillInset,
  resolveSwimSessionTypeForGear,
  swimDrillBlockAthleteCopy,
  swimDrillDisplayName,
  swimDrillDisplayNameFromToken,
  swimDrillStrokePhase,
  SWIM_DRILL_ALIAS,
  SWIM_DRILL_STROKE_PHASE,
  SWIM_DRILL_TOKEN_POOL,
  swimGearNormalized,
} from './swim-drill-tokens.ts';

// ── §1 display name lookup ──────────────────────────────────────────────────

Deno.test('swimDrillDisplayName: catchup → Catch-Up', () => {
  assertEquals(swimDrillDisplayName('catchup'), 'Catch-Up');
});

Deno.test('swimDrillDisplayName: fingertipdrag → Fingertip Drag', () => {
  assertEquals(swimDrillDisplayName('fingertipdrag'), 'Fingertip Drag');
});

Deno.test('swimDrillDisplayName: fist → Fist Swim', () => {
  assertEquals(swimDrillDisplayName('fist'), 'Fist Swim');
});

Deno.test('swimDrillDisplayName: singlearm → Single-Arm Freestyle', () => {
  assertEquals(swimDrillDisplayName('singlearm'), 'Single-Arm Freestyle');
});

Deno.test('swimDrillDisplayName: 616 → 6-3-6 Rotation', () => {
  assertEquals(swimDrillDisplayName('616'), '6-3-6 Rotation');
});

Deno.test('swimDrillDisplayName: zipper → Zipper Drill', () => {
  assertEquals(swimDrillDisplayName('zipper'), 'Zipper Drill');
});

Deno.test('swimDrillDisplayName: scull → Sculling', () => {
  assertEquals(swimDrillDisplayName('scull'), 'Sculling');
});

Deno.test('swimDrillDisplayName: scullfront → Front Sculling', () => {
  assertEquals(swimDrillDisplayName('scullfront'), 'Front Sculling');
});

Deno.test('swimDrillDisplayName: kick → Kick', () => {
  assertEquals(swimDrillDisplayName('kick'), 'Kick');
});

Deno.test('swimDrillDisplayName: doggypaddle → Doggy Paddle', () => {
  assertEquals(swimDrillDisplayName('doggypaddle'), 'Doggy Paddle');
});

Deno.test('swimDrillDisplayName: snorkel_freeswim → Snorkel Freestyle', () => {
  assertEquals(swimDrillDisplayName('snorkel_freeswim'), 'Snorkel Freestyle');
});

Deno.test('swimDrillDisplayName: sighting → Sighting Drill', () => {
  assertEquals(swimDrillDisplayName('sighting'), 'Sighting Drill');
});

Deno.test('swimDrillDisplayName: unknown suffix → Title Case fallback', () => {
  assertEquals(swimDrillDisplayName('mystery_drill'), 'Mystery Drill');
});

Deno.test('swimDrillDisplayName: empty/null → empty string', () => {
  assertEquals(swimDrillDisplayName(''), '');
  // @ts-expect-error null is valid runtime input
  assertEquals(swimDrillDisplayName(null), '');
});

// ── §2 token-level display lookup ───────────────────────────────────────────

Deno.test('swimDrillDisplayNameFromToken: standard 4×50 fingertipdrag', () => {
  assertEquals(swimDrillDisplayNameFromToken('swim_drills_4x50yd_fingertipdrag'), 'Fingertip Drag');
});

Deno.test('swimDrillDisplayNameFromToken: with rest decoration', () => {
  // _r15 is decoration, not part of the drill key.
  assertEquals(swimDrillDisplayNameFromToken('swim_drills_4x50yd_fingertipdrag_r15'), 'Fingertip Drag');
});

Deno.test('swimDrillDisplayNameFromToken: with equipment decoration', () => {
  assertEquals(swimDrillDisplayNameFromToken('swim_drills_4x50yd_kick_board'), 'Kick');
});

Deno.test('swimDrillDisplayNameFromToken: non-drill token returns empty', () => {
  assertEquals(swimDrillDisplayNameFromToken('swim_warmup_300yd_easy'), '');
});

// ── §3 sighting drill is fully wired ────────────────────────────────────────

Deno.test('sighting: is in alias map', () => {
  assertEquals(SWIM_DRILL_ALIAS.sighting, 'swim_drills_4x50yd_sighting');
});

Deno.test('sighting: is in token pool', () => {
  assert(SWIM_DRILL_TOKEN_POOL.includes('swim_drills_4x50yd_sighting'));
  assert(SWIM_DRILL_TOKEN_POOL.includes('swim_drills_2x50yd_sighting'));
});

Deno.test('sighting: equipment map exists with no requirements', () => {
  assertEquals(DRILL_EQUIPMENT_MAP.sighting, { required: [], optional: [] });
});

// ── §4 swimDrillBlockAthleteCopy uses display names ────────────────────────

Deno.test('swimDrillBlockAthleteCopy: emits display names + cues', () => {
  const out = swimDrillBlockAthleteCopy(['swim_drills_4x50yd_fingertipdrag']);
  assert(out.includes('Fingertip Drag'));
  assert(out.includes('high-elbow recovery'));
  assert(!out.includes('fingertipdrag')); // no raw key in output
});

Deno.test('swimDrillBlockAthleteCopy: handles 6-3-6 token correctly', () => {
  const out = swimDrillBlockAthleteCopy(['swim_drills_4x50yd_616']);
  assert(out.includes('6-3-6 Rotation'));
  assert(out.includes('kick-driven side balance'));
});

Deno.test('swimDrillBlockAthleteCopy: empty input → empty string', () => {
  assertEquals(swimDrillBlockAthleteCopy([]), '');
});

// ── §5 buildSwimGearLine: required + optional formatting ────────────────────

Deno.test('gear line: required + athlete-owned optional', () => {
  // Pull-focused: required pull buoy. Athlete owns paddles + snorkel.
  const line = buildSwimGearLine({
    sessionRequired: ['pull buoy'],
    drillTokens: ['swim_drills_4x50yd_fingertipdrag'], // optional snorkel from drill
    athleteGearLabels: ['Pull buoy', 'Paddles', 'Snorkel'],
  });
  assertEquals(line, 'Pool gear — Required: Pull buoy. Optional: Snorkel.');
});

Deno.test('gear line: drill optional filtered to owned-only', () => {
  // Drill suggests snorkel as optional but athlete doesn't own one → omit.
  const line = buildSwimGearLine({
    drillTokens: ['swim_drills_4x50yd_fingertipdrag'],
    athleteGearLabels: ['Pull buoy'], // no snorkel
  });
  // No required, no athlete-owned optional → null.
  assertEquals(line, null);
});

Deno.test('gear line: optional only (no required)', () => {
  const line = buildSwimGearLine({
    drillTokens: ['swim_drills_4x50yd_fingertipdrag'],
    athleteGearLabels: ['Snorkel'],
  });
  assertEquals(line, 'Pool gear — Optional: Snorkel.');
});

Deno.test('gear line: nothing required, athlete owns nothing useful → null', () => {
  const line = buildSwimGearLine({
    drillTokens: [],
    athleteGearLabels: ['Goggles'],
  });
  assertEquals(line, null);
});

Deno.test('gear line: required de-duped against optional', () => {
  // Pull buoy is required AND drill optional — should not appear twice.
  const line = buildSwimGearLine({
    sessionRequired: ['pull buoy'],
    drillTokens: ['swim_drills_4x50yd_scullfront'], // requires pull buoy
    athleteGearLabels: ['Pull buoy'],
  });
  assertEquals(line, 'Pool gear — Required: Pull buoy.');
});

Deno.test('gear line: kick-focused short-course (kickboard required)', () => {
  // Mirror what kickFocusedSwim does for sprint/oly.
  const line = buildSwimGearLine({
    sessionRequired: ['kickboard'],
    drillTokens: [],
    athleteGearLabels: ['Kickboard'],
  });
  assertEquals(line, 'Pool gear — Required: Kickboard.');
});

Deno.test('gear line: kick-focused long-course (fins required)', () => {
  const line = buildSwimGearLine({
    sessionRequired: ['fins'],
    drillTokens: [],
    athleteGearLabels: ['Fins'],
  });
  assertEquals(line, 'Pool gear — Required: Fins.');
});

// ── §6 resolveSwimSessionTypeForGear: substitution semantics ────────────────

Deno.test('substitution: pull_focused with pull buoy → pass through', () => {
  const r = resolveSwimSessionTypeForGear({
    requestedType: 'pull_focused',
    athleteGearLabels: ['Pull buoy'],
  });
  assertEquals(r.resolvedType, 'pull_focused');
  assertEquals(r.substituted, false);
  assertEquals(r.missingRequired, []);
});

Deno.test('substitution: pull_focused without pull buoy → endurance', () => {
  const r = resolveSwimSessionTypeForGear({
    requestedType: 'pull_focused',
    athleteGearLabels: ['Kickboard'], // no pull buoy
  });
  assertEquals(r.resolvedType, 'endurance');
  assertEquals(r.substituted, true);
  assertEquals(r.missingRequired, ['pull buoy']);
  assertEquals(r.requestedType, 'pull_focused');
});

Deno.test('substitution: kick_focused with kickboard → pass through (sprint)', () => {
  const r = resolveSwimSessionTypeForGear({
    requestedType: 'kick_focused',
    athleteGearLabels: ['Kickboard'],
    kickFocusedRequiredGear: ['kickboard'],
  });
  assertEquals(r.resolvedType, 'kick_focused');
  assertEquals(r.substituted, false);
});

Deno.test('substitution: kick_focused without kickboard → endurance (sprint)', () => {
  const r = resolveSwimSessionTypeForGear({
    requestedType: 'kick_focused',
    athleteGearLabels: ['Pull buoy'],
    kickFocusedRequiredGear: ['kickboard'],
  });
  assertEquals(r.resolvedType, 'endurance');
  assertEquals(r.substituted, true);
  assertEquals(r.missingRequired, ['kickboard']);
});

Deno.test('substitution: kick_focused without fins → endurance (70.3 long-course)', () => {
  const r = resolveSwimSessionTypeForGear({
    requestedType: 'kick_focused',
    athleteGearLabels: ['Kickboard'], // wrong gear for long course
    kickFocusedRequiredGear: ['fins'],
  });
  assertEquals(r.resolvedType, 'endurance');
  assertEquals(r.substituted, true);
  assertEquals(r.missingRequired, ['fins']);
});

Deno.test('substitution: non-gear types pass through unchanged', () => {
  for (const t of ['easy', 'css_aerobic', 'threshold', 'speed', 'endurance', 'technique_aerobic'] as const) {
    const r = resolveSwimSessionTypeForGear({
      requestedType: t,
      athleteGearLabels: [], // no gear at all
    });
    assertEquals(r.resolvedType, t, `${t} should pass through`);
    assertEquals(r.substituted, false, `${t} should not be marked substituted`);
  }
});

Deno.test('substitution: empty/null gear labels ⇒ pull_focused becomes endurance', () => {
  const r = resolveSwimSessionTypeForGear({
    requestedType: 'pull_focused',
    athleteGearLabels: null,
  });
  assertEquals(r.resolvedType, 'endurance');
  assertEquals(r.substituted, true);
});

// ── §7 sighting filtered by gear (no-equipment, always allowed) ─────────────

Deno.test('sighting: passes gear filter (no required equipment)', () => {
  const tokens = ['swim_drills_4x50yd_sighting'];
  const filtered = filterSwimDrillTokensByGear(tokens, swimGearNormalized([]));
  assertEquals(filtered, tokens);
});

// ── §8 stroke-phase metadata + §6.3 distinct-phase pairing (Slice 3b) ────────

Deno.test('swimDrillStrokePhase: maps §6.1 drills to canonical phases', () => {
  assertEquals(swimDrillStrokePhase('swim_drills_4x50yd_catchup'), 'timing');
  assertEquals(swimDrillStrokePhase('swim_drills_4x50yd_fingertipdrag'), 'recovery');
  assertEquals(swimDrillStrokePhase('swim_drills_4x50yd_fist'), 'catch');
  assertEquals(swimDrillStrokePhase('swim_drills_4x50yd_singlearm'), 'rotation');
  assertEquals(swimDrillStrokePhase('swim_drills_4x50yd_616'), 'rotation');
  assertEquals(swimDrillStrokePhase('swim_drills_4x50yd_zipper'), 'recovery');
  assertEquals(swimDrillStrokePhase('swim_drills_4x50yd_scull'), 'catch');
  assertEquals(swimDrillStrokePhase('swim_drills_4x50yd_scullfront'), 'catch');
  assertEquals(swimDrillStrokePhase('swim_drills_2x50yd_sighting'), 'race_specific');
  assertEquals(swimDrillStrokePhase('swim_drills_4x50yd_kick'), 'body_position');
  assertEquals(swimDrillStrokePhase('swim_drills_4x50yd_snorkel_freeswim'), 'body_position');
});

Deno.test('swimDrillStrokePhase: tolerates trailing rest/equipment markers', () => {
  assertEquals(swimDrillStrokePhase('swim_drills_4x50yd_catchup_r15'), 'timing');
  assertEquals(swimDrillStrokePhase('swim_drills_4x50yd_scull_buoy'), 'catch');
});

Deno.test('swimDrillStrokePhase: non-drill token → null', () => {
  assertEquals(swimDrillStrokePhase('swim_warmup_300yd_easy'), null);
});

Deno.test('SWIM_DRILL_STROKE_PHASE: every DRILL_EQUIPMENT_MAP suffix is categorized', () => {
  for (const suffix of Object.keys(DRILL_EQUIPMENT_MAP)) {
    assert(
      SWIM_DRILL_STROKE_PHASE[suffix] !== undefined,
      `drill suffix "${suffix}" is in DRILL_EQUIPMENT_MAP but missing a stroke-phase mapping`,
    );
  }
});

Deno.test('pickSwimDrillInset Path A (§5.1): distinct-phase pairing — no two drills share a §6.1 stroke phase', () => {
  // Technique easy with a generous budget (the technique session that emits 2-3 drills).
  // Base pool post-Phase 2 includes catchup (timing), fingertipdrag (recovery), singlearm
  // (rotation), 616 (rotation), fist (catch), kick (body_position) — the naive ranked
  // walk would pick catchup 2×50 + fingertipdrag 2×50 + catchup 4×50 (timing/recovery/timing)
  // pre-Slice 3b. Asserts the §6.3 rule prevents that pairing.
  const result = pickSwimDrillInset({
    totalYards: 3200,
    wuYd: 300,
    cdYd: 200,
    planWeek: 4,
    drillSlotSalt: 0,
    phase: 'base',
    sessionKind: 'easy',
    techniqueDrillEmphasis: true,
    swimGearLabels: null,
  });
  assert(result.drillTokens.length >= 2, `expected ≥2 drills in a technique easy session; got ${result.drillTokens.length}`);
  const phases = result.drillTokens.map((t) => swimDrillStrokePhase(t));
  const seen = new Set<string>();
  for (const p of phases) {
    if (p == null) continue;
    assert(!seen.has(p), `§6.3 violation: stroke phase "${p}" appears twice in [${phases.join(', ')}] (tokens: [${result.drillTokens.join(', ')}])`);
    seen.add(p);
  }
});

Deno.test('pickSwimDrillInset Path A (§5.1): fallback fills ≥2 drills even when distinct-phase exhausts', () => {
  // Pool-diversity stress test — even if the gear filter were to leave the pool
  // dominated by one phase, the permissive 2nd pass must still reach ≥1 drill
  // (and ≥2 when budget allows). Uses default gear (no filter), so this exercises
  // the success path. The companion assertion: 0 drills only when budget too tight.
  const result = pickSwimDrillInset({
    totalYards: 3200,
    wuYd: 300,
    cdYd: 200,
    planWeek: 1,
    drillSlotSalt: 0,
    phase: 'base',
    sessionKind: 'easy',
    techniqueDrillEmphasis: true,
    swimGearLabels: null,
  });
  assert(result.drillTokens.length >= 2, `expected ≥2 drills under §5.1 with generous budget; got ${result.drillTokens.length}`);
});

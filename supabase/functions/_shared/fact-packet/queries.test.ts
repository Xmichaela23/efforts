/**
 * Tests for D-038 Piece 2 + Piece 3 — pure helpers extracted from
 * buildSimilarSignal so the filter logic + intensity_match classifier are
 * unit-testable without supabase mocking.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/fact-packet/queries.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  isPaceWithinTolerance,
  classifyPoolIntensityMatch,
  POOL_PACE_TOLERANCE_PCT,
  POOL_INTENSITY_MATCH_PCT,
} from './queries.ts';

// ── Locked constants ──────────────────────────────────────────────────────

Deno.test('D-038 §8 #1: POOL_PACE_TOLERANCE_PCT locked at 15', () => {
  assertEquals(POOL_PACE_TOLERANCE_PCT, 15);
});

Deno.test('D-038 §8 #3: POOL_INTENSITY_MATCH_PCT locked at 10', () => {
  assertEquals(POOL_INTENSITY_MATCH_PCT, 10);
});

// ── isPaceWithinTolerance ────────────────────────────────────────────────

Deno.test('D-038 Piece 2: pace within 15% of current returns true', () => {
  // current 564 sec/mi (9:24/mi), candidate 600 sec/mi (10:00/mi) = 6.4% gap
  assertEquals(isPaceWithinTolerance(600, 564, 15), true);
});

Deno.test('D-038 Piece 2: pace just inside the 15% boundary (true)', () => {
  // current 564, candidate at exactly 15% slower = 648.6
  assertEquals(isPaceWithinTolerance(648, 564, 15), true);
});

Deno.test('D-038 Piece 2: pace beyond 15% (recovery jog vs fartlek) returns false', () => {
  // The b70658b0 case: current 564 (9:24/mi), historical 733 (12:13/mi) → 30% slower
  assertEquals(isPaceWithinTolerance(733, 564, 15), false);
});

Deno.test('D-038 Piece 2: faster candidate also subject to tolerance (symmetric)', () => {
  // current 564, candidate 400 (much faster) → 29% gap → out
  assertEquals(isPaceWithinTolerance(400, 564, 15), false);
});

Deno.test('D-038 Piece 2: null candidate pace → false', () => {
  assertEquals(isPaceWithinTolerance(null, 564, 15), false);
});

Deno.test('D-038 Piece 2: null current pace → false', () => {
  assertEquals(isPaceWithinTolerance(600, null, 15), false);
});

Deno.test('D-038 Piece 2: zero or negative current pace → false (no division by zero)', () => {
  assertEquals(isPaceWithinTolerance(600, 0, 15), false);
  assertEquals(isPaceWithinTolerance(600, -100, 15), false);
});

// ── classifyPoolIntensityMatch ────────────────────────────────────────────

Deno.test('D-038 Piece 3: current much faster than pool (b70658b0 case)', () => {
  // current 564 sec/mi vs pool avg 757 (mean of 733/797/681/711/717) → 25.4% faster
  assertEquals(classifyPoolIntensityMatch(564, 757, 10), 'current_much_faster');
});

Deno.test('D-038 Piece 3: current much slower than pool', () => {
  // current 720 vs pool 540 → 33% slower
  assertEquals(classifyPoolIntensityMatch(720, 540, 10), 'current_much_slower');
});

Deno.test('D-038 Piece 3: matched (5% diff inside the 10% band)', () => {
  // current 567 vs pool 540 → 5% slower
  assertEquals(classifyPoolIntensityMatch(567, 540, 10), 'matched');
});

Deno.test('D-038 Piece 3: exactly at 10% boundary (boundary inclusive — much_slower)', () => {
  // current 594 vs pool 540 → exactly 10% slower
  assertEquals(classifyPoolIntensityMatch(594, 540, 10), 'current_much_slower');
});

Deno.test('D-038 Piece 3: exactly at -10% boundary (boundary inclusive — much_faster)', () => {
  // current 486 vs pool 540 → exactly 10% faster
  assertEquals(classifyPoolIntensityMatch(486, 540, 10), 'current_much_faster');
});

Deno.test('D-038 Piece 3: just inside band (9% slower) → matched', () => {
  assertEquals(classifyPoolIntensityMatch(589, 540, 10), 'matched');
});

Deno.test('D-038 Piece 3: zero pool pace → safe default (matched)', () => {
  assertEquals(classifyPoolIntensityMatch(564, 0, 10), 'matched');
});

// ── End-to-end intent: the b70658b0 narrative test ────────────────────────

Deno.test('D-038 b70658b0 fixture: filter excludes 11-13 min/mi historicals from 9:24/mi current', () => {
  // Simulates the actual pool from the audit dump:
  //   current 564 sec/mi (9:24/mi)
  //   historicals 733/797/681/711 (12:13, 13:17, 11:21, 11:51)
  // None should pass the 15% filter; classifyPoolIntensityMatch should
  // surface 'current_much_faster' against the pool average.
  const current = 564;
  const historicals = [733, 797, 681, 711];
  const passing = historicals.filter((p) => isPaceWithinTolerance(p, current, POOL_PACE_TOLERANCE_PCT));
  assertEquals(passing.length, 0);
  const poolAvg = historicals.reduce((a, b) => a + b, 0) / historicals.length;
  assertEquals(classifyPoolIntensityMatch(current, poolAvg, POOL_INTENSITY_MATCH_PCT), 'current_much_faster');
});

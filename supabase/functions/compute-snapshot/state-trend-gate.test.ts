/**
 * PERMANENT REGRESSION — the Q-252 Sunday State blackout. [2026-08-10]
 *
 * Run from repo root:
 *   deno test supabase/functions/compute-snapshot/state-trend-gate.test.ts --no-check
 *
 * Two things are pinned here and neither may be relaxed:
 *   (a) a LIVE call (no `week_start`) builds the rolling state-trend read at ANY wall-clock,
 *       including 17:00 Pacific on Sunday — the exact instant that blanked State, because the
 *       UTC edge runtime is already on Monday by then;
 *   (b) an explicit PAST `week_start` (a historical recompute) skips AND says so in one log line.
 *
 * Deterministic — no DB, no LLM, no network. The wall-clock is injected as `mondayNow`, and
 * `mondayOfUtcInstant` derives it from a real instant so the Sunday seam is pinned to the clock
 * rather than to a hand-typed date.
 */
import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { mondayOfUtcInstant, stateTrendGate } from './state-trend-gate.ts';

// The blackout instant: Sunday 2026-08-02, 17:00 America/Los_Angeles = Monday 2026-08-03 00:00 UTC.
const BLACKOUT_INSTANT = new Date('2026-08-03T00:00:00Z');
// The athlete's real current week at that instant (Monday 2026-07-27 → Sunday 2026-08-02).
const ATHLETE_CURRENT_WEEK = '2026-07-27';

// ── §0 the seam itself — this is what makes the repro real ────────────────

Deno.test('the UTC seam: at 17:00 Pacific Sunday the edge clock already says Monday 2026-08-03', () => {
  assertEquals(mondayOfUtcInstant(BLACKOUT_INSTANT), '2026-08-03');
  // One hour earlier — 16:00 Pacific, still Sunday in UTC — it agrees with the athlete.
  assertEquals(mondayOfUtcInstant(new Date('2026-08-02T23:00:00Z')), ATHLETE_CURRENT_WEEK);
  // That disagreement is the whole bug: the old gate compared these two strings for equality.
  assert(mondayOfUtcInstant(BLACKOUT_INSTANT) !== ATHLETE_CURRENT_WEEK);
});

// ── §1 (a) the live call builds at any wall-clock — the blackout repro ────

Deno.test('BLACKOUT REPRO: live call (no week_start) builds at 17:00 Pacific Sunday', () => {
  const mondayNow = mondayOfUtcInstant(BLACKOUT_INSTANT); // '2026-08-03'
  // A live caller passes no week_start, so index.ts resolves targetWeek = mondayOfToday().
  const v = stateTrendGate({ bodyWeekStart: undefined, targetWeek: mondayNow, mondayNow });
  assertEquals(v.build, true, 'the live path must never be skipped by the clock');
  assertEquals(v.skipReason, null);
});

Deno.test('live call builds on the safe side of the seam too (16:00 Pacific Sunday)', () => {
  const mondayNow = mondayOfUtcInstant(new Date('2026-08-02T23:00:00Z')); // '2026-07-27'
  const v = stateTrendGate({ bodyWeekStart: undefined, targetWeek: mondayNow, mondayNow });
  assertEquals(v.build, true);
});

Deno.test('live call builds at every hour of the blackout Sunday — no wall-clock dependence', () => {
  // Sweep the full 24h of Sunday 2026-08-02 Pacific (07:00Z Sun → 07:00Z Mon) at hourly steps.
  const startMs = Date.UTC(2026, 7, 2, 7, 0, 0);
  for (let h = 0; h <= 24; h++) {
    const instant = new Date(startMs + h * 3600_000);
    const mondayNow = mondayOfUtcInstant(instant);
    const v = stateTrendGate({ bodyWeekStart: null, targetWeek: mondayNow, mondayNow });
    assertEquals(v.build, true, `skipped at ${instant.toISOString()} — the clock leaked back into the gate`);
  }
});

Deno.test('live call builds even when its own week straddles the seam (targetWeek = UTC Monday)', () => {
  // The live path writes the UTC-Monday row post-seam. It must be a full contract, not null —
  // that row is the one `coach/index.ts:2323` reads (max week_start <= mondayOfToday()).
  const v = stateTrendGate({ bodyWeekStart: undefined, targetWeek: '2026-08-03', mondayNow: '2026-08-03' });
  assertEquals(v.build, true);
});

// ── §2 (b) the historical recompute skips, and logs ───────────────────────

Deno.test('historical recompute (explicit past week_start) skips', () => {
  const v = stateTrendGate({
    bodyWeekStart: '2026-06-01',
    targetWeek: '2026-06-01',
    mondayNow: '2026-08-03',
  });
  assertEquals(v.build, false);
});

Deno.test('the skip is NOT silent — it names the reason and the week', () => {
  const v = stateTrendGate({
    bodyWeekStart: '2026-06-01',
    targetWeek: '2026-06-01',
    mondayNow: '2026-08-03',
  });
  assert(typeof v.skipReason === 'string' && v.skipReason.length > 0, 'a skipped build must log');
  assertStringIncludes(v.skipReason!, 'state_trends_v1 skipped');
  assertStringIncludes(v.skipReason!, 'historical recompute');
  assertStringIncludes(v.skipReason!, 'week_start=2026-06-01');
});

Deno.test('explicit week_start for the CURRENT week still builds', () => {
  // recompute-workout of a workout in the current week passes week_start == mondayNow.
  const v = stateTrendGate({
    bodyWeekStart: '2026-08-03',
    targetWeek: '2026-08-03',
    mondayNow: '2026-08-03',
  });
  assertEquals(v.build, true);
});

Deno.test('explicit FUTURE week_start builds (only PAST is historical)', () => {
  const v = stateTrendGate({
    bodyWeekStart: '2026-08-10',
    targetWeek: '2026-08-10',
    mondayNow: '2026-08-03',
  });
  assertEquals(v.build, true);
});

// ── §3 the shape of the input, pinned ─────────────────────────────────────

Deno.test('an empty-string week_start counts as absent, not as a past week', () => {
  const v = stateTrendGate({ bodyWeekStart: '', targetWeek: '2026-07-27', mondayNow: '2026-08-03' });
  assertEquals(v.build, true, 'no week was actually named — treat it as the live path');
});

Deno.test('null week_start counts as absent', () => {
  const v = stateTrendGate({ bodyWeekStart: null, targetWeek: '2026-07-27', mondayNow: '2026-08-03' });
  assertEquals(v.build, true);
});

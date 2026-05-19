/**
 * Race-week Phase 4 — Gap 6 contract tests (activation-swim scoped to race week only).
 *
 * RACE-WEEK-PROTOCOL §8.6 / Gap 6 (decision 2026-05-18): the threshold→activation
 * swim substitution must fire ONLY in the actual race week, not every taper week.
 * After Phase 3 the A-taper is genuinely 2 weeks; its earlier (non-race) week
 * must keep SWIM §4.4 Race-Spec Light / threshold — not be de-loaded a week early.
 * The substitution is now gated on `opts.isRaceWeek` (week-builder threads
 * Boolean(raceThisWeek) via swimFromTplOpts to all 4 swimSessionFromTemplate sites).
 *
 * Run from repo root:
 *   deno test --no-check --no-lock --allow-all \
 *     supabase/functions/generate-combined-plan/race-week-phase4.test.ts
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { swimSessionFromTemplate } from './session-factory.ts';
import {
  checkRaceWeekNoBrick,
  checkRaceWeekLongDayCaps,
  checkRaceWeekBlockOrdering,
} from './validator.ts';

// Minimal threshold template — swimSessionFromTemplate reads session_type +
// target_yards; --no-check tolerates the loose cast (matches sibling tests).
const thresholdTpl = { session_type: 'threshold', target_yards: 2000 } as any;

Deno.test('Gap 6 — race week (taper + isRaceWeek): threshold → Race-Week Activation Swim', () => {
  const s = swimSessionFromTemplate(
    thresholdTpl, 2000, 'Friday', 17, 'taper', 'g', 0, undefined, { isRaceWeek: true },
  );
  assertEquals(s.type, 'swim');
  assert(
    s.name.includes('Race-Week Activation Swim'),
    `expected activation swim in the race week; got "${s.name}"`,
  );
  // yards clamped to 600-800 → "… — 800 yd"
  assert(s.name.includes('800 yd'), `expected 800yd clamp; got "${s.name}"`);
});

Deno.test('Gap 6 REGRESSION GUARD — non-race A-taper week (taper, isRaceWeek:false): NOT activation', () => {
  const s = swimSessionFromTemplate(
    thresholdTpl, 2000, 'Friday', 16, 'taper', 'g', 0, undefined, { isRaceWeek: false },
  );
  assertEquals(s.type, 'swim');
  assert(
    !s.name.includes('Activation'),
    `Phase-3 regression: week-16 A-taper-wk1 must keep Race-Spec Light/threshold, ` +
      `NOT be de-loaded to activation; got "${s.name}"`,
  );
});

Deno.test('Gap 6 — opts omitted in a taper week: substitution does NOT fire (opt-in only)', () => {
  // Back-compat: the substitution is now opt-in via opts.isRaceWeek. With no
  // opts the old `phase==='taper'` blanket trigger must no longer activate.
  const s = swimSessionFromTemplate(
    thresholdTpl, 2000, 'Friday', 16, 'taper', 'g', 0, undefined,
  );
  assertEquals(s.type, 'swim');
  assert(
    !s.name.includes('Activation'),
    `substitution must be gated on opts.isRaceWeek; got "${s.name}"`,
  );
});

Deno.test('Gap 6 — non-taper phase ignores isRaceWeek (phase guard intact)', () => {
  const s = swimSessionFromTemplate(
    thresholdTpl, 2000, 'Friday', 8, 'build', 'g', 0, undefined, { isRaceWeek: true },
  );
  assertEquals(s.type, 'swim');
  assert(
    !s.name.includes('Activation'),
    `activation is taper-phase-only; a build-week threshold must stay threshold; got "${s.name}"`,
  );
});

// ── Gap 9 (b/c/d): soft race-week validator regression guards ───────────────

const sess = (tags: string[], duration = 30) => ({ tags, duration, type: 'run', day: 'Sunday' });
const wk = (race_week: 'A' | 'B' | null, phase: string, sessions: unknown[] = []) =>
  ({ weekNum: 1, race_week, phase, sessions } as any);

Deno.test('Gap 9b — race-week no-brick: pass when clean / non-race brick ignored; fail on race-week brick', () => {
  assertEquals(checkRaceWeekNoBrick([wk('A', 'taper', [sess(['race'])]), wk(null, 'build', [sess(['brick'])])]), true);
  assertEquals(checkRaceWeekNoBrick([wk('B', 'taper', [sess(['brick'])])]), false);
});

Deno.test('Gap 9c — race-week long-day caps: absence=PASS, at-cap=PASS, over-cap=FAIL, non-race ignored', () => {
  assertEquals(checkRaceWeekLongDayCaps([wk('A', 'taper', [sess(['race'])])]), true, 'no long day = pass');
  assertEquals(checkRaceWeekLongDayCaps([wk('A', 'taper', [sess(['long_run'], 45)])]), true, 'long_run 45 = pass');
  assertEquals(checkRaceWeekLongDayCaps([wk('A', 'taper', [sess(['long_ride'], 60)])]), true, 'long_ride 60 = pass');
  assertEquals(checkRaceWeekLongDayCaps([wk('B', 'taper', [sess(['long_run'], 60)])]), false, 'long_run 60 = fail');
  assertEquals(checkRaceWeekLongDayCaps([wk('A', 'taper', [sess(['long_ride'], 90)])]), false, 'long_ride 90 = fail');
  assertEquals(checkRaceWeekLongDayCaps([wk(null, 'build', [sess(['long_run'], 180)])]), true, 'non-race ignored');
});

Deno.test('Gap 9d — block ordering: B→recovery→rebuild→A pass; missing rebuild / wrong order fail; no-B vacuous pass', () => {
  const ok = [wk('B', 'taper'), wk(null, 'recovery'), wk(null, 'rebuild'), wk('A', 'taper')];
  assertEquals(checkRaceWeekBlockOrdering(ok), true);
  assertEquals(checkRaceWeekBlockOrdering([wk('B', 'taper'), wk(null, 'recovery'), wk('A', 'taper')]), false, 'no rebuild between');
  assertEquals(checkRaceWeekBlockOrdering([wk('B', 'taper'), wk(null, 'rebuild'), wk(null, 'recovery'), wk('A', 'taper')]), false, 'rebuild before recovery');
  assertEquals(checkRaceWeekBlockOrdering([wk('A', 'taper'), wk(null, 'base')]), true, 'single-race / no B = vacuous pass');
});

/**
 * Run: deno test src/lib/nudge-policy.test.ts --no-check
 *
 * Pins the SIGNAL gate (2026-07-18): only non-redundant, actionable longitudinal signals earn a
 * home-screen nudge. Signals that duplicate the FITNESS / BODY cards or the week accent are suppressed.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { shouldShowNudge } from './nudge-policy.ts';

const sig = (id: string, severity: string, category = 'pattern') =>
  ({ id, severity, category, headline: id, detail: id }) as any;
const payload = (...signals: any[]) => ({ generated_at: '', window_weeks: 4, signals }) as any;

// ── The exact screenshot case: a consistency dip duplicates the week accent → must NOT nudge. ──
Deno.test('redundant skip_pattern concern is suppressed', () => {
  assertEquals(shouldShowNudge(payload(sig('skip_pattern_strength', 'concern', 'adherence'))).show, false);
});

// ── Every card-duplicating signal is blocked, even at concern severity. ──
Deno.test('redundant e1rm / pace / efficiency signals never nudge', () => {
  for (const id of ['e1rm_improving', 'e1rm_plateau', 'threshold_pace_plateau', 'threshold_pace_improving',
    'ride_efficiency_factor_trending_down', 'ride_hr_drift_trending_up', 'snapshot_ride_efficiency_wow_down']) {
    assertEquals(shouldShowNudge(payload(sig(id, 'concern'))).show, false, id);
  }
});

// ── Distinct signals DO earn the slot. ──
Deno.test('a distinct concern shows', () => {
  const d = shouldShowNudge(payload(sig('chronic_short_sleep', 'concern')));
  assertEquals(d.show, true);
  assertEquals(d.nudge_kind, 'chronic_short_sleep');
});

Deno.test('a redundant concern cannot shadow a distinct one', () => {
  const d = shouldShowNudge(payload(sig('e1rm_plateau', 'concern'), sig('easy_pace_creeping_faster', 'concern')));
  assertEquals(d.nudge_kind, 'easy_pace_creeping_faster');
});

// ── The ≥2-warnings-in-a-category rule still holds, but only among distinct signals. ──
Deno.test('two distinct warnings in a category show; one alone does not', () => {
  assertEquals(shouldShowNudge(payload(sig('easy_pace_creeping_faster', 'warning', 'adherence'))).show, false);
  const two = shouldShowNudge(payload(
    sig('easy_pace_creeping_faster', 'warning', 'adherence'),
    sig('ride_easy_intensity_factor_up', 'warning', 'adherence'),
  ));
  assertEquals(two.show, true);
});

Deno.test('nothing to say → no nudge', () => {
  assertEquals(shouldShowNudge(payload()).show, false);
  assertEquals(shouldShowNudge(null).show, false);
});

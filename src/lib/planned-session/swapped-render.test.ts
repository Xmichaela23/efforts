/**
 * ═══ A SWAPPED SESSION MUST NOT RENDER THE SPORT IT WAS SWAPPED OUT OF. ═══════════════════════
 *
 * ⛔ THE LIVE BUG, IN THE ATHLETE'S WORDS (2026-08-09): a swapped Easy Ride displayed
 * *"5.0 mi @ run pace"*, and a swapped hard ride displayed the hill-RUN structure — warmup miles,
 * the repeats, and **"Walk down"** — under the name "Bike Intervals".
 *
 * ⛔ THE CAUSE WAS THE PATCH'S SCOPE, NOT THE RENDERERS. `buildSwapPatch` clears `steps_preset` and
 * `rendered_description` and NOTHING ELSE. `computed.steps`, `workout_structure`, `intervals` and
 * `export_hints` all survive a swap still holding the ORIGINAL sport's prescription — so every
 * surface that reads them renders a run inside a ride, correctly, from data nobody cleaned.
 *
 * ⚠️ THE FIX IS AT RENDER, AND DELIBERATELY SO. Blanking those columns in the patch would fix rows
 * swapped from now on and leave every ALREADY-swapped row broken — and `computed.steps` is the
 * THIRD RUNG of `plannedDurationSeconds`, so a session whose total was never materialised keeps its
 * only copy of the duration there. Deleting it would destroy the one thing a swap preserves.
 * The data stays readable; the renderers stop displaying it.
 *
 * Run:
 *   ~/.deno/bin/deno test --no-check --allow-read src/lib/planned-session/swapped-render.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  isDisciplineSwapped,
  swappedSessionBlock,
  getDisciplineSwaps,
} from '../session-discipline-swap.ts';
import { deriveWorkoutTitle } from '../derive-workout-title.ts';
import { plannedDurationSeconds } from './duration.ts';

/**
 * ⛔ THE REAL SHAPE. An easy run materialised to distance steps with a pace target, then swapped to
 * a ride — `type` and `name` changed, everything under them untouched. This is the row the athlete
 * was looking at.
 */
const SWAPPED_EASY_RIDE = {
  id: 'r1', type: 'ride', name: 'Easy Ride', date: '2026-08-18', workout_status: 'planned',
  total_duration_seconds: null,
  steps_preset: null,             // cleared by the patch
  rendered_description: null,     // cleared by the patch
  description: 'Easy, all conversational. Swapped from another sport — same time, no pace target.',
  tags: ['easy_run', 'discipline_swapped', 'swapped_from:run'],
  // ⚠️ NOT cleared by the patch — the RUN's prescription, still here.
  computed: { total_duration_seconds: null, steps: [
    { distanceMeters: 8046.7, paceTarget: '9:30/mi', seconds: 2865 },
  ] },
  workout_structure: { title: 'Easy Run — 5 mi', type: 'endurance_session' },
};

/** The hard case: a hill-repeat RUN swapped onto the bike. "Walk down" is a run-only instruction. */
const SWAPPED_HARD_RIDE = {
  id: 'r2', type: 'ride', name: 'Bike Intervals', date: '2026-08-20', workout_status: 'planned',
  total_duration_seconds: 3600,
  steps_preset: null, rendered_description: null,
  description: 'Swapped from another sport — the effort is the same, the surface is not.',
  tags: ['hard', 'discipline_swapped', 'swapped_from:run'],
  computed: { total_duration_seconds: 3600, steps: [
    { seconds: 900, label: 'Warm up 1.5 mi easy' },
    { seconds: 60, label: 'Hill repeat' },
    { seconds: 120, label: 'Walk down' },
  ] },
  workout_structure: { title: 'Hill Repeats', type: 'endurance_session' },
};

Deno.test('⛔ the swapped row is IDENTIFIABLE without relying on cleared columns', () => {
  assert(isDisciplineSwapped(SWAPPED_EASY_RIDE as never));
  assert(isDisciplineSwapped(SWAPPED_HARD_RIDE as never));
  // ⚠️ A row with no steps_preset is NOT a swap. That conflation is what let the bug survive.
  assert(!isDisciplineSwapped({ type: 'run', steps_preset: null, tags: ['easy_run'] } as never));
  assert(!isDisciplineSwapped(null));
});

Deno.test('⛔ THE TITLE — `workout_structure.title` must not override the swap\'s name', () => {
  /**
   * `structuredTitle` overrides `name`, and the patch never cleared `workout_structure`. So the
   * swapped hard ride announced itself as "Hill Repeats" — the run's title, on a ride.
   */
  assertEquals(deriveWorkoutTitle(SWAPPED_HARD_RIDE as never), 'Bike Intervals');
  assertEquals(deriveWorkoutTitle(SWAPPED_EASY_RIDE as never), 'Easy Ride');
});

Deno.test('⛔ THE BODY — time and effort only, no distance, no pace, no source-sport steps', () => {
  const easy = swappedSessionBlock(SWAPPED_EASY_RIDE as never);
  assertEquals(easy.effort, 'Easy ride, no pace target');
  const hard = swappedSessionBlock(SWAPPED_HARD_RIDE as never);
  assertEquals(hard.effort, 'Hard ride, no target');

  // The block names where the session came from, without carrying anything FROM it.
  assert(/planned run/i.test(easy.note), easy.note);

  for (const text of [easy.effort, easy.note, hard.effort, hard.note]) {
    assert(!/\d+(\.\d+)?\s*(mi|km|m)\b/i.test(text), `leaks a distance: ${text}`);
    assert(!/\d+:\d{2}\s*\/\s*(mi|km)/i.test(text), `leaks a pace: ${text}`);
    assert(!/walk down/i.test(text), `leaks a run-only instruction: ${text}`);
    assert(!/\bw(atts)?\b\s*\d|\d+\s*w\b/i.test(text), `leaks a power target: ${text}`);
  }
});

Deno.test('⛔ THE DURATION SURVIVES — this is what the swap exists to preserve', () => {
  /**
   * ⚠️ THE TRAP IN THE OBVIOUS FIX. `SWAPPED_EASY_RIDE` has NO root total: its only duration is
   * `computed.steps[0].seconds`. Blanking `computed` in the patch — the tempting one-line "clean
   * the row" — would have taken the session's time with it, and the swap gate itself
   * (`resolveMinutes`) would then answer 0 and refuse to offer any further swap.
   */
  assertEquals(SWAPPED_EASY_RIDE.total_duration_seconds, null, 'fixture precondition');
  assertEquals(plannedDurationSeconds(SWAPPED_EASY_RIDE as never), 2865);
  assertEquals(plannedDurationSeconds(SWAPPED_HARD_RIDE as never), 3600);
});

Deno.test('⚠️ THE PATCH STILL LEAVES THE SOURCE STRUCTURE ON THE ROW — pinned as today\'s reality', () => {
  /**
   * ⛔ THIS IS NOT AN ENDORSEMENT, IT IS A RECORD. The render-side fix is what the athlete sees; the
   * DATA is still dirty, and anything new that reads these columns without asking
   * `isDisciplineSwapped` first will reproduce the bug. If the patch is ever changed to clean them,
   * it must first pin the resolved duration into `total_duration_seconds` — see the test above.
   */
  const source = {
    id: 'x', type: 'run', name: 'Easy Run', workout_status: 'planned',
    total_duration_seconds: 2865, tags: ['easy_run'],
    computed: { steps: [{ distanceMeters: 8046.7, paceTarget: '9:30/mi', seconds: 2865 }] },
    workout_structure: { title: 'Easy Run — 5 mi' },
  };
  const opt = getDisciplineSwaps(source as never, ['run', 'ride'], [], null).find((o) => o.to === 'ride');
  assert(opt, 'the fixture session must be swappable');
  const patch = opt!.patch;
  assertEquals(patch.steps_preset, null);
  assertEquals(patch.rendered_description, null);
  assertEquals(patch.type, 'ride');
  // ⛔ The columns the patch does NOT touch — the whole reason the render-side guard exists.
  assert(!('computed' in patch), 'computed is still untouched by the patch');
  assert(!('workout_structure' in patch), 'workout_structure is still untouched by the patch');
  assert(!('intervals' in patch), 'intervals is still untouched by the patch');

  // And the swapped result is recognised, so the renderers suppress what the patch left behind.
  assert(isDisciplineSwapped({ ...source, ...patch } as never));
});

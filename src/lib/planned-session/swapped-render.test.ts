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
 * THIRD RUNG of the server's planned-length reader, so a session whose total was never materialised keeps its
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
  withLibrarySession,
  swappedStructureIsStale,
  getDisciplineSwaps,
} from '../../../supabase/functions/_shared/session-swap/swap.ts';
import { deriveWorkoutTitle } from '../derive-workout-title.ts';
/**
 * ⛔ THE SERVER'S PLANNED-LENGTH READER (2026-09-10, audit H-T01). These fixtures used the phone ladder
 * (`./duration.ts`, deleted). The server settles the same order — the stored total first — so the
 * lengths below are unchanged; what they prove is that a swap preserves the data that length is read from.
 */
import { resolvePlannedDurationSeconds as plannedDurationSeconds } from '../../../supabase/functions/_shared/planned-duration.ts';

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

import { librarySwapSession, swapTargetFamily } from '../../../supabase/functions/_shared/session-swap/library-session.ts';

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
  // ⛔ The old sport's subtitle goes with the rendered copy — words only, no duration rung (audit H-T20).
  assertEquals(patch.friendly_summary, null);
  assertEquals(patch.type, 'ride');
  // ⛔ The columns the patch does NOT touch — the whole reason the render-side guard exists.
  assert(!('computed' in patch), 'computed is still untouched by the patch');
  assert(!('workout_structure' in patch), 'workout_structure is still untouched by the patch');
  assert(!('intervals' in patch), 'intervals is still untouched by the patch');

  // And the swapped result is recognised, so the renderers suppress what the patch left behind.
  assert(isDisciplineSwapped({ ...source, ...patch } as never));
});

// ═══ THE HARD RIDE (2026-08-09) — a real 4×4, not a relabelled run ═══════════════════════════

/**
 * ⛔⛔ SUPERSEDED BY §7 (2026-09-09) — everything the old test asserted is now the WRONG answer.
 *
 * The hard swap to the bike used to write a hand-written Helgerud 4×4 at 57 minutes. That was a
 * THIRD session: not the run being left, and not the book's either. §7 hands over the composer's own
 * `ride_anaerobic` (p237) instead, at the athlete's level, and the merge that does it is
 * `withLibrarySession` — so the pure library returns a SHELL and writes no tokens at all.
 */
Deno.test('⛔ HARD + FTP → a shell, because the SESSION is the library\'s (§7)', () => {
  const hill = {
    id: 'h9', type: 'run', name: 'Hill Repeats', workout_status: 'planned', date: '2026-08-20',
    // ⚠️ THREE HOURS, DELIBERATELY ABSURD FOR A HARD RUN — it is the number that must NOT survive.
    total_duration_seconds: 10800, tags: ['intervals'],
    computed: { steps: [{ seconds: 900, label: 'Warm up 1.5 mi easy' }, { seconds: 120, label: 'Walk down' }] },
    workout_structure: { title: 'Hill Repeats' },
  };
  const [ride] = getDisciplineSwaps(hill as never, ['run', 'ride'], [], null, 250);
  assertEquals(ride.to, 'ride');
  assertEquals(ride.patch.steps_preset, null, 'the shell writes no tokens — the library session does');
  assertEquals(ride.needsMaterialize, false, 'nothing to expand until a library session is merged in');
  assert(!('duration' in ride.patch), 'the shell does not touch the row\'s time either');

  /**
   * ⛔ AND THE LIBRARY SESSION IS WHAT REACHES THE ROW. Steps, minutes and classification come from
   * it; the run's structure is cleared, because "Walk down" cannot survive onto a bike, and that is
   * safe only because the merge writes a total on the same object.
   */
  const lib = librarySwapSession(hill as never, 'run', 'hard', null)!;
  assertEquals(lib.family, 'ride_anaerobic', 'p237 is the hard ride the page hands over');
  const patch = withLibrarySession(ride.patch, hill as never, lib);
  assertEquals(patch.steps_preset, lib.steps_preset);
  assertEquals(patch.total_duration_seconds, lib.duration * 60);
  assertEquals(patch.computed, null);
  assertEquals(patch.workout_structure, null);
  // ⛔ The old session's subtitle goes too — a swim's line must not survive onto the ride (audit H-T20).
  assertEquals(patch.friendly_summary, null);
  assertEquals(patch.intervals, null);
  assertEquals(plannedDurationSeconds({ ...hill, ...patch } as never), lib.duration * 60);

  // ⛔ AND NOT THE RUN'S THREE HOURS — the whole point of §7.
  assert((patch.total_duration_seconds as number) !== 10800, 'the old session\'s time must not survive');

  // The new session's own classification replaces the run's; the swap marker survives it.
  const tags = patch.tags as string[];
  assert(tags.includes('family:ride_anaerobic'), tags.join(','));
  assert(tags.includes('sport:ride'), tags.join(','));
  assert(!tags.includes('family:run_mlss'), tags.join(','));
  assert(tags.includes('discipline_swapped'), tags.join(','));
  assert(tags.some((t) => t.startsWith('swapped_from:')), tags.join(','));
});

/**
 * ⛔ THE ATHLETE'S OWN ROW WINS OVER A FRESH BUILD. Their plan holds the composer's session for that
 * family — their level, their volume, their baselines — and re-deriving it here would be a second
 * composer. The build is the fallback for a plan with no session of that family at all.
 */
Deno.test('⛔ §7 · the template is the athlete\'s own composed session', () => {
  const longRide = {
    id: 'lr', type: 'ride', name: 'Ride', workout_status: 'planned',
    total_duration_seconds: 7200, tags: ['standing_plan', 'family:ride_endurance', 'band:vt1_or_easier', 'level:1'],
  };
  const theirLongRun = {
    id: 'x', type: 'run', name: 'Long Run', workout_status: 'planned',
    total_duration_seconds: 98 * 60, steps_preset: ['longrun_97min_easypace'],
    tags: ['standing_plan', 'family:run_lsd', 'level:2', 'sport:run', 'intensity:lsd', 'band:vt1_or_easier'],
  };
  const lib = librarySwapSession(longRide as never, 'ride', 'long', theirLongRun as never)!;
  assertEquals(lib.fromLibraryBuild, false, 'their own row was used');
  assertEquals(lib.duration, 98);
  assertEquals(lib.steps_preset, ['longrun_97min_easypace']);
  assert(lib.libraryTags.includes('level:2'), lib.libraryTags.join(','));

  // A row of the WRONG family is not a template — it falls back to the build rather than handing
  // over somebody else's session.
  const wrong = librarySwapSession(longRide as never, 'ride', 'long', { ...theirLongRun, tags: ['family:run_vt1'] } as never)!;
  assertEquals(wrong.fromLibraryBuild, true);
  assertEquals(wrong.family, 'run_lsd');

  /**
   * ⛔⛔ AND A ROW THAT IS ITSELF A SWAP IS NOT A TEMPLATE. It carries the target family, so it
   * matches; it is a COPY of the composer's session, not the composer's session. Left in, the second
   * swap of a block copies the first swap's row and inherits every gap in it — which is exactly how
   * a missing description propagated onto a row whose own library session had a sentence.
   */
  const alreadySwapped = { ...theirLongRun, description: null,
    tags: [...theirLongRun.tags, 'discipline_swapped', 'swapped_from:ride'] };
  const fresh = librarySwapSession(longRide as never, 'ride', 'long', alreadySwapped as never)!;
  assertEquals(fresh.fromLibraryBuild, true, 'a swapped row must not be copied');
  assert(fresh.description, 'the library session has its own sentence');
});

/**
 * ⛔ THE LONG-DAY MARKER FOLLOWS THE SPORT. `long_ride` left on a run reads as "the week's long ride
 * is a run" to anyone who looks — and the marker is what makes the long day recognisable at all when
 * the long slot is a ride, since a long ride composes as `ride_endurance` like any easy one.
 */
Deno.test('⛔ §7 · long_ride becomes long_run when the long day changes sport', () => {
  const longRide = {
    id: 'lr2', type: 'ride', name: 'Ride', workout_status: 'planned', total_duration_seconds: 9000,
    tags: ['standing_plan', 'family:ride_endurance', 'level:2', 'sport:ride', 'band:vt1_or_easier', 'long_ride'],
  };
  const [run] = getDisciplineSwaps(longRide as never, ['run', 'ride'], [], null, 250);
  const lib = librarySwapSession(longRide as never, 'ride', 'long', null)!;
  const tags = withLibrarySession(run.patch, longRide as never, lib).tags as string[];
  assert(tags.includes('long_run'), tags.join(','));
  assert(!tags.includes('long_ride'), tags.join(','));
  assert(tags.includes('family:run_lsd'), tags.join(','));

  // ⚠️ AND A SESSION THAT WAS NEVER THE LONG DAY DOES NOT BECOME ONE.
  const easyRun = { id: 'e2', type: 'run', name: 'Easy Run', workout_status: 'planned',
    total_duration_seconds: 2400, tags: ['standing_plan', 'family:run_vt1', 'level:2', 'band:vt1_or_easier'] };
  const [ride] = getDisciplineSwaps(easyRun as never, ['run', 'ride'], [], null, 250);
  const easyLib = librarySwapSession(easyRun as never, 'run', 'easy', null)!;
  const easyTags = withLibrarySession(ride.patch, easyRun as never, easyLib).tags as string[];
  assert(!easyTags.some((t) => t === 'long_run' || t === 'long_ride'), easyTags.join(','));
});

Deno.test('⛔ §7 · a machine is not a sport swap, and the page blesses one direction', () => {
  // p138: a hard RIDE is not handed a run.
  assertEquals(swapTargetFamily('ride', 'hard'), null);
  assertEquals(swapTargetFamily('run', 'hard'), 'ride_anaerobic');   // p237
  assertEquals(swapTargetFamily('run', 'easy'), 'ride_endurance');   // p239
  assertEquals(swapTargetFamily('run', 'long'), 'ride_endurance');   // p239, the frame's long ride
  assertEquals(swapTargetFamily('ride', 'long'), 'run_lsd');         // p235
  assertEquals(swapTargetFamily('ride', 'easy'), 'run_vt1');         // p235
});

Deno.test('⛔ HARD without FTP → the ride is NOT OFFERED (no watts, no session)', () => {
  const hill = {
    id: 'h9', type: 'run', name: 'Hill Repeats', workout_status: 'planned',
    total_duration_seconds: 3780, tags: ['intervals'],
  };
  assertEquals(getDisciplineSwaps(hill as never, ['run', 'ride'], [], null, null), []);
  assertEquals(getDisciplineSwaps(hill as never, ['run', 'ride'], [], null, 0), []);
});

Deno.test('⛔ EASY swaps are UNCHANGED by all of this — no FTP, no tokens, time preserved', () => {
  const easy = {
    id: 'e9', type: 'run', name: 'Easy Run', workout_status: 'planned',
    total_duration_seconds: 3780, tags: ['easy_run'],
    computed: { steps: [{ distanceMeters: 8046.7, paceTarget: '9:30/mi', seconds: 2865 }] },
  };
  const [ride] = getDisciplineSwaps(easy as never, ['run', 'ride'], [], null, null);
  assertEquals(ride.to, 'ride');
  assertEquals(ride.patch.steps_preset, null, 'an easy swap writes no tokens');
  assertEquals(ride.needsMaterialize, false, 'an easy swap needs no server expansion');
  assert(!('duration' in ride.patch), 'the easy swap preserves the row\'s own time');
  assert(!('computed' in ride.patch), 'the easy swap must not clear computed — it holds the duration');
  // Time-matched, as before.
  assertEquals(plannedDurationSeconds({ ...easy, ...ride.patch } as never), 3780);
});

Deno.test('⛔ THE RENDER SPLIT — stale run structure is hidden, a REAL bike session is not', () => {
  /**
   * ⚠️ THE INTERACTION THAT COULD HAVE BROKEN THE FEATURE SILENTLY. The swapped-render guard hides
   * `computed.steps` on swapped rows — correct for an easy swap, and it would have HIDDEN THE HARD
   * RIDE'S OWN STEPS on a hard one. `steps_preset` is the tell: present ⇒ written for the target sport and expanded
   * for it; absent ⇒ whatever is in `computed` belongs to the sport left behind.
   */
  const easySwapped = { type: 'ride', tags: ['discipline_swapped', 'swapped_from:run'], steps_preset: null,
    computed: { steps: [{ distanceMeters: 8046.7, paceTarget: '9:30/mi' }] } };
  assert(swappedStructureIsStale(easySwapped as never), 'the run steps must be suppressed');

  const hardSwapped = { type: 'ride', tags: ['discipline_swapped', 'swapped_from:run'],
    steps_preset: ['warmup_bike_quality_13min_fastpedal', 'round_1x_45s110-r300seasy-45s112'],
    computed: { steps: [{ duration_s: 240, power_range: { lower: 275, upper: 300 } }] } };
  assert(!swappedStructureIsStale(hardSwapped as never), 'the REAL bike session must render');
  assert(isDisciplineSwapped(hardSwapped as never), 'it is still a swap, for every other purpose');
});

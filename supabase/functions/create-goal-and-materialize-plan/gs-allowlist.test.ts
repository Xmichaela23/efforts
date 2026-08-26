/**
 * ⛔⛔ EVERY KEY THE STRENGTH WIZARD SENDS IS EITHER FORWARDED OR DELIBERATELY CONSUMED.
 *
 * THE DEFECT THIS EXISTS FOR (2026-08-26): the wizard asks for weekly hours, writes
 * `target_run_hours` into `training_prefs`, and `gsBody` — the body this function invokes
 * `generate-strength-plan` with — is an explicit ALLOWLIST. The key was not on it. So
 * `sizeFor(spans, 'run', args.targetRunHours)` saw `undefined`, the run dial sat at the library
 * midpoint through two deploys, and picking one hour built the same week as picking six.
 *
 * ⛔ NO EXISTING TEST COULD HAVE CAUGHT IT, and neither could the deploy check. Grepping which
 * functions import the changed `_shared` files answers the MODULE's route; a key travels the
 * PAYLOAD's route, and this function imports none of those modules. An allowlist is invisible to
 * both. That gap is what this file closes.
 *
 * ⚠️ SOURCE-TEXT, AND ITS LIMITS ARE STATED RATHER THAN HIDDEN. `NonRaceBuilder` is 6,000 lines of
 * TSX that `deno test` cannot import, and this function is a 4,000-line edge handler with no
 * exported seam for its body builder. So both sides are read as TEXT: the keys the wizard's
 * `training_prefs` literal emits, against the keys this file names. It catches a key added on one
 * side and forgotten on the other, which is exactly how this broke. It is not proof about a runtime
 * value and is not offered as one.
 *
 * Run from repo root:
 *   ~/.deno/bin/deno test --allow-read --no-check \
 *     supabase/functions/create-goal-and-materialize-plan/gs-allowlist.test.ts
 */
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const ROOT = new URL('../../../', import.meta.url);
const WIZARD = await Deno.readTextFile(new URL('src/components/NonRaceBuilder.tsx', ROOT));
const CREATE_GOAL = await Deno.readTextFile(new URL('supabase/functions/create-goal-and-materialize-plan/index.ts', ROOT));

/** The `training_prefs` object literal the wizard emits, read as text. */
function trainingPrefsKeys(): string[] {
  const start = WIZARD.indexOf('training_prefs: {');
  assert(start > 0, 'the wizard no longer emits a training_prefs literal');
  // ⚠️ Bounded by the next top-level key of the goal object, not by brace matching — the literal is
  // 400 lines of conditional spreads and a matcher would be more fragile than the bound.
  const end = WIZARD.indexOf('\n      },', start);
  const body = WIZARD.slice(start, end > start ? end : start + 40000);
  const keys = new Set<string>();
  for (const m of body.matchAll(/^\s+(?:\.\.\.\([^\n]*\?\s*)?\{?\s*([a-z_][a-z_0-9]*):/gm)) {
    keys.add(m[1]);
  }
  return [...keys];
}

/**
 * ⛔ FIELDS THAT LIVE INSIDE A FORWARDED ARRAY ENTRY, not at the top of `training_prefs`.
 *
 * ⚠️ VERIFIED, NOT ASSUMED: create-goal passes `hard_days` entries through as whole objects — it
 * FILTERS on `day` and `discipline` and never rebuilds them field by field (`:2858-2861`) — so
 * everything an entry carries survives the hop. ⛔ If that filter ever becomes a `.map`, these stop
 * travelling and nothing else in this file would notice; that line is the one to watch.
 */
const NESTED_IN_HARD_DAYS = new Set([
  'discipline', 'ownership', 'terrain', 'goal', 'environment', 'role',
]);

/**
 * ⛔ KEYS THAT ARE CONSUMED RATHER THAN FORWARDED, each with the reason it does not travel.
 * ⚠️ ADDING A NAME HERE IS A DECISION, not a way to make the test pass — it asserts "this key is
 * read on this side and deliberately does not reach the strength generator."
 */
const CONSUMED: Record<string, string> = {
  goal_type: 'the ROW type, read by create-goal itself (D-214)',
  target_weeks: 'becomes gsBody.duration_weeks',
  fitness: 'read by create-goal for tier seeds and the combined path',
  training_intent: 'read by create-goal; the strength frame does not branch on it',
  strength_intent: 'read by create-goal for the protocol decision',
  strength_protocol: 'read by create-goal; the Standing Plan frame is fixed',
  strength_frequency: 'read by create-goal; the frame owns the lifting-day count (pivot §6)',
  per_discipline_posture: 'becomes gsBody.strength_posture and endurance_sport',
  preferred_days: 'becomes gsBody.long_run_day and bike.long_ride_day',
  run_days: 'becomes gsBody.endurance_frequency',
  ride_days: 'becomes gsBody.bike.days',
  goal_focus: 'read by the coach payload and block-identity, not by any generator',
  weekly_hours_available: 'the RACE path (generate-combined-plan) reads it',
  strength_optimizer_slots: 'the RACE path reads it',
  days_per_week: 'the RACE path reads it',
  recent_long_run_miles: 'the RACE path reads it',
  target_time: 'race goals only',
  target_date: 'race goals only',
  distance: 'race goals only',
  course_profile: 'race goals only',
  elevation_gain_m: 'race goals only',
  quality_run_terrain: 'carried inside hard_days entries',
  equipment_tier: 'read by create-goal when seeding equipment',
  plan_start_date: 'a top-level payload key, becomes gsBody.start_date',
  priority: 'the goal row',
  notes: 'the goal row',
};

Deno.test('⛔ NO KEY THE STRENGTH WIZARD SENDS IS SILENTLY DROPPED', () => {
  const sent = trainingPrefsKeys();
  assert(sent.length > 10, `only ${sent.length} keys parsed — the literal's shape changed`);

  // ⚠️ THE ALLOWLIST REGION, bounded by the gsBody literal and its invoke.
  const from = CREATE_GOAL.indexOf('const gsBody');
  const to = CREATE_GOAL.indexOf("'generate-strength-plan', gsBody");
  assert(from > 0 && to > from, 'the gsBody region moved — this test cannot find it');
  const region = CREATE_GOAL.slice(from, to);

  const dropped: string[] = [];
  for (const key of sent) {
    if (CONSUMED[key]) continue;
    if (NESTED_IN_HARD_DAYS.has(key)) continue;
    // ⛔ FORWARDED means the key is NAMED in the body this function invokes the generator with.
    if (new RegExp(`\\b${key}\\b`).test(region)) continue;
    dropped.push(key);
  }
  assert(
    dropped.length === 0,
    'these training_prefs keys reach the goal row and never reach the strength generator — '
      + 'add them to gsBody, or to CONSUMED with the reason they do not travel: '
      + dropped.join(', '),
  );
});

Deno.test('⛔ THE HOURS ASK IS ON THE ALLOWLIST — the 2026-08-26 defect, named', () => {
  const from = CREATE_GOAL.indexOf('const gsBody');
  const to = CREATE_GOAL.indexOf("'generate-strength-plan', gsBody");
  const region = CREATE_GOAL.slice(from, to);
  // ⚠️ NAMED INDIVIDUALLY rather than left to the sweep above, because these two are what the
  // feature turns on: without them the run dial does nothing and nothing anywhere says so.
  for (const key of ['target_run_hours', 'target_ride_hours']) {
    assert(region.includes(key), `${key} is not forwarded — §3c's ask cannot reach the composer`);
  }
});

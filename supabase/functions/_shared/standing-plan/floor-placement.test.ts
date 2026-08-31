/**
 * ⛔⛔⛔ THE MUSCLE FLOOR PLACES BY REGION AND ADJACENCY, NOT BY WEIGHT ALONE — the regression test
 * for a defect found on Michael's own built plan (2026-08-31).
 *
 * ⛔ WHAT IT WAS. `fillMuscleFloor` took "the lightest session that stays under the costly line". In
 * a TEST week the two test days carry two lifts each and are by far the lightest sessions of the
 * week, so they took every fill — and his week one put **glute work on the upper-body test day, the
 * day before his squat and deadlift max test.** That test prices every working number in the block,
 * and p247 puts a hard session the day before heavy legs at 3-4% off the squat and deadlift.
 *
 * ⚠️ IT ONLY EVER SHOWED IN WEEK ONE, which is why it survived: from week two on, all four lifting
 * days sit above the costly line for additions and the lower-body work comes from the programme's
 * own hinge row instead. **The test week is the only week the floor is free to choose.**
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeWeek } from './compose.ts';
import { musclesWorkedBy } from '../accessory-dosing/index.ts';

/** ⚠️ HIS OWN KIT — the fixture is the athlete the defect was found on, not a synthetic one. */
const HOME_KIT = [
  'Barbell + plates', 'Dumbbells', 'Squat rack / Power cage', 'Bench (flat/adjustable)',
  'Incline bench', 'Pull-up bar', 'Resistance bands', 'Ab wheel',
];
const LOWER = ['quadriceps', 'hamstrings', 'glutes', 'calves'];

function week(n: number) {
  return composeWeek({
    competitionLifts: { push_upper: 'Bench Press', press_lower: 'Back Squat', hinge_lower: 'Deadlift' },
    roundTo: 5, frame: 'all_rounder', week: n, column: 'standard', equipment: HOME_KIT,
    sportMix: { slots: { '1:0': 'run', '2:0': 'ride', '3:0': 'run', '4:0': 'ride', '6:0': 'run' } },
  } as never);
}

Deno.test('⛔⛔ NO LOWER-BODY WORK ON THE DAY BEFORE THE LOWER TEST — his week one, composed', () => {
  const w = week(1);
  const strength = w.sessions.filter((s) => s.type === 'strength');
  const upper = strength.find((s) => /^test:\s*upper$/i.test(String(s.name)));
  const lower = strength.find((s) => /^test:\s*lower$/i.test(String(s.name)));
  assert(upper && lower, 'the test week no longer builds both test sessions — this test is stale');

  const names = (s: typeof upper) => (s!.strength_exercises ?? []).map((e) => String(e.name));
  /**
   * ⛔ THE ASSERTION THE DEFECT FAILS. Every accessory the floor adds to the upper test day must be
   * upper-body or core work. ⚠️ The two TESTED lifts are exempt — a bench and an overhead press are
   * the session, not a fill.
   */
  for (const n of names(upper)) {
    if (/bench press|overhead press/i.test(n)) continue;
    const m = musclesWorkedBy(n);
    assert(m, `${n} attributes to no muscle`);
    assert(!LOWER.includes(m!.primary),
      `⛔ "${n}" is ${m!.primary} work on the upper test day — the day before the squat and `
      + 'deadlift max test (p247: 3-4% off the squat and deadlift)');
  }

  /**
   * ⛔⛔ AND NOW NEITHER TEST DAY TAKES A FILL AT ALL — Michael, 2026-08-31, reading his own Test:
   * Upper mid-session: *"it shouldnt arbitrarily drop workouts in so test days should be test
   * days"*. See `PlannedSession.isTest`.
   *
   * ⚠️ THIS SUPERSEDES THE SECOND HALF OF THIS TEST AS IT WAS FIRST WRITTEN. It used to assert that
   * the lower work MOVED to the lower test day — correct under the region rule, wrong under his
   * ruling, which is that a test session is not a place work moves TO.
   */
  for (const s of [upper, lower]) {
    const fills = names(s).filter((n) => !/bench press|overhead press|back squat|deadlift/i.test(n));
    assert(fills.length === 0,
      `⛔ "${s!.name}" carries ${fills.join(', ')} — a test session takes no floor volume`);
  }
});

Deno.test('⛔ THE WEEKLY VOLUME IS UNCHANGED — this moves work, it does not remove it', () => {
  /**
   * ⛔ THE FAILURE MODE OF A PLACEMENT RULE IS SILENT UNDER-FILLING: exclude enough sessions and a
   * muscle simply never gets its floor. Rule 1 is a hard exclusion, so this asserts the week still
   * reaches every muscle it reached before.
   */
  const musclesIn = (n: number) => new Set(week(n).sessions
    .filter((s) => s.type === 'strength')
    .flatMap((s) => (s.strength_exercises ?? []).map((e) => String(e.name)))
    .map((x) => musclesWorkedBy(x)?.primary).filter(Boolean));

  /**
   * ⛔⛔⛔ WHAT HIS TEST-DAY RULING COSTS, MEASURED RATHER THAN GUESSED (2026-08-31).
   *
   * Week one has FOUR lifting sessions and TWO of them are tests. With tests excluded
   * (`PlannedSession.isTest`) the floor has two candidates left, and both sit close enough to
   * `SESSION_SETS_COSTLY` (14 — p086) that a fill would cross it. So the floor declines and says so
   * through `unfilled`, which is the honest path rather than a silent drop.
   *
   * ⛔ COMPOSED AT A BARBELL KIT, THE COST IS EXACTLY THIS:
   *   week 1 reaches biceps · chest · deltoids · hamstrings · lats · quadriceps
   *   week 2 reaches those plus calves · glutes · triceps
   * So week one loses **glutes, calves and triceps** for one week, and that is the price of not
   * parking volume on a max test. ⚠️ It is a PRICE, not a defect — the thing it replaces is a glute
   * movement the day before the squat and deadlift max, which is the defect this file's first test
   * exists to catch.
   *
   * ⛔⛔ CORE IS ABSENT IN BOTH WEEKS AND THAT IS A DIFFERENT PROBLEM. **p274 prints no core slot on
   * any of its four lifting days.** The floor was the only thing putting core in this programme at
   * all, and it was putting it on the test day. The fix is the CORE SLOT Michael approved on
   * 2026-08-31, not a weaker placement rule. Until it lands, core is honestly absent rather than
   * dishonestly parked on a max test.
   *
   * ⚠️ WEEK 2 IS THE REAL GUARD against silent under-filling, because it is an ordinary week and
   * nothing about the ruling touches it — asserted in the block below, which already existed and
   * already pins the core gap.
   */
  const w1 = musclesIn(1);
  for (const m of ['quadriceps', 'hamstrings', 'chest', 'lats', 'biceps', 'deltoids']) {
    assert(w1.has(m as never), `week 1: nothing in the week trains ${m}`);
  }


  /**
   * ⛔⛔ AND A PRE-EXISTING GAP IS PINNED RATHER THAN ASSERTED AWAY: **weeks 2+ carry no core work
   * at all at this kit.** Measured before this change and after it, so the placement rule did not
   * cause it — all four lifting days sit at 16-17 sets, which is over the line where the floor may
   * add anything, so the core floor can never be filled. p223 gives core its own heading, and the
   * All Rounder's own cells do not carry one.
   * ⚠️ ASSERTED AS THE CURRENT TRUTH so that fixing it fails here and has to be acknowledged, and so
   * that it cannot quietly spread to the other muscles.
   */
  const w2 = musclesIn(2);
  assert(!w2.has('core' as never),
    'weeks 2+ now train core — that is an improvement, and this pin has to be updated with it');
  for (const m of ['quadriceps', 'hamstrings', 'glutes', 'chest', 'triceps']) {
    assert(w2.has(m as never), `week 2: nothing in the week trains ${m}`);
  }
});

Deno.test('⛔ THE PLACEMENT FACTS SURVIVE THE FLOOR\'S OWN COPY', () => {
  /**
   * ⚠️ THE FIRST ATTEMPT AT THIS FIX DID NOTHING, and the reason is worth pinning: `fillMuscleFloor`
   * rebuilt each session as `{ label, sets }` and dropped every other field the caller had supplied.
   * A local copy that names its fields goes stale the next time the type grows.
   */
  const src = Deno.readTextFileSync(new URL('../accessory-dosing/ledger.ts', import.meta.url));
  assert(/week\.map\(\(s\) => \(\{ \.\.\.s, sets: \[\.\.\.s\.sets\] \}\)\)/.test(src),
    '⛔ the floor rebuilds sessions field by field again — placement facts will be dropped silently');
});

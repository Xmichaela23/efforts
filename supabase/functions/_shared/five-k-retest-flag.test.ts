/**
 * Fixtures for the 5K retest flag — `buildFiveKNudge` (`_shared/arc-context.ts`), rebuilt 2026-08-19.
 *
 * Run: deno test supabase/functions/_shared/five-k-retest-flag.test.ts --no-check --allow-net
 *
 * ⛔ THE POINT OF THE FLAG is that the app picks a pace source silently and the athlete never learns
 * the two numbers disagree. The original bug was found by hand, by looking. So the tests that matter
 * here are the ones asserting it SPEAKS — in both directions, and on the evidence the resolver can
 * actually produce.
 *
 * ⛔ MUTATION-CHECKED. Results at the bottom of the file.
 *
 * ⛔ ATHLETE-AGNOSTIC. Fitness levels swept across the pace table's full range; the one
 * report-shaped fixture asserts direction and provenance, not a tuned number.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildFiveKNudge } from './arc-context.ts';

const SEC_PER_KM_TO_SEC_PER_MI = 1.609344;
const miToKm = (secPerMi: number) => secPerMi / SEC_PER_KM_TO_SEC_PER_MI;
const clock = (mmss: string) => mmss;

/** A measured EASY pace — the evidence that un-starves the flag when the threshold learner abstains. */
const easyLearned = (secPerMi: number, confidence = 'high', sample_count = 10) => ({
  run_easy_pace_sec_per_km: { value: miToKm(secPerMi), confidence, sample_count, as_of: '2026-08-04' },
});

/** A measured THRESHOLD pace. */
const thrLearned = (secPerMi: number, confidence = 'high', sample_count = 5) => ({
  run_threshold_pace_sec_per_km: { value: miToKm(secPerMi), confidence, sample_count, as_of: '2026-08-10' },
});

// ═══════════════════════════════════════════════════════════════════════════
// THE DIRECTION THE OLD FLAG CALLED FINE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test('STALE-FAST: a saved 5K faster than recent running now PROMPTS', () => {
  // ⛔ THE REGRESSION. The previous flag returned `should_prompt: false` here with "the manual race
  // time is already the sharper anchor" — i.e. it looked straight at the stale-5K case and passed it.
  // Measured threshold 9:30/mi; a 5K on file implying far better fitness than that.
  const n = buildFiveKNudge({ fiveK: clock('19:00') }, thrLearned(570) as never);
  assert(n != null, 'flag produced nothing');
  assertEquals(n!.direction, 'stale-fast');
  assertEquals(n!.should_prompt, true);
  assert(n!.gap_sec < 0, 'gap sign does not say the saved time is faster');
  // The consequence is stated, because it is the reason the athlete should care.
  assert(/faster than current fitness/i.test(n!.message), `message hid the consequence: ${n!.message}`);
  assert(/worth a retest/i.test(n!.message), 'the flag does not say what it is asking for');
});

Deno.test('BEHIND: a saved 5K slower than recent running still prompts', () => {
  const n = buildFiveKNudge({ fiveK: clock('30:00') }, thrLearned(480) as never);
  assert(n != null);
  assertEquals(n!.direction, 'behind');
  assertEquals(n!.should_prompt, true);
  assert(n!.gap_sec > 0, 'gap sign does not say the saved time is slower');
});

Deno.test('ALIGNED: agreement is silent', () => {
  // Threshold 8:00/mi -> the tables put the implied 5K near 22:00. A saved 22:00 agrees.
  const n = buildFiveKNudge({ fiveK: clock('22:00') }, thrLearned(480) as never);
  assert(n != null);
  assertEquals(n!.direction, 'aligned');
  assertEquals(n!.should_prompt, false);
});

// ═══════════════════════════════════════════════════════════════════════════
// THE STARVATION — the flag must fire when the threshold LEARNER abstains
// ═══════════════════════════════════════════════════════════════════════════

Deno.test('THE STARVATION FIX: no measured threshold, but measured EASY runs — it still speaks', () => {
  // ⛔ THIS IS THE CASE THAT PROMPTED THE JOB and the case the old flag could not see. The threshold
  // learner has published nothing (contaminated candidates dropped); the athlete has ten clean easy
  // runs and a 5K typed long ago. Shape asserted, not a tuned value.
  const n = buildFiveKNudge({ fiveK: clock('25:21') }, easyLearned(755) as never);
  assert(n != null, 'the flag was still starved — this is the whole bug');
  assertEquals(n!.evidence, 'derived-from-easy');
  assertEquals(n!.direction, 'stale-fast');
  assertEquals(n!.should_prompt, true);
  // Law 3 — the message must not present a derived number as a measured one.
  assert(/easy runs/i.test(n!.message), `derived evidence not disclosed: ${n!.message}`);
  assert(!/measured/i.test(n!.message), `a derived number was called measured: ${n!.message}`);
});

Deno.test('a typed threshold pace is evidence too, and says so', () => {
  const n = buildFiveKNudge(
    { fiveK: clock('19:00'), threshold_pace_sec_per_mi: 570 },
    null as never,
  );
  assert(n != null);
  assertEquals(n!.evidence, 'stated');
  assert(/threshold pace you entered/i.test(n!.message), n!.message);
});

// ═══════════════════════════════════════════════════════════════════════════
// WHAT MUST NOT COUNT AS EVIDENCE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test('a wizard/VDOT threshold is NOT evidence — a 5K cannot speak about itself', () => {
  // ⚠️ WHAT THIS ACTUALLY ASSERTS, since the first version of it overclaimed. The defence is the
  // EVIDENCE ALLOWLIST: `effort_paces` is not one of the four accepted sources, so a threshold pace
  // that came from the athlete's own 5K can never be used to judge that 5K. With nothing else on
  // file there is no independent evidence and no flag.
  //
  // ⚠️ AND THE SIBLING DEFENCE IS NOT TESTABLE FROM HERE, SO IT IS WRITTEN DOWN INSTEAD. The call
  // deliberately withholds `effort_paces` from the resolver. Mutation showed that passing it changes
  // no outcome — because the resolver BOUNDS a wizard value against the measured easy pace, and any
  // 5K stale enough to trip the ±4% band implies a threshold outside that bound, so it is replaced
  // by the easy-pace derivation before it can shadow anything. The omission is structurally correct
  // and belt-and-braces; it is not what makes the flag work. Do not claim otherwise.
  const n = buildFiveKNudge(
    { fiveK: clock('25:21') },
    null as never,
  );
  assertEquals(n, null);
});

Deno.test('learned-low is too thin to prompt a retest', () => {
  const n = buildFiveKNudge(
    { fiveK: clock('19:00') },
    { run_threshold_pace_sec_per_km: { value: miToKm(570), confidence: 'low', sample_count: 2 } } as never,
  );
  assertEquals(n, null);
});

Deno.test('a low-confidence easy pace cannot found the derivation either', () => {
  const n = buildFiveKNudge({ fiveK: clock('25:21') }, easyLearned(755, 'low', 2) as never);
  assertEquals(n, null);
});

Deno.test('no saved 5K, no flag — there is nothing to disagree with', () => {
  assertEquals(buildFiveKNudge({}, thrLearned(480) as never), null);
  assertEquals(buildFiveKNudge(null, thrLearned(480) as never), null);
});

Deno.test('an implausible saved 5K is refused, not compared', () => {
  // Outside FIVEK_TOTAL_SEC_SANE (7-80 min) — a typo, not a race.
  assertEquals(buildFiveKNudge({ fiveK: clock('3:00') }, thrLearned(480) as never), null);
  assertEquals(buildFiveKNudge({ fiveK: clock('95:00') }, thrLearned(480) as never), null);
});

// ═══════════════════════════════════════════════════════════════════════════
// THE ARITHMETIC — the app's own tables, not a flat ratio
// ═══════════════════════════════════════════════════════════════════════════

Deno.test('SWEEP: the implied 5K tracks the tables across the WHOLE fitness range', () => {
  // ⛔ WHY THIS SWEEP EXISTS. The deleted constant (`5K pace = 0.82 x threshold`) was accurate near
  // vdot 58 and badly wrong at both ends — the app's own table puts the real ratio at 0.96 for a
  // vdot-30 runner. A flag that is wrongest for the slowest athletes is worse than no flag. Each row
  // is PACE_TABLE's `steady` and the 5K time VDOT_TABLE pairs with it.
  const rows: [number, string][] = [
    [622, '31:00'],  // vdot 30
    [514, '24:06'],  // vdot 38
    [491, '22:42'],  // vdot 40
    [450, '20:22'],  // vdot 44
    [399, '17:24'],  // vdot 50
    [331, '13:58'],  // vdot 60
  ];
  for (const [steadySecPerMi, trueFiveK] of rows) {
    const n = buildFiveKNudge({ fiveK: trueFiveK }, thrLearned(steadySecPerMi) as never);
    assert(n != null, `threshold ${steadySecPerMi}: no flag built`);
    // Feeding the flag the 5K the tables actually pair with this threshold must read as agreement.
    assertEquals(
      n!.direction,
      'aligned',
      `threshold ${steadySecPerMi}/mi vs its OWN table 5K ${trueFiveK} came out ${n!.direction} `
        + `(implied ${n!.implied_5k_label}) — the arithmetic disagrees with the table it came from`,
    );
  }
});

Deno.test('SWEEP: the trigger is symmetric, and it is the SAME band on both sides', () => {
  // ±4% (RUN_PACE_DIVERGENCE_THRESHOLD). A 6% error trips in either direction; a 2% one does not.
  // Asserted as a property across the range rather than at one athlete's pace.
  for (const steady of [622, 514, 450, 399, 331]) {
    const aligned = buildFiveKNudge({ fiveK: '20:00' }, thrLearned(steady) as never);
    assert(aligned != null, `threshold ${steady}: no flag`);
    const implied = aligned!.implied_5k_total_sec;
    const at = (mult: number) => {
      const total = Math.round(implied * mult);
      const m = Math.floor(total / 60), sec = total % 60;
      return buildFiveKNudge({ fiveK: `${m}:${String(sec).padStart(2, '0')}` }, thrLearned(steady) as never);
    };
    assertEquals(at(1.06)!.direction, 'behind', `threshold ${steady}: +6% did not trip`);
    assertEquals(at(0.94)!.direction, 'stale-fast', `threshold ${steady}: -6% did not trip`);
    assertEquals(at(1.02)!.direction, 'aligned', `threshold ${steady}: +2% tripped`);
    assertEquals(at(0.98)!.direction, 'aligned', `threshold ${steady}: -2% tripped`);
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MUTATIONS RUN 2026-08-19. Baseline 12/12. Two survived; both are recorded, not hidden.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   #   mutation                                                        failed
 *  ---  --------------------------------------------------------------  ------
 *   1   `stale-fast` returns `should_prompt: false` (the old behaviour)     2
 *   2   direction hardcoded to `'behind'`                                   5
 *   3   `effort_paces` passed to the resolver                          SURVIVED
 *   4   `learned-low` accepted as evidence                                  1
 *   5   trigger reverted to a flat 90-second gap                            1
 *   6   implied 5K reverted to the flat x0.82 ratio                         2
 *   7   `evidence` always reported as `'measured'`                          3
 *   8   `derived-from-easy` dropped from the evidence allowlist             1
 *   9   the `evidence == null` gate removed                                 1
 *  10   sanity band on the IMPLIED 5K removed                          SURVIVED
 *  11   gap sign flipped to `implied - manual`                              4
 *
 * ⛔ #10 SURVIVED AND THE CODE CHANGED, NOT THE TEST. The band was unreachable —
 * `estimateVdotFromPace` clamps to vdot 30..85 and `getTargetTime` maps that to 9:12..31:00, wholly
 * inside 7..80 minutes. It was deleted. This is the second unreachable guard this work has found;
 * both were caught the same way.
 *
 * ⚠️ #3 SURVIVED AND THE CODE DID NOT CHANGE — see the note on the wizard/VDOT test above for why
 * that outcome is correct and what it means about the strength of that defence. It is recorded here
 * rather than dressed up as a kill.
 */

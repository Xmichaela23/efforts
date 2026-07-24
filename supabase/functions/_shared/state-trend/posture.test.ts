/**
 * Q-179 — the posture join. THE REGRESSION THIS FILE EXISTS FOR, in one sentence:
 *
 *   The athlete declared run='maintain' while building strength, ran 3x/month instead of 19x,
 *   got slower at the same heart rate — exactly what a maintain posture implies — and State
 *   told him his "aerobic base needs work" in orange.
 *
 * Every number was correct. The app had his declared intent on the goal row and never read it.
 *
 * Run: deno test --allow-all supabase/functions/_shared/state-trend/posture.test.ts
 */
import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { readPosture, postureSentence, sanitizePosture, isConcern, disciplineWord, declaredSessionsPerWeek } from './posture.ts';

// ── THE BUG, pinned ───────────────────────────────────────────────────────────────────────────

// Doing it (3/wk declared, 3/wk actual).
const KEEPING_IT_UP = { targetSessionsPerWeek: 3, actualSessionsPerWeek: 3 };
// NOT doing it — the real athlete on 2026-07-14: declared 3 runs a week, running 3 a MONTH.
const STOPPED = { targetSessionsPerWeek: 3, actualSessionsPerWeek: 0.75 };

Deno.test('Q-179 REGRESSION: a MAINTAIN discipline that slides while STILL BEING DONE is a TRADE, never a concern', () => {
  const read = readPosture('maintain', 'sliding', KEEPING_IT_UP);
  assertEquals(read, 'maintain_slipping');
  assertEquals(isConcern(read), false); // ⛔ THE WHOLE POINT. Not orange. Not a warning. Not a scold.
  const s = postureSentence(read, disciplineWord('run'), KEEPING_IT_UP)!;
  assertStringIncludes(s.toLowerCase(), 'running');
  assertStringIncludes(s, 'holding near the plan');
  assertEquals(s.toLowerCase().includes('you said'), false); // voice reset: no accusatory second person
});

Deno.test('Q-179: the SAME slide, declared DEVELOP, IS a concern — intent is the whole difference', () => {
  const read = readPosture('develop', 'sliding');
  assertEquals(read, 'develop_declining');
  assertEquals(isConcern(read), true);
});

// ── THE FALSE-COMFORT BUG — caught in review 2026-07-14, before it shipped ────────────────────

Deno.test('⛔ FALSE COMFORT: an "improving" trend must NEVER be read as "you are maintaining" when they STOPPED', () => {
  // The first cut of this file joined posture to the PERFORMANCE VERDICT alone. The athlete's run
  // verdict was 'improving' (his within-run drift was fine on the few runs he did), so the app would
  // have told him: "You chose to hold running steady, and you are." He had run 3x in a MONTH against
  // a declared 3x a WEEK. A performance trend cannot answer "are you maintaining it?" — only the
  // calendar can. This is the identical bug as off-plan-banner.ts:66 ("On plan — strength on track"
  // to an athlete running zero of his planned runs). BEHAVIOUR OUTRANKS THE TREND.
  const read = readPosture('maintain', 'improving', STOPPED);
  assertEquals(read, 'maintain_dropped');
  const s = postureSentence(read, disciplineWord('run'), STOPPED)!;
  assertStringIncludes(s, 'well under half the 3-a-week plan'); // 0.75/3 = 0.25 → the coarse gap phrase
  assertStringIncludes(s, 'picks back up when the running does'); // the reversible-mechanism clause
  assertEquals(s.toLowerCase().includes('you said'), false); // no accusatory second person
  assertEquals(s.includes('and you are'), false); // the false-comfort sentence must not appear
});

Deno.test('maintain_dropped is a TRADE, not a failure — it is never painted as a concern', () => {
  assertEquals(isConcern(readPosture('maintain', 'improving', STOPPED)), false);
  const s = postureSentence('maintain_dropped', 'running', STOPPED)!;
  assertStringIncludes(s, 'the 3-a-week plan'); // states the gap vs the plan, not a scold
  assertEquals(s.toLowerCase().includes('mistake'), false);
});

Deno.test('NO DECLARED TARGET -> we cannot claim they are or are not maintaining -> SILENCE, not reassurance', () => {
  // The dangerous branch is the reassuring one. With no yardstick, say nothing.
  assertEquals(readPosture('maintain', 'improving', { targetSessionsPerWeek: null, actualSessionsPerWeek: 2 }), 'unknown');
  assertEquals(readPosture('maintain', 'sliding', null), 'unknown');
  assertEquals(postureSentence(readPosture('maintain', 'improving', null), 'running'), null);
});

Deno.test('the ±20% band (TrainingPeaks compliance) is the line between "close enough" and "you stopped"', () => {
  // 2.4 of 3 = exactly 80% → still maintaining. We do not nag over rounding.
  assertEquals(readPosture('maintain', 'holding', { targetSessionsPerWeek: 3, actualSessionsPerWeek: 2.4 }), 'maintaining');
  // 2.3 of 3 = 77% → a fifth of the declared volume is gone. That is a different thing happening.
  assertEquals(readPosture('maintain', 'holding', { targetSessionsPerWeek: 3, actualSessionsPerWeek: 2.3 }), 'maintain_dropped');
});

Deno.test('a DEVELOP discipline merely HOLDING is a concern — trying to build and not building', () => {
  assertEquals(isConcern(readPosture('develop', 'holding')), true);
});

Deno.test('a MAINTAIN discipline still being DONE, holding or improving, is the trade being honoured', () => {
  assertEquals(readPosture('maintain', 'holding', KEEPING_IT_UP), 'maintaining');
  assertEquals(readPosture('maintain', 'improving', KEEPING_IT_UP), 'maintaining');
  assertEquals(isConcern(readPosture('maintain', 'improving', KEEPING_IT_UP)), false);
});

// ── The no-regression guarantee ───────────────────────────────────────────────────────────────

Deno.test('NO DECLARED POSTURE -> unknown -> no sentence -> every surface behaves exactly as before', () => {
  for (const v of ['improving', 'holding', 'sliding', 'needs_data']) {
    assertEquals(readPosture(null, v), 'unknown');
    assertEquals(postureSentence(readPosture(null, v), 'running'), null);
    assertEquals(isConcern(readPosture(null, v)), false);
  }
});

Deno.test('needs_data is never framed by posture for a DEVELOP discipline — "we cannot see this" is the honest answer', () => {
  assertEquals(readPosture('develop', 'needs_data'), 'unknown');
  // ⚠ For MAINTAIN it is DIFFERENT and deliberately so: "did you keep doing it?" is answerable from
  // the calendar even when there is no trend to read. A stopped discipline goes needs_data precisely
  // BECAUSE it stopped — that is the moment the athlete most needs to be told.
  assertEquals(readPosture('maintain', 'needs_data', STOPPED), 'maintain_dropped');
});

Deno.test('posture=out is PARKED — the app says nothing at all about a discipline you shelved', () => {
  const read = readPosture('out', 'sliding');
  assertEquals(read, 'parked');
  assertEquals(isConcern(read), false);
  assertEquals(postureSentence(read, 'swimming'), null);
});

// ── The vocabulary ban ────────────────────────────────────────────────────────────────────────

Deno.test('NO JARGON reaches the athlete — verified 2026-07-14 against Garmin: 0 hits for all of these', () => {
  const BANNED = ['decoupling', 'efficiency factor', 'aerobic base', 'durability', 'cardiac drift', 'posture'];
  const reads = ['developing', 'develop_stalled', 'develop_declining', 'maintaining', 'maintain_slipping', 'maintain_dropped'] as const;
  for (const r of reads) {
    for (const d of ['run', 'bike', 'swim', 'strength']) {
      const s = (postureSentence(r, disciplineWord(d), STOPPED) ?? '').toLowerCase();
      for (const w of BANNED) {
        assertEquals(s.includes(w), false, `"${w}" leaked into the ${r} / ${d} sentence: "${s}"`);
      }
    }
  }
});

Deno.test('NO CAUSE is ever asserted — we cannot see sleep, stress, illness or nutrition, so we never blame them', () => {
  // Garmin CAN see sleep and HRV and still refuses to commit a cause. We have less. We say less.
  const BANNED_CAUSES = ['because', 'due to', 'tired', 'fatigue', 'overtrain', 'losing fitness', 'lost fitness'];
  const reads = ['developing', 'develop_stalled', 'develop_declining', 'maintaining', 'maintain_slipping', 'maintain_dropped'] as const;
  for (const r of reads) {
    const s = (postureSentence(r, 'running', STOPPED) ?? '').toLowerCase();
    for (const w of BANNED_CAUSES) {
      assertEquals(s.includes(w), false, `the ${r} sentence asserts a cause we cannot see: "${s}"`);
    }
  }
});

Deno.test('the athlete\'s words, not the database\'s', () => {
  assertEquals(disciplineWord('run'), 'running');
  assertEquals(disciplineWord('strength'), 'lifting');
  assertEquals(disciplineWord('bike'), 'riding');
  assertEquals(disciplineWord('swim'), 'swimming');
});

// ── Sanitizer ─────────────────────────────────────────────────────────────────────────────────

Deno.test('sanitizePosture keeps only the three real postures and survives garbage', () => {
  assertEquals(
    sanitizePosture({ run: 'maintain', strength: 'develop', bike: 'out', swim: 'nonsense', junk: 7 }),
    { run: 'maintain', strength: 'develop', bike: 'out' },
  );
  assertEquals(sanitizePosture(null), null);
  assertEquals(sanitizePosture('maintain'), null);
  assertEquals(sanitizePosture({}), null);
  assertEquals(sanitizePosture({ swim: 'nope' }), null);
});

Deno.test("REAL GOAL ROW, 2026-07-14 — the exact bag on the athlete's active goal, end to end", () => {
  const tp = {
    run_days: 3, strength_frequency: 4, target_weekly_miles: 20,
    per_discipline_posture: { run: 'maintain', bike: 'out', swim: 'out', strength: 'develop' },
  };
  const posture = sanitizePosture(tp.per_discipline_posture)!;
  const declared = declaredSessionsPerWeek(tp);
  assertEquals(declared.run, 3);
  assertEquals(declared.strength, 4);

  // What State ACTUALLY rendered that day, in amber: "aerobic base needs work" — while his run
  // verdict was 'improving' and he had run 3 times in a month against a declared 3 a week.
  const runBehaviour = { targetSessionsPerWeek: declared.run!, actualSessionsPerWeek: 0.75 };
  const runRead = readPosture(posture.run, 'improving', runBehaviour);
  assertEquals(runRead, 'maintain_dropped');
  assertEquals(isConcern(runRead), false); // a trade is not a failure — never amber
  const s = postureSentence(runRead, disciplineWord('run'), runBehaviour)!;
  assertStringIncludes(s, 'well under half the 3-a-week plan');

  // The lifting is the job he chose, and it is holding rather than moving → THAT is the concern.
  assertEquals(isConcern(readPosture(posture.strength, 'holding')), true);
  // Swimming was parked. The app says nothing at all about a question he did not ask.
  assertEquals(postureSentence(readPosture(posture.swim, 'sliding'), 'swimming'), null);
});

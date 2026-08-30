// @ts-nocheck
/**
 * ⛔ THE SEAM NOBODY WAS TESTING: composer output → the rows the athlete actually sees.
 *
 * On 2026-08-29 (commit 6f1996d3) `expandTokensForRow` began reading `lastWeightByMovement`,
 * a map that lives inside the request handler while the function itself is at module scope.
 * The unbound identifier threw a ReferenceError on the FIRST exercise of every strength row;
 * two bare `catch {}` blocks swallowed it and fell through to the generic placeholder. Result:
 * every strength session of a generated 12-week Strong Focus plan — Test / Heavy / Speed
 * Upper + Lower AND Plyometrics — stored ONE exercise literally named "strength block" with
 * zero sets, for all 12 weeks. A second symptom rode along: weeks 2-12 exported word-for-word
 * identical, because the load wave lives in the authored exercises that never rendered.
 *
 * It survived a day and 2,415 green tests, because every one of those tests exercises
 * `composeWeek` DIRECTLY and nothing covered the stage after it. This file is that coverage.
 * `expandTokensForRow` was unexported, which was the mechanical reason nothing could reach it.
 *
 * ⚠️ THE ASSERTION IS DELIBERATELY CRUDE — no strength session, at any week, may collapse to a
 * single row named 'strength block'. It is not asserting the content of the session; the point
 * is to catch the whole class of "the expansion threw and we quietly shipped a placeholder",
 * whatever the next cause turns out to be.
 *
 * Run from repo root:
 *   deno test --no-lock --allow-all --no-check \
 *     supabase/functions/materialize-plan/strength-block-collapse.test.ts
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeWeek } from '../_shared/standing-plan/compose.ts';
import { expandTokensForRow } from './index.ts';

const BASE = {
  frame: 'strength_5k' as const,
  competitionLifts: { push_upper: 'Bench Press', press_lower: 'Back Squat', hinge_lower: 'Deadlift' },
  roundTo: 5,
};

// A generic intermediate athlete. ⛔ NOT tuned to anyone's numbers — the bug was athlete-independent
// (Plyometrics rows come from a hardcoded family list and take zero athlete input, and they
// collapsed identically), so the fixture only has to be plausible.
const baselines: any = {
  isMetric: false,
  equipment: { strength: ['barbell', 'dumbbells', 'bench'] },
  performance_numbers: { bench: 185, squat: 175, deadlift: 245 },
};

/** Exactly the row shape activate-plan inserts for a composed session. */
function rowFor(s: any) {
  return {
    type: 'strength',
    date: '2026-09-01',
    name: s.name,
    steps_preset: [],
    tags: s.tags,
    strength_exercises: s.strength_exercises ?? [],
  };
}

Deno.test('every composed strength session survives the display step — no collapse to "strength block"', () => {
  let checked = 0;
  for (const week of [1, 2, 3, 5, 8, 12]) {
    const wk = composeWeek({ ...BASE, week, column: 'standard' } as never);
    for (const s of wk.sessions) {
      if (s.type !== 'strength') continue;
      const authored = s.strength_exercises ?? [];
      if (!authored.length) continue; // the composer authored nothing; not this bug's shape
      const out = expandTokensForRow(rowFor(s), baselines, [], null, week, null, null, []);
      const names = out.steps.map((st: any) => st?.strength?.name ?? st?.kind);
      const where = `wk${week} ${s.name}`;
      assert(
        !(names.length === 1 && names[0] === 'strength block'),
        `${where}: ${authored.length} authored exercises collapsed to a single 'strength block' row`,
      );
      assertEquals(out.steps.length, authored.length, `${where}: authored ${authored.length}, materialized ${out.steps.length}`);
      checked++;
    }
  }
  // Guard the guard: if the frame stops producing strength sessions this test must fail loudly
  // rather than pass by checking nothing.
  assert(checked >= 20, `expected the frame to yield 20+ strength sessions across the sampled weeks, got ${checked}`);
});

Deno.test('the load wave still varies week to week — the second symptom of the same crash', () => {
  const fingerprints = new Set<string>();
  for (let week = 2; week <= 12; week++) {
    const wk = composeWeek({ ...BASE, week, column: 'standard' } as never);
    const parts: string[] = [];
    for (const s of wk.sessions) {
      if (s.type !== 'strength') continue;
      const out = expandTokensForRow(rowFor(s), baselines, [], null, week, null, null, []);
      for (const st of out.steps) {
        const x = st?.strength ?? {};
        parts.push(`${x.name}|${x.sets ?? ''}|${x.reps ?? ''}|${x.weight ?? ''}|${x.percent_1rm ?? ''}`);
      }
    }
    fingerprints.add(parts.join('~'));
  }
  assertEquals(fingerprints.size, 11, 'weeks 2-12 should each materialize differently; identical weeks are the collapse signature');
});

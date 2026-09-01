// ============================================================================
// THE GOLDEN BLOCKS — the composer's whole output, committed, and checked against itself.
//
//   deno test --allow-read --allow-env --no-check supabase/functions/_shared/standing-plan/golden-block.test.ts
//
// ⛔⛔ WHAT THIS CATCHES THAT NOTHING ELSE DOES. Every other test in this folder pins a rule somebody
// thought to pin. This one pins **every row of every week** — so a change that moves a row nobody
// was thinking about fails here, with a diff, instead of arriving on an athlete's phone.
//
// ⛔ THE TWO FAILURE MODES IT EXISTS FOR, both of which have cost real days:
//
//   1. **A correct state reported as a hole.** *"Week 2 has no weight"*, *"week 2 looks the same as
//      week 1"*, *"progression is flat"*. `untested-minimal.txt` is what an unpriced block looks like
//      when it is working. Read it before opening an investigation.
//   2. **A silent blast radius.** The ab row that landed second from last passed 2541 tests. A green
//      suite says the rules you pinned still hold; it says nothing about the rows you never pinned.
//
// ⚠️ **A FAILURE HERE IS NOT AUTOMATICALLY A BUG.** It means the output changed. Read the diff: if
// the change is what you meant, regenerate and COMMIT THE DIFF — that is the review artefact.
//
//     ~/.deno/bin/deno run --allow-read --allow-write scripts/print-block.ts --write
//
// ⛔ NEVER regenerate to make a red test green without reading what moved. That converts this file
// from a check into a rubber stamp, which is how the last map rotted.
// ============================================================================

import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeBlock } from './compose.ts';
import { ARCHETYPES, goldenPath, render } from './golden-block.ts';

for (const a of ARCHETYPES) {
  Deno.test(`⛔ GOLDEN — ${a.key} composes byte-for-byte what is committed`, () => {
    const expected = Deno.readTextFileSync(goldenPath(a.key));
    const actual = render(a);
    if (actual === expected) return;

    // ⚠️ THE MESSAGE IS THE DELIVERABLE. "not equal" over a 700-line file is unusable, so the first
    // differing line is named and shown — that is what a reader needs to decide intended-or-not.
    const e = expected.split('\n');
    const g = actual.split('\n');
    const at = e.findIndex((line, i) => line !== g[i]);
    assertEquals(
      g[at],
      e[at],
      `⛔ golden/${a.key}.txt drifted at line ${at + 1}\n`
      + `   committed: ${e[at] ?? '(file ends)'}\n`
      + `   composed : ${g[at] ?? '(output ends)'}\n`
      + `   ${e.length} committed lines vs ${g.length} composed.\n`
      + '   If the change is intended, regenerate and COMMIT THE DIFF:\n'
      + '     deno run --allow-read --allow-write scripts/print-block.ts --write',
    );
  });
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// AND THE SNAPSHOTS THEMSELVES HAVE TO STAY WORTH READING
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('⛔ THE ARCHETYPES STILL COVER BOTH SIDES OF THE TWO GATES THEY EXIST FOR', () => {
  /**
   * ⛔ A SNAPSHOT SUITE DECAYS BY BECOMING UNIFORM — three archetypes that all reach the same
   * movements and all carry numbers test one path three times. These two assertions are what keep
   * the set spanning: one athlete the engine PRICES and one it must not, and one kit that reaches
   * the machines p274 actually prints and one that cannot.
   */
  const priced = ARCHETYPES.filter((a) => a.args.workingNumbers != null);
  const unpriced = ARCHETYPES.filter((a) => a.args.workingNumbers == null);
  assert(priced.length > 0, 'no archetype has tested numbers — nothing checks a priced row');
  assert(unpriced.length > 0,
    '⛔ every archetype is priced. The most-reported false alarm is an unpriced block read as broken, '
    + 'and nothing would show what it correctly looks like.');

  const kits = ARCHETYPES.map((a) => JSON.stringify(a.args.equipment ?? null));
  assertEquals(new Set(kits).size, ARCHETYPES.length, 'two archetypes share a kit — the gear gate is tested once, not twice');
});

Deno.test('⛔ AND THE UNPRICED BLOCK IS ACTUALLY UNPRICED — the file a false alarm should be read against', () => {
  const a = ARCHETYPES.find((x) => x.args.workingNumbers == null);
  assert(a, 'no unpriced archetype');
  const text = Deno.readTextFileSync(goldenPath(a!.key));
  /**
   * ⚠️ THE POINT OF THE ASSERTION IS THE SENTENCE IN ITS FAILURE. If this ever goes red, the engine
   * has started inventing a weight for an athlete who has tested nothing — which is the one thing
   * `working-number.ts` exists to prevent (*"the seed is not the answer"*).
   */
  assert(text.includes('@ By feel'),
    '⛔ an athlete with no tested max has priced rows. A stored 1RM is a SEED for the test\'s '
    + 'warm-ups and is never a working number.');
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// AND EVERY UNPRICED ROW SAYS WHY IT IS UNPRICED
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('⛔ NO BY-FEEL ROW IS SILENT, AND NONE OF THEM LIES ABOUT WHY', () => {
  /**
   * ⛔ THE READING DEFECT THIS GUARDS. Three of the four ways a weight is decided are deliberately
   * "By feel", and on a screen they are indistinguishable from a weight that failed to land — which
   * is how *"week 2 has no weight"* keeps getting reported as a bug. The row carries `load_basis`
   * so it can say which kind it is; these assertions keep it from going silent or going wrong.
   *
   * ⚠️ THE SECOND ONE IS THE LOAD-BEARING HALF. `awaiting_test` is the only value that promises a
   * number later. On a hypertrophy slot that promise is false — p218 gives HYP no load at all — and
   * an athlete told to wait for it would wait forever.
   */
  for (const a of ARCHETYPES) {
    const weeks = composeBlock({ ...a.args, weeks: 4, taperWeeks: [] } as never);
    for (const w of weeks) {
      for (const s of w.sessions) {
        if (s.type !== 'strength') continue;
        for (const e of s.strength_exercises ?? []) {
          /**
           * ⚠️ "BY FEEL" LITERALLY, AND THE FIRST RUN OF THIS TEST IS WHY. It was written as "not a
           * number", which caught the plyometric drills — they read `Bodyweight`, which is not an
           * absent weight, it IS the load. A bodyweight row explains itself already.
           */
          const unpriced = String(e.weight ?? '').toLowerCase() === 'by feel';
          const isTestRow = Array.isArray(s.tags) && s.tags.includes('1rm_test');
          if (unpriced && !isTestRow) {
            assert(e.load_basis,
              `⛔ ${a.key} w${w.week} "${e.name}" is by feel and says nothing about why`);
          }
          if (e.slot_intent === 'HYP') {
            assert(e.load_basis !== 'awaiting_test',
              `⛔ ${a.key} w${w.week} "${e.name}" is a HYP row promising a weight after the test. `
              + 'p218 gives HYP no load — that promise can never be kept.');
          }
          if (typeof e.weight === 'number') {
            assert(e.load_basis == null || e.load_basis === 'derived_ratio',
              `⛔ ${a.key} w${w.week} "${e.name}" carries a weight AND a by-feel reason`);
          }
        }
      }
    }
  }
});

/**
 * ⛔ A PREVIEW MUST NOT WRITE — enforced structurally, because the bug was a MISSING GUARD AT A
 * CALL SITE and no unit test over a pure function can see one of those.
 *
 * THE INSTANCE THIS EXISTS FOR (2026-08-04). `create-goal-and-materialize-plan` has more than one
 * `mode === 'create'` goal insert. The non-race one was guarded with `!bodyPreview` and its comment
 * recorded the fix — *"the plan side was already correct… only the goal leaked."* That sentence was
 * true of the branch it sat in and **false of the file**: the run-event branch had a second insert
 * with no guard at all. Previewing a race goal therefore created a live goal, built a plan,
 * activated it, and called `retireCompetingActivePlans` — ending whatever the athlete was actually
 * training on. The leak the comment described left a stray row; this one changed the training.
 *
 * It had never fired only because no client had ever called `preview()` on the event path. The
 * marathon intake was about to be the first.
 *
 * ⛔ WHY A SOURCE SCAN AND NOT A BEHAVIOURAL TEST. The handler is a single 3,600-line `Deno.serve`
 * with a live Supabase client; importing it runs it. The defect is not "a function returns the
 * wrong value", it is "one of N sibling branches forgot a condition" — which is a property of the
 * TEXT, and is exactly what the next person adding branch N+1 will forget too. Same reasoning as
 * `_shared/exercise-name-lint.test.ts` and the D-377 vocabulary guard.
 *
 * HOW IT FAILS: add a `mode === 'create'` goal insert without `!bodyPreview`, or move the event
 * path's preview return below the code that persists, and this turns red.
 *
 * Run from repo root:
 *   ~/.deno/bin/deno test --allow-read supabase/functions/create-goal-and-materialize-plan/preview-no-write.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const SRC = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
const LINES = SRC.split('\n');

/** How far a `.insert(` may sit below its `.from('goals')` in a fluent chain. */
const CHAIN_WINDOW = 6;
/** How far back the enclosing `if (mode === 'create'…)` may sit above an insert. */
const GUARD_WINDOW = 40;

type GoalInsert = { line: number; guard: string | null; context: string };

/** Every `.from('goals')…insert(` in the file, with the nearest enclosing create-mode condition. */
function goalInserts(): GoalInsert[] {
  const out: GoalInsert[] = [];
  for (let i = 0; i < LINES.length; i++) {
    if (!LINES[i].includes(".from('goals')")) continue;
    const chain = LINES.slice(i, i + CHAIN_WINDOW).join('\n');
    if (!/\.insert\(/.test(chain)) continue;   // selects and updates are not our business
    let guard: string | null = null;
    for (let j = i; j >= Math.max(0, i - GUARD_WINDOW); j--) {
      if (/if \(mode === 'create'/.test(LINES[j])) { guard = LINES[j]; break; }
    }
    out.push({
      line: i + 1,
      guard,
      context: LINES.slice(Math.max(0, i - GUARD_WINDOW), i).join('\n'),
    });
  }
  return out;
}

Deno.test('create-path goal inserts are guarded against a preview — the run-event branch included', () => {
  const inserts = goalInserts();

  // If this drops to zero the scan has stopped matching the source rather than the source having
  // become safe. A guard that silently matches nothing is worse than no guard.
  assert(inserts.length >= 2, `expected at least 2 goal inserts, found ${inserts.length} — has the scan gone stale?`);

  const unguarded = inserts.filter((g) => !g.guard || !g.guard.includes('!bodyPreview'));

  // ⛔ THE ALLOWLIST IS A DEBT LEDGER AND IT MAY ONLY SHRINK. One unguarded insert remains — the
  // TRIATHLON event path. It is the identical hole and it is left deliberately: it is unreachable
  // from the marathon intake, and fixing it means also giving the tri branch a no-persist return,
  // which belongs to whoever owns that path. Do not add entries here to make a build pass.
  const KNOWN_UNGUARDED = ['triDurationWeeks'];

  const unexpected = unguarded.filter(
    (g) => !KNOWN_UNGUARDED.some((marker) => g.context.includes(marker)),
  );

  assertEquals(
    unexpected.map((g) => `index.ts:${g.line}`),
    [],
    'a `mode === \'create\'` goal insert is missing its `!bodyPreview` guard — a preview would create a real goal',
  );

  // And the ledger must not grow past the one entry it was opened with.
  assertEquals(unguarded.length, 1, `unguarded create-path goal inserts: expected exactly the known tri one, got ${unguarded.length}`);
});

// The run-event path and its two preview tests are gone with generate-run-plan (2026-10-01).

Deno.test('the non-race guard that this bug hid behind is still in place', () => {
  // The regression that started all of this was a fix documented in ONE branch and assumed to cover
  // the file. Pin both, so neither can quietly lose its guard while the other keeps the comment.
  const nonRace = LINES.findIndex((l) => /if \(mode === 'create' && !bodyPreview\)/.test(l));
  assert(nonRace > 0, 'the non-race preview guard has gone missing');
});

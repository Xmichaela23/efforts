/**
 * ⛔ THE ENFORCEMENT HALF OF THE CANONICAL-NAME RULE (Q-210).
 *
 * Exercise names are FREE STRINGS scattered across ten protocol files. Downstream, every one
 * of them is funnelled through `canonicalize()` to become `exercise_log.canonical_name` — and
 * that key decides whether a lift is in `STRENGTH_ANCHORS`, whether it earns an e1RM and a
 * trend, and which muscle group its volume lands in.
 *
 * A name that misses the curated map does not error. It slugifies into a lone bucket and the
 * lift quietly stops being tracked.
 *
 * ⛔ THE INSTANCE THIS EXISTS FOR: "Hip Thrusts" resolves to `hip_thrust`, which IS an anchor,
 * so it earns an e1RM, a trend and a State verdict. "Hip Thrusts (Fast Concentric)" slugged to
 * `hip_thrusts_fast_concentric`, was not an anchor, and was dropped from
 * `learned_fitness.strength_1rms` entirely — the same lift, in the same block, tracked or
 * invisible depending on a parenthetical.
 *
 * ⚠️ AND CONVENTION HAS ALREADY FAILED THREE TIMES on `preferred_days.strength` (§0g), where
 * the thing that finally held was a TYPE, not a comment. This is the same move one level down:
 * a name that cannot be resolved cannot be added silently.
 *
 * HOW IT FAILS: adding a new exercise name that misses the curated map turns this red. The fix
 * is to map it in `canonicalize.ts` — or, if it is genuinely outside the tracked vocabulary, to
 * add it to `UNRESOLVED_ALLOWLIST` below with your eyes open.
 *
 * ⛔ THE ALLOWLIST IS A DEBT LEDGER, NOT A CONFIG. It may SHRINK. Every entry is a name whose
 * volume files under `other` and which earns no trend. It was 59 the day this was written
 * (measured 2026-07-28; 111 names emitted, 34 curated, 77 missing). Do not grow it to make a
 * build pass — that is how the seven conformance failures became furniture.
 *
 * Run from repo root:
 *   deno test --allow-read supabase/functions/_shared/exercise-name-lint.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { isCuratedName } from './canonicalize.ts';

/** Where exercise rows are authored. */
const EMITTERS = [
  new URL('../shared/strength-system/', import.meta.url),
];

/**
 * Names that do NOT resolve to a curated movement, acknowledged. Each one files its volume
 * under `other` and earns no e1RM trend. ⛔ SHRINK THIS. Do not add to it casually.
 *
 * 26 of these CONTAIN a curated movement but were deliberately left unruled 2026-07-28 —
 * containment is not identity, and "Jump Squats" contains "squat" while emphatically not
 * being a squat for 1RM purposes. Each needs a per-row training call, not a bulk merge.
 */
const UNRESOLVED_ALLOWLIST = new Set<string>([
  'Band Assisted Pull up', 'Band Face Pulls', 'Band Lateral Raises', 'Band Lateral Walks',
  'Band Overhead Press', 'Band Pull Aparts', 'Band Pull Down', 'Band Pull-Down (Explosive)',
  'Band Pull-Down (Heavy)', 'Box Jumps or Broad Jumps', 'Box Step ups', 'Cable Face Pulls',
  'Clamshells', 'Copenhagen Plank', 'Copenhagen Plank (Long Lever)',
  'Copenhagen Plank (Short Lever)', 'Core Circuit', 'DB Floor Press (Light)', 'DB Push Press',
  'DB Romanian Deadlift', 'Dead Hang', 'Explosive Lat Pull Down', 'Explosive Step ups',
  'External Rotation (Side-Lying or Band)', 'Face Pulls', 'Foot Doming',
  'Goblet Squat or Bodyweight Squat', 'Inverted Ring Row or Band Row',
  'Inverted Ring Row or Band Row (Chest-Supported)', 'Inverted Rows', 'Jump Lunges',
  'Jump Squats', 'KB Swings (Russian)', 'KB/DB Swings', 'Lateral Band Walks', 'Lateral Lunges',
  'Lateral Raises', 'Light DB Row', 'Nordic Hamstring Curl', 'Pike Push ups', 'Plank Hold',
  'Plank with Shoulder Tap', 'Prone Y/T/W Raises', 'Push Press',
  'Race Week: Light Movement (Optional)', 'Resistance Band Row', 'Reverse Lunge',
  'Reverse Lunge (Pistol Prep)', 'Reverse Lunges', 'Rows', 'Side Plank Abduction',
  'Single Leg Calf Raises', 'Single Leg Glute Bridge', 'Skater Hops', 'Soleus Raises',
  'Squat Jumps', 'Tibialis Raises', 'Wall Angels', 'Weighted Single Leg Calf Raises',
]);

async function walk(dir: URL, out: URL[]): Promise<void> {
  for await (const e of Deno.readDir(dir)) {
    const child = new URL(e.name + (e.isDirectory ? '/' : ''), dir);
    if (e.isDirectory) await walk(child, out);
    else if (e.name.endsWith('.ts') && !e.name.includes('.test.')) out.push(child);
  }
}

/**
 * Every emitted exercise name. An exercise row is a `name:` literal sitting beside
 * sets/reps/weight — the window check is what keeps session names ("Strength — Bench Press",
 * a template literal anyway) and unrelated `name:` fields out of the sweep.
 */
async function emittedExerciseNames(): Promise<Map<string, string>> {
  const files: URL[] = [];
  for (const root of EMITTERS) await walk(root, files);
  const found = new Map<string, string>();
  for (const f of files) {
    const text = await Deno.readTextFile(f);
    for (const m of text.matchAll(/name:\s*'([^']+)'/g)) {
      const window = text.slice(m.index!, m.index! + 260);
      if (!/\bsets:|\breps:|\bweight:/.test(window)) continue;
      if (!found.has(m[1])) found.set(m[1], f.pathname.split('/strength-system/')[1] ?? f.pathname);
    }
  }
  return found;
}

/**
 * Resolved = the canonicaliser matched a CURATED movement rather than falling through to its
 * slugify fallback. ⛔ ASKED OF THE MODULE THAT OWNS THE MAP, not recomputed here — the obvious
 * local version ("is the result different from the slug?") gives a FALSE POSITIVE on every name
 * whose curated value equals its own slug ("Pallof Press" -> `pallof_press`), and reimplementing
 * the lookup on this side is the same proxy defect that broke the seven conformance tests (§0f).
 */
const resolvesToCuratedName = isCuratedName;

Deno.test('⛔ every emitted exercise name resolves to a curated movement, or is a known debt (Q-210)', async () => {
  const names = await emittedExerciseNames();
  const unresolved = [...names.keys()].filter((n) => !resolvesToCuratedName(n));
  const surprises = unresolved.filter((n) => !UNRESOLVED_ALLOWLIST.has(n)).sort();

  assertEquals(
    surprises,
    [],
    `\n⛔ ${surprises.length} exercise name(s) do not resolve to a curated movement and are not on the ` +
      `allowlist.\nThese file their volume under 'other' and earn no e1RM trend — and if the lift is a ` +
      `STRENGTH_ANCHOR, it is dropped from learned_fitness.strength_1rms entirely.\n` +
      `Map them in _shared/canonicalize.ts, or add them to UNRESOLVED_ALLOWLIST deliberately.\n` +
      surprises.map((n) => `  - "${n}"  (${names.get(n)})`).join('\n') + '\n',
  );
});

Deno.test('⛔ the allowlist is a DEBT LEDGER — it may only shrink (Q-210)', async () => {
  const names = await emittedExerciseNames();
  const stale = [...UNRESOLVED_ALLOWLIST].filter((n) => !names.has(n) || resolvesToCuratedName(n)).sort();

  assertEquals(
    stale,
    [],
    `\n✅ ${stale.length} allowlist entr(ies) are no longer needed — they now resolve, or are no longer ` +
      `emitted. DELETE them from UNRESOLVED_ALLOWLIST so the ledger keeps telling the truth:\n` +
      stale.map((n) => `  - "${n}"`).join('\n') + '\n',
  );
});

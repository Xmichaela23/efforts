/**
 * ═══ THE ENFORCEMENT. Stage 4 of the planned-session consolidation. ═══════════════════════════
 *
 * ⛔ WHY A TEST AND NOT AN ESLINT RULE. A custom eslint rule needs a plugin package; `CLAUDE.md`
 * forbids speculative npm deps, and `eslint.config.js` here has no local-rule loader. A source scan
 * in the test suite needs nothing, runs in the same `deno test` everything else runs in, and can say
 * far more than "no-restricted-syntax" ever could — it names the file, the line, and the accessor to
 * use instead.
 *
 * ⛔ WHAT IT DEFENDS. The consolidation collapsed four duration ladders and six discipline
 * normalizers onto `src/lib/planned-session/duration.ts` and `src/lib/discipline.ts`. Nothing stops
 * the NEXT session from writing `w.computed?.total_duration_seconds` in a new component — which is
 * exactly how there came to be four of them. Every one was individually defensible; the class was
 * never fixed. **This file fixes the class.**
 *
 * ⚠️ IT IS AN ALLOWLIST, NOT A BAN. Reading these fields is legitimate in the accessors themselves,
 * in the mappers and types that define the shape, and in the tests that pin it. Everywhere else, a
 * new read is a new ladder. When this fails, the fix is almost never to add yourself to the allowlist
 * — it is to call the accessor. If you genuinely belong here, say WHY in the entry.
 *
 * Run:
 *   ~/.deno/bin/deno test --no-check --allow-read src/lib/planned-session/enforcement.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const SRC = new URL('../../', import.meta.url);       // → src/

async function walk(dir: URL, out: string[] = []): Promise<string[]> {
  for await (const e of Deno.readDir(dir)) {
    const child = new URL(`${e.name}${e.isDirectory ? '/' : ''}`, dir);
    if (e.isDirectory) await walk(child, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(child.pathname);
  }
  return out;
}

const rel = (p: string) => p.slice(p.indexOf('/src/') + 1);

/** Lines that are pure comment are not reads. Crude but it only ever produces FALSE NEGATIVES. */
const isComment = (line: string) => /^\s*(\/\/|\/\*|\*)/.test(line);

type Violation = { file: string; line: number; text: string };

async function scan(
  pattern: RegExp,
  allow: (file: string) => boolean,
): Promise<Violation[]> {
  const found: Violation[] = [];
  for (const file of await walk(SRC)) {
    const r = rel(file);
    if (allow(r)) continue;
    const lines = (await Deno.readTextFile(file)).split('\n');
    lines.forEach((text, i) => {
      if (!isComment(text) && pattern.test(text)) {
        found.push({ file: r, line: i + 1, text: text.trim().slice(0, 100) });
      }
    });
  }
  return found.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

const show = (v: Violation[]) => v.map((x) => `\n  ${x.file}:${x.line}  ${x.text}`).join('');

// ─────────────────────────────────────────────────────────────────────────────────────────────

Deno.test('⛔ ENFORCEMENT · no new duration ladders — read `plannedDurationSeconds`', async () => {
  /**
   * The four readers this replaced: `resolveMovingSeconds`, `resolvePlannedDuration`,
   * `PlannedWorkoutSummary.computeMinutes`, and inline reads in `AllPlansInterface` (×3) and
   * `TodaysEffort`. All gone or delegating.
   */
  const ALLOWED = new Set([
    // THE ACCESSOR ITSELF, and the two readers that now delegate to it.
    'src/lib/planned-session/duration.ts',
    'src/utils/resolveMovingSeconds.ts',
    'src/utils/resolvePlannedDuration.ts',
    // SHAPE DEFINITIONS — these declare the field, they do not resolve a duration from it.
    'src/types/planned-workout.ts',
    'src/types/workoutExecution.ts',
    'src/lib/session-discipline-swap.ts',
    // STRUCTURE CONSUMERS — handed an already-resolved `computed`/structure blob, never a planned
    // row, so the row accessor does not apply. See the scope note in `duration.ts`.
    'src/components/workout-execution/PreRunScreen.tsx',
    'src/services/plans/templates/workoutDisplayTemplates.ts',
    'src/services/watchConnectivity.ts',
    // WRITERS / hydration checks — asking "did materialization run", not "how long is this".
    'src/hooks/usePlannedWorkoutLink.ts',
    'src/components/StrengthLogger.tsx',
    // Fixtures.
    'src/lib/planned-session-golden.test.ts',
    'src/lib/planned-session/enforcement.test.ts',
    'src/utils/workout-mappers.test.ts',
  ]);
  /**
   * ⚠️ PROPERTY READS ONLY (`.total_duration_seconds`), NOT object-literal KEYS. Writing the field
   * — in a fixture, a mapper, a default structure — is not a reader and never drifted. Reading it to
   * answer "how long is this session" is the entire bug class. Narrowing to the dot form is what
   * makes this rule quiet enough to be trusted instead of muted.
   */
  const v = await scan(/\.total_duration_seconds\b/, (f) => ALLOWED.has(f) || f.endsWith('.test.ts'));
  assertEquals(
    v, [],
    `New duration reader(s). Call plannedDurationSeconds(row) from ` +
    `'@/lib/planned-session/duration' instead of reading the column:${show(v)}\n`,
  );
});

Deno.test('⛔ ENFORCEMENT · no new discipline ladders — read `normalizeDiscipline`', async () => {
  /**
   * The tell is a hand-rolled substring ladder over sport names — `includes('cycl')`,
   * `includes('bike')`, `includes('jog')`. Six of these existed; two more were found in stage 4
   * (`MobileSummary`, `GarminDataService`) that the SPEC's own table had missed.
   *
   * ⚠️ Provider vocabulary is a REAL exception and has a named home: `normalizeProviderSport`.
   * `normalizeDiscipline` answers null for `road_biking` / `mtb`, so provider keys are not the same
   * question. Add provider noise THERE, not in a new private ladder.
   */
  const ALLOWED = new Set([
    'src/lib/discipline.ts',              // the accessor + the provider boundary
    'src/lib/planned-session/enforcement.test.ts',
    'src/lib/planned-session-golden.test.ts',
  ]);

  /**
   * ⛔ THE PRE-EXISTING DEBT, FROZEN AS A BASELINE — 15 more ladders in 11 files, found by this scan
   * on the day it was written. **They are NOT fixed and this list is not approval.** Stage 4's brief
   * was the two the SPEC named (`MobileSummary`, `GarminDataService`); those are done. The rest are
   * mostly ANALYSIS-side or completed-workout-side (`CompletedTab`, `WorkoutDetail`, `WorkoutSummary`,
   * `useWorkouts`), which SPEC §2 scoped out on purpose — the analysis side speaks `bike` and is
   * internally consistent in it, so migrating it needs the server contract to move first (Stage 1b).
   *
   * ⚠️ WHAT THIS BUYS: a NEW FILE with a hand-rolled ladder fails immediately. That is the whole
   * point — the class stops growing while the backlog is worked down.
   *
   * ⛔ THIS LIST MAY ONLY SHRINK. Deleting an entry after migrating its file is the intended edit.
   * Adding one means a new ladder was written instead of calling the accessor — don't.
   *
   * ⚠️ THE HONEST LIMIT: the allowlist is per FILE, so a NEW ladder added inside one of these 11
   * files still slips through. Tightening that needs a per-occurrence baseline, which line numbers
   * make brittle. Stated rather than papered over.
   */
  const KNOWN_DEBT = new Set([
    'src/components/CompletedTab.tsx',
    'src/components/FitFileImporter.tsx',
    'src/components/UnifiedWorkoutView.tsx',
    'src/components/WorkoutDetail.tsx',
    'src/components/WorkoutSummary.tsx',
    'src/hooks/useWorkouts.ts',
    'src/lib/plan-goal-conflict.ts',
    'src/lib/utils.ts',
    'src/services/StravaDataService.ts',
  ]);
  const LADDER = /\.includes\(\s*['"](cycl|bike|bik|ride|jog|swimming|mtb|gravel)['"]\s*\)/;
  const v = await scan(LADDER, (f) => ALLOWED.has(f) || KNOWN_DEBT.has(f) || f.endsWith('.test.ts'));
  assertEquals(
    v, [],
    `New discipline ladder(s). Call normalizeDiscipline(type) — or normalizeProviderSport(key) for ` +
    `provider vocabulary — from '@/lib/discipline':${show(v)}\n`,
  );
});

Deno.test('⛔ ENFORCEMENT · the client planned-row mapper stays deleted', async () => {
  /**
   * Stage 3 deleted `mapUnifiedItemToPlanned`. The failure mode it guards is specific and cheap to
   * repeat: a field is missing from a planned row, and the fastest local fix is to rebuild the row
   * client-side rather than add the column to `get-week` and redeploy. That is how the two mappers
   * came to exist, and they drifted in BOTH directions.
   */
  const v = await scan(
    /mapUnifiedItemToPlanned/,
    (f) => f === 'src/lib/planned-session/enforcement.test.ts',
  );
  assertEquals(
    v, [],
    `The client planned mapper is back. Add the field to get-week's select AND toPlannedWorkout, ` +
    `then redeploy get-week:${show(v)}\n`,
  );
});

Deno.test('⛔ ENFORCEMENT · unknown disciplines are null — never `run`', async () => {
  /**
   * ⛔ ASSERTED ON BEHAVIOUR, NOT ON AN IDIOM. The first draft of this test grepped for `|| 'run'`
   * and flagged six legitimate lines — picking a default race discipline, seeding a builder — none
   * of which were normalizers. A tripwire that cries wolf gets muted, so it was replaced with the
   * property itself: run the real exported normalizers over things that are not disciplines.
   *
   * The defect it guards: `AssociatePlannedDialog` and `auto-attach-planned` both ended `|| 'run'`,
   * so a kayak was offered the athlete's planned RUNS in the code that decides what a completed
   * activity attaches to.
   */
  const { normalizeDiscipline, normalizeSessionType, normalizeProviderSport } =
    await import('../discipline.ts');
  const { normalizeSport } = await import('../associate-candidates.ts');
  const { disciplineOf } = await import('../session-discipline-swap.ts');

  for (const unknown of ['kayak', 'rowing', 'elliptical', 'padel', '', '   ', 'undefined']) {
    assertEquals(normalizeDiscipline(unknown), null, `normalizeDiscipline(${unknown})`);
    assertEquals(normalizeSessionType(unknown), null, `normalizeSessionType(${unknown})`);
    assertEquals(normalizeProviderSport(unknown), null, `normalizeProviderSport(${unknown})`);
    assertEquals(disciplineOf(unknown), null, `disciplineOf(${unknown})`);
    assertEquals(normalizeSport(unknown), '', `normalizeSport(${unknown})`);
  }
  // Null/undefined are not runs either.
  assertEquals(normalizeDiscipline(null), null);
  assertEquals(normalizeDiscipline(undefined), null);
  assertEquals(normalizeProviderSport(null), null);
});

Deno.test('⛔ ENFORCEMENT · the provider boundary still knows what canon does not', async () => {
  /**
   * ⚠️ THE REGRESSION THIS EXISTS TO CATCH is the tempting "simplification": deleting
   * `normalizeProviderSport` and pointing `GarminDataService` at `normalizeDiscipline`. Measured in
   * stage 4 — the canonical ladder tests `includes('bike')` and "biking" does not contain "bike", so
   * these three answer NULL there. Every MTB and gravel ride would drop out of the learning pipeline
   * silently, with nothing failing.
   */
  const { normalizeDiscipline, normalizeProviderSport } = await import('../discipline.ts');
  for (const key of ['road_biking', 'mountain_biking', 'mtb']) {
    assertEquals(normalizeDiscipline(key), null, `canon is expected to MISS ${key}`);
    assertEquals(normalizeProviderSport(key), 'ride', `the provider boundary must catch ${key}`);
  }
  // And canon still wins where it has an answer.
  assertEquals(normalizeProviderSport('cycling'), 'ride');
  assertEquals(normalizeProviderSport('running'), 'run');
  assertEquals(normalizeProviderSport('lap_swimming'), 'swim');
});

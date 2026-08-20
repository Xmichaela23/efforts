/**
 * ⛔ THE ENFORCEMENT HALF OF THE ANCHOR RULE (TRUTH-MAP §5, 2026-08-19).
 *
 * `docs/TRUTH-MAP.md` states the law already:
 *
 *   > **A reference anchor** (FTP, threshold, 1RM, CSS) → `user_baselines`, read through its
 *   > resolver (`resolveCurrentFtp`, `resolveStrengthCapacity`) — **never read the raw column past
 *   > the resolver.**
 *
 * Nothing enforced it, so every new surface quietly grew its own chain. That is the "ten different
 * things" problem stated exactly: a fact with one owner and a dozen private readers, each free to
 * apply a different confidence bar, a different unit, a different fallback order — and no way to
 * notice they disagree until a number looks wrong on a screen.
 *
 * ⛔ THE INSTANCE THIS EXISTS FOR (verified by code trace, 2026-08-19). `compute-snapshot` — THE
 * SPINE, the thing the State screen renders — reads `learned_fitness.run_threshold_pace_sec_per_km`
 * straight, with **no confidence check at all**, then falls back to a `performance_numbers` spelling
 * the shared resolver does not even list. The resolver refuses a low-confidence read; the spine
 * takes it. A separate guard (an 8-run floor on the projection) is the only reason a two-run
 * contaminated threshold did not print a race time to the second on State. Right outcome, wrong
 * reason — a bad read from 8+ runs would have sailed through.
 *
 * HOW IT FAILS: a file that reads one of these raw columns and is not on the ledger turns this red.
 * The fix is to call the resolver. If the file genuinely must touch the raw column — it WRITES the
 * value, or it renders the stored receipt (confidence / sample_count / as_of) that the resolver does
 * not carry — add it to the ledger with a reason, with your eyes open.
 *
 * ⛔ THE LEDGER IS A DEBT LEDGER, NOT A CONFIG. It may SHRINK. It was 49 entries the day it was
 * written. Do not grow it to make a build pass — that is how the exercise-name allowlist's seven
 * conformance failures became furniture (Q-210). The `unreviewed` entries are the work queue.
 *
 * ⚠️ COMMENTS ARE STRIPPED BEFORE MATCHING, and that is load-bearing rather than tidiness. This
 * codebase comments heavily and names these columns constantly in prose; a naive grep reported ~70
 * readers where there are 49. A lint that cries wolf gets an allowlist entry instead of a fix.
 *
 * Run from repo root:
 *   deno test --allow-read supabase/functions/_shared/anchor-resolver-lint.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const REPO = new URL('../../../', import.meta.url);

/** The facts that have an owner, and the raw columns that owner exists to hide. */
const ANCHORS: { fact: string; resolver: string; patterns: RegExp[] }[] = [
  {
    fact: 'run easy pace',
    resolver: 'resolveCurrentRunEasyPace',
    patterns: [/run_easy_pace_sec_per_km/],
  },
  {
    fact: 'run threshold pace',
    resolver: 'resolveCurrentRunThresholdPace',
    patterns: [/run_threshold_pace_sec_per_km/],
  },
  {
    fact: 'ftp',
    resolver: 'resolveCurrentFtp',
    patterns: [/ride_ftp_estimated/, /performance_numbers\??\s*[.?]\s*ftp\b/, /performance_numbers\??\s*\[\s*['"]ftp/],
  },
  {
    fact: 'lthr',
    resolver: 'resolveCurrentLthr',
    patterns: [/run_threshold_hr/, /ride_threshold_hr/],
  },
  {
    // ⚠️ SWIM HAS NO RESOLVER, AND THAT IS A RECORDED DECISION, NOT AN OVERSIGHT. TRUTH-MAP calls the
    // CSS anchor "orphaned" — shown on Baselines, read by nothing in the swim verdict, and staged off
    // in plan-gen (`planning-context.ts` SWIM_CSS_LIVE = false). Swim stays minimal by design, so the
    // ledger TRACKS these rather than demanding they be routed somewhere that does not exist. Listed
    // so a future session sees the shape of the debt without being told to go build swim plumbing.
    fact: 'swim css',
    resolver: '(none — deliberately unowned; see note)',
    patterns: [/swim_pace_per_100m/],
  },
];

type Reason =
  /** Writes the value. Must touch the column; the resolver reads, it does not write. */
  | 'writer'
  /** Renders the stored receipt — confidence / sample_count / as_of — which the resolver does not carry. */
  | 'receipt'
  /** Tests only whether ANY signal exists. A presence gate, not a value read. */
  | 'presence-gate'
  /** Hands the raw metric to an engine that does its own confidence gating (the D-033 reconciler). */
  | 'reconciler-input'
  /** ⛔ VERIFIED DEBT — this file decides something off a raw column. Route it through the resolver. */
  | 'debt'
  /** The fact has no resolver for THIS sport yet, so there is nowhere to route it. Blocked, not owed. */
  | 'no-owner'
  /**
   * ⛔ NOT A READ AT ALL — the column name is an OUTPUT KEY. `calculate-workload:554` echoes the
   * resolved anchors back in a debug payload under the same names it would have read them from. The
   * lint matches a name, not a direction; listed rather than silenced so the count stays honest.
   */
  | 'output-key'
  /**
   * ⛔ NOT A READ AT ALL — the column name appears inside a PROMPT STRING that describes the data
   * schema to the model. The comment-stripper cannot see inside a template literal, so these are the
   * lint's own false positives. Listed rather than silenced so the count stays honest.
   */
  | 'prompt-text'
  /**
   * ⛔ WANTS THE MEASUREMENT SPECIFICALLY, not "the athlete's current value". A provisional-baseline
   * derivation or a race projection is built FROM measured data by definition — handing it a number
   * the athlete typed would be deriving a measurement from an assertion. `race-projections.ts` and
   * `infer-training-fitness.ts` express the same intent by gating the resolver to `source==='learned'`;
   * a reader that ALSO needs the learned-only `last_updated` stamp reads the column instead.
   */
  | 'measurement-source'
  /**
   * ⛔ COMPARES learned AGAINST typed, and therefore needs BOTH SIDES. A resolver returns the WINNER,
   * which is exactly the wrong shape for a divergence detector — routing one of these would delete
   * the comparison it exists to make. `block-adaptation:510` already says so in its own comment.
   */
  | 'comparator'
  /** Not yet categorised. Assume debt until someone reads it. This is the work queue. */
  | 'unreviewed';

/**
 * ⛔ THE LEDGER. `fact::path` → why it is allowed to touch the raw column.
 *
 * Only `writer`, `receipt`, `presence-gate` and `reconciler-input` are resting states. `debt` and
 * `unreviewed` are work, and the count of them is the honest measure of how far this is from done.
 */
const LEDGER: Record<string, Reason> = {
  // Echoes the RESOLVED anchors back in a debug payload; both sports resolve through the owner now.
  'lthr::supabase/functions/calculate-workload/index.ts': 'output-key',
  // ── run easy pace ────────────────────────────────────────────────────────
  'run easy pace::supabase/functions/learn-fitness-profile/index.ts': 'writer',
  'run easy pace::src/components/TrainingBaselines.tsx': 'receipt',
  'run easy pace::src/lib/run-pace-calibration.ts': 'presence-gate',
  'run easy pace::supabase/functions/generate-combined-plan/index.ts': 'reconciler-input',
  'run easy pace::supabase/functions/_shared/arc-setup-prompt.ts': 'prompt-text',
  'run easy pace::supabase/functions/_shared/block-adaptation/index.ts': 'comparator',
  'run easy pace::supabase/functions/adapt-plan/index.ts': 'comparator',
  // Remaining raw read is the SERVER PACE GATE (`:3630` `learnedPaceUsable`) — a presence test
  // mirrored by `run-pace-calibration.ts:hasPaceBenchmark` on the client. Change one, change both;
  // it asks whether ANY signal exists, not what the value is. The seed and the limiter are routed.
  'run easy pace::supabase/functions/create-goal-and-materialize-plan/index.ts': 'presence-gate',

  // ── run threshold pace ───────────────────────────────────────────────────
  'run threshold pace::supabase/functions/learn-fitness-profile/index.ts': 'writer',
  'run threshold pace::supabase/functions/compute-workout-analysis/index.ts': 'writer',
  'run threshold pace::src/components/TrainingBaselines.tsx': 'receipt',
  'run threshold pace::src/lib/run-pace-calibration.ts': 'presence-gate',
  'run threshold pace::supabase/functions/_shared/arc-setup-prompt.ts': 'prompt-text',
  // Updates the learned threshold after a race (reads the prior to diff, writes the next).
  'run threshold pace::supabase/functions/_shared/race-feedback.ts': 'writer',
  // Remaining raw read is the SERVER PACE GATE (`:3630` `learnedPaceUsable`) — a presence test
  // mirrored by `run-pace-calibration.ts:hasPaceBenchmark` on the client. Change one, change both;
  // it asks whether ANY signal exists, not what the value is. The seed and the limiter are routed.
  'run threshold pace::supabase/functions/create-goal-and-materialize-plan/index.ts': 'presence-gate',

  // ── ftp ──────────────────────────────────────────────────────────────────
  'ftp::supabase/functions/learn-fitness-profile/index.ts': 'writer',
  'ftp::src/components/TrainingBaselines.tsx': 'receipt',
  'ftp::supabase/functions/_shared/arc-setup-prompt.ts': 'prompt-text',
  'ftp::supabase/functions/_shared/block-adaptation/index.ts': 'comparator',
  'ftp::supabase/functions/adapt-plan/index.ts': 'comparator',
  // Feeds `deriveBike` (`state-trend/baseline-derive.ts:102`) — a provisional baseline candidate
  // labelled "FTP est", the bike twin of the run's decoupling crown and the swim's hard efforts.
  // It also needs `learned_fitness.last_updated`, which the resolver does not carry.
  'ftp::supabase/functions/compute-snapshot/index.ts': 'measurement-source',
  // Remaining raw read is the TRI lane (`:3243`), deprioritised — Michael's working plans are Strong
  // Focus and the marathon. The limiter-sport inference (`:696`) is routed.
  'ftp::supabase/functions/create-goal-and-materialize-plan/index.ts': 'presence-gate',

  // ── lthr ─────────────────────────────────────────────────────────────────
  'lthr::supabase/functions/learn-fitness-profile/index.ts': 'writer',

  // ── swim css (no owner by design — tracked, not chased) ──────────────────
  'swim css::supabase/functions/learn-fitness-profile/index.ts': 'writer',
  'swim css::src/components/AthleticRecordPage.tsx': 'unreviewed',
  'swim css::src/components/CompletedTab.tsx': 'unreviewed',
  'swim css::src/hooks/useWorkoutData.ts': 'unreviewed',
  'swim css::supabase/functions/_shared/arc-setup-prompt.ts': 'prompt-text',
  'swim css::supabase/functions/_shared/planning-context.ts': 'unreviewed',
  'swim css::supabase/functions/_shared/race-projections.ts': 'unreviewed',
  'swim css::supabase/functions/workout-detail/index.ts': 'unreviewed',
};

/** Files that are the anchors' own machinery, or fixtures. Not surfaces. */
const EXEMPT = /(\.test\.|\/resolve-current-|\/resolve-strength|\/types\.ts$|anchor-resolver-lint)/;

const ROOTS = ['src', 'supabase/functions'];

/**
 * ⛔ COMMENTS OUT FIRST. See the header — prose in this repo names these columns constantly, and a
 * lint with a 30% false-positive rate teaches people to allowlist rather than fix.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

async function* walk(dir: URL): AsyncGenerator<string> {
  for await (const e of Deno.readDir(dir)) {
    const child = new URL(`${e.name}${e.isDirectory ? '/' : ''}`, dir);
    if (e.isDirectory) {
      if (e.name === 'node_modules' || e.name === 'dist') continue;
      yield* walk(child);
    } else if (/\.tsx?$/.test(e.name)) {
      yield decodeURIComponent(child.href.slice(REPO.href.length));
    }
  }
}

/** Every (fact, file) pair where the file reads the raw column outside a comment. */
async function scan(): Promise<Set<string>> {
  const found = new Set<string>();
  for (const root of ROOTS) {
    for await (const rel of walk(new URL(`${root}/`, REPO))) {
      if (EXEMPT.test(rel)) continue;
      let src: string;
      try {
        src = stripComments(await Deno.readTextFile(new URL(rel, REPO)));
      } catch {
        continue;
      }
      for (const { fact, patterns } of ANCHORS) {
        if (patterns.some((p) => p.test(src))) found.add(`${fact}::${rel}`);
      }
    }
  }
  return found;
}

// ═══════════════════════════════════════════════════════════════════════════

Deno.test('⛔ no NEW surface reads an anchor past its resolver', async () => {
  const found = await scan();
  const unlisted = [...found].filter((k) => !(k in LEDGER)).sort();
  assertEquals(
    unlisted,
    [],
    `\n\n${unlisted.length} file(s) read an anchor's raw column and are not on the ledger.\n`
      + `Route them through the resolver — or, if the file WRITES the value or renders its stored\n`
      + `receipt, add it to LEDGER with the matching reason.\n\n`
      + unlisted.map((u) => `  ${u}`).join('\n') + '\n',
  );
});

Deno.test('⛔ the ledger is a DEBT LEDGER — it may only shrink', async () => {
  const found = await scan();
  const stale = Object.keys(LEDGER).filter((k) => !found.has(k)).sort();
  assertEquals(
    stale,
    [],
    `\n\n${stale.length} ledger entr(ies) no longer read the raw column — delete them.\n`
      + `An entry that outlives its debt is how an allowlist turns into furniture.\n\n`
      + stale.map((s) => `  ${s}`).join('\n') + '\n',
  );
});

Deno.test('the ledger reports how much work is left, and it must not grow', async () => {
  // ⛔ THE RATCHET. These two counts are the honest state of the migration on the day it was frozen.
  // They may go DOWN as files are routed through their resolver; a rise means the ledger was grown to
  // make a build pass, which is the failure mode this whole file exists to prevent.
  const open = Object.values(LEDGER).filter((r) => r === 'debt' || r === 'unreviewed').length;
  const blocked = Object.values(LEDGER).filter((r) => r === 'no-owner').length;
  const resting = Object.values(LEDGER).filter((r) => r !== 'debt' && r !== 'unreviewed' && r !== 'no-owner').length;
  const total = Object.keys(LEDGER).length;

  console.log(`[anchor ledger] ${total} readers — ${resting} legitimate, ${blocked} blocked (no resolver for that sport), ${open} still to route`);

  if (open > 6) throw new Error(`anchor debt ROSE to ${open} (frozen at 36, now 6). Route it, do not list it.`);
  if (total > 32) throw new Error(`ledger GREW to ${total} (frozen at 49, now 32). A new raw reader was added.`);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MUTATIONS RUN 2026-08-19 — all killed. Baseline 3/3, ledger 49 (13 legitimate, 36 to route).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   1  a new file reads `run_threshold_pace_sec_per_km`   -> test 1 fails (unlisted reader)
 *   2  a ledger entry stops reading its column            -> test 2 fails (stale entry)
 *   3  comment-stripping removed                          -> test 1 fails (prose becomes a hit)
 *
 * ⚠️ #2 SURVIVED ITS FIRST ATTEMPT and the fault was the mutation, not the test: renaming
 * `ride_threshold_hr` to `ride_threshold_hr_X` leaves the pattern matching, because the old name is
 * still a substring. Recorded because the next person will make the same mistake.
 */

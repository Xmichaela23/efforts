/**
 * THE SWEEP — every legal hard-day shape, built and written to disk as JSON.
 *
 * ⛔ IT IS A DUMP, NOT A TEST, AND THAT DISTINCTION IS THE POINT. `recipes.test.ts` asserts the five
 * guardrails on four profiles and fails loudly; this builds the whole combination space and writes
 * it out so a human can READ a plan without tapping through a wizard to reach it. Michael:
 * *"I am tired of manually testing the UI."* The suite catches regressions; this is for looking.
 *
 * ⚠️ NOTHING HERE ASSERTS. If a combination throws, the error is written into that file rather than
 * killing the run — a sweep that stops on the first bad shape tells you about one shape.
 *
 * Run: ~/.deno/bin/deno run --no-check --allow-read --allow-write scripts/dump-plans.ts
 * ⚠️ `--no-check` is required: this now imports `materialize-plan`, whose transitive deps carry
 *    three PRE-EXISTING type errors (`state-trend/assemble.ts`, `strength-equipment-tier.ts`).
 *    The file itself is `@ts-nocheck` in production for the same reason.
 * Out: test-outputs/*.json, plus test-outputs/_index.json
 */
import { composeStrengthPrimaryPlan } from '../supabase/functions/shared/strength-system/strength-primary-plan.ts';
/**
 * ⛔ THE GATE (2026-08-20, stage 1) — THE SWEEP NOW RE-EXPANDS WHAT IT DUMPED.
 *
 * Until today this script stopped one stage short of the bug it was meant to catch. It called the
 * COMPOSER and wrote what the composer said; `materialize-plan` then recomputed every duration from
 * the expanded steps and overwrote it. Michael's Threshold Ride read `43m` in this file's output
 * and `24m` on his phone, and 61 green shapes said nothing about it.
 *
 * ⛔ SO THE ASSERTION IS AGAINST THE REAL EXPANDER, NOT A MODEL OF IT. Importing
 * `materialize-plan/index.ts` is what makes the check worth anything: a second implementation of
 * "how long does this token take" would agree with the composer and disagree with production, which
 * is the whole disease.
 *
 * ⚠️ IT BINDS A PORT. `materialize-plan` calls `Deno.serve` at module scope, so importing it starts
 * a listener this script never uses and never closes — hence the `Deno.exit(0)` at the bottom.
 * Extracting the expanders into `_shared` is the honest fix and it belongs to whichever stage is
 * already touching that deploy surface, not to this one.
 */
import { WARMUP_FLOOR_MIN } from '../supabase/functions/shared/strength-system/quality-session.ts';

/**
 * ⛔ `Deno.serve` IS STUBBED FOR THE LENGTH OF ONE IMPORT, AND THE ALTERNATIVES WERE WORSE.
 *
 * `materialize-plan/index.ts` calls `Deno.serve` at module scope, so importing it tries to bind a
 * port — a sweep script would need `--allow-net`, would leave a listener running, and would fail
 * outright the second time two of them overlapped. The stub is swapped back immediately after.
 *
 * ⚠️ THE HONEST FIX IS TO EXTRACT THE EXPANDERS INTO `_shared`, and it is deliberately NOT done
 * here: that moves a file every edge function bundles, and stage 1 does not touch the deploy
 * surface beyond adding one `export`. Whichever stage is already in `materialize-plan` should take
 * it, and this comment is the note asking for it.
 */
const realServe = Deno.serve;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = () => ({ finished: Promise.resolve(), shutdown: async () => {}, ref() {}, unref() {} });
const { expandBikeToken, expandRunToken } =
  await import('../supabase/functions/materialize-plan/index.ts');
// deno-lint-ignore no-explicit-any
(Deno as any).serve = realServe;

const OUT = 'test-outputs';
const MAXES = { bench: 155, squat: 205, deadlift: 245, overheadPress: 105 };
const BASE = {
  durationWeeks: 12,
  oneRepMaxes: MAXES,
  fiveKPaceSecPerMi: 435,
  thresholdPaceSecPerMi: 455,
  ftpWatts: 240,
  easyPaceMinPerMile: 9,
};

type Shape = { name: string; cfg: Record<string, unknown> };

/**
 * ⛔ THE AXES ARE THE ONES THAT CHANGE THE PLAN, and nothing else. Adding a fifth would square the
 * output for no new information — the block does not read the athlete's name.
 *   • hard-day COUNT and MIX      → which roles exist, and which discipline carries which
 *   • the intensity GOAL          → sprints or hills
 *   • total endurance HOURS       → the accessory tier (the >8h cliff)
 *   • the long days               → what the placer has to work around
 */
function shapes(): Shape[] {
  const out: Shape[] = [];
  const volumes = [
    { key: 'light', targetWeeklyMiles: 15, bike: { hours: 2, days: 2, longRideDay: 'saturday' } },
    { key: 'mid', targetWeeklyMiles: 25, bike: { hours: 4, days: 2, longRideDay: 'saturday' } },
    { key: 'heavy', targetWeeklyMiles: 40, bike: { hours: 5, days: 3, longRideDay: 'saturday' } },
  ];
  const hardSets: Array<{ key: string; hardDays: unknown[] }> = [
    { key: 'none', hardDays: [] },
    { key: 'run', hardDays: [{ discipline: 'run' }] },
    { key: 'run-speed', hardDays: [{ discipline: 'run', goal: 'speed' }] },
    { key: 'bike', hardDays: [{ discipline: 'bike' }] },
    { key: 'run+run', hardDays: [{ discipline: 'run' }, { discipline: 'run' }] },
    { key: 'run+bike', hardDays: [{ discipline: 'run' }, { discipline: 'bike' }] },
    { key: 'bike+run', hardDays: [{ discipline: 'bike' }, { discipline: 'run' }] },
    { key: 'club+run', hardDays: [{ discipline: 'run', day: 'thursday', ownership: 'club' }, { discipline: 'run' }] },
  ];
  for (const v of volumes) {
    for (const h of hardSets) {
      for (const longRunDay of ['saturday', 'sunday']) {
        out.push({
          name: `${v.key}__${h.key}__long-${longRunDay}`,
          cfg: {
            ...BASE,
            enduranceSport: 'run',
            enduranceFrequency: v.key === 'heavy' ? 5 : 3,
            targetWeeklyMiles: v.targetWeeklyMiles,
            bike: v.bike,
            longRunDay,
            hardDays: h.hardDays,
          },
        });
      }
    }
  }
  // ⚠️ THE BIKE-ONLY ATHLETE IS NOT A VARIATION OF THE ABOVE — no run volume, no long run, and the
  // run branch of the composer never fires. It is its own shape or it is not covered.
  for (const h of ['bike', 'bike+bike']) {
    out.push({
      name: `bike-only__${h}`,
      cfg: {
        ...BASE,
        enduranceSport: 'bike',
        enduranceFrequency: 0,
        bike: { hours: 6, days: 3, longRideDay: 'saturday' },
        hardDays: h === 'bike'
          ? [{ discipline: 'bike' }]
          : [{ discipline: 'bike' }, { discipline: 'bike' }],
      },
    });
  }
  /**
   * ⛔ MICHAEL'S OWN SWEEP MATRIX, LITERALLY (2026-08-18) — 3 profiles × {1,2} hard days × the goal,
   * so his combinations are in the output by name rather than merely covered by a superset.
   *
   * ⚠️ HIS SCRIPT WOULD NOT HAVE RUN AS WRITTEN, and the reason is worth keeping: it imports
   * `buildBlock` from `src/edge-functions/scheduler.ts`, and neither the file nor the function
   * exists in this repo. The block's entry point is `composeStrengthPrimaryPlan` in
   * `supabase/functions/shared/strength-system/`, and it takes miles and a `bike` object rather than
   * `runVolume`/`bikeVolume` scalars. Same matrix, real signature.
   *
   * ⚠️ AND HIS `goal` AXIS IS TWO AXES IN THIS ENGINE. `speed` and `vo2` are the intensity day's
   * GOAL; `threshold` is a ROLE the second hard day takes automatically. Asking for "threshold with
   * one hard day" is not a shape the engine can build — the first hard day is always the intensity
   * one — so it is expressed here as a second hard day rather than skipped in silence.
   */
  const mProfiles = [
    { name: 'hybrid-balanced', miles: 25, hours: 4 },
    { name: 'run-heavy', miles: 40, hours: 1 },
    { name: 'bike-heavy', miles: 0, hours: 8 },
  ];
  for (const pr of mProfiles) {
    for (const hard of [1, 2]) {
      for (const goal of ['speed', 'vo2', 'threshold'] as const) {
        // A zero-run profile has no run goal to express.
        if (pr.miles === 0 && goal !== 'threshold') continue;
        // Threshold is what a SECOND hard day becomes; one hard day cannot be it.
        if (goal === 'threshold' && hard === 1) continue;
        const runIsPrimary = pr.miles > 0;
        const hardDays = goal === 'threshold'
          ? [{ discipline: runIsPrimary ? 'run' : 'bike' }, { discipline: runIsPrimary ? 'bike' : 'bike' }]
          : Array.from({ length: hard }, (_, i) => (i === 0
            ? { discipline: 'run', goal }
            : { discipline: 'bike' }));
        out.push({
          name: `M__${pr.name}_${hard}hard_${goal}`,
          cfg: {
            ...BASE,
            enduranceSport: runIsPrimary ? 'run' : 'bike',
            enduranceFrequency: runIsPrimary ? (pr.miles >= 40 ? 5 : 3) : 0,
            ...(runIsPrimary ? { targetWeeklyMiles: pr.miles, longRunDay: 'sunday' } : {}),
            bike: { hours: pr.hours, days: pr.hours >= 6 ? 3 : 2, longRideDay: 'saturday' },
            hardDays,
          },
        });
      }
    }
  }
  return out;
}

/** A week as a document — the shape a human actually reads. */
function readable(plan: Record<string, unknown>): unknown {
  const ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const byWeek = (plan.sessions_by_week ?? {}) as Record<string, Array<Record<string, unknown>>>;
  const weeks: Record<string, string[]> = {};
  for (const [w, sessions] of Object.entries(byWeek)) {
    weeks[w] = ORDER.map((day) => {
      const on = sessions.filter((s) => s.day === day);
      if (!on.length) return `${day.padEnd(10)} —`;
      return `${day.padEnd(10)} ${on.map((s) => `${s.name} (${s.duration}m)`).join('  +  ')}`;
    });
  }
  return {
    name: plan.name,
    strength_days: plan.strength_days,
    volume_state: plan.volume_state,
    volume_notes: plan.volume_notes,
    compromises: plan.placement_compromises ?? [],
    weeks,
    // ⚠️ THE FULL PLAN IS KEPT UNDERNEATH. The readable half is for the eye; anything asserted later
    // has to be able to reach the real object.
    raw: plan,
  };
}


// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE BUDGET-EQUALS-BUILT AUDIT
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ FIXED BASELINES, AND THEY ARE DELIBERATELY NOT MICHAEL'S. The expander needs paces to price
 * its steps; none of the two assertions below reads a pace, so any complete set does. What they
 * must NOT be is one athlete's — a gate tuned to one export is how the last four bugs survived.
 */
const AUDIT_BASELINES: any = {
  easyPace: '9:00/mi', fiveK_pace: '7:00/mi', threshold_pace: '7:20/mi', ftp: 240,
};

type Violation = { shape: string; week: string; session: string; kind: string; detail: string };

/**
 * ⛔ TWO ASSERTIONS, AND THEY CATCH DIFFERENT THINGS.
 *
 *   LENGTH — the duration the composer states equals the minutes the tokens actually expand to.
 *            This is the 08-18 defect: budgeted 45, built 24, nothing compared them.
 *   WARM-UP — every session tagged `quality` opens with a warm-up of at least the floor.
 *            This is the safety one: six maximal sprints reached the watch from cold.
 *
 * ⚠️ AND A THIRD THING FALLS OUT FOR FREE: a token that expands to NOTHING. A typo has always been
 * silent here — `materialize-plan` logs an error nobody reads and writes a 1-minute session.
 */
function auditSessions(shape: string, plan: Record<string, unknown>): Violation[] {
  const out: Violation[] = [];
  const byWeek = (plan.sessions_by_week ?? {}) as Record<string, Array<Record<string, any>>>;
  for (const [week, sessions] of Object.entries(byWeek)) {
    for (const sn of sessions) {
      const tokens: string[] = Array.isArray(sn.steps_preset) ? sn.steps_preset : [];
      const tags: string[] = Array.isArray(sn.tags) ? sn.tags.map((t: any) => String(t)) : [];
      const isQuality = tags.includes('quality');
      const name = String(sn.name ?? '?');
      const where = { shape, week, session: `${sn.day} ${name}` };

      if (tokens.length === 0) {
        // ⚠️ NOT A VIOLATION. Bike easy rides and swims carry no tokens at all (Q-126 fences token
        // injection to the run), and a strength row's steps come from `strength_exercises`. Their
        // `duration` is never overwritten, so there are no two numbers to disagree.
        //
        // ⛔ A CLUB DAY IS THE ONE QUALITY SESSION THAT IS CORRECTLY CONTENTLESS, and it is excluded
        // on its `club` TAG rather than on its name. It is tagged `quality` because that is what it
        // COSTS the week — the lifting is placed away from it — while the app deliberately writes no
        // session into a group run it does not control (§1i). Counted and printed every run, so the
        // exclusion cannot quietly widen.
        if (isQuality && tags.includes('club')) { skippedClub++; continue; }
        // ⛔ ANY OTHER quality session with no tokens IS a violation — it reaches the watch as prose.
        if (isQuality) out.push({ ...where, kind: 'quality-without-tokens', detail: 'tagged quality and carries no steps_preset' });
        continue;
      }

      const expand = (sn.type === 'ride' || sn.type === 'bike')
        ? (t: string) => expandBikeToken(t, AUDIT_BASELINES)
        : (sn.type === 'run' ? (t: string) => expandRunToken(t, AUDIT_BASELINES) : null);
      // ⚠️ SWIM IS SKIPPED AND SAYS SO. Its expansion is inline in `expandTokensForRow` rather than
      // a callable function, so this script cannot reach it. Counted and printed, never silent.
      if (!expand) { skippedNoExpander++; continue; }

      const steps = tokens.flatMap((t) => expand(t) as any[]);
      if (steps.length === 0) {
        out.push({ ...where, kind: 'token-expands-to-nothing', detail: tokens.join(' + ') });
        continue;
      }

      // A step with a distance and no clock is priced from the athlete's pace downstream; this
      // script does not model that, so such a session is skipped rather than half-checked.
      if (steps.some((st) => !st.duration_s && st.distance_m)) { skippedDistanceBased++; continue; }

      /**
       * ⛔ THE ASSERTION IS AGAINST `materialize-plan`'s OWN EXPRESSION, NOT AN APPROXIMATION OF IT.
       * That line is `Math.round(actualTotal / 60)` over the seconds of every expanded step. If the
       * composer's stated duration is not that number, the athlete is shown one figure in the
       * wizard and a different one in the plan — which is exactly what happened, session by session,
       * with nobody comparing them.
       *
       * ⚠️ AN OPEN (LAP-BUTTON) STEP CONTRIBUTES ZERO, HERE AND IN PRODUCTION, and the composer is
       * held to the same truth: the lap-button hill states its CLOCKED length, and the minutes the
       * descents really take live in its allowance rather than on its card. That keeps this a strict
       * equality with no session exempted from it.
       */
      const clockedSec = steps.reduce((n, st) => n + (Number(st.duration_s) || 0), 0);
      const expectedMin = Math.round(clockedSec / 60);
      const stated = Number(sn.duration);
      if (stated !== expectedMin) {
        out.push({
          ...where,
          kind: 'length-mismatch',
          detail: `states ${stated}m · tokens build ${expectedMin}m · [${tokens.join(' + ')}]`,
        });
      }

      if (isQuality) {
        const first = steps[0];
        const warmSec = first && first.kind === 'warmup' ? (Number(first.duration_s) || 0) : 0;
        if (warmSec < WARMUP_FLOOR_MIN * 60) {
          out.push({
            ...where,
            kind: 'no-warmup',
            detail: `opens with ${first ? first.kind : 'nothing'}`
              + ` (${Math.round(warmSec / 60)}m, floor is ${WARMUP_FLOOR_MIN}m) · [${tokens.join(' + ')}]`,
          });
        }
      }
    }
  }
  return out;
}

let skippedClub = 0;
let skippedNoExpander = 0;
let skippedDistanceBased = 0;
const violations: Violation[] = [];

await Deno.mkdir(OUT, { recursive: true });
const index: Array<Record<string, unknown>> = [];
let ok = 0;
let failed = 0;

for (const shape of shapes()) {
  const file = `${OUT}/${shape.name}.json`;
  try {
    const plan = composeStrengthPrimaryPlan(shape.cfg as never) as unknown as Record<string, unknown>;
    const doc = readable(plan);
    await Deno.writeTextFile(file, JSON.stringify(doc, null, 2));
    violations.push(...auditSessions(shape.name, plan));
    const breaches = ((plan.placement_compromises ?? []) as Array<{ kind: string }>)
      .filter((c) => c.kind === 'breach').length;
    index.push({ shape: shape.name, built: true, breaches, file });
    ok++;
    console.log(`ok    ${shape.name}${breaches ? `   (${breaches} breach)` : ''}`);
  } catch (e) {
    // ⛔ THE ERROR IS THE OUTPUT for that shape. A sweep that stops on the first bad combination
    // tells you about one combination.
    await Deno.writeTextFile(file, JSON.stringify({ shape: shape.name, error: String(e) }, null, 2));
    index.push({ shape: shape.name, built: false, error: String(e), file });
    failed++;
    console.log(`FAIL  ${shape.name}   ${e}`);
  }
}

await Deno.writeTextFile(`${OUT}/_index.json`, JSON.stringify({ total: ok + failed, ok, failed, index }, null, 2));
console.log(`\n${ok + failed} shapes · ${ok} built · ${failed} failed → ${OUT}/`);

// ── THE GATE'S VERDICT ────────────────────────────────────────────────────────────────────────
/**
 * ⛔ IT PRINTS WHAT IT COULD NOT CHECK, EVERY RUN. A gate that quietly skips is worse than no gate:
 * "0 violations" over a set that silently excluded the interesting sessions is exactly the false
 * green this stage exists to end.
 */
console.log(
  `\nbudget-equals-built: ${violations.length} violation(s)`
  + `  ·  skipped ${skippedClub} club (contentless by design), `
  + `${skippedNoExpander} swim (no callable expander), `
  + `${skippedDistanceBased} distance-based (needs athlete paces)`,
);
const byKind = new Map<string, Violation[]>();
for (const v of violations) byKind.set(v.kind, [...(byKind.get(v.kind) ?? []), v]);
for (const [kind, vs] of byKind) {
  console.log(`\n  ${kind} — ${vs.length}`);
  // ⚠️ DISTINCT SESSIONS, NOT DISTINCT SHAPES. One broken session appears in dozens of shapes and
  // twelve weeks of each; printing every instance buries the four real findings under a thousand
  // lines, which is its own way of hiding.
  const seen = new Set<string>();
  for (const v of vs) {
    const key = `${v.session}|${v.detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`    ${v.session.padEnd(34)} ${v.detail}`);
  }
  if (seen.size < vs.length) console.log(`    (${vs.length - seen.size} further instances of the above)`);
}
await Deno.writeTextFile(`${OUT}/_audit.json`, JSON.stringify({
  violations: violations.length, skippedNoExpander, skippedDistanceBased, detail: violations,
}, null, 2));

// ⛔ EXIT NON-ZERO ON A VIOLATION so this is a GATE and not a report. A sweep whose failures do not
// fail is a sweep somebody stops reading.
// ⚠️ AND THE EXPLICIT EXIT IS REQUIRED EITHER WAY — importing `materialize-plan` starts a
// `Deno.serve` listener that keeps the process alive forever. See the import note at the top.
Deno.exit(violations.length > 0 ? 1 : 0);

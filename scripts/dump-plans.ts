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
 * Run: ~/.deno/bin/deno run --allow-read --allow-write scripts/dump-plans.ts
 * Out: test-outputs/*.json, plus test-outputs/_index.json
 */
import { composeStrengthPrimaryPlan } from '../supabase/functions/shared/strength-system/strength-primary-plan.ts';

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

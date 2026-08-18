// ============================================================================
// THE RECIPE SUITE — athlete profiles in, twelve built weeks out, clinical guardrails asserted.
//
// ⛔ WHY IT EXISTS. Michael, 2026-08-18: *"I am tired of manually testing the UI to verify the
// 12-week hybrid scheduling engine."* Every rule this block runs on — the deload, the taper, the
// 36-hour clearance, the terrain menus — was verifiable only by a human tapping through a wizard and
// reading a plan. This feeds recipes straight into the composer and asserts the guardrails.
//
// ⚠️ DENO, NOT JEST OR VITEST, AND THAT IS NOT A PREFERENCE. The composer is an edge-function module:
// it imports with `.ts` extensions and every one of the 3,000 existing engine tests runs under
// `deno test`. There is no vitest script in `package.json`. Running this under a second framework
// would mean a second module resolver for one file.
//
// Run: ~/.deno/bin/deno test --allow-all --no-check supabase/functions/shared/strength-system/recipes.test.ts
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeStrengthPrimaryPlan } from './strength-primary-plan.ts';
import { HARD_RIDE_MENUS, HARD_RUN_MENUS } from '../../../../src/lib/hard-day-menus.ts';

const MAXES = { bench: 155, squat: 205, deadlift: 245, overheadPress: 105 };
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

type Recipe = {
  name: string;
  cfg: Record<string, unknown>;
  /** Which menu each hard slot must be offered, in order. */
  menus: Array<'speed' | 'vo2' | 'threshold' | 'ride_vo2' | 'ride_threshold'>;
  /** The accessory rep total every slot must carry on a working week. */
  accessory: number;
};

const RECIPES: Recipe[] = [
  {
    name: 'A — the speed baseline',
    cfg: {
      enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 18, easyPaceMinPerMile: 9,
      longRunDay: 'sunday', bike: { hours: 3, days: 2, longRideDay: 'saturday' },
      hardDays: [
        { discipline: 'run', day: 'tuesday', goal: 'speed', terrain: 'track' },
        { discipline: 'bike', day: 'thursday', environment: 'smart_trainer' },
      ],
    },
    menus: ['speed', 'ride_threshold'],
    // 2 hard days → survival. ⚠️ ALSO > 8 h (18 × 9 = 2.7 h run + 3 h ride is 5.7 — under 8), so the
    // hard-day count is what puts this recipe in the floor band, which is the axis it is testing.
    accessory: 25,
  },
  {
    name: 'B — the 8-hour cliff',
    cfg: {
      enduranceSport: 'run', enduranceFrequency: 5, targetWeeklyMiles: 40, easyPaceMinPerMile: 9,
      longRunDay: 'sunday', bike: { hours: 5, days: 2, longRideDay: 'saturday' },
      hardDays: [{ discipline: 'run', day: 'tuesday' }],
    },
    menus: ['vo2'],
    // ⛔ THE POINT OF THE RECIPE: 40 mi at 9 min/mi is 6 h, plus 5 h riding is ELEVEN. One hard day
    // would otherwise buy the 30-40 band; the hours alone drop it to the floor.
    accessory: 25,
  },
  {
    name: 'C — the VO2 climber',
    cfg: {
      enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 20, easyPaceMinPerMile: 9,
      longRunDay: 'sunday',
      hardDays: [{ discipline: 'run', day: 'tuesday', goal: 'vo2', terrain: 'hill_3min' }],
    },
    menus: ['vo2'],
    // ⚠️ 25, NOT 30, AND THE TEST WAS WRONG BEFORE THE ENGINE WAS. 20 mi at 9 min/mi is THREE hours,
    // and the `base` tier needs one hard day AND 4-8 hours. Three fails the AND-gate, so this
    // athlete falls through to `survival` — which is the asymmetry the spec asks for on purpose:
    // anything that satisfies neither AND-gate lands in the floor band, the safe direction.
    accessory: 25,
  },
  {
    name: 'D — the cyclist',
    cfg: {
      enduranceSport: 'bike', enduranceFrequency: 0,
      bike: { hours: 6, days: 3, longRideDay: 'saturday' },
      hardDays: [
        { discipline: 'bike', day: 'tuesday', environment: 'smart_trainer' },
        { discipline: 'bike', day: 'friday', environment: 'flat_road' },
      ],
    },
    menus: ['ride_vo2', 'ride_threshold'],
    accessory: 25,
  },
];

const build = (cfg: Record<string, unknown>): any => composeStrengthPrimaryPlan({
  durationWeeks: 12, oneRepMaxes: MAXES,
  fiveKPaceSecPerMi: 435, thresholdPaceSecPerMi: 455, ftpWatts: 240,
  ...cfg,
} as never);

const weekOf = (p: any, w: number): any[] => (p.sessions_by_week[String(w)] ?? []) as any[];
const isHard = (s: any) => /Flat Sprints|Hill Repeats|Short Hill|Treadmill Intervals|Flat Intervals|Bike Intervals|Threshold Run|Threshold Ride/.test(String(s.name));
const isHeavyLower = (s: any) => s.type === 'strength' && /Back Squat|Deadlift/.test(String(s.name));
const dayIdx = (d: string) => DAYS.indexOf(String(d));

/** Working minutes of a hard session, read off its own token so the test cannot drift from the plan. */
function workMinutes(s: any): number {
  const t = String(s.steps_preset?.[0] ?? '');
  let m = t.match(/_(\d+)x(\d+)min/);
  if (m) return Number(m[1]) * Number(m[2]);
  m = t.match(/_(\d+)x(\d+)s_/);
  if (m) return (Number(m[1]) * Number(m[2])) / 60;
  return 0;
}

for (const r of RECIPES) {
  const PLAN = build(r.cfg);

  // ── THE DELOAD RULE ────────────────────────────────────────────────────────────────────────────
  Deno.test(`${r.name} · ⛔ DELOAD — weeks 4 and 8 carry no interval work at all`, () => {
    // ⚠️ THE SPEC SAID "HALVED (or deleted if sprints)" AND THE ENGINE DELETES ALL OF THEM. That is
    // Michael's own 2026-08-17 ruling in the threshold doctrine — "weeks 4, 8 and 12 remain strictly
    // no intervals" — re-affirmed for sprints on 2026-08-18: halving a maximal session "leaves the
    // nervous system simmering". Asserting the shipped rule, not the spec's older half of it.
    for (const w of [4, 8, 12]) {
      const hard = weekOf(PLAN, w).filter(isHard);
      assertEquals(hard.length, 0, `week ${w} kept ${hard.map((s) => s.name).join(', ')}`);
    }
  });

  // ── THE TAPER RULE ─────────────────────────────────────────────────────────────────────────────
  Deno.test(`${r.name} · ⛔ TAPER — the block never carries MORE interval work at the end`, () => {
    /**
     * ⚠️ "STRICTLY LESS" IS TRUE OF THE SPRINT AND THRESHOLD SESSIONS AND NOT OF THE HILL ONE, and
     * that is a real gap rather than a test detail — see the standalone test at the bottom of this
     * file. Sprints cut 6 → 4 and threshold cuts 20 → 14 min in the anchor; the hill session's
     * token is deliberately IDENTICAL every week because it progresses by EFFORT, not volume.
     *
     * ⛔ SO THE UNIVERSAL GUARANTEE IS "never MORE", and the strict cut is asserted per-session where
     * a taper exists. Asserting strictness here would make this suite permanently red on the most
     * common recipe there is, which teaches everyone to ignore it.
     */
    const base = weekOf(PLAN, 1).filter(isHard).reduce((n, s) => n + workMinutes(s), 0);
    assert(base > 0, 'week 1 built no hard session — the recipe tests nothing');
    for (const w of [10, 11, 12]) {
      const later = weekOf(PLAN, w).filter(isHard).reduce((n, s) => n + workMinutes(s), 0);
      assert(later <= base, `week ${w} carries MORE (${later} min) than week 1's ${base}`);
    }
    assertEquals(weekOf(PLAN, 12).filter(isHard).length, 0, 'week 12 kept interval work');
  });

  // ── THE CLEARANCE RULE ─────────────────────────────────────────────────────────────────────────
  Deno.test(`${r.name} · ⛔ CLEARANCE — 36h from any hard session to the NEXT heavy lower day`, () => {
    // ⚠️ FORWARD AND CIRCULAR. The week repeats, so Sunday → Tuesday is 48h and not −120. And a hard
    // session that SHARES a day with its paired lift is 6h AFTER it by design (barbell first) — the
    // rule is about the NEXT heavy day, which is why same-day pairs are skipped rather than failed.
    for (const w of [1, 2, 5, 9, 11]) {
      const week = weekOf(PLAN, w);
      for (const h of week.filter(isHard)) {
        for (const lift of week.filter(isHeavyLower)) {
          const gapDays = (dayIdx(lift.day) - dayIdx(h.day) + 7) % 7;
          if (gapDays === 0) continue;   // the coupled pair — the lift came first, 6h earlier
          const gapHours = gapDays * 24;
          assert(gapHours >= 36,
            `week ${w}: ${h.name} (${h.day}) is ${gapHours}h before ${lift.name} (${lift.day})`);
        }
      }
    }
  });

  // ── THE MENU RULE ──────────────────────────────────────────────────────────────────────────────
  Deno.test(`${r.name} · ⛔ MENU — each hard slot is offered exactly the doctrine's ground`, () => {
    const EXPECTED: Record<string, string[]> = {
      speed: ['track', 'flat_road', 'turf'],
      vo2: ['hill_3min', 'hill_short', 'treadmill'],
      threshold: ['track', 'flat_road', 'treadmill_1pct'],
      ride_vo2: ['smart_trainer', 'stationary', 'flat_road', 'hill_climb'],
      ride_threshold: ['smart_trainer', 'flat_road', 'long_climb'],
    };
    for (const key of r.menus) {
      const menu = key.startsWith('ride_')
        ? HARD_RIDE_MENUS[key === 'ride_vo2' ? 'vo2' : 'threshold']
        : HARD_RUN_MENUS[key as 'speed' | 'vo2' | 'threshold'];
      assertEquals(menu.options.map((o) => o.id), EXPECTED[key], `${key} menu drifted`);
      assert(menu.note.length > 0, `${key} menu has no rule above it`);
    }
    // ⛔ AND THE ONE ABSENCE THE DOCTRINE TURNS ON: no flat VO2 option, ever.
    assertEquals(HARD_RUN_MENUS.vo2.options.some((o) => o.id === 'flat'), false,
      'the flat option is back on the VO2 menu');
  });

  // ── THE ACCESSORY TIER ─────────────────────────────────────────────────────────────────────────
  Deno.test(`${r.name} · ⛔ ACCESSORY — the tier the endurance load actually bought`, () => {
    const rows = weekOf(PLAN, 2)
      .filter((s: any) => s.type === 'strength' && !/Deadlift \+ /.test(String(s.name)))
      .flatMap((s: any) => (s.strength_exercises ?? []) as any[])
      .filter((e) => typeof e.reps === 'string' && String(e.reps).endsWith('total'));
    assert(rows.length > 0, 'no accessory rows to check');
    for (const row of rows) {
      // ⚠️ THE PULL SLOT IS EXEMPT when the pull-up programme owns it; no recipe opts in, so every
      // row here should sit at the band the tier bought.
      assertEquals(String(row.reps), `${r.accessory} total`, `${row.name} is not the tier's number`);
    }
  });
}

// ── THE RECIPES' OWN CLAIMS ──────────────────────────────────────────────────────────────────────

Deno.test('⛔ RECIPE A — sprints on the intensity slot, threshold on the ride', () => {
  const p = build(RECIPES[0].cfg);
  const w2 = weekOf(p, 2);
  assertEquals(w2.find((s) => s.name === 'Flat Sprints')?.steps_preset?.[0], 'run_sprint_6x12s_r150s');
  assert(w2.some((s) => s.name === 'Threshold Ride'), 'the second hard day is not the ride threshold');
});

Deno.test('⛔ RECIPE B — ELEVEN HOURS ALONE DROPS THE BAND, on one hard day', () => {
  // The axis the whole Viada spec turns on: without the hours, one hard day buys 30-40.
  const eleven = build(RECIPES[1].cfg);
  // ⚠️ 30 mi (4.5 h) + 1 h riding = 5.5 h — inside the base tier's 4-8 window, which is what makes
  // this a CONTROL. A lighter week would fall through the AND-gate to `survival` and prove nothing.
  const light = build({ ...RECIPES[1].cfg, targetWeeklyMiles: 30, bike: { hours: 1, days: 1, longRideDay: 'saturday' } });
  const repsOf = (p: any) => String((weekOf(p, 2)
    .find((s: any) => s.name === 'Strength — Bench Press')?.strength_exercises ?? [])
    .find((e: any) => typeof e.reps === 'string')?.reps ?? '');
  assertEquals(repsOf(eleven), '25 total', 'eleven hours did not reach the floor band');
  assertEquals(repsOf(light), '30 total', 'the light week did not keep the middle band');
});

Deno.test('⛔ RECIPE C — the 4 × 3 min hill layout, and no flat anywhere near it', () => {
  const p = build(RECIPES[2].cfg);
  const hill = weekOf(p, 2).find((s) => s.name === 'Hill Repeats');
  assert(hill, 'no hill session');
  assert(/4 × 3 min/.test(String(hill.description)), `not the 4 × 3 layout: ${hill.description}`);
});

Deno.test('⛔ RECIPE D — intervals on slot 1, threshold on slot 2, both rides', () => {
  const p = build(RECIPES[3].cfg);
  const w2 = weekOf(p, 2);
  assert(w2.some((s) => s.name === 'Bike Intervals'), 'no interval ride');
  assert(w2.some((s) => s.name === 'Threshold Ride'), 'no threshold ride');
  assertEquals(w2.filter((s) => s.type === 'run').length, 0, 'a bike-only athlete was given a run');
});

// ── THE ONE SESSION WITH NO TAPER ────────────────────────────────────────────────────────────────

Deno.test('⚠️ THE HILL SESSION DOES NOT TAPER, AND IT IS NOW THE DEFAULT HARD DAY', () => {
  // ⛔ A FINDING, PINNED SO IT IS NOT DISCOVERED IN A PLAN. The other two hard sessions cut their
  // volume in the anchor so the legs arrive fresh at the heavy tests:
  //     sprints    6 × 12 s  →  4 × 12 s
  //     threshold  4 × 5 min →  1 × 10 min   (20 min of work → 10)
  // The hill session does neither. Its token is byte-identical every week by design — it progresses
  // by EFFORT ("go a little faster than last week"), and its anchor copy says "hold the top of the
  // range", which is the opposite of a taper.
  //
  // ⚠️ THAT WAS DEFENSIBLE WHILE HILLS WERE THE SESSION A SECOND HARD DAY UNLOCKED. As of
  // 2026-08-18 they are the DEFAULT first hard day, so the common athlete now runs the block's only
  // untapered quality session straight into the weeks the barbell peaks in.
  // ⛔ MICHAEL'S CALL, NOT MINE. If the hill session should yield in the anchor the way the threshold
  // one does, this test inverts and `hillSession` gains a rep table.
  const p = build({
    enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 20, easyPaceMinPerMile: 9,
    longRunDay: 'sunday', hardDays: [{ discipline: 'run', day: 'tuesday', goal: 'vo2' }],
  });
  const tokenIn = (w: number) => String(weekOf(p, w).find((s) => /Hill Repeats/.test(s.name))?.steps_preset?.[0] ?? '');
  assertEquals(tokenIn(1), tokenIn(11), 'the hill token moved — a taper may have been added');
  // ⚠️ AND THE COPY SAYS SO OUT LOUD, which is what makes this a decision rather than an oversight:
  // "this is the FASTEST this session gets in the block — hold the top of what you can repeat."
  // The block's other two hard sessions say the opposite in the same week.
  assert(/fastest this session gets in the block/i.test(
    String(weekOf(p, 11).find((s) => /Hill Repeats/.test(s.name))?.description ?? '')),
    'the anchor copy changed without the token');
});

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
import {
  HARD_DAY_INTENT, RUN_GROUND_OPTIONS, SESSION_STATEMENTS,
} from '../../../../src/lib/hard-day-menus.ts';

const MAXES = { bench: 155, squat: 205, deadlift: 245, overheadPress: 105 };
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

type Recipe = {
  name: string;
  cfg: Record<string, unknown>;
  /** Which menu each hard slot must be offered, in order. */
  /**
   * ⛔ THE FIVE GROUND MENUS ARE GONE (2026-08-18) — see `hard-day-menus.ts`' header. The field is
   * kept because each recipe still declares which SESSIONS it should produce, and the card test
   * below reads it to check the copy that names them. What it no longer implies is a menu.
   */
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
  Deno.test(`${r.name} · ⛔ TAPER — weeks 10-12 carry STRICTLY less interval work than week 1`, () => {
    /**
     * ⛔ STRICT AGAIN, AND THIS ASSERTION IS WHY THE SUITE PAID FOR ITSELF. It shipped as "never
     * MORE" because the hill session was the one hard session in the block with no taper — its
     * token was byte-identical every week. Michael ruled on 2026-08-18 that it must yield: uphill
     * running removes the ECCENTRIC impact, but four three-minute efforts at maximum heart rate
     * still cost concentric fatigue, local glycogen and CNS stress, and *"you cannot express a 1RM
     * on the squat rack if you spent 12 minutes at maximum heart rate two days prior."*
     *
     * ⚠️ SO EVERY HARD SESSION IN THE BLOCK NOW TAPERS, and the guarantee can be the strong one.
     * If this ever has to be weakened back to `<=`, a session has stopped yielding to the barbell.
     */
    const base = weekOf(PLAN, 1).filter(isHard).reduce((n, s) => n + workMinutes(s), 0);
    assert(base > 0, 'week 1 built no hard session — the recipe tests nothing');
    for (const w of [10, 11, 12]) {
      const later = weekOf(PLAN, w).filter(isHard).reduce((n, s) => n + workMinutes(s), 0);
      assert(later < base, `week ${w} carries ${later} min against week 1's ${base}`);
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

  // ── THE CARD RULE ──────────────────────────────────────────────────────────────────────────────
  Deno.test(`${r.name} · ⛔ CARD — one question per state, and the ground question stays a GOAL`, () => {
    /**
     * ⛔⛔ WHAT THIS TEST USED TO BE, AND WHY IT IS NOT THAT (2026-08-18). It pinned five ground
     * menus — three run surfaces sets and two ride ones, 17 options between them. Michael, on the
     * live screen: *"this is all a bit of a mess and consuing… too many options."* Every one of
     * those options changed a SENTENCE and nothing else, so they moved into the session
     * descriptions where the athlete reads them on the day. The one that changed the WEEK stayed.
     *
     * ⛔ THE INVARIANT THAT REPLACES THEM: the surviving ground question is asked as a GOAL, not a
     * terrain. `RUN_GROUND_OPTIONS` writes `hard_days[].goal`, and `speed` there means the SPRINT
     * session. Writing it to `terrain` would collide with `HardRunTerrain`'s own `'flat'`, which is
     * §2.0's last-resort VO2 intervals on the level — a completely different session. If a future
     * session "tidies" these ids back into terrain values, this is the test that catches it.
     */
    assertEquals(RUN_GROUND_OPTIONS.map((o) => o.id), ['speed', 'vo2'], 'the ground question drifted');
    assertEquals(HARD_DAY_INTENT.map((o) => o.id), ['intensity', 'threshold'], 'the intent question drifted');
    // ⚠️ The recommendation is stated on the intensity option and nowhere else — it is the default
    // because it preserves the barbell, and the athlete is told so rather than steered silently.
    assert(HARD_DAY_INTENT[0].body.includes('recommend'), 'the intensity option stopped stating the recommendation');
    /**
     * ⛔ EVERY ASK-NOTHING STATE NAMES WHERE THE REST GETS DECIDED. *"You will choose your setup on
     * the day"* is a CONTRACT with the session description — the materializer now lists the setups,
     * and if it ever stops, these lines are promising something the app does not deliver.
     */
    for (const [key, line] of Object.entries(SESSION_STATEMENTS)) {
      assert(line.includes('on the day'), `${key} stopped naming where the setup is chosen`);
    }
    // ⚠️ AND THE TWO-SLOT LINES POINT AT THE OTHER SPORT — that pointing IS the interlock being
    // visible, which is the whole reason this card was rebuilt.
    assert(SESSION_STATEMENTS.ride_threshold.includes('run'), 'the ride threshold line stopped naming the run');
    assert(SESSION_STATEMENTS.run_threshold.includes('ride'), 'the run threshold line stopped naming the ride');
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

Deno.test('⛔ THE HILL SESSION TAPERS — the gap this suite found on day one', () => {
  // It shipped untapered: the token was byte-identical every week and the anchor copy said "this is
  // the FASTEST this session gets in the block". Defensible while hills were what a SECOND hard day
  // unlocked; not once they became the default and the common athlete ran the block's only
  // untapered quality session into the weeks the barbell peaks in.
  //
  // ⚠️ ALL FOUR GROUNDS, NOT ONLY THE HILL. Michael named the hill session; the argument is about
  // VO2 VOLUME rather than the surface, so a treadmill athlete left untapered would be the same gap
  // wearing a different terrain. Short hills halve ten reps to five on the same rule.
  // ⛔ THE BIKE'S 4 × 4 IS STILL UNTAPERED, deliberately: it is Helgerud's published protocol and he
  // named a RUN table. Flagged, not silently extended.
  const mk = (terrain: string) => build({
    enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 20, easyPaceMinPerMile: 9,
    longRunDay: 'sunday', hardDays: [{ discipline: 'run', day: 'tuesday', goal: 'vo2', terrain }],
  });
  for (const [terrain, full, cut] of [['hill_3min', 4, 2], ['treadmill', 4, 2], ['hill_short', 10, 5]] as const) {
    const p = mk(terrain);
    const repsIn = (w: number) => {
      const t = String(weekOf(p, w).find(isHard)?.steps_preset?.find((x: string) => /run_hills_/.test(x)) ?? '');
      const m = t.match(/run_hills_(\d+)x/);
      return m ? Number(m[1]) : null;
    };
    assertEquals(repsIn(1), full, `${terrain}: week 1 is not the baseline`);
    assertEquals(repsIn(11), cut, `${terrain}: the anchor did not halve`);
  }
});

Deno.test('⛔ AND THE ANCHOR COPY NO LONGER TELLS THEM TO PUSH HARDER', () => {
  // It read "this is the FASTEST this session gets in the block — hold the top of what you can
  // repeat", in the very week the reps are halved. That line would have the athlete add back exactly
  // what the cut removed.
  const p = build({
    enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 20, easyPaceMinPerMile: 9,
    longRunDay: 'sunday', hardDays: [{ discipline: 'run', day: 'tuesday', goal: 'vo2' }],
  });
  const anchor = String(weekOf(p, 11).find(isHard)?.description ?? '');
  assertEquals(/fastest this session gets/i.test(anchor), false, 'the push-harder cue is back');
  assert(/getting out of its way|fewer reps/i.test(anchor), `the anchor does not explain the cut: ${anchor}`);
});

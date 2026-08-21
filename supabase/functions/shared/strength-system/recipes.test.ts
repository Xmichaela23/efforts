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
  accessoryCostLine, RUN_GROUND_OPTIONS, SESSION_PRESCRIPTION, singleSlotOptions,
} from '../../../../src/lib/hard-day-menus.ts';
import { HARD_DAY_WHY } from '../../../../src/lib/strength-focus-copy.ts';
import { voiceViolation } from '../../_shared/state-trend/week-accent.ts';

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
    /**
     * ⛔⛔ 30 AGAIN AS OF 2026-08-18, AND THIS RECIPE IS THE BUG CASE ITSELF. Read the history — the
     * number has now moved twice and the reasons are opposite.
     *
     * 20 mi at 9 min/mi is THREE hours with one hard day. It read 30 originally; it was changed to
     * 25 on 2026-08-17 with the note *"the test was wrong before the engine was"*, because `base`
     * required `1 hard day AND 4-8 hours` and three hours failed the AND-gate, dropping through to
     * `survival`. That was described as "the safe direction".
     *
     * ⛔ IT WAS NOT SAFE, IT WAS BACKWARDS, and this recipe is where you can see it: the SAME athlete
     * riding two hours more — five hours, one hard day — got 30. More endurance bought more
     * assistance. `base` is the fall-through now and `survival` is only ever assigned by its own
     * explicit trigger, so a light week with one hard session sits in the middle band where it
     * always belonged. Nothing about this athlete changed; the model stopped inverting.
     */
    accessory: 30,
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
  // ⛔ THE WORK TOKEN, NOT INDEX 0 — quality sessions open with a warm-up preset since 2026-08-20.
  const t = String((Array.isArray(s.steps_preset) ? s.steps_preset : [])
    .filter((x: string) => !/^(warmup|cooldown)_/.test(String(x)))[0] ?? '');
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
    /**
     * ⛔ THE ORDER IS PART OF THE ASSERTION — CHEAPEST ON THE LEGS FIRST (Michael, 2026-08-18).
     * Uphill removes the impact transient, so the VO2 session buys a hard aerobic stimulus the
     * barbell does not pay for; flat sprints are the only option charging a mechanical cost, which
     * is why they are the only one with a clearance window. Recommended-first and cheapest-first are
     * the same order, which is the argument, not a coincidence. ⛔ A new option goes in BY LEG COST,
     * not appended.
     */
    assertEquals(RUN_GROUND_OPTIONS.map((o) => o.id), ['vo2', 'speed'], 'the ground question drifted');
    /**
     * ⛔ ONE SLOT IS ONE QUESTION, AND THE COUNT IS THE ASSERTION. A single hard run has exactly
     * three possible sessions and a single hard ride exactly two. When these were two separate
     * lists the card showed FOUR cards for one decision (*"4 options? confusing?"*), so the number
     * itself is what regressed and the number is what this pins.
     */
    assertEquals(singleSlotOptions('run').map((o) => o.id), ['vo2', 'threshold', 'speed'],
      'the single hard run question drifted');
    assertEquals(singleSlotOptions('bike').map((o) => o.id), ['intensity', 'threshold'],
      'the single hard ride question drifted');
    // ⚠️ ONE TAP MUST WRITE BOTH FIELDS — that is the whole point of merging the two lists. A run
    // option that sets `role` and forgets `goal` hands the engine half an answer.
    for (const o of singleSlotOptions('run')) {
      assertEquals(o.role === 'intensity', o.goal !== undefined,
        `${o.id}: role and goal disagree about whether this is an intensity session`);
    }
    // ⚠️ The recommendation is stated on a recommended option and nowhere else — the athlete is
    // told which one the engine prefers rather than being steered silently.
    /**
     * ⛔ ONE OPERATIONAL LINE PER OPTION — the rule `CopyOption` states, enforced (2026-08-18).
     * Michael: *"three lines of dense physiological explanation inside a radio button is terrible
     * for mobile scannability."* The bodies said what the session is AND why it costs what it costs;
     * the why moved into `HARD_DAY_WHY` behind the (i).
     *
     * ⚠️ THE LENGTH CAP IS A PROXY AND THE BANNED CLAUSES ARE THE REAL RULE. A body may name the
     * movement, the ground and the reps. It may not carry a mechanism — that is what the tooltip is
     * for, and a mechanism clause is how three lines grew back last time.
     */
    const MECHANISM = /\bbecause\b|\bso (that|your)\b|eccentric|neural|fast-twitch|hypertroph|metabolic|interferen/i;
    for (const d of ['run', 'bike'] as const) {
      for (const o of singleSlotOptions(d)) {
        assert(o.body.length <= 96, `${d}/${o.id} body is ${o.body.length} chars: ${o.body}`);
        assertEquals(MECHANISM.test(o.body), false, `${d}/${o.id} carries a mechanism clause: ${o.body}`);
      }
    }
    for (const o of RUN_GROUND_OPTIONS) {
      assert(o.body.length <= 96, `${o.id} body is ${o.body.length} chars: ${o.body}`);
      assertEquals(MECHANISM.test(o.body), false, `${o.id} carries a mechanism clause: ${o.body}`);
    }
    // ⛔ AND THE ARGUMENT IS NOT LOST — it has to be findable one tap away, or cutting it was just
    // deleting it. The (i) sections are asserted for the two claims that moved out of the options.
    const why = HARD_DAY_WHY.map((x) => `${x.heading} ${x.body}`).join(' ');
    assert(/eccentric|impact transient/i.test(why), 'the eccentric argument left the options and never arrived');
    // ⚠️ ABBREVIATION-AGNOSTIC. The 2026-08-19 bullet rewrite shortened "48 hours" to "48 hrs" and a
    // literal match read that as the clearance having been DELETED from the disclosure. What is
    // asserted is that the claim SURVIVED the move out of the option bodies, not how it is spelled.
    assert(/48\s*(hours|hrs|h)\b/i.test(why),
      'the 48-hour clearance left the options and never arrived');

    /**
     * ⛔ THE COST LINE SPEAKS ONLY WHEN THE MATH MOVED (Michael, 2026-08-18: *"if the math doesn't
     * change, don't lecture them"*). Silence is the assertion that matters — a line that always
     * shows is a banner, and a banner about a cost that was not incurred is a false claim.
     */
    assertEquals(accessoryCostLine([30, 40], [30, 40]), null, 'it lectured with nothing to report');
    assertEquals(accessoryCostLine([25, 30], [25, 30]), null,
      'a high-volume athlete already in survival was told their hard day cost them a band');
    const moved = accessoryCostLine([25, 30], [40, 50]);
    // ⚠️ DASH-AGNOSTIC. The line uses EN dashes in prose while the constants use hyphens, and a
    // literal `/25-30/` read the 2026-08-18 copy rewrite as the from-number having been DELETED.
    // What this asserts is that both bands are stated — "reduced" without a from-number is not a
    // price — not which dash character sits between them.
    const bands = (t: string) => (t.match(/\d+\s*[-\u2013]\s*\d+/g) ?? []);
    assert(moved != null, 'the line went silent on a real change');
    assertEquals(bands(moved!).length, 2, `the line must state BOTH bands: ${moved}`);
    assert(/25/.test(moved!) && /30/.test(moved!) && /40/.test(moved!) && /50/.test(moved!),
      `the line lost one of its numbers: ${moved}`);
    // ⛔ NO IMPERATIVE. It describes a checkbook being balanced, never an instruction — and this is
    // exactly the sentence that would attract one.
    assertEquals(voiceViolation(moved!), null, `the cost line broke voice: ${moved}`);

    // ⚠️ CASE-INSENSITIVE. The 2026-08-18 copy pass cut *"which is why we recommend it"* down to a
    // one-word *"Recommended."*, and a literal lowercase `includes` read that as the recommendation
    // having been DELETED. The assertion is about the recommendation existing, not its grammar.
    for (const d of ['run', 'bike'] as const) {
      assert(singleSlotOptions(d).some((o) => /recommend/i.test(o.body)),
        `the ${d} list stopped stating a recommendation`);
    }
    /**
     * ⛔ EVERY ASK-NOTHING STATE NAMES WHERE THE REST GETS DECIDED. *"You will choose your setup on
     * the day"* is a CONTRACT with the session description — the materializer now lists the setups,
     * and if it ever stops, these lines are promising something the app does not deliver.
     */
    for (const [key, line] of Object.entries(SESSION_PRESCRIPTION)) {
      assert(line.includes('on the day'), `${key} stopped naming where the setup is chosen`);
    }
    /**
     * ⛔ AND EACH ONE STATES THE ACTUAL SESSION, NOT A CHARACTER SKETCH (Michael, 2026-08-18:
     * *"actual ride prescription"*). The ride's lines said things like "short, explosive pushes to
     * raise your maximum wattage" — true, and unplannable. ⚠️ These numbers must track the composer:
     * `4 × 5 → 2 × 10` is the threshold wave, `4 × 4` halving to `2 × 4` is the Helgerud anchor. If
     * those tables move and these do not, the card lies about the block it just sold.
     */
    assert(/4 × 4/.test(SESSION_PRESCRIPTION.ride_intensity), 'the hard ride stopped stating its reps');
    assert(/2 × 4/.test(SESSION_PRESCRIPTION.ride_intensity), 'the hard ride stopped stating the anchor cut');
    for (const k of ['ride_threshold', 'run_threshold'] as const) {
      assert(/4 × 5/.test(SESSION_PRESCRIPTION[k]) && /2 × 10/.test(SESSION_PRESCRIPTION[k]),
        `${k} stopped stating the threshold wave`);
    }
    // ⚠️ AND EACH NAMES ITS OWN UNIT — the ride is priced in FTP, the run in pace off the 5K.
    assert(/FTP/.test(SESSION_PRESCRIPTION.ride_threshold), 'the threshold ride stopped naming FTP');
    assert(/5K/.test(SESSION_PRESCRIPTION.run_threshold), 'the threshold run stopped naming its pace basis');
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
  assertEquals(
    (w2.find((s) => s.name === 'Flat Sprints')?.steps_preset ?? [])
      .filter((x: string) => !/^(warmup|cooldown)_/.test(String(x)))[0],
    'run_sprint_6x12s_r150s',
  );
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

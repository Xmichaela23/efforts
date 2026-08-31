// ============================================================================
// THE GATE — stage 1 of the Standing Plan work order.
//
// *"For every family x level, assert duration, work-to-rest structure, and the floors and caps. Then
// generate across a wide range of athlete thresholds and assert nothing degenerates."*
//
// ⛔ THE 61-SHAPE SWEEP CANNOT SEE ANY OF THIS. It is a regression net over an existing plan type,
// and this is a plan type that does not exist yet. The wide space below is the evidence.
//
// ⚠️ EVERY ASSERTION HERE WAS MUTATION-TESTED — the code it covers was broken and the test was
// confirmed to fail. The mutations and their results are listed in
// `docs/NOTES-stage1-endurance-session-library-2026-08-22.md`. Three test files written on
// 2026-08-19 passed with the code they covered deleted; that is what this paragraph exists to stop.
//
// Run: deno test --no-check --allow-read supabase/functions/_shared/endurance-library/
// ============================================================================

import { assert, assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  ALL_FAMILIES,
  ALL_LEVELS,
  applyEasyBoutBounds,
  applyTempoCrossover,
  archetypesFor,
  buildEnduranceSession,
  sessionDurationBandSeconds,
} from './generate.ts';
import {
  FAMILIES,
  TEMPO_CROSSOVER_SECONDS,
  THRESHOLD_REST_MAX_SECONDS,
  THRESHOLD_REST_MIN_SECONDS,
  THRESHOLD_WORK_TO_REST,
  VT1_BOUT_FLOOR_SECONDS,
  VT1_CONTINUOUS_CAP_SECONDS,
  WORK_BANDS,
} from './source-rules.ts';
import type { EnduranceSession, FamilyId, Level, Step } from './types.ts';

// ── athlete shapes ──────────────────────────────────────────────────────────────────────────────
//
// ⛔ NOT MICHAEL'S NUMBERS, AND NOT A HANDFUL OF SHAPES. Rule 8 of the work order: do not tune to
// one athlete. The spread below runs from a 4:00/mi threshold to 16:00/mi, 90 W to 420 W, and 60 to
// 240 seconds per 100 m — wider at both ends than anyone who will ever use the app.

type Shape = { label: string; baselines: unknown };

const athlete = (thresholdSecPerKm: number, easySecPerKm: number, ftp: number, swimPer100: number): unknown => ({
  learned_fitness: {
    run_threshold_pace_sec_per_km: { value: thresholdSecPerKm, confidence: 'high', sample_count: 10 },
    run_easy_pace_sec_per_km: { value: easySecPerKm, confidence: 'high', sample_count: 20 },
    ride_ftp_estimated: { value: ftp, confidence: 'high' },
    swim_pace_per_100m: { value: swimPer100, confidence: 'high', sample_count: 6 },
  },
  performance_numbers: {},
});

function wideShapes(): Shape[] {
  const out: Shape[] = [];
  // sec/km: 149 (4:00/mi) through 596 (16:00/mi)
  for (const thr of [149, 186, 224, 261, 299, 336, 373, 448, 522, 596]) {
    for (const ftp of [90, 150, 210, 280, 350, 420]) {
      for (const swim of [60, 95, 130, 175, 240]) {
        out.push({ label: `thr${thr}/ftp${ftp}/swim${swim}`, baselines: athlete(thr, Math.round(thr * 1.3), ftp, swim) });
      }
    }
  }
  return out;
}

/** The degenerate inputs, which are where a generator actually breaks. */
const EDGE_SHAPES: Shape[] = [
  { label: 'no baselines at all', baselines: undefined },
  { label: 'null baselines', baselines: null },
  { label: 'empty baselines', baselines: {} },
  { label: 'run only', baselines: { learned_fitness: { run_threshold_pace_sec_per_km: { value: 261, confidence: 'high' } } } },
  { label: 'bike only', baselines: { learned_fitness: { ride_ftp_estimated: { value: 240, confidence: 'high' } } } },
  { label: 'swim only', baselines: { learned_fitness: { swim_pace_per_100m: { value: 110, confidence: 'high', sample_count: 6 } } } },
  { label: 'zero values', baselines: { learned_fitness: { run_threshold_pace_sec_per_km: { value: 0, confidence: 'high' }, ride_ftp_estimated: { value: 0, confidence: 'high' } } } },
  { label: 'negative values', baselines: { learned_fitness: { run_threshold_pace_sec_per_km: { value: -100, confidence: 'high' }, ride_ftp_estimated: { value: -50, confidence: 'high' } } } },
  { label: 'string values', baselines: { performance_numbers: { threshold_pace_min_per_mi: '7:00', ftp: '240' } } },
  { label: 'absurdly slow', baselines: athlete(1200, 1600, 40, 600) },
  { label: 'absurdly fast', baselines: athlete(120, 150, 600, 40) },
];

const SIZES = [0, 0.25, 0.5, 0.75, 1];

/** Every step in the session, flattened, with block repeats expanded. */
function allSteps(s: EnduranceSession): Step[] {
  const out: Step[] = [...s.warmup];
  for (const b of s.blocks) {
    for (let r = 0; r < b.repeat; r++) {
      out.push(...b.steps);
      if (b.restBetween && r < b.repeat - 1) out.push(b.restBetween);
    }
  }
  out.push(...s.cooldown);
  return out;
}

const REF = athlete(261, 340, 240, 110);

// ════════════════════════════════════════════════════════════════════════════════════════════════
// A — EVERY FAMILY x LEVEL x ARCHETYPE BUILDS, AND IS STRUCTURALLY WHOLE
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('every family x level x archetype builds a whole session', () => {
  let built = 0;
  for (const family of ALL_FAMILIES) {
    for (const level of ALL_LEVELS) {
      const archetypes = archetypesFor(family, level);
      assert(archetypes.length > 0, `${family} L${level} offers no archetype`);
      for (const a of archetypes) {
        for (const size of SIZES) {
          const s = buildEnduranceSession({ family, level, size, archetype: a.id, baselines: REF });
          built++;
          assertEquals(s.family, family);
          assertEquals(s.level, level);
          assertEquals(s.archetype, a.id);
          assert(s.blocks.length > 0, `${family} L${level} ${a.id} built no blocks`);
          for (const b of s.blocks) {
            assert(b.repeat >= 1, `${family} L${level} ${a.id} repeat ${b.repeat}`);
            assert(b.steps.length > 0, `${family} L${level} ${a.id} empty block`);
          }
          // ⛔ Every step carries either a resolved target or a stated reason it has none. Never both
          // absent — an empty target object is the shape a placeholder pace would hide inside.
          for (const st of allSteps(s)) {
            const t = st.target;
            const resolved = t.paceSecPerMi != null || t.watts != null || t.swimSecPer100m != null;
            assert(resolved || typeof t.unresolved === 'string',
              `${family} L${level} ${a.id}: step "${st.label}" has neither a target nor a reason`);
            assert(!(resolved && t.unresolved != null),
              `${family} L${level} ${a.id}: step "${st.label}" is both resolved and unresolved`);
          }
        }
      }
    }
  }
  // 13 families, three levels, several shapes each, five sizes. If this collapses, something stopped
  // being offered and the count is the tell.
  assert(built >= 13 * 3 * 5, `only ${built} sessions built`);
});

Deno.test('the warm-up and cooldown the source prints are IN the session', () => {
  // ⛔ "Warm-ups and cooldowns are part of the session, not decoration" — the work order's words.
  // Every family whose page prints a box must carry it; every family whose page prints none must not
  // have one invented for it.
  const withWarmup: FamilyId[] = [
    'run_sprint_power', 'run_mlss', 'run_near_threshold',
    'ride_sprints', 'ride_anaerobic', 'ride_vo2', 'ride_sweet_spot',
    'swim_endurance', 'swim_speed',
  ];
  const withCooldown: FamilyId[] = ['run_sprint_power', 'run_mlss', 'run_near_threshold'];
  const noWrapper: FamilyId[] = ['run_vt1', 'run_lsd', 'ride_endurance', 'swim_open_water'];

  for (const family of withWarmup) {
    const s = buildEnduranceSession({ family, level: 2, baselines: REF });
    assert(s.warmup.length > 0, `${family} lost its warm-up`);
  }
  for (const family of withCooldown) {
    const s = buildEnduranceSession({ family, level: 2, baselines: REF });
    assert(s.cooldown.length > 0, `${family} lost its cooldown`);
  }
  for (const family of noWrapper) {
    const s = buildEnduranceSession({ family, level: 2, baselines: REF });
    assertEquals(s.warmup.length, 0, `${family} grew a warm-up the source does not print`);
    assertEquals(s.cooldown.length, 0, `${family} grew a cooldown the source does not print`);
  }
});

Deno.test('an unknown family or an archetype the level does not offer is refused, not guessed', () => {
  assertThrows(() => buildEnduranceSession({ family: 'run_nope' as FamilyId, level: 1 }));
  assertThrows(() => buildEnduranceSession({ family: 'run_mlss', level: 1, archetype: 'not_a_shape' }));
  // Out-and-across is levels 1-2 only; the straight distance is level 3 only. Asking across that
  // line must fail rather than silently building the other one.
  assertThrows(() => buildEnduranceSession({ family: 'swim_open_water', level: 3, archetype: 'out_and_across' }));
  assertThrows(() => buildEnduranceSession({ family: 'swim_open_water', level: 1, archetype: 'straight_distance' }));
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// B — DURATION
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('the total is COMPUTED, positive, and says when it is a lower bound', () => {
  for (const family of ALL_FAMILIES) {
    for (const level of ALL_LEVELS) {
      const s = buildEnduranceSession({ family, level, baselines: REF });
      assertEquals(s.totals.basis, 'computed', `${family} L${level} claims a stated total`);
      assert(s.totals.clockedSeconds > 0, `${family} L${level} has no duration`);
      assert(Number.isFinite(s.totals.clockedSeconds), `${family} L${level} duration is not finite`);
      // A session with untimed recovery, or a clock derived from distance, MUST say it is a bound.
      const hasOpen = allSteps(s).some((st) => st.seconds == null && (st.role === 'rest' || st.role === 'recovery'));
      const hasDerived = allSteps(s).some((st) => st.secondsFromDistance);
      assertEquals(s.totals.isLowerBound, hasOpen || hasDerived,
        `${family} L${level} misreports whether its total is a bound`);
      // And the note has to be on the face of it, not only in a flag.
      assert(s.notes.some((n) => n.kind === 'computed'), `${family} L${level} carries no computed-total note`);
      if (s.totals.isLowerBound) {
        assert(s.notes.some((n) => n.text.toLowerCase().includes('at least')),
          `${family} L${level} is a lower bound and does not say so`);
      }
    }
  }
});

Deno.test('the size dial moves the session, and never backwards', () => {
  // ⛔ SIZE IS THE ATHLETE-FACING DIAL (§3d). A dial that does not move, or moves the wrong way, is
  // the whole control being broken silently.
  let movedSomewhere = 0;
  for (const family of ALL_FAMILIES) {
    for (const level of ALL_LEVELS) {
      for (const a of archetypesFor(family, level)) {
        const at = (size: number) =>
          buildEnduranceSession({ family, level, size, archetype: a.id, baselines: REF }).totals.clockedSeconds;
        const lengths = SIZES.map(at);
        for (let i = 1; i < lengths.length; i++) {
          assert(lengths[i] >= lengths[i - 1],
            `${family} L${level} ${a.id}: size ${SIZES[i]} is SHORTER than size ${SIZES[i - 1]} (${lengths[i]} < ${lengths[i - 1]})`);
        }
        if (lengths[lengths.length - 1] > lengths[0]) movedSomewhere++;
      }
    }
  }
  assert(movedSomewhere >= 20, `the size dial moved on only ${movedSomewhere} shapes`);
});

Deno.test('the level moves the DOSE up, family by family', () => {
  // ⛔ THE DOSE, NOT THE CLOCK, AND THE DIFFERENCE IS REAL. His levels are a ladder of WORK. Total
  // session time also carries fixed between-set recoveries, and those move with the SET count rather
  // than with the level — a level whose reps regroup into fewer, longer sets can come out shorter on
  // the clock while carrying more work. Asserting the clock would be asserting an artefact of his
  // rest prescriptions rather than his ladder.
  //
  // ⚠️ Sprint work is the stated exception in BOTH sports: it is neurally capped, so a higher level
  // buys more options and more complex starts rather than more metres. Its bands are not monotone on
  // the page either, which is recorded on `WORK_BANDS`.
  const laddered = ALL_FAMILIES.filter((f) => f !== 'run_sprint_power' && f !== 'ride_sprints');
  for (const family of laddered) {
    const at = (level: Level) => {
      let best = 0;
      for (const a of archetypesFor(family, level)) {
        const t = buildEnduranceSession({ family, level, size: 1, archetype: a.id, baselines: REF }).totals;
        best = Math.max(best, t.workSeconds + (t.meters ?? 0));
      }
      return best;
    };
    assert(at(2) >= at(1), `${family}: level 2 carries less work than level 1 (${at(2)} < ${at(1)})`);
    assert(at(3) >= at(2), `${family}: level 3 carries less work than level 2 (${at(3)} < ${at(2)})`);
    // ⛔ AND THE FULL LADDER STEP IS STRICT. A `>=` chain passes when the level stops being read at
    // all — every level comes out identical and every comparison is an equality. Mutation-testing
    // caught exactly that: flattening the level dial left this test green.
    assert(at(3) > at(1), `${family}: level 3 carries no more work than level 1 (${at(3)} = ${at(1)})`);
  }
});

Deno.test('the slot band brackets every session the slot can build', () => {
  // ⛔ THE ASK-15-GET-20 DEFECT, ASSERTED AGAINST. The wizard shows this band as "up to X"; if a
  // built session can fall outside it, the number on screen is a promise the plan breaks.
  for (const family of ALL_FAMILIES) {
    for (const level of ALL_LEVELS) {
      const band = sessionDurationBandSeconds(family, level, { baselines: REF });
      assert(band.shortest <= band.longest, `${family} L${level}: band is inverted`);
      assert(Number.isFinite(band.shortest) && band.longest > 0, `${family} L${level}: band is not a number`);
      for (const a of archetypesFor(family, level)) {
        for (const size of SIZES) {
          const t = buildEnduranceSession({ family, level, size, archetype: a.id, baselines: REF }).totals;
          assert(t.clockedSeconds >= band.shortest && t.clockedSeconds <= band.longest,
            `${family} L${level} ${a.id} @${size}: ${t.clockedSeconds}s falls outside the band ${band.shortest}-${band.longest}`);
        }
      }
    }
  }
});

Deno.test('a session sized to the source band lands inside the source band', () => {
  // ⛔ THE CROSS-CHECK ON THE COMPUTED DOSE. For the families whose band is a whole-session duration,
  // the built session must equal the band's ends at size 0 and size 1 — subject only to the stated
  // floor and cap. If the generator drifts away from the source's own numbers, this is what says so.
  const wholeSession: FamilyId[] = ['run_vt1', 'run_lsd', 'ride_endurance'];
  for (const family of wholeSession) {
    for (const level of ALL_LEVELS) {
      const band = WORK_BANDS[family][level];
      for (const [size, expected] of [[0, band.lo], [1, band.hi]] as const) {
        const s = buildEnduranceSession({ family, level, size, baselines: REF });
        const floored = Math.max(expected, VT1_BOUT_FLOOR_SECONDS);
        const exempt = family === 'ride_endurance';
        if (exempt || floored <= VT1_CONTINUOUS_CAP_SECONDS) {
          assert(Math.abs(s.totals.clockedSeconds - floored) <= 60,
            `${family} L${level} @${size}: built ${s.totals.clockedSeconds}s, the source says ${floored}s`);
        } else {
          // ⛔ WHERE THE CAP BINDS, IT BINDS THE EASY BOUT — not the session. An LSD run whose steady
          // portion is clipped to two hours still carries its inserted sets on top, so the session is
          // legitimately longer than the cap while no single easy bout inside it is.
          const easy = allSteps(s).filter((st) => st.role === 'work' && st.intensity.kind === 'vt1');
          assert(easy.length > 0, `${family} L${level} @${size}: a capped family with no easy bout in it`);
          for (const st of easy) {
            assert((st.seconds ?? 0) <= VT1_CONTINUOUS_CAP_SECONDS,
              `${family} L${level} @${size}: a ${st.seconds}s easy bout survived the cap`);
          }
          assert(s.totals.clockedSeconds <= floored + 60,
            `${family} L${level} @${size}: built ${s.totals.clockedSeconds}s, longer than the source's ${floored}s`);
        }
      }
    }
  }
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// C — WORK-TO-REST
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test("the threshold families rest by Ch.4's rule: work/4, clamped to 30s-2min", () => {
  // ⛔ THE RULE IS THE ASSERTION, NOT THE RESULTING RATIO — and that distinction is load-bearing.
  // Ch.4 says 4:1 AND says rest sits between 30 seconds and 2 minutes. On his 60- to 90-second
  // above-threshold repeats those two sentences disagree (4:1 asks for 15-22s) and the FLOOR wins,
  // so the session comes out nearer 2:1. Asserting "ratio >= 4" everywhere would be asserting
  // something he did not say — and it would fail, correctly.
  //
  // ⚠️ FINDING, RECORDED RATHER THAN HIDDEN: no shape in this library has a threshold-ratio rep long
  // enough for the 4:1 arithmetic to bind. The 30-second floor governs every one of them. If a
  // longer-rep threshold shape is ever added, this test starts exercising the ratio itself.
  let checked = 0;
  for (const family of ALL_FAMILIES) {
    for (const level of ALL_LEVELS) {
      for (const a of FAMILIES[family].archetypes) {
        if (a.recovery.kind !== 'threshold_ratio') continue;
        if (a.levels && !a.levels.includes(level)) continue;
        for (const size of SIZES) {
          const s = buildEnduranceSession({ family, level, size, archetype: a.id, baselines: REF });
          for (const b of s.blocks) {
            const work = b.steps.find((st) => st.role === 'work' && st.seconds != null);
            if (!work) continue;
            // With no `set`, the between-rep recovery is the block's `restBetween`; with a `set` it
            // sits inside the step list. Both are the same rule and both are checked.
            const between = b.restBetween?.role === 'recovery'
              ? b.restBetween
              : b.steps.find((st) => st.role === 'recovery');
            assert(between, `${family} L${level} ${a.id}: a threshold block with no recovery at all`);
            const w = work.seconds!;
            // ⛔ THE LITERALS ARE DELIBERATE. Recomputing the expectation from the same constants the
            // code reads makes the assertion true by construction: mutation-testing showed that
            // changing 4:1 to 2:1 left this test green, because both sides moved together. Ch.4's
            // numbers are written out here so a change to any of them has to be argued with.
            const expected = Math.round(Math.min(Math.max(w / 4, 30), 120));
            assertEquals(between!.seconds, expected,
              `${family} L${level} ${a.id}: ${w}s of work rested ${between!.seconds}s, the rule says ${expected}s`);
            checked++;
          }
        }
      }
    }
  }
  assert(checked > 0, 'no threshold-ratio recovery was checked — the rule has no subject any more');
});

Deno.test('the 30-second rest floor is what governs his above-threshold repeats', () => {
  // The other half of the finding above, asserted concretely so a change to EITHER constant moves a
  // number here rather than passing silently. His repeats are 60s at level 1 and 90s at level 3;
  // work/4 is 15s and 22.5s, both under the floor, so both rest 30 seconds.
  // ⛔ LITERAL 30, NOT THE CONSTANT. Asserting `=== THRESHOLD_REST_MIN_SECONDS` moves with the
  // constant and can never fail; mutation-testing proved it — the floor was changed to 45 and this
  // test stayed green.
  for (const [level, repSeconds] of [[1, 60], [3, 90]] as const) {
    const s = buildEnduranceSession({ family: 'run_near_threshold', level, archetype: 'short_above', baselines: REF });
    const b = s.blocks[0];
    assertEquals(b.steps.find((st) => st.role === 'work')!.seconds, repSeconds);
    assertEquals(b.restBetween!.seconds, 30);
  }
  // The constants themselves are Ch.4's, and they are pinned here so a silent edit is a red test.
  assertEquals(THRESHOLD_WORK_TO_REST, 4);
  assertEquals(THRESHOLD_REST_MIN_SECONDS, 30);
  assertEquals(THRESHOLD_REST_MAX_SECONDS, 120);
});

Deno.test('an interval session has recovery between its reps, or the source says it has none', () => {
  // ⛔ THE ONE FAMILY WITH NO GAP IS OPEN WATER, and it is not an oversight — p241 has the swimmer
  // turn and swim back, then rest only on returning to shore. Everything else that repeats an effort
  // must put something between the efforts, timed or explicitly "full recovery".
  for (const family of ALL_FAMILIES) {
    for (const level of ALL_LEVELS) {
      for (const a of archetypesFor(family, level)) {
        const s = buildEnduranceSession({ family, level, archetype: a.id, baselines: REF });
        for (const b of s.blocks) {
          const workSteps = b.steps.filter((st) => st.role === 'work').length;
          const repeatsAnEffort = b.repeat > 1 || workSteps > 1;
          if (!repeatsAnEffort) continue;
          const hasGap = b.restBetween != null
            || b.steps.some((st) => st.role === 'rest' || st.role === 'recovery' || st.role === 'float');
          if (family === 'swim_open_water') continue;
          assert(hasGap, `${family} L${level} ${a.id}: repeats an effort with nothing between the reps`);
        }
      }
    }
  }
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// D — THE FLOORS AND THE CAPS
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('the 10-minute adaptation floor and the 2h cap, tested directly', () => {
  // ⛔ DIRECT, BECAUSE NO BUILT SESSION REACHES EITHER BOUND FROM BELOW. His shortest stated easy
  // session is a 25-minute VT1 run, so the floor never binds inside a real session — and a test that
  // only inspects built sessions therefore cannot tell an enforced floor from a deleted one.
  // Mutation-testing proved that: the floor was removed and the sweep below stayed green.
  assertEquals(applyEasyBoutBounds(5 * 60, false).seconds, 10 * 60);
  assertEquals(applyEasyBoutBounds(1, false).seconds, 10 * 60);
  assertEquals(applyEasyBoutBounds(25 * 60, false).seconds, 25 * 60);
  // The cap, and the two families the source itself prescribes past it.
  assertEquals(applyEasyBoutBounds(5 * 3600, false).seconds, 2 * 3600);
  assertEquals(applyEasyBoutBounds(5 * 3600, false).exceedsGuidance, false);
  assertEquals(applyEasyBoutBounds(5 * 3600, true).seconds, 5 * 3600);
  assertEquals(applyEasyBoutBounds(5 * 3600, true).exceedsGuidance, true);
  assertEquals(applyEasyBoutBounds(90 * 60, true).exceedsGuidance, false);
  // And the constants are Ch.4's own.
  assertEquals(VT1_BOUT_FLOOR_SECONDS, 600);
  assertEquals(VT1_CONTINUOUS_CAP_SECONDS, 7200);
});

Deno.test('no easy bout in any built session is under the adaptation floor', () => {
  for (const shape of [...EDGE_SHAPES, ...wideShapes().slice(0, 40)]) {
    for (const family of ALL_FAMILIES) {
      for (const level of ALL_LEVELS) {
        for (const a of archetypesFor(family, level)) {
          for (const size of SIZES) {
            const s = buildEnduranceSession({ family, level, size, archetype: a.id, baselines: shape.baselines as never });
            for (const st of allSteps(s)) {
              const easyWork = st.role === 'work' && (st.intensity.kind === 'vt1' || st.intensity.kind === 'below_pct');
              if (!easyWork || st.seconds == null) continue;
              assert(st.seconds >= VT1_BOUT_FLOOR_SECONDS,
                `${family} L${level} ${a.id} @${size} [${shape.label}]: a ${st.seconds}s easy bout is under the floor`);
            }
          }
        }
      }
    }
  }
});

Deno.test('no easy bout passes the 2h cap, except the two the source itself prescribes longer', () => {
  for (const family of ALL_FAMILIES) {
    for (const level of ALL_LEVELS) {
      for (const a of archetypesFor(family, level)) {
        for (const size of SIZES) {
          const s = buildEnduranceSession({ family, level, size, archetype: a.id, baselines: REF });
          for (const st of allSteps(s)) {
            const easyWork = st.role === 'work' && (st.intensity.kind === 'vt1' || st.intensity.kind === 'below_pct');
            if (!easyWork || st.seconds == null || st.seconds <= VT1_CONTINUOUS_CAP_SECONDS) continue;
            const exempt = a.id === 'hike' || family === 'ride_endurance';
            assert(exempt, `${family} L${level} ${a.id} @${size}: a ${st.seconds}s easy bout passes the cap`);
            // ⛔ AND AN EXEMPT SESSION MUST SAY SO. Silently exceeding his own guidance is the same
            // defect as silently clipping it — the athlete is told nothing either way.
            assert(s.notes.some((n) => n.text.includes('two hours')),
              `${family} L${level} ${a.id}: over the cap and carries no note about it`);
          }
        }
      }
    }
  }
});

Deno.test('no ABOVE-threshold interval outgrows the 15-minute tempo crossover', () => {
  // ⛔ Ch.4 RECLASSIFIES, IT DOES NOT CAP — and reading it as a cap deleted one of his own sessions.
  // p239 prescribes 20-minute repeats at 80% of threshold; those ARE the tempo efforts Ch.4 names.
  // So the rule binds work at or above threshold, and a longer sub-threshold block survives with a
  // note saying it is a tempo effort. The sub-threshold half is asserted in the test below.
  for (const family of ALL_FAMILIES) {
    for (const level of ALL_LEVELS) {
      // ⚠️ SWIMMING IS EXEMPT, AND ON HIS AUTHORITY. Ch.4's crossover is a statement about threshold
      // INTERVALS; p241 prescribes 1200 m and 1600 m swim repeats outright, and at any real swim pace
      // those run past fifteen minutes. Applying a running rule to them would forbid his own session.
      if (FAMILIES[family].sport === 'swim') continue;
      for (const a of archetypesFor(family, level)) {
        if (a.id === 'hike' || a.id === 'steady' || a.id === 'continuous' || a.id === 'straight_distance') continue;
        for (const size of SIZES) {
          const s = buildEnduranceSession({ family, level, size, archetype: a.id, baselines: REF });
          for (const b of s.blocks) {
            // The steady portion of a with-inserts session is a bout, not an interval.
            if (b.label.toLowerCase().startsWith('steady')) continue;
            for (const st of b.steps) {
              if (st.role !== 'work' || st.seconds == null) continue;
              if (st.intensity.kind !== 'pct_threshold' || st.intensity.lo < 1.0) continue;
              assert(st.seconds <= TEMPO_CROSSOVER_SECONDS,
                `${family} L${level} ${a.id} @${size}: a ${st.seconds}s above-threshold interval passes the crossover`);
            }
          }
        }
      }
    }
  }
});

Deno.test('the tempo crossover, tested directly', () => {
  // ⛔ DIRECT, FOR THE SAME REASON THE FLOOR IS. No shape currently prescribes an above-threshold rep
  // long enough to reach fifteen minutes, so the sweep cannot see the clamp being deleted — and
  // mutation-testing showed exactly that: removing it left every session assertion green.
  const above = { kind: 'pct_threshold', lo: 1.05, hi: 1.05 } as const;
  const below = { kind: 'pct_threshold', lo: 0.80, hi: 0.80 } as const;
  assertEquals(applyTempoCrossover(1200, above), { seconds: 900, isTempoEffort: false });
  assertEquals(applyTempoCrossover(901, above), { seconds: 900, isTempoEffort: false });
  assertEquals(applyTempoCrossover(900, above), { seconds: 900, isTempoEffort: false });
  assertEquals(applyTempoCrossover(600, above), { seconds: 600, isTempoEffort: false });
  // A sub-threshold block is reclassified, never clipped — this is his 20-minute sweet-spot repeat.
  assertEquals(applyTempoCrossover(1200, below), { seconds: 1200, isTempoEffort: true });
  assertEquals(applyTempoCrossover(900, below), { seconds: 900, isTempoEffort: false });
  assertEquals(TEMPO_CROSSOVER_SECONDS, 900);
});

Deno.test('a sub-threshold block past fifteen minutes survives, and says it is a tempo effort', () => {
  // The other half of the crossover. His 20-minute sweet-spot block at 80% is the case, and it must
  // reach the athlete at twenty minutes rather than clipped to fifteen.
  const s = buildEnduranceSession({ family: 'ride_sweet_spot', level: 3, size: 1, archetype: 'tempo', baselines: REF });
  const work = s.blocks[0].steps.find((st) => st.role === 'work')!;
  assertEquals(work.seconds, 1200);
  assert(s.notes.some((n) => n.text.includes('tempo effort')),
    'a twenty-minute block was built and never said it was a tempo effort');
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// E — THE ANCHOR CONTRACT: the athlete's own numbers, and never an invented one
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('with no baselines, NOTHING resolves to a number and every step says why', () => {
  // ⛔ NEVER 540. NEVER 600. The resolver header's own line, held here.
  for (const family of ALL_FAMILIES) {
    for (const level of ALL_LEVELS) {
      const s = buildEnduranceSession({ family, level });
      assertEquals(s.anchor.value, null, `${family} L${level} produced an anchor out of nothing`);
      for (const st of allSteps(s)) {
        assertEquals(st.target.paceSecPerMi, undefined, `${family} L${level}: "${st.label}" invented a pace`);
        assertEquals(st.target.watts, undefined, `${family} L${level}: "${st.label}" invented a wattage`);
        assertEquals(st.target.swimSecPer100m, undefined, `${family} L${level}: "${st.label}" invented a swim pace`);
        assert(typeof st.target.unresolved === 'string' && st.target.unresolved.length > 0);
      }
      assert(s.notes.some((n) => n.text.includes('No threshold on file')),
        `${family} L${level}: no baselines and no note saying so`);
    }
  }
});

Deno.test('the prescription is a function of THIS athlete, not a stored table', () => {
  // ⛔ THE TRANSCRIPTION GUARD. Two athletes, one session type, and the numbers must differ. If a
  // pace table were stored anywhere in this library, this is the assertion that would catch it.
  const fast = buildEnduranceSession({ family: 'run_mlss', level: 2, baselines: athlete(180, 240, 300, 80) });
  const slow = buildEnduranceSession({ family: 'run_mlss', level: 2, baselines: athlete(400, 520, 140, 180) });
  const p = (s: EnduranceSession) => s.blocks[0].steps[0].target.paceSecPerMi!;
  assert(p(fast).lo < p(slow).lo, 'the faster athlete was not prescribed a faster pace');
  assert(p(fast).lo > 0 && p(slow).lo > 0);

  const strong = buildEnduranceSession({ family: 'ride_vo2', level: 2, baselines: athlete(261, 340, 380, 110) });
  const weak = buildEnduranceSession({ family: 'ride_vo2', level: 2, baselines: athlete(261, 340, 120, 110) });
  const w = (s: EnduranceSession) => s.blocks[0].steps[0].target.watts!;
  assert(w(strong).lo > w(weak).lo, 'the stronger rider was not prescribed more power');

  const quick = buildEnduranceSession({ family: 'swim_endurance', level: 2, baselines: athlete(261, 340, 240, 70) });
  const steady = buildEnduranceSession({ family: 'swim_endurance', level: 2, baselines: athlete(261, 340, 240, 190) });
  assert(quick.totals.clockedSeconds < steady.totals.clockedSeconds,
    'the faster swimmer was not given a shorter session for the same distance');
});

Deno.test('percentages point the right way — the direction bug that would look plausible', () => {
  // ⛔ A HIGHER PERCENTAGE IS A FASTER PACE (a SMALLER sec/mi) AND MORE WATTS. Inverting this
  // produces perfectly reasonable-looking numbers that prescribe the opposite workout.
  const s = buildEnduranceSession({ family: 'run_near_threshold', level: 2, archetype: 'short_above', baselines: REF });
  const work = s.blocks[0].steps.find((st) => st.role === 'work')!;
  const rec = (s.blocks[0].restBetween ?? s.blocks[0].steps.find((st) => st.role === 'recovery'))!;
  assert(work.target.paceSecPerMi!.lo < rec.target.paceSecPerMi!.lo,
    'the work interval is not faster than the recovery');
  // 100-105% of a 420 s/mi threshold is 400-420 s/mi.
  assertEquals(work.target.paceSecPerMi!.hi, 420);
  assertEquals(work.target.paceSecPerMi!.lo, 400);

  const ride = buildEnduranceSession({ family: 'ride_sweet_spot', level: 2, archetype: 'tempo', baselines: REF });
  // 80% of 240 W.
  assertEquals(ride.blocks[0].steps[0].target.watts, { lo: 192, hi: 192 });
});

Deno.test('a partial athlete gets numbers for the sport they have and honesty for the rest', () => {
  const bikeOnly = { learned_fitness: { ride_ftp_estimated: { value: 240, confidence: 'high' } } };
  const ride = buildEnduranceSession({ family: 'ride_vo2', level: 2, baselines: bikeOnly });
  assert(ride.blocks[0].steps[0].target.watts!.lo > 0, 'a rider with an FTP got no power target');
  const run = buildEnduranceSession({ family: 'run_mlss', level: 2, baselines: bikeOnly });
  assertEquals(run.blocks[0].steps[0].target.paceSecPerMi, undefined, 'an FTP leaked into a run pace');
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// F — WHAT EVERY SESSION MUST SAY OUT LOUD
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('every ride session declares that its percentage basis is INFERRED', () => {
  // ⛔ p236 states no convention. The label travels with every cycling session or it is not a label.
  for (const family of ALL_FAMILIES.filter((f) => FAMILIES[f].sport === 'ride')) {
    for (const level of ALL_LEVELS) {
      const s = buildEnduranceSession({ family, level, baselines: REF });
      assert(s.notes.some((n) => n.kind === 'inferred' && n.text.includes('threshold power')),
        `${family} L${level} does not say its percentage basis is inferred`);
    }
  }
  // And no RUN session claims the same, because p229 states the running convention outright.
  for (const family of ALL_FAMILIES.filter((f) => FAMILIES[f].sport === 'run')) {
    const s = buildEnduranceSession({ family, level: 2, baselines: REF });
    assert(!s.notes.some((n) => n.text.includes('threshold power')),
      `${family} borrowed the cycling inference note`);
  }
});

Deno.test('the cardiac-drift termination rule reaches every easy and long session', () => {
  // ⛔ 5%, NOT 10% — the number for an athlete training several times a week, which is everyone this
  // plan is for. It is an instruction to act on mid-session, not a monitoring figure.
  for (const family of ['run_vt1', 'run_lsd', 'ride_endurance'] as FamilyId[]) {
    for (const level of ALL_LEVELS) {
      const s = buildEnduranceSession({ family, level, baselines: REF });
      const note = s.notes.find((n) => n.kind === 'safety' && n.text.includes('drift'));
      assert(note, `${family} L${level} carries no cardiac-drift rule`);
      // ⛔ BOTH CLAUSES, NOT THE BARE "5%". Mutation-testing changed the rule to 10% and this stayed
      // green, because the sentence's tail — "rather than 10%" — still contained a "5%" elsewhere.
      assert(note!.text.includes('drifted 5%'), `${family} L${level}: wrong heart-rate drift figure`);
      assert(note!.text.includes('fallen 5%'), `${family} L${level}: wrong pace drift figure`);
      assert(!note!.text.includes('drifted 10%'), `${family} L${level}: states the 10% figure`);
    }
  }
});

Deno.test('level 3 open water carries its mandated safety kit, and the lower levels do not claim it', () => {
  const l3 = buildEnduranceSession({ family: 'swim_open_water', level: 3, baselines: REF });
  const safety = l3.notes.find((n) => n.kind === 'safety');
  assert(safety, 'level 3 open water carries no safety note');
  for (const word of ['tether', 'buoy', 'whistle', 'lifeguard']) {
    assert(safety!.text.toLowerCase().includes(word), `the safety note omits "${word}"`);
  }
  for (const level of [1, 2] as Level[]) {
    const s = buildEnduranceSession({ family: 'swim_open_water', level, baselines: REF });
    assert(!s.notes.some((n) => n.kind === 'safety' && n.text.includes('tether')),
      `level ${level} open water claims the level 3 mandate`);
  }
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// G — THE WIDE SWEEP: nothing degenerates across the athlete space
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('nothing degenerates across 300 athlete shapes x every family x level x size', () => {
  // ⛔ THIS IS THE EVIDENCE THE 61-SHAPE SWEEP CANNOT PROVIDE. It is blind to a plan type that does
  // not exist, and stage 6 proved it is a regression net rather than a detector even where it does
  // apply. The space below is generated, not curated.
  const shapes = [...wideShapes(), ...EDGE_SHAPES];
  let sessions = 0;
  for (const shape of shapes) {
    for (const family of ALL_FAMILIES) {
      for (const level of ALL_LEVELS) {
        for (const size of [0, 0.5, 1]) {
          const s = buildEnduranceSession({ family, level, size, baselines: shape.baselines as never });
          sessions++;
          const where = `${family} L${level} @${size} [${shape.label}]`;

          assert(Number.isFinite(s.totals.clockedSeconds) && s.totals.clockedSeconds > 0, `${where}: bad total`);
          assert(Number.isFinite(s.totals.workSeconds) && s.totals.workSeconds >= 0, `${where}: bad work total`);
          assert(Number.isFinite(s.totals.restSeconds) && s.totals.restSeconds >= 0, `${where}: bad rest total`);
          assert(s.blocks.length > 0, `${where}: no blocks`);

          for (const b of s.blocks) {
            assert(Number.isInteger(b.repeat) && b.repeat >= 1 && b.repeat <= 200,
              `${where}: repeat count ${b.repeat} is degenerate`);
          }
          for (const st of allSteps(s)) {
            if (st.seconds != null) {
              assert(Number.isFinite(st.seconds) && st.seconds >= 0 && st.seconds <= 6 * 3600,
                `${where}: step "${st.label}" is ${st.seconds}s`);
            }
            if (st.meters != null) {
              assert(Number.isFinite(st.meters) && st.meters > 0, `${where}: step "${st.label}" is ${st.meters} m`);
            }
            for (const r of [st.target.paceSecPerMi, st.target.watts, st.target.swimSecPer100m]) {
              if (!r) continue;
              assert(Number.isFinite(r.lo) && Number.isFinite(r.hi), `${where}: "${st.label}" has a non-finite target`);
              assert(r.lo >= 0 && r.hi >= 0, `${where}: "${st.label}" has a negative target`);
              assert(r.lo <= r.hi, `${where}: "${st.label}" has an inverted target range`);
            }
          }
          // Every family with an intensity floor must actually prescribe work at it.
          if (FAMILIES[family].workFloorPct > 0 && s.anchor.value != null) {
            assert(s.totals.workSeconds > 0 || (s.totals.meters ?? 0) > 0,
              `${where}: a quality session with no quality work in it`);
          }
        }
      }
    }
  }
  assert(sessions >= 300 * 13, `only ${sessions} sessions swept`);
});

Deno.test('the slot band stays sane across the athlete space', () => {
  for (const shape of [...EDGE_SHAPES, ...wideShapes().slice(0, 60)]) {
    for (const family of ALL_FAMILIES) {
      for (const level of ALL_LEVELS) {
        const band = sessionDurationBandSeconds(family, level, { baselines: shape.baselines as never });
        const where = `${family} L${level} [${shape.label}]`;
        assert(Number.isFinite(band.shortest) && Number.isFinite(band.longest), `${where}: band is not finite`);
        assert(band.shortest > 0, `${where}: band floor is ${band.shortest}`);
        assert(band.shortest <= band.longest, `${where}: band is inverted`);
        assert(band.longest <= 6 * 3600, `${where}: band ceiling is ${band.longest}s`);
      }
    }
  }
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// H — CLIENT-REACHABLE, ASSERTED AT THE SOURCE
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('the module carries nothing that would break in a browser', async () => {
  // ⛔ A LINT, AND IT IS HONEST ABOUT BEING ONE. It holds what a lint can hold. What it cannot hold —
  // that the bundler actually resolves the module through the `@shared` alias and that the result
  // RUNS — was proven by building it with this repo's own Vite and executing the bundle; see the
  // stage notes. A lint cannot prove that, and this comment does not pretend it does.
  const dir = new URL('.', import.meta.url).pathname;
  for (const name of ['types.ts', 'source-rules.ts', 'anchors.ts', 'generate.ts', 'index.ts']) {
    const src = await Deno.readTextFile(dir + name);
    assert(!/\bDeno\./.test(src), `${name} touches Deno — it cannot run in the client`);
    assert(!/from ['"]https:/.test(src), `${name} imports over https — the client's loader rejects it`);
    assert(!/createClient|@supabase\/supabase-js/.test(src), `${name} reaches for a supabase client`);
    assert(!/\bprocess\.env\b/.test(src), `${name} reads process.env`);
    // ⛔ EVERY IMPORT MUST STAY INSIDE THE TWO DIRECTORIES THE CLIENT ALIAS CAN SEE.
    // ⚠️ Matched from the start of a statement, with comments stripped first, so prose and string
    // concatenation cannot be mistaken for an import — an earlier version of this line flagged the
    // word "from" inside a note and reported it as an unresolvable module.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const m of code.matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s+['"]([^'"]+)['"]/gm)) {
      const spec = m[1];
      assert(spec.startsWith('.') || spec.startsWith('https://deno.land/std'),
        `${name} imports "${spec}", which the client cannot resolve`);
    }
  }
});

Deno.test('no pace, wattage or swim time is stored anywhere in the rules', () => {
  // ⛔ THE OTHER HALF OF THE TRANSCRIPTION GUARD, and it is a different question from the athlete
  // test above: that one proves the output moves; this one proves there is no table to move away
  // from. The rules may hold percentages, seconds and metres — never a sec/mi, a watt or a sec/100.
  const forbidden = /(secPerMi|sec_per_mi|watts?\s*:\s*\d|secPer100|paceTable|PACE_TABLE)/;
  const dir = new URL('.', import.meta.url).pathname;
  return Deno.readTextFile(dir + 'source-rules.ts').then((src) => {
    // Strip comments first — the prose legitimately discusses these words.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert(!forbidden.test(code), 'source-rules.ts holds a resolved pace or wattage');
  });
});

Deno.test('⛔⛔ A REPEAT COUNT COMES FROM THE WORK BAND, NOT FROM A SECOND DIAL', () => {
  /**
   * ⛔ THE DEFECT (2026-08-27). `repSeconds` climbs `repBand` with the LEVEL and `repCount` climbed
   * `repsBand` with the level AND the size, so both ends of the session grew together and the top of
   * the dial produced pairings no page prints:
   *
   *     run_near_threshold L3 race_repeats     built 4 x 15 min
   *     run_near_threshold L3 below_threshold  built 7 x 8:30
   *
   * ⛔ HIS OPTIONS ARE PAIRS. p234's race-specific level 3 reads 5K 4x5, 10K 4x8, half 3x12,
   * marathon 3x15 — as the repeat gets longer the count comes DOWN. Two independent bands cannot
   * express that and will always invent the both-at-the-top session. The count now comes from the
   * family's own work band divided by the repeat length, with `repsBand` as a clamp.
   *
   * ⚠️ NOT A PROMISE OF VERBATIM REPRODUCTION — this library models a family as a SHAPE inside his
   * bands. What is asserted is that a LONGER repeat never comes in equal or greater numbers than a
   * shorter one at the same level, which is the property his tables have and the old rule broke.
   */
  const REF = { learned_fitness: { run_threshold_pace_sec_per_km: { value: 261, confidence: 'high', sample_count: 10 }, run_easy_pace_sec_per_km: { value: 340, confidence: 'high', sample_count: 20 } }, performance_numbers: { ftp: 250 } } as never;
  const shape = (family: string, level: number, id: string) => {
    const s = buildEnduranceSession({ family, level, archetype: id, size: 0.5, baselines: REF } as never);
    const b = s.blocks[0];
    const work = b.steps.filter((x) => x.role === 'work' || x.role === 'float')
      .reduce((t, x) => t + (x.seconds ?? 0), 0);
    return { reps: b.repeat, work, rest: b.restBetween?.seconds ?? null };
  };

  /**
   * ⛔ p234's OWN LINE: the longest race repeat is fifteen minutes and comes as THREE.
   * ⚠️ IT MOVED ARCHETYPE ON 2026-08-31 and the assertion moved with it, unweakened. `race_repeats`
   * used to span every race distance in one band — 4 to 15 minutes at 92-105% — which is exactly
   * the both-ends-at-once pairing this test exists to forbid, and the plan token takes a band's top.
   * The long end is its own shape now, so the fifteen-minute repeat is asserted where it lives.
   */
  const race = shape('run_near_threshold', 3, 'race_repeats_long');
  assertEquals(race.work, 900, 'the level-3 long race repeat is no longer fifteen minutes');
  assertEquals(race.reps, 3, `p234 prints 3 x 15; built ${race.reps}`);
  // ⛔ AND THE SHORT END STAYS SHORT — the split is only honest if neither half drifts.
  const raceShort = shape('run_near_threshold', 3, 'race_repeats');
  assert(raceShort.work <= 480, `the short race repeat grew to ${raceShort.work}s`);
  assert(raceShort.reps >= race.reps, 'the shorter repeat comes in fewer numbers than the longer one');
  // ⛔ AND THE 8:30 ROUNDS ARE NOT SEVEN. p234 prints four; the band allows five, never seven.
  // ⚠️ THE LONG SUB-THRESHOLD REPEATS ARE THEIR OWN SHAPE SINCE 2026-08-31, for the same reason as
  // the race repeats: duration and percentage are paired on the page and were sampled apart here.
  const below = shape('run_near_threshold', 3, 'below_threshold_long');
  assert(below.reps <= 6, `p234 prints 4 rounds of 8:30; built ${below.reps}`);

  /**
   * ⛔ THE PROPERTY, ACROSS EVERY FAMILY AND LEVEL: within one family and level, a longer repeat
   * never comes in greater numbers than a shorter one. That is what makes the pairing his.
   */
  /**
   * ⚠️⚠️ THE COMPARISON MOVED INSIDE AN ARCHETYPE ON 2026-08-31, AND IT IS STRONGER FOR IT.
   *
   * ⛔ IT USED TO COMPARE ACROSS archetypes at one level — a proxy for the real thing. It was the
   * right proxy while counts were DOSE-derived from one shared band, because that is exactly the
   * mechanism that invents a both-at-the-top session. **Counts are now the source's own per level**
   * (`repsByLevel`), so two different shapes can legitimately sit at 8 x 270s and 6 x 225s: those
   * are two different prescriptions, not one band sampled twice, and the page carries both.
   *
   * ⛔ SO THE GUARANTEE IS ASSERTED DIRECTLY INSTEAD, in two halves that together say more than the
   * proxy did: within one archetype a longer repeat never comes MORE often as the level rises, and
   * every archetype that pins counts pins them for all three levels rather than one.
   */
  for (const family of ['run_near_threshold', 'run_mlss', 'ride_sweet_spot'] as const) {
    for (const a of archetypesFor(family as never, 1)) {
      const byLevel = ([1, 2, 3] as const)
        .filter((l) => archetypesFor(family as never, l).some((x) => x.id === a.id))
        .map((l) => ({ l, ...shape(family, l, a.id) }))
        .filter((x) => x.reps > 1);
      for (let i = 1; i < byLevel.length; i++) {
        const prev = byLevel[i - 1];
        const now = byLevel[i];
        assert(now.work >= prev.work || now.reps <= prev.reps,
          `${family}.${a.id}: L${now.l} is ${now.reps} x ${now.work}s against L${prev.l} at `
            + `${prev.reps} x ${prev.work}s — the repeat got shorter and more numerous at once`);
      }
    }
  }

  /**
   * ⛔ AND A PINNED COUNT IS PINNED FOR EVERY LEVEL. A shape that states its count at one level and
   * leaves the others to the dose is the old defect surviving in half the table.
   */
  for (const [family, arch] of Object.entries(FAMILIES)) {
    for (const a of (arch as { archetypes: Array<{ id: string; repsByLevel?: Record<number, unknown>; levels?: number[] }> }).archetypes) {
      if (!a.repsByLevel) continue;
      for (const l of (a.levels ?? [1, 2, 3])) {
        assert(a.repsByLevel[l], `${family}.${a.id} pins a count for some levels but not L${l}`);
      }
    }
  }

  // ⚠️ AND THE RECOVERY IS ON THE BLOCK, NOT IN THE STEPS — p234 states one for both shapes, and
  // `totalsFor` counts it on every repeat but the last.
  assert(race.rest != null && race.rest > 0, 'the race repeat lost its stated recovery');
  assert(below.rest != null && below.rest > 0, 'the 8:30 round lost its VT1 recovery');
});

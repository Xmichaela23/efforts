// THE HARD RUN'S TERRAIN — the athlete's pick, and the five things that must not drift.
//
// ⛔ WHY THIS FILE EXISTS. `4 × 3 min` uphill assumes a climb you can run for three minutes, and the
// engine cannot know whether one exists. The athlete answers on the D-327 hard-day card and the
// answer travels `preferred_days.quality_run_terrain` → `hard_day.terrain` → the session. Five
// failure modes, one pin each:
//
//   1. A terrain that maps to the wrong session, or to none.
//   2. A composer emitting a token the expander does not match — a SILENTLY EMPTY session. Nothing
//      throws: the athlete opens a hard day with no steps in it. Pinned by expanding every preset
//      every terrain can emit.
//   3. The mileage budget subtracting the wrong duration. The four options are 35/37/39/41 minutes;
//      subtracting a flat 35 hands the difference back as easy miles every week — the +3.5 mi bug
//      (2026-07-28) in miniature.
//   4. A pace target landing on a GRADED rep, where the velocity anchor is invalid (§2.2) — or being
//      stripped from the flat session, where it is the one legitimate anchor of the four.
//   5. The 40-second format coming back. It was built 2026-08-06 and reverted the same day (Q-260).
//
// Run: ~/.deno/bin/deno test --no-check supabase/functions/shared/strength-system/hard-run-terrain.test.ts

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  composeStrengthPrimaryPlan,
  hardRunSessionMinutes,
  FLAT_SESSION_MIN,
  HILL_SESSION_MIN,
  SHORT_HILL_SESSION_MIN,
  TREADMILL_SESSION_MIN,
} from './strength-primary-plan.ts';
import { expandRunToken } from '../../materialize-plan/index.ts';

const PACE = 10; // min/mi, so minutes ÷ 10 = miles
const BASE: any = { easyPace: '9:00/mi', fiveK_pace: '7:00/mi' };

/** Every terrain the menu can produce, plus `undefined` — the pre-2026-08-06 goal. */
const ALL = [undefined, 'hill_3min', 'hill_short', 'treadmill', 'flat'] as const;
/** The three that run on a gradient. §2.2's no-pace rule is theirs; flat is exempt. */
const GRADED = [undefined, 'hill_3min', 'hill_short', 'treadmill'] as const;

const week = (terrain?: string, discipline: 'run' | 'bike' = 'run') => {
  const p = composeStrengthPrimaryPlan({
    durationWeeks: 12,
    oneRepMaxes: { bench: 155, squat: 205, deadlift: 245, overheadPress: 105 },
    enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 20,
    longRunDay: 'sunday', easyPaceMinPerMile: PACE,
    hardDay: { day: 'tuesday', discipline, ...(terrain ? { terrain } : {}) },
  } as never);
  return (p.sessions_by_week['1'] as any[]);
};

const hardRun = (terrain?: string) =>
  week(terrain).find((s) => s.type === 'run' && /Hill|Treadmill|Flat/.test(s.name))!;

/**
 * ⚠️ EVERY PRESET, NOT `steps_preset[0]`. The three graded sessions carry ONE token that brackets
 * itself; the flat session carries THREE — `run_vo2_*` builds no warm-up or cool-down of its own,
 * so its callers pass them alongside (`session-factory.ts:443`). A test that reads only the first
 * preset would see a lone warm-up on the flat branch and call it a session.
 */
const expandSession = (terrain?: string): any[] =>
  (hardRun(terrain).steps_preset as string[])
    .flatMap((tok) => (expandRunToken(tok, BASE) as any[]) ?? []);

// ── 1. Every branch maps to its session ──────────────────────────────────────────────────────────

Deno.test('⛔ EVERY TERRAIN MAPS TO ITS SESSION — and absent means the 3-minute hill', () => {
  // ⚠️ ABSENT IS THE LOAD-BEARING CASE. Every goal created before this field existed has no terrain
  // on it, and each one must keep building the exact week it built yesterday.
  for (const [terrain, name, presets] of [
    [undefined, 'Hill Repeats', [/^run_hills_4x180s_rlap_g5_8_d(walk|jog)$/]],
    ['hill_3min', 'Hill Repeats', [/^run_hills_4x180s_rlap_g5_8_d(walk|jog)$/]],
    ['hill_short', 'Short Hill Repeats', [/^run_hills_10x60s_r60s_g4_6_d(walk|jog)$/]],
    ['treadmill', 'Treadmill Intervals', [/^run_hills_4x180s_r180s_g5_8_djog_tm$/]],
    ['flat', 'Flat Intervals', [
      /^warmup_run_10min_easy$/, /^run_vo2_4x3min_r180s_z5$/, /^cooldown_run_10min_easy$/,
    ]],
  ] as const) {
    const s = hardRun(terrain);
    assertEquals(s.name, name, `terrain ${terrain} built the wrong session`);
    assertEquals(
      s.steps_preset.length, presets.length,
      `terrain ${terrain} emitted ${s.steps_preset.length} presets: ${s.steps_preset.join(', ')}`,
    );
    presets.forEach((re, i) => assertEquals(
      re.test(String(s.steps_preset[i])), true,
      `terrain ${terrain} preset ${i} was ${s.steps_preset[i]}`,
    ));
  }
});

Deno.test('an UNKNOWN terrain degrades to the 3-minute hill, never to no hard session', () => {
  // The door validates and drops an unlisted value, so the composer should never see this — but if
  // one ever arrives, the conservative arm is the session that already shipped.
  assertEquals(hardRun('parking_garage_ramp').name, 'Hill Repeats');
});

Deno.test('⚠️ THE RIDE HAS NO TERRAIN — a turbo, a chaingang and a climb are one session', () => {
  // ⚠️ The bike pass is gated on `hasBike`, so the hours have to be here — a `discipline: 'bike'`
  // pin with no bike block builds no ride at all, which is the composer working as designed.
  const p = composeStrengthPrimaryPlan({
    durationWeeks: 12,
    oneRepMaxes: { bench: 155, squat: 205, deadlift: 245, overheadPress: 105 },
    enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 20,
    longRunDay: 'sunday', easyPaceMinPerMile: PACE,
    bike: { hours: 4, days: 2 },
    hardDay: { day: 'tuesday', discipline: 'bike', terrain: 'flat' },
  } as never);
  const sessions = (p.sessions_by_week['1'] as any[]);
  const ride = sessions.find((s) => s.type === 'ride' && /Interval/.test(s.name))!;
  assertEquals(ride.name, 'Bike Intervals');
  assertEquals(ride.steps_preset[0], 'bike_vo2_4x4min_R4min', 'terrain leaked into the ride');
  assertEquals(
    sessions.some((s) => /Hill|Treadmill|Flat/.test(String(s.name))), false,
    'a bike hard day must not also build a hard run',
  );
});

// ── 2. Every token the composer can emit actually expands ────────────────────────────────────────

Deno.test('⛔ NO SILENTLY EMPTY SESSION — every emitted preset expands to real steps', () => {
  // This is the pin that catches a composer/expander divergence. A token that misses the regex
  // returns nothing, throws nothing, and reaches the athlete as a hard day with no steps in it.
  for (const terrain of ALL) {
    for (const tok of hardRun(terrain).steps_preset as string[]) {
      assertEquals(((expandRunToken(tok, BASE) as any[]) ?? []).length > 0, true, `${tok} did not expand`);
    }
    const steps = expandSession(terrain);
    assertEquals(steps[0].kind, 'warmup', `${terrain} opened cold`);
    assertEquals(steps[steps.length - 1].kind, 'cooldown', `${terrain} had no cool-down`);
    assertEquals(
      steps.filter((s) => s.kind === 'work').length > 0, true,
      `${terrain} expanded with no work reps`,
    );
  }
});

// ── 3. Pace belongs on exactly one of the four ───────────────────────────────────────────────────

Deno.test('⛔ NO PACE ON ANY GRADED REP — the anchor is invalid on a gradient (§2.2)', () => {
  // Includes the treadmill: the belt speed that means "hard" at 6% is not the flat one.
  for (const terrain of GRADED) {
    for (const s of expandSession(terrain).filter((x) => x.kind === 'work')) {
      assertEquals(s.pace_sec_per_mi, undefined, `${terrain} put a pace on a graded rep`);
    }
  }
});

Deno.test('⚠️ FLAT IS THE EXCEPTION AND KEEPS ITS PACE — it is the one option that is not graded', () => {
  // §2.2 forbids a pace on graded work because the velocity anchor goes invalid with gradient. On
  // the flat it holds, so 5K − 12 s/mi is a real number here. Stripping it "for consistency" with
  // the hill sessions would remove the only honest target of the four.
  const work = expandSession('flat').filter((s) => s.kind === 'work');
  assertEquals(work.length, 4, 'the flat session is 4 × 3 min');
  for (const s of work) {
    assertEquals(typeof s.pace_sec_per_mi === 'number', true, 'the flat rep lost its pace anchor');
  }
});

Deno.test('⛔ THE FLAT FLOAT IS 3 MIN, NOT THE TOKEN DEFAULT OF 90 s', () => {
  // A 90 s float turns 4 × 3 min into a materially harder session than the one costed at 41 min.
  const rec = expandSession('flat').filter((s) => s.kind === 'recovery');
  assertEquals(rec.length, 3, 'recovery goes between reps, never after the last one');
  for (const s of rec) assertEquals(s.duration_s, 180, 'the flat float must be the prescribed 3 min');
});

Deno.test('⛔ THE BARE run_vo2 TOKEN IS UNTOUCHED — 90 s float, no bracketing', () => {
  // The optional `_r{n}s` group must not have changed what every existing plan already builds.
  const out = expandRunToken('run_vo2_5x3min_z5', BASE) as any[];
  assertEquals(out.filter((s) => s.kind === 'work').length, 5);
  assertEquals(out.filter((s) => s.kind === 'warmup').length, 0, 'the bare token must not bracket itself');
  assertEquals(out.filter((s) => s.kind === 'cooldown').length, 0, 'the bare token must not bracket itself');
  for (const s of out.filter((x) => x.kind === 'recovery')) {
    assertEquals(s.duration_s, 90, 'the default float moved');
  }
});

// ── 4. The budget subtracts what the session actually costs ──────────────────────────────────────

Deno.test('⛔ THE DURATION TRACKS THE SESSION — one owner, or the miles come back as easy volume', () => {
  assertEquals(hardRunSessionMinutes(undefined), HILL_SESSION_MIN);
  assertEquals(hardRunSessionMinutes('hill_3min'), HILL_SESSION_MIN);
  assertEquals(hardRunSessionMinutes('hill_short'), SHORT_HILL_SESSION_MIN);
  assertEquals(hardRunSessionMinutes('treadmill'), TREADMILL_SESSION_MIN);
  assertEquals(hardRunSessionMinutes('flat'), FLAT_SESSION_MIN);
  for (const terrain of ALL) {
    assertEquals(
      hardRun(terrain).duration, hardRunSessionMinutes(terrain as never),
      `the session and the budget disagree on ${terrain}`,
    );
  }
});

Deno.test('the stated duration IS the expanded session — for the three with fixed recoveries', () => {
  // ⚠️ THE 3-MINUTE HILL IS EXCLUDED ON PURPOSE, NOT OVERLOOKED. Its descents are lap-button and
  // carry no duration, so the expansion is genuinely shorter than the session takes — the calendar
  // under-reads it by design of the open step (Q-259). The other three have no such excuse and must
  // add up exactly.
  for (const [terrain, mins] of [
    ['hill_short', SHORT_HILL_SESSION_MIN],
    ['treadmill', TREADMILL_SESSION_MIN],
    ['flat', FLAT_SESSION_MIN],
  ] as const) {
    const total = expandSession(terrain).reduce((a, s) => a + (Number(s.duration_s) || 0), 0);
    assertEquals(total / 60, mins, `${terrain}: expanded to ${total / 60} min, budget says ${mins}`);
  }
});

Deno.test('⛔ THE HARD SESSION STAYS INSIDE THE ASKED MILEAGE ON EVERY TERRAIN', () => {
  // The 2026-07-28 defect, re-run once per option: the hard day is part of the week's mileage, not
  // an extra on top of it. A mile of slack for rounding; the old behaviour was +3.5 every time.
  for (const terrain of ALL) {
    const runs = week(terrain).filter((s) => s.type === 'run');
    const miles = runs.reduce((a, s) => a + s.duration, 0) / PACE;
    assertEquals(miles - 20 <= 1, true, `${terrain}: asked 20, built ${miles}`);
  }
});

// ── 5. The protocol itself ───────────────────────────────────────────────────────────────────────

Deno.test('⛔ NO 40-SECOND REP, ON ANY TERRAIN — Q-260, built and reverted 2026-08-06', () => {
  // Fleckenstein 2025 (PMID 39835194), work-matched, 1:1 recovery, 12 highly trained runners:
  // 4 × 3 min gave 327.9 s above 90% VO2max against 24 × 30 s at 201.3 s, and felt no different.
  // The short session reads harder on heart rate and delivers less of the stimulus.
  for (const terrain of ALL) {
    for (const s of expandSession(terrain).filter((x) => x.kind === 'work')) {
      assertEquals(
        Number(s.duration_s) >= 60, true,
        `${terrain} emitted a ${s.duration_s}s rep — the moderate band starts above 30s and 40s is banned`,
      );
    }
  }
});

Deno.test('⚠️ THE TREADMILL NEVER WALKS — there is nothing to walk down', () => {
  // The walk/jog rule rations ECCENTRIC load, and a treadmill recovery has none: the belt drops to
  // easy, there is no descent. So it is always jogged regardless of where the session landed in the
  // week, and the labels must not talk about a hill or a way down.
  const steps = expandSession('treadmill');
  for (const s of steps.filter((x) => x.kind === 'recovery')) {
    assertEquals(/jog down|walk down/i.test(String(s.label)), false,
      'a treadmill recovery must not be labelled as a descent');
    assertEquals(s.pace_sec_per_mi != null, true, 'the treadmill recovery is a paced easy jog');
  }
  for (const s of steps.filter((x) => x.kind === 'work')) {
    assertEquals(/incline/i.test(String(s.label)), true, 'the treadmill rep must say incline, not grade');
  }
});

// ── 6. The flat option's tighter clearance ───────────────────────────────────────────────────────

Deno.test('⛔ FLAT PREFERS 48h FROM HEAVY LEGS — the other three keep the matrix\'s 24h', () => {
  // Flat is the one terrain that keeps the impact transient, so it is the one that asks for the
  // eccentric cell rather than the quality cell. ⚠️ The hill and treadmill options must NOT inherit
  // this: uphill removes the transient, which is the whole argument of doctrine §2.
  // ⚠️ SATURDAY LONG RUN + FRIDAY HARD DAY IS ONE OF THE 8 SHAPES THAT HAS ROOM, and the choice of
  // week is the whole test. On a shape with no room (Saturday + Tuesday, say) flat and hill place
  // identically and correctly — asserting 48h there would be asserting that a preference is a floor.
  const clearanceOf = (terrain?: string): number => {
    const p = composeStrengthPrimaryPlan({
      durationWeeks: 12,
      oneRepMaxes: { bench: 155, squat: 205, deadlift: 245, overheadPress: 105 },
      enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 20,
      longRunDay: 'saturday', easyPaceMinPerMile: PACE, liftingDays: 4,
      hardDay: { day: 'friday', discipline: 'run', ...(terrain ? { terrain } : {}) },
    } as never);
    // The stamp is not on the plan, so measure what it BUYS: the gap the solver actually left.
    const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const gap = (a: string, b: string) => {
      const r = Math.abs(DAYS.indexOf(a.toLowerCase()) - DAYS.indexOf(b.toLowerCase()));
      return Math.min(r, 7 - r) * 24;
    };
    const lowers = (p.sessions_by_week['1'] as any[])
      .filter((s) => s.type === 'strength' && /Squat|Deadlift/.test(String(s.name)));
    return Math.min(...lowers.map((l: any) => gap(String(l.day), 'friday')));
  };
  // On this week shape the flat option buys real separation the hill option does not get.
  assertEquals(clearanceOf('flat') >= 48, true, 'flat did not get its 48h on a week that can give it');
  assertEquals(clearanceOf('hill_3min') < 48, true,
    'the hill baseline also reached 48h here — this week no longer demonstrates the preference');
  assertEquals(clearanceOf('hill_3min') >= 24, true, 'the hill lost its matrix clearance');
});

Deno.test('⛔ THE HARD SESSION IS NEVER SILENTLY DROPPED — every legal week still builds one', () => {
  // The tighter clearance makes some weeks unsatisfiable. The rule is that they DEGRADE AND REPORT,
  // never that the session disappears. Swept across every legal shape: both long-run days × every
  // other day as the hard day × 3 and 4 lifting days.
  const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  for (const liftingDays of [3, 4]) {
    for (const longRunDay of ['saturday', 'sunday']) {
      for (const day of DAYS) {
        if (day === longRunDay) continue;
        const p = composeStrengthPrimaryPlan({
          durationWeeks: 12,
          oneRepMaxes: { bench: 155, squat: 205, deadlift: 245, overheadPress: 105 },
          enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 20,
          longRunDay, easyPaceMinPerMile: PACE, liftingDays,
          hardDay: { day, discipline: 'run', terrain: 'flat' },
        } as never);
        const hard = (p.sessions_by_week['1'] as any[])
          .find((s) => s.type === 'run' && /Flat Intervals/.test(String(s.name)));
        assertEquals(
          !!hard, true,
          `flat hard session vanished at ${liftingDays} lifting days, long run ${longRunDay}, hard ${day}`,
        );
      }
    }
  }
});

Deno.test('⛔ THE PREFERENCE NEVER BREACHES ANYTHING — least of all the long run', () => {
  // ⛔ THIS IS THE WHOLE REASON THE HARD-CONSTRAINT VERSION WAS THROWN AWAY. Forcing 48h produced a
  // breach in 8 of 12 week shapes, and 11 of the 16 breaches were against the LONG RUN — the solver
  // bought the flat run its two days by putting a squat next to the long run, which is the same
  // eccentric leg damage one session over. Scored below `breachPenalty`, it is structurally unable
  // to do that. ⚠️ If this test ever fails, someone moved the term up the score vector.
  const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  for (const liftingDays of [3, 4]) {
    for (const longRunDay of ['saturday', 'sunday']) {
      for (const day of DAYS) {
        if (day === longRunDay) continue;
        const p = composeStrengthPrimaryPlan({
          durationWeeks: 12,
          oneRepMaxes: { bench: 155, squat: 205, deadlift: 245, overheadPress: 105 },
          enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 20,
          longRunDay, easyPaceMinPerMile: PACE, liftingDays,
          hardDay: { day, discipline: 'run', terrain: 'flat' },
        } as never);
        const breaches = ((p as any).placement_compromises ?? [])
          .filter((c: any) => c.kind === 'breach');
        assertEquals(
          breaches.length, 0,
          `flat manufactured a breach at ${liftingDays} days, long run ${longRunDay}, hard ${day}: `
            + breaches.map((b: any) => b.text).join(' | '),
        );
      }
    }
  }
});

Deno.test('⛔ THE MATRIX FLOOR SURVIVES THE TRADE — heavy legs stay 48h apart', () => {
  // The preference outranks `spreadPenalty`, which is what makes it do anything at all. That term is
  // itself only a preference — the 48h between two heavy leg days is the MATRIX's rule
  // (`lower_body_strength × lower_body_strength`), and trading preference for preference must never
  // reach it. ⚠️ This is the pin that says the trade stayed on the right side of the law.
  const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const gapH = (a: string, b: string) => {
    const r = Math.abs(DAYS.indexOf(a.toLowerCase()) - DAYS.indexOf(b.toLowerCase()));
    return Math.min(r, 7 - r) * 24;
  };
  for (const longRunDay of ['saturday', 'sunday']) {
    for (const day of DAYS) {
      if (day === longRunDay) continue;
      const p = composeStrengthPrimaryPlan({
        durationWeeks: 12,
        oneRepMaxes: { bench: 155, squat: 205, deadlift: 245, overheadPress: 105 },
        enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 20,
        longRunDay, easyPaceMinPerMile: PACE, liftingDays: 4,
        hardDay: { day, discipline: 'run', terrain: 'flat' },
      } as never);
      const lowers = (p.sessions_by_week['1'] as any[])
        .filter((s) => s.type === 'strength' && /Squat|Deadlift/.test(String(s.name)));
      for (let i = 0; i < lowers.length; i++) {
        for (let j = i + 1; j < lowers.length; j++) {
          assertEquals(
            gapH(String(lowers[i].day), String(lowers[j].day)) >= 48, true,
            `heavy days collapsed to buy the preference (long run ${longRunDay}, hard ${day})`,
          );
        }
      }
    }
  }
});

Deno.test('⚠️ TAKEN WHEN THE WEEK HAS ROOM, DECLINED SILENTLY WHEN IT DOES NOT', () => {
  // Both halves matter. A preference that never binds is not a term (§0e); one that always binds is
  // a constraint wearing a preference's name.
  const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const gapH = (a: string, b: string) => {
    const r = Math.abs(DAYS.indexOf(a.toLowerCase()) - DAYS.indexOf(b.toLowerCase()));
    return Math.min(r, 7 - r) * 24;
  };
  const closest = (terrain: string, longRunDay: string, day: string, liftingDays: number) => {
    const p = composeStrengthPrimaryPlan({
      durationWeeks: 12,
      oneRepMaxes: { bench: 155, squat: 205, deadlift: 245, overheadPress: 105 },
      enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 20,
      longRunDay, easyPaceMinPerMile: PACE, liftingDays,
      hardDay: { day, discipline: 'run', terrain },
    } as never);
    const lowers = (p.sessions_by_week['1'] as any[])
      .filter((s) => s.type === 'strength' && /Squat|Deadlift/.test(String(s.name)));
    return Math.min(...lowers.map((l: any) => gapH(String(l.day), day)));
  };
  let taken = 0, declined = 0, worse = 0;
  for (const liftingDays of [3, 4]) {
    for (const longRunDay of ['saturday', 'sunday']) {
      for (const day of DAYS) {
        if (day === longRunDay) continue;
        const hill = closest('hill_3min', longRunDay, day, liftingDays);
        const flat = closest('flat', longRunDay, day, liftingDays);
        if (flat > hill) taken++;
        else if (flat < hill) worse++;
        else declined++;
      }
    }
  }
  // Measured 2026-08-06 across all 24 legal shapes: 8 taken, 16 declined, 0 worse.
  assertEquals(worse, 0, 'the preference made a week WORSE than the hill baseline');
  assertEquals(taken > 0, true, 'the preference never binds — it is not a term (§0e)');
  assertEquals(declined > 0, true, 'the preference always binds — that is a constraint, not a preference');
});

Deno.test('the outdoor hills still obey the descent rule, and the labels still say hill', () => {
  for (const terrain of [undefined, 'hill_short'] as const) {
    const steps = expandSession(terrain);
    for (const s of steps.filter((x) => x.kind === 'work')) {
      assertEquals(/grade/i.test(String(s.label)), true, 'an outdoor rep must name the grade');
    }
    for (const s of steps.filter((x) => x.kind === 'recovery')) {
      assertEquals(/jog|walk|lap/i.test(String(s.label)), true, 'the descent must be prescribed');
    }
  }
});

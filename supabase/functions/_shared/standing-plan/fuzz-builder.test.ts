// ============================================================================
// THE FUZZ HARNESS — every stupid plan a Strong Focus athlete could ask for, and the proof that
// something always builds.
//
// ⛔⛔ WHAT THIS RUNS AGAINST. The REAL composition path, assembled here in the same order
// `generate-strength-plan/index.ts` assembles it: sport mix → `assignSports` → which sport holds the
// long slot → `chooseDayMap` → `endurancePins` → `buildStandingPlanRow`. Nothing is stubbed and no
// shortcut is taken past the day map, because the day map is where half the answers are decided.
//
// ⛔ NO PROD, NO BROWSER, NO WRITES. `buildStandingPlanRow` returns a plain object; nothing here
// touches Supabase, and no plan row is written anywhere.
//
// ⚠️ TWO ENGINES, TWO SWEEPS, AND THEY ARE NOT INTERCHANGEABLE. Placement lives in the COMPOSER
// (`compose.ts`, PlanSession rows on weekdays); soundness lives in the WEEK-MODEL
// (`week-model/resolve.ts`, Units carrying debts). There is no adapter between the two
// representations — `solver-adapter.ts` bridges the old slot solver, not composed sessions — so
// criteria 1-4 are swept over the composer and criterion 5 over the week-model, using the same
// inputs. Any claim that one sweep proves the other would be false.
//
// ⚠️ DETERMINISTIC. No `Date.now`, no `Math.random`. The "random" interior cases come from a fixed
// seed list through a small xorshift; the same run produces the same cases forever.
//
// ⛔ THIS IS A PERMANENT REGRESSION SUITE, not a one-off sweep (Michael, 2026-08-25). It found two
// real defects on its first run and both are fixed; it stays so the next change to the day map, the
// relocator or the sport assigner has to survive 16,832 shapes rather than the dozen anybody would
// think to write by hand.
//
// ⚠️ IT TAKES ~35s. That is the price of the coverage and it is deliberate — see FUZZ 5 for what
// was sampled rather than swept, and why the full cross product is not run.
//
// Run: deno test --no-check --allow-read supabase/functions/_shared/standing-plan/fuzz-builder.test.ts
// ============================================================================

import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  FRAMES,
  assignSports,
  buildStandingPlanRow,
  chooseDayMap,
  defaultCompetitionLifts,
  frameFixedDaysFor,
  isLongSlot,
  type PlanSession,
  type Weekday,
} from './index.ts';
import { buildUnits, type Session } from '../week-model/model.ts';
import { resolveAroundPins, unmetNeeds, recoveryDaysOf } from '../week-model/resolve.ts';

const DAYS: Weekday[] = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];

const BASELINES = {
  learned_fitness: {
    run_threshold_pace_sec_per_km: { value: 261, confidence: 'high', sample_count: 10 },
    run_easy_pace_sec_per_km: { value: 340, confidence: 'high', sample_count: 20 },
  },
  performance_numbers: {},
};
const BASE = {
  frame: 'strength_5k' as const,
  competitionLifts: defaultCompetitionLifts(),
  seed1RMs: { bench: 200, squat: 265, deadlift: 340, overheadPress: 125 },
  baselines: BASELINES,
  equipment: ['Commercial gym'],
  roundTo: 5,
};

/** How many distinct weekdays the frame puts lifting on. Read off `FRAMES`, never restated. */
const LIFT_DAY_COUNT = frameFixedDaysFor('strength_5k').lifting.length;

// ── THE CASE ─────────────────────────────────────────────────────────────────────────────────────

type Case = {
  runs: number;
  rides: number;
  swimDays: number;
  swimEasy: number;
  /** null = the athlete named no day for this slot; the engine places it. */
  longDay: Weekday | null;
  hardDays: Array<Weekday | null>;
  blocked: Weekday[];
  taper: boolean;
};

const describe = (c: Case): string => JSON.stringify({
  runs: c.runs, rides: c.rides, swimDays: c.swimDays, swimEasy: c.swimEasy,
  long: c.longDay, hard: c.hardDays, blocked: c.blocked, taper: c.taper,
});

/**
 * ⛔ THE REAL ASSEMBLY, COPIED FROM `generate-strength-plan/index.ts` IN ITS OWN ORDER. The long
 * slot's sport is DERIVED from the mix rather than chosen here, because that derivation is what
 * decides which of two long pins is servable — and getting it wrong would make the whole sweep
 * measure a path no athlete travels.
 */
function build(c: Case) {
  const mix = { runs: c.runs, rides: c.rides, swimDays: c.swimDays };
  const longSlotSport = (() => {
    const a = assignSports(FRAMES.strength_5k.columns.standard, mix);
    const long = Object.entries(a.byKey).find(([k]) => {
      const [d, i] = k.split(':').map(Number);
      const slot = FRAMES.strength_5k.columns.standard.find((x) => x.day === d)?.endurance[i];
      return slot ? isLongSlot(slot) : false;
    });
    return long?.[1]?.sport ?? 'run';
  })();

  const dayMap = chooseDayMap('strength_5k', {
    longRunDay: longSlotSport === 'ride' ? null : c.longDay,
    longRideDay: longSlotSport === 'ride' ? c.longDay : null,
    longSlotSport,
    hardDays: c.hardDays,
    unavailableDays: c.blocked,
  });

  const row = buildStandingPlanRow({
    compose: {
      ...BASE,
      endurancePins: { long: c.longDay, hard: c.hardDays },
      unavailableDays: c.blocked,
      sportMix: mix,
      swimEasySessions: c.swimEasy,
    },
    weeks: 2,
    taperWeeks: c.taper ? [2] : [],
    dayMap,
  });
  return { row, dayMap, longSlotSport };
}

// ── THE FIVE CRITERIA ────────────────────────────────────────────────────────────────────────────

/**
 * ⛔⛔ CRITERION 2 IS TWO RULES, NOT ONE, AND CONFLATING THEM MADE THE FIRST RUN REPORT 7,168
 * "FAILURES" THAT WERE THE ENGINE OBEYING ITS OWN RULING.
 *
 *   · **Endurance on a blocked day is always a defect.** It is movable by definition (Michael,
 *     2026-08-25 morning), so there is no arrangement in which it may sit on a day off.
 *   · **Lifting or plyo on a blocked day is a stated TRADE-OFF, not a defect** — but only when the
 *     day map says so. The frame's order is fixed and only a whole-week ROTATION can move it, and
 *     the arithmetic below means some weeks have no rotation that clears every day off. The ruling
 *     for that case is warn-never-block. So the test is not "did lifting land on a day off" but
 *     "did lifting land on a day off IN SILENCE".
 *
 * ⚠️ SILENT IS THE BUG. `dayMap.honoured.unavailableDays === false` must come with a compromise
 * naming the day; a week that puts a barbell on a day the athlete cannot train and says nothing is
 * the failure this criterion is really looking for.
 */
/** Counts of trade-offs that are expected rather than wrong — reported, never asserted on. */
const tradeOffs = { liftOnBlockedWithNote: 0 };

/** Returns a list of failures, empty when the case passes. Never throws for a normal failure. */
function checkComposer(c: Case): string[] {
  const fails: string[] = [];
  let built: ReturnType<typeof build>;
  try {
    built = build(c);
  } catch (e) {
    // ⛔ CRITERION 1, HARDEST FORM: a throw is a failure, not an outcome.
    return [`THREW: ${(e as Error)?.message ?? e}`];
  }
  const weeks = Object.entries(built.row.sessions_by_week);
  if (weeks.length === 0) return ['no weeks returned at all'];

  for (const [wk, sessions] of weeks) {
    const ss = sessions as PlanSession[];
    // 1 ── A WEEK IS RETURNED, NEVER EMPTY.
    if (ss.length === 0) { fails.push(`week ${wk} is empty`); continue; }

    // 2 ── NO SESSION ON A BLOCKED DAY — split by what the engine is allowed to move. See above.
    const isEndurance = (s: PlanSession) =>
      s.type === 'run' || s.type === 'ride' || s.type === 'swim';
    const onBlocked = ss.filter((s) => c.blocked.includes(s.day as Weekday));
    const enduranceOnBlocked = onBlocked.filter(isEndurance);
    const frameOnBlocked = onBlocked.filter((s) => !isEndurance(s));
    if (enduranceOnBlocked.length > 0) {
      fails.push(`week ${wk}: ENDURANCE on a blocked day — `
        + enduranceOnBlocked.map((s) => `${s.day}/${s.name}`).join(', '));
    }
    if (frameOnBlocked.length > 0) {
      const named = [...new Set(frameOnBlocked.map((s) => s.day))];
      const spoken = named.every((d) =>
        built.dayMap.compromises.some((x) => x.text.includes(d)));
      if (!spoken || built.dayMap.honoured.unavailableDays) {
        // ⚠️ SUB-CLASSIFIED, because "something frame-fixed is unreported" turned out to be two
        // different defects wearing one label and the counts hid that.
        const plyoOnly = frameOnBlocked.every((s) => (s.tags ?? []).includes('plyo'));
        const kind = plyoOnly
          ? (built.dayMap.honoured.unavailableDays
            ? 'PLYO on a blocked day, rotation says HONOURED, no note at all'
            : 'PLYO on a blocked day, note names only the lifting days')
          : (built.dayMap.honoured.unavailableDays
            ? 'LIFT on a blocked day, rotation says HONOURED, no note at all'
            : 'LIFT+PLYO on a blocked day, note names the lifts but not the plyo day');
        fails.push(`week ${wk}: ${kind} — `
          + `${frameOnBlocked.map((s) => `${s.day}/${s.name}`).join(', ')} · `
          + `honoured=${built.dayMap.honoured.unavailableDays} · `
          + `notes=[${built.dayMap.compromises.map((x) => x.text).join(' | ')}]`);
      } else if (wk === '2') {
        tradeOffs.liftOnBlockedWithNote++;
      }
    }

    // 3 ── EVERY CLUB/PINNED DAY HONOURED.
    //    ⚠️ EXCEPT WHEN THE ATHLETE ALSO BLOCKED IT. That contradiction is resolved in the
    //    athlete's other favour by the 2026-08-25 ruling: the blocked day wins and the session
    //    moves. Criterion 2 already covers where it may not go.
    const isEnd = isEndurance;
    if (c.longDay && !c.blocked.includes(c.longDay)) {
      const long = ss.find((s) => isEnd(s) && /long/i.test(s.name));
      if (long && long.day !== c.longDay) {
        fails.push(`week ${wk}: long pinned ${c.longDay}, landed ${long.day}`);
      }
    }
    for (const h of c.hardDays) {
      if (!h || c.blocked.includes(h)) continue;
      const anyOn = ss.some((s) => isEnd(s) && s.day === h);
      if (!anyOn) fails.push(`week ${wk}: hard pinned ${h}, no endurance session there`);
    }

    // 4 ── EXACTLY THE FRAME'S LIFT-DAY COUNT.
    const liftDays = new Set(
      ss.filter((s) => s.type === 'strength' && !(s.tags ?? []).includes('plyo')).map((s) => s.day),
    );
    if (liftDays.size !== LIFT_DAY_COUNT) {
      fails.push(`week ${wk}: ${liftDays.size} lift days, expected ${LIFT_DAY_COUNT} `
        + `[${[...liftDays].join(',')}]`);
    }
  }
  return fails;
}

/**
 * ⛔ CRITERION 5, ON THE ENGINE THAT OWNS IT. The composer emits no violations; `week-model` does.
 * The check is a CONSISTENCY one rather than a judgement: silence is only allowed when the placed
 * week genuinely has no unmet clearance and meets the recovery floor. Asserting "the week is
 * unsound" any other way would mean this file holding a second opinion about the law.
 */
function checkViolations(c: Case): string[] {
  const fails: string[] = [];
  const sessions: Session[] = [
    { id: 'sq', label: 'Back Squat', load: 'heavy_lower', minutes: 60 },
    { id: 'bp', label: 'Bench Press', load: 'upper', minutes: 60 },
    { id: 'dl', label: 'Deadlift', load: 'heavy_lower', minutes: 60 },
  ];
  const pins: Record<string, number> = {};
  const idx = (d: Weekday) => DAYS.indexOf(d);
  if (c.runs > 0 || c.rides > 0) {
    const sport = c.rides > c.runs ? 'bike' : 'run';
    sessions.push({ id: 'lg', label: sport === 'run' ? 'Long Run' : 'Long Ride', load: sport === 'run' ? 'long_run' : 'long_ride', sport, minutes: 90 });
    if (c.longDay) pins.lg = idx(c.longDay);
  }
  c.hardDays.forEach((h, i) => {
    const sport = i === 0 && c.rides > 0 ? 'bike' : 'run';
    sessions.push({ id: `h${i}`, label: `Hard ${sport}`, load: 'hard_cardio', sport, minutes: 45 });
    if (h) pins[`h${i}`] = idx(h);
  });
  for (let i = 0; i < Math.max(0, c.runs - 1); i++) {
    sessions.push({ id: `er${i}`, label: 'Easy Run', load: 'easy', sport: 'run', minutes: 45 });
  }
  for (let i = 0; i < Math.max(0, c.rides - 1); i++) {
    sessions.push({ id: `eb${i}`, label: 'Easy Ride', load: 'easy', sport: 'bike', minutes: 60 });
  }
  for (let i = 0; i < c.swimDays; i++) {
    sessions.push({ id: `sw${i}`, label: 'Swim', load: 'easy', sport: 'swim', minutes: 60 });
  }

  let w: ReturnType<typeof resolveAroundPins>;
  try {
    w = resolveAroundPins(buildUnits(sessions, pins), {
      minRestDays: 1,
      unavailableDays: c.blocked.map(idx),
    });
  } catch (e) {
    return [`week-model THREW: ${(e as Error)?.message ?? e}`];
  }

  // 1 ── A WEEK CAME BACK, WITH EVERY UNIT IN IT.
  if (w.placements.length !== buildUnits(sessions, pins).length) {
    fails.push(`week-model dropped units: ${w.placements.length} placed of `
      + `${buildUnits(sessions, pins).length}`);
  }
  // 2 ── NOTHING ON A BLOCKED DAY.
  for (const p of w.placements) {
    if (c.blocked.map(idx).includes(p.day)) {
      fails.push(`week-model put ${p.unit.label} on blocked ${DAYS[p.day]}`);
    }
  }
  // 5 ── SILENCE ONLY WHEN CLEAN.
  const unmet = unmetNeeds(w.placements);
  const recovery = recoveryDaysOf(w.placements).length;
  const unsound = unmet.length > 0 || recovery < 1;
  if (unsound && w.violations.length === 0) {
    fails.push(`unsound week reported NO violation — ${unmet.length} unmet, ${recovery} recovery days`);
  }
  if (!unsound && w.violations.some((v) => v.tier === 'breach')) {
    fails.push('a clean week reported a BREACH');
  }
  return fails;
}

// ── THE SPACE ────────────────────────────────────────────────────────────────────────────────────

/** Every subset of the seven weekdays with 0-6 members. ⚠️ 7 is out of scope — see the ruling. */
function blockedSubsets(maxSize: number): Weekday[][] {
  const out: Weekday[][] = [];
  for (let mask = 0; mask < 128; mask++) {
    const set = DAYS.filter((_, i) => (mask >> i) & 1);
    if (set.length <= maxSize) out.push(set);
  }
  return out;
}

const MIXES = [
  { runs: 4, rides: 0, label: 'run only' },
  { runs: 0, rides: 4, label: 'ride only' },
  { runs: 3, rides: 2, label: 'run + ride' },
  { runs: 0, rides: 0, label: 'zero endurance' },
];

/** ⛔ FIXED SEEDS. No clock, no `Math.random` — the interior sample is the same set forever. */
const SEEDS = [1, 7, 13, 42, 99, 137, 271, 512, 1009, 2027, 4093, 8191];
function rng(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    return x / 0xffffffff;
  };
}

// ── THE SWEEPS ───────────────────────────────────────────────────────────────────────────────────

/**
 * ⛔ FAILURES ARE GROUPED BY CLASS, NOT LISTED. The first run printed 25 samples of one defect and
 * hid the others behind them — which is the same "score that lies" shape in a test report: a number
 * that looks like coverage and is one bug repeated. Each class prints its count and ONE exact input.
 */
const classOf = (f: string): string => f
  .replace(/—.*/s, '')
  .replace(/week \d+: /, '')
  .trim();

function report(name: string, cases: Case[], check: (c: Case) => string[]): number {
  const byClass = new Map<string, { n: number; first: string }>();
  let total = 0;
  for (const c of cases) {
    for (const f of check(c)) {
      total++;
      const k = classOf(f);
      const hit = byClass.get(k);
      if (hit) hit.n++;
      else byClass.set(k, { n: 1, first: `${f}\n        input: ${describe(c)}` });
    }
  }
  console.log(`  ${name}: ${cases.length} combinations, ${total} failures in `
    + `${byClass.size} class(es), ${tradeOffs.liftOnBlockedWithNote} stated lift-on-day-off trade-offs`);
  tradeOffs.liftOnBlockedWithNote = 0;
  for (const [k, v] of [...byClass.entries()].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`    ✗ [${v.n}×] ${k}`);
    console.log(`        e.g. ${v.first}`);
  }
  assert(total === 0, `${name}: ${total} failures — see the log above`);
  return cases.length;
}

Deno.test('FUZZ 1 — EXHAUSTIVE: every blocked-day subset (0-6) × every mix × every long-pin day', () => {
  /**
   * ⛔ THE FULL BLOCKED-DAY LATTICE. 127 subsets of size 0-6, against every sport mix and every day
   * the long session could be pinned to, INCLUDING days inside the blocked set (the contradiction).
   */
  const cases: Case[] = [];
  for (const m of MIXES) {
    for (const blocked of blockedSubsets(6)) {
      for (const longDay of [null, ...DAYS]) {
        cases.push({
          runs: m.runs, rides: m.rides, swimDays: 0, swimEasy: 0,
          longDay, hardDays: [], blocked, taper: false,
        });
      }
    }
  }
  console.log('EXHAUSTIVE over: blocked-day subsets 0-6 × 4 mixes × 8 long-pin values');
  report('blocked × mix × long', cases, checkComposer);
});

Deno.test('FUZZ 2 — EXHAUSTIVE: every (long, hard, hard) day triple, including all-on-one-day', () => {
  /**
   * ⛔ 8 × 8 × 8 = 512 PIN TRIPLES — every day for each of the three pinnable slots plus "unset",
   * so all-on-Monday, all-adjacent and every scattered arrangement are all in here by construction
   * rather than by being remembered.
   */
  const BLOCKED_SHAPES: Weekday[][] = [
    [],
    ['Friday'],
    ['Monday'],
    ['Friday', 'Saturday'],
    ['Monday', 'Tuesday', 'Wednesday'],
    ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  ];
  const cases: Case[] = [];
  for (const m of [MIXES[0], MIXES[2]]) {
    for (const blocked of BLOCKED_SHAPES) {
      for (const longDay of [null, ...DAYS]) {
        for (const h0 of [null, ...DAYS]) {
          for (const h1 of [null, ...DAYS]) {
            cases.push({
              runs: m.runs, rides: m.rides, swimDays: 0, swimEasy: 0,
              longDay, hardDays: [h0, h1], blocked, taper: false,
            });
          }
        }
      }
    }
  }
  console.log('EXHAUSTIVE over: 512 pin triples × 6 blocked shapes × 2 mixes');
  report('pin triples', cases, checkComposer);
});

Deno.test('FUZZ 3 — EXHAUSTIVE: hard-session count 0/1/2 × swims × taper × blocked', () => {
  const cases: Case[] = [];
  for (const m of MIXES) {
    for (const hardCount of [0, 1, 2]) {
      for (const swimDays of [0, 1, 2]) {
        for (const swimEasy of [0, 1, 2]) {
          for (const taper of [false, true]) {
            for (const blocked of [[], ['Friday'], ['Wednesday', 'Sunday']] as Weekday[][]) {
              const hardDays: Array<Weekday | null> = [];
              for (let i = 0; i < hardCount; i++) hardDays.push(DAYS[(i * 2 + 1) % 7]);
              cases.push({
                runs: m.runs, rides: m.rides, swimDays, swimEasy,
                longDay: 'Saturday', hardDays, blocked, taper,
              });
            }
          }
        }
      }
    }
  }
  console.log('EXHAUSTIVE over: 4 mixes × hard 0-2 × swimDays 0-2 × swimEasy 0-2 × taper × 3 blocked');
  report('counts × swims × taper', cases, checkComposer);
});

Deno.test('FUZZ 4 — THE DEGENERATE EXTREMES, named one by one', () => {
  /**
   * ⚠️ NAMED EXPLICITLY EVEN THOUGH THE SWEEPS ABOVE CONTAIN MOST OF THEM. A sweep that goes red
   * says "512 pin triples failed"; these say which shape, in words, and they are the shapes Michael
   * called out. When one of these breaks the report writes itself.
   */
  const cases: Case[] = [
    // every pin on Monday
    { runs: 3, rides: 2, swimDays: 0, swimEasy: 0, longDay: 'Monday', hardDays: ['Monday', 'Monday'], blocked: [], taper: false },
    // every pin on Monday, and Monday blocked
    { runs: 3, rides: 2, swimDays: 0, swimEasy: 0, longDay: 'Monday', hardDays: ['Monday', 'Monday'], blocked: ['Monday'], taper: false },
    // all seven days carry something pinned or blocked
    { runs: 4, rides: 0, swimDays: 2, swimEasy: 2, longDay: 'Sunday', hardDays: ['Monday', 'Tuesday'], blocked: ['Wednesday', 'Thursday', 'Friday', 'Saturday'], taper: false },
    // 6 blocked days + 2 clubs (the pins land inside the block)
    { runs: 3, rides: 2, swimDays: 0, swimEasy: 0, longDay: 'Sunday', hardDays: ['Monday', 'Tuesday'], blocked: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], taper: false },
    // 6 blocked days, everything pinned to the one open day
    { runs: 3, rides: 2, swimDays: 0, swimEasy: 0, longDay: 'Sunday', hardDays: ['Sunday', 'Sunday'], blocked: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], taper: false },
    // zero endurance at all
    { runs: 0, rides: 0, swimDays: 0, swimEasy: 0, longDay: null, hardDays: [], blocked: [], taper: false },
    // zero endurance with days blocked anyway
    { runs: 0, rides: 0, swimDays: 0, swimEasy: 0, longDay: null, hardDays: [], blocked: ['Monday', 'Tuesday', 'Wednesday'], taper: false },
    // adjacent pins
    { runs: 3, rides: 2, swimDays: 0, swimEasy: 0, longDay: 'Saturday', hardDays: ['Sunday', 'Monday'], blocked: [], taper: false },
    // the three-club week from the device test
    { runs: 3, rides: 2, swimDays: 0, swimEasy: 0, longDay: 'Saturday', hardDays: ['Tuesday', 'Thursday'], blocked: ['Friday'], taper: false },
    // long day blocked, hard days clear
    { runs: 3, rides: 2, swimDays: 0, swimEasy: 0, longDay: 'Saturday', hardDays: ['Tuesday', 'Thursday'], blocked: ['Saturday'], taper: false },
    // every pin blocked
    { runs: 3, rides: 2, swimDays: 0, swimEasy: 0, longDay: 'Saturday', hardDays: ['Tuesday', 'Thursday'], blocked: ['Saturday', 'Tuesday', 'Thursday'], taper: false },
    // taper week with everything at once
    { runs: 3, rides: 2, swimDays: 2, swimEasy: 2, longDay: 'Saturday', hardDays: ['Tuesday', 'Thursday'], blocked: ['Friday', 'Monday'], taper: true },
  ];
  console.log('EXHAUSTIVE over: 12 named degenerate shapes');
  report('degenerate extremes', cases, checkComposer);
});

Deno.test('FUZZ 5 — SEEDED RANDOM interior, composer', () => {
  /**
   * ⚠️ SAMPLED, NOT EXHAUSTIVE, AND SAYING SO IS THE POINT. The full cross product (mix × hard count
   * × swims × taper × 512 pin triples × 127 blocked subsets) is roughly 4 million composes; at the
   * measured ~1 ms each that is over an hour and nobody would run it. The boundaries above are
   * exhaustive; this fills the interior from a FIXED seed list so the sample never drifts.
   */
  const cases: Case[] = [];
  for (const seed of SEEDS) {
    const r = rng(seed);
    const pick = <T>(xs: T[]): T => xs[Math.floor(r() * xs.length) % xs.length];
    for (let i = 0; i < 250; i++) {
      const blockedCount = Math.floor(r() * 7);
      const shuffled = [...DAYS].sort(() => r() - 0.5);
      const m = pick(MIXES);
      cases.push({
        runs: m.runs,
        rides: m.rides,
        swimDays: Math.floor(r() * 3),
        swimEasy: Math.floor(r() * 3),
        longDay: pick([null, ...DAYS]),
        hardDays: [pick([null, ...DAYS]), pick([null, ...DAYS])].slice(0, Math.floor(r() * 3)),
        blocked: shuffled.slice(0, blockedCount),
        taper: r() > 0.5,
      });
    }
  }
  console.log(`SAMPLED (fixed seeds ${SEEDS.join(',')}): 250 interior cases per seed`);
  report('seeded interior', cases, checkComposer);
});

Deno.test('FUZZ 6 — the WEEK-MODEL sweep: violations reported where the week is unsound', () => {
  /**
   * ⛔ CRITERION 5 LIVES HERE AND NOWHERE ELSE — see this file's header for why it cannot ride along
   * with the composer sweep. Criteria 1 and 2 are re-checked on this engine too, because "the
   * composer never puts a session on a blocked day" says nothing about whether the SOLVER does.
   */
  const cases: Case[] = [];
  for (const m of MIXES) {
    for (const blocked of blockedSubsets(6)) {
      for (const longDay of [null, 'Saturday', 'Monday'] as Array<Weekday | null>) {
        cases.push({
          runs: m.runs, rides: m.rides, swimDays: 0, swimEasy: 0,
          longDay, hardDays: ['Tuesday', 'Thursday'], blocked, taper: false,
        });
      }
    }
  }
  for (const seed of SEEDS) {
    const r = rng(seed);
    const pick = <T>(xs: T[]): T => xs[Math.floor(r() * xs.length) % xs.length];
    for (let i = 0; i < 120; i++) {
      const m = pick(MIXES);
      const shuffled = [...DAYS].sort(() => r() - 0.5);
      cases.push({
        runs: m.runs, rides: m.rides,
        swimDays: Math.floor(r() * 3), swimEasy: 0,
        longDay: pick([null, ...DAYS]),
        hardDays: [pick([null, ...DAYS]), pick([null, ...DAYS])].slice(0, Math.floor(r() * 3)),
        blocked: shuffled.slice(0, Math.floor(r() * 7)),
        taper: false,
      });
    }
  }
  console.log('EXHAUSTIVE over blocked subsets 0-6 × 4 mixes × 3 long values, plus seeded interior');
  report('week-model soundness', cases, checkViolations);
});

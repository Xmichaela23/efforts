// ============================================================================
// THE ANSWERS SWEEP — every answer the plan builder offers, on all three programmes, and the proof
// that the built week carries it.
//
// ⛔ WHAT IT ASKS. Not "is the week sound" (`fuzz-builder.test.ts` asks that, on `strength_5k`), but
// "did the athlete get what they tapped": the long day, the hard days, the days off, run or ride
// per row, the workout picked for a hard row, the length picked for an easy or long row, six or
// seven rides, test week or current numbers, and each lift pick.
//
// ⛔ WHAT IT RUNS AGAINST. The same assembly `generate-strength-plan/index.ts` performs, in its own
// order: the mix → `fenceMixToFrame` → `assignSports` → which sport holds the long slot →
// `chooseDayMap` → the pins → `buildStandingPlanRow`. No Supabase, no writes.
//
// ⚠️ NOT THE FULL CROSS PRODUCT, AND IT SAYS SO. Days × days off × sport interact, so they are
// crossed in full. A workout pick, a length pick and a lift pick do not move a session's day, so
// each is swept one at a time over every option. Michael, 2026-09-20: warn, never block — a week
// the athlete asked for is built as asked, and what it cost is SAID.
//
// ⚠️ DETERMINISTIC. No `Date.now`, no `Math.random`.
//
// Run: deno test --no-check --allow-read --allow-env supabase/functions/_shared/standing-plan/builder-answers-sweep.test.ts
// ============================================================================

import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  FRAMES,
  assignSports,
  buildStandingPlanRow,
  chooseDayMap,
  defaultCompetitionLifts,
  fenceMixToFrame,
  isHardSlot,
  isLongSlot,
  flattenViadaPicks,
  normalizeViadaPrefs,
  pickOptions,
  frameMuscleForPick,
  frameAdmitsForPick,
  picksForFrame,
  type FrameId,
  type PlanSession,
  type Weekday,
} from './index.ts';
import { slotVariantOptions } from '../../../../src/lib/hard-slot-choices.ts';
import { slotLengthOptions } from '../../../../src/lib/standing-plan-week-bounds.ts';
import { frameSlots, forcedSportFor } from '../../../../src/lib/standing-plan-week-copy.ts';

const DAYS: Weekday[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const FRAME_IDS: FrameId[] = ['strength_5k', 'all_rounder', 'cycling_base'];

const BASELINES = {
  learned_fitness: {
    run_threshold_pace_sec_per_km: { value: 261, confidence: 'high', sample_count: 10 },
    run_easy_pace_sec_per_km: { value: 340, confidence: 'high', sample_count: 20 },
  },
  performance_numbers: { ftp: 250 },
};
const wn = (lift: 'bench' | 'squat' | 'deadlift' | 'overheadPress', predicted: number) => ({
  lift, predicted1RM: predicted, workingNumber: Math.round(predicted * 0.96),
  measured: { weight: Math.round(predicted * 0.85), reps: 5 }, cite: 'sweep fixture',
});
const WORKING = {
  bench: wn('bench', 200), squat: wn('squat', 265),
  deadlift: wn('deadlift', 340), overheadPress: wn('overheadPress', 125),
};
const GYM = ['Commercial gym'];
const HOME = [
  'Barbell + plates', 'Dumbbells', 'Squat rack / Power cage', 'Bench (flat/adjustable)',
  'Pull-up bar', 'Resistance bands',
];

// ── THE FRAME'S SLOTS ────────────────────────────────────────────────────────────────────────────

type Slot = { key: string; family: string; role: 'long' | 'hard' | 'easy' };

/** The frame's endurance slots in emit order, less the one a six-ride week drops. */
function slotsOf(frame: FrameId, rideCount: number | null): Slot[] {
  const drop = FRAMES[frame].fewerRidesDropsSlot;
  const out: Slot[] = [];
  for (const d of FRAMES[frame].columns.standard) {
    d.endurance.forEach((s, i) => {
      if (drop && rideCount === drop.rideCount && d.day === drop.day && i === drop.index) return;
      out.push({
        key: `${d.day}:${i}`,
        family: String(s.family),
        role: isLongSlot(s) ? 'long' : isHardSlot(s) ? 'hard' : 'easy',
      });
    });
  }
  return out;
}

/** The sports the builder offers on a slot: one when the page fixes it, two when it does not. */
function sportsOffered(frame: FrameId, slot: Slot): Array<'run' | 'ride'> {
  if (frame === 'strength_5k') return ['run'];
  if (frame === 'cycling_base') return ['ride'];
  const row = frameSlots(frame).find((r) => r.frameKey === slot.key);
  const forced = row ? forcedSportFor(row.key, frame) : null;
  if (forced) return [forced];
  return slot.family.startsWith('ride_') ? ['ride'] : ['run', 'ride'];
}

// ── THE CASE AND THE BUILD ───────────────────────────────────────────────────────────────────────

type Case = {
  frame: FrameId;
  sports: Record<string, 'run' | 'ride'>;
  archetypes?: Record<string, string>;
  minutes?: Record<string, number>;
  rideCount?: number | null;
  longDay: Weekday | null;
  hardDays: Array<Weekday | null>;
  blocked: Weekday[];
  skipTest?: boolean;
  slotPicks?: Record<string, string> | null;
  /** The flattened picks — the only route the core pick has to the floor, as on the server. */
  accessoryPicks?: string[] | null;
  equipment?: string[];
  weeks?: number;
};

const describe = (c: Case): string => JSON.stringify({
  frame: c.frame, sports: c.sports, arch: c.archetypes, min: c.minutes, rides: c.rideCount,
  long: c.longDay, hard: c.hardDays, off: c.blocked, skip: c.skipTest,
});

function build(c: Case) {
  const runs = Object.values(c.sports).filter((s) => s === 'run').length;
  const rides = Object.values(c.sports).filter((s) => s === 'ride').length;
  const mix = fenceMixToFrame(c.frame, {
    runs, rides, swimDays: 0,
    rideCount: c.rideCount ?? null,
    slots: c.sports,
    archetypes: c.archetypes ?? null,
    minutes: c.minutes ?? null,
  });
  const longSlotSport = (() => {
    const a = assignSports(FRAMES[c.frame].columns.standard, mix);
    const long = Object.entries(a.byKey).find(([k]) => {
      const [d, i] = k.split(':').map(Number);
      const slot = FRAMES[c.frame].columns.standard.find((x) => x.day === d)?.endurance[i];
      return slot ? isLongSlot(slot) : false;
    });
    return (long?.[1]?.sport ?? 'run') as 'run' | 'ride';
  })();
  const dayMap = chooseDayMap(c.frame, {
    longRunDay: longSlotSport === 'ride' ? null : c.longDay,
    longRideDay: longSlotSport === 'ride' ? c.longDay : null,
    longSlotSport,
    hardDays: c.hardDays,
    unavailableDays: c.blocked,
  });
  const row = buildStandingPlanRow({
    compose: {
      frame: c.frame,
      competitionLifts: defaultCompetitionLifts(),
      seed1RMs: { bench: 200, squat: 265, deadlift: 340, overheadPress: 125 },
      workingNumbers: WORKING,
      skipTestWeek: c.skipTest === true,
      baselines: BASELINES,
      equipment: c.equipment ?? GYM,
      roundTo: 5,
      endurancePins: { long: c.longDay, hard: c.hardDays },
      ...(c.blocked.length > 0 ? { unavailableDays: c.blocked } : {}),
      ...(c.slotPicks ? { slotPicks: c.slotPicks } : {}),
      ...(c.accessoryPicks && c.accessoryPicks.length > 0 ? { accessoryPicks: c.accessoryPicks } : {}),
      sportMix: mix,
    } as never,
    weeks: c.weeks ?? 2,
    taperWeeks: [],
    dayMap,
  });
  return { row, dayMap, longSlotSport };
}

// ── THE CHECKS ───────────────────────────────────────────────────────────────────────────────────

const isEndurance = (s: PlanSession) => s.type === 'run' || s.type === 'ride' || s.type === 'swim';
const isAddOn = (s: PlanSession) =>
  (s.tags ?? []).includes('swim_addon') || (s.tags ?? []).includes('advanced_tier');
const tagOf = (s: PlanSession, prefix: string) =>
  (s.tags ?? []).find((t) => t.startsWith(prefix))?.slice(prefix.length) ?? null;

/** True when no pin of the athlete's names this day — what sits there is the programme's own week. */
const pinsNothingOn = (c: Case, day: string) => c.longDay !== day && !c.hardDays.includes(day as Weekday);

/** Every way a built block can fail to carry the athlete's answers. Returns sentences; never throws. */
function check(c: Case, built: ReturnType<typeof build>): string[] {
  const fails: string[] = [];
  const spoken = [
    ...(built.row.placement_compromises ?? []).map((x) => x.text),
    ...built.row.notes.map((n) => n.text),
  ];
  const namesDay = (d: string) => spoken.some((t) => t.includes(d));
  const slots = slotsOf(c.frame, c.rideCount ?? null);
  const hardSlots = slots.filter((s) => s.role === 'hard');

  for (const [wk, ss] of Object.entries(built.row.sessions_by_week)) {
    if (!ss || ss.length === 0) { fails.push(`week ${wk}: NOTHING BUILT`); continue; }
    const endurance = ss.filter((s) => isEndurance(s) && !isAddOn(s));

    // 1 ── EVERY SLOT THE ATHLETE KEPT IS BUILT, AND NOTHING ELSE.
    if (endurance.length !== slots.length) {
      fails.push(`week ${wk}: COUNT — ${slots.length} endurance rows asked, ${endurance.length} built `
        + `[${endurance.map((s) => `${s.day} ${s.name}`).join(' · ')}]`);
      continue;
    }

    // 2 ── A DAY OFF CARRIES NO RUN AND NO RIDE. Lifting there is a stated trade-off or a defect.
    for (const s of ss) {
      if (!c.blocked.includes(s.day as Weekday)) continue;
      if (isEndurance(s)) fails.push(`week ${wk}: DAY OFF — ${s.type} "${s.name}" built on ${s.day}`);
      else if (!namesDay(s.day)) fails.push(`week ${wk}: DAY OFF IN SILENCE — "${s.name}" on ${s.day}, no note names it`);
    }

    endurance.forEach((s, i) => {
      const slot = slots[i];
      const sport = c.sports[slot.key];

      // 3 ── RUN OR RIDE, AS ANSWERED.
      if (sport && s.type !== sport) {
        fails.push(`week ${wk}: SPORT — row ${slot.key} answered ${sport}, built ${s.type} "${s.name}"`);
      }

      // 4 ── THE PINNED DAY. A pin on a day off cannot be honoured; it must move AND be said.
      const pin = slot.role === 'long'
        ? c.longDay
        : slot.role === 'hard' ? c.hardDays[hardSlots.indexOf(slot)] ?? null : null;
      if (pin) {
        if (c.blocked.includes(pin)) {
          if (!namesDay(pin)) fails.push(`week ${wk}: PIN ON A DAY OFF IN SILENCE — ${slot.role} row ${slot.key} pinned ${pin}, built ${s.day}, no note names ${pin}`);
        } else if (s.day !== pin) {
          fails.push(`week ${wk}: PIN — ${slot.role} row ${slot.key} pinned ${pin}, built ${s.day}`);
        }
      }

      // 5 ── THE WORKOUT PICKED FOR A HARD ROW.
      const picked = c.archetypes?.[slot.key];
      if (picked && tagOf(s, 'archetype:') !== picked) {
        fails.push(`week ${wk}: WORKOUT — row ${slot.key} picked ${picked}, built ${tagOf(s, 'archetype:')} "${s.name}"`);
      }

      // 6 ── THE LENGTH PICKED FOR AN EASY OR LONG ROW.
      const mins = c.minutes?.[slot.key];
      // ⛔ EVERY WEEK, the alternate one included. 2026-09-20: the easy ride's even weeks built p239's
      // printed 85-minute mixed ride whatever was picked; `archetypeForSlot` (compose.ts) closed it.
      if (mins && s.duration !== mins) {
        fails.push(`week ${wk}: LENGTH — row ${slot.key} picked ${mins} min, built ${s.duration} "${s.name}"`);
      }
    });

    // 7 ── TWO OF THE WEEK'S BIG SESSIONS ON ONE DAY ARE BUILT, AND SAID. Warn, never block: the
    //      week the athlete tapped is only honest if the note about that day always appears.
    const bigByDay = new Map<string, string[]>();
    endurance.forEach((s, i) => {
      if (slots[i].role === 'easy') return;
      bigByDay.set(s.day, [...(bigByDay.get(s.day) ?? []), s.name]);
    });
    for (const [day, names] of bigByDay) {
      if (names.length < 2 || namesDay(day)) continue;
      // ⚠️ Ride + Strength PRINTS two hard rides on one day (p278 days 3 and 5); the page's own
      // week is not the athlete's doing and carries its own line.
      if (spoken.some((t) => /Two rides land on one day/i.test(t)) && pinsNothingOn(c, day)) continue;
      fails.push(`week ${wk}: STACKED IN SILENCE — ${day} carries ${names.join(' + ')} and no note names ${day}`);
    }

    // 8 ── TEST WEEK OR CURRENT NUMBERS.
    if (wk === '1') {
      const hasTest = ss.some((s) => (s.tags ?? []).includes('test_week'));
      if (c.skipTest === true && hasTest) fails.push('week 1: NUMBERS — "use current" asked, a test session was built');
      if (c.skipTest !== true && !hasTest) fails.push('week 1: NUMBERS — test week asked, no test session was built');
    }
  }
  return fails;
}

/** Fails once, with the count and the first examples grouped by kind, so a red run is readable. */
function report(title: string, fails: Array<{ c: Case; f: string }>, ran: number) {
  console.log(`   ${title}: ${ran} builds, ${fails.length} failing answers`);
  if (fails.length === 0) return;
  const byKind = new Map<string, Array<{ c: Case; f: string }>>();
  for (const x of fails) {
    const kind = x.f.replace(/^week \d+: /, '').split(' — ')[0];
    byKind.set(kind, [...(byKind.get(kind) ?? []), x]);
  }
  const lines: string[] = [];
  for (const [kind, xs] of byKind) {
    lines.push(`\n■ ${kind} — ${xs.length}`);
    for (const x of xs.slice(0, 4)) lines.push(`   ${x.f}\n      ${describe(x.c)}`);
  }
  assert(false, `${title}: ${fails.length} answers not carried, over ${ran} builds${lines.join('\n')}`);
}

function run(title: string, cases: Iterable<Case>) {
  const fails: Array<{ c: Case; f: string }> = [];
  let ran = 0;
  for (const c of cases) {
    ran += 1;
    try {
      for (const f of check(c, build(c))) fails.push({ c, f });
    } catch (e) {
      fails.push({ c, f: `THREW — ${(e as Error)?.message ?? e}` });
    }
  }
  assert(ran > 0, `${title}: the sweep iterated nothing`);
  report(title, fails, ran);
}

// ── THE SPACE ────────────────────────────────────────────────────────────────────────────────────

/** Every run-or-ride answer the builder offers on the frame. */
function sportAnswers(frame: FrameId, rideCount: number | null): Array<Record<string, 'run' | 'ride'>> {
  let out: Array<Record<string, 'run' | 'ride'>> = [{}];
  for (const slot of slotsOf(frame, rideCount)) {
    const next: Array<Record<string, 'run' | 'ride'>> = [];
    for (const partial of out) for (const sp of sportsOffered(frame, slot)) next.push({ ...partial, [slot.key]: sp });
    out = next;
  }
  return out;
}

function subsets<T>(xs: T[], maxSize: number): T[][] {
  const out: T[][] = [];
  for (let m = 0; m < (1 << xs.length); m++) {
    const s = xs.filter((_, i) => m & (1 << i));
    if (s.length <= maxSize) out.push(s);
  }
  return out;
}

const RIDE_COUNTS: Record<FrameId, Array<number | null>> = {
  strength_5k: [null], all_rounder: [null], cycling_base: [6, 7],
};
const DAY_OR_NONE: Array<Weekday | null> = [null, ...DAYS];

// ── THE SWEEPS ───────────────────────────────────────────────────────────────────────────────────

for (const frame of FRAME_IDS) {
  Deno.test(`SWEEP 1 — ${frame}: every set of days off × every long day × every run-or-ride answer`, () => {
    function* cases(): Iterable<Case> {
      for (const rideCount of RIDE_COUNTS[frame]) {
        for (const sports of sportAnswers(frame, rideCount)) {
          for (const blocked of subsets(DAYS, 6)) {
            for (const longDay of DAY_OR_NONE) {
              yield { frame, sports, rideCount, longDay, hardDays: [], blocked };
            }
          }
        }
      }
    }
    run(`${frame} days off × long day × sport`, cases());
  });

  Deno.test(`SWEEP 2 — ${frame}: every long day × every hard-day pick, including all on one day`, () => {
    function* cases(): Iterable<Case> {
      // ⚠️ The six-ride week drops one EASY row, which no long or hard pin touches; it is crossed
      // with days off and pins in SWEEPS 1 and 3. Here the last ride count stands for both.
      for (const rideCount of RIDE_COUNTS[frame].slice(-1)) {
        const nHard = slotsOf(frame, rideCount).filter((s) => s.role === 'hard').length;
        const all = sportAnswers(frame, rideCount);
        // ⚠️ The two ends of the sport answers — every row a run where offered, every row a ride.
        // The middle is crossed with days in SWEEP 1 and with days off in SWEEP 3.
        const ends = all.length > 1 ? [all[0], all[all.length - 1]] : all;
        for (const sports of ends) {
          const walk = function* (i: number, acc: Array<Weekday | null>): Iterable<Array<Weekday | null>> {
            if (i === nHard) { yield acc; return; }
            for (const d of DAY_OR_NONE) yield* walk(i + 1, [...acc, d]);
          };
          for (const longDay of DAY_OR_NONE) {
            for (const hardDays of walk(0, [])) {
              yield { frame, sports, rideCount, longDay, hardDays, blocked: [] };
            }
          }
        }
      }
    }
    run(`${frame} long day × hard days`, cases());
  });

  Deno.test(`SWEEP 3 — ${frame}: days off (none, one, two) × every pin on and off those days`, () => {
    function* cases(): Iterable<Case> {
      for (const rideCount of RIDE_COUNTS[frame]) {
        const nHard = slotsOf(frame, rideCount).filter((s) => s.role === 'hard').length;
        for (const sports of sportAnswers(frame, rideCount)) {
          for (const blocked of subsets(DAYS, 2)) {
            for (const longDay of DAY_OR_NONE) {
              // One hard row pinned at a time, every day; the others left to the programme.
              for (let h = 0; h < nHard; h++) {
                for (const d of DAYS) {
                  const hardDays: Array<Weekday | null> = Array.from({ length: nHard }, () => null);
                  hardDays[h] = d;
                  yield { frame, sports, rideCount, longDay, hardDays, blocked };
                }
              }
            }
          }
        }
      }
    }
    run(`${frame} days off × pins`, cases());
  });

  // ⚠️ Ride + Strength asks no workout and no length — only six or seven rides, which SWEEP 1's
  // row count checks on every build.
  if (frame !== 'cycling_base') Deno.test(`SWEEP 4 — ${frame}: every workout offered on every hard row, every length on every easy and long row`, () => {
    function* cases(): Iterable<Case> {
      for (const rideCount of RIDE_COUNTS[frame]) {
        for (const sports of sportAnswers(frame, rideCount)) {
          for (const slot of slotsOf(frame, rideCount)) {
            const sport = sports[slot.key];
            // ⚠️ Run + Strength rotates its hard runs and Ride + Strength prints its own; only the
            // Run + Ride + Strength screen offers a workout per hard row.
            if (slot.role === 'hard' && frame === 'all_rounder') {
              // ⛔ THE SCREEN'S OWN LIST (`slotVariantOptions`) — the family's workouts at the row's
              // level, not every workout the family prints.
              const hardRow = frameSlots(frame).find((r) => r.frameKey === slot.key);
              const offered = hardRow ? slotVariantOptions(hardRow.key as never, sport, frame) : [];
              if (offered.length === 0) throw new Error(`${frame} ${slot.key} ${sport}: the screen offers no workout`);
              for (const a of offered) {
                yield { frame, sports, rideCount, longDay: null, hardDays: [], blocked: [], archetypes: { [slot.key]: a.id } };
              }
            }
            if (slot.role !== 'hard' && frame !== 'cycling_base') {
              const row = frameSlots(frame).find((r) => r.frameKey === slot.key);
              // ⛔ The screen's own rows, keyed the way the screen keys them, so the lengths offered
              // here are the lengths the athlete is offered.
              const rowAnswers = Object.fromEntries(
                frameSlots(frame).map((r) => [r.key, sports[r.frameKey]]).filter(([, v]) => v),
              );
              const lengths = frame === 'strength_5k'
                ? (slot.role === 'long' ? [68, 75, 90] : [])
                : (row ? slotLengthOptions(row.key, rowAnswers as never, { baselines: BASELINES as never, frame, tier: 'experienced' })?.options ?? [] : []);
              for (const minutes of lengths) {
                yield { frame, sports, rideCount, longDay: null, hardDays: [], blocked: [], minutes: { [slot.key]: minutes } };
              }
            }
          }
        }
      }
    }
    run(`${frame} workouts and lengths`, cases());
  });

  Deno.test(`SWEEP 5 — ${frame}: test week or current numbers × a pinned, blocked week`, () => {
    function* cases(): Iterable<Case> {
      for (const rideCount of RIDE_COUNTS[frame]) {
        const sports = sportAnswers(frame, rideCount)[0];
        for (const skipTest of [false, true]) {
          for (const longDay of DAY_OR_NONE) {
            for (const blocked of subsets(DAYS, 1)) {
              yield { frame, sports, rideCount, longDay, hardDays: [], blocked, skipTest };
            }
          }
        }
      }
    }
    run(`${frame} numbers`, cases());
  });

  Deno.test(`SWEEP 6 — ${frame}: every lift pick offered, one row at a time, on a gym kit and a home kit`, () => {
    const fails: string[] = [];
    let ran = 0;
    for (const kit of [GYM, HOME]) {
      // ⛔ THE ROWS THE SCREEN DRAWS — `setup-readout.ts` lists `picksForFrame` less the core keys
      // (no page prints a core row, and `ATHLETE_ADDITIONS_ON` is false).
      for (const key of picksForFrame(frame, kit).filter((k) => !String(k).startsWith('core'))) {
        const options = pickOptions(key, kit, frameMuscleForPick(key, frame), frameAdmitsForPick(key, frame));
        for (const o of options) {
          ran += 1;
          const prefs = normalizeViadaPrefs(
            { version: 1, picks: { [key]: o.name }, dial: [], dial_rows: {} }, kit, frame,
          );
          if (!prefs) { fails.push(`${key} = "${o.name}": the wire returned nothing`); continue; }
          const sports = sportAnswers(frame, RIDE_COUNTS[frame][0])[0];
          const built = build({
            frame, sports, rideCount: RIDE_COUNTS[frame][0], longDay: null, hardDays: [], blocked: [],
            skipTest: true, slotPicks: prefs.picks as Record<string, string>,
            accessoryPicks: flattenViadaPicks(prefs), equipment: kit, weeks: 2,
          });
          const stored = String(prefs.picks[key] ?? '').toLowerCase();
          const names = Object.values(built.row.sessions_by_week)
            .flatMap((ss) => ss.flatMap((s) => s.strength_exercises ?? []))
            .flatMap((e) => [e.name, e.execution_name ?? ''])
            .map((n) => String(n).toLowerCase());
          const want = [stored, o.name.toLowerCase(), o.display.toLowerCase()].filter(Boolean);
          if (!names.some((n) => want.some((w) => n === w || n.includes(w) || w.includes(n) && n.length > 3))) {
            fails.push(`${key} = "${o.name}" (${kit === GYM ? 'gym' : 'home'} kit): not in the built weeks`);
          }
        }
      }
    }
    console.log(`   ${frame} lift picks: ${ran} builds, ${fails.length} failing`);
    assert(ran > 0, `${frame}: no lift pick was offered at all`);
    assert(fails.length === 0, `${frame}: ${fails.length} of ${ran} lift picks did not reach the built weeks\n   ${fails.slice(0, 25).join('\n   ')}`);
  });
}

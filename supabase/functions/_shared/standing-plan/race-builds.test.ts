/**
 * ⛔⛔ THE RACE BUILDS — A BOOK HALF-MARATHON WEEK BUILT BACK FROM A RACE DATE (WORKORDER-race-builds-2026-09-30, Stage 1;
 * from the tabled 2026-09-24 half-marathon work). Both weeks (Long Run + Strength p250, Long Run + Muscle p252) × both
 * distances (half: 2 taper weeks, marathon: 3).
 *
 * The same assembly `generate-strength-plan` performs (mix → `chooseDayMap` → `buildStandingPlanRow`), with the race the
 * server computes from the start Monday and the race date (`planWeekContaining`, `weekdayOfIso`, `raceTaperWeeks`).
 * The combo sweep: long day × hard picks × one day off × race dates 6 to 20 weeks out, race day on every weekday.
 * Checked per build: the block ends in race week; the last 2 / 3 weeks are the page's TAPER/DELOAD column and no other is;
 * race day carries the race and nothing else and nothing is built after it; no run on a day off (a lift only with a note
 * naming the day, as the answers sweep allows); every other week has the runs a no-race build of that week has; the long run and the
 * hard runs on the picked days in the standard weeks. Deterministic: no clock, no random.
 *
 * Run: deno test --no-check --allow-read --allow-env supabase/functions/_shared/standing-plan/race-builds.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  FRAMES,
  assignSports,
  buildStandingPlanRow,
  chooseDayMap,
  defaultCompetitionLifts,
  fenceMixToFrame,
  isLongSlot,
  type PlanSession,
  type Weekday,
} from './index.ts';
import { applyRaceWeek, hypertrophySetFactor, racePlanFromWeek, raceGrowthSchedule, raceNtRotation, raceTaperWeeks, weekdayOfIso, RACE_TAPER_WEEKS, type RaceDistance, type StandingRace } from './race-week.ts';
import { planWeekContaining } from '../planning-context.ts';
import { FAMILIES as FAMILIES_LIB, archetypesFor as archetypesForLib } from '../endurance-library/index.ts';
import { mondayOfCalendarYmd, parseLocalDate, formatLocalDate } from '../parse-local-date.ts';
import { raceBlockWeeks } from '../../../../src/lib/race-weeks.ts';

type RaceFrame = 'strength_half' | 'hyp_half';
const FRAMES_RACED: RaceFrame[] = ['strength_half', 'hyp_half'];
const DISTANCES: RaceDistance[] = ['half', 'marathon'];
const DAYS: Weekday[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const START = '2026-09-28'; // a Monday
const BASELINES = {
  learned_fitness: {
    run_threshold_pace_sec_per_km: { value: 261, confidence: 'high', sample_count: 10 },
    run_easy_pace_sec_per_km: { value: 340, confidence: 'high', sample_count: 20 },
  },
};
const wn = (lift: string, p: number) => ({
  lift, predicted1RM: p, workingNumber: Math.round(p * 0.96), measured: { weight: Math.round(p * 0.85), reps: 5 }, cite: 'fixture',
});
const WORKING = { bench: wn('bench', 200), squat: wn('squat', 265), deadlift: wn('deadlift', 340), overheadPress: wn('overheadPress', 125) };

const addDays = (iso: string, n: number) => { const d = parseLocalDate(iso); d.setDate(d.getDate() + n); return formatLocalDate(d); };

/** The race the server builds for this start and race date (generate-strength-plan's own steps). */
function raceFor(raceDate: string, distance: RaceDistance): StandingRace {
  const week = planWeekContaining(mondayOfCalendarYmd(START), raceDate)!;
  return { date: raceDate, week, day: weekdayOfIso(raceDate)!, distance, duration_min: distance === 'half' ? 124 : 248 };
}

type Case = { frame: RaceFrame; distance: RaceDistance; longDay: Weekday | null; hardDays: Array<Weekday | null>; blocked: Weekday[]; raceDate: string };

function build(c: Case) {
  const sports: Record<string, 'run'> = {};
  for (const d of FRAMES[c.frame].columns.standard) d.endurance.forEach((_, i) => { sports[`${d.day}:${i}`] = 'run'; });
  const runs = Object.keys(sports).length;
  const mix = fenceMixToFrame(c.frame, { runs, rides: 0, swimDays: 0, rideCount: null, slots: sports, archetypes: null, minutes: null });
  assignSports(FRAMES[c.frame].columns.standard, mix);
  const dayMap = chooseDayMap(c.frame, {
    longRunDay: c.longDay, longRideDay: null, longSlotSport: 'run', hardDays: c.hardDays, unavailableDays: c.blocked,
  });
  const race = raceFor(c.raceDate, c.distance);
  const row = buildStandingPlanRow({
    compose: {
      frame: c.frame, competitionLifts: defaultCompetitionLifts(),
      seed1RMs: { bench: 200, squat: 265, deadlift: 340, overheadPress: 125 }, workingNumbers: WORKING,
      baselines: BASELINES, equipment: ['Commercial gym'], roundTo: 5,
      endurancePins: { long: c.longDay, hard: c.hardDays },
      ...(c.blocked.length > 0 ? { unavailableDays: c.blocked } : {}),
      sportMix: mix,
    } as never,
    weeks: race.week,
    taperWeeks: raceTaperWeeks(race.week, race.distance),
    race,
    dayMap,
  });
  return { row, race };
}

const isRun = (s: PlanSession) => s.type === 'run' && !(s.tags ?? []).includes('advanced_tier');
const slotOf = (s: PlanSession) => (s.tags ?? []).find((t) => t.startsWith('slot:'))?.slice(5) ?? null;
const columnOf = (ss: PlanSession[]) => ss.find((s) => s.type === 'strength' && (s.tags ?? []).some((t) => t.startsWith('column:')))
  ?.tags.find((t) => t.startsWith('column:'))?.slice(7) ?? null;

function check(c: Case, built: ReturnType<typeof build>): string[] {
  const f: string[] = [];
  const { row, race } = built;
  const spoken = [...(row.placement_compromises ?? []).map((x) => x.text), ...row.notes.map((n) => n.text)];
  const namesDay = (d: string) => spoken.some((t) => t.includes(d));
  const weeks = Object.keys(row.sessions_by_week).map(Number).sort((a, b) => a - b);
  const last = weeks[weeks.length - 1];
  if (row.duration_weeks !== race.week || last !== race.week) f.push(`LENGTH — ${row.duration_weeks} weeks, race week ${race.week}`);
  const taper = raceTaperWeeks(race.week, race.distance);
  // The runs a block with no race builds in each week, for the same answers and the same taper weeks.
  const plain = plainRow(c, race.week, taper);
  if (JSON.stringify(row.config.taper_weeks) !== JSON.stringify(taper)) f.push(`TAPER CONFIG — ${JSON.stringify(row.config.taper_weeks)}`);
  if (row.config.race?.date !== c.raceDate) f.push('RACE CONFIG — not stored');
  const raceIdx = DAYS.indexOf(race.day);

  for (const w of weeks) {
    const ss = row.sessions_by_week[String(w)];
    const col = columnOf(ss);
    const isTaper = taper.includes(w);
    // Race week can hold no lift before an early-week race; then there is no column to read.
    if (w > 1 && isTaper && col !== 'taper' && !(w === race.week && col === null)) f.push(`week ${w}: TAPER — built ${col}`);
    if (w > 1 && !isTaper && col !== 'standard') f.push(`week ${w}: STANDARD — built ${col}`);
    const raceRows = ss.filter((s) => (s.tags ?? []).includes('race_day'));

    if (w === race.week) {
      if (raceRows.length !== 1) { f.push(`week ${w}: RACE ROWS — ${raceRows.length}`); continue; }
      if (raceRows[0].day !== race.day) f.push(`week ${w}: RACE DAY — ${raceRows[0].day}, asked ${race.day}`);
      for (const s of ss) {
        const i = DAYS.indexOf(s.day as Weekday);
        if (s !== raceRows[0] && i >= raceIdx) f.push(`week ${w}: AFTER THE RACE — "${s.name}" on ${s.day}`);
      }
    } else if (raceRows.length > 0) f.push(`week ${w}: A RACE ROW OUTSIDE RACE WEEK`);

    for (const s of ss) {
      if (!c.blocked.includes(s.day as Weekday)) continue;
      if ((s.tags ?? []).includes('race_day')) continue; // the athlete's own date: the race stays on it
      if (s.type === 'run' || s.type === 'ride') f.push(`week ${w}: DAY OFF — run "${s.name}" on ${s.day}`);
      else if (!namesDay(s.day)) f.push(`week ${w}: DAY OFF IN SILENCE — "${s.name}" on ${s.day}`);
    }

    const runs = ss.filter(isRun);
    if (w === race.week) {
      const before = runs.filter((s) => !(s.tags ?? []).includes('race_day'));
      // Never more than the full taper week of a no-race build carries (p250's 3, p252's 5).
      const cap = plain.sessions_by_week[String(w)].filter(isRun).length;
      if (before.length > cap) f.push(`week ${w}: RUN COUNT — ${before.length} runs before the race, the taper week has ${cap}`);
    } else if (w > 1) {
      const want = plain.sessions_by_week[String(w)].filter(isRun).length;
      if (runs.length !== want) f.push(`week ${w}: RUN COUNT — ${runs.length}, want ${want}`);
    }

    if (w > 1 && !isTaper) {
      const long = runs.find((s) => slotOf(s) === '6:0');
      if (c.longDay && !c.blocked.includes(c.longDay) && long?.day !== c.longDay) f.push(`week ${w}: LONG PIN — ${long?.day}, picked ${c.longDay}`);
      if (c.longDay && c.blocked.includes(c.longDay) && !namesDay(c.longDay)) f.push(`week ${w}: LONG PIN ON A DAY OFF IN SILENCE`);
      const hardSlots = ['1:0', '3:0'];
      c.hardDays.forEach((d, i) => {
        if (!d) return;
        const s = runs.find((x) => slotOf(x) === hardSlots[i]);
        if (c.blocked.includes(d)) { if (!namesDay(d)) f.push(`week ${w}: HARD PIN ON A DAY OFF IN SILENCE`); return; }
        if (s?.day !== d) f.push(`week ${w}: HARD PIN ${i} — ${s?.day}, picked ${d}`);
      });
    }
  }
  return f;
}

Deno.test('⛔ THE RACE WEEK RULES, ONE BY ONE', () => {
  assertEquals(RACE_TAPER_WEEKS, { half: 2, marathon: 3 });
  assertEquals(raceTaperWeeks(12, 'half'), [11, 12]);
  assertEquals(raceTaperWeeks(16, 'marathon'), [14, 15, 16]);
  assertEquals(raceTaperWeeks(2, 'half'), [2]);
  assertEquals(raceTaperWeeks(3, 'marathon'), [2, 3]);  // never the test week
  assertEquals(weekdayOfIso('2026-11-15'), 'Sunday');
  assertEquals(weekdayOfIso('2026-11-14'), 'Saturday');
  // The phone and the server count the same weeks.
  assertEquals(raceBlockWeeks('2026-09-28', '2026-11-15'), planWeekContaining('2026-09-28', '2026-11-15'));
  assertEquals(raceBlockWeeks('2026-09-30', '2026-11-15'), 7);
  assertEquals(raceBlockWeeks('2026-09-28', '2026-09-20'), null);
  // No race → the weeks exactly as they came.
  const weeks = [{ week: 1, sessions: [{ day: 'Sunday', type: 'run' }] }] as never;
  assert(applyRaceWeek(weeks, null) === weeks);
  // A note naming race day or a later day, or a session no longer built, comes off; one about an earlier day stays.
  const wk = [{
    frame: 'strength_half', week: 6, column: 'taper', isTestWeek: false,
    sessions: [
      { day: 'Monday', type: 'strength', name: 'ME: Upper', description: '', duration: 55, tags: [] },
      { day: 'Friday', type: 'strength', name: 'DE: Lower', description: '', duration: 55, tags: [] },
    ],
    conflicts: [], meRows: [],
    notes: [
      { kind: 'warning', text: 'Monday is short one exercise.' },
      { kind: 'warning', text: 'Sunday is a day off.' },
      { kind: 'warning', text: 'DE: Lower is 1 exercise short.' },
    ],
  }] as never;
  const cut = applyRaceWeek(wk, { date: '2026-11-05', week: 6, day: 'Thursday', distance: 'half', duration_min: 124 }) as never as Array<{ notes: Array<{ text: string }>; sessions: PlanSession[] }>;
  assertEquals(cut[0].notes.map((n) => n.text), ['Monday is short one exercise.']);
  assertEquals(cut[0].sessions.map((s) => `${s.day} ${s.name}`), ['Monday ME: Upper', 'Thursday Half marathon']);
});

Deno.test('⛔⛔ NO RACE, NO CHANGE — a block without a race stores no taper and no race', () => {
  for (const frame of FRAMES_RACED) {
    const { row } = build({ frame, distance: 'half', longDay: null, hardDays: [], blocked: [], raceDate: addDays(START, 7 * 11 + 6) });
    const plain = buildStandingPlanRow({
      compose: { frame, competitionLifts: defaultCompetitionLifts(), roundTo: 5, equipment: ['Commercial gym'] } as never,
      weeks: 12, taperWeeks: [],
    });
    assert(!('race' in plain.config) && !('taper_weeks' in plain.config));
    assert(Array.isArray(row.config.taper_weeks));
  }
});

Deno.test('⛔⛔ THE COMBO SWEEP — both weeks × both distances × long day × hard picks × one day off × race 6 to 20 weeks out', () => {
  // Trimmed for four frame×distance pairs (the 2026-09-24 sweep ran one): every long day, the hard picks that clash most,
  // every single day off; race weeks 6–20 in steps of 2 on a rotating weekday.
  const longs: Array<Weekday | null> = [null, ...DAYS];
  const hards: Array<Array<Weekday | null>> = [[], ['Tuesday', 'Thursday'], ['Saturday', 'Sunday'], ['Monday', 'Monday']];
  const offs: Weekday[][] = [[], ...DAYS.map((d) => [d])];
  const fails: string[] = [];
  let builds = 0;
  let weeksBuilt = 0;
  let raceOnDayOff = 0;
  let n = 0;
  for (const frame of FRAMES_RACED) for (const distance of DISTANCES)
  for (const longDay of longs) for (const hardDays of hards) for (const blocked of offs) {
    for (let out = 6; out <= 20; out += 2) {
      const weekday = (n++) % 7;
      const raceDate = addDays(START, (out - 1) * 7 + weekday);
      const c: Case = { frame, distance, longDay, hardDays, blocked, raceDate };
      try {
        const b = build(c);
        builds += 1;
        weeksBuilt += Object.keys(b.row.sessions_by_week).length;
        if (blocked.includes(b.race.day)) raceOnDayOff += 1;
        for (const x of check(c, b)) fails.push(`${x}  ${JSON.stringify(c)}`);
      } catch (e) {
        fails.push(`THREW ${(e as Error).message}  ${JSON.stringify(c)}`);
      }
    }
  }
  console.log(`   race builds combo sweep: ${builds} builds, ${weeksBuilt} weeks, ${fails.length} failing, race on a day off ${raceOnDayOff}`);
  const kinds = new Map<string, number>();
  for (const x of fails) { const k = x.replace(/^week \d+: /, '').split(' — ')[0]; kinds.set(k, (kinds.get(k) ?? 0) + 1); }
  for (const [k, n] of kinds) console.log(`   ${k}: ${n}`);
  assertEquals(fails.slice(0, 20), [], `${fails.length} failing`);
});

/** A block with no race, the same answers — what the full taper week says, and what the other weeks say. */
function plainRow(c: Case, weeks: number, taperWeeks: number[]) {
  const sports: Record<string, 'run'> = {};
  for (const d of FRAMES[c.frame].columns.standard) d.endurance.forEach((_, i) => { sports[`${d.day}:${i}`] = 'run'; });
  const mix = fenceMixToFrame(c.frame, { runs: Object.keys(sports).length, rides: 0, swimDays: 0, rideCount: null, slots: sports, archetypes: null, minutes: null });
  const dayMap = chooseDayMap(c.frame, {
    longRunDay: c.longDay, longRideDay: null, longSlotSport: 'run', hardDays: c.hardDays, unavailableDays: c.blocked,
  });
  return buildStandingPlanRow({
    compose: {
      frame: c.frame, competitionLifts: defaultCompetitionLifts(),
      seed1RMs: { bench: 200, squat: 265, deadlift: 340, overheadPress: 125 }, workingNumbers: WORKING,
      baselines: BASELINES, equipment: ['Commercial gym'], roundTo: 5,
      endurancePins: { long: c.longDay, hard: c.hardDays },
      ...(c.blocked.length > 0 ? { unavailableDays: c.blocked } : {}),
      sportMix: mix,
    } as never,
    weeks, taperWeeks, dayMap,
  });
}

const textsOf = (r: ReturnType<typeof buildStandingPlanRow>) =>
  [...r.notes.map((n) => n.text), ...(r.placement_compromises ?? []).map((x) => x.text)];

Deno.test('⛔⛔ RACE WEEK NAMES NO DAY AFTER THE RACE AND NO SESSION IT DOES NOT BUILD — race day on every weekday', () => {
  const longs: Array<Weekday | null> = [null, ...DAYS];
  const hards: Array<Array<Weekday | null>> = [[], ['Tuesday'], ['Thursday', 'Friday'], ['Saturday', 'Sunday']];
  const offs: Weekday[][] = [[], ...DAYS.map((d) => [d])];
  const OUT = 6;
  const fails: string[] = [];
  let builds = 0;
  let wouldHaveNamed = 0;
  for (const frame of FRAMES_RACED) for (const distance of DISTANCES)
  for (let wd = 0; wd < 7; wd++) {
    const raceDate = addDays(START, (OUT - 1) * 7 + wd);
    for (const longDay of longs) for (const hardDays of hards) for (const blocked of offs) {
      const c: Case = { frame, distance, longDay, hardDays, blocked, raceDate };
      const { row, race } = build(c);
      builds += 1;
      const closed = DAYS.slice(DAYS.indexOf(race.day));
      const raceWeek = row.sessions_by_week[String(race.week)];
      const built = new Set(raceWeek.flatMap((s) => [s.name, s.intent_title].filter(Boolean) as string[]));
      // The full taper week, as it was built before race week was cut: names race week no longer carries.
      const plain = plainRow(c, race.week, raceTaperWeeks(race.week, race.distance));
      const gone = [...new Set(plain.sessions_by_week[String(race.week)].flatMap((s) => [s.name, s.intent_title].filter(Boolean) as string[]))]
        .filter((n) => !built.has(n));
      // Texts the earlier weeks raise are about those weeks; only what race week alone raises is checked.
      const other = new Set(textsOf(plainRow(c, race.week - 1, raceTaperWeeks(race.week, race.distance).filter((w) => w < race.week))));
      if (textsOf(plain).some((t) => !other.has(t) && closed.some((d) => t.includes(d)))) wouldHaveNamed += 1;
      for (const t of textsOf(row)) {
        if (other.has(t)) continue;
        const day = closed.find((d) => t.includes(d));
        if (day) fails.push(`NAMES ${day} (race ${race.day}): "${t}"  ${JSON.stringify(c)}`);
        const name = gone.find((n) => t.includes(n));
        if (name) fails.push(`NAMES "${name}", not built (race ${race.day}): "${t}"  ${JSON.stringify(c)}`);
      }
    }
  }
  console.log(`   race-week notes: ${builds} builds, ${fails.length} failing; before the fix ${wouldHaveNamed} would have named a closed day`);
  assertEquals(fails.slice(0, 10), [], `${fails.length} failing`);
});

Deno.test('⛔ THE RUNNING BUILDS TOWARD RACE DAY — the schedule: 5% of the bucket a week, easy runs first, each to its cap', () => {
  const s = raceGrowthSchedule([
    { key: '4:0', role: 'easy', start: 45, cap: 60 },
    { key: '7:0', role: 'easy', start: 30, cap: 30 },
    { key: '6:0', role: 'long', start: 105, cap: 180 },
  ], 10, [9, 10]);
  assertEquals(s[1], { '4:0': 45, '7:0': 30, '6:0': 105 });
  assert(!(9 in s) && !(10 in s), 'taper weeks carry no grown lengths');
  for (let w = 2; w <= 8; w++) {
    const prev = Object.values(s[w - 1]).reduce((a, b) => a + b, 0);
    const now = Object.values(s[w]).reduce((a, b) => a + b, 0);
    assert(now - prev <= Math.floor(prev * 0.05), `week ${w} grew ${now - prev} on ${prev}`);
  }
  assertEquals(s[2]['6:0'], 105, 'the easy run takes the step first');
  assert(s[8]['4:0'] === 60 && s[8]['6:0'] > 105 && s[8]['6:0'] <= 180);
});

Deno.test('⛔⛔ THE LONG RUN REACHES RACE LENGTH — half up to the 2-hour easy cap (p107), marathon up to 3 hours (p251)', () => {
  for (const frame of FRAMES_RACED) for (const distance of DISTANCES) {
    const weeks = distance === 'marathon' ? 16 : 12;
    const c: Case = { frame, distance, longDay: 'Saturday', hardDays: [], blocked: [], raceDate: addDays(START, (weeks - 1) * 7 + 6) };
    const { row, race } = build(c);
    const taper = raceTaperWeeks(race.week, race.distance);
    const longs = Object.keys(row.sessions_by_week).map(Number).sort((a, b) => a - b)
      .filter((w) => w > 1 && !taper.includes(w))
      .map((w) => row.sessions_by_week[String(w)].find((s) => slotOf(s) === '6:0' && (s.tags ?? []).some((t) => t === 'slot:6:0'))?.duration ?? 0);
    const peak = Math.max(...longs);
    for (let i = 1; i < longs.length; i++) assert(longs[i] >= longs[i - 1] - 1, `${frame} ${distance}: the long run shrank ${longs.join(' ')}`);
    if (distance === 'marathon') assert(peak >= 175 && peak <= 181, `${frame} marathon peak ${peak}: ${longs.join(' ')}`);
    else assert(peak >= 140 && peak <= 146, `${frame} half peak ${peak}: ${longs.join(' ')}`);
    const steps = row.sessions_by_week[String(Math.max(...Object.keys(row.sessions_by_week).map(Number).filter((w) => !taper.includes(w))))]
      .find((s) => slotOf(s) === '6:0')?.steps_preset ?? [];
    assert(steps.some((t) => /racepace/.test(t)), `${frame} ${distance}: the long run carries no race-pace finish`);
  }
});

Deno.test('⛔ THE HELD HARD CYCLE IS THE BLOCK\'S — the growing long run never moves it (the cycle is solved on the starting lengths)', () => {
  // Two race blocks that differ only in how long the long run starts: their hard sessions match week for week.
  const buildWith = (c: Case, longStart: number) => {
    const sports: Record<string, 'run'> = {};
    for (const d of FRAMES[c.frame].columns.standard) d.endurance.forEach((_, i) => { sports[`${d.day}:${i}`] = 'run'; });
    const mix = fenceMixToFrame(c.frame, { runs: Object.keys(sports).length, rides: 0, swimDays: 0, rideCount: null, slots: sports, archetypes: null, minutes: { '6:0': longStart } });
    assignSports(FRAMES[c.frame].columns.standard, mix);
    const dayMap = chooseDayMap(c.frame, { longRunDay: c.longDay, longRideDay: null, longSlotSport: 'run', hardDays: c.hardDays, unavailableDays: c.blocked });
    const race = raceFor(c.raceDate, c.distance);
    return buildStandingPlanRow({
      compose: { frame: c.frame, competitionLifts: defaultCompetitionLifts(), seed1RMs: { bench: 200, squat: 265, deadlift: 340, overheadPress: 125 },
        workingNumbers: WORKING, baselines: BASELINES, equipment: ['Commercial gym'], roundTo: 5, sportMix: mix } as never,
      weeks: race.week, taperWeeks: raceTaperWeeks(race.week, race.distance), race, dayMap,
    });
  };
  const hardOf = (ss: PlanSession[]) => ss.filter((s) => s.type === 'run' && ['1:0', '3:0'].includes(slotOf(s) ?? '')).map((s) => `${slotOf(s)} ${s.name}`).sort().join(' · ');
  for (const frame of FRAMES_RACED) for (const distance of DISTANCES) {
    const c: Case = { frame, distance, longDay: 'Saturday', hardDays: [], blocked: [], raceDate: addDays(START, 15 * 7 + 6) };
    const a = buildWith(c, 105), b = buildWith(c, 134);
    for (const w of Object.keys(a.sessions_by_week)) {
      assertEquals(hardOf(a.sessions_by_week[w]), hardOf(b.sessions_by_week[w]), `${frame} ${distance} week ${w}`);
    }
  }
});

Deno.test('⛔ THE THRESHOLD WORK IS SET BY THE RACE (p251, p253) — every NT session in the race band or the race\'s own line', () => {
  const NT_IDS_BY_NAME: Record<string, string> = {};
  for (const frame of FRAMES_RACED) for (const distance of DISTANCES) {
    const weeks = distance === 'marathon' ? 16 : 12;
    const c: Case = { frame, distance, longDay: 'Saturday', hardDays: [], blocked: [], raceDate: addDays(START, (weeks - 1) * 7 + 6) };
    const { row, race } = build(c);
    const taper = raceTaperWeeks(race.week, race.distance);
    const allowed = new Set(raceNtRotation(FAMILIES_LIB.run_near_threshold.archetypes as never, distance));
    let raceLine = 0;
    for (let w = 2; w <= race.week; w++) {
      if (taper.includes(w)) continue;
      for (const s of row.sessions_by_week[String(w)] ?? []) {
        const arch = (s.tags ?? []).find((t) => t.startsWith('archetype:'))?.slice(10);
        if (!arch || !(FAMILIES_LIB.run_near_threshold.archetypes as Array<{ id: string }>).some((a) => a.id === arch)) continue;
        assert(allowed.has(arch), `${frame} ${distance} week ${w}: ${arch} is outside the race band`);
        if (arch === `race_repeats_${distance}`) raceLine++;
      }
    }
    assert(raceLine > 0, `${frame} ${distance}: the race-specific line never appears`);
  }
  // No other plan is offered a race-only shape.
  assert(!archetypesForLib('run_near_threshold', 2).some((a) => a.id.startsWith('race_repeats_')), 'a race-only shape leaked into the plain list');
  void NT_IDS_BY_NAME;
});

Deno.test('⛔ THE LIFTING DECREASES AS THE MILES INCREASE (p151) — hypertrophy sets only, gradual, one-way, never below one a row', () => {
  assertEquals(hypertrophySetFactor(1), 1);
  assert(Math.abs(hypertrophySetFactor(2) - 1 / 3) < 1e-9);
  assertEquals(hypertrophySetFactor(3), 1 / 3);
  for (const frame of FRAMES_RACED) {
    const c: Case = { frame, distance: 'marathon', longDay: 'Saturday', hardDays: [], blocked: [], raceDate: addDays(START, 15 * 7 + 6) };
    const { row, race } = build(c);
    const taper = raceTaperWeeks(race.week, race.distance);
    const plain = plainRow(c, race.week, taper);
    const sets = (ss: PlanSession[], hyp: boolean) => ss.flatMap((s) => s.strength_exercises ?? [])
      .filter((e) => (e.slot_intent === 'HYP') === hyp).reduce((a, e) => a + (Number(e.sets) || 0), 0);
    let prev = Infinity;
    for (let w = 2; w < race.week; w++) {
      if (taper.includes(w)) continue;
      const ss = row.sessions_by_week[String(w)];
      const h = sets(ss, true);
      assert(h <= prev, `${frame} week ${w}: hypertrophy sets went back up (${prev} → ${h})`);
      assert(prev === Infinity || prev - h <= 3, `${frame} week ${w}: dropped ${prev - h} sets in one week`);
      prev = h;
      assertEquals(sets(ss, false), sets(plain.sessions_by_week[String(w)], false), `${frame} week ${w}: a non-hypertrophy row changed`);
      for (const e of ss.flatMap((s) => s.strength_exercises ?? []).filter((e) => e.slot_intent === 'HYP')) assert(Number(e.sets) >= 1);
    }
    const runOf = (w: number) => row.sessions_by_week[String(w)].filter((s) => s.type === 'run' && !(s.tags ?? []).includes('race_day')).reduce((a, s) => a + (s.duration || 0), 0);
    let peak = 1;
    for (let w = 3; w < race.week; w++) if (!taper.includes(w)) peak = Math.max(peak, runOf(w) / runOf(2));
    const want = Math.max(0, sets(row.sessions_by_week['2'], true) - Math.round(sets(row.sessions_by_week['2'], true) * hypertrophySetFactor(peak)));
    assertEquals(sets(row.sessions_by_week['2'], true) - prev, want, `${frame}: running rose ×${peak.toFixed(2)}, sets came down ${sets(row.sessions_by_week['2'], true) - prev}`);
  }
});

Deno.test('⛔ A RACE MORE THAN 26 WEEKS OUT — the plain programme first, the race plan from 26 weeks out', () => {
  assertEquals(racePlanFromWeek(26), 1);
  assertEquals(racePlanFromWeek(27), 2);
  assertEquals(racePlanFromWeek(34), 9);
  const c: Case = { frame: 'strength_half', distance: 'marathon', longDay: 'Saturday', hardDays: [], blocked: [], raceDate: addDays(START, 33 * 7 + 6) };
  const race = { ...raceFor(c.raceDate, c.distance), from_week: racePlanFromWeek(34) };
  assertEquals(race.week, 34);
  const sports: Record<string, 'run'> = {};
  for (const d of FRAMES[c.frame].columns.standard) d.endurance.forEach((_, i) => { sports[`${d.day}:${i}`] = 'run'; });
  const mix = fenceMixToFrame(c.frame, { runs: Object.keys(sports).length, rides: 0, swimDays: 0, rideCount: null, slots: sports, archetypes: null, minutes: { '6:0': 105 } });
  assignSports(FRAMES[c.frame].columns.standard, mix);
  const dayMap = chooseDayMap(c.frame, { longRunDay: 'Saturday', longRideDay: null, longSlotSport: 'run', hardDays: [], unavailableDays: [] });
  const compose = { frame: c.frame, competitionLifts: defaultCompetitionLifts(), seed1RMs: { bench: 200, squat: 265, deadlift: 340, overheadPress: 125 },
    workingNumbers: WORKING, baselines: BASELINES, equipment: ['Commercial gym'], roundTo: 5, sportMix: mix } as never;
  const row = buildStandingPlanRow({ compose, weeks: 34, taperWeeks: raceTaperWeeks(34, 'marathon'), race, dayMap });
  const plain = buildStandingPlanRow({ compose, weeks: 34, taperWeeks: [], dayMap });
  const longOf = (r: typeof row, w: number) => r.sessions_by_week[String(w)].find((s) => slotOf(s) === '6:0')?.duration;
  for (let w = 1; w < 9; w++) {
    assertEquals(row.sessions_by_week[String(w)].map((s) => `${s.day} ${s.name} ${s.duration}`), plain.sessions_by_week[String(w)].map((s) => `${s.day} ${s.name} ${s.duration}`), `week ${w} is the plain programme`);
  }
  assert(Number(longOf(row, 20)) > Number(longOf(row, 9)), 'the long run grows once the race plan begins');
  assertEquals(Object.keys(row.sessions_by_week).length, 34);
});

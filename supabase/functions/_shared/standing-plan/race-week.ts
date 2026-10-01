/**
 * THE RACE AT THE END OF A STANDING BLOCK — the race builds (WORKORDER-race-builds-2026-09-30), from the tabled half-marathon
 * work of 2026-09-24 (WORKORDER-run-programs Stage 2).
 *
 * ⛔ NOT A SECOND GENERATOR. The block is a book week (Long Run + Strength p250, Long Run + Muscle p252) built by the same
 * composer; this file only says which weeks are the page's TAPER/DELOAD column and what race week looks like.
 *
 * What the pages print, and what is not theirs:
 * - p250 and p252 print the TAPER/DELOAD column; no page read gives a half or marathon taper length (SOURCE Part K5, E3c).
 * - FIELD — `RACE_TAPER_WEEKS`: half 2 (Bosquet et al. 2007 meta-analysis, ≈2 weeks), marathon 3 (Pfitzinger, Higdon;
 *   Smyth & Lawlor 2021, ~158k recreational marathoners). Michael's call 2026-09-30.
 * - OURS — race day carries the race and nothing else, and nothing is built after race day: the pages print no race week.
 * - OURS — the race row's length is the race distance at the athlete's easy pace, as the marathon builder already sizes
 *   its race row (`generate-run-plan` sustainable `createCompletionRaceDay`); it only sets the calendar's length.
 */
import type { ComposedWeek, PlanSession } from './compose.ts';
import { weekConflicts } from './week-conflicts.ts';
import type { DayArrangement } from './day-map.ts';

export type RaceDistance = 'half' | 'marathon';

/**
 * ⛔ THE LENGTHS AROUND A RACE BLOCK (WORKORDER-race-builds Stage 5, 2026-10-01).
 * FIELD — `RACE_USUAL_MIN_WEEKS`: Nike Run Club recommends at least 12 weeks for a marathon; Runna's shortest plans are
 * 12 (marathon) and 8 (half, "Fast-Track"). Under it the plan still builds, with a note.
 * FIELD — `RACE_PLAN_MAX_WEEKS`: Runna and Garmin cap a race plan at 26 weeks; further out, the athlete is on the training
 * programme and the race plan takes over 26 weeks out (Runna puts a base plan first).
 * OURS — 2 to 52: the race must fall after the start week (week one is the test week), within the goal row's year.
 */
export const RACE_USUAL_MIN_WEEKS: Record<'half' | 'marathon', number> = { half: 8, marathon: 12 };
export const RACE_PLAN_MAX_WEEKS = 26;
export const RACE_BLOCK_MIN_WEEKS = 2;
export const RACE_BLOCK_MAX_WEEKS = 52;

/** The block week the race plan starts in: 1, or the week that leaves `RACE_PLAN_MAX_WEEKS` to race day. */
export function racePlanFromWeek(raceWeek: number): number {
  return raceWeek > RACE_PLAN_MAX_WEEKS ? raceWeek - RACE_PLAN_MAX_WEEKS + 1 : 1;
}

/** FIELD — see the header; ledger row in docs/STATE-SOURCES.md. */
export const RACE_TAPER_WEEKS: Record<RaceDistance, number> = { half: 2, marathon: 3 };

/** The race distances in miles (21.0975 / 42.195 km), the numbers `generate-run-plan` uses. */
export const RACE_MILES: Record<RaceDistance, number> = { half: 13.1, marathon: 26.2 };

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

/** The race, as the block stores it (`config.standing_plan.race`) so a rebuild puts race week back the same way. */
export type StandingRace = {
  /** The race date, YYYY-MM-DD. */
  date: string;
  /** The block week race day falls in (1-based; the block's weeks are Monday-anchored). */
  week: number;
  /** The weekday of race day. */
  day: (typeof WEEKDAYS)[number];
  distance: RaceDistance;
  /** The calendar length of the race row, minutes. */
  duration_min: number;
  /**
   * The block week the race plan begins (`racePlanFromWeek`). Before it the block is the plain programme — no growth,
   * no race band, no lifting decrease. Absent = 1.
   */
  from_week?: number;
};

/** The weekday a YYYY-MM-DD date falls on, or null. */
export function weekdayOfIso(dateIso: string): StandingRace['day'] | null {
  const d = new Date(`${String(dateIso).slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return null;
  return WEEKDAYS[(d.getUTCDay() + 6) % 7];
}

/** The taper weeks for a block of `weeks` ending in race week: the last 2 (half) or 3 (marathon), never the test week. */
export function raceTaperWeeks(weeks: number, distance: RaceDistance): number[] {
  const out: number[] = [];
  for (let w = Math.max(2, weeks - RACE_TAPER_WEEKS[distance] + 1); w <= weeks; w++) out.push(w);
  return out;
}

/** Words on the race row. Approved words go here; nothing else prints them. */
export const RACE_ROW_COPY = {
  // OURS — the race's distance as the row's description; the pages print no race-day session.
  half: { name: 'Half marathon', description: '13.1 miles.' },  // not-instruction: a race name and its distance
  marathon: { name: 'Marathon', description: '26.2 miles.' },  // not-instruction: a race name and its distance
} as const;

/** The race row itself. No steps: the pages print no race-day pace, so the watch gets no target. */
export function raceSession(race: StandingRace): PlanSession {
  const words = RACE_ROW_COPY[race.distance];
  return {
    day: race.day,
    type: 'run',
    name: words.name,
    description: words.description,
    duration: race.duration_min,
    steps_preset: [],
    tags: ['standing_plan', 'race_day', 'event', race.distance],
  };
}

/**
 * Race week as built: the week's sessions before race day are kept, race day carries only the race, and nothing after
 * race day is built. Every other week is returned as it came.
 *
 * ⛔ AND RACE WEEK'S NOTES AND WARNINGS ARE THE BUILT WEEK'S (PM review, 2026-09-24). The composer wrote them for the
 * whole taper week, so a warning could name a day after the race or a session that is no longer built. They are
 * re-derived here: the week's conflicts are worked out again on the kept sessions (the same `weekConflicts` the
 * composer uses), and any other note that names race day or a later day, or a session no longer built, comes off.
 */
export function applyRaceWeek(
  weeks: ComposedWeek[],
  race: StandingRace | null | undefined,
  dayOffset: DayArrangement = 0,
): ComposedWeek[] {
  if (!race) return weeks;
  const raceIdx = WEEKDAYS.indexOf(race.day);
  if (raceIdx < 0) return weeks;
  return weeks.map((wk) => {
    if (wk.week !== race.week) return wk;
    const kept = wk.sessions.filter((s) => {
      const i = WEEKDAYS.indexOf(s.day as StandingRace['day']);
      return i >= 0 && i < raceIdx;
    });
    const sessions = [...kept, raceSession(race)];

    const conflicts = weekConflicts({ sessions: kept, frame: wk.frame, column: wk.column, dayOffset });
    const oldConflictTexts = new Set(wk.conflicts.map((c) => c.text));
    const namesOf = (s: PlanSession) => [s.name, s.intent_title].filter((x): x is string => !!x && x.trim() !== '');
    const keptNames = new Set(kept.flatMap(namesOf));
    const goneNames = [...new Set(wk.sessions.filter((s) => !kept.includes(s)).flatMap(namesOf))]
      .filter((n) => !keptNames.has(n));
    const closedDays = WEEKDAYS.slice(raceIdx);
    const twoRunsLine = /^Two (runs|rides) land on one day\.$/;
    const notes = wk.notes.filter((n) => {
      if (oldConflictTexts.has(n.text)) return false;           // re-derived below, off the kept sessions
      if (twoRunsLine.test(n.text)) return false;               // re-derived below
      if (closedDays.some((d) => n.text.includes(d))) return false;
      if (goneNames.some((name) => n.text.includes(name))) return false;
      return true;
    });
    for (const c of conflicts) {
      if (!notes.some((n) => n.text === c.text)) notes.push({ kind: 'warning', text: c.text, cite: c.cite ?? 'Viada p130, p131' });
    }
    for (const sport of ['run', 'ride'] as const) {
      const perDay = new Map<string, number>();
      for (const x of kept.filter((y) => y.type === sport)) perDay.set(x.day, (perDay.get(x.day) ?? 0) + 1);
      // As the composer does: a day a two-hard-sessions warning already names gets no second line.
      for (const d of conflicts.filter((c) => c.rule === 'two_hard_one_day').flatMap((c) => c.days)) perDay.delete(d);
      if (![...perDay.values()].some((n) => n > 1)) continue;
      const text = `Two ${sport === 'run' ? 'runs' : 'rides'} land on one day.`;
      if (!notes.some((n) => n.text === text)) notes.push({ kind: 'warning', text, cite: 'Viada p143' });
    }
    return { ...wk, sessions, conflicts, notes };
  });
}

/**
 * ⛔ THE RUNNING BUILDS TOWARD RACE DAY (WORKORDER-race-builds Stage 2, 2026-09-30; the cards Michael approved:
 * "The running builds toward race day").
 *
 * What the pages print:
 * - p148: change each bucket "by less than 10 percent per week, though ideally 5 percent is as high as I will usually
 *   go". The easy runs and the long run are p146's sub-VT1 bucket, so the bucket grows `RACE_WEEKLY_GROWTH` a week.
 * - p151: a marathon programme "steadily increases mileage". p251: "progressive increases in the duration of the longer
 *   weekend run is an important variable".
 * - Where the week's step goes when two sessions can take it: the easy runs first, the long run after — the same order
 *   the ride length step already uses (`length-step.ts`; p107, p108, p149).
 * - How far: each session up to the most its level builds (the caller measures it), never past it.
 * OURS — whole minutes, rounded down, so the step never passes 5%; growth starts in week 2 (week one is the test week)
 * and the taper weeks are the page's column, untouched.
 */
export const RACE_WEEKLY_GROWTH = 0.05;

export type GrowthSlot = { key: string; role: 'easy' | 'long'; start: number; cap: number };

/** Minutes per slot for every standard week of a race block, keyed by week. Taper weeks are absent. */
export function raceGrowthSchedule(
  slots: GrowthSlot[],
  weeks: number,
  taperWeeks: number[],
  /** The block week the race plan begins; weeks before it hold the starting lengths. */
  fromWeek = 1,
): Record<number, Record<string, number>> {
  const taper = new Set(taperWeeks);
  const order = [...slots.filter((s) => s.role === 'easy'), ...slots.filter((s) => s.role === 'long')];
  const cur: Record<string, number> = Object.fromEntries(slots.map((s) => [s.key, Math.min(s.start, Math.max(s.start, s.cap))]));
  const out: Record<number, Record<string, number>> = {};
  for (let w = 1; w <= weeks; w++) {
    if (taper.has(w)) continue;
    if (w >= Math.max(2, fromWeek + 1)) {
      const bucket = Object.values(cur).reduce((a, b) => a + b, 0);
      let step = Math.floor(bucket * RACE_WEEKLY_GROWTH);
      for (const s of order) {
        if (step <= 0) break;
        const add = Math.max(0, Math.min(s.cap - cur[s.key], step));
        cur[s.key] += add;
        step -= add;
      }
    }
    out[w] = { ...cur };
  }
  return out;
}

/**
 * ⛔ THE THRESHOLD WORK IS SET BY THE RACE (WORKORDER-race-builds Stage 3, 2026-10-01). p251 and p253: "Half-marathoners
 * may choose NT workouts that focus on the 92 to 97 percent intensity, whereas marathon runners may want to incorporate
 * more NT intervals in the 89 to 94 percent range." On a race block the NT slot rotates through the book's NT sessions
 * whose work sits in the race's band, plus that race's own race-specific line (pp233–234).
 * OURS — "sits in the band" = the middle of the session's printed work range falls inside it.
 */
export const RACE_NT_BAND: Record<RaceDistance, { lo: number; hi: number }> = {
  half: { lo: 0.92, hi: 0.97 },
  marathon: { lo: 0.89, hi: 0.94 },
};

/** The NT session ids a race block rotates through, given the family's archetypes (the library's own list). */
export function raceNtRotation(
  archetypes: Array<{ id: string; raceOnly?: RaceDistance; work?: { kind?: string; lo?: number; hi?: number } }>,
  distance: RaceDistance,
): string[] {
  const band = RACE_NT_BAND[distance];
  return archetypes
    .filter((a) => {
      if (a.raceOnly) return a.raceOnly === distance;
      const w = a.work;
      if (!w || w.kind !== 'pct_threshold' || typeof w.lo !== 'number') return false;
      const mid = (w.lo + (typeof w.hi === 'number' ? w.hi : w.lo)) / 2;
      return mid >= band.lo - 1e-9 && mid <= band.hi + 1e-9;
    })
    .map((a) => a.id);
}

/**
 * ⛔ THE LIFTING DECREASES AS THE MILES INCREASE (WORKORDER-race-builds Stage 4, 2026-10-01; the marathon card Michael
 * approved: "The lifting decreases as the miles increase and holds your strength").
 * p151, whole: "steadily decrease your nonevent training as you increase your event training"; maintenance is about
 * one-third of productive volume, at least once a week; the worked example doubles the miles (30 → 60 a week) and takes
 * hypertrophy reps from 50 / 60 to about 15–16 / 20 — one-third; skill and speed work stay.
 * The factor on a week's hypertrophy sets, given its running minutes over the block's first standard week's (`ratio`):
 * 1 at the start, one-third once the running has doubled, never below one-third.
 * OURS — the straight line between p151's two printed points (ratio 1 → 1, ratio 2 → 1/3); the page prints the ends only.
 */
export function hypertrophySetFactor(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 1) return 1;
  return Math.max(1 / 3, 1 - (ratio - 1) * (2 / 3));
}

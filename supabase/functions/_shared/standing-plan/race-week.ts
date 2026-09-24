/**
 * THE RACE AT THE END OF A STANDING BLOCK — Half marathon on the Run Lead week (Stage 2, WORKORDER-run-programs-2026-09-23).
 *
 * ⛔ NOT A SECOND GENERATOR. The block is the Run Lead block (p250) built by the same composer; this file only says which
 * weeks are the page's TAPER/DELOAD column and what race week looks like. SOURCE Part E3c has the reading of p251.
 *
 * What the pages print, and what is ours:
 * - p250 prints the TAPER/DELOAD column. p251 prints no race timing (its one deload sentence is about a powerlifting meet).
 * - OURS — `RACE_TAPER_WEEKS` = 2: the sister program's number, p247 ("2 weeks out, you switch the program to the deload
 *   version"; p251 says this strength portion is "similar in structure to the Strength + 5K"). p269 prints the same 2.
 * - OURS — race day carries the race and nothing else, and nothing is built after race day: the pages print no race week.
 * - OURS — the race row's length is 13.1 miles at the athlete's easy pace, as the marathon builder already sizes its race
 *   row (`generate-run-plan` sustainable `createCompletionRaceDay`); it only sets the calendar's length. No pace target.
 */
import type { ComposedWeek, PlanSession } from './compose.ts';
import { weekConflicts } from './week-conflicts.ts';
import type { DayArrangement } from './day-map.ts';

/** OURS — see the header. p247's "2 weeks out"; ledger row in docs/STATE-SOURCES.md. */
export const RACE_TAPER_WEEKS = 2;

/** OURS — a half marathon's distance in miles (21.0975 km), the same number `generate-run-plan` uses. */
export const HALF_MARATHON_MILES = 13.1;

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

/** The race, as the block stores it (`config.standing_plan.race`) so a rebuild puts race week back the same way. */
export type StandingRace = {
  /** The race date, YYYY-MM-DD. */
  date: string;
  /** The block week race day falls in (1-based; the block's weeks are Monday-anchored). */
  week: number;
  /** The weekday of race day. */
  day: (typeof WEEKDAYS)[number];
  distance: 'half';
  /** The calendar length of the race row, minutes. */
  duration_min: number;
};

/** The weekday a YYYY-MM-DD date falls on, or null. */
export function weekdayOfIso(dateIso: string): StandingRace['day'] | null {
  const d = new Date(`${String(dateIso).slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return null;
  return WEEKDAYS[(d.getUTCDay() + 6) % 7];
}

/** The taper weeks for a block of `weeks` ending in race week: the last two, never the test week. */
export function raceTaperWeeks(weeks: number): number[] {
  const out: number[] = [];
  for (let w = Math.max(2, weeks - RACE_TAPER_WEEKS + 1); w <= weeks; w++) out.push(w);
  return out;
}

/** Words on the race row. Approved words go here; nothing else prints them. */
export const RACE_ROW_COPY = {
  // OURS — the race's distance as the row's description; the pages print no race-day session.
  half: { name: 'Half marathon', description: '13.1 miles.' },  // not-instruction: a race name and its distance
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

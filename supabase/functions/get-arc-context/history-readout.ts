/**
 * THE SEASON WIZARD'S HISTORY READOUT — returned as `arc.builder.history` when the request sends
 * `history` (2026-09-10, audit H-W10). The wizard used to read the workouts table itself, count runs,
 * rides and swims, spot "marathon-like" runs and write its advice sentences, its confirm screen's
 * conflict rows and its weeks-to-race on the phone.
 *
 *   counts / lines / notes   completed swims, runs and rides in the last 28 days (swims also 90),
 *                            the longest run in 28 days, a marathon-length run in 90 days.
 *   suggested                the swim answers those counts pre-select.
 *   weeks_to_race            `weeksUntilRace` — the count create-goal sizes a race block with.
 *   schedule_conflicts       the confirm screen's rows for the day picks sent.
 *
 * Sentences moved from `ArcSetupWizard.tsx` word for word. Nothing is added.
 */
import { weeksUntilRace } from '../_shared/weeks-until-race.ts';

export type ScheduleAsk = {
  tri: boolean;
  has_group_ride: boolean;
  group_ride_day?: string | null;
  has_group_run: boolean;
  group_run_day?: string | null;
  long_ride_day?: string | null;
  long_run_day?: string | null;
};

export type HistoryAsk = {
  race_date?: string | null;
  schedule?: ScheduleAsk | null;
};

export type WorkoutRow = { date?: string | null; type?: string | null; distance?: number | null; name?: string | null };

export type HistoryReadout = {
  swim_sessions_28: number;
  run_sessions_28: number;
  bike_sessions_28: number;
  /** "Swim: N sessions in last 4 weeks" and the run and bike lines, for sports with any. */
  history_lines: string[];
  swim_note: string;
  run_quality_hint: string;
  bike_quality_hint: string;
  suggested: { swim_intent: 'focus' | 'race' | null; swim_experience: 'steady' | 'learning' | null };
  weeks_to_race: number | null;
  schedule_conflicts: {
    group_run: string | null;
    long_ride: string | null;
    /** "No conflicts detected. Planner will optimize spacing." when neither row has one. */
    none_line: string | null;
    /** The long-days step's two sentences when both long days are the same day. */
    long_days_same: [string, string] | null;
  } | null;
};

/** How far back the counts look. */
export const HISTORY_WINDOW_DAYS = { recent: 28, swim: 90 } as const;
/** OURS — the wizard's cut-offs, none sourced: a run of 38 km or more is marathon-like; 25 and 21 km pick the long-run sentence. */
const MARATHON_LIKE_KM = 38;
const LONG_RUN_STRONG_KM = 25;
const LONG_RUN_HALF_KM = 21;
const MARATHON_NAME = /marathon|26\.2|42\.195|42k|42\.2|full\s*marathon|fm\b/;

const daysBefore = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

function fmtSwimPace(secPer100: number): string {
  const min = Math.floor(secPer100 / 60);
  const sec = Math.round(secPer100 % 60);
  return `${min}:${sec.toString().padStart(2, '0')}/100yd`;
}

export function buildHistoryReadout(args: {
  rows: WorkoutRow[];
  /** YYYY-MM-DD. */
  today: string;
  performanceNumbers: Record<string, unknown> | null | undefined;
  ask: HistoryAsk;
}): HistoryReadout {
  const { today } = args;
  const start90 = daysBefore(today, HISTORY_WINDOW_DAYS.swim);
  const start28 = daysBefore(today, HISTORY_WINDOW_DAYS.recent);
  let swim28 = 0;
  let run28 = 0;
  let bike28 = 0;
  let longestKm28 = 0;
  let marathonLike = false;
  for (const r of args.rows ?? []) {
    const d = typeof r.date === 'string' ? r.date.slice(0, 10) : '';
    if (!d || d < start90 || d > today) continue;
    const t = String(r.type ?? '').toLowerCase();
    const isSwim = t === 'swim' || t === 'swimming';
    const isRun = t === 'run';
    const isRide = t === 'ride';
    const distKm = typeof r.distance === 'number' && Number.isFinite(r.distance) && r.distance > 0 ? r.distance : 0;
    const in28 = d >= start28;
    if (isRun) {
      if (distKm >= MARATHON_LIKE_KM) marathonLike = true;
      if (MARATHON_NAME.test(String(r.name ?? '').toLowerCase())) marathonLike = true;
      if (in28 && distKm > longestKm28) longestKm28 = distKm;
    }
    if (!in28) continue;
    if (isSwim) swim28 += 1;
    if (isRun) run28 += 1;
    if (isRide) bike28 += 1;
  }
  const longestRunKm28 = longestKm28 > 0 ? Math.round(longestKm28 * 10) / 10 : null;

  const pn = args.performanceNumbers ?? {};
  const swimPaceSec = (() => {
    const n = Number(pn['swimPacePer100'] ?? pn['swimPace100'] ?? pn['swim_pace_100_yd'] ?? pn['swim_pace_per_100_sec']);
    return Number.isFinite(n) && n > 0 ? n : null;
  })();

  const swimNote = swim28 >= 3
    ? `Last 4 weeks: about ${swim28} swims/week on your log — good rhythm if you want swim focus.`
    : swim28 === 2
      ? `Last 4 weeks: 2 swims/week on your log.${swimPaceSec ? ` Pace on file: ${fmtSwimPace(swimPaceSec)}.` : ''}`
      : swim28 === 1
        ? `Last 4 weeks: 1 swim on your log.${swimPaceSec ? ` Pace on file: ${fmtSwimPace(swimPaceSec)}.` : ''}`
        : swimPaceSec
          ? `No swims in the last 4 weeks on your log — pace on file is ${fmtSwimPace(swimPaceSec)}; weekly yardage still matters for race durability.`
          : `No swims in the last 4 weeks on your log — early weeks are often about rhythm and feel before chasing pace.`;

  const runHint = (() => {
    const n = run28;
    const lead: string[] = [];
    if (marathonLike) {
      lead.push(
        'A recent marathon-length run shows in your history — favor folding weekday hard running into the long run unless back-to-back hard days already feel easy.',
      );
    } else if (longestRunKm28 != null && longestRunKm28 >= LONG_RUN_STRONG_KM) {
      lead.push(
        `Longest run in the last ~month ~${longestRunKm28} km — strong single-session stimulus; pick the separate mid-week option only if Thu-style intervals still feel fresh.`,
      );
    } else if (longestRunKm28 != null && longestRunKm28 >= LONG_RUN_HALF_KM) {
      lead.push(
        `Longest recent run ~${longestRunKm28} km — half-marathon-ish volume on file; folding into the long run stays the lower-risk weekday pattern.`,
      );
    }
    let tier: string;
    // OURS — the 10 / 6 / 3 / 1 run cut-offs have no source.
    if (n >= 10) {
      tier = `${n} completed runs in the last 4 weeks — strong run rhythm; a separate mid-week hard run after your hard bike day often works if you bounce back quickly on the run.`;
    } else if (n >= 6) {
      tier = `${n} runs in the last 4 weeks — you're running regularly; pick the separate mid-week option if hard days back-to-back have felt fine, or fold into the long run for fewer pinned hard weekdays.`;
    } else if (n >= 3) {
      tier = `${n} runs in the last 4 weeks — either pattern can work; folding into the long run is the lower weekday-stress option.`;
    } else if (n >= 1) {
      tier = `${n} run${n === 1 ? '' : 's'} in the last 4 weeks — folding harder running into the long run often fits while run consistency builds.`;
    } else {
      tier = `No runs logged in the last 4 weeks — putting harder blocks on the long run keeps mid-week simpler until running is back in rhythm.`;
    }
    const prefix = lead.length > 0 ? `${lead.join(' ')} ` : '';
    return `${prefix}${tier}`;
  })();

  const bikeHint = (() => {
    const n = bike28;
    // OURS — the 10 / 6 / 3 / 1 ride cut-offs have no source.
    if (n >= 10) {
      return `${n} completed rides in the last 4 weeks — high bike frequency; a separate mid-week hard bike session may match what your legs already expect.`;
    }
    if (n >= 6) {
      return `${n} rides in the last 4 weeks — if stacking hard bike beside your hard run day feels like a lot, folding the harder work into the long ride frees up mid-week.`;
    }
    if (n >= 3) {
      return `${n} rides in the last 4 weeks — moderate bike volume; either choice is reasonable — long-ride bias helps when the week gets cramped.`;
    }
    if (n >= 1) {
      return `${n} ride${n === 1 ? '' : 's'} in the last 4 weeks — folding structured bike work into the long ride can spare adjacent hard days.`;
    }
    return `No rides logged in the last 4 weeks — folding harder bike work into the long ride keeps weekday stress lower while cycling consistency returns.`;
  })();

  const historyLines: string[] = [];
  if (swim28 > 0) historyLines.push(`Swim: ${swim28} sessions in last 4 weeks`);
  if (run28 > 0) historyLines.push(`Run: ${run28} sessions in last 4 weeks`);
  if (bike28 > 0) historyLines.push(`Bike: ${bike28} sessions in last 4 weeks`);

  const raceDate = typeof args.ask.race_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.ask.race_date)
    ? args.ask.race_date
    : null;

  const conflicts = (() => {
    const s = args.ask.schedule;
    if (!s) return null;
    const sameDayAsGroupRide = 'Same day as group ride — planner will flag this';
    const groupRun = s.has_group_run && s.group_run_day && s.tri && s.has_group_ride && s.group_ride_day === s.group_run_day
      ? sameDayAsGroupRide
      : null;
    let longRide: string | null = null;
    if (s.tri) {
      const longRideDay = s.long_ride_day || 'saturday';
      const longRunDay = s.long_run_day || 'sunday';
      longRide = longRideDay === longRunDay
        ? 'Long ride and long run on the same day — planner will flag this'
        : (s.has_group_ride && s.group_ride_day === longRideDay ? sameDayAsGroupRide : null);
    }
    return {
      group_run: groupRun,
      long_ride: longRide,
      none_line: !groupRun && !longRide ? 'No conflicts detected. Planner will optimize spacing.' : null,
      long_days_same: s.long_ride_day && s.long_run_day && s.long_ride_day === s.long_run_day
        ? [
          'Long ride and long run on the same day is a very heavy load.',
          'Most athletes split these across Saturday and Sunday. You can continue, but the planner will flag this.',
        ] as [string, string]
        : null,
    };
  })();

  return {
    swim_sessions_28: swim28,
    run_sessions_28: run28,
    bike_sessions_28: bike28,
    history_lines: historyLines,
    swim_note: swimNote,
    run_quality_hint: runHint,
    bike_quality_hint: bikeHint,
    // OURS — two swims pre-select "race", three "focus" and "steady", none "learning"; no source.
    suggested: {
      swim_intent: swim28 >= 3 ? 'focus' : swim28 >= 2 ? 'race' : null,
      swim_experience: swim28 >= 3 ? 'steady' : swim28 === 0 ? 'learning' : null,
    },
    weeks_to_race: raceDate ? weeksUntilRace(new Date(), new Date(`${raceDate}T12:00:00`)) : null,
    schedule_conflicts: conflicts,
  };
}

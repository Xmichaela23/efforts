/**
 * THE RACE INTAKE'S NUMBERS AND ITS RACE-WEEK NOTE, WORKED OUT BY THE SERVER THAT BUILDS THE BLOCK
 * (2026-09-10, audit H-P07 and H-W06). The marathon intake prints what this returns; the phone used
 * to count its own weeks, run the mileage tables and predict the club-night placement.
 *
 *   weeks            the block length the generator is handed (`durationWeeks`), not a count from today.
 *   weekly           `validateWeeklyMiles` on the typed week: the floor ("the plan will open near N"),
 *                    week one's long run and its share of the week.
 *   tier_note        `tierMismatchNote`, the sentence itself.
 *   long_run         `longRunCeiling` on the block's own weeks and the long run the generator enters at.
 *   tier_seeds       the numbers a level button drops into the two fields.
 *
 * Distances go out in both units, rounded the way the screen printed them, so the phone converts
 * nothing.
 */
import {
  longRunCeiling,
  tierMismatchNote,
  TIER_SEEDS,
  TYPICAL_PEAK_LONG_RUN_MI,
  validateWeeklyMiles,
  type IntakeTier,
} from '../../../src/lib/run-volume-tables.ts';

const KM_PER_MI = 1.609344;
type Both = { mi: number; km: number };
const both = (mi: number, round: (n: number) => number = Math.round): Both =>
  ({ mi: round(mi), km: round(mi * KM_PER_MI) });

export type RaceIntakeReadout = {
  /** True when race day has already passed; nothing else is sent. */
  date_passed?: true;
  weeks?: number;
  /** The block is at the 20-week cap `create-goal` applies to a single race. */
  weeks_at_cap?: boolean;
  tier_seeds?: Record<IntakeTier, { weeklyMi: number; longRunMi: number }>;
  weekly?: {
    ok: boolean;
    bound: 'base_floor' | 'engine_clamp' | 'long_run_share' | null;
    floor: Both;
    long_run_week1: Both;
    share_pct: number | null;
  } | null;
  tier_note?: string | null;
  long_run?: {
    peak: Both;
    typical: [Both, Both] | null;
    short_of_table: boolean;
    /** The same weeks build a half marathon to its full arc. */
    half_full_arc: boolean;
  } | null;
};

export function raceIntakeReadout(a: {
  distanceApi: string;
  fitness: string;
  durationWeeks: number;
  typedWeeklyMi: number | null;
  typedLongRunMi: number | null;
  /** The long run handed to the generator — the rung its arc enters at. */
  entryLongRunMi: number | null;
  startISO: string | null;
  raceISO: string | null;
}): RaceIntakeReadout {
  const verdict = validateWeeklyMiles(a.distanceApi, a.fitness, a.typedWeeklyMi);
  const dates = { startDateISO: a.startISO, raceDateISO: a.raceISO };
  const reach = longRunCeiling(a.distanceApi, a.fitness, a.durationWeeks, a.entryLongRunMi, dates);
  const typical = TYPICAL_PEAK_LONG_RUN_MI[a.distanceApi] ?? null;
  const half = reach?.shortOfTable
    ? longRunCeiling('half', a.fitness, a.durationWeeks, a.entryLongRunMi, dates)
    : null;
  return {
    weeks: a.durationWeeks,
    weeks_at_cap: a.durationWeeks === 20,
    tier_seeds: TIER_SEEDS,
    weekly: verdict
      ? {
        ok: verdict.ok,
        bound: verdict.ok ? null : verdict.bound,
        floor: both(verdict.requiredMi, Math.ceil),
        long_run_week1: both(verdict.longRunWeek1Mi),
        share_pct: verdict.ok ? verdict.sharePct : null,
      }
      : null,
    tier_note: tierMismatchNote(a.fitness as IntakeTier, {
      weeklyMi: a.typedWeeklyMi,
      longRunMi: a.typedLongRunMi,
    }),
    long_run: reach
      ? {
        peak: both(reach.peakLongRunMi),
        typical: typical ? [both(typical[0]), both(typical[1])] : null,
        short_of_table: reach.shortOfTable,
        half_full_arc: !!half && !half.shortOfTable,
      }
      : null,
  };
}

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
/** The tags `generate-run-plan`'s own preview counts as a quality session (`generatePreview`). */
const HARD_TAGS = ['hard_run', 'intervals', 'tempo', 'threshold'];

type PlanSession = { day?: string; tags?: string[] };

/**
 * ⛔ THE CLUB NIGHT BESIDE THE LONG RUN, SAID ONLY WHEN THE WEEK THE SERVER BUILT SAYS IT.
 *
 * The phone said both sentences from the two day picks alone, which predicted a placement the race
 * path never confirmed — a beginner's completion block has no hard session at all, and it still read
 * "two hard days back to back". This reads the first week of the preview that holds a long run and a
 * hard session, and prints a sentence only when that week does what the sentence says.
 */
export function raceWeekNote(
  preferredDays: Record<string, unknown> | null | undefined,
  sessionsByWeek: Record<string, PlanSession[]> | null | undefined,
): string | null {
  const club = String(preferredDays?.quality_run ?? '').toLowerCase();
  const long = String(preferredDays?.long_run ?? '').toLowerCase();
  const i = DAY_ORDER.indexOf(club);
  const j = DAY_ORDER.indexOf(long);
  if (i < 0 || j < 0 || !sessionsByWeek) return null;
  const weekKeys = Object.keys(sessionsByWeek).map(Number).filter(Number.isFinite).sort((x, y) => x - y);
  const dayOf = (s: PlanSession) => String(s.day ?? '').toLowerCase();
  const isHard = (s: PlanSession) => (s.tags ?? []).some((t) => HARD_TAGS.includes(t));
  const isLong = (s: PlanSession) => (s.tags ?? []).includes('long_run');
  const week = weekKeys
    .map((k) => sessionsByWeek[String(k)] ?? [])
    .find((w) => w.some(isLong) && w.some(isHard));
  if (!week) return null;
  const longDays = week.filter(isLong).map(dayOf);
  const hardDays = week.filter(isHard).map(dayOf);
  if (i === j) {
    return longDays.includes(club) && hardDays.some((d) => d !== club)
      ? 'That is your long run day. The plan will keep the long run there and place its hard '
        + 'session elsewhere in the week.'
      : null;
  }
  const gap = Math.min(Math.abs(i - j), DAY_ORDER.length - Math.abs(i - j));
  if (gap > 1) return null;
  return longDays.includes(long) && hardDays.includes(club)
    ? 'That sits next to your long run — two hard days back to back, with about 24 hours '
      + 'between them instead of the 48 to 72 most plans leave. It is kept as you set it. Moving '
      + 'the long run, if it is the one that can move, opens the gap.'
    : null;
}

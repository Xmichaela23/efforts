/**
 * ═══ WHAT THE WEEK ADDS UP TO — miles run, miles ridden, pounds lifted ═══════════════════════════
 *
 * docs/WORKORDER-today-screen-2026-09-09.md §3b.3. Numbers only, no sentence.
 *
 * ⛔ COMPLETED WORK ONLY. This is what the athlete DID, not what the plan asked for — a planned row
 * that has not happened yet contributes nothing.
 *
 * ⛔ THE SAME READERS THE REST OF THE APP USES. Distance comes from `normalizeDistanceKm`, the
 * shared reader the calendar rows already print from; the lifted figure is `reps × weight` over the
 * logged sets, gated on both being above zero — byte-for-byte what `StrengthCompletedView`'s
 * `calculateExerciseVolume` sums per session. A second opinion about either is how two screens end
 * up printing different totals for the same week.
 */
import { normalizeDistanceKm } from './utils';
// ⛔ ONE VOCABULARY. `planned-session/enforcement.test.ts` caught a private ride/bike/cycling ladder
// here on the first draft — the exact defect that guard exists for. Ask canon, never re-spell it.
import { normalizeDiscipline } from './discipline';

const KM_TO_MILES = 0.621371;
const LB_TO_KG = 0.453592;

type LoggedSet = { reps?: unknown; weight?: unknown; completed?: unknown };
type WeekRow = {
  type?: unknown;
  workout_type?: unknown;
  /** A mapped workout row carries `workout_status`; a `get-week` unified item carries `status`. */
  workout_status?: unknown;
  status?: unknown;
  strength_exercises?: unknown;
  executed?: { strength_exercises?: unknown } | null;
};

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/**
 * ⛔ BOTH SPELLINGS OF "DONE". Today hands this the week exactly as `get-week` returned it, where a
 * row's state is `status`; every mapped workout row in the app calls the same field
 * `workout_status`. Reading only one of them is how the counts came back three zeros on a week with
 * a run, a ride and a lift in it.
 */
const isCompleted = (row: WeekRow): boolean =>
  String(row?.workout_status ?? row?.status ?? '').toLowerCase() === 'completed';

const disciplineOf = (row: WeekRow): string | null =>
  normalizeDiscipline(String(row?.type ?? row?.workout_type ?? ''));

/** `reps × weight` over one exercise's sets. Both must be above zero — a 0 lb set adds nothing. */
export function setsVolume(sets: unknown): number {
  if (!Array.isArray(sets)) return 0;
  return (sets as LoggedSet[]).reduce((total, s) => {
    const reps = n(s?.reps);
    const weight = n(s?.weight);
    return reps > 0 && weight > 0 ? total + reps * weight : total;
  }, 0);
}

export type WeekTotals = {
  /** Kilometres. The caller converts; the numbers stay in one unit until the moment they are shown. */
  runKm: number;
  rideKm: number;
  /** Pounds, the unit sets are logged in. */
  liftedLb: number;
};

export function weekTotals(rows: readonly unknown[] | null | undefined): WeekTotals {
  const out: WeekTotals = { runKm: 0, rideKm: 0, liftedLb: 0 };
  if (!Array.isArray(rows)) return out;

  for (const raw of rows as WeekRow[]) {
    if (!raw || !isCompleted(raw)) continue;
    const discipline = disciplineOf(raw);

    if (discipline === 'strength') {
      // ⚠️ THE EXECUTED BLOCK FIRST — `get-week` puts the logged sets there; the row's own column is
      // the fallback for a shape that never went through the unified mapper.
      const exercises = Array.isArray(raw.executed?.strength_exercises)
        ? (raw.executed!.strength_exercises as Array<{ sets?: unknown }>)
        : Array.isArray(raw.strength_exercises)
          ? (raw.strength_exercises as Array<{ sets?: unknown }>)
          : [];
      for (const ex of exercises) out.liftedLb += setsVolume(ex?.sets);
      continue;
    }

    const km = normalizeDistanceKm(raw as never);
    if (km == null || !Number.isFinite(km) || km <= 0) continue;
    if (discipline === 'run') out.runKm += km;
    else if (discipline === 'ride') out.rideKm += km;
  }

  return out;
}

export type WeekTotalRow = { label: string; value: string };

/**
 * The three rows, in the work order's own words and units: `Run` / `Ride` / `Lifted`, `mi` / `lb`
 * (`km` / `kg` when the athlete's units say so).
 *
 * ⚠️ A ZERO IS STILL A ROW. "0 mi" is a fact about the week; dropping the row would leave the
 * athlete guessing whether they ran nothing or the screen failed to add it up.
 */
export function weekTotalRows(totals: WeekTotals, useImperial: boolean): WeekTotalRow[] {
  const dist = (km: number) => (useImperial ? km * KM_TO_MILES : km);
  const distUnit = useImperial ? 'mi' : 'km';
  const lifted = useImperial ? totals.liftedLb : totals.liftedLb * LB_TO_KG;
  const liftedUnit = useImperial ? 'lb' : 'kg';
  const round1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
  return [
    { label: 'Run', value: `${round1(dist(totals.runKm))} ${distUnit}` },
    { label: 'Ride', value: `${round1(dist(totals.rideKm))} ${distUnit}` },
    { label: 'Lifted', value: `${Math.round(lifted).toLocaleString()} ${liftedUnit}` },
  ];
}

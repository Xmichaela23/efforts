/**
 * MY RECORD — the personal-records card, worked out here (2026-09-10, audit H-B11 / H-B12).
 *
 * ⛔ THE PAGE PRINTS; IT PICKS NOTHING. Before today `AthleticRecordPage` worked these out on the phone:
 *   · Marathon = the first completed goal whose distance or name matched /marathon|26\.2|42/ in a
 *     newest-first list — the most recent race, not the fastest, and a half marathon matched too;
 *   · "FTP (best)" = the CURRENT FTP;
 *   · Longest ride = its own scan of every completed ride;
 *   · the "Logged suggests" lines, against the typed lifts with locks ignored (`_shared/baseline-suggestions.ts`).
 *
 * Now: each race distance's FASTEST saved finish (distance words read by `normalizeDistanceToWizardToken`,
 * the vocabulary the plan wizard and State use, so "half" is never "marathon"); the highest FTP on the dated
 * FTP trail (`fitness_baselines`, kept rather than overwritten) with the date it was measured; the longest
 * ride by the same finish-time rule race results use.
 *
 * Pure: `index.ts` reads the rows, `record.test.ts` pins the output.
 */
import { normalizeDistanceToWizardToken } from '../../../src/lib/plan-wizard-distance-label.ts';
import { resolveCurrentFtp } from '../../../src/lib/resolve-current-ftp.ts';
import { actualFinishSecondsPreferElapsed, type WorkoutTimeRow } from '../_shared/race-finish-seconds.ts';
import { fmtFinishClock } from '../_shared/course-strategy-helpers.ts';
import { recordLiftRows, recordSwimPace, type RecordLiftRow, type RecordSwimPace } from '../_shared/baseline-suggestions.ts';

export type RecordFinish = { seconds: number; display: string; date: string | null; goal_id: string; name: string };

export type AthleticRecord = {
  /** Fastest saved finish per distance the card lists; null = none saved. */
  run_bests: { '10k': RecordFinish | null; half: RecordFinish | null; marathon: RecordFinish | null };
  /** The typed 5K as stored (`performance_numbers.fiveK_pace`, else `fiveK`); null = none. */
  five_k_baseline: string | null;
  /** Highest FTP on the dated trail, whole watts, and the date it was measured. */
  ftp_best: { watts: number; date: string } | null;
  longest_ride: { seconds: number; display: string; date: string | null } | null;
  swim_pace_100: RecordSwimPace;
  lifts: RecordLiftRow[];
  baselines_updated_at: string | null;
  /** False = the page shows its empty "Your record starts here" card. */
  has_content: boolean;
};

export type RecordGoalRow = {
  id: string;
  name?: string | null;
  target_date?: string | null;
  distance?: string | null;
  sport?: string | null;
  current_value?: number | null;
};

export type RecordFtpRow = { value: unknown; source_date?: string | null; created_at?: string | null };

export type RecordBaselinesRow = {
  performance_numbers?: Record<string, unknown> | null;
  learned_fitness?: Record<string, any> | null;
  locked_baselines?: Record<string, unknown> | null;
  updated_at?: string | null;
} | null;

const isRunSport = (sport: string | null | undefined) => {
  const s = String(sport || '').toLowerCase();
  return s === 'run' || s === 'running' || !sport;
};

export function buildAthleticRecord(input: {
  /** Completed event goals with a saved finish (`current_value`). */
  goals: RecordGoalRow[];
  /** `fitness_baselines` bike FTP rows, superseded ones included. */
  ftpRows: RecordFtpRow[];
  /** Completed rides. */
  rides: Array<WorkoutTimeRow & { date?: string | null }>;
  baselines: RecordBaselinesRow;
  asOf: string;
}): AthleticRecord {
  const run_bests: AthleticRecord['run_bests'] = { '10k': null, half: null, marathon: null };
  for (const g of input.goals) {
    const sec = Math.round(Number(g.current_value));
    if (!Number.isFinite(sec) || sec <= 0 || !isRunSport(g.sport)) continue;
    const key = normalizeDistanceToWizardToken(g.distance);
    if (key !== '10k' && key !== 'half' && key !== 'marathon') continue;
    const date = g.target_date ? String(g.target_date).slice(0, 10) : null;
    const cur = run_bests[key];
    // Fastest wins; a tie keeps the earlier race.
    if (!cur || sec < cur.seconds || (sec === cur.seconds && (date ?? '') < (cur.date ?? ''))) {
      run_bests[key] = { seconds: sec, display: fmtFinishClock(sec), date, goal_id: String(g.id), name: String(g.name || '') };
    }
  }

  let ftp_best: AthleticRecord['ftp_best'] = null;
  for (const r of input.ftpRows) {
    const v = Number(r.value);
    const date = String(r.source_date || r.created_at || '').slice(0, 10);
    if (!Number.isFinite(v) || v <= 0 || date.length !== 10) continue;
    const watts = Math.round(v);
    // Highest wins; a tie keeps the date it was first reached.
    if (!ftp_best || watts > ftp_best.watts || (watts === ftp_best.watts && date < ftp_best.date)) ftp_best = { watts, date };
  }

  let longest_ride: AthleticRecord['longest_ride'] = null;
  for (const w of input.rides) {
    const sec = actualFinishSecondsPreferElapsed(w);
    if (sec != null && sec > (longest_ride?.seconds ?? 0)) {
      longest_ride = { seconds: sec, display: fmtFinishClock(sec), date: w.date ? String(w.date).slice(0, 10) : null };
    }
  }

  const bl = input.baselines;
  const pn = (bl?.performance_numbers ?? {}) as Record<string, unknown>;
  const lf = bl?.learned_fitness ?? null;
  const five = String(pn.fiveK_pace || pn.fiveK || '').trim();
  const swim_pace_100 = recordSwimPace({ performanceNumbers: pn, learnedFitness: lf, asOf: input.asOf });
  const lifts = recordLiftRows({ performanceNumbers: pn, learnedFitness: lf, lockedBaselines: bl?.locked_baselines ?? null, asOf: input.asOf });

  // The page's own empty-card test, moved unchanged.
  const has_content =
    input.goals.length > 0 ||
    (typeof pn.ftp === 'number' && pn.ftp > 0) ||
    resolveCurrentFtp((bl ?? {}) as never).value != null ||
    (typeof (pn.fiveK_pace || pn.fiveK) === 'string' && String(pn.fiveK_pace || pn.fiveK).trim() !== '') ||
    (typeof pn.swimPace100 === 'string' && (pn.swimPace100 as string).trim() !== '') ||
    typeof pn.squat === 'number' ||
    typeof pn.deadlift === 'number' ||
    typeof pn.bench === 'number' ||
    typeof pn.overheadPress1RM === 'number' ||
    longest_ride != null;

  return {
    run_bests,
    five_k_baseline: five || null,
    ftp_best,
    longest_ride,
    swim_pace_100,
    lifts,
    baselines_updated_at: bl?.updated_at ? String(bl.updated_at) : null,
    has_content,
  };
}

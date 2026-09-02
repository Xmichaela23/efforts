// ============================================================================
// THE SIX-WEEK ENDURANCE CHECKPOINT — pure logic. The edge function `endurance-checkpoint` does the I/O.
//
// ⛔ THE BOOK (Viada p123, p112, p275 — read directly, transcribed in SOURCE-viada-hybrid-athlete.md):
//   · a load holds for several weeks; the trap is "a little better every week" (p111–112);
//   · after about SIX WEEKS, if the athlete is exceeding expectations — lower heart rate at completion,
//     lower reported effort, less rest — the coach moves the THRESHOLD figure by several seconds per
//     km and writes the next cycle from it (p123). Adjust the target, never the hours;
//   · for the Standard Focus programme, "few changes are needed beyond adjustment of 1RM and threshold
//     as you improve" (p275).
//
// ⛔ WHAT THIS DOES, AND DOES NOT. It DECIDES NOTHING. Threshold pace, FTP and threshold heart rate are
// learned or entered (D-462); the learner already moves them. This module reports (1) what the rows not
// yet started were priced off versus what the resolvers say now, and (2) his three signals as facts
// over the block's completed hard sessions. The athlete accepts or keeps; accept re-prices the rows.
// No verdict word, no fitted line (D-460's rule for the run read applies here too).
//
// ⚠️ OURS, labelled: the checkpoint weeks (6 and the block end), the "large move" flags (the book says
// "several seconds per km" and gives no number; we flag past 8 s/mi ≈ 5 s/km, 3% of FTP, 3 bpm), and
// the early-vs-late split of the evidence.
// ============================================================================

export type Anchors = {
  as_of?: string | null;
  threshold_sec_per_mi?: number | null;
  threshold_basis?: string | null;
  easy_sec_per_mi?: number | null;
  fiveK_sec_per_mi?: number | null;
  race_pace_sec_per_mi?: number | null;
  ftp_w?: number | null;
  lthr_bpm?: number | null;
  easy_hr_range?: { lower: number; upper: number } | null;
};

export type LiveNumbers = {
  threshold_sec_per_mi: number | null;
  threshold_source: string | null;
  ftp_w: number | null;
  ftp_source: string | null;
  lthr_bpm: number | null;
  lthr_source: string | null;
};

export const CHECKPOINT_WEEK = 6;
/** OURS — the flag thresholds for a move the book would call more than "several seconds per km". */
export const LARGE_MOVE = { threshold_sec_per_mi: 8, ftp_pct: 3, lthr_bpm: 3 } as const;
export const CHECKPOINT_IS_OURS =
  'Week 6 and the block end are ours; the book says "after six weeks" and "the next cycle". The large-move '
  + 'flags (8 s/mi, 3% FTP, 3 bpm) are ours; the book says "several seconds per kilometer" and gives no number.';

export type CheckpointDue = { due: boolean; week: number | null; reason: string };

/** Which checkpoint is due, if any. `answered` = checkpoint weeks already answered on this block. */
export function checkpointDue(currentWeek: number | null, durationWeeks: number, answered: number[]): CheckpointDue {
  if (currentWeek == null || !Number.isFinite(currentWeek)) return { due: false, week: null, reason: 'no plan week' };
  const done = new Set(answered.map((w) => Number(w)));
  if (currentWeek > CHECKPOINT_WEEK && !done.has(CHECKPOINT_WEEK) && currentWeek <= durationWeeks) {
    return { due: true, week: CHECKPOINT_WEEK, reason: `week ${CHECKPOINT_WEEK} is behind you and unanswered` };
  }
  if (currentWeek > durationWeeks && !done.has(durationWeeks)) {
    return { due: true, week: durationWeeks, reason: 'the block has ended' };
  }
  return { due: false, week: null, reason: currentWeek <= CHECKPOINT_WEEK ? `not until week ${CHECKPOINT_WEEK + 1}` : 'answered' };
}

export type NumberChange = {
  key: 'threshold_pace' | 'ftp' | 'lthr';
  /** What the unstarted rows were priced off. Null when the rows carry no stamp (built before the stamp shipped). */
  on_plan: number | null;
  live: number | null;
  source: string | null;
  /** live − on_plan, in the number's own unit. Null when either side is missing. */
  delta: number | null;
  moves: boolean;
  large: boolean;
  unit: 'sec/mi' | 'W' | 'bpm';
};

/** The rows' anchors versus the live resolvers. Facts; no verdict. */
export function diffAnchors(onPlan: Anchors | null | undefined, live: LiveNumbers): NumberChange[] {
  const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
  const row = (
    key: NumberChange['key'], unit: NumberChange['unit'], plan: number | null, now: number | null, source: string | null,
    large: (delta: number, plan: number) => boolean,
  ): NumberChange => {
    const delta = plan != null && now != null ? now - plan : null;
    return { key, on_plan: plan, live: now, source, delta, moves: delta != null && delta !== 0, large: delta != null && large(Math.abs(delta), plan!), unit };
  };
  return [
    row('threshold_pace', 'sec/mi', n(onPlan?.threshold_sec_per_mi), live.threshold_sec_per_mi, live.threshold_source,
      (d) => d > LARGE_MOVE.threshold_sec_per_mi),
    row('ftp', 'W', n(onPlan?.ftp_w), live.ftp_w, live.ftp_source,
      (d, plan) => d / plan * 100 > LARGE_MOVE.ftp_pct),
    row('lthr', 'bpm', n(onPlan?.lthr_bpm), live.lthr_bpm, live.lthr_source,
      (d) => d > LARGE_MOVE.lthr_bpm),
  ];
}

/** One completed hard session, as the evidence read sees it. */
export type HardSession = {
  date: string;
  sport: 'run' | 'ride';
  avg_hr: number | null;
  /** sec/km for runs, W for rides — the "same work" the heart rate is read against. */
  work: number | null;
  rpe: number | null;
  drift_pct: number | null;
};

export type EvidenceHalf = { sessions: number; avg_hr: number | null; avg_work: number | null; avg_rpe: number | null; avg_drift_pct: number | null };
export type Evidence = {
  sport: 'run' | 'ride';
  sessions: number;
  early: EvidenceHalf;
  late: EvidenceHalf;
  /** p123's three signals, each as a bare difference late − early. Null when either half is empty. */
  hr_change_bpm: number | null;
  rpe_change: number | null;
  drift_change_pct: number | null;
  work_change: number | null;
};

const mean = (xs: (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
};

/**
 * The block's completed hard sessions for one sport, split early / late by date. Facts only —
 * lower heart rate, lower effort, lower drift late versus early are p123's signals; the numbers
 * are handed over, not judged.
 */
export function evidenceFor(sport: 'run' | 'ride', sessions: HardSession[]): Evidence {
  const s = sessions.filter((x) => x.sport === sport).sort((a, b) => a.date.localeCompare(b.date));
  const half = Math.floor(s.length / 2);
  const early = s.slice(0, half), late = s.slice(half);
  const summarise = (xs: HardSession[]): EvidenceHalf => ({
    sessions: xs.length,
    avg_hr: mean(xs.map((x) => x.avg_hr)),
    avg_work: mean(xs.map((x) => x.work)),
    avg_rpe: mean(xs.map((x) => x.rpe)),
    avg_drift_pct: mean(xs.map((x) => x.drift_pct)),
  });
  const e = summarise(early), l = summarise(late);
  const diff = (a: number | null, b: number | null) => (a != null && b != null ? Math.round((b - a) * 10) / 10 : null);
  return {
    sport, sessions: s.length, early: e, late: l,
    hr_change_bpm: diff(e.avg_hr, l.avg_hr),
    rpe_change: diff(e.avg_rpe, l.avg_rpe),
    drift_change_pct: diff(e.avg_drift_pct, l.avg_drift_pct),
    work_change: diff(e.avg_work, l.avg_work),
  };
}

/** Which planned rows a checkpoint may re-price: endurance, not started, on or after today. */
export function isRepriceable(row: { type?: unknown; date?: unknown; workout_status?: unknown; completed_workout_id?: unknown }, today: string): boolean {
  const t = String(row?.type ?? '').toLowerCase();
  if (!(t === 'run' || t === 'ride' || t === 'bike' || t === 'cycling')) return false;
  if (row?.completed_workout_id) return false;
  const status = String(row?.workout_status ?? '').toLowerCase();
  if (status === 'completed' || status === 'skipped') return false;
  return String(row?.date ?? '') >= today;
}

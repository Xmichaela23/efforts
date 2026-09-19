// Planned ride → Intervals.icu planned-workout event (Phase 0, 2026-09-12).
//
// Reads ONLY the saved step list (`planned_workouts.computed.steps`) and the FTP the ride was built on
// (`computed.anchors.ftp_w`). It does not re-read tokens, `workout_structure` or `intervals`: if the saved
// steps are missing or a step cannot be written, it throws `IntervalsSerializeError` naming the step.
//
// Power goes out as PERCENT OF FTP, not watts. Zwift, Wahoo and Garmin workouts delivered through
// Intervals are scaled to the FTP each of those apps holds, and Intervals converts absolute watts using
// ITS OWN FTP setting (180 W by default on a new account, read 2026-09-12). Percent of the FTP the ride
// was built on reproduces the plan's own percentages (e.g. 137-158 W on 210 W → 65-75%).
//
// Workout text grammar, from Intervals.icu "Workout Builder Syntax Quick Guide"
// (forum.intervals.icu/t/workout-builder-syntax-quick-guide/123701):
//   `- [cue] [duration] [target]`   duration `1h2m30s` · power `95-105%` · `freeride` = no target (ERG off)
// Event fields, from "Uploading planned workouts to Intervals.icu"
// (forum.intervals.icu/t/uploading-planned-workouts-to-intervals-icu/63624):
//   category WORKOUT · start_date_local `YYYY-MM-DDT00:00:00` · type · name · description · external_id

import { oneSidedPowerText, shownPowerRange } from '../ride-power.ts';
import { sendDescription } from '../standing-plan/family-lines.ts';

export class IntervalsSerializeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntervalsSerializeError';
  }
}

export type IntervalsEvent = {
  category: 'WORKOUT';
  start_date_local: string;
  type: 'Ride';
  name: string;
  description: string;
  moving_time: number;
  target: 'POWER';
  external_id: string;
};

type PlannedRideRow = {
  id: string;
  date: string;
  type: string;
  name?: string | null;
  description?: string | null;
  tags?: unknown;
  computed?: { steps?: unknown; anchors?: { ftp_w?: unknown } | null } | null;
};

const CUE_BY_KIND: Record<string, string> = { warmup: 'Warmup', cooldown: 'Cooldown', recovery: 'Recovery' };

export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h ? `${h}h` : ''}${m ? `${m}m` : ''}${s ? `${s}s` : ''}`;
}

function stepLine(step: any, index: number, ftp: number): string {
  const where = `step ${index}`;
  const seconds = Number(step?.seconds);
  if (!Number.isInteger(seconds) || seconds <= 0) {
    throw new IntervalsSerializeError(`${where}: no duration in seconds (${JSON.stringify(step?.seconds)})`);
  }
  const kind = String(step?.kind ?? '');
  const label = typeof step?.label === 'string' ? step.label.trim() : '';
  /**
   * ⛔ A LABEL WITH DIGITS OR % GOES ON ITS OWN LINE ABOVE THE STEP (2026-09-18, book-language pass 4, audit §4).
   * A cue is free text before the duration, and digits or % in it would be read as a duration or a target — so this
   * threw, and every ride whose steps carry the page's words ("3 minutes at high intensity. Push yourself at a 9/10
   * effort", "5 minutes @ 95%") never reached Intervals.icu or Zwift: the FTP test first of all. A line that does not
   * start with "-" is text in the workout (same Quick Guide as above), so the page's words print over the step and the
   * step keeps its kind's cue. ⚠️ A line ending in "Nx" would start a repeat, so that one still refuses.
   * ⚠️ Read off the Quick Guide, not yet seen on a live Intervals.icu calendar.
   */
  let heading = '';
  let cueLabel = label;
  if (label && /[\d%]/.test(label)) {
    if (/\b\d+x\s*$/i.test(label)) {
      throw new IntervalsSerializeError(`${where}: label "${label}" ends in "Nx", which Intervals would read as a repeat`);
    }
    heading = label;
    cueLabel = '';
  }
  const cue = cueLabel || CUE_BY_KIND[kind] || '';

  /**
   * ⛔ p237's FLOOR GOES AS FLOOR TO 130% OF FTP (round 5, 2026-09-18, Michael's ruling: every step has a top except
   * sprints) — the range the screen prints (`shownPowerRange`: the saved `shown_upper` where the score has no top).
   */
  const shown = step?.powerRange != null ? shownPowerRange(step.powerRange) : null;
  const lo = Number(shown?.lower);
  const hi = Number(shown?.upper);
  /**
   * ⛔ A ONE-SIDED STEP GOES OUT AS THE PAGE'S WORDS, WITH NO TARGET (2026-09-18, round 3, audit items 16 and 17).
   * p239's easy step ("under 173 W"): a target here is one number or a range ERG holds, and a range starting at 0 is
   * refused, so it goes as freeride (ERG off) under a text line carrying the same words the screen prints
   * (`oneSidedPowerText`). A floor with no top at all (a step saved before round 5) goes the same way.
   */
  const oneSided = step?.powerRange != null
    ? oneSidedPowerText(shown?.lower, shown?.upper ?? null)
    : null;
  if (oneSided) heading = heading ? `${heading}\n${oneSided}` : oneSided;
  let target: string;
  if (step?.powerRange == null || oneSided) {
    // The plan gives this step no power (e.g. a sprint by feel), or a floor or ceiling only: ERG off.
    target = 'freeride';
  } else if (Number.isFinite(lo) && Number.isFinite(hi) && lo > 0 && hi >= lo) {
    const pLo = Math.round((lo / ftp) * 100);
    const pHi = Math.round((hi / ftp) * 100);
    target = pLo === pHi ? `${pLo}%` : `${pLo}-${pHi}%`;
  } else {
    throw new IntervalsSerializeError(`${where}: unreadable power range ${JSON.stringify(step.powerRange)}`);
  }
  const line = `- ${cue ? `${cue} ` : ''}${formatDuration(seconds)} ${target}`;
  return heading ? `${heading}\n${line}` : line;
}

export function serializeRide(row: PlannedRideRow): IntervalsEvent {
  if (String(row.type).toLowerCase() !== 'ride') {
    throw new IntervalsSerializeError(`planned workout ${row.id}: type "${row.type}" is not a ride`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(row.date))) {
    throw new IntervalsSerializeError(`planned workout ${row.id}: date "${row.date}" is not YYYY-MM-DD`);
  }
  const steps = row.computed?.steps;
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new IntervalsSerializeError(`planned workout ${row.id}: no saved steps`);
  }
  const ftp = Number(row.computed?.anchors?.ftp_w);
  if (!Number.isFinite(ftp) || ftp <= 0) {
    throw new IntervalsSerializeError(`planned workout ${row.id}: no FTP saved with the steps (computed.anchors.ftp_w)`);
  }

  const lines = steps.map((s, i) => stepLine(s, i, ftp));
  // ⛔ THE TYPE LINE LEADS THE NOTE (2026-09-19) — the order Today and the session sheet print them (`sendDescription`).
  const note = sendDescription(row).trim();
  // A line that does not start with "-" is a heading; a heading ending in "Nx" starts a repeat.
  if (note && note.split('\n').some((l) => /\b\d+x\s*$/i.test(l.trim()))) {
    throw new IntervalsSerializeError(`planned workout ${row.id}: session note has a line ending in "Nx", which Intervals would read as a repeat`);
  }
  const description = note ? `${note}\n\n${lines.join('\n')}` : lines.join('\n');
  const moving_time = steps.reduce((sum, s: any) => sum + Number(s.seconds), 0);

  return {
    category: 'WORKOUT',
    start_date_local: `${row.date}T00:00:00`,
    type: 'Ride',
    name: String(row.name ?? '').trim() || 'Ride',
    description,
    moving_time,
    target: 'POWER',
    external_id: row.id,
  };
}

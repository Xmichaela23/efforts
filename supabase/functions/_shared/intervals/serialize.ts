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

import { FLOOR_ONLY_SENT_CEILING_PCT_OF_FTP } from '../plan-tokens/quality-work.ts';

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
  // A cue is free text before the duration. Digits or % in it would be read as a duration or a target.
  if (label && /[\d%]/.test(label)) {
    throw new IntervalsSerializeError(`${where}: label "${label}" contains digits or %, which Intervals would read as part of the step`);
  }
  const cue = label || CUE_BY_KIND[kind] || '';

  const lo = Number(step?.powerRange?.lower);
  // ⛔ A FLOOR WITH NO CEILING GOES OUT WITH THE PAGE'S OWN TOP (2026-09-16, p237 "start at 110%, progress to
  // 125-130%") — the same number the Garmin sender fills in. Without it the whole ride was refused.
  const floorOnly = step?.powerRange != null && step.powerRange.upper == null && Number.isFinite(lo) && lo > 0;
  const hi = floorOnly ? Math.max(lo, ftp * FLOOR_ONLY_SENT_CEILING_PCT_OF_FTP) : Number(step?.powerRange?.upper);
  let target: string;
  if (step?.powerRange == null) {
    // The plan gives this step no power (e.g. a sprint by feel): ERG off.
    target = 'freeride';
  } else if (Number.isFinite(lo) && Number.isFinite(hi) && lo > 0 && hi >= lo) {
    const pLo = Math.round((lo / ftp) * 100);
    const pHi = Math.round((hi / ftp) * 100);
    target = pLo === pHi ? `${pLo}%` : `${pLo}-${pHi}%`;
  } else {
    throw new IntervalsSerializeError(`${where}: unreadable power range ${JSON.stringify(step.powerRange)}`);
  }
  return `- ${cue ? `${cue} ` : ''}${formatDuration(seconds)} ${target}`;
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
  const note = String(row.description ?? '').trim();
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

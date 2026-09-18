/**
 * ⛔ STATE'S "This week" LINE — the plan week so far, as time per sport (2026-09-18, approved by Michael):
 * `strength 2h 10m · run 2h 30m · bike 3h 40m`. It replaced the planned-vs-done session bars.
 *
 * Completed sessions only; each session's time is `completedMovingSeconds` — the one moving-time answer the
 * calendar, Today and Details print. The four trainable disciplines only (`normalizeDiscipline`); a walk or a
 * mobility session is not a sport here. A sport with nothing done is left out. Fixed order, strength first.
 * Minutes under an hour read "45m"; a whole hour reads "2h".
 */
import { completedMovingSeconds } from './moving-seconds.ts';
import { normalizeDiscipline } from '../../../src/lib/discipline.ts';

const ORDER: Array<{ key: 'strength' | 'run' | 'ride' | 'swim'; word: string }> = [
  { key: 'strength', word: 'strength' },
  { key: 'run', word: 'run' },
  { key: 'ride', word: 'bike' },
  { key: 'swim', word: 'swim' },
];

export function hoursMinutes(totalSeconds: number): string {
  const m = Math.round(totalSeconds / 60);
  const h = Math.floor(m / 60), r = m % 60;
  if (h === 0) return `${r}m`;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
}

/** Rows are completed `workouts` rows in the week. Null when nothing has any time. */
export function weekTimeLine(rows: ReadonlyArray<Record<string, unknown>>): string | null {
  const secs = new Map<string, number>();
  for (const r of rows) {
    if (String(r?.workout_status ?? '').toLowerCase() !== 'completed') continue;
    const d = normalizeDiscipline(String(r?.type ?? ''));
    if (!d) continue;
    const s = completedMovingSeconds(r);
    if (s == null || !(s > 0)) continue;
    secs.set(d, (secs.get(d) ?? 0) + s);
  }
  const parts = ORDER
    .filter((o) => (secs.get(o.key) ?? 0) >= 30) // under half a minute rounds to "0m" — nothing to print
    .map((o) => `${o.word} ${hoursMinutes(secs.get(o.key)!)}`);
  return parts.length ? parts.join(' · ') : null;
}

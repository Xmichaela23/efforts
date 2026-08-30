// Deload-week detection — the ONE place this logic lives (architecture contract #3).
//
// Today: name-based (`/deload/i`, the app convention per D-124), read off the point's
// carried workout name in `meta.name`. Points in a deload week are EXCLUDED from the trend
// so a deliberately-light block doesn't false-read as "sliding".
//
// When the server `WeekPhase` flag (supabase/functions/_shared/athlete-snapshot/
// body-response.ts) is plumbed through to the client, swap HERE: read
// `meta.weekPhase === 'deload'` instead of the name regex, and — together with the verdict
// labeler — change exclude → "Holding (deload)". That is a one-spot change by design;
// nothing else in the trend layer knows deloads exist.

import type { TrendPoint } from './types.ts';

export function isDeloadWeek(p: TrendPoint): boolean {
  // D-338 — THE SWAP THIS FILE HAS BEEN ASKING FOR SINCE IT WAS WRITTEN (see the header).
  //
  // The name regex below never fired on the strength series: `liftSeriesFromExerciseLog` built its
  // points as `{date, value}` with no meta of any kind, so a deliberately light week has been
  // landing on the trend as an ordinary session for as long as the series has existed. On the previous program that
  // week is 40/50/60% of the working number — an estimate ~30% below its neighbours — which is
  // enough on its own to read as "your strength is slipping" on a week the athlete followed exactly.
  //
  // `meta.phase` is now resolved per DATE by the caller, off the one plan-phase resolver
  // (`plan-phase.ts`), so it is true whether or not the session was ever attached to its planned day.
  const phase = typeof p.meta?.phase === 'string' ? (p.meta.phase as string) : '';
  if (/deload|recovery/i.test(phase)) return true;
  const name = typeof p.meta?.name === 'string' ? (p.meta.name as string) : '';
  return /deload/i.test(name);
}

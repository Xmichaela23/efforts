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

import type { TrendPoint } from './types';

export function isDeloadWeek(p: TrendPoint): boolean {
  const name = typeof p.meta?.name === 'string' ? (p.meta.name as string) : '';
  return /deload/i.test(name);
}

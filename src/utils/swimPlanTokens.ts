/**
 * Planned swim title helpers.
 *
 * ⛔ THE TOKEN READERS ARE GONE (2026-09-10, audit H-T18 / H-T20). This file summed yards out of
 * `steps_preset`, built the distance chip (token yards, else a number in the name, else the steps'
 * metres) and the bucket subtitle line. materialize-plan writes both now —
 * `computed.swim_distance.label` and `friendly_summary` (`supabase/functions/_shared/swim/swim-plan-summary.ts`)
 * — and every surface prints those.
 */

/** Strip trailing " — 2800 yd" / meters suffixes from planned swim names (often out of sync with steps_preset). */
export function stripTrailingSwimDistanceFromTitle(title: string): string {
  let s = String(title || '').trim();
  let prev = '';
  while (s !== prev) {
    prev = s;
    s = s.replace(/\s*[—–-]\s*\d[\d,]*\s*(?:yd|m)\s*$/i, '').trim();
  }
  return s;
}

/** Primary swim session label without distance chip — prefers workout_structure.title, then name. */
export function plannedSwimSessionLabel(workout: {
  type?: string;
  name?: string | null;
  workout_structure?: { title?: string | null } | unknown | null;
}): string {
  const type = String(workout?.type ?? '').toLowerCase();
  if (type !== 'swim') return String(workout?.name || '').trim() || 'Session';

  let wsTitle = '';
  try {
    const ws = workout?.workout_structure as { title?: string | null } | null | undefined;
    if (ws && typeof ws === 'object' && typeof ws.title === 'string') wsTitle = ws.title.trim();
  } catch {}
  const nm = String(workout?.name || '').trim();
  const raw = wsTitle || nm;
  const stripped = stripTrailingSwimDistanceFromTitle(raw);
  return stripped || 'Swim';
}

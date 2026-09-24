/**
 * ⛔ WHAT YOUR WEEK PRINTS AND SENDS BACK, DECIDED HERE (2026-09-22, Michael: "smart server, dumb client").
 *
 * Every preview session gets two server answers so the phone only draws and carries:
 *   · `planned_duration_label` — the Home calendar's own words for the length (`planned-duration-label.ts`, the
 *     one `get-week` prints), so a session reads the same on Your week and on Home;
 *   · `pick` — what a drop of this session is, and under which key the builder reads it back:
 *       long  → the long day (`long_run_day` / `long_ride_day`), key = the sport;
 *       easy  → an extra easy run, key = its place among the week's extra runs (`easy_days[i]`);
 *       slot  → a frame endurance slot, key = `${frameDay}:${i}` (`slot_days`);
 *       lift  → a lifting day, key = the frame's own label (`lift_days`).
 *     Absent on a session that does not move (the plyo warm-up rides with its day; swim add-ons).
 */
import { plannedDurationFields } from '../planned-duration-label.ts';
import { JOINED_PART_TAG } from './frames.ts';

export type PreviewPick = { kind: 'long' | 'easy' | 'slot' | 'lift'; key: string };

type Row = Record<string, unknown> & { type?: string; name?: string; tags?: unknown };

const tagsOf = (r: Row): string[] => (Array.isArray(r.tags) ? (r.tags as unknown[]).map(String) : []);

function pickOf(r: Row, fillIndex: () => number): PreviewPick | null {
  const tags = tagsOf(r);
  const type = String(r.type ?? '').toLowerCase();
  if (tags.includes('plyo')) return null;
  // ⛔ The second half of one run (p245 / p253) moves with the first; it is not dragged on its own.
  if (tags.includes(JOINED_PART_TAG)) return null;
  if (tags.includes('long_run') || tags.includes('long_ride') || tags.includes('family:run_lsd')) {
    return { kind: 'long', key: type === 'ride' ? 'ride' : 'run' };
  }
  if (tags.includes('volume_fill') && type === 'run') return { kind: 'easy', key: String(fillIndex()) };
  const slot = tags.find((t) => t.startsWith('slot:'))?.slice('slot:'.length);
  if (slot && (type === 'run' || type === 'ride')) return { kind: 'slot', key: slot };
  if (type === 'strength' && r.name) return { kind: 'lift', key: String(r.name) };
  return null;
}

/** The preview's weeks with the two fields stamped on every session. Unknown shapes pass through untouched. */
export function withPreviewFields(sessionsByWeek: unknown): unknown {
  if (!sessionsByWeek || typeof sessionsByWeek !== 'object') return sessionsByWeek;
  const out: Record<string, unknown> = {};
  for (const [week, rows] of Object.entries(sessionsByWeek as Record<string, unknown>)) {
    if (!Array.isArray(rows)) { out[week] = rows; continue; }
    let fills = 0;
    out[week] = rows.map((r: Row) => {
      const pick = pickOf(r, () => fills++);
      return {
        ...r,
        planned_duration_label: plannedDurationFields(r, r.type).planned_duration_label,
        ...(pick ? { pick } : {}),
      };
    });
  }
  return out;
}

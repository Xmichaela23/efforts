/**
 * A PLANNED SESSION'S LENGTH, AS THE HEADER PRINTS IT — decided here, sent by get-week
 * (2026-09-10, audit H-T01 / H-T02, Stage 2 item 10).
 *
 * ⛔ WHAT THE PHONE USED TO DECIDE. `PlannedSessionHeader.formatSessionDuration` ran the phone's own
 * five-rung duration ladder, priced a lifting session off its rows at 2–4 seconds a rep, and hid the
 * plyo day's time — three decisions on the card, the drawer and the planned screen. They are made once
 * here and travel as two fields on the planned row:
 *   · `planned_duration_seconds` — `resolvePlannedDurationSeconds`, the length every server reader uses;
 *   · `planned_duration_label`   — the words: `30–40 min` for a lift priced off its rows, `63:00`
 *     for everything else, and nothing for the plyo day (Michael, 2026-09-09: the drill day has no
 *     length on the row or on the page, so none is shown).
 */
import { resolvePlannedDurationSeconds } from '../_shared/planned-duration.ts';
import { strengthSessionMinutes } from '../_shared/strength-session-minutes.ts';

const STRENGTH_TYPES = new Set(['strength', 'weight_training', 'weights', 'lift']);

function tagsOf(raw: unknown): string[] {
  let tags: unknown[] = [];
  if (Array.isArray(raw)) tags = raw;
  else if (typeof raw === 'string') {
    try { const p = JSON.parse(raw); if (Array.isArray(p)) tags = p; } catch { /* not JSON */ }
  }
  return tags.map((t) => String(t).toLowerCase());
}

export type PlannedDurationFields = {
  planned_duration_seconds: number | null;
  planned_duration_label: string | null;
};

/** `row` is the raw `planned_workouts` row; `type` the item's type when it differs from the row's. */
export function plannedDurationFields(row: any, type?: string | null): PlannedDurationFields {
  const secs = resolvePlannedDurationSeconds(row);
  if (tagsOf(row?.tags).includes('plyo')) return { planned_duration_seconds: secs, planned_duration_label: null };

  const kind = String(type ?? row?.type ?? '').trim().toLowerCase();
  if (STRENGTH_TYPES.has(kind)) {
    const exercises = typeof row?.strength_exercises === 'string'
      ? (() => { try { return JSON.parse(row.strength_exercises); } catch { return null; } })()
      : row?.strength_exercises;
    const m = strengthSessionMinutes(exercises);
    if (m) return { planned_duration_seconds: secs, planned_duration_label: m.low === m.high ? `${m.low} min` : `${m.low}–${m.high} min` };
  }
  return {
    planned_duration_seconds: secs,
    planned_duration_label: secs != null && secs > 0 ? `${Math.max(1, Math.round(secs / 60))}:00` : null,
  };
}

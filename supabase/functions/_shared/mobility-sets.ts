/**
 * ⛔ A MOBILITY SESSION'S LOGGER ROWS, WRITTEN BY THE SERVER (2026-09-10, audit H-T12).
 *
 * The phone turned `mobility_exercises` into logger rows in three places (`AppLayout`), parsing sets,
 * reps and weight out of text ("2x8", "20 lb"), and the three disagreed: the calendar path left reps
 * blank when the text named none, the two add-menu paths wrote 8 reps (no source), and one of them
 * forced 1 set. materialize-plan now writes `computed.mobility_sets` from this function and every
 * path hands those rows to the logger.
 *
 * ⚠️ THE CALENDAR PATH IS THE ONE MOVED — it read the most (stored seconds, explicit reps, per-side
 * rows) and invented no rep count. The words `(Left)`, `(Right)` and `Mobility` are its own.
 */

export type MobilitySet = {
  name: string;
  sets: number;
  reps?: number;
  duration_seconds?: number;
  weight: number;
  notes: string;
};

/** OURS — no source. A row that names no set count is logged as one set (the calendar path's default). */
const SETS_WHEN_UNSTATED = 1;

function listOf(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

function storedWeight(m: Record<string, unknown>): number | null {
  if (typeof m?.weight === 'number' && Number.isFinite(m.weight)) return m.weight;
  if (typeof m?.weight === 'string') {
    const pw = parseFloat(m.weight);
    return Number.isFinite(pw) ? pw : 0;
  }
  return null;
}

export function mobilitySetsFrom(raw: unknown): MobilitySet[] {
  return listOf(raw).flatMap((m): MobilitySet[] => {
    const baseName = String(m?.name || '').trim() || 'Mobility';
    const notes = String(m?.description || m?.notes || '').trim();
    const perSide = m?.per_side === true;
    const statedSets = Number(m?.sets) || SETS_WHEN_UNSTATED;

    // A timed hold: seconds stored on the row.
    if (typeof m?.duration_seconds === 'number' && m.duration_seconds > 0) {
      const w = storedWeight(m) ?? 0;
      const one = { duration_seconds: m.duration_seconds, weight: w, notes };
      if (perSide) {
        const rows: MobilitySet[] = [];
        for (let s = 0; s < statedSets; s++) {
          rows.push({ name: `${baseName} (Left)`, sets: 1, ...one });
          rows.push({ name: `${baseName} (Right)`, sets: 1, ...one });
        }
        return rows;
      }
      return [{ name: baseName, sets: statedSets, ...one }];
    }

    // Reps: explicit, else "2x8" / "2 sets of 8", else "2 sets" alone (reps left open).
    const durTxt = String(m?.duration || m?.plannedDuration || '').toLowerCase();
    let sets = statedSets;
    let reps: number | undefined = undefined;
    if (typeof m?.reps === 'number' && m.reps > 0) {
      reps = m.reps;
    } else {
      const mr = durTxt.match(/(\d+)\s*x\s*(\d+)/i) || durTxt.match(/(\d+)\s*sets?\s*of\s*(\d+)/i);
      if (mr) {
        sets = parseInt(mr[1], 10) || SETS_WHEN_UNSTATED;
        reps = parseInt(mr[2], 10) || undefined;
      } else {
        const setsOnly = durTxt.match(/(\d+)\s*sets?/i);
        if (setsOnly) sets = parseInt(setsOnly[1], 10) || SETS_WHEN_UNSTATED;
      }
    }

    // The stored load, else a load written in the row's text.
    let w = storedWeight(m);
    if (w == null) {
      const blob = `${String(m?.name || '')} ${String(m?.description || '')} ${String(m?.notes || '')} ${String(m?.duration || '')}`;
      const mw = blob.match(/(\d+(?:\.\d+)?)\s*(lb|lbs|kg)\b/i);
      const pw = mw ? parseFloat(mw[1]) : NaN;
      w = Number.isFinite(pw) ? pw : 0;
    }

    const repsPart = reps !== undefined ? { reps } : {};
    if (perSide) {
      const rows: MobilitySet[] = [];
      for (let s = 0; s < sets; s++) {
        rows.push({ name: `${baseName} (Left)`, sets: 1, ...repsPart, weight: w, notes });
        rows.push({ name: `${baseName} (Right)`, sets: 1, ...repsPart, weight: w, notes });
      }
      return rows;
    }
    return [{ name: baseName, sets, ...repsPart, weight: w, notes }];
  });
}

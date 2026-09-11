/**
 * ⛔ THE SENTENCE ON EACH PLANNED STRENGTH ROW, WRITTEN BY THE SERVER (2026-09-10, audit H-D14).
 *
 * The phone built it on every render (`src/utils/strengthFormatter.ts`): the book's word for the slot,
 * sets × reps, the reserve, the weight with "(was …)" or "[Setup Required]", one of four load-basis
 * sentences, the notes, and "— last time N". materialize-plan now stamps `strength.display_line` on
 * every strength step and `computed.strength_lines` on the session (a superset pair on one line, its
 * sentence first), and the planned screens print those.
 *
 * ⚠️ MOVED WORD FOR WORD. One change: "(was X lb)" names the athlete's unit, the same unit
 * `weight_display` now carries, instead of always "lb".
 */

export type WeightUnit = 'lb' | 'kg';

/**
 * OURS — no source. A row that auto-regulates its load but carries no reserve target reads "leaves 1-2
 * in reserve". The phone's number, moved as it was. ⚠️ It disagrees with materialize-plan's own
 * `fallbackUnresolvedPercentDisplay` ("with 2 in reserve", D-071) on a different kind of row.
 */
const RESERVE_WHEN_NO_TARGET = '1 to 2'; // matches the approved HYP cue "1 to 2 in reserve" (Michael, 2026-09-10)

const BOOK_WORDS = new Set(['ME', 'DE', 'SKILL', 'HYP']);

function rirTextOf(exercise: any): string | null {
  const r = Number(exercise?.target_rir);
  if (exercise?.target_rir == null || !Number.isFinite(r) || r < 0) return null;
  const lo = Math.floor(r), hi = Math.ceil(r);
  return lo === hi ? String(lo) : `${lo} to ${hi}`; // "1 to 2", the approved form, never "1-2"
}

const nameOf = (x: any) => String(x?.execution_name || x?.name || '').replace(/_/g, ' ').trim();

/** One row's line. */
export function formatStrengthExercise(exercise: any, unit: WeightUnit = 'lb'): string {
  // Display name only: `execution_name` is what the athlete's kit reaches; `name` stays the matching key.
  const name = nameOf(exercise);
  const sets = Number(exercise?.sets) || 0;
  const reps = exercise?.reps;

  // The book's word for the set leads (ME / DE / SKILL / HYP, p218), and the reserve the row carries is printed.
  const intent = String(exercise?.slot_intent || '').toUpperCase();
  const bookWord = BOOK_WORDS.has(intent) ? intent : null;
  const rirText = rirTextOf(exercise);
  const parts: string[] = [bookWord ? `${bookWord} · ${name}` : name];
  if (sets > 0 && reps != null) parts.push(`${sets}×${reps}`);
  if (rirText && bookWord !== 'ME') parts.push(`· ${rirText} in reserve`);

  const weightDisplay = exercise?.weight_display;
  if (weightDisplay && weightDisplay !== 'Bodyweight' && weightDisplay !== 'Band') {
    if (exercise?.adjusted && exercise?.original_weight != null) {
      parts.push(`@ ${weightDisplay} (was ${exercise.original_weight} ${unit})`);
    } else {
      parts.push(`@ ${weightDisplay}`);
    }
  } else if (exercise?.baseline_missing) {
    parts.push(`@ [Setup Required]`);
  }

  // A by-feel row says which kind of by-feel it is; nothing is said where a weight exists.
  if (!weightDisplay && !exercise?.baseline_missing) {
    // 2026-09-10 (Michael): the "your call — pick a weight…" sentences are ours and were cut from the
    // drawer list; the row already carries its reserve. Only the app-state note about the test stays.
    const why: Record<string, string> = {
      awaiting_test: 'weights arrive once you log the test',
    };
    const line = why[String(exercise?.load_basis ?? '')];
    if (line) parts.push(`— ${line}`);
  }

  if (exercise?.notes) parts.push(`(${exercise.notes})`);

  // What they got last time at this weight — absent means absent; a zero is a result too.
  const lastReps = Array.isArray(exercise?.last_reps) ? exercise.last_reps : null;
  const lastRep = lastReps && lastReps.length > 0 ? Number(lastReps[lastReps.length - 1]) : null;
  if (lastRep != null && Number.isFinite(lastRep)) {
    parts.push(`— last time ${lastRep}`);
  }

  return parts.join(' ');
}

/**
 * The session's lines. Consecutive rows sharing `superset_group` print as ONE line (p274), and each
 * pair's sentence comes first, in the words the logger uses.
 */
export function formatStrengthExerciseLines(items: any[], unit: WeightUnit = 'lb'): string[] {
  const out: string[] = [];
  const list = Array.isArray(items) ? items : [];
  const seen = new Set<string>();
  for (let i = 0; i < list.length - 1; i += 1) {
    const g = typeof list[i]?.superset_group === 'string' ? list[i].superset_group : null;
    if (!g || seen.has(g) || list[i + 1]?.superset_group !== g) continue;
    seen.add(g);
    out.push(`Superset: ${nameOf(list[i])} with ${nameOf(list[i + 1])} — one set of each, rest, then again.`);
  }
  for (let i = 0; i < list.length; i += 1) {
    const e = list[i];
    const g = typeof e?.superset_group === 'string' && e.superset_group ? e.superset_group : null;
    const next = list[i + 1];
    if (g && next && next.superset_group === g) {
      const intent = String(e?.slot_intent || next?.slot_intent || '').toUpperCase();
      const bookWord = BOOK_WORDS.has(intent) ? `${intent} · ` : '';
      const sets = Number(e?.sets) || 0;
      const reps = e?.reps;
      const rirText = rirTextOf(e);
      const tail = ''; // the "your call" clause is gone (2026-09-10); the reserve is already on the line
      out.push(`${bookWord}${nameOf(e)} + ${nameOf(next)} · superset${sets > 0 && reps != null ? ` · ${sets}×${reps}` : ''}${rirText ? ` · ${rirText} in reserve` : ''}${tail}`);
      i += 1;
      continue;
    }
    out.push(formatStrengthExercise(e, unit));
  }
  return out;
}

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

import { P218_TEMPO, rirBandFor, rirBandText, type ViadaIntent } from '../strength-grid/intents.ts';

// (2026-09-18) `RESERVE_WHEN_NO_TARGET` ("1 to 2", ours, no caller) is deleted.

const BOOK_WORDS = new Set(['ME', 'DE', 'SKILL', 'HYP']);

/**
 * ⛔⛔ THE ONE RESERVE FORMATTER (book-language fix, 2026-09-18). The logger's `rir-format.ts` printed a
 * second spelling ("5+" where this printed "5"); it now calls this.
 *
 * ⛔ A ROW WITH A p218 INTENT PRINTS p218's BAND — DE / SKILL `3 to 4`, HYP `0 to 2` — read off
 * `strength-grid/intents.ts`, never off the stamped number. The composer stamps `target_rir` as the
 * band's midpoint (compose.ts `targetRirForIntent`, OURS), and on HYP that printed `1`, a number the
 * page does not give. ME prints nothing: p218 gives "no RIR target".
 * A row with no intent (a row no standing composer wrote) prints its own number, as before.
 */
export function reserveTextFor(row: { slot_intent?: unknown; target_rir?: unknown } | null | undefined): string | null {
  const intent = String(row?.slot_intent ?? '').toUpperCase();
  if (intent === 'ME') return null;
  if (BOOK_WORDS.has(intent)) return rirBandText(intent);
  return reserveNumberText(row?.target_rir);
}

/** A stamped number as text: `2`, or `1 to 2` for a half-step. Never "1-2". */
export function reserveNumberText(n: unknown): string | null {
  const r = Number(n);
  if (n == null || !Number.isFinite(r) || r < 0) return null;
  const lo = Math.floor(r), hi = Math.ceil(r);
  return lo === hi ? String(lo) : `${lo} to ${hi}`;
}

/** The whole numbers a row's reserve covers — the band's (0, 1, 2) or the stamped number's bracket. */
export function reserveIntegersFor(row: { slot_intent?: unknown; target_rir?: unknown } | null | undefined): number[] {
  const intent = String(row?.slot_intent ?? '').toUpperCase();
  if (intent === 'ME') return [];
  const band = BOOK_WORDS.has(intent) ? rirBandFor(intent) : null;
  if (band) return Array.from({ length: band.hi - band.lo + 1 }, (_, i) => band.lo + i);
  const r = Number(row?.target_rir);
  if (row?.target_rir == null || !Number.isFinite(r) || r < 0) return [];
  return Math.floor(r) === Math.ceil(r) ? [r] : [Math.floor(r), Math.ceil(r)];
}

/**
 * ⛔ THE NUMBER THE LOGGER MAY SAVE ON "DONE" WITHOUT A TAP — or null, and null on every p218 row.
 *
 * The logger auto-saved the stamped midpoint (HYP `1`, DE/SKILL `4`) flagged `rir_autofilled`. The page
 * gives a band, not a number inside it, so a row with a p218 intent saves no reserve until the athlete
 * taps one (the strip opens either way). `rir_autofilled` already kept the guess out of e1RM and
 * adherence, so nothing the engine reads is lost. A row with no intent keeps its own number, rounded.
 */
export function reserveSeedFor(row: { slot_intent?: unknown; target_rir?: unknown } | null | undefined): number | null {
  if (BOOK_WORDS.has(String(row?.slot_intent ?? '').toUpperCase())) return null;
  const r = Number(row?.target_rir);
  if (row?.target_rir == null || !Number.isFinite(r)) return null;
  return Math.min(5, Math.round(r));
}

/**
 * ⛔ THE ROW'S INTENT LINE — `HYP · 6-12 reps · 0 to 2 in reserve` — ONE OWNER. The logger printed its
 * own (with "· move the bar fast", on no page); it now prints this.
 */
export function intentRowLine(row: { slot_intent?: unknown; target_rir?: unknown; target_reps?: unknown } | null | undefined): string | null {
  const intent = String(row?.slot_intent ?? '').toUpperCase();
  if (!BOOK_WORDS.has(intent) || intent === 'ME' || !row?.target_reps) return null;
  const reps = String(row.target_reps).replace(/\+$/, '');
  const rir = reserveTextFor(row);
  // p218's tempo words for the intent, as printed (p218.jpg): "maximum velocity", "controlled eccentric, …".
  const tempo = P218_TEMPO[intent as ViadaIntent];
  return `${intent} · ${reps} reps${rir ? ` · ${rir} in reserve` : ''}${tempo ? ` · ${tempo}` : ''}`;
}

/** `Superset · A with B` — the one label for a printed pair (p274 prints the word "superset"). */
export function supersetLabel(a: string, b: string): string {
  return `Superset · ${a} with ${b}`;
}

const nameOf = (x: any) => String(x?.execution_name || x?.name || '').replace(/_/g, ' ').trim();

/** One row's line. */
export function formatStrengthExercise(exercise: any, unit: WeightUnit = 'lb'): string {
  // Display name only: `execution_name` is what the athlete's kit reaches; `name` stays the matching key.
  const name = nameOf(exercise);
  const sets = Number(exercise?.sets) || 0;
  const reps = exercise?.reps;

  // The book's word for the set leads (ME / DE / SKILL / HYP, p218), and the reserve the row carries is printed.
  // ⛔ A ROW PRESCRIBED IN WORDS prints `name · words` and nothing else (p226 carry, 2026-09-13).
  if (typeof exercise?.prescription_words === 'string' && exercise.prescription_words.trim()) {
    return `${name} · ${exercise.prescription_words.trim()}`;
  }
  const intent = String(exercise?.slot_intent || '').toUpperCase();
  const bookWord = BOOK_WORDS.has(intent) ? intent : null;
  const rirText = reserveTextFor(exercise);
  const parts: string[] = [bookWord ? `${bookWord} · ${name}` : name];
  if (sets > 0 && reps != null && String(reps).trim()) parts.push(`${sets}×${reps}`);
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
    // ⛔ "— one set of each, rest, then again" came off 2026-09-18: no page prints how a superset is done.
    out.push(supersetLabel(nameOf(list[i]), nameOf(list[i + 1])));
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
      const rirText = reserveTextFor(e);
      const tail = ''; // the "your call" clause is gone (2026-09-10); the reserve is already on the line
      out.push(`${bookWord}${nameOf(e)} + ${nameOf(next)} · superset${sets > 0 && reps != null ? ` · ${sets}×${reps}` : ''}${rirText ? ` · ${rirText} in reserve` : ''}${tail}`);
      i += 1;
      continue;
    }
    out.push(formatStrengthExercise(e, unit));
  }
  return out;
}

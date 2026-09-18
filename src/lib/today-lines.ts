/**
 * ═══ THE TODAY SCREEN'S LINES — EVERY ATHLETE-FACING WORD, IN ONE FILE ═══════════════════════════
 *
 * docs/WORKORDER-today-screen-2026-09-09.md §2. The screen says what each set is FOR, so the athlete
 * hits it with the intended purpose; the logger lays the work out and has the time.
 *
 * ⛔⛔ NEVER USE OURS. Every sentence below is marked APPROVED in the work order and carries the page
 * it came from. `TodayScreen.tsx` holds NO athlete-facing string of its own — it renders what this
 * file returns and nothing else, so `grep` over one file is the whole audit (work order §5).
 *
 * ⛔ A SILENCE IS AN ANSWER. Where the book has no line for a family, an intent or a session, this
 * file returns nothing. It never invents a sentence to fill the gap.
 *
 * ⛔ SESSIONS ARE IDENTIFIED BY TAG, NEVER BY NAME. `family:`, `band:`, `sport:`, `plyo`, `1rm_test`
 * and the row's own `slot_intent` are data; a session's NAME is a label that changes.
 */

import { familyLineFor, sprintEveryMinutesFromTokens } from '@shared/standing-plan/family-lines';

/** The rows a session carries. Only the fields this file reads. */
export type TodayStrengthRow = {
  name?: string | null;
  execution_name?: string | null;
  slot_intent?: string | null;
  notes?: string | null;
  /** A row prescribed in words (p226 carry, 2026-09-13) — no kind word, no cue. */
  prescription_words?: string | null;
  /** Rows of one printed superset (p274) share this mark; the composer stamps it. */
  superset_group?: string | null;
};

/** A planned or completed row as `get-week` hands it over. Only the fields this file reads. */
export type TodayRow = {
  id?: string | null;
  type?: string | null;
  tags?: unknown;
  training_plan_id?: string | null;
  strength_exercises?: unknown;
};

const tagsOf = (row: TodayRow | null | undefined): string[] =>
  Array.isArray(row?.tags) ? (row!.tags as unknown[]).map((t) => String(t).toLowerCase()) : [];

const tagValue = (row: TodayRow | null | undefined, prefix: string): string | null => {
  const hit = tagsOf(row).find((t) => t.startsWith(`${prefix}:`));
  return hit ? hit.slice(prefix.length + 1) : null;
};

export const hasTag = (row: TodayRow | null | undefined, tag: string): boolean =>
  tagsOf(row).includes(tag.toLowerCase());

/** `family:run_lsd` → `run_lsd`. Absent on anything that is not a composed endurance session. */
export const familyOf = (row: TodayRow | null | undefined): string | null => tagValue(row, 'family');

/**
 * `band:` — where the session sits relative to threshold, off `ENDURANCE_CLASS`. One of `above`,
 * `near`, `below`, `vt1_or_easier`. It rides on every composed endurance row (`session-vocabulary`).
 */
export const bandOf = (row: TodayRow | null | undefined): string | null => tagValue(row, 'band');

/** `sport:run` / `sport:ride` / `sport:swim`, falling back to the row's own type. */
export const sportOf = (row: TodayRow | null | undefined): string | null => {
  const tag = tagValue(row, 'sport');
  if (tag) return tag;
  const t = String(row?.type ?? '').toLowerCase();
  if (t === 'run' || t === 'ride' || t === 'swim') return t;
  if (t === 'bike' || t === 'cycling') return 'ride';
  return null;
};

export const isStrengthRow = (row: TodayRow | null | undefined): boolean =>
  String(row?.type ?? '').toLowerCase() === 'strength';

export const isEnduranceRow = (row: TodayRow | null | undefined): boolean => {
  const s = sportOf(row);
  return s === 'run' || s === 'ride' || s === 'swim';
};

/** From the plan, or something the athlete brought in (Garmin / Strava / typed). */
export const isFromPlan = (row: TodayRow | null | undefined): boolean =>
  typeof row?.training_plan_id === 'string' && row.training_plan_id.length > 0;

const rowsOf = (row: TodayRow | null | undefined): TodayStrengthRow[] =>
  Array.isArray(row?.strength_exercises) ? (row!.strength_exercises as TodayStrengthRow[]) : [];

const intentOf = (ex: TodayStrengthRow | null | undefined): 'ME' | 'DE' | 'SKILL' | 'HYP' | null => {
  const v = String(ex?.slot_intent ?? '').toUpperCase();
  return v === 'ME' || v === 'DE' || v === 'SKILL' || v === 'HYP' ? v : null;
};

// ── 1. THE SPACING LINE ─────────────────────────────────────────────────────────────────────────
// ⛔ MOVED TO THE SERVER 2026-09-18 (the Stage C follow-up): `_shared/standing-plan/spacing-line.ts`. `get-week`
// sends `spacing_lines`, one per date; Today prints it.

// ── 2. THE LIFT SESSION ─────────────────────────────────────────────────────────────────────────

/** The book's own word for the slot, spelled out (p219: "ME, or maximum effort"; "DE, or dynamic effort"). */
export const KIND_WORD: Record<'ME' | 'DE' | 'SKILL' | 'HYP', string> = {
  ME: 'Maximum effort',
  DE: 'Dynamic effort',
  SKILL: 'Skill',
  HYP: 'Hypertrophy',
};


/** p218, p219. */
const ME_CUE = '1 to 5 reps, stop short of failure.';

/**
 * p218, p219. ⛔ THE SECOND SENTENCE FOLLOWS THE LOAD (approved 2026-09-09, the rule the logger
 * already keeps): a barbell row says "Bar", a dumbbell, kettlebell, band or bodyweight row says
 * "Move". Telling someone to watch the bar on a bodyweight jump is the defect this closes.
 */
const DE_CUE_BAR = 'As fast as possible on every rep. Bar slows, set is over.';
const DE_CUE_MOVE = 'As fast as possible on every rep. Move slows, set is over.';

/** p219, p76, p143. */
const SKILL_CUE =
  'Form and consistency over speed. Weight heavy enough to be a challenge. '
  + 'Every rep either improves the movement or degrades it. Performed poorly, stop.';

/** p86, p218. */
const HYP_CUE = '8 to 12 reps, 1 to 2 in reserve. Reps slow as the set goes.';

export type LiftLine = { key: string; movement: string; kind: string | null; cue: string | null };

/**
 * One line per row, in the row's order. The cue REPEATS when the kind repeats — three hypertrophy
 * rows print the hypertrophy line three times, deliberately: the athlete reads the row in front of
 * them, not a legend somewhere else on the screen.
 *
 * ⛔ NO SETS, NO REPS AS A PRESCRIPTION, NO LOADS, NO WARM-UPS (work order §3). The logger has them.
 *
 * @param barLoaded answers "is this movement loaded on a bar" for one movement name. The caller
 *   passes the app's one classifier (`exercise-config`'s `displayFormat === 'total'`) rather than
 *   this file keeping a second opinion about equipment.
 */
export function liftLinesFor(
  session: TodayRow,
  barLoaded: (movement: string) => boolean,
): LiftLine[] {
  const rows = rowsOf(session);

  /**
   * ⛔ THE PLYO DAY AND THE TEST DAY SPEAK FOR THEMSELVES. Both carry a note written on the page
   * their dose came from, and the four intent cues are about a different kind of set. The row's own
   * note, nothing more.
   */
  const noteOnly = hasTag(session, 'plyo') || hasTag(session, '1rm_test');

  return rows.map((ex, i) => {
    // Display name only — the same rule the plan card keeps: `execution_name` is what the athlete's
    // kit actually reaches, `name` is the key everything else matches on.
    const movement = String(ex?.execution_name || ex?.name || '').replace(/_/g, ' ').trim();
    const key = `${movement}:${i}`;
    if (!movement) return { key, movement: '', kind: null, cue: null };

    if (noteOnly) {
      const note = typeof ex?.notes === 'string' && ex.notes.trim() ? ex.notes.trim() : null;
      return { key, movement, kind: null, cue: note };
    }

    const intent = intentOf(ex);
    // ⛔ A ROW PRESCRIBED IN WORDS (p226 carry, 2026-09-13): no kind word and no cue; its words are in the corner.
    if (!intent || (typeof ex?.prescription_words === 'string' && ex.prescription_words.trim())) {
      return { key, movement, kind: null, cue: null };
    }

    const cue =
      intent === 'ME' ? ME_CUE
      : intent === 'DE' ? (barLoaded(String(ex?.name || movement)) ? DE_CUE_BAR : DE_CUE_MOVE)
      : intent === 'SKILL' ? SKILL_CUE
      : HYP_CUE;

    return { key, movement, kind: KIND_WORD[intent], cue };
  });
}

/**
 * ⛔ A SUPERSET IS ONE LINE ON THE LIFT CARD (work order §3i, Michael, 2026-09-10 evening). Two rows
 * that share a `superset_group` read as `Tate Press + Drag Curl`, the kind word once — both kinds
 * when they differ — then `superset`, and the cue under it once when both rows carry the same cue.
 * The word is the drawer's own (`StrengthLogger`'s banner: "Superset · A with B"), spelled the way
 * the kind words are, so the card's kind line can set it in the same case.
 *
 * ⚠️ CONSECUTIVE ROWS ONLY. The composer writes a pair side by side; a mark on two rows with
 * something between them is not a pair the athlete can do as one station, and is left as two lines.
 */
const SUPERSET_WORD = 'superset';

export type LiftCardLine = {
  key: string;
  movement: string;
  kind: string | null;
  /** One cue per distinct sentence, in row order — a same-kind pair prints its cue once. */
  cues: string[];
  /** The indexes into `strength_exercises` this line stands for: one, or the two of a pair. */
  rows: number[];
};

export function liftCardLinesFor(
  session: TodayRow,
  barLoaded: (movement: string) => boolean,
): LiftCardLine[] {
  const rows = rowsOf(session);
  const lines = liftLinesFor(session, barLoaded);
  const groupOf = (i: number): string | null => {
    const g = rows[i]?.superset_group;
    return typeof g === 'string' && g.trim() ? g.trim() : null;
  };
  const out: LiftCardLine[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const g = groupOf(i);
    const next = lines[i + 1];
    if (g && next && groupOf(i + 1) === g && line.movement && next.movement) {
      const kinds = [line.kind, next.kind].filter((k): k is string => !!k);
      const uniqueKinds = kinds.filter((k, at) => kinds.indexOf(k) === at);
      const cues = [line.cue, next.cue].filter((c): c is string => !!c);
      out.push({
        key: `${line.key}+${next.key}`,
        movement: `${line.movement} + ${next.movement}`,
        kind: uniqueKinds.length > 0 ? `${uniqueKinds.join(' + ')} ${SUPERSET_WORD}` : SUPERSET_WORD,
        cues: cues.filter((c, at) => cues.indexOf(c) === at),
        rows: [i, i + 1],
      });
      i += 1;
      continue;
    }
    out.push({ key: line.key, movement: line.movement, kind: line.kind, cues: line.cue ? [line.cue] : [], rows: [i] });
  }
  return out;
}

// ── 3. THE ENDURANCE SESSION ────────────────────────────────────────────────────────────────────

/**
 * One line for the family, keyed by the `family:` tag. ⛔ A FAMILY THAT IS NOT HERE GETS NO LINE.
 * The book has a page for each of these and does not have one for the rest; inventing the missing
 * sentence is the thing this screen must never do.
 *
 * ⚠️ THE HARD RUN IS TWO FAMILY IDS. The work order names `run_mlss` and `run_nt`; the id the
 * composer actually stamps is `run_near_threshold` (`endurance-library/classification.ts`), so both
 * spellings are keyed to the one approved line rather than one of them silently printing nothing.
 */
/**
 * ⛔ THE MAP MOVED TO `@shared/standing-plan/family-lines` (2026-09-10) so the session drawer's
 * description reads the same approved sentence Today does. See that file.
 */

/**
 * ⛔⛔ THE STOP RULE IS OFF TODAY (Michael, 2026-09-09, §2 as revised). It read
 * *"Heart rate up 5 percent, or output down 5 percent: stop."* under every endurance session.
 *
 * ⚠️ THE CLAIM IS NOT WITHDRAWN AND THE PAGE HAS NOT MOVED — p107 still says it, and the ride/run
 * card still reads drift against that same 5 percent line AFTER the session, with heat and hills
 * beside it. What changed is where it belongs: it is a rule the athlete applies mid-session with a
 * watch, and Today is read before the session starts. ⛔ DO NOT PUT IT BACK HERE without the ruling
 * changing; the constant is deliberately gone rather than left unreferenced, because a dead string
 * in this file is one a later session will wire back up.
 *
 * The family line, when the book has one, and nothing else. A session the athlete brought in rather
 * than one the plan built gets nothing — the caller decides that; see `isFromPlan`.
 */
export function enduranceLinesFor(session: TodayRow): string[] {
  const family = familyOf(session);
  // ⚠️ THE ARCHETYPE PICKS THE ENDURANCE RIDE'S LINE (plain / with work). A row without the tag — any row
  // written before 2026-09-10 — gets the plain line, which is what every such row actually is.
  // ⛔ THE WITH-WORK LINE'S SPRINT INTERVAL IS READ OFF THE ROW'S OWN TOKENS, the ride the server built.
  const line = familyLineFor(
    family,
    tagValue(session, 'archetype'),
    sprintEveryMinutesFromTokens((session as { steps_preset?: unknown } | null)?.steps_preset),
  );
  return line ? [line] : [];
}

/**
 * The spelled-out kind word for a row, or null. ⛔ ONE OWNER — Today's card and the planned lift
 * drawer both print it, so both read it here (2026-09-10).
 */
export function kindWordFor(ex: { slot_intent?: unknown; prescription_words?: unknown } | null | undefined): string | null {
  // ⛔ A ROW PRESCRIBED IN WORDS (p226 carry, 2026-09-13) reads exactly `name · words` — no kind word.
  if (typeof ex?.prescription_words === 'string' && ex.prescription_words.trim()) return null;
  const v = String(ex?.slot_intent ?? '').toUpperCase();
  return v === 'ME' || v === 'DE' || v === 'SKILL' || v === 'HYP' ? KIND_WORD[v] : null;
}

// ============================================================================
// THE PROGRAM OUTLINE — one sheet that says what the athlete's standing plan is (2026-09-25, Michael).
//
// Opened from the plan name under the date on Today, and from Info on the weekly planner. The server composes every
// word and number here; the phone prints the sections as sent. Race plans get none (their outline is not written yet).
//
// ⛔ EVERY ATHLETE-FACING LINE IN THIS FILE WAS APPROVED BY MICHAEL ON 2026-09-25, WORD FOR WORD. Add none; change none
// without his yes (memory: all copy through Michael).
//
// ⚠️ THIS FILE IS LIGHT ON PURPOSE. `get-week` and `plan-overview` import it on every call, so it imports no composer:
// `plan-row.ts` re-exports the three block-description strings that live here, never the other way round.
//
// ⛔ SHARED = DEPLOY TRAP: grep -rln "program-outline\|plan-row" supabase/functions --include=index.ts
// ============================================================================

import type { PlanSession } from './compose.ts';
import type { FrameId } from './frames.ts';
import type { ViadaIntent } from '../strength-grid/intents.ts';
import { TEST_WEEK_INDEX } from './working-number.ts';
import { sessionTitle } from '../session-title.ts';
import type { WorkoutLike } from '../../../../src/lib/derive-workout-title.ts';

// ── THE BLOCK DESCRIPTION'S OWN STRINGS (moved here from plan-row.ts so the outline reads the same ones) ─────────

/**
 * ⛔ p125, reworded (Michael approved the words 2026-09-19); the page: "A higher pain tolerance may be an excellent adaptation for endurance
 * athletes because the ability to manage increasingly uncomfortable sensations during various endurance-dependent
 * events may be directly related to their overall performance in their sport. For strength athletes, however, it may
 * be less clear; a higher tolerance may be of negligible benefit or even counterproductive to longer-term health."
 * ⛔⛔ THE p125 LINE, IN p125's OWN WORDS (pass 6, 2026-09-18, read off p125.jpg). It had been a paraphrase that
 * dropped the page's "may"; pass 4 took it off because p125 was not in the SOURCE doc. The page photo is the
 * book, so it comes back as the page prints it. Said once, on the block description and at the foot of the program
 * outline. No second person (the description's voice gate).
 */
export const PAIN_TOLERANCE_NOTE =
  'Higher pain tolerance may be a very useful adaptation for endurance athletes, since handling growing discomfort in '
  + 'endurance events may tie directly to how well they perform in their sport. For strength athletes the case is less '
  + 'clear; higher tolerance may bring little benefit or may even be bad for longer-term health.';

/**
 * ⛔ HOW THE SET COUNTS MOVE, SAID ONCE ON THE BLOCK (Michael's final words, 2026-09-25, approved;
 * `EARNED_SETS_EVERY_ROW_IS_OURS`). Printed as approved; the set ranges and caps are p218's.
 * ⚠️ LAST SENTENCE CHANGED 2026-09-25 (Michael approved): "The row shows the count." → "The working sets under each
 * lift show the count." — one constant, so the block description and the program outline's Sets section say the same.
 */
export const SETS_EARNED_PARAGRAPH =
  'Every exercise starts at the low end of its set range. Two sessions at the top of the rep range add a set, up to '
  + 'its cap. One session under the range takes one off. The working sets under each lift show the count.';

/**
 * ⛔ THE TEST-WEEK SENTENCE, ONE COPY (`describeBlock` prints it on a tested block; the outline prints it at its foot
 * while week one is current or still ahead). See `describeBlock` for why it is the fixed line and not the composer's.
 */
export const TEST_WEEK_SENTENCE =
  'Week one is a test week: two guided sessions set the numbers the rest of the block is built '
  + 'on. Log those two and the weights fill in from there, including the rest of week one.';

/** The notes a composer raises, as `ComposeNote` carries them (only `kind` and `text` are read here). */
type NoteLike = { kind?: string | null; text?: string | null };

/**
 * ⛔ THE PLAN'S OWN SOURCED NOTES, AS THE BLOCK DESCRIPTION PRINTS THEM — one reading, two readers (the description
 * and the outline). The composer's own test-week note is dropped (`describeBlock` says why: the fixed sentence wins).
 * ⚠️ MATCHED ACROSS THE WHOLE SOURCE LIST rather than the sliced three, or a block whose test note fell past the cut
 * would print the duplicate again.
 */
export function sourcedNotesFor(notes: NoteLike[] | null | undefined): string[] {
  const allSourced = (notes ?? [])
    .filter((n) => n?.kind === 'source' && typeof n.text === 'string')
    .map((n) => String(n.text));
  // OURS — `sourcedNotesFor` prints at most three of the block's sourced notes; display cap, no page.
  return allSourced.filter((t) => !t.includes('first week is the test')).slice(0, 3);
}

// ── THE OUTLINE'S OWN WORDS (Michael approved every line 2026-09-25) ────────────────────────────────────────────

/**
 * ⛔ THE FOUR SET TYPES. Numbers: Viada p218 "Repetition/Set Guidelines" (reps, sets, reps in reserve); meaning:
 * p219 "Abbreviations" (ME "stopped short of failure", DE bar speed, SKILL controlled eccentric / fast concentric,
 * HYP "reps inevitably slow ... that is desirable"). ME has no reserve target on p218, so its line carries none.
 * ⚠️ The numbers are the bands `strength-grid/intents.ts` holds (`prescribe(intent, 'barbell')`); the start at the low
 * end is p218's first sentence, and the earned-sets ladder climbs to the band's top (`progression.ts`). The outline test
 * reads each line against those bands, so the two cannot part company silently.
 */
export const SET_TYPE_SECTIONS: Record<ViadaIntent, { heading: string; line: string }> = {
  ME: {
    heading: 'Maximum effort',  // Viada p218 (reps, sets, reserve), p219 (what the set is for)
    line: 'Close to the heaviest weight you can lift. 1 to 5 reps. Starts at 1 set and can reach 3. '
      + 'Stop each set while your form still holds.',
  },
  DE: {
    heading: 'Dynamic effort',  // Viada p218 (reps, sets, reserve), p219 (what the set is for)
    line: 'Lighter weight, lifted as fast as you can. 2 to 4 reps. Starts at 4 sets and can reach 6. '
      + '3 to 4 reps in reserve.',
  },
  SKILL: {
    heading: 'Skill',  // Viada p218 (reps, sets, reserve), p219 (what the set is for)
    line: 'Practice for the movement. Lower it with control and lift it fast. 3 to 5 reps. '
      + 'Starts at 3 sets and can reach 5. 3 to 4 reps in reserve.',
  },
  HYP: {
    heading: 'Hypertrophy',  // Viada p218 (reps, sets, reserve), p219 (what the set is for)
    line: 'Work that builds muscle. 6 to 12 reps. Starts at 3 sets and can reach 4. 0 to 2 reps in reserve. '
      + 'The last reps of a set slow down, and that is expected.',
  },
};

/** The order the set types print in — p218's table order. */
const SET_TYPE_ORDER: ViadaIntent[] = ['ME', 'DE', 'SKILL', 'HYP'];

export const OUTLINE_HEADINGS = {
  thisWeek: 'This week',
  sets: 'Sets',
  deload: 'Deload',
  retest: 'Retest',
  endurance: 'Endurance',
} as const;

/**
 * ⛔ NO SCHEDULED DELOAD (Viada p120: overreach-to-deload is rejected; his standard week runs indefinitely), and the
 * program pages' taper/deload column is a tool deployed for a race or a break — `NO_SCHEDULED_DELOAD_CITE`. The
 * deload week is set on Adjust (`StateAdjustLens`).
 */
export const DELOAD_LINE =
  'The plan can run week after week with no set deload. A deload week is for when a race is close or you need a '
  + 'break. It makes the lifting and the endurance lighter for that week. You can set one on Adjust.';

/**
 * ⛔ NO SCHEDULED RETEST. p247's rate anchor moves the numbers without a test; the SOURCE corpus (Part B testing):
 * "progress without retesting; tests exist for troubleshooting"; D-480 (no retest interval). The retest is on Adjust.
 */
export const RETEST_LINE =
  'Your lifting numbers rise slowly on their own, so the plan has no set retest. A retest is for when a number looks '
  + 'wrong. You can retest on Adjust.';

/**
 * ⛔ p275 CONDITIONING NOTES, reworded: "hard work should be hard; easy work should be easy", adjust intensity and
 * threshold figures rather than distance or level, and switch to a pivot program about a month out for a race.
 * ⚠️ THE ALL ROUNDER ONLY (frame `all_rounder`, p274-275). The other frames' endurance wording is not approved yet.
 */
export const ALL_ROUNDER_ENDURANCE_LINE =
  'Hard sessions are meant to be hard, and easy sessions are meant to be easy. The endurance gets harder when your '
  + 'threshold numbers go up, not by making sessions longer. For a race, switching to a race plan about a month out '
  + 'gives the best result.';

/** The one frame whose endurance section is approved. Identified by frame id, never by the plan's display name. */
const ENDURANCE_SECTION_FRAMES: ReadonlySet<FrameId> = new Set<FrameId>(['all_rounder']);

// ── THE OUTLINE ─────────────────────────────────────────────────────────────────────────────────────────────

/** One block of the sheet. `heading: null` is the unheaded foot. Every string is printed as sent. */
export type ProgramOutlineSection = { heading: string | null; lines: string[] };

export type ProgramOutline = {
  /** The plan's own name — the words the athlete tapped. */
  title: string | null;
  sections: ProgramOutlineSection[];
};

/** A planned row of the week, as `get-week` or `plan-overview` hold it. `day_order` is `_shared/day-order.ts`'s. */
export type OutlineWeekRow = WorkoutLike & { date?: string | null; day_order?: number | null };

/**
 * ⛔ WHICH SET TYPES THE PLAN'S LIFTING USES — read off the built block's rows (`slot_intent`), never off the frame's
 * name. A carry (p226) is prescribed in words and has no p218 band, so it does not count; the test week's pretest
 * rows are ME for every frame, so the test week is read only when it is the block's only week.
 */
export function setIntentsOf(
  sessionsByWeek: Record<string, PlanSession[] | unknown> | null | undefined,
  testWeek: number | null,
): ViadaIntent[] {
  const weeks = Object.keys(sessionsByWeek ?? {});
  const read = weeks.length > 1 && testWeek != null ? weeks.filter((w) => Number(w) !== testWeek) : weeks;
  const found = new Set<ViadaIntent>();
  for (const w of read) {
    const sessions = (sessionsByWeek as Record<string, unknown>)[w];
    if (!Array.isArray(sessions)) continue;
    for (const s of sessions as PlanSession[]) {
      for (const ex of Array.isArray(s?.strength_exercises) ? s.strength_exercises : []) {
        const intent = String(ex?.slot_intent ?? '').toUpperCase() as ViadaIntent;
        if (!SET_TYPE_ORDER.includes(intent)) continue;
        if (ex?.slot_category === 'carry' || typeof ex?.prescription_words === 'string') continue;
        found.add(intent);
      }
    }
  }
  return SET_TYPE_ORDER.filter((i) => found.has(i));
}

/** "Monday" off a calendar date. The date is the athlete's own (YYYY-MM-DD), read at noon UTC so no zone moves it. */
const weekdayOf = (iso: string): string =>
  new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });

/**
 * ⛔ THIS WEEK, DAY BY DAY — `Monday: Lower body: Push · Easy Run`. Each title is `sessionTitle`, the one the calendar,
 * the sync and Today's cards print (`_shared/session-title.ts` over `deriveWorkoutTitle`). A day with nothing on it
 * prints nothing: the approved words have no rest-day line.
 */
function thisWeekLines(rows: OutlineWeekRow[]): string[] {
  const dated = rows
    .map((r, i) => ({ r, i, d: typeof r?.date === 'string' ? r.date.slice(0, 10) : '' }))
    .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.d));
  dated.sort((a, b) => {
    if (a.d !== b.d) return a.d.localeCompare(b.d);
    const ao = Number(a.r?.day_order), bo = Number(b.r?.day_order);
    if (Number.isFinite(ao) && Number.isFinite(bo) && ao !== bo) return ao - bo;
    return a.i - b.i;
  });
  const lines: string[] = [];
  let day = '';
  let titles: string[] = [];
  const flush = () => { if (day && titles.length > 0) lines.push(`${weekdayOf(day)}: ${titles.join(' · ')}`); };
  for (const x of dated) {
    if (x.d !== day) { flush(); day = x.d; titles = []; }
    titles.push(sessionTitle(x.r));
  }
  flush();
  return lines;
}

/**
 * ⛔ THE OUTLINE OF ONE STANDING PLAN, IN THE APPROVED ORDER: This week · the set types the lifting uses · Sets ·
 * Deload · Retest · Endurance (All Rounder only) · then, unheaded, p125's note, the plan's own sourced notes, and the
 * test-week sentence while week one is current or still ahead on a block that has one.
 *
 * ⚠️ NULL FOR ANYTHING THAT IS NOT A STANDING PLAN (`config.standing_plan` absent) — a race plan keeps its old Info.
 * ⚠️ THE SOURCED NOTES ARE THE ONES STORED WITH THE BLOCK (`standing_plan.sourced_notes`, written beside the
 * description at build and at every refresh). A block that has not been refreshed since this shipped prints none
 * until it is: the build-time list (`standing_plan_notes`) can hold words since replaced, and an old sentence on this
 * sheet would be worse than none.
 */
export function composeProgramOutline(args: {
  planName: string | null | undefined;
  standingPlan: unknown;
  sessionsByWeek: Record<string, unknown> | null | undefined;
  /** The plan week the athlete is looking at — the "week N" beside the name they tapped. */
  week: number;
  /** This plan's own planned rows for that week (every status). */
  weekRows: OutlineWeekRow[];
}): ProgramOutline | null {
  const sp = args.standingPlan;
  if (!sp || typeof sp !== 'object' || Array.isArray(sp)) return null;
  const cfg = sp as Record<string, unknown>;
  const frame = String(cfg.frame ?? '') as FrameId;
  const testWeekIndex = Number.isFinite(Number(cfg.test_week)) && Number(cfg.test_week) > 0
    ? Number(cfg.test_week) : TEST_WEEK_INDEX;
  // ⛔ THE SAME TEST `describeBlock` MAKES (`blocks[0].isTestWeek`): week one is a test week unless the skip was taken.
  const hasTestWeek = cfg.test_skipped !== true;

  const sections: ProgramOutlineSection[] = [];

  const week = thisWeekLines(Array.isArray(args.weekRows) ? args.weekRows : []);
  if (week.length > 0) sections.push({ heading: OUTLINE_HEADINGS.thisWeek, lines: week });

  for (const intent of setIntentsOf(args.sessionsByWeek as Record<string, unknown>, hasTestWeek ? testWeekIndex : null)) {
    sections.push({ heading: SET_TYPE_SECTIONS[intent].heading, lines: [SET_TYPE_SECTIONS[intent].line] });
  }

  sections.push({ heading: OUTLINE_HEADINGS.sets, lines: [SETS_EARNED_PARAGRAPH] });
  sections.push({ heading: OUTLINE_HEADINGS.deload, lines: [DELOAD_LINE] });
  sections.push({ heading: OUTLINE_HEADINGS.retest, lines: [RETEST_LINE] });
  if (ENDURANCE_SECTION_FRAMES.has(frame)) {
    sections.push({ heading: OUTLINE_HEADINGS.endurance, lines: [ALL_ROUNDER_ENDURANCE_LINE] });
  }

  const sourced = Array.isArray(cfg.sourced_notes)
    ? (cfg.sourced_notes as unknown[]).filter((t): t is string => typeof t === 'string' && t.trim() !== '')
    : [];
  const showTestWeek = hasTestWeek && Number.isFinite(args.week) && args.week <= testWeekIndex;
  sections.push({
    heading: null,
    lines: [PAIN_TOLERANCE_NOTE, ...sourced, ...(showTestWeek ? [TEST_WEEK_SENTENCE] : [])],
  });

  const title = typeof args.planName === 'string' && args.planName.trim() ? args.planName.trim() : null;
  return { title, sections };
}

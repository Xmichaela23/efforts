/**
 * ═══ HOW A SESSION IS JUDGED, AND THE WORDS FOR IT (2026-09-14, copy approved by Michael) ══════════════
 *
 * One rule, from the book: a session prescribed at VT1 is judged by the talk test; a session prescribed as
 * a percentage of threshold is judged by its watts or pace. RPE is logged on every run and ride as the
 * standard effort number and judges nothing.
 *
 * - The talk test applies to the easy run and the long run only (p235: "Practise the talk test at least
 *   twice per run… once after 5 minutes and once after 20"; the test itself, p211: recite a sentence
 *   "without taking a breath"). Rides are prescribed in power — "easy ride below 75%" (p239) — and a ride
 *   VT1 step already resolves to that ceiling (endurance-library/generate.ts), so no ride gets it.
 * - RPE labels: Foster's session-RPE CR-10 scale, the one the session-RPE research uses (Foster et al.,
 *   2001; frontiersin.org/journals/neuroscience/articles/10.3389/fnins.2017.00612/full). Unlabelled steps
 *   carry the label below them, as the scale prints.
 *
 * Read by check-feedback-needed (does the popup ask the talk test), workout-detail (the Performance rows)
 * and the phone's effort scale through `@shared/`.
 */

/** The session types the plan stamps as `family:<id>` that the book judges by the talk test. */
export const TALK_TEST_FAMILIES: ReadonlySet<string> = new Set(['run_vt1', 'run_lsd']);

/** The `family:` tag on a planned row, or null. */
export function familyFromTags(tags: unknown): string | null {
  if (!Array.isArray(tags)) return null;
  for (const t of tags) {
    const s = String(t ?? '');
    if (s.startsWith('family:')) return s.slice('family:'.length) || null;
  }
  return null;
}

export function talkTestAppliesToTags(tags: unknown): boolean {
  const f = familyFromTags(tags);
  return f != null && TALK_TEST_FAMILIES.has(f);
}

/** Foster session-RPE CR-10 words for 1–10. */
const FOSTER: Readonly<Record<number, string>> = {
  1: 'Very easy', 2: 'Easy', 3: 'Moderate', 4: 'Somewhat hard', 5: 'Hard', 6: 'Hard',
  7: 'Very hard', 8: 'Very hard', 9: 'Very hard', 10: 'Maximal',
};

export function fosterEffortWord(rpe: number): string {
  return FOSTER[Math.round(rpe)] ?? '';
}

/** The legend under the popup's 1–10 row. */
export const FOSTER_LEGEND: readonly string[] = ['1 very easy', '3 moderate', '5 hard', '10 maximal'];

/** The popup question, asked only when the planned session is an easy or long run. */
export const TALK_TEST_QUESTION = 'At 5 and 20 minutes in, could you say a full sentence without taking a breath?';

/** Performance row: "Effort · RPE 4, somewhat hard". Null when no RPE is logged. */
export function effortRowText(rpe: unknown): string | null {
  const n = Number(rpe);
  if (rpe == null || !Number.isFinite(n) || n < 1 || n > 10) return null;
  const r = Math.round(n);
  return `RPE ${r}, ${fosterEffortWord(r).toLowerCase()}`;
}

/** Performance row: the talk test answer against what the session asked for. Null when unanswered. */
export function talkTestRowText(answer: unknown): string | null {
  if (answer === true) return 'planned: a full sentence without taking a breath · you: yes';
  if (answer === false) return 'planned: a full sentence without taking a breath · you: no. Harder than the talk test this session asked for.';
  return null;
}

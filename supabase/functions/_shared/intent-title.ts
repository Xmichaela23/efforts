/**
 * A LIFTING DAY'S TITLE, IN THE BOOK'S TERMS, FOR EVERY SCREEN (2026-09-18, the Stage C follow-up).
 *
 * The frames title their days with the page's abbreviations — `ME: Upper`, `DE: Lower`, `DE: Full`
 * (`standing-plan/frames.ts`, from p246, p274, p278). The logger's header used to swap them on the phone for
 * "Heavy" / "Speed" (`src/lib/plain-intent.ts`, removed), two English words no page prints. Now every server read
 * that hands a day to a screen sends `intent_title` beside the name (`get-week`, `workout-detail`, the composed
 * plan's sessions, `validate-reschedule`, State's weekly lifting card, the calendar feed), spelled as the book does:
 *
 *   ME → "Maximum Effort"   p219: "ME, or maximum effort"; capitalised as p77's heading prints it
 *                           ("Dynamic Effort and Maximum Effort"). Michael, 2026-09-18: the book's exact terms.
 *   DE → "Dynamic Effort"   p219: "DE, or dynamic effort sets"; p77's heading
 *   HYP → "Hypertrophy"     p219: "HYP refers to hypertrophy work"
 *   SKILL → "Skill"         p219: "SKILL work"
 *
 * ⚠️ NO FRAME TITLES A DAY `HYP:` OR `SKILL:` TODAY — they are slot intents. They are here so the rule covers every
 * intent the page names; nothing prints them until a day is titled that way.
 * ⚠️ `Test:` and every other name (`Upper body: Push`, an endurance session, a hand-typed name) pass through
 * untouched. An optional `Strength — ` prefix is kept.
 * ⚠️ DISPLAY ONLY. The stored name stays `ME: Upper`; nothing may match on this string.
 */

export const INTENT_TITLE: Record<string, string> = {
  ME: 'Maximum Effort',
  DE: 'Dynamic Effort',
  HYP: 'Hypertrophy',
  SKILL: 'Skill',
};

const INTENT_LABEL_RE = /^(\s*(?:Strength\s*[—–-]\s*)?)(ME|DE|HYP|SKILL):/;

/** `"DE: Lower"` → `"Dynamic Effort: Lower"`. Anything else comes back as it was; null and empty come back ''. */
export function intentTitle(name: string | null | undefined): string {
  return String(name ?? '').replace(
    INTENT_LABEL_RE,
    (_m, prefix: string, key: string) => `${prefix}${INTENT_TITLE[key]}:`,
  );
}

/**
 * THE SAME TITLE, SPELLED OUT, for State's weekly lifting card (Michael, 2026-09-01: "spell it out"):
 * `"DE: Upper"` → `"Dynamic Effort day, upper body"`. Only the forms the frames mint (`ME` / `DE` / `Test` with
 * `Upper` / `Lower`) are spelled; anything else comes back through `intentTitle`.
 */
const SPELLED_RE = /^\s*(?:Strength\s*[—–-]\s*)?(ME|DE|Test):\s*(Upper|Lower)\s*$/i;
const BODY: Record<string, string> = { upper: 'upper body', lower: 'lower body' };
export function spelledIntentTitle(name: string | null | undefined): string {
  const m = SPELLED_RE.exec(String(name ?? ''));
  if (!m) return intentTitle(name);
  const key = m[1].toUpperCase();
  const word = key === 'TEST' ? 'Test' : INTENT_TITLE[key];
  return `${word} day, ${BODY[m[2].toLowerCase()]}`;
}

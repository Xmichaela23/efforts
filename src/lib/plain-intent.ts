/**
 * WESTSIDE SHORTHAND → THE PLAIN WORD, FOR EVERY SURFACE AN ATHLETE READS.
 *
 * ⛔ THE FRAMES TITLE THEIR DAYS `ME: Upper` / `DE: Lower` — max effort and dynamic effort, a
 * conjugate-method vocabulary a Strong or Hevy user has no reason to have met. Viada p72 says where
 * it comes from in as many words (*"Westside-style conjugate training was an early influence on
 * me"*), which is exactly why it is HIS working vocabulary and not the athlete's.
 *
 * ── ⛔ WHY THIS IS A MODULE AND NOT TWO LINES IN A COMPONENT ─────────────────────────────────────
 *
 * It WAS two lines in a component (punch item 6, 2026-08-25, inside `WeekGrid.tsx`), and it was used
 * in exactly one place — the week overview grid. **The logger header, the calendar and the plan
 * download screen all still printed `DE: Upper` at the athlete**, which is what Michael saw on a
 * device on 2026-08-28. The obvious repair is to paste the two lines into three more files, and this
 * codebase has paid for that pattern repeatedly: the audit counted six private exercise classifiers,
 * the rest timer was the seventh, the plyo regex the eighth, and the logger's own bodyweight test was
 * a fifth answer to a question three files already answered. ⛔ A mapping used by four surfaces has
 * ONE owner.
 *
 * ── THE RULES THAT CAME WITH IT, UNCHANGED ──────────────────────────────────────────────────────
 *
 * ⚠️ **BOTH HALVES OF THE PAIR, OR NEITHER.** Renaming `DE` and leaving `ME` reads as two different
 * kinds of thing on the same week; they are one axis with two ends.
 *
 * ⚠️ **DISPLAY ONLY, AT THE LAST MOMENT.** The engine strings stay `ME: Upper` — that is what
 * `frames.ts` authors, what the composer passes through as the session name, and what every test
 * matches on. Nothing here may be fed back into a comparison, a lookup key or a stored row.
 *
 * ⚠️ **`Test:` IS LEFT ALONE.** It is already the plain word for what the day is.
 *
 * ⚠️ **`SKILL` AND `HYP` GET NOTHING, DELIBERATELY.** They are slot intents, not day labels — no
 * frame titles a day with either — so there is no athlete-facing string to translate. Adding them
 * here would be inventing a name for a day that does not exist.
 */

/** The pair, and the whole of it. ⚠️ Both halves or neither — see the header. */
export const INTENT_WORD: Record<string, string> = { ME: 'Heavy', DE: 'Speed' };

/**
 * ⚠️ THE OPTIONAL `Strength — ` PREFIX IS PART OF THE PATTERN, NOT THE CALLER'S PROBLEM.
 *
 * The composer emits the bare frame label; some surfaces render it as `Strength — ME: Upper`. The
 * original two-liner anchored on `^(ME|DE):` and would have silently no-op'd on the prefixed form —
 * a surface would have looked wired and still printed the shorthand. The prefix is captured and put
 * back rather than stripped, so this never changes anything but the two letters it is for.
 *
 * ⚠️ EM DASH **AND** HYPHEN. The app writes the em dash; a hand-typed or older row may not.
 */
const INTENT_LABEL_RE = /^(\s*(?:Strength\s*[—–-]\s*)?)(ME|DE):/;

/**
 * `"DE: Upper"` → `"Speed: Upper"`. Anything else is returned untouched.
 *
 * ⛔ IDEMPOTENT AND TOTAL: a name that has already been mapped, a `Test:` day, an endurance session
 * name, an empty string and a null all come back unharmed. A display helper that can corrupt a
 * string it does not recognise is one nobody can call safely from a render path.
 */
export function plainIntent(name: string | null | undefined): string {
  return String(name ?? '').replace(
    INTENT_LABEL_RE,
    (_m, prefix: string, key: string) => `${prefix}${INTENT_WORD[key]}:`,
  );
}

/**
 * THE SAME LABEL, SPELLED OUT — `"DE: Upper"` → `"Speed day, upper body"` (Michael, 2026-09-01, off
 * the State screen's weekly lifting card: *"spell it out"*).
 *
 * ⛔ ONE FORMATTER OVER ONE VOCABULARY, NOT A SECOND VOCABULARY. The intent word comes from
 * `INTENT_WORD` above — the same two strings the compact form uses — so "Heavy" here and "Heavy:" in
 * the logger cannot drift. `Test:` keeps its own word, as everywhere. The `Strength — ` prefix is
 * dropped: a card that lists lifting sessions does not need each row to say it is strength.
 *
 * ⚠️ ONLY THE FORMS THE FRAMES MINT ARE SPELLED: `ME` / `DE` / `Test` with `Upper` / `Lower`. Any
 * other label — `Upper body: Push`, an endurance name, a hand-typed session — comes back through
 * `plainIntent` untouched rather than half-rewritten. SKILL and HYP are slot intents, never day
 * labels; there is no day to spell.
 */
const SPELLED_LABEL_RE = /^\s*(?:Strength\s*[—–-]\s*)?(ME|DE|Test):\s*(Upper|Lower)\s*$/i;
const BODY_WORD: Record<string, string> = { upper: 'upper body', lower: 'lower body' };

export function spelledIntentLabel(name: string | null | undefined): string {
  const m = SPELLED_LABEL_RE.exec(String(name ?? ''));
  if (!m) return plainIntent(name);
  const key = m[1].toUpperCase();
  const word = key === 'TEST' ? 'Test' : INTENT_WORD[key];
  return `${word} day, ${BODY_WORD[m[2].toLowerCase()]}`;
}

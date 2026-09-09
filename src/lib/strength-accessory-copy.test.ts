/**
 * THE ASSISTANCE CUE — and as of 2026-09-09 there is only ONE of them.
 *
 * Run from repo root:  deno test src/lib/strength-accessory-copy.test.ts --no-check
 *
 * ⛔⛔ `ACCESSORY_SET_CUE` IS DELETED (WORKORDER-kill-ours §A.2). It read *"Split these into as many
 * sets as you need. Leave a rep or two — never to failure."* Both halves came from the ARCHIVED
 * programme rather than from Viada, and the only rows it could still reach — a rep TOTAL with no
 * weight — are rows the standing plan no longer builds. A line with no page and no live row comes
 * off, and the whole reason this file existed separately went with it.
 *
 * ⛔ WHY THIS FILE STAYS. `STANDING_ACCESSORY_SET_CUE` is the surviving cue and it carries the SAME
 * lint problem for a different reason: `bar-speed-copy.test.ts` bans `until`, `as many`, `failure`
 * and `fails` on the bar-speed lines because on a PRESCRIBED set they mean rep-chasing, and this cue
 * uses "failure" as a STOP RULE — *"never to failure"* — which is the thing the ban protects. **If
 * someone later widens that lint over every exported copy constant, this file is the record of why
 * that would be wrong.** Pin the intent, not the absence of a substring.
 *
 * Basis: Viada p86 and p218 — the hypertrophy dose, 8 to 12 reps with 1 to 2 in reserve, and reps
 * slowing as the set goes. HYP carries no load percentage anywhere in the source.
 */
import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import * as copy from './strength-focus-copy.ts';
import { BAR_SPEED_COPY, STANDING_ACCESSORY_SET_CUE } from './strength-focus-copy.ts';

Deno.test('⛔ THE ARCHIVED PROGRAMME\'S ASSISTANCE LINE IS GONE AND MAY NOT COME BACK', () => {
  /**
   * ⛔ ASSERTED AS AN ABSENCE, DELIBERATELY. The constant was exported and read from exactly one
   * render branch; a future session restoring "a cue for non-standing sessions" would reach for this
   * name first. Michael, 2026-09-09: **never use ours** — and this line was not even ours, it was
   * another author's, on a Viada block.
   */
  assertEquals((copy as Record<string, unknown>).ACCESSORY_SET_CUE, undefined);
  /**
   * ⚠️ CHECKED AT THE IMPORT, NOT BY SCANNING FOR THE NAME. The logger's comment blocks still discuss
   * the deleted cue at length — that is the record, and it is meant to stay — so a substring sweep
   * would fail on the very documentation that explains the deletion. A constant that is not imported
   * cannot be rendered.
   */
  const logger = Deno.readTextFileSync(new URL('../components/StrengthLogger.tsx', import.meta.url));
  const imports = logger.slice(0, logger.indexOf('export default'));
  assertEquals(/^\s*ACCESSORY_SET_CUE,\s*$/m.test(imports), false,
    'the deleted assistance cue is imported again');
});

Deno.test('the surviving cue stays out of BAR_SPEED_COPY — different object, different rules', () => {
  const barSpeedLines = Object.values(BAR_SPEED_COPY);
  assert(!barSpeedLines.includes(STANDING_ACCESSORY_SET_CUE),
    'the accessory cue must stay out of BAR_SPEED_COPY — it would fail that table\'s vocabulary lint');
});

/**
 * STANDING_ACCESSORY_SET_CUE (2026-08-24) — the standing plan's version. Its rows prescribe
 * discrete sets, so the previous program "split these" clause must NOT appear; what must appear is the
 * weight-finding rule, which is Viada's hypertrophy dose (Part B2: 1–2 reps in reserve, never to
 * failure) — HYP carries no load percentage anywhere in the source.
 */
Deno.test('standing cue — the reserve rule, in Michael\'s words (2026-09-09), and no add-weight trigger', () => {
  const s = STANDING_ACCESSORY_SET_CUE.toLowerCase();
  assertStringIncludes(s, 'in reserve');
  assert(!s.includes('add weight') && !s.includes('top of the band'), 'the top-of-band trigger was ours and is gone');
});

Deno.test('standing cue — no "split these": the rows prescribe discrete sets', () => {
  const s = STANDING_ACCESSORY_SET_CUE.toLowerCase();
  // The failure mode this guards: someone merges the two cues back into one and the standing plan
  // regains the freedom-to-split sentence its rows contradict — the exact device finding.
  assert(!s.includes('split') && !s.includes('as many sets'),
    `standing cue must not carry the previous program split clause: ${STANDING_ACCESSORY_SET_CUE}`);
});

Deno.test('standing cue — failure appears only as the stop rule; advancing is condition-gated', () => {
  const s = STANDING_ACCESSORY_SET_CUE.toLowerCase();
  assert(!/\b(to|until)\s+failure\b/.test(s.replace(/never to failure/g, '')),
    `"failure" may appear only inside "never to failure": ${STANDING_ACCESSORY_SET_CUE}`);
  // ⛔ SUPERSEDED 2026-08-25 (Michael: "should their weightload get easier they should know they
  // can add"): the 2026-08-24 version of this pin banned "add weight" outright as rep-chasing
  // vocabulary. The cue now carries the double-progression advance rule ON PURPOSE — what the pin
  // protects instead is that advancing stays CONDITION-GATED (top of the band earns the jump,
  // the calendar never does) and that exhortation vocabulary stays out.
  // 2026-09-09: the add-weight trigger was ours and is gone; the cue is the page's reserve rule only.
  assert(!s.includes('add weight'), `no add-weight instruction on the cue: ${STANDING_ACCESSORY_SET_CUE}`);
  for (const banned of ['push hard', 'max', 'go for it', 'crush']) {
    assert(!s.includes(banned), `standing cue must not contain "${banned}": ${STANDING_ACCESSORY_SET_CUE}`);
  }
});

Deno.test('deload line — states the fact before the instruction, and concedes nothing', () => {
  // Rewritten 2026-08-01 from "Nothing to prove. Move it fast anyway." The concession was the part
  // an athlete read, and it framed a prescribed light day as a write-off.
  const s = BAR_SPEED_COPY.deload.toLowerCase();
  assertStringIncludes(s, 'on purpose');
  for (const conceding of ['nothing to prove', 'anyway']) {
    assert(!s.includes(conceding), `deload line must not concede: ${BAR_SPEED_COPY.deload}`);
  }
});

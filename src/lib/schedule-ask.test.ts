/**
 * WHICH SCHEDULE ROW IS OPEN — the default, the choice, and the difference between them.
 *
 * ⛔ THIS FILE EXISTS BECAUSE THE BUG IT PINS REACHED A DEVICE. On 2026-08-19 the Schedule step
 * could not open its "High intensity days" row at all: the render gate excluded `hard`
 * unconditionally, so a tap stored the key and the card re-opened Long run instead. Both hard
 * sessions' day pickers were unreachable, and the row's collapsed summary still read
 * `Run · Tue · Ride · Fri`, which is why it read as answered rather than broken.
 *
 * ⚠️ THE SUITE COULD NOT HAVE SEEN IT — the rule lived inline in a 5,800-line component's render
 * body, reachable only by mounting the wizard. Extracting it is what made it testable, and that is
 * the point of the extraction rather than tidiness.
 *
 * Run: ~/.deno/bin/deno test --allow-all --no-check src/lib/schedule-ask.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { type ScheduleRowKey, defaultScheduleAsk, resolveScheduleAsk } from './schedule-ask.ts';

/** The card as it renders for a run + ride athlete with a hard day, in display order. */
const FULL: ScheduleRowKey[] = ['long', 'ride', 'hard'];
/** Run only — no ride row to fall back to. */
const RUN_ONLY: ScheduleRowKey[] = ['long', 'hard'];

// ── THE DEFAULT ──────────────────────────────────────────────────────────────

Deno.test('⛔ THE OPTIONAL QUESTION NEVER OPENS BY DEFAULT', () => {
  // §1i: an athlete with no appetite for intervals is having a normal week, not an incomplete one.
  assertEquals(defaultScheduleAsk(FULL), 'long');
  assertEquals(defaultScheduleAsk(RUN_ONLY), 'long');
  assertEquals(defaultScheduleAsk(['hard', 'ride']), 'ride', 'hard is skipped even when it is first');
});

Deno.test('the per-week COUNTS are not day questions and never open the card', () => {
  assertEquals(defaultScheduleAsk(['runs', 'rides', 'hard', 'ride']), 'ride');
});

Deno.test('an unset choice resolves to the first non-hard row', () => {
  assertEquals(resolveScheduleAsk('schedule', null, FULL), 'long');
});

Deno.test('a card with nothing but the optional row still answers, rather than opening nothing', () => {
  // The fallback of last resort. `long` is not in `rowKeys` here, and that is the honest outcome:
  // no row opens, which beats opening the one the athlete did not ask for.
  assertEquals(defaultScheduleAsk(['hard']), 'long');
});

// ── THE CHOICE ───────────────────────────────────────────────────────────────

Deno.test('⛔⛔ AN EXPLICIT TAP ON THE HARD ROW OPENS IT — this is the bug, pinned', () => {
  // Before the fix this returned 'long': the gate's `!== 'hard'` rejected the stored key and fell
  // through to the default, so the row could never open and neither day picker was reachable.
  assertEquals(resolveScheduleAsk('schedule', 'hard', FULL), 'hard');
  assertEquals(resolveScheduleAsk('schedule', 'hard', RUN_ONLY), 'hard');
});

Deno.test('a tap on any other row still wins', () => {
  assertEquals(resolveScheduleAsk('schedule', 'ride', FULL), 'ride');
  assertEquals(resolveScheduleAsk('schedule', 'long', FULL), 'long');
});

Deno.test('the choice survives — it is not re-defaulted on every read', () => {
  // The regression this guards: re-deriving the default each render would reopen `long` under the
  // athlete the moment anything else in the card changed.
  let chosen: ScheduleRowKey = 'hard';
  for (let i = 0; i < 5; i++) chosen = resolveScheduleAsk('schedule', chosen, FULL);
  assertEquals(chosen, 'hard');
});

// ── STALENESS — the guard that is NOT the bug and must stay ──────────────────

Deno.test('⚠️ A CHOICE FOR A ROW THAT NO LONGER RENDERS FALLS BACK TO THE DEFAULT', () => {
  // Posture is editable on an earlier step. Walking Back, dropping the bike and walking forward
  // again would otherwise leave `ride` open on a card with no ride row — an open row rendering
  // nothing, with its day chips writing to a discipline that is not in the plan.
  assertEquals(resolveScheduleAsk('schedule', 'ride', RUN_ONLY), 'long');
});

Deno.test('and dropping the hard day releases a hard choice the same way', () => {
  assertEquals(resolveScheduleAsk('schedule', 'hard', ['long', 'ride']), 'long');
});

// ── THE HARD-DAY STEP ────────────────────────────────────────────────────────

Deno.test('⛔ THE HARD-DAY STEP ALWAYS OPENS ON ITS OWN QUESTION', () => {
  // A screen whose only question is collapsed behind a tap. The step overrides the choice, so an
  // athlete who last tapped Long run does not arrive at a closed card.
  assertEquals(resolveScheduleAsk('hardday', 'long', FULL), 'hard');
  assertEquals(resolveScheduleAsk('hardday', null, FULL), 'hard');
  assertEquals(resolveScheduleAsk('hardday', 'ride', FULL), 'hard');
});

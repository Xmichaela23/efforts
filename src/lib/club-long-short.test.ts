// ============================================================================
// THE CLUB LONG-RIDE SHORTFALL NOTE — slice 2b, 2026-08-25.
//
// ⛔ WHAT IT MUST NEVER DO. Michael's ruling is that nothing on this path blocks and nothing is
// invented: the note fires only when BOTH numbers genuinely exist, and it reports the plan's own
// target rather than one this layer picked. A note that appears with no answered duration, or that
// quotes a target the block does not have, is the "confident wrong answer" failure.
//
// ⚠️ THE SENTENCE ITSELF IS PINNED HERE TOO. `week-rules-copy.ts` is the single owner of the words
// and this asserts the row exists and reads as a fact, so a reword cannot quietly turn it into an
// instruction ("shorten your ride") — COPY-VOICE rule 7.
//
// Run: ~/.deno/bin/deno test --allow-all --no-check src/lib/club-long-short.test.ts
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { PLACEMENT_RULES, ruleWarning, tierOf } from './week-rules-copy.ts';

/**
 * The client's own rule, transcribed from `NonRaceBuilder` `weekNotes`. ⚠️ A TRANSCRIPTION CAN
 * DRIFT from the component; it is asserted against the component's source below so it cannot.
 */
const shortfall = (targetMinutes: number, clubMinutes: number | ''): number | null => {
  if (!(typeof clubMinutes === 'number' && clubMinutes > 0)) return null;
  const shortBy = targetMinutes - clubMinutes;
  if (!(targetMinutes > 0 && shortBy > 0)) return null;
  return Math.round(shortBy / 5) * 5;
};

Deno.test('⛔ SILENT WHEN THE DURATION WAS NOT ANSWERED — no note beats a note about zero', () => {
  assertEquals(shortfall(170, ''), null);
  assertEquals(shortfall(170, 0), null);
});

Deno.test('⛔ SILENT WHEN THE WEEK HAS NO LONG SESSION TO COMPARE AGAINST', () => {
  assertEquals(shortfall(0, 120), null);
});

Deno.test('⛔ SILENT WHEN THE CLUB RIDE MEETS OR BEATS THE TARGET — a club ride is not a problem', () => {
  assertEquals(shortfall(170, 170), null);
  assertEquals(shortfall(170, 210), null);
});

Deno.test('⛔ FIRES ONLY ON A REAL SHORTFALL, rounded to 5 minutes', () => {
  // ⚠️ "usually about two hours" is not a stopwatch reading; "47 minutes short" would be precision
  // the input does not carry.
  assertEquals(shortfall(170, 120), 50);
  assertEquals(shortfall(172, 120), 50);
  assertEquals(shortfall(170, 118), 50);
});

Deno.test('⛔ THE SENTENCE IS A FACT, NOT AN INSTRUCTION (COPY-VOICE rule 7)', () => {
  const line = ruleWarning('club_long_short', { shortMinutes: 50 });
  assert(line, 'the club shortfall row is gone from the copy table');
  assert(line!.includes('50'), `the shortfall minutes are not in the sentence: ${line}`);
  for (const banned of ['should', 'try to', 'consider', 'make sure', 'need to', 'must']) {
    assert(!line!.toLowerCase().includes(banned), `the shortfall line instructs the athlete: "${banned}"`);
  }
  assertEquals(tierOf('club_long_short'), 'tradeoff', 'a club ride running short is not a breach');
});

Deno.test('⛔ IT IS NOT IN THE RULES LIST — a club duration is not a placement rule', () => {
  // ⚠️ "How the week is put together" states how the ENGINE places sessions. A fact about one
  // athlete's club ride is not one of those, and listing it there would teach a rule that is not one.
  for (const r of PLACEMENT_RULES) {
    assert(!/club/i.test(r), `a club sentence leaked into the placement rules: ${r}`);
  }
});

Deno.test('⛔ THE COMPONENT STILL COMPUTES IT THIS WAY — the transcription above is not stale', () => {
  const src = Deno.readTextFileSync(new URL('../components/NonRaceBuilder.tsx', import.meta.url).pathname);
  assert(
    /const shortBy = target - state\.longClubMinutes;/.test(src),
    'the shortfall derivation moved — re-read it and update the transcription in this file',
  );
  assert(
    /add\('club_long_short', \{ shortMinutes: Math\.round\(shortBy \/ 5\) \* 5 \}\)/.test(src),
    'the 5-minute rounding or the rule id changed',
  );
  assert(
    /if \(target > 0 && shortBy > 0\)/.test(src),
    'the guard that keeps the note silent without both numbers is gone',
  );
  // ⚠️ THE SPORT GUARD — the frame's one long slot can be a RUN while the club is a ride, and the
  // note must not compare the two. Found on the dev preview, 2026-08-25.
  assert(
    /const wantType = scheduleRunShown \? 'run' : 'ride';/.test(src),
    'the long-session sport guard is gone — a club ride can be measured against a long run again',
  );
});

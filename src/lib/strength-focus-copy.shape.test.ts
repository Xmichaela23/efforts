/**
 * ⛔ THE NARRATIVE MUST FOLLOW THE BLOCK'S ACTUAL SHAPE.
 *
 * The continuity-derived ratio made the cycle shape variable on 2026-07-28. The copy did not follow,
 * and the first anchor-weighted block generated said:
 *
 *     "0 building cycles, then one measuring cycle from week 9."
 *
 * over a plan in which every cycle was a measuring cycle. Both halves false, and "0" rendered as a
 * word in prose. §0f: the block knew its own shape and the narration did not read it.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  strengthFocusBufferLine,
  strengthFocusCeilingLine,
  strengthFocusDescription,
  strengthFocusSections,
} from './strength-focus-copy.ts';

const architecture = (leaders: number, anchors: number) =>
  strengthFocusSections({ weeks: 12, leaderCycles: leaders, anchorCycles: anchors, anchorStartWeek: 12 - 4 * anchors + 1 })[1].body;

Deno.test('⛔ NO BLOCK EVER SAYS "0 building cycles"', () => {
  for (let leaders = 0; leaders <= 3; leaders++) {
    const body = architecture(leaders, 3 - leaders || 1);
    assert(!/\b0 building/.test(body), `leaders=${leaders} printed a zero count: ${body}`);
  }
});

Deno.test('⛔ AN ANCHOR-WEIGHTED BLOCK DOES NOT CLAIM ONE MEASURING CYCLE', () => {
  const aaa = architecture(0, 3);
  assert(/All 3 cycles are measuring cycles/.test(aaa), aaa);
  assert(!/one measuring cycle/.test(aaa), `AAA still claims a single anchor: ${aaa}`);

  // ⚠️ AND THE UNCHANGED CASE, which is the whole reason this is safe: LLA reads exactly as before.
  assertEquals(
    architecture(2, 1),
    "Sub-maximal loading (Wendler's 5/3/1) keeps fatigue manageable. Four lifting days, placed " +
      'around your endurance. 2 building cycles, then one measuring cycle from week 9. Each ends in a deload.',
  );

  // The middle shape has to be grammatical too — it is reachable via `returning`.
  assert(/1 building cycle, then 2 measuring cycles/.test(architecture(1, 2)), architecture(1, 2));
});

Deno.test('the buffer line names EVERY measured cycle, not just the last', () => {
  assert(/last set of the final cycle/.test(strengthFocusBufferLine('', 1)));
  assert(/last set of each cycle/.test(strengthFocusBufferLine('', 3)));
  // ⚠️ 85% describes the WORKING NUMBER, not the sets — the ramp below it prints three percentages
  // and the old wording read as a contradiction against them.
  assert(/working number starts at 85%/.test(strengthFocusBufferLine('', 1)));
});

// ── The ceiling line ────────────────────────────────────────────────────────

Deno.test('⛔ THE CEILING READS AS A STALE MAX, NEVER AS A LIMIT REACHED', () => {
  const line = strengthFocusCeilingLine(['Back Squat', 'Overhead Press']);
  assert(/out of date/.test(line), line);
  // ⛔ The framing is the point. "Maxed out" tells someone mid-progress they have plateaued.
  assert(!/maxed out|plateau|limit reached|as far as/i.test(line), line);
  // ⚠️ COPY-VOICE: no imperative. The consequence is conditional, not an instruction.
  assert(!/^(Re-?test|Test|Go |Try |Make sure|You should|You need)/im.test(line), line);
  assert(/would let/.test(line), `no conditional consequence: ${line}`);
});

Deno.test('⛔ NO CEILING, NO SENTENCE — the line never appears without cause', () => {
  assertEquals(strengthFocusCeilingLine([]), '');
  assertEquals(strengthFocusCeilingLine(['']), '');
  // Singular agrees.
  const one = strengthFocusCeilingLine(['Back Squat']);
  assert(/Back Squat reaches/.test(one) && /that lift holds/.test(one), one);
});

// ── Compromises are rendered, not discarded ─────────────────────────────────

Deno.test('⛔ `placement_compromises` REACHES THE ATHLETE', () => {
  const withCost = strengthFocusDescription({
    weeks: 12,
    leaderCycles: 0,
    anchorCycles: 3,
    anchorStartWeek: 1,
    compromises: [{ kind: 'cost', text: 'Your ride hours land short of the 3h target.' }],
  });
  assert(/ride hours land short/.test(withCost), `the cost was dropped:\n${withCost}`);

  // ⚠️ And the ceiling entries are NOT printed twice — the header line already says it in words the
  // athlete can act on, so the raw engine note is filtered out of the cost list.
  const both = strengthFocusDescription({
    weeks: 12,
    leaderCycles: 0,
    anchorCycles: 3,
    anchorStartWeek: 1,
    ceilingLifts: ['Back Squat'],
    compromises: [{ kind: 'cost', text: 'Back Squat: the working number reaches 90% of the 110 lb max on file.' }],
  });
  assertEquals(both.match(/Back Squat/g)?.length, 1, `said twice:\n${both}`);

  // No compromises → no cost paragraph at all.
  const clean = strengthFocusDescription({ weeks: 12, leaderCycles: 2, anchorCycles: 1, anchorStartWeek: 9 });
  assert(!/What this week costs/.test(clean), clean);
});

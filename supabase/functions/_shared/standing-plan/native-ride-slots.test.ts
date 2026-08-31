/**
 * ⛔⛔ A SLOT THE PAGE PRESCRIBES AS A RIDE (2026-08-30) — two defects that reached Michael's phone,
 * both from the same assumption: that a slot is a RUN until something converts it.
 *
 * p274 prescribes `Cyc AnA` on day 2 and `Cyc endurance` on day 4. Every frame before it was
 * transcribed run-only, so "unconverted means run" was true by construction and nothing tested it.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { assignSports, assignedSlot, hardSlotsInFrameOrder } from './sport-slots.ts';
import { FRAMES } from './frames.ts';

const ALL = FRAMES.all_rounder.columns.standard;
const FIVEK = FRAMES.strength_5k.columns.standard;
/** His answers: a run on the first quality slot, the two prescribed rides, the long one moved to the bike. */
const ANSWERS = { '1:0': 'run', '2:0': 'ride', '3:0': 'run', '4:0': 'ride', '6:0': 'ride' };

Deno.test('⛔⛔ THE ASSIGNMENT COUNTS A PRESCRIBED RIDE AS A RIDE', () => {
  /**
   * ⛔ WHAT IT REPORTED BEFORE: `{ run: 4, ride: 1 }` for a week of two runs and three rides. The
   * families were right so the sessions BUILT as rides and looked correct — the bookkeeping lied,
   * and everything that counts sports reads the bookkeeping. The day-count trim then saw four runs
   * against a stated two and **dropped two of the frame's own sessions**; the day-count fill saw one
   * ride against a stated three and **added two filler rides, one of them on the REST day.**
   */
  const a = assignSports(ALL as never, { slots: ANSWERS } as never);
  assertEquals(a.counts.run, 2, 'a prescribed ride is being counted as a run');
  assertEquals(a.counts.ride, 3);
  for (const d of ALL) {
    d.endurance.forEach((slot, i) => {
      const x = assignedSlot(a, d.day, i, slot);
      if (String(slot.family).startsWith('ride_')) {
        assertEquals(x.sport, 'ride', `day ${d.day}: the page prescribes a ride and it reads as ${x.sport}`);
      }
    });
  }
});

Deno.test('⛔ AND THE 5K FRAME IS UNTOUCHED — every slot is a run family, so nothing changed', () => {
  const a = assignSports(FIVEK as never, { slots: { '1:0': 'run', '3:0': 'ride', '4:0': 'run', '6:0': 'run' } } as never);
  assertEquals(a.counts.run, 3);
  assertEquals(a.counts.ride, 1);
});

Deno.test('⛔⛔ THE HARD PAIR IS NOT SWAPPED ON A FRAME THAT PRESCRIBES A RIDE', () => {
  /**
   * ⛔ p246 + p278's rule: a hard ride takes day 1 and a hard run takes day 3, whichever way round
   * they were picked. It holds because BOTH of that frame's quality slots are run families mapping
   * onto one ride family — "which of the two is the ride" is a real question there.
   *
   * ⛔ ON p274 THE SECOND QUALITY SLOT IS A RIDE AND CANNOT BE ANYTHING ELSE, so its answer is
   * permanently `ride`. An athlete answering `run` on the first hit the exact `run + ride` case, the
   * rule fired, and **day 1 flipped to a ride — becoming the same anaerobic ride the frame already
   * prescribes on day 2, two on consecutive days — while their run answer moved onto a slot that
   * ignores it.**
   */
  const out = hardSlotsInFrameOrder({ ...ANSWERS }, ALL as never) as Record<string, string>;
  assertEquals(out['1:0'], 'run', 'the athlete\'s run was swapped off day 1');
  assertEquals(out['2:0'], 'ride');

  // ⚠️ AND THE RULE STILL FIRES WHERE IT BELONGS. Same call, the 5K frame, the same one-of-each pair.
  const five = hardSlotsInFrameOrder({ '1:0': 'run', '3:0': 'ride' }, FIVEK as never) as Record<string, string>;
  assertEquals(five['1:0'], 'ride', 'the hard-pair rule stopped firing on the frame it is for');
  assertEquals(five['3:0'], 'run');

  // ⚠️ AND WITHOUT THE FRAME IT BEHAVES EXACTLY AS IT ALWAYS DID — every caller that predates this.
  const bare = hardSlotsInFrameOrder({ '1:0': 'run', '3:0': 'ride' }) as Record<string, string>;
  assertEquals(bare['1:0'], 'ride');
});

Deno.test('⛔ THE WEEK IS p274, DAY FOR DAY, WITH THE DAY COUNTS SENT', async () => {
  /**
   * ⛔ THE COUNTS ARE WHAT BROKE IT. The wizard derives "how many runs / how many rides" from the
   * answers and sends them; with the sport stamp wrong they dropped two sessions and added two.
   * ⚠️ ASSERTED WITH THEM SENT, because that is what the athlete's build actually carries.
   */
  const { composeWeek } = await import('./compose.ts');
  const { defaultCompetitionLifts } = await import('./frame-resolver.ts');
  const w = composeWeek({
    competitionLifts: defaultCompetitionLifts(), roundTo: 5, frame: 'all_rounder', week: 3,
    column: 'standard', equipment: ['Barbell + plates', 'Dumbbells', 'Flat bench'],
    sportMix: { slots: ANSWERS }, enduranceDaysBySport: { run: 2, ride: 3 },
  } as never);
  const endurance = w.sessions.filter((s) => s.type === 'run' || s.type === 'ride')
    .map((s) => `${s.day}:${s.type}`);
  assertEquals(endurance, [
    'Monday:run',      // day 1 — MLSS+
    'Tuesday:ride',    // day 2 — Cyc AnA
    'Wednesday:run',   // day 3 — NT, beside the plyo day
    'Thursday:ride',   // day 4 — Cyc endurance
    'Saturday:ride',   // day 6 — the long session, moved to the bike by the athlete
  ], 'the built week is not p274');
  // ⛔ NOTHING ON DAY 5, AND NOTHING ON THE REST DAY. Both carried a filler ride before the fix.
  assert(!endurance.some((x) => x.startsWith('Friday')), 'p274 prescribes no endurance on day 5');
  assert(!endurance.some((x) => x.startsWith('Sunday')), 'a session landed on the rest day');
});

/**
 * ⛔⛔ EVERY SESSION CARRIES THE PAGE IT COMES FROM — Michael, 2026-08-31: *"do we have a page per
 * session?"*
 *
 * The block carried ONE citation, the programme's own page, and every session under it carried none
 * — while the library has held a page reference **per session type and per workout shape** all
 * along. They stopped at the composer and never reached the plan row.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeWeek } from './compose.ts';
import { FRAMES, type FrameId } from './frames.ts';

const KIT = ['Barbell + plates', 'Dumbbells', 'Flat bench'];
const SLOTS = { '1:0': 'run', '2:0': 'ride', '3:0': 'run', '4:0': 'ride', '6:0': 'run' };

function week(frame: FrameId, n: number) {
  return composeWeek({
    competitionLifts: { push_upper: 'Bench Press', press_lower: 'Back Squat', hinge_lower: 'Deadlift' },
    roundTo: 5, frame, week: n, column: 'standard', equipment: KIT,
    ...(frame === 'all_rounder' ? { sportMix: { slots: SLOTS } } : {}),
  } as never) as { sessions: Array<{ name: string; type: string; cite?: string }> };
}

Deno.test('⛔⛔ NOT ONE SESSION IS UNCITED, ON EITHER PROGRAMME', () => {
  for (const frame of ['strength_5k', 'all_rounder'] as const) {
    for (const n of [1, 2, 3]) {
      for (const s of week(frame, n).sessions) {
        assert(s.cite && /^Viada p/.test(s.cite),
          `${frame} week ${n}: "${s.name}" carries no page — it came from somewhere and should say where`);
      }
    }
  }
});

Deno.test('⛔ THE PAGE IS THE NARROWEST TRUE ONE, NOT THE PROGRAMME\'S FOR EVERYTHING', () => {
  /**
   * ⛔ THE FAILURE THIS FORBIDS is a citation that is technically defensible and useless: stamping
   * the programme's page on every row. **A quality run comes from the session library's own page**,
   * and a reader chasing that session must land on it and not on the table that scheduled it.
   */
  const s = week('all_rounder', 2).sessions;
  const by = (n: string) => s.find((x) => x.name === n)?.cite;
  assertEquals(by('Hard Run'), 'Viada pp231-232');
  assertEquals(by('Near-threshold Run'), 'Viada pp233-234');
  assertEquals(by('Anaerobic Ride'), 'Viada p237');
  assertEquals(by('Long Run'), 'Viada p235');
  assertEquals(by('Plyometrics'), 'Viada p227');
  // ⛔ AND THE LIFTING DAYS DO take the programme's page, because that is genuinely where they come
  // from — one table, one page. The per-MOVEMENT pages live on the movements.
  assertEquals(by('Upper body: Push'), FRAMES.all_rounder.cite);

  // ⚠️ AND THE TEST WEEK CITES THE PRETEST, not the programme: the three-step protocol and the
  // working number are p215's.
  assertEquals(week('all_rounder', 1).sessions.find((x) => x.name === 'Test: Upper')?.cite, 'Viada p215');
});

Deno.test('⚠️ THE CITE IS A PAGE, NOT A NOTE', () => {
  /**
   * An archetype's stored `cite` often carries a clause after the page — *"Viada pp231-232 —
   * 2-minute recovery walk/jog between sets"* — which is provenance for a reader of the library and
   * noise on a session row. The clause already lives in the session's own notes.
   */
  for (const s of week('all_rounder', 2).sessions) {
    assert(!s.cite!.includes('—'), `"${s.name}" cites a whole note rather than a page: ${s.cite}`);
    assert(s.cite!.length <= 24, `"${s.name}" cites something too long to be a page: ${s.cite}`);
  }
});

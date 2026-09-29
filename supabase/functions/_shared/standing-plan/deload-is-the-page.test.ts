/**
 * ⛔ THE DELOAD COLUMN IS THE PAGE'S, WHOLE (Michael, 2026-09-29: "It should all be what the book says"). A picked
 * long-run length is keyed by frame slot; in the deload column that slot is another session, printed at its own level.
 * Found by the 2026-09-28 plan sweep: Strength Lead's deload Saturday built an 80-minute easy run at level 3 where
 * p246 prints VT1 level 1.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeWeek, defaultCompetitionLifts } from './index.ts';
import { FRAMES, type FrameId } from './frames.ts';

const base = (frame: FrameId, minutes: Record<string, number>, column: 'standard' | 'taper') => composeWeek({
  frame, week: 6, column, competitionLifts: defaultCompetitionLifts(),
  seed1RMs: { bench: 200, squat: 265, deadlift: 340, overheadPress: 125 },
  equipment: ['Commercial gym'], roundTo: 5,
  sportMix: { minutes } as never,
} as never);

const levelOf = (s: { tags?: string[] }) => Number((s.tags ?? []).find((t) => t.startsWith('level:'))?.slice(6));
const slotOf = (s: { tags?: string[] }) => (s.tags ?? []).find((t) => t.startsWith('slot:'))?.slice(5);

Deno.test('Strength Lead deload Saturday: VT1 level 1 (p246), not the picked 70-minute long run', () => {
  const wk = base('strength_5k', { '4:0': 30, '6:0': 70 }, 'taper');
  const sat = wk.sessions.find((s: any) => slotOf(s) === '6:0');
  assert(sat, 'a day-6 session');
  assertEquals(levelOf(sat as never), 1);
  assert(Number((sat as any).duration) <= 30, `built ${(sat as any).duration} min`);
});

Deno.test('every run plan: no deload endurance session sits above the level its page prints', () => {
  for (const frame of ['strength_5k', 'strength_half', 'hyp_5k', 'hyp_half', 'all_rounder'] as FrameId[]) {
    const printed = new Map<string, number>();
    for (const d of FRAMES[frame].columns.taper ?? []) d.endurance.forEach((e, i) => printed.set(`${d.day}:${i}`, Number(e.level)));
    const wk = base(frame, { '4:0': 90, '6:0': 120, '2:0': 90 }, 'taper');
    for (const s of wk.sessions as any[]) {
      const k = slotOf(s);
      if (!k || !printed.has(k)) continue;
      assert(levelOf(s) <= printed.get(k)!, `${frame} ${k}: level ${levelOf(s)} over the page's ${printed.get(k)}`);
    }
  }
});

Deno.test('the standard column still takes the picked long-run length', () => {
  const wk = base('strength_5k', { '4:0': 30, '6:0': 70 }, 'standard');
  const sat = wk.sessions.find((s: any) => slotOf(s) === '6:0') as any;
  assertEquals(Number(sat.duration), 70);
});

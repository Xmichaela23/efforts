// ⛔ "CAN'T TRAIN THIS DAY" (2026-09-21) — the placer, on the move check. Includes the workorder's worked example.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { placeLostDay } from './lost-day.ts';
import type { MoveRow } from './index.ts';

const P108 = 'Two sessions this day: 6 to 8 hours before the lift, or 4 to 6 if the first is an easy session under an hour, with a full meal in between.';
const S = (id: string, date: string, type: string, name: string, status = 'planned'): MoveRow =>
  ({ id, date, type, name, workout_status: status, training_plan_id: 'p' });

/**
 * THE WORKED EXAMPLE (workorder): Michael's week Sep 21–27, All Rounder standard, Tuesday lost. Today is Monday 21,
 * Sunday is a day off. The All Rounder prints (p274): Mon Upper Push + MLSS run · Tue Hinge + Cyc AnA (Progressive
 * Repeats) · Wed plyo + NT run (Long Sub-Threshold Repeats) · Thu Upper Pull + 75 min easy ride · Fri Lower Push ·
 * Sat 135 min long ride · Sun rest. Hinge also sits on the Tuesdays either side.
 */
const WEEK: MoveRow[] = [
  S('hinge-prev', '2026-09-15', 'strength', 'Lower body: Hinge', 'completed'),
  S('push', '2026-09-21', 'strength', 'Upper body: Push'),
  S('mlss', '2026-09-21', 'run', 'MLSS+ Repeats'),
  S('hinge', '2026-09-22', 'strength', 'Lower body: Hinge'),
  S('ana', '2026-09-22', 'ride', 'Progressive Repeats'),
  { ...S('plyo', '2026-09-23', 'strength', 'Plyo warm-up'), tags: ['standing_plan', 'plyo'] },
  S('nt', '2026-09-23', 'run', 'Long Sub-Threshold Repeats'),
  S('pull', '2026-09-24', 'strength', 'Upper body: Pull'),
  S('easy', '2026-09-24', 'ride', 'Endurance Ride'),
  S('lpush', '2026-09-25', 'strength', 'Lower body: Push'),
  S('long', '2026-09-26', 'ride', 'Long Ride'),
  S('hinge-next', '2026-09-29', 'strength', 'Lower body: Hinge'),
];
const plan = (moves?: Record<string, string>, rows = WEEK, today = '2026-09-21') =>
  placeLostDay({ lostDate: '2026-09-22', rows, daysOff: ['sunday'], today, moves });
const where = (p: ReturnType<typeof plan>, id: string) => p.sessions.find((s) => s.id === id)!;

Deno.test('⛔ WORKED EXAMPLE: Tuesday lost — Hinge to Wednesday, Progressive Repeats to Friday (the hand answer)', () => {
  const p = plan();
  // Hinge (a lift, placed first): Mon and Thu already hold two; Wednesday holds one — the plyo warm-up does not count
  // (2026-09-21) — and its gap (8 days after Sep 15) is inside p80. Fri/Sat would pass nine days.
  assertEquals(where(p, 'hinge').to, '2026-09-23');
  assertEquals(where(p, 'hinge').notes, [P108]);
  // Progressive Repeats: Wednesday is now full, Mon and Thu hold two; Friday (one day nearer than Saturday) fits.
  // The p108 note shows (Lower Push is there) and no longer stops the day.
  assertEquals(where(p, 'ana').to, '2026-09-25');
  assertEquals(where(p, 'ana').notes, [P108]);
  // Nothing else moves, nothing lands on Tuesday or Sunday.
  assertEquals(p.sessions.filter((s) => s.to !== s.from).map((s) => s.id).sort(), ['ana', 'hinge']);
  assertEquals(p.sessions.some((s) => s.to === '2026-09-22' || s.to === '2026-09-27'), false);
});

Deno.test('⛔ MICHAEL\'S CASE: Wednesday lost — the plyo warm-up goes with Long Sub-Threshold Repeats to Friday; Sunday stays empty', () => {
  const p = placeLostDay({ lostDate: '2026-09-23', rows: WEEK, daysOff: ['sunday'], today: '2026-09-21' });
  assertEquals(where(p, 'nt').to, '2026-09-25');
  assertEquals(where(p, 'nt').notes, [P108]);
  assertEquals(where(p, 'plyo').to, '2026-09-25');
  assertEquals(where(p, 'plyo').notes, []);
  assertEquals(p.sessions.filter((s) => s.to === '2026-09-27'), []);
});

Deno.test('WORKED EXAMPLE, the athlete drags Hinge to Saturday: it stays there; the ride is placed around it', () => {
  const p = plan({ hinge: '2026-09-26' });
  assertEquals(where(p, 'hinge').to, '2026-09-26');
  assertEquals(where(p, 'hinge').notes, [P108, 'Hinge: 11 days until the next one. Consistent improvement needs one every 8 to 9 days.']);
  // Wednesday holds one session (the warm-up does not count) and no lift, so the ride goes there with no note.
  assertEquals(where(p, 'ana').to, '2026-09-23');
  assertEquals(where(p, 'ana').notes, []);
});

Deno.test('⛔ A DAY THAT FITS IS TAKEN FIRST — lifts by the p80 gap', () => {
  const rows = [
    S('h0', '2026-09-15', 'strength', 'Lower body: Hinge', 'completed'),
    S('h1', '2026-09-22', 'strength', 'Lower body: Hinge'),
    S('r1', '2026-09-24', 'run', 'Easy Run'),
    S('h2', '2026-09-29', 'strength', 'Lower body: Hinge'),
  ];
  // Open: Mon (6/8 days), Wed (8/6), Fri (10 — p80 note), Sat (11 — note). Thu holds a run. Mon and Wed tie on the
  // gap; the nearer-to-Tuesday tie goes to the earlier: Monday.
  const p = plan(undefined, rows);
  assertEquals(where(p, 'h1').to, '2026-09-21');
  assertEquals(where(p, 'h1').notes, []);
});

Deno.test('⛔ NEVER BEFORE TODAY, NEVER A DAY OFF, NEVER THE LOST DAY', () => {
  const rows = [S('r1', '2026-09-24', 'run', 'Easy Run'), S('r2', '2026-09-24', 'ride', 'Easy Ride')];
  const p = placeLostDay({ lostDate: '2026-09-24', rows, daysOff: ['friday', 'saturday'], today: '2026-09-24' });
  // Before today: Mon–Wed. Days off: Fri, Sat. Lost: Thu. Only Sunday is open this week.
  assertEquals(p.sessions.map((s) => s.to), ['2026-09-27', '2026-09-27']);
});

Deno.test('⛔ NO THIRD SESSION WHERE A DAY WITH FEWER EXISTS (OURS)', () => {
  const rows = [
    S('a', '2026-09-22', 'run', 'Easy Run'), S('b', '2026-09-22', 'ride', 'Easy Ride'), S('c', '2026-09-22', 'run', 'Tempo Run'),
    S('x', '2026-09-23', 'swim', 'Swim'), S('y', '2026-09-23', 'swim', 'Swim 2'),
  ];
  const p = plan(undefined, rows);
  const perDay = new Map<string, number>();
  for (const s of p.sessions) perDay.set(s.to, (perDay.get(s.to) ?? 0) + 1);
  assertEquals([...perDay.values()].every((n) => n <= 2), true);
});

Deno.test('⛔ NOTHING IS DROPPED: with no open day left this week it goes to the closest one next week', () => {
  const rows = [S('r', '2026-09-27', 'run', 'Long Run')];
  const p = placeLostDay({ lostDate: '2026-09-27', rows, daysOff: [], today: '2026-09-27' });
  assertEquals(p.sessions[0].to, '2026-09-28');
});

Deno.test('A DONE SESSION ON THE LOST DAY IS SHOWN AND NEVER MOVED', () => {
  const rows = [S('d', '2026-09-22', 'run', 'Easy Run', 'completed'), S('p', '2026-09-22', 'ride', 'Easy Ride')];
  const p = plan(undefined, rows);
  assertEquals(where(p, 'd').to, '2026-09-22');
  assertEquals(where(p, 'd').movable, false);
  assertEquals(where(p, 'p').to !== '2026-09-22', true);
});

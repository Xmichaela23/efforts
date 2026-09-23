// ⛔ "CAN'T TRAIN THIS DAY" (2026-09-21) — the placer, on the move check. Includes the workorder's worked example.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { placeLostDay, type LostDayPlan } from './lost-day.ts';
import { tagsAfterMove } from '../moved-from.ts';
import type { MoveRow } from './index.ts';

const P108 = (day: string, word = 'run') => `Two sessions on ${day}. ${word.charAt(0).toUpperCase() + word.slice(1)} in the morning and lift 6 to 8 hours later.`;
const S = (id: string, date: string, type: string, name: string, status = 'planned', band?: string): MoveRow =>
  ({ id, date, type, name, workout_status: status, training_plan_id: 'p', ...(band ? { tags: ['standing_plan', `band:${band}`] } : {}) });

/**
 * THE WORKED EXAMPLE (workorder): Michael's week Sep 21–27, All Rounder standard, Tuesday lost. Today is Monday 21,
 * Sunday is a day off. The All Rounder prints (p274): Mon Upper Push + MLSS run · Tue Hinge + Cyc AnA (Progressive
 * Repeats) · Wed plyo + NT run (Long Sub-Threshold Repeats) · Thu Upper Pull + 75 min easy ride · Fri Lower Push ·
 * Sat 135 min long ride · Sun rest. Hinge also sits on the Tuesdays either side.
 */
const WEEK: MoveRow[] = [
  S('hinge-prev', '2026-09-15', 'strength', 'Lower body: Hinge', 'completed'),
  S('push', '2026-09-21', 'strength', 'Upper body: Push'),
  S('mlss', '2026-09-21', 'run', 'MLSS+ Repeats', 'planned', 'above'),
  S('hinge', '2026-09-22', 'strength', 'Lower body: Hinge'),
  S('ana', '2026-09-22', 'ride', 'Progressive Repeats', 'planned', 'above'),
  { ...S('plyo', '2026-09-23', 'strength', 'Plyo warm-up'), tags: ['standing_plan', 'plyo'] },
  S('nt', '2026-09-23', 'run', 'Long Sub-Threshold Repeats', 'planned', 'near'),
  S('pull', '2026-09-24', 'strength', 'Upper body: Pull'),
  { ...S('easy', '2026-09-24', 'ride', 'Endurance Ride', 'planned', 'vt1_or_easier'), duration: 75 },
  S('lpush', '2026-09-25', 'strength', 'Lower body: Push'),
  { ...S('long', '2026-09-26', 'ride', 'Long Ride', 'planned', 'vt1_or_easier'), duration: 135 },
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
  assertEquals(where(p, 'hinge').notes, [P108('Wednesday', 'run')]);
  // Progressive Repeats: Wednesday is now full, Mon and Thu hold two; Friday (one day nearer than Saturday) fits.
  // The p108 note shows (Lower Push is there) and no longer stops the day.
  assertEquals(where(p, 'ana').to, '2026-09-25');
  assertEquals(where(p, 'ana').notes, [P108('Friday', 'ride')]);
  // Nothing else moves, nothing lands on Tuesday or Sunday.
  assertEquals(p.sessions.filter((s) => s.to !== s.from).map((s) => s.id).sort(), ['ana', 'hinge']);
  assertEquals(p.sessions.some((s) => s.to === '2026-09-22' || s.to === '2026-09-27'), false);
});

Deno.test('⛔ MICHAEL\'S CASE: Wednesday lost — the plyo warm-up goes with Long Sub-Threshold Repeats to Friday; Sunday stays empty', () => {
  const p = placeLostDay({ lostDate: '2026-09-23', rows: WEEK, daysOff: ['sunday'], today: '2026-09-21' });
  assertEquals(where(p, 'nt').to, '2026-09-25');
  assertEquals(where(p, 'nt').notes, [P108('Friday', 'run')]);
  assertEquals(where(p, 'plyo').to, '2026-09-25');
  assertEquals(where(p, 'plyo').notes, []);
  assertEquals(p.sessions.filter((s) => s.to === '2026-09-27'), []);
});

Deno.test('WORKED EXAMPLE, the athlete drags Hinge to Saturday: it stays there; the ride is placed around it', () => {
  const p = plan({ hinge: '2026-09-26' });
  assertEquals(where(p, 'hinge').to, '2026-09-26');
  assertEquals(where(p, 'hinge').notes, [P108('Saturday', 'ride'), 'Hinge: 11 days until the next one. Consistent improvement needs one every 8 to 9 days.']);
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

Deno.test('⛔ NO SPILL INTO NEXT WEEK: with no open day left this week the session comes off', () => {
  const rows = [S('r', '2026-09-27', 'run', 'Long Run', 'planned', 'vt1_or_easier')];
  const p = placeLostDay({ lostDate: '2026-09-27', rows, daysOff: [], today: '2026-09-27' });
  assertEquals([p.sessions[0].dropped, p.sessions[0].to], [true, '2026-09-27']);
});

Deno.test('A DONE SESSION ON THE LOST DAY IS SHOWN AND NEVER MOVED', () => {
  const rows = [S('d', '2026-09-22', 'run', 'Easy Run', 'completed'), S('p', '2026-09-22', 'ride', 'Easy Ride')];
  const p = plan(undefined, rows);
  assertEquals(where(p, 'd').to, '2026-09-22');
  assertEquals(where(p, 'd').movable, false);
  assertEquals(where(p, 'p').to !== '2026-09-22', true);
});

// ── More than one day lost (2026-09-22) ──────────────────────────────────────────────────────────

/** What Save writes, applied to the rows: every lost-day session carries `lost_day:`; drops are skipped; a session
 *  placed again after an earlier drop is back on the plan. */
function saved(rows: MoveRow[], p: LostDayPlan): MoveRow[] {
  return rows.map((r) => {
    const s = p.sessions.find((x) => x.id === r.id);
    if (!s || !s.lost_day) return r;
    const mark = (tags: string[]) => [...tags.filter((t) => !t.startsWith('lost_day:')), `lost_day:${s.lost_day}`];
    const base = Array.isArray(r.tags) ? (r.tags as string[]) : [];
    if (s.dropped) return { ...r, workout_status: 'skipped', tags: mark(base) };
    return { ...r, date: s.to, workout_status: 'planned', tags: mark(tagsAfterMove({ ...r, tags: base }, s.to)) };
  });
}
const lose = (rows: MoveRow[], d: string) => placeLostDay({ lostDate: d, rows, daysOff: ['sunday'], today: '2026-09-21' });

Deno.test('⛔ A "DOWN" DAY IS CLOSED: after Tuesday is lost and saved, losing Friday never puts anything on Tuesday', () => {
  const afterTue = saved(WEEK, lose(WEEK, '2026-09-22'));
  const p = lose(afterTue, '2026-09-25');
  assertEquals(p.sessions.some((s) => s.to === '2026-09-22'), false);
});

Deno.test('⛔ LOST DAYS ONLY COST THEIR OWN SESSIONS — two and three days lost in a row', () => {
  for (const run of [['2026-09-22', '2026-09-23', '2026-09-24'], ['2026-09-24', '2026-09-25', '2026-09-26']]) {
    let rows = WEEK;
    for (const d of run) {
      const p = lose(rows, d);
      // Nothing that was never on a lost day moves or comes off.
      const others = p.sessions.filter((s) => !s.lost_day);
      assertEquals(others.filter((s) => s.dropped || s.to !== s.from).map((s) => s.name), []);
      // No day holds three sessions (the warm-up does not count), nothing into next week.
      const per = new Map<string, number>();
      for (const s of p.sessions) if (!s.dropped && s.name !== 'Plyo warm-up') per.set(s.to, (per.get(s.to) ?? 0) + 1);
      assertEquals([...per.values()].every((n) => n <= 2), true);
      assertEquals(p.sessions.every((s) => s.to <= '2026-09-27'), true);
      rows = saved(rows, p);
    }
  }
});

Deno.test('⛔ WHO PICKS FIRST: a lift, then a speed/subthreshold session, then the longest easy session', () => {
  // One open day with room for one more; the lost day holds an easy ride, a threshold run and a lift.
  const rows: MoveRow[] = [
    S('x1', '2026-09-21', 'run', 'Run A', 'planned', 'vt1_or_easier'), S('x2', '2026-09-21', 'ride', 'Ride A', 'planned', 'vt1_or_easier'),
    S('y1', '2026-09-23', 'run', 'Run B', 'planned', 'vt1_or_easier'),
    S('x3', '2026-09-24', 'run', 'Run C', 'planned', 'vt1_or_easier'), S('x4', '2026-09-24', 'ride', 'Ride C', 'planned', 'vt1_or_easier'),
    S('x5', '2026-09-25', 'run', 'Run D', 'planned', 'vt1_or_easier'), S('x6', '2026-09-25', 'ride', 'Ride D', 'planned', 'vt1_or_easier'),
    S('x7', '2026-09-26', 'run', 'Run E', 'planned', 'vt1_or_easier'), S('x8', '2026-09-26', 'ride', 'Ride E', 'planned', 'vt1_or_easier'),
    { ...S('e', '2026-09-22', 'ride', 'Easy Ride', 'planned', 'vt1_or_easier'), duration: 90 },
    S('t', '2026-09-22', 'run', 'Threshold Run', 'planned', 'near'),
    S('l', '2026-09-22', 'strength', 'Lower body: Hinge'),
  ];
  const p = placeLostDay({ lostDate: '2026-09-22', rows, daysOff: ['sunday'], today: '2026-09-21' });
  assertEquals(where(p, 'l').to, '2026-09-23');
  assertEquals([where(p, 't').dropped, where(p, 'e').dropped], [true, true]);
});

Deno.test('p109 "all minutes count": of two easy sessions and room for one, the longer one stays', () => {
  const rows: MoveRow[] = [
    S('x1', '2026-09-21', 'run', 'Run A', 'planned', 'vt1_or_easier'), S('x2', '2026-09-21', 'ride', 'Ride A', 'planned', 'vt1_or_easier'),
    S('y1', '2026-09-23', 'run', 'Run B', 'planned', 'vt1_or_easier'),
    S('x3', '2026-09-24', 'run', 'Run C', 'planned', 'vt1_or_easier'), S('x4', '2026-09-24', 'ride', 'Ride C', 'planned', 'vt1_or_easier'),
    S('x5', '2026-09-25', 'run', 'Run D', 'planned', 'vt1_or_easier'), S('x6', '2026-09-25', 'ride', 'Ride D', 'planned', 'vt1_or_easier'),
    S('x7', '2026-09-26', 'run', 'Run E', 'planned', 'vt1_or_easier'), S('x8', '2026-09-26', 'ride', 'Ride E', 'planned', 'vt1_or_easier'),
    { ...S('short', '2026-09-22', 'run', 'Short Easy Run', 'planned', 'vt1_or_easier'), duration: 30 },
    { ...S('long2', '2026-09-22', 'ride', 'Long Easy Ride', 'planned', 'vt1_or_easier'), duration: 120 },
  ];
  const p = placeLostDay({ lostDate: '2026-09-22', rows, daysOff: ['sunday'], today: '2026-09-21' });
  assertEquals([where(p, 'long2').dropped, where(p, 'short').dropped], [false, true]);
});

Deno.test('⛔ THE WARM-UP FOLLOWS ITS OWN DAY\'S SESSION, not one moved onto that day (Tue then Wed lost)', () => {
  const afterTue = saved(WEEK, lose(WEEK, '2026-09-22'));   // Hinge moved Tue → Wed
  const wed = lose(afterTue, '2026-09-23');
  assertEquals(where(wed, 'plyo').to, where(wed, 'nt').to);
});

Deno.test('⛔ A DAY LOST WHOSE SESSIONS CAME OFF IS CLOSED TOO: Tue, Wed then Thu lost — nothing lands on Wed', () => {
  const afterTue = saved(WEEK, lose(WEEK, '2026-09-22'));
  const afterWed = saved(afterTue, lose(afterTue, '2026-09-23'));
  const thu = lose(afterWed, '2026-09-24');
  assertEquals(thu.sessions.some((s) => !s.dropped && (s.to === '2026-09-22' || s.to === '2026-09-23') && s.from !== s.to), false);
});

Deno.test('⛔ A DAY THE ATHLETE SKIPPED THEMSELVES STAYS OPEN (no lost-day mark)', () => {
  const rows: MoveRow[] = [
    S('sk', '2026-09-24', 'run', 'Easy Run', 'skipped', 'vt1_or_easier'),
    S('r', '2026-09-23', 'run', 'Tempo Run', 'planned', 'near'),
  ];
  const p = placeLostDay({ lostDate: '2026-09-23', rows, daysOff: ['monday', 'tuesday', 'friday', 'saturday', 'sunday'], today: '2026-09-21' });
  assertEquals(where(p, 'r').to, '2026-09-24');
});

Deno.test('⛔ EVERY LOST DAY OF THE WEEK IS PLANNED TOGETHER: a session an earlier lost day took off can come back', () => {
  // Tue lost with no room anywhere: its easy ride comes off. Then Sat is lost: Sat's own session goes, and Tue's
  // ride is planned again with Sat's room — the whole pool, against the room left.
  const rows: MoveRow[] = [
    S('m1', '2026-09-21', 'run', 'Run A', 'planned', 'vt1_or_easier'), S('m2', '2026-09-21', 'ride', 'Ride A', 'planned', 'vt1_or_easier'),
    { ...S('t1', '2026-09-22', 'ride', 'Easy Ride', 'planned', 'vt1_or_easier'), duration: 60 },
    S('w1', '2026-09-23', 'run', 'Run B', 'planned', 'vt1_or_easier'), S('w2', '2026-09-23', 'ride', 'Ride B', 'planned', 'vt1_or_easier'),
    S('th1', '2026-09-24', 'run', 'Run C', 'planned', 'vt1_or_easier'), S('th2', '2026-09-24', 'ride', 'Ride C', 'planned', 'vt1_or_easier'),
    S('f1', '2026-09-25', 'run', 'Run D', 'planned', 'vt1_or_easier'), S('f2', '2026-09-25', 'ride', 'Ride D', 'planned', 'vt1_or_easier'),
    S('s1', '2026-09-26', 'run', 'Run E', 'planned', 'vt1_or_easier'), S('s2', '2026-09-26', 'ride', 'Ride E', 'planned', 'vt1_or_easier'),
  ];
  const tue = placeLostDay({ lostDate: '2026-09-22', rows, daysOff: ['sunday'], today: '2026-09-21' });
  assertEquals(where(tue, 't1').dropped, true);
  const afterTue = saved(rows, tue);
  const sat = placeLostDay({ lostDate: '2026-09-26', rows: afterTue, daysOff: ['sunday'], today: '2026-09-21' });
  // Nothing that was never on a lost day moved.
  assertEquals(sat.sessions.filter((x) => !x.lost_day && x.to !== x.from).map((x) => x.name), []);
  // Tue's ride is in the pool again (it was off, still off: every other day is full) — and Sat's two sessions too.
  assertEquals(sat.sessions.filter((x) => x.lost_day).map((x) => x.id).sort(), ['s1', 's2', 't1']);
});

Deno.test('⛔ PM EXPECTED WEEK, Tue then Wed lost: Fri Lower Push + warm-up + Long Sub-Threshold; Sat Hinge + long ride; Progressive Repeats off', () => {
  const afterTue = saved(WEEK, lose(WEEK, '2026-09-22'));
  const p = lose(afterTue, '2026-09-23');
  const on = (d: string) => p.sessions.filter((s) => s.to === d && !s.dropped).map((s) => s.id).sort();
  assertEquals(on('2026-09-25'), ['lpush', 'nt', 'plyo']);
  assertEquals(on('2026-09-26'), ['hinge', 'long']);
  assertEquals(p.sessions.filter((s) => s.dropped).map((s) => s.id), ['ana']);
});

Deno.test('p109 floor counts the kept week: with a speed session kept, a lost speed session ranks with the easy ones', () => {
  const rows: MoveRow[] = [
    S('kept', '2026-09-21', 'run', 'MLSS+', 'planned', 'above'), S('k2', '2026-09-21', 'ride', 'Ride A', 'planned', 'vt1_or_easier'),
    S('w1', '2026-09-23', 'run', 'Run B', 'planned', 'vt1_or_easier'), S('w2', '2026-09-23', 'ride', 'Ride B', 'planned', 'vt1_or_easier'),
    S('th1', '2026-09-24', 'run', 'Run C', 'planned', 'vt1_or_easier'), S('th2', '2026-09-24', 'ride', 'Ride C', 'planned', 'vt1_or_easier'),
    S('f1', '2026-09-25', 'run', 'Run D', 'planned', 'vt1_or_easier'), S('f2', '2026-09-25', 'ride', 'Ride D', 'planned', 'vt1_or_easier'),
    S('s1', '2026-09-26', 'run', 'Run E', 'planned', 'vt1_or_easier'),
    { ...S('sp', '2026-09-22', 'ride', 'Short Speed Ride', 'planned', 'above'), duration: 45 },
    { ...S('ez', '2026-09-22', 'ride', 'Long Easy Ride', 'planned', 'vt1_or_easier'), duration: 120 },
  ];
  const p = placeLostDay({ lostDate: '2026-09-22', rows, daysOff: ['sunday'], today: '2026-09-21' });
  // One room left (Saturday): the longer session takes it — the speed ride is an extra.
  assertEquals([where(p, 'ez').to, where(p, 'sp').dropped], ['2026-09-26', true]);
});

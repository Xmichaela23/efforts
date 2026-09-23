// ⛔ THE MOVE CHECK ON THE BOOK (2026-09-21) — one test per check, the approved words exactly, and the days that fit.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { checkMove, daysThatFit, type MoveRow } from './index.ts';

// Michael approved the words 2026-09-23 (Viada p108 / p145 rule 6: the lift first, 6-8 h before the next session).
const P108 = (day: string, word = 'run') => `Two sessions on ${day}. Lift first, ${word} 6 to 8 hours after.`;

// Week of Mon 2026-09-21 … Sun 2026-09-27. Hinge every Tuesday; other sessions as listed.
const hinge = (id: string, date: string, extra: Partial<MoveRow> = {}): MoveRow =>
  ({ id, date, type: 'strength', name: 'Lower body: Hinge', workout_status: 'planned', training_plan_id: 'p', ...extra });
const run = (id: string, date: string, extra: Partial<MoveRow> = {}): MoveRow =>
  ({ id, date, type: 'run', name: 'Easy Run', workout_status: 'planned', training_plan_id: 'p', ...extra });
const HINGE = hinge('h2', '2026-09-22');
const rows: MoveRow[] = [
  hinge('h1', '2026-09-15'), HINGE, hinge('h3', '2026-09-29'),
  { id: 'push', date: '2026-09-21', type: 'strength', name: 'Upper body: Push', workout_status: 'planned', training_plan_id: 'p' },
  run('r1', '2026-09-23'),
  { id: 'pull', date: '2026-09-24', type: 'strength', name: 'Upper body: Pull', workout_status: 'planned', training_plan_id: 'p' },
  { id: 'lpush', date: '2026-09-25', type: 'strength', name: 'Lower body: Push', workout_status: 'planned', training_plan_id: 'p' },
  { id: 'long', date: '2026-09-26', type: 'ride', name: 'Long Ride', workout_status: 'planned', training_plan_id: 'p' },
];

// ── 3. The day off: the only refusal ─────────────────────────────────────────────────────────────

Deno.test('⛔ DAY OFF: the only refusal, in the approved words, and nothing else is said', () => {
  const c = checkMove({ session: HINGE, toDate: '2026-09-27', rows, daysOff: ['sunday'] });
  assertEquals(c.refused, true);
  assertEquals(c.notes.map((n) => n.text), ['Sunday is a day off.']);
});

Deno.test('DAY OFF: a day that is not off is never refused, whatever is on it', () => {
  const c = checkMove({ session: HINGE, toDate: '2026-09-24', rows, daysOff: ['sunday'] });
  assertEquals(c.refused, false);
});

// ── 1. Two sessions a day (p108) ─────────────────────────────────────────────────────────────────

Deno.test('⛔ p108: a day that already holds a session earns the two-sessions note, in the approved words', () => {
  const c = checkMove({ session: HINGE, toDate: '2026-09-23', rows, daysOff: [] });
  assertEquals(c.notes.map((n) => [n.page, n.text]), [['p108', P108('Wednesday')]]);
});

Deno.test('p108: a skipped session on the day does not count, and neither does the moved session itself', () => {
  const withSkip = rows.map((r) => (r.id === 'r1' ? { ...r, workout_status: 'skipped' } : r));
  assertEquals(checkMove({ session: HINGE, toDate: '2026-09-23', rows: withSkip, daysOff: [] }).notes, []);
  assertEquals(checkMove({ session: HINGE, toDate: '2026-09-22', rows, daysOff: [] }).notes, []);
});

// ── 2. Lift gap over nine days (p80) ─────────────────────────────────────────────────────────────

Deno.test('⛔ p80: a lift moved so its gap passes nine days earns the note, in the approved words', () => {
  // Tue 09-22 → Fri 09-25: 10 days after the Hinge on 09-15. (Friday also holds a lift, so p108 speaks too.)
  const c = checkMove({ session: HINGE, toDate: '2026-09-25', rows, daysOff: [] });
  assertEquals(c.notes.find((n) => n.rule === 'lift_gap')?.text,
    'Hinge: 10 days until the next one. Consistent improvement needs one every 8 to 9 days.');
  assertEquals(c.notes.find((n) => n.rule === 'lift_gap')?.page, 'p80');
});

Deno.test('p80: nine days exactly says nothing; the gap is counted to the SAME lift only', () => {
  // Tue 09-22 → Thu 09-24: 9 days after 09-15, 5 before 09-29.
  const c = checkMove({ session: HINGE, toDate: '2026-09-24', rows: rows.filter((r) => r.id !== 'pull'), daysOff: [] });
  assertEquals(c.notes, []);
});

Deno.test('p80: moved earlier, the gap to the NEXT one is what passes nine', () => {
  // Tue 09-22 → Sat 09-19 of the week before: 10 days until 09-29.
  const c = checkMove({ session: HINGE, toDate: '2026-09-19', rows: rows.filter((r) => r.id !== 'h1'), daysOff: [] });
  assertEquals(c.notes.map((n) => n.text), ['Hinge: 10 days until the next one. Consistent improvement needs one every 8 to 9 days.']);
});

Deno.test('p80: a run is never given the lift note', () => {
  const r = run('rx', '2026-09-15');
  const c = checkMove({ session: r, toDate: '2026-09-27', rows: [r, run('ry', '2026-09-01')], daysOff: [] });
  assertEquals(c.notes, []);
});

// ── 4. Days that fit ─────────────────────────────────────────────────────────────────────────────

Deno.test('⛔ DAYS THAT FIT: not a day off, no third session, no lift gap past nine — the p108 note does not disqualify', () => {
  // Hinge dragged Tue → Wed; today is Monday 09-21. Mon (Push) and Thu (Pull) hold one session each: both fit, with
  // the p108 note. Fri and Sat would put the gap at 10 and 11 days (p80). Sunday is a day off.
  // Gap cost: Mon 6/8 → 6, Thu 9/5 → 6; the tie goes to the day nearer Tuesday.
  assertEquals(daysThatFit({ session: HINGE, fromDate: '2026-09-22', toDate: '2026-09-23', rows, daysOff: ['sunday'], today: '2026-09-21' }),
    ['2026-09-21', '2026-09-24']);
});

Deno.test('⛔ DAYS THAT FIT: a day already holding two sessions is not offered (OURS); a plyo warm-up does not count', () => {
  const r = run('rr', '2026-09-24');
  const two = [run('a', '2026-09-23'), { ...run('b', '2026-09-23'), type: 'ride' }];
  const warm = [run('c', '2026-09-25'), { id: 'pw', date: '2026-09-25', type: 'strength', name: 'Plyo warm-up', workout_status: 'planned', training_plan_id: 'p', tags: ['plyo'] } as MoveRow];
  const out = daysThatFit({ session: r, fromDate: '2026-09-24', toDate: '2026-09-27', rows: [r, ...two, ...warm], daysOff: [], today: '2026-09-21' });
  assertEquals(out.includes('2026-09-23'), false);
  assertEquals(out[0], '2026-09-25');
});

Deno.test('p108: a plyo warm-up is not a session and not a lift — a run beside a run + warm-up gets no note', () => {
  const r = run('rr', '2026-09-24');
  const day = [run('c', '2026-09-25'), { id: 'pw', date: '2026-09-25', type: 'strength', name: 'Plyo warm-up', workout_status: 'planned', training_plan_id: 'p', tags: ['plyo'] } as MoveRow];
  assertEquals(checkMove({ session: r, toDate: '2026-09-25', rows: [r, ...day], daysOff: [] }).notes, []);
});

Deno.test('⛔ DAYS THAT FIT, LIFTS: ordered by the gap closest to 3–4 days (p80)', () => {
  // A lighter week: only the Hinges around it. Push on Mon 09-21 is gone.
  const light = [hinge('h1', '2026-09-15'), HINGE, hinge('h3', '2026-09-29')];
  const out = daysThatFit({ session: HINGE, fromDate: '2026-09-22', toDate: '2026-09-27', rows: light, daysOff: [], today: '2026-09-21' });
  // Gaps before/after: Mon 6/8, Wed 8/6, Thu 9/5, Fri 10 — out (p80), Sat 11 — out. Off-ideal: Mon 2+4, Wed 4+2, Thu 5+1 → all 6;
  // ties go to the day nearest Tuesday, then the earlier: Mon, Wed, Thu.
  assertEquals(out, ['2026-09-21', '2026-09-23', '2026-09-24']);
});

Deno.test('DAYS THAT FIT, LIFTS: a day nearer 3–4 days beats a nearer day', () => {
  // Hinges 3 days apart would be ideal: neighbours Fri 09-18 and Tue 09-29.
  const light = [hinge('h1', '2026-09-18'), hinge('h2', '2026-09-24'), hinge('h3', '2026-09-29')];
  const s = light[1];
  const out = daysThatFit({ session: s, fromDate: '2026-09-24', toDate: '2026-09-27', rows: light, daysOff: [], today: '2026-09-21' });
  // Mon 3/8 → 0+4 = 4 · Tue 4/7 → 3 · Wed 5/6 → 1+2 = 3 · Fri 7/4 → 3 · Sat 8/3 → 4. Best: Tue, Wed, Fri (3 each, nearest Thu first: Wed, Fri, Tue).
  assertEquals(out, ['2026-09-23', '2026-09-25', '2026-09-22']);
});

Deno.test('⛔ DAYS THAT FIT, RUNS AND RIDES: nearest to the day it was on first (OURS), never past, at most three', () => {
  const r = run('rr', '2026-09-24');
  const out = daysThatFit({ session: r, fromDate: '2026-09-24', toDate: '2026-09-26', rows: [r], daysOff: ['monday'], today: '2026-09-22' });
  // Mon is a day off; Tue 09-22 is today (allowed); nearest to Thu: Wed, Fri, then Tue (2 days) before Sun (3).
  assertEquals(out, ['2026-09-23', '2026-09-25', '2026-09-22']);
});

Deno.test('DAYS THAT FIT: a day before today is never offered', () => {
  const r = run('rr', '2026-09-24');
  const out = daysThatFit({ session: r, fromDate: '2026-09-24', toDate: '2026-09-25', rows: [r], daysOff: [], today: '2026-09-24' });
  assertEquals(out.every((d) => d >= '2026-09-24'), true);
  assertEquals(out, ['2026-09-26', '2026-09-27']);
});

Deno.test('⛔ p108: a run moved onto a ride day gets no note, and that day still fits', () => {
  const r = run('rr', '2026-09-23');
  const ride: MoveRow = { id: 'rd', date: '2026-09-24', type: 'ride', name: 'Easy Ride', workout_status: 'planned', training_plan_id: 'p' };
  assertEquals(checkMove({ session: r, toDate: '2026-09-24', rows: [r, ride], daysOff: [] }).notes, []);
  // Tue and Thu are both one day from Wednesday; the tie goes to the earlier date. The ride day is offered.
  assertEquals(daysThatFit({ session: r, fromDate: '2026-09-23', toDate: '2026-09-26', rows: [r, ride], daysOff: [], today: '2026-09-21' }),
    ['2026-09-22', '2026-09-24', '2026-09-21']);
});

Deno.test('p108: a run moved onto a lifting day still gets the note', () => {
  const r = run('rr', '2026-09-23');
  assertEquals(checkMove({ session: r, toDate: '2026-09-22', rows: [r, HINGE], daysOff: [] }).notes.map((n) => n.text), [P108('Tuesday')]);
});

// ── 4. The builder's week rules, on the week the move makes (2026-09-22, one source of logic) ─────

// Michael's Run + Strength week as the builder now arranges it: Mon long run, Wed upper + hard run,
// Thu plyo + threshold, Fri heavy legs, Sat upper + easy run, Sun speed legs.
const WK: MoveRow[] = [
  { id: 'lsd', date: '2026-09-28', type: 'run', name: 'Long Run', tags: ['family:run_lsd', 'long_run'] },
  { id: 'meu', date: '2026-09-30', type: 'strength', name: 'ME: Upper', tags: [] },
  { id: 'mlss', date: '2026-09-30', type: 'run', name: 'Surge and Float', tags: ['family:run_mlss'] },
  { id: 'plyo', date: '2026-10-01', type: 'strength', name: 'Plyo warm-up', tags: ['plyo'] },
  { id: 'nt', date: '2026-10-01', type: 'run', name: '8 × 5 min Threshold', tags: ['family:run_near_threshold'] },
  { id: 'mel', date: '2026-10-02', type: 'strength', name: 'ME: Lower', tags: ['lower:me'] },
  { id: 'deu', date: '2026-10-03', type: 'strength', name: 'DE: Upper', tags: [] },
  { id: 'vt1', date: '2026-10-03', type: 'run', name: 'Easy Run', tags: ['family:run_vt1'] },
  { id: 'del', date: '2026-10-04', type: 'strength', name: 'DE: Lower', tags: ['lower:de'] },
].map((r) => ({ workout_status: 'planned', training_plan_id: 'p', ...r }));
const HEAVY_AFTER_HARD = 'Thursday: hard run and heavy legs. Lift first, run 6 to 8 hours after.';

Deno.test('⛔ WEEK RULE: heavy legs moved onto the hard run day earns the builder\'s own sentence', () => {
  const mel = WK.find((r) => r.id === 'mel')!;
  const c = checkMove({ session: mel, toDate: '2026-10-01', rows: WK, daysOff: [] });
  // ⛔ ONE LINE, NOT TWO: the same-day heavy-legs line states the order itself, so the two-sessions note is not doubled.
  assertEquals(c.notes.map((n) => n.text), [HEAVY_AFTER_HARD]);
});

Deno.test('WEEK RULE: a move that adds no clash says nothing new, and a clash the week already had is not the move\'s', () => {
  const vt1 = WK.find((r) => r.id === 'vt1')!;
  // ⛔ Tuesday was the week's only clear day, so the move earns the shared rest-day line (2026-09-23) and nothing else.
  assertEquals(checkMove({ session: vt1, toDate: '2026-09-29', rows: WK, daysOff: [] }).notes.map((n) => n.text), ['No day this week is clear.']);
  // The week already has heavy legs on the threshold day; moving the easy run adds nothing to it.
  const clashed = WK.map((r) => (r.id === 'mel' ? { ...r, date: '2026-10-01' } : r));
  assertEquals(checkMove({ session: vt1, toDate: '2026-09-29', rows: clashed, daysOff: [] }).notes, []);
});

Deno.test('WEEK RULE: "Days that fit" puts the days with no new clash first', () => {
  // Without the long run, Tuesday is clean and Thursday (the threshold day) is not; Tuesday leads.
  const wk = WK.filter((r) => r.id !== 'lsd');
  const mel = wk.find((r) => r.id === 'mel')!;
  const days = daysThatFit({ session: mel, fromDate: '2026-10-02', toDate: '2026-10-02', rows: wk, daysOff: [], today: '2026-09-28', max: 7 });
  const clashes = (d: string) => checkMove({ session: mel, toDate: d, rows: wk, daysOff: [] }).notes.filter((n) => n.rule === 'week_rule').length;
  assertEquals(clashes(days[0]), 0);
  assertEquals(clashes('2026-10-01'), 1);
  assertEquals(days.indexOf('2026-10-01') > days.indexOf(days[0]), true);
});

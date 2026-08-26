// Michael's law, one test per clause. Run:
//   ~/.deno/bin/deno test --allow-all --no-check supabase/functions/_shared/week-model/model.test.ts
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { type Session, buildUnits, emitsFor } from './model.ts';
import { resolve, unmetNeeds } from './resolve.ts';

const S = (id: string, label: string, load: Session['load'], sport?: Session['sport']): Session =>
  ({ id, label, load, minutes: 60, sport });

const SQ = S('sq', 'Back Squat', 'heavy_lower');
const DL = S('dl', 'Deadlift', 'heavy_lower');
const BENCH = S('bench', 'Bench Press', 'upper');
const HARD_RUN = S('hr', 'Hard Run', 'hard_cardio', 'run');
const HARD_RIDE = S('hb', 'Hard Ride', 'hard_cardio', 'bike');
const LONG_RUN = S('lr', 'Long Run', 'long_run', 'run');
const LONG_RIDE = S('lb', 'Long Ride', 'long_ride', 'bike');

const place = (sessions: Session[], pins: Record<string, number>) =>
  buildUnits(sessions, pins).map((u) => ({ unit: u, day: u.pinnedDay! }));

// ── 1. COUPLING ──────────────────────────────────────────────────────────────
Deno.test('the squat and the hard RUN become one unit; the deadlift takes the RIDE', () => {
  const units = buildUnits([SQ, DL, HARD_RUN, HARD_RIDE], {});
  const sq = units.find((u) => u.label.includes('Squat'))!;
  const dl = units.find((u) => u.label.includes('Deadlift'))!;
  assert(sq.label.includes('Hard Run'), `squat paired with: ${sq.label}`);
  assert(dl.label.includes('Hard Ride'), `deadlift paired with: ${dl.label}`);
  assertEquals(sq.internalGapHours, 6, 'barbell AM, intervals PM');
});

Deno.test('⛔ A COUPLED UNIT CANNOT BE SPLIT — there is no placement that separates them', () => {
  const r = resolve(buildUnits([SQ, HARD_RUN, LONG_RUN], { lr: 6 }));
  assert(r.ok);
  const days = r.placements.flatMap((p) => p.unit.sessions.map((s) => ({ s: s.label, d: p.day })));
  const sq = days.find((x) => x.s === 'Back Squat')!;
  const hr = days.find((x) => x.s === 'Hard Run')!;
  assertEquals(sq.d, hr.d, 'the squat and the hard run landed on different days');
});

Deno.test('a hard day with no matching lift is left alone, not forced onto the wrong one', () => {
  const units = buildUnits([SQ, HARD_RIDE], {});
  assertEquals(units.length, 2, 'the hard ride was pushed onto the squat day');
});

// ── 2. DEBT ──────────────────────────────────────────────────────────────────
Deno.test('⛔ NO HEAVY LOWER ON A LONG DAY', () => {
  const unmet = unmetNeeds(place([SQ, LONG_RUN], { sq: 6, lr: 6 }));
  assert(unmet.some((u) => u.system === 'long_effort'), 'a squat shared the long run day');
});

Deno.test('⛔ 48 HOURS AFTER A LONG EFFORT BEFORE HEAVY LEGS — 24h is refused, 48h passes', () => {
  assert(unmetNeeds(place([SQ, LONG_RUN], { sq: 0, lr: 6 })).length > 0, 'Monday squat after a Sunday long run');
  assertEquals(unmetNeeds(place([SQ, LONG_RUN], { sq: 1, lr: 6 })).length, 0, 'Tuesday squat is exactly 48h');
});

Deno.test('⛔ THE DAY AFTER THE WEEKEND IS BENCH OR REST — and bench is genuinely free', () => {
  assertEquals(unmetNeeds(place([BENCH, LONG_RIDE, LONG_RUN], { bench: 0, lb: 5, lr: 6 })).length, 0);
});

Deno.test('48 hours between the two heavy lower days', () => {
  assert(unmetNeeds(place([SQ, DL], { sq: 0, dl: 1 })).length > 0, 'Mon/Tue is 24h');
  assertEquals(unmetNeeds(place([SQ, DL], { sq: 0, dl: 2 })).length, 0, 'Mon/Wed is 48h');
});

Deno.test('⛔ THE DEBT CLOCK IS THE EMITTING SESSION\'S, NOT ITS UNIT\'S', () => {
  // The deadlift emits when the DEADLIFT ends, not 6h later when the hard ride does.
  // Clocking it to the unit turned a legal Tue→Thu into a 42h breach.
  const units = buildUnits([DL, HARD_RIDE, SQ, HARD_RUN], { dl: 1, sq: 3 });
  assertEquals(unmetNeeds(units.map((u) => ({ unit: u, day: u.pinnedDay! }))).length, 0);
});

Deno.test('⛔ THE WEEK REPEATS — Sunday does not block the Monday before it', () => {
  // Straight-line arithmetic read a Sunday long run as blocking Monday's squat in the
  // SAME week. It blocks the FOLLOWING Monday, which is a different (and real) fact.
  const unmet = unmetNeeds(place([SQ, LONG_RUN], { sq: 0, lr: 6 }));
  assert(unmet.every((u) => u.shortBy <= 48), `nonsense shortfall: ${JSON.stringify(unmet)}`);
});

// ── 3. THE WEEK THE LAW PRODUCES ─────────────────────────────────────────────
Deno.test('⛔ MICHAEL\'S OWN WEEK IS LEGAL', () => {
  const r = resolve(buildUnits(
    [BENCH, DL, HARD_RIDE, SQ, HARD_RUN, LONG_RIDE, LONG_RUN],
    { bench: 0, dl: 1, hb: 1, sq: 3, hr: 3, lb: 5, lr: 6 },
  ));
  assert(r.ok, `rejected: ${JSON.stringify((r as { unmet: unknown }).unmet)}`);
});

Deno.test('⛔ GIVEN ONLY THE WEEKEND, THE LAW BUILDS THE WEEK ITSELF — both pairs intact', () => {
  const r = resolve(buildUnits(
    [BENCH, DL, HARD_RIDE, SQ, HARD_RUN, LONG_RIDE, LONG_RUN],
    { lb: 5, lr: 6 },
  ));
  assert(r.ok, 'no legal week from the weekend alone');
  for (const p of r.placements) {
    if (p.unit.sessions.length < 2) continue;
    assertEquals(p.unit.sessions.length, 2, 'a unit carried more than its pair');
  }
  assert(r.restDays.length >= 1, 'no rest day');
});

Deno.test('a rest day survives', () => {
  const r = resolve(buildUnits([BENCH, DL, HARD_RIDE, SQ, HARD_RUN, LONG_RIDE, LONG_RUN], { lb: 5, lr: 6 }));
  assert(r.ok && r.restDays.length >= 1);
});

// ── 4. FAILURE IS AN ANSWER, NOT A DEAD END ──────────────────────────────────
Deno.test('⛔ AN IMPOSSIBLE PIN NAMES THE DEBT, WHO OWES IT, AND WHEN IT CLEARS', () => {
  const r = resolve(buildUnits([SQ, HARD_RUN, LONG_RUN, LONG_RIDE], { sq: 0, lr: 6, lb: 5 }));
  assert(!r.ok);
  const u = r.unmet[0];
  assertEquals(u.system, 'long_effort');
  assert(u.blockedBy.length > 0, 'nothing named as the blocker');
  assert(u.shortBy > 0 && u.clearsAtDay >= 0, 'no actionable number');
});

// ── 5. THE TWO SILENCES, CLOSED 2026-08-17 ───────────────────────────────────
Deno.test('⛔ THE BACKWARD 48h IS THE RUN\'S ONLY — the ride carries no leg clearance', () => {
  /**
   * ⚠️ THIS ASSERTION FLIPPED FOR THE RIDE ON 2026-08-18 AND THE HISTORY IS THE POINT.
   *   • It ran FORWARD ONLY at first, because the spoken law said "after" — a Friday squat before a
   *     Saturday long ride came out legal, and that was a hole.
   *   • It was made SYMMETRIC the same day: "squatting heavy the day before a three-hour ride is
   *     biological suicide — you start with zero glycogen."
   *   • It is now asymmetric BY DISCIPLINE. Michael: *"the backward shadow — squat fatigue blocking
   *     the ride — makes for a miserable ride, but it doesn't cause structural failure."* A rider
   *     turns the pedals on tired legs and pays inside the session; a RUNNER puts damaged, depleted
   *     legs into an impact session, which is a different kind of bill.
   *
   * ⛔ THE FORWARD DIRECTION IS UNTOUCHED FOR BOTH — see the test below. That is the injury guard: a
   * long ride is the most glycogen-expensive session in the block and squatting on empty quads is a
   * tendon problem. Do not read this relaxation as the ride becoming free.
   */
  assertEquals(unmetNeeds(place([SQ, LONG_RIDE], { sq: 4, lb: 5 })).length, 0,
    'a Friday squat before a Saturday long ride should now be legal');
  assert(unmetNeeds(place([DL, LONG_RUN], { dl: 5, lr: 6 })).length > 0,
    'the RUN still needs its legs clear — a Saturday deadlift before a Sunday long run');
});

Deno.test('⛔ AND THE FORWARD 48h STILL HOLDS FOR BOTH — the injury guard is untouched', () => {
  // Heavy legs after a long effort, either discipline. This is the half that is non-negotiable.
  assert(unmetNeeds(place([LONG_RIDE, SQ], { lb: 5, sq: 6 })).length > 0, 'squat the day after a long ride');
  assert(unmetNeeds(place([LONG_RUN, SQ], { lr: 6, sq: 0 })).length > 0, 'squat the day after a long run');
  assertEquals(unmetNeeds(place([LONG_RIDE, SQ], { lb: 5, sq: 0 })).length, 0, 'Monday is exactly 48h');
});

Deno.test('⛔ AND THE STANDARD MULTISPORT WEEKEND IS WHAT THE SPLIT BUYS', () => {
  // Sat ride / Sun run / Mon bench / Tue squat — the layout the symmetric row made unreachable once
  // three lifts and two hard days were also in the week.
  assertEquals(
    unmetNeeds(place([LONG_RIDE, LONG_RUN, BENCH, SQ], { lb: 5, lr: 6, bench: 0, sq: 1 })).length, 0);
});

Deno.test('⛔ AN UNCOUPLED HARD DAY LEAVES 24h ON THE LEGS — the day after CLEARS, the same day does not', () => {
  /**
   * ⛔⛔ THIS TEST ASSERTED THE OPPOSITE UNTIL 2026-08-26 (D-453), and its own comment named the
   * assertion that would have to move: *"the day after is the whole rule, and it is the assertion
   * that breaks if the debt is set back to Michael's literal 24h."* It has been set back, and this
   * is the break, taken deliberately.
   *
   * ⛔ THE AUDIT IS WHAT FORCED IT. p246's printed week puts a hard session on day 1 and ME Lower on
   * day 2; at 36h that adjacency was 12 hours short, so the law called the source's own week
   * illegal. p247 does not forbid it — it PRICES it: *"a 3 to 4 percent reduction in working 1RM
   * should be assumed here."* The compensation is the haircut.
   *
   * ⚠️ THE DEBT IS STILL REAL AND STILL BITES, one day closer in. A standalone hard session and a
   * heavy lower lift on ONE day is short by the full 24h, which is what the two assertions below
   * hold apart. A rule that cost nothing would be the silence this row exists to end.
   */
  const at = (us: ReturnType<typeof buildUnits>) =>
    unmetNeeds(us.map((u) => ({ unit: u, day: u.pinnedDay! })));

  // SAME DAY, UNCOUPLED — the hard ride pairs with a DEADLIFT, never a squat, so nothing here
  // couples and both sessions sit at the same hour. Short by the whole debt.
  assert(at(buildUnits([HARD_RIDE, SQ], { hb: 0, sq: 0 })).length > 0,
    'a squat shared a day with a standalone hard ride and nothing was reported');

  // THE DAY AFTER — p246's own layout. 24h clears exactly, and an exact clearance PASSES.
  assertEquals(at(buildUnits([HARD_RIDE, SQ], { hb: 0, sq: 1 })).length, 0,
    'the book\'s own day-1-hard, day-2-ME-Lower week is being called illegal');

  // AND FURTHER OUT STAYS CLEAR.
  assertEquals(at(buildUnits([HARD_RIDE, SQ], { hb: 0, sq: 2 })).length, 0, 'two days later is clear');
});

Deno.test('⛔ THE HARD RIDE COSTS THE LEGS LESS THAN THE HARD RUN — 12h, and it is OURS (D-453)', () => {
  /**
   * ⛔ THE SOURCE STATES NO FIGURE. p275 states the CRITERION — the cycling work may be done on any
   * power-metered modality that is "relatively non-impact", while the running work still "recommends
   * impact with the ground on at least one day" — and p247's lower-body reduction names a RUN as its
   * cause. Impact is the axis. The precedent is this table's own long-effort split.
   *
   * ⚠️ 12 AND 24 ARE THE SAME ANSWER AT DAY GRANULARITY, so the assertions below cannot tell them
   * apart and must not pretend to. What they hold is the SHAPE: same day short, next day clear, for
   * both sports — and that the ride's cell is a real, lower, readable number rather than zero.
   */
  const at = (us: ReturnType<typeof buildUnits>) =>
    unmetNeeds(us.map((u) => ({ unit: u, day: u.pinnedDay! })));

  // ⛔ THE NUMBERS ARE IN THE TABLE, AND THE RIDE'S IS LOWER AND NOT ZERO.
  assertEquals(emitsFor({ id: 'x', label: 'Hard Run', load: 'hard_cardio', sport: 'run', minutes: 45 }),
    { heavy_legs: 24 });
  assertEquals(emitsFor({ id: 'x', label: 'Hard Ride', load: 'hard_cardio', sport: 'bike', minutes: 45 }),
    { heavy_legs: 12 });
  // ⚠️ NO SPORT FALLS BACK TO THE ROW, the conservative arm — never to zero.
  assertEquals(emitsFor({ id: 'x', label: 'Hard', load: 'hard_cardio', minutes: 45 }), { heavy_legs: 24 });

  // ⛔ SAME DAY REPORTS, BOTH SPORTS. Michael: "we will not stop them but they should know the cost."
  //    ⚠️ The squat pairs with a hard RUN and the deadlift with a hard RIDE, so each pairing is
  //    broken deliberately here — a coupled unit is safe by arithmetic and would prove nothing.
  assert(at(buildUnits([HARD_RIDE, SQ], { hb: 3, sq: 3 })).length > 0,
    'a squat shared a day with a hard ride and nothing was reported');
  assert(at(buildUnits([HARD_RUN, DL], { hr: 3, dl: 3 })).length > 0,
    'a deadlift shared a day with a hard run and nothing was reported');

  // ⛔ AND THE DAY AFTER IS CLEAR FOR BOTH — p246's own layout.
  assertEquals(at(buildUnits([HARD_RIDE, SQ], { hb: 3, sq: 4 })).length, 0, 'the day after a hard ride is short');
  assertEquals(at(buildUnits([HARD_RUN, DL], { hr: 3, dl: 4 })).length, 0, 'the day after a hard run is short');
});

Deno.test('⛔ AND THE COUPLED PAIR SURVIVES IT BY ARITHMETIC, NOT BY EXEMPTION', () => {
  // The barbell runs first; the hard session's debt lands entirely after the lift it
  // shares a day with. If a carve-out is ever added for coupling, this test still passes
  // and the one above stops meaning anything — so read them together.
  const units = buildUnits([SQ, HARD_RUN], { sq: 2 });
  assertEquals(unmetNeeds(units.map((u) => ({ unit: u, day: u.pinnedDay! }))).length, 0);
});

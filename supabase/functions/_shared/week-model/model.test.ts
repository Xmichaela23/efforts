// Michael's law, one test per clause. Run:
//   ~/.deno/bin/deno test --allow-all --no-check supabase/functions/_shared/week-model/model.test.ts
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { type Session, buildUnits } from './model.ts';
import { resolve, unmetNeeds } from './resolve.ts';

const S = (id: string, label: string, load: Session['load'], sport?: Session['sport']): Session =>
  ({ id, label, load, minutes: 60, sport });

const SQ = S('sq', 'Back Squat', 'heavy_lower');
const DL = S('dl', 'Deadlift', 'heavy_lower');
const BENCH = S('bench', 'Bench Press', 'upper');
const HARD_RUN = S('hr', 'Hard Run', 'hard_cardio', 'run');
const HARD_RIDE = S('hb', 'Hard Ride', 'hard_cardio', 'bike');
const LONG_RUN = S('lr', 'Long Run', 'long_cardio', 'run');
const LONG_RIDE = S('lb', 'Long Ride', 'long_cardio', 'bike');

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
Deno.test('⛔ NO HEAVY LEGS IN THE 48h BEFORE A LONG EFFORT — the Friday squat', () => {
  // Squatting heavy the day before three hours on the bike starts the ride with empty
  // legs. The law as spoken only said "after"; the first draft therefore allowed this.
  assert(unmetNeeds(place([SQ, LONG_RIDE], { sq: 4, lb: 5 })).length > 0, 'Friday squat, Saturday long ride');
  assert(unmetNeeds(place([DL, LONG_RUN], { dl: 5, lr: 6 })).length > 0, 'Saturday deadlift, Sunday long run');
  assertEquals(unmetNeeds(place([SQ, LONG_RIDE], { sq: 3, lb: 5 })).length, 0, 'Thursday squat is exactly 48h');
});

Deno.test('⛔ AN UNCOUPLED HARD DAY LEAVES 24h ON THE LEGS', () => {
  // A standalone threshold run is systemic fatigue; it cannot cost nothing.
  const units = buildUnits([HARD_RIDE, SQ], { hb: 0, sq: 1 });
  assert(unmetNeeds(units.map((u) => ({ unit: u, day: u.pinnedDay! }))).length > 0,
    'a squat landed the day after a standalone hard ride');
  const ok = buildUnits([HARD_RIDE, SQ], { hb: 0, sq: 2 });
  assertEquals(unmetNeeds(ok.map((u) => ({ unit: u, day: u.pinnedDay! }))).length, 0, 'two days later is clear');
  // ⚠️ THE DAY AFTER IS THE WHOLE RULE, and it is the assertion that breaks if the debt
  // is set back to Michael's literal 24h. See the note in COST.
});

Deno.test('⛔ AND THE COUPLED PAIR SURVIVES IT BY ARITHMETIC, NOT BY EXEMPTION', () => {
  // The barbell runs first; the hard session's 24h debt lands entirely after the lift it
  // shares a day with. If a carve-out is ever added for coupling, this test still passes
  // and the one above stops meaning anything — so read them together.
  const units = buildUnits([SQ, HARD_RUN], { sq: 2 });
  assertEquals(unmetNeeds(units.map((u) => ({ unit: u, day: u.pinnedDay! }))).length, 0);
});

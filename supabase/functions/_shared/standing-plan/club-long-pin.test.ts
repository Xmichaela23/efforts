// ============================================================================
// CLUB = PINNED ANCHOR — slice 2b, Michael's ruling 2026-08-25.
//
// ⛔ THE RULING. *"A club session's day is fixed by the world, not preference — the club meets when
// it meets."* So ticking club does not merely change who writes the session; it makes that day a
// PIN, and the week is built around it exactly like a tapped one. The engine never moves it.
//
// ⛔ AND A CLUB LONG RIDE DOES NOT CONSUME A HARD SLOT. This is the claim most likely to rot: the
// long slot's ownership travels on its own key precisely so `hard_days.length` — which the composer
// and the endurance tier both read as "how many hard sessions" — cannot be inflated by it.
//
// ⚠️ THE SHORTFALL NOTE IS NOT TESTED HERE. It is composed on the client from the built week's own
// long-session duration (`NonRaceBuilder` `weekNotes` → `club_long_short`), so it has no server
// surface to assert against. Its inputs are asserted below instead: that a club long ride is still
// a long session in the week, with a duration to compare against.
//
// Run: ~/.deno/bin/deno test --allow-all --no-check \
//        supabase/functions/_shared/standing-plan/club-long-pin.test.ts
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  composeWeek,
  defaultCompetitionLifts,
  workingNumberFromTest,
  type ComposeArgs,
  type Weekday,
} from './index.ts';

const BASE: Omit<ComposeArgs, 'week' | 'column'> = {
  frame: 'strength_5k',
  competitionLifts: defaultCompetitionLifts(),
  workingNumbers: {
    bench: workingNumberFromTest('bench', { weight: 185, reps: 5 })!,
    squat: workingNumberFromTest('squat', { weight: 245, reps: 5 })!,
    deadlift: workingNumberFromTest('deadlift', { weight: 315, reps: 4 })!,
  },
  seed1RMs: { bench: 200, squat: 265, deadlift: 340, overheadPress: 125 },
  baselines: {
    learned_fitness: {
      run_threshold_pace_sec_per_km: { value: 261, confidence: 'high', sample_count: 10 },
      run_easy_pace_sec_per_km: { value: 340, confidence: 'high', sample_count: 20 },
    },
    performance_numbers: { ftp: 250 },
  },
  equipment: ['Commercial gym'],
  roundTo: 5,
};

const week = (extra: Partial<ComposeArgs> = {}) =>
  composeWeek({ ...BASE, week: 2, column: 'standard', ...extra });

const LONG = /Long/i;
const longSessions = (w: ReturnType<typeof composeWeek>) =>
  w.sessions.filter((s) => s.type != null && s.type !== 'strength' && LONG.test(s.name));

Deno.test('⛔ A CLUB LONG RIDE IS A PIN — its day holds under every rotation', () => {
  // ⚠️ THE CLUB DAY REACHES THE COMPOSER AS AN ORDINARY LONG PIN, and that is the design: ownership
  // decides who WRITES the session, the pin decides WHERE it goes. Two mechanisms for "this day is
  // fixed" would be two answers to one question.
  for (let offset = 0; offset < 7; offset++) {
    const w = week({ dayOffset: offset, endurancePins: { long: 'Saturday' as Weekday } });
    const on = longSessions(w);
    assert(on.length > 0, 'the week produced no long session');
    for (const s of on) {
      assertEquals(s.day, 'Saturday', `offset ${offset} moved the club long ride off its day`);
    }
  }
});

Deno.test('⛔ A CLUB LONG RIDE IS STILL A LONG SESSION, with a duration to compare against', () => {
  // ⚠️ THE SHORTFALL NOTE DEPENDS ON THIS. It reads the built week's long-session duration as the
  // plan's target; a long slot that came back with no duration would make the note silent forever,
  // which is the failure mode that looks like "the feature does nothing".
  const w = week({ dayOffset: 0, endurancePins: { long: 'Sunday' as Weekday } });
  const on = longSessions(w);
  assertEquals(on.length, 1, 'the frame no longer carries exactly one long session');
  assert(Number(on[0].duration) > 0, 'the long session has no duration for the target to be read from');
});

Deno.test('⛔⛔ A CLUB LONG RIDE DOES NOT CONSUME A HARD SLOT — the hard sessions are untouched', () => {
  // ⛔ THE HANDOFF IS EXPLICIT and this is the assertion that keeps it true. The long slot's club
  // marking travels on `long_session`, never inside `hard_days`, so the number of hard sessions in
  // the built week cannot move when the long slot is marked.
  const plain = week({ dayOffset: 0 });
  const clubLong = week({ dayOffset: 0, endurancePins: { long: 'Saturday' as Weekday } });
  const hardCount = (w: ReturnType<typeof composeWeek>) =>
    w.sessions.filter((s) => s.type != null && s.type !== 'strength' && /Hard/i.test(s.name)).length;
  assertEquals(
    hardCount(clubLong),
    hardCount(plain),
    'marking the long slot changed how many hard sessions the week carries',
  );
});

Deno.test('⛔ AND THE LIFTS DO NOT MOVE FOR IT — a club long ride is still endurance-only', () => {
  const plain = week({ dayOffset: 3 });
  const clubLong = week({ dayOffset: 3, endurancePins: { long: 'Monday' as Weekday } });
  const lifts = (w: ReturnType<typeof composeWeek>) =>
    w.sessions.filter((s) => s.type === 'strength').map((s) => `${s.name}@${s.day}`).sort().join(' | ');
  assertEquals(lifts(clubLong), lifts(plain), 'pinning the long ride moved the lifting');
});

Deno.test('⛔ A CLUB HARD SESSION IS A PIN TOO — both anchors hold at once', () => {
  const w = week({
    dayOffset: 0,
    endurancePins: { long: 'Sunday' as Weekday, hard: ['Tuesday' as Weekday, 'Thursday' as Weekday] },
  });
  for (const s of longSessions(w)) assertEquals(s.day, 'Sunday');
  const hard = w.sessions
    .filter((s) => s.type != null && s.type !== 'strength' && /Hard/i.test(s.name))
    .map((s) => s.day);
  for (const d of hard) {
    assert(
      d === 'Tuesday' || d === 'Thursday',
      `a pinned hard session landed on ${d}, which is neither day the athlete gave`,
    );
  }
});

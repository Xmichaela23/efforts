// ============================================================================
// PINS WIN, INFORMED — the ruling, as executable assertions.
//
// ⛔ WHAT THIS FILE IS FOR. Michael, 2026-08-25: *"user choice always wins, it's just informed."*
// Three claims have to hold together, and each one is cheap to break by accident:
//
//   1. A pinned day is ABSOLUTE. Not preferred, not usually honoured — the placed week puts the
//      session on the day the athlete tapped, in every case, including the ones the law hates.
//   2. The violation is NAMED, at the right tier, with the right sessions in it. A breach that
//      reports as a trade-off is the screen telling an athlete a 48h clearance is a matter of taste.
//   3. The NO-PINS DEFAULT DOES NOT MOVE. This is the regression that would be invisible: the
//      pinned path is new, the default path is what every existing block was built with.
//
// ⚠️ CLAIM 3 IS ASSERTED AGAINST `resolve` ITSELF, not against a recorded snapshot of days. A
// hardcoded expected week would need updating every time a score weight is tuned, and would then be
// updated to whatever the code now does — which tests nothing. Comparing the two entry points keeps
// the claim true under any future tuning: `resolveAroundPins` must never be a second placer.
//
// Run: ~/.deno/bin/deno test --allow-all --no-check supabase/functions/_shared/week-model/pins-win.test.ts
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { type Session, buildUnits } from './model.ts';
import { resolve, resolveAroundPins, structuralConflicts, violationsOf } from './resolve.ts';

const S = (
  id: string,
  label: string,
  load: Session['load'],
  minutes: number,
  sport?: Session['sport'],
): Session => ({ id, label, load, minutes, sport });

/** The Strong Focus shape: three lifting days, two hard days, a long day, easy volume. */
const SESSIONS: Session[] = [
  S('bench', 'Bench Press', 'upper', 60),
  S('dl', 'Deadlift + Overhead Press', 'heavy_lower', 60),
  S('sq', 'Back Squat', 'heavy_lower', 60),
  S('hardrun', 'Hard Run', 'hard_cardio', 40, 'run'),
  S('hardride', 'Hard Ride', 'hard_cardio', 45, 'bike'),
  S('longride', 'Long Ride', 'long_ride', 135, 'bike'),
  S('easyrun', 'Easy Run', 'easy', 45, 'run'),
];

const MON = 0, TUE = 1, WED = 2, THU = 3, FRI = 4, SAT = 5, SUN = 6;

/** Where a named session actually landed in a placed week. */
const dayOf = (w: ReturnType<typeof resolveAroundPins>, label: string): number | null => {
  for (const p of w.placements) for (const s of p.unit.sessions) if (s.label === label) return p.day;
  return null;
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 1. THE PIN IS ABSOLUTE
// ─────────────────────────────────────────────────────────────────────────────────────────────

Deno.test('⛔ a pinned day is honoured EXACTLY — including the day the engine would never choose', () => {
  // ⚠️ THE CASE THAT MATTERS IS THE UGLY ONE. Pinning the long ride Saturday and the hard run
  // Monday is the shape round 2 photographed: the frame wanted Monday for something else and the
  // screen said "picked Fri, placed Mon". Under this ruling the athlete's Friday IS Friday.
  const units = buildUnits(SESSIONS, { longride: SAT, hardrun: FRI, hardride: TUE });
  const w = resolveAroundPins(units, { minRestDays: 1 });
  assertEquals(dayOf(w, 'Long Ride'), SAT, 'the pinned long ride moved');
  assertEquals(dayOf(w, 'Hard Run'), FRI, 'the pinned hard run moved — pins are not preferences');
  assertEquals(dayOf(w, 'Hard Ride'), TUE, 'the pinned hard ride moved');
});

Deno.test('⛔ a pin the law hates is STILL honoured, and the breach is reported rather than avoided', () => {
  // A heavy squat pinned the day before a long run is the backward clearance in `COST`:
  // `long_run` needs `heavy_legs` clear. The old engine would place the squat elsewhere.
  const sessions: Session[] = [
    S('sq', 'Back Squat', 'heavy_lower', 60),
    S('longrun', 'Long Run', 'long_run', 90, 'run'),
  ];
  const units = buildUnits(sessions, { sq: SAT, longrun: SUN });
  const w = resolveAroundPins(units, { minRestDays: 1 });
  assertEquals(dayOf(w, 'Back Squat'), SAT, 'the squat was moved off the day the athlete pinned');
  assertEquals(dayOf(w, 'Long Run'), SUN, 'the long run was moved');
  const breach = w.violations.find((v) => v.rule === 'long_run_needs_legs');
  assert(breach, `the long-run clearance breach was not reported: ${JSON.stringify(w.violations)}`);
  assertEquals(breach!.tier, 'breach', 'an unmet COST clearance must be a breach, never a trade-off');
  assertEquals(breach!.subject, 'Long Run');
  assertEquals(breach!.against, 'Back Squat');
  assert((breach!.shortBy ?? 0) > 0, 'a breach with no outstanding hours is not a breach');
});

Deno.test('⛔ the week is ALWAYS returned — there is no refusal arm left on this path', () => {
  // Every session pinned onto one day: maximally illegal, and still a week.
  const units = buildUnits(SESSIONS, {
    bench: MON, dl: MON, sq: MON, hardrun: MON, hardride: MON, longride: MON, easyrun: MON,
  });
  const w = resolveAroundPins(units, { minRestDays: 1 });
  assert(w.placements.length > 0, 'a fully-pinned illegal week returned no placements');
  for (const p of w.placements) assertEquals(p.day, MON, 'a pin was overruled on the worst-case week');
  assert(w.violations.length > 0, 'seven sessions on one day reported nothing');
  assert(
    w.violations.some((v) => v.tier === 'breach'),
    'stacking every session on one day did not report a single breach',
  );
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 2. THE VIOLATION IS NAMED, AT THE RIGHT TIER
// ─────────────────────────────────────────────────────────────────────────────────────────────

Deno.test('⛔ TIER IS READ OFF THE LAYER — Layer 1 breaches, Layer 2 trade-offs, never mixed', () => {
  const units = buildUnits(SESSIONS, {
    bench: MON, dl: MON, sq: MON, hardrun: MON, hardride: MON, longride: MON, easyrun: MON,
  });
  const vs = resolveAroundPins(units, { minRestDays: 1 }).violations;
  const CLEARANCES = new Set(['heavy_legs_clearance', 'long_effort_clearance', 'long_run_needs_legs']);
  for (const v of vs) {
    assertEquals(
      v.tier,
      CLEARANCES.has(v.rule) ? 'breach' : 'tradeoff',
      `${v.rule} came back as ${v.tier} — the tier must follow the layer the rule lives in`,
    );
  }
});

Deno.test('⛔ a legal-but-thin week reports TRADE-OFFS and no breach', () => {
  // ⚠️ EASY SESSIONS ONLY. They emit nothing and need nothing, so Layer 1 cannot fire — whatever
  // comes back is Layer 2 by construction, which is exactly the distinction under test.
  const sessions: Session[] = [0, 1, 2, 3, 4, 5, 6].map((i) =>
    S(`e${i}`, `Easy Run ${i}`, 'easy', 40, 'run'));
  const units = buildUnits(sessions, Object.fromEntries(sessions.map((s, i) => [s.id, i])));
  const w = resolveAroundPins(units, { minRestDays: 1 });
  assertEquals(w.violations.filter((v) => v.tier === 'breach').length, 0, 'easy sessions cannot breach');
  assert(
    w.violations.some((v) => v.rule === 'no_rest_day'),
    'a week with a session on all seven days did not report the missing day off',
  );
});

Deno.test('⛔ a clean week is SILENT — no violation invented to have something to say', () => {
  // The default solve on a shape the engine can lay out cleanly.
  const sessions: Session[] = [
    S('sq', 'Back Squat', 'heavy_lower', 60),
    S('bench', 'Bench Press', 'upper', 60),
    S('easyrun', 'Easy Run', 'easy', 40, 'run'),
  ];
  const w = resolveAroundPins(buildUnits(sessions, {}), { minRestDays: 1 });
  assertEquals(w.violations, [], `a clean week reported: ${JSON.stringify(w.violations)}`);
  assertEquals(w.structural, [], 'a clean week reported a structural conflict');
});

Deno.test('⛔ a rule fires ONCE per pair, not once per debt row', () => {
  // `unmetNeeds` emits a row per (session, system, debt). Two long days blocking one squat is two
  // rows and would read as two separate problems on the screen.
  const sessions: Session[] = [
    S('sq', 'Back Squat', 'heavy_lower', 60),
    S('longrun', 'Long Run', 'long_run', 90, 'run'),
    S('longride', 'Long Ride', 'long_ride', 135, 'bike'),
  ];
  const units = buildUnits(sessions, { longrun: SAT, longride: SUN, sq: MON });
  const vs = violationsOf(resolveAroundPins(units, { minRestDays: 1 }).placements);
  const keys = vs.map((v) => `${v.rule}|${v.subject}|${v.against ?? ''}`);
  assertEquals(keys.length, new Set(keys).size, `duplicate violation rows: ${keys.join(', ')}`);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 3. REST-DAY PINS AND STRUCTURAL CONTRADICTIONS
// ─────────────────────────────────────────────────────────────────────────────────────────────

Deno.test('⛔ a day marked "cannot train" stays EMPTY — the remainder arranges around it', () => {
  const units = buildUnits(SESSIONS, { longride: SAT });
  const w = resolveAroundPins(units, { minRestDays: 1, unavailableDays: [WED, SUN] });
  for (const p of w.placements) {
    assert(p.day !== WED && p.day !== SUN, `a session landed on a day the athlete cannot train: day ${p.day}`);
  }
  assertEquals(dayOf(w, 'Long Ride'), SAT, 'the pin moved when rest days were added');
});

Deno.test('⛔⛔ A BLOCKED DAY BEATS A PIN — the tapped session is re-solved off it, and reported', () => {
  /**
   * ⛔ MICHAEL, 2026-08-25 (afternoon), SUPERSEDING THE MORNING RULING THIS TEST USED TO ASSERT:
   * *"A blocked day always wins. If a day is both tapped for a session and marked can't-train, the
   * session is rescheduled off it — the engine re-solves that session as unpinned, and the note says
   * what moved and why."*
   *
   * The old assertion was the opposite — the session STAYED and the contradiction was reported as
   * structural. It is not structural: the engine can resolve it, so it does.
   */
  const units = buildUnits(SESSIONS, { hardrun: THU });
  assertEquals(
    structuralConflicts(units, { unavailableDays: [THU] }).length,
    0,
    'a pin on a blocked day is resolvable, so it is no longer a structural conflict',
  );

  const w = resolveAroundPins(units, { minRestDays: 1, unavailableDays: [THU] });
  assert(dayOf(w, 'Hard Run') !== THU, 'the tapped session stayed on the day the athlete blocked');
  assertEquals(w.structural.length, 0);

  // ⛔ AND THE MOVE IS NAMED AT BOTH ENDS — the note needs "from Thu" and "to X", not just "it moved".
  assertEquals(w.relocations.length, 1, 'the move was made silently');
  // ⚠️ THE UNIT IS THE PAIR AND THE SESSION IS WHAT THEY TAPPED — the sentence uses the second.
  assertEquals(w.relocations[0].unit, 'Back Squat + Hard Run');
  assertEquals(w.relocations[0].session, 'Hard Run');
  assertEquals(w.relocations[0].sessionId, 'hardrun');
  assertEquals(w.relocations[0].from, THU);
  assertEquals(w.relocations[0].to, dayOf(w, 'Hard Run'));
});

Deno.test('⛔ a pin the athlete can still have is untouched, and reports no move', () => {
  // ⚠️ THE REGRESSION GUARD FOR THE RULING ABOVE. Releasing a pin is keyed on the BLOCKED DAY and
  // nothing else; a pin on any other day is as absolute as it ever was.
  const units = buildUnits(SESSIONS, { hardrun: THU });
  const w = resolveAroundPins(units, { minRestDays: 1, unavailableDays: [WED] });
  assertEquals(dayOf(w, 'Hard Run'), THU, 'an unblocked pin moved');
  assertEquals(w.relocations.length, 0, 'a week where nothing moved reported a move');
});

Deno.test('⛔ the week the re-solve produces still builds even when it breaks a rule', () => {
  /**
   * ⛔ PART 2 OF THE RULING: *"If the arrangement that results isn't sound training, it still builds
   * — the existing tiered notes carry the warning."* So the relocation is never gated on the week
   * that comes out of it, and the cost arrives through `violations`, never as a refusal.
   */
  const units = buildUnits(SESSIONS, { hardrun: THU, longride: SAT });
  const w = resolveAroundPins(units, {
    minRestDays: 1,
    // ⚠️ FIVE DAYS OFF — the re-solve has two days for the whole week and cannot help but crowd it.
    unavailableDays: [THU, 0, 1, 2, 4],
  });
  assert(w.placements.length > 0, 'a hard week returned no week at all');
  assert(dayOf(w, 'Hard Run') !== THU, 'the tapped session survived on a blocked day');
  assert(w.violations.length > 0, 'a crowded week reported no cost — the warning half is missing');
});

Deno.test('⛔ every day unavailable still returns a week — nothing is silently deleted', () => {
  /**
   * ⚠️ THE ONE CASE RELEASING A PIN CANNOT FIX: there is nowhere to move to. Releasing it would have
   * left the search with no candidate day at all and returned an EMPTY week — sessions deleted in
   * silence, which is the outcome this whole path forbids.
   */
  const units = buildUnits(SESSIONS, { hardrun: THU });
  const w = resolveAroundPins(units, { minRestDays: 1, unavailableDays: [0, 1, 2, 3, 4, 5, 6] });
  assertEquals(w.placements.length, units.length, 'sessions vanished when every day was blocked');
  assert(w.structural.some((c) => c.kind === 'no_day_left'), 'the impossible week was not named');
});

Deno.test('⛔ every day unavailable is STRUCTURAL — a week with nowhere to put anything', () => {
  const units = buildUnits(SESSIONS, {});
  const conflicts = structuralConflicts(units, { unavailableDays: [0, 1, 2, 3, 4, 5, 6] });
  assert(conflicts.some((c) => c.kind === 'no_day_left'), 'seven blocked days reported no conflict');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 4. THE NO-PINS DEFAULT DOES NOT MOVE
// ─────────────────────────────────────────────────────────────────────────────────────────────

Deno.test('⛔⛔ WITH NO PINS, `resolveAroundPins` IS `resolve` — same week, not a second placer', () => {
  // ⚠️ THE CLAIM IS EQUIVALENCE, NOT A RECORDED WEEK. A snapshot of weekdays would be rewritten to
  // match the code the first time a score weight moves, and would then assert nothing at all.
  const units = buildUnits(SESSIONS, {});
  const legacy = resolve(units, { minRestDays: 1 });
  const legacyPlacements = legacy.ok ? legacy.placements : legacy.best;
  const pinned = resolveAroundPins(units, { minRestDays: 1 });
  const shape = (ps: typeof legacyPlacements) =>
    ps.map((p) => `${p.unit.label}@${p.day}`).sort().join(' | ');
  assertEquals(shape(pinned.placements), shape(legacyPlacements), 'the pinned entry point drifted from the default');
});

Deno.test('⛔ AND `unavailableDays` ABSENT IS TODAY\'S BEHAVIOUR — the new field is inert by default', () => {
  const units = buildUnits(SESSIONS, { longride: SAT });
  const shape = (ps: Array<{ unit: { label: string }; day: number }>) =>
    ps.map((p) => `${p.unit.label}@${p.day}`).sort().join(' | ');
  const withoutField = resolve(units, { minRestDays: 1 });
  const withEmpty = resolve(units, { minRestDays: 1, unavailableDays: [] });
  assertEquals(
    shape(withEmpty.ok ? withEmpty.placements : withEmpty.best),
    shape(withoutField.ok ? withoutField.placements : withoutField.best),
    'passing an empty unavailableDays changed the week',
  );
});

/**
 * ═══ STAGE 0 — GOLDEN FIXTURES. The contract the consolidation must not break. ═══════════════
 *
 * See D-403 (`docs/DECISIONS-LOG-2.md`). A planned session is represented several ways and
 * they drift; stages 1–4 collapse them onto one read-model. This file pins what every reader returns
 * TODAY, for the row shapes the app actually produces, so a migration that changes an answer says so
 * out loud instead of shipping quietly.
 *
 * ⛔ THE POINT IS THE DISAGREEMENTS, NOT THE AGREEMENTS. Several rows below are asserted to produce
 * DIFFERENT answers from different readers. Those are the bugs the consolidation exists to fix — they
 * are pinned so the fix is visible as a deliberate change to this file, not so they are preserved.
 * Each is marked ⚠️ DRIFT with what it should become.
 *
 * ⛔ SCOPE, STATED HONESTLY. These pin the READERS, not the rendered DOM. This repo has no DOM test
 * infrastructure — `deno test` only, no vitest/jest/testing-library/jsdom — and `CLAUDE.md` forbids
 * speculative npm deps, so adding one is its own decision, not something to slip inside a migration.
 * That boundary is acceptable because the readers ARE the drift surface: every bug this work came
 * from was one reader disagreeing with another over the same row. It does NOT cover layout,
 * positioning or "does the glyph appear" — those stay a device check.
 *
 * ⚠️ WHY NOT ASSERT PER SURFACE. Each surface is a thin caller of these readers (traced 2026-08-09:
 * calendar → `resolveMovingSeconds` + the swap gate; Today's card → both plus title/intensity;
 * workout view → the swap gate; the two summaries → `resolvePlannedDurationMinutes`). Pinning the
 * readers pins every surface, and pinning them per surface would just be the same values four times.
 * The mapping is recorded in `SURFACE_READERS` below so the coverage claim is checkable.
 *
 * Run:
 *   ~/.deno/bin/deno test --no-check --allow-read src/lib/planned-session-golden.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { deriveWorkoutTitle } from './derive-workout-title.ts';
import {
  availableDisciplines,
  disciplineOf,
  getDisciplineSwaps,
  intensityOf,
  resolveMinutes,
} from '../../supabase/functions/_shared/session-swap/swap.ts';
import { normalizeSport, rankAssociateCandidates } from './associate-candidates.ts';
import {
  disciplineFromPostureKey,
  normalizeDiscipline,
  normalizeSessionType,
  postureKey,
} from './discipline.ts';
/**
 * Which server field each surface prints, and which readers it still calls — the coverage claim,
 * checkable rather than asserted in prose. ⛔ No surface resolves a length (2026-09-10, audit H-T01).
 */
export const SURFACE_READERS = {
  'calendar chip': ['planned_duration_seconds', 'moving_seconds', 'swap-session sport_swap'],
  "today's card": ['planned_duration_label', 'moving_seconds', 'deriveWorkoutTitle', 'swap-session sport_swap'],
  "today's drawer": ['planned_duration_label', 'swap-session sheet'],
  'workout view': ['planned_duration_seconds', 'swap-session sheet'],
  'planned summary': ['planned_duration_seconds', 'deriveWorkoutTitle'],
} as const;

// ── The row shapes the app actually produces ─────────────────────────────────────────────────
//
// Shapes are as `get-week:1489 toPlannedWorkout` emits them: `computed` is `{ steps, total }` or
// null, `duration` is ABSENT (neither mapper carries it today — SPEC §3).

type Row = Record<string, unknown>;

const ROWS: Array<{ label: string; row: Row }> = [
  {
    label: 'A · steps-only (no stored total) — the shape that hid the swap glyph',
    row: {
      id: 'a', type: 'run', name: 'Easy Run', workout_status: 'planned', date: '2026-08-18',
      total_duration_seconds: null, tags: ['easy_run'],
      computed: { steps: [{ seconds: 1890 }, { seconds: 1890 }], total_duration_seconds: null },
    },
  },
  {
    label: 'B · stored root total',
    row: {
      id: 'b', type: 'run', name: 'Easy Run', workout_status: 'planned', date: '2026-08-18',
      total_duration_seconds: 3000, tags: ['easy_run'], computed: null,
    },
  },
  {
    label: 'C · computed.total only (root null)',
    row: {
      id: 'c', type: 'ride', name: 'Easy Ride', workout_status: 'planned', date: '2026-08-17',
      total_duration_seconds: null, tags: ['easy'],
      computed: { steps: [], total_duration_seconds: 4320 },
    },
  },
  {
    label: 'D · intervals-only (no computed, no total)',
    row: {
      id: 'd', type: 'run', name: 'Intervals', workout_status: 'planned', date: '2026-08-20',
      total_duration_seconds: null, tags: ['intervals'], computed: null,
      intervals: [{ duration: 600 }, { duration: 1200 }],
    },
  },
  {
    label: 'E · long run',
    row: {
      id: 'e', type: 'run', name: 'Long Run', workout_status: 'planned', date: '2026-08-23',
      total_duration_seconds: 4560, tags: ['long_run'], computed: null,
    },
  },
  {
    label: 'F · long ride',
    row: {
      id: 'f', type: 'ride', name: 'Long Ride', workout_status: 'planned', date: '2026-08-22',
      total_duration_seconds: 6480, tags: ['long_ride'], computed: null,
    },
  },
  {
    label: 'G · swim',
    row: {
      id: 'g', type: 'swim', name: 'Easy Swim', workout_status: 'planned', date: '2026-08-19',
      total_duration_seconds: 3600, tags: [], computed: null,
    },
  },
  {
    label: 'H · strength',
    row: {
      id: 'h', type: 'strength', name: 'Strength — Deadlift', workout_status: 'planned', date: '2026-08-18',
      total_duration_seconds: 3600, tags: [], computed: null,
      strength_exercises: [{ name: 'Deadlift' }],
    },
  },
  {
    label: 'I · swapped run → ride (carries the origin tag)',
    row: {
      id: 'i', type: 'ride', name: 'Easy Ride', workout_status: 'planned', date: '2026-08-18',
      total_duration_seconds: 3780, tags: ['easy', 'discipline_swapped', 'swapped_from:run'],
      computed: null, steps_preset: null,
    },
  },
  {
    label: 'J · completed — carries moving_time, not a planned total',
    row: {
      id: 'j', type: 'run', name: 'Easy Run', workout_status: 'completed', date: '2026-08-17',
      moving_time: 50, total_duration_seconds: 3000, tags: ['easy_run'], computed: null,
    },
  },
  {
    label: 'K · no duration anywhere — the honest zero',
    row: {
      id: 'k', type: 'run', name: 'Easy Run', workout_status: 'planned', date: '2026-08-18',
      total_duration_seconds: null, tags: ['easy_run'], computed: null,
    },
  },
  {
    label: 'L · provider-ish type spelling (`bike`, not `ride`)',
    row: {
      id: 'l', type: 'bike', name: 'Easy Ride', workout_status: 'planned', date: '2026-08-17',
      total_duration_seconds: 4320, tags: ['easy'], computed: null,
    },
  },
];

const byLabel = (prefix: string): Row => ROWS.find((r) => r.label.startsWith(prefix))!.row;

// ── DURATION ─────────────────────────────────────────────────────────────────────────────────
//
// ⛔ DELETED 2026-09-10 (audit H-T01 / H-D10), with the phone readers they pinned:
//   · 'GOLDEN · duration — every reader, every shape' pinned `resolveMovingSeconds`,
//     `resolvePlannedDurationMinutes` and the swap gate's minutes over rows A–L.
//   · '⚠️ DRIFT · the two duration readers disagree on 3 of 12 shapes' pinned the gap between the
//     stored-total-only badge and the full ladder (rows A, C, D).
// Both readers are gone. The phone prints the server's `planned_duration_seconds` and
// `moving_seconds`; the order is settled once in `supabase/functions/_shared/planned-duration.ts`
// (stored total first — its own tests pin every rung), and `enforcement.test.ts` keeps the phone
// from growing a reader again.

// ── DISCIPLINE ───────────────────────────────────────────────────────────────────────────────

Deno.test('GOLDEN · discipline — every normalizer, every shape', () => {
  const golden: Record<string, { swap: string | null; associate: string }> = {
    'A': { swap: 'run', associate: 'run' },
    'C': { swap: 'ride', associate: 'ride' },
    'G': { swap: 'swim', associate: 'swim' },
    'H': { swap: null, associate: 'strength' },   // the swap has no strength discipline, by design
    'I': { swap: 'ride', associate: 'ride' },
    'L': { swap: 'ride', associate: 'ride' },     // `bike` spelling normalises to `ride` on both
  };
  for (const [key, want] of Object.entries(golden)) {
    const row = byLabel(`${key} ·`);
    assertEquals(disciplineOf(row.type as string), want.swap, `${key}: swap disciplineOf`);
    assertEquals(normalizeSport(row.type as string), want.associate, `${key}: associate normalizeSport`);
  }
});

Deno.test('✅ RESOLVED (stage 1) · unknown types are null on every CLIENT normalizer', () => {
  /**
   * ⛔ THIS ASSERTION CHANGED IN STAGE 1, DELIBERATELY. Pinned before:
   *
   *     disciplineOf('kayak')    → null
   *     normalizeSport('kayak')  → 'kayak'     (passthrough)
   *     …and two others returned 'run'         (the mis-attach)
   *
   * `AssociatePlannedDialog:23 normalizeSportType` ended `return t || 'run'` — an unrecognised
   * activity became a RUN in the dialog that decides which planned session a completed activity links
   * to. Every client normalizer now delegates to `normalizeDiscipline`, which returns null.
   *
   * ⚠️ `normalizeSport` returns `''` rather than null: its callers rank and label rows instead of
   * gating on them, and an empty string keeps comparisons total without naming a sport. It is an
   * adapter over the same single answer, not a second opinion.
   *
   * ⛔ THE SERVER SIDE STILL RETURNS 'run' — `auto-attach-planned:16 sportSubtype`. Out of scope for
   * stage 1 (server-touching, needs a deploy) and NOT covered by these client fixtures. Continuity is
   * not total; see the SPEC's scope note.
   */
  assertEquals(disciplineOf('kayak'), null);
  assertEquals(normalizeSport('kayak'), '');
  assertEquals(disciplineOf(''), null);
  assertEquals(normalizeSport(''), '');
  // And the canonical normalizer itself, which all three now share.
  assertEquals(normalizeDiscipline('kayak'), null);
  assertEquals(normalizeDiscipline('rowing'), null);
  assertEquals(normalizeDiscipline('walk'), null, 'walk is a real activity, just not in this vocabulary');
});

Deno.test('✅ RESOLVED (stage 1) · one vocabulary — `bike` and `ride` are the same sport', () => {
  // The split that offered a DEVELOP bike a swap. Both spellings now land on `ride`, and the ONE
  // named boundary translates back for the posture map's `bike` key.
  assertEquals(normalizeDiscipline('bike'), 'ride');
  assertEquals(normalizeDiscipline('Cycling'), 'ride');
  assertEquals(normalizeDiscipline('ride'), 'ride');
  assertEquals(postureKey('ride'), 'bike');
  assertEquals(postureKey('run'), 'run');
  assertEquals(disciplineFromPostureKey('bike'), 'ride');
});

Deno.test('GOLDEN (stage 1) · the NON-DISCIPLINE planned types survive the migration', () => {
  /**
   * ⛔ THIS TEST EXISTS BECAUSE THE STAGE-0 FIXTURES MISSED A REGRESSION. The 12 pinned shapes are
   * all run/ride/swim/strength, so nothing covered `walk`, `mobility` or `pilates_yoga` — and the
   * first cut of stage 1 pointed `normalizeSport` at `normalizeDiscipline`, which knows only the four
   * disciplines. Every walk collapsed to `''`, which made a completed walk rank as CROSS-SPORT
   * against a planned walk and print *"Planned session — you did a session"*. Green the whole time.
   *
   * ⚠️ TWO QUESTIONS, TWO ANSWERS, BOTH PINNED HERE. `normalizeDiscipline` answers "is this one of the
   * four trainable disciplines" — a walk is NOT, and null is correct. `normalizeSessionType` answers
   * "which `planned_workouts.type` row is this" — a walk IS one. Anything that GATES asks the first;
   * anything that RANKS or LABELS asks the second.
   */
  for (const walkish of ['walk', 'Walking', 'hike']) {
    assertEquals(normalizeDiscipline(walkish), null, `${walkish}: not a discipline`);
    assertEquals(normalizeSessionType(walkish), 'walk', `${walkish}: is a planned row type`);
    assertEquals(normalizeSport(walkish), 'walk', `${walkish}: ranks as itself`);
  }
  assertEquals(normalizeSessionType('mobility'), 'mobility');
  assertEquals(normalizeSessionType('pilates_yoga'), 'pilates_yoga');
  assertEquals(normalizeDiscipline('mobility'), null);

  // ⛔ AND THE FIX SURVIVES: unknown is still null on BOTH. `walk` came back; `kayak` did not.
  assertEquals(normalizeSessionType('kayak'), null);
  assertEquals(normalizeSport('kayak'), '');

  // The behaviour that actually broke: same-type walks are ONE list, not two.
  const ranked = rankAssociateCandidates('walk', '2026-08-09', [
    { id: 'p1', type: 'walk', date: '2026-08-09' },
  ]);
  assertEquals(ranked.sameSport.length, 1, 'a planned walk is the same sport as a walk');
  assertEquals(ranked.otherSport.length, 0);
  assertEquals(ranked.sameSport[0].crossSportNote, null, 'and carries no cross-sport warning');
});

// ── STAGE 2 / STAGE 3 DURATION FIXTURES — DELETED 2026-09-10 (audit H-T01) ───────────────────────
//
// ⛔ WHAT EACH DELETED TEST PINNED, so the removal is legible:
//   · 'GOLDEN (stage 2) · plannedDurationSeconds — the one ladder, every rung' — the phone ladder's
//     rungs: distance steps priced at a pace target (M), a JSON-string `computed` (N), minutes read
//     out of the step tokens (O), and a stored total beating a step sum that disagrees (P).
//   · 'GOLDEN (stage 2) · the badge reader gained NO fallbacks' — `resolvePlannedDurationMinutes`
//     answered from the stored total only.
//   · '⚠️ CHANGED (stage 2) · the summary now prefers the stored total over the steps-sum' — row P.
//   · 'GOLDEN (stage 2) · resolveMovingSeconds still answers stage 0 exactly' — its planned branch
//     delegated to the ladder and its completed branch read `moving_time`.
//   · 'GOLDEN (stage 3) · the server contract feeds the one duration reader' and
//     '⛔ (stage 3) · the two capabilities stage 2 rescued survive the SERVER shape' — the phone ladder
//     over get-week's row shape (Q, R, S).
// The server owns those rules now — the stored total first, distance priced at pace, a JSON-string
// `computed` read, and NO prose minutes (`_shared/planned-duration.ts`, dropped deliberately there).

Deno.test('GOLDEN · availableDisciplines over a real week', () => {
  // The Strong Focus week from the device screenshots: run + ride + strength on the calendar.
  assertEquals(availableDisciplines(ROWS.map((r) => r.row) as never), ['run', 'ride', 'swim']);
  // A single day cannot name the athlete's sports — the bug that hid the control everywhere.
  assertEquals(availableDisciplines([byLabel('A ·')] as never), ['run']);
});

// ── INTENSITY BAND ───────────────────────────────────────────────────────────────────────────

Deno.test('GOLDEN · intensity band', () => {
  const golden: Record<string, string> = {
    'A': 'easy', 'B': 'easy', 'C': 'easy', 'D': 'hard', 'E': 'long',
    'F': 'long', 'G': 'easy', 'H': 'easy', 'I': 'easy', 'J': 'easy', 'K': 'easy', 'L': 'easy',
  };
  for (const [key, want] of Object.entries(golden)) {
    assertEquals(intensityOf(byLabel(`${key} ·`) as never), want, `${key}: intensityOf`);
  }
});

// ── TITLE ────────────────────────────────────────────────────────────────────────────────────

Deno.test('GOLDEN · title (already consolidated — pinned so stage 4 cannot regress it)', () => {
  const golden: Record<string, string> = {
    'A': 'Easy Run', 'C': 'Easy Ride', 'D': 'Intervals', 'E': 'Long Run',
    'G': 'Easy Swim', 'H': 'Strength — Deadlift', 'I': 'Easy Ride',
  };
  for (const [key, want] of Object.entries(golden)) {
    assertEquals(deriveWorkoutTitle(byLabel(`${key} ·`) as never), want, `${key}: deriveWorkoutTitle`);
  }
});

// ── THE SWAP GATE (the composite reader — duration × discipline × band × status) ──────────────

Deno.test('GOLDEN · swap options, no posture declared', () => {
  /**
   * ⚠️ ⛔ ROW D CHANGED (2026-08-09), DELIBERATELY — it is the only value this stage moved.
   *
   *     before — 'D': ['ride']     (a hard session always offered the bike)
   *     after  — 'D': []           (…only when the athlete has a usable FTP)
   *
   * A hard ride is no longer a relabelled run: the patch writes real 4×4 tokens and
   * `materialize-plan` prices them at `1.1–1.2 × FTP`. With no FTP those steps carry no targets at
   * all, so the control is not offered. This call passes no FTP, hence the empty list; the
   * with-FTP case is pinned directly below.
   */
  const available = ['run', 'ride', 'swim'] as const;
  const golden: Record<string, string[]> = {
    'A': ['ride', 'swim'],   // easy run — unaffected, easy swaps never consult FTP
    'B': ['ride', 'swim'],
    'C': ['run', 'swim'],    // easy ride
    'D': [],                 // hard, and no FTP passed → the bike cannot be written
    /**
     * ⛔⛔ ROWS E AND F CHANGED (2026-09-09, WORKORDER-endurance-swaps §4). The long day used to
     * offer nothing — *"it is what the block is built around"* — and p275 blesses the substitution
     * anyway: *"a hike, a long ride, a team sport day, or whatever else is of interest."*
     * ⚠️ NO SWIM ON EITHER: the app does not coach swims, so a "long swim" is a booking. The hike is
     * not here because it is not a discipline swap — see `sessionSwapExtras`.
     */
    'E': ['ride'],           // long run
    'F': ['run'],            // long ride
    'G': ['run', 'ride'],    // easy swim
    'H': [],                 // strength — a different swap exists for those
    'I': ['run', 'swim'],    // already swapped, still swappable onward
    'J': [],                 // completed
    'K': [],                 // no duration → cannot size the swap
    'L': ['run', 'swim'],
  };
  for (const [key, want] of Object.entries(golden)) {
    const got = getDisciplineSwaps(byLabel(`${key} ·`) as never, available).map((o) => o.to);
    assertEquals(got, want, `${key}: getDisciplineSwaps`);
  }
});

Deno.test('GOLDEN · swap options under posture (swap what is held, not what is trained)', () => {
  const available = ['run', 'ride', 'swim'] as const;
  const runFocus = { run: 'develop' as const, bike: 'maintain' as const, swim: 'maintain' as const };
  const strengthFocus = { strength: 'develop' as const, run: 'maintain' as const, bike: 'maintain' as const };

  // Run-focus: the run is being trained, the ride is held.
  assertEquals(getDisciplineSwaps(byLabel('A ·') as never, available, [], runFocus), []);
  assertEquals(
    getDisciplineSwaps(byLabel('C ·') as never, available, [], runFocus).map((o) => o.to),
    ['run', 'swim'],
  );
  // Strength-focus: both endurance sports are held, both swappable.
  assertEquals(getDisciplineSwaps(byLabel('A ·') as never, available, [], strengthFocus).length, 2);
  assertEquals(getDisciplineSwaps(byLabel('C ·') as never, available, [], strengthFocus).length, 2);
  // Undeclared posture is not a verdict — behaves exactly as with no posture at all.
  assertEquals(getDisciplineSwaps(byLabel('A ·') as never, available, [], null).length, 2);
});

Deno.test('GOLDEN · the swap patch (what a swapped row becomes)', () => {
  const [toRide] = getDisciplineSwaps(byLabel('A ·') as never, ['run', 'ride']);
  assertEquals(toRide.patch.type, 'ride');
  assertEquals(toRide.patch.steps_preset, null, 'the source discipline token must not travel');
  assertEquals(toRide.patch.rendered_description, null, 'the stale rendered copy must not travel');
  assertEquals((toRide.patch.tags as string[]).includes('swapped_from:run'), true);
  assertEquals('duration' in toRide.patch, false, 'the patch must never rewrite the duration');
});

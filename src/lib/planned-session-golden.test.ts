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
import { resolveMovingSeconds } from '../utils/resolveMovingSeconds.ts';
import { resolvePlannedDurationMinutes } from '../utils/resolvePlannedDuration.ts';
import { deriveWorkoutTitle } from './derive-workout-title.ts';
import {
  availableDisciplines,
  disciplineOf,
  getDisciplineSwaps,
  intensityOf,
  resolveMinutes,
} from './session-discipline-swap.ts';
import { normalizeSport, rankAssociateCandidates } from './associate-candidates.ts';
import {
  disciplineFromPostureKey,
  normalizeDiscipline,
  normalizeSessionType,
  postureKey,
} from './discipline.ts';
import {
  plannedDurationMinutes,
  plannedDurationSeconds,
  storedPlannedTotalSeconds,
} from './planned-session/duration.ts';

/** Which readers each surface calls — the coverage claim, checkable rather than asserted in prose. */
export const SURFACE_READERS = {
  'calendar chip': ['resolveMovingSeconds', 'getDisciplineSwaps', 'availableDisciplines'],
  "today's card": ['resolveMovingSeconds', 'deriveWorkoutTitle', 'getDisciplineSwaps', 'disciplineOf', 'intensityOf'],
  "today's drawer": ['getDisciplineSwaps', 'disciplineOf', 'intensityOf'],
  'workout view': ['getDisciplineSwaps', 'disciplineOf', 'intensityOf'],
  'planned summary': ['resolvePlannedDurationMinutes', 'deriveWorkoutTitle'],
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

Deno.test('GOLDEN · duration — every reader, every shape', () => {
  const golden: Record<string, { moving: number | null; plannedMin: number | null; swapMin: number }> = {
    // moving = resolveMovingSeconds (authoritative, 4 priorities)
    // plannedMin = resolvePlannedDurationMinutes (root total ONLY, null otherwise — deliberate)
    // swapMin = resolveMinutes (the swap gate; delegates to moving)
    'A': { moving: 3780, plannedMin: null, swapMin: 63 },
    'B': { moving: 3000, plannedMin: 50, swapMin: 50 },
    'C': { moving: 4320, plannedMin: null, swapMin: 72 },
    'D': { moving: 1800, plannedMin: null, swapMin: 30 },
    'E': { moving: 4560, plannedMin: 76, swapMin: 76 },
    'F': { moving: 6480, plannedMin: 108, swapMin: 108 },
    'G': { moving: 3600, plannedMin: 60, swapMin: 60 },
    'H': { moving: 3600, plannedMin: 60, swapMin: 60 },
    'I': { moving: 3780, plannedMin: 63, swapMin: 63 },
    'J': { moving: 3000, plannedMin: 50, swapMin: 50 },
    'K': { moving: null, plannedMin: null, swapMin: 0 },
    'L': { moving: 4320, plannedMin: 72, swapMin: 72 },
  };
  for (const [key, want] of Object.entries(golden)) {
    const row = byLabel(`${key} ·`);
    assertEquals(resolveMovingSeconds(row), want.moving, `${key}: resolveMovingSeconds`);
    assertEquals(resolvePlannedDurationMinutes(row), want.plannedMin, `${key}: resolvePlannedDurationMinutes`);
    assertEquals(resolveMinutes(row as never), want.swapMin, `${key}: resolveMinutes`);
  }
});

Deno.test('⚠️ DRIFT · the two duration readers disagree on 3 of 12 shapes', () => {
  /**
   * `resolvePlannedDurationMinutes` returns null wherever the total is not stored at the root, while
   * `resolveMovingSeconds` finds the time in steps or intervals. Rows A, C, D, K are the gap — and A
   * is the exact shape that made the swap glyph vanish from Today's card while the row printed 63:00.
   *
   * ⛔ STAGE 2 MUST NOT "FIX" THIS BY ADDING FALLBACKS to the badge reader. Its null is deliberate: a
   * wrong duration on a displayed badge is a lie. The fix is that everything ELSE stops using it as a
   * general duration source. This assertion should still hold after stage 2.
   */
  const disagree = ROWS.filter(({ row }) => {
    const moving = resolveMovingSeconds(row);
    const badge = resolvePlannedDurationMinutes(row);
    const movingMin = moving == null ? null : Math.round(moving / 60);
    return movingMin !== badge;
  }).map(({ label }) => label.slice(0, 1));
  assertEquals(disagree, ['A', 'C', 'D']);
});

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

// ── STAGE 2 — the shapes stage 0 never covered ───────────────────────────────────────────────
//
// ⛔ A SEPARATE BLOCK, ON PURPOSE. These are NOT appended to `ROWS`: the ⚠️ DRIFT assertion above
// pins the disagreement set as exactly `['A','C','D']`, and rows M–P are more of that same family,
// so folding them in would move a stage-0 pinned value for no reason other than bookkeeping. Stage
// 0's twelve stay exactly as stage 0 left them; new coverage lands beside them.
//
// ⚠️ STAGE 1'S LESSON, APPLIED. The walk regression survived because the fixtures pinned only the
// shapes the readers already agreed on. Every rung stage 2 MOVED gets a row here, including the two
// it moved from a reader that was about to be deleted.

const STAGE2_ROWS: Array<{ label: string; row: Row }> = [
  {
    label: 'M · distance-only steps priced from a pace target — computeMinutes\' one real capability',
    row: {
      id: 'm', type: 'run', name: 'Intervals', workout_status: 'planned', date: '2026-08-21',
      total_duration_seconds: null, tags: ['intervals'],
      // 6 × 800m at 7:30/mi → 800 × (450 / 1609.34) ≈ 223.7s each ≈ 1342s total.
      computed: {
        total_duration_seconds: null,
        steps: Array.from({ length: 6 }, () => ({ distanceMeters: 800, paceTarget: '7:30/mi' })),
      },
    },
  },
  {
    label: 'N · `computed` arrives as a JSON STRING (direct table reads do this)',
    row: {
      id: 'n', type: 'ride', name: 'Easy Ride', workout_status: 'planned', date: '2026-08-21',
      total_duration_seconds: null, tags: ['easy'],
      computed: JSON.stringify({ total_duration_seconds: 2700, steps: [] }),
    },
  },
  {
    label: 'O · prose only — the duration exists nowhere but the token text',
    row: {
      id: 'o', type: 'run', name: 'Easy Run', workout_status: 'planned', date: '2026-08-21',
      total_duration_seconds: null, tags: ['easy_run'], computed: null,
      steps_preset: ['warmup_run_quality_12min', 'easy_run_40min'],
    },
  },
  {
    label: 'P · root total AND a steps-sum that DISAGREES — the summary\'s old outlier',
    row: {
      id: 'p', type: 'run', name: 'Easy Run', workout_status: 'planned', date: '2026-08-21',
      total_duration_seconds: 3600, tags: ['easy_run'],
      computed: { total_duration_seconds: null, steps: [{ seconds: 1200 }, { seconds: 1200 }] },
    },
  },
];

Deno.test('GOLDEN (stage 2) · plannedDurationSeconds — the one ladder, every rung', () => {
  /**
   * ⛔ EVERY RUNG STAGE 2 MOVED, PINNED. Two of them existed in only ONE reader before this stage and
   * would have been silently lost by a naive collapse:
   *
   *   M — distance-based steps priced from pace. Lived ONLY in `computeMinutes`. Without it a
   *       session authored as "6 × 800m @ 5k pace" reads as having no duration at all.
   *   N — `computed` as a JSON string. `computeMinutes` parsed it; `resolveMovingSeconds` did not and
   *       returned null. The transport's shape is no longer a source of disagreement.
   *
   * ⚠️ M IS AN ESTIMATE AND IS ALLOWED TO BE. 800m at 7:30/mi is ~223.7s; six of them ~1342s. It is
   * pinned exactly so a change to the pace maths shows up here rather than on a device.
   */
  const golden: Record<string, number | null> = {
    'M': 1342,   // 6 × 800m @ 7:30/mi, priced from the pace target
    'N': 2700,   // parsed out of the JSON string
    'O': 720,    // FIRST token wins: warmup 12min, not the 40min that follows
    'P': 3600,   // the stored root total, NOT the 2400s the steps sum to
  };
  for (const [key, want] of Object.entries(golden)) {
    const row = STAGE2_ROWS.find((r) => r.label.startsWith(`${key} ·`))!.row;
    assertEquals(plannedDurationSeconds(row), want, `${key}: plannedDurationSeconds`);
  }
});

Deno.test('GOLDEN (stage 2) · the badge reader gained NO fallbacks', () => {
  /**
   * ⛔ SPEC §1's STANDING RULE. `resolvePlannedDurationMinutes` feeds a displayed badge and a wrong
   * duration on screen is a lie, so it reads the authoritative stored total and returns null
   * otherwise. Stage 2 made it a wrapper — over `storedPlannedTotalSeconds`, NOT over
   * `plannedDurationSeconds`, which would have handed it the whole ladder and quietly ended its
   * null contract. This test is what makes that distinction load-bearing rather than a comment.
   */
  for (const { label, row } of STAGE2_ROWS) {
    const key = label.slice(0, 1);
    const badge = resolvePlannedDurationMinutes(row);
    if (key === 'P') {
      assertEquals(badge, 60, 'P: it HAS a stored total, so the badge shows it');
    } else {
      assertEquals(badge, null, `${key}: no stored root total → the badge stays hidden`);
    }
  }
  // And the accessor it wraps agrees, rung for rung.
  assertEquals(storedPlannedTotalSeconds({ total_duration_seconds: 3600 }), 3600);
  assertEquals(storedPlannedTotalSeconds({ computed: { total_duration_seconds: 3600 } }), null);
  assertEquals(storedPlannedTotalSeconds({}), null);
  assertEquals(storedPlannedTotalSeconds(null), null);
});

Deno.test('⚠️ CHANGED (stage 2) · the summary now prefers the stored total over the steps-sum', () => {
  /**
   * ⛔ THE ONE DELIBERATE BEHAVIOUR CHANGE IN STAGE 2, STATED OUT LOUD. Row P carries a root total of
   * 3600s and steps summing to 2400s.
   *
   *     before — PlannedWorkoutSummary.computeMinutes → 40 min   (steps-sum first, "client authoritative")
   *              calendar / Today's card / swap gate  → 60 min   (stored total first)
   *     after  — every surface                        → 60 min
   *
   * `computeMinutes` was the ONLY reader that preferred the steps-sum, so on a row like this the
   * summary printed a different number from the chip the athlete tapped to reach it. SPEC §1 names
   * the stored-total-first ladder authoritative; the summary was the outlier and now agrees.
   *
   * ⚠️ IF THIS EVER NEEDS REVERSING, reverse it HERE and in `plannedDurationSeconds` together — the
   * point of one reader is that the question has one answer.
   */
  const p = STAGE2_ROWS.find((r) => r.label.startsWith('P ·'))!.row;
  assertEquals(plannedDurationSeconds(p), 3600, 'the stored total wins');
  assertEquals(plannedDurationMinutes(p), 60);

  // The sum the old reader would have returned, shown so the change is legible rather than asserted.
  const steps = (p.computed as { steps: Array<{ seconds: number }> }).steps;
  assertEquals(steps.reduce((a, s) => a + s.seconds, 0), 2400, 'what computeMinutes used to answer');
});

Deno.test('GOLDEN (stage 2) · resolveMovingSeconds still answers stage 0 exactly, planned AND completed', () => {
  /**
   * ⛔ THE COMPLETED BRANCH DID NOT MOVE, and this is the assertion that holds that line. Stage 2
   * extracted the PLANNED half only; `resolveMovingSeconds` keeps its `workout_status` gate and
   * delegates. Row J is completed and must still be read as executed time, not as a planned total.
   */
  for (const { label, row } of ROWS) {
    const key = label.slice(0, 1);
    const isPlanned = String(row.workout_status ?? '').toLowerCase() === 'planned';
    if (isPlanned) {
      assertEquals(
        resolveMovingSeconds(row), plannedDurationSeconds(row),
        `${key}: planned rows delegate to the one reader`,
      );
    }
  }
  const j = byLabel('J ·');
  assertEquals(String(j.workout_status), 'completed');
  assertEquals(resolveMovingSeconds(j), 3000, 'J: moving_time 50min — the COMPLETED branch, untouched');
  // ⚠️ And the planned reader is NOT what produced that: it would read J's root total. Same number
  // here by coincidence of the fixture, different question — which is exactly why they stay separate.
  assertEquals(plannedDurationSeconds(j), 3000);
});

// ── STAGE 3 — the SERVER's row shape ─────────────────────────────────────────────────────────
//
// ⛔ THE CLIENT MAPPER IS GONE, so `planned_workout` from `get-week` is the only planned row any
// surface sees. These pin that the shape it emits still feeds the one duration reader correctly —
// especially the two capabilities stage 2 rescued, whose survival across the server shape was NOT
// self-evident and is the guardrail this stage was given.

const SERVER_ROWS: Array<{ label: string; row: Row }> = [
  {
    label: 'Q · server row — `duration` (minutes) and nothing else, the field stage 3 added',
    row: {
      id: 'q', type: 'run', name: 'Easy Run', workout_status: 'planned', date: '2026-08-11',
      total_duration_seconds: null, computed: null, duration: 50, tags: ['easy_run'],
    },
  },
  {
    label: 'R · server row — distance steps carrying the SERVER\'s pace_range shape',
    row: {
      id: 'r', type: 'run', name: 'Intervals', workout_status: 'planned', date: '2026-08-21',
      total_duration_seconds: null, duration: null, tags: ['intervals'],
      // ⚠️ `get-week:1010` builds this from `paceTarget`: sec-per-MILE, ±5%, `unit: 'mi'`.
      computed: {
        total_duration_seconds: null,
        steps: Array.from({ length: 6 }, () => ({
          distanceMeters: 800,
          pace_range: { lower: 428, upper: 473, unit: 'mi' },
        })),
      },
    },
  },
  {
    label: 'S · server row — steps sum, the shape that hid the glyph',
    row: {
      id: 's', type: 'run', name: 'Easy Run', workout_status: 'planned', date: '2026-08-18',
      total_duration_seconds: null, duration: null, tags: ['easy_run'],
      computed: { total_duration_seconds: null, steps: [{ seconds: 1890 }, { seconds: 1890 }] },
    },
  },
];

Deno.test('GOLDEN (stage 3) · the server contract feeds the one duration reader', () => {
  const golden: Record<string, { secs: number | null; swapMin: number }> = {
    // ⚠️ Q: `duration` is MINUTES and is NOT a rung of `plannedDurationSeconds` — deliberately. It is
    // the swap gate's own last resort (`resolveMinutes`), for rows with no structure at all. So the
    // seconds reader says "I don't know" and the gate still sizes the session. Both are correct.
    'Q': { secs: null, swapMin: 50 },
    'R': { secs: 1344, swapMin: 22 },   // 6 × 800m at the midpoint of 428-473 sec/mi (450.5)
    'S': { secs: 3780, swapMin: 63 },
  };
  for (const [key, want] of Object.entries(golden)) {
    const row = SERVER_ROWS.find((r) => r.label.startsWith(`${key} ·`))!.row;
    assertEquals(plannedDurationSeconds(row), want.secs, `${key}: plannedDurationSeconds`);
    assertEquals(resolveMinutes(row as never), want.swapMin, `${key}: resolveMinutes`);
  }
});

Deno.test('⛔ (stage 3) · the two capabilities stage 2 rescued survive the SERVER shape', () => {
  /**
   * ⛔ THE GUARDRAIL THIS STAGE WAS GIVEN, ANSWERED EXPLICITLY.
   *
   * 1. DISTANCE-PRICED STEPS — survive, and are in fact SAFER on this path. Stage 2's fixture M
   *    priced them from a `paceTarget` STRING; the server parses that string itself and emits a
   *    numeric `pace_range` in sec/mi (`get-week:1010`), which `stepSeconds` reads first. Row R
   *    proves the numeric form prices to the same ~1342s as the string form did.
   *
   * 2. JSON-STRING `computed` — **cannot occur on this path at all.** `toPlannedWorkout` BUILDS
   *    `computed` as an object (`{ steps, total_duration_seconds }`) or null; it never passes a
   *    string through. The capability stays in `plannedDurationSeconds` because the DIRECT table
   *    readers still exist (`usePlannedWorkoutLink`, `StrengthLogger`) and those do see the string
   *    form. It is not dead code — it is simply not reachable from the server contract.
   */
  const r = SERVER_ROWS.find((x) => x.label.startsWith('R ·'))!.row;
  const m = { computed: { steps: Array.from({ length: 6 }, () => ({ distanceMeters: 800, paceTarget: '7:30/mi' })) } };
  const viaServer = plannedDurationSeconds(r)!;
  const viaString = plannedDurationSeconds(m)!;
  assert(Math.abs(viaServer - viaString) <= 2, `numeric ${viaServer} vs string ${viaString} must agree`);

  // The server never emits a string `computed` — but the reader must still handle one, for the
  // direct-table paths the client still has.
  assertEquals(plannedDurationSeconds({ computed: JSON.stringify({ total_duration_seconds: 2700 }) }), 2700);
});

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
  const available = ['run', 'ride', 'swim'] as const;
  const golden: Record<string, string[]> = {
    'A': ['ride', 'swim'],   // easy run
    'B': ['ride', 'swim'],
    'C': ['run', 'swim'],    // easy ride
    'D': ['ride'],           // hard → run↔ride only, never swim
    'E': [],                 // long run
    'F': [],                 // long ride
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

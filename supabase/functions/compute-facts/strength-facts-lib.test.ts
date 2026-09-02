/**
 * THE SET'S INTENT REACHES THE FACT — fixtures for the `slot_intent` carry (2026-08-28).
 *
 * ⛔ WHY THESE EXIST. The intent was STARVED, not absent: `compose.ts` stamps it, `materialize-plan`
 * preserves it, `StrengthLogger` saves it onto `workouts.strength_exercises` — and this function
 * dropped it, so `exercise_log` never carried it and the e1RM series had nothing to filter on. On a
 * Viada block the same lift is prescribed twenty percent apart in one week (bench 135 heavy, 105
 * speed), so every speed session planted a lower point and the strength line fell on a week
 * followed exactly. A code trace and a typecheck do not prove a data carry; these do.
 *
 * Run: deno test --no-check --allow-read --allow-env \
 *        supabase/functions/compute-facts/strength-facts-lib.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildStrengthFacts, aggregateLearnedStrengthMaxes } from './strength-facts-lib.ts';

/** A completed heavy set. `completed: true` so D-204's untouched-prefill rule keeps it. */
const set = (weight: number, reps: number) => ({ weight, reps, completed: true });

const workout = (ex: Record<string, unknown>) => ({
  strength_exercises: [{ name: 'Bench Press', sets: [set(135, 3)], ...ex }],
  moving_time: 45,
});

const plannedWith = (ex: Record<string, unknown> | null) =>
  ex ? { strength_exercises: [{ name: 'Bench Press', ...ex }] } : null;

const factFor = (w: unknown, p: unknown) =>
  buildStrengthFacts(w as never, p as never, null).exercises[0];

Deno.test('⛔ THE LOGGED ROW CARRIES THE INTENT THROUGH', () => {
  const f = factFor(workout({ slot_intent: 'DE' }), null);
  assertEquals(f.slot_intent, 'DE');
});

Deno.test('⛔ THE PLANNED ROW IS THE FALLBACK when the logged copy carries nothing', () => {
  // A session logged by an older client, or before the logger carried the field: the prescription
  // still knows what the slot was for.
  const f = factFor(workout({}), plannedWith({ slot_intent: 'ME' }));
  assertEquals(f.slot_intent, 'ME');
});

Deno.test('⛔ THE LOGGED ROW WINS OVER THE PLANNED ONE', () => {
  // What the athlete saved is what happened. They are the same slot here, but the precedence has to
  // be stated once or a later reader will assume the prescription is authoritative.
  const f = factFor(workout({ slot_intent: 'DE' }), plannedWith({ slot_intent: 'ME' }));
  assertEquals(f.slot_intent, 'DE');
});

Deno.test('⛔ A DECLARED SWAP KEEPS THE SLOT\'S INTENT', () => {
  // Q-181: the athlete replaced the movement, not the reason the slot exists. The logged row's own
  // stamp travels with the swap, so a substituted heavy lift is still heavy.
  const w = {
    strength_exercises: [{
      name: 'Close Grip Bench Press', planned_name: 'Bench Press', substituted_for: 'Bench Press',
      slot_intent: 'ME', sets: [set(135, 3)],
    }],
    moving_time: 45,
  };
  assertEquals(factFor(w, null).slot_intent, 'ME');
});

Deno.test('⛔⛔ NEITHER SOURCE HAS IT → NULL, AND NULL IS NOT A HEAVY SET', () => {
  /**
   * ⛔ THE PERMANENT REGRESSION. This is the population the block-scoped strength card must fail
   * CLOSED on: a hand-added exercise, an off-plan session, and every row logged before the field
   * was carried — including Michael's own sessions of 24-25 August, whose block began before the
   * logger stamped this.
   *
   * ⚠️ THE REFUSAL TO MINT A MAX IS NOT THIS FUNCTION'S — it belongs to the series gate in
   * `state-trend/assemble.ts`, which is deliberately unbuilt while the band is unruled. What this
   * fixture pins is the INPUT half: the fact says `null`, honestly, rather than guessing 'ME'. A
   * change that made this default to a heavy intent would hand the gate a fabricated heavy set and
   * the gate could never tell.
   */
  const f = factFor(workout({}), plannedWith({}));
  assertEquals(f.slot_intent, null);
  assertEquals(factFor(workout({}), null).slot_intent, null);
  // ⚠️ And the row is otherwise INTACT — an unknown intent removes nothing that was already there.
  assert(f.estimated_1rm > 0, 'the fact stopped carrying an estimate');
  assertEquals(f.best_weight, 135);
  assertEquals(f.best_reps, 3);
});

Deno.test('⛔ AN UNRECOGNISED VALUE IS TREATED AS ABSENT, never stored as itself', () => {
  // Q-192's failure mode: an unknown id that resolves silently. Storing "heavy" or "1 x ME:
  // Accessory" raw would give a later reader a fifth intent to guess at.
  assertEquals(factFor(workout({ slot_intent: 'heavy' }), null).slot_intent, null);
  assertEquals(factFor(workout({ slot_intent: '1 x ME: Accessory' }), null).slot_intent, null);
  assertEquals(factFor(workout({ slot_intent: '' }), null).slot_intent, null);
  assertEquals(factFor(workout({ slot_intent: 42 }), null).slot_intent, null);
});

Deno.test('⚠️ CASE AND WHITESPACE NORMALISE — one spelling reaches the column', () => {
  assertEquals(factFor(workout({ slot_intent: 'me' }), null).slot_intent, 'ME');
  assertEquals(factFor(workout({ slot_intent: ' hyp ' }), null).slot_intent, 'HYP');
});

Deno.test('⚠️ THE EXTRACTION WAS A MOVE — the rest of the fact is unchanged', () => {
  /**
   * `buildStrengthFacts` was lifted out of `index.ts` verbatim so it could be tested at all
   * (`serve()` runs at import there). This pins the fields the extraction had to carry with it —
   * the local `estimated1RM`, the D-204 performed-set rule, and the session roll-up.
   */
  const w = {
    strength_exercises: [{
      name: 'Bench Press', slot_intent: 'ME',
      sets: [set(135, 3), set(135, 5), { weight: 95, reps: 5, completed: false }],
    }],
    moving_time: 45,
  };
  const out = buildStrengthFacts(w as never, null, null);
  const f = out.exercises[0];
  assertEquals(f.canonical, 'bench_press');
  assertEquals(f.sets_completed, 2, 'an uncompleted set was counted');
  assertEquals(f.best_weight, 135);
  assertEquals(f.best_reps, 5, 'the heavier-then-more-reps tie rule broke');
  assert(f.estimated_1rm > 135, `estimate did not come through: ${f.estimated_1rm}`);
  assertEquals(out.strength_facts.total_sets, 2);
  assertEquals((out.strength_facts.exercises as Array<Record<string, unknown>>)[0].slot_intent, 'ME');
});

Deno.test('⚠️ A SESSION WITH NOTHING TO SAY SERIALIZES AS IT DID — the field is omitted, not null', () => {
  // The fact JSON is compared and cached elsewhere; an absent intent must not change the shape of
  // an old row. (`exercise_log` is the opposite by design: there the column writes NULL.)
  const out = buildStrengthFacts(workout({}) as never, null, null);
  const factEx = (out.strength_facts.exercises as Array<Record<string, unknown>>)[0];
  assert(!('slot_intent' in factEx), 'an absent intent added a key to the fact JSON');
});

// ── LEARNED MAX: TRUSTED REPS ONLY (2026-09-02, Michael: the deadlift 150/185/225 split) ─────────
// Real logged deadlift sets from the account. `estimated_1rm` is the value the app stored per set.
Deno.test('⛔ learned max ignores high-rep sets — 105×35 no longer stores a 225 deadlift', () => {
  const rows = [
    { canonical_name: 'deadlift', estimated_1rm: 185, best_reps: 3,  avg_rir: null, date: '2026-09-01' }, // 170×3  — trusted, the real max
    { canonical_name: 'deadlift', estimated_1rm: 180, best_reps: 10, avg_rir: null, date: '2026-08-25' }, // 135×10 — trusted
    { canonical_name: 'deadlift', estimated_1rm: 190, best_reps: 20, avg_rir: null, date: '2026-08-11' }, // 115×20 — UNTRUSTED
    { canonical_name: 'deadlift', estimated_1rm: 200, best_reps: 25, avg_rir: null, date: '2026-08-07' }, // 110×25 — UNTRUSTED
    { canonical_name: 'deadlift', estimated_1rm: 225, best_reps: 35, avg_rir: null, date: '2026-08-01' }, // 105×35 — the fake 225
  ];
  const out = aggregateLearnedStrengthMaxes(rows, ['deadlift']);
  assertEquals(out.deadlift.value, 185);       // the trusted max, NOT 225
  assertEquals(out.deadlift.sample_count, 2);  // only the two ≤10-rep sets counted
});

Deno.test('a lift with ONLY high-rep sets learns nothing rather than a fabricated max', () => {
  const rows = [
    { canonical_name: 'deadlift', estimated_1rm: 225, best_reps: 35, avg_rir: null, date: '2026-08-01' },
    { canonical_name: 'deadlift', estimated_1rm: 200, best_reps: 25, avg_rir: null, date: '2026-08-07' },
  ];
  assertEquals(aggregateLearnedStrengthMaxes(rows, ['deadlift']).deadlift, undefined);
});

Deno.test('D-118 RIR preference survives the gate: an RIR≥5 set is fallback-only', () => {
  const rows = [
    { canonical_name: 'squat', estimated_1rm: 150, best_reps: 5, avg_rir: 6, date: '2026-08-10' }, // far from failure
    { canonical_name: 'squat', estimated_1rm: 125, best_reps: 5, avg_rir: 2, date: '2026-08-12' }, // real effort
  ];
  const out = aggregateLearnedStrengthMaxes(rows, ['squat']);
  assertEquals(out.squat.value, 125);          // the RIR-6 150 is ignored while a real set exists
  assertEquals(out.squat.usedFallback, false);
});

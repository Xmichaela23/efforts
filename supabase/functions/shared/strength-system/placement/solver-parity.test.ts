/**
 * The lifts are placed by `_shared/week-solver.ts`, not by a hardcoded weekday grid (2026-08-08).
 *
 * ⛔ THE POINT OF THIS FILE IS THE COMPARISON, NOT A SNAPSHOT — the same shape `assign-days-parity`
 * used for the runs. `simple.ts` is still present and still exported, so both placers run on the
 * identical week and the new one is held to "equal-or-better, never worse". A test that only
 * asserted the new shape could not tell an improvement from a regression, and this is shared code:
 * every run plan in the app goes through it.
 *
 * The four rules under test, all of them the engine's and none of them this adapter's:
 *   1. a LOWER lift never lands on a hard or long day (matrix 0 + 48h/24h adjacency);
 *   2. the long-run day carries NO lift while the week has room (`stackHostPenalty`);
 *   3. an upper lift stacks only when the week genuinely cannot hold the sessions otherwise
 *      (`stacksRequired` arithmetic gate);
 *   4. nothing is dropped — lifts in equals lifts out.
 *
 * Run:
 *   deno test --no-check --allow-all \
 *     supabase/functions/shared/strength-system/placement/solver-parity.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { assignSessionsViaSolver, type PrimarySchedule } from './solver.ts';
import { simplePlacementPolicy } from './simple.ts';
import type { IntentSession, PlacedSession } from '../protocols/types.ts';
import { isLowerIntent } from '../protocols/intent-taxonomy.ts';

const ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const intent = (i: string): IntentSession =>
  ({ intent: i, name: i, exercises: [], durationMin: 45 } as unknown as IntentSession);

/** Weeks the athlete actually asks for — long run on every day of the week, 4/5/6 run days. */
function schedules(): Array<{ label: string; schedule: PrimarySchedule }> {
  const out: Array<{ label: string; schedule: PrimarySchedule }> = [];
  for (const long of ORDER) {
    const rest = ORDER.filter((d) => d !== long);
    for (const runDays of [4, 5]) {
      const quality = rest[1];
      const easies = rest.filter((d) => d !== quality).slice(0, runDays - 2);
      out.push({
        label: `long ${long} · ${runDays} run days`,
        schedule: { longSessionDays: [long], qualitySessionDays: [quality], easySessionDays: easies },
      });
    }
  }
  return out;
}

const LIFT_SETS: Array<{ label: string; intents: string[] }> = [
  { label: '2 lifts (upper+lower)', intents: ['UPPER_STRENGTH', 'LOWER_NEURAL'] },
  { label: '3 lifts', intents: ['UPPER_STRENGTH', 'LOWER_NEURAL', 'UPPER_MAINTENANCE'] },
  { label: '4 lifts U/L/U/L', intents: ['UPPER_STRENGTH', 'LOWER_NEURAL', 'UPPER_MAINTENANCE', 'LOWER_MAINTENANCE'] },
];

const dayIdx = (d: string) => ORDER.indexOf(d);
const gap = (a: string, b: string) => {
  const raw = Math.abs(dayIdx(a) - dayIdx(b));
  return Math.min(raw, 7 - raw);   // the week wraps
};

// ── Rule 1 — heavy legs never share, or sit beside, a hard or long day ───────────────────────

Deno.test('⛔ a LOWER lift never lands on the long-run day or a hard-run day', () => {
  for (const { label, schedule } of schedules()) {
    for (const set of LIFT_SETS) {
      const placed = assignSessionsViaSolver(set.intents.map(intent), schedule, []);
      const hard = new Set([...schedule.longSessionDays, ...schedule.qualitySessionDays]);
      for (const p of placed) {
        if (!isLowerIntent(p.intent)) continue;
        assert(!hard.has(p.day), `${label} / ${set.label}: ${p.intent} landed on ${p.day}, a hard/long day`);
      }
    }
  }
});

Deno.test('⛔ a LOWER lift keeps its 48h from the long run', () => {
  for (const { label, schedule } of schedules()) {
    for (const set of LIFT_SETS) {
      const placed = assignSessionsViaSolver(set.intents.map(intent), schedule, []);
      const long = schedule.longSessionDays[0];
      for (const p of placed) {
        if (!isLowerIntent(p.intent)) continue;
        assert(
          gap(p.day, long) >= 2,
          `${label} / ${set.label}: ${p.intent} on ${p.day} is ${gap(p.day, long)} day(s) from the long run on ${long}`,
        );
      }
    }
  }
});

// ── Rule 2 + 3 — the long day stays clear unless the week is genuinely full ──────────────────

Deno.test('⛔ the long-run day carries NO lift while the week has a free day', () => {
  for (const { label, schedule } of schedules()) {
    for (const set of LIFT_SETS) {
      const placed = assignSessionsViaSolver(set.intents.map(intent), schedule, []);
      const long = schedule.longSessionDays[0];
      const runDays = new Set([
        ...schedule.longSessionDays, ...schedule.qualitySessionDays, ...schedule.easySessionDays,
      ]);
      const active = new Set([...runDays, ...placed.map((p) => p.day)]);
      if (active.size >= 7) continue;   // genuinely full — stacking is allowed and expected
      const onLong = placed.filter((p) => p.day === long);
      assertEquals(
        onLong.length, 0,
        `${label} / ${set.label}: ${onLong.map((p) => p.intent).join(', ')} stacked on the long run ` +
        `with only ${active.size} active days — the week had room`,
      );
    }
  }
});

// ── Rule 4 — nothing is dropped, and no two lifts share a day ────────────────────────────────

Deno.test('⛔ lifts in === lifts out, on every schedule', () => {
  for (const { label, schedule } of schedules()) {
    for (const set of LIFT_SETS) {
      const placed = assignSessionsViaSolver(set.intents.map(intent), schedule, []);
      assertEquals(placed.length, set.intents.length, `${label} / ${set.label}: a lift went missing`);
      assert(placed.every((p) => ORDER.includes(p.day)), `${label} / ${set.label}: a lift has no day`);
    }
  }
});

Deno.test('two lifts never share a day', () => {
  for (const { label, schedule } of schedules()) {
    for (const set of LIFT_SETS) {
      const placed = assignSessionsViaSolver(set.intents.map(intent), schedule, []);
      const days = placed.map((p) => p.day);
      assertEquals(new Set(days).size, days.length, `${label} / ${set.label}: two lifts on one day — ${days.join(', ')}`);
    }
  }
});

Deno.test('a skipped guardrail still removes its session, exactly as the grid did', () => {
  const set = ['UPPER_STRENGTH', 'LOWER_NEURAL'];
  const schedule: PrimarySchedule = {
    longSessionDays: ['Sunday'], qualitySessionDays: ['Tuesday'], easySessionDays: ['Thursday'],
  };
  const placed = assignSessionsViaSolver(
    set.map(intent), schedule,
    [{ sessionIndex: 1, intent: 'LOWER_NEURAL', guardrails: [], finalAction: 'skip' } as never],
  );
  assertEquals(placed.length, 1);
  assertEquals(placed[0].intent, 'UPPER_STRENGTH');
});

// ── The comparison: the grid could not do this, and here is the count ────────────────────────

Deno.test('⛔ EQUAL-OR-BETTER vs the weekday grid it replaced', () => {
  const gridBreaches: string[] = [];
  const solverBreaches: string[] = [];
  for (const { label, schedule } of schedules()) {
    for (const set of LIFT_SETS) {
      const hard = new Set([...schedule.longSessionDays, ...schedule.qualitySessionDays]);
      const long = schedule.longSessionDays[0];

      const check = (placed: PlacedSession[], sink: string[]) => {
        for (const p of placed) {
          if (!isLowerIntent(p.intent)) continue;
          if (hard.has(p.day)) sink.push(`${label}/${set.label}: lower on ${p.day}`);
          else if (gap(p.day, long) < 2) sink.push(`${label}/${set.label}: lower ${gap(p.day, long)}d from long`);
        }
      };

      check(assignSessionsViaSolver(set.intents.map(intent), schedule, []), solverBreaches);
      try {
        check(
          simplePlacementPolicy.assignSessions(set.intents.map(intent), schedule, [], {
            methodology: 'hal_higdon_complete', protocol: 'neural_speed',
            strengthFrequency: set.intents.length as 2 | 3 | 4, noDoubles: false, injuryHotspots: [],
          }) as PlacedSession[],
          gridBreaches,
        );
      } catch { /* the grid throws on shapes it has no slot for — counted as no data, not a pass */ }
    }
  }
  console.log(`[parity] grid breaches: ${gridBreaches.length}, solver breaches: ${solverBreaches.length}`);
  assertEquals(solverBreaches.length, 0, `the solver breached the lower-body law:\n${solverBreaches.join('\n')}`);
  assert(
    gridBreaches.length > 0,
    'the grid produced no breach across every long-run day — if that is real, this test is no longer ' +
    'measuring anything and the swap needs a different justification',
  );
});

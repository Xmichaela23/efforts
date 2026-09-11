/**
 * Choose the workout on the day (2026-09-11): which workouts a hard session offers, that a tap writes
 * the session the composer builds, and that Back to the plan and "just today" hold.
 *
 * Run: ~/.deno/bin/deno test --no-check --sloppy-imports --allow-read --allow-env supabase/functions/_shared/session-swap/workout-choice.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeBlock } from '../standing-plan/compose.ts';
import { ARCHETYPES } from '../standing-plan/golden-block.ts';
import { archetypesFor } from '../endurance-library/index.ts';
import {
  composedHardSession,
  hardSlotOf,
  workoutChoiceOptions,
  workoutChoicePatch,
  workoutLine,
  workoutsForSlot,
} from './workout-choice.ts';
import { parseQualityWork, qualityWorkLine } from '../plan-tokens/quality-work.ts';
import { applySwap, describeSheet, optionId, receiptFor, sheetOptions } from './sheet.ts';
import { revertOptions, WORKOUT_FROM_PREFIX } from './swap.ts';
import { resolveSwapWrite } from './resolve-write.ts';

const NO_THRESHOLD = { units: 'imperial', performance_numbers: { easy_pace: '9:30', fiveK_pace: '7:50', ftp: 210 } };
const home = ARCHETYPES.find((a) => a.key === 'home-barbell')!.args;
const newer = ARCHETYPES.find((a) => a.key === 'untested-minimal')!.args;

/** The blocks the sweep composes: both programmes, both experience answers, runs and rides. */
const CASES: Array<{ label: string; args: Record<string, unknown> }> = [
  { label: 'all_rounder runs', args: { ...home } },
  { label: 'all_rounder newer', args: { ...newer } },
  { label: 'all_rounder rides', args: { ...home, sportMix: { runs: 1, rides: 3, slots: { '1:0': 'ride', '3:0': 'ride' } } } },
  { label: 'strength_5k', args: { ...home, frame: 'strength_5k' } },
  { label: 'strength_5k newer', args: { ...newer, frame: 'strength_5k' } },
];

type Row = Record<string, unknown> & { id: string; tags: string[]; type: string; name: string };
const withoutChoiceTag = (tags: unknown) => (tags as string[]).filter((t) => !t.startsWith(WORKOUT_FROM_PREFIX));

function hardRows(args: Record<string, unknown>, baselines: unknown): Array<{ week: number; row: Row }> {
  const out: Array<{ week: number; row: Row }> = [];
  const weeks = composeBlock({ ...args, baselines, weeks: 6, taperWeeks: [6] } as never);
  for (const w of weeks) {
    w.sessions.forEach((s, i) => {
      const row = { ...s, id: `w${w.week}-${i}`, workout_status: 'planned' } as unknown as Row;
      if (hardSlotOf(row)) out.push({ week: w.week, row });
    });
  }
  return out;
}

Deno.test('a chosen workout writes exactly the session the composer builds for it', () => {
  const seen = new Set<string>();
  for (const c of CASES) {
    for (const baselines of [undefined, NO_THRESHOLD]) {
      for (const { week, row } of hardRows(c.args, baselines)) {
        const slot = hardSlotOf(row)!;
        const patch = workoutChoicePatch(row, slot, composedHardSession({ ...slot, baselines: baselines as never }));
        const at = `${c.label} week ${week} ${row.name} ${slot.archetype}`;
        assertEquals(patch.name, row.name, at);
        assertEquals(patch.description, row.description, at);
        assertEquals(patch.duration, row.duration, at);
        assertEquals(patch.steps_preset, row.steps_preset, at);
        assertEquals(withoutChoiceTag(patch.tags), row.tags, at);
        seen.add(`${slot.family}:${slot.level}`);
      }
    }
  }
  for (const want of ['run_mlss:2', 'run_mlss:1', 'run_near_threshold:2', 'run_near_threshold:3', 'run_near_threshold:1', 'ride_anaerobic:1']) {
    assert(seen.has(want), `the sweep never built ${want} (saw ${[...seen].join(', ')})`);
  }
  assert([...seen].some((k) => k.startsWith('ride_sweet_spot:')), `no sweet-spot ride in the sweep (saw ${[...seen].join(', ')})`);
});

/** A planned hard row of one family off a composed block. */
function rowOf(args: Record<string, unknown>, family: string, level?: number): Row {
  const found = hardRows(args, NO_THRESHOLD).map((x) => x.row)
    .find((r) => r.tags.includes(`family:${family}`) && (level == null || r.tags.includes(`level:${level}`)));
  assert(found, `no ${family} row`);
  return { ...found!, date: '2026-09-16', training_plan_id: 'p1', week_number: 3 };
}
const archetypeOf = (r: Row) => r.tags.find((t) => t.startsWith('archetype:'))!.slice('archetype:'.length);
const noSports = { run: 'develop', bike: 'develop' } as never;

Deno.test('a hard session lists the other workouts for its family at its level, each with its own work', async () => {
  const row = rowOf(home, 'run_near_threshold', 2);
  const ctx = { session: row, week: [row], posture: noSports, ftp: null, baselines: NO_THRESHOLD as never };
  const options = sheetOptions(ctx);
  const expected = archetypesFor('run_near_threshold', 2).filter((a) => a.id !== archetypeOf(row));
  assertEquals(options.map(optionId), expected.map((a) => `workout:${a.id}`));
  const sheet = await describeSheet(null, 'u1', ctx);
  expected.forEach((a, i) => {
    const built = composedHardSession({ family: 'run_near_threshold', level: 2, archetype: a.id, baselines: NO_THRESHOLD as never });
    assertEquals(sheet.options[i].label, `${a.label} · ${built.duration} min`);
    assertEquals(sheet.options[i].sport, false);
    assertEquals(sheet.options[i].kind, 'workout');
    /**
     * ⛔ THE SECOND LINE IS THE WORKOUT ITSELF (Michael, 2026-09-11), off the same tokens the patch
     * writes. ⚠️ NO PRICING WAS PASSED, so it prints the page's percentages — the honest state, and
     * the one the session's own steps reach when there is no threshold on file.
     */
    assertEquals(sheet.options[i].line, workoutLine(built, 'run', {}));
    // ⚠️ A plain repeat reads "4 × 4 min at 105%"; a compound round "2 sets of 4 rounds: … at 95%, …".
    assert(/ at \d+%/.test(sheet.options[i].line ?? ''), sheet.options[i].line ?? 'no line');
  });
});

/**
 * ⛔⛔ THE LINE AND THE STEPS THE TAP WRITES ARE ONE DERIVATION. The sheet says the work; the patch
 * writes the tokens; `materialize-plan` expands those tokens with the parser this line was rendered
 * from. Swept over every hard row both programmes build, priced and unpriced.
 */
Deno.test('every offered workout\'s line is the work its own patch writes, priced for the athlete', () => {
  const pricing = { thresholdSecPerMi: 7 * 60 + 30, ftp: 210, units: 'imperial' as const };
  let checked = 0;
  for (const c of CASES) {
    for (const { row } of hardRows(c.args, NO_THRESHOLD)) {
      const slot = hardSlotOf(row)!;
      const seat = { ...row, date: '2026-09-16', id: 'x1' } as Row;
      for (const o of workoutChoiceOptions(seat, [seat], NO_THRESHOLD as never, null, pricing)) {
        const built = composedHardSession({ ...slot, archetype: o.archetype!, baselines: NO_THRESHOLD as never });
        // The steps the tap writes, and the line the sheet showed, off the same tokens.
        assertEquals((o.patch as { steps_preset: string[] }).steps_preset, built.steps_preset);
        const work = built.steps_preset.map(parseQualityWork).filter(Boolean);
        assertEquals(o.line, work.map((w) => qualityWorkLine(w, slot.sport, pricing)).join('; '));
        assert((o.line ?? '').length > 0, `${slot.family} ${o.archetype} has no line`);
        // Priced: a run line names a pace, a ride line names watts. Never a percentage here.
        assert(
          slot.sport === 'run' ? /\d+:\d\d\/mi/.test(o.line!) : /\d+ W/.test(o.line!),
          `${slot.sport} ${slot.family} ${o.archetype}: ${o.line}`,
        );
        checked += 1;
      }
    }
  }
  assert(checked > 40, `only ${checked} options swept`);
});

Deno.test('an option\'s minutes are the plan\'s own expanded row of that workout, the composer\'s otherwise', () => {
  const row = rowOf(home, 'ride_anaerobic', 1);
  const others = archetypesFor('ride_anaerobic', 1).map((a) => a.id).filter((id) => id !== archetypeOf(row));
  const [first, second] = others;
  const options = workoutChoiceOptions(row, [row], null, { [first]: 66 });
  const byId = Object.fromEntries(options.map((o) => [o.archetype, o.label]));
  assert(byId[first].endsWith('· 66 min'), byId[first]);
  const composed = composedHardSession({ family: 'ride_anaerobic', level: 1, archetype: second }).duration;
  assert(byId[second].endsWith(`· ${composed} min`), byId[second]);
});

Deno.test('p247\'s Wednesday offers only its own rotation', () => {
  const row = rowOf({ ...home, frame: 'strength_5k' }, 'run_near_threshold', 3);
  const slot = hardSlotOf(row)!;
  assertEquals(workoutsForSlot(slot).map((w) => w.id), ['sustained_5min_90', 'sustained_6min_88', 'sustained_8min30_85']);
  const ids = workoutChoiceOptions(row, [row], NO_THRESHOLD as never).map((o) => o.archetype);
  assertEquals(ids, ['sustained_5min_90', 'sustained_6min_88', 'sustained_8min30_85'].filter((id) => id !== slot.archetype));
});

Deno.test('done, skipped, sport-swapped and race-tempo sessions offer no workout', () => {
  const row = rowOf(home, 'run_mlss', 2);
  assertEquals(workoutChoiceOptions({ ...row, workout_status: 'completed' }, [], null).length, 0);
  assertEquals(workoutChoiceOptions({ ...row, workout_status: 'skipped' }, [], null).length, 0);
  assertEquals(workoutChoiceOptions({ ...row, tags: [...row.tags, 'discipline_swapped', 'swapped_from:run'] }, [], null).length, 0);
  assertEquals(workoutChoiceOptions({ ...row, tags: [...row.tags, 'race_tempo'] }, [], null).length, 0);
  assert(workoutChoiceOptions(row, [], null).length > 0);
  // An easy or long session offers none either.
  const easy = { ...row, tags: ['family:run_vt1', 'level:1', 'sport:run', 'band:vt1_or_easier', 'archetype:continuous'] };
  assertEquals(workoutChoiceOptions(easy, [], null).length, 0);
});

Deno.test('a workout another session of the same family holds that week is not offered', () => {
  const row = rowOf(home, 'run_mlss', 2);
  const other = archetypesFor('run_mlss', 2).map((a) => a.id).find((id) => id !== archetypeOf(row))!;
  const neighbour = { id: 'n1', type: 'run', tags: ['family:run_mlss', `archetype:${other}`] };
  const ids = workoutChoiceOptions(row, [row, neighbour], null).map((o) => o.archetype);
  assert(!ids.includes(other));
  assert(!ids.includes(archetypeOf(row)));
});

Deno.test('after a choice: Back to the plan first, the plan\'s workout off the list, the earliest workout kept', () => {
  const row = rowOf(home, 'run_mlss', 2);
  const planned = archetypeOf(row);
  const first = workoutChoiceOptions(row, [row], null)[0];
  const chosen = { ...row, ...first.patch } as Row;
  assert(chosen.tags.includes(`${WORKOUT_FROM_PREFIX}${planned}`));
  assert(chosen.tags.includes(`archetype:${first.archetype}`));
  const ctx = { session: chosen, week: [chosen], posture: noSports, ftp: null, baselines: null };
  const ids = sheetOptions(ctx).map(optionId);
  assertEquals(ids[0], 'revert:run');
  assertEquals(revertOptions(chosen, 'p1')[0].label, row.name);
  assert(!ids.includes(`workout:${planned}`));
  assert(!ids.includes(`workout:${first.archetype}`));
  const second = workoutChoiceOptions(chosen, [chosen], null)[0];
  const again = { ...chosen, ...second.patch } as Row;
  assertEquals(again.tags.filter((t) => t.startsWith(WORKOUT_FROM_PREFIX)), [`${WORKOUT_FROM_PREFIX}${planned}`]);
  // No plan to go back to, no way back offered.
  assertEquals(revertOptions(chosen, null).length, 0);
});

/** Records every write and read; `plans` answers with the given blob. */
function fakeDb(blob: unknown = null) {
  const calls = { updates: [] as Array<Record<string, unknown>>, selects: [] as string[] };
  const from = (table: string) => {
    // deno-lint-ignore no-explicit-any
    const q: any = {
      update(patch: Record<string, unknown>) { calls.updates.push(patch); return q; },
      select() { calls.selects.push(table); return q; },
      eq() { return q; }, gt() { return q; }, contains() { return q; }, order() { return q; }, limit() { return q; },
      maybeSingle: async () => ({ data: table === 'plans' ? { sessions_by_week: blob } : null, error: null }),
      then(resolve: (v: unknown) => void) { resolve({ data: [], error: null }); },
    };
    return q;
  };
  return { db: { from }, calls };
}

Deno.test('a workout tap writes this session only, even when Rest of plan is asked, and the toast is its name', async () => {
  const row = rowOf(home, 'run_mlss', 2);
  const ctx = { session: row, week: [row], posture: noSports, ftp: null, baselines: null };
  const option = sheetOptions(ctx)[0];
  const { db, calls } = fakeDb();
  const materialized: string[] = [];
  const result = await applySwap({ db, userId: 'u1', ctx, optionId: optionId(option), restOfPlan: true, materialize: async (id) => { materialized.push(id); } });
  assert(result.ok);
  if (!result.ok) return;
  assertEquals(result.alsoWritten, 0);
  assertEquals(result.ids, [row.id]);
  assertEquals(calls.updates.length, 1);
  assertEquals(calls.selects, []);
  assertEquals(materialized, [row.id]);
  assertEquals(result.receipt, option.label);
  assertEquals(receiptFor(option, 3), option.label);
});

Deno.test('Back to the plan on a chosen workout restores the row the plan authored', async () => {
  const row = rowOf(home, 'run_mlss', 2);
  const chosen = { ...row, ...workoutChoiceOptions(row, [row], null)[0].patch } as Row;
  const authored = { day: 'Wednesday', type: 'run', name: row.name, description: row.description, steps_preset: row.steps_preset, tags: row.tags };
  const { db } = fakeDb({ '3': [authored] });
  const revert = revertOptions(chosen, 'p1')[0];
  const write = await resolveSwapWrite(db, 'u1', chosen, revert);
  assertEquals(write.ok, true);
  assertEquals(write.patch.tags, row.tags);
  assertEquals(write.patch.steps_preset, row.steps_preset);
  assertEquals(write.patch.type, 'run');
});

// ============================================================================
// SETS ARE EARNED ON EVERY ROW, NOT ONLY THE HEAVY LIFT (docs/WORKORDER-earned-sets-every-row-2026-09-25.md).
//
//   deno test --allow-read --allow-env --no-check supabase/functions/_shared/standing-plan/earned-sets-every-row.test.ts
//
// ⛔ NO NEW NUMBER. Every threshold below is read off the intent's p218 band (`prescribe`, `rirBandFor`) and the ME
// ladder's own constants; the walk is `meLadderStep` / `meSetsFromHistory` unchanged. The ME ladder's own tests
// (`standing-plan-me-sets.test.ts`) are untouched and stay green beside this file.
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  composeBlock, composeWeek, earnedSetsKey, SETS_LINE_DOWN, SETS_LINE_UP, type ComposedWeek, type StrengthExercise,
} from './compose.ts';
import { earnedMeSets } from './me-history.ts';
import { restateFromTest } from './restate.ts';
import { blockDescriptionFor, SETS_EARNED_PARAGRAPH } from './plan-row.ts';
import {
  EARNED_SETS_EVERY_ROW_IS_OURS,
  ME_CLEAN_REPS_WITHIN_TOP,
  ME_CLEAN_SESSIONS_TO_EARN,
  meLadderStep,
  meSetsFromHistory,
  setSessionOutcome,
} from './progression.ts';
import { prescribe, rirBandFor, type ViadaIntent } from '../strength-grid/index.ts';
import { canonicalize } from '../canonicalize.ts';
import { resolveLiftSwap, sameLift } from '../session-swap/lift-swap.ts';

const bandOf = (intent: ViadaIntent) => {
  const p = prescribe(intent, 'barbell');
  if (p.kind !== 'barbell') throw new Error(`${intent} is not a barbell intent`);
  return { sets: p.setsBand, reps: p.reps, rir: p.rir };
};

const WORKING = {
  bench: { lift: 'bench' as const, workingNumber: 200, predicted1RM: 208, epley: 209, brzycki: 207, from: { weight: 180, reps: 3 } },
  squat: { lift: 'squat' as const, workingNumber: 260, predicted1RM: 271, epley: 272, brzycki: 270, from: { weight: 240, reps: 3 } },
  deadlift: { lift: 'deadlift' as const, workingNumber: 300, predicted1RM: 312, epley: 313, brzycki: 311, from: { weight: 275, reps: 3 } },
};
const LIFTS = { push_upper: 'Bench Press', press_lower: 'Back Squat', hinge_lower: 'Deadlift' };
/** The minimum kit (`MINIMUM_KIT_KEYS`): a declared kit with no extras. */
const MIN_KIT = ['Home gym'];
const BASE = { frame: 'all_rounder' as const, competitionLifts: LIFTS, workingNumbers: WORKING, equipment: MIN_KIT, roundTo: 5 };

/** A real ISO date on the given weekday, so `weekdayOf` reproduces it. 2026-01-04 is a Sunday. */
function dateOn(day: string): string {
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return new Date(Date.parse('2026-01-04T00:00:00Z') + names.indexOf(day) * 86400000).toISOString().slice(0, 10);
}

const rowsOf = (wk: ComposedWeek): StrengthExercise[] =>
  wk.sessions.filter((s) => s.type === 'strength').flatMap((s) => s.strength_exercises ?? []);

// ── THE LADDER, PER INTENT — the same walk, the intent's own band ────────────────────────────────

Deno.test('the extension is ours and says so; the thresholds are the ME ladder\'s own', () => {
  assert(/ours/i.test(EARNED_SETS_EVERY_ROW_IS_OURS));
  assertEquals(ME_CLEAN_SESSIONS_TO_EARN, 2);
  assertEquals(ME_CLEAN_REPS_WITHIN_TOP, 1);
  assertEquals(bandOf('HYP').sets, { lo: 3, hi: 4 });
  assertEquals(bandOf('DE').sets, { lo: 4, hi: 6 });
  assertEquals(bandOf('SKILL').sets, { lo: 3, hi: 5 });
});

Deno.test('HYP: 3 → 4 after two clean sessions, holds mid-band, drops 4 → 3 on a floor miss, never below 3, never above 4', () => {
  const band = bandOf('HYP').sets;
  assertEquals(meSetsFromHistory(['clean'], band).sets, 3);
  assertEquals(meSetsFromHistory(['clean', 'clean'], band).sets, 4);
  assertEquals(meSetsFromHistory(['clean', 'mid_band', 'clean'], band).sets, 3);
  assertEquals(meSetsFromHistory(['clean', 'clean', 'setback'], band).sets, 3);
  assertEquals(meSetsFromHistory(['setback', 'setback', 'setback'], band).sets, 3);
  assertEquals(meSetsFromHistory(Array(12).fill('clean'), band).sets, 4);
});

Deno.test('DE: 4 → 5 → 6, capped at 6; SKILL: 3 → 4 → 5, capped at 5', () => {
  const de = bandOf('DE').sets;
  assertEquals(meSetsFromHistory(['clean', 'clean'], de).sets, 5);
  assertEquals(meSetsFromHistory(['clean', 'clean', 'clean', 'clean'], de).sets, 6);
  assertEquals(meSetsFromHistory(Array(12).fill('clean'), de).sets, 6);
  assertEquals(meSetsFromHistory([...Array(4).fill('clean'), 'setback'], de).sets, 5);
  const skill = bandOf('SKILL').sets;
  assertEquals(meSetsFromHistory(['clean', 'clean'], skill).sets, 4);
  assertEquals(meSetsFromHistory(['clean', 'clean', 'clean', 'clean'], skill).sets, 5);
  assertEquals(meSetsFromHistory(Array(12).fill('clean'), skill).sets, 5);
});

Deno.test('no evidence holds — the count and the run both stand, on every band', () => {
  for (const intent of ['HYP', 'DE', 'SKILL'] as ViadaIntent[]) {
    const band = bandOf(intent).sets;
    const at = { sets: band.lo + 1, cleanRun: 1 };
    assertEquals(meLadderStep(at, 'no_evidence', band), at);
    assertEquals(meSetsFromHistory(['clean', 'clean', 'no_evidence', 'no_evidence'], band).sets, band.lo + 1);
  }
});

// ── WHAT COUNTS AS CLEAN ON A DE, SKILL OR HYP ROW ───────────────────────────────────────────────

const outcome = (intent: ViadaIntent, sets: unknown[], prescribedSets = bandOf(intent).sets.lo) =>
  setSessionOutcome({ sets: sets as never, prescribedSets, repBand: bandOf(intent).reps, rirBand: rirBandFor(intent) });

Deno.test('clean = every set within one rep of the band top with the reserve inside p218\'s band', () => {
  const hyp = bandOf('HYP');
  const top = hyp.reps.hi;
  const three = (reps: number, rir: number | null) => Array(3).fill({ reps, rir, completed: true });
  assertEquals(outcome('HYP', three(top, 1)), 'clean');
  assertEquals(outcome('HYP', three(top - ME_CLEAN_REPS_WITHIN_TOP, 1)), 'clean');
  // a set at 0 reserve inside a 0-2 band is clean (p218's band, not the ME grind rule)
  assertEquals(outcome('HYP', three(top, 0)), 'clean');
  // a reserve above the band's top (too easy) still counts as clean on reps
  assertEquals(outcome('HYP', three(top, 4)), 'clean');
  // an absent reserve is the athlete not saying (D-324) — never read against them
  assertEquals(outcome('HYP', three(top, null)), 'clean');
  // mid-band reps hold and reset the run
  assertEquals(outcome('HYP', three(top - 3, 1)), 'mid_band');
  // a reserve under the band's floor is not on target: it neither earns nor costs
  const de = bandOf('DE');
  assertEquals(outcome('DE', Array(4).fill({ reps: de.reps.hi, rir: de.rir!.lo - 1, completed: true })), 'mid_band');
  assertEquals(outcome('DE', Array(4).fill({ reps: de.reps.hi, rir: de.rir!.lo, completed: true })), 'clean');
});

Deno.test('setback = any set under the band\'s rep floor, or a short session; nothing completed is silence', () => {
  const hyp = bandOf('HYP');
  const sets = (reps: number[]) => reps.map((r) => ({ reps: r, rir: 1, completed: true }));
  assertEquals(outcome('HYP', sets([hyp.reps.hi, hyp.reps.hi, hyp.reps.lo - 1])), 'setback');
  assertEquals(outcome('HYP', sets([hyp.reps.hi, hyp.reps.hi]), 3), 'setback');
  assertEquals(outcome('HYP', sets([hyp.reps.hi, hyp.reps.hi, hyp.reps.hi]), 4), 'setback');
  assertEquals(outcome('HYP', [{ reps: hyp.reps.hi, rir: 1, completed: false }]), 'no_evidence');
  assertEquals(outcome('HYP', []), 'no_evidence');
});

// ── THE WIRE: THE COUNT REACHES THE ROW, THE CHIP IS THE FLOOR, A SWAP STARTS LOW ────────────────

function hypRow(wk: ComposedWeek): StrengthExercise {
  const row = rowsOf(wk).find((e) => e.slot_intent === 'HYP' && typeof e.sets === 'number');
  assert(row, 'no HYP row in the fixture week');
  return row!;
}

Deno.test('the earned count reaches the row through the band, clamped to it', () => {
  const probe = composeWeek({ ...BASE, week: 4, column: 'standard' } as never);
  const row = hypRow(probe);
  assertEquals(row.sets, bandOf('HYP').sets.lo, 'a HYP row did not open at the low end');
  const key = earnedSetsKey(row.name, 'HYP');
  const up = composeWeek({ ...BASE, week: 4, column: 'standard', earnedSetsByMovement: { [key]: { sets: 4, from: null } } } as never);
  assertEquals(rowsOf(up).find((e) => e.name === row.name)!.sets, 4);
  // never above the band: a count past the top is clamped
  const over = composeWeek({ ...BASE, week: 4, column: 'standard', earnedSetsByMovement: { [key]: { sets: 9, from: null } } } as never);
  assertEquals(rowsOf(over).find((e) => e.name === row.name)!.sets, bandOf('HYP').sets.hi);
  // never below the band: a count under the floor is floored
  const under = composeWeek({ ...BASE, week: 4, column: 'standard', earnedSetsByMovement: { [key]: { sets: 1, from: null } } } as never);
  assertEquals(rowsOf(under).find((e) => e.name === row.name)!.sets, bandOf('HYP').sets.lo);
  // ⛔ AND THE ME ROWS ARE UNTOUCHED — the heavy lift's ladder is `meSetsByPattern`, not this.
  for (const e of rowsOf(up).filter((x) => x.slot_intent === 'ME')) {
    assertEquals(e.sets, rowsOf(probe).find((x) => x.name === e.name)!.sets, `${e.name}'s heavy count moved`);
  }
});

Deno.test('the earned count reaches only the weeks from `earnedSetsFromWeek` — the live week keeps its count', () => {
  const probe = composeWeek({ ...BASE, week: 6, column: 'standard' } as never);
  const row = hypRow(probe);
  const key = earnedSetsKey(row.name, 'HYP');
  const live = composeWeek({ ...BASE, week: 6, column: 'standard', earnedSetsByMovement: { [key]: { sets: 4, from: null } }, earnedSetsFromWeek: 7 } as never);
  assertEquals(rowsOf(live).find((e) => e.name === row.name)!.sets, row.sets, 'the live week took the earned count');
  assertEquals(rowsOf(live).find((e) => e.name === row.name)!.sets_line, undefined, 'the live week carries the line');
});

Deno.test('the muscle chip\'s fourth HYP set is the floor: earned never goes below it, the chip never above the band', () => {
  const dialled = composeWeek({ ...BASE, week: 4, column: 'standard', dial: ['chest', 'back', 'shoulders', 'quads', 'hamstrings', 'glutes', 'arms', 'calves', 'core'] } as never);
  const four = rowsOf(dialled).find((e) => e.slot_intent === 'HYP' && e.sets === bandOf('HYP').sets.hi);
  assert(four, 'the dial lifted no HYP row to four in the fixture week');
  const key = earnedSetsKey(four!.name, 'HYP');
  const dropped = composeWeek({
    ...BASE, week: 4, column: 'standard', dial: ['chest', 'back', 'shoulders', 'quads', 'hamstrings', 'glutes', 'arms', 'calves', 'core'],
    earnedSetsByMovement: { [key]: { sets: 3, from: 4 } },
  } as never);
  const still = rowsOf(dropped).find((e) => e.name === four!.name)!;
  assertEquals(still.sets, bandOf('HYP').sets.hi, 'a setback took the row under the chip\'s floor');
  assertEquals(still.sets_line, undefined, 'a count that did not move on the row printed a line');
});

Deno.test('a swapped-in movement starts at the low end — the count is on the movement, not the slot', () => {
  const probe = composeBlock({ ...BASE, weeks: 4, taperWeeks: [] } as never);
  const row = probe.flatMap((w) => w.setRows).find((r) => r.intent === 'HYP');
  assert(row, 'no HYP row in the fixture block');
  // two clean sessions logged under a DIFFERENT movement name — the row's own movement has no history
  const logged = [row!, row!].map((r, i) => ({
    week_number: r.week + i, date: dateOn(r.day),
    strength_exercises: [{ name: 'Some Other Movement', sets: Array(r.sets).fill({ reps: bandOf('HYP').reps.hi, rir: 1, completed: true }) }],
  }));
  const read = earnedMeSets({ composed: probe, logged, throughWeek: 4 });
  assertEquals(read.setsByMovement[earnedSetsKey(row!.movement, 'HYP')], undefined, 'a session under another name counted for this movement');
  assertEquals(Object.keys(read.setsByMovement).length, 0);
});

// ── THE COMPOSED BLOCK: an All Rounder on the minimum kit with a synthetic six-week log ──────────

function syntheticLog(probe: ComposedWeek[], throughWeek: number) {
  // every DE, SKILL and HYP row in weeks 1-6, every set at the band top with the reserve on target
  return probe.flatMap((wk) => wk.setRows.filter((r) => r.week <= throughWeek).map((r) => ({
    week_number: r.week,
    date: dateOn(r.day),
    strength_exercises: [{
      name: r.movement,
      sets: Array(r.sets).fill({ reps: bandOf(r.intent).reps.hi, rir: bandOf(r.intent).rir!.lo, completed: true, weight: 50 }),
    }],
  })));
}

Deno.test('⛔ the All Rounder on the minimum kit: weeks 7-12 carry the earned counts, the live week does not change, the line appears once', () => {
  const LIVE = 6;
  const probe = composeBlock({ ...BASE, weeks: 12, taperWeeks: [11, 12] } as never);
  assert(probe.flatMap((w) => w.setRows).length > 30, 'the composer reported almost no DE/SKILL/HYP rows');
  const read = earnedMeSets({ composed: probe, logged: syntheticLog(probe, LIVE), throughWeek: LIVE });
  const keys = Object.keys(read.setsByMovement);
  assert(keys.length >= 6, `six weeks of clean sessions earned on only ${keys.length} movements`);
  // every intent moved: a HYP movement seen twice is at 4, a SKILL at 4 or 5, a DE at 5 or 6
  for (const key of keys) {
    const intent = key.split('|')[1] as ViadaIntent;
    const band = bandOf(intent).sets;
    const n = read.setsByMovement[key];
    assert(n >= band.lo && n <= band.hi, `${key} earned ${n}, outside ${band.lo}-${band.hi}`);
    const sessions = read.setHistory[key].length;
    if (sessions >= ME_CLEAN_SESSIONS_TO_EARN) assert(n > band.lo, `${key}: ${sessions} clean sessions earned nothing`);
  }
  // ⛔ AND THE ME LADDER READ NOTHING IT SHOULD NOT — no heavy session was logged.
  assertEquals(read.sets, {});

  const earned = Object.fromEntries(keys.map((k) => [k, { sets: read.setsByMovement[k], from: null }]));
  const rebuilt = composeBlock({ ...BASE, weeks: 12, taperWeeks: [11, 12], earnedSetsByMovement: earned, earnedSetsFromWeek: LIVE + 1 } as never);

  let lines = 0;
  const lineKeys = new Set<string>();
  let carried = 0;
  for (const wk of rebuilt) {
    const before = probe.find((p) => p.week === wk.week)!;
    for (const s of wk.sessions.filter((x) => x.type === 'strength')) {
      const was = before.sessions.find((x) => x.type === 'strength' && x.day === s.day && x.name === s.name)!;
      for (const ex of s.strength_exercises ?? []) {
        const old = (was.strength_exercises ?? []).find((e) => e.name === ex.name);
        if (!old || typeof ex.sets !== 'number') continue;
        const key = earnedSetsKey(ex.name, String(ex.slot_intent ?? ''));
        if (wk.week <= LIVE) {
          assertEquals(ex.sets, old.sets, `week ${wk.week} ${ex.name}: the live week or history changed`);
          assertEquals(ex.sets_line, undefined, `week ${wk.week} ${ex.name} carries a line before the counts reach`);
          continue;
        }
        if (ex.slot_intent === 'ME') { assertEquals(ex.sets, old.sets, `${ex.name}'s heavy count moved`); continue; }
        if (earned[key]) {
          const band = bandOf(ex.slot_intent as ViadaIntent).sets;
          assertEquals(ex.sets, Math.min(band.hi, Math.max(band.lo, earned[key].sets)), `week ${wk.week} ${ex.name} did not carry its earned count`);
          carried += 1;
        }
        if (typeof ex.sets_line === 'string') {
          lines += 1;
          assert(!lineKeys.has(key), `${key} said its line twice`);
          lineKeys.add(key);
          assertEquals(ex.sets_line, ex.sets > (old.sets as number) ? SETS_LINE_UP(ex.sets) : SETS_LINE_DOWN(ex.sets));
        }
      }
    }
  }
  assert(carried >= keys.length, `the earned counts reached ${carried} rows`);
  assertEquals(lines, keys.length, 'one line per movement whose count moved, no more, no fewer');

  // ⛔ THEN GONE: the next rebuild with the calendar already at the earned count prints no line.
  const same = Object.fromEntries(keys.map((k) => [k, { sets: read.setsByMovement[k], from: read.setsByMovement[k] }]));
  const again = composeBlock({ ...BASE, weeks: 12, taperWeeks: [11, 12], earnedSetsByMovement: same, earnedSetsFromWeek: LIVE + 1 } as never);
  assertEquals(again.flatMap(rowsOf).filter((e) => typeof e.sets_line === 'string').length, 0);

  // ⛔ THE RESTATER CARRIES THE COUNT AND THE LINE TO THE CALENDAR, and takes the line off again.
  const planned = probe.flatMap((wk) => wk.sessions.filter((s) => s.type === 'strength').map((s, i) => ({
    id: `${wk.week}-${i}`, week_number: wk.week, date: dateOn(s.day), strength_exercises: s.strength_exercises,
  })));
  const restated = restateFromTest({ composed: rebuilt, planned, afterWeek: 2 });
  const setChanges = restated.changes.filter((c) => c.sets && c.week > LIVE);
  assert(setChanges.length >= keys.length, `the restater proposed ${setChanges.length} set changes`);
  assertEquals(restated.changes.filter((c) => c.sets && c.week <= LIVE).length, 0, 'a set change landed on the live week or history');
  const onCalendar = restated.rows.flatMap((r) => r.strength_exercises).filter((e) => typeof e.sets_line === 'string');
  assertEquals(onCalendar.length, keys.length, 'the line did not reach the calendar once per movement');
  const withLines = planned.map((p) => {
    const r = restated.rows.find((x) => x.id === p.id);
    return r ? { ...p, strength_exercises: r.strength_exercises } : p;
  });
  const cleared = restateFromTest({ composed: again, planned: withLines, afterWeek: 2 });
  const stillThere = cleared.rows.flatMap((r) => r.strength_exercises).filter((e) => typeof e.sets_line === 'string');
  assertEquals(stillThere.length, 0, 'the line survived the next rebuild');
  // every calendar row that carried a line is rewritten (a day's session can carry two movements' lines)
  const carriedLine = withLines.filter((p) => (p.strength_exercises ?? []).some((e) => typeof e.sets_line === 'string')).map((p) => p.id);
  assert(carriedLine.length > 0, 'no calendar row carried a line');
  for (const id of carriedLine) assert(cleared.rows.some((r) => r.id === id), `row ${id} kept its line`);
});

// ── A LIFT SWAP: the count follows the movement the athlete did ──────────────────────────────────

/** A plan date for every block week's weekday: week 1 opens on Monday 2026-01-05. */
const slotDate = (week: number, day: string): string => {
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return new Date(Date.parse('2026-01-04T00:00:00Z') + ((week - 1) * 7 + names.indexOf(day)) * 86400000).toISOString().slice(0, 10);
};

/**
 * A HYP row whose name is not a substring of, or contains, another row's name on the same day. `resolveLiftSwap`
 * matched names by substring until 2026-09-25 (now `sameLift`, canonical equality); the fixture stayed clear of that
 * and still does, so it proves the swap plumbing and not the name rule — the DB Bench Press fixture below proves that.
 */
function standsAlone(probe: ComposedWeek[]): { week: number; day: string; movement: string; intent: 'DE' | 'SKILL' | 'HYP'; sets: number } {
  for (const wk of probe) {
    if (wk.week < 2) continue;
    const names = [...wk.setRows.map((r) => ({ day: r.day, name: canonicalize(r.movement) })), ...wk.meRows.map((r) => ({ day: r.day, name: canonicalize(r.movement) }))];
    for (const r of wk.setRows) {
      if (r.intent !== 'HYP') continue;
      const me = canonicalize(r.movement);
      const clash = names.some((n) => n.day === r.day && n.name !== me && (n.name.includes(me) || me.includes(n.name)));
      if (!clash) return r;
    }
  }
  throw new Error('no HYP row stands alone on its day');
}

Deno.test('⛔ a rest-of-plan swap: two clean sessions on the substitute earn on the substitute, and the composed row takes its count', () => {
  const probe = composeBlock({ ...BASE, weeks: 6, taperWeeks: [] } as never);
  const rows = probe.flatMap((w) => w.setRows).filter((r) => r.intent === 'HYP');
  const first = standsAlone(probe);
  const same = rows.filter((r) => canonicalize(r.movement) === canonicalize(first.movement) && r.week >= first.week).slice(0, 2);
  assert(same.length === 2, 'the fixture movement does not appear twice in the block');
  const SUB = 'Cable Fly';
  // the swap row exactly as `swap-session` writes it: the planned name, the substitute, open-ended from the first session's plan day
  const liftSwaps = [{ exercise_name: first.movement, substitute_exercise_name: SUB, applies_from: slotDate(first.week, first.day), status: 'active' }];
  // the athlete's log, as materialize-plan's expansion had already renamed the row: logged under the substitute, no declaration
  const logged = same.map((r) => ({
    week_number: r.week, date: dateOn(r.day),
    strength_exercises: [{ name: SUB, sets: Array(r.sets).fill({ reps: bandOf('HYP').reps.hi, rir: 1, completed: true }) }],
  }));
  const blind = earnedMeSets({ composed: probe, logged, throughWeek: 6 });
  assertEquals(Object.keys(blind.setsByMovement).length, 0, 'without the swap the sessions were matched — the fixture proves nothing');
  const read = earnedMeSets({ composed: probe, logged, throughWeek: 6, liftSwaps, dateOfSlot: slotDate });
  const subKey = earnedSetsKey(SUB, 'HYP');
  const origKey = earnedSetsKey(first.movement, 'HYP');
  assertEquals(read.setsByMovement[subKey], bandOf('HYP').sets.lo + 1, 'two clean sessions on the substitute earned nothing');
  assertEquals(read.setsByMovement[origKey], undefined, 'the count was stored under the original, not the movement done');
  assertEquals(read.composedAliases[origKey], subKey);
  // the composed row is still the original name; handed the substitute's count under its own key, it carries it
  const earned = { [subKey]: { sets: read.setsByMovement[subKey], from: null }, [origKey]: { sets: read.setsByMovement[subKey], from: null } };
  const rebuilt = composeBlock({ ...BASE, weeks: 6, taperWeeks: [], earnedSetsByMovement: earned, earnedSetsFromWeek: same[1].week + 1 } as never);
  const later = rebuilt.filter((w) => w.week > same[1].week).flatMap(rowsOf).filter((e) => canonicalize(e.name) === canonicalize(first.movement));
  assert(later.length > 0, 'the movement does not appear after the live week');
  for (const e of later) assertEquals(e.sets, bandOf('HYP').sets.lo + 1, `week row ${e.name} did not take the substitute's count`);
  // ⛔ AND THE ORIGINAL, UN-SWAPPED LATER, HAS ONLY ITS OWN HISTORY — none here, so the low end.
  const unswapped = earnedMeSets({ composed: probe, logged, throughWeek: 6, liftSwaps: [{ ...liftSwaps[0], status: 'reverted' }], dateOfSlot: slotDate });
  assertEquals(unswapped.setsByMovement[origKey], undefined);
});

Deno.test('⛔ the tap-day swap and a typed rename reach the log as `substituted_for` — matched through it, kept under the name done', () => {
  const probe = composeBlock({ ...BASE, weeks: 6, taperWeeks: [] } as never);
  const rows = probe.flatMap((w) => w.setRows).filter((r) => r.intent === 'HYP');
  const first = standsAlone(probe);
  const same = rows.filter((r) => canonicalize(r.movement) === canonicalize(first.movement) && r.week >= first.week).slice(0, 2);
  const SUB = 'Cable Fly';
  const logged = same.map((r) => ({
    week_number: r.week, date: dateOn(r.day),
    strength_exercises: [{ name: SUB, substituted_for: first.movement, sets: Array(r.sets).fill({ reps: bandOf('HYP').reps.hi, rir: 1, completed: true }) }],
  }));
  const read = earnedMeSets({ composed: probe, logged, throughWeek: 6 });
  assertEquals(read.setsByMovement[earnedSetsKey(SUB, 'HYP')], bandOf('HYP').sets.lo + 1);
  assertEquals(read.composedAliases[earnedSetsKey(first.movement, 'HYP')], earnedSetsKey(SUB, 'HYP'));
});

Deno.test('⛔ an ME row swapped the same way still moves the ME ladder; the bar ladder does not walk the other bar', () => {
  const probe = composeBlock({ ...BASE, weeks: 6, taperWeeks: [] } as never);
  const me = probe.flatMap((w) => w.meRows).filter((r) => r.movement === 'Bench Press' && r.weight != null).slice(0, 3);
  assert(me.length === 3, 'the fixture has fewer than three priced bench rows');
  const SUB = 'Incline Bench Press';
  const liftSwaps = [{ exercise_name: 'Bench Press', substitute_exercise_name: SUB, applies_from: slotDate(me[0].week, me[0].day), status: 'active' }];
  const logged = me.map((r) => ({
    week_number: r.week, date: dateOn(r.day),
    // the substitute's own weight, well under the bench's number — a load test against the bench would call every one a miss
    strength_exercises: [{ name: SUB, sets: [{ reps: 5, weight: 95, completed: true }] }],
  }));
  assertEquals(earnedMeSets({ composed: probe, logged, throughWeek: 6 }).sets, {}, 'without the swap the sessions were matched');
  const read = earnedMeSets({ composed: probe, logged, throughWeek: 6, liftSwaps, dateOfSlot: slotDate });
  assertEquals(read.sets.push_upper, 2, 'three clean sessions on the swapped heavy row did not earn a second set');
  assertEquals(read.history.push_upper!.map((h) => h.outcome), ['clean', 'clean', 'clean']);
  assertEquals(read.history.push_upper!.every((h) => h.movement === SUB), true);
  assertEquals(read.bar, {}, 'a jump was earned on another bar');
  assertEquals(read.lastReps, {}, 'the substitute\'s reps became the bench\'s opening reps');
  // the three logged sessions were read; the bench rows nobody logged stay unread, as they always did
  const benchRows = probe.flatMap((w) => w.meRows).filter((r) => r.movement === 'Bench Press' && r.weight != null && r.week <= 6).length;
  assertEquals(read.unread, earnedMeSets({ composed: probe, logged: [], throughWeek: 6 }).unread - 3);
  assert(benchRows >= 3);
});

Deno.test('⛔ a swap names one movement: DB Bench Press → Floor Press leaves that day\'s Bench Press alone, and the ladder reads the Floor Press log against the DB row', () => {
  const probe = composeBlock({ ...BASE, weeks: 6, taperWeeks: [] } as never);
  const db = probe.flatMap((w) => w.setRows).filter((r) => canonicalize(r.movement) === canonicalize('DB Bench Press') && r.week >= 2).slice(0, 2);
  assert(db.length === 2, 'the fixture has no DB Bench Press row twice');
  const benchSameDay = probe.find((w) => w.week === db[0].week)!.meRows.find((r) => r.day === db[0].day && r.movement === 'Bench Press');
  assert(benchSameDay, 'the fixture day has no Bench Press beside the DB Bench Press');
  const liftSwaps = [{ exercise_name: 'DB Bench Press', substitute_exercise_name: 'Floor Press', applies_from: slotDate(db[0].week, db[0].day), status: 'active' }];
  const row = { date: slotDate(db[0].week, db[0].day) };
  // the resolver, as materialize-plan calls it at expansion: the DB row becomes Floor Press, the barbell row stays
  assertEquals(resolveLiftSwap('db bench press', liftSwaps, row), 'Floor Press');
  assertEquals(resolveLiftSwap('Bench Press', liftSwaps, row), null);
  assertEquals(resolveLiftSwap('Incline Bench Press', liftSwaps, row), null);
  assertEquals(sameLift('DB Bench Press', 'db bench press'), true);
  assertEquals(sameLift('Bench Press', 'db bench press'), false);
  // the ladder: two clean Floor Press sessions earn on the DB row's slot, kept under Floor Press; the bench is untouched
  const logged = db.map((r) => ({
    week_number: r.week, date: dateOn(r.day),
    strength_exercises: [{ name: 'Floor Press', sets: Array(r.sets).fill({ reps: bandOf('HYP').reps.hi, rir: 1, completed: true }) }],
  }));
  const read = earnedMeSets({ composed: probe, logged, throughWeek: 6, liftSwaps, dateOfSlot: slotDate });
  assertEquals(read.setsByMovement[earnedSetsKey('Floor Press', 'HYP')], bandOf('HYP').sets.lo + 1);
  assertEquals(read.composedAliases[earnedSetsKey('DB Bench Press', 'HYP')], earnedSetsKey('Floor Press', 'HYP'));
  assertEquals(read.sets, {}, 'the bench beside it moved');
  assertEquals(read.history.push_upper, undefined, 'a Floor Press session was read as the bench');
});

Deno.test('the block description carries the set paragraph once, as approved', () => {
  const probe = composeBlock({ ...BASE, weeks: 12, taperWeeks: [11, 12] } as never);
  const description = blockDescriptionFor(probe, 12);
  assertEquals(description.split(SETS_EARNED_PARAGRAPH).length - 1, 1, description);
  assertEquals(SETS_EARNED_PARAGRAPH, 'Every exercise starts at the low end of its set range. Two sessions at the top of the rep range add a set, up to its cap. One session under the range takes one off. The row shows the count.');
  assertEquals(SETS_LINE_UP(4), 'Up to 4 sets. You hit the top of the range two sessions in a row.');
  assertEquals(SETS_LINE_DOWN(3), 'Back to 3 sets. Last session came in under the range.');
});

Deno.test('the reader matches the stored row\'s label to the composer\'s movement (case only)', () => {
  const probe = composeBlock({ ...BASE, weeks: 3, taperWeeks: [] } as never);
  const row = probe.flatMap((w) => w.setRows).find((r) => r.intent === 'HYP')!;
  const stored = rowsOf(probe.find((w) => w.week === row.week)!).find((e) => canonicalize(e.name) === canonicalize(row.movement))!;
  assert(stored, 'the set index names a movement no row prints');
  const logged = [{
    week_number: row.week, date: dateOn(row.day),
    strength_exercises: [{ name: stored.name, sets: Array(row.sets).fill({ reps: bandOf('HYP').reps.hi, rir: 1, completed: true }) }],
  }];
  const read = earnedMeSets({ composed: probe, logged, throughWeek: 3 });
  assertEquals(read.setHistory[earnedSetsKey(row.movement, 'HYP')]?.length, 1, 'a session logged under the row\'s printed name was not matched');
});

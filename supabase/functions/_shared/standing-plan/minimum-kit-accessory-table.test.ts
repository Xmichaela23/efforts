// ============================================================================
// THE MINIMUM KIT, AND THE ACCESSORY TABLE (2026-09-24, docs/WORKORDER-minimum-kit-and-accessory-table-2026-09-24.md).
//
//   ~/.deno/bin/deno test --no-check --sloppy-imports --allow-read supabase/functions/_shared/standing-plan/minimum-kit-accessory-table.test.ts
//
// Part A: every declared kit is barbell + plates, rack, bench, dumbbells and a pull-up bar, plus the extras the chips
// name; the picker names only extras. Part B, one test per row: (1) no superset holds two barbell movements; (2) the
// floor back extension is deleted; (3) the nordic is off the hamstring row; (4) the trap bar deadlift only with a
// trap bar; (5) the arms pair on a dumbbell kit is DB Skull Crusher + Dumbbell Curl, the drag curl barbell only;
// (6) the split squat reads "each"; (7) the stored name follows the movement (the rear delt fly); (8) the
// chest-supported row logs total on the machine. Then Part C's "every row performable on the minimum kit".
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeBlock, composeWeek } from './compose.ts';
import { defaultViadaPicks, flattenViadaPicks, normalizeViadaPrefs, pickOptions } from './accessory-picks.ts';
import { displayFormatOnKit, executionMovement, executionName, implementOnKit, usesTwoDumbbellsOnKit } from '../strength-grid/grid.ts';
import { FILING, filingOf } from '../strength-grid/taxonomy.ts';
import { ASSISTANCE_GEAR, athleteEquipmentToKeys, barIsTheLoad, canPerform, MINIMUM_KIT_KEYS } from '../../../../src/lib/strength-gear.ts';
import { EXERCISE_CONFIG, resolveExerciseConfig, SAME_MOVEMENT } from '../../../../src/lib/exercise-config.ts';
import { PLAN_WRITER_VERSION } from '../plan-refresh.ts';
import { DEADLIFT_FORMS, DEADLIFT_FORM_LABEL, deadliftFormOf, readTestWeek } from './working-number.ts';
import { testWeekLiftNames } from './compose.ts';
import { defaultCompetitionLifts } from './frame-resolver.ts';
import { defaultBarKeyFor } from '../../../../src/lib/strength-gear.ts';
import { barLbForExercise } from '../workload.ts';
import { deadliftFormRow } from './setup-readout.ts';
import { canonicalize } from '../canonicalize.ts';
import { swapGroupsFor } from './swap-groups.ts';

const MIN = ['Home gym'];
const GYM = ['Commercial gym'];
const FRAMES = ['all_rounder', 'hyp_5k', 'cycling_base', 'strength_half'] as const;
const LIFTS = { push_upper: 'Bench Press', press_lower: 'Back Squat', hinge_lower: 'Deadlift' };
const tested = (lift: string, oneRm: number, weight: number, reps: number) => ({
  lift, predicted1RM: oneRm, workingNumber: oneRm * 0.96, measured: { weight, reps }, cite: 'test fixture',
});

type Row = { name: string; execution_name?: string; source_row?: string; superset_group?: string; swap_options?: { name: string }[] };
type Built = { week: number; day: string; session: string; row: Row };
/** Every strength row of a 12-week block, the wizard's zero-touch path (`defaultViadaPicks` → `normalizeViadaPrefs`). */
function block(frame: (typeof FRAMES)[number], kit: string[]): Built[] {
  const defaults = defaultViadaPicks(kit, [], frame);
  const prefs = normalizeViadaPrefs({ version: 1, picks: defaults, dial: [], dial_rows: {} } as never, kit, frame);
  const slotPicks = prefs ? prefs.picks : defaults;
  const accessoryPicks = prefs ? flattenViadaPicks(prefs) : [];
  const weeks = composeBlock({
    frame, competitionLifts: LIFTS, seed1RMs: { bench: 150, squat: 185, deadlift: 225, overheadPress: 100 },
    workingNumbers: {
      bench: tested('bench', 155, 130, 7), squat: tested('squat', 190, 165, 5),
      deadlift: tested('deadlift', 230, 200, 5), overheadPress: tested('overheadPress', 105, 85, 8),
    },
    equipment: kit, roundTo: 5, slotPicks, ...(accessoryPicks.length ? { accessoryPicks } : {}),
    baselines: { performance_numbers: { ftp: 250 } }, weeks: 12, taperWeeks: [],
  } as never);
  const out: Built[] = [];
  for (const w of weeks) for (const s of w.sessions) {
    if (s.type !== 'strength') continue;
    for (const e of (s.strength_exercises ?? []) as Row[]) out.push({ week: w.week, day: String((s as { day?: string }).day ?? ''), session: s.name, row: e });
  }
  return out;
}
const shown = (r: Row) => r.execution_name ?? r.name;

// ── Part A ─────────────────────────────────────────────────────────────────────────────────────

Deno.test('⛔ PART A — every declared kit is the minimum plus its extras; an empty list is still "not asked"', () => {
  assertEquals([...athleteEquipmentToKeys(['Home gym'])].sort(), [...MINIMUM_KIT_KEYS].sort());
  assertEquals([...athleteEquipmentToKeys(['Kettlebells'])].sort(), [...MINIMUM_KIT_KEYS, 'kettlebell'].sort());
  // No chip grants the trap bar (2026-09-25): it is a form of the deadlift, chosen on the lift.
  assertEquals([...athleteEquipmentToKeys(['Trap bar'])].sort(), [...MINIMUM_KIT_KEYS].sort());
  // A stored list from before this date reads the same: minimum ∪ stored, nothing to migrate.
  assertEquals([...athleteEquipmentToKeys(['Barbell + plates', 'Dumbbells'])].sort(), [...MINIMUM_KIT_KEYS].sort());
  assertEquals(athleteEquipmentToKeys([]).size, 0);
  for (const k of MINIMUM_KIT_KEYS) assert(athleteEquipmentToKeys(GYM).has(k), `a commercial gym lacks ${k}`);
  assert(!athleteEquipmentToKeys(GYM).has('trap_bar'), 'a commercial gym granted the trap bar — it is a form, not a chip');
  // The competition lifts are performable on the minimum by construction.
  for (const n of ['Bench Press', 'Back Squat', 'Deadlift', 'Overhead Press', 'Pull Up']) assert(canPerform(n, MIN), n);
});

Deno.test('⛔ PART A — the picker names only extras, and the minimum line is the owner\'s words', async () => {
  const src = await Deno.readTextFile(new URL('../../../../src/components/TrainingBaselines.tsx', import.meta.url));
  const list = src.slice(src.indexOf('export const HOME_GYM_EQUIPMENT_OPTIONS'), src.indexOf('];', src.indexOf('export const HOME_GYM_EQUIPMENT_OPTIONS')));
  for (const chip of ['"Barbell + plates"', '"Dumbbells"', '"Squat rack / Power cage"', '"Bench (flat/adjustable)"', '"Pull-up bar"']) {
    assert(!list.includes(chip), `${chip} is still a chip — it is the minimum, not an extra`);
  }
  assert(!list.includes('"Trap bar"'), 'the trap bar is a chip — it is a form of the deadlift (2026-09-25)');
  assert(src.includes(`EQUIPMENT_MINIMUM_LINE = "You'll need a barbell and plates, a rack, a bench and dumbbells."`), 'the minimum line is not the approved words');
  assert(src.includes("HOME_GYM_MARKER = 'Home gym'"), 'the home-gym marker is gone');
});

// ── Part B ─────────────────────────────────────────────────────────────────────────────────────

Deno.test('⛔ B1 — no superset ever holds two barbell movements, on either kit, any frame, any week', () => {
  let pairs = 0;
  for (const frame of FRAMES) for (const kit of [MIN, GYM]) {
    const groups = new Map<string, Built[]>();
    for (const b of block(frame, kit)) if (b.row.superset_group) {
      const k = `${b.week}|${b.day}|${b.row.superset_group}`;
      groups.set(k, [...(groups.get(k) ?? []), b]);
    }
    for (const [k, rows] of groups) {
      pairs++;
      const onBar = rows.filter((b) => implementOnKit(b.row.name, kit) === 'barbell');
      assert(onBar.length < 2, `${frame} @ ${kit.join('+')} ${k}: ${rows.map((b) => shown(b.row)).join(' + ')}`);
    }
  }
  assert(pairs >= 100, `only ${pairs} supersets seen`);
  // The lower superset on the minimum kit: the bench reverse hyper (p220, on the bench with a dumbbell) beside the
  // front squat (p219) — a dumbbell hinge and a barbell squat.
  const ar = block('all_rounder', MIN).filter((b) => b.week === 2 && /braced hinge/i.test(String(b.row.source_row)));
  assertEquals(ar.map((b) => shown(b.row)), ['Weighted Reverse Hyper', 'Front Squat', 'Weighted Reverse Hyper', 'Front Squat']);
  // And the picker offers the DB Romanian deadlift for the hinge half.
  const hinge = pickOptions('braced_hinge', MIN, 'hamstrings', ['reverse hyperextension', 'reverse hyper', 'weighted reverse hyper']).map((o) => o.name);
  assert(hinge.includes('db romanian deadlift'), `braced hinge on the minimum offers ${hinge.join(', ')}`);
  assert(!hinge.includes('back extension'), 'the floor back extension is still offered');
});

Deno.test('⛔ B2 — the floor back extension is deleted, and the name means the bench movement', () => {
  assertEquals('back extension' in ASSISTANCE_GEAR, false);
  assertEquals('back extension' in FILING, false);
  assertEquals('back extension' in EXERCISE_CONFIG, false);
  assertEquals(SAME_MOVEMENT['back extension'], 'ghd back extension');
  assertEquals(resolveExerciseConfig('Back Extension').matchedKey, 'ghd back extension');
  assertEquals(filingOf('Back Extension')?.cite, 'p222');
  // Reachable only with the back extension bench extra or a commercial gym; the shown name is the lifter's.
  assertEquals(canPerform('ghd back extension', MIN), false);
  assertEquals(canPerform('ghd back extension', [...MIN, 'Back extension bench']), true);
  assertEquals(executionName('ghd back extension', [...MIN, 'Back extension bench']), 'Back Extension');
  for (const frame of FRAMES) for (const kit of [MIN, GYM]) {
    for (const b of block(frame, kit)) assert(canonicalize(b.row.name) !== canonicalize('back extension'), `${frame} @ ${kit.join('+')} still builds the floor back extension`);
  }
});

Deno.test('⛔ B3 — the nordic is off the hamstring row; the row offers p223\'s movements the kit reaches', () => {
  const admits = ['machine hip thrust', 'smith machine hip thrust', 'hip thrust', 'barbell hip thrust'];
  for (const kit of [MIN, GYM, [...MIN, 'Incline bench'], [...MIN, 'Kettlebells']]) {
    const names = pickOptions('ham_iso', kit, 'hamstrings', admits).map((o) => o.name);
    assert(!names.some((n) => /nordic/i.test(n)), `ham_iso on ${kit.join('+')} offers ${names.join(', ')}`);
  }
  // The barbell hip thrust leads on the minimum kit (follow-up 1, 2026-09-25): filed as p223's variant, named for its
  // implement, on the bar. On the gym the machine is his and stays.
  assertEquals(pickOptions('ham_iso', MIN, 'hamstrings', admits).map((o) => o.name), ['barbell hip thrust', 'leg curl']);
  assertEquals(pickOptions('ham_iso', GYM, 'hamstrings', admits)[0].name, 'machine hip thrust');
  assertEquals(filingOf('barbell hip thrust')?.basis, 'variant');
  assertEquals(barIsTheLoad('Barbell Hip Thrust', MIN), true, 'the barbell hip thrust draws the bar');
  assertEquals(defaultBarKeyFor('Barbell Hip Thrust'), 'standard');
  for (const b of block('all_rounder', MIN)) {
    if (/focused hamstring/i.test(String(b.row.source_row))) assertEquals(shown(b.row), 'Barbell Hip Thrust', `week ${b.week}`);
  }
  for (const b of block('all_rounder', GYM)) {
    if (/focused hamstring/i.test(String(b.row.source_row))) assertEquals(shown(b.row), 'Machine Hip Thrust', `week ${b.week}`);
  }
  for (const kit of [MIN, GYM]) for (const b of block('cycling_base', kit)) assert(canonicalize(b.row.name) !== canonicalize('hip thrust'), 'the bench-only stand-in is still built');
  for (const kit of [MIN, GYM]) for (const b of block('all_rounder', kit)) assert(!/nordic/i.test(b.row.name), `${kit.join('+')} builds a nordic`);
});

Deno.test('⛔ B4 / follow-up 5 — the trap bar is a form of the deadlift, chosen on the lift; no chip, no accessory', () => {
  assertEquals(ASSISTANCE_GEAR['trap bar deadlift'], [['trap_bar']]);
  for (const kit of [MIN, GYM, [...MIN, 'Trap bar']]) assertEquals(canPerform('Trap Bar Deadlift', kit), false, kit.join('+'));
  const rotating = (kit: string[]) => [...new Set(block('cycling_base', kit)
    .filter((b) => /Accessory: primary hinge lower/i.test(String(b.row.source_row))).map((b) => shown(b.row)))];
  assertEquals(rotating(MIN), ['Sumo Deadlift'], 'the minimum kit falls to p219\'s other printed hinge');
  assertEquals(rotating(GYM), ['Sumo Deadlift'], 'a gym is not handed the trap bar as an accessory either');
  // The form: every row that is "Deadlift" builds and logs as Trap Bar Deadlift — the tested lift, the test week, the
  // working number's name, the ME/DE rotation. The number is not adjusted.
  assertEquals(defaultCompetitionLifts('trap_bar').hinge_lower, 'Trap Bar Deadlift');
  assertEquals(defaultCompetitionLifts().hinge_lower, 'Deadlift');
  assertEquals(deadliftFormOf(defaultCompetitionLifts('trap_bar')), 'trap_bar');
  assertEquals(testWeekLiftNames(defaultCompetitionLifts('trap_bar')).deadlift, 'Trap Bar Deadlift');
  const w = composeWeek({ frame: 'cycling_base', week: 2, column: 'standard', equipment: MIN, roundTo: 5,
    competitionLifts: defaultCompetitionLifts('trap_bar'),
    workingNumbers: { deadlift: tested('deadlift', 230, 200, 5), squat: tested('squat', 190, 165, 5), bench: tested('bench', 155, 130, 7) } } as never);
  const names = w.sessions.filter((s) => s.type === 'strength').flatMap((s) => (s.strength_exercises ?? []) as Row[]).map((r) => canonicalize(r.name));
  assert(names.includes(canonicalize('trap bar deadlift')), `no trap bar deadlift in ${names.join(', ')}`);
  assert(!names.includes(canonicalize('deadlift')) || names.includes(canonicalize('trap bar deadlift')), 'the deadlift rows kept the barbell name');
  const priced = w.sessions.filter((s) => s.type === 'strength').flatMap((s) => (s.strength_exercises ?? []) as (Row & { weight?: unknown })[]).find((r) => canonicalize(r.name) === canonicalize('trap bar deadlift'));
  assert(priced && priced.weight != null, 'the trap bar row carries no number');
  const t1 = composeWeek({ frame: 'cycling_base', week: 1, column: 'standard', equipment: MIN, roundTo: 5, competitionLifts: defaultCompetitionLifts('trap_bar') } as never);
  const testNames = t1.sessions.filter((s) => /^test:/i.test(s.name)).flatMap((s) => (s.strength_exercises ?? []) as Row[]).map((r) => r.name);
  assert(testNames.includes('Trap Bar Deadlift'), `the test week tests ${testNames.join(', ')}`);
  // The test is read under both names, so a form changed mid-block keeps its number.
  const reading = readTestWeek([{ is_test: true, date: '2026-09-01', strength_exercises: [{ name: 'Deadlift', sets: [{ weight: 200, reps: 5, completed: true }] }] }] as never,
    { deadlift: ['Deadlift', 'Trap Bar Deadlift'] });
  assert(reading.working.deadlift, 'the deadlift logged under the old form was not read');
  // The bar: the trap bar's own weight, never the 45 lb bar.
  assertEquals(barIsTheLoad('Trap Bar Deadlift', MIN), true);
  assertEquals(defaultBarKeyFor('Trap Bar Deadlift'), 'trap');
  assertEquals(defaultBarKeyFor('Trap Bar Deadlift', 'kg'), 'trap_kg');
  assertEquals(defaultBarKeyFor('Deadlift'), 'standard');
  assertEquals(defaultBarKeyFor('Dumbbell Curl'), null);
  assertEquals(barLbForExercise('Trap Bar Deadlift'), 60);
  assertEquals(barLbForExercise('Deadlift'), 45);
  // The words: the owner's (2026-09-25).
  assertEquals(DEADLIFT_FORM_LABEL, { barbell: 'Barbell', trap_bar: 'Trap bar' });
  assertEquals(DEADLIFT_FORMS, { barbell: 'Deadlift', trap_bar: 'Trap Bar Deadlift' });
  assertEquals(deadliftFormRow().options.map((o) => o.label), ['Barbell', 'Trap bar']);
  assertEquals(deadliftFormRow().label, 'Deadlift');
});

Deno.test('⛔ B5 — the drag curl is barbell only and the preacher curl station only; the concentration curl is gone', () => {
  assertEquals(ASSISTANCE_GEAR['drag curl'], [['barbell']]);
  assertEquals(ASSISTANCE_GEAR['preacher curl'], [['machine']]);
  assertEquals(canPerform('preacher curl', MIN), false);
  assertEquals(executionName('preacher curl', GYM), 'preacher curl');
  assertEquals(executionName('drag curl', GYM), 'drag curl');
  assertEquals(usesTwoDumbbellsOnKit('drag curl', MIN), false);
  assertEquals(barIsTheLoad('Drag Curl', MIN), true);
  const pull = pickOptions('ar_arms_pull_1', MIN, null, ['dumbbell curl']).map((o) => o.name);
  assert(pull.includes('dumbbell curl') && !pull.includes('preacher curl'), `arms pull on the minimum offers ${pull.join(', ')}`);
  const gymPull = pickOptions('ar_arms_pull_1', GYM, null, ['dumbbell curl']).map((o) => o.name);
  assertEquals(gymPull[0], 'preacher curl');
});

Deno.test('⛔ follow-up 2 — one lunge-pattern movement per day: the quad row beside the asymmetrical row is not a second lunge', () => {
  const lunge = /lunge|split squat/i;
  for (const frame of ['all_rounder', 'hyp_5k'] as const) for (const kit of [MIN, GYM]) {
    const days = new Map<string, Built[]>();
    for (const b of block(frame, kit)) days.set(`${b.week}|${b.day}`, [...(days.get(`${b.week}|${b.day}`) ?? []), b]);
    for (const [k, rows] of days) {
      const lunges = rows.filter((b) => lunge.test(b.row.name));
      assert(lunges.length <= 1, `${frame} @ ${kit.join('+')} ${k}: ${lunges.map((b) => shown(b.row)).join(' + ')}`);
    }
  }
  // p274 day 5 on the minimum kit: p223's quad list needs the station; the goblet squat leads by the owner's ruling
  // (2026-09-25), one dumbbell, no bar; the Zercher squat (p220 printed) stays offered behind it.
  const fri = block('all_rounder', MIN).filter((b) => b.week === 2 && b.day === 'Friday').map((b) => shown(b.row));
  assertEquals(fri, ['Back Squat', 'Weighted Reverse Hyper', 'Front Squat', 'Goblet Squat', 'Reverse Lunge']);
  for (const frame of ['all_rounder', 'hyp_5k'] as const) {
    const quad = block(frame, MIN).find((b) => b.week === 2 && /focused quadriceps/i.test(String(b.row.source_row)))!.row;
    assertEquals(shown(quad), 'Goblet Squat', frame);
    assertEquals(barIsTheLoad(quad.name, MIN), false, 'the goblet squat drew a bar');
    assertEquals(usesTwoDumbbellsOnKit(quad.name, MIN), false, 'one dumbbell, one total');
  }
  const quadOpts = pickOptions('quad_iso', MIN, 'quadriceps', null, true).map((o) => o.name);
  assertEquals(quadOpts[0], 'goblet squat');
  assert(quadOpts.includes('zercher squat'), 'the Zercher squat left the picker');
  assert(pickOptions('quad_iso', MIN, 'quadriceps', null, true).every((o) => !lunge.test(o.name)), 'the reserved row still offers a lunge');
  assert(pickOptions('quad_iso', MIN, 'quadriceps', null, false).some((o) => lunge.test(o.name)), 'the unreserved list lost its lunges');
});

Deno.test('⛔ follow-up 3 — p218\'s barbell row takes the DE secondary pull where the pull-up took the ME row', () => {
  for (const kit of [MIN, GYM]) {
    const thu = block('all_rounder', kit).filter((b) => b.week === 2 && b.day === 'Thursday').map((b) => shown(b.row));
    assertEquals(thu.slice(0, 2), ['Pull Up', 'Barbell Row'], kit.join('+'));
    assert(!thu.includes('Gorilla Row'), 'the gorilla row is still built');
  }
  assertEquals(block('all_rounder', MIN).filter((b) => b.week === 2 && b.day === 'Thursday').map((b) => shown(b.row))[2], 'Kroc Row');
  // hyp_5k has no DE pull row: its pull day is the pull-up (ME), the Kroc row (braced pull) and the arms pair.
  const hyp = block('hyp_5k', MIN).filter((b) => b.week === 2 && b.day === 'Thursday').map((b) => shown(b.row));
  assertEquals(hyp.slice(0, 2), ['Pull Up', 'Kroc Row']);
});

Deno.test('⛔ follow-up 4 — a slot pick is reserved for its cell; the test week\'s Friday reads like every other week', () => {
  for (const day of ['Tuesday', 'Friday']) {
    const rows = (week: number) => block('hyp_5k', MIN).filter((b) => b.week === week && b.day === day).map((b) => shown(b.row));
    if (day === 'Friday') assertEquals(rows(1).slice(1), rows(2).slice(1), 'week 1 differs from week 2');
    if (rows(2).length) {
      assertEquals(rows(2)[1], 'Romanian Deadlift', `${day}: the secondary hinge row`);
      assertEquals(rows(2)[2], 'Weighted Reverse Hyper', `${day}: the superset's hinge half`);
    }
  }
});

Deno.test('⛔ follow-up 6 — the three two-dumbbell rows are filed per hand; the numbers are the pair\'s', () => {
  for (const n of ['skull crusher', 'arnold press', 'gorilla row']) assertEquals(resolveExerciseConfig(n).config?.displayFormat, 'perHand', n);
  assertEquals(resolveExerciseConfig('arnold press').config?.ratioIsTotal, true);
  assertEquals(resolveExerciseConfig('gorilla row').config?.ratioIsTotal, true);
  assertEquals(displayFormatOnKit('gorilla row', MIN), 'perHand');
  for (const n of ['Skull Crusher', 'Arnold Press', 'Gorilla Row']) assertEquals(usesTwoDumbbellsOnKit(n, MIN), true, n);
});

Deno.test('⛔ B6 — the split squat logs per hand on a dumbbell kit', () => {
  assertEquals(usesTwoDumbbellsOnKit('split squat', MIN), true);
  assertEquals(usesTwoDumbbellsOnKit('Split Squat', GYM), true);
  assertEquals(barIsTheLoad('Split Squat', MIN), false);
  assertEquals(usesTwoDumbbellsOnKit('split squat', null), false, 'an undeclared kit is told nothing');
});

Deno.test('⛔ B7 — the stored name follows the movement: the rear delt fly on a dumbbell kit, his machine where it is', () => {
  assertEquals(executionMovement('rear delt machine', MIN), 'rear delt fly');
  assertEquals(executionMovement('rear delt machine', [...MIN, 'Incline bench']), 'rear delt machine', 'chest-supported on the incline is an implement change only');
  assertEquals(executionMovement('rear delt machine', GYM), 'rear delt machine');
  assertEquals(executionMovement('rear delt machine', null), 'rear delt machine');
  assertEquals(executionMovement('chest supported row', MIN), 'chest supported row', 'implement-only renames keep his name');
  const focusedPull = (kit: string[]) => block('all_rounder', kit).find((b) => b.week === 2 && /^1 x HYP: focused pull$/i.test(String(b.row.source_row)))!.row;
  const home = focusedPull(MIN);
  assertEquals(canonicalize(home.name), canonicalize('rear delt fly'));
  assertEquals(home.execution_name, 'Bent-Over Dumbbell Rear Delt Fly');
  assert(!(home.swap_options ?? []).some((o) => canonicalize(o.name) === canonicalize('rear delt machine')), 'the Swap sheet lists the machine');
  assert((home.swap_options ?? []).some((o) => canonicalize(o.name) === canonicalize('rear delt fly')), 'the Swap sheet does not list the row');
  const incline = focusedPull([...MIN, 'Incline bench']);
  assertEquals(canonicalize(incline.name), canonicalize('rear delt machine'));
  assertEquals(incline.execution_name, 'Chest-Supported Rear Delt Fly');
  const gym = focusedPull(GYM);
  assertEquals(canonicalize(gym.name), canonicalize('rear delt machine'));
  assertEquals(gym.execution_name, undefined);
  // The logger's Swap sheet lists the movement the kit does, and never the row itself under the machine's name.
  const sheet = swapGroupsFor('rear delt fly', MIN).flatMap((g) => g.options.map((o) => o.name));
  assert(!sheet.some((n) => canonicalize(n) === canonicalize('rear delt machine')), `the Swap sheet lists the machine: ${sheet.join(', ')}`);
  assert(!sheet.some((n) => canonicalize(n) === canonicalize('rear delt fly')), 'the Swap sheet offers the row to itself');
  // The picker stores the movement the kit does, and the composer honours that pick.
  assertEquals(pickOptions('ar_pull_iso_4', MIN, null, null)[0].name, 'rear delt fly');
  const w = composeWeek({ frame: 'all_rounder', week: 2, column: 'standard', equipment: MIN, roundTo: 5, competitionLifts: LIFTS,
    slotPicks: { ar_pull_iso_4: 'rear delt fly' } } as never);
  const thu = w.sessions.find((s) => s.type === 'strength' && /pull/i.test(s.name))!;
  assert((thu.strength_exercises ?? []).some((e: Row) => canonicalize(e.name) === canonicalize('rear delt fly')), 'the pick stored as the fly was not honoured');
});

Deno.test('⛔ B8 — the chest-supported row logs total on the machine, per hand on the incline bench', () => {
  assertEquals(displayFormatOnKit('chest supported row', GYM), 'total');
  assertEquals(displayFormatOnKit('chest supported row', [...MIN, 'Incline bench']), 'perHand');
  assertEquals(displayFormatOnKit('chest supported row', null), 'perHand');
  assertEquals(displayFormatOnKit('tate press', GYM), 'perHand', 'only a station changes the format');
});

// ── Part C ─────────────────────────────────────────────────────────────────────────────────────

Deno.test('⛔ PART C — every strength row on the minimum kit is performable on the minimum kit, all four frames, 12 weeks', () => {
  let rows = 0;
  for (const frame of FRAMES) for (const b of block(frame, MIN)) {
    rows++;
    assert(canPerform(b.row.name, MIN), `${frame} week ${b.week} ${b.day}: ${shown(b.row)} (${b.row.name}) is not performable on the minimum kit`);
  }
  assert(rows > 900, `only ${rows} rows`);
  assertEquals(PLAN_WRITER_VERSION, 31);
});

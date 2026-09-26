// ⛔ THE EQUIPMENT REBUILD LETS NEW GEAR REACH THE PLAN (owner, live, 2026-09-25: "it's not budging").
//
//   ~/.deno/bin/deno test --no-check --no-lock --sloppy-imports --allow-read --allow-env supabase/functions/_shared/standing-plan/equipment-rebuild-picks.test.ts
//
// A block built on the minimum kit stores the picking screen's defaults; the braced hinge default there is the frame's
// admitted stand-in (Weighted Reverse Hyper, p220). The athlete adds the "Back extension bench" chip and taps Rebuild
// upcoming sessions: the defaulted stand-in gives way to p222's back extension (shown "Back Extension"), from today on;
// the reverse hyper stays in the Swap sheet; a hand pick survives; the same rebuild with no kit change is byte-identical.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { accessoryPicksAfter, picksOnNewKit } from './equipment-rebuild-picks.ts';
import { composeBlock } from './compose.ts';
import { defaultViadaPicks, flattenViadaPicks, normalizeViadaPrefs } from './accessory-picks.ts';
import { restateFromTest } from './restate.ts';
import { slotCellOf, swapGroupsFor } from './swap-groups.ts';
import { canonicalize } from '../canonicalize.ts';

const MIN = ['Home gym'];
const BENCH = ['Home gym', 'Back extension bench'];
const FRAME = 'all_rounder' as const;
const LIFTS = { push_upper: 'Bench Press', press_lower: 'Back Squat', hinge_lower: 'Deadlift' };
const tested = (lift: string, oneRm: number, weight: number, reps: number) => ({
  lift, predicted1RM: oneRm, workingNumber: oneRm * 0.96, measured: { weight, reps }, cite: 'test fixture',
});
type Row = { name: string; execution_name?: string; source_row?: string; swap_options?: { name: string }[]; slot_category?: string; slot_pattern?: string; slot_key?: string; slot_frame?: string };
type Session = { day: string; type: string; strength_exercises?: Row[] };
type Week = { week: number; sessions: Session[] };

function build(kit: string[], slotPicks: Record<string, string>) {
  const prefs = normalizeViadaPrefs({ version: 1, picks: slotPicks, dial: [], dial_rows: {} }, kit, FRAME);
  const accessoryPicks = prefs ? flattenViadaPicks(prefs) : [];
  return composeBlock({
    frame: FRAME, competitionLifts: LIFTS, seed1RMs: { bench: 150, squat: 185, deadlift: 225, overheadPress: 100 },
    workingNumbers: {
      bench: tested('bench', 155, 130, 7), squat: tested('squat', 190, 165, 5),
      deadlift: tested('deadlift', 230, 200, 5), overheadPress: tested('overheadPress', 105, 85, 8),
    },
    equipment: kit, roundTo: 5, slotPicks, ...(accessoryPicks.length ? { accessoryPicks } : {}),
    baselines: { performance_numbers: { ftp: 250 } }, weeks: 12, taperWeeks: [],
  } as never) as unknown as Week[];
}
const stored = defaultViadaPicks(MIN, [], FRAME) as Record<string, string>;
// The braced hinge row itself — its superset partner shares the `source_row`, so the row's own cell picks it out.
const isBracedHinge = (r: Row) => r.slot_category === 'braced' && r.slot_pattern === 'hinge_lower';
const braced = (weeks: Week[]) => weeks.flatMap((w) => w.sessions.filter((s) => s.type === 'strength')
  .flatMap((s) => (s.strength_exercises ?? []).filter(isBracedHinge).map((r) => ({ week: w.week, day: s.day, row: r }))));

Deno.test('⛔ THE DEFAULTED STAND-IN GIVES WAY TO THE CELL\'S PRINTED MOVEMENT ON THE NEW KIT; every other pick stands', () => {
  assertEquals(stored.braced_hinge, 'weighted reverse hyper');
  const out = picksOnNewKit({ stored, chosenKeys: null, builtKit: MIN, currentKit: BENCH, dial: [], frame: FRAME });
  assertEquals(out.changed, [{ key: 'braced_hinge', from: 'weighted reverse hyper', to: 'ghd back extension' }]);
  assertEquals({ ...out.picks, braced_hinge: stored.braced_hinge }, stored);
  // A block that recorded the keys the athlete sent (none): the same answer.
  assertEquals(picksOnNewKit({ stored, chosenKeys: [], builtKit: MIN, currentKit: BENCH, dial: [], frame: FRAME }).changed.length, 1);
  // The flattened list follows.
  const flat = flattenViadaPicks(normalizeViadaPrefs({ version: 1, picks: stored, dial: [], dial_rows: {} }, MIN, FRAME));
  const after = accessoryPicksAfter(flat, out.changed)!;
  assert(after.includes('ghd back extension') && !after.includes('weighted reverse hyper'));
  assertEquals(after.length, flat.length);
});

Deno.test('⛔ THE SAME KIT MOVES NOTHING — the stored picks come back byte-identical, and so does the block', () => {
  const same = picksOnNewKit({ stored, chosenKeys: null, builtKit: MIN, currentKit: MIN, dial: [], frame: FRAME });
  assertEquals(same.changed, []);
  assertEquals(JSON.stringify(same.picks), JSON.stringify(stored));
  assertEquals(JSON.stringify(build(MIN, same.picks)), JSON.stringify(build(MIN, stored)));
  assertEquals(accessoryPicksAfter(['a', 'b'], []), ['a', 'b']);
  // A commercial gym's defaults are printed movements in their cells: nothing on the gym is a stand-in to move.
  const gym = defaultViadaPicks(['Commercial gym'], [], FRAME) as Record<string, string>;
  assertEquals(picksOnNewKit({ stored: gym, chosenKeys: null, builtKit: ['Commercial gym'], currentKit: ['Commercial gym', 'Sled'], dial: [], frame: FRAME }).changed, []);
});

Deno.test('⛔ A RECORDED HAND PICK STAYS; WITH NO RECORD A STAND-IN GIVES WAY AND A PRINTED PICK STAYS', () => {
  // Recorded: the athlete set the braced hinge row (to the default's own value, even) — it stays.
  const recorded = picksOnNewKit({ stored, chosenKeys: ['braced_hinge'], builtKit: MIN, currentKit: BENCH, dial: [], frame: FRAME });
  assertEquals(recorded.changed, []);
  assertEquals(recorded.picks.braced_hinge, 'weighted reverse hyper');
  // No record: a stand-in the athlete may have hand-picked still gives way (the rare case; it stays in Swap).
  const hand = { ...stored, braced_hinge: 'db romanian deadlift' };
  const moved = picksOnNewKit({ stored: hand, chosenKeys: null, builtKit: MIN, currentKit: BENCH, dial: [], frame: FRAME });
  assertEquals(moved.changed, [{ key: 'braced_hinge', from: 'db romanian deadlift', to: 'ghd back extension' }]);
  // No record: a printed cell movement is never moved (a gym's picks on a gym with a sled).
  const gym = defaultViadaPicks(['Commercial gym'], [], FRAME) as Record<string, string>;
  assertEquals(picksOnNewKit({ stored: gym, chosenKeys: null, builtKit: ['Commercial gym'], currentKit: ['Commercial gym', 'Sled'], dial: [], frame: FRAME }).changed, []);
});

Deno.test('⛔ THE OWNER\'S OWN BLOCK STATE (2026-09-25): athlete_equipment already overwritten with the current kit, no record — the stand-in still moves', () => {
  // Block 14288283 after the first rebuild: `athlete_equipment` = current kit (bench chip on), `slot_picks.braced_hinge`
  // still the reverse hyper, no `slot_picks_chosen`, no `built_equipment`.
  const out = picksOnNewKit({ stored, chosenKeys: null, builtKit: BENCH, currentKit: BENCH, dial: [], frame: FRAME });
  assertEquals(out.changed, [{ key: 'braced_hinge', from: 'weighted reverse hyper', to: 'ghd back extension' }]);
  assertEquals({ ...out.picks, braced_hinge: stored.braced_hinge }, stored);
  // And with no stored kit at all.
  assertEquals(picksOnNewKit({ stored, chosenKeys: null, builtKit: null, currentKit: BENCH, dial: [], frame: FRAME }).changed.length, 1);
});

Deno.test('⛔ THE RESTATE REWRITES THE CHANGED SLOT AS A CHANGED MOVEMENT, FROM TODAY ON; done rows and earlier rows untouched', () => {
  const before = build(MIN, stored);
  const moved = picksOnNewKit({ stored, chosenKeys: null, builtKit: MIN, currentKit: BENCH, dial: [], frame: FRAME });
  const after = build(BENCH, moved.picks);
  // The built calendar: week w runs Monday 2026-09-07 + 7(w-1); "today" is Wednesday of week 3 (2026-09-23).
  const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dateOf = (week: number, day: string) => {
    const d = new Date(Date.UTC(2026, 8, 7 + 7 * (week - 1) + ((DAY.indexOf(day) + 6) % 7)));
    return d.toISOString().slice(0, 10);
  };
  const TODAY = dateOf(3, 'Wednesday');
  // The stored rows predate the slot stamps (the owner's block: every row read `{no slot}`), so the restate has to
  // write them as shape onto rows whose movement does not change too.
  const strip = (rows: Row[]) => rows.map(({ slot_category: _c, slot_pattern: _p, slot_key: _k, slot_frame: _f, ...r }) => r);
  const planned = before.flatMap((w) => w.sessions.filter((s) => s.type === 'strength').map((s, i) => ({
    id: `w${w.week}-${s.day}-${i}`, week_number: w.week, date: dateOf(w.week, s.day), type: 'strength',
    // Week 3 Monday was done; everything else is planned.
    workout_status: w.week === 3 && s.day === 'Monday' ? 'completed' : 'planned',
    strength_exercises: strip(JSON.parse(JSON.stringify(s.strength_exercises ?? []))),
  })));
  const oldBraced = braced(before);
  assert(oldBraced.length >= 20 && oldBraced.every((b) => b.row.name === 'Weighted Reverse Hyper'), oldBraced.map((b) => b.row.name).join(','));
  assert(braced(after).every((b) => b.row.name === 'GHD Back Extension' && b.row.execution_name === 'Back Extension'));
  const restated = restateFromTest({ composed: after as never, planned, afterWeek: 1, fromDate: TODAY });
  // The one done session is skipped before it is matched — the restate's own reporting, as it always was.
  assertEquals(restated.unmatched, [{ week: 3, day: 'Monday', reason: 'no materialized row for this day' }]);
  const byId = new Map(restated.rows.map((r) => [r.id, r]));
  let rewritten = 0;
  for (const p of planned) {
    const out = byId.get(p.id);
    // The stored side carries no stamps (stripped above): the braced-hinge row is the reverse hyper in the superset.
    const wasBracedHinge = (r: Row) => /braced hinge/i.test(String(r.source_row)) && canonicalize(r.name) === 'weighted_reverse_hyper';
    const had = (p.strength_exercises as Row[]).filter(wasBracedHinge);
    if (had.length === 0) continue;
    if (p.workout_status === 'completed' || p.date < TODAY) {
      assertEquals(out, undefined, `${p.id} was rewritten`);
      continue;
    }
    assert(out, `${p.id} (${p.date}) not rewritten`);
    const now = (out.strength_exercises as Row[]).filter(isBracedHinge);
    assertEquals(now.length, had.length);
    for (const r of now) {
      assertEquals([r.name, r.execution_name, r.slot_category, r.slot_pattern, r.slot_key, r.slot_frame], ['GHD Back Extension', 'Back Extension', 'braced', 'hinge_lower', 'braced_hinge', 'all_rounder']);
      assertEquals(canonicalize(r.name), 'ghd_back_extension');
      rewritten++;
    }
    // The rest of the session is the composer's row for the same movement — nothing else changed name.
    const otherBefore = (p.strength_exercises as Row[]).filter((r) => !wasBracedHinge(r)).map((r) => r.name);
    const otherAfter = (out.strength_exercises as Row[]).filter((r) => !isBracedHinge(r)).map((r) => r.name);
    assertEquals(otherAfter, otherBefore);
    // Every accessory row now carries its cell (a row with a pick key carries the key; an asymmetrical row has none by
    // design and carries its own swap list instead), so `swap-list` builds the slot's cell from the stored row.
    for (const r of out.strength_exercises as Row[]) {
      if (/^(Back Squat|Deadlift|Bench Press|Overhead Press)$/.test(r.name)) continue; // a competition lift
      assert(r.slot_category && r.slot_pattern && r.slot_frame === 'all_rounder', `${p.id} ${r.name} carries no cell: ${JSON.stringify([r.slot_category, r.slot_pattern, r.slot_key, r.slot_frame])}`);
      const cell = slotCellOf(r);
      assert(cell && cell.category === r.slot_category, `${r.name}: slotCellOf gave ${JSON.stringify(cell)}`);
      if (/asymmetrical/i.test(String(r.source_row))) {
        assertEquals(r.slot_key, undefined, 'an asymmetrical row has no pick key');
        assert(Array.isArray(r.swap_options) && r.swap_options.length > 0, 'the asymmetrical row carries its own swap list');
      } else assert(r.slot_key, `${r.name} carries no pick key`);
    }
  }
  assert(rewritten >= 15, `only ${rewritten} rows rewritten`);
  // The reverse hyper stays in the Swap sheet for the slot, on the bench kit.
  const row = braced(after)[0].row;
  const sheet = swapGroupsFor('ghd back extension', BENCH, null, { category: 'braced', pattern: 'hinge_lower' }, (row.swap_options ?? []).map((o) => o.name));
  assert(sheet.flatMap((g) => g.options.map((o) => o.name)).includes('weighted reverse hyper'), JSON.stringify(sheet.map((g) => g.options.map((o) => o.name))));
});

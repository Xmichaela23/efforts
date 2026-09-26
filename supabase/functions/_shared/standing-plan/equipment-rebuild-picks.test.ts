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
import { swapGroupsFor } from './swap-groups.ts';
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

Deno.test('⛔ A HAND PICK SURVIVES THE EQUIPMENT REBUILD — recorded as the athlete\'s, or read as one by differing from the default', () => {
  // Recorded: the athlete set the braced hinge row (to the default's own value, even) — it stays.
  const recorded = picksOnNewKit({ stored, chosenKeys: ['braced_hinge'], builtKit: MIN, currentKit: BENCH, dial: [], frame: FRAME });
  assertEquals(recorded.changed, []);
  assertEquals(recorded.picks.braced_hinge, 'weighted reverse hyper');
  // Not recorded (a block built before 2026-09-25): a pick that is not the built kit's default is the athlete's.
  const hand = { ...stored, braced_hinge: 'db romanian deadlift' };
  const kept = picksOnNewKit({ stored: hand, chosenKeys: null, builtKit: MIN, currentKit: BENCH, dial: [], frame: FRAME });
  assertEquals(kept.changed, []);
  assertEquals(kept.picks.braced_hinge, 'db romanian deadlift');
  // A block with no stored kit reads the defaults of "not asked" — nothing moves rather than a guess.
  const noKit = picksOnNewKit({ stored, chosenKeys: null, builtKit: null, currentKit: BENCH, dial: [], frame: FRAME });
  assert(noKit.changed.every((c) => c.key !== 'braced_hinge') || stored.braced_hinge !== defaultViadaPicks(null, [], FRAME).braced_hinge);
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
  const planned = before.flatMap((w) => w.sessions.filter((s) => s.type === 'strength').map((s, i) => ({
    id: `w${w.week}-${s.day}-${i}`, week_number: w.week, date: dateOf(w.week, s.day), type: 'strength',
    // Week 3 Monday was done; everything else is planned.
    workout_status: w.week === 3 && s.day === 'Monday' ? 'completed' : 'planned',
    strength_exercises: JSON.parse(JSON.stringify(s.strength_exercises ?? [])),
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
    const had = (p.strength_exercises as Row[]).filter(isBracedHinge);
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
    const otherBefore = (p.strength_exercises as Row[]).filter((r) => !isBracedHinge(r)).map((r) => r.name);
    const otherAfter = (out.strength_exercises as Row[]).filter((r) => !isBracedHinge(r)).map((r) => r.name);
    assertEquals(otherAfter, otherBefore);
  }
  assert(rewritten >= 15, `only ${rewritten} rows rewritten`);
  // The reverse hyper stays in the Swap sheet for the slot, on the bench kit.
  const row = braced(after)[0].row;
  const sheet = swapGroupsFor('ghd back extension', BENCH, null, { category: 'braced', pattern: 'hinge_lower' }, (row.swap_options ?? []).map((o) => o.name));
  assert(sheet.flatMap((g) => g.options.map((o) => o.name)).includes('weighted reverse hyper'), JSON.stringify(sheet.map((g) => g.options.map((o) => o.name))));
});

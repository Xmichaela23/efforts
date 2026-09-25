// ============================================================================
// THE ARMS SUPERSET NEVER PUTS BOTH MOVEMENTS ON THE BARBELL, AND THE ROWS SAY WHAT THEY ARE HELD WITH (2026-09-24).
//
//   ~/.deno/bin/deno test --no-check --sloppy-imports supabase/functions/_shared/standing-plan/arms-superset-implement.test.ts
//
// ⛔ THE DEVICE FINDING (Michael, 2026-09-24, `docs/WORKORDER-arms-superset-implement-2026-09-24.md`): his Upper Pull
// day built "Skull Crusher + Drag Curl" on a barbell + dumbbell kit. Neither row said what it is held with, the
// logger drew no bar chip and no "each", a lying + standing pair cannot share one bar, and a straight-bar skull
// crusher is not the standard.
// ⛔ REVISED THE SAME DAY (`docs/WORKORDER-minimum-kit-and-accessory-table-2026-09-24.md`, Part A and B5): every
// declared kit is at least the minimum (barbell + rack + bench + dumbbells + pull-up bar), so there is no bar-only or
// dumbbells-only kit to design for. On any kit with dumbbells and no station the pair is DB Skull Crusher + Dumbbell
// Curl; the drag curl is barbell only and is offered where the bar is free; a gym's day 1 stays Triceps Pushdown +
// Preacher Curl and its day 4 is DB Skull Crusher + DB Spider Curl. The skull crusher and the spider curl carry the
// implement in the shown name; the canonical name underneath does not move.
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeWeek } from './compose.ts';
import { onTheBar, armsOnTheBar, defaultViadaPicks } from './accessory-picks.ts';
import { executionName, implementOnKit, usesTwoDumbbellsOnKit } from '../strength-grid/grid.ts';
import { barIsTheLoad } from '../../../../src/lib/strength-gear.ts';
import { canonicalize } from '../canonicalize.ts';

const KITS = {
  'minimum kit': ['Home gym'],
  'minimum + incline bench': ['Home gym', 'Incline bench'],
  'minimum + cable': ['Home gym', 'Cable machine'],
  'commercial gym': ['commercial gym'],
} as const;
const FRAMES = ['all_rounder', 'hyp_5k'] as const;
const LIFTS = { push_upper: 'Bench Press', press_lower: 'Back Squat', hinge_lower: 'Deadlift' };

type Row = { name: string; execution_name?: string; source_row?: string };
/** The "(arms)" pairs of a composed week, one array per day. */
function armsPairs(frame: (typeof FRAMES)[number], kit: readonly string[], picks: boolean): Row[][] {
  const slotPicks = picks ? defaultViadaPicks([...kit], [], frame) : undefined;
  const w = composeWeek({ frame, week: 2, column: 'standard', equipment: [...kit], roundTo: 5, competitionLifts: LIFTS,
    ...(slotPicks ? { slotPicks } : {}) } as never);
  return w.sessions
    .filter((s) => s.type === 'strength')
    .map((s) => ((s.strength_exercises ?? []) as Row[]).filter((e) => /\(arms\)/i.test(String(e.source_row ?? ''))))
    .filter((rows) => rows.length > 0);
}
const shown = (r: Row) => r.execution_name ?? r.name;

Deno.test('⛔ a barbell-held option ranks last in the pair; everything else is left alone', () => {
  const MIN = [...KITS['minimum kit']];
  assertEquals(onTheBar('drag curl', MIN), 1, 'the drag curl is barbell only');
  assertEquals(onTheBar('skull crusher', MIN), 0, 'the dumbbell form on a kit with dumbbells');
  assertEquals(onTheBar('dumbbell curl', MIN), 0);
  assertEquals(onTheBar('triceps pushdown', ['commercial gym']), 0);
  assertEquals(onTheBar('preacher curl', ['commercial gym']), 0);
  assertEquals(onTheBar('drag curl', null), 0, 'an undeclared kit is asked nothing');
  assertEquals(armsOnTheBar, onTheBar, 'the arms name is the same key');
});

Deno.test('⛔ never both on the barbell, never a skull crusher on the straight bar, on every declared kit', () => {
  for (const frame of FRAMES) {
    for (const [kitName, kit] of Object.entries(KITS)) {
      for (const picks of [false, true]) {
        const pairs = armsPairs(frame, kit, picks);
        assert(pairs.length >= 2, `${frame} @ ${kitName}: ${pairs.length} arms days`);
        for (const pair of pairs) {
          assertEquals(pair.length, 2, `${frame} @ ${kitName}: the pair has ${pair.length} rows`);
          const onBar = pair.filter((r) => implementOnKit(r.name, [...kit]) === 'barbell');
          assert(onBar.length < 2, `${frame} @ ${kitName} (${picks ? 'defaults' : 'no picks'}): both on the bar — ${pair.map(shown).join(' + ')}`);
          assert(!onBar.some((r) => /skull crusher/i.test(r.name)), `${frame} @ ${kitName}: a skull crusher on the straight bar`);
        }
      }
    }
  }
});

Deno.test('⛔ the pairs as picked: a gym\'s day 1 is Triceps Pushdown + Preacher Curl; a dumbbell kit is DB Skull Crusher + Dumbbell Curl', () => {
  const gym = armsPairs('all_rounder', KITS['commercial gym'], true);
  assertEquals(gym[0].map(shown), ['Triceps Pushdown', 'Preacher Curl']);
  assertEquals(gym[1].map(shown), ['DB Skull Crusher', 'DB Spider Curl']);
  const home = armsPairs('all_rounder', KITS['minimum kit'], true);
  assertEquals(home[0].map(shown), ['DB Skull Crusher', 'Dumbbell Curl']);
  assertEquals(home[1].map(shown), ['DB Skull Crusher', 'Dumbbell Curl']);
  for (const frame of FRAMES) {
    for (const pair of armsPairs(frame, KITS['minimum kit'], true)) {
      assertEquals(pair.map(shown), ['DB Skull Crusher', 'Dumbbell Curl'], `${frame} on the minimum kit`);
    }
  }
  // A cable stack on the minimum kit: the pushdown takes the push half, the biceps half stays off the bar.
  const cable = armsPairs('all_rounder', KITS['minimum + cable'], true);
  assertEquals(cable[0].map(shown), ['Triceps Pushdown', 'Dumbbell Curl']);
  assertEquals(cable[1].map(shown), ['DB Skull Crusher', 'Dumbbell Curl']);
  // An incline bench on the minimum kit: the spider curl (p222) is reachable and his, and it is off the bar.
  const incline = armsPairs('all_rounder', KITS['minimum + incline bench'], true);
  assertEquals(incline[0].map(shown), ['DB Skull Crusher', 'DB Spider Curl']);
});

Deno.test('⛔ the skull crusher and spider curl say what they are held with; the drag curl needs no implement in its name', () => {
  const MIN = [...KITS['minimum kit']];
  assertEquals(executionName('skull crusher', MIN), 'DB Skull Crusher');
  assertEquals(executionName('skull crusher', ['commercial gym']), 'DB Skull Crusher');
  assertEquals(executionName('spider curl', ['commercial gym']), 'DB Spider Curl');
  assertEquals(executionName('spider curl', ['Home gym', 'Incline bench']), 'DB Spider Curl');
  assertEquals(executionName('drag curl', MIN), 'drag curl', 'barbell only — the name is the movement');
  // An undeclared kit is told nothing.
  assertEquals(executionName('skull crusher', null), 'skull crusher');
  // The composed row: the implement rides as the shown name; `name` is the canonical one the log keys on.
  for (const pair of armsPairs('all_rounder', MIN, true)) {
    for (const row of pair) {
      if (/skull crusher/i.test(row.name)) {
        assert(/^DB /.test(String(row.execution_name)), `${row.name} shown as "${row.execution_name}"`);
        assertEquals(canonicalize(row.name), canonicalize(row.name.replace(/^(DB|Barbell) /, '')));
      }
    }
  }
});

Deno.test('⛔ the logger reads the same implement: "each" and no bar chip on dumbbells, the bar chip and one total on the bar', () => {
  const MIN = [...KITS['minimum kit']];
  assertEquals(usesTwoDumbbellsOnKit('Skull Crusher', MIN), true, 'the skull crusher on the minimum kit reads "each"');
  assertEquals(barIsTheLoad('Skull Crusher', MIN), false, 'the skull crusher on the minimum kit draws no bar');
  assertEquals(usesTwoDumbbellsOnKit('Dumbbell Curl', MIN), true);
  assertEquals(barIsTheLoad('Dumbbell Curl', MIN), false);
  assertEquals(usesTwoDumbbellsOnKit('Drag Curl', MIN), false, 'the drag curl is one total');
  assertEquals(barIsTheLoad('Drag Curl', MIN), true, 'the drag curl draws the bar');
});

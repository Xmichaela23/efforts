// ============================================================================
// THE ARMS SUPERSET NEVER PUTS BOTH MOVEMENTS ON THE BARBELL, AND THE ROWS SAY WHAT THEY ARE HELD WITH (2026-09-24).
//
//   ~/.deno/bin/deno test --no-check --sloppy-imports supabase/functions/_shared/standing-plan/arms-superset-implement.test.ts
//
// ⛔ THE DEVICE FINDING (Michael, 2026-09-24, `docs/WORKORDER-arms-superset-implement-2026-09-24.md`): his Upper Pull
// day built "Skull Crusher + Drag Curl" on a barbell + dumbbell kit. Neither row said what it is held with, the
// logger drew no bar chip and no "each", a lying + standing pair cannot share one bar, and a straight-bar skull
// crusher is not the standard. The rule (PM refinement the same day): a kit with dumbbells does the skull crusher
// and the drag curl with dumbbells; a barbell-held option ranks last in the pair; cable, machine, bench-station and
// dumbbell pairings stand as picked (a gym's Triceps Pushdown + Preacher Curl); the skull crusher, drag curl and
// spider curl carry the implement in the shown name; the canonical name underneath does not move. A bar-only kit is
// below the plan's minimum kit (barbell + rack + dumbbells); its rows are pinned here as the rule produces them, not
// designed for.
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeWeek } from './compose.ts';
import { armsOnTheBar, defaultViadaPicks } from './accessory-picks.ts';
import { executionName, implementOnKit, usesTwoDumbbellsOnKit } from '../strength-grid/grid.ts';
import { barIsTheLoad } from '../../../../src/lib/strength-gear.ts';
import { canonicalize } from '../canonicalize.ts';

const KITS = {
  'barbell + dumbbells + bench': ['Barbell', 'Dumbbells', 'Bench (flat/adjustable)'],
  'dumbbells + bench': ['Dumbbells', 'Bench (flat/adjustable)'],
  'barbell + bench': ['Barbell', 'Bench (flat/adjustable)'],
  'barbell + bench + cable': ['Barbell', 'Bench (flat/adjustable)', 'Cable machine'],
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
  const BB_DB = [...KITS['barbell + dumbbells + bench']];
  assertEquals(armsOnTheBar('skull crusher', [...KITS['barbell + bench']]), 1);
  assertEquals(armsOnTheBar('skull crusher', BB_DB), 0, 'the dumbbell form on a kit with dumbbells');
  assertEquals(armsOnTheBar('triceps pushdown', ['commercial gym']), 0);
  assertEquals(armsOnTheBar('preacher curl', ['commercial gym']), 0);
  assertEquals(armsOnTheBar('drag curl', null), 0, 'an undeclared kit is asked nothing');
});

Deno.test('⛔ never both on the barbell on a kit at or above the minimum; a bar-only kit (below it) reads the bar on both', () => {
  for (const frame of FRAMES) {
    for (const [kitName, kit] of Object.entries(KITS)) {
      for (const picks of [false, true]) {
        const pairs = armsPairs(frame, kit, picks);
        assert(pairs.length >= 2, `${frame} @ ${kitName}: ${pairs.length} arms days`);
        for (const pair of pairs) {
          assertEquals(pair.length, 2, `${frame} @ ${kitName}: the pair has ${pair.length} rows`);
          const onBar = pair.filter((r) => implementOnKit(r.name, [...kit]) === 'barbell');
          if (kitName === 'barbell + bench') {
            assertEquals(pair.map(shown), ['Barbell Skull Crusher', 'Barbell Drag Curl'], `${frame} @ ${kitName} (${picks ? 'defaults' : 'no picks'})`);
          } else {
            assert(onBar.length < 2, `${frame} @ ${kitName} (${picks ? 'defaults' : 'no picks'}): both on the bar — ${pair.map(shown).join(' + ')}`);
            assert(!onBar.some((r) => /skull crusher/i.test(r.name)), `${frame} @ ${kitName}: a skull crusher on the straight bar`);
          }
        }
      }
    }
  }
});

Deno.test('⛔ cable, machine and dumbbell pairings stand as picked: a gym\'s day 1 is Triceps Pushdown + Preacher Curl', () => {
  const gym = armsPairs('all_rounder', KITS['commercial gym'], true);
  assertEquals(gym[0].map(shown), ['Triceps Pushdown', 'Preacher Curl']);
  assertEquals(gym[1].map(shown), ['DB Skull Crusher', 'DB Drag Curl']);
  const home = armsPairs('all_rounder', KITS['barbell + dumbbells + bench'], true);
  assertEquals(home[0].map(shown), ['Tate Press', 'Concentration Curl']);
  assertEquals(home[1].map(shown), ['DB Skull Crusher', 'DB Drag Curl']);
  // A bar, a bench and a cable stack: the pushdown takes the push half, so the pair never shares the bar.
  const cable = armsPairs('all_rounder', KITS['barbell + bench + cable'], true);
  for (const pair of cable) assert(pair.filter((r) => implementOnKit(r.name, [...KITS['barbell + bench + cable']]) === 'barbell').length <= 1, pair.map(shown).join(' + '));
});

Deno.test('⛔ the skull crusher, drag curl and spider curl say what they are held with; the canonical name does not move', () => {
  const BB_DB = [...KITS['barbell + dumbbells + bench']];
  const BB = [...KITS['barbell + bench']];
  assertEquals(executionName('skull crusher', BB_DB), 'DB Skull Crusher');
  assertEquals(executionName('drag curl', BB_DB), 'DB Drag Curl');
  assertEquals(executionName('skull crusher', ['commercial gym']), 'DB Skull Crusher');
  assertEquals(executionName('spider curl', ['commercial gym']), 'DB Spider Curl');
  assertEquals(executionName('skull crusher', BB), 'Barbell Skull Crusher');
  assertEquals(executionName('drag curl', BB), 'Barbell Drag Curl');
  assertEquals(executionName('spider curl', ['Barbell', 'Incline bench']), 'Barbell Spider Curl');
  // An undeclared kit is told nothing.
  assertEquals(executionName('skull crusher', null), 'skull crusher');
  // The composed row: the implement rides as the shown name; `name` is the canonical one the log keys on.
  for (const pair of armsPairs('all_rounder', BB_DB, true)) {
    for (const row of pair) {
      if (/skull crusher|drag curl/i.test(row.name)) {
        assert(/^DB /.test(String(row.execution_name)), `${row.name} shown as "${row.execution_name}"`);
        assertEquals(canonicalize(row.name), canonicalize(row.name.replace(/^(DB|Barbell) /, '')));
      }
    }
  }
  assertEquals(armsPairs('all_rounder', BB, false)[0].map((r) => r.execution_name), ['Barbell Skull Crusher', 'Barbell Drag Curl']);
});

Deno.test('⛔ the logger reads the same implement: "each" and no bar chip on dumbbells, the bar chip and one total on the bar', () => {
  const BB_DB = [...KITS['barbell + dumbbells + bench']];
  const BB = [...KITS['barbell + bench']];
  for (const n of ['Skull Crusher', 'Drag Curl']) {
    assertEquals(usesTwoDumbbellsOnKit(n, BB_DB), true, `${n} on a barbell + dumbbell kit reads "each"`);
    assertEquals(barIsTheLoad(n, BB_DB), false, `${n} on a barbell + dumbbell kit draws no bar`);
    assertEquals(usesTwoDumbbellsOnKit(n, BB), false, `${n} on a bar-only kit is one total`);
    assertEquals(barIsTheLoad(n, BB), true, `${n} on a bar-only kit draws the bar`);
  }
});

/**
 * ⛔ THE LOGGER PRINTS; THE SERVER DECIDES (2026-09-18). The reserve words and numbers, the intent line, the kit's
 * name and how-to on a swap, and the anchor set's steps are stamped or answered by the server. These pins keep the
 * phone-side calls from coming back, and check the stamps give the answers the phone used to work out.
 *
 *   ~/.deno/bin/deno test supabase/functions/_shared/strength/logger-prints.test.ts --no-check --allow-read
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  intentRowLine, loggerRowStamps, loggerStampsForStep, reserveIntegersFor, reserveSeedFor, reserveTextFor,
} from './strength-display-lines.ts';
import { plyoSwapGroups, swapGroupsFor } from '../standing-plan/swap-groups.ts';
import { executionHowTo, executionName } from '../strength-grid/grid.ts';
import { PLYO_FAMILIES, PLYO_FAMILY_IDS } from '../standing-plan/plyo.ts';

/** Every src file, so an import moved to another component is caught too. */
async function srcFiles(dir: URL): Promise<Array<{ path: string; text: string }>> {
  const out: Array<{ path: string; text: string }> = [];
  for await (const e of Deno.readDir(dir)) {
    const u = new URL(e.name + (e.isDirectory ? '/' : ''), dir);
    if (e.isDirectory) out.push(...await srcFiles(u));
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push({ path: u.pathname, text: await Deno.readTextFile(u) });
  }
  return out;
}

Deno.test('⛔⛔ NO PHONE FILE IMPORTS THE RESERVE, INTENT, KIT-NAME, HOW-TO OR STEP FUNCTIONS', async () => {
  const files = await srcFiles(new URL('../../../../src/', import.meta.url));
  assert(files.length > 50, 'the src walk found almost nothing');
  const banned = ['reserveTextFor', 'reserveIntegersFor', 'reserveSeedFor', 'reserveNumberText', 'intentRowLine',
    'loggerRowStamps', 'executionHowTo', 'executionName', 'pretestStepWeights'];
  for (const f of files) {
    for (const imp of f.text.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/g)) {
      if (!/@shared\/|supabase\/functions\//.test(imp[2])) continue;
      const names = imp[1].split(',').map((n) => n.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]);
      for (const b of banned) assert(!names.includes(b), `${f.path} imports ${b} from ${imp[2]} — the server stamps it`);
    }
  }
});

const ROWS = [
  { slot_intent: 'HYP', target_rir: 1, target_reps: '6-12' },
  { slot_intent: 'DE', target_rir: 3.5, target_reps: '2-4' },
  { slot_intent: 'SKILL', target_rir: 3.5, target_reps: '3-5' },
  { slot_intent: 'ME', target_reps: '1-5' },
  { target_rir: 2, target_reps: '8' },
  { target_rir: 1.5 },
  { target_rir: 5 },
  { target_rir: 6 },
  {},
];

Deno.test('⛔ THE STAMPS ARE THE ANSWERS THE PHONE WORKED OUT', () => {
  for (const r of ROWS) {
    const s = loggerRowStamps(r, true);
    assertEquals(s.reserve_text ?? null, reserveTextFor(r), JSON.stringify(r));
    assertEquals(s.reserve_seed ?? null, reserveSeedFor(r), JSON.stringify(r));
    // The phone lit a pill when the band held it, and the 5+ pill when the row's own number was 5 or more.
    for (const pill of [0, 1, 2, 3, 4, 5]) {
      const old = reserveIntegersFor(r).includes(pill) || (r.target_rir != null && r.target_rir >= 5 && pill === 5);
      assertEquals((s.reserve_lit ?? []).includes(pill), old, `${JSON.stringify(r)} pill ${pill}`);
    }
    const bookWord = ['ME', 'DE', 'SKILL', 'HYP'].includes(String(r.slot_intent)) ? r.slot_intent : null;
    assertEquals(s.intent_line ?? null, bookWord ? intentRowLine(r) : null, JSON.stringify(r));
  }
  assertEquals(loggerRowStamps(ROWS[0], true).intent_line, 'HYP · 6-12 reps · 0 to 2 in reserve · controlled eccentric, controlled concentric');
});

Deno.test('⛔ NO INTENT LINE OFF A STANDING-PLAN DAY; A ROW WITH NO slot_intent READS ME / DE OUT OF ITS NOTES', () => {
  assertEquals(loggerRowStamps(ROWS[0], false).intent_line, undefined);
  assertEquals(loggerStampsForStep({ reps: '2-4', target_rir: 3.5, notes: '1 x DE: speed' }, true).intent_line,
    intentRowLine({ slot_intent: 'DE', target_rir: 3.5, target_reps: '2-4' }));
  assertEquals(loggerStampsForStep({ reps: '1-5', notes: '1 x ME' }, true).intent_line, undefined);
});

const KITS: Array<string[] | null> = [null, [], ['barbell', 'dumbbells', 'bench'], ['dumbbells'], ['bands'], ['agility ladder']];

Deno.test('⛔ EVERY SWAP OPTION CARRIES THE KIT NAME AND HOW-TO THE PHONE USED TO LOOK UP', () => {
  let checked = 0;
  for (const slot of ['Barbell Row', 'Lat Pulldown', 'Romanian Deadlift', 'Lateral Raise', 'Leg Curl', 'Farmer Carry', 'Plank']) {
    for (const kit of KITS) {
      for (const g of swapGroupsFor(slot, kit)) {
        for (const o of g.options) {
          const d = executionName(o.name, kit ?? []);
          assertEquals(o.execution_name, d !== o.name ? d : undefined, `${slot} / ${o.name}`);
          assertEquals(o.how_to, executionHowTo(o.name, kit ?? []) ?? undefined, `${slot} / ${o.name}`);
          checked += 1;
        }
      }
    }
  }
  assert(checked > 20, `only ${checked} options checked`);
});

Deno.test('⛔ THE PLYO LIST IS THE SAME LIST THE PHONE BUILT: the other drills in the family, ladder drills only with a ladder', () => {
  for (const id of PLYO_FAMILY_IDS) {
    for (const drill of PLYO_FAMILIES[id].drills) {
      for (const kit of KITS) {
        const hasLadder = (kit || []).some((e) => /agility ladder/i.test(String(e)));
        const want = PLYO_FAMILIES[id].drills
          .filter((d) => d.toLowerCase() !== drill.toLowerCase())
          .filter((d) => hasLadder || d.toLowerCase() !== 'ladder drills');
        const got = plyoSwapGroups(drill, kit);
        assertEquals(got.flatMap((g) => g.options.map((o) => o.name)), want, `${drill} / ${JSON.stringify(kit)}`);
        for (const g of got) {
          assertEquals(g.heading, null);
          for (const o of g.options) assertEquals(o.how_to, executionHowTo(o.name, kit ?? []) ?? undefined);
        }
      }
    }
  }
});

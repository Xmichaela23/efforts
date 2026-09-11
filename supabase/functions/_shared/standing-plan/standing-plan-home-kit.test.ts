// ============================================================================
// THE KIT GATE — a home kit is not handed a movement its bench cannot do.
//
//   ~/.deno/bin/deno test --no-check --sloppy-imports supabase/functions/_shared/standing-plan/standing-plan-home-kit.test.ts
//
// ⛔ THE DEVICE FINDING (Michael, 2026-09-10). His home-gym block — adjustable dumbbells, a flat
// bench, no preacher bench, no incline bench — prescribed a Preacher Curl, and the swap sheet offered
// a Spider Curl and an incline-bench Chest-Supported Row. The preacher curl was tagged as needing a
// flat bench (`[['barbell', 'bench'], ['dumbbells', 'bench']]`), so "Bench (flat/adjustable)"
// reached it. It needs a preacher bench: a fixed station, reached through the commercial-gym chip.
//
// ⛔ AND THE GATE IS STRICT AGAIN. `strength-grid/grid.ts:reachable` admitted an UNTAGGED movement
// by default to a declared kit (unless its name read as machine-braced) because, on 2026-08-24, only
// 52 movements were tagged. Every movement the grid classifies is tagged now, so a declared kit admits
// only what the catalogue says it can do — and the coverage pin below is what keeps that from ever
// emptying a cell again.
//
// ⚠️ THE CHIPS ARE THE APP'S OWN. "Bench (flat/adjustable)" grants `bench`; the separate "Incline
// bench" chip grants `incline_bench` (`strength-equipment-tier.test.ts` pins that they differ).
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeWeek } from './compose.ts';
import { pickOptions } from './accessory-picks.ts';
import { allGridMovements, isGearTagged, resolveSlot } from '../strength-grid/index.ts';
import { canPerform } from '../../../../src/lib/strength-gear.ts';

/** Dumbbells and a flat bench. No barbell, no rack, no incline, no station of any kind. */
const FLAT = ['Dumbbells', 'Bench (flat/adjustable)'];
/** The same kit with the incline chip ticked. */
const INCLINE = [...FLAT, 'Incline bench'];

const BASE = {
  frame: 'all_rounder' as const,
  competitionLifts: { push_upper: 'Bench Press', press_lower: 'Back Squat', hinge_lower: 'Deadlift' },
  roundTo: 5,
};

const week = (equipment: string[] | null, wk = 2) =>
  composeWeek({ ...BASE, week: wk, column: 'standard', equipment } as never);

type Row = { name: string; execution_name?: string; day?: string };
const rowsIn = (w: ReturnType<typeof week>): Row[] =>
  w.sessions
    .filter((s) => s.type === 'strength')
    .flatMap((s) => (s.strength_exercises ?? []).map((e) => ({ ...(e as Row), day: (s as { day?: string }).day })));
/** Canonical names, lower-cased. */
const namesIn = (w: ReturnType<typeof week>) => rowsIn(w).map((r) => r.name.toLowerCase());
/** What the athlete reads: the execution name where the server wrote one, else the name. */
const shownIn = (w: ReturnType<typeof week>) => rowsIn(w).map((r) => String(r.execution_name ?? r.name).toLowerCase());

/**
 * The movements the screen showed, by canonical name. ⚠️ THE PREACHER CURL LEFT THIS LIST on
 * 2026-09-10 (third home route): with dumbbells and a bench it is reachable as the concentration
 * curl, so the canonical name may be prescribed — what may not happen is the row SAYING "preacher"
 * to that kit, which the second regex still pins.
 */
const CANNOT_ON_A_FLAT_BENCH = /spider|incline|chest[- ]supported row/;
/** And what a row may never SAY to an athlete with no station and no incline. */
const NAMES_A_STATION_OR_INCLINE = /machine|incline|preacher|spider|chest[- ]supported/;

Deno.test('⛔ THE DEVICE FINDING: dumbbells and a flat bench are not handed a spider curl or an incline movement, and never read "preacher"', () => {
  for (const wk of [1, 2, 3, 4]) {
    const w = week(FLAT, wk);
    const hits = namesIn(w).filter((n) => CANNOT_ON_A_FLAT_BENCH.test(n));
    assertEquals(hits, [], `week ${wk} prescribed a movement the kit cannot do: ${hits.join(', ')}`);
    const said = shownIn(w).filter((n) => NAMES_A_STATION_OR_INCLINE.test(n));
    assertEquals(said, [], `week ${wk} named a station or an incline to a flat-bench kit: ${said.join(', ')}`);
  }
});

Deno.test('the swap sheet for the arm cells offers only what the kit reaches, under a name the kit can read', () => {
  for (const key of ['iso_pull_a', 'iso_pull_b'] as const) {
    const offered = pickOptions(key, FLAT, null, null);
    assert(offered.length > 0, `${key} offered nothing on dumbbells + flat bench`);
    const hits = offered.map((o) => o.name.toLowerCase()).filter((n) => CANNOT_ON_A_FLAT_BENCH.test(n));
    assertEquals(hits, [], `${key} offered ${hits.join(', ')} on dumbbells + flat bench`);
    const said = offered.map((o) => o.display.toLowerCase()).filter((n) => NAMES_A_STATION_OR_INCLINE.test(n));
    assertEquals(said, [], `${key} showed ${said.join(', ')} to a flat-bench kit`);
    for (const o of offered) assert(canPerform(o.name, FLAT), `${key} offered "${o.name}", which the kit cannot perform`);
  }
});

Deno.test('⛔ THE TWO HOME ROUTES (workorder addendum, 2026-09-10): his rear delt and pullover work reach a dumbbell + flat bench kit', () => {
  const a = pickOptions('iso_pull_a', FLAT, null, null);
  const rearDelt = a.find((o) => o.name.toLowerCase() === 'rear delt machine');
  assert(rearDelt, `the rear delt work is missing from ${a.map((o) => o.name).join(', ')}`);
  assertEquals(rearDelt!.display, 'Bent-Over Dumbbell Rear Delt Fly');
  const pullover = a.find((o) => o.name.toLowerCase() === 'pullover machine');
  assert(pullover, `the pullover is missing from ${a.map((o) => o.name).join(', ')}`);
  assertEquals(pullover!.display, 'Flat-Bench Dumbbell Pullover');
  // With the incline chip the rear delt work is chest-supported, which is closer to his position.
  const incl = pickOptions('iso_pull_a', INCLINE, null, null).find((o) => o.name.toLowerCase() === 'rear delt machine');
  assertEquals(incl?.display, 'Chest-Supported Rear Delt Fly');
  // A gym member sees his name, because that is what they will walk over to.
  const gym = pickOptions('iso_pull_a', ['Commercial gym'], null, null).find((o) => o.name.toLowerCase() === 'rear delt machine');
  assertEquals(gym?.display, 'Rear Delt Machine');
});

Deno.test('with the incline chip the spider curl is allowed, and the preacher curl is still the concentration curl', () => {
  const offered = pickOptions('iso_pull_b', INCLINE, null, null);
  const names = offered.map((o) => o.name.toLowerCase());
  assert(names.includes('spider curl'), `spider curl missing from ${names.join(', ')}`);
  // ⛔ 2026-09-10: the day-4 pull pair is p274's "(arms)" superset, and an athlete who picks the spider curl
  // for it gets it. (With no pick the pair opens on the first arm movement the kit reaches.)
  const picked = composeWeek({ ...BASE, week: 2, column: 'standard', equipment: INCLINE, slotPicks: { iso_pull_b: 'spider curl' } } as never);
  assert(namesIn(picked).includes('spider curl'), 'the composed week never reaches the spider curl when it is picked');
  // An incline bench is not a preacher bench: the name is still the home one.
  assertEquals(offered.find((o) => o.name.toLowerCase() === 'preacher curl')?.display, 'Concentration Curl');
});

Deno.test('⛔ THE THIRD HOME ROUTE (workorder addendum, 2026-09-10): the preacher curl reaches a dumbbell + bench kit as the concentration curl', () => {
  // Reach: dumbbells and a bench, or the station. A bar and a bench alone do not curl one arm on a knee.
  assertEquals(canPerform('Preacher Curl', ['Commercial gym']), true);
  assertEquals(canPerform('Preacher Curl', FLAT), true);
  assertEquals(canPerform('Preacher Curl', INCLINE), true);
  assertEquals(canPerform('Preacher Curl', ['Barbell + plates', 'Bench (flat/adjustable)']), false);
  assertEquals(canPerform('Preacher Curl', ['Dumbbells']), false);
  // §0h: nobody asked, so nothing is refused.
  assertEquals(canPerform('Preacher Curl', []), true);
  assertEquals(canPerform('Preacher Curl', null), true);

  // The swap list for BOTH arm cells offers it, under the home name, with his name as the key.
  for (const key of ['iso_pull_a', 'iso_pull_b'] as const) {
    const o = pickOptions(key, FLAT, null, null).find((x) => x.name.toLowerCase() === 'preacher curl');
    assert(o, `${key}: the preacher curl is missing from the flat-bench swap list`);
    assertEquals(o!.display, 'Concentration Curl');
  }
  // A gym member sees his name, because that is what they will walk over to.
  const gym = pickOptions('iso_pull_b', ['Commercial gym'], null, null).find((o) => o.name.toLowerCase() === 'preacher curl');
  assertEquals(gym?.display, 'Preacher Curl');

  // The composed week for that kit prescribes it under his name, shows the home name, and carries
  // the how-to — one arm at a time, upper arm on the inner knee.
  const rows = [1, 2, 3, 4].flatMap((wk) => rowsIn(week(FLAT, wk)));
  const curls = rows.filter((r) => r.name.toLowerCase() === 'preacher curl');
  assert(curls.length > 0, 'no week on dumbbells + flat bench reached the preacher curl');
  for (const r of curls) {
    assertEquals(r.execution_name, 'Concentration Curl');
    const howTo = String((r as { how_to?: string }).how_to ?? '');
    assert(/one arm/i.test(howTo) && /knee/i.test(howTo), `how-to missing or wrong: "${howTo}"`);
    assert((r as { swap_options?: { name: string; display: string }[] }).swap_options?.some((o) => o.display === 'Concentration Curl'),
      'the row\'s own swap list does not carry the concentration curl');
  }
  // With the station, the row is his and carries no how-to.
  const gymRows = [1, 2, 3, 4].flatMap((wk) => rowsIn(week(['Commercial gym'], wk))).filter((r) => r.name.toLowerCase() === 'preacher curl');
  for (const r of gymRows) {
    assertEquals(r.execution_name, undefined);
    assertEquals((r as { how_to?: string }).how_to, undefined);
  }
});

Deno.test('⛔ THE COVERAGE PIN: every movement the grid classifies carries a gear tag', () => {
  /**
   * The strict gate refuses an untagged movement to any declared kit. On 2026-08-24 that emptied
   * cells, because 52 of ~316 were tagged. This is what keeps a new catalogue row from silently
   * vanishing from every gated cell: add the row, tag it, or this fails with its name.
   */
  const untagged = allGridMovements().map((m) => m.name).filter((n) => !isGearTagged(n));
  assertEquals(untagged, [], `untagged movements in the grid: ${untagged.join(', ')}`);
});

Deno.test('a declared kit admits nothing the catalogue has not declared a need for', () => {
  // Every option a gated cell returns is tagged and performable — the strict rule stated as a sweep.
  for (const kit of [FLAT, INCLINE, ['Commercial gym'], ['Pull-up bar'], ['Kettlebells']]) {
    for (const category of ['secondary', 'braced', 'focused'] as const) {
      for (const pattern of ['push_upper', 'pull_upper', 'press_lower', 'hinge_lower'] as const) {
        const r = resolveSlot({ category, pattern, intent: 'HYP', equipment: kit });
        for (const o of r.options) {
          assert(isGearTagged(o.name), `${category}/${pattern} [${kit.join('+')}] offered untagged "${o.name}"`);
          assert(canPerform(o.name, kit), `${category}/${pattern} [${kit.join('+')}] offered "${o.name}", not performable`);
        }
      }
    }
  }
});

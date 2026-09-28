/**
 * ⛔ NO SUPERSET NEEDS THE BENCH AT TWO SETTINGS (2026-09-28, owner: "this is a stupid superset" — Tate press, face up
 * on a flat bench, paired with the spider curl, chest down on an incline bench). `benchClash` in accessory-picks.ts:
 * the picking screen's defaults, the composed week and the equipment rebuild's stored picks all follow it.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  benchClash,
  benchSetting,
  defaultViadaPicks,
  supersetPartnersForPick,
  PICK_KEYS_BY_FRAME,
  VIADA_PICKS,
  type ViadaPickKey,
} from './accessory-picks.ts';
import { picksOnNewKit } from './equipment-rebuild-picks.ts';
import { FRAMES, type FrameId } from './frames.ts';

// The owner's kit on 2026-09-28 (plans.config.standing_plan.athlete_equipment).
const OWNER_KIT = [
  'Barbell + plates', 'Dumbbells', 'Squat rack / Power cage', 'Bench (flat/adjustable)', 'Pull-up bar',
  'Resistance bands', 'Ab wheel', 'Incline bench', 'Back extension bench',
];
const KITS: Record<string, string[]> = {
  owner: OWNER_KIT,
  minimum: ['Barbell + plates', 'Dumbbells', 'Squat rack / Power cage', 'Bench (flat/adjustable)', 'Pull-up bar'],
  gym: ['Commercial gym'],
  dumbbellsOnly: ['Dumbbells', 'Bench (flat/adjustable)', 'Incline bench'],
};

Deno.test('bench setting: the kit\'s own route — Tate press flat, spider curl incline, the dumbbell curl none', () => {
  assertEquals(benchSetting('tate press', OWNER_KIT), 'flat');
  assertEquals(benchSetting('spider curl', OWNER_KIT), 'incline');
  assertEquals(benchSetting('dumbbell curl', OWNER_KIT), null);
  assertEquals(benchClash('spider curl', OWNER_KIT, 'flat'), 1);
  assertEquals(benchClash('dumbbell curl', OWNER_KIT, 'flat'), 0);
  assertEquals(benchClash('spider curl', OWNER_KIT, null), 0);
});

Deno.test('partners are read off the frame: the arms pair and the braced pair on the All Rounder', () => {
  assertEquals(supersetPartnersForPick('ar_arms_pull_1', 'all_rounder'), ['ar_arms_push_1']);
  assertEquals(supersetPartnersForPick('ar_arms_push_1', 'all_rounder'), ['ar_arms_pull_1']);
  assert(supersetPartnersForPick('braced_leg', 'all_rounder').includes('braced_hinge'));
});

Deno.test('defaults: the owner\'s kit — both arms pairs keep a curl in the pull half', () => {
  const d = defaultViadaPicks(OWNER_KIT, [], 'all_rounder');
  for (const k of ['ar_arms_pull_1', 'ar_arms_pull_4'] as ViadaPickKey[]) assert(/curl/.test(String(d[k])), `${k} = ${d[k]}`);
});

Deno.test('defaults: no printed superset on any frame and kit needs the bench at two settings', () => {
  for (const frame of Object.keys(FRAMES) as FrameId[]) {
    for (const [kitName, kit] of Object.entries(KITS)) {
      const picks = defaultViadaPicks(kit, [], frame);
      for (const key of (PICK_KEYS_BY_FRAME[frame] ?? []) as ViadaPickKey[]) {
        const mine = picks[key];
        if (!mine) continue;
        for (const partner of supersetPartnersForPick(key, frame)) {
          const theirs = picks[partner];
          if (!theirs) continue;
          const a = benchSetting(mine, kit), b = benchSetting(theirs, kit);
          assert(!(a && b && a !== b), `${frame} · ${kitName}: ${key}=${mine} (${a}) with ${partner}=${theirs} (${b})`);
        }
      }
    }
  }
});

Deno.test('rebuild: the owner\'s stored Tate press + spider curl — the spider curl gives way, the Tate press stays', () => {
  const stored = {
    core: 'hanging leg raise', braced_leg: 'goblet squat', braced_push: 'dumbbell bench press', braced_hinge: 'ghd back extension',
    ar_pull_iso_4: 'rear delt machine', ar_push_iso_1: 'lateral raise', ar_arms_pull_1: 'spider curl', ar_arms_pull_4: 'drag curl',
    ar_arms_push_1: 'tate press', ar_arms_push_4: 'skull crusher',
  } as Partial<Record<ViadaPickKey, string>>;
  const { picks, changed } = picksOnNewKit({ stored, chosenKeys: null, builtKit: OWNER_KIT, currentKit: OWNER_KIT, dial: [], frame: 'all_rounder' });
  assertEquals(picks.ar_arms_push_1, 'tate press');
  assert(picks.ar_arms_pull_1 !== 'spider curl', `pull half is ${picks.ar_arms_pull_1}`);
  assertEquals(benchClash(String(picks.ar_arms_pull_1), OWNER_KIT, 'flat'), 0);
  // …and it is still arm work, a curl — not the rear delt machine from the same list (p274's "(arms)").
  assertEquals(picks.ar_arms_pull_1, 'dumbbell curl');
  assert(changed.some((c) => c.key === 'ar_arms_pull_1' && c.from === 'spider curl'));
  // Day 4's pair (skull crusher + drag curl) needs no second setting and does not move.
  assertEquals(picks.ar_arms_pull_4, 'drag curl');
});

Deno.test('rebuild: a pick the athlete set by hand stays, even when it clashes (no hard gates)', () => {
  const stored = { ar_arms_push_1: 'tate press', ar_arms_pull_1: 'spider curl' } as Partial<Record<ViadaPickKey, string>>;
  const { picks } = picksOnNewKit({ stored, chosenKeys: ['ar_arms_pull_1'], builtKit: OWNER_KIT, currentKit: OWNER_KIT, dial: [], frame: 'all_rounder' });
  assertEquals(picks.ar_arms_pull_1, 'spider curl');
  assert(VIADA_PICKS.ar_arms_pull_1);
});

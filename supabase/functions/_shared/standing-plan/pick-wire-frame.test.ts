/**
 * ⛔⛔⛔ THE WIRE READS THE FRAME'S OWN CELLS — the regression test for a defect that reached a real
 * athlete's built plan (2026-08-31).
 *
 * `normalizeViadaPrefs` looped p246's nine keys unconditionally. On an All Rounder that meant every
 * answer the athlete gave was invisible and every one of the OTHER table's cells fell to a default,
 * so the function **returned a complete set of answers to questions nobody was asked.** The athlete
 * had changed his hamstring row to Barbell Hip Thrust; the plan built a nordic curl.
 *
 * ⚠️ THE FIXTURE IS HIS ACTUAL KIT AND HIS ACTUAL ANSWER, not a synthetic one — the bug needed both
 * a home kit (no machines) and a p274 cell to show itself.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  normalizeViadaPrefs, PICK_KEYS_BY_FRAME, VIADA_PICK_KEYS, ALL_ROUNDER_PICK_KEYS,
} from './accessory-picks.ts';

const HOME_KIT = [
  'Barbell + plates', 'Dumbbells', 'Squat rack / Power cage', 'Bench (flat/adjustable)',
  'Pull-up bar', 'Resistance bands', 'Ab wheel', 'Incline bench',
];

Deno.test('⛔⛔ AN ALL ROUNDER ANSWER SURVIVES THE WIRE, AND NO OTHER TABLE\'S KEYS APPEAR', () => {
  const prefs = normalizeViadaPrefs(
    { version: 1, picks: { ham_iso: 'Barbell Hip Thrust' }, dial: [], dial_rows: {} },
    HOME_KIT,
    'all_rounder',
  );
  assert(prefs, 'the wire returned nothing for a valid block');
  /**
   * ⛔ THE ANSWER ITSELF. Before the fix this came back as a nordic curl, because the hamstring cell
   * was never visited and, when it was, its option pool was asked WITHOUT the muscle and the
   * admitted movements and returned empty at this kit.
   */
  assertEquals(prefs!.picks.ham_iso, 'Barbell Hip Thrust',
    '⛔ the athlete\'s hamstring answer was discarded at the wire');
  // ⛔ AND THE OTHER PROGRAMME'S CELLS ARE NOT INVENTED. Five of p246's nine are not p274 cells.
  for (const k of ['db_press', 'hinge_lower', 'single_leg_a', 'single_leg_b', 'core'] as const) {
    assert(!(k in prefs!.picks), `p246's ${k} was stored on an all_rounder block`);
  }
  assertEquals(Object.keys(prefs!.picks).sort(), [...ALL_ROUNDER_PICK_KEYS].sort());
});

Deno.test('⛔ AND THE OTHER DIRECTION IS UNCHANGED — no frame means the table it always meant', () => {
  /**
   * ⚠️ EVERY CALLER WRITTEN BEFORE A SECOND PROGRAMME EXISTED passes no frame, and must keep getting
   * p246's nine. The default is what makes this fix additive rather than a migration.
   */
  const prefs = normalizeViadaPrefs({ version: 1, picks: {}, dial: [], dial_rows: {} }, HOME_KIT);
  assert(prefs);
  assertEquals(Object.keys(prefs!.picks).sort(), [...VIADA_PICK_KEYS].sort());
  assertEquals(PICK_KEYS_BY_FRAME.strength_5k, VIADA_PICK_KEYS);
});

Deno.test('⛔ EVERY CELL OF EVERY PROGRAMME ROUND-TRIPS ITS OWN FIRST OPTION', () => {
  /**
   * ⛔ THE GENERAL FORM OF THE BUG, so it cannot come back on a different cell. For each programme,
   * every cell is answered with a movement that cell actually offers, and the wire must hand every
   * one of them back unchanged. A cell whose validation pool is asked with the wrong arguments fails
   * here rather than silently substituting a default.
   */
  for (const frame of ['strength_5k', 'all_rounder'] as const) {
    const seeded = normalizeViadaPrefs({ version: 1, picks: {}, dial: [], dial_rows: {} }, HOME_KIT, frame);
    assert(seeded, `${frame}: the wire seeded nothing`);
    const round = normalizeViadaPrefs(
      { version: 1, picks: { ...seeded!.picks }, dial: [], dial_rows: {} }, HOME_KIT, frame,
    );
    assert(round, `${frame}: the wire dropped a seeded block`);
    assertEquals(round!.picks, seeded!.picks,
      `${frame}: a seeded answer did not survive being read back — the pool and the seed disagree`);
  }
});

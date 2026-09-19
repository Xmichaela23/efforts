/**
 * ⛔ ONE SHOWN NAME PER MOVEMENT, ON EVERY SCREEN (Michael, 2026-09-18). The logger row, the swap panel's title, the
 * swap options, the planned row's line and State's lift labels all print this — never a second spelling of the same
 * lift ("Dumbbell Bench Press" on the row, "DB Bench Press" in the list).
 *
 * THE RULE, in order:
 *   1. A name the athlete's kit renames the movement to (`executionName`) wins on that athlete's rows.
 *   2. The book's printed name: a p227 drill as `PLYO_FAMILIES` prints it ("A-Skip"), or a `printed` entry in `FILING`
 *      (pp218–223, p226).
 *   3. Where the book prints none, the catalogue's one entry for the movement (`FILING`, then `EXERCISE_CONFIG`; of
 *      two plural/singular entries, the shorter). A catalogue synonym (`SAME_MOVEMENT`) is the movement it names.
 *   Then every "Dumbbell" reads "DB" — the book's own habit ("seated DB press", "DB pullovers", p220).
 *
 * TWO EXCEPTIONS, both Michael's (2026-09-18):
 *   · Overhead Press, not p218's "military press" — it matches the baseline test's name and Strong/Hevy
 *     (`docs/STATE-SOURCES.md`).
 *   · "Kb/db Swings" is never shown: it is KB Swing on a kit with a kettlebell, DB Swing on one with dumbbells and no
 *     kettlebell, and KB Swing (p220's word) where the kit is not known.
 *
 * ⛔ SHARED = DEPLOY TRAP: grep -rl "strength/shown-name" supabase/functions
 */
import { canonicalize } from '../canonicalize.ts';
import { FILING } from '../strength-grid/taxonomy.ts';
import { executionName } from '../strength-grid/grid.ts';
import { movementLabel } from '../standing-plan/accessory-picks.ts';
import { PLYO_FAMILIES, PLYO_FAMILY_IDS } from '../standing-plan/plyo.ts';
import { EXERCISE_CONFIG, SAME_MOVEMENT } from '../../../../src/lib/exercise-config.ts';
import { athleteEquipmentToKeys } from '../../../../src/lib/strength-gear.ts';

const dbHabit = (s: string) => s.replace(/\bdumbbell\b/gi, 'DB');

let ENTRIES: Map<string, string[]> | null = null;
function entries(): Map<string, string[]> {
  if (ENTRIES) return ENTRIES;
  const m = new Map<string, string[]>();
  const add = (n: string) => {
    const k = canonicalize(n);
    const l = m.get(k) ?? [];
    if (!l.includes(n)) l.push(n);
    m.set(k, l);
  };
  for (const n of Object.keys(FILING)) add(n);
  for (const n of Object.keys(EXERCISE_CONFIG)) add(n);
  ENTRIES = m;
  return m;
}

let DRILLS: Map<string, string> | null = null;
function plyoDrills(): Map<string, string> {
  if (DRILLS) return DRILLS;
  DRILLS = new Map();
  for (const id of PLYO_FAMILY_IDS) for (const d of PLYO_FAMILIES[id].drills) DRILLS.set(canonicalize(d), d);
  return DRILLS;
}

function kbDbSwing(equipment: string[] | null | undefined): string {
  const keys = Array.isArray(equipment) ? athleteEquipmentToKeys(equipment) : new Set<string>();
  return !keys.has('kettlebell') && keys.has('dumbbells') ? 'DB Swing' : 'KB Swing';
}

/**
 * The shown name of a movement, from any of its spellings or its canonical key. `equipment` only matters for the
 * kb/db swing; pass the athlete's kit where it is known.
 */
export function shownName(name: string, equipment?: string[] | null): string {
  const raw = String(name ?? '').trim();
  if (!raw) return '';
  // A catalogue synonym is the movement it names ("dumbbell lateral raise" → "lateral raise").
  const spaced = raw.replace(/_/g, ' ');
  const k = canonicalize(SAME_MOVEMENT[spaced.toLowerCase()] ?? spaced);
  if (k === 'overhead_press') return 'Overhead Press';
  if (k === 'kb_db_swings') return kbDbSwing(equipment);
  const drill = plyoDrills().get(k);
  if (drill) return drill;
  const ns = entries().get(k);
  if (!ns || ns.length === 0) return dbHabit(movementLabel(raw.replace(/_/g, ' ')));
  const pick = ns.find((n) => FILING[n]?.basis === 'printed')
    ?? ns.find((n) => FILING[n])
    ?? ns.slice().sort((a, b) => a.length - b.length)[0];
  return dbHabit(movementLabel(pick));
}

/** The shown name on the athlete's kit: the kit's name for the movement where it renames it, else `shownName`. */
export function shownNameOnKit(name: string, equipment: string[] | null | undefined): string {
  const exec = executionName(name, equipment);
  return exec !== name ? dbHabit(exec) : shownName(name, equipment);
}

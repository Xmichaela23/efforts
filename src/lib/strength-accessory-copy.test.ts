/**
 * THE ACCESSORY CUE — and as of 2026-09-18 the phone has NONE of its own.
 *
 * Run from repo root:  deno test src/lib/strength-accessory-copy.test.ts --no-check --sloppy-imports
 *
 * ⛔⛔ `STANDING_ACCESSORY_SET_CUE` ("8 to 12 reps, 1 to 2 in reserve. Reps slow as the set goes.") IS
 * DELETED (book-language fix). p218 prints HYP as 6 to 12 reps at 0 to 2 in reserve; the line above the
 * first accessory card now prints `intentLine('HYP')` from `@shared/strength-grid/intents`, the one owner.
 * `ACCESSORY_SET_CUE` went on 2026-09-09. Both absences are pinned so neither name comes back.
 */
import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import * as copy from './strength-focus-copy.ts';
import { BAR_SPEED_COPY } from './strength-focus-copy.ts';
import { intentLine } from '../../supabase/functions/_shared/strength-grid/intents.ts';

Deno.test('⛔ THE PHONE\'S OWN ACCESSORY / ME / DE CUES ARE GONE AND MAY NOT COME BACK', () => {
  for (const name of ['ACCESSORY_SET_CUE', 'STANDING_ACCESSORY_SET_CUE', 'STANDING_ME_SET_CUE', 'STANDING_DE_SET_CUE']) {
    assertEquals((copy as Record<string, unknown>)[name], undefined, `${name} is exported again`);
  }
  const logger = Deno.readTextFileSync(new URL('../components/StrengthLogger.tsx', import.meta.url));
  const imports = logger.slice(0, logger.indexOf('export default'));
  assertEquals(/^\s*(STANDING_)?ACCESSORY_SET_CUE,\s*$/m.test(imports), false, 'a deleted accessory cue is imported again');
  assertStringIncludes(imports, "from '@shared/strength-grid/intents'", 'the logger reads the one owner');
});

Deno.test('the accessory line is p218\'s HYP numbers, from the one owner', () => {
  assertEquals(intentLine('HYP'), '6 to 12 reps, 0 to 2 in reserve.');
  assert(!Object.values(BAR_SPEED_COPY).includes(intentLine('HYP')!));
});

Deno.test('deload line — states the fact before the instruction, and concedes nothing', () => {
  // Rewritten 2026-08-01 from "Nothing to prove. Move it fast anyway." The concession was the part
  // an athlete read, and it framed a prescribed light day as a write-off.
  const s = BAR_SPEED_COPY.deload.toLowerCase();
  assertStringIncludes(s, 'on purpose');
  for (const conceding of ['nothing to prove', 'anyway']) {
    assert(!s.includes(conceding), `deload line must not concede: ${BAR_SPEED_COPY.deload}`);
  }
});

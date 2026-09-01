// ============================================================================
// THE INVENTORY STAYS TRUE — because a generated doc nobody regenerates is just a stale doc with
// extra steps.
//
//   deno test --allow-read --allow-env --no-check supabase/functions/_shared/standing-plan/inventory.test.ts
//
// ⛔ WHAT IT CATCHES: a new edge function, a new frame slot, a new picker cell, or a changed import
// that moves the deploy closure — any of which silently makes `docs/INVENTORY.md` wrong. It goes red
// on the change that caused it, in the session that caused it, rather than three weeks later when
// somebody deploys off the old list.
//
//     npm run inventory:write
// ============================================================================

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { inventoryPath, render } from '../../../../scripts/inventory-lib.ts';

Deno.test('⛔ docs/INVENTORY.md still matches the code it is generated from', () => {
  const committed = Deno.readTextFileSync(inventoryPath);
  const fresh = render();
  if (committed === fresh) return;
  const c = committed.split('\n');
  const f = fresh.split('\n');
  const at = c.findIndex((line, i) => line !== f[i]);
  assertEquals(
    f[at], c[at],
    `⛔ docs/INVENTORY.md is stale at line ${at + 1}\n`
    + `   committed: ${c[at] ?? '(file ends)'}\n`
    + `   generated: ${f[at] ?? '(output ends)'}\n`
    + '   Regenerate:  npm run inventory:write',
  );
});

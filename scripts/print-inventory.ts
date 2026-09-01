// ============================================================================
// THE INVENTORY — CLI.
//
//   ~/.deno/bin/deno run --allow-read scripts/print-inventory.ts                     # to stdout
//   ~/.deno/bin/deno run --allow-read --allow-write scripts/print-inventory.ts --write
//
// ⚠️ The renderer is `scripts/inventory-lib.ts`; `inventory.test.ts` checks against the same one.
// ============================================================================

import { inventoryPath, render } from './inventory-lib.ts';

const text = render();
if (Deno.args.includes('--write')) {
  Deno.writeTextFileSync(inventoryPath, text);
  console.log(`wrote docs/INVENTORY.md (${text.split('\n').length} lines)`);
} else {
  console.log(text);
}

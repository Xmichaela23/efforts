// ============================================================================
// THE BLOCK PRINTER — CLI.
//
//   ~/.deno/bin/deno run --allow-read scripts/print-block.ts                     # line counts
//   ~/.deno/bin/deno run --allow-read scripts/print-block.ts commercial-gym      # print one
//   ~/.deno/bin/deno run --allow-read --allow-write scripts/print-block.ts --write   # rewrite golden/
//
// ⚠️ THE PRINTER ITSELF LIVES IN `_shared/standing-plan/golden-block.ts`, next to the output it
// writes, so `golden-block.test.ts` checks the SAME renderer this rewrites with. A CLI that carried
// its own copy would drift from the check and the check would stop meaning anything.
// ============================================================================

import { ARCHETYPES, goldenPath, render }
  from '../supabase/functions/_shared/standing-plan/golden-block.ts';

// ── entry ───────────────────────────────────────────────────────────────────────────────────────

const args = Deno.args;
const write = args.includes('--write');
const named = args.find((x) => !x.startsWith('--'));
const chosen = named ? ARCHETYPES.filter((a) => a.key === named) : ARCHETYPES;
if (chosen.length === 0) {
  console.error(`unknown archetype "${named}". known: ${ARCHETYPES.map((a) => a.key).join(', ')}`);
  Deno.exit(1);
}

for (const a of chosen) {
  const text = render(a);
  if (write) {
    Deno.writeTextFileSync(goldenPath(a.key), text);
    console.log(`wrote golden/${a.key}.txt  (${text.split('\n').length} lines)`);
  } else if (named) {
    console.log(text);
  } else {
    console.log(`${a.key}: ${text.split('\n').length} lines`);
  }
}

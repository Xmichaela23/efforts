/**
 * ⛔⛔ EVERY CONSTANT THE WIZARD USES IS IMPORTED OR DECLARED — the black-screen guard (2026-08-26).
 *
 * Michael, live on efforts.work: black screen on the endurance step. Console:
 * `Uncaught ReferenceError: HARD_SLOT_KEYS is not defined`. A helper added that morning used the
 * constant and never imported it; it is exported from `standing-plan-week-copy` alongside
 * `SLOT_KEYS`, which WAS imported two lines above.
 *
 * ⛔ NOTHING BETWEEN THE EDIT AND THE ATHLETE'S SCREEN WAS LOOKING:
 *   · `vite build` does not typecheck. esbuild treats an unresolved identifier as a GLOBAL and emits
 *     a bare reference, so the build succeeded and shipped a file that throws when that line runs.
 *   · `tsc --noEmit -p tsconfig.json` checks ZERO files. The root config is `{ files: [],
 *     references: [...] }` — solution style — and without `--build`, `-p` compiles nothing and exits
 *     0. Every "tsc clean" claimed that night was a no-op.
 *   · The Deno suite cannot import TSX at all.
 *
 * ⛔ THE REAL TYPECHECK IS `npx tsc --noEmit -p tsconfig.app.json`, and it names this exact error.
 * ⚠️ IT IS NOT A GATE TODAY: the repo carries ~317 pre-existing errors under that config, 3 of them
 * in this file. So a "must be clean" rule is not adoptable, and this test exists to catch the ONE
 * class that black-screens — an undefined CONSTANT — in milliseconds and with no toolchain.
 *
 * ⚠️ WHAT IT DOES NOT CATCH, said plainly: lower-case locals, member expressions, anything reached
 * through a namespace, and every other TypeScript error. It is a tripwire on the failure mode that
 * actually reached a user, not a substitute for the typecheck.
 *
 * Run from repo root:
 *   ~/.deno/bin/deno test --allow-read --no-check src/lib/wizard-identifiers.test.ts
 */
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';

/** ⛔ The wizard files that render the strength path. Add a file here when it joins that flow. */
const FILES = [
  'components/NonRaceBuilder.tsx',
  'components/EnduranceWeekCard.tsx',
  'components/HardSlotChoices.tsx',
];

/**
 * ⚠️ CONST_CASE ONLY — two or more chars, upper-case, digits and underscores. That is the shape of
 * an imported module constant, which is the shape that bit us. A single letter is excluded because
 * generic type parameters (`T`, `K`) read the same.
 */
const CONST_CASE = /\b[A-Z][A-Z0-9_]{1,}\b/g;

/**
 * ⛔ NAMES THAT ARE NOT MODULE CONSTANTS AND NEVER NEED IMPORTING. Each is a real language or
 * platform name; the list is short on purpose, because a long one would let a genuine miss hide in it.
 */
const NOT_A_MODULE_CONSTANT = new Set([
  'JSON', 'NaN', 'URL', 'DOM', 'CSS', 'HTML', 'API', 'UI', 'ID', 'OK',
  'GET', 'POST', 'PUT', 'PATCH', 'UTC', 'ISO', 'TODO', 'FIXME', 'NOTE',
]);

/**
 * Strip comments and string/template literals — prose is full of shouted words.
 *
 * ⚠️ LINE COUNT IS PRESERVED. A first draft collapsed block comments to a single space and the
 * failure message then named a line that did not exist in the source — a guard that reports the
 * wrong line is half a guard. Multi-line constructs are replaced with their own newlines.
 */
function code(src: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, ' ');
  return src
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + blank(m.slice(p1.length)))
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, blank);
}

for (const rel of FILES) {
  Deno.test(`⛔ ${rel} — no CONST_CASE identifier is used without being imported or declared`, async () => {
    const src = await Deno.readTextFile(new URL(`../${rel}`, import.meta.url));
    const body = code(src);

    /**
     * ⛔ EVERYTHING IN SCOPE: imported names, names declared in the file, enum-ish object keys, and
     * anything used as a property (`X.Y` — `Y` is a member, not a free identifier).
     * ⚠️ The import matcher takes the whole `{ ... }` clause including multi-line ones, which is how
     * this file's imports are actually written.
     */
    const inScope = new Set<string>(NOT_A_MODULE_CONSTANT);
    for (const m of body.matchAll(/import\s+(?:type\s+)?(?:[\w*]+\s*,\s*)?\{([\s\S]*?)\}\s*from/g)) {
      for (const part of m[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop()?.trim();
        if (name) inScope.add(name);
      }
    }
    for (const m of body.matchAll(/import\s+(\w+)\s+from/g)) inScope.add(m[1]);
    for (const m of body.matchAll(/\b(?:const|let|var|function|class|enum|type|interface)\s+([A-Z][A-Z0-9_]+)/g)) {
      inScope.add(m[1]);
    }

    const missing = new Map<string, number>();
    const lines = body.split('\n');
    lines.forEach((line, i) => {
      for (const m of line.matchAll(CONST_CASE)) {
        const name = m[0];
        if (inScope.has(name)) continue;
        // ⚠️ A MEMBER, NOT A FREE IDENTIFIER — `DAY.MONDAY`, `x?.CONST`, `{ CONST: 1 }`.
        const before = line.slice(Math.max(0, m.index! - 2), m.index!);
        const after = line.slice(m.index! + name.length, m.index! + name.length + 1);
        if (/\.$/.test(before) || after === ':') continue;
        if (!missing.has(name)) missing.set(name, i + 1);
      }
    });

    assert(
      missing.size === 0,
      `these constants are used but never imported or declared — they will be \`undefined\` at `
        + `runtime and throw the moment the line runs:\n`
        + [...missing].map(([n, l]) => `    ${n}  (line ${l})`).join('\n'),
    );
  });
}

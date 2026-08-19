#!/usr/bin/env node
/**
 * ⛔ THE TDZ CHECK — the class of bug that white-screened the wizard on 2026-08-18 and that neither
 * `tsc` nor the build can see.
 *
 * An IIFE (`const x = (() => {...})()`) runs the moment the component body reaches it. If it reads
 * a `const` declared further down, that is a temporal dead zone: `Cannot access 'X' before
 * initialization`, and the whole screen renders black. TypeScript flags a DIRECT
 * use-before-declaration (TS2448) but not one inside a function body, because a function COULD be
 * called later — and this one is called immediately.
 *
 * ⚠️ ARROW PARAMETERS ARE NOT OUTER REFERENCES. `pres.every((h) => h.role)` binds its own `h`; a
 * first draft of this check flagged it against an unrelated `const h` 2000 lines away. A checker
 * that cries wolf stops being read.
 *
 * Run: node scripts/check-tdz.mjs [file...]
 */
import { readFileSync } from 'node:fs';
const files = process.argv.slice(2).length ? process.argv.slice(2) : ['src/components/NonRaceBuilder.tsx'];
let bad = 0;
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  const decls = new Map();
  lines.forEach((l, i) => {
    const m = /^\s*const ([A-Za-z_$][\w$]*)\s*=/.exec(l);
    if (m && !decls.has(m[1])) decls.set(m[1], i);
  });
  lines.forEach((l, a) => {
    if (!/const [A-Za-z_$][\w$]*\s*=\s*\(\(\)\s*=>/.test(l)) return;
    let depth = 0, e = -1;
    for (let j = a; j < lines.length; j++) {
      depth += (lines[j].match(/\{/g) ?? []).length - (lines[j].match(/\}/g) ?? []).length;
      if (j > a && depth <= 0) { e = j; break; }
    }
    if (e < 0) return;
    const name = /const ([\w$]+)/.exec(l)[1];
    const body = lines.slice(a, e + 1).join('\n');
    const local = new Set([name]);
    for (const m of body.matchAll(/\bconst ([A-Za-z_$][\w$]*)/g)) local.add(m[1]);
    // arrow params, single and parenthesised
    for (const m of body.matchAll(/\(([^()]*)\)\s*=>/g)) {
      for (const p of m[1].split(',')) {
        const id = /^[\s{[]*([A-Za-z_$][\w$]*)/.exec(p.trim());
        if (id) local.add(id[1]);
      }
    }
    for (const m of body.matchAll(/\b([A-Za-z_$][\w$]*)\s*=>/g)) local.add(m[1]);
    const code = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '')
      .replace(/'[^']*'|"[^"]*"|`[^`]*`/g, '');
    for (const id of new Set([...code.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)].map((m) => m[1]))) {
      if (local.has(id)) continue;
      const d = decls.get(id);
      if (d !== undefined && d > a) {
        console.error(`  TDZ  ${file}:${a + 1}  ${name} reads \`${id}\` declared at line ${d + 1}`);
        bad++;
      }
    }
  });
}
console.log(bad ? `\n${bad} temporal-dead-zone reference(s)` : '  no IIFE reads a const declared below it');
process.exit(bad ? 1 : 0);

// ============================================================================
// THE INVENTORY — printed FROM THE CODE, never typed. THE MODULE.
//
// ⚠️ `print-inventory.ts` is the CLI over this and `inventory.test.ts` is the enforcement, so the
// file that is written and the file that is checked come from one renderer.
//
// ⛔⛔ WHY IT IS GENERATED. The parts of `CAPABILITY-MAP.md` that rotted were the hand-maintained
// LISTS — which functions exist, which cells the picker draws, which functions have to be redeployed
// when a shared file changes. Every one of those is a fact the code already holds, and every one of
// them was being kept by hand and going stale between sessions. **A list a human maintains is a list
// that lies; a list the code prints cannot.**
//
// ⚠️ WHAT DOES NOT BELONG HERE: anything that needs judgement — what is BUILT vs SURFACED, what is
// open, why a decision was made. That is `WHAT-IS-BUILT.md` and the decisions logs, written by a
// person. This file is only the facts a machine can read off the tree.
// ============================================================================

import { FRAMES, type FrameId, type ColumnKind } from '../supabase/functions/_shared/standing-plan/frames.ts';
import { PICK_KEYS_BY_FRAME, VIADA_PICKS, pickReachesFrame }
  from '../supabase/functions/_shared/standing-plan/accessory-picks.ts';

export const ROOT = new URL('../', import.meta.url).pathname;

// ── the edge functions, and the deploy closure that keeps catching people ───────────────────────
//
// ⛔ SUPABASE FREEZES A COPY OF `_shared` INTO EACH FUNCTION AT DEPLOY TIME. Editing a shared file
// changes nothing in production until every function that imports it is redeployed — no warning, no
// error, no test. This section is the answer to "what do I have to deploy", read off the imports.

function edgeFunctions(): string[] {
  const out: string[] = [];
  for (const e of Deno.readDirSync(`${ROOT}supabase/functions`)) {
    if (!e.isDirectory || e.name.startsWith('_') || e.name === 'shared') continue;
    try {
      Deno.statSync(`${ROOT}supabase/functions/${e.name}/index.ts`);
      out.push(e.name);
    } catch { /* a directory with no entry point is not a function */ }
  }
  return out.sort();
}

/**
 * ⛔⛔ A REAL IMPORT GRAPH, NOT A SUBSTRING SEARCH — and the first draft of this file proves why.
 * Matching the text `standing-plan/` reported `compute-facts` as an importer on the strength of a
 * COMMENT, and reported `strength-grid` as having NO importers at all when every standing-plan
 * function reaches it one hop further in. **A closure that is wrong in both directions is worse than
 * no closure**, because it is the list somebody deploys from.
 *
 * ⚠️ It reads `from '...'` specifiers and resolves the relative ones. Anything dynamic or bare is
 * not followed — stated rather than assumed.
 */
const SPEC = /from\s+['"](\.[^'"]+)['"]/g;

function fileImports(path: string): string[] {
  let text: string;
  try { text = Deno.readTextFileSync(path); } catch { return []; }
  const out: string[] = [];
  for (const m of text.matchAll(SPEC)) {
    const dir = path.slice(0, path.lastIndexOf('/'));
    const parts = `${dir}/${m[1]}`.split('/');
    const stack: string[] = [];
    for (const seg of parts) {
      if (seg === '.' || seg === '') continue;
      if (seg === '..') { stack.pop(); continue; }
      stack.push(seg);
    }
    out.push(`/${stack.join('/')}`);
  }
  return out;
}

/** Every file a function reaches, following relative imports until nothing new appears. */
function closureOf(fn: string): Set<string> {
  const seen = new Set<string>();
  const queue = [`${ROOT}supabase/functions/${fn}/index.ts`];
  while (queue.length) {
    const f = queue.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const next of fileImports(f)) if (!seen.has(next)) queue.push(next);
  }
  return seen;
}

/**
 * ⛔⛔ EVERY SHARED FILE, READ OFF THE CLOSURES — NOT A HAND-NAMED LIST OF FOLDERS.
 *
 * The first shape of this table enumerated `_shared/standing-plan/` per file and then hand-named two
 * more markers (`strength-grid/`, `strength-gear`). `_shared/state-trend/` was in neither. So a
 * session that edited it, correctly consulted THIS generated table, found no row, and reasonably
 * concluded there was nothing to deploy — the exact shape of the failure this repo records as having
 * stranded 17 functions for a month. **A hole in a generated list is worse than a hole in a
 * hand-written one, because the generated one is the list people are told to trust.**
 *
 * So the table is now driven from two directions and the union is printed:
 *   1. every file any function's bundle REACHES outside that function's own folder — `_shared/**`,
 *      `shared/**`, `src/lib/**`, and anything else a relative import can get to; a new shared
 *      folder cannot be missed because nothing here names folders;
 *   2. every non-test `.ts` on disk under `_shared/` and `shared/`, so a file nothing bundles still
 *      prints — as "— nothing bundles it", which is itself a fact worth seeing.
 * Matching is by exact resolved path, not substring: a `run/` marker would match
 * `endurance-library/run/…` and any other folder called `run`.
 */
function closures(fns: string[]): Map<string, Set<string>> {
  return new Map(fns.map((fn) => [fn, closureOf(fn)]));
}

function importersOf(path: string, cl: Map<string, Set<string>>): string[] {
  return [...cl.entries()].filter(([, set]) => set.has(path)).map(([fn]) => fn).sort();
}

function exists(path: string): boolean {
  try { return Deno.statSync(path).isFile; } catch { return false; }
}

/** Every non-test `.ts` under `dir`, recursively, as absolute paths. */
function sourceFilesUnder(dir: string): string[] {
  const out: string[] = [];
  let entries: Iterable<Deno.DirEntry>;
  try { entries = Deno.readDirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory) out.push(...sourceFilesUnder(p));
    else if (e.isFile && e.name.endsWith('.ts') && !e.name.includes('.test.')) out.push(p);
  }
  return out;
}

/** The shared files, grouped by folder (repo-relative), each with the functions that bundle it. */
function sharedFilesByFolder(fns: string[], cl: Map<string, Set<string>>): Map<string, Array<[string, string[]]>> {
  const all = new Set<string>();
  for (const [fn, set] of cl) {
    const own = `${ROOT}supabase/functions/${fn}/`;
    for (const f of set) if (!f.startsWith(own) && exists(f)) all.add(f);
  }
  for (const d of ['_shared', 'shared']) for (const f of sourceFilesUnder(`${ROOT}supabase/functions/${d}`)) all.add(f);

  const byFolder = new Map<string, Array<[string, string[]]>>();
  for (const abs of [...all].sort()) {
    const rel = abs.slice(ROOT.length);
    const folder = rel.slice(0, rel.lastIndexOf('/'));
    const file = rel.slice(rel.lastIndexOf('/') + 1);
    if (!byFolder.has(folder)) byFolder.set(folder, []);
    byFolder.get(folder)!.push([file, importersOf(abs, cl)]);
  }
  return byFolder;
}

// ── render ──────────────────────────────────────────────────────────────────────────────────────

function slotLine(frame: FrameId, column: ColumnKind): string[] {
  const days = FRAMES[frame].columns[column];
  return days.map((d) => {
    const lifts = d.strength.map((s) => `${s.intent}:${s.category}`).join(' · ');
    const endur = d.endurance.map((e) => e.family).join(' · ');
    const bits = [
      `  day ${d.day}`.padEnd(9),
      (d.label ?? (d.rest ? '(rest)' : d.plyo ? '(plyometrics)' : '—')).padEnd(20),
      lifts || '—',
    ];
    return `${bits.join(' ')}${endur ? `\n${' '.repeat(31)}endurance: ${endur}` : ''}`;
  });
}

export function render(): string {
  const fns = edgeFunctions();
  const cl = closures(fns);

  /**
   * ⛔ EVERY SHARED FILE ONE BY ONE, ONE TABLE PER FOLDER. A folder-level answer sends people to
   * deploy functions whose bundle does not contain the change; a folder that is not enumerated at
   * all sends them to deploy nothing (see `sharedFilesByFolder`). The folder heading carries the
   * UNION of its files' importers, so the old folder-level lines still exist — as a ceiling, above a
   * per-file floor.
   */
  const perFolder: string[] = [];
  for (const [folder, files] of sharedFilesByFolder(fns, cl)) {
    const union = [...new Set(files.flatMap(([, who]) => who))].sort();
    perFolder.push(
      `### \`${folder}/\` — ${files.length} file${files.length === 1 ? '' : 's'} · anything in it → ${union.length} function${union.length === 1 ? '' : 's'}`,
      '',
      union.length ? union.map((f) => `\`${f}\``).join(' · ') : '(nothing bundles this folder)',
      '',
      '| touch this file | redeploy these |',
      '|---|---|',
      ...files.map(([f, who]) => `| \`${f}\` | ${who.map((x) => `\`${x}\``).join(' · ') || '— nothing bundles it'} |`),
      '',
    );
  }

  const L: string[] = [
    '# INVENTORY — generated from the code',
    '',
    '⛔ **GENERATED. Do not hand-edit.** Regenerate with:',
    '',
    '```',
    'npm run inventory:write',
    '```',
    '',
    'These are the lists that rotted last time, so they are no longer written by hand. Anything here',
    'is a fact read off the tree; anything needing judgement — built vs surfaced, open vs closed, why —',
    'lives in `WHAT-IS-BUILT.md` and the decisions logs, written by a person.',
    '',
    '---',
    '',
    '## 1. THE DEPLOY CLOSURE — what you must redeploy when you touch a shared file',
    '',
    '⛔ Supabase freezes a copy of `_shared` into each function **at deploy time**. Editing a shared',
    'file changes nothing in production until every function that imports it is redeployed. There is',
    'no warning, no error, and no test that catches it.',
    '',
    '⚠️ Read off the real import graph and followed transitively. Dynamic and bare specifiers are',
    'not followed, so treat every list as the FLOOR on what to deploy.',
    '',
    '⛔ **PER FILE, NOT PER FOLDER, AND THAT MATTERS.** A directory-level answer over-reports: a',
    'function that imports only `frames.ts` does not carry `compose.ts` in its bundle, and deploying',
    'it on a `compose.ts` change is noise that trains people to ignore the list.',
    '',
    '⛔ **EVERY FOLDER A BUNDLE REACHES, NOT A HAND-NAMED FEW.** An earlier shape of this table listed',
    '`standing-plan/` per file and named two other markers by hand; `state-trend/` was in neither, so',
    'an edit there met a blank row and read as "nothing to deploy". Folders are now read off the',
    'bundles themselves — `_shared/`, `shared/`, `src/lib/`, and whatever else a relative import',
    'reaches — plus everything on disk under `_shared/` and `shared/`, so an unbundled file still',
    'prints as such. **If the file you touched has no row here, that is a generator bug, not a',
    'no-deploy.**',
    '',
    ...perFolder,
    '---',
    '',
    '## 2. THE FRAMES — the programmes, as transcribed',
    '',
  ];

  for (const id of Object.keys(FRAMES) as FrameId[]) {
    const f = FRAMES[id];
    L.push(`### \`${id}\` — ${f.displayName ?? f.sourceName}${f.displayName ? ` (the source calls it ${f.sourceName})` : ''}`);
    L.push('');
    L.push(`Source: ${f.cite} · ${f.liftingDays} lifting days · weekly rate anchor: **${f.workingNumberRatePerWeek === 0 ? 'ZERO — progression is earned, never scheduled' : f.workingNumberRatePerWeek}**`);
    for (const col of ['standard', 'taper'] as ColumnKind[]) {
      L.push('', `**${col} column**`, '', '```');
      L.push(...slotLine(id, col));
      L.push('```');
    }
    L.push('');
  }

  L.push('---', '', '## 3. THE PICKER — which cells each programme draws', '');
  L.push('⚠️ A cell is drawn when the frame carries an accessory slot the pick can fill. **`core` is');
  L.push('the deliberate exception**: neither page prints a core row, and it is offered anyway, opt-in.');
  L.push('');
  for (const id of Object.keys(FRAMES) as FrameId[]) {
    L.push(`**\`${id}\`** — ${PICK_KEYS_BY_FRAME[id].length} cells`, '');
    for (const k of PICK_KEYS_BY_FRAME[id]) {
      const reaches = pickReachesFrame(k, id);
      L.push(`- \`${k}\` — ${VIADA_PICKS[k].label}${reaches ? '' : '  ⚠️ names no printed cell (opt-in addition)'}`);
    }
    L.push('');
  }

  L.push('---', '', '## 4. EDGE FUNCTIONS', '', `${fns.length} functions with an entry point:`, '');
  L.push(fns.map((f) => `\`${f}\``).join(' · '));
  L.push('');
  return L.join('\n');
}


/** Where the generated file lives, resolved from here so both callers agree. */
export const inventoryPath = new URL('../docs/INVENTORY.md', import.meta.url);

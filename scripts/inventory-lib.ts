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

function importersOf(marker: string, fns: string[]): string[] {
  return fns.filter((fn) => [...closureOf(fn)].some((f) => f.includes(marker)));
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
  const standingPlan = importersOf('standing-plan/', fns);
  const strengthGrid = importersOf('strength-grid/', fns);
  const gear = importersOf('strength-gear', fns);

  /**
   * ⛔ THE STANDING-PLAN FILES ONE BY ONE. These are the files this project edits most, and a
   * folder-level answer sends people to deploy functions whose bundle does not contain the change.
   */
  const spDir = `${ROOT}supabase/functions/_shared/standing-plan`;
  const spFiles = [...Deno.readDirSync(spDir)]
    .filter((e) => e.isFile && e.name.endsWith('.ts') && !e.name.includes('.test.'))
    .map((e) => e.name).sort();
  const perFile = spFiles.map((f) => {
    const who = importersOf(`standing-plan/${f}`, fns);
    return `| \`${f}\` | ${who.map((x) => `\`${x}\``).join(' · ') || '— nothing bundles it' } |`;
  });

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
    '| touch this file | redeploy these |',
    '|---|---|',
    ...perFile,
    '',
    `**Anything in \`_shared/strength-grid/\`** → ${strengthGrid.length} functions: ${strengthGrid.map((f) => `\`${f}\``).join(' · ') || '(none)'}`,
    '',
    `**\`src/lib/strength-gear.ts\`** → ${gear.length} functions: ${gear.map((f) => `\`${f}\``).join(' · ') || '(none)'}`,
    '',
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

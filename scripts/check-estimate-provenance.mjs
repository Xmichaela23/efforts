#!/usr/bin/env node
/**
 * D-237 estimate-provenance guard  —  "clean = enforced, not asserted."
 *
 * Fails the build when a NUMERIC FALLBACK (hardcoded literal / `?? default` / `|| default`
 * / a "if missing use X" guard-return / a missing-input ternary else) is introduced in a
 * load-bearing module WITHOUT declaring itself as an estimate. This is the write-site
 * tripwire for the C1–C5 / W1–W2 silent-impersonation class (see docs/DESIGN-D237-lint-guard.md).
 *
 * It does NOT trace flow-to-string (undecidable across DB round-trips / call boundaries).
 * It enforces a LOCAL contract at the fallback site: a fallback is SILENT unless one of —
 *   (1) it lives inside a declaredDefaultProvider (the sanctioned default source), OR
 *   (2) its enclosing function declares provenance (a *_method / *_estimated marker), OR
 *   (3) it carries an adjacent `/* estimate-ok: <reason> *​/` annotation.
 *
 * Rule A (source-site) only. Rule B (string-sink side) is deferred by design.
 *
 * Since Stage 6 of the one-truth workorder this is also the one-truth guard
 * (docs/DESIGN-one-truth-guard.md): the D-237 check above is RULE 0, beside five more —
 *   rule 1 (a) a screen component works out a number        (src/components, JSX)
 *   rule 2 (b) a load-bearing constant with no source / an OURS marker with no ledger row
 *   rule 3 (c) one derived field written by two server steps (whole supabase/functions tree)
 *   rule 4 (d) a provider-field chain longer than sent → computed
 *   rule 5 (e) a composer string printing a number with no source
 *   rule 6 (f) a status word or label chosen on the phone (src/components, JSX)
 * Each rule is warn or fail in config.truth.severity. Hits inside config.truth.parked (the race
 * path, WORKORDER §3a) are counted and never fail.
 *
 * Usage:  node scripts/check-estimate-provenance.mjs [--rule N] [--fail-only] [--parked] [--json]
 * Config: scripts/estimate-provenance.config.json
 * Exit:   0 = no hit on a FAIL rule, 1 = a FAIL rule has hits, 2 = tool/config error.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';
import ts from 'typescript';

const rawArgs = process.argv.slice(2);
const argv = new Set(rawArgs);
const AS_JSON = argv.has('--json');
const cfgIdx = rawArgs.indexOf('--config');
const CONFIG_OVERRIDE = cfgIdx >= 0 ? rawArgs[cfgIdx + 1] : null;

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');
const CONFIG_PATH = CONFIG_OVERRIDE ? resolve(process.cwd(), CONFIG_OVERRIDE) : resolve(__dirname, 'estimate-provenance.config.json');

// --------------------------------------------------------------------------
// Config
// --------------------------------------------------------------------------
let config;
try {
  config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
} catch (e) {
  console.error(`[provenance] cannot read ${CONFIG_PATH}: ${e.message}`);
  process.exit(2);
}
const FILES = config.files || [];
const PROVIDERS = new Set(config.declaredDefaultProviders || []);
const PROV_TOKENS = new RegExp((config.provenanceTokens || []).map(escapeRe).join('|'));
const DEFAULT_NAME = new RegExp(config.defaultNamePattern || 'REF_|_DEFAULT', 'i');
const IGNORE_VALUES = new Set(config.ignoreValues || [0]);
const ANNOTATION = /estimate-ok\s*:/;
const KNOWN_EXCEPTIONS = config.knownExceptions || [];

/** A violation matches a known (ticketed) exception by file + fallback text — line-independent. */
function matchException(v) {
  return KNOWN_EXCEPTIONS.find((e) =>
    (v.file === e.file || v.file.endsWith(e.file)) && v.fallback === e.fallback);
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// --------------------------------------------------------------------------
// Value classification
// --------------------------------------------------------------------------

/** A non-zero numeric literal (the impersonating-estimate shape). Negative handled too. */
function numericLiteralValue(node) {
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken &&
      ts.isNumericLiteral(node.operand)) return -Number(node.operand.text);
  return null;
}

/** Name of an identifier / property-access / element-access, for default-name matching. */
function nameOf(node) {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return `${nameOf(node.expression) || ''}.${node.name.text}`;
  if (ts.isElementAccessExpression(node)) return nameOf(node.expression) || '';
  return null;
}

/** Is this expression a "default-ish" value: a non-zero numeric literal OR a named-default ref. */
function classifyDefault(node) {
  const num = numericLiteralValue(node);
  // Non-positive literals (0, negatives) are "empty/none/sentinel" markers (score:-1, x ?? 0),
  // not fabricated physiological/load estimates — out of scope.
  if (num !== null) return (num <= 0 || IGNORE_VALUES.has(num)) ? null : { kind: 'literal', text: String(num) };
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node) || ts.isIdentifier(node)) {
    const nm = nameOf(node);
    if (nm && DEFAULT_NAME.test(nm)) return { kind: 'named', text: node.getText() };
  }
  return null;
}

/** Is this expression a plain "real" value (not default-ish) — the live signal in a ternary. */
function isRealish(node) {
  if (classifyDefault(node) !== null) return false;
  if (numericLiteralValue(node) !== null) return false; // an ignored literal (0) is neither
  return ts.isIdentifier(node) || ts.isPropertyAccessExpression(node) ||
         ts.isElementAccessExpression(node) || ts.isCallExpression(node) ||
         ts.isAwaitExpression(node) || ts.isParenthesizedExpression(node);
}

// --------------------------------------------------------------------------
// Missing / invalid-input test detection (recursive)
// --------------------------------------------------------------------------
// The discriminator between "substitute for absent data" (flag) and an ordinary
// classification branch like `pHard >= 0.2` (don't flag).

function isMissingTest(node) {
  if (!node) return false;
  if (ts.isParenthesizedExpression(node)) return isMissingTest(node.expression);
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) return true;
  if (ts.isCallExpression(node)) {
    const c = node.expression.getText();
    if (/(^|\.)(isFinite|isNaN|isInteger)$/.test(c) || c === 'isNaN' || c === 'Boolean') return true;
  }
  if (ts.isTypeOfExpression(node)) return true;
  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind;
    // logical: recurse both sides
    if (op === ts.SyntaxKind.AmpersandAmpersandToken || op === ts.SyntaxKind.BarBarToken)
      return isMissingTest(node.left) || isMissingTest(node.right);
    // == null / === undefined / != null ...
    const eq = op === ts.SyntaxKind.EqualsEqualsToken || op === ts.SyntaxKind.EqualsEqualsEqualsToken ||
               op === ts.SyntaxKind.ExclamationEqualsToken || op === ts.SyntaxKind.ExclamationEqualsEqualsToken;
    if (eq && (isNullish(node.left) || isNullish(node.right))) return true;
    // relational against literal 0 (empty / non-positive test)
    const rel = op === ts.SyntaxKind.LessThanToken || op === ts.SyntaxKind.LessThanEqualsToken ||
                op === ts.SyntaxKind.GreaterThanToken || op === ts.SyntaxKind.GreaterThanEqualsToken;
    if (rel && (isZero(node.left) || isZero(node.right))) return true;
  }
  // any `.length` reference inside the condition is an empty-check tell
  if (/\.length\b/.test(node.getText())) return true;
  return false;
}
function isNullish(n) {
  return n.kind === ts.SyntaxKind.NullKeyword ||
         (ts.isIdentifier(n) && n.text === 'undefined');
}
function isZero(n) { return ts.isNumericLiteral(n) && Number(n.text) === 0; }

// --------------------------------------------------------------------------
// Enclosing function helpers
// --------------------------------------------------------------------------

function enclosingFunction(node) {
  let n = node.parent;
  while (n) {
    if (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) ||
        ts.isArrowFunction(n) || ts.isMethodDeclaration(n) ||
        ts.isConstructorDeclaration(n) || ts.isGetAccessorDeclaration(n)) return n;
    n = n.parent;
  }
  return null;
}
function functionName(fn) {
  if (!fn) return null;
  if (fn.name && ts.isIdentifier(fn.name)) return fn.name.text;
  // `const foo = (..) => ..` / `const foo = function(){}`
  const p = fn.parent;
  if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
  if (p && ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) return p.name.text;
  return null;
}

// --------------------------------------------------------------------------
// Pass/flag decision for a detected fallback
// --------------------------------------------------------------------------

function isDeclared(node, sf, lines) {
  // Collect the full chain of enclosing functions (a fallback inside a nested map/closure
  // still belongs to its outer named function for provider purposes).
  const fns = [];
  for (let fn = enclosingFunction(node); fn; fn = enclosingFunction(fn)) fns.push(fn);
  const fn = fns[0] || null;
  // (1) inside a sanctioned default provider (any ancestor)
  for (const f of fns) if (PROVIDERS.has(functionName(f))) return { declared: true, why: 'declaredDefaultProvider' };
  // (2) NEAREST enclosing function declares provenance (a workload_method / *_estimated marker).
  //     Nearest-only on purpose: a marker in an outer scope must not silently cover an inner helper.
  if (fn && PROV_TOKENS.source && PROV_TOKENS.test(fn.getText())) return { declared: true, why: 'provenance-token in enclosing fn' };
  // (3) adjacent estimate-ok annotation (same line, up to 3 lines above, or the fn declaration line)
  const line = sf.getLineAndCharacterOfPosition(node.getStart()).line;
  for (let l = Math.max(0, line - 3); l <= line; l++) {
    if (lines[l] && ANNOTATION.test(lines[l])) return { declared: true, why: 'estimate-ok annotation' };
  }
  if (fn) {
    const fnLine = sf.getLineAndCharacterOfPosition(fn.getStart()).line;
    if (lines[fnLine] && ANNOTATION.test(lines[fnLine])) return { declared: true, why: 'estimate-ok annotation (fn)' };
  }
  return { declared: false };
}

// --------------------------------------------------------------------------
// Detection walk
// --------------------------------------------------------------------------

function scanFile(relPath) {
  const abs = resolve(REPO, relPath);
  let text;
  try { text = readFileSync(abs, 'utf8'); }
  catch (e) { return { error: `cannot read ${relPath}: ${e.message}` }; }
  const sf = ts.createSourceFile(relPath, text, ts.ScriptTarget.Latest, /*setParentNodes*/ true, ts.ScriptKind.TS);
  const lines = text.split('\n');
  const findings = [];

  const record = (node, fallbackText, form) => {
    const d = isDeclared(node, sf, lines);
    const pos = sf.getLineAndCharacterOfPosition(node.getStart());
    const rec = {
      file: relPath, line: pos.line + 1, col: pos.character + 1,
      form, fallback: fallbackText,
      snippet: (lines[pos.line] || '').trim().slice(0, 160),
      declared: d.declared, why: d.why || null,
    };
    findings.push(rec);
  };

  const visit = (node) => {
    // Form 1 — `A ?? B` / `A || B`, B default-ish
    if (ts.isBinaryExpression(node) &&
        (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
         node.operatorToken.kind === ts.SyntaxKind.BarBarToken)) {
      const cd = classifyDefault(node.right);
      if (cd) record(node.right, cd.text, node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ? '??-fallback' : '||-fallback');
    }

    // Form 2 — `COND ? X : Y` where exactly one branch is default-ish AND COND is a missing-test
    if (ts.isConditionalExpression(node)) {
      const t = classifyDefault(node.whenTrue), f = classifyDefault(node.whenFalse);
      const fallbackBranch = (f && isRealish(node.whenTrue)) ? node.whenFalse
                           : (t && isRealish(node.whenFalse)) ? node.whenTrue : null;
      const cd = fallbackBranch === node.whenFalse ? f : fallbackBranch === node.whenTrue ? t : null;
      if (fallbackBranch && cd && isMissingTest(node.condition)) record(fallbackBranch, cd.text, 'ternary-fallback');
    }

    // Form 3 — `if (missing) return <numeric|named-default>` (incl. object-literal property)
    if (ts.isIfStatement(node) && isMissingTest(node.expression)) {
      collectGuardReturns(node.thenStatement, (valNode, cd) => record(valNode, cd.text, 'guard-return'));
    }

    // Form 4 — destructuring / parameter default `{ x = <numeric> }`
    if (ts.isBindingElement(node) && node.initializer) {
      const cd = classifyDefault(node.initializer);
      if (cd) record(node.initializer, cd.text, 'binding-default');
    }
    if (ts.isParameter(node) && node.initializer) {
      const cd = classifyDefault(node.initializer);
      if (cd) record(node.initializer, cd.text, 'param-default');
    }

    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { findings };
}

/** Walk a guard body's `return` statements and surface default-ish returned values. */
function collectGuardReturns(stmt, emit) {
  const walk = (n) => {
    if (ts.isFunctionLike(n)) return; // don't descend into nested closures
    if (ts.isReturnStatement(n) && n.expression) {
      const e = n.expression;
      const cd = classifyDefault(e);
      if (cd) emit(e, cd);
      else if (ts.isObjectLiteralExpression(e)) {
        for (const p of e.properties) {
          if (ts.isPropertyAssignment(p)) {
            const pcd = classifyDefault(p.initializer);
            if (pcd) emit(p.initializer, { kind: pcd.kind, text: `${p.name.getText()}: ${pcd.text}` });
          }
        }
      }
    }
    ts.forEachChild(n, walk);
  };
  walk(stmt);
}
// ==========================================================================
// THE ONE-TRUTH RULE PACK — docs/DESIGN-one-truth-guard.md (Stage 6).
// Rule 0 above is D-237, unchanged. Rules 1–5 are the design's five rules; each carries its own
// warn / fail switch in config.truth.severity. Output is file:line and the rule broken.
// ==========================================================================

const TRUTH = config.truth || {};
const SEVERITY = { 0: 'warn', ...(TRUTH.severity || {}) };
const RULE_LABEL = {
  0: 'rule 0 · estimate fallback not declared',
  1: 'rule 1 (a) · screen works out a number',
  2: 'rule 2 (b) · constant with no source',
  '2-ledger': 'rule 2 (b) · OURS with no ledger row',
  3: 'rule 3 (c) · derived field written by two steps',
  4: 'rule 4 (d) · chain longer than sent → computed',
  5: 'rule 5 (e) · composer prints a number with no source',
  6: 'rule 6 (f) · status word chosen on the phone',
};
const RULE_ORDER = ['0', '1', '2', '2-ledger', '3', '4', '5', '6'];

function flagValue(name) { const i = rawArgs.indexOf(name); return i >= 0 ? rawArgs[i + 1] : null; }
const ONLY_RULE = flagValue('--rule');
const FAIL_ONLY = argv.has('--fail-only');
const SHOW_PARKED = argv.has('--parked');
const ruleOn = (r) => !ONLY_RULE || String(r) === ONLY_RULE || String(r).startsWith(`${ONLY_RULE}-`);

// ---- files -----------------------------------------------------------------
function listFiles(relDir) {
  const out = [];
  const walk = (d) => {
    let ents;
    try { ents = readdirSync(resolve(REPO, d), { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = `${d}/${e.name}`;
      if (e.isDirectory()) { if (e.name !== 'node_modules' && !e.name.startsWith('.')) walk(p); continue; }
      if (!/\.tsx?$/.test(e.name) || /\.(test|spec)\.tsx?$/.test(e.name) || e.name.endsWith('.d.ts')) continue;
      out.push(p);
    }
  };
  walk(relDir);
  return out.sort();
}
const ALL_FILES = [...listFiles('supabase/functions'), ...listFiles('src')];

function globRe(g) {
  let re = '';
  for (let i = 0; i < g.length; i++) {
    if (g.startsWith('**/', i)) { re += '(?:.*/)?'; i += 2; }
    else if (g.startsWith('**', i)) { re += '.*'; i += 1; }
    else if (g[i] === '*') re += '[^/]*';
    else re += escapeRe(g[i]);
  }
  return new RegExp(`^${re}$`);
}
const filesIn = (globs) => { const res = (globs || []).map(globRe); return ALL_FILES.filter((f) => res.some((r) => r.test(f))); };

const SRC = new Map();
function source(rel) {
  let s = SRC.get(rel);
  if (!s) { const text = readFileSync(resolve(REPO, rel), 'utf8'); s = { text, lines: text.split('\n'), sf: null }; SRC.set(rel, s); }
  return s;
}
function astOf(rel) {
  const s = source(rel);
  if (!s.sf) s.sf = ts.createSourceFile(rel, s.text, ts.ScriptTarget.Latest, true, rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  return s.sf;
}
const lineOf = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line; // 0-based
const windowText = (lines, i, above, below) => lines.slice(Math.max(0, i - above), Math.min(lines.length, i + below + 1)).join('\n');
const markNear = (lines, i, re) => re.test(lines[i] || '') || re.test(lines[i - 1] || '');

// ---- parked (WORKORDER §3a): path globs, plus a `parked:` comment on a block (design §7) ----
const PARKED = (TRUTH.parked || []).map((p) => ({ ...p, re: globRe(p.path) }));
const isParkedPath = (rel) => PARKED.some((p) => p.re.test(rel));
const PARKED_MARK = /parked\s*:/i;
function inParkedBlock(sf, node) { return inMarkedBlock(sf, node, PARKED_MARK); }
// a marker in a leading comment on the node or any enclosing statement / declaration, or a {/* … */} JSX child before it
function inMarkedBlock(sf, node, MARK) {
  for (let a = node; a && a.kind !== ts.SyntaxKind.SourceFile; a = a.parent) {
    const lead = ts.getLeadingCommentRanges(sf.text, a.getFullStart()) || [];
    if (lead.some((c) => MARK.test(sf.text.slice(c.pos, c.end)))) return true;
    const p = a.parent;
    if (p && (ts.isJsxElement(p) || ts.isJsxFragment(p))) {
      const kids = p.children; const idx = kids.indexOf(a);
      for (let k = idx - 1; k >= 0; k--) {
        const sib = kids[k];
        if (ts.isJsxText(sib) && !sib.getText(sf).trim()) continue;
        if (ts.isJsxExpression(sib) && !sib.expression && MARK.test(sib.getText(sf))) return true;
        break;
      }
    }
  }
  return false;
}

// ---- the citation grammar (design §2.3) ----
const CITE = new RegExp([
  String.raw`\bpp?\s?\d{2,3}\b`, String.raw`\bViada\b`, String.raw`FIELD\s*[—-]`,
  'TrainingPeaks', 'Garmin', 'Strava', 'intervals\\.icu', 'TrainerRoad', 'COROS', 'Runna', 'WKO5',
  'Friel', 'Daniels', 'Brzycki', 'Epley', 'Coggan', 'Karvonen', 'Tanaka', 'Gulati', 'Foster', 'Smyth',
  // Stage 7 session 1: standards bodies cited for bar, plate and unit definitions.
  String.raw`\bIPF\b`, String.raw`\bIWF\b`, String.raw`\bNIST\b`,
  'SOURCE-viada', 'STATE-SOURCES:\\d+', 'ledger row',
].join('|'), 'i');
const OURS = /\bOURS\b/;

const hits = [];       // { rule, file, line, what }
const parkedHits = [];
const allowed = { plumbing: 0, partitioned: 0, keyed: 0 };
function push(rule, file, line, what, parked) {
  (parked ? parkedHits : hits).push({ rule: String(rule), file, line, what: what || null });
}

// ---- rule 1 (a): a component may render a server field; it may not work one out (design §1) ----
function rule1() {
  const CONV = [1609, 1609.34, 1609.344, 1.609344, 0.621371, 0.453592, 2.2046, 1.09361, 0.9144, 2.237, 0.3048, 3.28084, 25.4]; // 0.621371 = 1 ÷ 1.609344
  const TIME_DIV = new Set([60, 3600, 1000, 86400, 86400000, 24, 7]);
  const LOOP = /^(i|j|k|n|idx|index|len|count|page|step|row|col|\w+Index|\w+Idx)$/;
  // a chain whose every field is text or identity (name, id, date…) is not a number
  const TEXT_FIELD = /(^|_)(id|name|title|label|description|date|type|status|notes?|url|series|exercises|summaries|text|words|key)$/i;
  const ITER = /\.(sort|map|filter|reduce|slice|findIndex)$/;
  const DATE = /getTime\(\)|Date\.now|toISOString|getFullYear|setDate|getDate|T00:00:00/;
  const GEOM = /\b(clientX|clientY|innerWidth|innerHeight|timeStamp|getBoundingClientRect|scrollTop|scrollLeft|width|height|padding|margin|domain|scale|\w+(Width|Height|Padding|Margin|Domain|Scale))\b/;
  // SVG, layout and handler attributes carry pixels or behaviour, never a printed athlete number.
  const SKIP_ATTR = /^(on[A-Z]\w*|key|ref|style|className|x|y|x1|x2|y1|y2|cx|cy|r|rx|ry|dx|dy|d|points|transform|viewBox|width|height|strokeDasharray|strokeDashoffset|strokeWidth|opacity|fillOpacity|strokeOpacity|offset|fontSize|top|left|right|bottom|radius|innerRadius|outerRadius|startAngle|endAngle|tabIndex|zIndex)$/;
  const SERVER_FIELD = /server-field\s*:/;
  // Stage 7 markers, each with a reason after the dash: pixels / axis ticks that are not a printed athlete number,
  // and a calculator or timer that works off what the athlete is typing or doing on the device right now.
  const LAYOUT = /guard:\s*layout\s*[—–-]\s*\S/;
  const DEVICE = /guard:\s*device\s*[—–-]\s*\S/;
  const K = ts.SyntaxKind;
  const ARITH = new Set([K.PlusToken, K.MinusToken, K.AsteriskToken, K.SlashToken, K.PercentToken]);
  const CMP = new Set([K.LessThanToken, K.LessThanEqualsToken, K.GreaterThanToken, K.GreaterThanEqualsToken, K.EqualsEqualsEqualsToken, K.EqualsEqualsToken, K.ExclamationEqualsEqualsToken, K.ExclamationEqualsToken]);
  const isArith = (n) => !!n && ts.isBinaryExpression(n) && ARITH.has(n.operatorToken.kind);
  const isChainOp = (n) => !!n && ts.isBinaryExpression(n) && (n.operatorToken.kind === K.QuestionQuestionToken || n.operatorToken.kind === K.BarBarToken);
  const stripParen = (n) => { while (n && ts.isParenthesizedExpression(n)) n = n.expression; return n; };
  const unwrap = (n) => {
    while (n && (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isNonNullExpression(n) ||
      (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && /^(Number|parseFloat|parseInt)$/.test(n.expression.text) && n.arguments.length === 1))) {
      n = ts.isCallExpression(n) ? n.arguments[0] : n.expression;
    }
    return n;
  };
  const numLit = (n) => {
    n = unwrap(n);
    if (!n) return null;
    if (ts.isNumericLiteral(n)) return Number(n.text);
    if (ts.isPrefixUnaryExpression(n) && n.operator === K.MinusToken && ts.isNumericLiteral(n.operand)) return -Number(n.operand.text);
    return null;
  };
  const isConv = (v) => v !== null && v > 0 && CONV.some((c) => Math.abs(v - c) / c < 0.001);
  const isDataRead = (n) => {
    n = unwrap(n);
    if (!n) return false;
    if (ts.isPropertyAccessExpression(n)) return n.name.text !== 'length';
    if (ts.isElementAccessExpression(n)) return true;
    if (ts.isCallExpression(n)) return !!n.questionDotToken || /\?\./.test(n.expression.getText());
    return false;
  };
  const isStringy = (n) => { n = unwrap(n); return !!n && (ts.isStringLiteral(n) || ts.isTemplateExpression(n) || ts.isNoSubstitutionTemplateLiteral(n)); };
  const carriesNumber = (n) => {
    n = unwrap(n);
    if (!n) return false;
    if (numLit(n) !== null) return true;
    if (isArith(n)) return true;
    if (ts.isConditionalExpression(n)) return carriesNumber(n.whenTrue) || carriesNumber(n.whenFalse);
    if (ts.isCallExpression(n)) return /^Math\.|\.toFixed$|\.toLocaleString$/.test(n.expression.getText());
    if (ts.isTemplateExpression(n)) return n.templateSpans.some((s) => carriesNumber(s.expression));
    return false;
  };

  for (const rel of filesIn(TRUTH.scopes?.rule1)) {
    const s = source(rel);
    if (!/<\w/.test(s.text)) continue;
    const sf = astOf(rel);
    const pathParked = isParkedPath(rel);
    const seen = new Set();
    const decls = new Map();
    const collect = (n) => {
      const named = (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && n.parent && (n.parent.flags & ts.NodeFlags.Const)) ||
        (ts.isFunctionDeclaration(n) && n.name && n.body);
      if (named) {
        if (!decls.has(n.name.text)) decls.set(n.name.text, []);
        decls.get(n.name.text).push(n);
      }
      ts.forEachChild(n, collect);
    };
    collect(sf);
    // the nearest `const` of that name whose block contains the use
    const resolveConst = (id) => {
      let best = null;
      for (const d of decls.get(id.text) || []) {
        let scope = d.parent;
        while (scope && !ts.isBlock(scope) && !ts.isSourceFile(scope) && !ts.isFunctionLike(scope)) scope = scope.parent;
        if (!scope || id.pos < scope.pos || id.end > scope.end) continue;
        if (!best || d.pos > best.pos) best = d;
      }
      return best;
    };
    const report = (node, cat) => {
      const key = `${node.getStart(sf)}:${cat}`;
      if (seen.has(key)) return;
      seen.add(key);
      const line = lineOf(sf, node);
      if (markNear(s.lines, line, SERVER_FIELD) || markNear(s.lines, line, LAYOUT) || markNear(s.lines, line, DEVICE)) return;
      if (inMarkedBlock(sf, node, LAYOUT) || inMarkedBlock(sf, node, DEVICE)) return;
      push(1, rel, line + 1, cat, pathParked || inParkedBlock(sf, node));
    };
    const insideIter = (node, root) => {
      for (let a = node.parent; a && a !== root.parent; a = a.parent) {
        if (ts.isCallExpression(a) && ITER.test(a.expression.getText(sf))) return true;
      }
      return false;
    };

    const examine = (root, depth, visited) => {
      const visit = (n) => {
        if (n !== root && (ts.isFunctionLike(n) || ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n))) return;
        // an immediately-called function `(() => { … })()`: its body is the value that reaches the screen
        if (ts.isCallExpression(n) && n.arguments.length === 0) {
          const callee = stripParen(n.expression);
          if (callee && (ts.isArrowFunction(callee) || ts.isFunctionExpression(callee)) && !visited.has(callee)) {
            visited.add(callee);
            examine(callee.body, depth, visited);
          }
        }
        // follow a local const, up to three hops
        if (ts.isIdentifier(n) && depth < 3 && n.parent &&
            !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) &&
            !(ts.isPropertyAssignment(n.parent) && n.parent.name === n)) {
          const d = resolveConst(n);
          if (d && !visited.has(d)) {
            visited.add(d);
            const inner = ts.isFunctionDeclaration(d) ? d : unwrap(d.initializer);
            if (inner && ts.isCallExpression(inner) && ts.isIdentifier(inner.expression) && inner.expression.text === 'useMemo' &&
                inner.arguments[0] && ts.isArrowFunction(inner.arguments[0])) {
              const body = inner.arguments[0].body;
              if (!ts.isBlock(body)) examine(body, depth + 1, visited);
              else {
                const rets = [];
                const w = (x) => { if (ts.isFunctionLike(x)) return; if (ts.isReturnStatement(x) && x.expression) rets.push(x.expression); ts.forEachChild(x, w); };
                ts.forEachChild(body, w);
                rets.forEach((r) => examine(r, depth + 1, visited));
              }
            } else if (inner && ts.isFunctionLike(inner) && inner.body) {
              examine(inner.body, depth + 1, visited); // a local helper the screen calls: its maths reaches the screen
            } else if (inner && !ts.isFunctionLike(inner)) examine(d.initializer, depth + 1, visited);
          }
        }
        // arithmetic / unit pick — judged once, on the whole arithmetic chain
        if (isArith(n)) {
          let up = n.parent; while (up && ts.isParenthesizedExpression(up)) up = up.parent;
          if (!isArith(up)) {
            const text = n.getText(sf);
            const bins = [];
            const flat = (x) => { x = stripParen(x); if (isArith(x)) { bins.push(x); flat(x.left); flat(x.right); } };
            flat(n);
            const operands = bins.flatMap((b) => [b.left, b.right]).filter((o) => !isArith(stripParen(o)));
            if (operands.some((o) => isConv(numLit(o)))) report(n, 'unit pick');
            else if (operands.some(isDataRead)) {
              const concat = bins.some((b) => b.operatorToken.kind === K.PlusToken) && operands.some(isStringy);
              const timeOnly = bins.every((b) => (b.operatorToken.kind === K.SlashToken || b.operatorToken.kind === K.PercentToken) && TIME_DIV.has(numLit(b.right)));
              const loop = operands.some((o) => { o = unwrap(o); return !!o && ((ts.isIdentifier(o) && LOOP.test(o.text)) || (ts.isPropertyAccessExpression(o) && LOOP.test(o.name.text))); });
              if (!(concat || timeOnly || loop || insideIter(n, root) || /\.length\b/.test(text) || DATE.test(text) || GEOM.test(text))) {
                report(n, 'arithmetic on a fetched value');
              }
            }
          }
        }
        // a threshold that picks which number is printed
        if (ts.isConditionalExpression(n)) {
          const cmpLit = (c) => {
            c = stripParen(c);
            if (!c || !ts.isBinaryExpression(c)) return false;
            if (c.operatorToken.kind === K.AmpersandAmpersandToken || c.operatorToken.kind === K.BarBarToken) return cmpLit(c.left) || cmpLit(c.right);
            if (!CMP.has(c.operatorToken.kind)) return false;
            const l = numLit(c.left), r = numLit(c.right);
            return (l !== null && l !== 0) || (r !== null && r !== 0);
          };
          const ct = n.condition.getText(sf);
          if (cmpLit(n.condition) && carriesNumber(n.whenTrue) && carriesNumber(n.whenFalse) &&
              !/\.length\b/.test(ct) && !DATE.test(ct) && !GEOM.test(ct)) report(n, 'threshold picking a printed number');
        }
        // a fallback chain of three or more rungs
        if (isChainOp(n)) {
          let up = n.parent; while (up && ts.isParenthesizedExpression(up)) up = up.parent;
          if (!isChainOp(up)) {
            const rungs = [];
            const flat = (x) => { const u = stripParen(x); if (isChainOp(u)) { flat(u.left); flat(u.right); } else if (!(u.kind === K.NullKeyword || (ts.isIdentifier(u) && u.text === 'undefined'))) rungs.push(u); };
            flat(n); // a null / undefined rung is "none", not a rung
            const lastName = (r) => { const u = unwrap(r); return u && ts.isPropertyAccessExpression(u) ? u.name.text : u && ts.isElementAccessExpression(u) && ts.isStringLiteralLike(u.argumentExpression) ? u.argumentExpression.text : null; };
            const reads = rungs.filter(isDataRead);
            const textOnly = reads.length > 0 && reads.every((r) => { const nm = lastName(r); return nm !== null && TEXT_FIELD.test(nm); });
            const boolCtx = up && ((ts.isConditionalExpression(up) && stripParen(up.condition) === n) || ts.isIfStatement(up) ||
              (ts.isPrefixUnaryExpression(up) && up.operator === K.ExclamationToken) ||
              (ts.isBinaryExpression(up) && (up.operatorToken.kind === K.AmpersandAmpersandToken || CMP.has(up.operatorToken.kind))));
            const badRung = rungs.some((r) => {
              const u = unwrap(r);
              return !u || isStringy(u) || ts.isTypeOfExpression(u) || (ts.isBinaryExpression(u) && CMP.has(u.operatorToken.kind)) ||
                u.kind === K.TrueKeyword || u.kind === K.FalseKeyword || ts.isObjectLiteralExpression(u) || ts.isArrayLiteralExpression(u) || ts.isNewExpression(u) || ts.isJsxElement(u) || ts.isJsxSelfClosingElement(u) || ts.isJsxFragment(u) ||
                (ts.isPrefixUnaryExpression(u) && u.operator === K.ExclamationToken) ||
                (ts.isCallExpression(u) && /\.(includes|startsWith|test|some|every|has)$/.test(u.expression.getText(sf)));
            });
            if (rungs.length >= 3 && !boolCtx && !badRung && !textOnly && reads.length > 0 && !DATE.test(n.getText(sf))) report(n, 'fallback chain, 3+ rungs');
          }
        }
        ts.forEachChild(n, visit);
      };
      visit(root);
    };

    const walk = (n) => {
      if (ts.isJsxExpression(n) && n.expression) {
        const attr = n.parent && ts.isJsxAttribute(n.parent) ? n.parent.name.getText(sf) : null;
        if (!(attr && SKIP_ATTR.test(attr))) examine(n.expression, 0, new Set());
      }
      ts.forEachChild(n, walk);
    };
    walk(sf);
  }
}

// ---- rule 2 (b): every constant in a load-bearing module has a source (design §2) ----
function rule2() {
  const ledger = readFileSync(resolve(REPO, 'docs/STATE-SOURCES.md'), 'utf8');
  const constRe = /^(export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(:\s*[\w.<>\[\]| ]+)?\s*=\s*(-?\s*\d[\d_]*(\.\d+)?(e-?\d+)?|-?\.\d+)\s*(as\s+const\s*)?;/;
  const hasRow = (rel, ln) => {
    if (ledger.includes(rel.split('/').pop())) return true;
    return [...ln.matchAll(/`([^`]+)`/g)].some((m) => ledger.includes(m[1]));
  };
  for (const rel of filesIn(TRUTH.scopes?.loadBearing)) {
    const { lines } = source(rel);
    const parked = isParkedPath(rel);
    lines.forEach((ln, i) => {
      if (constRe.test(ln)) {
        const w = windowText(lines, i, 5, 2);
        if (!CITE.test(w) && !OURS.test(w)) push(2, rel, i + 1, null, parked);
      }
      if (OURS.test(ln) && !hasRow(rel, ln)) push('2-ledger', rel, i + 1, null, parked);
    });
  }
}

// ---- rule 3 (c): one derived field, one writer (design §3) ----
function rule3() {
  const R = TRUTH.rule3 || {};
  const TABLES = new Set(R.tables || []);
  const PLUMB = new Set((R.plumbingColumns || []).map((c) => c.column));
  const PART = new Set((R.partitionedColumns || []).map((c) => c.column));
  // per-key ownership of a JSON column: `/* writes-keys: a, b */` on or up to three lines above a write site
  const WRITES_KEYS = /writes-keys\s*:\s*([\w\s,]+)/;
  const writes = new Map(); // table.column | computed.key | facts.key -> [{ step, file, line }]
  const add = (key, step, file, line) => {
    if (!writes.has(key)) writes.set(key, []);
    const lines = source(file).lines;
    let owned = null;
    for (let i = line - 1; i >= Math.max(0, line - 4); i--) { const m = WRITES_KEYS.exec(lines[i] || ''); if (m) { owned = m[1].split(',').map((k) => k.trim()).filter(Boolean); break; } }
    writes.get(key).push({ step, file, line, owned });
  };
  const stepOf = (rel) => { const seg = rel.split('/').slice(2); return seg[0] === '_shared' ? `_shared/${(seg[1] || '').replace(/\.tsx?$/, '')}` : seg[0]; };
  const unwrap = (n) => { while (n && (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isNonNullExpression(n) || ts.isAwaitExpression(n))) n = n.expression; return n; };
  for (const rel of ALL_FILES.filter((f) => f.startsWith('supabase/functions/'))) {
    const s = source(rel);
    if (!/\.(update|upsert|insert)\(|computed\.|Facts\./.test(s.text)) continue;
    const sf = astOf(rel);
    const step = stepOf(rel);
    const constObj = new Map();
    const collect = (n) => {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
        const u = unwrap(n.initializer);
        if (u && (ts.isObjectLiteralExpression(u) || ts.isArrayLiteralExpression(u))) constObj.set(n.name.text, u);
      }
      ts.forEachChild(n, collect);
    };
    collect(sf);
    const keysOf = (arg) => {
      let u = unwrap(arg);
      if (u && ts.isIdentifier(u) && constObj.has(u.text)) u = constObj.get(u.text);
      const objs = !u ? [] : ts.isObjectLiteralExpression(u) ? [u]
        : ts.isArrayLiteralExpression(u) ? u.elements.map(unwrap).filter((e) => e && ts.isObjectLiteralExpression(e)) : [];
      return objs.flatMap((o) => o.properties
        .filter((p) => (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && p.name && !ts.isComputedPropertyName(p.name))
        .map((p) => ({ name: p.name.getText(sf).replace(/^['"]|['"]$/g, ''), node: p })));
    };
    const fromTable = (e) => {
      let x = e;
      while (x) {
        x = unwrap(x);
        if (ts.isCallExpression(x)) {
          if (ts.isPropertyAccessExpression(x.expression) && x.expression.name.text === 'from' && x.arguments[0] && ts.isStringLiteralLike(x.arguments[0])) return x.arguments[0].text;
          x = x.expression;
        } else if (ts.isPropertyAccessExpression(x)) x = x.expression;
        else return null;
      }
      return null;
    };
    const visit = (n) => {
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && /^(update|upsert|insert)$/.test(n.expression.name.text) && n.arguments[0]) {
        const table = fromTable(n.expression.expression);
        if (table && TABLES.has(table)) for (const k of keysOf(n.arguments[0])) add(`${table}.${k.name}`, step, rel, lineOf(sf, k.node) + 1);
      }
      // JSONB sub-keys: computed.<key> = … / <x>Facts.<key> = …
      if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(n.left) && ts.isIdentifier(n.left.expression)) {
        const obj = n.left.expression.text;
        if (obj === 'computed') add(`computed.${n.left.name.text}`, step, rel, lineOf(sf, n) + 1);
        else if (/Facts$/.test(obj)) add(`facts.${n.left.name.text}`, step, rel, lineOf(sf, n) + 1);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  for (const [key, ws] of [...writes.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const steps = new Set(ws.map((w) => w.step));
    if (steps.size < 2) continue;
    const isSub = key.startsWith('computed.') || key.startsWith('facts.');
    if (!isSub && PLUMB.has(key.split('.').slice(1).join('.'))) { allowed.plumbing++; continue; }
    if (PART.has(key)) { allowed.partitioned++; continue; }
    const live = ws.filter((w) => !isParkedPath(w.file));
    const liveSteps = new Set(live.map((w) => w.step));
    const parked = liveSteps.size < 2;
    if (!parked && live.every((w) => w.owned && w.owned.length)) {
      // keyed: every live site names its keys, and no key is claimed by two steps
      const owner = new Map(); let clash = false;
      for (const w of live) for (const k of w.owned) { if (owner.has(k) && owner.get(k) !== w.step) clash = true; owner.set(k, w.step); }
      if (!clash) { allowed.keyed++; continue; }
    }
    const shown = [...new Map((parked ? ws : live).map((w) => [`${w.file}:${w.line}`, w])).values()];
    const n = (parked ? steps : liveSteps).size;
    for (const w of shown) push(3, w.file, w.line, `${key} · ${n} steps`, parked);
  }
}

// ---- rule 4 (d): WORKORDER §1 rule 7, the device's number wins (design §4) ----
function rule4() {
  const FIELDS = new Set(TRUTH.rule4?.providerFields || []);
  const COERCE = new Set(['Number', 'positive', 'coerceNumber', 'fin', 'toNum', 'asNumber', 'finite', 'num', 'pos', 'safeNum', 'asPositiveFinite']);
  const PROVIDER_FIRST = /provider-first\s*:/;
  // a sent value read into a local before the chain: `/* sent-held: <field> — <local> */`
  const SENT_HELD = /sent-held\s*:\s*\w+/;
  const K = ts.SyntaxKind;
  const isChainOp = (n) => !!n && ts.isBinaryExpression(n) && (n.operatorToken.kind === K.QuestionQuestionToken || n.operatorToken.kind === K.BarBarToken);
  const CMP = new Set([K.LessThanToken, K.LessThanEqualsToken, K.GreaterThanToken, K.GreaterThanEqualsToken, K.EqualsEqualsEqualsToken, K.EqualsEqualsToken, K.ExclamationEqualsEqualsToken, K.ExclamationEqualsToken]);
  const boolContext = (n) => {
    for (let a = n, p = n.parent; p; a = p, p = p.parent) {
      if (ts.isParenthesizedExpression(p) || isChainOp(p)) continue;
      if ((ts.isIfStatement(p) || ts.isWhileStatement(p) || ts.isDoStatement(p)) && p.expression === a) return true;
      if ((ts.isConditionalExpression(p) || ts.isForStatement(p)) && p.condition === a) return true;
      if (ts.isPrefixUnaryExpression(p) && p.operator === K.ExclamationToken) return true;
      if (ts.isBinaryExpression(p) && p.operatorToken.kind === K.AmpersandAmpersandToken) return true;
      return false;
    }
    return false;
  };
  for (const rel of filesIn(TRUTH.scopes?.rule4)) {
    const s = source(rel);
    if (![...FIELDS].some((f) => s.text.includes(f))) continue;
    const sf = astOf(rel);
    const parkedPath = isParkedPath(rel);
    const judge = (chain) => {
      if (boolContext(chain)) return;
      const rungs = [];
      const flat = (x) => { let u = x; while (ts.isParenthesizedExpression(u)) u = u.expression; if (isChainOp(u)) { flat(u.left); flat(u.right); } else rungs.push(u); };
      flat(chain);
      const names = new Set();
      const nm = (x) => {
        if (ts.isPropertyAccessExpression(x)) names.add(x.name.text);
        else if (ts.isElementAccessExpression(x) && ts.isStringLiteralLike(x.argumentExpression)) names.add(x.argumentExpression.text);
        else if (ts.isIdentifier(x)) names.add(x.text);
        ts.forEachChild(x, nm);
      };
      nm(chain);
      if (![...names].some((name) => [...FIELDS].some((f) => name.includes(f)))) return; // distance_m also names distance_meters
      const kinds = [];
      for (const r of rungs) {
        let u = r;
        for (;;) {
          if (ts.isParenthesizedExpression(u) || ts.isAsExpression(u) || ts.isNonNullExpression(u) || ts.isTypeAssertionExpression(u) ||
              (ts.isSatisfiesExpression && ts.isSatisfiesExpression(u))) { u = u.expression; continue; }
          if (ts.isCallExpression(u) && ts.isIdentifier(u.expression) && COERCE.has(u.expression.text) && u.arguments.length === 1) { u = u.arguments[0]; continue; }
          break;
        }
        // guards, not values
        if (ts.isBinaryExpression(u) && CMP.has(u.operatorToken.kind)) return;
        if (ts.isTypeOfExpression(u)) return;
        if (ts.isCallExpression(u) && /\.(includes|startsWith|test|some|every|has)$/.test(u.expression.getText(sf))) return;
        // not a number
        if (ts.isStringLiteralLike(u) || ts.isTemplateExpression(u) || ts.isObjectLiteralExpression(u) || ts.isArrayLiteralExpression(u) ||
            u.kind === K.TrueKeyword || u.kind === K.FalseKeyword) return;
        if (u.kind === K.NullKeyword || (ts.isIdentifier(u) && u.text === 'undefined')) continue;
        if (ts.isPropertyAccessExpression(u) || ts.isElementAccessExpression(u)) kinds.push('sent'); // a local variable is not a sent field
        else if (ts.isNumericLiteral(u) || (ts.isPrefixUnaryExpression(u) && ts.isNumericLiteral(u.operand))) kinds.push('literal');
        else kinds.push('computed');
      }
      const collapsed = kinds.filter((k, i) => !(k === 'sent' && kinds[i - 1] === 'sent')); // alias rungs are one value
      const worked = collapsed.map((k, i) => ({ k, i })).filter((x) => x.k !== 'sent');
      if (!(worked.length >= 2 || worked.some((x) => x.i < collapsed.length - 1))) return;
      const line = lineOf(sf, chain);
      if (markNear(s.lines, line, PROVIDER_FIRST) || markNear(s.lines, line, SENT_HELD)) return;
      push(4, rel, line + 1, collapsed.join(' → '), parkedPath || inParkedBlock(sf, chain));
    };
    const visit = (n) => {
      if (isChainOp(n)) {
        let up = n.parent; while (up && ts.isParenthesizedExpression(up)) up = up.parent;
        if (!isChainOp(up)) judge(n);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
}

// ---- rule 5 (e): the composer prints no number the book does not (design §5) ----
function rule5() {
  for (const rel of filesIn(TRUTH.scopes?.rule5)) {
    const { lines } = source(rel);
    const sf = astOf(rel);
    const parked = isParkedPath(rel);
    const seenLine = new Set();
    const visit = (n) => {
      if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return;
      let hit = false;
      if (ts.isTemplateExpression(n)) hit = true;
      else if (ts.isNoSubstitutionTemplateLiteral(n)) hit = /\d/.test(n.text);
      else if (ts.isStringLiteral(n)) hit = n.text.length > 2 && /\d/.test(n.text) && !(n.parent && ts.isPropertyAssignment(n.parent) && n.parent.name === n);
      if (hit) {
        // a display string — not an id, a lookup key or log text
        const statics = ts.isTemplateExpression(n) ? [n.head.text, ...n.templateSpans.map((t) => t.literal.text)].join('') : n.text;
        const li = lineOf(sf, n);
        if (!/\s/.test(statics.trim()) && !/\d/.test(statics)) hit = false;
        else if (/^[\w:.\/-]+$/.test(statics)) hit = false;
        else if (/throw new Error|console\./.test(lines[li])) hit = false;
        else if (seenLine.has(li)) hit = false;
        if (hit) {
          seenLine.add(li);
          const w = windowText(lines, li, 5, 5);
          if (!CITE.test(w) && !OURS.test(w)) push(5, rel, li + 1, null, parked);
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
}


// ---- rule 1 (a), the derived-distance pattern: a time-prescribed step printed as a distance ----
/**
 * ⛔ WORKORDER Stage B3 (2026-09-17). `materialize-plan` stores `distanceMeters` on a TIME-prescribed step —
 * seconds x target pace, kept for accounting — and marks it `distanceDerived`. A surface that prints the metres
 * without reading that mark turns a 4:00 rep into "0.41 mi" (ce39c5b3 fixed the Planned tab; the row label was
 * still doing it on 2026-09-16, 1da1fd91). The mark is the whole defence, so a read without it is a hit.
 *
 * A measured distance is not in scope: only a PLANNED STEP is, so the object has to name one (`step`, `st`,
 * `plannedStep`, anything on a `planned`/`steps` path). `executed`, `completed`, `overall`, `actual`, a lap or an
 * interval row carry what the athlete really ran.
 */
function rulePlannedDerivedDistance() {
  const FIELD = /^(distanceMeters|distance_m)$/;
  const MEASURED = /\b(executed|completed|overall|actual|lap|interval|row|sensor|summary)\b/i;
  const PLANNED_STEP = /(^|[.\[\]])(st|step|steps|plannedStep|plannedSteps)\b|\bplanned/i;
  // swims are prescribed by distance, so the mark never applies to them
  const NOT_A_RUN_OR_RIDE = /swim/i;
  const MARK = /distanceDerived/;
  for (const rel of filesIn(TRUTH.scopes?.derivedDistance)) {
    const s = source(rel);
    if (!MARK.test(s.text) && !/distanceMeters|distance_m/.test(s.text)) continue;
    const sf = astOf(rel);
    const parked = isParkedPath(rel);
    const seenLine = new Set();
    const visit = (n) => {
      if (ts.isPropertyAccessExpression(n) && FIELD.test(n.name.text)) {
        const obj = n.expression.getText(sf);
        if (!MEASURED.test(obj) && PLANNED_STEP.test(obj) && !NOT_A_RUN_OR_RIDE.test(rel)) {
          // the nearest enclosing function — the mark has to be read somewhere in it
          let fn = n;
          while (fn && !ts.isFunctionLike(fn) && !ts.isSourceFile(fn)) fn = fn.parent;
          const scopeText = fn ? fn.getText(sf) : s.text;
          const li = lineOf(sf, n);
          const excused = markNear(s.lines, li, MARK) || markNear(s.lines, li, /server-field\s*:/) ||
            inMarkedBlock(sf, n, /server-field\s*:/);
          if (!MARK.test(scopeText) && !excused && !seenLine.has(li)) {
            seenLine.add(li);
            push(1, rel, li + 1, `planned \`${n.name.text}\` printed without reading \`distanceDerived\``, parked || inParkedBlock(sf, n));
          }
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
}

// ---- rule 6 (f): a word the server now owns, reappearing on the phone (design §1, added 2026-09-17) ----
/**
 * ⛔ WORKORDER Stage C. The guard checked numbers, not words: State's bike row printed "168 W · estimated" while
 * Adjust printed "accepted from your rides" for the SAME number, because the phone picked the word from a different
 * field (df71a674). A word is a verdict; the server owns it and the phone prints it.
 *
 * ⚠️ THIS IS A REGRESSION GUARD, NOT A DETECTOR, AND THE DIFFERENCE MATTERS. A general "is this string a status
 * word" test was tried first and could not tell "No effort logged" from "Send to Garmin" or a Tailwind class — 147
 * hits, almost all of them button text and styling. So it pins the EXACT words that have been moved to the server:
 * if one reappears as a literal on the phone, the move has been undone and the build fails. Every future move adds
 * its words here; `config.truth.movedWords` is the list, `/* server-word: <reason> *​/` the escape for the one
 * place that legitimately still holds the string (a type, a test fixture).
 */
function rule6() {
  const SERVER_WORD = /server-word\s*:/;
  const COMMENT_LINE = /^\s*(\*|\/\/|\/\*)/;
  const moved = TRUTH.movedWords || [];
  for (const rel of filesIn(TRUTH.scopes?.rule6)) {
    const s = source(rel);
    const sf = astOf(rel);
    // a JSX escape can sit a few lines above the literal it covers, so the node's own block is checked too
    const escaped = new Set();
    const collectEscapes = (n) => {
      if (n.getStart && inMarkedBlock(sf, n, SERVER_WORD)) {
        for (let li = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line,
                 end = sf.getLineAndCharacterOfPosition(n.getEnd()).line; li <= end; li++) escaped.add(li);
      }
      ts.forEachChild(n, collectEscapes);
    };
    collectEscapes(sf);
    for (const entry of moved) {
      for (const word of entry.words || []) {
        let from = 0;
        for (;;) {
          const at = s.text.indexOf(word, from);
          if (at < 0) break;
          from = at + word.length;
          const li = s.text.slice(0, at).split('\n').length - 1;
          // a word named in a comment is documentation, not a choice
          if (COMMENT_LINE.test(s.lines[li] || '')) continue;
          if (markNear(s.lines, li, SERVER_WORD) || escaped.has(li)) continue;
          push(6, rel, li + 1, `"${word}" — ${entry.field}`, isParkedPath(rel));
        }
      }
    }
  }
}

// ---- run ----
if (ruleOn(1)) { rule1(); rulePlannedDerivedDistance(); }
if (ruleOn(2)) rule2();
if (ruleOn(3)) rule3();
if (ruleOn(4)) rule4();
if (ruleOn(5)) rule5();
if (ruleOn(6)) rule6();

// Rule 0 (D-237): fresh undeclared fallbacks join the same report; ticketed exceptions are counted.
let knownCount = 0;
if (ruleOn(0)) {
  let hadError = false;
  for (const f of FILES) {
    const res = scanFile(f);
    if (res.error) { console.error(`[provenance] ${res.error}`); hadError = true; continue; }
    for (const v of res.findings) {
      if (v.declared) continue;
      if (matchException(v)) { knownCount++; continue; }
      push(0, v.file, v.line, `\`${v.fallback}\``, false);
    }
  }
  if (hadError) process.exit(2);
}

const sev = (r) => (SEVERITY[r] === 'fail' ? 'fail' : 'warn');
const failing = hits.filter((h) => sev(h.rule) === 'fail');

if (AS_JSON) {
  console.log(JSON.stringify({ severity: SEVERITY, hits, parked: parkedHits, allowed, knownExceptions: knownCount }, null, 2));
  process.exit(failing.length ? 1 : 0);
}

const inRule = (arr, r) => arr.filter((h) => h.rule === r);
for (const r of RULE_ORDER) {
  if (!ruleOn(r) || (FAIL_ONLY && sev(r) !== 'fail')) continue;
  for (const h of inRule(hits, r)) console.log(`${h.file}:${h.line}  ${RULE_LABEL[r]}${h.what ? ` · ${h.what}` : ''}`);
  if (SHOW_PARKED) for (const h of inRule(parkedHits, r)) console.log(`${h.file}:${h.line}  PARKED ${RULE_LABEL[r]}${h.what ? ` · ${h.what}` : ''}`);
}
console.log('');
for (const r of RULE_ORDER) {
  if (!ruleOn(r)) continue;
  const p = inRule(parkedHits, r).length;
  console.log(`${sev(r).toUpperCase().padEnd(4)} ${String(inRule(hits, r).length).padStart(4)}  ${RULE_LABEL[r]}${p ? `  (parked ${p})` : ''}`);
}
if (ruleOn(3)) console.log(`          rule 3 allowed: ${allowed.plumbing} plumbing, ${allowed.partitioned} partitioned, ${allowed.keyed} keyed`);
if (ruleOn(0) && knownCount) console.log(`          rule 0 known-unresolved: ${knownCount}`);
process.exit(failing.length ? 1 : 0);

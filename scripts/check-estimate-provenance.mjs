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
 * Usage:  node scripts/check-estimate-provenance.mjs [--json]
 * Config: scripts/estimate-provenance.config.json
 * Exit:   0 = clean, 1 = violations found, 2 = tool/config error.
 */

import { readFileSync } from 'node:fs';
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

// --------------------------------------------------------------------------
// Run
// --------------------------------------------------------------------------

const all = [];
let hadError = false;
for (const f of FILES) {
  const res = scanFile(f);
  if (res.error) { console.error(`[provenance] ${res.error}`); hadError = true; continue; }
  all.push(...res.findings);
}
if (hadError) process.exit(2);

const allViolations = all.filter((f) => !f.declared);
const passed = all.filter((f) => f.declared);
// Known (ticketed) exceptions are acknowledged open bugs — surfaced loudly, but not build failures.
const known = allViolations.map((v) => ({ v, e: matchException(v) })).filter((x) => x.e);
const violations = allViolations.filter((v) => !matchException(v)); // FRESH = un-acknowledged

if (AS_JSON) {
  console.log(JSON.stringify({ violations, known: known.map((x) => ({ ...x.v, ticket: x.e.ticket, reason: x.e.reason })), passed }, null, 2));
  process.exit(violations.length ? 1 : 0);
}

const printKnown = () => {
  if (!known.length) return;
  console.log(`\n⚠ ${known.length} KNOWN-UNRESOLVED (acknowledged open bug, NOT declared — tracked, does not fail the build):`);
  for (const { v, e } of known) console.log(`  • ${v.file}:${v.line} \`${v.fallback}\` — ${e.ticket}: ${e.reason}`);
};

// Human report
const byFile = new Map();
for (const v of violations) { if (!byFile.has(v.file)) byFile.set(v.file, []); byFile.get(v.file).push(v); }

if (violations.length === 0) {
  console.log(`✓ estimate-provenance: ${all.length} fallback(s) inspected across ${FILES.length} file(s), 0 new undeclared.`);
  printKnown();
  process.exit(0);
}

console.log(`\nD-237 estimate-provenance — ${violations.length} NEW undeclared numeric fallback(s):\n`);
for (const [file, vs] of byFile) {
  for (const v of vs) {
    console.log(`✗ ${file}:${v.line}:${v.col}`);
    console.log(`    ${v.snippet}`);
    console.log(`    ↳ [${v.form}] bare fallback \`${v.fallback}\` in a load-bearing module, no provenance marker.`);
    console.log(`      Fix: declare a sibling *_method / *_estimated marker in this function,`);
    console.log(`           or annotate /* estimate-ok: <where-disclosed> */ if genuinely display-only,`);
    console.log(`           or add to knownExceptions with a ticket if it's a tracked open bug.\n`);
  }
}
console.log(`${passed.length} declared fallback(s) passed. "clean = enforced, not asserted" — D-237.`);
printKnown();
process.exit(1);

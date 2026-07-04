# DESIGN — D-237 estimate-provenance lint/CI guard

**Status:** DESIGN FOR REVIEW (2026-07-04). Do NOT build until Michael approves. This is the durable "clean = enforced, not asserted" backstop for D-237 (no silent impersonation). Cross-ref: `DECISIONS-LOG.md` D-237 THE STANDARD; the C1–C5 / W1–W8 inventory in the D-237 fix plan.

---

## 0. What it's for (one sentence)

Fail the build when a **numeric fallback** (hardcoded constant / `?? default` / `|| default` / "if missing use X" ternary) is introduced in a load-bearing module **without declaring itself as an estimate** — converting "we audited and it looks clean" into "the build won't let you add a silent one."

---

## 1. The pattern it must detect

The concrete finding set it is calibrated against (all real, all the same shape — a literal default introduced at a known site that then feeds a user-facing number/verdict/receipt with no provenance marker):

| ID | Site | Fallback | Flows into |
|----|------|----------|-----------|
| **W1** | `_shared/workload.ts:53` `getDefaultIntensityForType` | `0.75` / `0.70` | `workouts.workload_actual` + `workout_facts.workload` → ACWR/CTL/Arc |
| **W2** | `workload.ts:263-264`, `compute-facts:1508` | restingHR `60` / `thresholdHR−90` | TRIMP → workload → ACWR |
| **C1** | `state-trend/thresholds.ts:48` | REF_SPW cadence default | trend `minSessions` floor → "not enough data" receipt |
| **C3** | `marathon-readiness/index.ts:104` | readiness defaults | readiness verdict string |
| **C4** | `workload.ts:263` | restingHR `60` | (W2 duplicate lens) |
| **C5** | `session-load.ts:57-94` | `0.7` / `0.8` effort | `session_load.magnitude` → readiness |
| (fixed) **C2** | — | fabricated `140` bpm "your norm" | narrative string (the canonical motivating case) |

**Abstract shape to catch:** within a flagged module, a **numeric literal used as a fallback** — via `x ?? 60`, `x || 0.75`, `cond ? x : 60`, `{ hr = 60 }` destructure default, or a `const FOO_DEFAULT = 60` consumed as a fallback — where the surrounding block does **not** also emit a provenance marker (a `*_method` / `*_estimated` / `*_source` / `confidence` write, or a declared-estimate annotation).

That is a **syntactic, decidable** check at the *write site*. It is deliberately NOT an attempt to prove the value reaches a string (see §2).

---

## 2. Reach and blind spots (the honest part)

**The core truth:** "does this fallback flow into a user-facing string, possibly N hops later or through the DB" is interprocedural taint analysis — undecidable in general, and far beyond an ESLint rule. Values cross function boundaries, get written to JSONB, and are read back by a different edge function (W1 is written in `compute-facts`, eaten by ACWR in `coach`). Static analysis **cannot** follow that.

So the guard does **not** trace flow-to-string. It enforces a **local contract at the two chokepoints where provenance is actually knowable**: the fallback *source site*, and (weakly) the string *sink*.

**CAN catch (high confidence):**
- Every C1–C5 / W1–W2-shaped bug — they are all literal defaults at a known site in a listed file. New code of this exact shape becomes a build error.

**CANNOT catch (state these plainly — do not let the guard's green check imply more):**
- **DB round-trips.** A default persisted by an earlier write is just a number when a later function reads it — no static rule can tell it was fabricated. This is exactly W1's "UNRECOVERABLE for rides" problem. Historical/DB-sourced fabrication is out of scope (that's the Stage-3 census + the 3-agent sweep, not this).
- **Multi-hop across un-listed files.** Rule A catches the fallback at its *source* file regardless of how far it flows — but only if that source file is in the flagged set. A default born in an unlisted helper is invisible.
- **Non-literal fallbacks.** `?? someDefaultVar`, `Math.max(x, 60)`, a default hidden inside a called helper, `Number(x) || 60` buried two calls deep. The rule keys on a *literal adjacent to a fallback operator*; indirection defeats it.
- **Loosely-paired provenance.** If the `*_method` flag is written 40 lines away or in a sibling function, the rule can't correlate it → either a false negative (missed) or, if we're strict, a false positive (see §3).

**One-line honest summary for the docs:** *a write-site tripwire that makes this bug-class impossible to introduce silently in covered files going forward — NOT a whole-program proof, and blind to anything already fabricated in the DB.*

---

## 3. False-positive strategy — declared estimates MUST pass

The design lives or dies on distinguishing **declared** from **silent**. A legitimate declared estimate (`srpe_estimated`, `"est (FTP)"`, `"cadence estimated"`, the Stage-1 `workload_method` writes) has to pass clean. The rule does this by checking for the **presence of a declaration token near the fallback**, not by understanding semantics. Four ways a fallback declares itself (any one → PASS):

1. **Provenance-pairing (the main one).** The fallback's enclosing block also writes a sibling provenance field — `workload_method` / `*_estimated` / `*_source` / `confidence`. This is precisely what the W1/W2 Stage-1 fix already does (`classifyWorkloadMethod` → `workload_method`), so those auto-pass once fixed. This rewards routing through the declared-estimate machinery.
2. **Explicit annotation escape hatch.** A co-located `/* estimate-ok: <method>, disclosed@<file> */` comment. The reason must name where the estimate is disclosed downstream. E.g. `/* estimate-ok: srpe r≈0.7, method=srpe_estimated, disclosed in acwr.ts */`. This is the "I'm a human, I checked, here's why" release valve — and it's greppable, so an audit can list every exemption.
3. **Self-declaring string (sink side).** A user-facing literal that carries an estimate marker adjacent to the value — `est`, `~`, `estimated`, `assumed`, `approx`. `"est (FTP) 176W"` passes; `"176W"` from a fallback does not.
4. **Display-only allowlist.** Bounded, distinguishable, non-verdict literals (pool length `|| 25`, `moving_time = elapsed`, W6–W8) — excluded by scoping the rule away from pure-display modules, or annotated once.

**The decision rule, stated crisply:** `silent` = a bare numeric-literal fallback in a flagged module with **no** adjacent provenance-field write **and no** `estimate-ok` annotation **and** (for string sinks) no estimate marker in the emitted literal. Everything else passes. Bias: **prefer false-positives that an annotation silences over false-negatives that ship a silent estimate** — but keep the annotation cheap so silencing is a 1-line, auditable act, never a reason to weaken the rule.

---

## 4. Where it runs & what failing looks like

**Form.** The edge functions are Deno and there is no unified linter over them today, so the pragmatic implementation is a **standalone AST-scan** (`scripts/check-estimate-provenance.mjs`, TypeScript-AST via the compiler API or `es-module-lexer`+ts) over a checked-in file list — runnable locally as `npm run lint:provenance`, not a per-editor ESLint plugin. (A true ESLint custom rule is possible for the `src/` client but would only cover a third of the surface; one scanner over both trees is simpler and consistent.)

**Enforcement point.** CI-required check (or pre-push). NOT pre-commit — too eager for a repo where device iteration means many WIP commits. Local `npm run lint:provenance` gives the fast feedback loop; CI is the gate that "won't allow it."

**Scope config.** A checked-in `scripts/estimate-provenance.config.json` listing the flagged modules — seeded with the D-237 inventory files (`workload.ts`, `compute-facts`, `session-load.ts`, `state-trend/thresholds.ts`, `marathon-readiness`, the receipt/verdict builders `trend-receipt.ts`, `session-detail/build.ts`, coach interpretation) and **grown as the 2nd sweep covers more**. Explicitly not whole-repo: plan generators and tests are full of legitimate magic numbers and would drown the signal.

**Failing output (illustrative):**
```
✗ supabase/functions/_shared/workload.ts:263
    Bare numeric fallback `?? 60` (resting HR) in a flagged module, no provenance marker.
    → feeds TRIMP → workload_actual (user-facing load).
    Fix: write workload_method='trimp_resting_assumed' in the same result,
         or /* estimate-ok: <where-disclosed> */ if genuinely display-only.

1 violation. "clean = enforced, not asserted" — D-237.
```

---

## 5. Open decisions for Michael (need your call before build)

1. **Scope posture** — curated flagged-file list (precise, low-noise, but misses un-listed files) vs whole-edge-tree (catches everything, high false-positive tax). *Recommend: curated + grow with the sweep.*
2. **Rule B (the string-sink side)** — build the sink-side check now, or ship Rule A (source-site) first and defer B? Rule A delivers ~most of the value; B is the noisy, hard half. *Recommend: A now, B deferred.*
3. **Annotation vs branded type** — cheap `/* estimate-ok: … */` comment (fast, greppable, not compiler-enforced) vs a branded `Declared<number>` / `Estimate<number>` type that makes the compiler track declared-ness through flow (much stronger, but a real refactor of the numeric plumbing). *Recommend: annotation to start; revisit branded type if silent estimates keep slipping through indirection.*
4. **Enforcement gate** — CI-required (blocks merge) vs pre-push (blocks your push) vs advisory (reports, doesn't fail). *Recommend: CI-required + local `npm run lint:provenance`.*

---

## 5b. As-built (2026-07-04) — the four decisions, resolved

Approved and built. `scripts/check-estimate-provenance.mjs` (TS-compiler-API AST scan) + `scripts/estimate-provenance.config.json` + `npm run lint:provenance` + `.github/workflows/provenance.yml`.

- **Scope → curated + grow, incl. display builders.** Seeded: `_shared/workload.ts`, `calculate-workload`, `compute-facts`, `_shared/state-trend/thresholds.ts`, `_shared/marathon-readiness`, `_shared/session-load.ts`, and the display/receipt builder `src/lib/trend-receipt.ts` (C2 lived in a display builder). Grow via the config `files` list as the sweep expands.
- **Rule B → deferred.** Shipped Rule A (source-site) only, as recommended.
- **Declaration → `/* estimate-ok: … */` annotation** (proven), plus two more declared-pass paths: a `declaredDefaultProvider` allowlist (the pure default-supplier functions) and a `provenanceToken` co-located in the nearest enclosing function.
- **Gate → CI-required.** GitHub Actions workflow (`provenance.yml`) on push/PR; local `npm run lint:provenance`. Making it *blocking* needs a branch-protection required-status-check on `main` (a GitHub setting Michael owns).

**Acceptance run (the pass/flag proof):** 3 declared PASS (all `workload.ts` provider defaults — W1 source + strength-intensity), 19 FLAG. C1 (`thresholds:48`), C3 (`marathon:105/107/108`), C5 (`session-load:58/74/89`) all flag; the fixed W1/W2 consumer (`calculate-workload`) is clean. **Bonus true-positives surfaced:** the documented **W4** (`compute-facts` interval-adherence `?? 100` ×3), the documented **W2 follow-on** (`compute-facts:1512` `?? 60`), plus two NEW silent sites — `compute-facts:910` `refHr ?? 145` (a W2-class HR fabrication) and `compute-facts:881` `startKm … : 1.5` (geo default). A fixture proves all three declared-pass prongs and that classification branches (`pHard >= 0.2 ? 1.2 : 0.8`) and `0`/`-1` sentinels do NOT flag.

**Build lessons banked (calibration that mattered):**
1. **Provenance tokens must be a SPECIFIC vocabulary, not generic `_method`/`confidence`.** The first cut passed `compute-facts:881/910` because `match_method`/`match_confidence` (route-matcher fields) matched — masking real silent HR/geo fallbacks. Tightened to the D-237 declaration vocab.
2. **Provider exemption walks ALL ancestor functions** — a fallback inside a nested `.map()` closure still belongs to its outer named provider.
3. **Non-positive literals (`0`, negatives) are sentinels, not estimates** — ignored, else `score: -1` false-flags.
4. **The trigger must be a missing/invalid-input test** (`== null`, `!x`, `Number.isFinite`, `<= 0`, `.length`) — an ordinary threshold branch (`>= 0.2`) is a classification, not a fabricated fallback.

**Known limitation (accepted):** the provenance-token pass is nearest-enclosing-function-scoped — a function that both declares one estimate AND silently fabricates another would pass the second. Documented; the annotation/marker discipline mitigates.

---

## 6. Explicitly NOT in this design (so scope doesn't creep)

- Retroactively finding every existing silent fallback — that's the queued **second 3-agent sweep**.
- Repairing historical DB rows already carrying fabricated defaults — that's **Stage-3 census/backfill**.
- Any behavior change to ACWR/receipts — the guard is a build-time gate only; it ships zero runtime code.

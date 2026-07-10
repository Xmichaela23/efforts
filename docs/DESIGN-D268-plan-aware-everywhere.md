# DESIGN — D-268: Plan-primary is a SYSTEM invariant (every surface reads the plan-aware read; nothing re-derives from running)

**Status:** DECISION (approved to write 2026-07-09; engine changes gated on review + a per-phase go).
**Extends:** the Constitution (Law 1 one-source, Law 4 render-don't-decide, Law 5 born-on-the-spine), D-260 (THE LAW), D-264 (single source), D-267 (the load verdict reads plan-primary). **Does not supersede.**

> **Michael, 2026-07-09:** *"everything in the app must be like this."* Plan-awareness is not a load-only fix — it is a **system invariant.**

---

## 1. The principle

Every user-facing surface that talks about **load, adherence, or what to do next** must read the athlete's **plan intent + primary discipline** — never hardcode running (or any single-discipline assumption). This is the Constitution applied to plan-awareness:

- **Law 1 (one source):** the plan-aware read is computed once and every surface reads it.
- **Law 4 (render, don't re-decide):** copy surfaces choose wording only — zero verdict latitude, and **no re-derivation of a discipline assumption.**
- A hardcoded `'run'` / "Running behind plan" / run-only query in a copy surface is a **bug** — the exact class D-264 calls "a divergent inline copy is a bug, not a shortcut."

**The invariant, stated for enforcement:** *No surface may re-derive "what discipline is this athlete's plan" or frame load/adherence around running. It reads `planPrimary` and the reconciled plan-aware read.*

---

## 2. Current state (the 3-part audit, 2026-07-09)

`planPrimary` (D-267, `resolvePlanPrimary`) reaches **exactly one consumer** — the load reconciler (`coach/index.ts:3347` → reconciler `:384`). Every other surface still re-derives from running. **Root cause:** `body-response.ts` computes "run-only load vs run plan" and every downstream copy inherits that framing.

**Already plan-aware (read the reconciled verdict — leave alone):**
- LOAD word + "This week" headline — `src/lib/load-headline.ts:25` `statusVolumeLabel`, `LoadBar.tsx`, `StateTab.tsx:1171` (read `load_status.status`).

---

## 3. The surfaces to reconnect (ranked by visibility/harm), with the fix each

| # | Surface | file:line | Assumes | Fix |
|---|---|---|---|---|
| 1 | **`body-response.ts` — the RUN-ONLY ROOT** | `_shared/athlete-snapshot/body-response.ts:460-495` (`:461` "Primary signal: run-only load vs run plan"; `:483-484` "Running load X% below plan") | Raw status + interpretation string are computed run-only. D-267 patches the *status* for `under+strength`; the run-framed *interpretation lead* and any run-spike elevated/high still pass through. | Make the raw read discipline-neutral, **or** have the reconciler own the full plan-aware status **and rewrite** (not append to) the interpretation when `planPrimary!=='endurance'`. Fixing the root makes downstream inherit. |
| 2 | **Off-plan banner — "Running behind plan"** | `_shared/off-plan-banner.ts:28-29` (`CARRIED_EASY`/`CARRIED_GENERIC` literals), gate `:48-59`; caller `coach/index.ts:4944` | Fires on `runLoadPct` only; hardcodes "Running behind plan / planned sessions skipped"; takes **no `planPrimary`**. | Thread `planPrimary` + `primaryAdherence`; for strength-primary on-plan, suppress or reword ("On plan — strength on track, endurance via cross-training"). Run-shortfall banner only for endurance/hybrid. |
| 3 | **Coach `intent_summary` verdict line** | `coach/index.ts:4888-5011` | Intent-aware but every branch run/race-worded ("keep run sessions on plan"). | Branch on `planPrimary`; strength-framed lines for strength-primary; route the run-shortfall through the reconciled read. |
| 4 | **Coach LLM narrative** | `narrativeFacts` in `coach/index.ts`; `planPrimary` fed to reconciler only (`:3355`); plan fact `:3802-3810` via `buildPlanContextLine` (`_shared/plan-week.ts:114-132`) carries no primary discipline | The model is never told the plan's primary discipline → frames prose around running. | Push a `narrativeFact` carrying `planPrimary` + the reconciler's plan-aware reason ("strength on plan; endurance carried by cross-training"). |
| 5 | **`generate-training-context` week-verdict / next-action** | `generate-training-context/index.ts:728,:830,:1438` (run-only queries), `:1863/:1865` (`next_key_session.sport` defaults 'run'), `:1131` ("Add N more run sessions") | Recent-form + key-session audits filter `type in (run,running)`; next-action defaults to a run. | Discipline-aware inputs + next-action; default off `planPrimary`, not 'run'. |
| 6 | **"you have headroom"** | `src/lib/load-headline.ts:89-95` `observationSlot` | Fires on `balanced && readiness==='fresh'` — readiness-only, ignores plan + load level. | Read the reconciler's own "headroom to add endurance" reason instead of re-deriving; suppress when load isn't genuinely light. (This was the standalone "Fix 2".) |
| 7 | **`arc-context` `discipline` re-derivation** (single-source cleanup) | `_shared/arc-context.ts:683-687` (`config.discipline \|\| config.sport \|\| plan_type`) | A second, independent notion of "what discipline is this plan," separate from `resolvePlanPrimary` (D-264 concern). | Collapse to one: derive from / reconcile with `resolvePlanPrimary`. |

Lowest-risk / defer note: the ACWR *number* on the gauge still carries a run-weighted lineage (`running_acwr` seeds the band) — the *word* is reconciled/plan-aware; the number is discipline-neutral copy, so it's low priority.

---

## 4. The fix PATTERN (the rule going forward)

- **One source:** the plan-aware read = `planPrimary` + the reconciler's plan-aware status/interpretation, computed once. Every surface **reads** it.
- **No re-derivation:** a hardcoded discipline, a run-only filter, or "Running behind plan" copy is a bug, not a shortcut.
- **Enforcement (proposed):** a lint/guard (D-237-style) that flags hardcoded discipline strings / run-only filters in copy surfaces, so new surfaces can't reintroduce the assumption. Also: consider adding this invariant to `CONSTITUTION.md` as an explicit line under Law 4.

---

## 5. Phased plan (each phase testable; nothing is one giant risky change)

- **Phase 1 — the root.** body-response/reconciler produce a plan-aware status **and** interpretation (rewrite the run-only lead when `planPrimary!=='endurance'`). Fixtures on the live Get-stronger case. This alone de-run-frames the receipt every surface reads.
- **Phase 2 — the banner.** `off-plan-banner.ts` takes `planPrimary`; strength-primary on-plan → reworded/suppressed. Fixtures.
- **Phase 3 — coach copy.** `intent_summary` + `narrativeFacts` read `planPrimary` + the reconciled reason. Fixtures / prose-grounding check.
- **Phase 4 — training-context.** discipline-aware next-action + inputs.
- **Phase 5 — cleanup.** "you have headroom" reads the reason; `arc-context` discipline single-sourced.

Each phase: reconciler stays sole authority (THE LAW), fixtures green, endurance-primary zero-regression, verify on Michael's live data before the next phase.

---

## 6. Constraints (THE LAW / Constitution)

- **Reconciler is the sole verdict authority** (D-260). Copy surfaces **read**, never mint.
- `body-response.ts` supplies raw signals; the plan-aware verdict/interpretation is the reconciler's.
- **No parallel verdict paths.** One government (Law 1).
- Endurance-primary and hybrid plans: **zero behavior regression** — they were always run/endurance-framed correctly; the invariant only changes strength-primary (and future non-run-primary) plans.

---

## 7. Out of scope (follow-ons — noted, not in this decision)

- Non-copy surfaces (scheduling, plan generation) applying the same invariant — future.
- Intensity-binned per-domain ACWR, TRIMP (already fenced under D-267 §9).
- Whether the ACWR *number* should become a plan-weighted total instead of run-weighted — a metric change, separate.

# DESIGN — D-267: The load verdict must read the plan's PRIMARY discipline (not hardcoded running)

**Status:** DECISION (approved to write 2026-07-09; engine changes gated on review of this doc).
**Extends:** D-259 (swap-recognition), D-260 (THE LAW — reconciler is sole verdict authority), D-264 (single source). **Does not supersede.**

---

## 1. Problem (grounded in the primary user's REAL data, sourced 2026-07-09)

The active plan is **"Get stronger"** — read directly from the DB:

| field | value |
|---|---|
| `config.source` | **`strength_primary`** |
| `config.plan_version` | `strength_primary_v1` |
| `config.program` | `get_strong` |
| `config.strength_frequency` / `endurance_frequency` | **4 / 3** |
| `config.endurance_sport` | `run` |
| `config.volume_state` | **`above`** |
| `phase_structure` week 1 | **`Base`** (Base 1-4 · Power 5-6 · Deload 7 · Peak 8-11 · Retest 12) |

So the plan's **primary intent is STRENGTH** (4×/wk, the athlete's priority), with running as the *secondary/support* discipline. This week: strength maintained/on-track (e1RM improving), runs deliberately swapped for rides + swims, **total load at ACWR ≈ 1.3** (above chronic), and the plan itself recorded **`volume_state: above`**.

**The verdict said "build more" (`under`).** Root cause — the load verdict is hardcoded run-first (`_shared/athlete-snapshot/body-response.ts:461`):

```
// Primary signal: run-only load vs run plan.
const runPct = runOnlyWeekLoadPct;
...
else if (runPct < -20) { loadStatusLabel = 'under'; }   // fires because runs were swapped out
```

It judges load **entirely on running-vs-run-plan** and never receives, or reads, that this is a strength-primary plan. `weekIntent` (phase) reaches the function but is used only for strength *observations* and the easy-week gate — never the load verdict. The plan's **primary discipline is not threaded in at all.**

Net: a strength-primary athlete, on plan, cross-training his endurance, at ACWR 1.3, `volume_state: above`, is told to **build more** — the exact "the verdict ignores what the Arc knows" disconnect. It is the mirror of the false "back off" (D-259): D-259 taught the engine *"a swap isn't overload"*; nothing taught it *"a swap isn't under-training"* — and nothing tells it running is not the primary.

---

## 2. THE LAW constraint (non-negotiable)

`reconcileLoadStatus` (`_shared/load-status-reconcile.ts`) **remains the sole verdict/prescription authority** (D-260). Therefore:

- Plan-primary discipline and all new inputs are threaded **INTO the reconciler.**
- `body-response.ts` continues to supply **RAW SIGNALS only** — `runPct`, total ACWR, strength trend/sessions. Its run-only `loadStatusLabel` is **demoted to a raw candidate** (`raw.status`) that the reconciler may override; it is **never a final verdict.**
- **No parallel verdict path** is created in `body-response.ts` or anywhere else. One authority.

---

## 3. (a) Where plan-primary discipline is sourced

**Source: `plans.config.source`** — the explicit, reliable marker (corroborated by `plan_version` prefix).

```
type PlanPrimary = 'strength' | 'endurance' | 'hybrid' | 'unknown';

function resolvePlanPrimary(planConfig: any): PlanPrimary {
  const source = String(planConfig?.source ?? '').toLowerCase();
  const version = String(planConfig?.plan_version ?? '').toLowerCase();
  if (source === 'strength_primary' || version.startsWith('strength_primary')) return 'strength';
  if (source.startsWith('endurance') || source === 'run' || source === 'triathlon' || source === 'duathlon') return 'endurance';
  if (source.startsWith('hybrid') || source.startsWith('combined')) return 'hybrid';
  return 'unknown';
}
```

- **Resolution point: coach** — it already loads `planConfig` for `weekIntentFromContract` (`coach/index.ts:649,1033`). One resolution, passed down. (The Arc also carries plan position; coach is the existing single load point, so keep it there to avoid a second source — D-264.)
- **Fallback:** no active plan / unrecognized source → `'unknown'` → **current run/endurance-primary behavior preserved** (fail-safe; no regression for existing plans).

---

## 4. (b) Exact input added to the reconciler contract

Extend the **existing `planPosition` object** (not new positional params — it already carries `weekIntent`, `weekIndex`, …), backward-compatible:

```ts
planPosition: {
  weekIntent: string;
  weekIndex: number | null;
  totalWeeks: number | null;
  weeksOut: number | null;
  isPlanTransition: boolean;
  // ── D-267 additions ──
  planPrimary?: PlanPrimary;                    // default 'unknown' → current behavior
  primaryAdherence?: {                          // default null → current behavior
    discipline: string;                         // e.g. 'strength'
    met: boolean;                               // primary-discipline plan being met (maintaining)
    note: string;                               // evidence, e.g. "strength 4/4 sessions, e1RM improving"
  } | null;
}
```

**`primaryAdherence.met` — WTD-prorated, in a pure testable helper** (Amendment 2). Computed by `computePrimaryAdherence(...)` in `_shared/load-status-reconcile.ts` (co-located with the verdict authority so it is **unit-testable**; coach imports it — single source, D-264). Mid-week, adherence is judged against the **fraction of the week ELAPSED**, so an athlete who does strength later in the week is not falsely flagged "not met" on a Tuesday:

```ts
// WTD proration. dayIndex = 0-based position of asOf within the plan week (0 = week start day),
// derived in coach from asOfDate vs the plan's week start. Week length = 7.
export function computePrimaryAdherence(args: {
  planPrimary: PlanPrimary;
  strengthSessionsCompleted: number;   // WTD count this plan-week
  strengthFrequency: number;           // config.strength_frequency (planned per week)
  strengthTrend: string;               // bodyTrends.strength.trend
  dayIndex: number;                    // 0..6 within the plan week (0 = week start)
}): { discipline: string; met: boolean; note: string } | null {
  if (args.planPrimary !== 'strength') return null;              // only strength-primary defines it (v1)
  const elapsedFrac = Math.min(1, (args.dayIndex + 1) / 7);      // fraction elapsed, incl. today
  const expectedByNow = args.strengthFrequency * elapsedFrac;    // prorated target so far
  const met = (args.strengthSessionsCompleted >= expectedByNow - STRENGTH_ADHERENCE_TOLERANCE)
            && args.strengthTrend !== 'declining';
  const note = `strength ${args.strengthSessionsCompleted}/${args.strengthFrequency} sessions`
             + (args.strengthTrend === 'improving' ? ' · e1RM improving'
                : args.strengthTrend === 'declining' ? ' · trend declining' : ' · trend steady');
  return { discipline: 'strength', met, note };
}
```

`STRENGTH_ADHERENCE_TOLERANCE = 1` (named dial). Judged against **expected-by-now**, not the full-week target: forgiving early/mid-week (strength isn't evenly distributed), tightening to the true target by week's end.
- **Worked (the mid-week fixture, §8):** Tuesday (`dayIndex 1`) → `expectedByNow = 4 × 2/7 = 1.14`; completed `1 ≥ 1.14 − 1 = 0.14` → **met = true**.
- End of week (`dayIndex 6`) with 1/4 → expected `4`; `1 ≥ 3` is false → **met = false** (genuine end-of-week shortfall).

Defaults (`planPrimary='unknown'`, `primaryAdherence=null`) make D-267 **inert until coach wires it** — same pattern as `corroboratedStrain` (D-265).

---

## 5. (c) Reworked primary-signal logic, per plan type

The reconciler's "is this under-training?" decision becomes plan-primary-aware. **The run-only `raw.status='under'` is a candidate, re-judged by primary:**

### `planPrimary === 'strength'`
**Primary signal = strength adherence + TOTAL load** (not run-vs-plan).

**INVARIANT (Amendment 1) — `met === true` ⟹ a raw `under` NEVER survives as the final status, regardless of coverage.** Strength adherence IS the primary; if the primary is met, the athlete is not under-training, full stop. The only remaining question is whether to note headroom. Formally: `primaryAdherence.met === true ⟹ final status ∈ { on_target, or higher via escalation }; never 'under'.`

The two sub-cases of `met === true` (a raw `under` in both):
- **(a) `unweightedAcwr >= ENDURANCE_COVERED_ACWR_MIN`** → **`on_target`**. Evidence (required): `"strength on plan (${note}); endurance load carried by cross-training (total ACWR ${x})"`.
- **(b) `unweightedAcwr < ENDURANCE_COVERED_ACWR_MIN`** → **`on_target`** with the **headroom note** as evidence: `"strength on plan (${note}); you have headroom to add endurance"`. Opportunity, never a deficit — **never `under`.**

`under` for a strength-primary plan requires **BOTH** conditions:
- **`primaryAdherence.met === false` AND `unweightedAcwr < UNDER_TOTAL_ACWR_MAX`** (≈ 0.8) → `under` / "build more"; evidence names the strength shortfall + genuinely low total load.

The remaining combination — **`met === false`, `unweightedAcwr >= UNDER_TOTAL_ACWR_MAX`** (strength slipping but total load fine) — is **not `under`**: it falls through to `on_target` with a strength-attention note. (Escalation, if warranted, is the two-key / D-266 path, unchanged; D-267 never mints `under` here.)

### `planPrimary === 'endurance'`
- **No change.** Endurance/run-vs-plan stays the primary signal (`raw.status` stands); strength is support. Run/tri athletes see identical behavior — zero regression.

### `planPrimary === 'hybrid'`
- **Total-load driven.** Neither discipline's shortfall alone drives `under`; D-259 swap-recognition applies; `under` fires only when TOTAL load is genuinely low.

### `planPrimary === 'unknown'`
- **Current behavior** (fail-safe default).

Escalation (high/elevated) is unchanged and still governed by the existing gates + D-266 two-key; D-267 only corrects the **under / build-more** direction, and only away from a false `under`.

---

## 6. (d) How total-load + D-259 swap-recognition cover the endurance shortfall

D-259 already computes cross-training recognition for the HIGH direction (`runNotOverPlan`, `excessIsCrossTraining`). Generalize to the UNDER direction using the **total ACWR the reconciler already receives** (`unweightedAcwr`) — no new per-domain machinery:

```
const ENDURANCE_COVERED_ACWR_MIN = 1.0;   // acute >= chronic → the skipped endurance was redistributed, not dropped
const enduranceShortfallCovered =
  unweightedAcwr != null && unweightedAcwr >= ENDURANCE_COVERED_ACWR_MIN;
```

Rationale: if acute total load ≥ chronic average, the endurance the athlete "skipped" was **swapped into cross-training, not lost** — total systemic load is maintained. The primary user's ACWR 1.3 clears this comfortably. Reuses `unweightedAcwr` (already an input) + the D-259 principle; **no intensity-binned per-domain ACWR** (out of scope, §9).

---

## 7. Verdict output + evidence discipline

- Maintaining case → **`status: 'on_target'`** (not `under`). Display word resolves via `statusVolumeLabel('on_target') = 'balanced'`. A dedicated **"maintaining"** display label is a **copy follow-on** (noted, not in this decision) — the STATUS is `on_target`.
- **Every re-classification pushes a `reason` string** into `interpretation`. No verdict changes value without recording why (glass-box; no hardcoded verdict without evidence).

---

## 8. Fixtures — the primary user's actual "Get stronger" Week-1 Base case

`load-status-reconcile.test.ts`. **Each asserts status AND that the evidence names the plan-primary reasoning — no bare verdict-string assertions.**

- **D-267 CORE (his live case):** `planPrimary='strength'`, `primaryAdherence={discipline:'strength', met:true, note:'4/4 sessions · e1RM improving'}`, `raw.status='under'`, `runLoadPct` ≈ −40 (runs swapped), `unweightedAcwr=1.3`, `weekIntent='baseline'` (Base→baseline), readiness `adapting`.
  - `assertEquals(r.status, 'on_target')` — NOT `under`.
  - `assertStringIncludes(r.interpretation, 'strength')` **and** one of `'cross-training' | 'carried' | 'covered'` — the evidence must name *strength on plan* AND *endurance covered*.
- **D-267 CASE-B (Amendment 1b — headroom, not deficit):** `planPrimary='strength'`, `primaryAdherence={discipline:'strength', met:true, note:'...'}`, `raw.status='under'`, `unweightedAcwr=0.9` (**below** `ENDURANCE_COVERED_ACWR_MIN`).
  - `assertEquals(r.status, 'on_target')` — **never `under`**, even uncovered (the Amendment-1 invariant).
  - `assertStringIncludes(r.interpretation, 'headroom')` — evidence is the headroom phrasing, not a deficit.
- **D-267 MID-WEEK (Amendment 2 — WTD proration, helper + reconciler):**
  - Helper: `computePrimaryAdherence({ planPrimary:'strength', strengthSessionsCompleted:1, strengthFrequency:4, strengthTrend:'stable', dayIndex:1 /* Tuesday */ })` → `.met === true` (1 ≥ 4×2/7 − 1).
  - Reconciler: fed that `primaryAdherence`, `raw.status='under'`, `unweightedAcwr=1.1` → `assertEquals(r.status, 'on_target')`.
- **NEG-1 genuine under still fires:** `planPrimary='strength'`, `primaryAdherence.met=false`, `unweightedAcwr=0.6` → `status==='under'`, interpretation names strength shortfall.
- **NEG-2 endurance-primary unchanged:** `planPrimary='endurance'`, `raw.status='under'`, run shortfall, `unweightedAcwr=0.7` → `status==='under'` (no regression).
- **NEG-3 unknown = current behavior:** `planPrimary` absent → identical to pre-D-267 output on the same inputs.
- **REGRESSION:** the full existing D-259/D-266 suite (HIGH-direction swap de-escalation, two-key cap) must stay green — D-267 touches only the under-direction and only for a non-endurance primary.

---

## 9. Out of scope (related follow-ons — noted, NOT in this decision)

- **Intensity-binned per-domain ACWR** (D-263 slices) as the `enduranceShortfallCovered` signal instead of total ACWR — a precision upgrade, follow-on.
- **TRIMP / cross-discipline internal-load cross-check** for "covered" — follow-on.
- **"maintaining" display label** (vs the `on_target`→"balanced" word) — copy follow-on.
- **Strength-primary escalation direction** (does strength overreaching drive `high`?) — unchanged here; the two-key/D-266 path already governs escalation.

---

## 10. Blast radius

Server-only. `coach/index.ts` (resolve `planPrimary`, compute `primaryAdherence`, extend the `planPosition` it passes), `_shared/load-status-reconcile.ts` (the under-direction re-classification + new `planPosition` fields), fixtures. `body-response.ts` **unchanged** (its run-only status stays a raw input). Defaults keep it inert until coach wires it. No client change (the client already reads the reconciled verdict, D-260 wiring shipped 2026-07-09).

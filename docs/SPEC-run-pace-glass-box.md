# SPEC — The run-pace stack: one resolver, no silent writes, nothing hidden from the athlete

**Status:** SPEC (2026-07-13). **Supersedes nothing** — it does NOT touch how any number is *computed*.
**Law:** Constitution Law 1 (one source per claim), Law 2 (measured ≠ inferred), Law 3 (confidence travels to the surface), Law 4 (surfaces render, never re-decide).
**Cross-ref:** D-033 (the reconciler — untouched), D-284 (the easy band), Q-171, Q-173.

---

## 0. ⛔ THE THING THIS SPEC IS *NOT* — read before you "improve" it

**This spec does NOT derive easy pace from threshold pace.** That was proposed, traced, and **killed**. Do not resurrect it. The receipts:

1. **It already exists** — `create-goal-and-materialize-plan/index.ts:319-325` already does `learned threshold → estimateVdotFromPace → getPacesFromScore → .base`. It runs today, as the *fallback*, with learned-easy overriding it at `:340-347`. The proposal was never "build it"; it was "invert its precedence."
2. **D-033 already rejected it.** `DECISIONS-LOG.md:691`, verbatim: *"**Threshold pace as the signal, not easy pace. Rejected** — Easy pace at HR is the cleanest read on aerobic fitness; threshold prescriptions inherit via Daniels ratios anyway."*
3. **It re-breaks Law 1 permanently.** The D-033 reconciler compares BASELINE against OBSERVED. D-284 spent real effort forcing both to *measure one population*. A Daniels table value is not a measurement of that population — it is an inference with a **fixed structural offset**. The reconciler would stop measuring *fitness change* and start measuring *the athlete's deviation from Daniels*. That deviation never goes away, so the verdict fires **forever**:
   - dense data → `reconciled_better` permanently (a lie),
   - sparse data (the norm) → the derived slow pace goes **straight into the plan**.
   Same change, opposite failure, decided by how much the athlete happened to run.
4. **It blunts detraining detection by the whole offset** (20-60 s/mi). That machine exists *precisely* to catch detraining.
5. **`baselineUsable()` (`science.ts:70-79`) requires `confidence !== 'low'` AND `sample_count >= 2`.** A table lookup has neither. Shipping it would require **fabricating a sample_count** — the exact Law 2 violation deleted in D-284 (`run_easy_hr = 122, sample_count: 0`).

**The math is fine. The plumbing is what lies.** This spec fixes the plumbing and touches no coefficient.

---

## 1. The problem, in one line

The run-pace stack **fabricates numbers, overwrites the athlete without asking, hides the correction UI, and strips provenance before it reaches the surface.** Every one of those is a Constitution violation, and all four are live today.

---

## 2. The four defects (traced, file:line, all CONFIRMED)

### D1 — Fabricated paces reach user-facing verdicts (Law 2)
There is **no `resolveCurrentRunPace`**. The bike has `resolveCurrentFtp` (`src/lib/resolve-current-ftp.ts:62`), written expressly to kill *"8 different ad-hoc `||`/`??` fallback chains that previously chose differently per consumer."* **The run never got one.** The disease is still live:

| site | fabrication |
|---|---|
| `_shared/token-parser.ts:88, 101, 186, 194` | `baselines.easyPace \|\| 540` (9:00/mi, invented) |
| `supabase/lib/analysis/running/token-parser.ts:142, 169, 361, 385` | same |
| `analyze-running-workout/index.ts:453` | `easyPace: 540` — **this one GRADES the workout card** |
| `_shared/end-plan-core.ts:72` | `effort_paces.base ?? 600` |
| `_shared/planning-context.ts:380` | `?? 600` |
| `shared/strength-system/strength-primary-plan.ts:413` | `FALLBACK_EASY_MIN_PER_MILE` (10:00/mi) |
| `generate-strength-plan/index.ts:44-60` | a local ad-hoc resolver (Q-105) |

A number with no provenance reached a verdict the athlete reads. That is the "score that lies."

### D2 — `adapt-plan` silently overwrites the athlete's baseline (Law 2, and plain consent)
`adapt-plan/index.ts:1206-1234`: if learned easy pace is `confidence: 'high'` and diverges from the athlete's manual entry by **≥7%**, it **writes `performance_numbers.easyPace`**. No prompt. No consent. **No un-write path.** It then cascades into token targets, materialize-plan's chain, client token expansion, and — via `materialize-plan:543` — **the marathon-pace target**.

The app changes the athlete's own typed number behind their back. No commercial app does this; Garmin/TrainingPeaks *suggest* and let the athlete adopt.

### D3 — The athlete cannot correct the app (anti-glass-box)
`src/components/TrainingBaselines.tsx:1249`: when a learned easy pace exists, the **manual input is HIDDEN**. There is no accept, no reject, no override. The inference wins and the athlete has no recourse.

### D4 — Provenance is stripped before the surface (Law 3)
`_shared/arc-context.ts:526-550` (`buildRunPaceForCoach`) ships `easy.{sec_per_km, per_km, per_mile}` to the **LLM** with **no source, no confidence, no sample_count** — rendered *identically and indistinguishably* from threshold pace. One measured, one inferred, same clothes. Law 3's failure tell verbatim.
Also `_shared/block-adaptation/index.ts:523` hardcodes the evidence string `"Learned from recent easy runs"` regardless of the value's actual provenance.

### D5 (bonus, latent) — `create-goal-and-materialize-plan/index.ts:2401`
`Number(learned_fitness.run_easy_pace_sec_per_km)` reads the **metric object, not `.value`** → always `NaN`. Get Strong maintenance mileage silently never receives the easy pace.

---

## 3. The fix

### F1 — `resolveCurrentRunPace` (new, `src/lib/resolve-current-run-pace.ts`)
An exact structural twin of `resolveCurrentFtp` — pure, no I/O, importable from client **and** edge (the `src/lib/session-frequency-defaults.ts` precedent).

```ts
export type RunPaceSource = 'learned' | 'manual' | 'effort_paces' | 'learned-low';
export type ResolvedRunPace = {
  sec_per_mi: number | null;
  source: RunPaceSource | null;
  confidence: 'low' | 'medium' | 'high' | null;
  sample_count: number | null;
  as_of: string | null;      // Q-173 — the newest SESSION behind it, not the last rebuild
  is_estimate: boolean;      // Law 2 — an inference must declare itself
};
export function resolveCurrentRunEasyPace(b: BaselinesLike): ResolvedRunPace;
```

**Precedence** (mirrors FTP's ruling, adapted):
1. `learned_fitness.run_easy_pace_sec_per_km`, confidence ∈ {medium, high} → `learned`
2. `performance_numbers.easyPace` (the athlete asserted it) → `manual`
3. `effort_paces.base` (wizard-derived) → `effort_paces`, `is_estimate: true`
4. learned at any confidence → `learned-low`
5. else **null** — and consumers that need a number to render must **disclose, not invent**.

**INVARIANT: no bare fallback literals.** `|| 540`, `?? 600`, `FALLBACK_EASY_MIN_PER_MILE` and the Q-105 local copy all die. Every D1 site routes through the resolver.

⚠ **Unit footgun (this repo has been bitten 3×):** `learned_fitness` is **sec/km**; `performance_numbers.easyPace` is **sec/mi**. The resolver normalizes to **sec/mi** and says so in its name and return type. Test both.

### F2 — `adapt-plan` suggests; it never writes
Delete the auto-write at `adapt-plan/index.ts:1206-1234`. The suggestion path (`:349-390` → `:934-963`, id `end_easy_pace`) **already exists and already works** — that is the whole mechanism, and it is athlete-gated. Route the divergence into it. Nothing writes `performance_numbers.easyPace` without an explicit athlete action.

### F3 — Baselines shows both, and lets the athlete decide
Un-hide the manual input (`TrainingBaselines.tsx:1249`). Render learned **and** manual side by side, with the basis + `as_of` line (already built this session), plus **accept / override**. Reuse the **5K-nudge** pattern (`TrainingBaselines.tsx:1206-1230` + `arc-context.ts:558` `buildFiveKNudge`) — the one real Yes/No→write precedent in the app — and the generic gated suggest engine `suggestBaselineUpdate` (`_shared/state-trend/reconcile.ts:46`). **Do not invent a new adopt pattern; two exist.**

### F4 — Provenance travels (Law 3)
`arc-context.ts` `buildRunPaceForCoach` carries `source` / `confidence` / `as_of` alongside every pace, so the LLM cannot assert above its confidence. `block-adaptation:523`'s hardcoded evidence string reads the actual source.

### F5 — Fix the `.value` bug at `create-goal:2401`.

---

## 4. Blast radius (what this DOESN'T touch)

**No number changes value.** F1-F5 change *where a number comes from*, *who is allowed to overwrite it*, and *what travels with it* — never what it is. So:

- **D-033 reconciler:** untouched. Baseline stays the measured learned easy pace. Law 1 intact.
- **The easy band / `easy-hr.ts`:** untouched.
- **VDOT / `PACE_TABLE`:** untouched (but see §6 — it needs a citation).
- **Existing plans:** unaffected, *except* that F2 removes a silent mutation that was moving them. That is a fix, not a regression.
- **The only intended behavior change:** fabricated fallbacks stop reaching verdicts, and the athlete stops being overwritten without consent.

---

## 5. Order of work

1. **F1** `resolveCurrentRunPace` + fixtures (unit conversion both ways; every precedence tier; null-not-zero).
2. **F1b** Route the 7 fabrication sites through it. Delete the literals.
3. **F2** Kill the adapt-plan auto-write.
4. **F5** Fix the `.value` NaN bug.
5. **F4** Carry provenance into arc-context + block-adaptation.
6. **F3** The Baselines accept/override UI (client; ship last, it's the only one needing an eyeball).

---

## 6. Owed / flagged, NOT in scope

- **`PACE_TABLE` has no source citation.** Four copies of a VDOT model (`generate-run-plan/effort-score.ts:65`, `src/lib/effort-score.ts:77`, `_shared/endurance/pace-zones.ts`, and an **unguarded inline fourth** at `GoalsScreen.tsx:1084/1096`). Two are parity-locked; the GoalsScreen copy is not. Consolidate + cite. **File as its own Q.**
- **Q-173** (the freshness stamp) — the `as_of` half is built this session; F1 threads it into the resolver.
- **THE REAL TRAINING QUESTION (not a code fix):** the athlete's easy pace sits at **110% of threshold pace** = **Friel Zone 3 (tempo)**, and every qualifying easy run pins to the top of HR Z2 (133-134 against a 134 ceiling). Friel says easy = **114-129%** of threshold; Daniels says threshold **+1:20-2:00/mi**. Both say ~11:25-13:00, not 11:08. **BUT** the anchors are thin — threshold pace `n=3`, LTHR `n=2` — so an equally consistent story is that both anchors are *underestimated* (3 months post-marathon, no hard efforts to learn from). **These two stories are indistinguishable from the data.** Exactly one action separates them: **a threshold test.** Do not "fix" the athlete's zones by inference.

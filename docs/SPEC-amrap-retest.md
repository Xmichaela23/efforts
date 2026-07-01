# SPEC — AMRAP retest (Get Strong) — BUILT (D-224)

Status: **BUILT 2026-07-01 (D-224).** Sequenced per Michael: (1) anchor settled, (2) citations verified, (3) spec, (4) built + deployed. Kept as the design record; see D-224 for the shipped decision.

---

## 1. Anchor finding — SETTLED (read `performance_numbers` for 45d122e7)

Stored, read-only:
```
bench = 160    squat = 110    deadlift = 150    overheadPress1RM = 110    (units: imperial)
```

- **Key canonicalization is CLEAN.** Each anchor is stored under exactly ONE key — `bench`, `squat`, `deadlift`, `overheadPress1RM` — with **no drifted duplicates** (`overhead`, `ohp`, `bench_press`, `squat_1rm`, … all absent). The write side (`getBaselineKeyForExercise` → `overheadPress1RM`/`squat`/`bench`/`deadlift`) and the read side (`pickPrimary1RMAndBase`) **agree on these exact keys.** The retest write-back will land on the right key — it does **not** write into the void.
- **squat = OHP = 110 is REAL STORED DATA, not a mapping bug.** Both are genuinely stored as 110 under distinct keys. There is no code path where OHP borrows squat. So: if these aren't Michael's true lifts (squat 110 < bench 160, and OHP 110 = squat 110, are both physiologically unusual), **re-entering is safe and will stick** — the keys are canonical and the retest targets them.
- **One latent footgun (spec pre-req, cheap):** the naming is asymmetric — 3 short keys (`bench`/`squat`/`deadlift`) + 1 long (`overheadPress1RM`). Currently consistent end-to-end, but before the retest depends on it, **add a one-line assertion/normalizer** so an OHP result can never be written to `overhead`/`ohp` by some other path. Guard, don't refactor.

**→ Gate 1 PASSED: the retest can safely depend on these anchor keys.**

## 2. Citations — VERIFIED (4th/5th gate today)

- ⚠️ **The PMID was wrong.** `PMID 9355611` is a 1997 *legal case report* ("Nurse alleges Dr. mistreated…"), NOT LeSuer. Fifth misattributed citation caught by the gate (after Piacentini, Crowley/Cotie, Vora, Edge).
- ✅ **Real citation:** **LeSuer, D.A., McCormick, J.H., Mayhew, J.L., Wasserstein, R.L., & Arnold, M.D. (1997).** "The Accuracy of Prediction Equations for Estimating 1-RM Performance in the Bench Press, Squat, and Deadlift." *J Strength Cond Res* **11(4):211–213.** 67 untrained subjects; all r > 0.95; prediction error **within ~3% for reps in the 2–10 range**; Epley/Brzycki most accurate for bench + squat at low reps.
  - **⚠ Load-bearing nuance for THIS design:** LeSuer found **all equations systematically UNDERESTIMATE the deadlift.** So a deadlift AMRAP e1RM reads *conservative* — a flat/low deadlift estimate is partly the formula, not the athlete. Spec must (a) frame deadlift as conservative, and/or (b) not alarm on a flat deadlift e1RM.
- ✅ **AMRAP ≤10 consensus (Epley/Brzycki):** most accurate 2–10 reps (best **3–6**); Brzycki edges Epley at 1–6, Epley at 6–10; they **diverge above 10** (Epley overestimates); a 5RM load beats 10/20RM. Sources: calc/coaching consensus (Arvo, Strength Journeys, Setgraph) resting on LeSuer + Mayhew as primaries.
  - **⚠ Critical assumption:** the estimate assumes the set is taken **to or near momentary failure.** Stopping well short under-reads. Our safe framing ("stop at ~RPE 9 / on form break, no solo grind") is *compatible* — RPE 9 ≈ 1 rep in reserve, close enough — but the copy must land on **RPE 9, not "stop early,"** or accuracy suffers.

**→ Gate 2 PASSED: cite LeSuer 1997 (correct ref) + the ≤10/near-failure consensus; flag deadlift-underestimate.**

## 3. The retest re-emit — SPEC

**Why this is correct (vs the removed D-223 version):** the old retest fixed *reps* at 3 and computed off the OLD max → Epley 0.88×1.10 = **0.968, a guaranteed loss.** AMRAP fixes the *weight* (~88%) and **opens the reps** → getting stronger shows up as *more reps* → higher estimate. Mathematically cannot force a loss.

### 3a. Composer (`strength-primary-plan.ts`) — re-add wk12 as an AMRAP retest (supersedes the D-223 consolidation-only ending)
- One retest session per key lift, all four in the **same AMRAP format** (no more check-vs-estimate split):
  - **Weight:** fixed **~88% 1RM** (lands the athlete in a 3–5RM zone).
  - **Reps:** **`AMRAP`** (open) — NOT a fixed 3. Per-lift target caps: **squat/bench 3–5**, **deadlift ≤5** (grip/breathing, not strength), **hard cap ≤10** for estimator accuracy [LeSuer 1997].
  - **Tag:** restore `1rm_test` (the logger's write-back trigger) + `protocol:strength_primary`. (`estimate_1rm` optional.)
  - **Copy (safe framing):** "Warm up, then ONE all-out set: as many *clean* reps as you can at this weight. Stop at ~RPE 9 (about one hard rep left) or the moment form breaks — never grind to failure alone. More reps than last block = your gain, measured not assumed."
  - **Deadlift note:** "e1RM formulas read deadlift conservative — a flat number here isn't necessarily a flat lift [LeSuer 1997]."
- **Design note (taper):** wk12 test follows the wk8–11 peak with no deload between. AMRAP@88% is submaximal so it's tolerable fatigued, but consider the first 2–3 days of wk12 light before the test set. (Open call — flag, don't assume.)

### 3b. Session map (what the logger renders per lift)
```
Retest — Bench Press (AMRAP → e1RM)          [wk12]
  Warm-up ramp   bar×5 → 50%×5 → 70%×3 → 85%×2      (ready, not cold)
  TEST SET ×1    ~88% 1RM × AMRAP                    ← the only scored set
                 "clean reps only; stop ~RPE 9 or on form break; no solo grind"
  Log            actual reps (open field)
  Engine         Epley  w×(1+r/30)   &   Brzycki  w/(1.0278−0.0278r)   → cluster → e1RM
  Write-back     ratchet-UP only (never lowers the stored 1RM)   ← already built (D-223)
```
Squat = same (3–5 zone). OHP = same (3–5). Deadlift = same (≤5; conservative-estimate note).

### 3c. Logger (`StrengthLogger.tsx`) — mostly reuse
| Piece | State today | Work |
|---|---|---|
| Warm-up ramp | exists for *named* Baseline Test; **tag-retest falls through to its own exercises** (`:1865`) | **NEW (small):** emit warm-up sets from the composer for the tag-retest, or reuse the warm-up addon |
| AMRAP set (open reps) | already parsed + flagged (`isAmrap`, `:1397/:1440`) | reuse |
| e1RM formula | **Epley only** (`calculate1RM`, `:768`) | **NEW (small):** add Brzycki; cluster the two |
| Write-back via `1rm_test` | path exists (`:1868`), compute at `:2639` uses logged reps | reuse |
| Ratchet-up guard | **done** (D-223) | reuse |

### 3d. Not in scope
- No taper-week redesign (flag only). No change to the arc, deload, peak, or run distribution. No re-refactor of the anchor keys beyond the one-line OHP-key guard (3a pre-req).

---

## Build order (when greenlit)
1. OHP-key normalizer/assert (anchor pre-req).
2. Composer: re-emit wk12 AMRAP retest (weight ~88%, reps AMRAP, caps, tags, copy, deadlift note).
3. Logger: add Brzycki + cluster; wire warm-up for the tag-retest.
4. Tests: retest week has `1rm_test`, AMRAP (open reps), ≤10-rep caps, no fixed-3; e1RM clusters Epley/Brzycki; ratchet-up guard holds on a lower estimate.
5. Doc: fold the verified LeSuer + ≤10 consensus into `SCIENCE-strength-primary-loading.md`.

*Cross-ref: D-221 (engine), D-222 (band), D-223 (retest removed + ratchet guard — this un-removes it correctly), `strength-primary-plan.ts`, `StrengthLogger.tsx`.*

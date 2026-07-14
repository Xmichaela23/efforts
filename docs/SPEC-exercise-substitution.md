# SPEC — Exercise substitution: a swap is not a skip

**Status:** SPEC (2026-07-13). Not built.
**Laws:** 1 (one source), **2 (measured ≠ inferred)**, 4 (surfaces render, never re-decide).
**Voice:** `PRODUCT-POSITIONING-v2-DRAFT.md` — **a trade made visible, not a compliance cop.** Same thesis as `SPEC-posture-flag.md`, applied to a single exercise.
**Sign-off gated:** this changes prescription-adherence semantics (`POLISH-PUNCH-LIST` §1: *"any change to prescribed load / RIR… held for user sign-off"*).

> **Michael, 2026-07-13:** *"I'm gonna swap Bulgarian split squats for hip thrust… I don't think the app should dock the user for substitutions if they are actual substitutions. Now it does."*

---

## 0. The one-line version

> **You swapped Bulgarian Split Squat for Hip Thrust. That's hip-dominant instead of knee-dominant — same session, different stimulus.**

No dock. No silence either. **The athlete's own swap, named.**

---

## 1. THE BUG — it is a DOUBLE penalty, and it is verified

`analyze-strength-workout:520` `matchExercises` links planned↔executed **BY NAME ONLY** — exact match, then a fuzzy `includes()`. There is **no** substitution concept anywhere in the codebase (`grep substituted_for|swapped_from|original_name` → **zero hits**).

So when the athlete does Hip Thrust instead of the planned Bulgarian Split Squat:

| | what happens | consequence |
|---|---|---|
| **Bulgarian Split Squat** (planned) | no executed exercise carries that name → `matched: false` (`:554`) | counts as a **SKIP**. Drags down `exerciseCompletion` (`:1337`), which is **30% of the execution score** (D-208, role-weighted: primary/secondary **1.0**, accessory **0.5**). |
| **Hip Thrust** (executed) | no planned match → `{ planned: null, matched: false }` (`:593`) | excluded from `plannedEntries` (`:1332`, filters on `ex.planned != null`) → **ZERO CREDIT for the work actually done.** |

> **Penalised for what he didn't do, and unpaid for what he did.** The app cannot tell a substitution from a skip **because nobody ever told it.**

---

## 2. What already exists (do NOT rebuild)

| piece | where | status |
|---|---|---|
| Per-exercise planned↔executed matching | `analyze-strength-workout:520` `matchExercises` | BUILT — **name-only. This is the seam.** |
| Role-weighted exercise completion | `analyze-strength-workout:1337` + `_shared/strength/exercise-role.ts` (`ROLE_WEIGHT`: primary/secondary 1.0, accessory 0.5) | BUILT (D-208) |
| **Movement-pattern reference per exercise** | `materialize-plan/exercise-config.ts` — `primaryRef: 'squat' \| 'deadlift' \| 'bench' \| 'overhead' \| 'hipThrust'`, ~135 entries, research-cited | **BUILT — and this is what makes the honest sentence possible.** |
| Set-level PROVENANCE flags (the pattern to copy) | `StrengthLogger.tsx` — `prefilled` (D-204), `rir_autofilled` (D-204), `from_previous` (D-097) | BUILT — **provenance is already how this codebase records "how do we know this?"** |
| **Equipment substitution at PLAN-BUILD time** | `materialize-plan:1006-1032` | BUILT — ⚠️ **A DIFFERENT THING. Do not conflate.** That rewrites the PLAN before the athlete sees it (no sled → a loaded lunge). This spec is about the athlete swapping at LOG time, against a plan that already fits their equipment. |

**Every part exists except one field and one branch.**

---

## 3. The design

### 3.1 The athlete SAYS it. The app does not guess. (Law 2)

**A "Swap" action on a planned exercise in the logger.** It replaces the exercise and stamps provenance on the executed one:

```ts
substituted_for?: string;   // the planned exercise name this replaces
```

Mirrors `prefilled` / `rir_autofilled` / `from_previous` exactly: **a flag that records how we know, written at the point of truth.**

> ⛔ **DO NOT INFER EQUIVALENCE FROM THE MOVEMENT PATTERN.** It is tempting — `primaryRef` is right there — and it is wrong. Bulgarian Split Squat is `primaryRef: 'squat'` (knee-dominant, ratio 0.50). Hip Thrust is `primaryRef: 'deadlift'` (hip-dominant, ratio 0.90). **They are genuinely different stimuli.** An app that silently decides they are interchangeable is inventing (Law 2), and it would also let a real deviation — a heavy squat "swapped" for a leg extension — pass as compliance. **Ask. Don't guess.**

### 3.2 `matchExercises` honours the swap

One branch, before the fuzzy fallback: an executed exercise whose `substituted_for` normalizes to a planned exercise's name **MATCHES it**.

Result: the planned exercise is **not a skip** (no dock), and the executed work **lands in the denominator** (credit). The double penalty dies.

### 3.3 The score does not punish the swap — and the session still tells the truth

**A declared swap counts as COMPLETED for exercise-completion (the 30% term).** The athlete showed up and did the work.

**Load and RIR adherence are computed against the SUBSTITUTE'S own prescription, not the original's.** A hip thrust is not graded against a Bulgarian split squat's target — that would be nonsense. If the substitute has an `exercise-config` entry (hip thrust does: `deadlift × 0.90`), it gets a real target. If it does not, it is **un-anchored and must NOT be graded** — see §3.5.

### 3.4 The receipt — this is the product part

**The app names the trade. It does not score it.**

Compare `primaryRef` (and `roleForExercise`) of the planned vs the substitute:

- **Same reference + same role → say nothing.** A clean like-for-like swap is not news.
- **Different reference or role → ONE honest sentence:**
  > *"Swapped Bulgarian Split Squat → Hip Thrust. Hip-dominant instead of knee-dominant — same session, different stimulus."*

**That is the posture flag, at the scale of one exercise.** Not a nag, not a score, not a block. **The athlete moved, and they know they moved.** They decide whether they care.

> ⚠️ **The sentence is a FACT, not a judgment.** *"Different stimulus"* is true and checkable from `primaryRef`. **Do NOT extend it into a claim about consequence** (*"your quads will suffer"*) — that is exactly the Tier-2 trap `SPEC-posture-flag.md §4` documents, and the app has no model for it.

### 3.5 ⛔ Never grade what you cannot anchor (the Q-180 rule)

If the substitute has no `exercise-config` entry, the app **does not know** what load was appropriate. It must **exclude that exercise from load/RIR adherence and say so** — not invent a target, and not score it as a miss.

**This is the same rule Q-180 established** (*"if the app structurally cannot capture an exercise, it must not grade the athlete on it"*), and the same law that forbids the silent 135 lb squat. **Refuse, disclose, move on.**

---

## 4. ⚠️ What NOT to build

- **NOT pattern-inferred equivalence.** See §3.1. Ask the athlete.
- **NOT a "substitution allowed / not allowed" gate.** The app is not a compliance cop (`PRODUCT-POSITIONING-v2-DRAFT §7`). **Missing your prescription is not a failure — it is a trade. The app's job is not to stop you moving; it is to make sure you know you moved.**
- **NOT a consequence claim.** Naming the stimulus change is a fact. Predicting its cost is an invention.
- **NOT a second matcher.** `matchExercises` is the one place planned meets executed. Extend it; do not write a parallel path.
- **NOT free forgiveness.** A swap the athlete *declared* is not a skip. An exercise that simply **didn't happen** still counts as a skip — that is D-208 working correctly, and Q-178 just fixed the hole where a flag could fake it.

---

## 5. Verification

- **Fixtures** (`_shared/strength/`, alongside `performed-set.test.ts`):
  - a declared swap → planned NOT a skip, substitute IS credited, `exerciseCompletion` unchanged vs a clean session
  - **the Michael case:** BSS → Hip Thrust → no dock, and the honest sentence fires (different `primaryRef`)
  - a like-for-like swap (same `primaryRef` + role) → no dock, and **no sentence** (not news)
  - an **undeclared** miss → still a skip (D-208 intact — **the regression that matters most**)
  - a substitute with **no `exercise-config` entry** → excluded from load/RIR adherence, disclosed, **not scored as a miss**
- **Then:** one real logged swap on device, and read the Performance screen.

---

## 6. Blast radius

- `matchExercises` is the core of strength adherence. **Every** strength execution score routes through it. The undeclared-miss fixture is the guard — write it first.
- The execution score will **RISE** for any athlete who has been swapping exercises and silently eating the dock. That is a **correction**, not a regression. **Name it when it ships.**
- No migration. `substituted_for` is additive; legacy sets simply don't carry it and behave exactly as today.

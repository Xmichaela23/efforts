# SPEC — Exercise substitution: the SLOT is the unit, not the exercise

**Status:** SPEC v2 (2026-07-14). Not built. **v1 (2026-07-13) was WRONG and is superseded — see §0.**
**Laws:** 1 (one source), **2 (measured ≠ inferred)**, 4 (surfaces render, never re-decide).
**Grounding:** field-standard mechanic (see §2), not invented. **`primaryRef` + `roleForExercise` already exist — this uses them.**
**Sign-off gated:** changes prescription-adherence semantics (`POLISH-PUNCH-LIST` §1).

> **Michael:** *"I'm gonna swap Bulgarian split squats for hip thrust… I don't think the app should dock the user for substitutions if they are actual substitutions. Now it does."*
> **And:** *"Follow whatever pattern a commercial strength app would follow. Let's not invent anything."*

---

## 0. ⚠️ v1 WAS WRONG. Read this before anything else.

**v1 designed:** let the athlete swap freely, then have the app *name the trade* on every swap.

**The field does the opposite: it CONSTRAINS the swap so there is no trade to name.**

> ### THE INSIGHT, AND IT REFRAMES EVERYTHING
> **No commercial strength app treats the EXERCISE as the unit of adherence. They treat the SLOT** — the movement pattern / muscle group the program actually prescribed. **The exercise is one instantiation of the slot.**
>
> **Swap within the slot and NOTHING WAS MISSED.** There is no penalty question, because there is nothing to forgive. The program asked for a knee-dominant lower push; you did one.

That is why the field has no "should a swap be docked?" debate. **The question never arises.** Efforts docks the athlete only because its adherence matches **by exercise NAME**, which is a unit no serious programmed app uses.

---

## 1. THE BUG — a DOUBLE penalty (verified)

`analyze-strength-workout:520` `matchExercises` links planned↔executed **BY NAME ONLY** — exact, then a fuzzy `includes()`. **No substitution concept exists anywhere** (`grep substituted_for|swapped_from|original_name` → **0 hits**).

Do Hip Thrust instead of the planned Bulgarian Split Squat:

| | what happens | consequence |
|---|---|---|
| **Bulgarian Split Squat** (planned) | no executed exercise carries the name → `matched: false` (`:554`) | counts as a **SKIP** → drags `exerciseCompletion` (`:1337`) = **30% of the execution score** (D-208) |
| **Hip Thrust** (executed) | no planned match → `{ planned: null }` (`:593`) → dropped by `plannedEntries` (`:1332`) | **ZERO CREDIT for the work actually done** |

**Penalised for what he didn't do, and unpaid for what he did.**

---

## 2. THE FIELD STANDARD (researched 2026-07-14 — this is the pattern to copy)

| app | what it does |
|---|---|
| **ABC Trainerize** | substitution filters named, verbatim: **"Same muscle group" · "Same Equipment" · "Same movement"** (plus main-muscle / mechanics / level) |
| **Fitbod** | **auto-substitutes exercises that target the same muscles at equivalent intensity**; equipment constrains the option set |
| **RP Hypertrophy** | swap **mid-cycle** from a maintained library of alternatives (missing machine, injury, travel) |
| **Built with Science** | swap any time **"while keeping the plan structurally sound"** |
| **consensus on a GOOD substitute** | **match the MOVEMENT PATTERN** — push / pull / hinge / squat |

**Converged pattern, and all four points matter:**
1. **Substitution is a FIRST-CLASS ACTION** — a "Swap" button on the prescribed exercise. **Not delete-and-re-add.** (Delete-and-re-add is exactly what destroys the link today.)
2. **The app OFFERS the alternatives**, filtered by movement pattern + the athlete's equipment. The athlete picks from a list; they do not have to know what a valid substitute is.
3. **A free-library override is still allowed.** Every app lets you search everything and pick anything.
4. **Adherence is tracked against the SLOT.** A swap is not a deviation. **No app docks you for it.**

---

## 3. What already exists (do NOT rebuild — the slot taxonomy is already here)

| piece | where | status |
|---|---|---|
| **Movement-pattern slot per exercise** | `materialize-plan/exercise-config.ts` — `primaryRef: 'squat' \| 'deadlift' \| 'bench' \| 'overhead' \| 'hipThrust'`, ~135 entries, research-cited (NSCA, Schoenfeld, Helms, Contreras) | **BUILT. This IS the slot taxonomy.** |
| Role tier | `_shared/strength/exercise-role.ts` — `roleForExercise` → primary / secondary / accessory; `ROLE_WEIGHT` (D-208) | BUILT |
| **Slot-preserving substitution, with honest notes** | `materialize-plan:1006-1032` — *"No sled — loaded walking lunge (forward horizontal drive under load)"* | **BUILT — for EQUIPMENT, at PLAN-BUILD time.** ⚠️ A different moment from this spec (athlete swaps at LOG time), but **the same idea, and the notes are the voice to copy.** |
| Set/exercise PROVENANCE flags (the pattern to mirror) | `StrengthLogger.tsx` — `prefilled`, `rir_autofilled` (D-204), `from_previous` (D-097) | BUILT |
| Planned↔executed matching | `analyze-strength-workout:520` `matchExercises` | BUILT — **name-only. THIS is the seam.** |

**The slot concept exists. Adherence simply doesn't use it.** Same disease as the rest of the app: *built, and not introduced to the thing next to it.*

---

## 4. THE DESIGN

### 4.1 A "Swap" action on the prescribed exercise (field-standard #1)

Replaces delete-and-re-add. Stamps provenance on the executed exercise:

```ts
substituted_for?: string;   // the planned exercise name this replaces
```

Mirrors `prefilled` / `rir_autofilled` / `from_previous` exactly — **a flag recording HOW WE KNOW, written at the point of truth.** Additive; legacy rows behave exactly as today.

### 4.2 The app OFFERS the alternatives (field-standard #2)

The swap sheet lists exercises from `EXERCISE_CONFIG` filtered by:
- **same `primaryRef`** (same movement-pattern slot), **and**
- **same `roleForExercise` tier**, **and**
- **the athlete's equipment** (reuse the `substituteExerciseForEquipment` signals — `hasBarbell` / `hasDumbbells` / …).

For a planned **Bulgarian Split Squat** (`primaryRef: 'squat'`, accessory) that offers: reverse lunge, walking lunge, step-up, goblet squat, front squat — **not** hip thrust.

> ⛔ **DO NOT invent a new taxonomy.** `primaryRef` is the slot. It is already research-cited and already drives every accessory's load. **Use it.**

### 4.3 A free-library override is allowed (field-standard #3)

The athlete can search the whole library and pick anything — **including out-of-slot.** The app does not block. *(`PRODUCT-POSITIONING-v2-DRAFT §7`: not a compliance cop. **"Its job is not to stop you moving; it is to make sure you know you moved."**)*

### 4.4 Adherence is measured against the SLOT (field-standard #4) — the fix

`matchExercises` gains one branch, before the fuzzy fallback: **an executed exercise whose `substituted_for` matches a planned exercise's name MATCHES it.**

- the planned exercise is **not a skip** → no dock
- the executed work **lands in the denominator** → credit
- **load / RIR are graded against the SUBSTITUTE'S OWN prescription**, via its `exercise-config` entry (hip thrust: `deadlift × 0.90`). **Never against the original's** — grading a hip thrust against a split squat's target is nonsense.

### 4.5 ⛔ Never grade what you cannot anchor (the Q-180 rule)

If the substitute has **no `exercise-config` entry**, the app does not know what load was appropriate. **Exclude it from load/RIR adherence and disclose.** Do not invent a target; do not score it as a miss. *(Same law that forbids the silent 135 lb squat.)*

### 4.6 The ONE thing the field does NOT do — and the only place Efforts speaks

**In-slot swap → SILENT.** No dock, no comment. Nothing was missed. **This is 95% of swaps and it is pure field standard.**

**Out-of-slot override → no dock, and ONE honest sentence:**

> *"Swapped Bulgarian Split Squat → Hip Thrust. Hip-dominant instead of knee-dominant — same session, different stimulus."*

`primaryRef` already knows this: BSS = `squat` (knee-dominant, ratio 0.50) · Hip Thrust = `deadlift` (hip-dominant, ratio 0.90).

**This is the ONLY invented-by-Efforts part of the spec, and it is deliberate.** It is the product thesis (`PRODUCT-POSITIONING-v2-DRAFT §3`): *"Everyone can build you a hybrid plan. Nobody will tell you when you've stopped following your own."* **The mechanic is field standard. The one sentence is the wedge.**

> ⚠️ **It is a FACT, not a judgment.** *"Different stimulus"* is true and checkable from `primaryRef`. **Do NOT extend it into a consequence claim** (*"your quads will suffer"*) — that is the Tier-2 trap `SPEC-posture-flag.md §4` documents, and the app has no model for it.

---

## 5. ⛔ What NOT to build

- **NOT a new movement taxonomy.** `primaryRef` is the slot. It is already there and already research-grounded.
- **NOT inferred equivalence without a declared swap.** If the athlete simply logs a different exercise with no swap action, that is **not** a substitution — it is an unplanned exercise plus a skip, and it should read that way. **The declaration is what makes it a swap.** (Law 2: ask, don't guess.)
- **NOT a block.** Out-of-slot is allowed. Not a compliance cop.
- **NOT a consequence claim.** Naming the stimulus change is a fact. Predicting its cost is an invention.
- **NOT a second matcher.** `matchExercises` is the one place planned meets executed. Extend it.
- **NOT free forgiveness.** A **declared** swap is not a skip. An exercise that simply **didn't happen** still is — D-208 working correctly, and Q-178 just closed the hole where a flag could fake it.

---

## 6. Verification

Fixtures in `_shared/strength/` (alongside `performed-set.test.ts`):

- **THE REGRESSION THAT MATTERS MOST — write it FIRST:** an **undeclared** miss is **still a skip**. D-208 intact.
- an in-slot declared swap → planned not a skip · substitute credited · `exerciseCompletion` **identical to a clean session** · **NO sentence**
- **the Michael case:** BSS → Hip Thrust (out-of-slot) → **no dock**, and the honest sentence fires (different `primaryRef`)
- load/RIR graded against the **substitute's** config, never the original's
- a substitute with **no config entry** → excluded from load/RIR adherence, disclosed, **not scored as a miss**
- the swap sheet for a `squat`-slot accessory **does not offer hip thrust**

Then: one real logged swap on device; read the Performance screen.

---

## 7. Blast radius

- `matchExercises` is the core of strength adherence — **every** strength execution score routes through it. **The undeclared-miss fixture is the guard. Write it first.**
- Execution scores will **RISE** for any athlete who has been swapping and silently eating the dock. That is a **correction, not a regression. Name it when it ships.**
- No migration. `substituted_for` is additive.

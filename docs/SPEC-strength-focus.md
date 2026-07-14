# SPEC — Strength focus: specialization is REDISTRIBUTION, not addition

**Status:** SPEC (2026-07-14). Not built. **Supersedes the "+1 accessory bias" as the mechanism for a FOCUS.**
**Grounding:** field standard + volume-landmark science (§2). **Not invented.**
**Laws:** 2 (measured ≠ inferred), 4 (surfaces render, never re-decide).
**Voice:** `PRODUCT-POSITIONING-v2-DRAFT.md` — **a trade made visible.**
**Sign-off gated:** changes prescribed volume.

> **Michael:** *"We were gonna add a glute focus, pull-up focus along with hyrox — in Get Stronger."* (Q-100's original three.)
> **And:** *"Follow whatever pattern a commercial strength app would follow. Let's not invent anything."*
> **And:** *"Don't tune to me."* — **everything below is per-athlete, off their own protocol. No number is gated on any one person.**

---

## 0. THE FINDING — the shipped `accessory_bias` CANNOT be a focus

**Glute and Hyrox shipped (D-225) as a `+1 accessory` on Upper A, rotating weekly.** Q-103 already called it *"a thin delta."*

**The field says it is worse than thin — it is the wrong primitive.**

**Specialization is a REDISTRIBUTION. The `+1 accessory` is an ADDITION.** They are opposite operations:

- **one added set, one week in three, is below MEV** → it grows nothing (§2)
- and because it **adds** rather than **redistributes**, it pushes total volume **toward systemic MRV for zero return**

> **A "+1 accessory" is not a small focus. It is not a focus at all.** *(This is not a criticism of the build — it is honestly labelled as a movement-familiarity bias, and as THAT it works. It simply cannot deliver what "focus" means.)*

**The `accessory_bias` mechanism should stay** — as what it honestly is: a **movement-familiarity** add-on. **A FOCUS is a different feature, and this spec is that feature.**

---

## 1. THE SECOND BUG — declared intent is WRITE-ONCE

`accessory_bias` is **written once by the wizard and never revisable**:

- **written:** `NonRaceBuilder.tsx:145` → `goals.training_prefs.accessory_bias`
- **read:** `create-goal-and-materialize-plan:2423` → `generate-strength-plan:59` → baked into `plans.config` (`:107`)
- **`GoalsScreen:1653`** — *display only*

**There is NO edit path.** An athlete who picks a focus at build time and later wants a different one **must rebuild the entire plan.**

> ⚠️ **This is the SAME DISEASE as Q-179.** `per_discipline_posture` is also write-only. **The app asks the athlete what they want, captures it once, and then neither reads it again nor lets them change their mind.** Two fields, one pattern. **Whatever fixes one should fix both.**

---

## 2. THE FIELD STANDARD (researched 2026-07-14)

### Volume landmarks (Israetel / RP; broadly adopted)
| landmark | weekly sets (per muscle group) | meaning |
|---|---|---|
| **MEV** — minimum effective volume | **~8–12** | below this you **maintain**, you do not grow |
| **MAV** — maximum adaptive volume | **~12–20** | the growth band — where a developing muscle should live |
| **MRV** — maximum recoverable volume | **~18–25+** | the ceiling. Past it: no growth, then regression. **Highly individual.** |

### The specialization protocol — and it is unambiguous
- Push **1–2** target groups toward **MRV**.
- **Hold everything else at MEV** (maintenance).
- **You are already at systemic MRV. You cannot simply ADD.**
  > *"If you're training every body part for 20 sets and that's your MRV, and you want to bring biceps to 25 — you need to take 5 sets out from somewhere else."*
- **Rotate** the specialized group every **8–12 weeks**.

### And RP's app does exactly this
> *"Tell the app what you want to prioritize and it builds a complete program around those goals."* — **prioritization redistributes the program. It does not bolt an accessory on.**

**⛔ THE RULE, AND IT IS THE WHOLE SPEC: A FOCUS TAKES SETS FROM SOMEWHERE. If nothing went down, nothing was focused.**

---

## 3. THE INSIGHT — the correct primitive is a vocabulary Efforts ALREADY OWNS

> ### MEV = "maintain". MAV/MRV = "develop".

**That is literally `per_discipline_posture`, one level down.**

The app already asks the athlete to declare **develop / maintain / out** *per discipline*. **A strength focus is the identical question, per MOVEMENT PATTERN** — and `exercise-config.ts` `primaryRef` (`squat | deadlift | bench | overhead | hipThrust`, ~135 research-cited entries) **is already the pattern taxonomy.**

**A focus is therefore:** *develop* ONE pattern toward MAV · *maintain* the rest at MEV · **total systemic volume flat.**

**Nothing new is invented. The vocabulary, the taxonomy, and the set counts all already exist.**

---

## 4. What already exists (do NOT rebuild)

| piece | where | status |
|---|---|---|
| **Movement-pattern taxonomy** | `materialize-plan/exercise-config.ts` `primaryRef` | **BUILT — this is the "muscle group" axis** |
| Role tier (primary / secondary / accessory) | `_shared/strength/exercise-role.ts` | BUILT (D-208) |
| Sets-per-exercise, per protocol | `shared/strength-system/protocols/` | BUILT — **weekly sets per pattern is COMPUTABLE from the plan today** |
| **The develop/maintain/out vocabulary** | `per_discipline_posture` (`non-race-goal-seeds.ts:221`) | **BUILT — reuse it, do not invent a second one** |
| The accessory-bias slot | `strength-primary-plan.ts:221` `biasAccessoryFor` | BUILT — **keep, as movement-familiarity. NOT a focus.** |
| Protocol selection / frequency policy | `shared/strength-system/protocols/selector.ts`, `frequency-policy.ts` | BUILT |

---

## 5. THE DESIGN

### 5.1 Declare it in the app's own words
`training_prefs.strength_focus: { pattern: 'hipThrust' | 'overhead' | 'squat' | 'deadlift' | 'bench' | 'vertical_pull' | null }`

Offered in Get Stronger. Q-100's original three map cleanly:
- **glute focus** → `hipThrust` (hip-dominant)
- **pull-up focus** → **`vertical_pull`** ⚠️ **not currently a `primaryRef` value — see §7**
- **hyrox** → ⛔ **NOT a focus. It is a PROGRAM** (Q-103). Leave it as the movement-familiarity bias.

### 5.2 Redistribute — the engine
1. Compute **current weekly sets per `primaryRef`** from the plan (already computable).
2. **Raise the focus pattern toward MAV** (aim inside 12–20; never past the athlete's tolerated ceiling).
3. **Lower the other patterns to MEV (~8–12)** — maintenance, not deletion.
4. **Hold TOTAL systemic sets constant.** *(If total rises, it is not a focus — it is just more work.)*
5. **Time-box it: 8–12 weeks**, then rotate or return to balanced. **A permanent specialization is not a specialization.**

> ⛔ **NEVER exceed systemic MRV.** If the target cannot reach MAV without pushing total volume up, **the app must say so and refuse** — *"I can't give you that much glute work without cutting elsewhere more than is safe."* Refuse, disclose. **(Law 2, and the same rule as Q-180: never grade — or prescribe — what you cannot anchor.)*

### 5.3 THE RECEIPT — this is the product, and it falls out for free
**A redistribution HAS A SOURCE. Name it.**

> **"Glute focus on. Moved 4 sets from pressing into hip work. Your pressing is at maintenance for this block — it will hold, not grow."**

**The athlete asked to move, and they know exactly what it cost.** Not a score. Not a nag. **The trade made visible** (`PRODUCT-POSITIONING-v2-DRAFT §4`).

⚠️ *"It will hold, not grow"* is a **fact** — that is what MEV means. **Do NOT extend it into a consequence claim** (*"your bench will fall"*) — same Tier-2 trap as `SPEC-posture-flag.md §4`.

### 5.4 And make it REVISABLE (fixes §1)
The focus must be changeable **without rebuilding the plan** — re-derive the split and re-materialize forward. **Same edit path `per_discipline_posture` needs.** Build one; serve both.

---

## 6. ⛔ What NOT to build

- **NOT a bigger accessory.** Adding sets is not focusing. **If nothing went down, nothing was focused.**
- **NOT more than 1–2 focuses at once.** The field is explicit. Two is the cap; one is better.
- **NOT a permanent focus.** Time-boxed, 8–12 weeks, then rotate.
- **NOT invented volume numbers.** MEV/MAV/MRV are **per-athlete**, derived from their own protocol and tolerance — **never a hard-coded set count, and never tuned to one user.**
- **NOT a new muscle taxonomy.** `primaryRef` is it.
- **NOT hyrox as a focus.** It is a program (Q-103). Do not smuggle it in here.
- **NOT a consequence claim.** *"Maintenance holds"* is a fact. *"Your bench will fall"* is an invention.

---

## 7. ⚠️ OPEN — needs a call before building

1. **`vertical_pull` is not a `primaryRef` today.** The values are `squat | deadlift | bench | overhead | hipThrust`, and pull-ups are `primaryRef: null` (bodyweight). **A pull-up focus REQUIRES a new pattern value** — the only structural addition in this spec. *(Rows are grouped under a "PULL-UPS / BODYWEIGHT UPPER PULL" comment already, so the grouping exists in prose but not in the type.)*
2. **Where does MRV come from, per athlete?** The field is emphatic that it is highly individual. Options: start conservative from the protocol's own volumes and let the existing RIR/readiness signals inform tolerance — **but do not fabricate a personal MRV.** If the app does not know, it must use the conservative band and **say it is conservative.**
3. **Interaction with endurance.** Get Stronger athletes are also running/riding. A lower-body specialization on a runner is not free. `SCIENCE-concurrent-training-interference.md` + the same-day matrix already exist — **check them before setting the ceiling.**

---

## 8. Verification

- Fixtures: focus raises the target pattern into MAV · other patterns land at MEV · **TOTAL sets unchanged** (the load-bearing pin) · a focus that cannot be met without exceeding systemic MRV is **refused with an honest reason** · no focus → byte-identical to today (**no migration, no regression**).
- The receipt names a real source (**the sets it took, from where**), verified against the actual diff — **not a template sentence**.
- Then: build one focused plan and one unfocused plan for the SAME synthetic athlete and diff the weekly set counts per pattern. **Multi-athlete fixtures, not tuned to one week or one person.**

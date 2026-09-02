# STATE SCREEN — PLAN-FREE vs PLAN-DEPENDENT (2026-09-01, before the copy/plan-awareness build)

⛔ **CLASSIFICATION ONLY. NOTHING CHANGED.** Michael's rule: every block declares whether it needs a
plan and behaves correctly in both states. Plan-free = always renders (the athlete's own facts).
Plan-dependent = renders only with a plan, ABSENT (not empty, no placeholder) without one. No block
reads another block's presence.

## THE "HAS A PLAN" FIELD — answered, not inferred

**`wsv.plan.has_active_plan`** — a server-minted boolean, `Boolean(activePlan)`
(`coach/index.ts:5762, 6005`; typed `coach/types.ts:168`). Explicit, not derived from the absence of
some other field. This is the flag every plan-dependent block gates on. ⚠️ `week.index` is null
before a plan starts too, but it is a weaker signal (also null between blocks) — use `has_active_plan`.

## SERVER CHANGE NEEDED? — NO (with one watch)

The gating is CLIENT: each block reads `has_active_plan` (already on the payload) and renders or not.
The server already emits `enduranceSpine` plan-free (Q-294) and returns null counts without a plan.
⚠️ WATCH: plan-dependent NUMBERS the server still computes even with no plan (e.g. the lifting
coverage list) are not suppressed server-side — the client must gate them. That is client work, not a
server change.

---

## BLOCK BY BLOCK

| block | class | today, with NO plan | fix |
|---|---|---|---|
| **Header** (`StateHeaderBlock`) | mixed | `week.index` → "WEEK" fallback exists; `plan_name` gated (`wsv.plan.plan_name &&`). Degrades OK. | plan-name/week already gated — verify no empty week chip. |
| **Load plate** (`LoadBar`) | **plan-free** | load + ACWR from actual work — renders. ✓ | keep. |
| **Load headline — programme-aware branch** (amendment) | **plan-dependent** | N/A (being built) | the "behind the week" / missed-sessions branch renders only with a plan; without one, the load state alone (plan-free) stands. |
| **Body** (`StateBodyBlock`) | **plan-free** | soreness/RPE from logged sessions — renders. ✓ | keep. |
| **Readiness row** (`StateReadinessRow`) | **plan-free** | daily check-in — renders. ✓ | keep. |
| **Planned vs actual** (`StateWeekExecution`) | **plan-dependent** | returns null when no counts+accent → ABSENT. ✓ already correct. | keep; confirm counts are empty (not zero-filled) without a plan. |
| **Weekly lifting — performed dose** (`ViadaWeekCard`: session cost, work sets) | **plan-free** | performed from logged sets; but the WINDOW defaults to Monday with no plan (weekStartDow default) → shows a calendar week of logged lifting. Acceptable plan-free. | keep the performed dose; ⚠️ label reads "this week" — fine for a calendar week. |
| **Weekly lifting — coverage "nothing this week for …"** | **plan-dependent** | a coverage GAP only means something against a prescription; today it computes off `belowFloor` regardless. **Renders wrong without a plan** (claims a gap with nothing prescribing those muscles). | gate on `has_active_plan`. |
| **Weekly lifting — "outside the plan"** | **plan-dependent** | already gated on `offPlan.known` (needs the plan marker); without a plan, no marker → `known:false` → absent. ✓ | keep; the marker gate already achieves it. |
| **Weekly lifting — change line "since {month}"** | **plan-free** | measured week-over-week from logged sets. | keep (new build). |
| **Strength lift cards** (`StrengthFitnessRow`: e1RM, best, sessions, all-out, charts) | **plan-free** | from logged sets — renders. ✓ | keep. |
| **Strength — block context line** (week/phase) | **plan-dependent** | `blockContextLine(planWeek, block)` — planWeek/block null without a plan → likely renders nothing, verify. | gate on `has_active_plan` / null block. |
| **Strength — calibration** (training-max climbing/holding/reset) | **plan-dependent** | needs a block's training max; `calibration.byLift` empty without a block → absent. Verify. | confirm absent, not empty. |
| **Run / bike efficiency cards + fitness rows** | **plan-free** | measured (efficiency, power, drift); `enduranceSpine` is plan-free by design (Q-294). ✓ | keep. |
| **Run/bike — named-session overlay** (`namedSessions`) | **plan-dependent** | the repeated prescribed session; without a plan the server sends none → absent. ✓ | keep. |
| **Swim** (`SwimVolumeRow`) | **plan-free** | volume facts — renders. ✓ | keep. |
| **NEXT** (`StateNextBlock`) | **plan-dependent** | upcoming prescribed sessions; without a plan `nextSessions` empty → verify absent, not an empty header. | gate/confirm absent. |
| **Race blocks** (`StateRaceBlock`, race-day bar, last-race) | event-dependent (goal, not plan) | gated on race/goal presence + `isAimless` empty-state copy exists. | out of this rule's scope (event, not plan). |

---

## WHAT ACTUALLY NEEDS BUILDING (all client, gate on `has_active_plan`)

1. **Weekly lifting coverage** ("nothing this week for …") — gate on `has_active_plan`; a coverage gap
   is meaningless without a prescription.
2. **Strength block-context line** and **calibration** — confirm they are ABSENT (not empty shells)
   without a plan; gate if not.
3. **NEXT** — confirm absent, not an empty header, without a plan.
4. **The programme-aware load branch** (amendment) — plan-dependent by construction; the plain load
   state (plan-free) stands without a plan.

Everything else is already correct in one direction or the other. No server change. ⛔ Each fix reads
`has_active_plan` (its own data), never another block's rendered presence.

# SPEC — one strength language across the app (5/3/1 base)

**Status:** LOCKED 2026-08-01 (Michael). **NOT built. Queued: NEXT after bike cleanup** (Q-240 / Q-241).
**Lifecycle:** this is a build contract. When it ships, fold its substance into a new `D-NNN` in
`DECISIONS-LOG.md` and **delete this file** (per the SPEC lifecycle in `CLAUDE.md`).

> Filed as a standalone doc, not appended to `DECISIONS-LOG.md`/`ENGINE-STATE.md`, because a second
> session (terminal) was mid-edit on bike in the same working tree when this was locked. A new file
> can't clobber that. Move it into the log when the work starts.

---

## Why (the trace that forced this — verified in code 2026-08-01)

The app has **more than one strength vocabulary and they don't agree.** Ways it classifies a movement today:
- `roleForExercise` → `primary | secondary | accessory` (`src/lib/exercise-role.ts`) — **shared** with the
  server for load/adherence math. **Defaults an unknown move to `primary`.**
- `isMain531Lift` → bool (`src/lib/exercise-role.ts`) — the bar-speed cue gate. **Defaults unknown to `false`.**
- `isMainLift` → bool (`src/lib/exercise-alternatives.ts`) — a *second* "is it a main lift", for swaps.
- `isLowerBodyLift` (in the verdict fn), `getExerciseType` (`StrengthLogger.tsx` — equipment/UI),
  `isAssistanceRow` (`StrengthLogger.tsx`), `MovementPattern` + `MovementGroup` (`exercise-config.ts`).

**The clash that causes the live bug:** the SAME unknown move is `primary` to the load system and
`false` to the cue system — opposite defaults, silently.

**The "back off weight" bug, root cause (verified):** `computeStrength` / `computeLiftVerdict`
(`supabase/functions/_shared/response-model/weekly.ts:140-266`) run **every** lift through identical
logic and **never consult role**. The verdict is driven by RIR deviation (`rir - targetRir` vs
`VERDICT_DEVIATION` in `_shared/strength-profiles.ts`), so a hard-feeling **accessory** (Hip Thrust,
Barbell Row) prints a red "back off weight" command. Accessories have no anchor, so the display has
nothing to build a sentence from and dumps the raw command (`StateTab.tsx` ~1305-1385). It is *worse*
on lighter programs (endurance-maintenance), where almost everything is an accessory. The verdict
function IS phase-aware (recovery/taper/peak/base/build via `weekIntent`) but NOT role-aware.

**Good news for the size:** a usable role classifier already exists and is already shared. This is
wiring it into the language layer everywhere — not inventing a taxonomy.

---

## The decision — two axes, answered for every movement, never one list

### Axis 1 — Role (what job it does). Athlete-facing words:
- **Main lifts** — the four barbell lifts (5/3/1 percentages + AMRAP).
- **Supplemental** — extra volume on the same lift (FSL/BBB). Reserved; not in use yet.
- **Accessories** — everything else (push / pull / single-leg / core). The bro/universal word, and what
  the athlete sees everywhere. "Assistance" (Wendler's book word) may appear **only** inside the 5/3/1
  plan description; nowhere else.

### Axis 2 — Type (what kind of movement), each carrying a capability profile:

| type | weight | 1-rep-max | coached | logged as |
|---|---|---|---|---|
| Barbell (main lift) | yes | yes | **yes** | weight × reps |
| Barbell / DB (accessory) | yes | no | no | weight × reps |
| Bodyweight | bodyweight | no | no | reps |
| Plyo (box jump) | no | no | no | reps only |
| Isometric / hold | no | no | no | time |
| Mobility | no | no | no | done / time |
| Carry | yes | no | no | distance or time |

### Rules that fall out (no per-exercise special-casing):
- Coaching language — estimated 1RM, direction, AMRAP target — shows **only on main lifts**.
- Accessories, plyo, mobility show **numbers or nothing, never commands.** Kills the "back off weight" bug.
- **Volume = weight × reps**, computed **only where there's weight** (the field/Strong/Hevy definition).
- Adding a plyo or mobility move = **one row in the type table**; the app already knows how to render,
  score, and whether to coach it. That's the scalability requirement (Michael: more plyo + mobility coming).

---

## Grounding (field + commercial apps, not hand-picked)

- **5/3/1 (Wendler):** roles are main lift / supplemental / assistance(=accessory). Confirmed against
  the 2nd-edition treatment of supplemental vs assistance.
- **Strong / Hevy:** per-exercise show **numbers only** — heaviest weight, estimated 1RM, volume
  (weight × reps), PRs/records — and give **no commands**. "Back off weight" is not app language.
  Sources: help.hevyapp.com (PRs & records), hevyapp.com/features/exercise-performance, train531.com
  (accessory vs supplemental).

---

## Scope when built (collapses the tangle toward the two axes)
`roleForExercise`, `isMain531Lift`, the second `isMainLift`, `isLowerBodyLift`, `getExerciseType`,
`MovementPattern`/`MovementGroup` → collapse toward **one role axis + one type axis**, both read by:
the State display, the verdict/language layer (`weekly.ts`, `strength-profiles.ts`), the logger cues +
UI, the load/adherence math, exercise-swapping, and scheduling placement.

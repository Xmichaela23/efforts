# SPEC — Exercise substitution: SLICE 2 (the Swap sheet)

> ## ✅ SLICES 1 + 3 SHIPPED 2026-07-14 → **D-289**. Their substance now lives there; it has been removed from this file.
>
> **This spec is scaffolding, and scaffolding comes down.** When slice 2 ships, fold it into a `D-NNN` and **DELETE this file.** *(See the SPEC lifecycle in `CLAUDE.md`. `docs/` has ~150 files and most are stale precisely because specs never die.)*

**Status:** slice 2 only. **Sign-off gated.**
**Read `D-289` first** — it carries the decision, the field research, and the guard.

---

## What already ships (D-289) — do not rebuild

A **declared** swap is no longer a skip. Rename a prescribed exercise → `substituted_for` is derived at save → `matchExercises` links it → **no dock**, the work gets credit, load/RIR are not graded on an un-anchored substitute, and an **out-of-slot** swap prints one deterministic sentence. **In-slot swaps are silent.**

---

## The gap slice 2 closes

**The gesture works. Nobody would ever guess it.** The exercise name field looks like a name field, not a swap control. So the fix only fires for someone who already knows the trick — and an athlete who **adds** an exercise instead of renaming the prescribed one **still eats the dock** (correctly: the planned lift genuinely went undone).

**Delete-and-re-add destroys the link. That is exactly why the field makes Swap a FIRST-CLASS ACTION** (ABC Trainerize, Fitbod, RP Hypertrophy, Built with Science — all of them).

## The build

1. **A "Swap" affordance** on a prescribed exercise in the logger. It writes the same `substituted_for` the rename already derives — **no new data path**, just a discoverable one.
2. **Offer the in-slot alternatives** (field standard). Filter `EXERCISE_CONFIG` by:
   - same **`primaryRef`** (the movement-pattern slot — `_shared/strength/exercise-config.ts`), **and**
   - same **`roleForExercise`** tier, **and**
   - the athlete's **equipment** (reuse the `hasBarbell` / `hasDumbbells` / … signals from `substituteExerciseForEquipment`).

   For a planned Bulgarian Split Squat (`squat`, accessory) that offers reverse lunge, walking lunge, step-up, goblet squat — **not** hip thrust.
3. **Keep the free-library override.** The athlete can still search everything and pick anything, including out-of-slot. **The app does not block** — *"its job is not to stop you moving; it is to make sure you know you moved."*

## ⚠️ The schedule-aware contradiction check — SCOPED, NOT YET BUILDABLE

**Michael:** *"Should we flag potential training contradiction in Performance if they are valid?"*

**Good instinct, and the answer reframes it:**

- **The plan already protects the athlete by PLACEMENT, not by exercise.** `strength-primary-plan.ts:182` — the bias slot lands on Upper A *"maximally removed from the weekend long run… satisfies 'no posterior-chain eccentric volume on heavy-Lower or long-run days' **for ANY selection**"* [Wilson 2012]. **So an in-slot swap CANNOT break it — the day did not move.**
- **The real risk is a CROSS-REGION swap:** a lower-body movement onto an upper day, with heavy Lower or the long run tomorrow. That undoes a protection the day was designed around.
- ⛔ **AND IT DOES NOT BELONG ON PERFORMANCE.** Telling an athlete *after* they trained that their swap conflicts with tomorrow is useless — the session is done. **That is a nag, not a coach.** The warning belongs **in the Swap sheet, at the moment of choosing**, while they can still act on it: *"Back Squat is a lower-body movement, and your heavy Lower day is tomorrow."* A fact. It does not block, does not score. *(Performance may still record it as a receipt.)*
- **BLOCKED ON:** the logger has `scheduledWorkout` but **not the week** — it cannot see what is scheduled tomorrow. `exercise-config` knows the **pattern** (`primaryRef`) but has **no interference character** (no `eccentric` / `posterior_chain` field). **Do NOT invent one** — derive lower-vs-upper from `primaryRef`, which is already grounded. **Establish what schedule context the logger can actually see before designing this.**

## Verification

- The swap sheet for a `squat`-slot accessory **does not offer hip thrust**.
- Choosing an offered alternative produces the identical `substituted_for` the rename does — **one data path, two doors.**
- ⛔ **The D-289 guards must stay green:** an **undeclared** miss is **still a skip**. That fixture matters more than this feature.

# Work Order — Build Your Own (Strength), v1

**Date:** 2026-08-04
**For:** the engineer (one stage per session)
**From:** PM chat
**Status:** proposed — awaiting Michael's approval before Stage 1

---

## The one-liner

A new **"Build your own"** Focus where the athlete *writes* the strength session and the engine does the math on it. This is **not a new engine.** Generation is a pass-through (the athlete is the protocol); progression is a set of **modes added next to Wendler in the existing `loading/` layer.**

The whole reason this is a small build: everything downstream of the session — load, living baselines, deload, the strength verdict — is already built and wired. The job is a front door plus two progression modes, not a system.

---

## Product decisions (settled with Michael — do NOT relitigate)

1. **Two lanes exist. This is the second one.** Lane 1 = the engine prescribes (the strength-focus / Get Stronger template). Lane 2 = the athlete brings their own. Same manners, same engines underneath.
2. **The flow (strength):** Days per week → Full body or Upper/Lower split → exercise boxes (type-ahead from the catalog, add as many as you want) → an optional warm-up box → an endurance card to bolt on a run/ride → Build.
3. **Type-ahead is the only "smart" moment the user feels.** Type "trap," tap the catalog match. Everything else is invisible.
4. **The athlete never picks a progression model.** The **shape of the box is the protocol.** Read it:
   - rep **range** ("6–10") → **double progression** (add reps, then weight)
   - **fixed** reps ("5×5") → **linear** (add weight when completed)
   - an **RIR tag** ("@ 2 left") → **autoregulation** (load floats to the target)
   - a **%** in the weight box → **percentage** (this is what Wendler already is)
5. **When they signal nothing** (just "Bench 3×8"), the mode **defaults off what the movement is** — the catalog already knows role/type. Main lift and accessory get different sensible defaults.
6. **Override is a tap, hidden.** Tap the exercise → change the progression → done. Default inferred, steerable for the athlete who knows.
7. **v1 is a single repeating week + progression. No periodization.** Varying weeks (undulation/block) is how a *minority* program, and even they inherit it from a pre-made program rather than hand-build it. Periodization stays in the **prescribed** lane. This is not a simplification we apologize for — it's how most people actually self-program.
8. **The review screen reflects the read back in plain words — it does not teach.** Never print "periodized" or "linear." Say what it will do: *"Load climbs as you earn it."* Per-exercise if useful: *"Works up to 10 reps, then adds weight."* Fact, not a warning. (Copy voice: quant who trains, fact-first, no imperatives.)
9. **RIR is being reintroduced, on this lane.** It already exists as a captured signal (the per-set "difficulty tap") and was deliberately gated *off* the 5/3/1 main lifts. Here it becomes a progression driver.

---

## Out of scope for v1 (name it so nobody builds it)

- **Periodization / varying weeks** — prescribed lane only.
- **The full endurance builder** (the segment/interval timeline). Here the endurance card is a **bolt-on only** — add a run/ride to the week, nothing structured.
- **Copy-paste import.** Comes later and *fills this same flow* — which is exactly why the flow is built first.

---

## What already exists — wire, don't rebuild (confidence tagged)

**VERIFIED this session (read the code):**
- **The intake wizard shell** — `src/components/NonRaceBuilder.tsx`. `StepLayout`, `scheduleSteps()`, `GOAL_ORDER` (`:68`). Steps already include a **`lifting` days card** (`:1208`, D-332) and a live-drawing **`schedule`** step (`:1480`). "Build your own" is a new entry in this shell, not a new screen system.
- **The protocol framework** — `supabase/functions/shared/strength-system/protocols/`. `StrengthProtocol` interface (`types.ts:169`), a selector (`selector.ts`, `resolveStrengthProtocolForGoal`), and 9 protocols. **Every one is generative.** Custom must be a **pass-through** here (or a bypass) — the athlete's typed session goes down the same pipe. `db-prescription.ts` is the dumbbell-tier helper, not double-progression — don't confuse them.
- **The progression layer is already separate from generation** — `loading/wendler-531.ts` + `loading/cycle-verdicts.ts` (`verdictForCycle:103`, `verdictsForCycles:128`, `amrapRepsForLift:53`). This is where the modes go. Wendler = the percentage mode today. Add double-progression and RIR as **siblings here**, same verdict shape ("did the logged set earn the jump → advance/hold/deload").

**FROM DOCS (ENGINE-STATE banner — not fresh-grepped, confirm in Stage 0):**
- **RIR / the difficulty tap** — D-326 layer 1: a per-set difficulty tap, three words, persisted in `strength_exercises` JSON. `computeLiftVerdict` reads RIR; **D-379 gated it off the main lifts.** Exact call site unconfirmed.
- **Double progression** — named in the Get Stronger scope (SPEC-get-stronger.md / D-323). Build status **PARTIAL** per CAPABILITY-MAP. May be reusable as the double-progression mode.
- **The catalog + classifier** — 65-exercise catalog + role/type axes (D-375/D-377). The type-ahead reads this; picking a movement means the engine already knows what it is.
- **The load/baseline/deload spine** — `compute-facts` → `session_load`/`exercise_log`; `calculate-workload` → ACWR; living baselines (`resolve-current-ftp.ts` et al.); deload in `phase-structure.ts` + `strength-profiles.ts`. A custom session that lands in the right shape gets all of this for free.

---

## Stage 0 — TRACE (no code). The mandatory pre-build.

Trace-before-build is a hard rule here. Answer these in writing before touching anything:

1. **Does a "build a session from scratch" entry surface already exist**, or does the strength logger only log against a *prescribed* session? (Check `StrengthLogger.tsx` and whether `NonRaceBuilder` has any custom path.) → build vs wire for the front door.
2. **Pin the exact RIR call site** and how the difficulty tap is stored in `strength_exercises`. Quote file:line.
3. **What JSON shape must the pass-through emit** so `compute-facts`/`calculate-workload` pick it up? Find the `strength_exercises` contract on `planned_workouts` and confirm the pipeline entry (is it `generate-strength-plan` → `materialize-plan`, or does custom need its own path?).
4. **Is double progression built** (Get Stronger)? Is it callable as a mode, or is it a stub?
5. **Where should the per-exercise `progression_mode` field live** — on the exercise JSON? Confirm nothing already holds it (the "second vocabulary" trap — grep first).

**Done when:** each of the 5 has a file:line answer and a one-word verdict (wire / build). No code shipped. Report to Michael.

---

## Stage 1 — The entry flow (front door)

Add "Build your own" as a Focus that opens the flow in decision #2. Reuse `NonRaceBuilder`'s shell and the `lifting` card. Output a session in the shape Stage 0 confirmed, landing in the **same pipeline** a generated session uses (pass-through).

- Days per week → full body vs upper/lower (sets the box layout) → exercise boxes with catalog type-ahead → warm-up box → endurance bolt-on card → Build.
- **Verification:** device — build a session (use the buddy's real plan: Trap Bar 5×5 @230, RDL 5×8 @135, Glute Thrust 4×6–10 @185, warm-up circuit, + an easy run), confirm it lands as a real planned session and shows on the calendar.
- **Done when:** a hand-built strength week exists in the DB in the same shape as a generated one, visible on device.

---

## Stage 2 — Progression modes (the only real logic)

In `loading/`, next to Wendler:

- Add a `progression_mode` per exercise (`percentage` = Wendler, `double_progression`, `linear`, `rir`).
- **Infer the mode from the box shape** (decision #4). Default off role/type when unsignaled (decision #5).
- Each mode is a verdict function with Wendler's shape: logged performance → advance / hold / deload → next prescription. Reuse double progression from Get Stronger if Stage 0 says it's real.
- **Verification:** deno fixtures per mode. Keep a fixture for each of the four box shapes as a permanent regression. Prove ≥3 clean back-to-back runs on any stochastic path (there shouldn't be one — this is deterministic).
- **Done when:** each box shape drives the right verdict in fixtures, and Wendler's existing behavior is unchanged (its fixtures still green).

---

## Stage 3 — Wire to the spine + the review copy

- Confirm the custom session feeds load / baselines / deload (mostly already there — verify it lands, don't rebuild).
- Add the **review-screen reflection** (decision #8): plain-language read of what the build will do. No jargon.
- **Verification:** device — after Stage 1's session, confirm `session_load`/ACWR moved, the strength verdict surfaces, and the review line reads correctly ("Load climbs as you earn it").
- **Done when:** a built week shows up in load and State the same as a prescribed one, and the reflection copy is right.

---

## Stage 4 — RIR surfacing + override

- Promote the captured difficulty tap into the **RIR-mode driver** on this lane (the site Stage 0 pinned).
- Build the **tap-to-override** (decision #6): tap exercise → change progression mode → persists.
- **Verification:** device — set an exercise to RIR, log it, confirm the next prescription floated to the target; override a mode and confirm it sticks.
- **Done when:** RIR drives progression on a custom exercise and the override persists.

---

## Verification method (whole order)

Deno fixtures for all `loading/` mode logic; **keep the four box-shape fixtures as permanent regressions.** Device verification per stage (never a single screenshot as proof — check the DB write where load-bearing). **One Michael-driven acceptance run at the very end**, building his buddy's plan start to finish. Report PUSHED / DEPLOYED / VERIFIED separately at each close — never "shipped."

## Pointer

Tick `docs/GAME-PLAN.md` when a stage lands. New `D-NNN` per non-trivial choice (the mode-inference rule and the pass-through decision each earn one). This file dies when Stage 4 ships — fold its substance into the D-entries, don't leave it to rot.

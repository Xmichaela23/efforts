# SLICE 4b — Offer to correct the training max when logged lifts disagree with it (2026-08-12)

**Temporary build contract. Dies on ship → fold into a D-NNN, delete this file.**
Terminal, one stage. Ships behind fixtures (Constitution Law 6). Strength change — **ground in the book** (`/Users/michaelambp/Downloads/531_2nd_Edition_Hard_Copy.pdf`); cite pages. Consent-first; **never auto-writes the max.**

## The goal, in one line
The training max is a signup/onboarding number that **never updates from performance** — so it can sit far below (sandbagger) or far above (cowboy) what the athlete actually lifts, and nothing corrects it. This slice closes that loop with **one spine signal** that offers a correction, in **both directions**, on the athlete's tap.

## Why (verified this session)
- The builder reads the max from `user_baselines.performance_numbers` (`readBarbellMaxes`, `generate-strength-plan/index.ts:67`). Nothing feeds logged lifts back into it. Michael reps **20–25** on top sets his max calls ~80% — the max is far below real, and the app has the reps to know it but doesn't act.
- The mirror case matters MORE for safety: an athlete who **over**estimates gets a plan too heavy → missed reps, form breakdown, injury. Underestimating only wastes stimulus.

## What the book says (cite; don't invent thresholds)
- **Too high → Wendler's stall (p31):** can't hit the prescribed reps → deload and reset the max (~10% back). This is his one documented "the max is wrong, lower it" trigger.
- **Guardrail (p33, "Having a Less Than Stellar Day"):** one off day is NOT a reset. So the DOWN offer fires only on a **repeated** miss (a stall pattern), never a single missed set.
- **Too low → the "disassociated training max"** (later Wendler / jimwendler.com): strength outruns a light TM; ride the wave, or retest. Wendler celebrates the rep PRs (p10) — so the UP offer is an *option*, never a nag, never automatic.
- **Honesty (D-417):** a high-rep set's e1RM is loose. The offer must NOT mint a precise new max from a 25-rep set. Trigger on the reliable signal (reps clearly beat what the max predicts / a stall pattern); propose "retest, or adjust," not "your max is now 190."

## Existing infra — TRACE before building (do not rebuild)
- The **Adjust flow** already exists — `StateAdjustLens` (State "Adjust" tab) + the State strength-row adjust modal + `adapt-plan` `suggest` path (`strength_progression` / `strength_deload`). The offer routes into THIS; do not build a new adjust surface.
- The performance signal is already captured: `strength_facts.amrap_reps` / `.measured`, `exercise_log`, per-lift `lastAllOut`. Reuse it.
- The rep-PR celebration in the logger already exists (`strength-row-text.ts`) — leave it; the logger only celebrates.

## The work
1. **One spine signal (Law 5 — born on the spine):** per lift, compare logged top-set performance against what the recorded max predicts:
   - **UP:** top-set reps clearly exceed the target for that week's % (reliable; not the exact e1RM). 
   - **DOWN:** the prescribed minimum reps are **missed across repeated sessions** (stall pattern, per p31+p33 — not one bad day).
   - Emit a confidence-stamped suggestion (direction + "retest or adjust"), never a fabricated precise max.
2. **UX — one signal, three roles (don't mint three nudges):**
   - **Logger:** unchanged — celebration only (rep PR). No decision mid-workout.
   - **State:** the actionable offer — a quiet, non-blocking line that taps through to the existing Adjust flow. This is where the athlete acts.
   - **Performance:** a courtesy echo of the same signal, routing to the same Adjust action. Not an independent nudge.
3. **Consent-first:** the offer never writes the max. The athlete confirms in the Adjust flow (matches the deleted-auto-progression lesson — no silent load changes).

## Fixture (Law 6 — permanent regression)
- **Michael's case** (reps ≫ target) → UP offer fires; no precise max is fabricated from the high-rep set.
- **Stall pattern** (missed minimum, repeated) → DOWN offer fires.
- **Single missed set** → NO offer (p33 guardrail).
- **On-target athlete** → no offer either way.
- The offer **never auto-writes** the max — assert it only proposes.
- Deterministic; ≥3 recomputes if any stochastic (LLM) copy path is touched.

## Do NOT touch
- The e1RM formula/reserve gate (D-339) and the trusted-rep ceiling (D-417).
- The overload verdict (D-418) and the strength progress record/rep-PR display (D-420 / 3b).
- The logger's rep-PR celebration.

## Acceptance
Rebuild Michael's spine + payload: State shows the UP offer for his under-set lifts, routing to Adjust; a synthetic stall shows the DOWN offer; neither writes anything without a tap. Device pass. Fold into a D-NNN, delete this file.

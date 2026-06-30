# SPEC — Product Shape (the front door the engine builds toward)

**Status:** LOCKED 2026-06-29 (Michael). The authoritative product shape for non-race training. Two programs + one add-on layer. **Nothing else on the front door.** The engine builds toward this; surface bugs get fixed in service of it, not as ends in themselves.

---

## PROGRAM 1 — GET STRONG (strength leads, endurance supports)
- **The phased strength ARC: base → power → sharpen.**
  - `base` = `strength_focus_build` (5×5-derived, U/L/U/L, compound) — built, proven live.
  - `power` = `strength_focus_power` / `neural_speed` (explosive, RFD) — built.
  - `sharpen/hold` = taper params + `minimum_dose` — built.
- **Endurance runs UNDERNEATH at maintenance** — held so strength leads. Honest about the tradeoff: this is the **"park endurance ~12 weeks"** mode.
- **ALWAYS balanced-with-upper (D-220):** compound press/pull/posterior, **zero isolation.** Justified functionally (run posture, ride position); aesthetic payoff rides underneath. Never isolation, never a hypertrophy lane.
- **Terminal = strength retest (1RM re-baseline)**, not a run retest.

## PROGRAM 2 — MAINTAIN (endurance leads, strength supports)
- For the **endurance-heavy** athlete. Strength is a **SUPPORT slot** — hold what you've got, protect posture/joints, support the running/riding.
- **Protocol = `minimum_dose` / `durability`** (built + sourced).
- Endurance is the headline; strength does **not** develop.
- The **INVERSE of Get Strong**: same engine, strength role flipped co-headliner → support.

## ADD-ON LAYER — the FOCUS dial (lives INSIDE Get Strong, not a 3rd program)
- User names a concrete want: "20 pull-ups," "build glutes," "more chest," "Hyrox-ready," etc.
- The dial **FLAVORS accessory selection + loading emphasis WITHIN the same U/L/U/L balanced structure.** It does NOT change the arc, the phases, or the compound spine. **A lean, not a new protocol.**
- **Hyrox = a focus option here, NOT a separate program** — an add-on emphasis inside Get Strong.

---

## PRINCIPLES (keep honest)
- **Smart server, dumb client:** the user picks the **OUTCOME they feel** ("stronger," "faster," "20 pull-ups," "better glutes"); the **engine picks the protocol.** Never surface protocol names (5×5, neural) on the front door.
- **Honest tradeoffs, science-backed:** every claim cites an existing doc (Rønnestad/Mujika arc, 5×5 base, Paavolainen/Saunders power, Lauersen durability, Bickel/Spiering maintain). The **sequence is peer-reviewed**; exact phase lengths/loads are **convention, retest calibrates.**
- **Lifecycle, not race-prep:** blocks compound — each leaves the athlete more capable for the next. No painting into a corner; fitness is ongoing.

---

## BUILD ORDER (don't skip the gate)
1. **VERIFY BASE FIRST** — confirm the run "Get Stronger" goal materializes **real 5×5** (squat / bench / row / OHP / deadlift), **not durability.** **Gate everything on this.** *(Status 2026-06-29: NOT yet passing — the materialized plan came out durability + marathon-shaped; the `(b)-run` path is a stopgap that builds a marathon-completion run plan with strength overlaid, the inverse of Get Strong. Fixing the base = the current task.)*
2. **The CONDUCTOR — BUILT + TESTED 2026-06-29 (staged, not deployed).** The phase→protocol sequencing layer that runs the arc (base→power→sharpen) instead of one flat protocol — `shared/strength-system/strength-arc.ts` (`resolveStrengthArcProtocol` + `isGetStrongArc`), wired into `generate-run-plan/strength-overlay.ts` (per-week protocol resolution by phase). The strength-focus lanes signal the arc; everything else stays flat → **byte-identical for all existing plans** (116 deno tests green, incl. the integration probe: a Get Strong block emits the build lane in base weeks, the power lane in build weeks — proven sequencing). **STILL OPEN within Program 1 (the real shape work):** the conductor sequences the *strength protocol*, but the plan is still **run-primary** (the `(b)-run` marathon stopgap) — strength is sequenced *on top of* a marathon run plan, not the spine. Making strength the spine (the strength-PRIMARY plan: days/week honored, no marathon proxy, the **1RM retest terminal** — audit gap #4) is the remaining Program 1 build, and supersedes the `(b)-run` stopgap. The conductor is the orchestration piece; the shape is the next piece.
3. **The FOCUS dial** — after the conductor. A flavoring layer on top.
4. **HOLD:** bike (F-9 combined work, separate cut) + any hypertrophy build (parked, resolved by balanced-with-upper, D-220).

---

*Cross-ref: `SPEC-getstronger-contract-row.md` (the approved Get Strong cells — Program 1's base), `SPEC-q088-freq4-run-path.md` (the strength lanes), `SPEC-non-race-goal-plan-contract.md` (the two-track engine), D-220 (balanced U/L/U/L), `SCIENCE-*.md` (the sourcing). The capability audit (this session's chat) is the gap map: arc = orchestration build; base = live engine; bike = held.*

# SPEC — Non-Race Goal→Plan Contract

**Status:** DRAFT for review. Defines *what each non-race goal produces as training* — the contract the engine is missing, and the root under F-9/F-9b/F-10/F-12 (see `BUILDER-SWEEP-FINDINGS.md`).
**Captured:** 2026-06-28, after the builder sweep + a market/science scan of the hybrid + structured-endurance space.
**Scope:** the non-race path through `buildCombinedPlan`. Race/event generation is the working reference and is unchanged.

---

## The thesis that drives everything below

**There are two products here, and strength plays a different role in each:**

- **Race goals (marathon, 70.3, IM, single-sport races):** strength is a **support act.** The athlete is peaking for an event; strength serves the race — durability, economy, injury-proofing — then tapers out of the way. Add-on is *correct* here. The race builder already does this; the strength is a slot. **Unchanged by this spec.**
- **Non-race / true hybrid:** strength is a **co-headliner.** Nobody is peaking for anything. The whole intent is "be strong AND fit" — two real goals running in parallel, each progressing on its own logic, neither subordinate to the other. This is the athlete Runna/Edge/HYBRD all chase and none serve, because their architecture is endurance-first with lifting bolted on. **This is the product this spec defines.**

The mistake the first draft made — and the mistake the whole market makes — was importing the race assumption (endurance leads, strength postures around it) into the non-race world. For the true hybrid that frame is wrong. The non-race contract brackets every goal as **two peer tracks plus the contract between them.**

---

## The bracket: every non-race goal = two parallel tracks + an interference contract

Each goal specifies **both tracks to the same depth**, not an endurance plan with a strength setting:

1. **Endurance track** — its own frequency / volume / intensity / week-to-week progression, per discipline (run / bike / swim / hybrid).
2. **Strength track** — its own protocol / frequency / progression, advancing as a **real program** (5×5, hypertrophy, durability, power, the ladder), not a maintenance flag bolted to the side.
3. **The interference contract** — how the two reconcile: heavy-day placement vs quality endurance days, fatigue carryover, the load ledger (ACWR/CTL/ATL), the concurrent-interference science. **This is the moat.** Every competitor claims to manage strength↔endurance interference; almost none model it. We compute it. The plan must make the tradeoff *visible and deterministic*, not hidden behind "trust the plan."

### Swim scope — tri-only

Swim is **not a hybrid-strength discipline.** Every hybrid/strength-for-endurance product (Nick Bare, HYBRD, Edge, Lyss Method, Movement System) is run-and-lift first, bike second — swim appears *only* inside triathlon. The "swimmer who lifts for hybrid fitness" athlete barely exists; pool swimmers who train strength do it *for swimming*, a separate narrow niche.

Therefore:
- **Tri non-race goals** → swim stays a real track (an off-season triathlete still swims).
- **Run / bike / hybrid-strength goals** → swim is **out by default.** Optional thin add-on at most (active recovery / cross-train) — never a developed track, **never gets a frequency matrix.**
- **No swim-only non-race product.** This removes the swim-only branch of F-10 — don't build cells for it.

### Hard dependency: this needs Q-088

A co-equal strength track requires **real strength frequency** — 3–4 days, true upper/lower splits. The current 2–3× cap *is* the "strength as add-on" ceiling: it structurally cannot express a peer-level strength program. **Q-088 (the frequency-cap unlock) is not a separate roadmap item — it is the prerequisite that lets the non-race strength track be a real program instead of a bolt-on.** The ROADMAP's "one scalable strength engine" and this contract are the same goal from two ends.

---

## Why this spec exists (the immediate blocker)

The non-race builder (D-213, Cuts A–G) defined goal **intent** (the 6-goal menu + per-discipline posture) but the engine was only taught to build **events/triathlon**. Per `GOALS_SYSTEM_BLUEPRINT.md:10`, "capacity + maintenance goal types exist as data shells only." The sweep proved it: **0 of 16 non-race combos materialize.** `computeSessionFrequencyDefaults` is triathlon-only; run/bike/hybrid are stubs that collapse the week to the long run (F-9). You can't populate those matrices without first deciding what each goal × shape prescribes — both tracks. That decision is this document.

---

## Design principles (build toward the gaps, not toward the apps)

The market is crowded but weak in five specific places. These are **constraints on every plan this contract produces:**

1. **Glass box, not black box.** Deterministic → every session/load explainable and sourced (the SCIENCE-*.md basis). Each goal carries a stated rationale, surfaced to the athlete.
2. **Interference is computed and visible.** The strength↔endurance tradeoff is shown, not buried.
3. **No-race is a first-class product.** Everyone treats intention-without-a-race as a leftover bucket. It's our whole feature.
4. **Model what the athlete is losing.** Detraining (Mujika & Padilla 2001: neuromuscular strength declines in 2–4 weeks of cessation, faster than cardio, steeper for masters 40+) is unmodeled by every competitor. "Maintain"/"Get stronger" framed by decay urgency.
5. **Mixed intent the others can't represent.** Per-discipline posture (swim:out / bike:maintain / run:develop / strength:develop) is finer-grained than any competitor's intake. Honor it fully — including bike-only and swim-only (F-10).

---

## Market reference

- **Runna "General Plans":** Run Faster (speed) · Run to Maintain (anti-burnout) · Build a Base (volume). Three *distinct* products — strength an explicit add-on, not core. (Our wedge.)
- **TrainerRoad:** event vs "general fitness goal" → discipline + goal + aggressiveness → Base/Build/Specialty.
- **Hybrid apps (Edge, HYBRD, Nick Bare, Lyss Method):** sell "true hybrid" + interference management as the headline *because nobody else does it* — but most still can't model the fatigue interaction. The claim is the market; the delivery is the gap.

---

## The 6 goals — contract per goal (BOTH tracks)

For each: **intent**, **endurance track**, **strength track** (peer program), **interference note**, **block arc**, **science basis**, **open questions**. Discipline-shape variants (run-only / bike-only / hybrid / tri) apply the goal's tracks to whichever disciplines are `develop`/`maintain` per posture.

> ⚠️ Frequency/volume **numbers** for both tracks are deliberately NOT in this draft. Defining the run/bike/hybrid endurance cells AND the peer-level strength frequencies (per hour-tier, against Q-088's raised cap) is the coaching-science work, made on review and sourced like the existing triathlon matrix. This spec defines structure + sourcing requirement; cells get filled on sign-off.

### 1. Build endurance
- **Intent:** aerobic base — go longer comfortably; foundation, not sharpening.
- **Endurance track:** higher volume, lower intensity; easy/long-run dominant.
- **Strength track:** a *progressing* durability/structural block — advances week to week (loads up) as endurance volume ramps. Not "maintain durability" — a real block that builds resilience to absorb the rising volume.
- **Interference:** structural strength + low-intensity volume are complementary; heavy lower days kept off long-run days.
- **Block arc:** both tracks ramp on a 3:1 loading rhythm; ends in a **dual retest** — aerobic benchmark + strength benchmark.
- **Science:** base-phase aerobic development; durability strength for injury resilience under load.
- **MUST differ from Build speed.**

### 2. Build speed
- **Intent:** sharpen — faster at existing distances; economy/threshold/VO2.
- **Endurance track:** lower volume, higher intensity — intervals, tempo, controlled long run.
- **Strength track:** neural/power strength (`neural_speed`), *progressing in lockstep* with the intensity work — economy gains come from the strength side too, so this is a peer driver, not support.
- **Interference:** the sharp case — both tracks high-CNS. Heavy/explosive strength and hard run sessions must be deliberately spaced; the load ledger governs. Where the interference contract earns its keep.
- **Block arc:** intensity + power progression on a maintained aerobic base; ends in a **speed retest** + a power/strength retest.
- **Science:** running economy / neuromuscular; `SCIENCE-neural-speed-running-economy.md`.
- **MUST differ from Build endurance.** Currently both seed identically (`non-race-goal-seeds.ts:209-213`) → the menu lies. **Real bug, part of the F-9 arc.**

### 3. Get stronger
- **Intent:** force production — get measurably stronger without chasing size. **Dead-center the Efforts thesis.**
- **Endurance track:** maintenance — held so strength can lead. (Endurance is the support act *here* — the one goal where it inverts.)
- **Strength track:** the lead — linear/strength progression (`five_by_five` → the ladder), at real frequency (needs Q-088).
- **Interference:** strength prioritized; endurance scheduled to not blunt strength recovery (inverse of the race case).
- **Block arc:** strength progression leads, endurance maintained, ends in a **1RM/strength retest**.
- **Science:** force-not-size; `SCIENCE-5x5-linear-progression.md`; detraining urgency (Mujika & Padilla).

### 4. Build muscle + train — ⚠️ OPEN / THESIS DECISION
- **Intent:** hypertrophy — add size while maintaining endurance (Nick Bare analog).
- **Conflict:** Efforts' thesis is *force, not size.* The one goal pointing the opposite way. Real, large market; different athlete.
- **DECISION REQUIRED (Michael):** keep it (real hypertrophy strength track — `upper_aesthetics` + higher-volume lower, peer to maintained endurance) or cut it (stay force-not-size). Do **not** ship it half-built as a clone of "Get stronger."
- Flagged, not implemented, until decided.

### 5. Maintain
- **Intent:** hold current fitness — flexible, low-stress, between-block.
- **Endurance track:** maintenance volume — comfortably below peak; drop a hard session, reduce long run.
- **Strength track:** the Bickel dose — **~1/9 of building volume maintains strength IF frequency ≥1×/week and intensity (load) is held** (`minimum_dose`). The one goal where the strength track is *deliberately* minimal — a sourced, designed minimum. Hold load, drop volume.
- **Interference:** minimal — both tracks low; the point is sustainability.
- **Block arc:** flat/sustainable, no ramp, no retest pressure.
- **Science:** Bickel et al. 2011 (1/9 maintenance); Mujika & Padilla 2001 (decay if dropped). **Frame with decay urgency.**

### 6. Starting over
- **Intent:** return from layoff / rebuild from low base / re-entry.
- **Endurance track:** conservative re-entry — low volume, low intensity, gentle ramp.
- **Strength track:** rebuild from a deloaded baseline — re-establish movement + base strength before load, then progress. A real rebuild block, peer to the endurance re-entry.
- **Interference:** both tracks deliberately sub-maximal; generous recovery; the contract here is mostly "don't do too much of either at once."
- **Block arc:** gentle parallel rebuild; ends in a **dual retest** to re-baseline both tracks.
- **Science:** detraining recovery cost (steeper for masters); progressive re-entry to avoid injury.

---

## The two problems this contract must fix

**Problem 1 — Build speed ≡ Build endurance (real bug).** `non-race-goal-seeds.ts:209-213` seeds both identically. The menu promises two products; the engine builds one. **Fix:** differentiate both tracks — endurance = volume/durability; speed = intensity/neural_speed. Part of the F-9 arc, not cosmetic.

**Problem 2 — "Build muscle" thesis ambiguity (decision).** On the menu by default, not by decision. Resolve per goal #4 before implementation.

---

## The F-9 structural fix this contract unblocks

Root (scout): the non-race path routes every goal through the triathlon engine, which has no run/bike/hybrid frequency model. `SPORT_MATRIX` (`session-frequency-defaults.ts:180-185`) is triathlon-only; `sport` is never threaded into `computeSessionFrequencyDefaults` (falls back to `'triathlon'`) → run goals get the triathlon run-count → week-builder drops easy runs below 3 (`week-builder.ts:1732,1786`) → only the long run → backstop trips (`validate-training-floors.ts:52`).

**This contract supplies:**
- The **endurance track** per goal × shape → the endurance frequency cells.
- The **strength track** per goal × shape → the strength frequency/protocol (against Q-088's raised cap).
- The requirement to thread `sport` from posture (run-only→running, bike→cycling, multi→hybrid, tri→triathlon).
- The `long_run_day` threading confirmation (suspected second independent cause — verify before cutting).

**Sequence (the scout's b-then-a):**
1. **Plumbing first** — confirm/fix `long_run_day` threading + thread `sport`. Prove what builds with structure wired, before designing cells. *(No frequency numbers, no Q-088 needed yet.)*
2. **Then the science** — fill the endurance + strength cells per this contract, each sourced. Michael reviews cells before implementation. **Q-088 lands in/with this step.**

---

## Architecture — one engine, two knobs (not two pipelines)

Race and non-race aren't separate systems kept from colliding — they're **one engine (`buildCombinedPlan`) with two parameters:**

- **The head:** peak (`race_date` → taper → race week) vs no-peak (`target_weeks` → retest, no taper).
- **The strength role:** support (race) vs co-headliner (non-race) — one emphasis knob scaling the strength track's depth.

Everything below the head is shared: the shape-aware frequency model, the strength chassis, the load ledger (CTL/ATL), the interference contract. **A goal = `goal_type` + `sport-shape` + `strength-role` → one contract row → the one engine.** Adding a goal/sport/modality is a row, not a fork (D-213 "extend, don't fork"; the ROADMAP's "one scalable strength engine"). This contract is that engine's first real non-race consumer.

**Why race is safe:** race is the untouched reference. Making the frequency model shape-aware adds run/bike/hybrid cells; the **tri cells stay identical → race byte-identical** (the 486 matrix already proves this discipline). Non-race only fills the missing shapes + raises strength to peer. The goal-contract is the single seam where the two diverge.

**User transition (a selling point):** because both shapes share CTL + strength state, a user mid-"build endurance" who decides to race flips `goal_type→event` + adds a date → the same engine re-materializes with the taper head, carrying fitness + strength forward. **Swap the head, keep the body** — seamless base→peak conversion no competitor offers. **Caveat:** holds today only for tri (tri non-race ↔ tri race = one engine). Single-sport run races still run on `generate-run-plan`, so run non-race ↔ run race currently crosses two engines — full continuity needs run-races routed through `buildCombinedPlan` (the ROADMAP path-consolidation, done alongside Q-088, not before; not a blocker).

**Build sequence (no forking):**
1. **Plumbing** — F-9 sport-threading + `long_run_day` (stops the degenerate week).
2. **Cells** — sourced frequency/volume numbers, both tracks (Michael-reviewed).
3. **Q-088** — raises the cap so the strength track reaches peer frequency.
4. **Decay model** — the one genuinely new build (forward detraining projection; substrate exists, model doesn't).
5. **Run-path consolidation** — last; makes run-side transitions as clean as tri-side.

---

## ADDENDUM — Volume & Time Inputs

Defines how the non-race builder asks the user to size their week — the inputs that feed the (shape-aware) frequency/volume model F-9 unblocks. Research-grounded.

### How the builder sizes the week: two inputs, unequal roles

Two volume questions — **not symmetric.** One a hard constraint, one a soft target; they can conflict. Getting the asymmetry right is the point.

**Input 1 — Time budget (the CONSTRAINT, always asked).** *"How many hours a week can you train?"* — one number, whole week.
- The **hard cap.** Bounds the entire plan (all disciplines + strength).
- Right primary anchor because **ability-agnostic and lifestyle-real:** stress scales with time-on-feet, not mileage, so an hours budget travels across paces/fitness (a 9:00/mi and a 7:00/mi runner at the same hours get comparable stress). Coaches (MOTTIV, CTS) prescribe by time for this reason.
- The **limiter the user lives with.** Never exceed it silently.

**Input 2 — Volume target (the ASPIRATION, soft + optional).** Per **developing discipline only** (posture `develop` — not maintained/out, so a runner answers once).
- **Ramp tier (default, no number):** Gentle / Steady / Progressive — posture toward how aggressively volume builds. Default so a user who doesn't know mileage is never blocked. (Runna's proven 3-tier model.)
- **Explicit target (advanced):** "grow toward X mi/km per week" — for those who think in mileage.
- Volume is the **aspiration the ramp grows toward**, not a hard cap.

**The reconciliation rule.** Time and volume **over-determine** the plan (`volume ÷ pace = time`). On conflict:
- **Time wins.** Constraint beats aspiration.
- **Flag it** — "your target needs ~N hours; budget is M — we'll grow toward it within your time, or raise your budget." Glass-box.
- Never silently exceed the stated time budget.

### Bonus precision: time vs distance *within* the week
- **Easy / recovery → prescribe by TIME** (standardizes stress across ability; flexible; less intimidating). "Run 40 min easy."
- **Long runs + quality / race-specific → prescribe by DISTANCE** (pacing/progression precision). "Long run: 12 mi."
- This hybrid is how good coaches write weeks — the default session-prescription style, independent of how the user expressed their target.

### How this feeds the engine
- **Time budget** → hard input to the frequency/volume model (caps total weekly load across the shape-aware cells + strength track).
- **Volume target/tier** → ramp slope + destination per developing discipline.
- **Reconciliation** → enforced before materialization: total prescribed time ≤ budget, target scaled-within-time, conflict surfaced.
- **Per-discipline scoping** → volume asked only for `develop` disciplines; maintained use maintenance volume; `out` contribute nothing.

---

## Open questions for Michael (sign-off gates)

1. **"Build muscle + train" — keep or cut?** (Goal #4 thesis decision.)
2. **The endurance frequency cells** — run / bike / hybrid per hour-tier, sourced like the tri matrix.
3. **The strength frequency/protocol cells** — per goal, at peer depth, against Q-088's raised cap. *(The actual differentiator.)*
4. **Retest definitions per goal** — most non-race goals end in a **dual retest** (endurance + strength). What does each measure?
5. **Q-088 sequencing** — does the frequency-cap unlock land *inside* this non-race arc, or does non-race ship first at the current cap and Q-088 upgrades it later?
6. **Decay-model surfacing (differentiator 4)** — in scope for this arc, or fast-follow once plans build?
7. **Ramp tier labels + slopes** — Gentle/Steady/Progressive (or other), and the build-rate each maps to (~10–15%/wk conservative anchor; experienced tolerate more). Sourced like the cells.
8. **Time-budget floor per goal** — minimum hours below which a goal can't be honored. Prevents a degenerate week from an unrealistic budget — and is arguably the *clean* fix for the F-9 class at the input layer (a too-small budget caught and explained, not silently collapsed).
9. **Default when the user skips volume** — tier = Steady? Derive from history/CTL? Define the no-input fallback.

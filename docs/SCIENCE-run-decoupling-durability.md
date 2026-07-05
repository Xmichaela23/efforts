# SCIENCE — Run Aerobic Decoupling (durability, the RUN State row's lead)

**Status:** Citable grounding for the RUN row's lead signal (`_shared/state-trend/run.ts` — `computeRunDecouplingState`, `frielBand`). The *metric* (within-session pace:HR decoupling) and the *bands* (<5% / 5–10% / >10%) are a **coaching convention (Joe Friel / TrainingPeaks), NOT a peer-reviewed physiological cutoff.** This doc records that honestly so the code/UI never oversells a practitioner heuristic as lab science — the same verify-before-cite discipline that followed the five citation errors (do not repeat the "Vora / Edge-as-validated-science" overreach).

**Why this doc:** the RUN row leads with decoupling because it is zone-free (no HR baseline, which this athlete's data can't reliably supply) and has no whole-run distance confound (it measures *within-run* drift). That design choice needs its sourcing scoped correctly.

---

## 1. What it IS + what it's FOR

**Aerobic decoupling** = how much the pace:HR (or power:HR) relationship drifts from the first half of a steady effort to the second. Rising HR at held pace = the aerobic system giving way = a **durability / aerobic-base** read. Computed within one session, so it needs **no predefined zones and no resting/threshold HR** — the reason it leads the RUN row where the zone-dependent `pace_at_easy_hr` path is blocked (no learned `threshold_hr`).

Source metric in our stack: `workout_analysis.heart_rate_summary.decouplingPct` (D-036, GAP/grade-adjusted so terrain doesn't contaminate the drift).

## 2. The bands (COACHING STANDARD — cite as Friel/TrainingPeaks, NOT peer-reviewed)

- **< 5%** — strong aerobic coupling (well-developed aerobic base for that effort).
- **5–10%** — base-building (aerobic base still developing).
- **> 10%** — durability gap (effort above current aerobic threshold, or insufficient base).
- **negative** — excellent (HR fell relative to pace across the run).

**Sourcing, honestly:** these thresholds trace to **Joe Friel** (*The Cyclist's Training Bible*; his blog's "aerobic endurance / decoupling" writing) and are operationalized by **TrainingPeaks** (Pw:HR / Pa:HR "Efficiency Factor & decoupling" help documentation). They are a **decades-old coaching convention**, widely used and useful — but the exact 5% / 10% break points are **practitioner heuristics, not validated physiological cutoffs**. Do not present "5%" as a lab-proven line. The plain-language band IS the verdict; the % is a receipt.

## 3. Validity constraints (TrainingPeaks-documented)

- **≥ 20 minutes of continuous steady effort** — decoupling is meaningless on short runs.
- **Steady-state only** — invalid on intervals / fartlek / surge sessions (a hard interval reads a high decoupling from effort *structure*, not fitness). Friel's dedicated *aerobic-decoupling test* is a 60–120 min steady aerobic effort.

Our gate enforces this: steady/aerobic `workoutType` + `durationMinutes ≥ 20` + drop confirmed terrain-`raw`. An interval-heavy block correctly showing few qualifying runs is **honest scoping**, not a data gap — and the row's label scopes the claim ("aerobic durability · steady runs"), never "run fitness" broadly.

## 4. Secondary signal — efficiency_index (also NOT a zone metric)

`efficiency_index` (output-per-heartbeat, pace/HR) rides as the **secondary** read, gated to a 30–70 min steady band to blunt its whole-run distance confound. Same coaching-standard lineage (TrainingPeaks Efficiency Factor); same "not a lab cutoff" caveat.

## 5. Tier 2 — the peer-reviewed path, and why it's PARKED for this athlete

**DFA a1** (detrended fluctuation analysis of HRV, α1) *does* have peer-reviewed backing as an aerobic-threshold estimate from an athlete's own data (e.g. Rogers et al. 2021 and follow-ups — DFA a1 ≈ 0.75 marks the aerobic threshold, within a few % of lab CPET). **But it requires beat-to-beat RR-interval (HRV) data, which this athlete's sensor stream does not carry (1 Hz averaged HR only).** So DFA a1 stays in the research file; the near-term Tier-2 fallback for a learned aerobic threshold is HR/pace-inflection analysis. This is the *only* peer-reviewed claim in this thread — keep it labeled as such, and keep it out of shipped citations until the RR data exists.

## 6. Honest grading

- **Metric (within-session decoupling as a durability signal):** sound and standard.
- **Bands (5% / 10%):** coaching convention — cite Friel/TrainingPeaks, never "validated."
- **Validity gate (≥20min/steady):** TrainingPeaks-documented convention.
- **DFA a1:** peer-reviewed, but **out of reach here (no RR data)** — parked, not shipped.

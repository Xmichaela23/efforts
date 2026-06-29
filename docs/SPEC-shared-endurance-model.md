# SPEC — Shared Endurance Model (zones as the spine; forgiving↔sharp as one intensity dial)

**Status: SPEC — review before cut. Not approved, not implemented.** Companion to `ENDURANCE-PROVENANCE.md` (the placeholder audit), `RUN-PROTOCOL.md` (the cited run science), `SPEC-intensity-baselines.md` (the dual-anchor zone model), `ISLAND-PROPOSAL.md` (the periodization authority this lives beside). **Captured:** 2026-06-28.

---

## 1. The principle

Every run shape — marathon, half, non-race base, get-fitter — draws from **one sourced endurance model** and differs only in **shape and aggressiveness**, never in whether the science is real. No shape stands on placeholders while another has Daniels.

- **Zones are the spine for ALL shapes** — dual-anchor **Friel %LTHR (heart rate) + Daniels VDOT (pace)**. Every shape prescribes real zones.
- **RPE is demoted to a no-data fallback only** (RUN-PROTOCOL §7.4) — never a shape's default. The "find your pace / effort-only" path retires.
- **The sourced volume model sits underneath** — the `RUN-PROTOCOL §4.5` within-phase ramp + per-distance peaks (already mature in the combined engine).
- **Forgiving↔sharp is one cited intensity dial** — the polarized intensity-distribution knob (Foster / Seiler / Stöggl & Sperlich), not two different sciences. Forgiving = more easy-zone time, gentler volume ramp, conservative progression. Sharp = more quality, faster progression. **Same zones underneath.**

VDOT feeds the *pace* zone boundaries; it is **not** the foundation — HR (Friel %LTHR) sits alongside it as a co-equal anchor (mirrors bike=Coggan %FTP, swim=CSS, both locked D-011/D-199).

---

## 2. The science is already cited and in production

This spec sources **nothing new** for the spine — it consolidates the model the app already trusts and applies it to the shapes that currently bypass it.

| Pillar | Cited source | Already lives at |
|---|---|---|
| Pace zones | **Daniels, J. (2014). *Daniels' Running Formula* (3rd ed.)** — VDOT | `generate-run-plan/effort-score.ts` (VDOT table); RUN-PROTOCOL §7.3, §11 |
| HR zones (co-anchor) | **Friel %LTHR** (lactate-threshold-HR zones) | run native model "Run → LTHR/pace" (`SPEC-intensity-baselines.md:27,158`) |
| Dual-anchor pattern across sports | Coggan %FTP (bike), CSS (swim) | D-011/D-012, D-199/D-200/D-201 (locked) |
| Polarized intensity distribution | **Foster et al. (2014)** Polarization-Index; **Seiler & Tønnessen (2009)** | RUN-PROTOCOL §6.1; the 80/20 `target.low` knob (`week-builder.ts:347-396`) |
| Pyramidal vs polarized (distribution rigor) | **Stöggl, T. & Sperlich, B. (2015). *The training intensity distribution among well-trained and elite endurance athletes.* Front. Physiol.** | NEW citation — grounds the forgiving (pyramidal/base) vs sharp (polarized) distinction |
| Long-run volume ramp + peaks | Friel (long-run peaks) + Daniels | `generate-combined-plan/science.ts` `longRunMilesForWeek` / `longRunPeakTarget` (mature; 16 decision-refs) |

**Honest caveat — the dial *values* are tuned guardrails, not a sourced coefficient.** The polarized framework (Foster/Seiler/Stöggl) is cited and grounds the *shape* of the forgiving/sharp axis. The exact split numbers (e.g. forgiving ≈ 85/15, sharp ≈ 80/20 with more threshold) are **tuned guardrails, calibrated by the athlete's retest** — consistent with the app's standing stance ("direction + guardrails, retest calibrates"; `SCIENCE-5x5-linear-progression.md`). They are **not** presented as cited coefficients.

---

## 3. The shared model — what it owns and where it lives

**Home (DECIDED 2026-06-28):** a **sibling `supabase/functions/_shared/endurance/`** that composes with `_shared/periodization/` — one-way dependency `endurance → periodization` (the volume ramp is keyed by `PhaseKind`, so endurance imports the phase vocabulary; periodization knows nothing of endurance). Two different kinds of thing — periodization = "what phase + terminal behavior"; endurance = "zones + volume + intensity within a phase" — kept separate so the shared home doesn't become a junk drawer. The endgame: **run / tri / combined / future bike all query one model.**

The shared model owns:

1. **Zone definitions (dual-anchor):** Z1–Z5 defined by *both* Friel %LTHR and Daniels VDOT pace. One function maps athlete baselines (`learned_fitness` LTHR + threshold/5K pace) → zone boundaries. RPE labels are a derived fallback when neither anchor is present.
2. **Pace/HR prescription per zone:** the canonical zone→target resolution every shape reads (replaces sustainable's effort-only strings and performance_build's local VDOT copy).
3. **Volume model:** the `RUN-PROTOCOL §4.5` within-phase lerp ramp + per-distance peaks (`longRunPeakTarget` already keys `half_marathon:13`, `marathon:18`). Lifted from combined; the **retest-phase floor hole** (no `retest` case in `longRunFloorMiles`) fixed on the way.
4. **Intensity-distribution dial (forgiving↔sharp):** the polarized `target.low` policy, lifted from combined into the shared model and exposed as the single aggressiveness parameter.

The shared model does **not** own: phase *sequence* selection (which phases, taper vs retest terminal — that's the periodization authority / the shape), day placement (`week-optimizer.ts`), or exercise/session content.

---

## 4. How each shape draws from it (continuity)

The split stops being "`sustainable` (RPE) vs `performance_build` (Daniels)" and becomes **one zone-based model with a forgiving↔sharp dial + a terminal shape**:

| Shape | Zones | Volume | Dial | Terminal |
|---|---|---|---|---|
| Non-race base / get-fitter (capacity) | shared dual-anchor (real zones) | shared ramp | **forgiving** | retest |
| Marathon / half — completion | shared dual-anchor | shared ramp | forgiving–mid | taper |
| Marathon / half — performance | shared dual-anchor | shared ramp | **sharp** | taper |

Both current generators (`sustainable`, `performance_build`) draw zones + pacing + volume + distribution from the shared model and differ only by the dial + terminal. (They may later collapse into one parameterized generator; not required for this cut.)

---

## 5. The cut map (file:line)

| Piece | Change | Site |
|---|---|---|
| Zone model → shared | Lift Friel %LTHR + Daniels VDOT into the shared model; one baseline→zones resolver | `effort-score.ts` VDOT table; the run LTHR model (`SPEC-intensity-baselines`) |
| Volume model → shared | Lift `longRunMilesForWeek` / `longRunPeakTarget` / ramp endpoints; add the `retest` floor case | `generate-combined-plan/science.ts` |
| Polarization dial → shared | Lift the `target.low` 80/20 policy; expose forgiving↔sharp param | `generate-combined-plan/week-builder.ts:347-396` (standalone run has none) |
| Repoint `sustainable` | Delete `WEEKLY_MILEAGE` + `LONG_RUN_PROGRESSION` placeholder tables; prescribe shared zones (not effort strings) | `generators/sustainable.ts:20,67` |
| Repoint `performance_build` | Delete its `WEEKLY_MILEAGE` placeholder; draw volume from shared (keeps explicit pace presentation) | `generators/performance-build.ts:51` |
| Phase splits | The one thin layer — adopt RUN-PROTOCOL's documented phase model or state the split ratios (currently `0.4/0.4/0.2` placeholder) | `base-generator.ts determinePhaseStructure` |
| Combined (later) | Migrate combined to consume the shared model instead of its local copy | optional, the island endgame |

---

## 6. Two GATED sub-decisions (deliberate behavior changes — your call before cut)

These are not byte-identical; each gets a guard test + acceptance (D-216 pattern), not a byte-identical assertion.

- **SUB-DECISION A — non-race gains real zones.** Every non-race run plan changes from effort/RPE to dual-anchor HR+pace zones. This is the *point* (placeholder → sourced), and pre-launch (you're the only user) the blast radius is your own dogfooding. **Gate: approve that non-race plans now prescribe zones.**
- **SUB-DECISION B — race volume moves to the sourced model.** `performance_build`'s marathon/half volume shifts off its "Daniels-inspired, not endorsed" table onto the sourced §4.5 ramp. This changes *shipped race plans'* volume. **Gate: approve the race-volume change (guard-tested, enumerated, deploy-gated).** Pace presentation stays explicit Daniels → no pace-side race change.

(Demoting RPE to fallback and adding the polarization dial are part of A; they carry no separate race-pace change.)

---

## 7. Verification plan (when a cut is approved)
- **Continuity test:** all shapes resolve zones + volume from the shared model (no generator reads a local placeholder table).
- **Sub-decision A:** non-race retest plan now prescribes HR+pace zones; snapshot the new shape.
- **Sub-decision B:** race-volume guard test (enumerate the fixture changes; not byte-identical).
- **Unaffected:** matrix 486/486 only if combined is migrated (deferred); tri untouched until migrated.
- Pace-side race plans: explicit Daniels pace unchanged.

---

## 8. Research references
- Daniels, J. (2014). *Daniels' Running Formula* (3rd ed.). — VDOT pace-zone derivation.
- Friel, J. (2018). *The Triathlete's Training Bible* (4th ed.). — %LTHR heart-rate zones; long-run peaks.
- Foster, C. et al. (2014). *The Polarization-Index.* — 80/20 distribution.
- Seiler, S. & Tønnessen, E. (2009). *Intervals, Thresholds, and Long Slow Distance.* — intensity/duration, VO2 interval design.
- **Stöggl, T. & Sperlich, B. (2015). *The training intensity distribution among well-trained and elite endurance athletes.* Frontiers in Physiology 6:295.** — pyramidal vs polarized distribution; grounds the forgiving↔sharp axis.

---

## 10. Phased cut sequence (APPROVED to scope; each stage independently shippable + revertible)

Mirrors the strength island: build the shared module first (byte-identical, dead until wired), then migrate consumers one at a time so **races are provable at every step**. Sub-decisions A + B + the dial: **approved**.

| Stage | What it does | Races proof | Ships? |
|---|---|---|---|
| **E1 — Shared zone spine** | Create `_shared/endurance/`; dual-anchor zone resolver (Friel %LTHR + Daniels VDOT → Z1–Z5) consolidating the existing VDOT + LTHR logic. No consumer wired. | **Byte-identical** — dead code, nothing reads it. Unit tests assert boundaries match today's VDOT/LTHR derivations. | ✅ alone |
| **E2 — Shared volume model + dial** | Lift `longRunMilesForWeek`/`longRunPeakTarget`/ramp endpoints into `endurance/` (composing `PhaseKind`); fix the `retest` floor hole; lift the polarized `target.low` policy as the forgiving↔sharp param. No consumer wired. | **Byte-identical** — dead code. **Parity test:** shared volume reproduces combined's outputs for the tested distances (proves the lift is faithful before any migration). | ✅ alone |
| **E3 — Non-race gains zones [SUB-DECISION A]** | Migrate `sustainable`: prescribe shared dual-anchor zones (delete effort-only strings), draw volume from the shared model (delete `WEEKLY_MILEAGE` + `LONG_RUN_PROGRESSION`), apply the **forgiving** dial. RPE → no-data fallback. | **Races byte-identical** — `performance_build` untouched this stage; prove via the race path before/after. Non-race: guard test snapshots the new zone-based shape. | ✅ alone — the non-race unlock |
| **E4 — Race volume to sourced [SUB-DECISION B]** | Migrate `performance_build`: draw volume from the shared §4.5 model (delete its `WEEKLY_MILEAGE`), apply the **sharp** dial. Pace presentation stays explicit Daniels. | **Deliberate change, guard-tested (D-216 pattern):** enumerate the marathon/half volume diff; NOT byte-identical; deploy-gated acceptance. **Pace-unchanged parity** proves no pace-side regression. | ✅ alone |
| **E5 — Phase-split sourcing** | Replace `determinePhaseStructure`'s placeholder `0.4/0.4/0.2` with the documented phase model (RUN-PROTOCOL) or stated ratios. Affects both shapes' phase week-counts. | Deliberate change, guard-tested (both shapes). Isolated so the split change is reviewable on its own. | ✅ alone |
| **E6 — Combined + tri migration (DEFERRED)** | Repoint `generate-combined-plan` (and later tri) to consume the shared model, dropping the local copies — the unification endgame. | **Matrix 486/486** (combined) proves byte-identical, or guard-tested if values intentionally converge. | Deferred |

**Dependencies:** E1 → E2 → (E3, E4); E5 independent of E3/E4 but best after; E6 last. **Order rationale:** E1/E2 are byte-identical scaffolding (zero risk). E3 (non-race) before E4 (race) — higher value, lower blast radius (non-race is dogfooding-only pre-launch) before the shipped-race-plan change. Each stage is one reviewable cut with its own verification + revert.

## 9. Out of scope / deferred
- The forgiving/sharp *split values* (tuned guardrails — a tuning decision, not part of the structural cut).
- Migrating combined + tri + the future bike engine onto the shared model (the island endgame; incremental).
- The phase-split ratio sourcing (the one thin layer — a small decision, flagged in §5).
- Strength periodization (separate island; `ISLAND-PROPOSAL.md`).
</content>

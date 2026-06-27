# SCIENCE — Triathlon Strength (Friel AA-MS-SM support protocol)

**Status:** Citable grounding for the `triathlon` protocol (`triathlon.ts`, "Multi-Sport Durability" — id `triathlon`; **not** the foundation `durability` module). The most honest framing up front: this protocol implements **Joe Friel's AA-MS-SM periodization, a well-documented coaching model (standard reference text) — NOT a peer-reviewed, RCT-validated protocol.** The *principles underneath it* (strength supports endurance, prevents injury, must be managed for concurrent interference) are peer-reviewed; the *specific phasing and dosing* are Friel's coaching framework. Graded **CONVENTION (coaching-text, not RCT)** — and that's stated plainly, not dressed up.

**Why this doc:** the protocol is referenced in `STRENGTH-PROTOCOL.md §11` (Friel), but without separating the coaching-model status from the peer-reviewed principles underneath. This records that distinction in the 5×5-doc discipline.

---

## 1. What it IS + what it's FOR

The **injury-prevention / tissue-tolerance strength slot for a *support-intent* triathlete** — strength as insurance for endurance, expendable when recovery is the priority:
- **Full-body only** (no upper/lower split — "frequency is too low to justify it"), tier/equipment-aware.
- **Friel AA-MS-SM phases:** Anatomical Adaptation (AA, ~20-30 reps @ 40-60% 1RM, high-rep prep) → Max Strength (MS, ~6-10 reps @ 75-85%) → Strength Maintenance (SM, ~8-12 reps @ 65-75%).
- Phase mapping: early Base → AA, late Base → MS, Build/Race-specific → SM (reduced), Taper → 1 light session, **Recovery → no strength (deload skips it)**.
- **No power/explosive work** (the performance protocol `triathlon_performance` is the upgrade for that).

True role: the **support default** for a triathlete who treats strength as durability insurance. Supplementary by design — subordinate to endurance.

## 2. The cited model + the peer-reviewed principles underneath

- **The AA-MS-SM model itself = Joe Friel, *The Triathlete's Training Bible* (5th ed., 2016), Ch. 13.** This is a respected, widely-used **coaching periodization model** — but it is **practitioner periodization theory, not RCT-validated protocol evidence.** That is the honest status: *well-documented coaching convention.*
- **The principles the model rests on ARE peer-reviewed:**
  - *Strength training supports endurance and prevents injury, dose-dependently* — Lauersen 2014/2018 (see `SCIENCE-durability-injury-prevention.md`).
  - *Concurrent strength + endurance must be managed for interference* — Wilson 2012 + the corpus in `SCIENCE-concurrent-training-interference.md`. This is why the protocol keeps strength low-frequency, full-body, and skips it in recovery.
  - *Phased/periodized loading aids strength* — Williams 2017 (periodization meta).
- So the **scaffolding is sound**; the **specific AA-MS-SM phasing, rep ranges, and %1RM bands are Friel's coaching prescription**, not derived from controlled trials.

## 3. What's convention (flag honestly)

- **The entire AA-MS-SM phase scheme + the rep/% ranges** (20-30@40-60, 6-10@75-85, 8-12@65-75) are **Friel's coaching model** — documented convention, not RCT. Cited to its source (Friel), graded as coaching-text.
- The phase-to-engine mapping (base/build/race-specific → AA/MS/SM) and the deload-skips-strength choice are engine + Friel programming.

## 4. Honest grading

| Claim | Grade |
|---|---|
| Strength supports endurance / prevents injury | **SOUND** (Lauersen 2014/2018; concurrent doc) |
| Concurrent interference must be managed (low-freq, full-body, skip in recovery) | **SOUND** (Wilson 2012; `SCIENCE-concurrent-training-interference.md`) |
| The AA-MS-SM phase model + its rep/% bands | **CONVENTION — coaching text (Friel 2016), not RCT** |

**Bottom line:** a **soundly-scaffolded support protocol built on a documented coaching model.** The injury-prevention + concurrent-management principles are peer-reviewed; the AA-MS-SM phasing and dosing are Friel's coaching framework — cited to source and **graded as coaching-text-not-RCT**, exactly as honesty requires. Supplementary by design (the support-intent tri strength slot).

## 5. Sources

- **Friel, J. (2016).** *The Triathlete's Training Bible* (5th ed.), VeloPress — Ch. 13 (strength). *The AA-MS-SM model. Coaching reference text, not peer-reviewed protocol evidence — cited for the model, flagged as convention.*
- **Lauersen, J.B. et al. (2014; 2018).** Injury-prevention strength-training meta-analyses (see `SCIENCE-durability-injury-prevention.md` for full citations).
- **Wilson, J.M. et al. (2012).** *Concurrent training: a meta-analysis…* J Strength Cond Res 26(8):2293–2307. (concurrent management)
- **Williams, T.D. et al. (2017).** *Comparison of Periodized and Non-Periodized Resistance Training on Maximal Strength: A Meta-Analysis.* Sports Med 47(10):2083–2100.

## 6. Cross-references

- `triathlon.ts` — the protocol; `STRENGTH-PROTOCOL.md §4/§11` (Friel reference + the Norwegian-vs-Friel naming note).
- `triathlon_performance.ts` + (best-sourced tri protocol) — the performance upgrade with peer-reviewed concurrent/economy citations binding its core claims.
- `SCIENCE-concurrent-training-interference.md` — the interference management this protocol embodies.
- **Naming note:** id `triathlon` (this) ≠ id `durability` (foundation run-overlay). Disambiguate by id.

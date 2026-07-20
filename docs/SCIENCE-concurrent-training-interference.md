# Science Block — Concurrent Training Interference & Volume Distribution

**Purpose:** Peer-reviewed grounding for the load-distribution logic in `SPEC-per-discipline-periodization.md` Phase 2 (independent per-sport budgets when strength leads). This documents *why* the distribution rules are shaped the way they are, with citations, so the logic is defensible and not a guess.

**Scope note:** The literature supports the *direction and guardrails* of the distribution, not a precise volume-split coefficient. Phase 2 encodes the directional rules and bounds below — it does not invent a magic ratio the research doesn't provide.

---

> ## ⚠️ 2026-07-19 ADDENDUM — Schumann et al. 2022 refines §2 and §3. Everything below still stands as history; read this first.
>
> A research pass for D-306 surfaced the **updated compatibility review — Schumann et al., *Sports Med* 2022, 43 studies** ([PubMed 34757594](https://pubmed.ncbi.nlm.nih.gov/34757594/)) — which is larger and better-controlled than Wilson 2012, and moves two of the five findings below.
>
> **§1 STRENGTHENED.** Maximal strength SMD **−0.06** (95% CI −0.20 to 0.09, p=0.446) and hypertrophy SMD **−0.01** (−0.16 to 0.18, p=0.919) — both null. Explosive strength SMD **−0.28** (−0.48 to −0.08, p=0.007) — real, small-to-moderate. So "interference is power-specific" is now the *only* surviving effect, not merely the largest one.
>
> **§2 CONTESTED — "cycling interferes far less than running" is called the load-bearing rule here, and that is now stronger than the evidence supports.** Wilson 2012 found the modality split; **Schumann 2022, with more studies, found NO modality moderation** (results independent of aerobic mode, frequency, training status and age). The mechanism remains credible (running's repeated eccentric loading, muscle damage; cycling is near-purely concentric — see [PMC9474354](https://pmc.ncbi.nlm.nih.gov/articles/PMC9474354/) on type-I fibres). **Treat as a plausible mechanism with split meta-analytic support, not a settled rule.** ⛔ This does NOT mean change the shipped scheduling logic — the rule is conservative and harmless in the direction it errs. It means do not cite it as established, and do not build a NEW claim on it.
>
> **§3 CONTESTED.** Wilson's frequency/duration correlations stand as reported, but **Schumann found no frequency moderation at all.** Volume-dependence is directionally supported and mechanistically sensible; **any numeric threshold the app states would be invented.** Say it as a tendency, never with a number.
>
> **§4 CONFIRMED and sharpened.** Robineau et al. 2016 (58 rugby players, 7 weeks, randomised 0h/6h/24h): half-squat 1RM **+16.8% at 0h separation vs +31.2% at 6h and +25.9% at 24h** (strength-only +23.9%). **Only the back-to-back group underperformed** — the cliff is at zero separation, not a graded 24h ideal. Schumann's same-session subgroup agrees (attenuation p=0.043 same-session, n.s. at ≥3h). This is the engine's 6-hour gate (`week-builder.ts:1917`), and it is correct.
>
> **§5 CONFIRMED.** Eddens et al. 2018 meta (10 studies): resistance-first beat endurance-first for lower-body dynamic strength by **6.91%** (CI 1.96–11.87, p=0.006); no difference for hypertrophy or VO2max. Their own framing: use RT-first *only if you cannot separate the sessions*.
>
> **NEW — the reverse direction, which this doc never covered and which is the best-supported material in the domain.** Strength training does not cost aerobic fitness and improves economy: **running economy ES −0.266** high-load (CI −0.516 to −0.015, p=0.039), **−0.426** combined methods ([PMC11052887](https://pmc.ncbi.nlm.nih.gov/articles/PMC11052887/), 31 studies); **cycling efficiency ES 0.353** (p=0.012) with VO2max unchanged ([PMC12881108](https://pmc.ncbi.nlm.nih.gov/articles/PMC12881108/), 17 studies). Both low-to-moderate certainty. **The honest frame for a hybrid app is CREDIT, not hazard** — see D-306.
>
> **NEW — the measurement ceiling, and it governs what the app may ever say.** e1RM from load-velocity has intra/inter-day **CV 2.4–9.7%**, and the literature states directly that daily 1RM prediction is **not sensitive enough to detect fatigue** ([PMC10154341](https://pmc.ncbi.nlm.nih.gov/articles/PMC10154341/)). The interference effect (−0.28) is **smaller than the instrument's error bar.** So: the app can defensibly comment on **scheduling structure** (same-day pairing, order, separation — recorded exactly) and **never on whether interference occurred**. See Q-191.
>
> **Also worth knowing:** submaximal HR is a trap as a fatigue detector — overreached athletes show HR going *down* and HR recovery getting *faster* while RPE rises ([PubMed 28704885](https://pubmed.ncbi.nlm.nih.gov/28704885/)). "HR at fixed pace is climbing → fatigued" can be actively backwards. And the whole field has been shrinking: Hickson 1980's dramatic result came from ~11 sessions/week in untrained subjects, and every better-controlled meta since has narrowed it.

## The five findings that ground the distribution logic

### 1. Interference is power-specific, not strength/hypertrophy-specific
The interference effect attenuates **power** development under concurrent training, but maximal strength and hypertrophy are largely preserved.

- Wilson et al. (2012), meta-analysis, 21 studies, 422 effect sizes: power development effect size was 0.91 (strength-only) vs 0.55 (concurrent) vs 0.11 (endurance-only) — concurrent training significantly blunts power relative to strength-alone.
- Updated meta-analysis (Petré/Schumann lineage, 2023): power gains impaired with concurrent training, but hypertrophy and maximal strength **not** compromised.

**Implication for the engine:** A strength block with a **power** focus must cap concurrent endurance hardest. A **hypertrophy or max-strength** focus tolerates concurrent cycling well. → strength_intent should modulate how aggressively non-focus cardio is floored.

---

### 2. Cycling interferes far less than running (the load-bearing rule)
The endurance *modality* matters more than almost any other variable. Cycling is well-tolerated alongside strength; running is not.

- Wilson et al. (2012): resistance training concurrent with **running** — but **not cycling** — produced significant decrements in both hypertrophy and strength.
- Frontiers semi-systematic review (2025): running-based endurance had a more pronounced interference effect on hypertrophy than cycling, attributed to **eccentric contraction-induced muscle damage** in running.

**Implication for the engine:** This is the science behind "strength + bike build, run maintain." When strength leads, cycling is the *compatible* co-discipline; running is the one to bound. The same-day interference matrix already encodes a version of this (bike tolerates adjacent strength; run does not) — this is its peer-reviewed basis.

---

### 3. Volume and frequency drive interference magnitude (the distribution dial)
Interference scales with how much endurance is done. This is the actual basis for a *budget* rather than a binary.

- Wilson et al. (2012): significant **negative correlations** between endurance frequency (−0.26 to −0.35) and duration (−0.29 to −0.75) and gains in hypertrophy, strength, and power.
- Updated meta-analysis: **no** interference on maximal strength when volume was reduced to ~2 weekly aerobic + 2 weekly strength sessions. However, even **low** aerobic volumes diminished **rapid force production** (power).

**Implication for the engine:** Strength *can* be the lead with bounded endurance — the science explicitly supports a low-endurance-volume concurrent model preserving max strength. The guardrail: power adaptations remain sensitive even at low endurance volume, so a power-focus block bounds cardio tighter than a hypertrophy-focus block.

---

### 4. Separation reduces interference
Acute interference is highest when the two are stacked in one session; spacing dissipates it.

- Updated meta-analysis: significant interference for same-session concurrent work (≤20 min apart) but **not** when separated by **≥3 hours**.

**Implication for the engine:** The existing week-optimizer spacing rules (24h/48h leg-loading windows, the consolidated-vs-separated mode) are doing exactly what the research prescribes. No change needed — this validates the current calendar layer.

---

### 5. Sequence is a minor factor
The order of strength-then-endurance vs endurance-then-strength is not the primary interference driver for the adaptations that matter here.

- Frontiers review (2025): sequence is **not** the leading cause of interference for hypertrophy and maximal strength.
- Intra-session sequence meta-analysis (2018): an order effect appeared for only **one** outcome (lower-body *dynamic* strength, favoring resistance-first, in programmes ≥5 weeks); none for static strength, hypertrophy, VO₂max, or body fat.

**Implication for the engine:** Don't over-engineer same-day ordering. A light resistance-first default for dynamic-strength blocks is supported; beyond that, sequence is not worth budget complexity.

---

## What Phase 2 should encode (the defensible rules)

From the above, the distribution logic when strength leads:

1. **Cycling is the preferred concurrent endurance discipline; running is bounded harder.** (Finding 2)
2. **strength_intent modulates the cardio cap:** power focus → tightest endurance bound; hypertrophy / max-strength → more permissive. (Findings 1, 3)
3. **Endurance volume/frequency is the dial, not a switch** — a bounded-but-real endurance load preserves max strength; the bound tightens for power goals. (Finding 3)
4. **Spacing rules already satisfy the separation science** — no new same-day logic required. (Finding 4)
5. **Sequence stays simple** — optional resistance-first for dynamic-strength blocks; otherwise ignore. (Finding 5)

**What the engine must NOT claim:** a precise "bike-to-strength volume ratio." The literature gives direction and bounds, not a coefficient. Phase 2 sets defensible guardrails (modality preference, intent-scaled caps, spacing) and leaves the exact volume the athlete's own response/benchmark re-test calibrates over the block.

---

## Honesty / limits of the evidence

- Most hypertrophy data is male; sex-specific conclusions are limited. The 2023 sex/training-status meta-analysis found blunted lower-body strength in males but not females, and lower VO₂max gains with concurrent training in **untrained** but not trained/highly-trained athletes — so training status matters and the interference is generally *smaller* in trained athletes (relevant: the target user here is trained).
- Numbers above are effect sizes and correlations from meta-analyses, not a prescriptive formula. Treat as directional.

---

## References

- Wilson JM, Marin PJ, Rhea MR, et al. *Concurrent training: a meta-analysis examining interference of aerobic and resistance exercises.* J Strength Cond Res. 2012;26(8):2293–2307. (PMID: 22002517)
- *Concurrent Strength and Endurance Training: A Systematic Review and Meta-Analysis on the Impact of Sex and Training Status.* Sports Med. 2023. (PMC10933151 / Springer 10.1007/s40279-023-01943-9)
- *The effects, mechanisms, and influencing factors of concurrent strength and endurance training with different sequences: a semi-systematic review.* Front Sports Act Living. 2025. (10.3389/fspor.2025.1692399)
- *The Role of Intra-Session Exercise Sequence in the Interference Effect: A Systematic Review with Meta-Analysis.* Sports Med. 2018. (PMC5752732)
- Foundational: Hickson RC. *Interference of strength development by simultaneously training for strength and endurance.* 1980. (the original interference-effect observation already cited in the engine's schedule-constraints comments)

---

*Attach to / referenced by: `SPEC-per-discipline-periodization.md` §Phase 2 (load-budget reconciliation). This block is the citable rationale; it prescribes direction and guardrails, not coefficients. Cross-ref also: `docs/SCHEDULING-RULES.md §4.21` (the same-day interference rule whose peer-reviewed basis Finding 2/4 supplies), `docs/STRENGTH-PROTOCOL.md` (the strength_intent taxonomy Finding 1 modulates).*

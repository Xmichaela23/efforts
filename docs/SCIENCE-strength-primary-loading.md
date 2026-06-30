# SCIENCE — Strength-Primary Loading (Get Strong, Program 1)

The loading curve, 12-week timeline, and deload for the strength-primary block (`shared/strength-system/strength-primary-plan.ts`). **House style:** every line tagged **CITED** (peer-reviewed, checked against the primary abstract — use exactly) or **CONVENTION** (practitioner/periodization consensus, NOT a peer-reviewed constant; calibrated by the athlete's own retest).

**The honesty line:** the **ATR arc**, the **heavy-strength→economy mechanism (neural)**, and the **12-week concurrent length** are peer-reviewed. The **exact %s, the deload timing, and the retest-from-sub-max** are CONVENTION, calibrated by the athlete's retest. *Sequence is science; dial settings are judgment.*

---

## The loading curve (12-week block, off the athlete's entered 1RM)

| Phase | Weeks | Scheme | %1RM | Tag |
|---|---|---|---|---|
| **Accumulate** (base) | 1–4 | 5×5 | 72 → 82% | arc CITED [3] · %s CONVENTION |
| **Intensify** (power) | 5–6 | 5×3 | 84 → 90% | intensity CITED [1][2] · %s CONVENTION |
| **DELOAD** | 7 | 2×5 | ~65% (≈50% vol+intensity drop) | CONVENTION [4] |
| **Realize** (peak) | 8–11 | 3×2 (heavy **doubles**) | 88 → **94%** | arc CITED [3] · %s CONVENTION |
| **Retest** (courtesy) | 12 | squat/bench: optional **single** check (~102.5%, small PR) · OHP/DL: working-set **estimate** | the ONE near-max moment | CONVENTION [5] |

- **CITED — the arc + the 12-week length:** accumulation → transmutation(intensify) → realization(peak) over ~12 weeks is the studied structure for recreational endurance athletes [3 Filipas 2018].
- **CITED — heavy/maximal intensity is the right stimulus, and it's for THIS athlete:** strength work for endurance must be heavy/explosive; the adaptation is **NEURAL** (delayed type-II activation, neuromuscular efficiency, type-IIX→IIA shift, tendon stiffness), **not hypertrophy** [1 Rønnestad & Mujika 2014]. In master endurance runners specifically, **maximal** strength (not light resistance) drove the gains [2 Piacentini 2013].
- **CONVENTION — the exact %s + the deload:** the 72→97% ramp and the ~50% deload at wk7 are periodization consensus, not constants; the retest recalibrates them.

## The DELOAD (the gap this fixed)
A block this long needs recovery **every 6–8 weeks** — the prior plan ramped weeks 1–11 continuously with **no recovery week anywhere**. The deload (wk7, ~50% volume + intensity drop) sits **between intensify and peak** so the athlete recovers *before* the heavy singles. **CONVENTION [4]** (periodization consensus). Required structural element — not optional.

## The RETEST — one near-max moment, conditional on a baseline
The block **must end with a higher 1RM than it started** — that is the entire promise; the wk12 retest enforces it. Two design rules learned from the dogfood read:
- **One near-max moment, not two.** The peak (wk8–11) is heavy *doubles* (≤94%) — it primes the CNS but does NOT max. The single happens **only** at the retest, so a lift is never near-maxed two weeks running (that was over-testing + injury risk for no extra signal).
- **Sparing + conditional (CONVENTION [5]):** the retest is **NOT four mandatory max-out days**.
  - **HAS a baseline 1RM** → the end retest is an OPTIONAL **courtesy**: squat + bench = a light single max-CHECK ("see your new max if you want," aim a small PR ~102.5% — renders ABOVE the peak double, so it *expresses the gain*); OHP + deadlift just **estimate** the e1RM from a top working set (Epley/Brzycki, ±3–5%). No grinding, no spotter-less max-out.
  - **NO baseline 1RM** → a strength-primary block can't load percentages without an anchor, so a baseline test is **REQUIRED UP FRONT** (before wk1), not a courtesy at the end. *(This conditional gate + the e1RM → `performance_numbers` write-back is Q-097 — built tags, not yet wired; the loop isn't closed.)*

## The promise (honest, not hyped)
Expect a **MEASURED** gain. Concurrent strength gains are real but **modest** (~+4–16% range over a block); this is honest progression, not a big-PR promise. The plan copy states this and the retest verifies it.

---

## Citations

**CITED — peer-reviewed:**

1. **Rønnestad, B.R. & Mujika (2014).** "Optimizing strength training for running and cycling endurance performance: A review." *Scand J Med Sci Sports* 24(4):603–612. doi:10.1111/sms.12104.
   → Grounds: heavy/explosive strength improves running economy; mechanism is **NEURAL**, not hypertrophy.

2. **Piacentini, M.F., De Ioannon, G., Comotto, S., Spedicato, A., Vernillo, G., & La Torre, A. (2013).** "Concurrent strength and endurance training effects on running economy in master endurance runners." *J Strength Cond Res* 27(8):2295–2303. doi:10.1519/JSC.0b013e3182794485.
   → Grounds: **heavy/maximal** strength is right for the **masters endurance** athlete — MST group **+16.34% 1RM, +6.17% running economy** at marathon pace; light-resistance group no change.
   → **⚠ ACCURACY GUARD — this study was 6 WEEKS at 85–90% 1RM. It grounds INTENSITY + POPULATION, NOT the 12-week length. Do NOT cite Piacentini for the timeline.**

3. **Filipas, L. et al. (2018).** "Effects of Running-Specific Strength Training, Endurance Training, and Concurrent Training on Recreational Endurance Athletes." (PMC9518107).
   → Grounds: the **12-WEEK length** AND the **ATR (Accumulation, Transmutation, Realization)** block arc — concurrent group improved 1RM squat, running economy, lean mass, CMJ, VO2max, anaerobic threshold together. **This is the timeline + arc citation — not Piacentini.**

**CONVENTION — flag honestly, not peer-reviewed constants:**

4. Deload **every 6–8 weeks**; an **8–12-week** block is ideal for a strength-novice (the endurance-base Get Strong athlete) — coaching/periodization consensus, calibrated by the retest.
5. **Retest from a sub-max heavy set** (estimate e1RM, ±3–5% accurate from 1–6 reps near failure; a true 1RM only when fully prepared with a spotter) — practitioner convention. This is why the retest is a heavy triple/double + estimate, **NOT** a solo max-grind single.

---

## The maintenance-endurance band (Get Strong: typed mileage, science-guardrailed)

In a Get Strong block the endurance work is **held, not developed** — strength leads (Rønnestad/Mujika, D-221), so running gets a budget, not a build. The athlete **types the weekly mileage they want to hold** (they know their own volume); the band is a **guardrail on that number**, not a menu. Unit = the athlete's `user_baselines.units`; miles convert/bound via their real easy pace (`arc.easy`).

**Floor — hold the aerobic base (frequency, not mileage, is the lever):**
- **CITED — Hickson & Rosenkoetter (1981)** *Med Sci Sports Exerc* 13(1):13–16 [(PubMed 7219129)](https://pubmed.ncbi.nlm.nih.gov/7219129/): frequency cut to **2 d/wk** held VO₂max for 15 wk (intensity + duration held).
- **CITED — Hickson et al. (1982)** *J Appl Physiol* 53(1):225–229 [(PubMed 6214534)](https://pubmed.ncbi.nlm.nih.gov/6214534/): duration cut to **13–26 min/session** held VO₂max for 15 wk (frequency + intensity held).
- **CITED (modern receipt) — Spiering et al. (2021)** *Strength Cond J / J Strength Cond Res*, *Maintaining Physical Performance: The Minimal Dose…* [(review)](https://www.researchgate.net/publication/349637321): restates exactly this for endurance — maintained ≤15 wk at **2×/wk or 33–66% volume reduction**, intensity held. **"Established 1981, confirmed 2021."**
- → **floor ≈ 2–3×/wk**, pace-mapped to miles (a faster runner's floor is more miles in the same dose).

**Ceiling — protect strength (cap running, it's the interfering modality):**
- **CITED — Wilson et al. (2012)** *J Strength Cond Res* 26(8):2293–2307 [(PubMed 22002517)](https://pubmed.ncbi.nlm.nih.gov/22002517/): concurrent interference is **dose-dependent on endurance frequency + duration**, and **running (not cycling)** produced significant strength/hypertrophy decrements (hypertrophy ES 1.23→0.85; strength 1.76→1.44 concurrent). → cap running volume so it doesn't eat strength recovery.

**The intensity caveat (decides the honest framing) — Option A, all-easy:**
- **CITED — Hickson et al. (1985)** *J Appl Physiol* 58(2):492–499 [(PubMed 3156841)](https://pubmed.ncbi.nlm.nih.gov/3156841/) + Spiering 2021: cutting **intensity** loses VO₂max — intensity is the maintenance non-negotiable. Get Strong maintenance is deliberately **all-easy** (no quality session — don't spend interference budget defending a metric the block sets down). So it **maintains the AEROBIC BASE, not VO₂max** — frame it exactly that way; the literature makes that honest, not a hedge. **VO₂max sharpening returns in the endurance block** (the agreed tradeoff, D-221 lifecycle).

**CONVENTION (practitioner calibration, flagged):** the exact session minutes (~20–25 floor / ~40 ceiling), the **3×/wk** anchor, and the precise ceiling mileage sit on top of the cited frequency/duration/interference findings — the studies establish *that* low volume holds and *that* running interferes by dose, not the exact running prescription.

**The guardrail (engine behavior):** typed miles **inside the band → build it, no friction**; **above the ceiling → glass-box flag + build the capped max**; **below the floor → flag + bump to floor**. Honor up to the science, never past it. **Flat — no ramp** (it's maintenance, not a build). Develop modes (Maintain / run-forward) instead clamp to the §4.5 legal range with a ramp. The commitment tier is **retired for endurance volume** — pace + science bound it, not a fixed hours band.

---

*Cross-ref: `strength-primary-plan.ts` (the curve + deload + retest), `SPEC-product-shape.md` (Program 1), D-221 (the engine decision), `SCIENCE-minimum-dose-maintenance.md` (Spiering 2021 also grounds strength minimum-dose), the materialize-plan clamp + rep-scale fixes (commits `89578531`, `2b5458d8`).*

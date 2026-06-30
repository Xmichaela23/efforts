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
| **Realize** (peak) | 8–11 | 3×2 → **2×1** | 88 → **97% single** (wk11) | arc CITED [3] · %s CONVENTION |
| **Retest** | 12 | heavy **3-rep** set | ~90%, work up → **estimate e1RM** | CONVENTION [5] |

- **CITED — the arc + the 12-week length:** accumulation → transmutation(intensify) → realization(peak) over ~12 weeks is the studied structure for recreational endurance athletes [3 Filipas 2018].
- **CITED — heavy/maximal intensity is the right stimulus, and it's for THIS athlete:** strength work for endurance must be heavy/explosive; the adaptation is **NEURAL** (delayed type-II activation, neuromuscular efficiency, type-IIX→IIA shift, tendon stiffness), **not hypertrophy** [1 Rønnestad & Mujika 2014]. In master endurance runners specifically, **maximal** strength (not light resistance) drove the gains [2 Piacentini 2013].
- **CONVENTION — the exact %s + the deload:** the 72→97% ramp and the ~50% deload at wk7 are periodization consensus, not constants; the retest recalibrates them.

## The DELOAD (the gap this fixed)
A block this long needs recovery **every 6–8 weeks** — the prior plan ramped weeks 1–11 continuously with **no recovery week anywhere**. The deload (wk7, ~50% volume + intensity drop) sits **between intensify and peak** so the athlete recovers *before* the heavy singles. **CONVENTION [4]** (periodization consensus). Required structural element — not optional.

## The RETEST — a measurement, the safe way
The block **must end with a higher 1RM than it started** — that is the entire promise. The enforcing test is the wk12 retest. **But it is NOT a solo near-max single** (the one high-risk/low-reward moment for a masters athlete training alone): the athlete works up to their **heaviest clean TRIPLE** (~RPE 9, a rep in reserve), and the engine **estimates** the new 1RM (Epley/Brzycki e1RM, **±3–5% accurate from 1–6 reps near failure**). The estimate becomes the new stored max; the next block compounds off the bigger number. **CONVENTION [5]** — test a true 1RM only when fully prepared with a spotter; otherwise estimate from a sub-max set.

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

*Cross-ref: `strength-primary-plan.ts` (the curve + deload + retest), `SPEC-product-shape.md` (Program 1), D-221 (the engine decision), the materialize-plan clamp + rep-scale fixes (commits `89578531`, `2b5458d8`).*

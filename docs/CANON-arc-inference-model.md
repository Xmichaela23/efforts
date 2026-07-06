# The Arc Inference Model — CANON

**What this is.** The authoritative definition of how Efforts *infers* — how Arc turns "what came before" plus "how the session went" into a claim about the athlete, without that claim becoming a score that lies. This is the bible for the training-reaction / carried-in-fatigue read and for every inference that follows it. Deliberately finite: one object, one confidence ladder, one set of gates.

Read order: this doc → the axis/Q design doc → the code. Cross-refs: `SELF-AWARENESS-MAP.md` (substrate Layers 1–4, Axis 1), `SPEC-universal-narrative-inference.md` (the 7 rules every narrative render obeys — §11's checker is their deterministic enforcement), `OPEN-QUESTIONS.md` (Q-127 heavy-legs two-witness, Q-128/129 narrative-honesty), `DECISIONS-LOG.md` (D-231 typed-beats-learned, D-232 glass-box receipts, D-237 estimate-provenance guard, D-242 label-what's-computed).

---

## 0. The one law

**Arc may infer. Every inference is labeled as inference, carries its basis and its confidence, and its narrative register is a function of that confidence. A measured fact and an inference never wear the same clothes.**

This is D-242 ("label what's computed, never compute to match the label") extended one layer up: from *facts* to *inferences about the athlete*. The measured number is stated flat. The causal claim is hedged in exact proportion to how much the app actually knows. When the app can't yet know, it says it's still learning — it does not fill the gap with a confident number.

The failure this exists to prevent: the Whoop/Garmin pattern — collapse many signals into one confident, color-coded number, hide the uncertainty, and let the user over-rely on a value the vendor's own docs call "directional, not diagnostic." Efforts does the opposite: the inference is glass-box, and its confidence is on the face of it.

---

## 1. Why this exists (the landscape, compressed)

Three ways the market handles inference; Efforts takes the honest half of each and adds the part none of them ship.

| Archetype | Example | What it does | Why it's insufficient |
|---|---|---|---|
| **Opaque synthesized score** | Whoop Recovery, Garmin Training Readiness | Collapse HRV/RHR/sleep/load into one number vs a personal baseline | The inference is confident and unqualified; the uncertainty is hidden → over-reliance on a number the docs admit is directional. **The score that lies.** |
| **Deterministic, no narration** | TrainingPeaks PMC (CTL/ATL/TSB) | Pure arithmetic on load; shows the model, attributes nothing | Honest by silence — never comprehends *why*. Floor without a ceiling. |
| **Cautious baseline-relative** | HRV4Training | Reads every signal vs the athlete's own normal; won't trust one marker alone; corroborates + controls context | Closest to correct; but stops at "here's your data" — doesn't wire the inference into the fitness read or the plan. |

**Efforts' position:** deterministic facts (already built — `workload_actual`, D-242) + baseline-relative, corroborated caution (the model below) + the differentiator: **measured/inferred separated at the substrate, confidence stamped on the inference, confidence drives the register, receipts attached.** Glass-box inference.

**The science backing the caution (not a style choice — claims verified 2026-07-05, sources below):**
- Individual training response varies substantially; there is no universal "normal" → inference must be relative to the athlete's own baseline (Z-score vs own history), never population averages.
- A single *field* marker (pace, decoupling) is confound-prone in isolation — terrain, heat, and a deliberate pacing choice each mimic a fatigue signal → corroborate and clear confounds before attributing.
- Corroboration beats trusting one signal. In intensified-training studies of **recreational runners** (our population), an objective marker (nocturnal HR) and a subjective one (readiness-to-train / leg soreness) *each independently* reached **≥85% positive- and negative-predictive value** discriminating overreaching from adaptation [Nuuttila 2024]. Two witnesses from different signal classes both work — which is why the two-witness architecture (Q-127) is evidence-based, not a preference. (Note: the study measured each marker's PPV/NPV independently; "combination beats either alone" is the broader monitoring literature's position, not this specific number.)
- Confidence scales with data quantity → a "building baseline" state is scientifically honest at low N. Garmin/Firstbeat ship exactly this: **"No Status" until ~1–2 weeks** of activity establishes the VO2max baseline [Garmin].

**Sources (verified 2026-07-05):**
- [Nuuttila et al. 2024] *Monitoring fatigue state with heart rate-based and subjective methods during intensified training in recreational runners*, European Journal of Sport Science — nocturnal HR, readiness-to-train, and an HR-power index each showed ≥85% PPV/NPV discriminating overreached vs responder runners. https://pubmed.ncbi.nlm.nih.gov/38956784/
- [Garmin] Garmin/Firstbeat Training Status requires ~1–2 weeks of activity to establish VO2max before it leaves "No Status." Garmin support + forums.

---

## 2. The core object — the `training_reaction` fact

One deterministic spine fact per session, assembled by Arc, written to the spine, consumed by every surface (one-fact-two-surfaces, Layer 4). Surfaces never re-derive it.

```
training_reaction {
  present:        bool          // is there a credible carried-in reaction at all
  source:         enum          // lower_body_strength | quality_ride | high_acwr |
                                //   poor_readiness | (extensible)
  antecedent_ref: workout_id    // the specific prior session it points to (receipt)
  window_days:    int           // how far back the antecedent sits (≤ guard)
  magnitude:      float         // size of the effect, in the witness's own units
  witnesses:      [enum]        // which signals fired: declared_soreness |
                                //   rpe_vs_baseline | pace_vs_norm | decoupling | load_only
  basis:          enum          // best witness present: declared > objective > load_inference
  confidence:     float         // f(basis, corroboration, baseline_maturity, confound_check)
  baseline_state: enum          // mature | building | cold   (per witness)
  confounds_ruled:[enum]        // heat | terrain | pacing_choice — what was checked & cleared
}
```

**Assembled in Arc** because Arc is where the antecedent already lives (prior sessions, strength focus, recent load, the ≤3-day window). The fade itself (pace-vs-norm) is Witness 2; the declared state (soreness/RPE) is Witness 1; Arc joins them.

> Note: §11 promotes this object to its full render-contract shape (signed `valence`, ranked `contributors` for co-attribution, and the governed presentation fields `register`/`lead`/`must_name`/`may_not_say`). §2 is the substrate sketch; §11.1 is the built shape.

---

## 3. The confidence ladder — basis → register

The heart of the model. `confidence` and `basis` deterministically select the narrative register. This is what keeps the inference honest without going mute.

| Layer | What the app has | Register | Example |
|---|---|---|---|
| **Measured fact** | A computed number | **Flat, no hedge** | "Pace faded 75s/mi; HR held in band." |
| **Corroborated inference** | ≥2 witnesses agree, baseline mature, confounds cleared | **Named cause, light hedge** | "You faded, and it tracks — sore legs from Monday's lower-body work." |
| **Single-witness inference** | 1 witness, or thin baseline | **"could be"** | "That fade could be carried-in leg fatigue from Monday." |
| **Cold / empty baseline** | Antecedent exists, no baseline to judge against | **Observational** | "Worth watching how your body handles heavy leg days before a run." |
| **Strong signal, no antecedent** | Large deviation, nothing in window, confounds cleared | **Observational-concern** | "That was well off your norm with nothing obvious behind it — worth noting if it repeats." |
| **Weak signal, no antecedent** | Small deviation, no credible cause | **Silent** | (say nothing — a small unexplained wobble is not attributed) |

Two hard directions, both derived from the one law:
- **Never hedge a measured fact.** "Pace faded 75s/mi" is computed. Softening it ("pace maybe eased a little") is a lie in the timid direction — the mirror image of the score that lies.
- **Never assert an inference above its confidence.** "Your legs are fatigued" (flat) when only one witness fired and the baseline is empty is the score-that-lies failure. It becomes "could be."

> The last two rows split what earlier drafts left as a single "no antecedent → silent" terminal — silence is for *small or explained*; a *large, unexplained* deviation warns rather than mutes (the illness/overreaching case must not be silenced). The magnitude threshold that divides them is fork §8.1.

**Register is computed, not stylistic.** The `confidence`/`basis` fields choose it; the LLM narrates within the chosen register. This is the Q-129 shared-honesty spine doing its job at the inference layer.

---

## 4. The two-witness gate (the laundering guard)

Attribution to a training reaction is permitted only when **all** hold:
1. **Antecedent genuinely in window** — a real prior session of sufficient size, `antecedent_ref` set (the receipt).
2. **Magnitude sufficient** — the effect clears a threshold vs the athlete's own baseline, not an absolute.
3. **Confounds cleared** — not better explained by heat, terrain, or a deliberate pacing choice; `confounds_ruled` records what was checked. Co-causation is representable: `contributors` (§11.1) is a ranked list, so "heat and heavy legs both" is a legal verdict, not a forced single-cause pick.
4. **Corroboration for high confidence** — a *single* witness earns only "could be." Two agreeing witnesses (e.g. declared soreness + pace-vs-norm) earn the named, confident read.

**The escape valve (non-negotiable):** the gate must never bury a real warning under "must be fatigue." Illness, overreaching, and genuine decline are the alternative hypotheses. When the antecedent is thin but the signal is strong, the app does **not** reassure — it flags uncertainty or surfaces the "something may be off" read (the observational-concern register, §3). Attribution is evidence-gated reassurance, never automatic reassurance.

---

## 5. Fitness protection (obligation A)

The point of the whole feature: a load-explained fade must not silently dock fitness.

- When `training_reaction.present` and confidence ≥ threshold, the session's efficiency/trajectory sample (pace-at-HR, the Axis-2 rollup) is **flagged confounded** and its influence on the fitness read is reduced. Scope: this applies to the **efficiency/quality** read, not to load accounting — the session still counts toward ACWR/CTL (it was work); it just stops counting as evidence of a fitness *decline*.
- **Labeled, never silent (D-242):** the trajectory read records "excluded/down-weighted 1 session: carried-in leg fatigue," with the receipt. A number that both says "you faded" and quietly dings fitness while the truth is "load-explained" lies by omission — the exact worry.

**Open fork (§8):** down-weight-by-confidence vs hard-exclude.

---

## 6. Cold-start honesty (the current reality)

Both declared baselines are empty (0 comparable RPE, no soreness history). Per §3, that means the honest register **right now** is "building baseline / worth watching" — not silence, not a confident attribution.

- Inference confidence is gated on `baseline_state`. `cold` → observational register only, no named cause, no fitness discount (nothing to judge against yet).
- This is not a failure mode. It is the Garmin "No Status" precedent: the app states it is still learning the athlete, and every observation logged moves a witness from `cold` → `building` → `mature`.
- The corollary: the observational read must still **do something** — it is the prompt to log soreness/RPE that seeds Witness 1. If it's inert, the athlete stops feeding it and the baseline never matures. Neutral in voice, load-bearing in the loop.

**Honest scope note (do not skip):** at N=0 the entire apparatus below the seam buys exactly one behavior — *abstain honestly*. The confidence ladder, two-witness corroboration, and fitness protection are dormant until baselines mature. Build the cheap, always-correct core now (the struct + seam + checker, §11); spec the ladder, but bank its payoff as **deferred**. Shipping a cathedral of confidence-plumbing before there is data to be confident about would be this model's own version of the score that lies.

---

## 7. Source breadth from day one

Carry `source` as a first-class field immediately, even while only one path is lit:
- `lower_body_strength` — the leg-day case (first to light; the Q-127 instance).
- `quality_ride` — a hard/long ride as antecedent.
- `high_acwr` — a load spike, no single antecedent session.
- `poor_readiness` — a declared-state antecedent (sleep, energy).

The witness logic and register are source-agnostic; only the antecedent detector differs. Lighting one source at a time never requires reshaping the object.

---

## 8. Open decisions (forks — need Michael's ruling)

These are deliberately unresolved; each is a real design choice, not a default.

1. **Comfort line — reassure vs warn.** Where is the boundary between "it's just fatigue, don't worry" and "something may be off"? What antecedent strength / witness agreement is required before the app reassures rather than flags? This also sets the magnitude threshold dividing §3's two no-antecedent rows (silent vs observational-concern). (§4 escape valve depends on this.)
2. **Discount vs exclude.** Does a confounded session get down-weighted (by confidence) in the fitness read, or hard-excluded? (§5.)
3. **Single-witness threshold.** Is one witness ever enough for a named cause, or is "could be" the hard ceiling until two agree? (§3/§4.)
4. **Self-directed aggression.** This was an unplanned, aggressive run on tired legs — no "should've been easy" intent to grade against. Does the app gently note the self-directed push, or stay neutral on the choice? (Autonomy-supportive framing says note it informationally, if at all — never controlling.)
5. **Does a fade currently dock fitness — trace owed.** Unknown until the pace-at-HR trend + rollup are traced. If it doesn't currently dock, obligation A is half-handled and this is mostly attribution work; if it does, that trace is the real hole. **This trace is the first build step, not an assumption.**
6. **Ride-on-Q-127 vs load-inference-first.** The corroborated path is gated on the DOMS decay coefficients Q-127 is waiting on. Decide: does this ship *only* when those land, or ship the `load_inference` basis first (antecedent-exists, low-confidence "could be") so obligation A is protected before the bespoke tuning arrives? Otherwise this feature inherits Q-127's blocker.
7. **Positive / symmetric reactions.** Is `training_reaction` deliberately fatigue-only for v1, or symmetric — a `valence` of `fatigued | well_absorbed | neutral` (§11.1 assumes symmetric via a signed magnitude)? Symmetric is truer to "see how the individual is handling the training" (handling it *well* is half of that) and is the same machinery, sign-unrestricted.
8. **Pattern / trajectory layer.** `training_reaction` is per-session, so three individually-excusable fades each read "could be fatigue" and the app never says the thing that matters — *you keep needing the excuse and aren't rebounding.* Add a thin layer that watches the **rate** of firings and escalates register when recovery isn't following? This is where §4's escape valve gets its teeth. (Axis 2.)

---

## 9. Honesty gates (the rules)

In the style of the Self-Awareness Map Layer-3 rules. Every inference surface routes through these.

1. **No cause without an antecedent in window.** No `antecedent_ref` → no attribution.
2. **No hedge on a measured fact.** Computed numbers state flat.
3. **No assertion above confidence.** Register is bounded by `confidence`/`basis`; single-witness caps at "could be."
4. **No silent confound.** A down-weighted or excluded fitness sample is always labeled with its reason and receipt.
5. **No reassurance that buries a warning.** Strong signal + thin antecedent → flag uncertainty, never auto-attribute to fatigue.
6. **No population normal.** Every magnitude/threshold is vs the athlete's own baseline.
7. **Cold baseline → observational only.** No named cause, no fitness discount, until the witness is at least `building`.
8. **One fact, N surfaces.** Card, State, coach read the same `training_reaction` fact; they cannot diverge on cause, magnitude, or confidence.

---

## 10. How it maps to existing architecture

- **Arc** = assembly. Joins antecedent (its job already) + witnesses into the `training_reaction` fact.
- **Spine (Layer 1)** = storage. The fact persists on `state_trends_v1`.
- **One-fact-two-surfaces (Layer 4)** = delivery. Every surface consumes the one fact.
- **Axis 1 (cross-domain carryover)** = the attribution engine; `training_reaction` is its output object generalized past legs.
- **Q-127** = the leg-day, two-witness instance of this model (Witness 1 declared soreness / DOMS coefficients; Witness 2 pace-vs-norm).
- **Q-128 / Q-129** = the floor beneath this — don't say "clean" on a fade. This model is the ceiling: name the fade, its cause, and its confidence.
- **§11 render contract** = the seam's enforcement. Generalizes `execution-honesty.ts` (Q-128/129) from one banned phrase to the whole claim, and from "don't lie" to "render the verdict, don't re-decide it."
- **`SPEC-universal-narrative-inference.md`** = the behavioral description of what §11's checker enforces (reason across signals; no self-contradiction; anchor to the athlete; observe, don't diagnose — the cause is now diagnosed *upstream* in the struct, so the render honors "observe, don't diagnose" by rendering an already-adjudicated cause rather than guessing one).

---

## 11. THE RENDER CONTRACT (the buildable spec)

The solve, flat: **store the verdict as data; give it to the LLM; tell it to write *from* it, not re-decide it; check that it did.** The seam is a data contract, not a leash — you don't constrain the prose with rules, you remove its need to guess by handing it the answer, then verify it didn't guess anyway. Everything in §3–§8 (the ladder, silence-vs-warn, positive valence, the pattern) stops being a *prose* problem and becomes a *struct* problem the moment the struct exists — well-posed and testable, not gone.

### 11.1 The struct — `TrainingReaction` (the seam's data contract)

§2 promoted to the object the LLM actually receives. Two halves: what is true (the LLM may not alter any of it) and how to say it (computed too — because the Q-129 lie was an *ordering* lie, "led with Typical," so foregrounding must be governed, not left to the model).

```ts
type Basis    = 'declared' | 'objective' | 'load_inference';   // weakest provenance of load-bearing inputs (D-231/D-237)
type Source   = 'lower_body_strength' | 'quality_ride' | 'high_acwr' | 'poor_readiness';
type Witness  = 'declared_soreness' | 'rpe_vs_baseline' | 'pace_vs_norm' | 'decoupling' | 'load_only';
type Register = 'flat' | 'named_cause' | 'could_be' | 'observational' | 'concern' | 'silent';  // the §3 ladder, enumerated

interface TrainingReaction {
  // ── WHAT IS TRUE (computed upstream; the render may NOT introduce, remove, or alter any of these) ──
  present:         boolean;
  valence:         'fatigued' | 'well_absorbed' | 'neutral';   // signed → carries positive reactions (§8.7)
  magnitude:       number;      // effect size in the witness's own units, signed with valence
  confidence:      number;      // 0..1 — ATOMIC with magnitude; never travels without it + basis (anti-Whoop)
  basis:           Basis;       // inherits the weakest provenance of the load-bearing inputs (D-231/D-237)
  contributors:    Array<{ source: Source; share: 'primary' | 'partial'; ref?: string /*workout_id*/ }>;
                                // RANKED list, not one enum → co-attribution ("heat and heavy legs both")
  witnesses:       Witness[];
  baseline_state:  'mature' | 'building' | 'cold';
  confounds_ruled: Array<'heat' | 'terrain' | 'pacing_choice'>;
  receipts:        Array<{ ref?: string; label: string; value: string }>;  // antecedents + the measured numbers behind magnitude

  // ── HOW TO SAY IT (computed too; the render OBEYS these, does not choose them) ──
  register:        Register;    // the §3 ladder output — deterministic, not a style choice
  lead:            string;      // the ONE claim that must be foregrounded (governs ordering; closes the Q-129 hole)
  must_name:       string[];    // claims that MUST appear (e.g. "faded 75s/mi")
  may_not_say:     string[];    // phrase-classes banned for this register (e.g. "clean"/"held steady" when faded)
}
```

The four gaps from the design dialogue live here as explicit fields — signed `valence` (positive reactions), ranked `contributors` (co-attribution), the two-part `register` ladder (silence-vs-warn), and `lead`/`must_name`/`may_not_say` (governed foregrounding). The pattern layer (§8.8) writes into `register`/`confidence` from a cross-session view; it does not change the struct shape.

### 11.2 The render prompt (the seam, LLM side)

The LLM receives: the `TrainingReaction` struct (ground truth), recent narrative history (so it doesn't repeat itself), conversation depth, and whether the user asked. The instruction, verbatim in spirit:

> These facts are **settled** — computed upstream from measured data. Your job is to render them for this athlete: choose wording and warmth, decide what deserves emphasis **today** *within the ordering `lead` fixes*, and decide when to say little. You may **not** introduce, remove, or alter a cause, a magnitude, or a confidence. You may not state a cause that is not in `contributors`, or a certainty above `register`. Everything in `must_name` appears; nothing in `may_not_say` does; `lead` leads.

Full language latitude, zero verdict latitude — and now zero ordering latitude on the lead.

### 11.3 The checker contract (the seam's enforcement)

Deterministic, post-generation. Generalizes `execution-honesty.ts` from one phrase to the whole claim. Same three-layer shape as D-244: prompt rule (11.2) → validator-regen → deterministic seatbelt as the floor.

| # | Check | Generalizes |
|---|---|---|
| C1 | **No invented cause** — every causal attribution in the prose maps to a `contributors[].source`. | `narrativeHasUnearnedCleanClaim` |
| C2 | **No invented/altered magnitude** — numeric claims match `receipts`/`magnitude` within tolerance; none fabricated. | — |
| C3 | **No certainty above register** — `could_be` ⇒ no flat causal assertion; `cold` ⇒ no named cause (phrase-class match per register). | the register ladder |
| C4 | **`must_name` present** — every required claim appears (the fade is named). | `guardNarrativeHonesty` step 2 (FADE_MENTION append) |
| C5 | **`may_not_say` absent** — banned phrase-classes stripped. | `BANNED_CLAIMS` strip |
| C6 | **`lead` leads** — the foregrounded sentence corresponds to `lead`; a laundering bullet (e.g. "vs similar workouts") cannot precede it. | `fadeLeadBullets` (Q-129) |

Failure on any check → bounded corrective regen → deterministic strip/reorder seatbelt as the floor, so the violation can never reach the screen.

### 11.4 What the seam does NOT guarantee (honest limits)

- The checker guards **commission and ordering**, not subtle tonal spin *within* a register. Register bounds tone; it does not eliminate all shading.
- The checker guards the **seam**, not the upstream computation. The verdict is only as honest as its inputs — upstream honesty is §4/§9 (provenance survives, abstain-not-fill, no population normal).
- The generator is stochastic, so **LLM acceptance = ≥3 back-to-back clean recomputes**, never one. The checker itself is deterministic and needs one fixture per check.

---

## 12. The continuity invariant — one government, states as arms

The organizing law of the whole app, stated plainly: **there is one central authority — the spine — and every surface is an arm of it.** The card, the State screen, the coach, the plan do not each decide what fatigue means; they *read* the one `training_reaction` fact and render it. One government; the states are arms, never independent sovereigns.

- **Divergence is the lie.** If the card says "leg fatigue, could-be," State says "you're fatigued" (flat), and the coach ignores it, the app contradicts itself and no arm is accountable for the claim. Continuity means the same verdict — same cause, same magnitude, same confidence — reaches every surface, and each renders it only at the confidence the fact carries (§3), never above it. That is "let the user know what we can tell them confidently" made structural: the confidence travels with the fact to every arm.
- **Born on the spine, not retrofitted.** `training_reaction` is computed once, on the spine (Layer 1), from whatever tells are available (§2/§7 witnesses + sources). It must **not** start life inside the analyzer or the coach as a local computation — that mints a second authority someone has to reconcile later. Ship it spine-first.
- **Honest current state (the migration debt this must not add to).** The app is not yet a single government. Known forks: the coach reads the spine for only a fraction of its verdicts; capacity truth is forked (prescribed-typed-150 vs judged-learned-125); several surfaces query tables directly. Q-106 (canonical resolver + coach onto the spine), Q-107, Q-108 track closing this. The rule for `training_reaction`: **do not become another breakaway state.** It is a spine citizen from day one, and every arm subscribes.

This is §9 rule 8 ("one fact, N surfaces") promoted from a gate to the governing frame, and it is the same continuity invariant `SPEC-universal-narrative-inference.md` applies to reasoning (single-sourced, never self-contradicting across surfaces).

---

## Appendix A — How the field arrives at the verdict, and how we stay honest

**Status: justification, not load-bearing spec. Verify before citing.** The mechanism specifics below (e.g. the exact Firstbeat signal-processing pipeline) are stated more precisely than we have independently verified; the *argument* survives if a detail is wrong, but do not repeat the specifics to someone who would know without checking. Recorded so the incumbents' failures stay legible as the cautionary tale this model is built against.

**Four ways the field arrives at the verdict:**
- **Physiological model (Garmin/Firstbeat).** A running digital model of the body from HR + HRV — oxygen consumption, energy expenditure, EPOC, stress/recovery reactions. EPOC predicted dynamically from intensity (%VO2max) × time-at-intensity. Personally scaled. The catch: it needs anchors it often doesn't measure — the VO2max the training-effect ranges depend on wants age/height/weight/sex/activity-class; when untested, it fills them from your profile and population regressions.
- **Proprietary ML vs personal baseline (Whoop).** Weights HRV/RHR/respiratory-rate/sleep against a 30-day rolling baseline; lower-than-usual HRV lowers the score. Black-box weighting; claims to beat any single marker.
- **Pure arithmetic (TrainingPeaks).** CTL/ATL/TSB = exponentially-weighted moving averages of a load number. No model, no ML — honest by being only math, but only as honest as the TSS feeding it (itself often estimated).
- **Baseline-relative classification (HRV4Training).** Learns your normal range over days-to-months, classifies adaptation vs accumulated fatigue by deviation from your history, refuses to read one marker alone, corroborates with subjective input and context.

**Where their verdicts stop being honest — two seams, both already guarded here:**
- **Default laundering.** The physiological models need values they didn't measure (VO2max, HRmax, activity class); an unmeasured input gets filled with a population/profile prior and flows into the verdict undeclared — a modeled assumption wearing the clothes of a measurement. This is exactly the silent-fabrication class **D-237** guards: a hardcoded default reaching a user-facing verdict. Our answer: **provenance survives into the output** (the `basis` field inherits the weakest provenance of the load-bearing inputs, D-231), and we **abstain, never fill** — a missing required input sends the verdict `cold`/observational (§6), it does not borrow a population prior and present it as yours.
- **Confidence stripping.** The uncertainty is computed and then discarded before display. Garmin at least ships "No Status" until it has ~2 weeks of data (honest abstention); Whoop's own docs frame Recovery as directional-not-diagnostic, yet the surfaced number carries no confidence, no trace. Our answer: **confidence is atomic with the number** — `magnitude` never travels without `confidence` + `basis` (§11.1). And **two witnesses, not one black-box marker** (§4) — the corroboration the fatigue science says actually discriminates.

**The one-liner:** their verdicts lie by erasing provenance and confidence before the number is shown; ours stays honest by making both travel as data all the way to the seam — and abstaining instead of fabricating when the input isn't there. Everything needed to enforce that already exists as D-231, D-237, D-242, and the silent-fabrication audit; the incumbents are the cautionary tale of shipping without them.

---

## Changelog
- **2026-07-05** — Doc created. Model scoped from the carried-in-fatigue arc: object (§2), confidence ladder (§3), two-witness gate (§4), fitness protection (§5), cold-start honesty (§6). Six open forks filed (§8) pending Michael's ruling. Landscape (Whoop/Garmin/TrainingPeaks/HRV4Training) + fatigue-monitoring science recorded as justification.
- **2026-07-05** — §11 render contract added (struct shape + render prompt + checker), turning the seam from conversation into buildable spec: `TrainingReaction` with governed presentation fields (`register`/`lead`/`must_name`/`may_not_say`), the render prompt, and the 6-check contract generalizing `execution-honesty.ts` (C6 = the Q-129 ordering fix). §3 ladder split into two no-antecedent rows (silent vs observational-concern) to resolve the silence-vs-warn contradiction. Forks §8.7 (positive/symmetric reactions) and §8.8 (pattern/trajectory layer) added; §5 scoped to the efficiency read (load still counts). Competitor methodology + honesty rules folded in as Appendix A, labeled justification / verify-before-citing. §6 gained the cold-start scope note (the apparatus buys "abstain honestly" at N=0; build the core, defer the ladder's payoff). §10 maps §11 to `execution-honesty.ts` and `SPEC-universal-narrative-inference.md`.
- **2026-07-05** — §1 science claims independently verified (not trusted): the ≥85% PPV/NPV figure traces to Nuuttila et al. 2024 (*Eur J Sport Sci*, recreational runners) — corrected to per-marker (each of nocturnal HR and readiness/soreness independently, not the combination) and cited; Garmin "No Status" ~1–2-week baseline requirement confirmed and cited. Sources block added to §1.
- **2026-07-05** — §12 continuity invariant added ("one government, states as arms"): the spine is the single authority; every surface is an arm that reads the one `training_reaction` fact and renders only at the confidence it carries. `training_reaction` ships spine-first (born on the spine, not in the analyzer/coach) so it does not add to the existing continuity debt (coach-partial-on-spine, forked capacity — Q-106/107/108).

# ROADMAP — Hybrid Strength Add-ons + the Get Stronger mileage amendment

Status: **consolidation doc, 2026-07-01.** Pulls together the add-on work (Hyrox / glute / pull-up) + the mileage-language amendment scattered across a working session, makes the settled calls, and flags what's decided vs. what still needs building. Not a build order for one session — a map of the whole surface. Cross-refs the two science docs written alongside it (`SCIENCE-hyrox-accessory-bias.md`, glute doc TBD) and the two Q-entries filed this pass (Q-101, Q-102).

---

## 1. The persona (settled)

The **endurance athlete who also wants to be strong.** Marathons / maybe tri / a real 60-mi week is the *identity*; strength is a genuine want, not an afterthought, and not taking over. Wants pull-ups; maybe cares about glutes / being well-rounded.

**This is NOT a new product.** It's **Get Stronger's chassis run with endurance held *real* instead of parked** — a posture setting (`strength: develop` + a truer `run: maintain` that respects the athlete's actual mileage), plus optional add-ons. Same ATR arc, same AMRAP retest, same composer. The only base-plan change is the mileage amendment (§3).

**Honest scope guard:** this is not a maximal dual-development "beast" that peaks both engines and eats maximal interference. Neither engine is maxed. Strength develops; endurance is held (broadly capable, all-easy). That's *why* it's buildable and honest — see §3.

---

## 2. The three add-ons — status + calls

All three attach to the Get Stronger chassis. Two share one mechanism; one is its own lane.

### 2a. Glute — optional toggle · accessory-bias engine · SMALLEST build · the dogfood
- **What:** an optional posterior-chain accessory slot (hip thrust, weighted walking lunge, back extension). Aesthetic goal stays **unspoken**; every session carries **endurance-benefit microcopy** so it reads as a legitimate performance choice, not a physique bolt-on.
  - Runner copy: *"Direct hip-extension work — stronger glutes drive propulsion and protect the knee over long mileage."*
  - Cyclist copy: *"Cyclists under-recruit the glutes in the saddle; direct work restores the hip-extension power the pedal stroke leaves on the table."*
- **Science (verified):** hip thrust ~75% more glute EMG than squat [Contreras 2015, *J Appl Biomech*]; the newer, better evidence [Plotkin/Contreras 2023, *Front Physiol* 14:1279170, MRI, volume-equated] found hip thrust and squat give **similar** glute hypertrophy — the hip thrust's real edge is being **glute-*specific*** (grows the glute without piling on quad). Honest pitch: *targets the glute specifically, on top of what the squat gives* — which is exactly what an endurance athlete wants (power without unnecessary mass).
- **Call:** BUILD FIRST. It's the reference accessory-bias implementation. Michael dogfoods it.

### 2b. Hyrox — optional toggle · SAME accessory-bias engine as glute · MEDIUM (station-visit surface is net-new)
- **What:** the same posterior-chain bias, tuned to the event — durability reps + the actual station patterns (sled push/pull, sandbag lunge, farmers carry), **framed as "handle the competition loads under fatigue,"** NOT a faster finish. Plus a **station-visit suggestion** (~1–2×/month at a Hyrox-equipped facility to rehearse the movements a normal gym can't).
- **Key architectural point:** **glute and Hyrox are two doses of ONE mechanism**, not siblings. Both bias the posterior chain via the same slots; they differ only in rep scheme + framing. Glute = hypertrophy dose + aesthetic-quiet/endurance copy. Hyrox = durability dose + station patterns + visit suggestion. So Hyrox is **glute-inclusive by construction** — no separate glute toggle stacks on top.
- **Science (verified, full doc `SCIENCE-hyrox-accessory-bias.md`):** Hyrox is **endurance-dominated** — ~60% running, VO₂max/endurance-volume/body-fat the only performance correlates; grip and resistance-training volume do NOT correlate [Brandt 2025, *Front Physiol* 16:1519240]. Strength is a **floor, not the limiter** [Davids 2025, *Strength Cond J*, DOI 10.1519/SSC.0000000000000913]. This is why it's an accessory bias, not a strength-volume bump.
- **Call:** BUILD SECOND, reusing the glute machinery + adding the station-visit surface. **Build/deploy status CONFIRMED NOT BUILT (2026-07-01):** verified against git + deployed edge functions — no code, nothing deployed; the only artifact is the verified research memo (now written up as `SCIENCE-hyrox-accessory-bias.md`, doc only). Do NOT mark shipped.

### 2c. Pull-ups — optional · SEPARATE mechanism (skill lane) · LARGEST build · PHASE 2
- **What:** a **skill-progression lane**, not accessory bias — rep-based progression (dead hang → scapular → negatives → assisted → full → weighted / high-rep) with its **own benchmark retest** (max clean reps), separate from the %1RM AMRAP.
- **Science (verified):** the "own focus, high frequency" instinct is right — ~3×/week beats 1×, **volume over max reps**, trained as a skill; and it's **cheap on the body for endurance athletes** — upper-body work doesn't interfere with running [Wilson 2012, *JSCR* 26(8):2293–2307]. A genuine relative-strength fitness measure.
- **Why separate + deferred:** it doesn't fold into the %1RM accessory-bias engine (different progression, different retest), it's the biggest build, AND it's blocked on the loading-model decision in **Q-102** (bodyweight lift → add reps → then add weight, per the config's own `ratio:0.0` intent — NOT %1RM off a bench max). The name-match fix and the rep-based fix point at **different target numbers**, so the model gets settled *with* the lane, not before.
- **Trap to avoid:** don't let the cheap version (just add pulling volume to the upper days — nearly free, low-value) masquerade as the real one (a tracked progression toward a pull-up goal). The base already has Pull Up in Upper B.
- **Open call (D-221 promise+test):** should the lane's retest (max clean reps) sit alongside the AMRAP retest as a **second enforcing test** — the block promising *both* a measured 1RM gain *and* a pull-up benchmark improvement? Sketch when the lane is spec'd.

**Unified-engine call to lock:** glute + Hyrox share one bias mechanism (a preset enum, e.g. `glute | hyrox`); pull-ups are a separate lane regardless. (Michael leaning yes — confirm.)

---

## 3. The mileage amendment (NEW decision — needs building)

**The change to Get Stronger as it stands:** kill the hard mileage cap, replace with honest language + the easy-intensity guardrail. Science-aligned; more honest than the current clamp.

### What changes
- **Kill the hard 18-mi / 180-min ceiling (D-222).** It was a flagged-**CONVENTION** number, not a cited constant. The interference literature puts **no hard wall** there — cost scales with total *work*, and the effect is smaller than the field long assumed.
- **Replace with microcopy, no clamp:**
  - *Already live the mileage:* we won't stop you or make you cut back.
  - *The honest tradeoff:* the more you run, the more your strength gain narrows toward the lower end of the range — you'll still get stronger, just modestly.
  - *Low-mileage weeks are NOT penalized* — and there's a mechanism: less endurance work = more recovery for the lifting = gain lands nearer the top of the range. A down week can *help* the block. It's a strength plan.
  - *The gate (language, not a lock):* "This is a strength plan — you won't want to marathon-*train* on it." High endurance dose + hard quality is the one scenario where interference bites.
- **KEEP the easy-intensity intent.** Loosen *volume*, hold *intensity*. A 60-mi all-easy zone-2 week interferes far less than a 30-mi week with two hard interval sessions. This guardrail stays — it's the one the science most consistently supports.

### The science (verified against primaries this pass)
- **CITED — Schumann et al. (2022)** "Compatibility of Concurrent Aerobic and Strength Training for Skeletal Muscle Size and Function: An Updated Systematic Review and Meta-Analysis." *Sports Med* **52(3):601–612.** doi:10.1007/s40279-021-01587-7. — 43 studies. Maximal strength SMD **−0.06 (p=0.446, not compromised)**; explosive/power **−0.28 (p=0.007, ~28% attenuated, worse same-session)**; hypertrophy **−0.01 (p=0.919, not compromised)**; **independent of aerobic type (run vs. cycle), concurrent frequency (>5 vs <5/wk), training status, and age.** → grounds "you'll still get stronger" + "the cost lands on power, not max strength."
- **CITED — Fyfe et al. (2016)** "Endurance Training Intensity Does Not Mediate Interference to Maximal Lower-Body Strength Gain during Short-Term Concurrent Training." *Front Physiol* 7:487. doi:10.3389/fphys.2016.00487. — 23 recreationally-active males; work-matched HIT vs MICT + RT-alone, 8 wk: all groups gained leg-press 1RM strongly; concurrent groups' gains were **~7–8% smaller** than RT-alone; **endurance *intensity* did not differentially mediate** interference (total *work* is the lever, per Wilson 2012 / Jones 2013). → grounds "gain trends modest at higher volume" + "easy volume costs less than hard sessions."
- **CITED — Wilson et al. (2012)** *JSCR* 26(8):2293–2307. — interference is dose-dependent on endurance frequency + duration; **running interferes more than cycling.** (Same citation as the retired D-222 ceiling — repurposed here as the "hold it easy / high dose bites" guardrail rather than a hard cap.)
- **CONVENTION — the specific replacement ceiling language + any soft number** sit on top of the cited findings; the studies establish *that* the cost scales with work and lands on power, not the exact mileage line. Calibrated by honest self-report, not a clamp.

*This amendment is the one real base-plan change in the whole roadmap. Everything else is add-on.*

---

## 4. Filed this pass (Q-entries — documentation, not blockers)

Both traced by Claude Code; both cross protocols + involve a design decision → **file, don't patch.** Neither blocks the add-ons or the mileage amendment.

- **Q-101 — strength session duration is a flat `60` constant** (`strength-primary-plan.ts:341`; sibling literals :237=60 baseline, :203=45 retest). Honest computation is blocked on a **missing rest-per-set field + warm-up model + a cross-protocol convention call** (the working-set type has no `rest_seconds`/warm-up structure; grep = zero hits; other strength protocols carry their own flat durations). **Not a mod blocker:** because the label never moves, adding an accessory won't change it — and the real session is ~35–45 min at 2–3 min rest (math), so an accessory lands ~50 min, still honestly under the flat 60. Cosmetic-safe. Cheapest interim (if ever wanted): vary the :341 literal by phase from sets/reps with assumed rest constants — still an estimate, scope deliberately.
- **Q-102 — Pull Up loads at 1.0×bench (=115 at 72%) via a space-vs-hyphen name miss.** Two-bug interaction, same root: `getExerciseConfig("Pull Up")` misses the `'pull-up'` bodyweight config (space vs hyphen), falls to the legacy pull/row/chin→bench map (defensible), then `getAccessoryRatio('pull up')` misses again and returns **1.0 instead of the intended 0.65 discount**. Tell that it's a defect: Barbell Row discounts correctly to 0.80 in the same session because its name exact-matches. **Blast radius = two protocols** (Program 1 `:164` + concurrent 5×5 `(b)-run` overlay `strength-focus-split.ts:84`). **The deeper question — should a bodyweight lift be %1RM-loaded at all** (config's own intent is `displayFormat:'bodyweight', ratio:0.0`, i.e. rep-based) — **settles WITH the pull-up lane (§2c), because the name-match fix and the rep-based fix target different numbers.** Fix the model first, then the name-match. Ties to Q-098 (no-bodyweight-lane) + Q-100 (pull-up add-on).

---

## 5. Pre-reqs + sequencing

**Pre-reqs:**
1. **Q-097 dogfood (Michael):** log one Baseline Test / back-doored Retest AMRAP with **real squat/OHP** (fixes the backwards 110/110 plan — squat currently prescribed lighter than bench) → confirm `performance_numbers` updates. Turns "wired" into "proven." Runs against deployed code (no traces touched it). **STILL OWED.**
2. **Claude Code:** draft Q-101 + Q-102 into `OPEN-QUESTIONS.md` (documentation only). **DONE 2026-07-01** (commit `cbc70da9`).
3. **Claude Code:** confirm Hyrox mod actual build + deploy status (verify, don't assume). **DONE 2026-07-01 — confirmed NOT built** (no code, nothing deployed; research memo only, now written to `SCIENCE-hyrox-accessory-bias.md`).

**Sequencing:**
- **Now:** the mileage-amendment build (server-side cap kill deployed; client copy committed-not-shipped, bundled with pieces 2-3) + the Hyrox science doc (documentation only).
- **Next:** the **glute toggle** (reference accessory-bias build; Michael dogfoods).
- **Then:** **Hyrox** reuses the glute machinery + adds the station-visit surface.
- **Phase 2:** the **pull-up skill lane** — own spec; settles the Q-102 loading model + the second promise-test question.

---

## 6. Open calls (for Michael)

1. **Mileage microcopy strings** — exact copy for the ceiling-language, the low-mileage no-penalty note, and the marathon-gate (drafting next, science above is verified).
2. **Unified bias engine** — confirm glute + Hyrox share one preset enum (`glute | hyrox`), pull-ups separate.
3. **Station-visit surface** — real content now (a "practice these at a Hyrox facility" card, facility-finder later) or park to v2 and ship the accessory bias alone first?
4. **Second promise-test** — does the pull-up lane's benchmark retest join the AMRAP as a co-equal enforcing test (D-221)?

*Cross-ref: `SCIENCE-hyrox-accessory-bias.md`, `SCIENCE-strength-primary-loading.md`, `SCIENCE-upper-aesthetics-hypertrophy.md` (pull/upper — separate grounds), `STRENGTH-PROTOCOL.md` (glute/posterior citations to extract), D-221 (promise+test rule, engine), D-222 (the retired hard ceiling this amends), D-213 (extend-never-fork), Q-097/098/100/101/102.*

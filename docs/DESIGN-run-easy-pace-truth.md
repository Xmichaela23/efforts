# DESIGN — Run easy pace: FEED THE ENGINE THAT ALREADY EXISTS

**Status:** SPEC (2026-07-12), **REWRITTEN after a false start — read §0.1 first.** Cross-ref **Q-169**.
**Law:** Constitution Law 1 (one source per claim), Law 2 (estimates declare themselves), Law 6 (behavior-unchanged proof).

---

## 0.1 ⛔ READ THIS BEFORE ANYTHING ELSE — THE ENGINE IS ALREADY BUILT

**`resolveRunEasyPace()` ALREADY EXISTS** — `generate-combined-plan/science.ts:110`. D-033. Its own spec: `docs/PHASE-1-RUN-PACE-SPEC.md`. **9 pin tests** (`run-pace-feedback.test.ts`).

It reconciles the athlete's BASELINE easy pace against their OBSERVED weekly paces and returns `baseline` / `reconciled_worse` / `reconciled_better` / `observed_no_baseline` / `baseline_acwr_gated`. It is **well-built**: a 2-week streak gate AND a 4-week median gate must BOTH cross before a plan is displaced, plus an **ACWR gate** so an elevated-workload slowdown is attributed to *fatigue*, not *fitness decline*.

**It is exactly the "notice the athlete has detrained" machine. It has never run. Both of its inputs are null.**

**The first draft of this spec proposed building a resolver from scratch — including a function with the SAME NAME — before finding the shipped one.** That draft is dead. `_shared/run-pace.ts` was written and deleted. **The job is to FEED this engine, not to replace it.** Do not add a sixth pace-resolution chain.

---

## 0. The one-paragraph version

A **working, spec'd, fixtured** pace-reconciliation engine (D-033) sits in the codebase and has **never once executed**, because both of its inputs are null: the learner that should supply its *baseline* (`learned_fitness.run_easy_pace_sec_per_km`) is **structurally incapable of firing** (its HR gate excludes **77 of 77** of the athlete's runs), and the snapshot field that should supply its *observed* side (`athlete_snapshot.run_easy_pace_at_hr`) is **null on every week**. Separately — and this is a real but *different* problem — four stored "easy pace" values disagree, and the one the UI shows the user ("Easy pace (manual)") is last in every chain and never wins. So the app prescribes against a stale number, cannot notice the athlete has detrained, and grades Performance/State against a person who no longer exists.

**The bike does this correctly. The run does not. Same learner, same file.** FTP, swim pace, run *threshold* pace and max HR all learn fine. **Run-easy is the only starved fact.**

---

## 1. Evidence (real data, user 45d122e7, 2026-07-12)

### 1a. The learner works everywhere except run-easy

| fact | learned? | evidence (verbatim from `learned_fitness`) |
|---|---|---|
| Bike FTP | ✅ | `176 W` — "95% of 20-min best power (13 efforts)", confidence **high** |
| Bike easy HR | ✅ | `130 bpm` — "median of 6 easy rides (**65-75% max**, power-filtered)", **high** |
| Bike max HR | ✅ | `175` — "max observed across all rides", **high** |
| Swim pace | ✅ | `129 s/100m` — 13 sessions, **high** |
| Run threshold pace | ✅ | `376 s/km` (10:05/mi) — "pace at threshold HR (3 runs)", **high** |
| Run threshold HR | ✅ | `151 bpm` — "median of 2 threshold efforts", medium |
| **Run easy pace** | ❌ | **`null`** |
| **Run easy HR** | ❌ | `122 bpm` — "**70% of observed max (estimated)**", **sample_count: 0**, confidence low |

`learning_status` reads **"confident"** with 42 workouts analyzed, while the two run-easy facts are null and fabricated. The status is lying.

### 1b. Why the run learner can never fire

`learn-fitness-profile/index.ts:699-712` — the easy-pace filter:

```ts
const easyPaceRuns = runs.filter(r => {
  const duration = r.moving_time || r.duration || 0;   // minutes
  const hr = r.avg_heart_rate || 0;
  const pace = r.avg_pace || 0;                        // sec/km
  return duration >= 20 && pace > 150 && pace < 900
      && hr <= observedMaxHR * 0.75;                   // ← THE GATE
});
if (easyPaceRuns.length >= 3) { /* learn */ }
```

Observed run max HR = **174** → the gate is **HR ≤ 130.5 bpm**.
The athlete's genuine easy runs (RPE 2-3) sit at **133-141 bpm** = **76-81% of max**.

**Measured: 0 of 77 runs pass. 16 fail on the HR line alone.** It needs 3. It will never get 3. Not "hasn't yet" — *cannot*.

### 1c. Why the bike passes and the run fails — the physiology

The bike easy-HR learner uses a **65-75% band** and finds 6 rides (bike easy HR = 130 = 74% of bike max 175).
The run easy-HR sits at ~135 = **78%** of run max 174.

**Running HR runs 5-10 bpm higher than cycling at the same perceived effort** (upright posture, greater active muscle mass, weight-bearing). A %max band calibrated on cycling **works for the bike and locks the run out.** The gate isn't wrong in the abstract — it's wrong *for running*.

### 1d. Four easy paces, one athlete

| source | value | who reads it |
|---|---|---|
| `performance_numbers.easyPace` ("Easy pace (**manual**)" — the field the UI shows the user) | **11:30/mi** | LAST in the chain. Loses. |
| `effort_paces.base` (set once via Plan Wizard) | **11:08/mi** | **WINS** — this is the 10:44-11:10 range on the planned session |
| `FALLBACK_EASY_MIN_PER_MILE` (`strength-primary-plan.ts`) | **10:00/mi** | drives run-duration math when `paceKnown` is false |
| `token-parser.ts` `|| 540` | **9:00/mi** | a bare literal, no disclosure |
| `learned_fitness.run_easy_pace_sec_per_km` | **null** | the only one that could be *true* |
| **what the athlete actually runs** | **12:11/mi** | nothing reads it |

**None of the four is what he runs.** He is 3 months post-marathon and detrained: 11:30 was true in April. The app has no mechanism to notice.

---

## 2. What the field does (researched 2026-07-12, adversarially verified)

Grounding, per [[feedback_apps_science_default]]. Full citations in §9.

1. **No shipped app uses an HR *ceiling* to qualify an easy run.** COROS — the only vendor that publishes its qualification gates — uses an intensity **FLOOR** (HR ≥ 65% HRR + resting, ≥25 continuous min, steady, re-qualify every 90d). The run must be *hard enough* to count. **Efforts has the gate backwards.**
2. **Where schemes express aerobic in %max, the ceiling is 80%, not 75%.** MyProCoach aerobic band tops at 80%; Garmin's default %max scheme tops its aerobic band at 80%. The athlete's 76-81% is *inside* the aerobic band of every shipped scheme.
3. **Serious endurance anchors to LTHR, not max HR.** Friel, verbatim: *"Do not use 220 minus your age to find max heart rate as this is as likely to be wrong as right."* Friel RUN zones are bands of LTHR: Z1 <85% LTHR, **Z2 85-89% LTHR**. Efforts already computes LTHR (151) and the Baselines screen already renders **"Friel %LTHR"** — the learner just doesn't use it.
4. **Nobody refuses to show a value.** Garmin seeds an age-derived default and **overwrites it with real data**. Strava ships 220−age forever and concedes it "may not work for you." RUNALYZE shows the number and lets you exclude bad activities. Refusing-then-secretly-fabricating (what Efforts does) is the one option nobody ships.
5. **The starved-learner failure mode is a documented, shipping bug.** COROS explicitly warns that a wrong Max HR makes the gate unreachable so the metrics never arrive — and instructs a manual fix. Efforts has the same bug **with no escape hatch**.

---

## 3. The contract — FEED, don't rebuild

### 3a. ⛔ DO NOT BUILD A RESOLVER. IT EXISTS (§0.1).

`resolveRunEasyPace()` is shipped at `generate-combined-plan/science.ts:110` with 9 pin tests. **The work is to supply its two null inputs.** The section below is retained ONLY as the record of the false start — it describes a `_shared/run-pace.ts` that was written and **deleted**. Do not resurrect it.

**THE ACTUAL WORK, in order:**
1. **Feed the BASELINE side** — fix the easy-run qualification gate (§3b) so `learned_fitness.run_easy_pace_sec_per_km` populates.
2. **Feed the OBSERVED side** — find why `athlete_snapshot.run_easy_pace_at_hr` is null on every week and populate it (this is a *plumbing* job — trace to the write site in `compute-snapshot`; note D-239 retired the downstream *trend* precisely because this was null, but never fixed the null itself).
3. **Then D-033 does the rest** — its streak/median/ACWR gates are already built and tested.
4. **Separately**, resolve the four-competing-values fracture (§1d, §4). This is a *different* problem from the starvation and must not be conflated with it again.

<details>
<summary>THE FALSE START (retained as the record — DO NOT IMPLEMENT)</summary>

New: `supabase/functions/_shared/run-pace.ts`. The exact twin of `resolveCurrentFtp()`.

```ts
export type PaceSource =
  | 'learned'      // learned_fitness.run_easy_pace_sec_per_km — measured from real runs
  | 'manual'       // performance_numbers.easyPace — the athlete told us
  | 'effort_paces' // effort_paces.base — Plan Wizard derivation
  | 'derived'      // computed from threshold/5K — an inference
  | 'none';        // we do not know. Say so.

export interface RunEasyPace {
  sec_per_mi: number | null;
  source: PaceSource;
  confidence: 'high' | 'medium' | 'low' | null;
  as_of: string | null;      // when this value became true
  is_estimate: boolean;      // Law 2: an estimate MUST declare itself
  sample_count: number | null;
}

export function resolveRunEasyPace(b: Baselines): RunEasyPace;
```

**Precedence (learned-first — the Garmin model, and the `resolveCurrentFtp` model):**
1. `learned` when confidence is `high|medium` → `is_estimate: false`
2. `manual` (`performance_numbers.easyPace`) → `is_estimate: false` (the athlete asserted it), but carries `as_of` so staleness is visible
3. `effort_paces.base` → `is_estimate: true`, source `effort_paces`
4. `derived` from threshold pace → `is_estimate: true`
5. `none` → `sec_per_mi: null`. **Consumers that need a number to render must disclose, not invent.**

**INVARIANT — no bare fallback literals.** `|| 540`, `?? 600`, `FALLBACK_EASY_MIN_PER_MILE` all die. A number without provenance is a Law 2 violation; it is exactly how a fabricated 10:00/mi reached a user-facing verdict ("short finish relative to the planned ~90 min").

</details>

**(The invariant above survives the false start — it belongs to the §4 fracture work, wherever that lands. The fabricated literals are real and they reached a user-facing verdict.)**

### 3b. The learner gate — anchor on LTHR, and make it a floor+ceiling BAND

`learn-fitness-profile/index.ts`, run easy-pace + easy-HR filters:

- **Primary anchor (when LTHR is known):** Friel run Z1/Z2 → **easy = HR ≤ 89% of LTHR**, with a **floor** (HR ≥ 70% LTHR) to exclude walks/stops. For this athlete: LTHR 151 → easy band **106-134 bpm**.
- **Fallback (no LTHR):** %max band **65-80%** (matching the bike's band shape and the field's 80% aerobic ceiling), NOT a 75% ceiling.
- Keep the existing duration (≥20 min) and pace-sanity (150-900 s/km) gates.
- Keep `>= 3` runs to learn; confidence `high` at ≥5 (unchanged).
- **`run_easy_hr` must stop fabricating.** Today: `122, "70% of observed max (estimated)", sample_count: 0`. If it is not measured, it is `null` with `needs_data` — never a confident-looking number with zero samples (Law 2).

⚠ **Honest limit:** with an LTHR-89% band the athlete's 133-136 bpm runs qualify and his **141 bpm runs correctly do not** (they are genuinely Z3). This is the intended outcome — the learner should be selective, just not *empty*.

### 3c. Manual is a SEED, not a shrine

Garmin's model: seed, then overwrite with reality. So:
- `performance_numbers.easyPace` gains an `as_of` when written.
- When `learned` and `manual` diverge by more than a threshold, the app **says so** — that is an insight, not an error: *"Your easy pace has drifted 11:30 → 12:10 over 3 months."*
- Baselines UI shows **both**, with an **adopt** affordance — the same shape as the existing `ride_ftp_estimated` adopt flow.

---

## 4. THE BLAST RADIUS — every consumer (traced 2026-07-12)

The point of this section: **the next session must not have to re-derive this list.**

### WRITERS
| # | file:line | what it writes |
|---|---|---|
| W1 | `learn-fitness-profile/index.ts:699-720` | `learned_fitness.run_easy_pace_sec_per_km`, `run_easy_hr` — **the gate that never fires** |
| W2 | `src/components/PlanWizard.tsx:1281-1356` | `effort_paces` (via `calculatePacesFromKnownPace`) — **the value that currently wins** |
| W3 | `src/components/GoalsScreen.tsx:1140` | `effort_paces` + `effort_paces_source: 'calculated'` |
| W4 | `adapt-plan/index.ts:1223, :955` | **overwrites** `performance_numbers.easyPace` (the `end_easy_pace` suggestion) |
| W5 | Training Baselines UI | `performance_numbers.easyPace` — the field labelled "Easy pace (manual)" |

### READERS — must route through `resolveRunEasyPace()`
| # | file:line | current behavior | after |
|---|---|---|---|
| R1 | `materialize-plan/index.ts:486-553` `secPerMiFromBaseline('easy')` | 3-tier chain: snapshot pin → `effort_paces.base` → `performance_numbers.easyPace`. **Manual loses.** | resolver; snapshot pin still wins **for a plan's lifetime** (the pin is correct — see §6) |
| R2 | `_shared/token-parser.ts:88, :101, :186, :194` | `baselines.easyPace \|\| 540` | resolver; **no `540` literal** |
| R3 | `shared/strength-system/strength-primary-plan.ts:413, :427` | `FALLBACK_EASY_MIN_PER_MILE` (10:00/mi) + the `volume_notes` copy | resolver; the copy must stop promising a re-map that the plan pin makes impossible (§6) |
| R4 | `generate-strength-plan/index.ts:44-60` | the Q-105 ad-hoc resolver (learned → `performance_numbers`) | **delete** — it is a local copy of the resolver |
| R5 | `analyze-running-workout/index.ts:305-339, :453` | `effort_paces` → `performance_numbers` → learned; **`easyPace: 540` hard fallback** | resolver. **This is the one that grades the workout card** — a fabricated anchor here is what produced "short finish relative to the planned ~90 min" |
| R6 | `_shared/athlete-snapshot.ts:258, :404` | `readLearnedSecPerKm(run_easy_pace_sec_per_km)` → `easy_pace_sec_per_mi` (snapshot pin) | resolver (keep the pin semantics) |
| R7 | `_shared/arc-context.ts:530, :544` | exposes learned easy pace to the Arc/LLM | resolver + carry `source`/`confidence` so the LLM cannot assert above it (Law 3) |
| R8 | `_shared/block-adaptation/index.ts:510-519` | learned vs manual → `run_easy_pace` suggestion | resolver (this is already the divergence idea, half-built) |
| R9 | `adapt-plan/index.ts:349-378, :944` | `end_easy_pace` suggestion | resolver |
| R10 | `_shared/end-plan-core.ts:72` | `effort_paces.base ?? 600` | resolver; **no `600` literal** |
| R11 | `_shared/planning-context.ts:380` | `effort_paces.base ?? …` | resolver |
| R12 | `coach/index.ts:1808, :2969, :4429` | passes `effort_paces` to the Arc/LLM | resolver |
| R13 | `_shared/arc-setup-prompt.ts:491, :497` | "Run covered → `easyPace` set **or** learned" | resolver (`source !== 'none'`) |
| R14 | `course-detail/index.ts:274` | `pn.easy_pace ?? pn.easyPace ?? …` | resolver |
| R15 | `src/components/AllPlansInterface.tsx:664, :791` | `{easy_pace}` token substitution from `pn.easyPace` | server-supplied resolved pace (client must not re-derive — Law 4) |
| R16 | `src/components/ArcSetupWizard.tsx:1693` | `readLearnedPace('run_easy_pace_sec_per_km')` | resolver output via payload |
| R17 | Training Baselines UI | shows "Easy pace (manual)" **only** | show **learned + manual + source + as_of**, with adopt (the `ride_ftp_estimated` pattern) |
| R18 | `src/components/context/BlockSummaryTab.tsx:877` | renders the `run_easy_pace` suggestion | unchanged (renders, does not decide) |

### KNOWN-STALE / ALREADY-RETIRED (do not wire anything new to these)
- `_shared/longitudinal-signals.ts:48, :141` — `run_easy_pace_at_hr_trend` **RETIRED (D-239)**, "fed by the null pace_at_easy_HR".
- `_shared/fact-packet/ai-summary.ts:1144` — D-060 column rename; historical only.

---

## 5. Sequencing (this is the containment — do NOT reorder)

**Phase 1 — the resolver, behavior-UNCHANGED.** Build `resolveRunEasyPace()` so that it returns, for every existing athlete, *exactly what the current chain returns today*. Route R1-R16 through it. Ship behind a **golden fixture proving the output did not move** (Constitution Law 6). Zero user-visible change. This is pure containment.

**Phase 2 — flip the learner (§3b).** Now the behavior moves in **one** place instead of rippling through sixteen. The learner starts producing `run_easy_pace_sec_per_km`, precedence puts `learned` first, and every consumer inherits the new truth through the resolver. Fixture the gate against real-shaped data (0-of-77 → N-of-77).

**Phase 3 — the honesty surfaces.** Kill the `volume_notes` re-map lie (§6). Add the adopt affordance + the drift insight ("your easy pace has drifted 11:30 → 12:10").

**Rationale:** Phase 2's blast radius is 16 consumers *only if Phase 1 hasn't happened*. After Phase 1 it is one function. **Resolver first inverts the risk.** (This is the lesson of D-281: a verdict change with a wide surface and no behavior-unchanged proof shipped a false alarm to a live user.)

---

## 6. The plan pin, and the lie built on top of it

Plan targets are **pinned at build time** by design (START-HERE: *"pinned at build time so targets stay stable across the plan's life"*). That is correct and is **not** changed here.

But `strength-primary-plan.ts:427` ships this copy:
> *"Run durations estimated at 10:00/mi until we learn your easy pace — **they re-map once you log a few easy runs**."*

**Nothing re-maps. The pin forbids it.** The sentence promises behavior the architecture deliberately does not have. It is a Law 2 violation (a fabricated basis presented as a real one) *and* a false promise. It dies in Phase 3.

What *can* honestly happen: the **next** plan is built on the learned pace, and the app **tells** the athlete their pace has drifted so they can rebuild. That is the honest version of "re-map."

---

## 7. Fixtures (Law 6)

- **Phase 1 golden:** for a matrix of synthetic baseline shapes (learned-only / manual-only / effort_paces-only / all three / none), `resolveRunEasyPace()` returns byte-identical values to the current chain in `materialize-plan`, `token-parser`, `strength-primary-plan`, `analyze-running-workout`. **Any diff is a bug in Phase 1.**
- **Phase 2 learner:** synthetic athletes across HR profiles — including the **real failure shape** (easy HR at 78% of max, LTHR known) which must go from **0 qualifying runs → ≥3**. And the NEG: a genuinely hard run (Z3, 141 bpm at LTHR 151 = 93%) must **still be excluded**.
- **NEG (do not regress the bike):** bike FTP / bike easy HR / swim pace learners are **untouched** and must stay byte-identical. They work. `resolveCurrentFtp` is not modified.
- **Athlete-agnostic:** synthetic athletes across compositions, never tuned to one week or one user ([[feedback_user_agnostic_design]]).

---

## 8. Open rulings needed from Michael

1. **The LTHR band numbers.** Spec proposes Friel run Z2 ceiling (≤89% LTHR) + a 70% LTHR floor. Friel's own Z1/Z2 split is <85% / 85-89%. Confirm the ceiling.
2. **Manual vs learned precedence.** Spec proposes **learned-first** (Garmin/`resolveCurrentFtp` model), with manual as a seed. The alternative is manual-wins-until-adopted. Learned-first is what the FTP path already does.
3. **The `effort_paces` layer.** Once the resolver exists, is `effort_paces.base` still a legitimate source, or is it a legacy duplicate of `easyPace` that should be retired (Q-108 retire-dead-layers class)? It is currently the value that *wins*, and the user does not know it exists.

---

## 9. Sources (research 2026-07-12, adversarially verified)

- Friel zones + "do not use 220−age": <https://www.trainingpeaks.com/learn/articles/joe-friel-s-quick-guide-to-setting-zones/>
- TrainingPeaks Zones Calculator (anchor families): <https://help.trainingpeaks.com/hc/en-us/articles/360017420092-Zones-Calculator-Overview>
- COROS qualification gates (intensity FLOOR, 25-min, 90-day re-qual; the starved-learner warning): <https://support.coros.com/hc/en-us>
- MyProCoach %max HR zones (aerobic ceiling 80%): <https://www.myprocoach.net/calculators/hr-zones/>
- Garmin HR-zone basis (%Max / %HRR / %LTHR selectable): <https://www8.garmin.com/manuals/webhelp/GUID-C001C335-A8EC-4A41-AB0E-BAC434259F92/EN-US/GUID-30C91919-943C-44E9-8048-901AC0881AEA.html>
- Strava HR zones (220−age, ships anyway): <https://support.strava.com/hc/en-us/articles/216917077-Heart-Rate-Zones>

---

## 10. Cross-refs

- **Precedent to copy:** `resolveCurrentFtp()` (`_shared/athlete-snapshot.ts:229-236`), coach v76 (the FTP collapse — *"bike FTP now agrees across coach/analyzer/compute-facts"*).
- **The cautionary tale:** D-281 (a wide verdict change, no behavior-unchanged proof, false alarm to a live user, reverted). **Phase 1 exists because of it.**
- Q-105 (the ad-hoc pace resolver in `generate-strength-plan` — subsumed by R4).
- D-222 (maintenance-mileage band — "pace-mapped via the learned easy pace… missing pace → estimate at a 10:00/mi fallback"). **This is the D-entry that depends on a learner that has never fired.**
- Law 1 / Law 2 / Law 6 (`CONSTITUTION.md`).

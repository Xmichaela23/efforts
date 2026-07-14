# Efforts — the work queue

**Rebuilt 2026-07-13.** Every one of the 92 open items on the old list was **verified against code** (3 parallel readers). ~10 were already done, 4 were moot, 11 were "verify X" questions that now have answers, and 9 need Michael. The rest are real, and they are ordered below by leverage — not by the order they were filed.

**The full 133KB history (202 completed items + the originals) is in [`archive/POLISH-PUNCH-LIST-archive-2026-07-13.md`](archive/POLISH-PUNCH-LIST-archive-2026-07-13.md).**

Read `START-HERE.md` and `LIFECYCLE.md` first. **`CAPABILITY-MAP.md` is the anti-rebuild index — check it before building anything on this list.**

---

# 0. THE HEADLINE — three finished engines have never run once

The 2026-07-13 audit found the same disease three times, and it is the highest-leverage thing on this page. **In each case the engine is fully built, pin-tested, and spec'd — and nothing calls it.** These are not features. They are **plumbing jobs**, and each is small.

**Each item below leads with WHAT IT DOES FOR AN ATHLETE**, because the previous docs said only where the code lived — which is why nobody, including the owner, could remember what these were for.

- [ ] **Consolidated strength mode.**
  **What it does:** lets the athlete say *"put my lifting on the SAME day as a hard leg session, so my other days stay free"* — instead of the default, where lower-body lifting and a hard leg run/ride can never share a day. It's the *"how should strength fit into my week?"* fork. Real training-philosophy choice: fewer, denser days vs more, lighter ones.
  **Status: BUILT, TESTED, NEVER EXECUTED ONCE.** The rule set ships (`_shared/week-optimizer.ts:412-417`, same-day QR+lower at `:1215-1291`), the fixtures pass (`week-optimizer.anchor-contract.test.ts:1057-1099`, `consolidated-trade-off.test.ts`), the spec exists (`docs/CONSOLIDATED-MODE.md`, decisions LOCKED), and the server threads the field (`_shared/combined-schedule-prefs.ts:303` → `reconcile-athlete-state-week-optimizer.ts:206`). **But no wizard ever writes `integration_mode`**, so `create-goal-and-materialize-plan/index.ts:1895` hardcodes `'separated'` for everyone. **The job: one wizard question + the payload leg.** Nothing else.
- [ ] **The day-count gate.**
  **What it does:** stops the wizard from silently accepting an **impossible week**. You say *"4 days, 10 hours, hard intent, lots of strength"* — it does the math against the required session count and the 24h spacing rules, and either warns you or refuses **and shows you the arithmetic**. Today the wizard just says yes and builds you something that can't fit.
  **Status: BUILT, 30+ TESTS, ZERO IMPORTERS.** `src/lib/day-count-gate.ts:237 computeDayCountGate` is complete (260 lines, spec at `docs/DAY-COUNT-GATES.md`) and **nothing in the app imports it.** `session-frequency-defaults.ts:305` already emits `gate_block: 'hours_too_high_for_days'` straight into it, and it never reaches a refusal path. **The job: mount it in the wizard + write the warn/block copy.** *(Collapses 5 old items into one.)*
  ⚠️ **DEPENDENCY: this ships AFTER consolidated mode.** The gate's matrix has "Consolidated" cells that key on `integration_mode` (`DAY-COUNT-GATES.md §0`). **Do them in that order.**
- [ ] **The segment engine.**
  **What it does:** *"am I getting faster on this stretch?"* It spots the chunks of road you actually run repeatedly — a **"core"** is a recurring stretch, not a whole route — and tracks whether you're improving on it. Your own personal segments. *(It deliberately supersedes the earlier per-**route** approach, which flip-flopped on real data — said "improving" one week and "declining" the next. See `DESIGN-segments.md §0`.)*
  **Status: BUILT, SPINE-WIRED, STARVED AT THE SOURCE.** `detect-cores` has **zero callers** — no cron, no button, no script. So `route_cores` is always empty, `match-cores` (`compute-facts:1827`) and `compute-core-verdict` (`compute-snapshot:873`) have nothing to match, and `build.ts:928 segment_verdicts` is always `[]`. **The whole feature produces nothing, on web and on iOS.** *(So the queued `npm run ios` rebuild would NOT have surfaced the segment card — fix the caller first.)* **The job: invoke stage 1.**

> **The pattern:** *it doesn't work* is not evidence that *it doesn't exist*. **Ask STARVED or ABSENT before you build.** See `START-HERE.md`.
>
> **And the lesson underneath it:** all three were documented by **where their code lives**, never by **what they do for an athlete**. That is how a solo founder loses track of his own shipped work. **Every capability row should say what it does, in a sentence a runner would understand.**

---

# 1. FRACTURES — split by whether they are LIVE or LATENT

> ## ⚠️ READ THIS BEFORE THE LIST — the 2026-07-13 device session corrected the code audit
>
> The audit was run entirely from code. **Then we opened the app**, and it changed the ordering materially. **Most of the "worst" fractures are LATENT for the only user who exists.** Michael has learned baselines, configured HR zones, and a pace-prescribed plan — which is exactly the configuration that dodges them.
>
> **They are still real. They fire the day a SECOND user exists** — specifically, a user who has **typed** a number, or who has **no** numbers at all. That is the entire population of the onboarding flow.
>
> **The lesson, and it cuts against the standing rule:** *"verify by code trace, not one device session"* is right about **existence** and wrong about **severity**. The trace found the defects. **Only the device session could tell us which ones were biting.** Do both. Neither alone is honest.

## LIVE — happening on the only real account, today

- [ ] **🔴 STRENGTH WEIGHTS HAVE TWO WRITERS, AND ONLY ONE ASKS.** `adapt-plan` action=auto silently re-prices the lifts on **every ingest** (`:1161/:1188` → `materialize-plan:1232`), **skipping the Arc fatigue/taper/adherence gate** the `suggest` path applies. Meanwhile the consent path (`StrengthAdjustmentModal`, mounted at `StateTab.tsx:1370`) asks permission for a thing already done. **This silently violates the standing rule that any change to prescribed load or RIR is sign-off-gated**, and it means §8's "GATED — changes prescription" Steps 4/5 describe a door **already ajar**. ✅ **Michael wants the athlete option (mirror the easy-pace chooser).** One writer; default = today's behaviour; visible; overridable. **This is the #1 live item.**
- [ ] **🔴 THE RPE TREND IS AN ORDERING ARTIFACT (Q-167).** `makeTrend` (`_shared/response-model/body-response.ts:369`) splits **this week's** sessions in half **by the order they happened**. Hard Monday + easy Friday reads *improving*; swap the days and the identical week reads *declining*. **It is the required strong-evidence leg for the safety floor** (`load-status-reconcile.ts:83-95`, D-266). Establish intent before touching (Q-121 precedent).
- [ ] **🔴 ONE ACWR BAND (Q-168).** The *ratio* is single-source and clean. The *band* is re-derived in **6 places**, one plan-blind and shipping in the same payload as the real one (`_shared/response-model/weekly.ts:313`). **A taper week at 1.15 reads `elevated` and `optimal` simultaneously.** Also: `load_status` is mutated a second time *after* the reconciler (`coach:3814`, coupled to LLM availability); the State headline has **no `productive` branch** (`load-headline.ts:63`) so a productive week silently drops the load slot.
- [ ] **🟡 A race in the fan-out silently drops facts.** `compute-facts` is awaited but reads `workouts.computed`, written by two fire-and-forget calls it does not wait for (`ingest-activity:1508/:1521`). When it loses: no time-in-zone, no interval hits, no HR drift, no execution score. **No error anywhere.**
- [ ] **🟡 Dead "Aerobic fitness" BODY row (Q-164).** `coach:2131` `cardiac_efficiency_current: null`, `sample_size: 0` → the render gate can never be true, so the row **can never appear**. Feed it or delete it.

## LATENT — dormant today, and they ALL fire on the first new user

**These are the onboarding blast radius. See §1b.**

- [ ] **🔴 THE ZONES — two bad tables, both currently dodged.** ⚠️ **CORRECTED 2026-07-13 after looking at the app.** The earlier claim ("the plan says run at 136, the analyzer grades you at 134, it's happening now") **was FALSE** and is retracted. Verified on the live account: the workout's stored bins are **Z2 128-135, Z3 135-143** (half-open), which **match Baselines exactly**. The analyzer's Priority 1 is `configured_hr_zones` — *deliberately*, with a comment saying so — and those zones are the Friel 0.89 canon. **The system is behaving correctly.**
  **But two divergent tables are real in code, and both are one condition away:**
  - `_shared/endurance/hr-zones.ts:18` — Z2 ceiling **0.90** (→136 @ LTHR 151) vs the canon's **0.89** (→134). Used by `generate-run-plan`. **Dormant only because the current plan prescribes PACE bands, not HR zones.**
  - `analyze-running-workout:1030-1033` — a **non-Friel** model (0.75/0.85/0.92/0.98) whose Z2 tops at **128** (the canon's *floor*) and whose **threshold zone caps at 148 — BELOW a real LTHR of 151.** **Fires only when `configured_hr_zones` is missing — i.e. a brand-new user.**
  - D-286 fixed **three** copies of the Friel seam. **There were five.** Its own header lists the three it knew about; these two are not among them.
- [ ] **🔴 ONE LTHR (Q-176).** Four chains, **no resolver**, two inverted. **Latent only because Michael's LTHR is `learned` and he has never typed one.** The inversion bites the moment an athlete **types** an LTHR: Baselines and the plan generator honour it; the coach, the easy-HR band, the run analyzer and `calculate-workload` **silently discard it**. It is the **root of the run stack**. Spec: `docs/SPEC-lthr-one-anchor.md`. ✅ **Ruled: default learned, athlete can override, override wins (mirrors Q-174).** Do `threshold_pace` in the same pass — **no resolver at all**, read raw in ~17 files across 3 units.
- [ ] **🟡 FTP bypasses the resolver in 8 places** — `get-week:436` (week-view watts), `normalizer.ts:308/898/935` (plan watts), `PlanSelect.tsx:587`, `course-strategy:521`, and `athlete-snapshot/identity.ts:67` → **the LLM prompt**, so the coach can *speak* a different FTP than the screens show. *(TRUTH-MAP says FTP is "CLOSED". It is not.)*
- [ ] **🟡 Two ingest paths never reach the spine.** `ingest-phone-workout` and `save-imported-workout` fire only `compute-workout-summary` → **no `workout_facts`**. Zero contribution to ACWR while still counting toward `workload_total` — **the same snapshot row contradicts itself.** *(Latent for Michael: he ingests via Strava/Garmin, which take the full path. Fires for anyone using phone-recording or FIT import.)*

---

# 1b. THE ONBOARDING GATE — the app must stop inventing BEFORE it invites anyone in

**Michael's intent (2026-07-13):** a new-user flow to enter easy pace, 5K pace, FTP, 100y/m swim pace, and 1RMs for the major compounds — **as frictionless as possible**, with the option to let the app learn from their own testing instead.

> ### ⛔ THE FRICTIONLESS PATH IS THE DANGEROUS PATH. This is the gate, and it is not optional.
>
> **Today, when a user gives the app nothing, the app does not refuse. It INVENTS, and says nothing.**
> - squat / bench / deadlift 1RM = **135 lb**, OHP = **95 lb**, hip thrust = `max(75, deadlift × 0.55)` (`materialize-plan:2699-2726`) — **console log only**
> - swim pace = **1:30/100** (`materialize-plan:2352`) — drives every swim `duration_s`
> - HR zones fall through to the **non-Friel** model above, whose threshold zone caps below a real LTHR
>
> **Every "LATENT" fracture above fires on exactly this user.** They are not separate work — **they are the onboarding blast radius.**
>
> **Law 2 says: measured ≠ inferred. When you don't know, SAY SO.** The pattern already exists and already ships honestly — the run-pace fallback tells the athlete: *"Run durations estimated at 10:00/mi until we learn your easy pace"* (`strength-primary-plan.ts:427` → `GoalsScreen.tsx:1633`). **Copy it. It is the only disclosed fallback in the app.**

- [ ] **Make the app refuse instead of invent** (strength 1RMs, swim pace, HR zones). Disclose, or decline and ask. **Gates everything below.**
- [ ] **The onboarding flow itself.** ⚠️ **Most of it is BUILT — this is a wiring job, not a build.** `OnboardingProfilePage.tsx` today collects **identity only** (birthday, gender, height, weight) and **never asks for a single performance number**. The performance numbers live on `TrainingBaselines.tsx`, and **nothing walks a new user there.**
- [ ] **The "let the app learn it" half is SHIPPED and working** — verified live on device: *"11:09/mi — pace at easy HR (5 runs; Friel Z2, at or below 89% of your threshold HR (151 bpm)) — as of Jul 13"*, with **the Q-174 chooser next to it**: `Use my runs 11:09` / `Use my number 11:30`. **That IS the "enter it, or let the app learn it" fork Michael is describing.** Reuse the mechanism; do not design a second one.
- [ ] **The "learn from their own test" half is BUILT for strength** — a Get Stronger plan drops in a `baselineTestWeek` (`strength-primary-plan.ts:526`) when it doesn't know the lifts. ⚠️ **But it only fires when BOTH bench AND squat are missing** (`create-goal…:2397`). Enter one, get no test week, and the other is invented.

---

# 2. SECURITY — pre-launch, not burning, but real

- [ ] **🔴 DELETE `strava-refresh`.** Zero callers, **deployed**, **no auth check**: takes `userId` from the request body and **returns that user's Strava access token** (`strava-refresh/index.ts:17`, `:93`). The anon key that reaches it is public and sits in your JS bundle. Live refresh already lives in `_shared/strava-access-token.ts`. **Delete, don't document.**
- [ ] **`_shared/bearer-auth.ts:17` decodes JWTs WITHOUT verifying the signature** (`atob` + `JSON.parse`, trusts an attacker-supplied `sub`). A second, unsafe auth idiom next to the good one. Delete it; adopt `require-user`.
- [ ] **B1 — `require-user` adoption is 9 of 87.** 77 of 87 functions instantiate a service-role (RLS-bypassing) client. Sensitive functions taking identity from the **body** rather than a verified JWT: `strava-token-exchange`, `strava-webhook-manager`, `import-strava-history`, `send-workout-to-garmin`, `import-garmin-history`, `swift-task`. *(`strava-webhook-manager` is called with the anon key as bearer, so it carries no identity **by construction** — it cannot adopt `require-user` without a client change.)*
- [ ] **Admin functions have no server-side admin check.** The 8 edge functions `WorkloadAdmin.tsx` invokes are gated **client-side only**. `is_app_admin()` exists in SQL and guards only `library_plans` INSERT.
- [ ] **`disconect-connection` (misspelled) is a REAL deployed function with NO SOURCE in the repo**, kept as a permanent fallback branch at `Connections.tsx:495`. Unknown behaviour. Find it, delete it, remove the branch.

---

# 3. HYGIENE — deletions, mostly

- [ ] **24 dead edge functions + 11 empty directories.** Full list in `CAPABILITY-MAP.md`. Two are actively dangerous as decoys: `analyze-workout/` (empty, the most guessable name in the repo) and `generate-training-context/` (3.4k lines, a dead twin of the live `coach`). `generate-plan` is a validator that generates nothing.
- [ ] **Five DEAD run-generator classes** in `generate-run-plan/generators/` — and `simple-completion.ts:89` exports a class named **`SustainableGenerator`**, identical to the live one in `sustainable.ts:92`. **Editing the wrong file is a silent no-op.** Delete the decoys.
- [ ] **Nine coach outputs are computed and never rendered** (`CoachWeekTab` + `BlockSummaryTab` are unmounted) — including **`reaction`**, the training-reaction axis and the centrepiece of `CANON-arc-inference-model.md`. ⚠️ **`reaction`'s object is load-bearing internally — do not delete it, only its dead emission.** *Decide: mount the tabs, or delete them. Right now it's neither, which is the worst of both.* Also dead: `synthesizeHeadline` runs on **every** snapshot and **every** State render and both throw it away; the LLM's `headline` + `next_session_guidance` are **paid for, parsed, and discarded.**
- [ ] **Five red tests** — `_shared/cycling-v1/{ai-summary,cross-workout-queries}.test.ts` assert the NP-trend fallback that cb4eb1d5 deliberately **deleted** on 2026-07-10. Red for days. *Green must mean green.*
- [ ] **Dead commented block** `compute-workout-analysis/index.ts:1084-1125` ("keeping as backup for rollback") — the real one is imported at `:4`. Pure deletion.
- [ ] **Q-133 peel-back** — `buildRouteReadout` (`_shared/session-detail/build.ts:27`) is still called at `:921` and still emits `terrain.route`, now dead. `SessionNarrative.tsx:395` acknowledges the debt.
- [ ] **`load-headline.ts:67`** carries an unreachable `'building on plan'` branch for a label nothing can produce (D-246's artifact was deleted).
- [ ] **"provisional" → "building base"** wording swap (`LoadBar.tsx:112`, `StatePerformanceSection.tsx:41/130/184/275`). Zero occurrences of "building base" exist today.

---

# 4. REAL WORK, by area

### Plan / wizard
- [ ] **Wizard trade-offs at decision time**, not after generation (`WIZARD-AUDIT.md:79` G2). Only Step6LongDays has a live warning; the rest are static hints.
- [ ] **Explain what each baseline input drives.** Only swim equipment has "what this unlocks" copy (`TrainingBaselines.tsx:950`). Nothing for FTP / CSS / 1RM / threshold pace.
- [ ] **A question→engine data-flow audit.** `WIZARD-AUDIT.md` is explicitly scoped to UX clarity, **not** data flow. No systematic trace exists. *(`CAPABILITY-MAP.md` now covers per-**fact** authority — this is the per-**question** version.)* Then: remove dead questions.
- [ ] **`phase-structure.ts:121`** — with no user-priority-A goal, `sortedGoals[0].priority = 'A'` mutates the **earliest** goal, so `totalWeeks` truncates before the season-final race.
- [ ] **Plan start-date default → today** (currently next-Monday: `ArcSetupWizard.tsx:440/463`, `PlanWizard.tsx:392`, `NonRaceBuilder.tsx:110/176`, `AppContext.tsx:617`). Mechanical; scope is the only open question.
- [ ] **Bypass-path audit for `strength_intent` normalization** — `create-goal-and-materialize-plan` and `arc-setup-chat` read around the normalizer (`_shared/combined-schedule-prefs.ts:372`).
- [ ] **`generate-run-plan`'s `simplePlacementPolicy`** is the only real §4.21 gap left, and it needs a **design pass, not a wire-up**. *(`generate-plan` is dead; `generate-triathlon-plan` has no per-day layer.)*

### Swim
- [ ] **Swim CSS is ORPHANED.** Written by two engines (`learn-fitness-profile:355`, `compute-workout-analysis:772`), read by **nothing**. `planning-context.ts:238 SWIM_CSS_LIVE = false`. **The swim verdict is anchorless, and a 70.3 plan's swim leg is not calibrated to the athlete's swimming.** *(Product call needed: anchor it, or accept the hole and say so.)*
- [ ] **Swim protocol drift audit** — `SWIM-PROTOCOL.md` exists; generation was never cross-checked against it. The 2026-05-27 protocol audit was cycling+run only.
- [ ] **Q-038 — swim stays provisional.** `StatePerformanceSection.tsx:136` hardcodes `PROVISIONAL_PERF = new Set(['swim'])`. Routing is now correct (`ingest-activity:1619`); needs **one live FORM→Strava swim re-ingest** to confirm and close.
- [ ] **Q-016 — drill/main ratio by experience.** `swim-drill-tokens.ts:274` is still a flat 350yd floor; only Path A landed.
- [ ] **Q-019 — wetsuit trade-off** needs two wizard fields (`race_requires_wetsuit`, `open_water_access`) before it can fire.

### Cycling
- [ ] **Ride taxonomy** — only one bike `session_kind` exists (`'quality_bike'`); the long ride is just tags. No Easy / Endurance / Long / Quality / Brick distinction. *(Note: the old item "stop calling Z2 weekday rides long rides" is **MOOT** — `longRide()` has exactly one caller and weekday Z2 comes from `easyBike()`. That bug is gone.)*
- [ ] **Cadence prescription end-to-end** (`CYCLING-PROTOCOL §8`). Analyzer collects it; nothing prescribes it.
- [ ] **Virtual-ride vocabulary** — suppress TERRAIN/CLIMBING for VirtualRide (`_shared/cycling-v1/ai-summary.ts:403`).
- [ ] **Q-036 — `intent_execution_match` adherence field.** Nothing shipped; gated on the secondary-IF-gate decision.
- [ ] **Adaptive intent tracking** — flag when the athlete consistently drifts above/below prescribed intent.
- [ ] **Power-curve + HR-at-power trends into the Arc/snapshot.** Not built.
- [ ] **Bike aerobic decoupling IS computed** (`analyze-cycling-workout:2601`) but **not stored** — a persist job, not a build, if ever wanted. (Run stores its decoupling; bike drops it.)
- [ ] **Q-037 — the 28W FTP gap to Garmin.** No code owed until the data check runs: compare native Garmin `.fit` power stream vs the Strava-ingested one.
- [ ] **Bike `limiter_sport` intensity dial** — `limiter_sport` shifts **volume** only today; no intensity dial exists for bike *or* run.

### Strength
- [ ] **Strength → endurance interference signals** + **`endurance_load_context` population** (`analyze-strength-workout:2904`, still `null`). ⚠️ **These are ONE job** — the same `athlete_snapshot` fetch serves both. The substrate is already live (`compute-snapshot:512-522`).
- [ ] **Per-exercise history** — 1RM/volume trend + set records. `ExerciseHistory.tsx` does not exist. *(`StrengthCompareTable.tsx:250` already renders this session + the previous one inline — the gap is the last-6 trend + PR flag, not the expansion.)*
- [ ] **Refactor strength INSIGHTS → `_shared/strength-v1/ai-summary.ts`** (the directory doesn't exist; `_shared/cycling-v1/` is the pattern to mirror). Prompt + fact packet are still inlined.
- [ ] **Outcome-specific narrative templates** — one prompt today (`analyze-strength-workout:2451`).
- [ ] **Q-050 — pick-planned reconciliation.** Spec'd, not built (`SPEC-PICK-PLANNED-RECONCILIATION.md`); `auto-attach-planned:396` still matches on exact date only. Sign-off gated.
- [ ] **`analysis_error` truncation** — raw uncapped errors at every analyzer write site (`analyze-strength-workout:2983`, and 4 more).

### The spine (specs filed, nothing built)
- [ ] **Adherence↔Performance bridge** (`SPEC-adherence-performance-bridge.md`) — **zero lines built.** *(Was filed twice; de-duped.)*
- [ ] **Per-session performance engine** (`SPEC-per-session-performance-engine.md`) — zero lines built.
- [ ] **Personal zones / outlier detection** (`SPEC-personal-zones-outlier-detection.md`) — the seam is honest and real: `_shared/state-trend/zones.ts:30 resolveZoneBand` has a `'personal'` source with **no writer**. Everything resolves to `coggan_ftp`.
- [ ] 🔒 **Step 4 — plan builder reads spine** (GATED). Confirmed not built: `state_trends_v1` appears in neither `materialize-plan` nor `adapt-plan`. **Prescription is spine-blind.**
- [ ] 🔒 **Step 5 — autoregulation** (GATED). ⚠️ **Half-shipped without the gate** — see §1, `adapt-plan` auto.
- [ ] 🔒 **Per-discipline periodization** (`SPEC-per-discipline-periodization.md`, D-210) — spec'd, zero build; phase is still single/global.
- [ ] **STATE headline phrase bank** — the bounded-composition half **shipped** (`src/lib/load-headline.ts:98`, tested). Remaining: the authored phrases only.

### Misc
- [ ] **HR row "steady" state** instead of silently vanishing — `_shared/session-detail/build.ts:1561` only emits the row at ≥3 bpm drift. One `else` branch.
- [ ] **`calculateBestRunEfforts` ±2% window** (`compute-workout-analysis:159/164`) hard-clamps, so choppy GPS misses the true best effort.
- [ ] **`invokeFunction` token-IIFE is duplicated** (`src/lib/supabase.ts:126-134` vs `:189-196`); the anon-fallback masks a "user but no access_token" race.
- [ ] **iOS bundle rebuild** (`npm run ios`) — `ios/App/App/public/` is a day stale. ⚠️ **Will NOT surface the segment card** — that's starved at the source (see §0).

---

# 5. BLOCKED ON MICHAEL

Nothing here moves without you.

- [ ] **The positioning draft.** `PRODUCT-POSITIONING-v2-DRAFT.md` — approve or shred. **The posture flag's voice depends on it.**
- [ ] **The posture flag** (`docs/SPEC-posture-flag.md`) — **the product one**, the only thing here a competitor structurally cannot copy. Blocked on the positioning voice, and it should be built **after** the §1 fractures (flag someone's running against four disagreeing anchors and you ship a confident wrong answer). Also owes `SCIENCE-run-specificity.md` before its Tier-2 prose — the app's only maintenance theory is **discipline-blind** (true of the engine, false of the legs).
- [ ] **The D-282/D-284 recompute/backfill decision.** Deploy-forward only; history is on the old rules and the 5-week intensity window mixes two zone schemas. Mechanism: `scripts/verify-d284-backfill.mjs` — **deterministic chain only, NEVER the analyzer** (it regenerates LLM narratives).
- [ ] **On-device tests:** strength deviating-log (edit a set, skip an exercise); rest/haptic; the Execution-chip colours on a genuinely low-scoring session.
- [ ] **Repro artifacts:** Q-076 (skipped exercise shows as done); "deleting actual strength deletes planned" — `useWorkouts.ts:1675` *reverts*, it doesn't delete, so D-110's cause can't fire from that path; Ticket #2 (`UNAUTHORIZED_NO_AUTH_HEADER`) — `src/lib/supabase.ts:126` provably cannot emit an empty Bearer, so the premise needs a DevTools capture.
- [ ] **Product calls:** race-course matching (Q-009, GPX geometry) · segment leaderboards · W′ depletion · the iOS/auth remediation-pass go/no-go (~20 raw `functions.invoke` sites bypass `invokeFunction`).
- [ ] **Q-165 — LLM prose.** Effectively passed; two recomputes were consistent and the over-call was retracted. Needs one human eyeball on a third.

---

# 6. CLOSED by the 2026-07-13 verification

Moved off the queue. Do not re-open without new evidence.

- **✅ Q-170 — the adjust-for-heat toggle. NO ADJUSTMENT IS OWED.** D-283: not field-standard (nobody auto-excludes on temperature), and across **81 steady runs** the heat→decoupling slope's 95% CI straddles zero (r²=0.014). **D-275 is dead.** `COACH_PAYLOAD_VERSION 95` confirms.
- **✅ Q-025 — the TREND pool label.** The row it describes was **deleted** 2026-07-05 (`build.ts:893` — `trend: null`, "macro trends now live ONLY on State"). It cannot render.
- **✅ Standardize swim copy to CSS percentages.** **MOOT — D-030 locked the opposite:** athlete-facing swim copy is effort tiers, CSS words deliberately stripped (`SWIM-PROTOCOL.md:22`).
- **✅ "Stop calling Z2 weekday rides long rides."** The bug is gone — `longRide()` has exactly one caller (`week-builder.ts:1098`, gated on `long_ride_day`); weekday Z2 comes from `easyBike()`.
- **✅ §4.21 week-boundary fix (Bug 3).** The proposed fix is a verified **no-op** — `dayBefore` is already circular (`week-optimizer.ts:51`) and the W-004 pin passes.
- **✅ `scaledWeeklyTSS` endurance-hours fix.** Shipped: `week-builder.ts:733-736` (Q-005 / D-021).
- **✅ Q-049 — check-in → Arc continuity.** `arc-context.ts:265` reads `readiness_checkins` directly (Phase 1). ⚠️ **But the only WRITER is inside the strength logger** (`StrengthLogger.tsx:3278`) — **an endurance-only athlete can never check in.** That's a new item, not this one.
- **✅ Bug B — strength logger loses state on iOS sleep.** Fixed (D-109): `AppLayout.tsx:130-176`.
- **✅ Equipment chips → strength protocol · 1RM → loading · FTP → baked watts · training history → volume floors · group-ride anchor · brick structure.** All verified flowing. *(FTP and 1RM carry the caveats in §1.)*
- **✅ Taper-mode narrative ban.** Live and guarded (`_shared/arc-narrative-ai-appendix.ts:126`). Standing eval watch, not queue work.

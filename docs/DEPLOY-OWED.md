# Deploy-Owed / Post-Deploy Verification

> ## ✅ 2026-08-28 — THE LOGGER + CORPUS ARC. DEPLOYED **AND DEVICE-VERIFIED.** NOTHING OWED.
>
> ⛔ **THIS IS THE RARE ENTRY WHERE ALL THREE STATES ARE TRUE.** Pushed, deployed, and a human saw it
> work — Michael rebuilt his block against the deployed functions and confirmed: *"cards are all
> good."* Contrast every other entry in this file.
>
> **PUSHED:** `origin/main == 7f8ba187` (arc runs `6b100cc7` → `7f8ba187`).
> **EDGE FUNCTIONS DEPLOYED**, versions read back from `supabase functions list`, not assumed:
> `materialize-plan` **307** · `generate-strength-plan` **174** · `rematerialize-standing-block`
> **50** — all 2026-08-28 12:41:58 UTC.
> ⚠️ Those three are the complete importer set for `_shared/standing-plan` and
> `_shared/strength-grid`, traced across every function directory rather than guessed.
> **CLIENT:** Netlify auto-publishes from `main`. The last three commits (`91ef5a96`, `7f8ba187` and
> the D2 nudge fix) are client-only and ride that.
>
> ⚠️ **ORDER MATTERED HERE AND WILL AGAIN:** a block rebuilt BEFORE the edge deploy re-bakes the old
> session line into the new block. Deploy first, then rebuild. That is what was done.
>
> **What it is:** the corpus correction (p78 states a rest rule; the constant saying otherwise was
> false), 44px logger cells, the bodyweight gate routed at the shared type table, rest keyed to slot
> intent, Heavy/Speed naming everywhere, per-intent session lines, and ME rows carrying no reserve
> target. Full writeup: **`docs/NOTES-logger-and-corpus-2026-08-28.md`**.
>
> ⚠️ **STILL NOT PROVEN, AND IT IS NOT THIS ARC'S:** the 2026-08-25 week-2-weights item on
> `POLISH-PUNCH-LIST.md`. The same save path has been exercised repeatedly since without complaint;
> nobody has watched the weights appear. Evidence, not proof.


> ## ⛔ 2026-08-27 EVENING — THE EXPERIENCE CONTROL AND TWO INVENTED NUMBERS WENT LIVE. UNSEEN ON A DEVICE.
>
> Michael authorised push and deploy directly, in that order, three times. **He is downloading a plan
> to confirm and had not done so when this was written.** Pre-launch, only account, blast radius his own.
>
> **PUSHED:** `origin/main == d4c6dbff`.
> · `2769a2df` — the experience control (the athlete's answer sets the hard-session size)
> · `6a56e7bb` — two invented numbers leave the session clock
> · `d4c6dbff` — week one's weights arrive with the test, not in week two
> **CLIENT DEPLOYED:** Netlify auto-publishes from `main`. `2769a2df` confirmed live by fetching the
> served bundle (`/assets/index-D2k0kYwy.js`) and grepping it — "Running experience", "Riding
> experience", "Less experienced", "More experienced" all present. ⚠️ The two later commits are
> server-side; the client carries no change from them.
> **EDGE FUNCTIONS DEPLOYED**, versions confirmed from `supabase functions list`, not assumed:
> · `materialize-plan` **v306** · `generate-strength-plan` **v170** · `rematerialize-standing-block`
>   **v45** — all 2026-08-28 01:45 UTC
> · `create-goal-and-materialize-plan` **v372** — 00:39 UTC, with `2769a2df` only. ⚠️ It needed that
>   deploy (it threads the experience answer through) but imports neither shared module, so the two
>   later commits do not reach it.
>
> ### ⛔ WHAT SHIPPED, IN THE ORDER IT MATTERS
>
> 1. **The athlete's own answer sets the hard-session size.** Two chips per sport on the Endurance
>    focus step; logged history no longer decides the level. Stored on the plan row, honoured in every
>    week — verified against the stored rows for plan `601a035f`, not inferred.
> 2. **The bike's invented third rest is gone.** His 5-minute spins between blocks are his and stay;
>    the recovery after the LAST block was ours and is not on p238-239. A hard ride reads **77** where
>    it read 82.
> 3. **The strides' invented 90 seconds is gone.** Michael: *"six strides, 30 seconds each, rest as
>    long as you want between them."* The recovery is now a lap-button (Garmin OPEN) step. ⚠️ The
>    comment justifying the 90 seconds claimed a watch step cannot be untimed — untrue, the app has
>    been sending lap-button steps all along, and the library always said the recovery was `open`.
>    An easy run reads **27** in both places where it read 35.
> 4. **Week one's copy.** "Fully prescribed weights start in week two" was false from `5af9472c` on.
>    Three sentences now say the weights fill in as soon as the two test sessions are logged.
>
> ### ⛔ WHAT IS OWED — Michael is doing #1 himself. Stop and report on the first failure.
>
> ⛔ **THROWAWAY ACCOUNT ONLY for anything automated. NEVER user `45d122e7`** — Michael's own.
>
> 1. ⛔ **Michael downloads a fresh plan and confirms the numbers.** Expected on his own config
>    (ride hard 1, run hard 2, easy run, long ride · 2h run over 3 days · 4h ride over 2 days · more
>    experienced both): **hard ride 77 · hard run 63-66 · easy runs 27 · long ride 2h45**, and the
>    same in every week 1-12. ⚠️ **An existing plan keeps the old numbers until it is rebuilt.**
> 2. ⛔ **The chips render and gate.** Two per sport, "Less experienced" / "More experienced", bare
>    minutes and "needs Xh/wk" on each. The upper chip greys out below its minimum and keeps its
>    reason readable; the lower never gates; dropping hours after picking the upper one falls the
>    selection back visibly. Continue waits until both are answered.
> 3. ⛔ **The hard rows offer Ride/Run and nothing else** — no "Engine's pick", no "Over-unders", no
>    "Cut-downs". The long slot keeps its club control.
> 4. ⛔ **THE STRIDES REACH A REAL GARMIN WORKOUT**, and this is now more urgent than it was: their
>    recovery changed to a lap-button step today and **nobody has ever seen strides on a watch.**
>    Check the intervals, not the rendered card.
> 5. **Week one's weights fill in after the test.** Log the two test sessions; Thursday and Friday of
>    week one should then carry numbers.
>
> ### ⚠️ KNOWN AND NOT FIXED — do not report these as new
>
> - **The download screen's labeller** (`AllPlansInterface.tsx:79-98`, `humanizeToken`). Traced and
>   confirmed label-only: line 94's `t.includes('threshold')` catches the RUN token
>   `cruise_5x0.8mi_threshold` and prints "Bike Threshold"; the duration regex takes the first
>   `\d{1,3}min` in `3x18min` and prints "18min", dropping the ×3 and the rests. ⛔ **No bike work
>   reaches the athlete and no session is mis-built** — the plan row and the watch are correct.
> - **A 2-3 minute plan-vs-calendar gap remains** on the hard ride and the hard run. Cause: the
>   calendar prices intervals off the athlete's real threshold pace where the plan used an estimate.
>   ⚠️ **Untraced, and likely the calendar being more right, not less.** The two invented numbers are
>   gone; this is a different and smaller thing.
> - **`create-goal-and-materialize-plan` is one commit behind** the other three (v372, `2769a2df`).
>   Correct as things stand — it imports neither shared module — but check that assumption before
>   assuming it is current.

---

> ## ⛔ 2026-08-27 — THE VIADA ARC WENT LIVE, AND NOTHING IN IT HAS BEEN SEEN ON A DEVICE.
>
> Sixteen commits of engine and wizard work, `892b545e..2d93ffcb`. Michael authorised the push and
> deploy directly. **No human has built a Standing Plan end to end against any of it.** He is
> pre-launch and the only account, so the blast radius is his own — that is why it went out
> unverified, and it is his call, but nothing below should be read as checked.
>
> **PUSHED:** `origin/main == 2d93ffcb` (2026-08-27 14:47 UTC).
> **CLIENT DEPLOYED:** live on Netlify, `efforts.work`, confirmed by fetching the served bundle
> (`/assets/index-560_9z7Y.js`) and grepping it — the new copy is IN it ("Two hard sessions",
> "One easy session", "day before heavy legs", "Start on the lower end if unsure.") and the replaced
> copy is OUT ("Add a hard session", "Recovery session", "re-dialing" all absent). Not assumed from
> the push.
> **EDGE FUNCTIONS DEPLOYED:** `generate-strength-plan` **v162** and `rematerialize-standing-block`
> **v37**, both 2026-08-27 14:48 UTC.
> ⚠️ **AND ONLY THOSE TWO, TRACED RATHER THAN GUESSED.** They are the only functions importing
> `_shared/standing-plan` or `_shared/endurance-library`. `create-goal-and-materialize-plan` does NOT
> import either — it invokes `generate-strength-plan` over HTTP, so it needs no redeploy.
> `generate-combined-plan`, `generate-run-plan` and `generate-triathlon-plan` mention the standing-plan
> DOC names in header comments only.
>
> ### WHAT IS NOW OWED — one end-to-end build, in priority order. Stop and report on the first failure.
>
> ⛔ **THROWAWAY ACCOUNT ONLY. NEVER user `45d122e7`** — Michael's own. ⚠️ The strength path refuses
> any athlete without all four barbell 1RMs on file (`missingBarbellLifts`, enforced in both
> `create-goal-and-materialize-plan` and `generate-strength-plan`), so bench, squat, deadlift and
> overhead press must be set before the wizard will build. ⚠️ Browser note carried from 2026-06-28:
> CDP mouse clicks timed out; JS `.click()` and set-value-plus-dispatch drove the flow. Wait ≥10s on
> "Build plan" without navigating.
>
> 1. **It builds at all.** Get Stronger → run+ride → through the endurance screen → a plan comes out.
> 2. **The endurance screen renders four slot rows and NO "+ Add a hard session" control**, with the
>    intro reading "Your week has 4 endurance slots / One long session / One easy session / Two hard
>    sessions". Confirm "Easy session", not "Recovery session".
> 3. **The week's shape:** four lifting days, a plyometrics day, four endurance sessions, one rest day.
> 4. ⛔ **The strides are on the easy run AND reach a workout as real interval steps** — Michael's own
>    hard constraint. `send-workout-to-garmin` builds from `intervals`; anything living only in a
>    description never reaches the watch. Check the intervals, not the rendered card.
> 5. **The long session is 90-100 minutes**, not 2h30.
> 6. **A two-hour running ask on an all-run week is not inflated to 3h20** — the low-volume tier
>    (15e8cac8, re-cut in 38eaaf91). This is the one that most affects the stated customer.
> 7. **The lifting cue appears** on a lifting session: "End the set when your form goes or you still
>    have 1 or 2 reps left…"
>
> ⚠️ A blocked check reported honestly is worth more than a green one nobody can trust — this file
> already records that failure mode from 2026-06-28.


Changes committed plus verifications that can only run **against the deployed code** (not the local working tree). Work this list: deploy the named functions, then run the post-deploy checks here. This is the bucket for "local-verified, deployed-equals-local still owed."

> Convention: nothing here blocks local work. These are the checks that close the loop once code is live.

> **STATUS (verified read-only against git + Netlify + Supabase, 2026-06-28).** The non-race-builder / 5×5 / Q-087 arc is now **DEPLOYED and the client is LIVE — the post-deploy checks are NOT yet run (blocked on a clean test account).**
> - **Code pushed:** `origin/main == b0bc050e`. (The prior end-of-session note's "NOT pushed" was wrong — the docs push carried the whole arc to origin.)
> - **Edge functions DEPLOYED 2026-06-28 04:27 UTC:** `generate-combined-plan` **v264**, `create-goal-and-materialize-plan` **v221**, `generate-run-plan` **v139** (all carry `b0bc050e`).
> - **Client LIVE on Netlify** (production host = `efforts.work`, `server: Netlify`; the `vercel[bot]` GitHub deploys are a dead relic that serves nothing). Served bundle contains `goals/build` / `five_by_five` / `per_discipline_posture`. Builder is live at `/goals/build`, still **URL-only (not linked from GoalsScreen)**.
> - **Verified live on prod (browser, test account `newclaudetest@test.com` — never `45d122e7`):** the whole builder UI chain (6 steps), the seed logic (Get stronger → swim:Out / strength:Develop), the equipment-aware durability default (bodyweight → durability, correct per `non-race-goal-seeds.ts`), the §13.2 length floor (slider min 8), `target_weeks` propagation (16→"16-week block"), commitment ("≈9 h/wk"), retest summary, and **Cut B1 forwarding** (`create-goal-and-materialize-plan` request carries `goal_type:"capacity"` + `target_weeks:12`).
> - **Materialization checks (1–5 + Q-087) NOT run — BLOCKED on account state.** On `newclaudetest@test.com` the build returns `200 {success:false, "Set a race distance on this goal before building a plan."}` because it goes out as `mode:"build_existing"` against a phantom current-goal id (`8f1075c5…`, not in the DB) → hits the race path, not the non-race create path. The account also has no equipment (5×5 can't surface) and isn't clean (pre-existing active event goals). No stray data was created (every failed build persisted nothing). **A clean throwaway account is required to close the checks — see Next-session pickup below.**

## Next-session pickup — run the post-deploy checks FRESH

Do this in a new session, against the already-deployed code (v264/v221/v139), via a throwaway test account — **never** real user `45d122e7`.
1. **Provision a CLEAN account** with a **barbell/DB equipment tier** (so 5×5 surfaces) and **no active goal / no lingering current-goal state** (the dirty-account `build_existing` artifact is what blocked tonight). Sign out and register fresh, or use a known-clean throwaway.
2. **Re-run the five builder checks + Q-087** (the five end-to-end checks below + the Q-087 marathon Upper-Aesthetics check). Browser note: CDP mouse clicks were timing out tonight — JS `.click()` (and slider value-set + `input`/`change` dispatch) drove the flow reliably; **wait ≥10s on "Build plan" without navigating** (the engine chain takes a while and the builder does NOT auto-navigate after build).
3. **Clean repro of the `build_existing` non-race question (the one real open concern):** confirm whether, on a CLEAN account, the non-race "Get stronger" build takes the **create-new** path (not `build_existing`) and materializes a `goal_type:capacity` plan. If a non-race goal can reach `build_existing` mode and the server still demands a race distance despite `goal_type:"capacity"`, that's a real routing gap (non-race short-circuit only wired into create-new, not build_existing) — file it. If clean-account create-new works (as Cut 3b did), the build_existing failure was a dirty-account artifact only.
4. **On green:** update this file + ENGINE-STATE to "fully live + verified," with the materialized-plan evidence (swim:out → 0 swim, target_weeks→length, retest end, 5×5 sessions on the equipped account).

---

## Owed (the checks — pending the clean account above)

### Q-087 fix — deploy `generate-run-plan`, then confirm marathon Upper Aesthetics ships its upper session
- **Deploy:** `generate-run-plan` (function) — carries the `strength-overlay.ts:620` filter removal.
- **Event-behavior change (strictly an improvement, narrow):** the ONLY plans affected are **single-race RUN goals (combine falsy) with `strength_protocol='upper_aesthetics'` at `strength_frequency=2`** (via PlanWizard). Before: the upper session was stripped → **1 lower-only session/week, zero upper** (the protocol's namesake work missing). After: **both sessions emit** (1 lower + 1 upper). The lower session is unchanged; the upper is *added* — no loss, strictly better. Durability / Neural Speed / freq-3 plans are **untouched** (the filter only fired for `upper_aesthetics && frequency===2`).
- **Deploy-gated check** (against deployed code, **throwaway `Claudecode@test.com` only — never `45d122e7`**): build a **marathon** (single-race run) goal with **Upper Aesthetics @ 2 days/week** → confirm the strength weeks contain **both a lower and an UPPER session** (not lower-only). Locally proven by `generate-run-plan/strength-overlay-q087.test.ts` (fails on HEAD, passes after); deploy confirms local-equals-deployed.

### 5×5 protocol (Cuts 1–4) + non-race builder (Cuts A–G) — deploy BOTH functions + the client, then 5 end-to-end checks
- **Deploy together (same moment) — two functions + the client:**
  - **`generate-combined-plan`** (function) — carries the `five_by_five` protocol (block-linear 70→85% curve, 40–50% deload, 2×/week), the two resolver generalizations (`runStrength`, the tri-combined resolver), the `FULLBODY_STRENGTH` intent, the shared `strength-system/protocols/` module, **+ the Q-089 `runStrength` `sessionIndex` fix** (run-path 2×/wk strength now emits two **distinct** sessions, not `sessions[0]` twice — the first deliberate event-behavior change of the arc; see check 4).
  - **`create-goal-and-materialize-plan`** (function) — Cut A threads `per_discipline_posture` into `athlete_state` (A1) and resolves non-race strength sport-aware instead of tri-coercing (A2).
  - **Client (Netlify auto-deploy on push to main)** — the non-race builder UI (Cuts B–G): `NonRaceBuilder.tsx` at route **`/goals/build`** (goal → posture → commitment → length → schedule → confirm), the extracted `StepLayout`, the seed/helper module, and the **submit-path change B1** (`arc-setup-persistence.ts` forwards `goal_type` + `target_weeks` so a non-race goal reaches the server short-circuit instead of silently mis-routing to the legacy path — the **first builder-arc change to a path events also use**; event byte-identity by-construction: `isNonRaceGoalType('event') === isNonRaceGoalType(undefined) === false`, `target_weeks` inert for events). Note: the builder is **reachable by URL but not yet linked from GoalsScreen** — the entry button is a follow-up, not in this arc.
- **Five post-deploy end-to-end checks** (against deployed code, **via the `Claudecode@test.com` test account only — never real user `45d122e7`**):
  1. **`swim:out` non-race goal → 0 swim sessions** (posture reaches the engine — proves A1 end-to-end).
  2. **run+strength, `strength=develop`, `strength_protocol='five_by_five'` → 5×5 sessions** (name "5×5 Workout", `protocol:five_by_five` tag), **NOT** triathlon (proves A2 de-coercion; also the 5×5-arc check).
  3. **tri-shaped develop → `triathlon_performance`** (proves the sport-context split + the engine's `hasTri` run-vs-tri dispatch classification — the build-time confirm (b) that has no local oracle).
  4. **event goal materializes — with the deliberate Q-089 strength change** (B1 watch + the **first intentional event-behavior change of the arc**): create a throwaway *event* (race) goal post-deploy. **Tri event** → plan identical to pre-deploy (B1 inert; tri strength was already index-aware). **Run-shaped *combined* event** (hasTri false, 2×/wk strength) → the strength week is **expected to change `{A,A}→{A,B}`** — the Q-089 fix makes both slots emit distinct sessions instead of a duplicated `sessions[0]`. That is the **correct improvement, NOT a regression**: confirm the two strength sessions are *distinct*, do not assert byte-identical. B1's `goal_type:'event'`/`target_weeks:null` forwarding stays inert either way. *(Single-sport run race goals route to legacy generate-run-plan — a different path, unaffected by Q-089; see Q-087 for its own strength bug.)*
  5. **full builder materialization** (Cuts A–G end-to-end): navigate `/goals/build`, build a goal through the whole flow (e.g. **"Get stronger"** → posture → commitment → length → schedule → confirm) → a plan **materializes AND is right-shaped** — the seeded+edited posture takes effect (swim:out → 0 swim sessions; strength:develop → `upper_aesthetics`/5×5 sessions, not durability), `target_weeks` drove the length, `preferred_days` honored the schedule (the kept club anchor lands as a quality day), and the block ends in a **retest** (no taper/race date). Exercises the whole chain (`seedFromGoal` → `derivePlanShape`/`buildPreferredDays` → `complete()` → server short-circuit → `buildCombinedPlan`) against deployed code; no local wrapper oracle. Also cross-check a **runner-only profile** (declared `disciplines: ['running','strength']`): no swim/bike sessions (the Cut D `arc.disciplines` intersection).
- **Status:** the builder arc is **feature-complete** (Cuts A–G, all local-verified — 14 seed/helper unit tests, byte-identical event suites, tsc/eslint clean) — deploying makes it live at `/goals/build`. Events stay byte-identical: 5×5 `432/3 = baseline` (engine); Cut A + B1 by-construction (non-race-scoped / conditional spreads; event branch identical) + helpers unit-tested. Low-risk (not yet linked from GoalsScreen), but the builder is the **real consumer now**, so these checks are the live proof the whole chain works — the builder has no local wrapper oracle, so live is its final verification.
- **Cross-ref:** 5×5 Cuts 1–4 (`28f0b9eb`…`5f6570a2`); builder Cuts A–G (`8e8626f5` A → `cda9fbe9` G); `SPEC-per-discipline-periodization.md` §13.1 (strength contract) / §13.2 (length floors) / §14 (DG-2 orange); `non-race-goal-seeds.ts` + `non-race-routing.ts` (the unit-tested helpers); Q-083/Q-084 (deferred) + Q-085/Q-086 (builder follow-ups: history nudge, live 1RM loop).

### D-212 divergence render — verifiable only on a REAL disagreement (genuinely blocked)
- **What:** the spine↔projection `fitness_verdict_divergence` renders in the State RACE-block verdicts subsection **only when the two brains actually disagree**. The coach is deployed (payload v46) and the client render path is in production (StateTab) — but it's been verified **by reading, not by runtime**, because **no real divergence exists for the sole athlete** (the block-verdict line shows the dormant "needs more comparable sessions" today).
- **Why it stays here:** there is nothing to *do* — it can't be tested until a genuine spine-vs-projection disagreement occurs in real data. Confirm the render the first time one appears. Not actionable until then; left as a standing reminder, not a task.
- **Cross-ref:** D-212 (`SPEC-fitness-verdict-reconciliation.md`), `arc-context.ts` (`computeFitnessVerdictDivergence`), `StateTab.tsx` (the render).

---

## Done

### 2026-06-26 — the full D-213 non-race arc + D-212 deploy, live and verified
- **Pushed:** the whole arc (22 commits, D-212 work + D-213 Cuts 1–5 + the Cut 3b fix) through `3c7a55f8` → `origin/main`. Netlify build triggered (client diff = the dormant D-212 block_verdict/divergence render in `StateTab.tsx` + `useCoachWeekContext.ts` — additive, dormant, safe).
- **Cut 2 migration applied:** `goals.target_weeks` is live; existing goals NULL-safe; nothing rode along (the 4 recent older migrations were already present). Verified via REST.
- **Functions deployed:** `generate-combined-plan` (Cuts 3/4/5), `create-goal-and-materialize-plan` (Cut 3b routing — redeployed once for the D-214-amendment fix), `coach` (divergence payload v45→46). All ACTIVE with fresh versions.
- **Cut 3b non-race END-TO-END: PASS** (deploy-gated test, run as a throwaway test user — never touched real user `45d122e7`). All four criteria green: (1) routed through `buildCombinedPlan` (`combined:true`, `multi_sport`); (2) contiguous 1..12, `base→build→race_specific→retest`, no taper, no race date; (3) volumes present + CTL-shaped (57 sessions, 3:1 loading + retest ramp-down); (4) real user byte-identical (no plan retired — D-214 scoping held). Test data cleaned up; real user byte-identical post-cleanup. **This test first caught the per-sport-legacy-gate bug, then verified its fix (D-214 amendment / `3c7a55f8`).**
- **486-matrix:** `node scripts/plan-generation-matrix.mjs` → **486/486 pass, errored=0**, freshly generated against the deployed code (974 stale cached files cleared first). Confirms deployed **event** generation is byte-identical / unregressed by the non-race arc.

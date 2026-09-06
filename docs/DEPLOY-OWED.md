# Deploy-Owed / Post-Deploy Verification

> ## 2026-09-06 — PROFILE SCREEN (Training Baselines folded in) + ADJUST FIXES. **DEPLOYED, THROWAWAY-VERIFIED, NOT DEVICE-VERIFIED.**
>
> **PUSHED:** `origin/main == 08c130f5` (Profile) on top of `11c04ab2` (Adjust: four lifts always listed, the word beside a
> number follows its switch, threshold on auto falls back to the typed pace).
> **SCHEMA:** `user_baselines.profile jsonb` + the public `avatars` bucket with owner-only write policies — Michael ran
> `supabase/migrations/20260906090000_user_baselines_profile_and_avatars.sql` in the SQL editor; confirmed live by a
> throwaway account writing name/location/photo_url as the user, uploading to its own folder, refused in another user's
> folder, public URL serving the image, another user unable to read the row (10/10, rows and objects deleted after).
> **EDGE FUNCTIONS DEPLOYED (11c04ab2):** the 33 importers of `resolve-current-run-pace` — `coach` **563** ·
> `create-goal-and-materialize-plan` **402** · `generate-strength-plan` **232** · `rematerialize-standing-block` **109** ·
> `endurance-checkpoint` **14**, all 2026-09-06 07:01 UTC. Nothing server-side changed for the Profile fold.
> **CLIENT:** Netlify from main; iOS project synced (`npm run ios`), Xcode build is Michael's.
>
> **What to look for:** menu → Profile opens the screen at `/profile` (Training Baselines is off the menu; `/baselines`
> redirects). "You" section on top: photo (tap to change), name, location, sign-in email (read-only), birthday with age,
> units, height, weight. No sex field. Everything below is the old Baselines content unchanged. Adjust → Strength lists
> Squat, Deadlift, Bench press, Overhead press with nothing logged; a typed lift reads "auto" beside an auto switch.

> ## ⚠️ 2026-09-03 (evening) — YOUR WEEK READS THE BUILT PLAN; TWO EFFECT NOTES. **DEPLOYED, NOT DEVICE-VERIFIED.**
>
> **PUSHED:** `origin/main == c7c21af2` (also on `state-screen-round-1`).
> **EDGE FUNCTIONS DEPLOYED**, versions read back from `supabase functions list`: `generate-strength-plan`
> **217** · `materialize-plan` **356** · `compute-snapshot` **191** · `rematerialize-standing-block` **93** ·
> `endurance-checkpoint` **3** — every function that imports `_shared/standing-plan`.
> **CLIENT: DEPLOYED AND CONFIRMED OFF THE SERVED BUNDLE.** `https://efforts.work` → `/assets/index-DbFZf90n.js`
> carries `Limits and why`, which exists only in today's Endurance focus card.
>
> **What to look for on the Your week card (D-464):**
> 1. Long ride on Sat, nothing else tapped → the hard-ride row reads **"Tue — placed · top-end intensity"** and
>    the strip's Tue dot is the ride. Before today it read "Mon — sustained threshold" over a Tuesday ride.
> 2. Tap the third hard run onto Wed (where the engine put the first) → the conflict line lights with
>    "Wed has the hard run and the near-threshold run on it. Six to eight hours between them…". No move.
> 3. Long run Mon, hard run tapped Tue → "No day this week is clear. The program's week rests on Tue, and the
>    near-threshold run took it."
> 4. Mark a tapped day as a day off → the chip moves to the server's day; **no "moved to" sentence** anywhere.
> ⚠️ **Expected:** the conflict line reads "Balanced week" for ~half a second after each tap until the preview
> returns — that is the phone's pre-fill, by design.

> ## ⚠️ 2026-08-28 (later) — THE ENDURANCE READ. **DEPLOYED, NOT VERIFIED.**
>
> ⛔ **SECOND DEPLOY OF THE SAME EVENING. NEITHER HAS BEEN SEEN WORKING.** The entry below is the
> strength read; this one sits on top of it and they are proven or not on the same Monday.
>
> **PUSHED:** `origin/main == dc354b27`.
> **EDGE FUNCTIONS DEPLOYED**, versions read back from `supabase functions list`, not assumed:
> `compute-snapshot` **143** · `compute-facts` **126** · `workout-detail` **352** ·
> `analyze-cycling-workout` **218** — all 22:58:28 UTC — and `coach` **471** at 22:58:38.
> ⚠️ **COACH LAST, TEN SECONDS BEHIND, AND THE ORDER WAS LOAD-BEARING.** Its payload bump (172 → 173)
> invalidates `coach_cache`; deploying it FIRST would have re-sourced from a `compute-snapshot` that
> had not been updated yet, cached that, and left the cards empty until the following ingest.
> ⚠️ No migration in this piece, so last night's schema hazard did not apply.
>
> **CLIENT: DEPLOYED AND CONFIRMED OFF THE SERVED BUNDLE.** `https://efforts.work` →
> `/assets/index-eYfKzP5E.js` (3,752,137 bytes), waited for Netlify to publish rather than assuming.
> It carries `watts per beat`, `speed per beat` and `the change is smaller than the normal spread` —
> and the old `Too soon to tell — reading N runs` is **gone** (the bare `Too soon to tell` that
> remains is the OTHER branch, where it is correct).
>
> **What it is:** one endurance card per sport, the lift card's shape. Ride leads on FTP over time
> (six dated readings, 176 → 153 → 168) — the endurance twin of the estimated 1RM, since every
> prescribed percentage is a percentage of it. Run leads on heart rate. Both carry cost-per-session
> (efficiency read AS STORED, never re-derived) and fade inside the session put against p107's own
> line — 10%, or 5% when a key session falls within 24 hours — for the first time in this app.
>
> ### ⛔ EXPECTED TO LOOK WRONG — do not report these as breaks
> 1. **Nothing appears until `compute-snapshot` runs**, on his next ingest.
> 2. **The run card has NO reference line, by design.** Threshold pace is a single overwritten value
>    in `user_baselines.learned_fitness`; there is no history to draw and the card must not fabricate
>    one from a single number. See Q-290 — that is the fix, raised and unstarted.
> 3. **A card renders only where a session has been logged AND attached.** A week missing from a line
>    is a LINKER fault, not the card's.
> 4. **No verdict word on drift or on the run card.** Deliberate: two heart rates is not a fitness
>    claim, and no threshold was ruled. The card states the figure with the line beside it.
> 5. **Nobody has seen an endurance card at all.**
>
> ### ⛔ THE REAL-FAILURE TRIPWIRE — distinct from the above
> **If the RIDE card is still empty after a Monday hard ride is logged, attached, and a snapshot has
> run, that is genuine.** ⚠️ Start the trace at the FAMILY TAG on the planned row
> (`family:ride_sweet_spot`), not at the card — the join is gated on that tag and nothing else.
> The same applies to the run card and `family:run_near_threshold`.


> ## ⚠️ 2026-08-28 — THE STRENGTH READ. **DEPLOYED, NOT VERIFIED.** ONE THING OWED.
>
> ⛔ **NOBODY HAS SEEN IT WORK.** Pushed and deployed are both true; verified is false and stays
> false until Michael looks at the State screen after an ingest. Do not upgrade this entry without
> that.
>
> **SCHEMA:** `exercise_log.slot_intent TEXT` — applied BY HAND in the Supabase SQL editor
> (`supabase db push` refuses a single file in this repo; see the migration's own header for why the
> ledger is left unrecorded). Confirmed live by a direct PostgREST select returning 200 with the
> field present, **not** by reading a success message off a screen.
>
> **PUSHED:** `origin/main == ead07380` (arc runs `65dc556e` → `ead07380`).
>
> **EDGE FUNCTIONS DEPLOYED**, versions read back from `supabase functions list`, not assumed:
> `compute-facts` **125** · `compute-snapshot` **142** · `coach` **470** · `workout-detail` **351** ·
> `analyze-cycling-workout` **217** · `generate-strength-plan` **175** ·
> `rematerialize-standing-block` **51** · `materialize-plan` **308** — all 2026-08-28 21:58-21:59 UTC.
> ⚠️ Eight, and the last six are the `_shared` importer set traced across every function directory
> rather than guessed. `workout-detail` and `analyze-cycling-workout` import the `state-trend` barrel
> and would have been missed; `materialize-plan` has two independent reasons to be here.
>
> **CLIENT: DEPLOYED AND CONFIRMED OFF THE SERVED BUNDLE**, not off the push. Origin is
> **`https://efforts.work`** — ⛔ **that URL appears NOWHERE in this repo** (not `netlify.toml`, not
> any config), which cost a round trip to discover; it is written here so the next session does not
> hit the same wall.
> Receipt: `https://efforts.work` serves `/assets/index-6JACH7u8.js` (3,750,411 bytes), and that
> bundle contains `is the bar going up`, `heavy days only`, `Moving up`, `Stalled`,
> `you are here · week` and `last time` — strings that exist only in this arc's components.
> ⚠️ **A STRING IN A BUNDLE IS NOT A RENDERED CARD.** It proves the code Netlify serves is this code.
> It says nothing about whether a card draws a correct number, which is what `VERIFIED` means and
> what is still owed.
>
> ### ⛔ WHAT TO LOOK FOR, AND WHAT IS EXPECTED TO LOOK WRONG
> 1. **Nothing changes until `compute-snapshot` runs again**, which happens on the next ingest. A
>    stale screen right after deploy is expected, not a failed deploy.
> 2. **The strength line will be EMPTY at first, and that is the ruling, not a bug.** The e1RM gate
>    now fails closed: only a set stamped `ME` mints a max, so everything logged before 2026-08-26
>    leaves the line. Michael ruled for exactly this — *"don't let the old lifts drag me down."*
> 3. **The line fills from Monday's test.** The test week's competition lifts are stamped `ME`, so
>    the two pretest sessions are what start it. ⚠️ If the line is still empty after those are logged
>    and a snapshot has run, THAT is a real failure — start at `exercise_log.slot_intent` on those
>    rows and work forward.
> 4. **e1RM records may move down** for any lift whose best came off a set that is now gated out.
> 5. **The cards fill in over three weeks.** Week 1 is the two tests: no heavy session yet, so no
>    lift cards — only the run card, once Wednesday's run is logged and attached. Week 2 brings the
>    cards, week 3 their lines (a line needs two in-block readings). No placeholder by ruling.
> 6. **Deploy before rebuild.** This was done in that order. A block rebuilt first would have logged
>    its first week with no intent stamps.
>
> ### ⚠️ RAISED, NOT FIXED — do not read these as regressions
> - **Get Stronger has no strength line at all.** Nothing stamps `ME` outside the Standing Plan
>   composer, so a 5/3/1 main lift mints nothing. Stamping it `ME` would assert a band that programme
>   does not prescribe; the alternative is an explicit decision that path has no line. Unruled.
> - **Nor does any off-plan session.** An athlete logging a heavy bench outside a plan gets no line.
>   Real product hole, bigger than this arc.
> - **`week_ledger_v1` and `me_history_v1` ship persisted and UNRENDERED.** The five weekly numbers
>   are deliberately not on screen — measured: a standing block is the same week twelve times, so a
>   weekly readout would show one picture twelve times. The module header says so; do not surface it
>   without a ruling.


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

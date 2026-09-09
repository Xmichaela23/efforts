# Handoff — 2026-09-06/07 (written at 96% context in the main chat)

Read this first in a fresh chat. Memory files under ~/.claude/projects/-Users-michaelambp/memory/ carry the rules.

## Shipped tonight (all pushed to main, deployed, iOS synced; Xcode build is Michael's)
- Account screen (menu item), forgot/reset password, change password (eye, auto-close), change email, delete account, Download your data (zip).
- Profile = You + sport strip + numbers/zones/equipment on the Adjust plate; one shared number row; no pencils; border = tappable rule (docs/DESIGN-button-shape.md).
- B1 closed (server never trusts a body user_id); client RLS sweep closed (every user table owner-only, views security_invoker); sweep script pattern in FOUNDATION-READINESS.
- No AI anywhere; keys unset; headline "deterministic, no AI" (Garmin/Strava reviews).
- Garmin readiness: deregistration/permissions webhook, disconnect tells Garmin, secret in the URL PATH (portal strips query strings), old bare URL accepted until 2026-09-14. Portal endpoints saved; Summary Resender proved delivery.
- Ride analyser fixed (was dying on the compute limit since 09-01: PR/similar queries pulled 43 MB of `computed`); ride card lines: Pw:Hr sign-aware + halves note, cardiac drift read + note, interval execution judges power, Insights section removed, rows ordered effort → plan → engine → Next; card above the interval table; Next last.
- Token refresh before every server call and on resume (60-minute tokens, no auto-refresh on iOS).
- Demo account demo@efforts.work (id 1a1f04d1-…), read-only copy of Michael; teardown `node scripts/delete-demo-account.mjs`. Michael changed its password himself.
- Tab bar 12px higher; effort scale shared (talk test / reps left); menu order; sport strip swim last.

## Plumbing — DONE 2026-09-07 (second session, Opus)
docs/WORKORDER-plumbing-2026-09-07.md is closed out; its status section has the detail.
Job queue on pg_cron every minute, alarms with email, failed analysis on the card with Try again plus a dot on Home
and the week, connection health with Reconnect. `JOBS_SECRET` set, three migrations pasted, 20 functions deployed,
pushed, iOS synced. Verified against the live server with a throwaway account, not fixtures.

Two bugs found while verifying, both fixed and deployed:
- The callback secret in the URL path never matched (the edge runtime hands the function `/<name>/<secret>`, not
  `/functions/v1/<name>/<secret>`). Both Garmin webhooks were passing only on the pre-2026-09-14 legacy allowance and
  would have started refusing Garmin's pushes on that date. A push that still arrives without the secret now raises
  the alarm `garmin_webhook_legacy_url`, so the portal URL proves itself on the next real ride.
- `get-week` selected the analysis fields and dropped them when building each row, so the Home and week dot could
  never appear.

Not verified: the three screens by a human eye (the data behind them is verified), and whether the Garmin portal URL
carries the right secret (it answers itself, deadline 2026-09-14).

## New-user path — 2026-09-07 (this chat). Michael's ruling: NEVER drop a new athlete into a plan.
The wizard (Focus → Build a training plan → NonRaceBuilder, steps in src/lib/wizard-steps.ts) already IS the intake for
a plan, including baselines: the "Know your numbers?" step offers use-current / type / test, and "test" puts the FTP
test (p212) and the threshold time trial (p210) into week one; a lift left blank becomes a week-one test session. Do
not redesign that. What was missing was the way in.

The flow now (pushed):
1. Create account (RegisterForm) → `/welcome`.
2. `/welcome` = src/pages/WelcomePage.tsx, FOUR screens (Michael's final order, 2026-09-07), Next at the bottom, progress
   in localStorage `efforts:intake_step`, finishing stamps `user_baselines.ui_prefs.intake_done`:
   About you (Profile's own rows: name, birthday+age, units, height, weight) · Your gym (Commercial / Home as cards +
   HOME_GYM_EQUIPMENT_OPTIONS chips; line "Plans list the equipment they require before you build one" — the barbell
   requirement lives on the plan card, NOT here, so a dumbbell plan needs no change) · Your lifts (squat, bench,
   deadlift, press; a typed number locks as on Profile) · Your numbers (line "Runners: threshold pace, 5K pace, easy
   heart-rate range. Riders: FTP."; Strava / Garmin / Apple Health pills — one tap imports 90 days; rows threshold pace,
   5K time, easy heart rate (typed as threshold bpm → configured_hr_zones.manual_run_lthr, range = Z2 85–89%), FTP).
   NO sport question anywhere (the wizard asks per row; history says what they do). Every row saves the moment it is
   committed (NumberRow `saveOnBlur`, saves serialized through a queue) — Next only navigates. Strava and Garmin open in
   the SAME tab; both callbacks return to /welcome screen 4 while the intake is in progress. Drawn as the forge plate.
3. Home. Own workouts on the calendar if connected. When the account has no plan: "No plan yet." + "Build a plan around
   this ›" → the Focus screen, where they pick a plan. Nothing opens by itself.
4. First-run cards (FirstRunCard) on Home, State, strength logger; seen on device + ui_prefs.seen_first_run.
Also: Strava connect from Connections imports 90 days by itself; Garmin connect asks for 90 days and Connections has
"Import Last 90 Days"; import-garmin-history asks in 30-day windows (409 = already requested); the Standard Focus card no
longer claims tested lifts are required; post-import goes to /profile; loadUserBaselines returns ui_prefs.
The THREE-screen version was verified on the local dev server with the demo account (throwaway), driven by script: the screens render,
Next saves through saveUserBaselines (units, disciplines, equipment.strength, ui_prefs.intake_done all landed), the last
Next lands on Home, the Home first-run card shows, tapping it removes it, and it stays gone after a reload (device +
ui_prefs.seen_first_run). NOT walked: the Strava and Garmin doors (need a real OAuth), Apple Health (iOS only), a truly
brand-new account (RegisterForm → /welcome; the register form was not driven). The two-screen rewrite that followed builds clean but was NOT re-walked: the browser pane's session ended and this chat does not type passwords. Discipline ids written by the intake are
the canonical run/ride/swim/strength; Profile still writes running/cycling/swimming and readers normalise both.

## Found and fixed late 2026-09-07 (this chat)
- **Garmin runs never split into intervals.** Two causes in compute-workout-summary: (1) ingest-activity stringified
  Garmin laps into the jsonb column and the reader took a string as no laps; (2) Garmin laps carry only
  `startTimeInSeconds`, so each lap was dropped for lacking an end, and their epoch times were compared to
  timer-relative rows. Fixed: writer stores the list, reader parses text, lap ends derive from the next lap's start,
  clock laps match clock rows. Sep 7 Hard Run: 0 intervals / 47% → 33 intervals, aligned, 83%.
- **Strava pull doubled two Garmin rides.** import-strava-history's Garmin-first gate used `.maybeSingle()`, which
  errors on two Garmin rows in one day (two rides on Sep 5) and let both Strava copies in. Fixed with `.limit(1)`.
  The two copies were deleted on Michael's word.
- A lift posted from Efforts to Strava came straight back through the webhook as a new workout. Webhook and pull
  now skip activities whose id is on a row as `strava_shared_activity_id`. The column's migration (2026-09-03) had
  never been pasted; it is in now.
- Post-workout feedback popup: only a run or ride dated today or yesterday, and never a row a history pull created.
- Rest timer: plain cues, provenance off the screen; a warm-up set rests 60 s (ours).
- Share a session with a friend (share sheet, text + efforts.work); Delete moved into the session header.
- Connections rendered inside the app shell (real tab bar); copy says what connected means and what the pull buttons do.

## 2026-09-08 (evening) — strength rows: how-to, swap list, braced hinge
- **Setup out of the name.** "Back Extension (feet under a loaded bar)" overflowed the logger's box and still did not
  say how to do it. Display names are plain again (`EXECUTION_NAME` in `_shared/strength-grid/grid.ts`); the how-to
  travels on the row as `how_to` (`EXECUTION_HOW_TO` + `executionHowTo`, same kit gate as the name; a movement with no
  machine version shows it on every kit). Stamped in compose (`rowHowTo`, floor rows, core pick), carried through
  materialize, rebuild shape, and re-derived on a swap. Logger: (i) beside the name opens a sheet (white, 17 px).
  Rows with a how-to: Back Extension (floor), Leg Curl (bench, dumbbell), Chest-Supported Row (incline, dumbbells),
  Reverse Hyper / Weighted Reverse Hyper (bench), Calf Raise (bodyweight, both legs). All words Michael's.
- **Braced hinge (p274 days 2 and 5).** The slot is marked hamstrings and the reverse hyper is tagged glutes, so the
  muscle filter threw the book's first pick out of its own row and Back Extension filled it. `alsoAdmits` names the
  reverse hyper family on both slots (the hip thrust rule). Measured: home kit → Weighted Reverse Hyper, bodyweight →
  Reverse Hyper, commercial gym unchanged; the glute floor add-on gives way to a Nordic curl for hamstrings.
- **Swap list is the slot's own.** A frame accessory row carries `swap_options` (the cell's `pickOptions`, whole,
  incl. its own movement so a swap can be undone; the logger hides the current one). Replaces the previous program's
  leg pool, which offered lunges, a front squat and core work on a hinge row. Swap now re-derives the display name.
- **Rebuild replaces a movement when the cell's answer changed** (`restate.ts`): an unmatched by-feel row (marked, or
  priced "By feel") and an unmatched fresh row in the same category+pattern are the same slot; the fresh row replaces
  the old one. Never a delete, never a done session. Rebuild also carries `execution_name`/`how_to`/`swap_options`.
- **Michael's own block** stored `slot_picks.braced_hinge = "back extension"` at build time, and the composer honours
  the athlete's answer, so Rebuild keeps Back Extension for him. Path: Swap → Rest of plan → Weighted Reverse Hyper
  (materialize writes the swapped name into the built session and re-derives its how-to; the swap list stays).
  No screen changes a stored slot pick after the build — open item.
- DE line: "move the bar fast" only on a barbell row (`displayFormat` total); dumbbell, band, bodyweight rows say
  "move fast". Delete workout is the last thing on the completed-workout page.
- **The plan adds nothing the page does not print** (Michael, later that evening: "we can't have an ours — we have
  no rules, only Alex does" · "forget my anything — he prescribes plenty"). `ATHLETE_ADDITIONS_ON = false` in
  `compose.ts` switches off the per-muscle floor (the added Calf Raise / Nordic / Hanging Leg Raise rows) and the
  core-pick placement (twice a week, a frequency the book never states). The builder no longer asks for core picks.
  The dial was already off. Measured: the three test weeks lose only the added rows and their notes (137 lines, no
  other change). 14 tests of the switched-off mechanism return early on the switch; two floor assertions gated.
  Michael's existing rows stay until he removes them or a new plan is built (rebuild is name-matched).
- Tests: 4 standing-plan failures and 1 strength-grid failure (`rest between sets is HIS rule`) pre-exist today's
  changes; goldens regenerated and committed (57 rows braced hinge, 36 rows calf how-to marker).

## 2026-09-09 — decided, not built: the Today screen
- Bottom bar becomes **Home · State · +**. Home opens on **Today**, with **Week** (the current calendar) as a second
  tab at the top, the way State has Status / Adjust / Schedule. The **+ is for plan building only**, it opens the
  Focus screen (training card, race entry, current plan). Adding a workout by hand moves to the Week tab: tap a
  day, add (TrainingPeaks / TrainerRoad pattern). Low priority. The first-run Focus spotlight moves to the +.
- **Today** lays the day out from the book: the spacing line when there are two sessions, then each session with
  its rows (the row's own numbers) and one cue per kind of set, then the week so far (load line, totals).
- Approved lines (Michael's words; nothing of ours):
  - Two sessions: `Two sessions today. Six to eight hours apart.` then `Closer than that:` /
    `Lift first, make the ride easier.` / `Ride first, skip the skill work.` (on a day whose only speed row is DE:
    `drop the speed work`). The line is built from the day's own data (ride length + class, lift region, set
    count), never a list of rules.
  - ME: `1 to 5 reps, stop short of failure. More than 5, log it.` (logger's current line, p219)
  - DE: `As fast as possible on every rep. Bar slows, set is over.` (p218)
  - HYP: `8 to 12 reps, 1 to 2 in reserve. Reps slow as the set goes.` (p86, p218) — SHIPPED on the card and logger
    2026-09-09; the "top of the band → add weight" trigger was ours and is removed (cue and last-time note).
  - SKILL: words still needed. Page: 3–5 reps at 75–85%, 3–4 in reserve, form and consistency before speed, no
    fatigue, ample rest, first session of the day (p218, p219, p142).
  - Anaerobic ride, APPROVED 2026-09-09: `Go by feel. Stay above the floor. No ceiling. Each set harder than
    the last.` (p237: floor not target, 110% rising to 125–130%, beat the last effort). The built 110–120%
    intervals stay; the line says what the number is.
  - Endurance ride, APPROVED 2026-09-09: `Easy, under 75 percent. Spend a few minutes of the ride paying
    attention to how you pedal (smooth circles, not stomping) and how you sit on the bike. Truly easy.` (p239,
    p275 "easy work should be easy")
  - Hard run, APPROVED 2026-09-09: `Stay near threshold as long as you can without falling apart.` (p233, p110)
  - Long run, APPROVED 2026-09-09: `Easy the whole way. Stopping for a bit is fine. Be able to speak long
    sentences easily the whole time.` (p235, p211 talk test)
  - Endurance stop rule: heart rate up 5% at the same output, or output down 5% at the same heart rate (p107).
  - Lifting cost line: counted work sets vs 14 (p86).
- Also decided: a 3-week check-in on the calculated max (p245, ~1% every 3 weeks) — separate piece, not built.
- The set word on a logger row is tappable (sheet with the letters spelled out + one line per kind) and gets a
  one-time spotlight. SHIPPED 2026-09-09. The sheet's lines are mine and should be replaced with the approved ones
  above when the Today screen is built.
- Michael, on my copy, 2026-09-09: he hates detangling it; it contradicts itself. Next chat: never paraphrase the
  book in prose. Give bare facts with page numbers, one per line, and let him write the sentence.

## Still on the list
0. Rest timer to field norms (Michael, 2026-09-09: "they do feel messy"). Strong: one default, 2:00, for every
   exercise, starts itself when a set is ticked, changeable per exercise, separate warm-up and working
   durations, sound in settings. Hevy: a default in Settings, per-exercise override, off is an option, 5 s
   to 5 min, plus/minus 15 s on the running timer. Ours today: 3:00 heavy / 2:00 speed / 1:30 muscle by set
   kind, 1:00 warm-up, a timer object per set. To do: (a) a Default rest timer row in settings, athlete's
   number, remembered; (b) per-exercise override on the logger; (c) plus/minus 15 s on the running timer;
   (d) one clear start rule: the timer starts when the set is ticked, nothing else starts it; (e) the
   per-kind minutes become the shipped default only until the athlete sets one. The p78 rule line stays as
   the cue. Not built.
1. New-user spec: both front doors (connect Garmin/Strava · use my phone), first-run cards, one per screen. Write spec, then build.
2. Strength popup polish: rating first on a lift, "estimated" until rated. Not gated.
3. Resend for sign-in emails (dashboard, SMTP) before real users; password rules (8 chars + breach check).
4. Strava Extended Access reapply after Garmin.
5. Demo email refusal ("Email address demo@… is invalid") — investigate after mailer limit; demo never needs it.
6. 278 deno-check errors in old files (race plan builder, run analyser, facts, combined-plan) — cleanup, largest file first.
7. Dead AutoMinePill in TrainingBaselines.tsx; session_detail_v1 not persisted since 08-31 (speed only).
8. course-detail strategy_stale hash mismatch; readiness projection ignores a target typed after build (marathon rebuild).
9. A way to change a stored slot pick after the build (Adjust); today only Rest-of-plan swap or a new plan does it.
10. (moot while the floor is off) Muscle tag for `back extension` is hamstrings and the braced hinge slot is marked hamstrings while the book's row is posterior chain led by the reverse hyper — admitted by name for now; revisit the slot muscle with the frame measured.

## Michael's standing rules for this work (short form)
Plain words, no idioms, no "priced"; screenshots = optics; ask when two readings; never DB-write his data (throwaways only; his account read-only); every number sourced or ledgered OURS; one effort scale; border = tap; a chevron only when you leave the screen; Next at the bottom; no AI ever again.

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

## Still on the list
1. New-user spec: both front doors (connect Garmin/Strava · use my phone), first-run cards, one per screen. Write spec, then build.
2. Strength popup polish: rating first on a lift, "estimated" until rated. Not gated.
3. Resend for sign-in emails (dashboard, SMTP) before real users; password rules (8 chars + breach check).
4. Strava Extended Access reapply after Garmin.
5. Demo email refusal ("Email address demo@… is invalid") — investigate after mailer limit; demo never needs it.
6. 278 deno-check errors in old files (race plan builder, run analyser, facts, combined-plan) — cleanup, largest file first.
7. Dead AutoMinePill in TrainingBaselines.tsx; session_detail_v1 not persisted since 08-31 (speed only).
8. course-detail strategy_stale hash mismatch; readiness projection ignores a target typed after build (marathon rebuild).

## Michael's standing rules for this work (short form)
Plain words, no idioms, no "priced"; screenshots = optics; ask when two readings; never DB-write his data (throwaways only; his account read-only); every number sourced or ledgered OURS; one effort scale; border = tap; a chevron only when you leave the screen; Next at the bottom; no AI ever again.

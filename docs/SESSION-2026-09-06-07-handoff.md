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

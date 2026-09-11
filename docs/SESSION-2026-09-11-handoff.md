# Handoff — 2026-09-10 late / 2026-09-11 (PM chat; one engineer terminal)

Read the `docs/ENGINE-STATE.md` banner first, then `docs/SESSION-2026-09-09-10-handoff.md` for the two days
before this one. Memory files carry the rules (never use ours; all copy through Michael; smart server dumb
client; never commit -a).

## State at close (2026-09-11, 10:15 PT)
- PUSHED: everything, main = `a4bdab0e` plus this doc commit.
- DEPLOYED (checked with `supabase functions list`, UTC): swap-session v7 and materialize-plan v380 at
  17:15 (the `a4bdab0e` pair); generate-strength-plan v252 at 12:35; coach, rematerialize-standing-block,
  endurance-checkpoint at 05:17; get-week and plan-overview at 02:57.
- iOS SYNCED after the last push. The Xcode build is Michael's.
- VERIFIED on a device: nothing from this stretch. Checks were throwaway accounts against the live database
  (all deleted) and headless Chromium at 390×844.

## What shipped
| Commit | What the athlete sees |
|---|---|
| `c414e62c` `b844aa8f` | State: BODY is one row like LOAD. Order is LOAD, THIS WEEK, PLANNED VS DONE, BODY. Heading "BODY (as you logged) · last 7 days". No Adjust link on the heading. |
| `841af0aa` | Today status card: an (i) after "form" opens State's own form key; sport dots before the week's totals; numbers 15 px, labels 13 px, Garmin line 12 px. |
| `54d2afce` | Leg Curl keeps its name in the drawer on a home kit (it read Nordic Curls). |
| `e31c2bfc` | Plyo drill lines print no reserve. |
| `12f344fc` | A rebuild leaves done sessions' steps as they were, so a logged run's intervals stay linked. Michael's 49 runs and rides were re-run through recompute-workout, 49 OK. |
| `1d7ad824` | The rebuild report lists only length changes it writes. Week-one time trial and FTP test rows are expanded on insert (36 and 55 min, not 45 and 60 then 36 and 55). |
| `b12a36a5` `f556e980` `08eaae2a` | Upper-day superset is a triceps move with a curl (p274 "(arms)"). The heavy pull's name is capitalised. Confirmed on all four lifting days of a fresh plan. |
| `a6460421` | Standard Focus builder: hard rows keep Ride/Run and lose the shape list. One server line under each: hard run "A series of near-threshold efforts. Choose the workout on the day." Hard ride "A series of efforts near or above threshold. Choose the workout on the day." The engine rotates the page's shapes week to week (p112). Easy and long rows keep their length pickers. |
| `a7e75fe3` | On a planned, not-done hard run or ride, the Instead sheet lists the other workouts for that session's family and level (both frames). A tap rebuilds that one session, just today. Back to the plan restores the plan's row. Done, skipped, sport-swapped and race-tempo sessions offer none. |
| `a4bdab0e` | Each workout option has a second line in the athlete's paces and watts, e.g. "4 × 6:30 at 7:09/mi, 4 min easy between". No threshold or FTP on file prints the page's percentages. The token arithmetic moved from materialize-plan into `_shared/plan-tokens/quality-work.ts`, shared by materialize-plan and swap-session; a test holds the old and new expansion identical for every hard token. |

## Approved copy this stretch (Michael's yes)
- The two hard-row lines above.
- "BODY (as you logged) · last 7 days".
- Chooser descriptions: the page's structure with the athlete's paces and watts ("ok", 2026-09-11).

## Pending Michael (decisions, each needs a yes before it is built)
1. **Ride length caps.** Easy ride capped at 120 min (p105, p275) and long ride at 210 min (p239 level 2,
   p275). Today the ride picker runs to 300. Run caps stay 90 easy and 100 long.
2. **The 48-hour sentence.** "PREPARATION: no hard training 48 hours prior" is in the three test
   descriptions (`_shared/baseline-test-rows.ts` lines 37, 53, 85). The p210 and p212 photos do not print
   it. The code comment at line 101 says the book does; that comment is wrong about the photos read.
   Proposal: delete the clause from all three.
3. **Workout names on the chooser** ("Race-specific repeats", "Surge, sustain, surge", "Long sweet-spot
   repeats" and the rest) have not had a line-by-line read.
4. **The confirmation sentence after a workout pick** and the **"Swap sport" button label**.
5. **Text size** on the chooser sheet.
6. **Club-night and season-wizard sentences** (carried from 2026-09-10, never checked against a page).
7. **Rebuild.** Michael deletes his plan and builds a new one once these land. The numbers step starts on
   "use" for any lift or threshold on file; tapping Test gives a test week.

## Open, found, not fixed
- A rebuild resets a workout chosen on the day back to the plan's rotation for that week.
- Hard sessions placed next to the week-one tests: not built, because the 48-hour rule is not on the page.
- Carried from 2026-09-10: heavy-set good-news line may be blank until the next recompute; a multi-swim day
  can compare the wrong planned swim; `week-builder.ts decideOrdering` is a second copy of day order.
- Readiness (docs/FOUNDATION-READINESS.md): B4 monitoring, B14 Open-Meteo commercial licence (launch gate),
  error handling on every call.
- Pre-existing test failures unchanged: 5 standing-plan (539 pass), 58 client.

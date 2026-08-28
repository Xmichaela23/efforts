# WORKORDER — the five weekly numbers, the day-screen prompt, and the strength graph
**2026-08-27. Ruled by Michael in a review session. Five items, independent — ship in any order.**

---

## CONTEXT — what already exists, traced this session

- `_shared/standing-plan/endurance-ledger.ts` (`enduranceLedgerFor`) computes buckets 1–3 (sub-VT1,
  near-threshold, over-threshold minutes) plus the endurance half of bucket 4, per built week.
  Shipped `bb4275c1` + `11758613`, deployed 2026-08-27.
- ⛔ **NOTHING READS IT.** `compose.ts:2479` attaches it to the composed week as `enduranceLedger`
  (`compose.ts:629`). It is not persisted to the plan row, not returned to the client, not rendered.
- Buckets 4 and 5 (work sets, hypertrophy reps per muscle) already exist in
  `_shared/accessory-dosing/ledger.ts` (`ledgerFor`) and are NOT to be recomputed.
- The ledger describes the PLAN, not logged work. Every item below is plan-side. Bucketing completed
  sessions was discussed and is **not ordered**.
- The above-VT2 split is deliberately left unresolved (`overVt2Minutes` + `overVt2Band`). Keep it
  reported-not-filed. Do not invent the boundary.

---

## 1. ⛔ THE FIVE WEEKLY NUMBERS REACH THE SCREEN

Persist the ledger with the plan and surface it per week: easy minutes, medium-hard minutes, hard
minutes, work sets, reps per muscle group. All twelve weeks exist at build, so the whole climb is
visible before the athlete trains a day of it.

- **Week 1 counts. Week 2 compares.** Michael's own words. Week 1 is the anchor and carries no
  comparison — there is nothing before it.
- ⚠️ `ReadoutTiles` renders 2 or 3 columns; five values do not fit its grid. The arrangement is
  Michael's call — render nothing until he has seen a mock.
- ⚠️ The endurance three come from `enduranceLedger`; the strength two come from `ledgerFor`. One
  surface, two sources, neither recomputed.

## 2. ⛔ THE MISSING-WORK PROMPT GOES ON THE DAY'S PLAN SCREEN

⛔ **MICHAEL MOVED IT OFF STATE.** *"state is the wrong place maybe where they send the workout to
gamin the days plan screen."* The screen where the athlete sends the session to Garmin is where they
can act on it.

- The signal: one of the three kinds of endurance work has gone missing. p119 requires all three —
  speed, near-threshold, easy — to stay present; volume may fall, quality may not disappear.
- On the day's screen it reads as a line about today: e.g. "your last hard run was three weeks ago"
  on a day carrying an easy one.
- ⚠️ **THE EXACT WORDING AND PLACEMENT ARE UNRULED.** Render a version and let Michael rewrite it on
  sight.

## 3. ⛔ THE STRENGTH GRAPH STOPS DIPPING ON A CORRECTLY-FOLLOWED WEEK

The deload week is already excluded (D-338, `state-trend/deload.ts` reading `meta.phase`). **The
opening week of a cycle is not**, and on 5/3/1 that week is 65/75/85% against week 3's 75/85/95% — so
a followed week 1, and every new plan, reads as a fall in strength.

Three changes, all field-standard (Strong / Hevy / Boostcamp):
- **A records line over the dots.** Plot the per-session estimates as points and trend the best-of.
  A best-of line cannot dip on a light week.
- **The last set's rep count beside it.** Same percentage, more reps, is the progress signal in
  Wendler.
- **A deliberate drop reads as a reset, not a decline** — when a new plan lowers the working weight,
  say so.

⚠️ The cycle-week identity is already resolved per date by the plan-phase resolver — the same input
D-338 uses. No new derivation.

## 4. ⛔ THE ENERGY / SORENESS / SLEEP ROW COMES OFF STATE

`readiness_checkins` is read by three server modules and **written by nothing under `src/`**. Energy
and sleep are never asked anywhere in the app. The row can only render from the 2026-06 backfill, so
it shows old imported data or nothing.

Remove the row. Leave the table and its readers standing.

## 5. ⛔ THE LOAD GAUGE KEEPS THE RATIO AND LOSES THE POOLED SCORE AS HEADLINE

- ⛔ **KEEP the last-7-days-vs-typical ratio.** It answers a question the five numbers do not: is
  this week a spike. Michael ruled it stays.
- ⛔ **The pooled points total stops being the headline.** Summing a lifting session and a long run
  into one score is the part that does not hold up.
- ⚠️ Its danger thresholds have been contested in the literature since ~2019. Keep it worded as "more
  than usual", never as a warning line.

---

## RULED — do not re-litigate

| ruling | source |
|---|---|
| Five numbers, off the plan, no device or history needed | Michael |
| Week 1 counts, week 2 compares | Michael |
| The missing-work prompt lives on the day's plan screen, not State | Michael |
| The load ratio stays; the pooled score stops leading | Michael |
| Logged-session bucketing is out of scope | this session |
| The above-threshold split stays unresolved | `endurance-ledger.ts` header, off p146 |

## OPEN — Michael's, not the engineer's

1. How the five numbers are arranged on screen.
2. The wording of the day-screen line.
3. Whether the five appear in the plan preview at build, or only once the plan is running.

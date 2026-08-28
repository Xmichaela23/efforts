> # ⛔ SUPERSEDED 2026-08-28 — THIS ORDER DESIGNED THE WRONG THING.
>
> It surfaced Viada's **build-time dose tool** as a weekly readout. Measured: a standing block composes
> twelve IDENTICAL weeks (p120 — the standard week is built to run indefinitely), so the card would
> show one picture twelve times. What he would actually watch is four different questions.
>
> **Read `WORKORDER-the-coachs-read-2026-08-28.md` instead.** Item 3 (the strength graph) survives
> there as item 5; the plumbing survives, unrendered, with a header saying so. Everything below is
> history.

# WORKORDER — the five weekly numbers, the day-screen prompt, and the strength graph
**2026-08-27, item 3 rewritten 2026-08-28. Ruled by Michael in a review session.**

⛔ **BUILD ORDER: 1 → 2 → 3, with 4 and 5 riding along whenever.** 1 is the real build; 4 and 5 are
each a few lines. Items are independent — nothing blocks on anything else.

⛔ **THIS PLAN IS ALL VIADA.** Wendler lives on the Get Stronger path only; `frame-resolver.ts:52`
carries the ruling. Do not reason about the standing plan from 5/3/1 percentages.

---

## CONTEXT — what already exists, traced this session

- `_shared/standing-plan/endurance-ledger.ts` (`enduranceLedgerFor`) computes buckets 1–3 (sub-VT1,
  near-threshold, over-threshold minutes) plus the endurance half of bucket 4, per built week.
  Shipped `bb4275c1` + `11758613`, deployed 2026-08-27.
- ⛔ **NOTHING READS IT.** `compose.ts:2644` attaches it to the composed week as `enduranceLedger`
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
- ⛔ **THE ARRANGEMENT IS RULED (2026-08-28, mock approved).** ONE horizontal bar split into easy /
  medium-hard / hard, each segment sized to its real minutes and carrying its number. The three are
  the same unit and they sum to the week's endurance time, so the bar shows the finding the ledger
  exists for: a week the athlete calls "two hard sessions" is overwhelmingly easy minutes.
  **Work sets and reps per muscle sit UNDER the bar as two plain figures** — they are counts, not
  minutes, and they are never segments.
- ⛔ **THE SEGMENTS ARE BRIGHTNESS, NOT SPORT COLOUR.** The axis is intensity; a discipline colour
  only ever means its discipline (the logger palette law). ⚠️ And a sport-coloured bar could never
  carry orange anyway — **lifting has no minutes in these buckets at all** (p146 excludes resistance
  training), which is exactly why its numbers sit underneath as counts.
- ⚠️ A sport cut of the same total, if Michael asks for it, is a SECOND thin bar under the first —
  run and ride in their own colours, same width, same week. Not a second axis on the first bar.
- ⚠️ `ReadoutTiles` renders 2 or 3 columns and is the wrong component for the bar. The two counts
  underneath are a fit for it.
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

⛔ **THE CAUSE, TRACED 2026-08-28: THE SERIES DOES NOT FILTER BY INTENT.**
`state-trend/assemble.ts:231` (`liftSeriesFromExerciseLog`) admits any logged set with an
`estimated_1rm` and reps at or under the trusted ceiling (8, 5 on deadlift, D-417), and excludes
deload weeks (D-338, `deload.ts` reading `meta.phase`). **Nothing excludes a set that was light on
purpose.**

⛔ **THIS PLAN IS ALL VIADA — THERE IS NO 5/3/1 WAVE HERE.** An earlier draft of this item explained
the dip with Wendler's week table; `frame-resolver.ts:52` records Michael's ruling — *"if wendler has
a future at all its not in this"* — and the standing plan imports none of it. That explanation is
withdrawn.

**The real arithmetic, off Michael's own built block:** the heavy day prescribes bench at 135 lb for
1-5 reps (ME, 90-100% per `strength-grid/intents.ts:74`); the speed day prescribes the same lift at
105 lb for 2-4 reps (DE, 70-80%). Both land on the same series. Every Thursday and Friday plants a
point roughly a fifth below Monday's, on a week followed exactly.

Three changes, all field-standard (Strong / Hevy / Boostcamp):
- ⛔ **ONLY A HEAVY SET MAY MINT A MAX.** Gate the series on the set's intent — the same move that
  closed the bike easy-ride false-dip (`e8b67eaf`, gated on the shared hard-effort bins). Speed and
  hypertrophy sets keep their place in the logged-sets history; they stop moving the line.
- **A records line over the dots.** Plot the per-session estimates as points and trend the best-of.
  A best-of line cannot dip.
- **The last set's rep count beside it.** Same weight, more reps, is the progress signal this plan
  actually produces — the working number moves about 1% every three weeks (p247), so the reps are
  where week-to-week progress shows.

⚠️ **A DELIBERATE DROP READS AS A RESET, NOT A DECLINE** — when a new block's test sets a lower
working number than the last one, say so rather than drawing a fall.

⚠️ The intent already exists on the prescription side; the open question is whether it reaches
`exercise_log`. Trace that before designing a new field — this is the starved-not-absent pattern.

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

1. The wording of the day-screen line.
2. Whether the five appear in the plan preview at build, or only once the plan is running.

## THE MOCK

The approved arrangement — week 1 with no comparison, week 4 with movement and the missing-work
flag, and the day screen carrying the prompt:
https://claude.ai/code/artifact/b17996ad-36da-4f11-ba77-3e31414e2a1c

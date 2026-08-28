# WORKORDER — THE COACH'S READ

> ## ⛔ SUPERSEDED 2026-08-28, same morning, by `docs/WORKORDER-the-strength-read-2026-08-28.md`,
> which narrowed the scope to five cards. Nothing in this file was built. Kept for the four-questions
> framing only.


**2026-08-28. Supersedes `WORKORDER-state-and-day-screen-2026-08-27.md`, which designed the wrong
thing and says so at its top.**

---

## ⛔ WHAT THIS IS, AND WHY THE LAST ORDER WAS WRONG

Michael asked what the important metrics are for the State screen, off Viada. The previous order
answered with the **endurance ledger** — built, computing, unsurfaced, flagged as open work in a
handoff — and designed a screen around it.

⛔ **THAT IS HIS BUILD-TIME TOOL, NOT HIS READ.** The five buckets (easy / medium-hard / hard
minutes, work sets, reps per muscle) are what a coach uses to SET a dose. They are fixed the moment
the block is composed. **Measured 2026-08-28 on fixture-composed blocks: all twelve weeks are
identical** — 412 min, easy 317 / medium-hard 95 / hard 0, strength 37 counted sets from week 2 on.
That is `NO_SCHEDULED_DELOAD_CITE` (p120) working exactly as written: the standard week is built to
be run indefinitely. Rendered weekly, it shows the athlete one picture twelve times and calls it news.

⚠️ **THE PLUMBING FROM THAT ORDER IS KEPT AND IS NOT THE MISTAKE.** `week-ledger.ts`,
`config.standing_plan.week_ledgers`, `weekly_state_v1.week_ledger_v1`, `COACH_PAYLOAD_VERSION` 171.
It carries a header saying why it has no surface and ending *"Do not render them without a ruling."*
**Leave that in.** Item 2 below consumes part of it.

⛔ **THE LESSON, BECAUSE IT IS THE EXPENSIVE ONE.** An unsurfaced item in the docs is the most
available answer, so every session reaches for it and the backlog sets the agenda instead of the
question. When the ask is *what should we measure*, derive it from the source and the athlete FIRST,
then trace what exists. `trace-before-build` prevents rebuilding; it is not a licence to let what is
built define what should be.

---

## WHAT VIADA WOULD ACTUALLY WATCH

He is the athlete's coach and they never speak. He looks at the numbers. Four questions, and the app
answers about one:

| | question | today |
|---|---|---|
| 1 | Are you holding the **hard sessions** — the two hard and the long one | ❌ counts sessions per sport; a missed hard run reads like a missed easy run |
| 2 | Are the **two sides eating each other** | ❌ computed, with verdicts, read by nothing |
| 3 | Is the **same work getting easier** — his three signs | ⚠️ one of three |
| 4 | **Has it been six weeks** — his cadence for moving the threshold pace | ❌ nothing counts |

Plus a fifth that is a fix rather than a build: the strength graph plots the wrong number for this
plan and lets light sets drag it down.

⛔ **ALMOST NONE OF THIS IS NEW CAPTURE.** Every input below already exists somewhere in the app.
This is wiring.

---

# ITEM 1 ⛔ ARE YOU HOLDING THE HARD SESSIONS

**The biggest gap, and it needs no new data.** The plan knows which sessions are hard; the app knows
what was done; nothing joins them by importance.

Today `week_execution_v1` sends planned-vs-done COUNTS per discipline and `WeekMixBar` renders them.
Three sessions done out of five says nothing about *which* three. On this program that is the whole
question — p246 builds a week whose entire job is that the two hard sessions and the long one happen.

**What to build:** the week's hard sessions and long session, each with done / missed / moved, on the
week they belong to. Not a percentage, not a score.

⚠️ **THE HARD SLOTS ARE ALREADY NAMED.** The wizard stores them (`endurance_slots`, e.g. `1:0 ride`,
`3:0 run`) and the composer places the long session on its own anchor. Trace those before deriving
anything — the answer is stored, not inferred.

⚠️ **MISSED ≠ SKIPPED ON A STANDING PLAN.** This block repeats by design, so a missed hard session
is a fact about the week, not a debt to repay. State it, do not chase it.

# ITEM 2 ⛔ ARE THE TWO SIDES EATING EACH OTHER

⛔ **COMPUTED, WITH VERDICTS, READ BY NOTHING.** `_shared/accessory-dosing/ledger.ts` already returns
`DoseLedger.perSession` with `countedSets` and a `recovers` / `above_recovers` / `costly` verdict per
lifting session. The per-session lines are being added to `WeekLedgerV1` (2026-08-28).

**His figures, p86, verbatim in substance:** a 14+ work-set session *"may diminish performance in
other modalities significantly for twenty-four hours and still notably for up to seventy-two"*; a 6-8
set session *"may result in only marginal performance deficits for twenty-four hours."*

**What to build:** on a lifting day, its work-set count and what it costs the next day. On Michael's
own block, week 6: heavy upper 11, heavy lower 8, speed upper 9, speed lower 9.

⛔ **THE FIGURE IS PER SESSION, NOT PER WEEK.** A week total cannot answer this and must not be used.

⚠️ **AND THE PAIRING IS ALREADY IN THE FRAME.** p247 names it: Monday's hard endurance sits before
Tuesday's heavy lower, and he prescribes a 3-4% lower-body haircut for the first weeks because of it,
phasing out over eight to ten weeks. Check whether that haircut is implemented before building
anything that describes it.

⚠️ **DE and SKILL sets are reported both ways and always will be** (`dose.ts:159-163`). Print the
counted figure; keep `totalIfAllCounted` on the payload.

# ITEM 3 ⛔ IS THE SAME WORK GETTING EASIER — HIS THREE SIGNS

p123, and the third one is the surprise:

> *"lower heart rate at completion, lower reported RPE, reducing rest periods on variable-rest
> workouts such as self-led fartleks"*

⛔ **THREE SIGNS, AND ONE OF THEM IS FEEL.** An earlier reading of this corpus called his adjustment
guidance entirely objective; that is corrected in the source file. Reported effort sits beside the
objective two, not underneath them.

| sign | state today |
|---|---|
| heart rate lower at the same pace | ✅ computed — run drift + efficiency, bike power + efficiency, gated to steady aerobic sessions |
| reported effort lower | ⛔ **collected after every session (`PostWorkoutFeedback`, 1-10) and thrown away** |
| less rest taken when the rest is the athlete's | ⛔ never measured — **and it became measurable this month**, the strides recovery is now an untimed lap-button step, so the watch returns the real duration |

**What to build:** all three, on the same sessions, trended over weeks. Not a per-session verdict.

⚠️ **SIGN 3 HAS A SECOND HOME:** p98 — subthreshold repeats are *"separated by full rest or walk
periods that allow you to complete subsequent sets while feeling relatively 'fresh.'"* The rest is
untimed on purpose; that is why its shrinking is a signal at all.

# ITEM 4 ⛔ HAS IT BEEN SIX WEEKS

p123 gives the cadence and the consequence, and nothing in the app counts either:

> *"…**after six weeks** of training and rotating in numerous intervals and percentages… the coach may
> lower (speed up) the threshold pace by several seconds per kilometer and base the new training
> cycle on this updated figure."*

⛔ **HE MOVES THE TARGET, NOT THE VOLUME.** Every sign in item 3 feeds the threshold pace the next
cycle is written from. Nothing on these pages says an athlete adds or cuts weekly hours by feel.
⚠️ p149 is the one place he does say to move volume by feel, and it is about backing off ALL buckets
equally when taxed — a different instruction from this one. Do not merge them.

**Depends on item 3.** Build after it.

⚠️ **AND THE STRENGTH SIDE HAS ITS OWN RATE, ALREADY HONOURED:** p247, *"1 percent every 3 weeks as a
starting point."* Do not re-derive it here.

# ITEM 5 ⛔ THE STRENGTH GRAPH — REPS AT THE SAME WEIGHT

Carried unchanged from the superseded order's item 3, which was itself rewritten once. The cause is
traced: `state-trend/assemble.ts:231` admits any logged set with an `estimated_1rm` under the trusted
rep ceiling and excludes deload weeks (D-338) — **nothing excludes a set that was light on purpose.**

⛔ **THIS PLAN IS ALL VIADA.** Wendler is the Get Stronger path only (`frame-resolver.ts:52` carries
Michael's ruling). Do not reason about the standing plan from 5/3/1 percentages.

**The arithmetic, off Michael's own block:** heavy day prescribes bench at 135 for 1-5 reps (ME,
90-100%, `strength-grid/intents.ts:74`); speed day prescribes the same lift at 105 for 2-4 (DE,
70-80%). Both land on the same series. Every speed day plants a point about a fifth below the heavy
one, on a week followed exactly.

- ⛔ **Only a heavy set may mint a max.** Gate the series on intent — the move that closed the bike
  easy-ride false-dip (`e8b67eaf`). Light sets keep their place in the logged history.
- **A records line over the dots.** A best-of line cannot dip.
- **The last set's rep count beside it.** The working number moves ~1% every three weeks (p247), so
  reps at the same weight is where progress actually shows on this program. Bench sits at 135 from
  week 2 to week 9 by design.
- ⚠️ **A deliberate drop reads as a reset, not a decline.**

⚠️ The intent exists on the prescription side; whether it reaches `exercise_log` is the trace to do
first. Starved, not absent.

---

## RULED — do not re-litigate

| ruling | source |
|---|---|
| The five buckets are a build-time tool and get no weekly surface | measured: twelve identical weeks |
| The plumbing already built is kept, unrendered | this order |
| Work sets counted = ME + HYP; the all-counted figure stays on the payload | p146's fatigue test, `dose.ts:159` |
| The interference figure is per session, never per week | p86 |
| Reported effort is one of his three signs, not a lesser one | p123, correcting an earlier reading |
| He moves the threshold pace, not the weekly hours | p123 |
| The lower-bound is ~5 min in 412, all easy — no copy for it | measured 2026-08-28 |
| The missing-work prompt belongs on the day's plan screen, not State | Michael, 2026-08-27 |
| The load gauge keeps the ratio; the pooled points total stops leading | Michael, 2026-08-27 |
| The energy / soreness / sleep row comes off State | never written by anything under `src/` |

## OPEN — Michael's

1. The hard number: `overThresholdMinutes` is always 0 by design, `overVt2Minutes` holds the real
   minutes above threshold unsplit. Any surface printing "hard" must choose, and neither is honest
   without a ruling.
2. An athlete with no measured threshold loses ~10% of their minutes to `unplacedMinutes` with a
   stated reason. Show the gap and name it, or show nothing until they have a threshold.
3. The wording of the day-screen missing-work line.

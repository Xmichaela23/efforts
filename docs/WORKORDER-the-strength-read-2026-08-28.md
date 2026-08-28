# WORKORDER — THE STRENGTH READ

> ## ⚠️ STATE: BUILT AND DEPLOYED 2026-08-28. **NOT VERIFIED.**
> Items 1, 2 and 3 are built, deployed (`compute-facts` 125 · `compute-snapshot` 142 · `coach` 470 ·
> `workout-detail` 351 · `analyze-cycling-workout` 217 · `generate-strength-plan` 175 ·
> `rematerialize-standing-block` 51 · `materialize-plan` 308) and pushed (`ead07380`). **Nobody has
> seen any of it work.** `docs/DEPLOY-OWED.md`'s top entry carries what to look for.
>
> ⛔ **THREE RULINGS HERE WERE SUPERSEDED DURING THE BUILD — read the deltas or you will rebuild the
> wrong thing:**
> 1. The word does NOT come from distance to the expected curve. There is no band. It comes from
>    completed reps, via `meSessionOutcome`, and the words are **Stalled · On track · Moving up**.
> 2. The e1RM gate **fails CLOSED** (only `ME` mints), reversing an earlier fail-open ruling.
> 3. The line is **rolling across blocks**, not block-scoped; only the faint curve is block-scoped.
>    The mock's caption naming the line "your working weight" is wrong — the line is the estimated
>    max off heavy sets.
>
> ⚠️ **ITEMS 4 AND 5 ARE NOT BUILT.** The energy/soreness/sleep row is still on State, and the load
> gauge still leads with the pooled points total. Both remain open.

**2026-08-28. Michael ruled the scope and approved the mock. Supersedes
`WORKORDER-the-coachs-read-2026-08-28.md`, which was written the same morning and scoped too wide.**

APPROVED MOCK: https://claude.ai/code/artifact/7ceb3a2b-67a8-4b6b-b9df-b2601955b735

---

## ⛔ THE SCOPE, AND WHY IT IS THIS NARROW

Michael: *"I really want to just focus on strength right now because he himself has said there's no
holistic way of measuring this."* Five cards. Nothing else on this order.

⛔ **THE ENDURANCE MINUTES ARE OFF THE TABLE.** The `week_ledger_v1` payload built on 2026-08-28
stays exactly where it is — persisted, typed, unrendered, with its header saying so. **Do not surface
it.** It answers what you did, not whether it is working.

⛔ **AND THE SHAPE IS NOT NEW.** *"From your logged sets"* already renders one row per main lift with
the working weight against the tested max (D-374, filtered by `capabilitiesForExercise(...).coached`,
`StateTab.tsx:1244-1263`). `TrendSparkline` already exists. **This is a change to rows that exist,
not a new screen.** Trace both before writing anything.

---

## THE PRECEDENT — so nobody re-derives it

- **Prilepin's table** (Soviet weightlifting): every rep on the MAIN lifts is counted and sorted by
  intensity zone; accessories are not tracked; nothing under 50% counts. Above 90%: 1-3 reps a set,
  4 optimal per session.
- **Viada is two rows of that table**, p80: *"4 to 6 repetitions over 90 percent and 15 to 20
  velocity-focused repetitions per week (between 70 percent and 85 percent)."*
- **His rate**, p247: *"slow gradual increases in the calculated 1RM… every 3 to 4 weeks (assume 1
  percent every 3 weeks as a starting point)."* **That is the expected line.**
- **Only near-failure sets count as volume** — field standard (RP volume landmarks, ~RPE 6+) and
  Viada's own fatigue test agree. `dose.ts:159` already reaches this.

---

# 1. ⛔ ONE CARD PER MAIN LIFT — HEAVY DAYS ONLY

**Big number:** the working weight now. **Under it:** the reps logged last time at that weight, and
the reps at the first week of that weight. **Behind it:** a twelve-week line — the actual working
weight against the expected curve at 1% every three weeks. **One word:** on track / ahead / behind.

⛔ **HEAVY SETS ONLY, EVERYWHERE ON THIS CARD.** The heavy set is ME, 90-100%
(`strength-grid/intents.ts:74`). Speed is DE at 70-80%, skill 75-85%, hypertrophy 6-12 reps. On
Michael's own block bench is **135 on Monday and 105 on Thursday** — the same lift, twenty percent
apart. A speed set may never move the number, the line, or the word. It keeps its place in the
logged-sets history.

⛔ **NO ACCESSORIES.** The Soviet logs excluded them and the plan's progression does not live there.
⚠️ Michael's Q-251 direction still stands separately: by-feel work is read against the athlete's own
history, never a tested max. Not this order.

⚠️ **TRACE FIRST — STARVED OR ABSENT?** `state-trend/assemble.ts:231` admits any set with an
`estimated_1rm` under the trusted rep ceiling and excludes deload weeks (D-338). Nothing excludes a
set that was light on purpose. **The intent exists on the prescription side; find out whether it
reaches `exercise_log` before designing a field.** This is the CLAUDE.md starved-not-absent pattern.

⚠️ **THE EXPECTED CURVE IS ALREADY IN THE PLAN.** All twelve weeks of prescribed weights are stored
at build. Read them; do not recompute a projection.

# 2. ⛔ ONE RUN CARD — THE SAME SESSION, WEEK BY WEEK

The near-threshold run, its average heart rate, one line across the block. The session is identical
every week by design (p120 — the standard week is built to be run indefinitely), **so any change in
the line is the athlete, not the workout.** That is the whole reason this reads cleanly.

⚠️ **NARROWER THAN WHAT IS THERE NOW.** The existing run row trends efficiency and drift across ALL
steady runs. This is ONE named session repeated. Do not delete the existing row to build this;
establish whether the session can be identified week to week first.

# 3. ⛔ THE GRAPH STOPS COUNTING SPEED SETS

Same gate as item 1, applied to the existing e1RM series and its records line. The precedent is the
bike easy-ride false-dip (`e8b67eaf`), gated on shared hard-effort bins — same disease, same cure.
Add a records line over the dots; a best-of line cannot dip.

⛔ **THIS PLAN IS ALL VIADA.** Wendler is the Get Stronger path only — `frame-resolver.ts:52` carries
Michael's ruling. Two earlier drafts of this item reasoned from 5/3/1 percentages and were wrong.

---

## RULED — do not re-litigate

| ruling | source |
|---|---|
| Strength only for now; endurance gets one card | Michael, 2026-08-28 |
| Heavy sets only — speed and hypertrophy never move the number | p146 fatigue test, `dose.ts:159`, and the field standard |
| No accessories on these cards | Soviet practice; the progression is on the main lifts |
| The expected line is 1% every 3 weeks | p247 |
| The endurance minutes payload stays unrendered | measured: twelve identical weeks |
| The load gauge keeps its ratio; the pooled points total stops leading | Michael, 2026-08-27 |
| The energy / soreness / sleep row comes off State | nothing under `src/` writes it |

## OPEN — Michael's

1. **The band for "on track."** How far off the expected line before it reads behind or ahead.
   ⚠️ Propose one from the source and the field, with the arithmetic, and hold for his ruling — do
   not pick it silently. Note that a 1%-per-3-weeks curve moves less than one plate for most
   athletes, so the band cannot be a raw pound figure.
2. **What a lift with no heavy history shows** — before the first heavy session of a block, and for
   an athlete who has never logged one.

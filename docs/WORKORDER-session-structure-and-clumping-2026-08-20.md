# 2026-08-20 — four findings from one built block

All four came off ONE Strong Focus build (`strong-focus (13).md`) that Michael tapped through and
exported. Every claim below is verified against that export or against the code, and each says which.

**The athlete's answers:** 18 mi across 4 runs · 3 h across 2 rides · long run Sunday · long ride
Saturday · hard run Tuesday (Speed focus) · hard ride Friday (sustained threshold).

**What week 1 built:**

```
Mon  Easy Run 51m          · Bench Press 1h12
Tue  Back Squat 1h12       · Flat Sprints 14m
Wed  Easy Run 1h03
Thu  —
Fri  Deadlift + OHP 1h12   · Threshold Ride 24m
Sat  Long Ride 2h15
Sun  Long Run 1h16
```

⚠️ **THE SESSION COUNTS ARE CORRECT — 4 runs, 2 rides, exactly as asked.** Do not go looking for a
missing-session bug. Michael's *"not sure if the endurance work is showing up properly"* is answered:
it is. What is wrong is the SHAPE of two of those sessions and where the disciplines sit.

---

## 1. ⛔ THE HARD SESSIONS HAVE NO WARM-UP, AND THE LEFTOVER BUDGET IS DROPPED

**VERIFIED in the export. This is the one that can hurt someone.**

| session | prescription | duration built | content |
|---|---|---|---|
| Threshold Ride | `4 × 5 min at threshold, 1 min easy between` | **24m** | exactly the intervals, nothing else |
| Flat Sprints | `6 × 12 s maximal, walking back, 2-3 min between` | **14m** | exactly the intervals, nothing else |

⛔ **THE SPRINT SESSION IS THE WORSE HALF.** Six maximal 12-second efforts with no warm-up is a
hamstring injury waiting to happen. The threshold ride is a quality problem; this is a safety one.

⛔ **AND THE WEEKLY BUDGET IS LEFT UNSPENT.** 3 h asked = 180 min. Long ride 135 + threshold 24 = 159.
**21 minutes unassigned.** The athlete asked for three hours and got two thirty-nine.

**Michael's fix, and it is the right shape:** the generator computes the core work block FIRST, then
spends the remaining weekly budget as an easy-pace warm-up and cool-down wrapper around it. The
budget stops being a number that leaks and becomes the thing that sizes the wrapper.

⚠️ **AND A FLOOR IS NEEDED WHEN THERE IS NO LEFTOVER.** A week whose budget is fully consumed by the
long day must still not prescribe a bare maximal sprint. The wrapper has a minimum; the leftover
budget decides how much MORE than the minimum it gets. ⛔ Do not let the arithmetic produce a
zero-warm-up session under any input.

### ⚠️ ONE CORRECTION TO THE REPORT, AND IT MATTERS

Michael also called the Friday pairing a collision — *"asking the legs to jump straight into
threshold power on the same day as heavy deadlifting."* **The pairing itself is a deliberate ruling
and must not be undone.** `_shared/week-model/model.ts` `PAIRING`: the deadlift pairs with the hard
RIDE *because* the ride is seated and structurally supported, barbell first, `COUPLED_GAP_HOURS = 6`.
It is a claim about tissue, recorded with its reasoning.

⛔ **The finding is sharper without that part:** the pairing assumed the ride had a proper structure,
and it does not. Fix the session; leave the pairing alone.

---

## 2. ⛔ THE ANTI-CLUMPING TERM CANNOT SEE CLUMPING

**VERIFIED by computing the score. Michael: *"I thought we built something to avoid sports from
clumping together."* It is built. It does not work.**

The week runs **Mon-Tue-Wed** and rides **Fri-Sat** — three of one, then two of the other.

`interleaving()` in `_shared/week-model/resolve.ts` counts how many of one sport's days fall
strictly INSIDE the span of the other sport's days:

```js
const lo = runs[0], hi = runs[runs.length - 1];
return rides.filter((d) => d > lo && d < hi).length;
```

⛔ **RUN THE NUMBERS AND THE TERM IS REVEALED AS BLIND:**

```
this week      runs [Mon,Tue,Wed,Sun]  rides [Fri,Sat]   → score 2
alternating    runs [Mon,Wed,Fri,Sun]  rides [Tue,Thu]   → score 2
```

**Identical.** The span runs Monday to Sunday because there is an easy run early and the long run at
the weekend, so EVERY ride placement except Monday or Sunday scores maximum. The term fires at full
strength on a fully clumped week and cannot prefer the alternating one.

⚠️ **IT IS NOT BROKEN CODE — IT IS THE WRONG MEASURE.** It asks "is one sport bracketed by the
other", which a long-run-Sunday week answers YES to always. What Michael means by clumped is
CONSECUTIVE SAME-SPORT DAYS.

⚠️ **`clustering()` LOOKS LIKE IT ALREADY DOES THIS AND DOES NOT.** It only counts back-to-back days
between units whose sessions are ALL `easy` and the same sport. Tuesday's Flat Sprints is
`hard_cardio`, so Mon-Tue-Wed is invisible to it too. ⛔ Read both terms before writing a third — the
name you would pick is taken by something narrower.

⛔ **AND MIND THE WEIGHT ORDERING SET ON 2026-08-19** (`D-...`, see `resolve.ts` `score`):
`overCap 60` > `blank 40` > `lockedDayExtras 24 + crowding 6`. A new spread term must not outbid the
blank day. **The 61-shape sweep is the gate** — `scripts/dump-plans.ts`, and 58 of 61 must stay
byte-identical unless the change is genuinely meant to move them.

---

## 3. ⚠️ THE LONG-RUN AND LONG-RIDE ROWS LINGER — UNTRACED

Michael: *"long run and ride sorta linger until they are clicked a couple of times when selecting."*

⚠️ **THIS IS NOT THE 2026-08-19 TAP BUG** (`6386df81`, the `!== 'hard'` render gate). The taps DO
register: in one screenshot both rows read Sunday and the week below updated to match. The row does
not settle.

**Where to look:** `NonRaceBuilder.tsx`, the schedule card's `long` / `ride` rows and
`setScheduleQuestion` (`:4637`). Candidates, in order — a state write that lands a render late; the
mount effect added on 2026-08-19 that writes the default over `null`; the accordion re-resolving
`scheduleAsk` while a tap is in flight. ⛔ **Reproduce it before theorising** — it is the only one of
the four with no trace behind it.

---

## 4. ⚠️ TWO SMALLER DISAGREEMENTS, BOTH QUESTIONS

**a. The preview says 35m, the plan says 14m.** The wizard's week card showed `Flat Sprints 35m`;
the built plan says `0h 14m`. Same session, two numbers. Either the preview estimates a wrapper the
composer never builds — in which case finding 1 explains it and the preview was RIGHT — or two
places compute duration differently. ⛔ Settle which before touching either.

**b. The saved preference contradicts the built plan.** The export's preference block reads
`Quality Run Terrain: hill_3min`, and the plan correctly built **Flat Sprints** (Speed focus).
The plan is right; the stored answer disagrees with it. Harmless today, load-bearing the moment
anything re-reads that field to rebuild or explain the block.

---

# HOW TO WORK THIS

**Order:** 1 (safety + budget) → 2 (clumping) → 3 (the lingering row) → 4 (the two questions).

⛔ **DO NOT:**
- undo the deadlift + hard-ride pairing — it is a ruled decision with its reasoning in `model.ts`
- weaken any `COST` cell in `_shared/week-model/model.ts`; Layer 1 is settled and its 18 tests pass
- let a new spread term outbid the blank day (see the ordering above)
- tune anything to Michael's numbers — his export is the symptom, not the spec. Verify across the
  61-shape sweep and a range of athlete shapes. **If a fix only works at his paces it is the wrong fix.**
- believe a new test until you have mutated it. **Two of three test files written on 2026-08-19 passed
  with the code deleted**, and one guard written that day was unreachable behind the filter in front
  of it.

⚠️ **Deploy note:** the session generator and the composer live in edge functions
(`generate-strength-plan` bundles `strength-primary-plan.ts`); the wizard is client-only and ships on
push. Say which of the three states each change reaches — **pushed**, **deployed**, **verified**.

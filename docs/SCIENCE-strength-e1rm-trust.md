# The math behind the strength maxes (e1RM trust) — D-417, D-420

**Written 2026-08-11.** This is the evidence file for one decision: *an estimated 1-rep max only counts when
it comes from a low-rep set.* It exists because the call rests on training science and commercial-app
practice, not on our own opinion — so it should be checkable by anyone, not taken on trust. Every claim
below has a source.

---

## 1. The problem, in one example

An estimated 1-rep max (e1RM) is a formula's guess at the most you could lift once, worked out from a set
you actually did. The formula climbs with reps. Past ~10 reps it climbs *too fast* and stops describing a
real max.

On Michael's own logged data, un-gated, that produced nonsense — the "max" ranked by **reps**, not weight:

| Deadlift set | reps | e1RM the formula gives |
|---|---|---|
| 105 lb × **35** | 35 | **225 lb** ← highest, so it read as his "best" |
| 110 lb × **25** | 25 | 200 lb |
| 120 lb × **5** | 5 | 155 lb ← his *heaviest* bar, near the bottom |

His heaviest actual lift (120) produced the *lowest* number, and a lighter bar for 35 reps read as a 225 lb
max he never lifted. The summary number, the trend graph, and the "best" tag were all reading that inflated
series — so they were tracking *how many reps he did*, not how strong he is.

---

## 2. The science: an e1RM is only reliable at low reps

**The formulas are validated in the 1–10 rep range, and best at 2–6.** For sets in that range, well-validated
equations (Epley, Brzycki) predict a true 1RM within about **5–10%** (≈3–7% in the 3–6 rep sweet spot).
**Accuracy degrades significantly beyond ~10 reps** — there is too much variation in muscular endurance
between people for a rep-heavy set to pin a single-rep max. [1][2]

Why it breaks, by formula:
- **Epley** (`weight × reps × 0.0333 + weight`, what Efforts uses) is *linear* — it just keeps adding weight
  as reps rise, so a 35-rep set yields a huge, meaningless number (105 × 35 → ~227).
- **Brzycki** (`weight × 36 / (37 − reps)`, what Strong uses) is *worse* at high reps — it has a division that
  blows up toward 37 reps and goes negative above it. [3]

**The strength world doesn't collapse a high-rep set into a 1RM at all.** Coaches track a separate record
for each rep range — a 2-rep max (~95% of 1RM), a 5-rep max (~87%), a 10-rep max (~75%). A 35-rep set is a
*35-rep record*, a different thing from a max. [1]

**Deadlift is a special case — its estimate runs low, so its ceiling is tighter.** LeSuer et al. (1997) tested
seven equations across bench, squat and deadlift and found every one *under*estimates a deadlift 1RM — a bias
with a direction, not just noise. So the deadlift is trusted only to **5 reps**, everything else to **8**.
[4] (This ceiling predates D-417; it already lived in `wendler-531.ts` and gated the all-out-set card.)

---

## 3. What the apps do

- **Strong** — computes e1RM per set (Brzycki) and graphs it, but its own docs state that **above ~12 reps
  the estimate "breaks down significantly and will likely not reflect real world performance."** It shows the
  exercise and its estimate from the first low-rep session; records are tracked by category. [3]
- **Hevy** — same shape: an e1RM estimate per lift plus separate records (heaviest weight, best e1RM, most
  reps). A high-rep effort is its own record, not a max. [5]
- **5/3/1 (Wendler)** — you never turn a rep-out into a 1RM. Weights come off a **Training Max**; the thing you
  track on the top set is the **rep record**. Wendler, p10: *"if your squat goes from 225×6 to 225×9, you've
  gotten stronger… if you keep breaking your rep records, [your max] will go up."* You adjust the Training
  Max at the end of a cycle and every weekly weight recalculates from it. [6]
- **Fitbod / Juggernaut** — program apps that adjust weight, but by *autoregulating from logged performance*,
  not by reading a 1RM off a rep-out. [7]

**The consensus is unanimous:** estimate a max only from a low-rep set; keep a high-rep effort as its own
record. That is exactly what we did.

---

## 4. What we shipped (and where it lives in code)

| Decision | What it does | Source of truth |
|---|---|---|
| **Trust ceiling** | An e1RM counts only if the set is ≤8 reps (≤5 on deadlift). | `trustedMaxReps()` in `src/lib/estimate-1rm.ts`; provenance in `wendler-531.ts`. |
| **The trend/summary/sparkline** | The per-lift e1RM *series* excludes sets past the ceiling, so records, the top number and the graph read only real low-rep strength. | `liftSeriesFromExerciseLog` gate in `state-trend/assemble.ts`; reps fed from `compute-snapshot`. |
| **The "best" tag** | Marks the strongest *trusted* set; a high-rep set can't win it. No trusted set → no "best". | `StateTab.tsx` dropdown. |
| **The per-set estimate in the history** | Shown only on trusted sets; a high-rep row shows just the set (`80 lb × 17`), no e1RM. | `StateTab.tsx` dropdown. |
| **Rep records stay** | A high-rep set still surfaces as a "Rep PR" — the honest record for that effort. | `strength-row-text.ts` (`composeAllOutRowText`). |

**Result, verified end-to-end** (called the live server, 2026-08-11):

| Lift | Before (inflated) | After (trusted) |
|---|---|---|
| Squat | 125 | **105** (85 × 5) |
| Bench | 160 | **120** |
| Deadlift | 200 | **155** (120 × 5) |
| Overhead | 105 | **100** |

The numbers dropped, but that isn't lost strength — the old numbers were never real. The maxes now rank by
weight, the way a lifter reads them.

---

## 5. What we deliberately did NOT do

- **We did not change the per-set math or "cap" reps.** The estimate is still computed honestly for every set
  and shown where it's trustworthy (D-339). Silently capping a 35-rep set to look like a 10-rep set would be
  its own lie — the fix is to *not count* the untrustworthy estimate, not to fake a smaller one.
- **We did not invent a number.** An external-weight e1RM is only ever computed from a set the athlete
  actually logged.
- **We did not tune to Michael.** The ceiling (8 / 5) is the field's, and it applies to any athlete and any
  protocol. His data is only the worked example.

**One known edge, left as a follow-up:** an athlete whose *only* recent sets are high-rep would have no trusted
reading, so the lift falls to the existing "needs data" state. A dedicated "log a heavier set to read your
max" message would be clearer. Michael has low-rep sets, so this doesn't affect him today.

---

## 6. Progress is a record + a chart, not a weekly verdict (2026-08-12, D-420)

§4 fixed the *number*. A subtler mistake sat on top of it: a weekly per-lift **direction verdict** —
"improving / sliding / needs_data." No commercial app computes that, and on a 5/3/1 wave it lies.

5/3/1 waves the weight by design (light/high-rep → heavy/low-rep) and progresses wave-over-wave. A
first-to-last direction on a short window reads the *within-cycle* wave as a trend. On Michael's live
data it printed "1 lift trending down" and an overall "sliding −8.2%" on a deadlift that was simply
running the program — 105×35 → 110×25 → 115×20, one cycle's three weeks. The first fix (D-419) trended
the all-out set instead; it did not help, because his all-out sets are 20–35 reps — above the reliable
range (§2) — so their estimate slides across the wave too.

**The universal method (§3) has no weekly verdict.** Progress is three things:
- **The e1RM record** — best trusted e1RM to date, per lift. Monotonic: it ticks up when you beat it,
  never slides from a lighter week (a max can't be dragged down by an average).
- **Rep PRs** — most reps at a weight (Wendler p10); honest at any rep count, and the home for the
  high-rep all-out sets the e1RM record can't use.
- **The chart** — the e1RM line over the block; the human reads the slope. This is the lifter-with-the-
  book-and-a-spreadsheet's actual method.

If a direction word is ever stated, it may only be computed over a window that **spans whole cycles**
(≥2 waves), so the wave sits inside the window instead of splitting it.

**Pending build:** retire the weekly direction verdict from the strength row; keep e1RM record + rep PRs
+ the chart. This reverses the *direction* half of D-419 — the protocol-declared gauge infrastructure
(`readsEffortAs`) stays; the weekly *verdict* it fed goes.

---

## Sources

1. [1RM formula accuracy by rep range — NORMA Athletics](https://www.norma-athletics.at/guides/1rm-formulas-explained/)
2. [How to calculate e1RM: 7 formulas + rep-range validity — Strength Journeys](https://www.strengthjourneys.xyz/articles/how-do-i-calculate-my-e1rm-estimated-one-rep-max)
3. [What does 1RM mean? (Brzycki; >12 reps breaks down) — Strong Help Center](https://help.strongapp.io/article/133-1rm)
4. LeSuer, McCormick, Mayhew, Wasserstein & Arnold (1997), *JSCR* 11(4):211-213 — every tested equation
   underestimates deadlift 1RM. (Cited in `wendler-531.ts`.)
5. [Gym performance tracking (records + e1RM) — Hevy](https://www.hevyapp.com/features/gym-performance/)
6. [The Training Max — Jim Wendler](https://www.jimwendler.com/blogs/jimwendler-com/101082310-the-training-max-what-you-need-to-know); 5/3/1 2nd ed. p10, p32.
7. [Fitbod algorithm Q&A (autoregulation) — Fitbod](https://help.fitbod.me/hc/en-us/articles/16254175592215-Fitbod-s-Algorithm-Q-A)

> **Doc status:** the evidence record for D-417. When the DECISIONS-LOG entry for D-417 is written, point it
> here rather than restating the sources. Kept because the reasoning is the kind that rots when it lives only
> in commit messages.

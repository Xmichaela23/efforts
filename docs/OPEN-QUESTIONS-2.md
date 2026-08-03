# Open Questions — Part 2 (Q-251 onward)

Don't "fix" intentional behaviors. Numbered `Q-NNN`, tagged cosmetic / intentional / unverified.

⛔ **A `Q-NNN` is a LEAD, not a verified bug.** The point of this doc is to stop the next session from
"fixing" something that someone already considered and chose to leave. **Read the entry before acting
on it** — Q-166 was picked up as an obvious bug and produced a live false "pull back" that had to be
reverted.

---

## 📁 WHERE TO FIND A QUESTION

**The number tells you the file. Numbering NEVER restarts — a `Q-NNN` exists exactly once, anywhere.**

| range | file | status |
|---|---|---|
| **Q-001 → Q-129** | [`archive/OPEN-QUESTIONS-archive-Q001-Q129.md`](archive/OPEN-QUESTIONS-archive-Q001-Q129.md) | frozen, **still authoritative** |
| **Q-130 → Q-250** | [`OPEN-QUESTIONS.md`](OPEN-QUESTIONS.md) | frozen 2026-08-02, **still authoritative** |
| **Q-251 →** | **this file** | live — new entries go here |

⛔ **FROZEN DOES NOT MEAN ANSWERED.** The frozen file is mostly **live questions** — that was measured,
not assumed. Of its 120 entries, the genuinely finished pile is roughly **10–15**; the rest are open,
half-open, or marked *intentional* (which are the ones you most need to find, because they are what
stops you "fixing" a deliberate choice). **Always grep both:**

```bash
grep -rn "Q-183" docs/OPEN-QUESTIONS*.md docs/archive/OPEN-QUESTIONS-archive-*.md
```

> **Why this file exists (2026-08-02).** The old rule said "archive the closed entries." Detecting
> "closed" was tested against this file and **it does not work**: the check flagged **Q-247 as closed
> while it was the live question being worked on**, and **Q-246 as closed when only half of it was** —
> and the open half is the one warning that `plannedWorkout` must not be deleted. Burying it would
> have cost a broken ride analyzer. **Judging entries is where the danger is, so we stopped judging.
> Freeze at a number, start the next file, move no text.**

---

## Q-251 — Planned load counts three-fifths of a strength session as ZERO, so planned-vs-actual is not a real comparison (2026-08-02) — **PARKED as a deep dive. Michael: not the next area of focus.**

⛔ **DO NOT "FIX" THIS BY PUTTING A SET COUNT ON ASSISTANCE ROWS.** That is the obvious patch and it is
the wrong one — it would re-prescribe work that is deliberately unprescribed. Read the direction at the
bottom before touching anything.

### The trace (verified against the live DB, 2026-08-02)

The Jul 31 strength prescription, as stored in `planned_workouts.strength_exercises`:

| row | sets | reps | weight |
|---|---|---|---|
| Box Jump | 3 | 5 | Bodyweight |
| Deadlift | 3 | `5+` | 105 |
| Dips | **absent** | `25 total` | By feel |
| Chin Up | **absent** | `25 total` | By feel |
| Reverse Lunge | **absent** | `25 total` | By feel |

`calculatePlannedStrengthWorkload` (`_shared/workload.ts`) gates on `sets > 0 && reps > 0`. The three
assistance rows carry **no `sets` field**, so they price at **ZERO**. The completed side prices them in
full — 4,000 lb each on that session.

**Measured, this week:** planned strength **57**, actual **267** — 4.7×, and 12× on Jul 30 (planned 6,
actual 75). Session level, Aug 1: planned ≈ 3,975 against actual 18,925.

### Two of our own decisions collide, and neither is wrong on its own

- **[D-348]** (2026-08-01) made bodyweight count as load and wrote the law: *"All three or none: fixing
  the completed side alone makes every session read heavier than planned."* It even pinned it
  (`workload-strength-planned.test.ts`).
- **[D-370]** (2026-08-02) made assistance a **rep total with no per-set plan** — Michael: *"you either
  did or you didn't"* — which removed the exact field D-348's planned pricing depends on.

The law held. The **shape of the prescription changed underneath it**, so the guard never fired: the
rows are not mispriced, they are *invisible*.

### ⚠️ SCOPE — SMALLER THAN IT FIRST LOOKS. Do not repeat this session's overstatement.

**NOT affected — these read `workouts.workload_actual` only and are trustworthy:** ACWR, the load
verdict, readiness, the load-mix bars. `_shared/acwr.ts` says it outright — *"CANONICAL is
`workouts.workload_actual`."* **Michael confirmed the "load a bit high" read matched how he actually
felt.** An earlier claim in this session that the bug fed ACWR was WRONG and was retracted.

**Affected — anything comparing planned to actual:** the State planned-vs-actual bars, and the coach's
one LLM sentence, which on 2026-08-02 read *"Strength came in heavier than planned — it carries into
next week's rolling load."* ⛔ **That sentence is not an LLM hallucination.** It narrated the broken
number faithfully. Deleting the sentence would hide the symptom and leave the distortion — the model is
not the bug here.

### The direction Michael set (2026-08-02) — this is the design, not a patch

> *"we should be able to accept what user enters for the vibed out accessory work and track it as they
> go and look for their own reporting of soreness or not making the numbers and use that"*

Accessory work is **deliberately vibed** — prescribed as a rep total, done by feel. So the answer is
**not** to manufacture a planned number so the ratio balances. It is:

1. **Accept what the athlete enters** as the truth for accessory work — it is the only real number.
2. **Track it as they go**, rather than scoring it against a prescription that was never made.
3. **Read the signal from the athlete, not the ratio** — their own soreness reporting, and whether they
   are missing the numbers they set themselves.

⚠️ Which means the open question is **what "adherence" even means for work that was never prescribed** —
and that is a product question, not a maths one. That is why it is parked rather than queued.

### To close

Rule on (3) first — what earns an adherence statement for by-feel work. Then decide whether the planned
side should price accessories at all, or whether planned-vs-actual should simply **stop being shown**
for them (it is already dropped from the session screen's Planned COLUMN per [D-370] — State did not
get the memo). See also [Q-233] (deliberate bodyweight imprecisions) and [D-351].

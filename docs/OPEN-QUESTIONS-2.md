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

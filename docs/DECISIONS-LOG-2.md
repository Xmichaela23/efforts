# Decisions Log — Part 2 (D-373 onward)

Append-only record of architecture / design decisions worth preserving across sessions. Each entry
captures **why** the call was made, what was rejected, and what tradeoff is being lived with — so the
next session doesn't re-debate (or worse, undo) settled choices.

---

## 📁 WHERE TO FIND A DECISION

**The number tells you the file. Numbering NEVER restarts — a `D-NNN` exists exactly once, anywhere.**

| range | file | status |
|---|---|---|
| **D-001 → D-239** | [`archive/DECISIONS-LOG-archive-D001-D239.md`](archive/DECISIONS-LOG-archive-D001-D239.md) | frozen, **still authoritative** |
| **D-240 → D-372** | [`DECISIONS-LOG.md`](DECISIONS-LOG.md) | frozen 2026-08-02, **still authoritative** |
| **D-373 →** | **this file** | live — new entries go here |

⛔ **FROZEN DOES NOT MEAN DEAD.** Every one of those entries is as binding as the ones in this file.
They were split because a 484KB doc is ~120k tokens and stops being readable, **not** because their
contents stopped counting. **Grep all three before reversing anything:**

```bash
grep -rn "D-267" docs/DECISIONS-LOG*.md docs/archive/DECISIONS-LOG-archive-*.md
```

⛔ **When you supersede an older entry — in ANY of the three files — GO BACK AND ANNOTATE IT.** Write
the back-annotation as a `>` blockquote at the TOP of the old entry: what changed, where in code, and
"everything below is history." See the end-of-session protocol in `CLAUDE.md`.

> **Why this file exists (2026-08-02).** The previous rule said "move the CLOSED and superseded entries
> to an archive." That rule can never fire on a decisions log — **a decision does not close** — so this
> file grew to 3× the cap while the rule sat there looking followed. It was also measured and found
> dangerous on `OPEN-QUESTIONS`: automated "is this closed?" detection flagged **Q-246 and Q-247 as
> closed when both were live**, and burying Q-246 would have hidden the warning that `plannedWorkout`
> is still in use. **So: no judgment, no moving text. Freeze at a number, start the next file.**

---

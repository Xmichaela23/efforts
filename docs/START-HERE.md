# START HERE — the one page for a new chat

**Rewritten 2026-07-13 from a full code audit.** If you read nothing else, read this. It is the whole picture in one screen, plus where to go for detail.

---

# ⛔ IT HAS BEEN BUILT. IT MAY NOT WORK — BUT IT HAS PROBABLY BEEN BUILT, MAYBE MORE THAN ONCE.

**"It doesn't work" is NOT evidence that "it doesn't exist."** The dominant failure mode here is a well-built system **STARVED of its inputs** — spec'd, fixtured, and silent because something upstream is null. It looks *missing*. **It is not missing. It is hungry.**

**Before you write ANY new function:**
1. **Grep the name you were about to give it.** It is often already taken — by the thing you were about to rebuild.
2. Grep the *capability* (2-3 different words for it) and read **`CAPABILITY-MAP.md`** — start with its "I almost rebuilt this" list.
3. Search `docs/` for a `DESIGN-*` / `SPEC-*`. If one exists, the thing exists.
4. **Ask: is it STARVED, or is it ABSENT?** Trace the input to its write site. A null input is a **plumbing** job, not a build job.
5. State in writing what you found **before** proposing to build. No exceptions.

*(2026-07-12: a session rebuilt `resolveRunEasyPace()` — **same function name** — while the real one sat in `generate-combined-plan/science.ts:110` with its own spec and 9 pin tests.)*

---

## What the app is

A hybrid endurance + strength training app. **Every major piece exists.** Plan makers (goal + race + season), a calendar, workouts built from your baselines, a Performance screen that grades a session, a State screen that tracks the week and the load over time.

**The near-term mission is CONTINUITY, not features:** one workout in → every screen tells the **same** truth about it. It is a plumbing job.

## The loop — read `LIFECYCLE.md`

```
BASELINES → PLAN BUILD (targets FROZEN) → YOU TRAIN → PERFORMANCE (graded vs the frozen target)
    ↑                                                                          ↓
    └──────────────── LEARNING (new pace/FTP/1RM) ←──────────────────────── STATE
```

**The arc closes** — the app learns from what you did, and the next plan you build uses it.

**The one line that matters: FROZEN vs LIVE.** *"Did you do what the plan asked?"* → judge against the **pin**. *"How are you doing right now?"* → use the **live** number. Every fracture found in the 2026-07-13 audit lived on that boundary. **`LIFECYCLE.md` is the full map — read it before wiring anything.**

---

## The three diseases

Every problem in this app is one of these three. **Name which one you're looking at before you write a line of code.**

- **STARVED** — built, tested, never fires; an input is null. *Plumbing job, not a build job.*
- **DEAD** — computed, shipped, read by nobody. *Nine coach outputs. Mount it or delete it — right now it's neither.*
- **DOUBLED** — two engines, one fact. **The dangerous one: it doesn't fail, it disagrees, and both answers look confident.**

> **Every fracture in this app began life as a copy that was correct on the day it was made.**

---

## What is clean, and what is fractured (verified 2026-07-13)

**Clean — don't re-litigate:**
- **The LLM can only write prose.** It cannot touch a verdict, number, band or card. Validated against the spine; on failure the prose is **dropped**, not the numbers. This is a real strength.
- **`session_detail_v1`** — one builder, one fetch, many dumb renderers. The healthiest contract in the app.
- **Fitness direction · the ACWR ratio · the 1RM anchor** — single source, all callers routed.
- **Run easy pace** — one resolver, universal on the server, athlete override honoured.

**Fractured — the live ones:**
- 🔴 **Three Zone 2 ceilings** (128 / 134 / 136 at LTHR 151). The plan prescribes to 136; the analyzer grades that run out of Z2.
- 🔴 **LTHR resolves 4 ways, 2 inverted, no resolver.** Type one in and half the app discards it. *It is the root of the run stack.*
- 🔴 **The RPE trend is a within-week ordering artifact** — and it is the required leg for the safety floor.
- 🔴 **The ACWR band is bypassed 6×**; a taper week can read `elevated` and `optimal` in the same payload.
- 🔴 **`adapt-plan` silently re-prices your strength weights on every ingest** — and skips the fatigue gate the *suggest* path applies. Meanwhile the path that **asks** you is unmounted.
- 🟡 Two ingest paths never reach the spine · the load substrate is starved · a race in the fan-out drops facts silently.

Full detail + file:line in **`CAPABILITY-MAP.md`** (FACTS table) and **`LIFECYCLE.md`**.

---

## The working rules

- **One source per fact; screens render, never re-decide.** (Constitution Law 1 + 4.)
- **The plan pin is truth for a plan's targets** — display the pinned number, don't recompute from live.
- **Measured ≠ inferred (Law 2).** Where a baseline is absent the app currently **invents** — a silent 135 lb squat, a silent 1:30/100 swim. Don't add a third; ideally, refuse and say so.
- **A Q-entry is a LEAD, not a verified bug report.** Read the D-NNN law before touching the machinery it governs. *(D-281 was built on one screenshot, against four decisions that forbade it, and was reverted the same day.)*
- **Deploy:** edits are free; **push / commit / deploy wait for Michael.** He deploys nothing himself.
  ⚠️ **Supabase bundles `_shared` at deploy time.** Edit a shared file and **every function that imports it must be redeployed**, or it keeps running its own frozen copy. This silently stranded 17 functions — one of them for a month. **Deploy every function you touched PLUS everything that imports what you touched.**
- **Verify by fixture + a live receipt**, not a device session alone. ≥3 recomputes for anything stochastic (LLM).
- **No emojis in UI, microcopy, or mockups.**

---

## The docs — and which ones lie

| Doc | Trust | |
|---|---|---|
| **`START-HERE.md`** (this) | — | the front door |
| **`LIFECYCLE.md`** | ✅ | **the loop.** Frozen vs live. Read before wiring. |
| **`CAPABILITY-MAP.md`** | ✅ rebuilt 2026-07-13 | **does X exist + where.** The anti-rebuild index. |
| `ENGINE-STATE.md` | ✅ | current state. The only doc that retracts its own claims in place. |
| `DECISIONS-LOG.md` | ⚠️ | trust the entry you're reading; **do not** trust that an older one is still live |
| `OPEN-QUESTIONS.md` | ⚠️ | several stale. **A Q is a LEAD, not a bug.** |
| `POLISH-PUNCH-LIST.md` | ⚠️ | the work queue; header lags |

**The rot pattern, named:** these docs have excellent **forward pointers** and **no back-pointers.** D-283 knows it killed D-275; D-275 has never heard of D-283. The fix that closes a Q never returns to close the Q.

> **THE HABIT THAT KEEPS THEM HONEST: when you supersede an older entry, go back and annotate the older entry.** Not just the new one.

**Deeper, when you need it:** `TARGET-ARCHITECTURE.md` (the north star) · `TRUTH-MAP.md` (per-fact authority — ⚠️ partly stale; `CAPABILITY-MAP`'s FACTS table supersedes it) · `CONSTITUTION.md` (the six laws) · `SELF-AWARENESS-MAP.md` · `CANON-arc-inference-model.md` · `CLAUDE.md` (topology + conventions).

# SPEC — State v3: the Fitness band, the Plan tick, and the prognosis expand

**Status:** SPEC (2026-07-14). Not built. A real redesign of the State PERFORMANCE section — NEW scalars, not a re-skin. Sign-off gated.
**Voice / honesty frame:** `DECISIONS-LOG.md` **D-242** ("label what's computed, never compute to match the label"; corollary: *a label needing a computation that doesn't exist is NEW scope*) and **D-240** (no cross-discipline composite). `CONSTITUTION.md` Laws 1, 2, 4.
**Depends on:** the Q-179 posture join, shipped 2026-07-14 (`_shared/state-trend/posture.ts`). **This spec is that work's payoff** — the "lever" line cannot exist without it.

---

## 0. The one-line version

> **State becomes two questions, each answered once.**
> **Fitness — where is my body vs my own range?** (a dot on a band, a trend arrow)
> **Plan — is my behaviour matching my intent?** (a dot vs a tick — the posture read, already shipped)

And the run row's current contradiction dissolves: *"aerobic base needs work"* and *"improving 6%"* were fighting because **one is a LEVEL claim and one is a TREND claim.** Dot position = the level. Arrow = the trend. They stop arguing because they answer different questions.

---

## 1. What already exists — do NOT rebuild

| piece | where | status |
|---|---|---|
| Per-discipline VERDICT (improving/holding/sliding/needs_data) | `_shared/state-trend/classify.ts` `classifyTrend` | BUILT — this is the ARROW |
| Per-discipline SLOPE (`pctChange`) | same | BUILT — this is the prognosis extrapolation input |
| Confidence / provisional / stale / sampleCount / newestAgeDays | `classify.ts`, `discipline.ts` `PerfSummary` | BUILT — this is the grey-dot gate |
| The POSTURE read (declared intent vs behaviour) | `_shared/state-trend/posture.ts` (Q-179) | BUILT + DEPLOYED 2026-07-14 — this is the PLAN section AND the lever |
| Per-lift baselines (`squat ~90/110`) | `response_model.strength.per_lift`, `exercise_log` | BUILT — strength row's band substrate |
| Provenance footer (source runs, metric, as-of, exclusions) | already rendered at 11px on each row | BUILT — demote, don't remove |

**The arrow, the confidence gate, and the entire Plan section are already shipping.** This spec adds ONE new scalar (the band position) and ONE new derived layer (the prognosis), and re-lays-out what exists.

---

## 2. What is NEW scope (the actual build) — per D-242

### 2a. The band position — `positionInRange` (the biggest new piece)

Each Fitness row is a dot on a track: **left edge = your low, right edge = your best, over a rolling 12-week window.** The dot's x-position is where the current value sits in that range.

- **New scalar per metric:** `{ low, high, current, positionPct }` where `positionPct = (current - low) / (high - low)`, computed over the same 12wk window the trend already reads.
- **⚠ IT IS A RELATIVE FRAME, AND THE SPEC MUST SAY SO ON SCREEN.** As an athlete detrains, the `low` edge drops with them, so the dot can hold position while absolute fitness falls. The dot answers *"where am I in my recent range,"* NOT *"how fit am I absolutely."* The band label ("vs your 12-week range") carries this; do not let the dot read as an absolute score.
- **Confidence-gated:** below the same floor that makes a verdict provisional, the dot is **grey and unlabeled** — a positioned dot on thin data is a lie with a coordinate. (Mockup: bike, 6 rides → grey dot, "thin data, low confidence.")
- **Metric per discipline (unchanged from today's substrate):** run = speed per heartbeat (efficiency_index); bike = power per heartbeat (w20/HR-at-band); swim = threshold pace; strength = e1RM vs baseline.

### 2b. The prognosis expand — `ghostDot` (behind a tap, never on the surface)

> ⛔ A projection on the scan layer reads as a VERDICT. A projection behind a tap reads as a CONDITIONAL. This is the whole reason it lives in the expand.

- **Ghost dot** on the same band — hollow, dashed connector from the current dot. Position = straight-line extrapolation of the existing `pctChange` slope, **capped at ~4 weeks out, never further.**
- **Conditional language ONLY.** *"If this trend holds…"* — never *"you will."* The engine extrapolates; it does not predict. (D-242: the label describes the computation — and the computation is a linear extrapolation, so the words say exactly that: *"Straight-line extrapolation — nothing more."*)
- **⛔ SYMMETRIC.** The ghost dot projects RIGHTWARD when improving (swim), leftward when sliding (run). **If the app only extrapolates decline it is not a prognosis engine — it is a nag with a chart.** Pin both directions in the fixture.
- **Suppressed below the confidence floor.** Thin data → no ghost dot at all. A dashed circle on 6 rides is the app lying with a projection.

### 2c. The lever — the fitness↔plan join (THE PAYOFF of Q-179)

Inside the run expand, a boxed line naming WHY the trend is what it is:

> **THE LEVER.** You said 3 runs a week. You've been doing about 1.6. That's a trade, not a mistake — but this dot is the price. → *View plan row*

- **It IS the posture read.** `postureSentence` + `postureRead === 'maintain_dropped'` already computes this. The expand renders it and links to the Plan section.
- **⛔ THE GUARD (correlation shown, causation never claimed): the lever appears ONLY when the plan gap and the trend point the SAME direction.** If run frequency were on-plan and efficiency still sliding, the box stays EMPTY rather than invent a cause. This is `isConcern(postureRead)` AND a sliding trend — both, or nothing. The phrasing stays defensible precisely because the trade is one the athlete DECLARED, not one the resolver inferred.

---

## 3. The three honest layers per row

- **Glance** — dot, arrow, three words. The scan.
- **Tap** — ghost dot, the conditional sentence, the lever. The depth.
- **Footer** — provenance at 11px (source runs, metric name, as-of date, exclusion note). The glass box, demoted not deleted.

---

## 4. ⛔ What NOT to build (the honesty rails)

- **NO composite fitness score.** A single "fitness: 74" is the unfalsifiable verdict this whole arc has spent months killing (D-240). Four dots, four defensible scalars — never one number.
- **KILL the "% of your range" LABEL.** The mockup's *"41% of your range"* relocates false precision from text onto a dashed band. The dot's POSITION is honest (visual, approximate); the number makes it sound measured. Keep the dot, drop the percent.
- **NO colored dot below the confidence floor.** Grey, always, for thin data. (Constitution Law 2 — measured ≠ inferred, rendered.)
- **NO prognosis on the scan layer.** Behind the tap or nowhere.
- **NO lever line without a matching plan gap.** Empty box beats an invented cause.
- **NO extrapolation past ~4 weeks.** Linear projection is honest for a month and a fantasy for a quarter.

---

## 5. Build order (dependency-first)

1. **`positionInRange` scalar** — extend the spine's per-discipline read (`assemble.ts` → the cached `state_trends_v1.display`) with `{ low, high, current, positionPct, confident }` over 12wk. Compute + **backfill** (the band needs history to have a range). This is the long pole.
2. **The Fitness section layout** — replace the current PERFORMANCE rows with dot-on-band + arrow. Grey-dot gating from existing `provisional`/`stale`.
3. **The Plan section** — the posture read as dot-vs-tick. Data already shipped; this is layout.
4. **The prognosis expand** — `ghostDot` (extrapolate `pctChange`, cap 4wk, symmetric, confidence-gated) + the conditional sentence.
5. **The lever** — render `postureSentence` inside the run expand, gated on `isConcern && sliding`, linked to the Plan section.

**Fixtures that MUST exist before ship:** symmetric prognosis (improving projects right, sliding projects left); grey dot suppresses both label and ghost dot on thin data; the lever box is EMPTY when frequency is on-plan but the trend slides; the band label states the relative frame.

---

## 6. Open questions for the build session

- **Where does `positionInRange` live** — a new field on the display contract, or derived client-side from the series the row already carries? (Prefer the spine, per Law 1 — the client renders, never re-derives.)
- **Range window = 12wk?** The trend window is 42d (6wk). A 12wk band + a 6wk trend arrow is defensible (level is slower than trend) but the two windows must be LABELLED distinctly so they don't read as one number over one period.
- **The backfill cost** — the band needs each metric's 12wk min/max historically. Scope the recompute before starting; it is not free.
- **Strength band** — e1RM "vs baseline" is already a ratio, not a range. Does strength get a band, or keep its current "squat ~90/110" receipt? (Likely: baseline IS the right edge; the band is current-vs-baseline. Decide explicitly.)

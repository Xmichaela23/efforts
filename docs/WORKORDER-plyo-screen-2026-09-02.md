# WORK ORDER — THE PLYO SCREEN
**Written 2026-09-02. Ruled by Michael after reading p227 with the book open beside the screen.**

⛔ **DO NOT BUILD UNTIL THE COLLISION CHECK IS ANSWERED.** Item 2 lives in the standing-plan ENGINE
(`frames.ts`, `compose.ts`, the golden files, `protocol.test.ts`). Editing it regenerates goldens and
deploys `coach` + `generate-strength-plan` + `rematerialize-standing-block`. **Confirm no other
session is in those files first.** The logger-side work (item 1) is clean regardless.

---

## THE SOURCE — p227, verified against the page image, not the transcript

- **No number of efforts per drill.** The only quantity words are *"performed multiple times with
  ample rest."*
- **The stop rule IS the prescription:** *"done until the movement is optimized for the day and the
  athlete develops confidence in it; then they move on from it. Fatigue, poor form, and imprecise
  movements are all absolute no-no's."*
- **"Three or four" is the cap on DRILLS PER DAY**, not reps: *"throwing more than three or four
  plyometric movements together on a given day is likely a waste of time."* ⚠️ Already honoured — the
  composer prints exactly three, one per bucket.
- **Three buckets, with the movements the page lists:**
  · bounding / skipping → A/B skips · distance bounding · prime times (stiff-legged run) — *running
    gait and speed*
  · control and ground-contact-time reduction → single-leg hops · rebound jumps · skater hops ·
    lunge hops · pogo hops — *general speed and explosiveness*
  · footspeed and movement → ladder drills · Ickey Shuffle · hopscotch — *foot and leg control,
    explicitly NOT true agility*

⛔ **A CORRECTION TO THE RECORD — the "4 efforts" was NOT a misread.** `frames.ts` documents it as a
deliberate OURS decision: the book gives no figure, three to five is the field standard, and it was
written as a fixed labelled number. **Any commit message must say the decision is being REVISED, not
that the code misread the page.** The transcription in `SOURCE-viada-hybrid-athlete.md` §A4 matches
the page exactly; nothing there needs correcting.

---

## 1. THE LOGGER — clean, no engine dependency, build first

- [x] ⛔ **Remove reps-in-reserve from every plyo row.** (2026-09-02, StrengthLogger) *"target 4 · 2–3 in reserve"* is a lifting
      concept on a drill that is not rep-based, and it contradicts the card's own opening line
      (*"not on a rep count"*) on the same screen. **This is the genuine defect.**
- [x] **No weight column, no set count, no rep target** on a plyo row. (2026-09-02)
- [x] **Each drill reads: its name · one line of what it is for · the stop rule.** (2026-09-02)
      "Stop when the movement stops being crisp."
- [x] **Efforts are RECORDED, not targeted** (2026-09-02: the Efforts cell is the record; no target line) — an optional count entered afterwards. ⛔ If it cannot
      be made obviously a record rather than a goal, leave it out; a number in a box reads as a target.
- [x] ⛔ **THE INSTRUCTION IS THE POINT.** (2026-09-02: p227 note above the first drill) Michael: *"I just want this plyo logger to make sense so
      user can log and also have good instruction."* The block opens by stating plainly that the
      drills are done separately, with full rest between efforts, and that quality is the whole
      objective — fatigue and sloppy movement defeat it. Source register, no coaching voice.
- [x] Plyo's existing magenta tag and Zap icon stay. ⛔ No second colour.

## 2. THE PRESCRIPTION — engine, gated on the collision check

- [x] ⛔ **RULED BY MICHAEL: the effort count becomes a RANGE, "3–4 efforts", not a fixed 4.** (2026-09-02, frames.ts PLYO_DOSE — REVISED, labelled)
      He is revising a deliberate decision knowing it is one. Keep it labelled OURS with the reason:
      the page gives no figure, three to five is the field standard, and a range states the honest
      shape of the guidance rather than implying a target.
- [x] Update the golden files and `protocol.test.ts` with it. (goldens regenerated; deploy: coach, generate-strength-plan, rematerialize-standing-block) Note the deploy closure in the report.

## 3. EQUIPMENT — no drill an athlete cannot do

- [x] ⛔ **Ladder drills prescribed to an athlete with no ladder.** (2026-09-02, plyo.ts drillAllowed) Michael's equipment: barbell +
      plates, dumbbells, squat rack, bench, incline bench, pull-up bar, resistance bands. No ladder.
- [x] Plyo drill selection respects the athlete's equipment, the way lifting already does.
- [x] **Substitutes come from the same bucket on the same page** — Ickey Shuffle or hopscotch.
      ⛔ Never invent a movement. ⚠️ Ickey Shuffle is usually taught in a ladder but does not require
      one; **hopscotch is the cleanly equipment-free option.**
- [x] **"Agility ladder" becomes one more checkbox in the EXISTING equipment grid** (2026-09-02, TrainingBaselines — the only grid in the app) — not its own
      section. ⛔ **PING BEFORE EDITING.** If it lands inside `TrainingBaselines.tsx`, stop —
      another session owned that file as of `f138c39b`.

## 4. ✅ RULED 2026-09-02 — the default is the LESS TECHNICAL drill, and every drill is swappable

Michael, on the stiff-legged run: *"prime times seem technical."* Then: *"yes — less technical with
the option to swap them all."*

- [ ] ⚠️ **OPEN — CONFLICTS WITH p89 AS PINNED.** `standing-plan-plyo.test.ts` pins p89's ramp: skipping, bounding and hops come AFTER mastery, so week 1 serves Stiff-Legged Run / Pogo Hops / the footspeed drill. This ruling (A-skip or bounding first) reverses that. Michael to pick: keep p89's order (Swap already lets him take A-skips), or override p89 by ruling and rewrite the test. **The composer prefers the least technical movement in each bucket by default.** A form drill
      done badly achieves nothing, and the athlete this is for has never done one. In the
      bounding/skipping bucket that means **A skips** (the standard, widely-taught entry point) or
      **distance bounding** (hard to get wrong) ahead of prime times / stiff-legged run.
      ⚠️ **Order the buckets by technicality explicitly and write the reasoning beside it** — a future
      session must not "improve" the pick back to the harder movement.
- [x] ⛔ **EVERY plyo drill carries Swap** (2026-09-02, same-family options, ladder-gated), offering the other movements in its OWN bucket. All three
      rows, not just the substituted one.
      ⚠️ The bucket is the constraint: a swap may cross movements, never buckets — the three buckets
      are the session's structure (gait/speed · ground contact · footspeed) and swapping across them
      would silently change what the day trains.
      ⚠️ Equipment gating applies to the swap options too — no ladder drill offered to an athlete
      with no ladder.
- [x] ⛔ **Reuse the Swap control that already exists on lifting rows.** Do not build a second one.
      This project has already paid for a parallel-control mistake once (a removal path built beside
      the one Swap already carried, reverted in full).

---

## RULES

- ⛔ Never write his data. ⛔ Commit, push and deploy wait for Michael, typed by him.
- ⛔ Never `git add -A`. Explicit paths — three sessions share this repo.
- ⛔ Label every claim by evidence class. The page wins over the transcript; the transcript is correct
  here and was checked.
- ⚠️ He built the app and does not read code. Plain words in anything he reads.

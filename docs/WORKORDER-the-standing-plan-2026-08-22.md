# The Standing Plan — the build, 2026-08-22

Six stages. One at a time. **A single terminal may carry several** — what is not optional is one
stage at a time, and the notes written before the next one starts.

**The design is `docs/DECISIONS-2026-08-21-standing-plan.md`. Read it first — this file is the
sequence, not the reasoning.** The source is `docs/SOURCE-viada-hybrid-athlete.md`, and the page
images it cites are at `~/Efforts_Local_Folder/book-sources/viada-hybrid-athlete/`, named by page.

---

## Why this exists

The finish-the-swaps work order (2026-08-20) is complete. It made one fact have one owner, deleted
four dead placement engines, stopped the sports clumping and fixed a warning that had been blind for
months. **That was the floor. This is the building.**

**The Standing Plan** is the base program: Viada's All Rounder, run year-round, race optional, with
Wendler's progression rules moving the barbell numbers. It replaces Strong Focus as the plan a new
athlete starts on.

---

## The rules

0. ⛔ **STRONG FOCUS STAYS LIVE UNTIL THIS REPLACES IT.** It is deployed and it is the only plan an
   athlete can build. Do not delete it, do not migrate it, do not "unify" the two. It retires when
   the Standing Plan works on a device, not before.
1. **One stage at a time.** Finish, stop, write notes, take the next instruction.
2. ⛔ **NEVER INVENT A NUMBER HE DID NOT WRITE.** This is the whole reason the source corpus exists.
   Every prescription traces to a page or is labelled as ours **in the code, at the site**. If a
   value is needed and the book does not have it, **stop and ask** — do not reason your way to a
   plausible one. §"The twelve gaps" below is the known list; if you find a thirteenth, add it and
   raise it.
3. ⛔ **GENERATE, DO NOT TRANSCRIBE.** His methods are ours to implement and cite. **His session
   tables and movement lists are his expression.** Build sessions from the rules against the
   athlete's own thresholds. A lookup table of his intervals is both worse engineering and not ours
   to ship. Michael intends to write to both authors; this is the difference between a compliment
   and a problem.
4. **Mutation-test every new test.** Break the code it covers; if it still passes, the test is
   worthless. Three test files written on 2026-08-19 passed with the code deleted.
5. **The 61-shape sweep cannot see a plan type that does not exist yet.** Each stage names its own
   gate. ⚠️ And remember what stage 6 proved: the sweep is a regression net, not a detector — it was
   structurally blind to a warning that was broken for months. **Build your evidence from the wide
   shape space, not from the 61.**
6. **Report pushed · deployed · verified on a device, separately. Never "shipped".**
7. **Edits are free. Commit, push and deploy wait for Michael. Every time.**
   ⛔ `CLAUDE.md`'s deploy policy says the opposite and is overridden here.
8. **Do not tune to Michael's numbers.** Build and verify across a range of athlete shapes.

---

## ⛔ THE SHAPE — engine, client, and how each is verified

**Read this before stage 1. It decides where code goes and what "done" means at every stage.**

### The layers

| | what | where | runs on |
|---|---|---|---|
| **Loading modules** | what is inside a session, and how it progresses | `shared/strength-system/loading/wendler-531.ts` (exists) · **the endurance library (stage 1)** | pure — server **and** client |
| **The grid** | which slots exist and what fills them | **stage 2** | pure — server **and** client |
| **Dosing** | how much accessory work, per muscle, per session | **stage 3** | pure — server **and** client |
| **The composer** | assembles a week from the athlete's anchors | `strength-primary-plan.ts` + **stage 4** | server |
| **The wizard** | asks the questions, previews the week | `NonRaceBuilder.tsx` + **stage 5** | client |

### ⛔ Everything in the top three rows MUST be client-reachable

`week-model` already is — the `@shared` Vite alias means the wizard runs the real solver, so the
preview and the built plan move together. **The endurance library, the grid and the dosing must be
the same.**

**Why it is not optional:** the size cap ("up to 22 miles a week on this plan") is computed from the
longest option in every slot, and **it moves when the athlete changes their sport mix.** If that
number needs a server round-trip it will lag behind the taps, and we will have rebuilt the 922ms
defect stage 3 just deleted. **Pure, no Deno-only imports, no `supabase` client at module scope.**

⚠️ **And it must not fork.** One implementation, read by both. A second client-side copy of the
dosing is the disease the last work order spent six stages removing.

### How each stage is verified

**Stages 1–4 are engine.** `deno test` runs them. Assert against a wide generated space, not a
handful of shapes — ⛔ stage 6 proved the 61-shape sweep is a regression net, not a detector: it was
structurally blind to a warning that had been broken for months, because all 61 happened to be the
easy case.

⛔ **Stage 5 is React, AND REACT DOES NOT RUN IN THIS REPO.** Measured on 2026-08-22: `npx vitest run`
fails on all 363 files (its ESM loader rejects the `https:` deno-std imports those files use; there
is no `test` script and no vitest config). `deno test src/` runs 715 of them but cannot render a
component, and anything importing `@shared/*` runs under neither.

**Stage 3 handled this with a source lint and said so. That is not enough for five rebuilt screens.**

**So stage 5 verifies in a browser.** `npm run dev` serves on port 8080; drive the wizard and read
the result. Not a test suite — real verification, and strictly better than a lint on a rebuild this
size. Keep the source lint for the invariants a lint can hold (no literal ranges, the constant is
read, the day lock is passed) and drive the browser for everything else.

⚠️ **Whatever you cannot execute, say so in your notes.** "Asserted at the source, never run" is an
honest line and it has been used correctly twice already.

### What the athlete finally sees

Nothing in stages 1–4 is visible. **The first stage an athlete could notice is 5, and the first
proof any of it works is Michael building a block on a device.** No stage may claim "verified"
before that.

---

## Stage 1 — the endurance session library

**The mirror of `wendler-531.ts`: pure, no weeks, no days, no plan shape. Give it a session type, a
level and the athlete's thresholds, get back a session.** It feeds the Standing Plan *and* every
pivot, which is why it is first.

**Build:** five running families (sprint/power, MLSS, near-threshold, VT1, LSD), five cycling
(sprints, anaerobic, VO2, sweet spot, endurance), three swim (endurance, speed, open water) — each
at three levels. Warm-ups and cooldowns are part of the session, not decoration.

⛔ **Percentages resolve against the athlete's own anchors** — run threshold pace, FTP — through the
existing resolvers. Never a stored table of paces.

⚠️ **The cycling percentage basis is an INFERENCE** (percent of threshold power). p229 states the
running convention; the cycling opener states nothing. **Label it as inferred at the site.**

⛔ **CLIENT-REACHABLE, per §The shape.** Pure module, no Deno-only imports, no `supabase` at module
scope, importable through `@shared`. The wizard computes the size cap from it as the athlete changes
their sport mix — a server round-trip there rebuilds the latency defect stage 3 just deleted.

**Gate:** for every family × level, assert the generated session's total duration, its work-to-rest
structure, and that it obeys the stated floors and caps — bouts at least 10–15 min to matter, no
more than ~2h of easy work in a session, and the 4:1 work-to-rest ratio where it applies. Then
generate across a range of athlete thresholds and assert nothing degenerates. **Plus: it imports and
runs from a client entry point** — prove it, do not assume it.

---

## Stage 2 — the strength grid

**Pattern × category × intent, as an accessor over vocabulary that already exists.** ⛔ Read
`shared/strength-system/protocols/intent-taxonomy.ts` first — it already states "protocols output
intents, placement policies assign intents to days", which is his table restated. A `MovementPattern`
vocabulary also already exists. **This is a new accessor, not a new strength system.**

**The four intents, with his numbers** (`SOURCE` Part A1): ME 1–5 reps at 90–100%, no RIR target,
1–3 sets · DE 2–4 at 70–80% for maximum velocity, 3–4 RIR, 4–6 sets · SKILL 3–5 at 75–85%, 3–4 RIR,
3–5 sets · HYP 6–12, 0–2 RIR, 3–4 sets. Sets start at the low end.

**The five categories with their movement lists** (Part A2). ⛔ **"Asymmetrical" is a MODIFIER, not a
category** — a braced push done one limb at a time. There is no sixth list.

⛔ **OLYMPIC LIFTING IS OUT OF SCOPE.** Do not build the HEAVY/REP/SKILL/GROOVE vocabulary.

**Gate:** every slot the All Rounder names resolves to a real movement with a real prescription, for
an athlete with any equipment subset. No slot may resolve to nothing.

---

## Stage 3 — the accessory rework

**Today's model counts the wrong thing.** It is a rep total per category, split however the athlete
likes, and nothing counts sets. **The growth driver is effective reps per muscle per week; the
recovery cost is work sets per session.** Neither is expressible in reps-per-category.

**Build:** set-based dosing (8–10 reps at 1–2 RIR, ~4 effective reps per set), a **floor per muscle
group** so the focus picker can no longer leave quads and shoulders at zero, and **core split off
from single-leg** — Wendler bundles them, Viada gives core its own slot, and that is why abs feel
starved.

**Hold the ceilings:** 8–12 sets per muscle per week is solid, 18–20 borders overreaching; **6–8 work
sets in a session recovers in 24–48h, 14+ can cost up to 72h.**

⚠️ **Keep the picker.** Both authors endorse athlete choice. The change is a floor beneath it, not
its removal.

**Gate:** across a wide sweep of focus picks, assert no muscle group falls below its floor and no
session exceeds its set ceiling.

---

## Stage 4 — the composer

**The Standing Plan week: four lifting days, five endurance slots, a plyometric day, one rest day.**

⛔ **THE DAY ORDER IS NOT THE LAW. THE PAIRINGS ARE.** He numbers days 1–7 and never names a weekday;
Rule 8 calls a fixed seven-day microcycle an artificial constraint and Rule 9 says to defy convention
about session composition. What is load-bearing:

- the hard run sits with an **upper-body** lift — they do not compete
- the hard ride may share the **hinge** day — riding does far less damage than running
- the **heaviest leg day carries no endurance at all**
- the long day follows a day with no barbell

**So the composer anchors on the athlete's fixed points and places the lifting around them so the
pairings survive.** It does not rotate a rigid block.

**Also build:** the taper/deload column as published — every ME becomes SKILL or DE, volume comes off
the lower days, endurance drops a level, and two days lose their endurance entirely.

**And Wendler's progression on the ME slots.** ⛔ **The progression LOGIC is portable; the percentage
wave is NOT.** His wave tops near 81% of true 1RM and Viada's ME asks 90–100%. Take the working
number, the fixed increment, hold-on-miss, and the 10% reset after two — apply them to Viada's
percentages. `wendler-531.ts` already computes off a working number rather than a true max, which is
why this works.

**Gate:** generate across a wide athlete space and assert every pairing rule holds in every week, the
slot count never varies, and no session exceeds its cap.

---

## Stage 5 — the wizard

### ⛔ SUPERSEDED IN PART (2026-08-24, Michael's flow). The screens below this addendum stand where
### they don't conflict; the FLOW and the METER are the law now.

**The flow (strength-leading shown; speed mirrors it):**

1. **Train Focus** opens the wizard.
2. **Lifting experience** — new (under a year) / a couple of years / many years. ⛔ THIS ANSWER SETS
   THE BASELINE STRENGTH-GAIN DISPLAY for every later screen. Lifting is always in the plan — it is
   the product, never a question.
3. **Focus** — strength / speed. Two cards, tradeoff bullets under each (copy drafted in chat
   2026-08-24: fact-first, no imperatives, conditional consequences; the new-lifter line is
   experience-gated). Choosing strength continues this flow.
4. **What you keep** — sports in the week. Swim off by default; if kept, easy laps + technique only,
   NEVER a hard slot (Michael's ruling 2026-08-23).
5. **Your endurance week — ONE screen, was two.** Volume number bounded both ends (cap = what the
   slots hold) + the week's sessions listed per sport + tap-to-tag which are hard (cap 2). Legal
   because intensity CONVERTS a session (8-21 §3b) — so size and hard-tagging are one decision
   surface, not two screens.
6. **Strength** — lifts you want numbers on (they take the heavy slots) + focus areas over the
   stage 3 floor.
7. **Schedule** — pinned days (clubs, long ride/run), days you cannot train. day-map rotation
   honours pins; impossible pins state their cost.
8a. **Lifting experience lives in BASELINES, not the wizard** (Michael, 2026-08-24): asked once at
   first Train Focus, stored beside the other baselines, shown as an editable chip thereafter —
   Train Focus is a pivot point and re-asks only what changes block to block. Self-report is a SEED:
   once months of logged lifting exist, history grades the tier and overrides the stored answer
   (same philosophy as the test skip — typed answers seed, logs decide). ⛔ INTERIM: a plain
   editable field on the Baselines screen ships BEFORE the wizard exists, so the value can be set
   ahead of the first real block.

8b. **Review** — the test-week notice ("week one finds your working numbers"), skip offered only on
   fresh logged evidence (42-day window, slice 3).

### ⛔ THE METER — the wizard's one live number, and the education IS the moment of choice

The experience answer sets the baseline; every endurance choice moves it, visibly, as they toggle:

- **Anchors are HIS frame rates, never a formula of ours:** hard-on-bike week ≈ 1%/3wk (p247's
  class), hard-run week ≈ 1%/4wk (p251), two hard RUN days = the stated floor ("slowest lane for
  the bar"). Between anchors show a RANGE. ⛔ NO invented precision, NO endurance-improvement
  percentages anywhere (no source gives one — direction words only).
- **New-to-lifting overrides the meter's tone:** gains come fast for months regardless of the mix —
  the knock-down display applies to the experienced tiers.
- **Two lines, not one: the bench line barely moves with running choices; the squat line is the one
  that pays.** Showing the split is honest and it is the motivating fact.
- Render pounds where possible ("~3 lb per step on a 300 lb squat"), sourced rates only.

### ⛔ ONE WIZARD FOR ALL NON-RACE PLANS — this flow supersedes the Get Stronger entry DOOR (the
engine underneath is untouched). When that surface is rebuilt, the "5/3/1" label in
`StrengthPlansView.tsx:108` dies with it (trademark, pivot §5). In-app posture pivots ride the same
wizard at block boundaries: new frame, held numbers carry, fresh evidence skips the re-test.

---

### The original stage 5 section (screens that still stand where they don't conflict):


**Nine screens become about five: plan → which sports → your week → size → accessories → build.**

- ⛔ **The "how many runs / how many miles" screen goes.** The program owns the count.
- ⛔ **The review-and-shuffle screen goes.** It merges into "your week" — you are stating anchors and
  watching the week fill in, not reviewing a suggestion.
- **"Your week" collects:** long run day, long ride day, any club sessions, and **days you cannot
  train** (⚠️ not "pick your rest day" — availability is the real constraint, and the rest day has a
  job).
- **Size is one control, bounded both ends.** "Up to 22 miles a week on this plan." Cap = the longest
  option in every slot; floor = the shortest. **The cap moves with the sport mix.** Ask for more and
  it is not offered — that is what a pivot is for.
- **A club session REPLACES a slot, never adds one.** His own rule, from the Crit program: if you are
  racing weekly, remove the midweek intervals because the race takes the place of that intensity.
  The athlete says which slot it stands in for.
- **Accessories keep the existing page and picker**, over the stage 3 dosing.

⛔ **Copy that inverts and must be rewritten:** "which endurance are you *keeping*" and "speed and
threshold are not maintained by this block" are Strong Focus's honest lines. **The Standing Plan
maintains both on purpose** — that is what keeps the pivot available.

⚠️ **"Optimal schedule" and "the best placement for this one, for recovery" overclaim.** Until
2026-08-21 the scorer could not tell a clumped week from a spread one. Say what is true.

### ⛔ HOW THIS STAGE IS VERIFIED — read §The shape first

**React does not run in this repo.** A source lint is not enough for five rebuilt screens.

1. **Drive it in a browser.** `npm run dev`, port 8080. Walk the whole wizard: pick sports, place the
   anchors, move the size control, swap a club session in, mark a day unavailable. Read what the
   preview says at each step.
2. **Assert the numbers agree.** The size cap the wizard shows must equal what the composer builds —
   ⛔ **this is the ask-15-get-20 bug and it is the single thing this stage exists to kill.** Prove
   it for several sport mixes, not one.
3. **Keep a source lint** for what a lint can hold: no literal ranges, the constant is read, the day
   lock is passed.
4. **Say what you could not execute.** "Asserted at the source, never run" is honest and has been
   used correctly twice.

---

## Stage 6 — honesty, and the retirement

**The compromise channel, for the new plan.** A fixed-slot week cannot over-subscribe, so the message
changes: it is no longer "this week is heavy", it is **"we could not put your hard run where the plan
wants it, because you pinned Saturday."**

**And the two things the plan must say plainly:**
- **Speed is intervals and jumping, not sprinting.** The hard and threshold runs are the 5K/10K
  intensities and they do make you faster; there is no track session. Someone reading "speed" will
  expect sprints.
- **A bike-heavy athlete gets real strength progression; a run-heavy athlete at the same hours gets
  maintenance** (p280 — no impact, far less eccentric interference). Do not make one promise to both.

**Then, and only then: retire Strong Focus.**

---

## ⛔ The twelve gaps — where the book does not answer, and invention is forbidden

Stated so nobody fills them quietly. **Five block the build.**

| # | Gap | Status |
|---|---|---|
| 1 | **Which weekday is day 1** | Ours. Stage 4 — the composer anchors on the athlete instead. |
| 2 | **How long each interval session takes** | ⛔ **BLOCKS STAGE 1.** He gives intervals, warm-up and cooldown; never a total. Compute and label as computed. |
| 3 | **A club session that fights the pairings** | Stage 4 + 6. Build and warn — never drop. |
| 4 | **Block length, and when the taper column fires** | ⛔ **UNANSWERED.** "All-year" with no stated trigger. **Ask Michael.** |
| 5 | **Which of the 3–4 workouts inside a slot to use** | ⛔ **BLOCKS STAGE 5** — it is the size dial. "Shortest for lighter athletes" is ours. |
| 6 | **Cycling percentage basis** | Inference. Label it. |
| 7 | **The All Rounder's keystones** | He names them for Fondo and Crit, not this one. We pick; say so. |
| 8 | **Strength progression for this program** | He says only "adjust your 1RM as you improve". **Wendler fills it — a stated graft.** |
| 9 | **Warm-up sets for lifting** | Wendler's 40/50/60. Cite him. |
| 10 | **Rest between sets** | Not stated except 6–8 min for PAP. |
| 11 | **When "1 to 3 sets" becomes 2 or 3** | "Start low, go up if progressing well with recovery to spare." No rule. |
| 12 | **How often to re-estimate threshold** | ⛔ **UNANSWERED, and it is his stated progression mechanism for this plan** (p275: adjust intensity and threshold, never level). **Ask Michael.** |

⚠️ **Items 4 and 12 are where invention is most tempting** — both feel like they must have an answer,
and neither does.

---

## Still owed from before

- **Nothing has been verified on a device since stage 1 was built.** Six stages, zero device checks.
- **Four defects in the last generated Strong Focus block**, deliberately not fixed: the threshold
  ride never tapers (45 min every week for 12 weeks — the wrapper fills a fixed budget while the work
  shrinks); "shares the day with your hard run" fires on weeks with no hard run; week 12 references
  assistance that is not there; week 11's ride has a recovery between a single interval.
  ⚠️ **Two of those die with Strong Focus. Two travel** — the wrapper and the interval builder — and
  are fixed properly by stages 1 and 4 here.
- **The run screens offer 2–4 runs; the wire accepts 1.** A screen decision. Recommendation: allow 1
  — once a week is his maintenance floor, and a bike-primary athlete keeping one run is the customer.

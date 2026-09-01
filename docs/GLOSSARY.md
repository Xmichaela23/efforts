# GLOSSARY — the words, the numbers, and the five states a plan moves through

**Written 2026-09-01. Read this before `WHAT-IS-BUILT.md` if the words are unfamiliar; read it
before opening any investigation if the state is.**

Two things live here and they are the two most expensive kinds of confusion in this project:

1. **The vocabulary.** Half of it is the book's and half is ours, and a session that cannot tell
   which is which will either invent a rule or contradict one.
2. **The lifecycle.** Most reported "holes" are somebody looking at stage 2 and expecting stage 4.

⛔ **Every number in this file is quoted from the code, not remembered.** Where it says OURS, the
source states nothing and somebody chose it — and the choice is labelled at the site.

---

## 1. THE FIVE STATES OF A PLAN — read this before reporting anything as missing

A block does not arrive finished. It moves through five states, and **each one has things that are
correctly absent.** Reading a row from state 2 while expecting state 4 is the single most common
false alarm in this project.

| # | state | what is true | ⛔ what is CORRECTLY absent |
|---|---|---|---|
| **1** | **AUTHORED** | The wizard's answers become twelve weeks of sessions in one pass, stored on the plan row. Movements, slots, sets and reps are all decided. | Nothing is on the calendar yet. |
| **2** | **MATERIALIZED** | Each week's sessions become calendar rows the app can open. | **Weights, on every lift except a test.** The athlete has not tested, so there is no working number and every top set says *By feel*. **This is not a hole.** `golden/untested-minimal.txt` is what it looks like when it is working. |
| **3** | **TESTED** | Week one's two sessions are run: work up in three steps, last set for max clean reps. | Nothing downstream has changed **until the session is saved**. |
| **4** | **REPRICED** | On save, the block re-reads itself: the tested sets become working numbers and every week that has not happened is rewritten with real weights. | **The weeks already done or in progress.** They are deliberately skipped. A fix or a test result reaches the *future* of the block, never its past. |
| **5** | **PROGRESSING** | Logged sets earn set counts and bar increments; the block climbs on what the athlete actually did. | **Movement, until something is logged.** Two identical-looking weeks early in a block are correct — see §5. |

⚠️ **The composer authors all twelve weeks up front.** So a fix to how weeks are built does not reach
an existing block. It arrives only when the block is rebuilt, and the rebuild skips weeks that are
done or past. *"I fixed it and it did not change"* is usually this.

---

## 2. THE WORDS — the book's

A session slot is named as **intent × category × pattern**, e.g. *"1 × ME: braced push"*.

**INTENT — how hard, how many, how close to failure.** p218's table, and it is the law:

| intent | reps | load | reps in reserve | sets |
|---|---|---|---|---|
| **ME** — maximum effort | 1–5 | 90–100% | **none stated** | 1–3 |
| **DE** — dynamic effort | 2–4 | 70–80% | 3–4 | 4–6 |
| **SKILL** | 3–5 | 75–85% | 3–4 | 3–5 |
| **HYP** — hypertrophy | 6–12 | **none stated** | 0–2 | 3–4 |

⚠️ **ME has no reps-in-reserve target and HYP has no load.** Those absences are the page's, and a
surface that invents either is contradicting it. HYP carries no weight because the reserve IS the
prescription — you pick the weight that leaves you one or two.

**CATEGORY — what kind of movement.** primary · secondary · braced · focused · core.
*Braced* means externally supported, which in the book usually means a machine.

**PATTERN — what it trains.** push_upper · pull_upper · hinge_lower · press_lower.

**FRAME — a programme, transcribed from its page as data.** Standard Focus is the All Rounder
(pp.274–275). Each frame has two **columns**: `standard` and `taper` (the lighter variant).

⛔ **AND THE ALL ROUNDER AS PRINTED IS A GYM PROGRAMME.** Six of its slots are *braced* — his own
list for those is Smith press, machine chest press, dip machine, chest-supported row, lat pulldown,
hack squat, leg press, reverse hyper, GHD — and most of the focused work is machines as well.
⚠️ **Not one primary lift appears in it.** Every slot is secondary, braced or focused, which is why
p275 has to add that primaries *may* be substituted in. **So the barbell and rack this app asks for
are OURS**, not his: a day opens on the athlete's competition lift because that is the only way a row
gets a weight. Running his programme for an athlete with no gym is the substitution ladder's whole
job, and it is the part of this app that is worth the most.

**SLOT — one printed row of the frame.** The frame owns which slots exist, their order, and the
spacing between lifting days. Nothing may add or reorder a slot.

**COMPETITION LIFT — the lift the athlete wants a number on.** It occupies the day-opening slot and
is what week one tests.

---

## 3. THE WORDS — ours

⛔ **These are not in the book. Do not cite a page for them.**

- **Working number** — 96% of the predicted max from the test. The number every prescribed weight
  comes off. ⛔ Never a stored 1RM and never a training max.
- **Seed** — a stored 1RM, used only to aim the test's warm-ups. It never becomes a working number.
- **Pick** — the athlete's choice for one of the frame's accessory cells. **Slot picks** name a
  printed cell; the **flat list** carries choices placed by what they train.
- **Dial** — at most two muscles run toward the book's higher weekly band instead of the minimum.
- **Muscle floor** — a backstop: at least one accessory slot per muscle group per week, so a muscle
  the week left at zero gets something. **Three sets** — one slot, the low end of the HYP band.
- **Session ceiling** — 14 work sets. Past it the book says other-discipline performance suffers, so
  the floor stops adding.
- **Execution name** — a display-only name for a movement reached on a different route than its
  canonical name implies (a rear-delt machine done with dumbbells on an incline bench).
- **Archetype** — a fixture athlete in the golden blocks. Never a real person's numbers.

---

## 4. HOW A WEIGHT IS DECIDED — the four cases, and three of them are "by feel" on purpose

⛔ **Read this before reporting a missing weight.**

| the row is… | shows | why |
|---|---|---|
| **the tested lift itself**, on a heavy or speed slot | a number | its working number × the intent's percentage |
| **another barbell lift in the same pattern** (front squat, incline bench) | a number, marked *derived* | the tested lift's own prescribed weight × the movement's catalogue ratio, so it moves exactly when the primary moves |
| **a hypertrophy accessory** (3×6–12) | **By feel** | ⛔ **by design.** The reserve is the prescription; the athlete picks the weight that leaves them 1–2 reps short. A computed number on a curl is false precision, and it is how Strong and Hevy behave |
| **a pattern with no tested lift** — anything on the pull day, any one-sided movement | **By feel** | a pull-up capacity is a rep count, not a load, and a per-hand or single-leg number on one row would be a doubled prescription |

⚠️ **So a correctly working block has more "By feel" rows than numbered ones.** That is the design,
not a gap.

⛔ **AND THE ROW NOW SAYS WHICH KIND IT IS** (2026-09-01), because on a screen all three looked
identical to a weight that failed to land:

| the row prints | it means |
|---|---|
| *your call — pick a weight that leaves 1-2 reps in reserve* | auto-regulated. **No number is coming, ever** — the reserve IS the prescription |
| *no tested lift for this pattern, so it stays your call* | structural. Testing more will not change it |
| *per side — your call, so one number cannot mislead you* | one figure would read as doubled |
| *weights arrive once you log the test* | **the only one that promises a number later** |

---

## 5. HOW A WEIGHT MOVES — and for Standard Focus there is no calendar drift at all

⛔⛔ **On Standard Focus the scheduled rise is ZERO, and that is a ruling, not a missing number**
(2026-08-30). The book prints a rate for a *different* programme; p275 states none for this one.
**Progression is earned or it does not happen.**

**The double progression owns the number:**

- finish the **top of the rep range twice running** → the bar goes up one step
- **miss the bottom** of the range → it returns to the last weight it held
- a **failed attempt** undoes the last step at once
- **log nothing → nothing changes.** Silence holds, in both directions

**The step** is 5 lb upper / 10 lb lower, raised to whatever the athlete's smallest plate pair can
actually make. **Set counts** climb the same way — 1 → 2 → 3 on a heavy slot, earned, because the
book says start at the lower end and add only on demonstrated progress.

⚠️ **THE TRAP THIS CAUSES, AND IT HAS BEEN WALKED INTO.** A composed fixture has no logged history,
so it looks flat and is not. *"Eleven flat weeks"* was claimed here, was wrong, and cost a reverted
change. ⚠️ **And the opposite trap:** the mechanism existing is not evidence it has run. As of
2026-09-01 there is one logged test in this project's history and a test day carries no rep-range
work, so **nothing has earned an increment yet, and nothing should have.**

---

## 6. WHAT A TEST DOES

- Week one's day 1 and day 2 are the test: **work up in three steps — about 75% of the predicted
  max, then +10%, then +5% more — and take the last set for max clean reps.**
- ⛔ **Two writes, and they are independent.** The tested set is what reprices the block, and it
  happens on save, announced, with an undo. Writing the number into the athlete's **baselines** is a
  separate tap, and if any lift tested *lower* than what is stored, nothing is written at all until
  the athlete decides.
- ⛔ **A test day is only the test.** No filler volume, no added exercises, no second all-out set.
  Volume comes down into a max test everywhere in the field; nothing prescribes accessory work after
  one.

---

## 6b. WHAT THE ATHLETE CAN CHANGE, AND WHERE

| they want to | control | where |
|---|---|---|
| do a different movement **today** | Swap → *Just today* | the row, in the logger |
| do a different movement **from now on** | Swap → *Rest of plan* | same control — this is also how an exercise they added earlier comes back off |
| add a movement the plan does not have | type it in, then *Add to plan* | ⚠️ it is dosed at whatever the row looked like when they tapped, on every matching lifting day, with no end date |
| choose the accessory movements up front | the picker, per printed cell | the wizard |
| drop a row from today only | *Remove exercise* | the foot of the card |

⛔ **THE TWO-CHOICE SHAPE — today, or the rest of the plan — IS THE PATTERN.** It exists on Swap. A
session on 2026-09-01 built a second removal path rather than reading it, and the work was reverted.
Anything new that changes a plan from the logger belongs in that shape, on that control.

---

## 7. WHERE TO GO NEXT

| question | file |
|---|---|
| *Is this thing built?* | `WHAT-IS-BUILT.md` |
| *What is the state of the work right now?* | `ENGINE-STATE.md` — top banner |
| *Is this row a hole?* | `_shared/standing-plan/golden/` — and `npm run block:check` |
| *Does this still obey the book?* | `protocol.test.ts` — ten rules, each named after its page |
| *Would a NEW programme obey it?* | `frame-rules.test.ts` — four laws over every frame and kit |
| *What do I have to redeploy?* | `docs/INVENTORY.md` §1 — per file, generated |
| *What does the book actually say?* | `SOURCE-viada-hybrid-athlete.md` — page images open when written |
| *Why is it like this?* | the decisions logs, `D-NNN` |

⛔ **If a claim in this file disagrees with the code, the code wins — and fix this file the same
session.** A glossary that lies is worse than no glossary, because it is the one document a new
session will believe without checking.

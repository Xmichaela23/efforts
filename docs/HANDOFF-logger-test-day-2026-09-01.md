# HANDOFF — BUTTON UP THE LOGGER'S TEST DAY
**Written 2026-09-01 night. For a NEW chat with no context. Paste this file's path as the first thing
you say to it.**

⛔ **READ FIRST, IN THIS ORDER:** `docs/SPEC-test-day-2026-09-01.md` (the work order — every ruling and
trace), then this file (state and rules). Do not read the State-screen fixlist; that arc is closed.

---

## THE ONE-PARAGRAPH VERSION

Michael ran his own week-1 tests and the app underread every lift. The logger throws away the plan's
composed three-step test and substitutes a generic one — a single all-out set at a percentage of a
number **frozen when the plan was built** — and tells the athlete to *"aim ~3–6 reps, stop at RPE 9"*
on the one session whose purpose is finding a limit. His squat, whose number was never frozen,
started him at the **empty bar**. Two fixes are BUILT AND UNCOMMITTED. Four more are specified and
unbuilt. And one test now produces **two different numbers** from two different formulas, of which
the lower one decides what he lifts for eleven weeks.

---

## STATE — the three words, separately

| | |
|---|---|
| **PUSHED** | `origin/main == d8f77067`. Everything through the State arc is on main. |
| **DEPLOYED** | 27 edge functions, 2026-09-02 00:10:44 UTC — `coach` v513, `compute-snapshot` v180. |
| **VERIFIED** | The State screen, yes, on his device. **The logger fix: NO — built, never committed.** |

⛔ **UNCOMMITTED IN THE TREE RIGHT NOW:**
- `src/components/StrengthLogger.tsx` — **fixes A and B, built and green, never pushed.**
- `docs/SPEC-test-day-2026-09-01.md` · `docs/HANDOFF-logger-test-day-2026-09-01.md` (this file)
- `docs/POLISH-PUNCH-LIST.md` · `docs/FOUNDATION-READINESS.md` · `docs/FIXLIST-state-screen-2026-09-01.md`
- `ios/debug.xcconfig` — ⛔ **NOT OURS.** Dirty since before this arc. Never stage it.

⚠️ **His phone runs a build from 14:30 local 2026-09-01.** Nothing since reaches it without
`npm run ios:open` and ⌘R with the phone connected and unlocked.

---

## WHAT HE ACTUALLY MEASURED — the evidence, and it is the acceptance test

| lift | set | the truth | the block took |
|---|---|---|---|
| Back Squat | 105 × 6 | **125** | *nothing — absent* |
| Deadlift | 170 × 3 | **185** | 176 |
| Bench Press | 130 × 7 | **160** | 152 |
| Overhead Press | 85 × 8 | **105** ⚠️ a real decline from 110 | 102 |

⛔ **MICHAEL'S RULING: "Performance screen is getting it, logger is messy."** The Performance tab's
numbers are the truth. The block must price off them and must not run its own maths.

**THE GAP, SETTLED FROM THE SOURCE — and my first reading of it was WRONG.** There is **one formula,
not two**: both paths compute the Epley/Brzycki average, and the block then applies **× 0.96**, which
is **sourced to p215 H2**. So 152 / 102 / 176 are a correctly derived **working number**, not a second
answer and not a hidden shave.
⛔ **THEREFORE C IS SOURCE-AND-LABEL, NOT DELETION.** Do not remove the 0.96. The defects that remain
are that the block reads its own copy instead of one upstream source, and that the card says
*"sets the block at 152 lb"* beside a screen saying 160 **without ever saying the two are different
quantities** — a 1RM and the working number derived from it.
⚠️ An earlier note in this arc claimed the block fitted O'Conner and that the deadlift carried an
extra shave. **Both were arithmetic guesses and both are false.** Do not carry them forward.

---

## THE SIX PIECES

| | what | side | state |
|---|---|---|---|
| **A** | Stop the hijack — a `standing_plan` tested lift renders the composer's ramp, not the generic one | client | ✅ **BUILT, UNCOMMITTED** |
| **B** | The test row states the number on file and its source, and that the last set sets the block's numbers. "aim ~3–6" and the RPE-9 stop removed from the test path | client | ✅ **BUILT, UNCOMMITTED** |
| **C** | ⛔ **One test, one number, one writer.** The block reads the Performance path's result and never recomputes | server | specified |
| **D** | The ladder — rungs offered while sets stay clean | client + ? | specified |
| **E** | The ask on tap-out, one answer writing baseline AND block numbers | client + server | specified |
| **F** | The block's guard: a result far below the stored number, or past the rep ceiling, does not re-price silently | server, 4-fn closure | specified |

| **G** | The logger states the estimate the moment an all-out set is entered, and what it is measured against | client | specified |
| **H** | Warm-ups composed off the same reference as the rungs — never hardcoded | ? | specified |

**Recommended order: C → G → F → E → D → H.** ⚠️ G moved early: it is small, it is the thing he hit
first-hand mid-test, and **the ladder (D) is unusable without it** — nobody can decide on another rung
without seeing what the last one was worth. C first because it dissolves the squat problem and the
two-number problem at once.
⚠️ **G and H are in the spec's ADDENDUM**, added after his last look at it — read to the end of that
file, not just the table.

⛔ **THE OPEN QUESTION THAT GATES C:** is the block's lower number a second answer to the same
question, or a deliberately conservative **training max** derived from the 1RM? If a training max is a
real sourced concept here, 152/102/176 may be correct-but-unlabelled and the fix is labelling plus one
upstream source — not deleting the derivation. **Check before building.**

---

## THE RULES — all hard

- ⛔ **Never write his data.** His logged sets stand as logged. Fix forward, always.
- ⛔ **The logger is a beast.** Say which branch you are editing and what else reaches it **before**
  you edit. The live mechanism is the **TAG-retest arm**; ⚠️ it is NOT the upper/lower name-match
  branch — that guard was fixed 2026-08-31 and a first trace wrongly blamed it.
- ⛔ **Commit, push and deploy wait for Michael, typed by him, every time.** Reads and edits are free.
- ⛔ **Never `git add -A`.** Explicit paths. Three sessions share this repo.
- ⛔ **Viada is the only source.** Never mention Wendler or 5/3/1. Never mention the 5K plan.
- ⛔ **Label every claim by evidence class** — code-traced / rendered / live / composed. If a fault is
  **computed and unrendered, say so in the first line**; it changes what he is told.
- ⛔ **He built the app and does not read code.** Plain words, no file names, no function names, no
  invented terms. Short. No emojis, no idiom, no process narration.
- ⚠️ **Judge every fix against a first-time lifter with an empty profile**, never against Michael's
  numbers. The customer is an endurance athlete who has never tested a squat — for them the test is
  the only way the app ever learns a number at all.
- ⚠️ **A plan rebuild must not force a retest.** He has now run tests twice for that reason.

---

## WHAT IS NOT THIS ARC

Round 3's sport-block consolidation, Round 4 copy, the ten-bucket change line, the server-side
leftovers — all State screen, all recorded in `docs/FIXLIST-state-screen-2026-09-01.md`. **Leave them.**

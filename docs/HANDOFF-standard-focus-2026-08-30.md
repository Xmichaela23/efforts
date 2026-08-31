# HANDOFF — Standard Focus (the All Rounder), as built

**Written 2026-08-30 at the end of the build session. This supersedes the planning half of
`DESIGN-standard-focus-all-rounder-2026-08-30.md`, which was written BEFORE the build and is now
partly stale. Where the two disagree, this one is what the code does.**

Every claim here is sourced to a page or marked OURS. Read §7 before touching anything.

---

## 1. WHAT SHIPPED

Standard Focus is live and selectable on the Train screen, above Run Focus and Ride Focus. Picking it
builds Viada's All Rounder (p274-275). Strength + 5K is unchanged and frozen as a design — still
guarded by its tests, and its composed output is byte-for-byte identical to before this session.

Twelve commits, `10fe2f8c` through `0763bcec`. Everything through `3440b836` is pushed and the four
edge functions are deployed. **`0763bcec` is committed and NOT pushed.**

The card reads:
> Strength, running and riding run together, year-round, with a pivot to a race or a single sport when one comes up.
> Needs a barbell and plates, a rack and a bench — and a tested squat, bench press, deadlift and overhead press.

---

## 2. THE WEEK — HIS, VERBATIM FROM p274

| Day | Strength | Endurance |
|---|---|---|
| 1 | Upper body: Push | MLSS+ (level 2) — the hard run |
| 2 | Lower body: Hinge | Cyc AnA (level 1) — the anaerobic ride |
| 3 | Plyometrics only | NT (level 2) — near-threshold |
| 4 | Upper body: Pull | Cyc endurance (level 1) — the easy ride |
| 5 | Lower body: Push | *(none)* |
| 6 | — | LSD (level 2) — the long session |
| 7 | REST | |

**The number in each cell is the LEVEL and it is his.** The athlete does not choose it. Rides are
pinned at level 1, runs and the long session at level 2.

**Sport placement is his and it is interference logic, not intensity.** Running lands on upper-body
days and the plyo day; the bike takes the day sitting next to heavy legs; the hardest leg day gets
nothing. Riding hard next to a squat day costs less than running hard would.

**Taper column** is a substitution, not a volume cut: both leg days lose their endurance, NT drops to
VT1, the heavy lifts become speed or skill work. Five endurance sessions become three. ⚠️ **Nothing
sets taper weeks today** — `taperWeeks` is passed empty, so all twelve weeks run the standard column.

**22 strength slots** across four days, against Strength + 5K's 17. All secondary/braced/focused as
written; Michael has ruled that primaries go in the ME slot that opens each day, which p275 permits
outright.

---

## 3. WHAT THE ATHLETE ACTUALLY PICKS

Small, and that is correct for a programme rather than a builder.

- **Sport on three of five endurance slots.** The two rides state their sport and offer no choice —
  the engine has no ride-to-run conversion, so offering Run would hand them a ride with nothing said.
- **At least one run must remain a run.** Up to two of the three may move to the bike. p275 recommends
  impact with the ground on at least one day; ⚠️ **enforcing a recommendation is OURS** and the screen
  says why when the limit is reached.
- **Hours and days per sport.** See §4 — they do different things and the screen does not say so.
- **Experience tier per sport.** Moves the level for a lower-volume athlete.
- **Accessory movements** on the Build focus screen, and their four maxes.

---

## 4. HOURS AND DAYS BEHAVE OPPOSITELY, AND NOTHING SAYS SO

⛔ **This is the single most confusing thing on the screen and it is not a bug.**

**Riding — hours land, and keep landing.** Measured: ask 4h → 4h15 built; 6h → 6h00; 8h → 8h00 with a
3h36 long ride; 10h → 10h00 with a 4h31 long ride. For base families the level IS the duration
(p235), so the two endurance rides stretch and absorb almost anything.

**Running — hours stop dead.** Two of the three runs are quality sessions at a fixed dose, so extra
hours have only the long run to land on and it caps at 100 minutes. Ask 4h, 6h or 8h across three run
days and you get 3h20 every time. **Adding a run DAY is the only thing that moves it** — 4 days →
4h52, 5 days → 6h22, and five is the ceiling because that is all the free days there are.

So the hours dial works for riding and does nothing for running. **The fix is a sentence on the
screen, not machinery** — the "add a run day" line exists and only appears after the plan is built.

**Floors, per sport, ride week:** 3h00 at less experienced, 4h12 at more. The floor is HIS — 60 min
each for the easy and long rides is printed on p239; the anaerobic ride's 65 min is arithmetic over
his own interval options and is labelled computed. ⚠️ Ours inside it: 12½ min warm-up, the midpoint
of his stated 10-15.

**Ceilings:** 5h per ride session; 90 min easy run, 100 min long run. The long run's 100 is HIS
(p247) and superseded an earlier 2h30 that was ours.

---

## 5. WHAT IS OURS

Label these where they live. Every one is already labelled in code; keep it that way.

- **No calendar drift.** `RATE_ANCHOR` for this frame is ZERO on Michael's ruling of 2026-08-30:
  progression is earned or it does not happen. The logger lays every session out, so the app always
  has evidence and a scheduled rise is a guess stacked on top of it. ⛔ **No "what if nobody logs"
  branch, decay or default drift may be added.**
- The one-run floor (enforcing his recommendation).
- Using level 1 for a lower-volume rider — `LOW_VOLUME_RIDE_LEVELS_ARE_OURS`. His cycling programmes
  have no taper column to source a smaller dose from, unlike the run side.
- The ride level ladder rests on a reading of p239's "roughly comparable in overall fatigue" that the
  code records as ours.
- Standard Focus / Run Focus / Ride Focus as names, and the "Focus" branding.
- The superset clock (he gives a readiness rule, never minutes).

---

## 6. OPEN — Michael's rulings needed

1. **Should Standard Focus be the default?** It is not. Flipping it moves every athlete mid-block and
   needs the screen that asks.
2. **Taper weeks.** Nothing sets them; twelve straight standard weeks. Every-fourth-week would be
   OURS — he calls it taper/deload and prints no cadence.
3. **Block length.** "12 weeks" is inherited from the archived protocol and justifies nothing for
   either frame. The shape agreed in conversation: 12 weeks, ending in the test, then rebuild on the
   new numbers — his own model, since p275 says the programme is all-year and only the anchors move.
4. **The easy row offering Run.** Needs the reverse ride-to-run conversion built. Deferred.
5. **A core slot.** p274 prints none; the 5K frame has one. Adding it would be sourced to his ordering
   rule (main → core → isolation) rather than the page. Deferred: *"eh leave it for now"*.
6. **The entry gate.** The four typed 1RMs now buy exactly ONE thing — the warm-up weights on week
   one's test sets. Nothing else in the block reads them, and the same AMRAP test is done twice
   (baselines screen, then week one). Michael: *"first week is the same test we ran before… it can
   happen later"*.
7. **Strides.** The All Rounder has no easy run, so no session carries them and the frame declares
   that absence rather than losing it by accident. Either one of the three runs carries them despite
   p275's resist-adding note, or the programme has no running economy work.

---

## 7. THE TRAPS — every one of these cost hours today

⛔ **ONE FRAME'S ANSWERS, ANOTHER FRAME'S ROWS.** Four separate module constants were computed at load
from `strength_5k` and then indexed by the chosen frame's row keys: the row list, the family map, the
quality-row helpers, and the experience chip. One blanked the whole app; the others failed silently.
**A constant imported at the top of a file looks identical, at the call site, to a derived value.**
The card now derives one frame before any reader and a test asserts it imports none of them.

⛔ **A READER RE-DERIVING WHAT THE FRAME COULD STATE.** Found six times: hardness, long-session
identity, anchor role, conflict families, heavy-leg-day, and a slot's SPORT. The last one is the
sharpest — every slot was stamped `run` and only became a ride by CONVERSION, so p274's natively
prescribed rides kept the run stamp. The counts then read four runs against a stated two, the trim
dropped two real sessions and the fill added two filler rides, one onto the rest day. **One wrong
stamp, every symptom.** `EnduranceSlot.role` exists so a frame can state what a slot is for; use it.

⛔ **TESTS THAT ASSERT THE MODULE, NOT THE PATH.** Three fixes in a row shipped broken with green
suites. The routing tests pinned the payload and not which screen opens. The five-row test called the
frame's slot list directly, which is not what the card did. **Verification means a rendered page or a
generated plan, not a module call.**

⛔ **A HARNESS MUST BUILD ITS INPUTS THE WAY THE DOOR DOES.** `endurance_frequency` is the RUN count;
ride days live on `bike.days`; the real fields are `endurance_days` + `target_run_hours` /
`target_ride_hours`; overhead press is `overheadPress1RM`; the materializer reads a TOP-LEVEL
`baselines.ftp`; run paces resolve through `_snapshotRunPaces` first.

⛔ **NEVER `git add -A`.** Three sessions work in this repo.

⛔ **ASSERT ON EVERY REGEX REPLACEMENT COUNT.** Two outer regexes silently failed to update and every
affected token expanded to nothing. Caught only by hand-expanding a token.

⚠️ **A TEST THAT FIGHTS YOU MAY BE PINNING A PROXY.** Twice the assertion was a stand-in for a rule
that was still true. Strengthen it; do not relax it.

⚠️ **A CLASSIFIER YOU WROTE IS NOT EVIDENCE.** One swung 36 → 39 → 24 → 45 → 50 measuring the same
code. The live rows were right every time.

---

## 8. KNOWN AND NOT FIXED

- **The ride ladder can build a 4h31 long ride through a level the clamp says is never built.** Band
  and ladder are two tables. Same two-sources shape as the floor that was just unified.
- **The under-ask sentence has a quarter-hour dead band**, so a 4h ask against a 4h15 floor is still
  silent. Deliberate — it matches the over-ask's shape.
- **The experience chip reports the HARD session only.** On a sport whose tier moves the LONG session
  instead, the control looks dead — two identical ride chips. The equal-tiers line
  (*"At these hours the answer makes no difference…"*) is **provably false on the live build** and
  must go or become conditional. ⛔ This is the next piece of work.
- **The competition lifts are prescribed regardless of declared equipment** — a dumbbell-only athlete
  is handed Bench Press, Back Squat and Deadlift with no way to perform them. True on both frames.
- **Four movements carry no gear tag**: belt squat, smith machine squat, seated cable row, incline
  dumbbell row.
- **Braced slots silently unbrace at the home baseline** — `braced press lower` lands on a Bulgarian
  split squat, `braced pull upper` on a barbell row.
- Day 5's **Leg isolation** slot filled with a **Weighted Knee Raise**, a core movement in a leg slot.
- **`11 W` renders on running steps** (easy-run strides).
- **Near-threshold is APPROXIMATED** — reps and time land close, the percentage band collapses to the
  word "threshold".
- **The composer never asks for p235's 5-min @ 95% mid-run interval.**
- **The plan's measured numbers never reach the athlete's baselines**, so the next block seeds its
  warm-ups from the older figure.
- **Overhead press** is demanded at the gate, tested every block, and used for nothing else.
- **`RIDE_EQUIVALENT`** — deliberately untouched. It gets clipped once riders have their own frame.
- Twelve pre-existing test failures in seven files, unrelated, unchanged all session.

---

## 9. HOW TO VERIFY, AND IT IS NOT NEGOTIABLE

Michael's ruling: *"it should be logging on as a robot user and go through the wizard."*

Throwaway account, real wizard, real plan, read what a person sees. Unit tests are necessary and not
sufficient — two defects reached him through 4,700 green tests, and three fixes in a row shipped
broken with a green suite.

⚠️ **Neither Claude session can create an account or type credentials into a sign-in form.** The
workable shape is Michael signing a throwaway user into a tab and handing it over — driving an
authenticated session is fine, authenticating is not. Until that exists, say plainly which findings
are code-verified and which are device-verified. They are not the same evidence.

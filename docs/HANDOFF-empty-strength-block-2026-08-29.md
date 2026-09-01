# HANDOFF — "strength block" empty rows in a generated Strong Focus plan

**Written 2026-08-29, late. Start here; do not re-derive what is already ruled out.**

---

## THE SYMPTOM

A generated 12-week **Strong Focus** plan has **no exercises in any lifting session**. Every strength
session across all twelve weeks — Test: Upper, Test: Lower, Heavy: Upper, Heavy: Lower, Speed: Upper,
Speed: Lower, Plyometrics — exports as:

```
- Test: Upper (0h 45m)
  - **Exercises:**
    - strength block: 0
```

⛔ **Confirmed on the device, not just in the export.** Opening `Log: Test: Upper` shows a real
exercise row whose NAME is the literal lowercase string **"strength block"**, with one empty set — LB
blank, REPS blank, RIR blank, 45 lb bar selected. The exporter is faithfully printing what is stored.

**Second symptom, probably downstream:** weeks 2 through 12 of the export are **identical word for
word**. Same names, durations, coaching copy, same empty block. No load wave, no weight moving, no
lighter week. A block with no exercises has nothing to progress, so this may resolve itself once the
first is fixed — but confirm rather than assume.

⚠️ Plan artifact: `~/Downloads/strong-focus (35).md`.

---

## WHAT IS ALREADY RULED OUT — DO NOT REDO THESE

1. ⛔ **Tonight's catalogue work did NOT cause it.** Generated at HEAD, the composer produces full
   sessions — bench press, barbell row, deadlift, front squat, hip thrust, the ramps, the core row in
   the right place, five populated sessions per week. The thing that builds exercises works on the
   code that is deployed. This was the first-order suspect and it is dead.
2. ⛔ **It is not the exporter.** The logger shows the same empty row on the device.
3. ⛔ **It is not a placeholder the generator emits.** The string "strength block" **appears nowhere
   in the code as an exercise name**. It is in the DATA.
4. ⚠️ **The export is NOT evidence the athlete's picks are missing.** It prints `Version: 2` and
   stops, because the nested `by_day` and `viada` objects underneath are not rendered by the exporter
   at all. The builder does write picks under `viada`, and the generator reads exactly that key. A
   previous session nearly concluded the picks were absent from something that structurally cannot
   show them.

---

## WHERE THE EVIDENCE POINTS

The plan in hand was written by **something other than the composer that runs now**. Either it
predates a working generation path, or `generate-strength-plan` **fell through to a different branch
before ever reaching the composer**.

Supporting shape: the session names, durations, day placement and coaching copy are all correct, and
the endurance side wrote fine. It is **specifically the strength rows** that never got built.

## THE NEXT STEP

**Regenerate a plan and watch what `generate-strength-plan` actually returns.** This needs the LIVE
path, not fixtures — that is the whole point, since the composer is provably fine in isolation.

⚠️ Michael's standing rule: verify with fixtures, not prod. This is the exception the rule allows,
because the failure is in the path *between* the fixture-tested unit and the database. Read-only
diagnosis; ask before any write.

## THE COVERAGE GAP, NAMED

2,415 tests pass and none of them catch this. **They all test `composeWeek` directly.** Nothing tests
the path from *"athlete presses generate"* to *"rows exist in the database."* That is the gap, and it
is worth a test once the cause is known.

---

## SHIPPED STATE AS OF THIS HANDOFF

- **Pushed** — yes, `origin/main` at `9a20d7f2`.
- **Edge functions** — yes, ten deployed.
- **Client** — Netlify builds off the push. Nobody triggered or watched that build.
- **Device-verified** — the Build focus screen, yes, by Michael watching it. Nothing else.
- 2,415 tests passing. 4 pre-existing lint errors, unrelated, same lines as this morning.

---

## WHAT SHIPPED TONIGHT, FOR CONTEXT

The exercise catalogue was cut to **only movements Viada prints on pp.218–227**, on Michael's ruling
("I don't want extraneous exercises that aren't in his book").

- **Out:** dumbbell bench press, every push-up variant, dips, floor press, face pulls, shrugs, hammer
  and cable curls, reverse flies under four names, step-ups, goblet squats, lateral lunges, side
  bends, sit-ups, dead bugs, bird dogs, flutter kicks, toe touches, four "core work" placeholders.
- **Kept as his:** Bulgarian split squat and walking lunge — p218 allows a movement "with or without
  minor modifications to setup".
- **One deliberate exception:** a dumbbell chest fly, displayed as **"Chest Fly - added"**. Viada's
  only chest isolation is the pec deck, which needs a machine. The mark renders automatically for any
  future addition.
- **Swap rule:** where a movement he writes with a machine is identical with free weights — same joint
  action AND same body position, only the load source differing — the free-weight version IS that
  movement. Rear delt machine → chest-supported raise on the incline bench; that row now DISPLAYS the
  execution name at home and his name at a gym, and **stores his name either way**, pinned by a test.
  ⛔ The pec deck was REFUSED under this rule: seated upright vs lying supine is a position change.
- **New:** day 2's secondary hinge picker (p246 `1 x DE: Accessory: secondary hinge lower`) — RDL,
  stiff-legged deadlift, good morning, sandbag throw at a barbell+dumbbells+bench setup.
- **Fixed:** five movements were being misfiled by the app's naming rules (Tate press and skull
  crushers read as compound presses, the rear delt machine as a machine, a drag curl filed with
  CARRIES on the word "drag"); an adjustable bench now counts for incline movements; kettlebell swings
  and hamstring curls were untagged and offered to everyone.

**Equipment baseline, Michael 2026-08-29:** barbell + dumbbells + bench for every athlete. Bodyweight-
only is not a setup anyone picks — it is the fallback that fires before the athlete has been asked
about equipment, and it must not be removed.

---

## OPEN, NOT PART OF THIS BUG

- ⚠️ **Slot labels are frozen and unsettled.** Currently Push isolation, Pull isolation, Hinge
  variation, Leg variation, Press variation, Leg isolation, Core. These are OUR words; Viada's are
  focused push/arms, focused pull/arms, secondary hinge lower, secondary press lower, secondary push
  upper, focused push lower/quads. Michael has been given three schemes in one evening and has not
  chosen. **Do not rename anything.**
- The equipment picker may still offer setups below the barbell+dumbbells+bench floor.
- Sandbag throw is ungated — there is no way for an athlete to say they do not own a sandbag.
- Chest isolation is gym-only for anyone without the pec deck machine, by design.

---

## REFERENCE

- `docs/REFERENCE-viada-movement-key.md` — pp.218–227 complete and verbatim, written today off the
  images. **The authority for what is and is not his.**
- `docs/SOURCE-viada-hybrid-athlete.md` — Part I is pp.110–112, his progression chapter, added today.
- `docs/WORKORDER-viada-owns-the-engine-2026-08-29.md` — the arc this sits inside.
- Page images: `/Users/michaelambp/Efforts_Local_Folder/book-sources/viada-hybrid-athlete/`

⛔ **Book search is CLOSED.** "The circle of reps" and "the threshold adjustment method" — the two
things p112 points at — **do not exist in the book**. Every page is accounted for and the pointer is
orphaned. The progression engine is built off p112 itself plus p218's skill row (3–5 reps at 75–85%)
and p247's rate (~1% every 3–4 weeks). Do not go looking again.

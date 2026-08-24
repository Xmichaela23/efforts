# Session A — the three engine items, and the fourth thing they uncovered

**2026-08-24.** Work list: `DEVICE-FINDINGS-standing-plan-2026-08-24.md` — A1, A2, A3 and A4 as ruled.
Read with `DECISIONS-2026-08-22-standing-plan-pivot.md` and the four `NOTES-stage4-*` files.

## STATE — three ways

| | |
|---|---|
| **pushed** | **NO.** Nothing committed. |
| **deployed** | **NO.** |
| **verified on a device** | **NO.** Verified by deno fixtures and 211 tests; the A4 card has not been seen on a phone. |

---

# ⛔ THE ONE THING TO READ IF YOU READ NOTHING ELSE

**Building A2 exposed a defect underneath it that would have made A2 ship dead.**

The composer prescribed the **top of both of his bands at once**: `pctOf1RM.hi` for the weight and
`reps.hi` for the set plan. On an ME slot that is **five reps at 100% of the working number** — and
the working number is already 96% of a predicted max (p215). Five reps at ninety-six per cent of a
one-rep max, on every ME slot, for twelve weeks.

⛔ **No earn rule keyed on hitting the prescription could ever have fired.** A2's ladder would have
computed correctly and never moved.

**Michael's ruling, 2026-08-24, verbatim in substance:** the slot prescribes at the **LOW end of the
intensity band** — 90% of the working number — with the **rep target open across 1-5** and every set
stopped short of failure. As the working number climbs at his rate anchor the achieved reps slide
down the band on their own: *"the inverse pairing expressing itself without a table."* Labelled OURS
at the site (`INTENSITY_STARTS_LOW_IS_OURS`) — he states "start at the low end" for SETS (p218's
first sentence) and gives intensity a band with no starting point in it; carrying his instruction
across to the other axis is ours.

⛔ **And it is an invariant, not a default: no row anywhere may carry `reps.hi` at `pct.hi`.**
`standing-plan-me-sets.test.ts` walks every prescribed row of every week of both columns and fails on
one. **Do not restore a top-of-band percentage for any intent without deleting that test, and do not
delete that test.**

⚠️ **THE RIPPLE, IN PLAIN NUMBERS.** This moves prescribed weight on every block:

| row | was | now |
|---|---|---|
| ME (bench, 200 lb working number) | 200 lb | **180 lb** |
| ME lower (squat, 260, week 2 haircut) | 250 lb | **225 lb** |
| DE (bench, 200) | 160 lb | **140 lb** |

DE moved too, and that is his ruling's own reach — *"never … together anywhere."* DE's band is 2-4
reps at 70-80%, so four reps at the lighter end is the coherent pairing. HYP is unaffected: p218
gives it no percentage at all.

---

# A1 — THE ACCESSORY PICKS REACH THE COMPOSER

**The finding.** Michael added ab and single-leg movements on the accessory screen and the built plan
came back with `plank — "Floor: core had nothing else this week"`. The engine stating, on the plan,
that it had seen no core from the athlete — on a week where the athlete had named one.

**The trace.** `NonRaceBuilder.tsx:1381` writes `training_prefs.assistance_picks`;
`create-goal-and-materialize-plan:2784` forwards it; `generate-strength-plan/index.ts:120`
destructures it — and spends it at line 811, **inside the Get Stronger branch, after the standing-plan
fork at line ~295 has already returned.** A starved path, not a missing one.

## What was built

- **`ComposeArgs.accessoryPicks: string[]`** — a flat, deduped list of movement names.
- ⛔ **The picker's DAY is deliberately dropped, and that is OURS.** Its keys are Wendler's three
  lifting days (`squat` / `bench` / `deadlift`); this frame's days are ME:Upper, ME:Lower, DE:Upper,
  DE:Lower. There is no honest mapping, so a pick is placed by **what it trains** — its pattern for a
  HYP slot, its prime mover for a floor. Stated to the athlete
  (`PICKS_ARE_PLACED_BY_WHAT_THEY_TRAIN`), never assumed.
- **A HYP accessory slot goes to a pick when the pick fits it**, and *fits* is `resolveSlot`'s own
  answer — the pick must already be an option that cell offers. So a pick can never enter a slot the
  frame did not ask for and **can never widen the equipment gate**.
- **The floor takes the rest.** `fillMuscleFloor` gained `prefer`, and a floor row filled by a pick
  says `Your pick for core.` instead of `Floor: core had nothing else this week.` — the sentence that
  was doing the lying.
- **Deduped against the WEEK** (`PickPool.placed`), not just the day: once a pick is placed, the grid
  will not choose the same movement again elsewhere. ⚠️ Deliberately narrow — a general week-wide
  dedupe would change every week this composer has ever built.
- **An unhonoured pick is named** in a `warning` note, which `buildStandingPlanRow` already turns into
  `placement_compromises` — the channel `NonRaceBuilder.tsx:2716` renders.
- **`config.standing_plan.accessory_picks`** stores what the block was built on, for the same reason
  `day_offset` and `sport_mix` are stored: a restate re-composes and matches on the movement NAME.

⚠️ **The flattening lives in the EDGE FUNCTION, not in the module.** `standing-plan.test.ts`'s module
lint forbids the standing-plan directory from importing `assistance-catalog` at all. So
`generate-strength-plan` calls `normalizeAssistancePrefs` — the one owner of the stored shape — and
hands the composer plain names.

⛔ **THE FOCUS CHIPS ARE NOT CONSUMED, AND THAT IS NOT AN OVERSIGHT.** `prefs.focus` biases WHICH
movement fills a Wendler category; this frame's slots are already named by pattern and category from
p246, so a chip has no slot to re-point. **That is Session B's B2** and it is noted at the call site.
⚠️ B2 as filed says *"verify a core focus biases the built week"* — **it cannot today**, because no
chip reaches this composer at all. B needs to know that before it starts.

---

# A2 — THE ME SET LADDER

**The finding.** Every ME slot prescribed `1×1-5`, all twelve weeks. `setsFor` returns the low end of
a band unless a caller says otherwise and **no caller ever did**. p084 wants 4-6 reps above 90% per
movement pattern per week; one set of one to five sits at or below that floor permanently, and the
thing that was short was the set COUNT — which nothing in the engine could move.

## The rule — every number OURS and labelled (`ME_SET_LADDER_IS_OURS`)

| | |
|---|---|
| range | **1 to 3 sets — HIS** (p218) |
| earn | **2 consecutive clean sessions** on a pattern → +1 set. OURS. |
| clean | **top of his rep band (4-5 of 1-5)**, every prescribed set completed at or above the prescribed load, **no set logged at 0 RIR** |
| setback | a miss (short session, under the load, below the band floor) **or a grind** (0 RIR) → −1 set |
| mid-band | completed, stopped short, 1-3 reps → neither earns nor costs, but **breaks the run** |
| silence | **nothing logged holds** — the count and the run both stand (pivot §4) |

⛔ **`rir === 0` IS THE ONLY QUALITY SIGNAL READ.** p218 gives ME **no RIR target** and says in the
same breath that each set *"stops short of failure."* A logged 0 is the athlete reporting the one
thing that instruction forbids. ⚠️ An **absent** rir is not a grind — absent means they did not say
(D-324), and inferring failure from silence would take a set from every athlete who skips the field.

## The wire

- `ComposedWeek.meRows` — an **in-memory** index of which rows were ME, whose pattern, how many sets,
  at what weight. ⚠️ Deliberately **not** a stored field: stamping `viada_pattern` onto
  `StrengthExercise` would be a persisted shape change for a fact the composer hands back free, on a
  path (`materialize-plan`) that rebuilds each exercise object field by field and would drop it.
- `me-history.ts:earnedMeSets` — reads logged sessions, matched on **week + weekday + movement**, the
  identical three keys the restater uses. Reports `unread` rather than implying it read everything.
- `rematerialize-standing-block` composes **twice**: a probe at the block's authored set counts (which
  is what the athlete trained against) to get the index, then the real composition with the earned
  counts. Composing the probe with the earned counts would be circular.
- `restateFromTest` now moves **set counts on their own axis**, not only weights — the ladder can add
  a set in a week whose weight does not move, and a diff that only looked at the weight would drop
  every one of those.

## ⛔ A LATENT BUG THE (REVERTED) PLYO SPREAD SURFACED — see A3 below

`restateFromTest` assumed one strength session per day and would silently drop the lift when there
were two. The three-day plyo placement made that live for one afternoon; the map accumulates now, and
the contract is pinned by its own fixture. Full account under A3.

---

# A3 — NAMED PLYOMETRIC DRILLS

`plyo.ts` carries his three families and their drills, transcribed from p227:

- **bounding / skipping** — A-Skip · B-Skip · Bounding · Stiff-Legged Run
- **ground contact** — Single-Leg Hops · Rebound Jumps · Skater Hops · Lunge Hops · Pogo Hops
- **footspeed** — Ladder Drills · Ickey Shuffle · Hopscotch

**One drill from each family**, one row each (p227: *"all drills are done SEPARATELY"*), about four
efforts each, stop on quality, on the frame's own day. Rotates within family week to week (p275 asks
for the variety outright). ⚠️ Three-from-three is OURS (`PLYO_FAMILY_MIX_IS_OURS`) and sits inside his
own numbers: p227 caps a day at *"three or four"* and names exactly three families.

## ⛔ THE PLACEMENT: BUILT ON THREE DAYS, REVERTED TO ONE, SAME DAY

The device-findings doc said *"the frame (p246) places plyo on THREE days — day 1 ×1, day 3 ×2,
day 6 ×1."* It was raised before building, built to the ruling, and then **reverted**: Michael
confirmed the 1/3/6 layout is the **half-marathon frame's (p250)** and that the findings doc had
conflated the two frames, not issued a ruling to preserve.

⛔ **p246 places the plyo warm-up on day 3 and nowhere else**, in both the standard and the taper
column (`SOURCE-viada-hybrid-athlete.md` Part E1a, transcribed off `p246.jpg` and verified
2026-08-23). The All Rounder's p274 table matches. p275 puts the warm-up at *"one to three
plyometric skills"*.

**So the week's shape is exactly what it was** — nine sessions, four lifting days, one plyo day,
`strength_days` five entries. What changed is that the plyo session **names its drills**.

⛔ **AND THE DAY IS NOT THIS MODULE'S TO HOLD.** `plyo.ts` owns the FAMILIES; `frames.ts` already
marks the day via `FrameDay.plyo`, in both columns. A day number in `plyo.ts` as well would be a
second owner of a fact the frame states — and it is exactly what the three-day spread had to add.
**A test lints `plyo.ts` for a `day:` key and fails on one**, so the shape cannot come back by
accident rather than by decision.

⚠️ **WHAT THE SPREAD WOULD HAVE COST, MEASURED WHILE IT WAS IN THE TREE** — kept here because it is
the argument if anyone proposes it again:

- the week went from **9 sessions to 11**;
- **`strength_days` went from five days to six**, and the sixth held no lift. `adapt-plan` and the
  optimizer read that field as the week's picture;
- and it broke the restater — see below.

⚠️ **A warm-up ROW on the lift was tried and reverted too.** It reads better and matches p246's own
noun, but it breaks p247 outright: *"All first lifts of the day should be a competition movement."*
The page's law outranks the page's noun. That is why the plyo work is a session and not rows, and it
is written at `plyoSession`.

## ⛔ WHAT THE SPREAD BROKE, AND THE FIX IS KEPT

`restateFromTest` built its lookup with `bySlot.set(week|day, …)` — correct only while a day holds at
most one strength session. The spread put a drill session on frame day 1 **beside the lift**, and
because the composer pushes plyo AFTER the lift, the second write replaced `ME: Upper`'s exercises
with a skip. Every ME row on that day stopped being restated. **Nothing would have failed**: the diff
would just have come back short.

⛔ **THE MAP ACCUMULATES NOW AND STAYS THAT WAY**, even though the current frame no longer produces
the shape. The contract is pinned directly by a hand-built fixture in `standing-plan-me-sets.test.ts`
(*"a day may hold more than one strength session"*), because the shape is coming back: the cycling
frames (p278/p280) merge speed days into three lifting days, and the advanced tier already appends
sessions to open days. ⚠️ The fixture puts the drill session **second**, which is the composer's own
order — with the lift second it passes either way and proves nothing. Measured.

## The drills had to enter the app's vocabulary

A prescribed name the catalogue does not hold is D-322: `getExerciseConfig` falls to a **fuzzy match**
and borrows a neighbour's ratio, and `equipmentForExercise` falls through to `barbell` — a plate
calculator and a 45 lb bar drawn over an A-skip. That is the 2026-08-01 Box Jump defect re-entering
through vocabulary.

⛔ **THREE PRIVATE PLYO LISTS, THREE DIFFERENT NORMALIZERS, AND THE STEMS ARE SPELT DIFFERENTLY IN
EACH.** This cost a real test failure and is written at each site:

| list | normalizer | `A-Skip` arrives as |
|---|---|---|
| `strength-logging-mode.ts:equipmentForExercise` | drops non-alphanumerics | `askip` — so `\bskip` can **never** match |
| `StrengthLogger.tsx:isBodyweightMove` | drops spaces **and** hyphens | `askip`, `stiffleggedrun` |
| `strength-rest-timer.ts:isPlyometricMovement` | lowercases only | `a-skip` |

All three gained the words, plus 16 keys in `exercise-config.ts`. ⚠️ The legacy yardstick in
`strength-logging-mode.test.ts` gained the same words with the reason written at it: it reproduces a
classifier deleted before these names existed, so there is no legacy answer for `A-Skip` to be
faithful to, and leaving it behind would assert that a new movement must be misrouted.

---

# A4 — THE HARD SLOT'S SESSION IS A FACT, NOT A CHOICE

**Michael's ruling, 2026-08-24.** The card offered top-end versus sustained as buttons and the athlete
never owned that decision: p246 fixes the two hard slots as different families — `run_mlss` on frame
day 1, `run_near_threshold` on day 3 — and the composer builds those whatever the card writes.

- `hardSlotFact(sport, slot)` reads the frame's session off `hardSlotDefault` and the **same option
  tables the card used to offer**, so the sentence stated and the value sent cannot come apart.
- `HardSlotChoices.tsx` renders it as a panel with no pressed state and no tap target, plus
  `HARD_SLOT_FACT_NOTE` saying who decided and what IS still theirs.
- **The club control stays** — it genuinely REPLACES the slot (his Crit rule, work order §club).
- ⛔ `syncHardDays` **re-stamps the frame's session every time**, not only on a sport change. It used
  to return `prev` untouched when the discipline matched, which was right while the athlete could
  pick; with the picker gone that would leave a stale `role`, or a leftover `goal` from an earlier
  draft, travelling to the composer as an allocation nobody made.
- ⚠️ **Within-family variant selection stays the engine's** (gap #5) — no speed-versus-hill question
  reappears anywhere.

---

# PROOF

- **211 tests green** across `_shared/standing-plan/`, `_shared/accessory-dosing/`,
  `standing-plan-week-copy`, `strength-logging-mode`, `strength-rest-timer`. Whole `_shared` suite:
  **2095 passed, 1 failed — and that one is pre-existing** (`anchor-resolver-lint`,
  `lthr::TrainingBaselines.tsx`, reproduced on a stashed clean tree).
- **Get Stronger byte-identical, PROVEN not asserted.** Three cases hashed with the changes present,
  the tree stashed, hashed again. Identical:
  `ca934f4a…`, `3c964ecf…`, `7e35bd4a…`. One case exercises the assistance-picks path deliberately.
- **42 mutations run; 42 killed** (35 before the placement revert, 7 after). Four survived a first
  pass and each was a real gap, now closed:
  1. the load-versus-prescription guard was untested for the case that keeps it alive (a set logged
     with **no weight** — a miss against a prescribed weight, ordinary on a by-feel week);
  2. the week bound in `earnedMeSets`' logged loop **guarded nothing** — the index is already bounded
     — so it was deleted, the way `lowerBodyHaircut` lost one;
  3. `getExerciseConfig(name) != null` passed with a drill's key renamed away, because the **fuzzy
     match** answered. It asserts `via !== 'fuzzy'` now.
  4. after the revert, the restater's accumulate-vs-overwrite fix had no test that could fail — no
     frame produces a two-strength-session day any more. Pinned directly, with the sessions in the
     composer's own order.
- **End-to-end fixture** through the real chain: compose → log four weeks → `earnedMeSets` →
  recompose → `restateFromTest`. Clean patterns reach 3 sets; the pattern with one 0-RIR grind on week
  3 sits at 2. 24 proposed changes, 0 unmatched.

# STILL OPEN

- ✅ **The plyo placement is CLOSED** — reverted to p246's day 3, and `plyo.ts` can no longer hold a
  day number at all.
- ⚠️ **Focus chips reach no standing-plan composer.** B2 assumes they do.
- ⚠️ **Pre-existing type error**, untouched by this work: `_shared/state-trend/assemble.ts:1134` —
  `lead` is not on `StateTrendsV1['bike']`. `deno check` fails on any file that transitively imports
  it. Filed, not fixed.
- ⚠️ **`Ladder Drills` needs an agility ladder** and nothing gates it. It appears one week in three;
  the other two footspeed drills need no kit.
- ⚠️ **A4 has not been seen on a device.**

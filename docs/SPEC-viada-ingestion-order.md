# SPEC — the Viada ingestion order: endurance first, then the barbell (2026-08-17)

**Michael, 2026-08-17.** The order the engine reads the athlete in, and the accessory volume that
falls out of it.

**One sentence:** endurance volume is the *bandwidth*, strength adaptation is what fits inside it —
so the engine must know the endurance week before it authors a single accessory rep.

⛔ **THIS IS A BUILD CONTRACT AND IT DIES ON SHIP** (`CLAUDE.md`, the spec lifecycle). When it lands,
its substance folds into a `D-NNN` and this file is deleted. If only part lands, leave only the
unbuilt remainder here.

---

## 0. The architectural pre-requisite — and it is an ORDER, not a lookup

The engine must resolve the endurance profile (hours, hard days, swim) **before** the strength
materializer initialises. Not "must have access to" — must have *already run*. Endurance volume
dictates the physiological bandwidth available for strength adaptation, so a materializer that
authors first and consults second is guessing and correcting.

⚠️ **THE WIZARD ORDER FOLLOWS THE ENGINE ORDER.** Michael, 2026-08-17: *"we are going to switch the
order and get endurance numbers from the user first, and then program their training."* The intake
asks the endurance questions first for the same reason the engine reads them first.

---

## 1. The two variables, and they are NOT the same tax

Total hours matter for glycogen. **The composition of those hours decides the CNS cost**, and
collapsing them into one number is the mistake this section exists to prevent.

| | what it taxes | who it competes with |
|---|---|---|
| **Low-intensity (Zone 2) hours** | systemic recovery, glycogen | the *volume* budget — leaves the CNS largely intact |
| **High-intensity (hard days, intervals)** | the central nervous system | **the barbell, directly.** This is the interference effect. |

---

## 2. The three tiers

The materializer locks every accessory bucket into one band.

| tier | band | trigger |
|---|---|---|
| **1 — Survival mechanics** | **25–30** reps | `>= 2 hard days` **OR** `> 8 total hours` |
| **2 — Base maintenance** | **30–40** reps | `== 1 hard day` **AND** `4–8 total hours` |
| **3 — Strength focus** | **40–50** reps | `0 hard days` **AND** `< 4 total hours` |

- **Tier 1** — a dedicated race build. The CNS is under fire from speed work, or the athlete is
  bleeding glycogen from sheer volume. Accessories drop to the floor and exist as **structural
  armour only** — prehab, stability, joint integrity. Zero hypertrophy volume, because at this
  endurance load hypertrophy volume is what destroys running economy.
- **Tier 2** — off-season or base building, moderate CNS tax. Enough recovery capital for a real
  hypertrophy stimulus without bleeding fatigue into threshold runs or tempo rides.
- **Tier 3** — a dedicated strength block; the cardio is Zone 2 acting as active recovery. CNS
  bandwidth is open and the ceiling unlocks.

⚠️ **THE TRIGGERS ARE NOT SYMMETRIC AND THAT IS DELIBERATE.** Tier 1 fires on **OR** — either
condition alone is enough. Tiers 2 and 3 require **AND** — every condition must hold. An athlete
falling through both AND-gates lands in Tier 1, which is the safe direction.

---

## 3. The swim gate — a lat and shoulder quarantine

**Trigger:** `swim yards > 0`.

**Why:** swimming is thousands of unweighted pull-ups. The lats, teres major and shoulder capsule are
under continuous tension through the catch phase of every stroke.

**The rule:** the pull bucket is locked to the **lowest rep floor of the athlete's tier**, regardless
of their focus selections — to prevent shoulder impingement and preserve stroke mechanics.

⚠️ **IT OVERRIDES THE FOCUS AND THE TESTED CAPACITY, WHICH NOTHING ELSE IN THE BAND MODEL DOES.**
A tested 25-rep chin capacity normally walks the pull slot to its band ceiling. Under the swim gate
it does not. This is the one place a measurement is deliberately not spent.

⛔ **AND IT COLLIDES WITH THE PULL-UP PROGRESSION — UNRESOLVED, DO NOT GUESS.** The opt-in progression
prescribes Wendler's 100 chins a week (2nd ed p.35) and overrides the pull slot outright. A swimming
athlete who opts into it has two rules pointing at one bucket in opposite directions. **Ask Michael**
before building: does the swim gate cap the progression, refuse it, or yield to it as an explicit
athlete choice?

---

## 4. ⛔ WHAT IS ALREADY BUILT — the delta, so this is a correction and not a rebuild

**The three tiers exist today**, in `src/lib/assistance-menu.ts`:

```ts
export const ASSISTANCE_BAND_BY_HARD_DAYS = { 0: [40, 50], 1: [30, 40], 2: [25, 30] };
```

The bands are **exactly this document's numbers**, and `assistanceTotalReps` already walks a tested
capacity up inside the chosen band. ⛔ Do not re-derive any of it.

**What is missing is one axis and one gate:**

| | built | this spec |
|---|---|---|
| **Hard days** | ✅ the sole trigger. `hardEnduranceDays: hardDays.length` at `strength-primary-plan.ts:3376` | unchanged |
| **Total hours** | ❌ **no reader.** The composer holds `bike.hours`, `targetWeeklyMiles` and `easyPaceMinPerMile` but never sums them into one weekly figure, and nothing passes one | the OR trigger for Tier 1 and the AND condition for Tiers 2/3 |
| **Swim** | ⚠️ `swimDays` reaches the composer and books sessions (`:3883`). **Yards do not exist anywhere** — not on the intake, not on the goal, not in the args | the gate keys on yards |
| **Order** | ❌ the composer authors strength and endurance in one pass | endurance resolved first |

⚠️ **SO THE HOURS TRIGGER IS THE REAL WORK, AND IT IS A PLUMBING JOB, NOT A MODEL JOB** — the band
model already accepts an axis it is not being fed, which is this codebase's dominant failure mode
(`CLAUDE.md`: *"it is not missing, it is hungry"*).

⚠️ **AND `swimDays` IS NOT `swim yards`.** Booking two swims a week says nothing about whether they
are 1,000 yards or 4,000. Either the gate keys on **days** (available today, less precise) or the
intake grows a yards question. **Michael's call — do not silently substitute days for yards.**

---

## 5. Resolved and built, 2026-08-17

- ✅ **The swim gate versus the pull-up progression.** D-407/D-423 settles it: **the progression
  wins.** The athlete toggled it on by name and an explicit choice is honoured; the gate yields.
  What they get instead of a cap is an amber line on the progression card. ⛔ Do not "resolve" this
  later by capping the progression — that is the override those decisions exist to delete.
- ✅ **Yards or days.** **Days.** `swimDays > 0` is the binary trigger. Exact yardage is secondary to
  the mechanic; even a light 1,500-yard recovery swim is hundreds of unweighted pulls. ⛔ Do not add
  a yards question to buy precision this gate does not need.
- ✅ **The tier is hoisted.** Resolved once at the top of `composeStrengthPrimaryPlan` off hard days
  + total hours, and passed down as `AssistanceScaleInputs.tier`. `bandFor` prefers it whenever it
  is present; `hardEnduranceDays` survives only as the fallback for an un-hoisted caller.
- ✅ **Total hours = run + ride, and every hard day counts** — club sessions included, because a club
  ride costs the same recovery as one the app wrote (§1i's own rule). Swim is deliberately NOT summed
  into hours: only days exist, and inventing a duration to complete the arithmetic is the kind of
  number this codebase deletes. It enters as the gate instead.

### Two traps caught while building, both recorded because they will recur

- ⛔ **`Number(null)` is 0 and `Number.isFinite(0)` is true**, so the first resolver read every
  unknown as a tested zero — which on the HOURS axis buys the athlete the ceiling, the exact
  inversion §2 forbids. The null check must come first. (`weeklyVolumeFor` carries a warning about
  the same trap on `pullupMaxReps`.)
- ⛔ **A measured zero is not an unknown.** `enduranceSport: null` with no bike is a strength-only
  block — a declared zero — and reading it as "we have not asked" dropped the athlete Tier 3 exists
  for into the survival band and took their ceiling away. `null` is reserved for the genuinely
  unknown: a declared runner whose weekly miles never arrived.

## 6. Still open

- **The intake order.** The wizard does not yet ask the endurance questions before the strength
  ones. The ENGINE order is done; the SCREEN order is not.

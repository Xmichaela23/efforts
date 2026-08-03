# SPEC — one strength language across the app (5/3/1 base)

**Status:** LOCKED 2026-08-01 (Michael). **Axis 1 (Role) SHIPPED as D-373** (2026-08-02) — accessory
commands silenced, gated on `isMain531Lift`. **Axis 2 (Type) + the classifier collapse REMAIN — and are
UNBLOCKED:** Q-240/Q-241 (bike cleanup) both closed 2026-08-01, so the old "queued after bike" note is
**stale.** The build order is at the bottom of this file (`## BUILD ORDER`).
**Lifecycle:** this is a build contract. When it ships, fold its substance into a new `D-NNN` in
`DECISIONS-LOG.md` and **delete this file** (per the SPEC lifecycle in `CLAUDE.md`).

> Filed as a standalone doc, not appended to `DECISIONS-LOG.md`/`ENGINE-STATE.md`, because a second
> session (terminal) was mid-edit on bike in the same working tree when this was locked. A new file
> can't clobber that. Move it into the log when the work starts.

---

## Why (the trace that forced this — verified in code 2026-08-01)

The app has **more than one strength vocabulary and they don't agree.** Ways it classifies a movement today:
- `roleForExercise` → `primary | secondary | accessory` (`src/lib/exercise-role.ts`) — **shared** with the
  server for load/adherence math. **Defaults an unknown move to `primary`.**
- `isMain531Lift` → bool (`src/lib/exercise-role.ts`) — the bar-speed cue gate. **Defaults unknown to `false`.**
- `isMainLift` → bool (`src/lib/exercise-alternatives.ts`) — a *second* "is it a main lift", for swaps.
- `isLowerBodyLift` (in the verdict fn), `getExerciseType` (`StrengthLogger.tsx` — equipment/UI),
  `isAssistanceRow` (`StrengthLogger.tsx`), `MovementPattern` + `MovementGroup` (`exercise-config.ts`).

**The clash that causes the live bug:** the SAME unknown move is `primary` to the load system and
`false` to the cue system — opposite defaults, silently.

**The "back off weight" bug, root cause (verified):** `computeStrength` / `computeLiftVerdict`
(`supabase/functions/_shared/response-model/weekly.ts:140-266`) run **every** lift through identical
logic and **never consult role**. The verdict is driven by RIR deviation (`rir - targetRir` vs
`VERDICT_DEVIATION` in `_shared/strength-profiles.ts`), so a hard-feeling **accessory** (Hip Thrust,
Barbell Row) prints a red "back off weight" command. Accessories have no anchor, so the display has
nothing to build a sentence from and dumps the raw command (`StateTab.tsx` ~1305-1385). It is *worse*
on lighter programs (endurance-maintenance), where almost everything is an accessory. The verdict
function IS phase-aware (recovery/taper/peak/base/build via `weekIntent`) but NOT role-aware.

**Good news for the size:** a usable role classifier already exists and is already shared. This is
wiring it into the language layer everywhere — not inventing a taxonomy.

---

## The decision — two axes, answered for every movement, never one list

### Axis 1 — Role (what job it does). Athlete-facing words:
- **Main lifts** — the four barbell lifts (5/3/1 percentages + AMRAP).
- **Supplemental** — extra volume on the same lift (FSL/BBB). Reserved; not in use yet.
- **Accessories** — everything else (push / pull / single-leg / core). The bro/universal word, and what
  the athlete sees everywhere. "Assistance" (Wendler's book word) may appear **only** inside the 5/3/1
  plan description; nowhere else.

### Axis 2 — Type (what kind of movement), each carrying a capability profile:

| type | weight | 1-rep-max | coached | logged as |
|---|---|---|---|---|
| Barbell (main lift) | yes | yes | **yes** | weight × reps |
| Barbell / DB (accessory) | yes | no | no | weight × reps |
| Bodyweight | bodyweight | no | no | reps |
| Plyo (box jump) | no | no | no | reps only |
| Isometric / hold | no | no | no | time |
| Mobility | no | no | no | done / time |
| Carry | yes | no | no | distance or time |
| Band | via band-load machinery | no | no | resistance in lb (ADD or ASSIST, per `bandMeansAssistance`) |

### Rules that fall out (no per-exercise special-casing):
- Coaching language — estimated 1RM, direction, AMRAP target — shows **only on main lifts**.
- Accessories, plyo, mobility show **numbers or nothing, never commands.** Kills the "back off weight" bug.
- **Volume = weight × reps**, computed **only where there's weight** (the field/Strong/Hevy definition).
- Adding a plyo or mobility move = **one row in the type table**; the app already knows how to render,
  score, and whether to coach it. That's the scalability requirement (Michael: more plyo + mobility coming).

---

## Grounding (field + commercial apps, not hand-picked)

- **5/3/1 (Wendler):** roles are main lift / supplemental / assistance(=accessory). Confirmed against
  the 2nd-edition treatment of supplemental vs assistance.
- **Strong / Hevy:** per-exercise show **numbers only** — heaviest weight, estimated 1RM, volume
  (weight × reps), PRs/records — and give **no commands**. "Back off weight" is not app language.
  Sources: help.hevyapp.com (PRs & records), hevyapp.com/features/exercise-performance, train531.com
  (accessory vs supplemental).

---

## Scope when built (collapses the tangle toward the two axes)
`roleForExercise`, `isMain531Lift`, the second `isMainLift`, `isLowerBodyLift`, `getExerciseType`,
`MovementPattern`/`MovementGroup` → collapse toward **one role axis + one type axis**, both read by:
the State display, the verdict/language layer (`weekly.ts`, `strength-profiles.ts`), the logger cues +
UI, the load/adherence math, exercise-swapping, and scheduling placement.

---

## BUILD ORDER — Axis 2 (Type) + collapse the six classifiers (contract written 2026-08-02)

### The six classifiers today — verified in code 2026-08-02, not from the 2026-08-01 trace

| classifier | lives in | side |
|---|---|---|
| `roleForExercise` (primary/secondary/accessory) | `src/lib/exercise-role.ts:166` | **both** (bundled into edge functions) |
| `isMain531Lift` (bool — the language gate D-373 uses) | `src/lib/exercise-role.ts:207` | **both** |
| `isMainLift` (a 2nd "is it a main lift", for swaps) | `src/lib/exercise-alternatives.ts:100` | client |
| `getExerciseType` (barbell/db/band/bw/goblet/plyo) | `src/components/StrengthLogger.tsx:146` | client |
| `isAssistanceRow` | `src/components/StrengthLogger.tsx:1645` | client |
| `isLowerBodyLift` (read by the verdict + adapt-plan) | `supabase/functions/_shared/strength-profiles.ts:387` | server |
| `MovementPattern` / `MovementGroup` | `src/lib/exercise-config.ts:45` / `:1386` | client |
| `isDurationBasedExercise` (regex — the "logged as time" decider; found Step 0) | `src/components/StrengthLogger.tsx:1001` | client |

⛔ **DEPLOY TRAP — read before touching either shared file.** `src/lib/exercise-role.ts` and
`_shared/strength-profiles.ts` are bundled into the edge functions at deploy time. A change here does
**nothing in production** until every importer is redeployed. Find them:
`grep -rln "exercise-role" supabase/functions --include=index.ts` (and again for `strength-profiles`).
This silently stranded 17 functions once. See `CLAUDE.md` — "The `_shared` deploy trap."

### The method (do NOT deviate)

Build the new shared axes FIRST, migrate readers ONE AT A TIME, delete the old duplicates LAST, and
**prove nothing changed at every step.** Never remove six things at once. This is a collapse-onto-one
job, not a rewrite — the role axis already exists; the new part is the **type** axis.

### Step 0 — Re-grep before writing a line
Confirm the table above still holds (D-373 shipped 2026-08-02; the map moves). CLAUDE.md hard rule:
grep the name you're about to write — it is usually already taken.

### Step 1 — Build the one Type table. Change NO behavior.
Add the type axis next to `roleForExercise` in `exercise-role.ts`: one table, seven rows
(barbell-main, barbell/DB-accessory, bodyweight, plyo, isometric/hold, mobility, carry), each carrying
four capability flags — **has weight? has 1RM? coached? logged-as** (per the type table in this spec).
- **Touches:** one new table in `exercise-role.ts` (shared). Nothing renders differently.
- **Prove:** unit fixtures — every known exercise resolves to the right type + flags.

### Step 1 review (2026-08-02) — DONE + one addition, three items deferred
**Step 1 shipped clean:** 285 lines added to `exercise-role.ts`, nothing reads it, 14 fixtures pass
(one walks all 189 known names and fails on any default), lint clean. Two good calls baked in: the four
main lifts read `MAIN_531_LIFTS` directly (so "coached type" can't drift from `isMain531Lift`), and an
unknown move counts as load + says nothing (same safe default as D-373).

**Addition folded into Step 1 (still behavior-free):** an **eighth type row — Band** — because bands
are already a fully-built, tested case in `workload.ts`: `bandMeansAssistance` decides ADD vs ASSIST
per exercise, and a band with no clean poundage still scores a non-zero flat token. The row must POINT
AT that machinery, not reinvent it.

**Deferred to later steps (all change behavior, so NOT in Step 1):**
1. **Plain names fall through** — "Dips", "Chin Up", bare "Deadlift"/"Bench" are unknown to the role
   table → default `primary` + a loud warning every recompute, and they are in the live Jul 31
   prescription. Fixing recognition changes completion scoring. ⚠️ Brushes the parked **Q-249**
   canonicalize landmine — tread carefully. Handle in a later step, deliberately.
2. **"Bench" not seen as a main lift** — same root cause (plain name vs "Bench Press"); widening it
   changes what gets coached on a live screen. Do it with (1).
3. **"Core circuit" → mobility row** — capability profile matches exactly (no load, no max, not
   coached, timed); only the internal label reads oddly and it is never shown to the athlete.
   **Michael's call: leave it** (cosmetic) unless core earns its own row.

### Step 2 — State strength card reads type
D-373 already silenced accessory commands via `isMain531Lift`. Now the *display* reads type: main
lifts coached; accessories/plyo/mobility show numbers or nothing.
- **Touches:** `weekly.ts` (verdict, **server** — redeploy), `StateTab.tsx` / `StatePerformanceSection.tsx` (client).
- **Product call it bumps into:** Q-253 (where accessories live on State). Ship main-lift language WITHOUT settling it; accessory framing stays deferred.
- **Prove:** synthetic-athlete text harness (GAME-PLAN's method note), then a device check.

### Step 2 review (2026-08-02) — DONE, plus two fixes and one new step
**Shipped clean:** gate moved from `isMain531Lift` (bool) to `capabilitiesForExercise(name).coached`
on BOTH sides — server (`weekly.ts`) and client. All 66 server tests pass untouched (incl. D-373).
On a fresh payload nothing on screen changes; what changed is *who decides*. Harness built
(`strength-language.harness.ts`, 12 synthetic athletes) after extracting row composition out of the
1,900-line `StateTab` into `strength-row-text.ts` — the D-259 extraction the method note calls for.
24 fixtures, lint clean, prod build succeeds.

**Two real fixes rode along:**
1. **Stale-cache safety.** The client used to infer "is this coached" by checking whether the server
   sent an empty label — which only holds while the on-screen payload came from the *current* server.
   `coach_cache` renders the last good contract, so a cached pre-D-373 row could still show a Box Jump
   "back off weight" / a Hip Thrust "185 → 165" button. Reading the table directly kills that.
2. **A Step 1 table bug, caught by reading the harness output.** Chin-up + db_row were typed as loaded
   accessories: the server stores per-lift keys as `chinup` / `db_row`, the table was built from display
   names ("chin up"), so those keys fell to the default. Fixed, with a new coverage test over the
   server's key spellings (the test that was missing).

**NEW STEP flagged (do NOT fold into any existing step) — the fitness-section name sets.**
`StatePerformanceSection.tsx` renders numbers only, so it already obeys the Step 2 rule and was left
alone. But it holds TWO more name sets: `PRIMARY_LIFTS` (5 names → which lifts show an e1RM) and
`BIG_4_CHART_LIFTS` (4 names → which get a sparkline), against the 16 the coaching gate uses. So a
**Front Squat gets coached but gets no chart.** ⛔ Do NOT collapse these client-side alone: both are
tied to the server (`PRIMARY_LIFTS` drives the roll-up + the strength dot; only those canonicals carry
a series from the server), so a client-only change would make the chart and the dot read different
pools — **the exact D-346 fault.** Needs the server in the same change. Its own step, after the logger.

### Step 3 — Logger reads type
`getExerciseType` + `isAssistanceRow` are the private type vocabulary already. Replace with the shared table.
- **Touches:** `StrengthLogger.tsx` (**client only**).
- **Prove:** on device, log one of each — squat asks weight×reps, plank asks time, box jump asks reps, carry asks distance.

### Step 3 review (2026-08-02) — DONE, client only, and the classifier count is bigger than the spec said
**Shipped clean:** `getExerciseType` + `isDurationBasedExercise` now read the shared table; the two
functions are left as **one-line shims** over the shared module so the 17 call sites can't shift under
them (Step 6 deletes the shims). `isAssistanceRow` had nothing to migrate — it checks session data +
already calls `roleForExercise`. 7 new fixtures; 348 client + 66 server tests pass; build + lint clean.
*(2 goal-seeds test failures are PRE-EXISTING — confirmed by stashing all work and re-running. Not ours.)*

**KEY FINDING — `getExerciseType` was TWO questions fused.** (a) *What the row asks for* (weight×reps /
reps / time / distance / band) → this is `loggedAs` and genuinely moved onto the table. (b) *How the
weight box is drawn* (bar + plate calc / per-hand DB label / single implement on the hip) → the table
CANNOT express this: a DB bench, a goblet squat and a barbell row are all one `loaded_accessory` row.
So the equipment rules were **transcribed byte-for-byte into the shared module** (not re-derived), with
a fixture asserting an identical answer for every 189 names. ⛔ Re-deriving would have deleted the
per-hand label + single-implement treatment — i.e. re-opened **Q-180** (Farmers Carry priced as one
bar) and the single-leg hip thrust drawn a 45 lb bar.

**⚠️ ON-SCREEN CHANGE — FIVE movements (for the end-of-language device check):** Sled Push, Sled Pull,
Dead Hang, Wall Angel, Foot Doming now ask for **time or distance** instead of weight+reps — the old
name-regex matched only `plank|hold|carry|farmer` and these five contain none. A fixture pins the
change set to exactly those five and fails if a sixth appears. **This is a correction, not a
regression** (they were wrongly asking for weight×reps).

**⛔ STEP 6 IS BIGGER THAN LISTED — the logger has NINE name-classifiers, not the ~3 the spec named.**
Also present: `isBodyweightMove`, `isAssistCapableMove`, `isCoreWorkExercise`, `isLoadedDurationExercise`,
`isPlyometric`, and a per-set `isDurationBased`. That last one is a DIFFERENT FACT and must not be
collapsed away: the gate that actually **draws a timer** is the set's own data
(`set.duration_seconds !== undefined`), NOT the name. The name regex only decides whether a *new* set is
born with a duration. Two facts; only the name one belongs on the table.

### Step 4 — Swapping reads the shared role
`isMainLift` in `exercise-alternatives.ts` is a second "is it a main lift." Point it at the shared role.
- **Touches:** `exercise-alternatives.ts` (**client**). ⛔ Do NOT touch `canonicalize` — that is the parked Q-249 landmine that would re-group lifting history.
- **Prove:** the existing swap / assistance-collision tests (the same ones the race builder's accessory pool will plug into).

### Step 4 review (2026-08-02) — DONE, client only, and it's a GUARD not a fix
**`isMainLift` was NOT a second name list** — it's `directFamilyOf(name) != null`, membership in six
curated same-movement families. Repointing it at the shared role outright would have BROKEN the swap
sheet: across 143 library names the two answers disagree on 27, and 26 of those (Goblet Squat, RDL,
Barbell Row, Pull Up, Chin Up, Lat Pulldown…) are curated family members with `isMain531Lift === false`
— dropping the family test re-opens the 2026-07-30 bug (a Face Pull offered a Barbell Row). **Fix was a
UNION:** family-membership OR the shared classifier. Every curated exclusion survives AND no name list
in that file can disagree with the rest of the app about "what is a main lift."
- **Honest scope:** the engineer verified the union changes nothing on screen today (a config-identity
  dedup already suppresses the one name it would newly catch). It's a **guard that goes load-bearing
  the moment those two configs diverge** — pinned by a fixture that asserts they're still identical, so
  the next session is told, not surprised. The sweep test was relabeled as an invariant guard, not
  evidence. 54 existing + 5 new fixtures pass.
- **⚠️ ARCHITECTURE CAVEAT (client stays dumb — verified 2026-08-02):** `exercise-alternatives.ts` is
  **client-only** (no edge function imports it), and that is CORRECT — building the swap *offer list*
  is a UI affordance, not a server-owned fact; when a swap is picked, the server re-derives its role /
  load / adherence itself from the shared classifier (it never trusts a client verdict). BUT the curated
  **`DIRECT_FAMILIES` list lives only in the client.** Nothing server-side needs it today, so no
  doubling. The day the server must reason about same-movement families (e.g. score a within-family
  swap as "basically the same"), that list MUST move to the shared module or the two copies will drift.
  If/when, not now.

### Step 5 — Load + scheduling read the shared axes
`roleForExercise` already feeds load; `isLowerBodyLift` feeds placement. Confirm both read the one source.
- **Touches:** `_shared/workload.ts` (load, **server**), `_shared/week-optimizer.ts` / `_shared/schedule-session-constraints.ts` (placement, **server**). Redeploy.
- **Product call it bumps into:** Q-251 (accessories priced at zero) — deferred, does not block the plumbing.
- **⚠️ BUG FOUND IN STEP 1 (band work), FIX HERE:** the logger and the pricer use DIFFERENT gates for
  "is the band assistance." Logger = substring match on "pullup"; pricer (`bandMeansAssistance`) =
  exact key in a 3-movement set. On the name **"Band Assisted Pull Up"** they split — it canonicalizes
  to `band_assisted_pull_up`, which is NOT in the pricer's set, so 40 lb of *help* is read as 40 lb of
  *added load*. Same set prices **200 vs the correct 700** (5 reps, 40 lb assist, 180 lb bw). This is
  the doubled disease exactly; the fix is to make both gates read the ONE shared classifier. Same
  family as the deferred plain-name items. ⚠️ Unknown whether it has hit real data — that needs a DB
  read (gated); the fix is identical either way.
- **Prove:** load fixtures.

### Step 5 review (2026-08-03) — DONE, and the spec's premise for Part 1 was WRONG
**Part 1 was a non-job — the audit found nothing to collapse, because the spec's claim was false:**
- `roleForExercise` — one definition, no copies, but **`workload.ts` does not use it at all** (imports
  only `canonicalize` + `bandMeansAssistance`). There is no role in the load math. Role feeds
  **adherence** scoring in `analyze-strength-workout` (D-208's `ROLE_WEIGHT`) — a different file, a
  different number, and already single-source.
- `isLowerBodyLift` — one definition, but **does not feed scheduling.** Placement uses a session-kind
  token `lower_body_strength` in the adjacency matrix — a WORKOUT TYPE, not a per-exercise classifier.
  The two never touch.
- ⛔ **Correct the Scope section of this spec:** it lists "the load/adherence math … and scheduling
  placement" as readers to collapse. Load doesn't read role; scheduling doesn't read the per-exercise
  classifier. Adherence already reads the one `roleForExercise`. Nothing to do here. No files changed.

**Part 2 (band bug) — fixed, and it was FIVE server call sites, not two.** New shared gate
`src/lib/band-assistance.ts`, called by both sides. The logger's rule adopted as the shared one after
checking it over 289 names: zero lost, six gained (qualified forms of the same three movements), and a
superset can only turn ADD→ASSIST, never the reverse, so nothing silently re-prices downward.
- ⚠️ **The bug had a wider blast radius than logged.** The mispriced gate was ALSO in
  `session-detail/build.ts` (×2) and `compute-facts/index.ts` — so the 200-vs-700 split was corrupting
  the **session screen's volume numbers AND the stored `total_volume_lbs`**, not just the load score.
  All five now read the shared gate. Dead `canonicalize`/`bandMeansAssistance` imports removed from two files.
- **Forward-only, but history is CLEAN — checked 2026-08-03.** Read-only diagnostic over all 126 stored
  strength workouts: 7 instances carry a band value on the pull-up/chin-up/dip family, and **all 7 use
  the plain base names ("Dips", "Chin Up")** — which the old gate already priced correctly (the six
  newly-covered names are all decorated forms; none were used). **Zero mispriced rows. No backfill needed.**
- `canonicalize` untouched (fixed at the gate). Regression fixture pins 700 correct / 200 as the bug.

**⛔ CORRECTED REDEPLOY LIST (transitive walk, covers Steps 2-5 — none shipped yet).** The earlier
Step 2 list was wrong: `narrative-core`, `race-readiness`, `response-model` have **no `index.ts`** —
they are shared modules, not deployable functions. The real list is **11 of 91**:
`activate-plan`, `analyze-strength-workout`, `auto-attach-planned`, `backfill-planned-workload`,
`backfill-strength-load`, `calculate-workload`, `coach`, `compute-facts`, `generate-overall-context`,
`materialize-plan`, `workout-detail`.

**Proof:** 1536 server tests pass (0 fail); 358 client tests pass (same 2 pre-existing goal-seeds
fails); build + lint clean; the `session-detail/build.ts` type error is pre-existing (5 at HEAD, 5 now).

### Step 6 — Delete the duplicates, same change
Only after every reader is migrated. Remove the private `getExerciseType`/`isAssistanceRow`, fold
`isLowerBodyLift`/`isMainLift` into the shared axis, update imports in the same edit.
- **Prove:** grep shows no reader left on the dead names; `deno test` + `npm run lint` green; **redeploy every importer**.

### Step 6 review (2026-08-03) — DONE. All six core steps built, none shipped.
Shims + `normalizeExerciseNameForMatch` deleted; 14 callers repointed at the shared module (8 →
`equipmentForExercise`, 6 → `isDurationLogged`). Kept as instructed: per-set `isDurationBased`,
`isAssistanceRow`, the transcribed equipment rules. Grep clean (zero code readers on deleted names;
5 stale comment pointers to `StrengthLogger.tsx:146` repointed). Server 1536 / client 358 pass (same 2
pre-existing goal-seeds fails), build + lint clean. Redeploy list unchanged at 11.
- **Open, Michael's call:** `bandMeansAssistance` in `canonicalize.ts` is now dead in production (only
  its two yardstick test files read it). It's a real dead duplicate BUT it lives in the standing-stop
  file, and it's the independent reference the band-drift test checks against. **Recommendation: LEAVE
  it, labelled "reference-only, do not call"** — deleting it weakens the test and buys nothing.

### Step 7 (the flagged extra step) — reconcile the fitness-section name sets, SERVER + CLIENT together
`StatePerformanceSection.tsx` holds two more name sets beyond the coaching gate: `PRIMARY_LIFTS` (5 →
which lifts show an e1RM) and `BIG_4_CHART_LIFTS` (4 → which get a sparkline), vs the ~16 the coaching
gate treats as main-class (the four lifts + variants like Front Squat). So a Front Squat is **coached
but chartless.**
- **FIRST, DECIDE — is the difference intentional or accidental?** In 5/3/1 you track a **training max
  on four lifts**; a Front Squat is coached (it's a main-pattern movement) but is NOT one of the four
  you chart a max on. So three different sets may be three legitimately different questions (coach /
  show-e1RM / chart) — the exact `MovementGroup`-vs-`MovementPattern` lesson in `CLAUDE.md`. **Do NOT
  force 16 = 5 = 4.** Ground the call in the 5/3/1 model, not a hand-pick. Collapse only the sets that
  should genuinely be one; make the intentional differences explicit in code.
- ⛔ **D-346 GUARD — server + client in the SAME change.** Only `PRIMARY_LIFTS` canonicals carry a
  series/e1RM FROM THE SERVER, and `PRIMARY_LIFTS` also drives the roll-up + the strength dot. Widening
  the client alone gives empty charts and makes the chart and the dot read different pools — the exact
  D-346 fault. If a set widens, the server must emit for the wider set in the same change.
- **If any part is a product call** (e.g. "should a Front Squat carry its own tracked max"), STOP and
  surface it — do not guess.
- **Touches:** `StatePerformanceSection.tsx` (client) + the server spine that emits the strength series
  / per-lift e1RM (`compute-snapshot` / the state-trend strength builder). Redeploy those.
- **Prove:** fixtures; nothing on screen changes unless the design says a set was genuinely wrong.

**RULING (Michael, 2026-08-03):** a **variant aggregates into its slot** — trap-bar deadlift is a
deadlift *option*, contributes to the deadlift max, never a 5th tracked lift (same as Front Squat →
squat slot). Fix `PRIMARY_LIFTS` / `computeE1rmBand` to roll variants into the four slots (not delete
the name — an athlete who only trap-bars must still get a deadlift signal). **Do it with the Q-254
AMRAP work** (the strength-number-honesty job), not as a loose extra. Fixture is pinned meanwhile.

### Two facts to hold
- **The product decisions do NOT block this.** Q-251 / Q-253 (what accessories *count* and *say*) are
  product calls; the vocabulary collapse ships without them. This is decision-free engineering.
- **Sequence after this:** language → **Q-254 (AMRAP)** reads the clean vocabulary → **race builder**
  (its run-accessory pool plugs into Step 4's swap engine). That's why language goes first.

### Lifecycle
When this ships, fold its substance into a new `D-NNN` in `DECISIONS-LOG-2.md` and **delete this file**
(D-373 is already the entry for Axis 1 — this becomes the Axis 2 + collapse entry).

# ARCHITECTURE — the strength spine

**⚠️ LIVING DOC.** Written 2026-07-25. Companion to `BUILD-ORDER-strength-spine.md` (sequencing) and
`SPEC-get-stronger.md` (the protocol contract). **This one answers *where things live*.** Sections marked
**OPEN** are undecided.

**Why it exists:** two consumers now need the same strength machinery at different doses (Get Stronger at
full dose; race plans at maintenance). The current Get Stronger composer is **deliberately self-contained**
— its own header says it "does NOT delegate to the shared overlay protocols… so the (b)-run path + the base
structure stay untouched." That isolation was correct when it was written and is wrong now. Undo it on
purpose, with a map, or we rebuild the protocol twice.

> **§0 was added 2026-07-25 LATE and it reframes everything below it.** §1–§5 answer *"how do we share the
> strength machinery between plans?"* — still correct, still the build. §0 answers the larger question that
> came out of the same session: *"which plan is the real one?"* Read §0 first; §1–§5 are the mechanism.

---

## 0. THE FRAME — the block is the body, the goal is the tuning

> **Michael, 2026-07-25 late:** *"I actually see this 5/3/1 as the spine I've been looking for — the one
> thing that stays through all training, just tuned differently for each goal. Maybe we harvest parts and
> see this as the main body."*

**This is not a fifth plan generator. It is the one the other four were approximating.**

`PRODUCT-POSITIONING.md:188` already says it in product terms — *"strength is always present — it is not
an add-on, it is a core feature of every profile."* §0 is that sentence made structural: the thing
that persists across every athlete and every block is **the barbell block**, and a marathon plan, a
triathlon plan and a Strength Focus block are the **same body at three different tunings** — not three
programs that happen to include lifting.

### 0.1 ⛔ THE CONSTRAINT THAT KEEPS IT HONEST — present always, priority *sometimes*

**The spine must be able to YIELD, and if it cannot, this frame is wrong for every race athlete.**

Twelve weeks out from a marathon the long run is the immovable object and the lifting bends around it.
Inside a Strength Focus block the opposite is true (`ENGINE-STATE` banner: *"endurance absolutes are
immovable; strength builds around them"* — that rule was written FOR the strength block and does not
generalise). So:

- **presence** is constant — every plan carries the block
- **priority** is the tuning — who yields to whom is set by the goal, and it inverts

Build it as "the four lifting days are fixed" and it can never taper. **Priority is a parameter of the
spine, not a property of it.**

### 0.2 THE SECOND OPEN PROBLEM — two rhythms that do not yet agree

5/3/1 deloads **every fourth week** on its own clock (`strength-primary-plan.ts:424`,
`weekInCycle === WEEKS_PER_CYCLE`). A race plan waves on a **different** clock — base / build / peak /
taper. Nothing currently makes the two line up, and the composer proves it: endurance rows are emitted
**identically every week**, deload or not (`:455-465`). On the week the bar drops, the running does not
notice.

Today that is benign — endurance is at maintenance and low either way, and Michael's own read is that
absorbing the window *or* holding endurance steady are both acceptable. **It stops being benign the moment
a race plan hosts the block at a real endurance dose.** This is the genuine design work of the frame, and
it is OPEN.

### 0.3 THE SURVEY — four places author sessions; one of them is the original

Run 2026-07-25 late, by reading, in answer to *"it's been built — where, and which one does it best?"*

| where | what it is | verdict |
|---|---|---|
| **`generate-combined-plan/session-factory.ts`** | **42 exported constructors** — `sweetSpotRun:401`, `tempoRun:415`, `vo2Run:432`, `intervalRun:449`, `thresholdBike:584`, `vo2Bike:597`, `sweetSpotBike:610`, `tempoBike:689`, plus every swim + brick. Each emits session + description + `steps_preset` + tags. | ⭐ **THE ORIGINAL.** Only one that covers the bike. Only one where a session type has exactly one birthplace. |
| `generate-triathlon-plan/generators/tri-generator.ts` | No factory. `steps_preset` arrays typed **inline** inside the week logic (`:621`). | cover version — longhand, correct, invisible |
| `generate-run-plan/generators/base-generator.ts` | Its own small factory (`createSession:475` + easy / long / marathon-pace / strides). **No intervals at all. Run only.** | cover version — narrower |
| `generate-plan/index.ts` | **71 lines, dated 2024, validation-only stub.** | **DEAD — delete** |

**And the spine itself makes one token by hand.** `strength-primary-plan.ts:272` `runIntensityToken()`
builds `run_easy_${min}min` / `longrun_${min}min_easypace`, with a comment stating its vocabulary matches
the race path *"at the substring level."* **A shared vocabulary held together by memory is the tripwire.**

### 0.4 TARGET — one catalogue, and plans get thin

**One session catalogue, owned by the spine. Every plan orders from it; no plan knows what a session *is*.**

A generator decides **which** sessions and **which days**. It never decides what a tempo run is. Today
`tri-generator` knows how to build one from scratch — that is the violation, and it is the same disease
`CONSTITUTION` Law 1 names (one source of truth per claim).

**Migration discipline — the part that has failed every previous time.** Every prior session made the
reasonable call to leave the other copies alone, which is *how there came to be four*. So: designate the
catalogue, migrate the consumers in the same effort, and where a consumer cannot be migrated yet, **fence
it with a test that fails the build if another session is authored longhand inside it.** Never designate a
single source and leave live alternatives beside it.

**And the way to touch a working generator safely is not to avoid it — the Constitution already says so.**
**Law 6: every load-bearing change ships behind a behavior-unchanged proof.** Build the same plan before
and after, diff the output, require byte-identical. Then the change is *known* safe, not hoped safe. This
was nearly re-invented from scratch tonight; it was already law.

### 0.5 CONFIRMED BY TRACE — what is already wired (do NOT rebuild)

| capability | status | evidence |
|---|---|---|
| Spine emits tokens; rows flow through the same expander as race plans | **BUILT** | `strength-primary-plan.ts:300` `steps_preset: [runIntensityToken(...)]` |
| Interval → steps, paced off LIVE baselines | **BUILT** | `materialize-plan/index.ts` — `run_vo2_*:1467` (5K pace −12 s/mi), `cruise_*_threshold:1487` (5K **+20 s/mi**), `bike_ss_*:1643`, `bike_thr_*:1657`, `bike_vo2_*:1660` (110–120% FTP) |
| Sweet spot at **88–94% FTP** | **BUILT** | `session-factory.ts:615` |
| Structured workout → Garmin | **BUILT + WIRED** | `send-workout-to-garmin` (1347 lines), called from `StructuredPlannedView.tsx:634`, `TodaysEffort.tsx:341` |
| **Apple Watch push** | **NOT BUILT, and not the same road** | HealthKit is an **import** (`services/healthkit`, `Connections.tsx:74+`). Do not promise it. |

⚠️ **The bike is FENCED, deliberately.** `strength-primary-plan.ts:299` — *"Q-126: RUN-only token
injection. Bike/ride is fenced to its own pass (Gap A-bike)."* Bike quality on the spine means **opening a
gate someone closed on purpose** — its own named pass, never smuggled in behind a run change.

### 0.6 ⛔ THE PREREQUISITE — three placement authorities, and they must become one

Nothing above is safe to build until this is settled. Today, "what day does X go on" has **three** claimants:

1. `_shared/week-optimizer.ts` — **declared sole authority** by `SCHEDULING-RULES.md`. The spine does not route through it.
2. `shared/strength-system/place-week.ts` — built, 12 tests, **imported by nothing.**
3. `strength-primary-plan.ts` — a hardcoded Mon/Tue/Thu/Fri grid that wins today by default.

They mostly agree now, which is why it has not bitten. **Adding a hard conditioning day that must dodge a
heavy squat is exactly the case where they stop agreeing** — and it will work for a week and then fail in a
way with no traceable owner. One authority first; feed it second.

*(Related and cheap: `create-goal-and-materialize-plan:~2465` forwards only `long_run` to the strength
composer, so `quality_run` / `quality_bike` reach the goal and stop. Same wire.)*

---

## 1. What exists today

### Three strength entry points, no shared loading logic

| path | entry | composer | used by |
|---|---|---|---|
| **Get Stronger** | `generate-strength-plan/index.ts` | `shared/strength-system/strength-primary-plan.ts` → `composeStrengthPrimaryPlan` | non-race, strength develops |
| **Combined / tri** | `generate-combined-plan/session-factory.ts` → `runStrength` / `triathlonStrength` | `shared/strength-system/protocols/*` via `selector.ts:getProtocol()` | race + combined plans |
| **Run only** | `generate-run-plan/index.ts` | `generate-run-plan/strength-overlay.ts` → `overlayStrength` | single-sport run |

Routing into Get Stronger: `create-goal-and-materialize-plan/index.ts:~2370` — the Get Strong branch.
It fires when `posture.strength === 'develop'` **and** no endurance discipline develops **and**
`resolveStrengthEquipmentTypeForPlan(...) === 'commercial_gym'`. Anything else falls through to the run
path. **That fall-through is the two-door bug** (see `SPEC-get-stronger.md` §8).

### Two shared directories, and the split is real

| dir | role | key file | imported by |
|---|---|---|---|
| `supabase/functions/_shared/` | cross-function utilities — **the grading / target layer** | `strength-profiles.ts` (`PROTOCOL_PROFILES`, `PHASE_RULES`, `getTargetRir`, `normalizePhaseKey`, `resolveProfile`) | `analyze-strength-workout`, `session-factory`, `coach`, `materialize-plan`, `adapt-plan` |
| `supabase/functions/shared/strength-system/` | **the authoring layer** — composers + protocol registry | `strength-primary-plan.ts`, `protocols/` | `create-goal-and-materialize-plan`, `generate-combined-plan/session-factory`, `generate-triathlon-plan` |

**Keep this split.** *Authoring* decides what gets prescribed; *grading* decides how it is judged. They
have different consumers and different change rates. It is one of the cleaner things in the codebase.

### And a third home: `src/lib/`, shared across the client/server boundary

`src/lib/exercise-config.ts` is imported by the **client** and by **edge functions**
(`strength-primary-plan.ts` reaches it via `../../../../src/lib/exercise-config.ts`).
`src/lib/rir-format.ts` is the client-side render of a server-stamped value.

**Precedent established:** anything both the logger and the composer must agree on lives in `src/lib/`.

### The protocol registry

`shared/strength-system/protocols/selector.ts` — nine ids: `durability`, `neural_speed`,
`upper_aesthetics`, `minimum_dose`, `triathlon`, `triathlon_performance`, `five_by_five`,
`strength_focus_build`, `strength_focus_power`.

`strength_primary` **is not in it.** Get Stronger routes around the registry entirely via
`config.source`, which is why it had no RIR profile until D-322.

Three hand-maintained lists must agree — pickable (`BARBELL_DEVELOPERS` in `src/lib/non-race-goal-seeds.ts`),
buildable (`selector.ts`), has-a-profile (`_shared/strength-profiles.ts`) — **with nothing enforcing it.**
`resolveProfile()` returns `durability` for any unrecognised key, so a missing entry and a deliberate
choice are indistinguishable at every call site. **Q-192, found twice, root-fixed neither time.**

---

## 2. Target topology

Four layers. Each has exactly one home and one owner.

```
  src/lib/rep-spec.ts ................. LAYER 1  the prescription vocabulary
        │                                        (client + server; one parser, no exceptions)
        ▼
  shared/strength-system/loading/ ..... LAYER 2  how a block loads
        │                                        (entry %, ranges, phases, dose)
        ├──────────────┬──────────────┐
        ▼              ▼              ▼
   Get Stronger    race plans     run overlay          LAYER 3  consumers, differing only by DOSE
   (full dose)     (maintenance)  (maintenance)
        │
        ▼
  _shared/strength-profiles.ts ........ LAYER 4  targets + grading (unchanged in role)
  adapt-plan (suggest/accept) ......... LAYER 4  progression + consent (unchanged in role)
```

### Layer 1 — `src/lib/rep-spec.ts` **[NEW]**

The `RepSpec` type, the one parser, the four accessors (`bottomOfRange`, `topOfRange`,
`totalReps`, `display`). Full design in `BUILD-ORDER-strength-spine.md` Layer 1.

**Home:** `src/lib/`, alongside `exercise-config.ts` and `rir-format.ts`, because the **logger and the
composer must agree on it** and that boundary already has a precedent.

**Deletes on arrival:** the ad-hoc `parseInt` in `workload.ts:182` and `:245`, `match-exercises.ts`,
the two duplicate RIR blocks in `materialize-plan` (~1948, ~2190), and the leading-digit regex in
`StrengthLogger.tsx:1820`.

> The logger already stores `target_reps` as a **string** and renders `"5-8"` verbatim
> (`StrengthLogger.tsx:70`, `:1853`, `:4779`), and already prefills the **bottom** of the range. Rep-range
> display is not a build — it is already there. Layer 1 replaces the *parsing*, not the *rendering*.

### Layer 2 — `shared/strength-system/loading/` **[NEW]**

> **2026-07-25 — TWO LOADING MODULES, selected by EQUIPMENT, alongside dose.**
> `barbell` → Wendler's four-week cycle off a stored working number (**V1**).
> `dumbbell` → rep ranges + double progression (later, its own plan in Goals).
> They differ **only** in how the weight goes up and which lifts are picked. Everything else — block
> structure, endurance, test, guardrails, logger — is shared. **Two flows in Goals must not become two
> composers.** See `BUILD-ORDER-strength-spine.md` for the V1 cut.

The part that is currently trapped inside `strength-primary-plan.ts` and must come out so the race path
can reach it:

- the phase array (accumulate / intensify / deload / peak / taper / retest)
- entry percentages **derived** from the RPE chart at the range top — never pasted
- the rep ranges per phase, and the separate secondary range
- the bodyweight prescription (reps relative to tested max)
- the **dose** parameter — `develop` (Get Stronger) vs `maintain` (race plans, ~1 session/7–10 days per
  Rønnestad) vs `off`

**This is the whole reason for the map.** Leave loading inside the Get Stronger composer and race plans
cannot use it, and we author the protocol twice.

### Layer 3 — the consumers

`strength-primary-plan.ts` **stays as the Get Stronger host** and keeps: the day grid, session assembly,
endurance underneath, the plan-shape output contract. It **loses** everything Layer 2 now owns, plus:

| deleted | why |
|---|---|
| `GLUTE_ROTATION`, `HYROX_ROTATION`, `FATIGUED_LEGS_STATION`, `biasAccessoryFor`, `biasMicrocopy`, `fatiguedLegsStation`, `accessoryBias` threading | moves to the **Adjust tab** (§4). D-323. |
| `baselineTestWeek`, `barStartLb`, `baselineDiscoveryCopy`, `needsBaseline` | entry is now **gated** on baselines; the tests live in the Baselines screen (Michael, 2026-07-24) |
| `rampPct`, the `workLoad` percentage curve | replaced by Layer 2 |

⚠️ **Preserve, do not lose:** the Hyrox and glute rotations are SHIPPED and work. They are being
**re-homed**, not deleted. Michael has a live Hyrox-biased plan — removal must not corrupt stored sessions.

### Layer 4 — unchanged in role, and that is the point

`_shared/strength-profiles.ts` keeps owning targets and grading.
`adapt-plan` keeps owning progression suggestions and the consent path (D-315).

Layer 4 gains **one new trigger** — "every set reached the top of the range" — beside the existing
"e1RM rose and RIR shows headroom." **That is the entire progression build.** The plan stays static; the
prescription is a rule, the adjustment layer holds the movement.

---

## 3. The five decisions

### 3.1 Where the rep spec lives — **DECIDED**
`src/lib/rep-spec.ts`. Precedent: `exercise-config.ts`. One parser, no second implementation.

### 3.2 Where loading lives — **DECIDED**
`shared/strength-system/loading/`, parameterised by dose. Out of the Get Stronger composer.

### 3.3 Does the registry shrink — **OPEN, recommend yes**

Nine protocols. Three unreachable (`minimum_dose`, `strength_focus_build`, `strength_focus_power` —
Q-202 line 35). One is the default path with no profile (`five_by_five` — Q-192/line 25). One isn't in the
registry at all (`strength_primary`).

**If both paths run one engine with a dose setting, most of these stop existing.** The hole doesn't get
patched — it gets deleted along with the thing that had it. Genuinely sport-specific selection
(`triathlon_performance`) stays a protocol; the *loading* underneath it comes from Layer 2.

**Regardless of the outcome: ship the test that asserts the three lists agree, plus a log line when
`resolveProfile` falls back.** Adding an entry ends the instance; the test ends the class.

### 3.4 Block-scoped or plan-scoped — **DECIDED: block**

`config.strength_protocol`, `config.source` and the goal's `per_discipline_posture` are all plan-scoped
today. `config.phase_structure` carries phases but nothing varies across them.

Michael, 2026-07-24/25: Goals is the **entry point to a cyclical plan**; once you are in, you change focus
in State via a new **Focus** tab. That makes block-scoping required, not optional.

**Cheap now, expensive later** — retrofitting touches the goal seeds, plan config, the routing branch,
`materialize-plan`'s protocol resolution, the coach, and every reader of `per_discipline_posture`.

> **The handoff already exists.** A block ends in an AMRAP retest whose write-back ratchets the stored 1RM
> upward. Block N's exit number is block N+1's entry number, automatically. Nobody built it for that.
> **And `plan_mode: 'rolling'` is already stamped** on Get Stronger plans
> (`create-goal-and-materialize-plan:~2445`) — **OPEN: verify whether anything reads it.**

### 3.5 Adjust vs composer — **DECIDED**

**Build time is omakase — no picker.** The engine designs the block.
**Adjust is à la carte** — you add on top of a designed block, and each item states its cost.

**The mechanism already exists.** D-315 shipped add-to-plan: `plan_adjustments.add_meta`, materialize
injects into future strength days whose focus matches the lift's movement group, weight seeded from the
athlete's own reference, **capped 2×/week (Schoenfeld 2016)**. Burner-verified on the live pipeline.

So Hyrox / glute / pull-up focus are **curated sets of adds** over shipped machinery, not new systems.

**The one genuinely new build:** distance-native sets. Sleds and sandbag work are measured in metres and
there is no distance field anywhere — carries were solved by treating reps as seconds (Q-180), sleds were
not, and materialize currently substitutes them away for non-gym athletes. Only needed if Hyrox becomes a
real Adjust option rather than the substituted version it is now.

---

## 4. What the logger needs — smaller than expected

**Already built:** rep ranges display (`target_reps` is a string, renders `"5-8"`) · bottom-of-range prefill ·
the D-122 "last:" anchor showing prior-session weight × reps × RIR · AMRAP with a 0–3 RIR gate ·
duration exercises with a background-safe timer.

**Needs building:**
1. **The range has to mean something.** It shows `target 5-8` but never says where you are in it, or that
   topping every set is what earns the increment. The payoff moment of the whole system is currently
   invisible — progression would fire silently elsewhere.
2. **Bodyweight lifts need their tested max on screen**, or "8 pull-ups" reads as arbitrary. Topping the
   range is the signal the max is stale → the re-test prompt belongs there.
3. **Distance sets** — only if §3.5's Hyrox path is built.

---

## 5. OPEN — carried from the science review

These sit in `BUILD-ORDER-strength-spine.md` Layer 4 and several point at the **design**, not the code:
the interference premise is pointed the wrong way (cut volume, keep intensity) · Prilepin is cited and not
followed · the RIR 2 anchor is tighter than the 3–5 the strength evidence supports · accumulate is
programmed like a hypertrophy phase · no explosive work · 3-day vs 4-day · the 8-week may not fit ·
5/3/1 as a source of answers wherever we would otherwise invent one.

**Do not start Layer 2 without settling the ones that change the numbers** — they are Layer 2's inputs.

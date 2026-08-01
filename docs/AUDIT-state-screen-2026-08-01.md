# STATE SCREEN — UPDATE + INTERWEAVE MAP (2026-08-01)

**Why this doc.** The State screen is a house of cards — many surfaces, one shared substrate, and
pull-one-drop-three coupling. This maps the WHOLE screen before we touch any of it, so a fix on one row
doesn't silently break a working one. It supersedes nothing; it sits on top of `STATE-SOURCE-MAP.md`
(what feeds each row) and `AUDIT-state-screen-2026-07-20.md` (F1–F25) and folds in the 2026-07-30/31
churn (the block-identity card, the run-verdict rebuild, the strength-load finding).

**The pattern this doc is written against** (Michael, watching it happen four times on 2026-07-30):
> *"you look, say it's wrong, fix it, then break it, then see it was right, and then see there is a lot
> of code happening there."*

The dominant fault here is NOT missing features. It is a built, correct thing **starved of a wire** — or
wired to the wrong source. So every row below is tagged by what it actually needs, and most needs are a
wire + a decision, not a build.

---

## How to read the status tags

- **WIRED** — reads one truth, renders it, says what it drops. Leave it.
- **STARVED** — built and correct, but an input is null / never set. Plumbing job, not a build.
- **PROTOCOL-BLIND** — renders a number/trend without knowing what the session or week was FOR. The fix
  is the block-identity card (below), not new logic.
- **DEAD** — written, read by nothing (or gated so it can never render).
- **DELIBERATE — DO NOT FIX** — looks broken, is intentional. This is where the two-day holes get dug.

Confidence is marked per row: **[verified in code]**, **[from docs]**, **[needs trace]**.

---

## THE ROOT: one card already answers "what block is this"

`_shared/block-identity.ts` (shipped 2026-07-30, Q-230 / D-339). Given a plan + a date it answers, once:
**protocol, goal, week, week-in-cycle, leader/anchor, deload, whether this week carries an all-out set,
whether this is the 95% reading, how the block reads effort.** Read-only by construction. It was built so
*"every screen reads it."*

**The server verdict layer now reads it** — that's why "your 1-rep maxes are sliding" stopped firing on a
5/3/1 block (weeks are sub-maximal by design). **The State FITNESS rows do NOT read it yet** [verified in
code — no reference to block-identity in `StatePerformanceSection.tsx`; punch-list item dated 2026-08-01
confirms the per-lift rows are still protocol-blind]. That single un-plugged wire is the root of most of
the strength findings below.

---

## THE SCREEN, IN RENDER ORDER

Three lenses (D-316): **Status** (the screen you know) · **Adjust** (`StateAdjustLens`) · **Schedule**
(placeholder, "coming next"). Everything below is the **Status** lens.

### 1. Coach paragraph (top)
- **Shows:** the week's narrative. **Source:** `coach` payload (deterministic week-context + LLM on top).
- **Status:** WIRED, but collapsed by default (F1). Copy version gated by `COACH_PAYLOAD_VERSION` — a copy
  change that skips the bump serves stale text for 24h [from docs — banner warns of this].

### 2. FITNESS — the sparkline rows (`StatePerformanceSection`)
The section you screenshotted. One shared component, `TrendSparkline`, renders run / bike / strength.

- **RUN · efficiency** — speed-at-HR, grade-adjusted, heat fitted-and-removed. **REBUILT + DEPLOYED
  2026-07-31 (D-346).** **Status: WIRED** (freshly). Do NOT re-litigate — five docs called this "clean"
  while it was broken, which is why it was rebuilt ~15 times. One caveat: efficiency read excludes the
  long run (30–70 min gate, `run.ts:81`) — for a marathoner the key session drops every week [from docs].
- **RUN · durability/decoupling** — **Status: DELIBERATE / open decision (Q-232).** The gate reads a field
  that says `steady_state` on every run, so hill sessions count. The obvious fix fails a pinned test with
  its own history. **Decision, not a patch.** Line is currently SILENCED on purpose.
- **BIKE · power vs efficiency split** — **Status: DELIBERATE — DO NOT FIX.** Power counts hard rides,
  efficiency counts easy ones; every ride feeds exactly one. Endurance-only riders see a "power trend ⓘ"
  naming what unlocks it. This is design, not starvation [from docs, `STATE-SOURCE-MAP`].
- **STRENGTH · per-lift e1RM + label** — **Status: PROTOCOL-BLIND** [verified in code].
  - The **"building · N of 12 weeks" label** is computed from data-span in `TrendSparkline` (line ~425),
    not the plan. It differs per lift and reads as block progress on week 1. Should read block-identity
    (week + leader/anchor).
  - The **per-lift direction** ("flat / easing off") calls a deliberately light week-1 lift a decline.
    Filed 2026-08-01. **Decision first:** his strength data is **one measurement per cycle** — likely too
    sparse for a 6-week trend line at all. "Show the number, claim no direction" vs a measurement-only
    series is an open shape decision, NOT an obvious fix.
  - **Silent drop:** e1RM is primary-lifts-only; a dumbbell-only lifter gets no read and is never told why
    [from docs].

### 3. BODY — heart-rate response
- **Shows:** run decoupling + bike efficiency rolled to one HR read. **Status: WIRED** (the best row on the
  screen — names each discipline, its age, stamps the contributor).
- **Open (filed):** the **"as of" stamp** shows the OLDEST contributor, so a 3-day-old run under a 16-day
  bike reads as "all stale." **Fix the STAMP only — do NOT touch the data path again** [from docs].
- **BODY · aerobic fitness** — **Status: DEAD.** Coach hardcodes `null / sample_size 0` so the render gate
  can never be true (`coach:2131`). Invisible to everyone [from docs].

### 4. LOAD / ACWR
- **Shows:** load balance + the "balanced / handling it" verdict. **Source:** `workouts.workload_actual`.
- **Status: STARVED — this is Job 2 and the current named next job.** `calculateStrengthWorkload`
  (`_shared/workload.ts:249`) sums `weight × reps`, so **bodyweight work scores zero**. Measured on his
  2026-07-30 squat day: 13 sets → **10 points** (chin-ups, box jumps, hip thrusts all 0), vs 61 for a
  47-min easy run. Result: **run 87% / strength 8%** on a strength block, feeding ACWR, the "balanced"
  verdict, and the reconciler [verified — banner + `scripts/_tonnage.mjs`].
  - **Decision first:** tonnage-only may still be defensible (some platforms use session-RPE × duration).
    Two adjacent facts: a bench session logged a **2-minute duration**, and strength sessions carry **no
    session RPE** so the intensity term defaults to 0.75. **Trace ACWR + load-status + reconciler before
    changing one line** — each has its own history.
- **Load headline composed on the CLIENT** (F3) — a continuity smell; smart-server/dumb-client says this
  belongs on the server [from docs].

### 5. CROSS-TRAINING — the coach's eye
- **Shows:** floor/ceiling of each cross-discipline vs the goal. **Status: mostly WIRED**, two open:
  - Compares a **partial week to a whole-week target** ("9 of your 18-mile target" read on a Thursday)
    — `cross-training-read.ts`, `floorBreach` clause [from docs, filed].
  - Ceiling clause now gated by `verdictTrusted` so it can't prescribe "ease the running" off a
    plan-caused dip (F4 fix, block-identity) — **WIRED as of 2026-07-30.**

### 6. Race projections / Key run
- **Status: WIRED (freshly, 2026-07-31).** Projections HIDDEN below 8 threshold readings (he has 3), so no
  fabricated race times. Don't "restore" them.

### 7. Nudges (swim retest, etc.)
- **Status: WIRED**, snooze-able. Note: the **"update your max" prompt lives on My Record, not here** —
  the plan-flow surfacing gap we discussed. Candidate for the block-aware wire.

### Adjust lens (`StateAdjustLens`) + `StrengthAdjustmentModal`
- **Status: WIRED but partial.** The State-screen adjust writes a per-block **weight override**
  (`plan_adjustments`) and re-materializes. The **1RM/max update** (the number that governs the next
  block) is on **My Record** (`AthleticRecordPage`, consent-first) — not surfaced in the plan flow. Design
  question, not a bug: is changing the official max meant to follow the athlete into the block.

---

## THE INTERWEAVE — why it's a house of cards

The coupling that makes "fix one, break three" the default. **Read this before touching anything.**

1. **`TrendSparkline` is shared by run, bike, and strength.** Any change to its label or scaling touches
   all three. The "N of 12 weeks" copy is honest for run (data coverage) and misleading for strength
   (reads as plan progress). **Fix at the strength call site, not in the shared component.**
2. **One substrate, many readers.** `athlete_snapshot` feeds Fitness, Body, Load, and the coach. Move a
   source column (as the run substrate moved 2026-07-21) and every label/date/unit downstream can go stale
   silently. **After moving a source, sweep the whole surface against the new pool** — three stale labels
   shipped on 2026-07-31 exactly this way.
3. **block-identity is the intended single source for "what block/week."** Verdicts read it; the Fitness
   rows don't. Wiring them in is continuity (one government), NOT a new per-screen derivation. Do it once,
   at the source, or the next session adds a fourth vocabulary.
4. **Load is upstream of judgment.** `workload_actual` feeds ACWR → load status → the reconciler → the
   "balanced" verdict → cross-training. The strength-load fix (Job 2) ripples through all of them; that's
   why it's "trace three before touching one."
5. **Freshness is computed against two clocks.** Server ships an AGE; client renders `today − age`. Any
   freshness value drifts optimistic if the snapshot is stale. **Ship dates, not ages.**
6. **Copy is cached.** `coach/` text is gated by `COACH_PAYLOAD_VERSION`; a copy change without the bump
   serves old text for 24h.

---

## THE TWO JOBS TO GET STRENGTH HONEST

**Job 1 — Plug the State strength rows into block-identity.** One source (already built, already trusted
by the verdicts) fixes the label AND the "prescribed dip reads as decline" together.
- ⚠️ **Decision first:** the display shape for one-measurement-per-cycle data. Trend + direction, or number
  + block context only? Deciding this wrong is the trap.
- Scope: strength call site of `TrendSparkline` + the per-lift direction read. Client-side mostly; confirm
  whether the per-lift direction is already partly protocol-aware server-side [needs trace].

**Job 2 — Fix strength load (the named next job).** Bodyweight work scores zero → strength reads 8% of a
strength block → distorts ACWR / balanced verdict / reconciler.
- ⚠️ **Decision first:** is tonnage the right basis, or session-RPE × duration. Also resolve the 2-minute
  bench duration and the missing strength session-RPE.
- Scope: `workload.ts`, ACWR, load-status, reconciler — **trace all three before editing.**

---

## TRAP ZONE — looks broken, is not (do not reflex-fix)

- **Bike power/efficiency split** — deliberate.
- **RUN durability/decoupling** — Q-232, a decision; currently silenced on purpose.
- **The per-lift "decline" on a light week** — real, but the *fix shape* is a decision (sparse data), not a
  patch.
- **"as of" stamp** — fix the stamp, not the data path (again).
- **1RM only updates on the athlete's tap** — consent-first by design.
- **RUN row (verdict/heat/chart/labels)** — rebuilt + deployed 2026-07-31, seen on device. Don't
  re-litigate.

---

## THE WORK ORDER — facts-only phase

**Ordered by ascending risk: decisions and read-only moves first, deletions next, real builds last** —
so nothing breaks a working card before we understand it. Only Stage 3 (load) and Stage 4 (integrity)
are real builds; the rest is wiring, deleting, and trimming.

### STAGE 0 — decide + audit the data (zero risk, no code)
- **✅ DATA AUDIT DONE 2026-08-01 (`scripts/_attach-audit.mjs`, read-only, his account).** **Verdict: data
  is clean enough to ground the screen — no blocker.**
  - The e1RM / fitness numbers read logged sessions **directly**, not the plan attachment, so nothing on
    the fitness rows is polluted.
  - **Zero date-mismatched attachments** — auto-attach did NOT glue wrong sessions onto wrong days.
  - The orphaned `planned_id` links (22 of 23 recent) are **history from manually-deleted plans**, not a
    bug. Pre-launch, dev data, only-forward-matters → **moot.** It only affects planned-vs-executed for
    plans that no longer exist, which is arguably correct.
- **REMAINING in Stage 0: settle D1–D4** (below). That is the only thing gating Stage 1.
**✅ DECIDED 2026-08-01:**
- **D1 — Load basis: VOLUME LOAD, bodyweight counts.** NOT time (logged-after-the-fact duration is
  garbage) and NOT per-set effort (only collected on the top/AMRAP set of the four main lifts, so it
  can't score the bodyweight accessories that read zero). Score = sets × reps × load, where **bodyweight
  fills in as the load** for calisthenics (chin-up/dip/box-jump ≈ bodyweight × reps), and **banded /
  assistance sets get a small flat per-set token** (bands have no clean load; assistance is deliberately
  minor, so precision isn't worth it). Matches Strong/Hevy. Small build (add the bodyweight fill-in).
- **D2 — Trend shape: number + block context** ("week 1 of 12 · leader"); **drop the 6-week direction**
  for lifts (one measurement per cycle is too sparse to call a direction).
- **D3 — Verdict words: NEUTRAL** — number + ↑/↓/→, no "easing off" / "balanced" this phase.
- **D4 — One e1RM:** both screens read the **server's single e1RM**; delete the client-side computes.

### STAGE 1 — ✅ SHIPPED 2026-08-01 (deployed + seen on web; NOT yet on device/Xcode)
> **DONE.** Strength row now shows "week N of M · {phase}" with the per-lift direction chips gone; a
> strength session in Performance carries the plan/week line. Phase word comes from the card
> (`block-identity`), protocol-agnostic — the client never knows "leader/anchor." Ended up a small
> server touch (added `phase_label`), deployed across the card's readers. Verified on web; not on phone.
> Everything below is the trace that led here.

- **The card already reaches both screens' payloads; the client just never reads it.** No `_shared`, no
  edge function, no coach-version bump, nothing to redeploy.
  - **State:** coach payload carries it at `plan.block` (`coach/index.ts:5892`, live in v150 — it's what
    stopped the false "1-rep maxes sliding"). The client type (`useCoachWeekContext.ts:94`) doesn't list
    `block`, so the browser drops it. `StateTab` already holds the object (`data.plan`, line 1065).
  - **Performance:** every session carries it at `sessionDetail.block` (`session-detail/types.ts:101`).
    `StrengthPerformanceSummary` reads ONE field (`is_measurement_week`, line 386); the other 13 ignored.
  - Week number is already passed in as `planWeek` (`StateTab.tsx:1711`, currently unused); block length
    off `block.block_weeks`. Both from the resolver the card uses, server-blanked for not-started/ended.
- **Four client edits (all strength):** add `block` to the client type + pass it down · drop the per-lift
  direction chip (D2), put "week N of M · {phase}" in its place · fix the sparkline label at the STRENGTH
  call site only (run/bike default to today's text — interweave rule 1) · one quiet block-context line in
  `StrengthPerformanceSummary`.
- ⛔ **PROTOCOL-AGNOSTIC — do NOT hardcode 5/3/1 in the client (Michael, 2026-08-01).** The screen renders
  `block.phase_label` **as-is** and never knows "leader/anchor" exist. **The plain, protocol-aware phase
  name lives in the CARD (`block-identity`, server), one place:** 5/3/1 → "build" / "test" / "deload";
  other protocols emit their own; a protocol with no phases emits **null** → the screen shows just
  "week N of M." This means Stage 1 adds a `phase_label` to the card if it isn't already there — a **small
  server touch**, so Stage 1 is NOT pure client-only. That's the right trade: the seam, not a hardcode.
- ⚠️ **STALE-DOC CORRECTION (back-annotate):** `STATE-SOURCE-MAP.md`'s "the deload exclusion has never
  once fired" is **stale** — deload weeks ARE dropped from the strength trend now (`deload.ts:26` ←
  `assemble.ts:501`, D-338, pinned test). What's still blind is the **ordinary light week** (week 1 <
  week 3, not a deload) — the direction chip reads that drop as a decline. Fix the stale line when in it.

### STAGE 2 — ✅ SHIPPED 2026-08-01 (D-349 / D-350) — and the original framing below was WRONG on all three targets

> ⛔ **READ THIS BEFORE TRUSTING ANY "KILL THE CLIENT MATH" LINE IN THIS DOC.** Stage 2 was written as
> *"kill `buildLoadHeadline`, the compare-table's own matcher + `calcVolume`, the block-summary
> deltas — route them through `canonicalize` and the server's one number."* Traced before coding
> (Michael: *"one stage, trace first, report before coding"*), **every one of those three was
> mis-stated, and two of the three instructions would have caused a regression.** The corrected
> shape is below. The original text is kept at the bottom because the *pattern* of the error is the
> useful part: the audit named three "client re-derivations" without checking whether each was live,
> reachable, or actually the weaker of the two implementations.

**1. The compare table — `calcVolume` was real. THE MATCHER WAS ALREADY FIXED, and "route it through
the server" would have BROKEN it.**
- `calcVolume` was `weight × reps` — the pre-D-348 rule — so a chin-up counted toward the session's
  LOAD score and read as **zero lb** in the table on that same session. Fixed: volume is now priced
  server-side by `strengthSetVolume` and shipped on `session_detail_v1.strength_volume`.
- ⛔ **The matcher was NOT a fracture.** It moved to `canonicalize` + declared swaps on 2026-07-30
  (F5). This doc's "the 5th identity resolver, and the one that disagrees" was **stale when written.**
- ⛔ **AND THE SERVER'S MATCHER IS THE WORSE ONE.** `session-detail/build.ts`'s
  `matchPlannedToCompleted` is lowercase-exact — it pairs *nothing* for "Barbell Back Squat" against a
  logged "Back Squat". Routing the client through it would have re-opened F5 exactly.
- ⚠️ **And the two `canonicalize` functions are not the same rule.** `_shared/canonicalize.ts` carries
  a curated synonym/plural/parenthetical ladder (Q-197/Q-210); `src/lib/canonicalize.ts` is a small map
  plus a slugify. **A server-canonical key is not reliably a client-canonical key** — so the payload
  ships each entry under the exercise's own NAME and the client re-keys with the function it already
  pairs with. **The rule that came out of this: the server PRICES, the client PAIRS.**
- ⚠️ **A fourth copy of the stale rule was found while in there** —
  `StrengthPerformanceSummary`'s "Volume (lbs)" tile, inches under the table. Also now server-fed.
- Pinned in `session-detail-strength-volume.test.ts` (10 tests), including the D-338 authored-ramp
  parity and prescribed-==-performed reading a zero delta.

**2. `buildLoadHeadline` — "kill it" was overstated. It formats; it does not re-decide.**
- Every input is already a server verdict. What it does beyond formatting is a taper/peak override and
  a silence rule — **both presentation, both kept.**
- The one genuine holdout was a training THRESHOLD in a display file: `acwr < 1.0` → "you have
  headroom". **It could not fire.** The headline returns early unless the load deviates, and that slot
  only answered to `balanced`, which is never a deviating label. **Verified by exhaustion: 8,316
  input combinations emitted it zero times.** Deleted, not moved — moving a dead branch to the server
  would have bought a `COACH_PAYLOAD_VERSION` bump (24h of cache invalidation) for no visible change.
  Guarded by a sweep test so it cannot come back quietly.
- ⚠️ **`src/lib/load-headline.ts` is ALREADY SHARED** — `_shared/state-trend/state-screen-print.ts`
  imports it. It is one copy, not a client second opinion. Do not "move it to the server" on the
  strength of the F3 line in §CODE HYGIENE; that line overstated the problem.

**3. `BlockSummaryTab` — not a re-derivation to rewire. DEAD, and now deleted.**
- Unmounted since 2026-03-31 (`96db8469`), no importer anywhere in the repo, 1,184 lines.
- ⚠️ **The stated blocker had already expired.** `AUDIT-state-screen-2026-07-02.md` said do not delete
  it because per D-212 it was the only reader of `block_verdict`. **`StateTab.tsx:1805` reads it now**
  (with the seeded-verdict honesty gate at `:694`). D-212 and
  `SPEC-fitness-verdict-reconciliation.md:41` are back-annotated.
- Its `useExerciseLog` fields went with it — `trend`, `current1RM`, `peak1RM`, `latestRir`. ⚠️ **`trend`
  was the same lie D-347 deleted from State** (first-to-last across a 65%→95% ramp reads a
  prescribed light week as a decline), still breathing on a second surface, invisible only because
  nothing rendered it.

**⚠️ FOUND AND FILED, NOT FIXED: [Q-234].** `StateTab.tsx:1311` gates a per-lift bar on `lt.peak1RM`,
a **camelCase field on a snake_case server object** — always `undefined`, so it silently falls through
to measuring against *last session × 1.1*. ⛔ **The obvious fix is a trap:** `per_lift` already carries
`allTimeBestE1rm`, so renaming makes a *correct* number appear — which would then read "72% of your
best" on a deliberately light week, i.e. D-347's bug in a new costume. **Shape decision first.**

<details><summary>The original Stage 2 text, kept for the pattern of the error</summary>

- **Kill `buildLoadHeadline`, the compare-table's own matcher + `calcVolume`, the block-summary deltas** —
  route them through `canonicalize` and the server's one number. This is where the screens stop
  disagreeing AND where the client-math cleanup lands. Same cut (F5 identity + the hygiene holdouts).

</details>

### STAGE 3 — Ground the number facts (the first real build)
- **Load split** (bodyweight scores zero) per D1. **✅ SHIPPED 2026-08-01 — deployed (9 fns), backfill
  ran clean (97/97 in 4 chunks), VERIFIED by measurement on real data (strength 8% → 38% of 28-day
  load; ratio 0.83 → 1.05, still "on target" — no false spike) and seen on web (43% on rolling-7d,
  "balanced"). Not yet on device/Xcode.** One set rule (`strengthSetVolume`, `_shared/workload.ts`)
  used by the load score, the planned score AND `compute-facts`' `total_volume_lbs`, so the two
  numbers on screen cannot disagree. Body weight from `user_baselines.weight` + `units`; **null →
  scored exactly as before, never a guessed weight.** (D-347 / D-348 · imprecisions Q-233.)
  - ⛔ **THE RE-PRICING PASS IS THE DELIVERABLE, NOT THE FORMULA** —
    `supabase/functions/backfill-strength-load/` (dry-run by default, does BOTH the completed and
    the planned side). The verdict is a ratio of 7 days against 28 read from STORED scores: ship the
    pricing without re-pricing history and an identical week reads **1.00 → 1.47, "total load
    building"**. Pinned both ways in `workload-strength-bodyweight.test.ts`.
  - ⚠️ **Known imprecision: a BAND-ASSISTED pull-up counts as full bodyweight.** The band cancels an
    unknown fraction of the load, and inventing that fraction would be a fabricated number wearing a
    measured one's clothes. It over-counts — by less than zero under-counted, and in the one
    direction that is visible rather than silent. The same holds the other way for a push-up: Strong
    counts a bodyweight exercise as full body weight while the biomechanics say nearer two-thirds.
    One stated rule, leaning where the field already leans.
  - ⚠️ **Known and left: an isometric hold still scores zero.** A plank/dead-hang/wall-sit is logged
    as time with no reps, so a per-rep rule has nothing to multiply. Scoring isometric time needs
    its own basis; it is not a fudge inside this one. Michael, 2026-08-01: *"planks/holds staying
    zero is fine — flag it."*
  - ⚠️ e1RM is untouched: `best_weight` still moves only on EXTERNAL weight, so a chin-up cannot
    mint a bodyweight one-rep max.
- Then the smaller ones: **as-of dates** (ship newest date, not `today − age`; body done, strength/bike
  drift [verified `StatePerformanceSection.tsx:72`]) · **planned-vs-actual window** (F21) · **the 5/3/1
  ramp** in the Performance table (`set_plan`) [needs trace] · **one e1RM substrate** per D4.

### STAGE 4 — Integrity (DEMOTED 2026-08-01 — dev data, only-forward-matters)
- ~~Auto-attach content check~~ — **Stage 0 found no attachment corruption.** The only real gap is that
  **deleting a plan orphans its completed sessions' links** (nothing tidies up). Pre-launch this is
  history and doesn't touch any live fact. **Deferred** to a small guard in the plan-delete path when
  the pipeline is next open. NOT part of the facts-only push.

### STAGE 5 — Strip the guidance (low risk, after the facts are true)
- **S1** Body HR: drop "working harder to hold effort," keep direction + number · **S2** Cross-training:
  keep "10 of 18-mile target," defer the paragraph · **S3** verdict words per D3.

### STAGE 6 — Clear the cruft that hid all this
- Remove named dead code (`PostureLine`, `readinessColor`). **Leave** the 4 generators / 3 routing
  tables — separate, bigger job, out of scope for facts-only.

### Decide, don't reflex-fix (any stage)
Dead "aerobic fitness" row (wire or remove) · durability/decoupling (Q-232, silenced on purpose) · bike
power/efficiency split and the run row (deliberate / just rebuilt).

---

## CODE HYGIENE — what's in the way of seeing the right code

**Verdict: not a swamp, but mid-migration and not clean. The architecture is right (server computes,
client renders) and largely realized — the residue is exactly the code causing the screen
disagreements.** Measured 2026-08-01.

**Is it server-side / no client math?** Mostly, with named holdouts — and the holdouts ARE the bugs:
- ~~`buildLoadHeadline` — the LOAD verdict is composed **on the client** (`StateTab.tsx:1262`, F3).~~
  ⛔ **OVERSTATED — corrected 2026-08-01 (D-350).** The verdict is DECIDED by the reconciler and this
  function only formats it. The file is also already shared with the server
  (`state-trend/state-screen-print.ts` imports it), so it is one copy, not a second opinion. The one
  real holdout — an `acwr < 1.0` threshold — was **unreachable** and is deleted. See Stage 2.
- ~~`StrengthCompareTable` — its **own `calcVolume` + its own exercise matcher** on the client (the 5th of
  the five identity resolvers, and the one that disagrees with the score above it).~~
  ⛔ **HALF STALE — corrected 2026-08-01 (D-349).** `calcVolume` was real and is deleted (volume now
  arrives priced from the server). **The matcher was already fixed on 2026-07-30 by F5** and is the
  BETTER of the two — the server's own is lowercase-exact. It stays on the client deliberately:
  **the server prices, the client pairs.**
- ~~`BlockSummaryTab` — e1RM deltas / sparkline computed client-side off `estimated_1rm`.~~
  ✅ **Moot — the component was unmounted since 2026-03-31 and was DELETED 2026-08-01 (D-350).**
- **19 direct DB queries** across the analytics screens (CoachWeekTab 11, StateTab 6, CompareTable 2) —
  allowed for non-calendar reads by CLAUDE.md, but it's client reaching into tables.
- The `smart-server-dumb-client` migration is **real and active** — many items already ✅ Fixed, D-342
  moved four more — but not finished. **Finishing it for these surfaces IS the continuity fix.**

**How much dead / legacy code?** Moderate and mostly labeled:
- Named dead code still present: `PostureLine`, `readinessColor` (`StateTab`/`StatePerformanceSection`),
  the stale raw-ACWR payload, 28 deliberately-kept-dead strength declarations.
- Structural legacy: **11 empty edge dirs**, **39 files on `@ts-nocheck`** (up from 27), **four
  overlapping plan generators**, **three hand-maintained routing tables**.

**What's obscuring the live code (the real drag):**
1. **Capability duplication** — exercise identity ×5, plan generators ×4, routing tables ×3. Grep a
   capability and you get several hits with no tell which is live.
2. **History-in-comments** — superseded decisions kept as long block comments ("everything above is
   history"). Great provenance, but the load-bearing line is buried in dead rationale (see `wendler-531.ts`).
3. **Stale docs that assert health** — ~150 docs, most stale; five called the run area "clean" while it
   was broken. A doc that says "clean" routes the next session away from the fault.

**Layer depth (data → strength number on screen):** ~8 hops — `compute-facts` → `exercise_log` →
`compute-snapshot` → `athlete_snapshot` → `state-trend/assemble` → `response-model` → `useStateTrends` →
`StateTab` → `StatePerformanceSection` → `TrendSparkline`, with parallel stacks for Details
(`session_detail_v1` build, ~1276 lines) and Performance (`analyze-strength-workout`). Most layers are
legitimate spine; the "crap" is the **duplication across them** — the client re-deriving what the server
already computed.

**The one-line read:** the mess isn't depth, it's **duplication + kept history + lying docs.**

> ⚠️ **AND THIS DOC WAS ONE OF THE LYING DOCS (2026-08-01).** The sentence that used to close this
> section — *"delete the client-side re-derivations (`buildLoadHeadline`, `CompareTable`'s
> matcher/volume, `BlockSummaryTab` deltas) and read the server's one number"* — named three targets
> and got all three wrong: one was already fixed and was the stronger implementation, one was
> unreachable dead code, and one was a component nothing had rendered in four months. **One of the
> three instructions ("route the matcher through the server") would have re-opened the very fracture
> this audit filed as F5.**
>
> **The lesson is the one this document opens with, turned on itself:** it warned that the dominant
> fault is a built, correct thing starved of a wire — then listed three "client re-derivations"
> without checking whether each was live, reachable, or actually the weaker of the two copies.
> **Before deleting a "duplicate": confirm it renders, confirm the server's version is better, and
> confirm which of the two the rest of the app already agrees with.** Duplication is only a fracture
> when both copies are alive AND they disagree.

The corrected version of that move is Stage 2 above, and the rule that came out of it is
**the server prices, the client pairs.**

---

## Cross-references
`STATE-SOURCE-MAP.md` (per-row substrate + silent drops) · `AUDIT-state-screen-2026-07-20.md` (F1–F25) ·
`AUDIT-performance-state-2026-07-29.md` · `ENGINE-STATE.md` banner (current job) · `POLISH-PUNCH-LIST.md`
(the three protocol-blind reads + the HR stamp) · `_shared/block-identity.ts` (the root card) ·
`CONSTITUTION.md` Law 1 (one source per fact).

> **Status of this doc:** a map for the pass, not a decision log. When a row is fixed, fold the substance
> into a `D-NNN` and mark it here. Confidence tags are honest — anything **[needs trace]** is a lead, not a
> finding.

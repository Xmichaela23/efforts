# Decisions Log — Part 2 (D-373 onward)

Append-only record of architecture / design decisions worth preserving across sessions. Each entry
captures **why** the call was made, what was rejected, and what tradeoff is being lived with — so the
next session doesn't re-debate (or worse, undo) settled choices.

---

## 📁 WHERE TO FIND A DECISION

**The number tells you the file. Numbering NEVER restarts — a `D-NNN` exists exactly once, anywhere.**

| range | file | status |
|---|---|---|
| **D-001 → D-239** | [`archive/DECISIONS-LOG-archive-D001-D239.md`](archive/DECISIONS-LOG-archive-D001-D239.md) | frozen, **still authoritative** |
| **D-240 → D-372** | [`DECISIONS-LOG.md`](DECISIONS-LOG.md) | frozen 2026-08-02, **still authoritative** |
| **D-373 →** | **this file** | live — new entries go here |

⛔ **FROZEN DOES NOT MEAN DEAD.** Every one of those entries is as binding as the ones in this file.
They were split because a 484KB doc is ~120k tokens and stops being readable, **not** because their
contents stopped counting. **Grep all three before reversing anything:**

```bash
grep -rn "D-267" docs/DECISIONS-LOG*.md docs/archive/DECISIONS-LOG-archive-*.md
```

⛔ **When you supersede an older entry — in ANY of the three files — GO BACK AND ANNOTATE IT.** Write
the back-annotation as a `>` blockquote at the TOP of the old entry: what changed, where in code, and
"everything below is history." See the end-of-session protocol in `CLAUDE.md`.

> **Why this file exists (2026-08-02).** The previous rule said "move the CLOSED and superseded entries
> to an archive." That rule can never fire on a decisions log — **a decision does not close** — so this
> file grew to 3× the cap while the rule sat there looking followed. It was also measured and found
> dangerous on `OPEN-QUESTIONS`: automated "is this closed?" detection flagged **Q-246 and Q-247 as
> closed when both were live**, and burying Q-246 would have hidden the warning that `plannedWorkout`
> is still in use. **So: no judgment, no moving text. Freeze at a number, start the next file.**

---

### D-373 — Coaching language is for MAIN LIFTS ONLY (2026-08-02, **PUSHED `b1b4c13f` + DEPLOYED coach v161 + VERIFIED live**)

`computeLiftVerdict` (`_shared/response-model/weekly.ts`) ran **every** movement through the same
RIR-deviation logic and **never consulted role**, so a hard-feeling **accessory** — Hip Thrust,
Barbell Row — printed a red **"back off weight"**. Accessories carry no anchor, so the State row had
nothing to build a sentence from and dumped the raw command on screen. It is *worse* on lighter
programs, where almost everything is an accessory. Root-caused in `SPEC-strength-language.md` (locked
2026-08-01) and unbuilt until now; this is **Axis 1 (Role)** of that spec. Axis 2 (Type) and the
collapse of the six overlapping classifiers remain.

**The gate returns an EMPTY label for anything that is not one of the four main lifts.** The client
reads `''` as "not coached" and renders the number instead (`Working ~110`).

⛔ **THE GATE IS `isMain531Lift`, NOT `roleForExercise`, AND THE DEFAULTS ARE WHY.** Both classifiers
exist and they disagree on an unknown movement: `roleForExercise` → `'primary'`, `isMain531Lift` →
`false`. That opposition is correct — the LOAD system should count an unknown move, the LANGUAGE
system should say nothing about it. **Gating language on `roleForExercise` would coach every
unrecognised movement and rebuild this exact bug one layer down.** Silence is the safe failure.

**Field basis:** Strong and Hevy render per-exercise numbers only — heaviest weight, e1RM, volume, PRs
— and issue **no commands**. "Back off weight" is not app language.

**A test was REVERSED, not deleted.** `weekly-strength-verdict.test.ts` asserted that Hip Thrust
*should* receive "back off weight", under the title *"behavior unchanged"*. It passed, and it pinned
the bug. Same lesson as [D-372] the same night: when a test's subject moves, re-point it.

**Verified live, not by screenshot:** after deploy, the coach payload returned Hip Thrust `""` and
Barbell Row `""`, with Squat / Deadlift / Bench / Overhead Press still coached.

⚠️ **THE DEPLOY ORDER IS PART OF THIS DECISION.** `COACH_CLIENT_MIN_PAYLOAD_VERSION` was raised to 161
*before* the server served it, which made the client reject its own cache, forced a coach
regeneration, and the regeneration hit [Q-252] and wrote null over the good cached copy — **blanking
the entire State performance section.** The floor now moves only after the server is verified serving
the new version. See the warning on `coach-contract.ts`.

### D-374 — "From your logged sets" is a MAIN-LIFT section (2026-08-02, Michael — **PUSHED, client-only**)

Michael, looking at the section: *"what does this section actually communicate? should it be for
accessories?"* → *"so we should lose the acceroies and just have main lifts"*.

**Every row reads `Working ~120 vs your 150 baseline` — a comparison against a TESTED 1RM.** You test
a max on the four barbell lifts. You do not test one on a Hip Thrust. So an accessory can never fill
that column; [D-373] silenced the command it used to fall through to, and this removes the row that
had nothing left to say.

⚠️ **FILTERED AT THE DISPLAY, NOT AT THE SOURCE, DELIBERATELY.** `per_lift` is a shared contract — the
coach reads it for strength maxes (`coach/index.ts:3557`) and the block model iterates it
(`block.ts:322`). Narrowing it server-side would quietly change that reasoning. This is a choice about
which rows belong in **one section**, made with the **same shared classifier the server gates on**
(`isMain531Lift`) so the two cannot drift. `perLift` is left intact for the adjust lens.

⛔ **This does not mean accessory work does not count — it means it has no home YET.** Filed as
[Q-253]: the honest frame for by-feel work is the athlete's own history (reps at a weight, volume over
weeks), never a tested max — which is also Michael's direction on [Q-251]. Do not "fix" Q-253 by
putting accessories back into the baseline section.

### D-375 — ONE strength language: Axis 2 (Type) + the classifier collapse (2026-08-03, **PUSHED + DEPLOYED (29 fns) + PARTIALLY VERIFIED**)

Completes `SPEC-strength-language.md`. [D-373] shipped Axis 1 (Role); this is **Axis 2 (Type)** plus
the collapse of the 6→8 overlapping classifiers onto **one role axis + one type axis**. Built as 7
ordered steps (build the new table → migrate readers one at a time → delete duplicates last), each
proven by fixture with no behavior change except deliberate corrections.

**What shipped:**
- **The Type table** (`src/lib/exercise-role.ts`): 8 rows — barbell-main, barbell/DB-accessory,
  bodyweight, plyo, isometric/hold, mobility, carry, **band** — each carrying has-weight / has-1RM /
  coached / logged-as. The four main lifts read `MAIN_531_LIFTS` directly so "coached type" can't drift
  from `isMain531Lift`. Unknown move = counts as load, says nothing (same safe default as D-373).
- **Band is an 8th type that POINTS at existing machinery**, not reinvented pricing: `bandMeansAssistance`
  (add-vs-assist) + the flat-token path in `workload.ts`.
- **The card, logger, swapping, load all read the shared axes.** Notable sub-decisions: equipment-draw
  rules were **transcribed byte-for-byte** into the shared module (Step 3), NOT re-derived — re-deriving
  would have re-opened Q-180 (Farmers Carry priced as one bar). Swapping's `isMainLift` became a
  **union** (curated family OR shared classifier) so it can't disagree about "main lift" (Step 4).
- **A real pricing bug fixed along the way** (`src/lib/band-assistance.ts`, Step 5): the logger and the
  pricer used different gates for "is the band assistance," so "Band Assisted Pull Up" priced 40 lb of
  HELP as 40 lb of LOAD — **200 vs the correct 700**, and it was corrupting stored `total_volume_lbs`
  in 5 call sites, not just the load score. One shared gate now. **History checked read-only: clean —
  Michael only ever logged the plain base names, which were always priced right.**
- **The fitness-section name sets are THREE questions, not one** (`src/lib/tracked-max-lifts.ts`, Step 7):
  "may we coach it?" (~16, includes Front Squat) ≠ "do we chart a tracked max?" (exactly 4) ≠ "does it
  move the dot?" (`PRIMARY_LIFTS`, 5). A Front Squat coached-but-not-charted is **correct** (it fills the
  squat slot, doesn't earn a 5th max) — pinned in a fixture. The real bug fixed: `BIG_4` existed
  byte-identical in two files (server emitter + client renderer) with only a comment claiming they
  matched — the D-346 fault waiting to happen; now one imported list.
- **Cap fix** (`StateTab.tsx` logged-sets list): the list was `.slice(0,5)` **before** the main-lift
  filter, so `overhead_press` (6th in key order) was cut before it was checked — the "missing OHP"
  symptom. Now filter to main lifts FIRST, then cap (redundant at max 4). Client-only.

**Deploy:** commit `dd703ef5` + the cap-fix push; 29 edge functions redeployed (the union widened from
11 → 29 because `state-trend/assemble.ts` is the snapshot spine). Coach payload version NOT bumped, so
no client-floor / Q-252 trap. Blocked once by an upstream esm.sh 404 (`@supabase/supabase-js@2` →
2.112.0 auth-js missing); self-healed within hours, no version pinning needed.

**VERIFIED on device:** strength card shows main lifts only, no red "back off weight," OHP restored
after the cap fix, band-assisted Chin Up renders Assist(lb)+Added correctly. **NOT verified:** the 5
changed logger movements (sled push/pull, dead hang, wall angel, foot doming) — blocked because they
aren't in the add-picker (see the catalog gap in ENGINE-STATE Known-broken).

**Deferred (NOT this decision):** → [Q-254] now carries the real strength-currency work (rebuild the
logged-sets rows on AMRAP + learned e1RM, drop RIR for AMRAP, roll trap-bar into the deadlift slot).
Two fresh bugs from acceptance filed in ENGINE-STATE. [Q-253] (accessory home), plain-name recognition,
core-circuit label, and `bandMeansAssistance`-in-canonicalize (dead, left labelled) remain.

> **Back-annotates [D-373]:** Axis 1 shipped there; the strength-language SPEC is now fully built as of
> this entry. `SPEC-strength-language.md` retained only for the unbuilt remainder above.

### D-376 — Swap engine: an intensity-tier gate for accessories (2026-08-03, **PUSHED + DEPLOYED + VERIFIED**)

The swap engine (`getInSlotAlternatives`, `exercise-alternatives.ts`) filtered on movement pattern and
excluded main lifts, but was **blind to intensity tier** — so it offered a loaded Barbell Hip Thrust as a
swap for a light-band Clamshell, ranked heaviest-first. Grounded in the field standard (Wendler push/pull/
single-leg-core; Fitbod "same muscle, equivalent intensity, change only equipment"; RP "same muscle, similar
rep range"), a sound accessory swap must share **category + intensity tier + muscle**. Added
`src/lib/strength-intensity-tier.ts` (light / loaded / power) and gated swaps to same-tier only. Killed 97
tier-only-unsound offers. **Muscle axis left LOOSE deliberately** — Wendler treats posterior-chain accessories
as interchangeable, so pattern stays the muscle proxy (a fixture pins muscle-loose so a future change can't
quietly tighten it). Gate is accessories-only (a main lift may still swap DOWN). Also fixed 3 "same movement,
two names, two pools" pattern defects (Y-T-W, reverse-fly, squat-jump). Client-only engine; the pattern
config touches 7 edge functions. Audit: `docs/AUDIT-accessory-swaps-2026-08-03.md`.

### D-377 — The exercise-config catalog reconciled + a permanent VOCABULARY GUARD (2026-08-03, **PUSHED + DEPLOYED + VERIFIED**)

`getExerciseConfig` ends in a "longest overlapping key wins" fuzzy fallback, so any exercise without an
exact config key silently **inherits a neighbor's prescription** — the same disease as D-375's classifiers,
one layer down. Live example killed: plain **"Press"** (5/3/1's own word for OHP) resolved to **"Leg Press"
→ 1.5× your SQUAT**. Fixes: (1) added config entries for all 65 offenders (type table + baked plans + a
read-only snapshot of Michael's real logged/planned names), every ratio **inherited from a structural
sibling, never guessed**; (2) the fuzzy fallback now emits a **loud dev warning** naming what it borrowed;
(3) **`exercise-config.vocabulary-guard.test.ts`** — a permanent test that fails the build, by name, for any
exercise that resolves fuzzy/none. Empty `ACCEPTED_FUZZY` ledger — nothing pre-forgiven. Only 5 prescriptions
actually moved (Squats-priced-as-jump, Pistol-Squats-off-barbell-max, Kettlebell-Rows-per-hand, Glute-Bridge-
March-unloaded, Handstand-Push-ups-vertical); the rest were byte-copies or bodyweight. Also fixed the
apostrophe trap (`foldExerciseName` now strips `'` — "Farmer's Carry" resolved to nothing) and Single Leg Hip
Thrust (was priced as a two-legged barbell deadlift). **This turns "find bad prescriptions by screenshot"
into an automatic, permanent check.**

### D-378 — Q-254 slice 1: State reads the AMRAP all-out set (2026-08-03, **PUSHED + DEPLOYED + VERIFIED**)

State's "from your logged sets" showed working-weight vs a stale typed baseline while the **Performance**
screen already showed the real all-out set — the doubled disease. The all-out read (rep record + hedged
e1RM + the "estimates hold to about N" caveat) lived in `workout-detail`, not `session-detail/build.ts`;
extracted to `_shared/strength/all-out-set.ts` and made State read the same source over the last 40 sessions
(the old 28-day window went blank on measured lifts during light weeks). Additive — no verdict/weight/trend
moved. Coach payload 161 → 162. **VERIFIED: Deadlift State ≡ Performance (105×35, est 225 "rough").**

### D-379 — Q-254 slice 2: the verdict reads the AMRAP, not RIR (2026-08-03, **PUSHED + DEPLOYED + VERIFIED**)

`computeLiftVerdict` decided "back off / add weight" on **RIR deviation** — how sets *felt* — which is not
5/3/1's signal. Worse, a live bug: `getTargetRir` never returned null for `usesRir:false`, so a main lift
with no RIR of its own **inherited the accessory RIR average**, cleared the ±1.0 band, and printed a
**tappable** command that moved real weights on one tap. Fix (2a): `getTargetRir` gated via the existing
`protocolUsesRir(profile)` seam (NOT a signature change — its docblock forbids that; a forgotten null-check
reads 0 = grind-to-failure) → a 5/3/1 main lift lands in the trend-words branch, no command, **not tappable**.
Fix (2b): the verdict now reads the AMRAP through the **existing `verdictFrom95Set`** (`wendler-531.ts:454`,
book-grounded: 0→reset, 1+→advance, big→advance-untrusted, none→hold) as **read-only status** ("top set met /
missed"), no weight suggestion attached. ⛔ Deliberately **did NOT** surface "advancing/reset" wording — the
working number does not move from this path (that's [Q-223], already built). Coach payload 162 → 163.
**VERIFIED: green "top set met" replaced the old command; not tappable.**

### D-380 — Strength rest timer reads the shared main-lift list; heavy rest 150s → 180s (2026-08-03, **PUSHED + DEPLOYED**)

`calculateRestTime` split main-vs-accessory via its OWN private regex (a 7th private classifier) that missed
Push Press / Military Press → they rested 90s after a heavy triple. Repointed at the shared
`isMain531Lift` / `MAIN_531_LIFTS`. Heavy main-lift rest (3-5 rep case) bumped 150s → **180s** (the strength
standard). ⚠️ Side effect, pinned in a fixture: DB / incline / decline bench now rest 90s — they're
*assistance* in 5/3/1, not main lifts, so the shared classifier is correct, but Michael will feel it (his
call to keep or bump). The backgrounding fix (Q-TIMER, wall-clock deadline + notification) was audited and
is **solid** — no work needed there.

### D-381 — Band-load pricing: a blank band box is not bodyweight (2026-08-03, **PUSHED + DEPLOYED, LATENT**)

`strengthSetVolume`, for a band move with no logged band value, fell through to **bodyweight × reps** —
correct for a push-up, wrong for a band pull. Added a `bandIsLoad` opt (`typeForExercise === 'band'`) that
returns the flat `BAND_SET_VOLUME_TOKEN` instead. Also closed the matching planned-side hole ("By feel"
didn't trip `plannedIsBand`). ⚠️ **LATENT**: read-only check of all 96 strength sessions found **zero**
affected — every band set Michael has logged already carries a value, so no `total_volume_lbs` / ACWR moves.
Backfill empty. *(This corrects the false premise that his screen's "4,000 lb" band face pull was live — it
was a stale build; his real data prices at 1,000.)*

---

### D-382 — The Focus front door: Train / Race / Build, with a Train drill-down (2026-08-05, **PUSHED + CLIENT-DEPLOYED, NOT DEVICE-VERIFIED**)

**Supersedes `SPEC-assistance-fix.md` §B, which dies with this entry.**

The Goals screen opened to a list of active plans and one **"Add a goal"** button; the builder behind
it opened to *"What's the goal?"* with two cards (Strength Focus, Marathon). It is now:

- **Goals → Focus** (tab label, screen title, and the eye mark — see D-384), showing **Train · Race ·
  Build** where "Add a goal" was.
- **Train** drills down to **Run Focus · Ride Focus · Strength Focus · Athletic Focus**.
- **Strength Focus** opens the three tiers (D-383), then today's block unchanged.
- **Race** routes into the existing marathon flow, untouched.

**Locked calls, with their reasoning:**

1. **The entry cards are NAVIGATION, not goals.** `GOAL_ORDER` stays a goal list and keeps feeding
   `seedFromGoal`; `train`/`race`/`build` live in `ENTRY_ORDER`, and the goal id is set one screen
   later (Strength → `get_stronger`, Race → `marathon`). ⛔ Putting an entry id in `GOAL_ORDER` falls
   through the seed switch to a default and **reintroduces the 2026-08-04 progress-bar jump**.
2. **The door lives on the Goals screen, not as the builder's first step.** Built the wrong way round
   first — three cards one level down behind "Add a goal", so the screen looked identical. Michael:
   *"nothing there" … "should replace add a goal."* `GoalsScreen` renders the door and deep-links the
   builder to the tapped card (`entry` prop); the builder's own door survives for the standalone
   route and for Back to land on.
3. **Not-yet cards are `disabled`, dimmed, and carry NO "Soon" tag.** Run / Ride / Athletic / Build
   have no flow. Inert to pointer, keyboard and screen reader alike — "it isn't ready" has to be true
   for everyone. No badge: it would promise a date that does not exist.
4. **"Athletic", never "Multi"** — *"Multi" reads as triathlon-only, which is the read we are
   avoiding.* The name alone does not carry multi-discipline, so **the subtitle does**; never render
   one of these cards without its blurb.
5. **"Plan a season" moved inside Race**, at the foot of the race screen (*"Racing more than once
   this year?"*), placed after the fields so one race stays the primary path. Route unchanged
   (`/arc-setup`); the handler is passed DOWN from `GoalsScreen` because closing Goals is that
   screen's job, not the builder's.
6. **`GoalsScreen.tsx` is NOT deleted.** "Replaces the Goals screen" means the entry the athlete
   lands on. That file still holds `renderEventForm()` — the ride / swim / tri / du race form, which
   **has no other door** and is not absorbed by Race in this slice (Race routes marathon only; see
   punch-list #3). Both doors coexist.
7. **The "Which discipline?" sub-picker is deleted, not moved.** It served `build_endurance` /
   `build_speed` / `starting_over`, none of which were offered; the Train card names the discipline,
   so the question cannot arise. `GOALS_NEEDING_DISCIPLINE` still governs any goal reached otherwise.

> ⛔ **THIS REVERSES THE 2026-07-25 PLACEHOLDER RULE — and the rule's reasoning is kept.** That call
> (*"let's clear out all the placeholders"*) rested on *a front door offering five things that do not
> work is worse than a door offering one that does*, which is still true. The difference: the door now
> has **two levels**, the entry screen offers only cards that OPEN, and the unbuilt disciplines sit one
> level down **saying they are unbuilt**. A card that admits it is not ready was never what that rule
> was aimed at. `NonRaceBuilder.tsx:60` rewritten accordingly.

**Files:** `src/components/GoalsScreen.tsx`, `src/components/NonRaceBuilder.tsx`,
`src/components/wizard/StepLayout.tsx` (`title` widened to `ReactNode`), `src/components/AppLayout.tsx`,
`src/index.css`, `src/lib/context-utils.ts`. Commits `5634b4f3`, `c3990967`, `7f61ff4e`.

---

### D-383 — Strength opens three tiers, and Strong is a PASS-THROUGH (2026-08-05, **PUSHED + CLIENT-DEPLOYED, NOT DEVICE-VERIFIED**)

Strength Focus no longer drops straight into the block. It opens **Strong / Heavy / Definition**
(`SPEC-assistance-fix.md` §A), worded by Michael: *"Stronger, not bigger." · "Build muscle." · "Shape
where you choose."*

⛔ **STRONG IS TODAY'S BLOCK AND PICKING IT CHANGES NOTHING.** Michael: *"strong is our current
strength focus plan."* The step routes into the existing `get_stronger` flow untouched and **sends no
new field**. It exists so the tier is a visible choice the day the other two are real.

⛔ **HEAVY AND DEFINITION SHIP DARK, ON PURPOSE.** What separates the three is *accessory volume and
character* — which is exactly what `SPEC-assistance-fix.md` §0–§7 is about to rewrite. Offering them
before that lands would ship **three names for one block**.

⛔ **AND NO TIER FIELD REACHES THE PAYLOAD, BECAUSE THE SPEC'S FIELD NAME IS ALREADY TAKEN.** §B
resolved that the tier travels as its own `strength_tier`. That key already exists on the plan config
holding the **EQUIPMENT** tier (`generate-strength-plan/index.ts`, `strength_tier: 'barbell'`). Two
meanings on one key is the "second vocabulary beside the first" trap `CLAUDE.md` opens with. Nothing
is blocked — Strong is a no-op — so the name gets picked when Heavy or Definition actually needs it
(`strength_intent` is the candidate). Recorded in the spec, not just here.

**Scope:** the tier step is on the Train→Strength path only. A `get_stronger` goal reached any other
way (standalone route, stored goal) walks the flow it always did. Commit `cea6b173`, spec note `841647e6`.

---

### D-384 — The eye, and one discipline palette on the front door (2026-08-05, **PUSHED + CLIENT-DEPLOYED, NOT DEVICE-VERIFIED**)

**"Goals" → "Focus", with an eye.** Tab label, screen title, and the mark. The screen behind that tab
is the front door and *focus* is the word it uses throughout (Choose your focus, Run Focus, Strength
Focus) — a tab called Goals opening a screen that never says "goal" was one name too many. The
internal `showGoals` state keeps its name; only what the athlete reads changed.

⛔ **THE EYE IS DRAWN IN CSS, NOT DROPPED IN AS AN ICON COMPONENT.** The tab bar's whole language is
abstract sigils built from gradients (`home`, `context`, `plans`); one real glyph among them reads as
a mistake. **One definition, two sizes:** `.eye-mark` carries the paint, `.tab-sigil` supplies the
16×10 box + active glow, `.eye-mark.eye-heading` is the 22×14 version beside the three door titles.
Painting it twice is how the two would drift.

⛔ **EVERY COLOUR READS `getDisciplineColor` (`SPORT_COLORS`) — not one hex is hand-picked.** Michael:
*"everything should use discipline colors."* Run gold, Ride green, Strength orange. Two cards have no
single discipline (Train, Athletic) and take the palette's unclaimed colour rather than borrowing one
of the four and implying a default.

⛔ **RACE IS NOT A DISCIPLINE, SO IT STOPS WEARING ONE.** It was run-gold, wrong twice: it claimed one
discipline for a card that will hold tri and du, and made Race and Run Focus the same colour on
adjacent screens. **`FOCUS_RACE_COLOR`** lives in `context-utils.ts` beside `SPORT_COLORS`,
deliberately outside it *and* outside the teal that means "selected", so it can never read as a
discipline or as a chosen state. One constant, both doors.

⚠️ **The colour survives the dimming, at 40%.** A not-yet card should still say which discipline it
is; going flat grey throws that away to signal something the text already says.

**Sizing + copy, from device reads:** cards `px-4 py-3` → `p-5`, icons 20 → 24px, labels `text-base`
(*"make the 3 cards bigger easier to read"*). Cards are **"Run Focus"**, not "Run" — a discipline is
what you do on Tuesday, a Focus is what the block is aimed at. Strength's line is Michael's: *"Get
stronger, bigger, more defined while holding aerobic base"* — it names the trade the block makes.

**A "Current" / "Start something new" divider pair** was added because *"Strength Focus"* appears
twice on the Focus screen and read as a duplicate: the top card is the block he is **running** (Anchor,
week 2 of 12), the one behind Train is the door to **start** one. Labelled rather than renamed — the
running block genuinely IS a Strength Focus, and a second name for it would make the app call one
thing two things. ⚠️ Not redundant, then, but *"it reads as a duplicate"* is a real defect even when
the data is right.

Commits `9baa35fb`, `d4eda969`, `dca84dda`, `8a0efcd7`.

---

### D-385 — Accessory selection is day-type roles, not family collision (2026-08-05, **PUSHED + DEPLOYED, NOT DEVICE-VERIFIED**)

**Supersedes `docs/SPEC-assistance-fix.md` §0–§7, which dies with this entry. Partially supersedes Q-212 (see its back-annotation).**

Four defects, all confirmed in code, all fixed against the 2nd edition rather than against memory:

1. **A press day structurally could not show a push.** Every push option shares the main lift's family, so the slot always collided and fell through to `BALANCE_POOL.push` — four movements, **all four pulls**. Bench and OHP shipped two pulls and zero push, every time, by design.
2. **Leg work landed on press days** — nothing collided with `single_leg_core` on an upper day, so it passed through and stacked glute/ham load against the run legs.
3. **Squat and deadlift days ran the same leg pattern.**
4. **The rep floor was 25.**

⛔ **THE p.86 CITATION THE OLD RULE RESTED ON WAS READ TOO NARROWLY, AND THAT IS THE WHOLE STORY.** p.86 does pair Bench→Chin-ups, but the template runs to p.88, whose worked example is `Bench 5/3/1 → Barbell Rows → 3 rounds of Med Ball Slams · **DIPS** · Burpees · Chin-ups · Planks`. **Dips are on the bench day, in the template we quoted to prove they should not be.** p.87's upper-body assistance list is push and pull throughout. **No page in the book turns a push slot into a pull.**

**What replaced it:** `ROLE_BY_DAY` — upper days are push · pull · core, lower days are leg · pull · core, **core last** as every template runs it (p.48, p.51, p.55, p.88). The p.86 plane rule survives **on the pull slot only**, which was always the correct half of Q-212; applying it to the push slot is what deleted the push.

**Reps: floor 50, ceiling 75.** ⛔ **There is no 25–50 range in the book** — the premise of the 2026-07-28 "25 IS THE FLOOR" call. Triumvirate (p.48) runs 50–75 per movement; Bodyweight (p.52) says "no less than 75 per exercise"; Periodization Bible (p.51) is 5×10–20. Wendler's lowest figure anywhere is 50. **The 50/75 band is the Triumvirate's own.**

⚠️ **Face Pull is NOT demoted** — p.50 lists it under "Lats or Upper Back". It moves to the **pull** slot. It was only ever wrong as a push. An earlier spec draft called it prehab; the book does not.

⚠️ **The core-on-an-upper-day slot is a CHOICE, not a quote.** Four of five templates put arms/upper-back there and keep abs on the lower days. The one source for core on a press day is **p.87, the concurrent chapter** — written for an athlete who lifts and conditions. We take p.87 over the four powerlifting templates deliberately. Do not "correct" it to triceps by citing p.51.

⛔ **AND THE APP STOPPED SAYING "You picked X" ABOUT ITS OWN DEFAULTS.** Under day-type roles the push slot is re-roled on **every** lower day, so the default path would have carried a false "you picked" note on half the block's sessions.

**Files:** `src/lib/assistance-menu.ts` (roles, `ROLE_FALLBACK`, floor/ceiling, menu additions, substitution copy), `shared/strength-system/assistance-collision.test.ts` (**rewritten** — its old invariant *was* the bug and it passed). Commit `a0d1baec`.

---

### D-386 — Lift spacing is two terms, and neither is upper-against-lower (2026-08-05, **PUSHED + DEPLOYED, NOT DEVICE-VERIFIED**)

> ⛔ **SUPERSEDED 2026-08-06 by [D-394] — the gate WARNS now, it does not refuse.** Michael: *same "warn, no wall" as the mileage floor.* The reasoning below (*a race inside the floor is arithmetic*) was half wrong: the engine DOES have a plan for them once the arc is anchored to race day and the ceiling is stated. Everything below is history.

**Builds Q-214. Supersedes Q-214's ranking note and deletes two terms.**

**BUILT — `pressAdjacencyShortfall`.** Nothing scored two pressing days landing next to each other. Q-214 verified this by enumeration in July and it was never built.

**DELETED — `upperLowerShortfall`.** It pushed every press ≥3 days from every leg day. ⛔ **Wendler's basic week (p.11) ALTERNATES upper and lower on back-to-back days on purpose** — Press · Deadlift · Bench · Squat — so the term scored the book's own week as worse than a clustered one. Worse: with four lifts on seven days, shoving each press away from the legs **shoves the two presses into each other**. It *caused* the 24h-apart pressing days Q-212 and Q-214 both chased.

**DELETED — `upperToNearestLiftPenalty`.** Measured `-min(gapDays)` from each upper day to the nearest lift **of any kind**; returned −1 for four arrangements whose press gaps were 1, 2, 3 and 3 (§0e). With press spacing measured directly, what remained was another upper-against-lower term. ⚠️ **Not dead** — 0 of 85 four-day scenarios changed, **36 of 43 three-day** did, all toward the book. Michael's call, overriding the "delete only if nothing changes" rule.

**CHANGED — the tie-break opens with the press.** It sorted lower-first then **alphabetically**, which is why an unanchored week opened "Monday: Back Squat". Nothing chose that; the alphabet did. Now p.11 order, so the default week is **Mon Press · Tue Deadlift · Thu Bench · Fri Squat**. Determinism is unchanged — the book order is as fixed and caller-independent as the alphabet.

**What is left, each measuring what it names:** `spreadPenalty` (heavy legs vs heavy legs) and `pressAdjacencyShortfall` (press vs press). **Nothing prices upper-against-lower.** If a future session wants that back, read p.11 first — it is the arrangement such a term scores worst.

⚠️ **A stated preferred day now loses to press spacing** (ranked above `preferredMissPenalty`). Q-214 weighed the ranking only against `upperLowerShortfall`; this consequence is pinned by a test so it is a recorded fact, not a surprise.

**Files:** `_shared/week-solver.ts`, `_shared/week-solver.test.ts`. Commits `d2fd3234`, `24771cce`.

---

### D-387 — Three days means three days, and the rest day yields instead of dropping a session (2026-08-05, **PUSHED + DEPLOYED, NOT DEVICE-VERIFIED**)

**THE WEEK-3 TEST SPLIT IS DELETED.** Week 3 of every cycle broke the 3-day shape onto **four** days so each 95% set was read fresh. ⛔ **The premise does not survive the trace:** `applyVerdict` steps the working number by a **fixed** increment (`cappedCycleIncrementLb`, +5/+10) and `verdictFrom95Set` reads only whether the prescribed single at 95% was completed. **The next weight is never computed from an estimated max off that set** — the e1RM touches the ceiling and a trust label, nothing else. A fatigued lift can miss the rep target, which is the book's own reset trigger on any day, but it **cannot bias the weight**. The split bought nothing and cost a "3-day" plan that quietly ran four days every third week.

**THE PAIRED DAY IS ONE SESSION.** The per-lift loop authored a complete session per lift, so the shared day emitted two sessions and **eight exercises**. Now two mains + **one** assistance block, bench first (heaviest leads; the second lift is trained fatigued). Stacking mains is Wendler's own — p.77 runs Squat and Bench 5/3/1 in one session.

**LIFT ORDER is p.11:** Press · Deadlift · Bench · Squat. ⚠️ That reorder flipped the 3-day shared day so the **bench** was trained fatigued behind the press — the week order and the shared-day order were reading from one array. Split them.

**THE REST DAY YIELDS.** It was reserved before anything was placed and outranked what the athlete asked for. It is now the last thing given up, and giving it up is **reported**. ⚠️ Two collisions found on the way, both the same shape — **two rules picking a day off `freeDays` without consulting each other**: the long run was hardcoded to Saturday and only worked because a lift happened to be there to share with; and `restReserved` could resolve to the same day as the long run. Either one produced a seven-day week with no rest.

**RUN AND RIDE ALTERNATE.** Runs claimed every free day first and rides could only stack onto lift days, so runs clustered and rides landed wherever a lift was. **Pass order, not a decision.** ⚠️ `easy_run × easy_run` is rated **0h with no penalty**, deliberately — so this is a composer preference with a stated owner (Michael), **not physiology**, and the code says so.

**THE LONG RUN KEEPS ITS DAY.** A first version stacked the **long** run to leave free days for easy runs — on the p.11 layout that put a long run on Thursday beside the bench while Saturday and Sunday sat free. The most expensive session stacked to protect the cheapest two. Easy runs stack instead.

**Files:** `shared/strength-system/strength-primary-plan.ts` + five test files. Commits `ddb31cc1`, `24771cce`.

---

### D-388 — "Strength Focus" is the discipline; "Strong Focus" is the block (2026-08-05, **PUSHED + CLIENT-DEPLOYED, NOT DEVICE-VERIFIED**)

The entry flow said **three names for one thing in four taps**: a "Strength Focus" card → a "Strength" tier screen → you pick "Strong" → the next header says "Strength Focus · 12 weeks".

**Strength is the DISCIPLINE** and keeps that name on the Train card beside Run Focus / Ride Focus / Athletic Focus. **Strong is the BLOCK** — the tier picked one screen later (D-383), and that is what `GOAL_LABELS.get_stronger` names.

⚠️ **A CONSTANT ONLY WHILE STRONG IS THE ONE LIVE TIER.** Heavy and Definition are the same `get_stronger` goal with a different tier, so this must **read the tier** the day either ships. The tier does not reach the payload yet (D-383 — `strength_tier` is taken by the EQUIPMENT tier), which is the only reason a constant is honest today.

⚠️ The posture step's title now reads `GOAL_LABELS` instead of a typed literal — the exact second-copy that label's own comment exists to prevent.

**Also on this commit:** the volume note (PMC5093324 — work-matched hard and easy running blunted leg-press strength almost identically, 28.7% and 27.5% against 38.5% for lifting alone; **volume was the mediator, not intensity**), placed at the mileage input because that is the decision it informs. And the lifting-days card, which was still promising *"one week in four goes back to four days to test your max"* — **a fourth day the engine no longer builds**.

⛔ **THE COPY GATE CAUGHT ONE AND MISSED ONE, AND BOTH MATTER.** *"How much to keep is yours to set"* trips `voiceViolation` on **keep** (banned imperative) and is second-person besides. *"give ground"* **passed the gate** and still breaks COPY-VOICE rule 10 — the banned list is finite and idioms have to be caught by reading. Passing `voiceViolation()` is necessary, not sufficient.

**Files:** `src/lib/non-race-goal-seeds.ts`, `src/components/NonRaceBuilder.tsx`, `docs/SPEC-assistance-fix.md`. Commit `4cae1d76`.

---

### D-389 — The hard session is 12 minutes, not 15, and the two papers that decide it (2026-08-06)

⛔ **THIS ENTRY EXISTS BECAUSE THE TWO FINDINGS THAT DECIDE THE HARD SESSION LIVED IN DIFFERENT FILES AND NEITHER POINTED AT THE OTHER.** One was in `DOCTRINE-aerobic-maintenance-run-only.md`, one was a code comment in `NonRaceBuilder.tsx`, and the sentence that connects them was written nowhere. **This is the canonical place. Both docs now point here.**

**The session:** `run_hills_4x180s_r180s_g5_8` — 4 × 3 min uphill at 5–8%, 3 min back down. **12 min of work.**

#### The two papers

| | What it says | What it decides |
|---|---|---|
| **Wen et al. 2019** — *J Sci Med Sport* 22(8):941–947, PMID 30733142, 53 studies | *"long-interval (≥2min), high-volume (≥15min) and moderate to long-term (≥4–12weeks) HIIT displayed significantly larger effects on VO2max (SMD=0.50–2.48, p<0.05)"* | The **ceiling** — what maximal VO2max work looks like |
| **Fyfe et al. 2016** — *Front Physiol* 7:487, PMC5093324 | Work-matched: RT only **+38.5 ± 8.5%**, HIT+RT **+28.7 ± 5.3%**, MICT+RT **+27.5 ± 4.6%** on leg press | The **cost** — what buying it spends |

#### The call, and the sentence that was missing

**Wen's recommendation is THREE conditions, not one — long-interval AND ≥15 min AND 4–12 weeks. We meet two.** The 3-minute rep clears the ≥2 min interval bar; a 12-week block is inside the window. **Only volume falls short: 12 min against 15.** One extra rep closes it exactly — 5 × 3 = 15.

⛔ **AND THE EXTRA REP IS BOUGHT IN THE CURRENCY THAT COSTS STRENGTH.** Fyfe found that hard and easy endurance, **matched for total work**, interfere with maximal strength almost identically. So intensity is not what you pay with — **total work is**, and a fifth rep is ~6 more minutes of it (3 hard + 3 recovery). On a **strength-primary** block, the ≥15 min threshold is a *gains* target for the aerobic side, and reaching for it spends the thing the block exists to build.

**So: 12 minutes. Structure from the evidence, volume from the maintenance context.** The shortfall is against one named criterion, deliberately, and is not an oversight.

⚠️ **KEEP THE MAGNITUDE HONEST.** ~6 min a week against ~20 miles is small. **The lever that actually moves strength is weekly mileage, not this rep** — which is why the athlete-facing note sits on the mileage input and not on the hill session.

#### ⛔ Three things about these citations that were wrong and are now fixed

1. **Wen was UNNAMED.** The doctrine said *"a separate meta-analysis of RCTs"* and the sentence was near-verbatim from an abstract nobody could look up — while every neighbouring claim in the same passage (Odden 2024, Maeo 2017, Vernillo, Helgerud 2007) was named.
2. **Fyfe was CYCLING, and the copy said running.** The conclusion reads *"whether HIT or MICT **cycling** is incorporated"*. Applying it to running overstates, since cycling carries less eccentric load. Shipped wrong on 2026-08-05, corrected 2026-08-06.
3. **The volume half is the authors' SUGGESTION, not their result.** They wrote volume *"might be a more critical mediator"*. They held work constant and varied intensity, so what is measured is that **intensity does not mediate**. The copy stated it flatly; it no longer does.

⚠️ **Helgerud's 4 × 4 is the shape this is built on, and ours is 4 × 3.** Same structure — four long reps, 3 min recovery — a minute shorter per rep. Stated, not hidden.

⚠️ **`DOCTRINE-aerobic-maintenance-run-only.md` contradicts itself below the prescription:** *"In a strength block, short-format uphill work is the default. Longer repeats are an endurance-led tool."* That line sits under a revision that retired its own reasoning. **The code follows the newer text (4 × 3 min). The stale line is still there.**

**Where the numbers live:** `shared/strength-system/strength-primary-plan.ts:682` (`hillSession`), `HILL_SESSION_MIN = 35`, `docs/DOCTRINE-aerobic-maintenance-run-only.md` §3 and "THE PRESCRIPTION THAT SURVIVES", `src/components/NonRaceBuilder.tsx` (the volume note).

---

### D-390 — The hill descent ends on the lap button, not a clock (2026-08-06, **PUSHED + DEPLOYED, NOT DEVICE-VERIFIED**)

**The recovery in a hill session is not a duration — it is however long it takes to get back down the hill the athlete actually has.** A 3:00 countdown answers a question it cannot know, and it is wrong in one direction every rep: at zero the watch buzzes and starts the next hard rep whether they are at the bottom or still walking down.

⛔ **THE CLIMB STAYS TIMED AND THE TWO ARE DOING OPPOSITE JOBS ON PURPOSE.** 3 minutes is the DOSE ([D-389]), so the work rep is a fixed countdown wherever it leaves the athlete on the hill. **Only the descent is open. Do not "make them consistent" by opening both.**

**Token:** `run_hills_{reps}x{work}s_rlap_g{lo}_{hi}[_d{walk|jog}]` — separate branch; the fixed-recovery hill is untouched and pinned by a test that says so. `hillSession()` emits the lap-button form with a **10-minute cool-down** (the fixed form's is 8).

#### ⛔ THE GARMIN SIDE, AND THE THIRD FAILURE WAS THE DANGEROUS ONE

The recovery carries **no `duration_s` at all**, and that absence is the instruction — it exports as **`durationType: 'OPEN'`**. Three places in `send-workout-to-garmin` treated a step with no time and no distance as malformed:

| where | what it did |
|---|---|
| interval builder, rest branch | `Math.max(1, sec \|\| 1)` → **a ONE-SECOND rest** |
| segment step builder | `continue` (dropped) |
| single step builder | `continue` (dropped) |

⚠️ **The first is the one that matters.** It does not drop the step and does not error, so the export **looks like it worked** and the athlete gets a 1-second recovery on the watch. Checked ahead of the coercion, not after. `durationValue` is now optional on `GarminStep`; every reader was already guarded, and an OPEN step contributes **0** to the duration estimate rather than `NaN`.

**Garmin ships this as a first-class option** — "Open Repeats" beside "Structured Repeats" — and the documented friction with canned hill workouts is exactly this: preset times that do not match the athlete's hill.

⚠️ **THE PLANNED DURATION NOW UNDER-READS.** `total_s` sums `duration_s`, so the open descents count as zero: the calendar shows ~32 min for a session that takes ~40. Not broken — a total that is honest about what it cannot know. **[Q-259].**

⛔ **NOT INCLUDED — the short-hill fallback.** Built and reverted the same day; see **[Q-260]**. It is an unsolved protocol question, not a missing branch.

**Files:** `materialize-plan/index.ts` (new branch, `expandRunToken` exported for test), `send-workout-to-garmin/index.ts`, `shared/strength-system/strength-primary-plan.ts` (`hillSession`), `materialize-plan/hills-lap-button.test.ts`. Commit `a5a1f19d`.

---

### D-391 — The hard-run terrain fallback: four options for the runner, bike inferred, flat separated by preference (2026-08-06, **PUSHED + DEPLOYED; card UI device-verified, placement fixture-verified**)

**This closes [Q-260].** The strength block's ONE hard aerobic session assumed a climb the athlete can run for three minutes. Q-260 asked what the athlete without one gets, and warned that the doctrine's own `10–12 × 40 s` fallback is the WRONG answer (short/moderate intervals hold less time at VO2max — Fleckenstein 2025, the BMC time-at-VO2max meta). **The answer was not a different single session — it was a menu.**

**Bike is inferred, not asked.** `hard_day.discipline` is the athlete's own pick on the D-327 "Your one hard day" card; `bike → bikeQualitySession` (4×4 Helgerud), `run → hillSession`. "None" is legal (no hard session). So the terrain question is **run-only** and only appears when Hard day = Run.

**The runner gets four options** (menu inside the card they are already on — **no new intake question**, per `DOCTRINE-aerobic-maintenance-run-only.md` §2.0 "availability reveals itself in the choice"):

| option | session | gives up |
|---|---|---|
| 3-min hill (preselected) | `4×3 min` uphill 5–8%, lap-button descent | nothing — best of both |
| treadmill | `4×3 min` @ 5–8% incline, fixed 3-min recovery | nothing — the belt IS the grade |
| short hill | `10×1 min` uphill 4–6% | some VO2 stimulus (1-min < 3-min reps; measured) — keeps the leg discount |
| flat | `4×3 min` flat, pace target allowed (not graded) | the leg discount — keeps FULL VO2 |

⚠️ **`2×8 min @ 3–4%` was scoped and deliberately NOT built** — it folds into "short hill" as a default. Adding a fifth card re-bloats the menu we chose to keep at four.

#### The one non-obvious engine decision — flat's clearance is a PREFERENCE, not a requirement

Flat is the leg-costliest option (no uphill discount, eccentric impact retained), so Michael's call (via the Wendler lens — keep hard conditioning off heavy-leg days) was to separate it further. **First built as a hard 48 h requirement — and reverted.** The 24-shape sweep showed it could not be satisfied in most weeks, and when it couldn't, the solver bought flat its space by moving a squat next to the LONG RUN — relocating the eccentric damage rather than removing it (8/12 flat weeks breached, 11/16 breaches against the long run).

**So it became a scored preference** (`week-solver.ts` `Anchor.preferredClearance` → `preferredClearanceShortfall`):
- Scored **above `spreadPenalty`, below `breachPenalty`.** Below breach = it is structurally incapable of buying its 48 h by breaching a real clearance (breach magnitude is element 1 of the score vector). Above spread = it outranks only another preference (the heavy-to-heavy 48 h is matrix-enforced and untouched). **It trades preference for preference, never preference for law.**
- Takes the extra separation when the week allows (8/24 shapes), silently falls back to the matrix 24 h otherwise (16/24), **0 breaches on any terrain.** The clearance-at-minimum note reads the raw matrix, so a week that declined the preference says nothing.

⚠️ **`generate-run-plan` bundles the changed `week-solver` via `assign-days` → `placement/simple`.** The preferred-clearance change is inert there (only flat terrain sets it; the race path never does), but it was redeployed to avoid a stale-solver bundle.

#### Copy (commit `53e050b8`)

Effect-framed and hedged where the leg→lifting cost is an inference, firm where measured. Dropped the money metaphor ("cheap on your legs", "pays for it", "full price", "buy for less") and the flat card's treadmill nudge (a scold — treadmill is its own card directly above). Short hill names the tradeoff precisely: "hold less **VO2 stimulus**" (measured, Fleckenstein). §2.1's blanket ban on flat VO2 is back-annotated in the doctrine: §2.0 governs, the athlete owns the stated trade.

**Files:** `shared/strength-system/strength-primary-plan.ts` (session builders, `hardRunSession`), `_shared/week-solver.ts` (`preferredClearance` / `preferredClearanceShortfall`), `materialize-plan/index.ts` (`_r{n}s` recovery group on `run_vo2`, `_tm` label-only suffix), `create-goal-and-materialize-plan`, `generate-strength-plan`, `src/lib/non-race-goal-seeds.ts`, `src/components/NonRaceBuilder.tsx`, `docs/DOCTRINE-aerobic-maintenance-run-only.md`, `shared/strength-system/hard-run-terrain.test.ts` (19 fixtures). Commits `caae1283` (feature) → `9728e485` (wiring fix) → `53e050b8` (copy).

---

### D-392 — The marathon block is a PRESCRIPTION with a prerequisite, and the prerequisite is computed from the window (2026-08-06, **PUSHED + DEPLOYED, fixture-verified**)

**Supersedes the arc's opening posture from the same morning.** The first version entered the long-run row wherever the athlete actually was and stated the ceiling that produced — a 9-week beginner topped out at a **9-mile long run** and the intake said so. Honest, and not a marathon plan: nobody finishes 26.2 off a 9-mile peak. "Honest about a plan that cannot work" is a worse answer than "here is the plan that works, and here is what it assumes."

**Michael's numbers turned out to be a formula.** He specified a 28 mi/wk base and a 10-mile long run for a 9-week beginner. Those are exactly `40 / 1.1⁴` and `18 − 2×4` — the peak worked backward at the only two rates the block may use: **2 miles a week** on the long run (the rows' own biggest step) and **10% a week** on volume (his cap, held, explicitly not raised). So `marathonPrerequisiteFor` computes it per window instead of storing a pair, and his hand-named numbers became the test that the formula is the rule he was describing rather than a fit to one case.

| | peak long run | peak weekly | share | 9-week base |
|---|---|---|---|---|
| beginner | 18 | 40 | 45% | 27 mi/wk + 10 mi |
| intermediate | 20 | 50 | 40% | 34 mi/wk + 12 mi |
| advanced | 20 | 60 | 33% | 41 mi/wk + 12 mi |

⚠️ **NONE OF THOSE NUMBERS IS NEW.** 18/20/20 against 40/50/60 are `LONG_RUN_PROGRESSION`'s maxima and `WEEKLY_MILEAGE`'s peaks, and 45/40/33 are the shares `MAX_LONG_RUN_SHARE` already documents the tables as embodying. This is the tables read backward.

**Short windows quote a high base; long ones stop binding** (14wk+ bottoms out at the row's own opening, 20 mi/wk + a 6-mile long run). Below ~5 weeks the prerequisite goes **unmeetable** — it would ask the athlete to arrive with a 16-mile long run so the block can "build" them to 18 — and the plan names the half instead of pretending.

**The peak long run is capped at 20 whatever the window.** Michael: *extra weeks add volume and repeat long runs, not a longer single run.* Higdon 20, Pfitzinger 20-22, Daniels caps by TIME.

**The plan states the assumption**, in `generatePlanDescription`: *"This plan assumes you're already running about 25 miles a week with a long run around 10. If that's not where you are, do the half — this build won't be safe for you."* That sentence is what makes an 18-mile peak honest rather than reckless, and it is the whole reason the model is allowed to change.

⚠️ **THE TRADE, STATED: an athlete whose real long run is 6 is prescribed a 10 in week 1** — a 67% jump — and the only thing protecting them is that sentence. That is what a prerequisite IS. Do not remove it.

⚠️ **BEGINNER-DERIVED ONLY IN PRACTICE — see [Q-262].** The function is level-general and the rows exist for all three, but only the beginner case has been walked end to end.

Two defects surfaced by verifying the matrix, both fixed here: **the week peaked three weeks after the long run** (the ramp targeted `taperStart`, so the 18-miler landed in a 36-mile week — a 50% share against the 45% the tables are built on), and **the peak week could be a cutback week** (every-4th-week cadence vs a race-date-derived peak; an 11-week block put its 18-miler in a deloaded week that also dropped to three running days). Volume peaks with the long run now and follows it down; the peak week is struck from `recovery_weeks` once, at the source.

---

### D-393 — The long-run arc is anchored to RACE DAY, not to week 1 (2026-08-06, **PUSHED + DEPLOYED, fixture-verified**)

`LONG_RUN_PROGRESSION` was read forward from week 1, and **the row's tail IS the taper** — so any plan shorter than its row never reached it. A 9-week beginner climbed to a 10-mile long run and raced on it: the biggest long run of the block in race week, no taper anywhere.

`buildLongRunArc` (`src/lib/run-volume-tables.ts`) lands the row's final peak on the **peak week** — the last week whose long run sits **more than 14 days out** — and tapers off whatever peak was actually reached. 15 days is not a taste: `getRaceProximitySession` already clamps anything inside 14 days, so a peak landing there would be silently halved by a rule two functions away.

⚠️ **AT FULL LENGTH IT IS A NO-OP** — a 20-week marathon with no history returns the row unchanged, taper included. Pinned by a test.

**The taper caps became fractions of the peak (0.8 / 0.6).** They were flat 8 and 10 — numbers calibrated for exactly an 18-20 mile peak — and left flat they crushed the taper they were written to protect: 18 → 14 → 10 printed as 18 → 10 → 8. **There were THREE copies**, and the third (on the non-race-week path) survived the first sweep.

**The easy-run ceiling is half the long run, max 10, not a flat 6.** Six was the binding constraint the moment the peak moved: a four-day week of 18 + 3×6 tops out at 36, so a higher target could not be built and the week silently came up short.

**The peak-pivot branch is DELETED** (~70 lines of percentage arithmetic that ran *instead* of the arc for any athlete with a long run over ~13 miles on a ≤10-week plan). It was the last thing quoting a different plan than the one built: a 14-mile athlete was told 18 and built 13. Its one distinct input was `transition_mode`, which still reaches `resolveEffectiveStartVolume` where the fatigue guard lives.

---

### D-394 — The marathon timeline gate WARNS; it does not refuse (2026-08-06, **PUSHED + DEPLOYED**)

**Supersedes [D-386].** Michael: *same "warn, no wall" as the mileage floor.*

The 2026-08-04 call was *timeline, unlike mileage, is where we stop* — mileage is a judgement about a body, a race inside the floor is arithmetic. **The half that was wrong is "arithmetic":** the engine does have a plan for them. It builds to the weeks available, anchors the peak to race day, tapers into it, and states the long run it will reach. Short is a worse block, not an impossible one, and this app's posture on worse-but-chosen is to price it.

⚠️ **THAT ONLY HOLDS BECAUSE OF D-392/D-393.** The warning without the race-day anchor, the duration trim and the stated ceiling is a shrug. With them it is a priced decision.

**There were TWO walls.** `generate-run-plan/validation.ts` rejected the identical case one call later (a beginner marathon under 14 weeks came back `400 Invalid request`), so demoting only the caller would have moved the wall somewhere with worse manners. Both demoted; the four-week minimum stays an ERROR because it is what `determinePhaseStructure` can physically lay out.

**The support modes still suppress the warning** (`race_support` / `bridge_peak`, gated on evidence). **Not touched:** the triathlon path's own `race_too_close`, now the only hard timeline refusal in the file.

---

### D-395 — The athlete's SELECTED easy pace anchors every prescribed pace and duration (2026-08-06, **PUSHED + DEPLOYED**)

The VDOT ladder ran learned threshold → **5K-derived effort score** → easy pace. So an athlete with a 25:21 5K on file who had SELECTED "use my runs, 12:35" got every session written off the 5K — a number they had explicitly declined. The easy pace was last because when that rung shipped (the same morning) the question was "can we print a pace at all"; once the athlete can choose, the answer outranks the seed.

`resolveCurrentRunEasyPace` already IS the selection (Q-174 tiers). Reading it FIRST is most of the change. **One anchor, not two:** the VDOT is derived FROM the selected pace so the quality zones move with it, and the exact number travels as `easy_pace_sec_per_mi` and prints verbatim rather than round-tripping through the table.

**`milesToMinutes` is overridden on the sustainable generator.** The base class prices miles at a per-level constant (beginner 11:00/mi), so a plan printing 12:35 stored durations as though run at 11:00 — the same two-sources gap that rendered a 26.2-mile race as **21.3 miles**.

⚠️ **THE "A TIME" PATH IS UNCHANGED** — `performance_build` builds from `effort_paces`, where a race result is the right anchor for interval targets.

---

### D-396 — A plan may not outlive its race, and race day is a row on it (2026-08-06, **PUSHED + DEPLOYED**)

**The plan outlived the race.** `weeksOut` is counted from TODAY; the block opens next Monday. A race 10 weeks out landing in plan week 9 built an empty week 10 on the calendar. Trimmed by `planWeekContaining` (`_shared/planning-context.ts`); `weeksOut` itself is untouched because the timeline question and the length question are different questions.

**The race was not on the calendar.** `case 'race'` said *"don't add a training session"* and added nothing, so a completion plan ended on a Saturday shakeout. It has a row now, on the actual race weekday (not `performance-build`'s hardcoded Sunday), stating the distance and targeting no pace — this path has no goal pace by construction.

⚠️ **THE TOKEN IS THE DISTANCE, AND THAT NEEDED A FIX IN `materialize-plan`.** A time token makes distance the DERIVED quantity: 288 minutes expanded at the athlete's easy pace rendered the marathon as **21.3 miles**. The expander matched `longrun_(\d+)mi` — integers only — while the grammar has always allowed decimals (`validation.ts:312`), and every race distance is a decimal. Now `longrun_([\d.]+)mi` + `parseFloat`.

⛔ **THE DEPLOY TRAP, TWICE, AND BOTH ARE STILL OPEN:**
- `_shared/planning-context.ts` gained `planWeekContaining`. **Four other functions import that file
  and were NOT redeployed** — `coach`, `compute-snapshot`, `learn-fitness-profile`,
  `planning-context` (all last deployed 2026-08-03). The change is purely ADDITIVE and nothing else
  calls the new function, so their behaviour is identical today — but they are carrying a stale copy
  and the next person to change that file for real must redeploy all five.
- `materialize-plan` (v252) shipped for the decimal fix and **had not been deployed since well before
  this session**, so it picked up whatever else had landed on `main` in between. Its own 59 tests
  pass and the full edge suite's 10 failures are byte-identical before and after — but that is a
  wider surface than the two plan functions this session otherwise touched.

**Race week is anchors-then-fill.** `shakeout` and `easy_short` pushed with no day-count guard, so race week ran six sessions for a four-day athlete. Neither walk direction fixes it (forward drops the shakeout; backward breaks the week before). The shakeout and the Sunday long run are ANCHORS and claim their slots first; race day is exempt from the count.

---

### D-397 — The intake's own answers reach the engine: day count, strength "none", typed long run (2026-08-06, **PUSHED + DEPLOYED**)

Three separate "collected, stored, never read" defects on the marathon path.

**The day count was the band's MIN.** `create-goal` built `${n}-${n+1}` and `getRunningDaysForWeek` takes the band's MAX on build weeks — so 4 came back as 5 runs a week, all block. Anchored at the max now (`${n-1}-${n}`): build weeks get the number picked, cutbacks one fewer. **Two silent 400s died with it** — 7 days built `'7-8'` (not a legal string) and 6 days built `'6-7'`, which `sustainable` does not support, so the top option on the app's most common race goal could not build a plan at all.

**"None" for strength shipped two lifting days.** No single file was wrong; the answer was reconstituted three steps downstream. The card writes `posture.strength = 'out'` and correctly sends no protocol → `assemblePayload` sent `develop ? 4 : 2` (out is not develop, so 2) → `arc-setup-persistence` sees a non-zero frequency and WRITES a protocol into the goal row → `create-goal:3761` gates the whole overlay on that field. One helper now: develop 4, maintain 2, **out or unset 0** — and 0 was already the language the persistence layer spoke.

**The tier seed beat ingested volume, and the typed long run was dropped.** `target_weekly_miles` always arrives populated (the level button seeds it), so the engine took the LEVEL BUTTON's number over everything ingested. Equality with `TIER_SEEDS` now marks it a prefill, and it loses to ingested volume **when that is higher** — one-directional because `weeklyMiles` is `workload/10`, a proxy that under-reports easy running by roughly a third. `recent_long_run_miles` from `training_prefs` is read at all for the first time.

---

### D-398 — The intake week card: the week drawn once, the questions under it (2026-08-06, **PUSHED, NOT device-verified**)

> **⤳ CONTINUED 2026-08-07 — see [D-399].** The card was restructured further: run days are now
> read-only **"Auto"** (only the long run and the standing session are tappable), the card sits ABOVE
> the day row, the run/ride club toggle is inline, and **"Club night" → "Standing session"**. The
> per-day role FILL described below is superseded — the pills now pin only the long run and the
> standing session (`weekRoles` gets `trainingDays: []`). The mode-then-target pattern and the four
> rejected layouts below still stand; everything below is history.

Michael iterated this on device until ~10:30pm and **four layouts were built and rejected**. Recorded so nobody rebuilds one:

| built | rejected because |
|---|---|
| three separate cards (days / long run / club) | *"ONE FUCKING CARD"* — a screen per question, two thirds of the phone empty under each |
| one card, questions advancing on a Next tap | it arrived BLANK and asked one question at a time — a form, not a week |
| one card, three chip rows visible at once | the week is drawn three times; it reads as three weeks |
| seven rows, tap a day to cycle its role | rejected before build — the cycle is a hidden affordance |

⚠️ **AND REST IS THE REMAINDER, NOT A QUESTION.** A fourth question ("which days are full rest?")
was built and reverted within the hour — Michael: *"REST WILL BE WHATS LEFT."* The argument FOR it is
recorded because it is not silly and will be re-made: the leftovers are not all rest, since a
strength session lands on one of them, so an `R` on a non-running day promises a day off the plan
then fills. He heard it and chose the simpler week. `rest_days` reached `buildPreferredDays` and
`assign-days.ts` in that build and was reverted out of both; do not re-add either without asking.

**What he landed on:** the week drawn ONCE; the three questions listed under it with their current answers; **pick a question, then tap the days.** That is the alarm-repeat / calendar-label pattern (mode-then-target). The run apps all repeat a day picker per question, one screen each — the version he rejected first.

- **The week arrives laid out** (5 days, long run Sunday — what the plan builds anyway when nothing is pinned). ⚠️ This overrides the 2026-07-29 no-prefill rule *only here*: that rule was written against controls arriving ANSWERED and hiding the question; a blank week reads as a broken screen.
- **Fill carries the day's ROLE, a ring carries what you are editing.** Crossed at first — the fill marked the active question, so selecting "Club night" with none set blanked the whole row.
- **Every day is tappable on every question.** Greying out non-run days meant an athlete whose long run is Saturday tapped Saturday and got nothing; picking a rest day now adds it as a run day and assigns it.
- **The gate states itself** — four run days and a long-run day are required (both structural), and the disabled button now says which is missing.
- Roles: **R rest · E easy · LR long run · C club night**, derived once in `week-budget.ts` (`weekDayRoles`), pinned by six tests. `C` is deliberate over `H`/`E`: it names the athlete's commitment rather than classifying the session, so it cannot contradict the plan whichever way the hard/easy answer goes.

---

### D-399 — The non-race builder is ONE themed instrument: the "digital galaxy" visual language + a discipline-driven accent (2026-08-07, **PUSHED, NOT device-verified**)

The wizard was generic teal — Michael: *"generic 8 sleep wellness crap"*. It is now the "digital
galaxy": a deep-space frame under an accent that is **driven by the discipline/goal, not hand-picked
per screen.** The whole point is that `NonRaceBuilder` + `StepLayout` are ONE frame — theme the frame
once and every step (marathon, Strong Focus, and every future non-race path) inherits it.

**The system lives in exactly three places — do not scatter it (full recipe: `docs/REFERENCE-wizard-visual-language.md`):**
1. `src/components/wizard/StepLayout.tsx` — the `accent?: string` prop → `A = var(--wiz-accent-rgb, <UNIVERSAL_RGB>)`; drives the instrument-key CTA, the progress bar, the commit-step shimmer.
2. `src/index.css` — `.wizard-galaxy` + `::before`/`::after` (nebula / light / stars / grain), the nav-lock (`body.wizard-active`), `.wizard-key-shine`.
3. `--wiz-accent-rgb` set on the wizard root in `NonRaceBuilder.tsx`, read from `SPORT_COLORS` (`context-utils.ts`) via `getDisciplineColorRgb()`. **Never a literal hex.**

**The rules that came out of it:**
- **Accent = the leading discipline, else the goal's own colour.** `wizAccent = state.discipline ?? (goal === 'marathon' ? 'run' : goal === 'get_stronger' ? 'strength' : undefined)`. The `get_stronger` fallback was the whole Strong Focus fix — `state.discipline` is never `'strength'` on that path, so without it the entire flow rendered on the off-white universal accent while marathon (run/gold) did not. run=gold, strength=amber.
- **A sport SELECTOR carries its own sport colour; the block chrome carries the accent.** On the Strong Focus scheduler the Run/Ride hard-day toggle + Runs/Rides count chips are gold/green (the app's multisport wayfinding language, the same pattern the marathon club toggle uses); the block itself stays amber. It is identity, not a cost signal — the §5 note against implying a hard ride is "cheaper" than a hard run is about COPY, and no number here claims one.
- **Sigils, not borrowed icons.** The Train entry card was literally the run discipline icon (`Activity`) → **`Gauge`** (the live card is `GoalsScreen.tsx:2394`; NonRaceBuilder's `ENTRY_COPY` is a decoy, kept in sync). The Focus heading (`GoalsScreen.tsx`) now wears the `eye-mark` sigil like the Focus tab + the wizard step titles, instead of being the one Focus surface without it.

Client-only, Netlify. Marathon layer commit `a2d772ee`; Strong Focus `749c2072`; sigils in the docs commit. **Preview-verified, NOT device-verified.**

---

### D-400 — `LOWER_HYPERTROPHY` is a registered intent, and the placement predicates are TOTAL (2026-08-07, **PUSHED + DEPLOYED**)

"Keep it heavy" (`neural_speed`) emits `LOWER_HYPERTROPHY` (`performance-neural.ts:162`, formerly
`as any`). That intent was **not in `INTENT_DEFS`**, so `isLowerIntent`/`isUpperIntent` did
`INTENT_DEFS[intent].category` on `undefined` and threw `Cannot read properties of undefined (reading
'category')` — the WHOLE plan build crashed (arc-preview → `create-goal-and-materialize-plan`).

The fix, and the invariant: **register the intent** (`intent-taxonomy.ts` — added to the
`StrengthIntent` union + an `INTENT_DEFS` entry: lower, repRange [8,12], intensity [65,75],
avoidWithinHoursOf {LONG:48, QUALITY:24}), **drop the `as any`, and make the predicates total** —
`INTENT_DEFS[intent]?.category === 'lower'`. A placement predicate over a taxonomy must degrade to
`false`, never throw, or one unregistered intent takes down the entire generator.

Deployed to all **7 strength bundlers** (the `_shared` trap): `create-goal-and-materialize-plan`,
`generate-combined-plan`, `generate-run-plan`, `generate-strength-plan`, `generate-triathlon-plan`,
`materialize-plan`, `rematerialize-strength-block`. Commit `a2d772ee`. **This is Task 1 of
`HANDOFF-placement-unification-2026-08-07.md` — done.**

---

### D-401 — Placement is the OPTIMIZER's, in every generator; the count stays the caller's (2026-08-07, **IN WORKING TREE — not committed, not pushed, not deployed**)

Task 2 of `HANDOFF-placement-unification-2026-08-07.md`. The handoff asked for
`strength-system/placement` (`simplePlacementPolicy`) to be adopted inside `generate-combined-plan`.
**Rejected, and reversed:** that module is a hardcoded Hal Higdon / Jack Daniels weekday grid
(`placement/simple.ts` says so in its own header), so adopting it would install a SECOND
day-authority — which the handoff's own constraint, and CLAUDE.md, forbid. Combined-plan already
uses the sole authority. Unification therefore runs the other way: toward `_shared/week-optimizer.ts`.

**What was actually broken** (the handoff's causal claim did not survive the trace — see [Q-268]):

1. `generate-combined-plan/week-builder.ts` placed the second easy run of a run-only plan on a
   literal `grid.get('Thursday')`. No optimizer, no dispersion, no check of what was already on the
   day. Whenever the optimizer put the quality run on Thursday — the common case — the athlete got
   intervals **and** an easy run on the same day; when `run_easy_day` also resolved to Thursday, two
   easy runs stacked on it. A 640-config sweep over full plan length hit it in **13,440 of 30,720
   generated weeks**. After: **0**.
2. `generate-triathlon-plan` laid out every standalone tri plan from a literal table with no
   long-run guard at all. `strength_1` is the LOWER slot (sessionIndex 0) and sat on Monday whatever
   day the long run was — **the one live generator where lower-on-long-run was genuinely reachable.**
3. When the optimizer REFUSED a strength slot (no legal lower day — e.g. a Monday long run, where
   48h-pre blocks Sunday and the long run blocks Monday), the tri generator read the partial answer,
   found the slot unset, and fell back to the literal Monday. **The guard produced the right answer
   and the default overrode it.** A refusal now reduces the session count instead.

**The rule established: the optimizer owns WHICH DAY, the caller owns HOW MANY.** New
`preferences.easy_run_count` (default 1 → every existing caller byte-identical) and
`preferred_days.easy_run_extra`. The count still comes from the builder, so run volume did not move:
of the weeks whose run count fell, **every single one was explained by deleting a stacked session —
zero unexplained losses** (measured, not asserted).

Also: **dispersion is discipline-generic now.** `easyRunAnchorAdjacencyPenalty` was run-only, so easy
bike/swim work was placed first-available with no spacing term; it is now
`easyAnchorAdjacencyPenalty(day, qualityDay, longDay)` with the run version delegating, applied to
easy_bike as well. And the load balancer may no longer stack two sessions of the SAME kind on one day
— the same-day matrix has nothing to say about `easy_run × easy_run`, so once a week carried two, the
balancer consolidated both onto one day and the rest-budget pass then cleared the day and dropped
BOTH ("displaced easy_run + easy_run").

Science: the RULES are cited, the weights are ours. Seiler polarized/80-20 → spread the easy days so
the hard days can be hard. Hickson 1980 concurrent-training interference → lower-body strength clear
of the long run. Bowerman → Daniels hard-easy → the adjacency penalty. The `+4`/`+8` literals are
tuning params, uncited, and labelled as such in code.

Regression locks: `generate-combined-plan/easy-session-placement.test.ts` (bug case + 640-config
sweep + "the builder names no run day of its own"), `generate-triathlon-plan/slot-placement.test.ts`
(every long-run weekday; pin-on-long-run refused; refusal reduces count).

⚠️ Touches `_shared/week-optimizer.ts` — **the `_shared` deploy trap applies.** Not yet deployed.

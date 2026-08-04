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

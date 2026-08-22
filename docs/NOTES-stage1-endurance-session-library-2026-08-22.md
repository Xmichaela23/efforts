# Stage 1 — the endurance session library

**2026-08-22 · the first stage of the Standing Plan build.**
Work order: `WORKORDER-the-standing-plan-2026-08-22.md` stage 1. Design: `DECISIONS-2026-08-21-standing-plan.md`.
Source: `SOURCE-viada-hybrid-athlete.md` Part D, read against the page images at
`~/Efforts_Local_Folder/book-sources/viada-hybrid-athlete/` (pp.229–241 opened, not just the transcription).

## STATE — three ways

| | |
|---|---|
| **pushed** | **NO.** Nothing committed. One new untracked directory; no existing file touched. |
| **deployed** | **NO.** Nothing deployed. |
| **verified on a device** | **NO.** Nothing in this stage is athlete-visible — the first stage an athlete could notice is 5. |

**What IS proven:** 28 tests green, 30 of 30 mutations killed by their intended test, and the module
builds and runs from a client entry point through this repo's own Vite (below).

---

## What shipped

`supabase/functions/_shared/endurance-library/` — five files, one new directory, nothing else edited.

| file | what |
|---|---|
| `types.ts` | the session model — steps, blocks, targets, totals, notes |
| `source-rules.ts` | every sourced constant, page-cited: intensity bands, rep bands, warm-ups, floors, caps, the computed dose bands |
| `anchors.ts` | the athlete's numbers, read through the resolvers that already own them |
| `generate.ts` | the generator, plus `sessionDurationBandSeconds` — the slot floor and cap the wizard needs |
| `endurance-library.test.ts` | the gate |

**Thirteen families × three levels, 32 structural shapes**, all reachable:

- run — sprint/power, MLSS, near-threshold, VT1, LSD
- ride — sprints, anaerobic, VO2, sweet spot, endurance
- swim — endurance, speed, open water

⛔ **It lives under `_shared`, not beside `wendler-531.ts`, and that was forced.** The `@shared`
alias points at `supabase/functions/_shared`; `wendler-531.ts` is at `supabase/functions/shared/…`,
which the client alias cannot see. A library the wizard has to run could not go there.

---

## ⛔ GENERATE, NOT TRANSCRIBE — how the line was drawn

**What is in the code:** intensity bands, rep-length bands, rep-count bands, work-to-rest rules,
recovery rules, warm-up and cooldown blocks, floors and caps, and **two computed scalars per family
per level** (the work-volume band). All page-cited.

**What is NOT in the code:** a single one of his workouts. There is no table of intervals and no
stored pace, wattage or swim time anywhere. Two tests hold that line — one proves the output moves
with the athlete, one proves there is no table to move away from — and both were mutation-tested.

**Why the dose bands are not a transcription:** two numbers per family per level do not reconstruct
one of his sessions. They set the size dial, which §3c and §3d require ("the longest option in every
slot"). The arithmetic behind them is below so it can be argued with.

---

## ⚠️ The two gaps the work order named, and how each was closed

### Gap #2 — session totals are not stated

**Every total in this library is computed and says so at the site.** `SessionTotals.basis` is the
literal string `'computed'`, and a note saying it reaches the athlete on every session.

Two honesty flags travel with it:

- `openRecoveryCount` — how many "full recovery" gaps the page leaves untimed. **Nothing fills them in.**
- `isLowerBound` — true when the session contains untimed recovery, or a clock derived from distance
  and the athlete's own pace. The note then reads "at least this long", never "=".

⚠️ **The sprint families are almost entirely lower bound.** A running sprint session clocks 13–14
minutes with four to six untimed full recoveries; the real session is considerably longer and the
book does not say by how much. That is reported, not guessed.

### Gap #6 — the cycling percentage basis is an inference

`PERCENT_BASIS.ride.stated === false`, and **every ride session carries the inference note on its
face.** p229 states the running convention; p236 states nothing. Held by a test that also checks no
run session borrows the label.

---

## The dose derivation (gap #2's arithmetic)

Work = time (or distance) at or above the family's own intensity floor. Recoveries, floats below the
floor, warm-ups and cooldowns excluded — the generator sizes those from his stated recovery rules.
Computed from each level's full option set; the band is the shortest and longest option.

| family | L1 | L2 | L3 | unit |
|---|---|---|---|---|
| run sprint/power | 400–1800 | 200–1600 | 200–1600 | m |
| run MLSS | 360–720 | 480–1140 | 720–2280 | s |
| run near-threshold | 600–1800 | 960–2640 | 1200–3960 | s |
| run VT1 | 1500–1800 | 2700–3600 | 4800–5400 | s (**stated**, p235) |
| run LSD | 2100–5400 | 4080–9000 | 6240–18000 | s (whole session) |
| ride sprints | 240–540 | 300–900 | 60–1080 | s |
| ride anaerobic | 270–600 | 360–840 | 480–1260 | s |
| ride VO2 | 600–1080 | 960–1440 | 1280–1800 | s |
| ride sweet spot | 1080–2700 | 1440–3600 | 1920–3600 | s |
| ride endurance | 3600–6000 | 7800–12600 | 10800–18000 | s (**stated**, p239) |
| swim endurance | 1550 | 2300–2500 | 3800–4200 | m |
| swim speed | 1400 | 2300 | 2600 | m |
| swim open water | 810 | 1200 | 2400 | s |

⚠️ **Two bands are not monotone in the level, and that is a fact about his sprint work rather than an
error.** Running sprint peaks at level 1; cycling sprint reaches its shortest option at level 3.
Sprint work is neurally capped, so a higher level buys more options and more complex starts, not more
metres. The level-ladder test excludes both families for that reason and says so.

⚠️ **Near-threshold bands the TIME-based subset of his options, deliberately.** It is the one family
mixing time and distance. Evaluated across thresholds from 6:00/mi to 12:00/mi, his distance options
land inside this band for anyone at roughly 9:00/mi or faster, and above it for slower athletes,
where the tempo crossover and the session cap take over. Banding on the distance options would make
the same level mean a different dose for two athletes.

**Three smaller computed scalars, same method:**

- `insertShare` — what fraction of a with-inserts session the inserted efforts take. LSD 0.11 (his
  8%, 12%, 13%); LSD fartlek 0.19 (his 20%, 18%); ride endurance 0.29 (his 24%, 31%, 33%).
- `SWIM_OPENER_SHARE = 0.15` — the drill opener's share of a pool session. His six pool sessions:
  22.6%, 21.7%, 14.3%, 14.3%, 8.7%, 7.7%. Mean 14.9%.
- `repsBand` per shape — the shortest and longest rep count across his own options for that shape.

**Cross-check against §3d's published envelope**, which was computed independently in the decisions
doc: MLSS L2 built 41 min against §3d's 35–50 ✓ · Cyc AnA L1 built 48 min against 35–70 ✓ ·
Cyc endurance L1 built 80 min against 60–100 ✓ · LSD L2 built 109 min against 60–150 ✓.
NT L2 builds 39 min at its default shape against §3d's 50–65 — **below**, because the default shape is
his shortest near-threshold option; the slot's band across all its shapes is 35–72 min.

---

## ⚠️ FOUR PLACES WHERE HIS OWN CHAPTERS DISAGREE, AND WHICH ONE WON

Every one of these is a choice between two of his statements. None of them is an invented number.

### 1. Threshold rest — Ch.4's 4:1 versus Ch.9's tables

Ch.4: *"4:1 work-to-rest; rest between 30s and 2 min even for 8–15-min intervals."*
Ch.9 (p233): *"4 × 1200m @ 90% with rest equal to 50% of the run"* — 2:1.

**Ch.4 won**, because a generator needs a rule and Ch.4 is where he states rules.
⚠️ **The consequence is real and it is stated at the site: our near-threshold sessions rest LESS than
the ones printed on pp233–234.**

⛔ **AND A FINDING WORTH KEEPING: the 4:1 arithmetic never actually binds.** His above-threshold
repeats are 60–90 seconds, so work/4 is 15–22 seconds — under his own 30-second floor, every time.
**The 30-second floor governs every threshold recovery this library builds, and the resulting ratio
is nearer 2:1 than 4:1.** The test asserts the rule with literal numbers and says this out loud;
asserting "ratio ≥ 4" would have been asserting something he did not say.

### 2. The 2h easy-work cap versus his own long sessions

Ch.4: *"rarely more than 2h of VT1 in one session."*
p235: a level 3 LSD hike runs *"3-plus hours (up to 5 hours for ultrarunners)"*.
p239: cycling endurance is 2.5–3.5h at level 2 and 3.5–5h at level 3.

**The cap binds; the hike and the endurance ride are exempt on HIS authority.** Where he prescribes a
specific longer session by name, the specific prescription wins and **the session carries a note
saying the general guidance was exceeded** — rather than the library silently clipping a five-hour
ride to two hours and telling the athlete nothing.

⚠️ **And where the cap does bind, it binds the BOUT, not the session.** An LSD run whose steady
portion is clipped to two hours still carries its inserted sets on top.

### 3. The 15-minute tempo crossover versus his 20-minute sweet-spot block

Ch.4: *"intervals over 15 min become tempo/single efforts."*
p239: *"3 rounds of 20 minutes @ 80%."*

**It is a reclassification, not a ceiling.** Reading it as a ceiling deleted his own session — and
the level-ladder assertion caught it: a level 3 sweet-spot session carried exactly as much work as
level 1, because both had been clipped to the same fifteen minutes. The clamp now binds work **at or
above threshold**; a longer sub-threshold block survives and is labelled a tempo effort, which is
what Ch.4 says it becomes.

### 4. The swim session ceiling

p240 states level 3 swims are *"1.5-hour sessions"* — the only stated swim duration on either page.
A pool session is prescribed in metres and its clock is entirely the athlete's own pace, so a
10-minutes-per-100 m swimmer was being handed a seven-hour level 3 session.

**No swim session now exceeds 90 minutes, and it is the DISTANCE that comes down** — p240:
*"changes to distances and interval length can be modified tremendously."* The athlete is told.
⚠️ Applying level 3's stated figure to levels 1 and 2 is a deduction from his sentence (level 3 is
the hardest, so nothing below it should run longer), not a separate ceiling someone picked.

---

## The anchors — no new resolver, and no invented number

| fact | owner, called from `anchors.ts` |
|---|---|
| run threshold pace | `src/lib/resolve-current-run-pace.ts` → `resolveCurrentRunThresholdPace` |
| run VT1 / easy pace | same file → `resolveCurrentRunEasyPace` |
| FTP | `src/lib/resolve-current-ftp.ts` → `resolveCurrentFtp` |
| swim pace | `_shared/planning-context.ts` → `swimSecPer100YdFromArcSwimInputs` |

**VT1 resolves to the athlete's measured easy pace**, and that is sourced rather than chosen: Ch.4's
zone table puts the top of zone 2 AT VT1 by the talk test, and p235 says the exact percentage of
threshold at VT1 moves with fatigue, hydration and conditions.

**Ride VT1 resolves to below 75% of threshold power** — p239's own ceiling for an easy ride — rather
than to a fraction someone picked. An easy SPIN stays unresolved: no cycling page prescribes a power
for one, and this library does not borrow the app's own warm-up convention to fill the gap.

⛔ **When a resolver says it does not know, nothing is invented.** Every step carries either a
resolved target or a sentence saying why it has none. Never 540, never 600. Held by a test that walks
every step of every family with no baselines at all and asserts no number appears anywhere.

---

## ⛔ CLIENT-REACHABLE — proven, not assumed

Two proofs, and they hold different things.

**1. It builds and RUNS through this repo's own Vite.** A client entry importing
`@shared/endurance-library/index.ts`, built with vite 5.4.21 and the repo's real aliases: **11 modules
transformed, 65 kB, executed successfully.** It built all 13 families × 3 levels, summed the longest
option in every slot (the size cap the wizard needs), and resolved an MLSS surge to 323–336 s/mi from
a 420 s/mi threshold. Also cross-checked with a plain esbuild bundle. ⚠️ The probe config was
temporary and has been removed; **this proof is a thing that was RUN, not a thing that is watched.**

**2. A source lint holds what a lint can hold** — no `Deno.`, no `https:` imports, no supabase
client, no `process.env`, and every import resolving inside the two directories the client alias can
see. The lint's own comment says it cannot prove the bundler resolves the module and does not pretend
to.

⚠️ **One thing to know about the dependency:** the swim anchor comes from `planning-context.ts`,
which pulls a type-only import of `arc-context.ts`. Type imports are erased, the bundle is 65 kB, and
nothing supabase-shaped survives — but it is why the module is not two files. A pre-existing type
error in `state-trend/assemble.ts:1134` shows up on `deno check` through that chain; it is on `main`
already and is not this stage's.

---

## The gate

**28 tests. `deno test --no-check --allow-read supabase/functions/_shared/endurance-library/`.**

Across every family × level × archetype × five sizes, plus **300 generated athlete shapes** (run
threshold 4:00–16:00/mi, FTP 90–420 W, swim 60–240 s/100 m) and 11 degenerate ones (no baselines,
null, empty, single-sport, zero, negative, string-typed, absurd both ways):

- **duration** — every total computed, positive, finite, and honest about being a lower bound
- **the size dial** — moves, and never backwards, on every shape
- **the level** — moves the DOSE up, strictly across the full ladder
- **the slot band** — brackets every session the slot can build, at every size and every shape
- **work-to-rest** — Ch.4's rule asserted with literal numbers; every repeated effort has something
  between the reps unless the source says it has none
- **the floors and caps** — the 10-minute bout floor, the 2h cap and its two exemptions, and the
  15-minute crossover, each tested directly AND across the sweep
- **the anchors** — no invented number, the prescription is a function of this athlete, and the
  percentages point the right way
- **what every session must say** — the inference label on every ride, the cardiac-drift rule on
  every easy and long session, the mandated safety kit on level 3 open water
- **nothing degenerates** — no NaN, no negative, no infinite, no zero-rep block, no 200-rep block

⛔ **The 61-shape sweep is blind to all of it** — it is a regression net over a plan type that does
not exist yet, and stage 6 proved it is a net rather than a detector even where it does apply.

### ⚠️ Mutation testing: 30 mutations, 30 killed by their intended test

Harness: back up the module, break one thing, run the gate, confirm the NAMED test fails, restore.

**Five mutations initially survived or were caught by the wrong test. All five were real defects in
the tests, and all five are fixed:**

| what survived | why | fix |
|---|---|---|
| the 30-second rest floor moved to 45 | the test asserted `=== THRESHOLD_REST_MIN_SECONDS` — both sides moved together | literal 30, plus the constants pinned |
| 4:1 became 2:1 | same tautology in the rule test | expectation written out as `clamp(w/4, 30, 120)` in literals |
| the level dial went flat | the ladder asserted `>=`, so every level coming out equal passed | the full ladder step is now strict |
| the 10-minute bout floor was deleted | **no built session ever reaches it** — his shortest stated easy session is a 25-minute VT1 run | the bound is exported and tested directly |
| the drift figure became 10% | the test looked for "5%", which still appeared in the sentence's tail | both clauses asserted, and "drifted 10%" asserted absent |

A sixth surfaced on the re-run: the tempo crossover clamp had no subject either — no shape prescribes
an above-threshold rep long enough to reach fifteen minutes — so it is exported and tested directly
as well.

⚠️ **Two of those are worth remembering beyond this stage: a test that recomputes its expectation
from the constant it is checking can never fail, and a rule with no subject in the built space cannot
be tested through the built space.** Both are exactly the failure mode that let three test files pass
on 2026-08-19 with the code they covered deleted.

Harness at `<scratchpad>/mutate.py`; it is not in the repo, but every mutation it applies is listed
in it and it restores the tree on any exit path.

---

## What is NOT done, and what stage 2 should know

- ⚠️ **Nothing calls this yet.** It is a loading module with no consumer — deliberately, per the work
  order. Stage 4's composer is its first caller.
- ⚠️ **The `race_pace` intensity never resolves.** LSD's race-pace finish and the swim long repeats
  carry the label and no number, because no anchor in this library knows the athlete's race. If a
  goal race is in scope for the composer, that is where it gets filled in.
- ⚠️ **`archetypesFor(family, level)` is the size dial's raw material**, and stage 5 will need to
  decide which shape an athlete gets. Gap #5 of the twelve — *"which of the 3–4 workouts inside a
  slot to use"* — is still open and still blocks stage 5.
- **Gaps #4 and #12 remain unanswered and are Michael's** — block length and when the taper column
  fires, and how often to re-estimate threshold. Neither is touched here.
- **No thirteenth gap was found.** The four chapter-versus-chapter conflicts above are disagreements
  between two of his own statements, not silences.

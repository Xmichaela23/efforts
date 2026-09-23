# WORKORDER — the Run programs (2026-09-23)

**Owner:** the PM chat reviews each stage before it is pushed. **One stage per terminal session.** Read the
`🧭 NEXT SESSION — START HERE` banner in `ENGINE-STATE.md` first; it says what already shipped so nothing is rebuilt.

**The Run screen today** (`setup-copy.ts` `RUN_SECTIONS`, five sections, tap to open):
Get stronger (Strength Lead = p246, Run Lead = p250) · Build muscle (empty) · Race (Marathon) · Trails (empty) · Get faster (empty).

**Rules for every stage**
- The book is the only source. Transcribe the two pages into `docs/SOURCE-viada-hybrid-athlete.md` (a new Part, like
  Part E3 for p250–251) before building. Page photos: `~/Efforts_Local_Folder/book-sources/viada-hybrid-athlete/`.
- A frame is a `FrameDay[]` pair (standard + taper) in `_shared/standing-plan/frames.ts`, plus a `FRAMES` entry,
  `RATE_ANCHOR`, `PICK_KEYS_BY_FRAME`, `setup-readout.ts` `build_focus`, `frame-resolver.ts`, `focusFromBody`,
  `create-goal` forwarding, and the client's `FOCUS_FRAME` / `PROGRAM_COPY` / `RUN_SECTIONS`. `strength_half` (commit
  `57581b10f`) is the worked example — copy its shape.
- Tests: `frame-rules.test.ts` must pass for the new frame (every tested lift is loaded; something presses overhead);
  the fast suites; `builder-answers-sweep` + `fuzz-builder`; a combo sweep of the new frame (long day × hard picks ×
  one day off, see the 2026-09-23 chat's `_hc` probe: no session on a day off, every pick honoured, run count right).
- Words: every card line, screen line and note is printed for Michael's yes BEFORE `--write-book-pins`. The check
  `node scripts/check-estimate-provenance.mjs --fail-only` must exit 0 (link `node_modules` first) before any push.
- Deploy every importer of a changed `_shared` file (`docs/INVENTORY.md` rows) from a clean worktree; the phone build
  (`npm run ios`, xcodebuild, `devicectl install`) needs the phone reachable.

---

## Stage 0 — Run Lead's long run builds only in 7-minute jumps

**✅ DONE 2026-09-23 — `07e63fdff`.** Every minute 105–134 builds within half a minute; chips 105 / 120 / 134 (1h45 / 2h / 2h14; 135 cannot build).

**Symptom:** asking the level-3 long run (`run_lsd`, `long_with_inserts`, 3 sets) for 105 min builds 111; 106 → 117;
107 → 124; 108 → 131; 109 and up → 134. Level 2 builds to the minute (68…100). So Run Lead's chips are 1h44 / 1h57 /
2h11 instead of 1h45 / 2h / 2h15.
**Where to look:** `endurance-library/generate.ts` `buildPrintedLongRun` (easy pieces = `easyTotal / (count + 1)`, then
`step()` → a `longrun_NNmin_easypace` token — the pieces round to whole minutes ×4) and `volume-bounds.ts`
`rungForMinutes` / `ladderOf` (the ladder assumes minutes grow linearly with size across 104–134; the build does not).
**Done when:** any minute in the level-3 band builds within ±1 min; then set `strength_half.runStrengthWeek.longRunChips`
to `[105, 120, 135]` (or the nearest buildable) and re-run `run-strength-lengths.test.ts` + the Run Lead combo sweep.

## Stage 1 — Build muscle: Strength Lead + Muscle (p244–245) and Run Lead + Muscle (p252–253)

**Frames:** `hyp_5k` (p244) and `hyp_half` (p252). Read both pages off the photos and transcribe first.
- p244 week: 4 lifting days (upper push / lower hinge / upper pull / lower push), 5–6 cells each, HYP supersets
  ("2 × HYP: focused push/pull (arms) superset", "braced hinge / braced lower push superset"); day 1 opens on
  "1 × ME: Secondary push"; lower days end with a braced DE or SKILL asymmetrical push (p245 names single-leg press,
  belt squat, split squats). Running: day 1 = sprint/power (level 1) + MLSS+ (level 1) as ONE session (p245: ~45–50 min
  total, cooldown of the first and warm-up of the second removed); NT level 3; VT1 level 1; LSD level 2; day 7 rest.
- p252 week: day 1 lower hinge with MLSS+ (1) + VT1 (2) (p253: the MLSS+ flows into the VT1 as its cooldown);
  day 2 upper push; day 3 Plyo ×2 + NT (2); day 4 upper pull + VT1 (2); day 5 lower push; LSD (3) + VT1 (1) on
  days 6/7 as p250 (see Part E3's reading note); no rest day. Two upper days one day apart (p253 says so).
- Rates: p245 "1 percent every 3 weeks"; p253 gives no rate — record the gap, use the frame's own (ours) with a note.
- Supersets are NOT structural yet (see `ALL_ROUNDER_STANDARD`'s note) — transcribe as adjacent slots, same as p274.
- New vocabulary to check before building: "Secondary push/pull" as an ME/DE competition-slot substitute
  (`swapSecondaries` on the All Rounder is the precedent); "focused hamstring / focused quadriceps"; the combined
  sprint + MLSS+ session on p244 day 1 (no existing slot builds two families as one row — smallest honest build:
  two rows on the day, tagged as one, and say so).
- Cards (words for Michael): section Build muscle → "Strength Lead + Muscle", "Run Lead + Muscle". p245: "first
  program", "athletes of most levels"; p253: "a solid strength background", "can be run almost indefinitely".
- Runs screen: hours are what the built week comes to (~4h for p244; measure p252).

## Stage 2 — Race: Half marathon (p250–251 + the taper)

- The Run Lead week, built back from a race date: the deload column 2 weeks out is NOT what p251 says — p251 says
  4–5 weeks out from a MEET run the deload RUNNING portion unless a race is within 6 weeks; for the RACE itself the
  book gives the NT-at-race-pace rule (p247 shape, "within six weeks of a race … race pace, recovery +25%") and the
  half-marathon NT band 92–97%. Read p251 again before deciding the taper; write the reading down.
- The Race section already routes Marathon to the existing marathon builder (`generate-run-plan`). Half marathon
  should be a standing-plan build with a date, not a second generator — check `taper_weeks` and `race` handling in
  `generate-strength-plan` / `plan-row.ts` before adding anything.
- Words: the Race section's Half marathon card.

## Stage 3 — Trails: Strength + Ultramarathon (p254–256)

- Read p254 (the table) — not yet transcribed. p255: reduced lifting ("running strength"), hill-focused MLSS/NT
  intervals when terrain demands (uphill work / downhill later), long "strategy sessions" in race kit with fuelling;
  p256 not yet read. New endurance families or archetypes are likely (hill repeats, strategy session) — check
  `endurance-library/source-rules.ts` for what exists before adding.
- Words: the Trails section's card.

## Stage 4 — Get faster: The Runner: Pivot (p258–259) and The Speed Solution: Pivot (p276–277)

- Both are pivots: running-first, lifting in support; the Speed Solution is 4–6 weeks and "highly experienced runners
  may regress aerobically if they stay longer" (Part E0). A block with an END is new for the standing-plan builder —
  `weeks` is already an argument; check how a fixed length and the "then switch back" rule can be stated.
- Read all four pages first; neither is transcribed.

## Out of scope here
- The marathon generator (`generate-run-plan`) — the Race card only points at it.
- Ride plans and the All Rounder.
- Supersets as structure, the hypertrophy dosing beyond what `HYP` slots already do.

# Book-language fix — strength half (2026-09-18)

Branch `blf/strength` (worktree `/Users/michaelambp/efforts-blf-strength`), off `2ca43c8d`. Plan:
`docs/AUDIT-book-language-2026-09-18.md` (Appendix A, section 2 items 1–11, the strength rows of section 3).
Committed, **not pushed, not deployed, not verified on a device.**

| pass | commit | what |
|---|---|---|
| 1 | `2e48e2739` | one source for each strength prescription (section 2, items 1–11) |
| 2 | `241a3d225` | OFF lines corrected to the page's words |
| 3 | `de27b04bd` | lines on no page removed |
| 4 | `c4d3a048a` | section 3 strength items |
| 5 | `1f24f2d6d` | reverse check: what the book gives that no screen showed |

**The word rule as applied.** Book words = text inside quotation marks in `docs/SOURCE-viada-hybrid-athlete.md`,
or the photos `book-sources/p210–p215`. SOURCE tables and summaries gave numbers only. One exception, stated
where it is made: the carry row (below) prints p226's cell, read off the page photo in the local page folder,
because the plan names that exact fix and a carry row with no words would render as a barbell SKILL row.

**Where each prescription now lives (one owner each).**
- ME / DE / SKILL / HYP line, reserve band, rest rule, set rule → `supabase/functions/_shared/strength-grid/intents.ts` (`intentLine`, `rirBandText`, `restRuleFor`, `SETS_START_LOW_LINE`).
- Reserve formatter, row line, superset label, Done seed → `supabase/functions/_shared/strength/strength-display-lines.ts` (`reserveTextFor`, `intentRowLine`, `supersetLabel`, `reserveSeedFor`). `src/lib/rir-format.ts` deleted.
- Test-day words → `supabase/functions/_shared/strength/test-session.ts` (the plan's test rows import `TEST_LAST_SET_LINE`).
- Warm-up sentence → `supabase/functions/_shared/standing-plan/warmup.ts` (`WARM_UP_LINE`).
- Deleted phone copies: `STANDING_ACCESSORY_SET_CUE`, `STANDING_ME_SET_CUE`, `STANDING_DE_SET_CUE` (`src/lib/strength-focus-copy.ts`), the four `today-lines.ts` cues, the logger's own set-type texts, its own row-line builder, its "All-out set" label, its two plyo lines.

---

## (a) Every changed athlete-facing line, before → after

### Logger

| before | after | page — the book's words |
|---|---|---|
| Set-type sheet ME: `1 to 5 reps, stop short of failure.` | `1 to 5 reps, 90 to 100%, 1 to 3 sets.` + p78 rest rule + p218 set rule | p218 numbers; "stop short of failure" is a SOURCE summary, not a quote |
| Set-type sheet DE: `As fast as possible on every rep. Bar slows, set is over.` | `2 to 4 reps, 70 to 80%, 3 to 4 in reserve, 4 to 6 sets.` + p78 + p218 set rule | p218 numbers; "Bar slows" is on no page |
| Set-type sheet SKILL: `Form and consistency over speed. Weight heavy enough to be a challenge. Every rep either improves the movement or degrades it. Performed poorly, stop.` | `3 to 5 reps, 75 to 85%, 3 to 4 in reserve, 3 to 5 sets. Every rep either improves movement quality or degrades it! Perfect practice makes perfect… if you're performing the movement poorly, STOP.` + p78 + p218 set rule | p218; p76 "…every rep either improves movement quality or degrades it!"; p143 "Perfect practice makes perfect… if you're performing the movement poorly, STOP." |
| Set-type sheet HYP: `8 to 12 reps, 1 to 2 in reserve. Reps slow as the set goes.` | `6 to 12 reps, 0 to 2 in reserve, 3 to 4 sets.` + p84 rest rule + p218 set rule | p218 HYP 6–12, 0–2, 3–4 sets |
| (nothing) | Set-type sheet, every intent: p78 `Rest periods between sets should be sufficient to allow nearly full recovery (though not so long as to allow you to cool down). Hit the next set when you know you can complete it without getting crushed.` (HYP: p84 below) | p78 "Rest periods between sets should be sufficient to allow nearly full recovery (though not so long as to allow you to cool down)…" / "…hit the next set when you know you can complete it without getting crushed." |
| (nothing) | Set-type sheet: `Sets should always remain on the lower end when starting a program, increasing only if an athlete is finding that they are progressing well and seem to have recovery to spare!` | p218, quoted in SOURCE J6 |
| Line above first accessory card: `8 to 12 reps, 1 to 2 in reserve. Reps slow as the set goes.` | `6 to 12 reps, 0 to 2 in reserve, 3 to 4 sets.` (only over a HYP row) | p218 |
| ME card: `ME · 1-5 reps, stop short of failure.` | `ME · 1 to 5 reps, 90 to 100%, 1 to 3 sets.` | p218 |
| DE row: `DE · 2-4 reps · 3 to 4 in reserve · move the bar fast` / `· move fast` | `DE · 2-4 reps · 3 to 4 in reserve` | p218; "move the bar fast" on no page |
| HYP row: `HYP · 6-12 reps · 1 in reserve` | `HYP · 6-12 reps · 0 to 2 in reserve` | p218 0–2 RIR |
| Under every HYP set: `target 6-12 · 1 in reserve` | `target 6-12 · 0 to 2 in reserve` | p218 |
| HYP reserve box placeholder `1`; pill 1 lit; Done auto-saves 1 | placeholder `0 to 2`; pills 0, 1, 2 lit; Done saves no reserve on any p218 row until tapped (DE/SKILL no longer auto-save 4) | p218 gives a band, not a number in it |
| Superset header: `Superset · A with B · one set of each, rest, then again` | `Superset · A with B` | p274 prints the word only |
| Rest pill countdown `3:00` ME / `2:00` DE, SKILL / `1:30` HYP / `1:00` after a warm-up set / `2:30` plyo | no countdown on a plan row with an intent, or on a plyo drill | p78, p84, p227 give no minutes |
| Rest pill cue (ME/DE/SKILL): `Rest until you are nearly recovered, but not so long that you cool down. Take the next set when you know you can finish it.` | p78 sentence above (now on the set-type sheet; the pill no longer opens on a book row) | p78 |
| Rest pill cue (HYP): `Shorter rest on purpose. Carrying some fatigue into the next set is part of this work.` | `Strength and power training typically dictate that this point of reduced capacity represents the end of a productive session, but in hypertrophy training, this may well be a crucial part of the training session itself!` | p84, whole sentence |
| Warm-up sets in front of ME/DE/SKILL rows: empty bar × 5, 55% × 5, 75% × 3, 90% × 2, under `Warm-up` | (nothing) | pp139-140 give no percentages or counts |
| (nothing) | Above the first ME/DE/SKILL row of a plan lifting day: `The first set of your skill work should also be the last set of your warm-up.` | pp139-140, quoted in SOURCE C2 |
| Advance line: `Last time: N — top of the band with room to spare.` | `Last time: N — top of the band.` | "room to spare" on no page |
| Bar-speed lines above sets on a main barbell lift: `Every rep explosive and controlled.` / `Grind it out. Stop before failure.` / `Light on purpose. Move it fast.` / `Light weight, heavy intent. Move it fast.` / `As many clean reps as possible. The set ends when the form changes.` | (nothing) | previous program, on no page |
| All-out set label on non-test `amrap` sets: `All-out set: as many CLEAN reps as you can at this weight. This count is what moves your training max. Stop on form break — never grind solo.` | (nothing) | previous program |
| Deload pill tooltip: `This is a deload week — lighter loads are intentional recovery, not a regression.` | (nothing; the pill stays) | p246/p274/p278 deload is a column substitution |
| Plyo cards: `Drills are done separately, with full rest between efforts. The objective is quality: fatigue, poor form and imprecise movement defeat it. Each drill is repeated until the movement is crisp and you are confident in it, then you move on.` and `For {benefit}. Stop when the movement stops being crisp.` | (nothing); `Efforts are a record, not a target.` stays (it describes the box) | p227 words are not quoted in SOURCE |
| Working-number line after a test: `Bench Press — 185 lb × 5 sets the working weight at 205 lb (about 96% of the tested max).` | `Bench Press — 185 lb × 5 sets the working 1-rep max at 205 lb: (roughly) 96 percent of true 1-rep max.` | p214 "…your working 1-rep max, which I define as (roughly) 96 percent of your true 1-rep max" ("your" cut: voice gate) |

### Test day (logger, `strength-test-session`)

| before | after | page — the book's words (photo `book-sources/p215.png`) |
|---|---|---|
| Empty bar: `Empty bar — a few easy reps to groove the movement.` | `Perform a regular warm-up in your chosen lift, slowly working your way up to a starting weight of 75 percent or so of your predicted max.` | p215 step 1 |
| Step 1: `Step 1 — the first ramp set, as prescribed.` | `A weight where you can comfortably perform 8 repetitions but are approaching failure if you had to push to 10. Use this set of 6 to confirm that this feels about right.` | p215 step 1 "(This may be a guess, but it's a weight where…)" |
| Step 2: `Step 2 — heavier, as prescribed.` | `Perform 5 repetitions with this weight.` | p215 step 6 "Perform 5 repetitions with this weight D." |
| Last set: `Last set — as many CLEAN reps as you can at this weight. This set sets the block's numbers. Stop when form breaks.` | `Perform the maximum number of repetitions possible with this weight.` | p215 step 8 |
| No max on file: `A weight for 8 to 10 reps near failure. Enter it here.` | `A weight where you can comfortably perform 8 repetitions but are approaching failure if you had to push to 10. Enter this weight here.` | p215 steps 1–2 |
| File note: `Bench Press on file: 160 lb (typed in your baselines). The steps below are a share of that number; the last one is what you are trying to beat.` | `Bench Press on file: 160 lb (typed in your baselines).` | nothing on p215 is "to beat" |
| File note, no max: `The steps below are a share of the number that was on file when this block was built; the last one is what you are trying to beat.` | (nothing) | same |
| Pull-up test: `Scap pulls — hang and draw the shoulder blades down/back, no elbow bend.` / `2–3 easy pull-ups, then rest ~2 min before the test set.` / `ONE all-out set: strict, full range, no kipping…`, and the 5 scap-pull and 3 easy-pull-up warm-up sets | (nothing); the one set that records the count stays | no page gives a pull-up test |
| Set label: `Working set — add when ready` | `Working set` | on no page |

### Planned-session sheet (server `computed.strength_lines` / `display_line`; plan export)

| before | after | page |
|---|---|---|
| `HYP · Leg Press 3×6-12 · 1 in reserve @ By feel` | `HYP · Leg Press 3×6-12 · 0 to 2 in reserve @ By feel` | p218 |
| `Superset: A with B — one set of each, rest, then again.` | `Superset · A with B` | p274 word only |
| `HYP · A + B · superset · 3×6-12 · 1 in reserve` | `HYP · A + B · superset · 3×6-12 · 0 to 2 in reserve` | p218 |
| Test rows' note: `Last set as many reps as possible. It sets your numbers.` | `Perform the maximum number of repetitions possible with this weight.` | p215 step 8 |
| Plyo rows: `Stiff-Legged Run 1×4` + note `running gait and speed. Repeat until it feels right and you are confident, then move on. Full rest between. Tired or sloppy, stop.` | `Stiff-Legged Run` (no count, no note) | p227: "multiple times", no figure; words not quoted in SOURCE |
| Carry: `Farmers Carry · medium weight, no fatigue, full rest` | `Farmers Carry · medium weight, emphasis is speed and quality, no fatigue accumulation, ample rest` | p226 SKILL cell, read off `p226.jpg` in the local page folder: "SKILL: Medium weight, emphasis is speed and quality, no fatigue accumulation, ample rest" |
| Plyo session name `Plyometrics` | `Plyo warm-up` | p246, p274, p278 |
| Plan export (`AllPlansInterface.tsx`) composed its own row (`Name: 3×6-12 @ …`, no kind word, no reserve) | prints the server's `display_line` as sent | one owner |

### Today

| before | after | page |
|---|---|---|
| ME cue `1 to 5 reps, stop short of failure.` | `1 to 5 reps, 90 to 100%, 1 to 3 sets.` | p218 |
| DE cue `As fast as possible on every rep. Bar slows, set is over.` / `…Move slows, set is over.` | `2 to 4 reps, 70 to 80%, 3 to 4 in reserve, 4 to 6 sets.` | p218 |
| SKILL cue (four sentences, above) | SKILL `intentLine` (p218 + p76 + p143, above) | p218, p76, p143 |
| HYP cue, and the Hypertrophy superset line: `8 to 12 reps, 1 to 2 in reserve. Reps slow as the set goes.` | `6 to 12 reps, 0 to 2 in reserve, 3 to 4 sets.` | p218 |
| Plan description (the block): `Endurance training rewards pushing through discomfort. Under a bar that instinct is the wrong one: a higher pain tolerance is of negligible benefit to a strength athlete and can work against long-term health.` | (nothing) | p125 is not in SOURCE (grepped `pain`, `p125`: 0 hits) |
| Plan description: `The hard run lands the day before the heavy leg session, so the lower-body weights start about three and a half per cent under where the test put them. That comes back over the first nine weeks.` | `A 3 to 4 percent reduction in working 1RM should be assumed here. This reduction can be gradually phased out in eight to ten weeks.` | p247 "…a 3 to 4 percent reduction in working 1RM should be assumed here. As long as progression is maintained…, this reduction can be gradually phased out in eight to ten weeks" (the opening "you may notice…" sentence cut: voice gate). The engine still applies 3.5 (ours, `progression.ts`) |
| Plan description: `Stop each drill when the movement is optimised for the day and it feels confident — not on a rep count. Fatigue, poor form and imprecise movements are the signal to move on.` | (nothing) | p227 not quoted in SOURCE |

### Plan builder

| before | after | page |
|---|---|---|
| Build focus: `Accessory sets are 8 to 10 reps with a rep or two left in the tank. Going to failure costs the next main lift.` | `6 to 12 reps, 0 to 2 in reserve, 3 to 4 sets.` | p218 (the rows on that step are HYP slots) |
| Run + Strength confirm: `A {weeks}-week block. Two cycles build, the third measures — the last set of that cycle is the test, so there is no separate retest week.` | `A {weeks}-week block.` | on no page; the block's own description says week one is the test |
| Run + Ride + Strength confirm: `…on the run and the bike. The weights go up as you adapt to the training.` | `…on the run and the bike. Few changes are needed as the months progress beyond adjustment of 1RM and threshold as you improve.` | p275, quoted in SOURCE E |
| Ride + Strength confirm: `…faster and stronger. The weights go up as you adapt to the training.` | `A {weeks}-week plan to get faster and stronger.` | paraphrase; p278/p280 print no sentence on it |

### State / Performance

| before | after | page |
|---|---|---|
| `Recent sets are landing below the planned reps in reserve — closer to failure than the plan called for. Held for weeks, that's the fatigue a deload clears.` | first sentence only | no page ties a deload to logged reserve (J4) |
| Adjust > Deload: `Max-effort sets become skill and speed sets, the extra lower-body sets come out, and the endurance sessions drop a level. Switch to it two weeks out…` | `The endurance sessions drop a level. Switch to it two weeks out from a race or a meet. It is not a scheduled light week: the standard week is built to be run indefinitely.` | strength clause off (no quoted words; "speed" is not the book's word for DE; p274 substitutes, p278 only cuts). The rest is left — see (d) |

---

## (b) Pass 5 reverse check

### Pass 5 — BEFORE (state at commit c4d3a048a, recorded before any pass-5 change)

Screens: L = logger (`src/components/StrengthLogger.tsx`), T = Today card (`src/lib/today-lines.ts` via `SessionDeck.tsx`), P = planned-session sheet (server `computed.strength_lines` / `display_line`, `_shared/strength/strength-display-lines.ts`), B = plan builder (`NonRaceBuilder.tsx` ← `setup-copy.ts`).

| Intent | Book instruction (page) | Shown? | Where |
|---|---|---|---|
| ME | 1–5 reps (p218) | yes | T `today-lines.ts:157` (intentLine); L set-type sheet `StrengthLogger.tsx:593`; L ME card `:5481`; L per-set "target 1-5" `:5964`; P "ME · Bench 1×1-5" `strength-display-lines.ts` formatStrengthExercise |
| ME | 90–100% of working 1RM (p218) | NO (the weight is priced at 90%, `compose.ts:896` pctForIntent; the band is printed nowhere) | — |
| ME | no RIR target (p218) | yes, as absence | L/P print no reserve on ME (`strength-display-lines.ts` reserveTextFor) |
| ME | 1–3 sets, start at the low end (p218, quoted) | count only | P "1×1-5"; the band and the p218 "Sets should always remain on the lower end…" sentence nowhere |
| ME | rest: p78 quote | NO on screen | row `rest_cue` (`rest-seconds.ts` restFieldsForRow) is printed only inside the rest pill (`StrengthLogger.tsx:4511`), and pass 4 removed the countdown that opens the pill on a book row |
| ME | intent sentence (p219) / "stopped short of failure" | not quotable | SOURCE A1 is a summary, no quotation marks |
| DE | 2–4 reps (p218) | yes | T `:157`; L sheet `:594`; L row "DE · 2-4 reps · 3 to 4 in reserve" `:5500`; P |
| DE | 70–80% (p218) | NO | — |
| DE | 3–4 in reserve (p218) | yes | L row `:5500`, per set `:5961`, RIR cell `:5926`; P; T |
| DE | 4–6 sets (p218) | count only | P "4×2-4" |
| DE | rest: p78 quote | NO on screen | as ME |
| DE | "maximum velocity" (p218) | not quotable | SOURCE J6 table only |
| SKILL | 3–5 reps, 3–4 in reserve (p218) | yes | T; L sheet `:595`; L row; P |
| SKILL | 75–85% (p218) | NO | — |
| SKILL | 3–5 sets (p218) | count only | P |
| SKILL | p76 "every rep either improves movement quality or degrades it!" | yes | T `:157`; L sheet `:595` (intents.ts INTENT_QUOTES) |
| SKILL | p143 "…if you're performing the movement poorly, STOP." | yes | same |
| SKILL | rest: p78 quote | NO on screen | as ME |
| SKILL | "controlled eccentric, fast concentric" (p218) | not quotable (SOURCE J6 backtick line / table only) | — |
| HYP | 6–12 reps, 0–2 in reserve (p218) | yes | T; L sheet `:596`; L accessory header `:4883`; L row; L per set; P; B `setup-copy.ts` dose_line |
| HYP | no % (p218) | yes, as absence | — |
| HYP | 3–4 sets (p218) | count only | P "3×6-12" |
| HYP | rest: p84 quote | NO on screen | as ME (row `rest_cue` only) |
| HYP | "controlled eccentric, controlled concentric" (p218) | not quotable | — |
| Warm-up (pp139-140) | "The first set of your skill work should also be the last set of your warm-up." (quoted, SOURCE C2) | NO | `warmup.ts` WARM_UP_LINE defined in pass 3, not rendered |
| Warm-up | RAMP (raise/activate/mobilize/potentiate), "unloaded, rapid concentric" | not quotable | SOURCE C2 is a summary; p140 words appear only in code comments |
| Plyo warm-up (p227, p275, pp87-89) | drills done separately; no more than three or four a day | yes (count) | 3 drill rows (`plyo.ts:116`, `compose.ts:2141`) |
| Plyo | "multiple times with ample rest"; stop on fatigue / poor form | not quotable | SOURCE A4 is a summary (removed in pass 2) |
| Plyo | day name "Plyo warm-up" (p246/p274/p278) | yes | `compose.ts` plyoSession name (pass 4) |
| Test (p215, photo) | step 1: regular warm-up up to ~75% of predicted max | yes | L test day, empty-bar set hint `test-session.ts:105` |
| Test | 75% × 6: "comfortably perform 8… approaching failure… push to 10. Use this set of 6 to confirm…" | yes | L step 1 hint `test-session.ts:135`; anchor hint `:121` |
| Test | +10% × 5: "Perform 5 repetitions with this weight" | yes | L step 2 hint |
| Test | +5% × max: "Perform the maximum number of repetitions possible with this weight" | yes | L last-set hint `test-session.ts:113`; P / T row note (`compose.ts` TEST_LAST_SET_LINE) |
| Test | Epley + Brzycki averaged, × 0.96 (p215); "(roughly) 96 percent of your true 1-rep max" (p214) | yes | L after save, `standing-plan-copy.ts` standingWorkingNumberLine |
| Test | "testing your 5-rep max prior to the program" (p214) | yes (app wording) | plan description `plan-row.ts` test-week sentence |
| Deload column (p246/p274/p278) | the TAPER/DELOAD column substitutes/cuts rows | yes (built) | Adjust > Deload rebuilds the week from the frame's taper column (`frames.ts`); logger "Deload" pill |
| Deload | per-program trigger (p245, p247, p280-281, quoted in SOURCE J4/E2c) | partly | Adjust text "two weeks out from a race or a meet" (`StateAdjustLens.tsx`), not the page's words; not strength-only, left |


### Pass 5 — AFTER (commit `1f24f2d6d`)

| Intent | Book instruction (page) | Shown? | Where |
|---|---|---|---|
| ME | 1–5 reps, 90–100%, 1–3 sets (p218) | yes | T `today-lines.ts:157`; L set-type sheet and ME card (`intents.ts` `intentLine`); P count |
| ME | no RIR target (p218) | yes, as absence | L/P |
| ME | "Sets should always remain on the lower end…" (p218, quoted) | yes | L set-type sheet |
| ME | rest: p78 quote | yes | L set-type sheet (`intents.ts` `restRuleFor`) |
| DE | 2–4 reps, 70–80%, 3–4 in reserve, 4–6 sets (p218) | yes | T; L sheet; L row and per set (reserve); P |
| DE | rest: p78 quote | yes | L set-type sheet |
| DE | "maximum velocity" (p218) | NO — not quotable | needs p218's words in SOURCE quotes |
| SKILL | 3–5 reps, 75–85%, 3–4 in reserve, 3–5 sets; p76; p143 | yes | T; L sheet; L row; P |
| SKILL | rest: p78 quote | yes | L set-type sheet |
| SKILL | "controlled eccentric, fast concentric" (p218) | NO — not quotable | as above |
| HYP | 6–12 reps, 0–2 in reserve, 3–4 sets (p218) | yes | T; L sheet; L accessory header; L row; per set; P; B |
| HYP | rest: p84 quote | yes | L set-type sheet |
| HYP | "controlled eccentric, controlled concentric" (p218) | NO — not quotable | as above |
| Warm-up | "The first set of your skill work should also be the last set of your warm-up." (pp139-140) | yes | L, above the first ME/DE/SKILL row of a plan lifting day (`warmup.ts` `WARM_UP_LINE`) |
| Warm-up | RAMP / "unloaded, rapid concentric" (p139-140) | NO — not quotable | SOURCE C2 is a summary |
| Plyo warm-up | three drills a day, one per bucket; name "Plyo warm-up" | yes | rows and session name (`compose.ts`) |
| Plyo | "multiple times with ample rest", stop on fatigue / poor form (p227) | NO — not quotable | page words are listed in (d) for approval |
| Test (p215) | every step's words; the 96 percent (p214) | yes | L test day (`test-session.ts`); L working-number line |
| Test | "215 is what you'll use as a 'could hit this as a max effort on any day' value" (p215) | NO | an explanation, second person; not added |
| Deload column | the column is built from the frame; the trigger per program | built; trigger words not the page's | Adjust > Deload (`StateAdjustLens.tsx`), see (d) |

---

## (c) Server functions that import changed shared code (deploy later; nothing deployed)

Changed shared files: `_shared/strength-grid/intents.ts`, `_shared/strength/strength-display-lines.ts`,
`_shared/strength/test-session.ts`, `_shared/strength/rest-seconds.ts`, `_shared/standing-plan/compose.ts`,
`setup-copy.ts`, `plan-row.ts`, `warmup.ts`, `frames.ts` (read off `docs/INVENTORY.md`, regenerated in each pass).

`adapt-plan`, `analyze-cycling-workout`, `analyze-running-workout`, `coach`, `compute-session-boom`,
`compute-snapshot`, `course-detail`, `course-strategy`, `create-goal-and-materialize-plan`, `delete-plan`,
`endurance-checkpoint`, `generate-combined-plan`, `generate-strength-plan`, `generate-triathlon-plan`,
`get-arc-context`, `get-week`, `import-strava-history`, `ingest-phone-workout`, `learn-fitness-profile`,
`materialize-plan`, `planning-context`, `post-import-athlete-pipeline`, `refresh-goal-race-projections`,
`rematerialize-standing-block`, `strava-webhook`, `strength-test-session`, `swap-list`, `swap-session`,
`workout-detail` (29). The phone changes need a client build.

⚠️ Rows already written to the database keep their old `rest_seconds`, warm-up sets, notes and carry words
until the plan is rebuilt (Adjust > Rebuild upcoming sessions, or the server refresh).

---

## (d) Not done, and why

1. **Lines removed because the SOURCE doc does not quote the page.** The page photos for these pages are in
   `/Users/michaelambp/Efforts_Local_Folder/book-sources/viada-hybrid-athlete/` (outside the rule's p210–p215):
   - p218 tempo clauses (DE "maximum velocity", SKILL "controlled eccentric, fast concentric", HYP tempo) and
     p219's meaning of each intent, including ME's "stopped short of failure". Not read this session.
   - p227 plyo instruction. Read off `p227.jpg`: *"Each drill should be performed multiple times with ample
     rest, with a full focus on technique and balance, as well as consistent quality. Each drill should be done
     until the movement is optimized for the day and the athlete develops confidence in it; then they move on
     from it. Fatigue, poor form, and imprecise movements are all absolute no-no's here!"* Adding that to the
     SOURCE doc in quotation marks would let the plyo row carry it.
   - p139-140 RAMP and "unloaded, rapid concentric" warm-up. p125 (pain tolerance). Not read this session.
2. **The carry row is the one exception** to the rule: its words come from `p226.jpg`, not from a SOURCE quote.
   Reverting it means the row has no words, and it then renders as a barbell SKILL row (kind word and p218's
   SKILL line) — which needs a new field through `materialize-plan`'s whitelist.
3. **`By feel`** on unpriced rows is on no page. The phone prints what `materialize-plan` stamps
   (`materialize-plan/index.ts:2879, 3313`); change needed there (run/ride/export agent's file).
4. **State's "below the planned reps in reserve" signal** still grades HYP against the stamped midpoint 1
   (`_shared/longitudinal-signals.ts:564`, ours tolerances 0.9 / 1.4). The composer still stamps
   `target_rir` 1 on HYP and 3.5 on DE/SKILL (`compose.ts` `targetRirForIntent`, ours) for the engine; no
   screen prints it any more.
5. **Adjust > Deload's remaining sentences** ("The endurance sessions drop a level. Switch to it two weeks out
   from a race or a meet. It is not a scheduled light week…") are not the page's words. Not strength-only;
   left for the run/ride pass. p247's quoted trigger names a race distance the app does not print.
6. **Left as app operation, not training instruction:** session names `Test: Upper` / `Test: Lower`;
   `— weights arrive once you log the test`; `Week one is a test week…` / `Week one is prescribed from sets
   already on file…`; `The other lifting days run by feel this week…`; `Bench, squat and deadlift each need a
   1RM of at least 65 lb.` (ours minimum); `Efforts are a record, not a target.`
7. **Exercise how-to text** (`strength-grid/grid.ts`, 159 entries cited to ExRx / NSCA / ACE / OURS) is
   untouched. It is a cue under the rule; removing it is a separate call.
8. **Today drawer list** (`src/utils/strengthFormatter.ts` `plainLiftList`) still lays out name · sets × reps ·
   weight from the row's fields; it prints no prescription words of its own. The server's `strength_lines`
   carry the kind word and reserve the drawer deliberately leaves out.
9. **Unreachable text left in place:** `BAR_SPEED_COPY` and friends in `src/lib/strength-focus-copy.ts` (no
   screen imports them; pinned absent from the logger by test); `RIR_NOTE` in `intents.ts` (grid notes do not
   reach a screen).
10. **Changes needed in run/ride/export files:** item 3 only. One test in `supabase/functions/materialize-plan/`
    (`me-has-no-reserve.test.ts`) was re-pinned to the logger's new Done seed; no code in that folder changed.
11. **Tests.** Deno: strength, standing-plan, strength-grid, session-detail, materialize-plan and `src/lib` suites
    pass (1882) except `src/lib/wizard-day-lock.lint.test.ts` (2 failures, the same on the untouched base).
    `npx tsc --noEmit -p tsconfig.app.json`: 305 errors, the same count as the base; the
    `StrengthLogger.tsx` TS2339 (`warmup`) error pre-exists. `npx vitest run` collects the Deno files and fails
    all 562 on URL imports; none of the touched tests are vitest tests.

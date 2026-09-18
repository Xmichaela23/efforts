# Book-language audit — every athlete-facing prescription line vs the book (2026-09-18)

Read-only audit. No fixes until Michael reads it. Branch `stage/one-truth-drift` at 039975f2.
Source of truth: `docs/SOURCE-viada-hybrid-athlete.md`.

**Method.**
- Four passes:
  - strength lines
  - run, ride and swim lines
  - text that leaves the app, plus State and Performance
  - generated output: six real plans built on a throwaway account, starting Monday 2026-09-21, 12 weeks each. The account was deleted afterwards and all 44 tables with a user column were checked empty.
- Every row names `file:line`, the book's words and the page.
- Where a row says NOT ON ANY PAGE, it names what was searched in the SOURCE doc.
- Evidence labels: [read] = page or code read directly; [built] = the session steps were run through the real library; [inferred] = said so.

## Counts

| pass | lines | MATCHES | OFF | NOT ON ANY PAGE | other |
|---|---|---|---|---|---|
| Strength | 64 | 23 | 22 | 19 | — |
| Run / ride: standing plan (Standard, Run Focus, Ride Focus) | 92 | 55 | 20 | 13 | 3 split, 1 silent |
| Run / ride: race and combined generators | 70 | 9 | 23 | 38 | — |
| Run / ride: after the plan (materialize, get-week, screens) | 79 | 22 | 25 | 25 | 7 split |
| Leaves the app + State / Performance | 44 | 17 | 17 | 10 | — |
| **Total** | **349** | **126** | **107** | **105** | 11 |

"Split" = the centre number matches but the band around it is ours, or the line matches on one surface and is off on another.

## 1. The trigger case

Checked directly against the code and the SOURCE doc [read].

| line as printed | where it prints | code | book | verdict |
|---|---|---|---|---|
| `8 to 12 reps, 1 to 2 in reserve. Reps slow as the set goes.` | Logger: the line above the first accessory card | `src/lib/strength-focus-copy.ts:410` | p218: HYP 6–12 reps, 0–2 RIR. p86: 8–12 **sets** per muscle per week, 8–10 reps preferred, 1–2 RIR. p219: reps slow. | OFF. "8 to 12 reps" is on no page as a rep range. "1 to 2 in reserve" is p86's hypertrophy dose, not p218's HYP band (0–2). |
| same sentence | Logger: the set-type sheet (HYP) | `src/components/StrengthLogger.tsx:594` | same | OFF, same |
| same sentence | Today card (HYP), and the "Hypertrophy superset" line | `src/lib/today-lines.ts:123` | same | OFF, same |
| `HYP · 6-12 reps · 1 in reserve` | Logger: each accessory row, and every set hint | built from the plan row: reps `6-12`, reserve 1 from `supabase/functions/_shared/standing-plan/compose.ts:829-834` | p218: 6–12, 0–2 RIR | Reps MATCH. "1 in reserve" is the midpoint of p218's 0–2, marked ours in the code at `compose.ts:832`. The reserve box pre-fills 1 and saves it on Done (`StrengthLogger.tsx:3899`, `:6344`). |
| `Accessory sets are 8 to 10 reps with a rep or two left in the tank. Going to failure costs the next main lift.` | Plan builder, build-focus step | `setup-copy.ts:122-123` | p86: 8–10 reps, 1–2 RIR | Matches p86. But the rows this step lists print 6–12 with 1 in reserve. "costs the next main lift" is on no page. |

In the generated `standard_use` plan, the fixed header line prints 8 times and `HYP · 6-12 reps · 1 in reserve` prints on 28 rows [built].

**One prescription, three answers:**
- reps: 8–12 (header), 6–12 (row), 8–10 (builder)
- reserve: 1–2 (header), 1 (row), a rep or two (builder)

The page holds two separate facts:
- p218 is the grid for the HYP set: 6–12 reps, 0–2 RIR.
- p86 is the weekly hypertrophy dose: 8–10 reps preferred, 1–2 RIR.

Which of the two the HYP row prints is Michael's call.

## 2. Prescriptions stated in two or more places with different words or numbers

The one place each should come from is in **bold**.

### Strength
1. **HYP reps and reserve.** Nine places, three answers (section 1). **`strength-grid/intents.ts:108-120`**.
2. **DE line.**
   - Places: logger row `StrengthLogger.tsx:5549`, set-type sheet `:592`, Today `today-lines.ts:113-114`.
   - "Bar slows, set is over" is on no page. A comment at `compose.ts:2254` records it as ours and cut.
   - Owner: **the grid's DE entry**.
3. **ME line.** `strength-focus-copy.ts:495`, `StrengthLogger.tsx:591`, `today-lines.ts:107`. **The grid's ME entry.**
4. **SKILL line.** Two identical copies, `StrengthLogger.tsx:593` and `today-lines.ts:117-119`. **The grid's SKILL entry.**
5. **How a superset is done.**
   - Five wordings across the logger, the planned view, Today and the drawer, e.g. `one set of each, rest, then again` at `StrengthLogger.tsx:4878` and `strength-display-lines.ts:99`.
   - That wording is on no page.
   - Owner: **one server line**.
6. **Reserve formatter.** `src/lib/rir-format.ts` and `strength-display-lines.ts:25` disagree at 5 and above ("5+" vs "5"). **`strength-display-lines.ts`**.
7. **Test day, last set.** Four wordings: `compose.ts:2047`, `test-session.ts:97`, `StrengthLogger.tsx:2089`, `strength-focus-copy.ts:357`. **The server test session (`test-session.ts`)**.
8. **Empty bar on test day.**
   - `warmup.ts:45` says moved fast; it is not shown on screen.
   - `test-session.ts:96` says "a few easy reps", and it is shown. p140 says rapid.
   - Owner: **`warmup.ts`**.
9. **Is there a test week?**
   - `plan-row.ts:604` and `setup-copy.ts:98` say week one is the test.
   - `setup-copy.ts:66` says "Two cycles build, the third measures… no separate retest week". That is on no page.
   - Owner: **`plan-row.ts`**.
10. **What a deload is.**
    - Places: `StrengthLogger.tsx:4621`, `strength-focus-copy.ts:370`, `StatePerformanceSection.tsx:747`.
    - Owner: **the frame's own Taper/Deload column (p246 / p274 / p278)**.
11. **The planned-row line itself is built four ways.**
    - The server builds it: `strength-display-lines.ts`.
    - The phone builds it three more times:
      - the Today drawer, `strengthFormatter.ts:82`, which drops the reserve
      - the logger row, `StrengthLogger.tsx:5541`
      - the plan export, `AllPlansInterface.tsx:1361`
    - Owner: **the server's line, printed as sent**.

### Run and ride
12. **Warm-up and cool-down.**
    - Run warm-ups drop the walking lunges and Cossack squats (`session-vocabulary.ts:329-362`).
    - Every ride warm-up becomes one block at 55–70% FTP (`materialize-plan:2272`). This is ours. It loses p238's 5 min @ 95% and p236's cadence sprints.
    - The ride cool-down at 40–55% is on no page.
    - Owner: **the library's box for each session type**.
13. **Talk test and easy-run wording.** "Go by heart rate" where p235 says talk test. **One p235 line in `family-lines.ts`**.
14. **MLSS run.** Today prints p233's near-threshold sentence instead of p231's (`family-lines.ts:33-35`). **The library's MLSS intent, p231**.
15. **Ride vs run leg cost.**
    - "Riding hard … costs the lifting less" (`sport-slots.ts:255`) says the opposite of p280.
    - The same claim was already removed from `week-conflicts.ts:398-401`.
    - Owner: **p280; the `sport-slots` sentence comes off**.
16. **Anaerobic ride (p237).** Three readings:
    - The note sent to Garmin and Zwift says "No ceiling. Each set harder than the last." (`family-lines.ts:26`). It also prints on the anaerobic ride's two flat workouts.
    - The library says each set climbs from the bottom of the band to the top (`source-rules.ts:1735`).
    - The steps go out with a 130% FTP ceiling (`quality-work.ts:170`, `convert-workout.ts:239`, `serialize.ts:76`).
    - Owner: **`FAMILIES.ride_anaerobic` in `source-rules.ts`**.
17. **Easy ride (p239, "below 75%").**
    - The note says "Under 75 percent" (`family-lines.ts:30`).
    - Garmin gets 0–75% (`materialize-plan:2255`).
    - Zwift gets no target (`serialize.ts:81`).
    - Owner: **`EASY_RIDE_CEILING_PCT_OF_FTP` (`quality-work.ts:188`)**.
18. **Run "@ VT1" recovery.**
    - The page says "@ VT1".
    - The swap sheet says "N min easy" (`quality-work.ts:414`).
    - The watch says "rest" with no target (`convert-workout.ts:455-467`, `materialize-plan:742`).
    - Owner: **the library segment**.
19. **FTP test.**
    - Description and combined-plan step: "3 min at 9 out of 10" (`baseline-test-rows.ts:58`, `materialize-plan:1526`).
    - Step from Adjust and week one: 110–120% FTP (`materialize-plan:2355-2359`).
    - The 20-minute effort has three wordings (`materialize-plan:1529`, `:2301`, `baseline-test-rows.ts:58`).
    - The cool-down is 5–10 min in the description, 5 min in the combined-plan step and 8 min in the Adjust step. All are ours.
    - The 5-minute FTP test comes from the coach course, not the book.
    - Owner: **one step list (`buildAssessmentSteps`) fed by `baseline-test-rows.ts`**.
20. **Run threshold test.**
    - The description offers 12, 10 or 8 minutes by training age (p210). The watch always runs 12 (`baseline-test-rows.ts:44`).
    - Three wordings of the effort (`materialize-plan:1558`, `:1668`, the description).
    - The cool-down is 8–10 min in the description and 9 min in the step.
    - Owner: **`baseline-test-rows.ts`, with the trial length carried into the steps**.
21. **Long run with inserted sets** (Run + Strength, p246 day 6; `frames.ts:535`).
    - Level 2 builds 3–7 × 2:15 @ 115% with no recovery. p235 prints 2 sets of 2 × (1:30 @ 115% / 30 s at VT1) [built].
    - The race-pace finish drops p235's 95% middle interval.
    - The fartlek counts and lengths are off at every level, and it is offered at level 1, where the page has no fartlek.
    - "Easy the whole way" prints over this run.
    - Owner: **the library**.
22. **Race tempo.**
    - The sentence says "race pace, recoveries a quarter longer" (p247).
    - The row builds 5 × 3:30 @ 90% with 60 s rests. Only the name and the sentence change (`compose.ts:3307`).
    - Owner: **the library**.
23. **Bike VO2.** The race generators use 3-minute rests; p238 says 5. **The library**.
24. **Sweet spot.** The race generators use 88–94% FTP; p238–239 gives each session its own number, 80–100%. **The library**.
25. **Strides.** About ten versions across the generators. **The library's strides add-on**.
26. **The band around a target.**
    - A single printed percentage goes out as ±10% (95% → 86–100%), cited to TrainingPeaks.
    - Run pace bands are ±2% on work steps and ±6% on the rest (ours).
    - A target also shows as a range, a single number or a midpoint depending on the surface.
    - Owner: **one constant and the saved step's range**.
27. **Recovery words.** **The page's own word on each step**.
28. **All-out.** **`planned-step-lines.ts:58`, applied to every all-out step**.
29. **Session name.**
    - The calendar sync (`calendar-sync/run.ts:97`) says "Maximum Effort: Upper" / "Ride — Endurance".
    - The stored name ("ME: Upper" / "Ride") is used by the manual Garmin send (`send-workout-to-garmin/index.ts:69`), `plans.csv` (`export-data/index.ts:274`) and the State next-session row (`coach/index.ts:1014`).
    - The calendar shows "BK-VO2" on the anaerobic ride.
    - Owner: **the server's spelled title (`run.ts:97` / `INTENT_TITLE`), sent to every reader**.
30. **Dynamic effort's name.** "Dynamic Effort" (`intent-title.ts:25`), "skill and speed sets" (`StateAdjustLens.tsx:428`), "speed reps" (`ViadaWeekCard.tsx:191`). **`INTENT_TITLE`**.
31. **Metric pace unit.** **`display-format.ts`**.
32. **Swim.**
    - 1 × 600 where the page has 2 × 600.
    - Sighting is counted in strokes where the page counts seconds.
    - There are two swim tests.
    - Owner: **the library, p240–241**.
33. **Long-run cap.** **p108 and p247**.
34. **Two-a-day spacing.** **`spacing-line.ts`, adding p143's 4–6 hours after a VT1 session under an hour**.

## 3. Other findings that are not duplicates

- **Ride + Strength builds its rides from p278's Deload column.**
  - That is 5 rides, all level 1, the same length every week, under Standard lifting.
  - p278's Standard week has 7 rides, and p281 prescribes a ride-length progression.
  - The rides screen tells the athlete to go longer by judgement.
- **The p107 drift stop rule (5% for hybrid athletes)** prints nowhere before a session. In the standing plan it was taken off Today on purpose. p235's talk test prints nowhere in the race generators.
- **"Top-end running speed decays"** (`sport-slots.ts:890`) is cited to p275 but is not on that page, and it runs against p119.
- **"Smooth circles, not stomping"** is not on p239. **"On Zwift, turn ERG off"** is on no page.
- **Carry row:** "full rest" should be "ample rest" (p226), and "speed and quality" is missing (`compose.ts:1061`).
- **Rest countdowns** (3:00 / 2:00 / 1:30 / 1:00) are ours. The hypertrophy rest line drops p84's "may well be".
- **Test day, finding a starting weight:**
  - The hint squeezes p215's "comfortably 8, near failure at 10" into "8 to 10 reps near failure".
  - "the last one is what you are trying to beat" is not how p215 works.
- **The plyo day is named "Plyometrics".** p246, p274 and p278 print "Plyo warm-up".
- **The plan description's pain-tolerance line** cites p125. p125 is not in the SOURCE doc (grepped `pain` and `p125`: 0 hits).
- **The Adjust deload text** says "skill and speed sets". "Drop a level" leaves out that p274 also removes sessions. "Two weeks out" is p247's rule, applied to every plan.
- **State lines on no page:** the "legs loaded" suggestions and the race-week bullets. The race-week bullets also run against p247 (race-pace repeats on tempo days in both taper weeks) and p118 (intensity does not drop).
- **Lines from the previous program still reachable in the logger:**
  - The bar-speed lines above an AMRAP set on a main barbell lift (`strength-focus-copy.ts:349-373`, `:382`).
  - The test-row "All-out set … training max" label (`StrengthLogger.tsx:2089`).
- **The race and combined generators** (`generate-combined-plan`, `generate-run-plan`) mostly print copy with no page: pace names, bricks, strides, and "comfortably hard" used for five intensities. The description and the steps describe different workouts in seven places.

## 4. What leaves the app (traced in code)

- **Intervals.icu / Zwift:** rides only. Each ride carries its title, the session note and one line per step, with power as % of FTP.
- **Garmin:** each workout carries its title and step labels. The session note goes with rides only, so run notes never reach the watch (`convert-workout.ts:825`). This includes the talk test, the MLSS line, race tempo and the run test instructions.
- **Default destinations:** rides go to Intervals, runs to Garmin, strength and swim to nothing. These are set only when Intervals is connected. Searched `src` for `workout_destinations` and `destinations`: no screen changes them.
- **Strength:** no strength prescription leaves the app. Only session names (`plans.csv`) and logged sets (`sets.csv`) do.
- **The FTP test in a race or combined plan never reaches Intervals.icu or Zwift.** Its step labels contain digits, and `serialize.ts:67` refuses the row.
- **Searched and not found:**
  - `BEGIN:VCALENDAR`, `text/calendar`, `.ics`: no calendar-file feed.
  - `.zwo`: no Zwift workout-file builder.
  - `send-workout`, `Send to Garmin`, `sendToGarmin`, `send_to_garmin`: nothing in `src` calls the manual Garmin send.

## 5. Generated output (throwaway account, six plans)

| key | program | numbers | rows |
|---|---|---|---|
| standard_use | Run + Ride + Strength | on file | 120 |
| standard_test | Run + Ride + Strength | strength, FTP, run time trial tested in week 1 | 122 |
| run_test | Run + Strength | strength tested in week 1 | 108 |
| run_use | Run + Strength | on file | 108 |
| ride5_use | Ride + Strength, five rides | on file | 108 |
| ride4_test | Ride + Strength, four rides | strength and FTP tested | 97 |

- 4,511 distinct lines. The dump was not committed (548 KB). It can be rebuilt with the throwaway-account script from this session.
- No test session appears after week 1 in any of the six plans.
- The server lists only three programs; no lifts-only program exists in code, so none was built.
- The plan's own row lines, e.g. `HYP · Leg Press 3×6-12 · 1 in reserve @ By feel`, print on the planned-workout views, not in the logger. The logger builds its own row line from the numbers.
- The session detail views print `DE · … 4×2-4 · 3 to 4 in reserve`. In the logger the same rows read `DE · 2-4 reps · 3 to 4 in reserve · move the bar fast` or `· move fast`.

---

# Appendix A — Strength, line by line


Branch `stage/one-truth-drift`, read-only. Evidence labels: **read** = I opened the file / page transcription this session; **grep** = named search; **inferred** = my reasoning, not verified on a device.
Book = `docs/SOURCE-viada-hybrid-athlete.md` (page numbers are the SOURCE doc's). Abbreviations: SL = `src/components/StrengthLogger.tsx`, SFC = `src/lib/strength-focus-copy.ts`, TL = `src/lib/today-lines.ts`, CMP = `supabase/functions/_shared/standing-plan/compose.ts`, SDL = `supabase/functions/_shared/strength/strength-display-lines.ts`, TS = `supabase/functions/_shared/strength/test-session.ts`, INT = `supabase/functions/_shared/strength-grid/intents.ts`, SC = `supabase/functions/_shared/standing-plan/setup-copy.ts`.

**The book's key (p218, read in SOURCE A1 / J6):** ME 1–5 reps, 90–100%, no RIR target, 1–3 sets · DE 2–4, 70–80%, max velocity, 3–4 RIR, 4–6 sets · SKILL 3–5, 75–85%, controlled eccentric / fast concentric, 3–4 RIR, 3–5 sets · HYP 6–12, no %, controlled both ways, 0–2 RIR, 3–4 sets. p86 (SOURCE B2 / line 2354) is the weekly hypertrophy DOSE: 8–12 **sets** per muscle per week, **8–10 reps** preferred, 1–2 RIR.

**Where the numbers come from (read):** the server stamps each standing-plan row with `reps` = p218 band (CMP:1674), `sets` = low end of p218 band (CMP:1672, INT:171-175), `target_rir` = midpoint of the p218 RIR band rounded to the half (CMP:829-834, labelled OURS at :832) → DE/SKILL 3.5, **HYP 1**, ME none. materialize-plan keeps the row's own `target_rir` (strength-profiles.ts:581-583).

---

### 1. Every line

| # | Line as printed | Screen | Written at | Book says | Page | Verdict |
|---|---|---|---|---|---|---|
| 1 | `ME` / `DE` / `SKILL` / `HYP` (the word on the row) | Logger row, plan lines | SL:5540-5551; SDL:46-49 | "Abbreviations" ME, DE, SKILL, HYP | p219 | MATCHES |
| 2 | `Maximum effort` / `Dynamic effort` / `Skill` / `Hypertrophy` | Logger set-type sheet; Today card; Today drawer headings | SL:590-595; TL:97-102 (via `kindWordFor` TL:282) | same expansions | p219 | MATCHES |
| 3 | `1 to 5 reps, stop short of failure.` | Logger set-type sheet (ME) | SL:591 | 1–5 reps; "each set is stopped short of failure" | p218, p219 | MATCHES |
| 4 | `ME · {target_reps} reps, stop short of failure.` | Logger ME card | SFC:495-496, SL:5530-5553 | same | p218, p219 | MATCHES |
| 5 | `1 to 5 reps, stop short of failure.` | Today card (ME) | TL:107 | same | p218, p219 | MATCHES |
| 6 | `As fast as possible on every rep. Bar slows, set is over.` | Logger set-type sheet (DE) — says "Bar" on every DE row, dumbbell included | SL:592 | "maximum velocity"; "treat every rep as though the bar were loaded to a maximum. Fatigue is discouraged." No in-set stop rule. | p218, p219 | OFF — sentence 1 matches; "Bar slows, set is over" is on no page. CMP:2254-2258 records "If the bar slows, the set is done" as OURS and cut. grep SOURCE for `bar slows`, `slows`: 0 hits |
| 7 | `As fast as possible on every rep. Bar slows, set is over.` / `…Move slows, set is over.` | Today card (DE) | TL:113-114 | as #6 | p218, p219 | OFF — same as #6 |
| 8 | `DE · {reps} reps · {rir} in reserve · move the bar fast` (`· move fast` off a bar) → `DE · 2-4 reps · 3 to 4 in reserve · move the bar fast` | Logger DE row | SL:5541-5551; reserve from CMP:833 | 2–4 reps, max velocity, 3–4 RIR | p218 | MATCHES |
| 9 | `SKILL · {reps} reps · {rir} in reserve` → `SKILL · 3-5 reps · 3 to 4 in reserve` | Logger SKILL row | SL:5541-5551 | 3–5, 3–4 RIR | p218 | MATCHES (tempo "controlled eccentric, fast concentric" is printed nowhere) |
| 10 | `Form and consistency over speed. Weight heavy enough to be a challenge. Every rep either improves the movement or degrades it. Performed poorly, stop.` | Logger sheet (SKILL); Today card (SKILL) | SL:593; TL:117-119 | p219 SKILL meaning; p76 pull-quote; rule 3b "if you're performing the movement poorly, STOP" | p219, p76, pp139-145 (code cites p143) | MATCHES |
| 11 | `8 to 12 reps, 1 to 2 in reserve. Reps slow as the set goes.` | Logger set-type sheet (HYP) | SL:594 | HYP 6–12 reps, 0–2 RIR (p218); "reps inevitably slow" (p219); p86: 8–10 reps preferred, 1–2 RIR, **8–12 sets/muscle/week** | p218, p219, p86 | OFF — "8 to 12 reps" is on no page as a rep range (p218 says 6–12; p86 says 8–10 reps; 8–12 on p86 is weekly SETS). "1 to 2" is p86's dose, not p218's HYP 0–2. Clause 3 matches p219 |
| 12 | same sentence | Logger — the line above the first accessory card (standing-plan sessions, when no accessory row carries a weight) | SFC:410 → SL:4906-4926 | as #11 | p218, p86 | OFF — as #11 |
| 13 | same sentence | Today card (HYP), and once under a HYP superset ("Hypertrophy superset") | TL:123, TL:172, TL:218-224 | as #11 | p218, p86 | OFF — as #11. **This is the trigger case's header line.** |
| 14 | `HYP · {reps} reps · {rir} in reserve` → `HYP · 6-12 reps · 1 in reserve` | Logger HYP row | SL:5541-5551; `1` from CMP:833 | 0–2 RIR | p218 | OFF — the page's band 0–2 is printed as the single midpoint 1 (OURS, CMP:832) |
| 15 | `target {reps}[ per side]` + ` · {rir} in reserve` — ME `target 1-5`; DE `target 2-4 · 3 to 4 in reserve`; SKILL `target 3-5 · 3 to 4 in reserve` | Logger, under every set | SL:6019-6031 | p218 bands | p218 | MATCHES |
| 16 | `target 6-12 · 1 in reserve` | Logger, under every HYP set | SL:6019-6031 | 0–2 RIR | p218 | OFF — as #14 |
| 17 | RIR box placeholder `1`, the pill `1` highlighted, and Done auto-saves RIR 1 on a HYP set (DE/SKILL: `3 to 4`, pills 3 and 4, auto-save 4) | Logger RIR box / "RIR — tap to change" strip | SL:5986, SL:6344, SL:3899; `src/lib/rir-format.ts:13-32` | 0–2 (HYP), 3–4 (DE/SKILL) | p218 | OFF for HYP (a 0 or 2 is in band but is shown as off-target); MATCHES for DE/SKILL |
| 18 | `Superset · {A} with {B} · one set of each, rest, then again` | Logger, above a superset pair | SL:4876-4880 | p274 prints only the word "superset"; pp139-145 rule 2b is about layering skill work | p274 | NOT ON ANY PAGE — grep SOURCE `superset` (lines 702-706, 1137-1164) and `one set of each` (0 hits) |
| 19 | Rest countdown `3:00` (ME), `2:00` (DE, SKILL), `1:30` (HYP), `1:00` after a warm-up set | Logger rest pill | `supabase/functions/_shared/strength/rest-seconds.ts:83-87, 47` | "He gives no minutes" — rule only | p78 | NOT ON ANY PAGE — labelled OURS at rest-seconds.ts:73-91 and INT:193 |
| 20 | `Rest until you are nearly recovered, but not so long that you cool down. Take the next set when you know you can finish it.` | Logger rest pill (ME, DE, SKILL) | INT:209-210 via rest-seconds.ts:97-99 → SL:4567-4572 | "sufficient to allow nearly full recovery (though not so long as to allow you to cool down)… hit the next set when you know you can complete it" | p78 | MATCHES |
| 21 | `Shorter rest on purpose. Carrying some fatigue into the next set is part of this work.` | Logger rest pill (HYP) | INT:221 | "in hypertrophy training, this **may well be** a crucial part of the training session" — no rest length | p84 | OFF — "shorter rest" is on no page; the hedge "may well be" is dropped |
| 22 | Warm-up ramp: empty bar ×5, then 55% ×5, 75% ×3, 90% ×2 of the work weight, under a `Warm-up` heading | Logger (ME, DE, SKILL rows with a weight) | `supabase/functions/_shared/standing-plan/warmup.ts:83-85, 128`; SL:6074 | "begin with unloaded, rapid concentric… working up in weight"; "first set of your skill work should also be the last set of your warm-up" — no percentages | pp139-140 | NOT ON ANY PAGE — the ramp itself is p140; every number is labelled OURS at warmup.ts:83 |
| 23 | `medium weight, no fatigue, full rest` | Logger (per set), plan lines, Today card corner, drawer | CMP:1061 | SKILL carry: "medium weight, emphasis is speed and quality, **no fatigue accumulation**, **ample rest**" | p226 | OFF — "full rest" for "ample rest"; "speed and quality" dropped |
| 24 | `Deload` pill; tooltip `This is a deload week — lighter loads are intentional recovery, not a regression.` | Logger header | SL:4618-4625 | The TAPER/DELOAD column is a substitution (ME → SKILL/DE, superset/braced volume off); triggers are an event or fatigue | p274, p246, J4 (p245-p283) | OFF (tooltip only) — the word matches; "lighter loads" is not how the page describes it |
| 25 | `Last time: {reps} — top of the band with room to spare.` / `…top of the band.` | Logger (auto-regulated HYP/SKILL rows) | `src/lib/advance-nudge.ts:124-135` | no page | — | NOT ON ANY PAGE — logged fact; "room to spare" is ours (grep SOURCE `room to spare`: 0 hits, "recovery to spare" p218 is about sets) |
| 26 | Previous program's bar-speed lines: `Every rep explosive and controlled.`, `Grind it out. Stop before failure.`, `Light on purpose. Move it fast.`, `Light weight, heavy intent. Move it fast.`, `Not to failure — you train tomorrow.` | Logger, only above an AMRAP set on a main barbell lift, never on a `1rm_test` session | SFC:349-373, 382 via SL:1882-1906, SL:6081-6087 | not Viada | — | NOT ON ANY PAGE — reachable only on pre-standing plans (inferred: standing plan's only AMRAP sets are in test week, which SL:1890 suppresses) |
| 27 | `All-out set: as many CLEAN reps as you can at this weight. This count is what moves your training max. Stop on form break — never grind solo.` | Logger, test-session label row only | SL:2089, 2837/2942/3039, 6058 | not Viada ("training max" is the previous program's term) | — | NOT ON ANY PAGE — likely superseded by the server test session hints (#33) (inferred) |
| 28 | `Test: Upper` / `Test: Lower` / `Test: {A} + {B}` | Session name | CMP:2093 | p215 gives a protocol, no session name | p215 | NOT ON ANY PAGE (a label) |
| 29 | Test row reps `6, 5, max`; weights 75% of predicted max, +10%, +5% | Logger, plan lines | CMP:2043/2060; `working-number.ts:116, 237-249` | 75% ×6, +10% ×5, +5% max reps | p215 | MATCHES |
| 30 | `Last set as many reps as possible. It sets your numbers.` | Plan lines, Today (test day prints row notes) | CMP:2047, 2062 | step 3 max reps → Epley/Brzycki → working max | p215 | MATCHES |
| 31 | `Empty bar — a few easy reps to groove the movement.` | Logger test day | TS:96 | "begin with **unloaded, rapid concentric**" | p140 (p215 names no empty bar) | OFF — "easy" is the opposite of "rapid" |
| 32 | `Step 1 — the first ramp set, as prescribed.` / `Step {n} — heavier, as prescribed.` | Logger test day | TS:107-108 | p215 steps | p215 | MATCHES |
| 33 | `Last set — as many CLEAN reps as you can at this weight. This set sets the block's numbers. Stop when form breaks.` | Logger test day, last step | TS:97-98 | max reps; worked example runs to the sixth rep "being nearly a fail" | p215 | OFF (partly) — "clean" and "stop when form breaks" are not on p215 (the nearest page is p219's ME rule). grep SOURCE `form break`: only line 100 (p219) |
| 34 | `A weight for 8 to 10 reps near failure. Enter it here.` | Logger test day, no max on file | TS:100 | 75% = "comfortably perform 8 repetitions but approaching failure if you had to push to 10" | p215 | OFF — the page is comfortable at 8, near failure at 10; labelled OURS at TS:99 |
| 35 | `{Lift} on file: {N} lb (typed in your baselines). The steps below are a share of that number; the last one is what you are trying to beat.` | Logger test day | TS:110-115 | steps are % of predicted max; last step is max reps at +5% | p215 | OFF — nothing on p215 is a number "to beat" |
| 36 | Pull-up test: `Scap pulls — hang and draw…`, `2–3 easy pull-ups, then rest ~2 min before the test set.`, `ONE all-out set: strict, full range, no kipping…` | Logger (Baselines launcher test) | TS:101-105 | no pull-up test on any page | — | NOT ON ANY PAGE — grep SOURCE `scap`, `kipping`: 0 relevant hits; `pull-up` only in the p219 category list. TS:102 labels one OURS |
| 37 | `Working set — add when ready` | Logger test-day set label | SL:6056 | — | — | NOT ON ANY PAGE |
| 38 | `{movement} — {w} lb × {r} sets the working weight at {N} lb (about 96% of the tested max).` | Logger, after the test is saved | `src/lib/standing-plan-copy.ts` (`standingWorkingNumberLine`) | "96 percent of your true 1-rep max" | p214, p215 | MATCHES |
| 39 | `{KIND} · {name} {sets}×{reps} · {rir} in reserve @ {weight} — last time {n}` — ME (no reserve), DE/SKILL `3 to 4 in reserve` | Planned workout view, plan summary | SDL:35-85, stamped by materialize-plan | p218 | p218 | MATCHES |
| 40 | same template, HYP → `HYP · {name} 3×6-12 · 1 in reserve` | Planned workout view | SDL:49-51 | 0–2 | p218 | OFF — as #14 |
| 41 | `Superset: {A} with {B} — one set of each, rest, then again.` | Planned workout view | SDL:99 | as #18 | p274 | NOT ON ANY PAGE |
| 42 | `{KIND} · {A} + {B} · superset · {sets}×{reps} · {rir} in reserve` → HYP pair `… · 1 in reserve` | Planned workout view | SDL:112 | 0–2 | p218 | OFF — as #14 |
| 43 | Today drawer list: kind word once as heading, then `{name} · {sets} × {reps} · {weight}` (no reserve) | Today session drawer | `src/utils/strengthFormatter.ts:82-122` (client) | p218 reps and sets | p218 | MATCHES |
| 44 | `By feel` (weight) | Plan lines, drawer, Today | materialize-plan/index.ts:2879, 3313; CMP:1785 | HYP: no % (p218). DE/SKILL/ME: p218 prints 70–80 / 75–85 / 90–100%; p214 needs a tested max on that lift | p218, p214 | NOT ON ANY PAGE (the words) |
| 45 | `— weights arrive once you log the test` | Plan lines | SDL:68-72 | app state | — | NOT ON ANY PAGE (app state) |
| 46 | Plyo row shows `1 × 4 · Bodyweight` | Today drawer, plan lines | CMP:2146-2148; `frames.ts:1459` | "each drill should be performed multiple times" — no count | p227 | NOT ON ANY PAGE — labelled OURS frames.ts:1460-1463 |
| 47 | `{benefit}. Repeat until it feels right and you are confident, then move on. Full rest between. Tired or sloppy, stop.` | Plyo rows: plan lines, Today card | CMP:2160-2161 | "until the movement is optimized for the day and the athlete develops confidence in it; then they move on… **ample rest**… Fatigue, poor form, and imprecise movements are absolute no-nos" | p227 | OFF (minor) — "full rest" for "ample rest" |
| 48 | Lifting-day names `ME: Upper`, `DE: Lower`, `Upper body: Push`, `Lower body: Hinge`, `ME Upper`, `DE: Full` … | Session name everywhere | `frames.ts:439-1073` | the table's day headings | p246, p274, p278 | MATCHES |
| 49 | `Plyometrics` | Session name (plyo day) | CMP:2179 | "Plyo warm-up" | p246, p274, p278 | OFF — the page's name is "Plyo warm-up" |
| 50 | `Week one is a test week: two guided sessions set the numbers the rest of the block is built on…` | Plan description | `plan-row.ts:604-606` | "testing your 5-rep max prior to the program" | p214, p215 | MATCHES |
| 51 | `Week one is prescribed from sets already on file, so there is no test week.` | Plan description | `plan-row.ts:607-608` | p214 asks for a test before the program | p214 | NOT ON ANY PAGE (app policy) |
| 52 | `Endurance training rewards pushing through discomfort. Under a bar that instinct is the wrong one: a higher pain tolerance is of negligible benefit to a strength athlete and can work against long-term health.` | Plan description | `plan-row.ts:540-543` | p125 is quoted only in a code comment (plan-row.ts:516-521): "may be of negligible benefit or even counterproductive" | p125 | NOT ON ANY PAGE in the SOURCE doc — grep SOURCE `pain`, `p125`: 0 hits. Against the code's own quote the hedge "may be" is dropped |
| 53 | `The hard run lands the day before the heavy leg session, so the lower-body weights start about three and a half per cent under where the test put them. That comes back over the first nine weeks.` | Plan description (first three source notes, plan-row.ts:569-571) | CMP:1862-1864 | "a 3 to 4 percent reduction… gradually phased out in eight to ten weeks (2 percent every three weeks for the first nine weeks)" | p247 | OFF (minor) — the band 3–4 printed as 3.5 (OURS, CMP:1861) |
| 54 | `The other lifting days run by feel this week — the numbers arrive once the test is done.` | Plan description (can be one of the three) | CMP:3108-3112 (cites p215) | p215 says nothing about other days | p215 | NOT ON ANY PAGE (app state) |
| 55 | `Stop each drill when the movement is optimised for the day and it feels confident — not on a rep count. Fatigue, poor form and imprecise movements are the signal to move on.` | Plan description (can be one of the three) | `frames.ts:1464-1466` via CMP:2137 | as #47 | p227 | MATCHES |
| 56 | `Accessory sets are 8 to 10 reps with a rep or two left in the tank. Going to failure costs the next main lift.` | Plan builder, "build focus" step (the HYP lifts and supersets) | SC:122-123 → NonRaceBuilder.tsx:5146 | p86: 8–10 reps, 1–2 RIR. But the rows this step lists are HYP slots the plan prints at 6–12 with 1 in reserve (p218 0–2). "costs the next main lift" — no page | p86, p218 | OFF — disagrees with the rows it introduces; sentence 2 on no page (grep SOURCE `next main lift`, `costs the next`: 0 strength hits) |
| 57 | `A {weeks}-week block. Two cycles build, the third measures — the last set of that cycle is the test, so there is no separate retest week.` | Plan builder confirm (Run + Strength) | SC:66-67 | p247 progression is "the circle of reps, with slow gradual increases in the calculated 1RM every 3 to 4 weeks"; p214/p215 test before the program | p247, p214 | NOT ON ANY PAGE — "cycles", "the third measures" and "last set is the test" are the previous program's shape; the same block's description (#50) says week one is the test |
| 58 | `The weights go up as you adapt to the training.` | Plan builder confirm (Run + Ride + Strength, Ride + Strength) | SC:60, 72 | raise load when RPE comes in lower than intended; "adjustment of 1RM… as you improve" | p112, p275 | MATCHES |
| 59 | `…four lifting days, four runs.` / `…Four or five rides, three lifting days.` | Plan builder program blurbs | SC:25-26, 42-43 | four lifting days (p246); three lifting days (p278) | p246, p278 | MATCHES |
| 60 | `Bench, squat and deadlift each need a 1RM of at least 65 lb.` | Plan builder (Ride + Strength requirement) | SC:45-46 | — | — | NOT ON ANY PAGE |
| 61 | `Week one is the test week (p215). The number on file stays until the test replaces it.` / `Nothing on file. Every lift is tested in week one (p215).` | Plan builder "Know your numbers?" | SC:98-99 | p214, p215 | p214, p215 | MATCHES |
| 62 | Swap sheet headings `Primary`, `Secondary`, `Braced`, `Focused`, `Core exercises`, `Carry/drag/pick options` | Logger Swap sheet | `swap-groups.ts:27-34` | the five categories + carry | p218-p223, p226 | MATCHES (the sheet prints no prescription line — read SL:5160-5305) |
| 63 | How-to text, 159 entries (15 marked OURS, the rest cited to ExRx / NSCA / ACE / others) | Logger (i) sheet beside the name | `strength-grid/grid.ts:641-990`, `executionHowTo` :1000 | the book gives no execution steps; 10 entries cite Viada only for the movement's name (p220 ×5, p222 ×1, p227 ×4) | — | NOT ON ANY PAGE (by design; each entry cites a field source or OURS) |
| 64 | `Recent sets are landing below the planned reps in reserve — closer to failure than the plan called for. Held for weeks, that's the fatigue a deload clears.` | State (outside the named surfaces) | `src/components/context/StatePerformanceSection.tsx:747` | HYP 0–2 RIR (p218); deload triggers: ME underperforming two weeks (p245), fatigue (p263, p265) | p218, J4 | OFF — on HYP rows "planned" is the midpoint 1, so a 0 the page allows reads as "below the plan" (inferred from the target, not traced into `strength_rir_below_prescription`) |

**Not counted (not reachable on a screen, by named search):**
- `SET_END_CUE`, `SPEED_SET_END_CUE`, `ACCESSORY_FATIGUE_CUE` (CMP:2216, 2278, 2305) and `STANDING_DE_SET_CUE` (SFC:539) — kept as records, no caller (read CMP:2310-2324).
- Floor / core-pick rows `8-10` + `target_rir 1.5` (CMP:3816-3845, 3975-3981) — behind `ATHLETE_ADDITIONS_ON = false` (CMP:865).
- `RAMP_BAR_CUE` "Empty bar, moved fast." and `RAMP_NOTE` (warmup.ts:45, 58) — grep of `src` for a reader of a set's `cue`: none; `RAMP_NOTE` is imported at CMP:182 and never used.
- `RESERVE_WHEN_NO_TARGET` (SDL:21) — declared, never used. `fallbackUnresolvedPercentDisplay` "2 in reserve" (materialize-plan:1230-1231) — fires only on a `% 1RM` weight string; standing rows carry `By feel`.
- `config.standing_plan_notes` — written at generate-strength-plan:1064, no reader (grep `src` and `supabase/functions`); only up to three `source` notes reach the plan description (plan-row.ts:569-571).
- `golden-block.ts:140` "RIR {n}" — test fixture only.

### 2. Counts

| Verdict | Rows |
|---|---|
| MATCHES | 23 — #1, 2, 3, 4, 5, 8, 9, 10, 15, 20, 29, 30, 32, 38, 39, 43, 48, 50, 55, 58, 59, 61, 62 |
| OFF | 22 — #6, 7, 11, 12, 13, 14, 16, 17, 21, 23, 24, 31, 33, 34, 35, 40, 42, 47, 49, 53, 56, 64 |
| NOT ON ANY PAGE | 19 — #18, 19, 22, 25, 26, 27, 28, 36, 37, 41, 44, 45, 46, 51, 52, 54, 57, 60, 63 |

64 rows. #17 is counted OFF because its HYP half is off (its DE/SKILL half matches).

### 3. One prescription, several places, different words or numbers

1. **HYP reps and reserve — nine places, three different answers.** Should come from one place: `INT:108-120` (`BARBELL.HYP`, p218: 6–12, 0–2).
   - `6-12 · 1 in reserve`: SL:5541-5551 (row), SL:6019-6031 (every set), SDL:49-51 and SDL:112 (planned view), SL:3899 + SL:6344 (RIR box pre-fills and highlights 1). Source of the 1: CMP:829-834.
   - `8 to 12 reps, 1 to 2 in reserve`: SFC:410 (logger accessory line), SL:594 (set-type sheet), TL:123 (Today card, incl. the superset line). Three separate copies of one hard-coded string.
   - `8 to 10 reps with a rep or two left in the tank`: SC:122 (builder).
   - Result on one screen (trigger case): Today / the logger accessory line say 8–12 and 1–2; the row under it says 6–12 and 1; the book says 6–12 and 0–2.
2. **DE instruction.** SL:5549 `move the bar fast` / `move fast` (row) · SL:592 `As fast as possible on every rep. Bar slows, set is over.` (sheet — says "Bar" on dumbbell rows too) · TL:113-114 (same sentence, Bar/Move split). Should come from `INT:86-96` (`BARBELL.DE`, p218/p219).
3. **ME instruction.** SFC:495 `{band} reps, stop short of failure.` · SL:591 and TL:107 `1 to 5 reps, stop short of failure.` Same claim, three copies, "1-5" vs "1 to 5". Should come from `INT:71-85`.
4. **SKILL instruction.** SL:593 and TL:117-119 carry the same four sentences as two copies; the row (SL:5550) carries the numbers. Should come from `INT:97-107`.
5. **How a superset is done.** SL:4878 `Superset · A with B · one set of each, rest, then again` · SDL:99 `Superset: A with B — one set of each, rest, then again.` · SDL:112 `… · superset · …` · TL:222 `{Kind} superset` · strengthFormatter.ts:113 `A + B`. No page prints the instruction; one server string should own it.
6. **The reserve formatter.** `src/lib/rir-format.ts:13-18` (client, used by the logger) and `SDL:25-30` (server, planned view). They differ at 5 and above (`5+` vs `5`).
7. **The last set of the test.** CMP:2047/2062 `Last set as many reps as possible. It sets your numbers.` · TS:97-98 `Last set — as many CLEAN reps… Stop when form breaks.` · SL:2089 `All-out set… moves your training max… never grind solo.` · SFC:357 `As many clean reps as possible. The set ends when the form changes.` (unreachable on a test session, SL:1890). Should come from one p215 string.
8. **The empty bar.** warmup.ts:45 `Empty bar, moved fast.` (not rendered) vs TS:96 `Empty bar — a few easy reps to groove the movement.` (rendered). Opposite speeds. Should come from one p140 string.
9. **Whether there is a test week.** plan-row.ts:604-606 and SC:98 (week one is the test) · SC:66-67 (`Two cycles build, the third measures… no separate retest week`) · CMP:2084-2086 (filtered out of the description at plan-row.ts:571). The builder confirm line contradicts the block description.
10. **What a deload is.** SL:4621 (lighter loads) · SFC:370 `Light on purpose. Move it fast.` (previous program) · StatePerformanceSection.tsx:747 (clears fatigue). The page's version is the TAPER/DELOAD column (p246/p274/p278 substitution). Should come from the frame's own column.
11. **The planned-row sentence itself, rendered four ways.** Server `SDL:35-119` (kind word, reserve, "last time") · client `strengthFormatter.ts:82-122` (Today drawer: no reserve) · client SL:5541-5551 (logger row) · client `AllPlansInterface.tsx:1361-1430` (markdown export: no kind word, no reserve). Should come from the server line only.

**Client re-composition (read):** Today's cues (TL:105-176) are fixed client strings chosen by `slot_intent` and ignore the row's own `target_reps` / `target_rir` the server sent. The logger's set-type sheet (SL:590-595) and accessory line (SFC:410) are client constants. The logger row line (SL:5541) rebuilds from the row's numbers what the server already stamps as `display_line` (SDL:35). The Today drawer (strengthFormatter.ts:82) builds its own list instead of printing `computed.strength_lines`.

---

# Appendix B — Run, ride and swim, line by line


Read-only. Branch `stage/one-truth-drift`. No repo edits, no database, no .env.
Book = `docs/SOURCE-viada-hybrid-athlete.md` (page-cited). Every verdict row names file:line; absence claims name what was grepped.

Three parts:
- **Part A** — the standing plan (Multisport / Run Focus / Ride Focus): names, descriptions, Today lines, the steps as BUILT (library run through esbuild), warm-ups, tests, scheduling notes, builder and Instead-sheet copy.
- **Part B** — the race/combined generators (`generate-combined-plan`, `generate-run-plan`), reached from `create-goal-and-materialize-plan`.
- **Part C** — after the plan: `materialize-plan` step labels, `planned-step-lines`, `quality-work`, `get-week`, and the client screens.

### Counts

| part | lines | MATCHES | OFF | NOT ON ANY PAGE | split / other |
|---|---|---|---|---|---|
| A standing plan | 92 | 55 | 20 | 13 | 3 split, 1 silent |
| B race/run generators | 70 | 9 | 23 | 38 | — |
| C materialize / client | 79 | 22 | 25 | 25 | 7 split |
| **total** | **241** | **86** | **68** | **76** | 11 |

### The largest findings (all three parts)

1. **The run and ride steps in the standing plan follow the pages; the long run does not.** Every MLSS, near-threshold, sweet-spot, anaerobic, VO2 L1, sprint and endurance-ride session builds as printed [built]. The LSD long run with inserted sets (the Run + Strength plan's Saturday (p246 day 6)) builds 3-7 x 2:15 @115% with no recovery at level 2; p235 prints 2 sets of 2 x (1:30 @115% / 30 s VT1). The race-pace finish drops p235's 95% middle interval; the fartlek counts and lengths are off at every level.
2. **The race-tempo row says "race pace, recoveries a quarter longer" (p247) but builds 5 x 3:30 @90% with 60 s rests.** Only the name and sentence change.
3. **The page's warm-ups never reach the row.** Run drills (lunges, Cossack squats) drop; every ride warm-up becomes one block at 55-70% FTP, losing p238's 5 min @95% and p236's cadence sprints. Found independently in Parts A and C.
4. **Wrong-page or contradicted sentences:** the MLSS run's Today line uses p233's near-threshold sentence; "Easy the whole way" sits over a long run with 115% inserts; "Go by heart rate" where p235 says talk test; "Riding hard … costs the lifting less" where p280 says cycling fatigue lowers lower-body performance; "top-end running speed decays" cited to p275, against p119.
5. **Ride + Strength builds p278's Deload rides (5, level 1, flat) under Standard lifting**; the page's Standard week has 7 rides and p281 prescribes a duration progression. The rides screen tells the athlete to go longer by judgement.
6. **The p107 5% drift stop rule and p235's talk test print nowhere in the race generators** (Part B), and the drift rule prints nowhere before a session in the standing plan (removed from Today on purpose).
7. **The race generators (Part B) mostly print copy with no page**: Daniels pace names, bricks, strides, "comfortably hard" for five intensities; sweet spot at 88-94% (page 80-95 by session); VO2 rests 3 min (page 5); text and steps disagree in 7 places.

### Stated in two or more places with different words or numbers

| # | prescription | places (file:line) | should come from |
|---|---|---|---|
| 1 | Session warm-up / cool-down | library `endurance-library/source-rules.ts:137-189` (page boxes) · `standing-plan/session-vocabulary.ts:329-362` (seconds only) · `materialize-plan/index.ts:2272` (ride 55-70%) · `planned-step-lines.ts:165` · `StructuredPlannedView.tsx:201,346` · `generate-combined-plan/session-factory.ts:441,476,2139` (10 min each way) | the library wrapper, carried step by step |
| 2 | Talk test / easy wording | `standing-plan/family-lines.ts:43` ("Talk test twice") · `session-vocabulary.ts:834` ("Go by heart rate") · `planned-step-lines.ts:56` · `StructuredPlannedView.tsx:343` · `effort-words.ts:53,65` · race generators `session-factory.ts:335,350`, `sustainable.ts:758,827`, `performance-build.ts:2073,2239` | one line off p235 (talk test), in `family-lines.ts` |
| 3 | MLSS intent | `family-lines.ts:35` (near threshold) · `session-vocabulary.ts:831` (p231, equalised fatigue) · `intake-readout.ts:80` ("near-threshold efforts") · `hard-slot-choices.ts:398` (dormant) | `FAMILIES.run_mlss.intent`, `source-rules.ts` (p231) |
| 4 | Ride vs run leg cost | `sport-slots.ts:255` ("costs the lifting less") vs `week-conflicts.ts:398-401` (same claim deleted as having no page) vs p280 | p280 — the sport-slots sentence comes off |
| 5 | Run threshold test | `_shared/baseline-test-rows.ts:40-45` (p210, trial 12/10/8 in text, 12 in steps) · `materialize-plan/index.ts:1538-1560` (always 12) · `materialize-plan/index.ts:1668` ("all out and even") · `generate-combined-plan/week-builder.ts:2604-2610` | `baseline-test-rows.ts`, with the trial length carried into the steps |
| 6 | FTP test | `baseline-test-rows.ts:58` (cool-down "5-10 min", token 8 min) · `materialize-plan/index.ts:1515-1531` (5 min) · `materialize-plan/index.ts:2301` ("Maximal Effort") · `week-builder.ts:2580-2588` | `baseline-test-rows.ts` |
| 7 | Race-pace finish on the long run | `endurance-library/source-rules.ts` `race_pace_finish` (5/10/15 min, no 95% interval) · `session-factory.ts:334` (final 50%) · `session-factory.ts:302-313` (30-40%) · `performance-build.ts:775,2061` | the library, with p235's 95% middle interval added |
| 8 | Bike VO2 | `source-rules.ts:236-288` + `generate.ts` (p238, 5-min rest) · `session-factory.ts:597-608` (3-min rest, no 95% warm-up) | the library |
| 9 | Sweet spot | `source-rules.ts:290-382` (p238-239 per session) · `session-factory.ts:614-615` (88-94%) · "Sweet-Spot Run" `session-factory.ts:406` | the library |
| 10 | Strides | `source-rules.ts:608-633` (6 x 30 s, ours, untimed) · `materialize-plan/index.ts:2163+` · `session-factory.ts:376` · `week-builder.ts:2607` · `base-generator.ts:105` · `sustainable.ts:422,437,785` · `performance-build.ts:453,2219,2276` | `SESSION_ADD_ONS.strides` |
| 11 | Pace / power band around a target | `materialize-plan:4004-4011` (±2% / ±6%) · `materialize-plan:725-756` (Friel easy range) · `get-week:787,1097,1196` (±5%) · `quality-work.ts:161` (ride ±10%) | one constant |
| 12 | Target shown as range vs single number | `planned-step-lines.ts:100` (range) · `quality-work.ts:417,456` (single) · `ExecutionScreen.tsx:232,242` (midpoint) | the saved step's range |
| 13 | Recovery words | `planned-step-lines.ts:141,297` ("easy", "jog after each") · `quality-work.ts:441` · `StructuredPlannedView.tsx:203` · `materialize-plan:1522,1862,1882,2221,2293` | the library step's page word (walk/jog, easy spin, @60%, VT1) |
| 14 | All-out | `planned-step-lines.ts:58` (run only) · `quality-work.ts:432` · `materialize-plan:1860,2376` ("Sprint") · `materialize-plan:2301` · `family-lines.ts:27` | `planned-step-lines.ts:58`, applied to every all-out step |
| 15 | Easy-ride watts | `materialize-plan:2258` (0-75%) · `materialize-plan:2261` (Coggan 56-75%) · `family-lines.ts:31` ("under 75 percent") | p239 "below 75%" (`quality-work.ts:188`) |
| 16 | Session name | row `name` (`session-vocabulary.ts:404-425`) · `UnifiedWorkoutView.tsx:623-694` · `WorkoutCalendar.tsx:231` ("BK-VO2" on the anaerobic ride) · `preview-week-read.ts:96-107` · builder rows (`intake-readout.ts` → library labels "Above threshold", "Easy") | the `family:` tag through `FAMILY_LABEL` |
| 17 | Metric pace unit | `planned-step-lines.ts:100` (/mi) vs `:148` (/km) · `StructuredPlannedView.tsx:248` · `ExecutionScreen.tsx:52` | `display-format.ts` |
| 18 | Swim | library `swim_endurance` (1 x 600 at L1; page 2 x 600) · `materialize-plan:621-678` · `swim-plan-summary.ts:86` · `session-factory.ts:108-113` (conversation fallback on hard swims) · open-water sighting in strokes `session-factory.ts:1136,1842,1998` (page: seconds) · swim test `week-builder.ts:2557-2566` vs `session-factory.ts:1791-1793` | the library swim (p240-241) |
| 19 | Long-run cap | `performance-build.ts:1700-1709, 2083` (150/180 min "per Daniels") · `frames.ts:1164` (90 min chip ceiling) · `source-rules.ts` `VT1_CONTINUOUS_CAP_SECONDS` (2 h, p108) | p108 / p247 |
| 20 | Two-a-day spacing | `spacing-line.ts:96` (6-8 h always) · `week-conflicts.ts:421,579` (6-8 h) · page p143 (4-6 h after a sub-hour VT1) | `spacing-line.ts`, with the 4-6 h case |

---

## Part A — Standing plan (Multisport / Run Focus / Ride Focus): run, ride, swim lines

Scope of this part: `_shared/endurance-library/`, `_shared/standing-plan/` (compose, session-vocabulary,
family-lines, frames, sport-slots, week-conflicts, spacing-line, setup-copy, intake-readout, plan-row),
`_shared/session-swap/`, `_shared/baseline-test-rows.ts`, `src/lib/today-lines.ts`, `src/lib/hard-slot-choices.ts`.

Evidence labels used below: **[code]** = read the code; **[built]** = generated output — I bundled the real
library + `translateEnduranceSession` with esbuild and ran every family x level x archetype x size
(0 / 0.5 / 1) against a test athlete (threshold 8:00/mi, FTP 250 W); output in
`scratchpad/probe/out.jsonl`. **[inferring]** = not traced to the screen.

Book = `docs/SOURCE-viada-hybrid-athlete.md`. "Grepped" = case-insensitive grep of that file.

### A1. Session names (plan row `name`) — printed on Today, the planned-session sheet, the week list

| line as printed | where it prints | code | book | page | verdict |
|---|---|---|---|---|---|
| `Hard Run` (MLSS family) | Today, planned sheet, week [code: `name` on the row] | session-vocabulary.ts:404 | heading "Maximal Lactate Steady State — MLSS"; table token "MLSS+" | p231, p246, p274 | NOT ON ANY PAGE (grepped "Hard Run" — 0). Name is ours. |
| `Near-threshold Run` | same | session-vocabulary.ts:405 | heading "Near-Threshold — NT" | p233 | MATCHES |
| `Easy Run` | same | session-vocabulary.ts:406 | "VT1" | p235 | NOT ON ANY PAGE as a name (grepped "Easy Run" — 0); plain word for VT1, ours |
| `Long Run` | same | session-vocabulary.ts:407 | "Long Slow Distance — LSD"; p247 "Saturday's LSD", p275 "long slow run" | p235, p275 | MATCHES (plain form of LSD/LSR) |
| `Hard Ride` (sweet spot) | same | session-vocabulary.ts:410 | heading "Sweet Spot" | p238 | NOT ON ANY PAGE (grepped "Hard Ride" — 0); ours |
| `Anaerobic Ride` | same | session-vocabulary.ts:417 | "Anaerobic — AnA" | p237 | MATCHES |
| `VO2 Ride` | same | session-vocabulary.ts:422 (comment: "PROPOSED, NOT APPROVED") | "VO2" | p238 | MATCHES the page word; code says the name is unapproved |
| `Sprint Ride` | same | session-vocabulary.ts:423 (same flag) | "Sprints" | p236 | MATCHES the page word; unapproved |
| `Ride` (endurance) | same | session-vocabulary.ts:424 | "Endurance" | p239 | NOT ON ANY PAGE as a name; ours |
| `Easy Swim` | same | session-vocabulary.ts:425 | swim sessions named Endurance / Speed / Open water | p240-241 | NOT ON ANY PAGE; ours |
| `{name} (race tempo)` | same | session-vocabulary.ts:782 | taper column "NT (race tempo) (level 1)" | p246 | MATCHES |
| `Threshold Time Trial` | Today, planned sheet (week one) | baseline-test-rows.ts:37 | "Establishing your VO2 max pace and threshold pace" — a time trial | p210 | MATCHES |
| `FTP Test — 20-Minute Protocol` | same | baseline-test-rows.ts:55 | "The 20-Minute Test" | p212 | MATCHES |
| `FTP Test — 5-Minute All-Out` | same (Baselines button) | baseline-test-rows.ts:88 | not in the book corpus; the code cites the hybrid-coach course Module 3 | — | NOT ON ANY PAGE (grepped "5-minute", "5 minute", "all-out" near FTP — only p212/p213 20-min and ramp tests) |

### A2. Session descriptions (plan row `description`) and the Today line

The drawer prints `description` [code: session-vocabulary.ts:797-839]. Today prints the family line alone,
recomputed on the phone from the row's tags through the same `familyLineFor` [code: src/lib/today-lines.ts:262-273].

| line as printed | where it prints | code | book | page | verdict |
|---|---|---|---|---|---|
| `Spend as much time near threshold as you can while controlling fatigue.` — on the **MLSS** run | Today + drawer | family-lines.ts:35 | p231 MLSS: "Emphasises time spent in **zone 4**; the objective is accruing maximum time with equalised fatigue." The quoted sentence is p233's NEAR-THRESHOLD intent. | p231 | **OFF** — wrong page. MLSS is zone 4 (above threshold, work at 100-130%); the line calls it "near threshold". The comment at family-lines.ts:17-19 says the MLSS key was added so it would not print nothing. |
| same sentence on the near-threshold run | Today + drawer | family-lines.ts:36 | "Maximise time near threshold … while controlling fatigue." | p233 | MATCHES |
| `Fatigue spread evenly across the rounds. Hills are fine, adjust pace to hold the effort.` (MLSS) | drawer only | session-vocabulary.ts:831 | "accruing maximum time with equalised fatigue"; "Work intervals may be run on hills with pace adjusted to hold target intensity." | p231 | MATCHES |
| `Easy. Talk test twice, at 5 minutes and at 20.` (VT1) | Today + drawer | family-lines.ts:43 | "Practise the talk test at least twice per run **if unsure** — once after 5 minutes and once after 20." | p235 | MATCHES (drops "if unsure") |
| `Easy the whole way. Stopping for a bit is fine.` (LSD) | Today + drawer | family-lines.ts:41 | "primarily below VT1"; "may include rest periods or pauses … with little negative impact". Every LSD example except the hike carries harder work (sets at 100-115%, a race-pace finish, a 95% interval, a fartlek at 85%). | p235 | **OFF** on the long run as built: the Run + Strength frame's (p246) long run is `long_with_inserts` [code: frames.ts:535] and prints inserts at 115% [built], so "easy the whole way" contradicts the steps under it. MATCHES only for the hike. |
| `Go by heart rate. Pace varies with fatigue, hydration and weather.` (VT1 and LSD) | drawer | session-vocabulary.ts:834 | "The precise percentage of threshold may vary with fatigue, hydration and environment. Practise the talk test…" | p235 | **OFF** — second half matches; "Go by heart rate" is not the page's instruction (the page says talk test). p211 does define a VT1 heart rate, but only from the talk-test ramp, which the app does not run; the app's easy HR zone is % of LTHR (ours, D-462). Same drawer then prints both "go by heart rate" and (Today) "talk test". |
| `Run at race pace, with the recovery periods a quarter longer than usual.` (race-tempo row) | drawer | session-vocabulary.ts:837 | "If within six weeks of a race, increase the pace here to race pace, but extend recovery periods by 25 percent." | p247 | Words MATCH. **The steps do not**: `raceTempo` changes only the name and this sentence [code: compose.ts:3307; grep of `raceTempo` in compose.ts, endurance-library/, materialize-plan finds no other use]. The row is built as `below_threshold` level 1 = `interval_5x210s_90pct_R60s` [built] — 90% of threshold, 60 s rests. The sentence says race pace and 75 s rests. |
| `Easy ride, under 75 percent of FTP the whole way.` | Today + drawer | family-lines.ts:31 | "60-100-min easy ride below 75%" | p239 | MATCHES; "of FTP" is the inferred cycling basis (the code's own note calls it ours) |
| `Easy ride with a block of 2-minute pushes, then a 10-second sprint every {n} minutes. Everything else under 75 percent of FTP.` | Today + drawer | family-lines.ts:52 | L1 "20-min easy spin · 4 rounds of (2 min @ 80% / 3 min @ 70%) · 45 min @ VT1 with a 10-second all-out sprint every 9 minutes"; L2/L3 print 2 or 3 SETS of those rounds | p239 | MATCHES at level 1. OFF at levels 2-3 ("a block" where the page prints 2-3 sets). "Everything else under 75%" puts the VT1 bout under 75% of FTP; the page says "@ VT1" and gives no number. |
| `Spend a few minutes of the ride paying attention to how you pedal (smooth circles, not stomping) and how you sit on the bike.` | drawer | family-lines.ts:75 | "several minutes of every long ride on pedal stroke and position" | p239 | **OFF** — the parenthesis "smooth circles, not stomping" is not on the page (grepped "circle", "stomp" — 0). Rest matches. |
| `Go by feel. Stay above the floor. No ceiling. Each set harder than the last.` | Today + drawer | family-lines.ts:27 | "Best done by feel with a power FLOOR rather than a specific power target — the numbers are guidelines." Option 1 only: "Each set should start at 110% and progress to 125-130% by the end." | p237 | Partly OFF. "Feel" and "floor" MATCH. "No ceiling" is a reading of "110-115%+" (not a page sentence). "Each set harder than the last" belongs to the progressive option only; it prints on every anaerobic ride, including `one_to_one` (10 x 1 min @ 110%, flat) and `sandwich` (30 s @ 120% / 2:30 @ 90% / 30 s @ 120%, flat) [built]. |
| `On Zwift, turn ERG off.` | drawer (+ Garmin/Intervals description per comment) | family-lines.ts:83 | "by feel with a power floor rather than a specific power target" | p237 | NOT ON ANY PAGE (grepped "Zwift" 0, "ERG" 0 outside "ski erg"). A derived instruction. |
| `As close to threshold as you can without going over.` | Today + drawer | family-lines.ts:45 | "As close to threshold as possible without exceeding it" | p238 | MATCHES |
| (no line) VO2 ride, sprint ride, swim | — | family-lines.ts:24-46 | — | p236, p238, p240 | silent by design |

### A3. What the steps are built from — the session structure vs the page [built]

The athlete sees these as the step list in the drawer and on the watch (materialize expands the tokens;
the wording of each step is in Part C). Only the structure is judged here.

| session (as built, size 0.5) | token | book | page | verdict |
|---|---|---|---|---|
| MLSS surge/float L1-3 | `round_6x_15s130-45s105-r60svt1`; L2 2x4, L3 3x4, 120 s between sets | 6 rounds / 2x4 / 3x4 of 15 s @130% / 45 s @105% / 1 min @VT1, 2-min walk/jog between sets | p231-232 | MATCHES |
| MLSS forty-twenty L1-2 | 3x4 / 5x4 of 40 s @130% / 20 s @50%, R120 | same | p231-232 | MATCHES |
| MLSS long surge L1-3 | 2x3 / 2x4 / 3x4 of 45 @125 / 45 @115 / 30 @100 / 90 @VT1 (L3 60/60) | same | p232 | MATCHES |
| MLSS descending ladder L1-3 | 180/120/60/45/30 @120 with 2/3 recovery @60; L2 second round from 120 s; L3 3 rounds, 120 s between | same | p231-232 | MATCHES (last 20 s @60% of each round is not emitted) |
| NT short above L1-3 | 2x4 of 1 min @105 / 1 min @90, R180; L2 3x4 and L3 4x4 with 1:30 @90 | same | p233-234 | MATCHES |
| NT race-specific (p233 line) | 2x5 min / 4x4 / 4x5 @105, 3 min VT1 between | p233 line; "3-5 min recovery walk/jog" | p233-234 | MATCHES (3 min = low end) |
| NT sustained L3 (Run + Strength frame, p246 day 3) | 8x5 @90 R90 · 6x6 @88 R60 · 4x8:30 @85 R60 | same three lines; p247 asks for 5-8 min work intervals | p234, p247 | MATCHES |
| NT below-threshold L1-2 / long L1-2 | 5x3:30 @90 R60, 6x4 @90 R60, 3x6 @88 R60, 5x6 @88 R60 | same | p233-234 | MATCHES |
| NT embedded surge / opening surge | 4 rounds of 2 @95 / 15 s @115 / 1:15 @95 / 2 @90 / 1:30 VT1; 5 rounds of 20 s @140 / 4:40 @92 / 1 min easy | same | p233-234 | MATCHES |
| VT1 easy run L1/L2/L3 | 25-30 / 45-60 / 80-90 min incl. strides | 25-30 / 45-60 / 80-90 | p235 | MATCHES |
| Strides on the easy run | `strides_6x30s`, untimed recovery | "a handful of strides before, during or after other running sessions" | p109 | placement MATCHES; 6 x 30 s is OURS (labelled in code, source-rules.ts:625) |
| **LSD long with inserted sets** (Run + Strength frame, p246 day 6) | L1 `longrun_62min + round_14x_30s115`; **L2 `longrun_108min + round_5x_135s115`** (3-7 reps by dial); L3 6 x 4 min @115 | L1 "45-min VT1 run with 2 sets; the sets are 2 rounds of 30 s @100% / 30 s @90%"; L2 "1-hour VT1 run with 2 sets; 2 rounds of 1:30 @115% / 30 s @VT1"; L3 "3 sets of 3 rounds of 1 min @115% / 30 s VT1, or 2 rounds of 4 min @95% / 1 min VT1" | p235 | **OFF** at every level. L2: 2:15 reps instead of 1:30, 3-7 reps instead of 2 sets of 2, no 30 s VT1 recovery in the token. L1: 115% where the page prints 100%/90%, 8-20 reps instead of 4. L3: 4 min at 115% (page pairs 4 min with 95%). The archetype is a band (`repBand 30-240 s`, work 95-115%, source-rules.ts:1124-1132), not the printed sets. |
| LSD race-pace finish L2/L3 | 1 x 10 min / 15 min race pace at the end | L2 "60 min @VT1 with a single 5-min @95% interval in the middle, 10-min race-pace finish"; L3 "90-120 min … single 10-min @95% in the middle, 15-min race-pace finish" | p235 | **OFF** — the 95% middle interval is not built |
| LSD fartlek | L1 4 x 3 min @85 · L2 6 x 3:30 @85 · L3 10 x 4 min @85 | no L1 fartlek; L2 "1.5h VT1 fartlek targeting 6 x 3 min @85%"; L3 "2-2.5h … 6 x 4 min @85%" | p235 | **OFF** — offered at L1 where the page has none; L2 3:30 reps (page 3:00); L3 10 reps (page 6) |
| Ride sprints L1-3 | max effort 3/5/6 x 2-3 min all-out, R330 s; flying 8 x 30 s, 2x5, 2x6, R150 | same | p236 | MATCHES (150 s / 330 s = middles of printed ranges, ours) |
| Ride anaerobic progressive L1-3 | 10 x 45 s / 60 s / 90 s rising 110→130%, R300 | "6-10 x 45 s / 1 min / 1:30 @110-115%+ … start at 110% and progress to 125-130%", 4-6 min rec | p237 | MATCHES |
| Ride anaerobic one-to-one, sandwich | 10 x (1 @110 / 1 @50); 2x7; 2x8 @120 · 5 x (30 @120 / 2:30 @90 / 30 @120), 4 min spin | same | p237 | MATCHES |
| Ride VO2 long L1-3 | 5 x 3 / 4 / 5 min @110-120, R300 | same | p238 | MATCHES |
| Ride VO2 short (1:30 @115 / 1:30 easy) | L1 2x6 ✓; **L2 2x7 (2x9 at the top of the dial); L3 2x9 (2x11)** | L1 2x6, L2 2x8, L3 2x10 | p238 | MATCHES at L1 (the only level Cycling Base uses); OFF at L2/L3 (count comes from the dial, not the page) |
| Ride VO2 micro L1-3 | 4x5 / 4x8 of 30 @125 / 30 @85; L3 40/20 | same | p238 | MATCHES |
| Sweet spot, all four shapes L1-3 | as printed incl. surge on the minute, 8 x (2 @95 / 2 @100) at L3 | same | p238-239 | MATCHES |
| Endurance ride steady | L1 60-100 min ✓; **L2 130-210; L3 180-300** by dial | L1 60-100; L2 2.5-3.5 h (150-210); L3 3.5-5 h (210-300) | p239 | MATCHES at L1; OFF at the low end of L2/L3 (130 and 180 min are under the page's floor) — the band mixes in the with-work ride (source-rules.ts:292-296) |
| Endurance ride with work L1-3 | 20 min + 1/2/3 sets of 4 x (2 @80 / 3 @70) + 45/60/90 min VT1 with 10 s sprint every 9/8/9 | same | p239 | MATCHES |
| Easy swim (swim_endurance L1) | `swim_warmup_300m swim_aerobic_1x600m_r150` | "200 m as 25 easy / 25 drill · 3 x 50 as 25 easy / 25 sprint, 10 s rest · 2 x 600 @ easy-to-moderate, 2-min rest" | p241 | **OFF** — one 600 where the page prints two; the 3 x 50 is not built; L2 builds 1 x 1100 (page 3x600 or 2x1000) |

#### A3b. Warm-ups and cool-downs as they reach the row [code: session-vocabulary.ts:329-362, materialize-plan/index.ts:2270-2288]

| line as built | book | page | verdict |
|---|---|---|---|
| Run MLSS / NT: `warmup_run_10min_easy` … `cooldown_run_8min_easy` | "10-min easy jog · 3 sets of 20 m walking lunges · 2 sets of 10 per side Cossack squats"; "8-min easy jog" | p231, p233 | **OFF (partial)** — the library holds the lunges and Cossack squats (source-rules.ts:150-159) but `wrapperTokens` only sums timed steps, so the two drills never reach the row. Jog minutes and cool-down MATCH. |
| Every ride warm-up → one step `warmup_bike_quality_{n}min_fastpedal`, 55-70% of FTP (materialize, marked OURS) | p236 sprints: "10-min easy spin · 4 cadence-only 15-second sprints … 3-min rest between"; p238 VO2: "15-min easy spin · 5 min @95% · 5-min easy spin"; p237/p238 anaerobic, sweet spot: "10-15 min easy spin" | p236-238 | **OFF** for sprints (the 4 cadence sprints disappear into 20 min at 55-70%) and VO2 (the 5 min at 95% becomes 55-70%). Anaerobic / sweet spot: time MATCHES (12:30 → 13 min, midpoint ours); the 55-70% band is ours. |
| No ride cool-down | none printed for any cycling family | p236-239 | MATCHES |

### A4. Test-week instructions

| line as printed | where | code | book | page | verdict |
|---|---|---|---|---|---|
| Run test description: `…PREPARATION: flat route or track; heart rate strap on. WARM-UP: 6–8 min easy jog; 2 x 100 m strides, slow to near full tilt; 3 x 30 s at your fast (mile-PR) pace with 1 min easy walk/jog between; then 1 min rest. TRIAL: … 12 minutes (under 2 years of training), 10 minutes (2–4 years) or 8 minutes (4+ years) — start at 9.5 out of 10, finish at 10 out of 10, even the whole way … COOL-DOWN: 8–10 min easy. RESULT: … takes 88% of that speed as your threshold pace` | planned sheet (week one / Baselines) | baseline-test-rows.ts:40 | steps 1-6 as quoted; threshold speed = 88% of vVO2 speed | p210 | Protocol and result MATCH. NOT ON ANY PAGE: "flat route or track; heart rate strap on" (the SOURCE transcription lists none; grepped "flat", "strap" — 0), "even the whole way", the 8-10 min cool-down (code marks it ours). |
| Run test steps: 7 min jog · 2 x 20 s strides with 1 min · 3 x 30 s fast / 1 min · 1 min rest · `Time trial — {n} min…` · 9 min cool-down | watch / step list | materialize-plan/index.ts:1538-1560 | as above | p210 | MATCHES the protocol; **the trial is always 12 min** — the row's preset is fixed `run_tt_12min` (baseline-test-rows.ts:45), so the 10- and 8-minute trials the description offers are never built. |
| FTP test description: `…PREPARATION: indoor trainer recommended… WARM-UP: 5–10 min easy; 3 x 1 min at low resistance and high turnover with 1 min rest between; 3 min easy; 3 min at 9 out of 10; 6–8 min easy. TEST: … 20 minutes at your best even effort … COOL-DOWN: 5–10 min easy. RESULT: your FTP is the 20-minute average power x 0.95` | planned sheet | baseline-test-rows.ts:58 | "5-10 min easy; 3 x 1 min high turnover / 1 min rest; 3 min easy; 3 min at 9/10; 6-8 min easy; 20 min best effort; FTP = 20-min average watts x 0.95" | p212 | MATCHES. Not on the page: "indoor trainer recommended", "low resistance", the cool-down (ours). |
| 5-minute FTP test description `…start as hard as you can hold and hang on until five minutes are up. There is no pacing strategy, which is what makes it repeatable…` | planned sheet | baseline-test-rows.ts:92 | — (course module, not the book) | — | NOT ON ANY PAGE of the SOURCE doc (grepped "5-minute", "hang on", "repeatable" — 0) |
| `The 20-minute FTP test (p212) is scheduled into week one.` / `The threshold time trial (p210) is scheduled into week one.` | Know your numbers? | setup-copy.ts:104-110 | protocols exist | p210, p212 | MATCHES. ⚠️ prints the page number on screen, against the "citations live in the ledger" rule. |
| `If you're coming back from a riding break, make sure your FTP is current.` | Ride + Strength confirm | setup-copy.ts:74 | p275 (All Rounder): "pretesting before a race program ensures it reflects current potential" | p275 | NOT ON ANY PAGE for Cycling Base (p278-281 grepped "FTP", "break", "current" — nothing); nearest idea is p275's |

### A5. Scheduling notes composed on the server

| line as printed | where | code | book | page | verdict |
|---|---|---|---|---|---|
| `Two sessions today. Keep them six to eight hours apart.` | Today (`spacing_lines` from get-week) | spacing-line.ts:96 | "Allow at least 6-8 hours before the resistance session; if the morning session is a VT1 session lasting under an hour, 4-6 hours may be sufficient, with one full meal in between." p108: 6-8 h between two-a-days | p143, p108 | **OFF (incomplete)** — prints on every two-session day, including a sub-hour easy run where the page allows 4-6 h; the full meal is dropped |
| `Lift first and keep the {run\|ride} easy.` | Today (chevron) | spacing-line.ts:108 | rule 5: work that benefits from pre-fatigue goes last, almost always VT1 | p143 (rule 5) | MATCHES (condition already requires an easy session) |
| `Lift first.` | Today | spacing-line.ts:108 | rule 6: skill movements best in the first session; p77 go in fresh | p143, p77 | MATCHES |
| `{Running\|Riding} first costs the lift its skill and speed sets.` | Today | spacing-line.ts:110 | "Skill movements are best in the first session, being freshest"; p77 fatigue "can impair proper motor unit recruitment" | p143, p77 | OFF (stronger than the page: the page says best first, not that the sets are lost) |
| `{day}: hard ride and heavy legs. Lifts in the first session, 6 to 8 hours before the ride.` | plan builder (`placement_compromises`) | week-conflicts.ts:421 | rule 6 + p108 | p143, p108 | MATCHES |
| `{day}: heavy legs after {session}. Tired legs cause you to lift slowly and establish improper coordination patterns.` | builder | week-conflicts.ts:306 | "if you're tired, you move slowly, lift slowly … learn improper coordination patterns" | p77 | MATCHES |
| `{day}: {session} after heavy leg training. Legs will be fatigued, session suffers.` | builder | week-conflicts.ts:309 | consolidating stressors; keystone sessions need the relevant systems fresh | p130-131 | MATCHES (paraphrase) |
| `{Mon} heavy legs, {Tue} long run. The run is on legs that have not recovered.` | builder | week-conflicts.ts:463 | p86: a 14+ set session diminishes other modalities 24-72 h; 6-8 sets only marginally | p130-131, p86 | OFF (stated for every heavy day; p86 makes it depend on the set count) |
| `{day} has {a} and {b} on it. The speed day is prescribed for bar speed rather than load, and bar speed drops on legs that have already gone hard the same day.` | builder | week-conflicts.ts:517 | DE = bar speed; rule 3b | p218-219, p139-145 | MATCHES |
| `{day}: heavy legs and an easy run. The run is cut by a third.` | builder | week-conflicts.ts:547 | "you **could** cut your VT1 run volume by a third or so after a hard leg workout and get the same overall adaptations" | p143-144 (rule 5) | MATCHES the number; the page offers it as an option, the plan always applies it |
| `{day} has {list} on it. Six to eight hours between them, and the second one runs on legs that have already worked.` | builder | week-conflicts.ts:579 | 6-8 h between two-a-days | p108 | MATCHES |
| `No day this week is clear. The program's week rests on {day}, and {x} took it.` | builder | week-conflicts.ts:602 | rule 7: a rest day is not always needed | p145 | MATCHES (a fact, no prescription) |
| `At this many hours, rest day becomes active recovery.` | builder | compose.ts:3545 | rule 7: "an easier activity can be more rejuvenating than sitting at home" | p145 | MATCHES |
| `You asked for {h} of {running} across {n} runs. That many runs hold {h2}, so the week builds that. Add a run day to fit the rest.` | builder | compose.ts:3590 | — | — | NOT ON ANY PAGE (code marks it OURS); ends on an imperative |
| `You asked for {h} of {running}. This week's runs hold {h2}, so the week builds that.` | builder | compose.ts:3628 | — | — | NOT ON ANY PAGE (OURS, marked) |
| `The hard run lands the day before the heavy leg session, so the lower-body weights start about three and a half per cent under where the test put them. That comes back over the first nine weeks.` | plan description (one of the first three sourced notes — inferring it prints) | compose.ts:1862 | "a 3 to 4 percent reduction … phased out in eight to ten weeks" | p247 | MATCHES (3.5 = midpoint, ours) |
| `The hard session is on the bike. Riding hard does not land on the legs the way running does, so the intensity costs the lifting less.` (and count variants) | plan description (source note — inferring) | sport-slots.ts:248-256 (cite string itself says "p280 — UNVERIFIED") | p280: "cycling can be surprisingly taxing on the central nervous system … fatigue will mask fitness … expect somewhat lowered performance on the lower body days … lower your working max by a few more percentage points" | p280 | **OFF — the page says the opposite.** week-conflicts.ts:398-401 already deleted "Riding hard costs the legs less than running hard does" as having no page; this copy of the claim survives. |
| `The running keeps its long session and loses its hard one. Base endurance holds on that; top-end running speed decays.` | plan description (source note — inferring) | sport-slots.ts:890 (cites p275) | p275 has no such line. p119: "continue to train running economy …, maintain your threshold …, and base … no quality should be allowed to deteriorate completely." | p275, p119 | **NOT ON p275**, and it runs against p119 |
| `The two quality runs and the long run are prescribed at the smaller of the source's own sizes, which is the answer given for running experience. …90-to-100-minute long run is stated as the more proficient runner's figure.` | plan description (inferring) | compose.ts:3392 | taper column at level 1; "runs up to 90 to 100 minutes" for proficient runners | p246-247 | MATCHES |
| `An extra easy run, because the running already on file supports it. The source recommends one or two for more advanced runners, to test recovery.` | plan description (inferring) | compose.ts:3419 | "adding one or two VT1 sessions initially to test recovery" | p247 | MATCHES |

### A6. Plan builder and Instead sheet copy (run / ride)

| line as printed | where | code | book | page | verdict |
|---|---|---|---|---|---|
| `A series of near-threshold efforts. Choose the workout on the day.` (hard run row) | plan builder | intake-readout.ts:80 | Hard run rows are MLSS+ (zone 4, above threshold) and NT | p231, p233, p246, p274 | **OFF** on the MLSS row (it is above threshold). "Choose the workout on the day" is an app promise, not a page line; the Instead sheet now offers it on hard sessions (workout-choice.ts) |
| `A series of efforts near or above threshold. Choose the workout on the day.` (hard ride row) | plan builder | intake-readout.ts:81 | sweet spot is below threshold ("without exceeding it"); anaerobic above | p237-238 | MATCHES |
| `You get stronger. Your speed and mileage hold. Twelve weeks: four lifting days, four runs. The long run stays under 100 minutes.` | Train card (Run + Strength) | setup-copy.ts:32 | four lifting days, four runs; long run "up to 90 to 100 minutes" | p246-247 | Counts and 100 min MATCH. "Your speed and mileage hold" NOT ON ANY PAGE (grepped "hold" in E1 — none about running); "Twelve weeks" OURS (marked) |
| `…comfortable running a full hour; the week holds about three hours of running and seven to nine hours of training in all.` | Train card | setup-copy.ts:34 | — | — | NOT ON ANY PAGE (marked OURS in code) |
| `For newer riders and riders coming back. … Four or five rides, three lifting days.` | Train card (Ride + Strength) | setup-copy.ts:42 | "intermediate to advanced cyclists … less experience, run Base for at least 4 weeks first"; STANDARD week prints **seven** rides, DELOAD five | p278, p280 | **OFF** — the plan's standard week is p278's DELOAD rides (5, all level 1) under STANDARD lifting (frames.ts:943-950, a work-order choice); four rides is ours. The page's standard seven rides and its level 2 long ride are never built. |
| `If easy rides are kept conversational, use your own judgement to go longer.` | rides screen | setup-copy.ts:144 | p281: Tuesday and Friday endurance rides hold one duration for a 1-month cycle and step up between cycles; the Saturday long ride steps up every 1-2 weeks | p281 | **OFF** — the page prescribes a structured duration progression; the app builds the rides flat ("Rides do not get longer week to week", frames.ts:949) and hands the progression to judgement. "Conversational" (talk test) is p211's, not p281's. |
| `Pick how long the long run is. The easy run is {minutes} minutes. The two hard runs rotate.` | runs screen | setup-copy.ts:153 | easy run 30 min = p235 L1 top; nothing on p246-247 says the hard runs rotate | p235, p246 | Easy minutes MATCH; "The two hard runs rotate" NOT ON ANY PAGE (the rotation of shapes is ours; p229's "try each type" is about choice, not a weekly rotation) |
| `Your history supports a {n}-session endurance week — {x} extra easy run(s) ({source}).` | builder | intake-readout.ts:254 | "adding one or two VT1 sessions initially" for more advanced runners | p247 | MATCHES (the history gate is ours) |
| Instead sheet workout names, e.g. `Surge and float · {n} min`, `Long surge with a near-threshold float`, `Threshold block with an embedded surge`, `Progressive repeats`, `Surge, sustain, surge`, `Tempo blocks`, `Micro-intervals` | Instead sheet | workout-choice.ts:275 (labels: source-rules.ts) | the pages print numbers, no names, except "The descending ladder" (p231) and "Race-specific NT" (p233) | p231-239 | NOT ON ANY PAGE for the rest (grepped "float" — 0 hits; "surge" only p236 "flying surges"). **"Long surge with a near-threshold float" is OFF on its numbers**: the "float" is 115% of threshold (source-rules.ts:767) |
| `Same session, indoors.` / `Same session, indoors. Ground impact still counts.` | Instead sheet | session-swap/copy.ts:22, 29 | "any modality with a power meter that is relatively non-impact … as long as they know their threshold in each"; "impact with the ground on at least one day" | p275 | MATCHES |
| `Hike` option on the long run | Instead sheet | session-swap/copy.ts:116 | "The weekend LSR can be a hike…"; LSD hike | p275, p235 | MATCHES |

### A7. Library notes that do NOT reach the athlete [code]

`CARDIAC_DRIFT_NOTE`, `TALK_TEST_NOTE`, `SPRINT_PACING_NOTE`, `POWER_FLOOR_NOTE`, `FORM_FOCUS_NOTE`,
`STRIDES_NOTE`, `INFERRED_CYCLING_BASIS_NOTE`, the open-water notes (source-rules.ts:522-678) ride on the
library session's `notes`; compose keeps those sessions only for the ledger (compose.ts:4213), and a grep of
each constant name outside `endurance-library/` finds only a comment (session-vocabulary.ts:807). Block
notes of kind `ours` (e.g. `SWIM_IS_EASY_ONLY`, `RIDE_EQUIVALENCE_IS_OURS`) go to
`config.standing_plan_notes`, which plan-row.ts:76 says nothing renders. `VARIANT_BODY` and
`FAMILY_FACT_BODY` (src/lib/hard-slot-choices.ts:375-401) are behind `HARD_SHAPE_IS_ENGINES` and do not
print. The p107 5% drift rule therefore prints nowhere before a session (it was taken off Today and the
drawer on purpose, today-lines.ts:250-258).

---

## Part B — race / combined generators (full detail)

## Endurance athlete-facing text — generate-combined-plan + generate-run-plan vs Viada

Read-only audit, 2026-09-18, branch stage/one-truth-drift. No edits, no DB, no .env.

### How to read this

- **Evidence labels.** "read the code" = I opened the line. "inferring" = not traced end to end.
- **Where it prints.** Both generators return `name` + `description` per session. Combined: serialized at
  `generate-combined-plan/index.ts:506-512` (name, description, steps_preset, zone_targets…). Run: `createSession`
  at `generate-run-plan/generators/base-generator.ts:491-507`. Both are called by
  `create-goal-and-materialize-plan/index.ts:1809` (combined) and `:4389` / `:3338` (run, incl. retest) — read the code.
  The screen is **inferring**: name/description → `planned_workouts` via materialize-plan → planned-session sheet /
  calendar row. Abbreviation below: **PS** = planned-session name/description (inferring).
- **`zone_targets` does not print.** I grepped `zone_targets` in `materialize-plan/`, `activate-plan/`, `get-week/`
  and `src/` — zero hits. So zone lines (e.g. `'Z2, last 30–40% at marathon pace'`) are listed only where they
  contradict the printed description.
- **Swim drill / gear sentences** (`swimSessionPhilosophyLead`, `swimDrillBlockAthleteCopy`, `buildSwimGearLine`)
  are composed into swim descriptions but live in `src/lib/plan-tokens/swim-drill-tokens.ts` — left to the src/ auditor.
  For reference: `'Hard swim day: prime stroke integrity before high-output repeats.'` (:753),
  `'Race rhythm session: groove stroke quality early, then hold sustainable pacing.'` (:751),
  `'Efficiency-first: sharpen one or two mechanics before aerobic volume so every yard transfers to the race.'` (:749).
- **Book greps used for NOT ON ANY PAGE** (all in `docs/SOURCE-viada-hybrid-athlete.md`, case-insensitive, hit counts):
  rpm 0 · brick 0 · CSS 0 · "Critical Swim" 0 · shakeout 0 · wetsuit 0 · bilateral 0 · drafting 0 · paddles 0 ·
  fins 0 · Daniels 0 · VDOT 0 · "I pace" 0 · cruise 0 · "marathon pace" 0 · "recovery run" 0 · "comfortably hard" 0 ·
  "group ride" 0 · "race day" 0 · "recovery week" 0 · 80/20 0 · float 0 · pickup 0 · "time on feet" 0 · Z1 0 · Z2 0 ·
  "5K pace" 0 · "10K pace" 0 · hay 0 · strides 1 (p210 only) · stride 6 (p210 + sprint "stride down") ·
  "sweet spot" 9 (all cycling p238-239) · tempo 9 (none cycling; p99 "single-effort tempo", p247 "NT race tempo") ·
  opener 4 (lifting openers, page openers) · cadence 12 (only p236 "cadence-only sprints" is cycling) ·
  fuel 2 / bottle 1 (p280 "get comfortable using bike bottles", no interval) · open water 4 (p240-241) · sighting 3.
- **Cardiac drift / termination rule (p107).** I grepped `drift|decoupl|terminat|talk test|heat|hydrat` across
  `generate-combined-plan/{session-factory,week-builder,science}.ts` and `generate-run-plan/{generators/,index.ts}` —
  zero hits. No session in either generator prints the p107 5% rule or the p235 "talk test twice per run" line.

### Reachability

| generator | reached from | status |
|---|---|---|
| generate-combined-plan (tri / multi-sport race) | create-goal-and-materialize-plan:1809 | reachable (read the code); which menu tap reaches it not traced |
| generate-run-plan → SustainableGenerator ("Simple Completion") | index.ts:318 | reachable |
| generate-run-plan → PerformanceBuildGenerator ("Performance Build") | index.ts:336 | reachable |
| base-generator helpers `createEasyRunMiles/createEasyRun/createLongRunMiles/createLongRun/createMarathonPaceRun/createStridesSession(Miles)/createRestDay` and perf `createBaseIntervalSession/createBaseCruiseSession` | — | **NOT CALLED** (grepped `this.<name>(` in sustainable.ts + performance-build.ts: 0). Listed at the end, not counted. |

---

### Table A — generate-combined-plan (tri / combined race plans)

| # | line as printed | where | file:line | book says | page | verdict |
|---|---|---|---|---|---|---|
| A1 | `Long Run — {miles} mi` / `Aerobic long run at conversational pace. Full Z2 effort — if you can't speak in sentences, slow down.` | PS | session-factory.ts:332,335 | LSD "primarily below VT1"; Z2 tops out at VT1; talk test = VT1 | p235, p92, p211 | MATCHES on intensity. Book also says talk test twice per run (after 5 and 20 min) — not printed. |
| A2 | `Race-specific long run. Miles 1–{half} easy Z2, final {half} at {finish}.` finish ∈ `marathon goal pace` / `70.3 / half-marathon race pace` / `Olympic-distance race pace` / `sprint race pace` / `race pace` | PS | session-factory.ts:299-314,334 | LSD: "30 min @ VT1 with a 5-min race-pace finish" (L1), "10-min race-pace finish" (L2), "15-min race-pace finish" (L3) | p235 | OFF — book finish is 5–15 min; ours is the final 50% of the run. Also contradicts its own zone line "last 30–40%" (:302-313, does not print). |
| A3 | `Easy Run — {miles} mi` / `Recovery run. Fully conversational Z1–Z2 pace. These miles build your aerobic base without adding meaningful fatigue.` | PS | session-factory.ts:349-350 | VT1 run: "any workout at or below VT1"; level = duration 25–30 / 45–60 / 80–90 min | p235 | MATCHES on intensity. Length is miles, not a p235 level. "Recovery run" not on page. |
| A4 | `Easy Run + Strides — {miles} mi` + ` After the cool-down, {4} × {20} sec strides at ~5K pace effort with 30 sec walk recovery. Strides wake up fast-twitch fibers and improve running economy — not speedwork; relaxed and fast.` | PS | session-factory.ts:375-378 | only strides in the book: pretest warm-up "2 × 100 m strides (slow → near full tilt)" | p210 | NOT ON ANY PAGE as a session add-on (grepped strides/stride). "After the cool-down" — the easy run it is appended to has no cool-down. |
| A5 | `Sweet-Spot Run — {miles} mi at moderate effort` / `Warm up {w} mi easy, then {miles} mi at sustained moderate effort (~RPE 6, conversational in short sentences — meaningfully harder than your easy runs but not threshold). Cool down {w} mi easy. Builds aerobic durability without the recovery cost of intervals.` | PS | session-factory.ts:406-407 | "sweet spot" is a cycling family only; nearest run: NT "3 rounds of: 6 min @ 88% / 1 min @ VT1" | p238-239; p233 | NOT ON ANY PAGE (grepped "sweet spot": 9 hits, all cycling). |
| A6 | `Tempo Run — {miles} mi at threshold` / `Warm up {w} mi easy, then {miles} mi at lactate threshold (comfortably hard — 7–8 RPE, can say a few words). Cool down {w} mi easy.` | PS | session-factory.ts:422-423 | threshold 4:1 work:rest, rest 30s–2min; "intervals over 15 min become tempo/single efforts"; NT library tops continuous blocks at 85–92% | p99, p233-234 | OFF — continuous miles at 100% threshold; book's NT work at 100% is 2×8 min (10K race-specific) with 3–5 min recovery. Warm-up differs from the printed NT box (10-min jog + lunges + Cossack squats; 8-min cooldown). |
| A7 | `VO2max Run — {N}×3 min` / `Warm up 10 min easy. {N}×3 min at Z5 (hard — controlled sprint, not all-out) with 90 sec float recovery. Cool down 10 min. Builds raw aerobic ceiling.` (N 3→6) | PS | session-factory.ts:440-441 | zones 5-6 "governed by resistance-training principles"; running over-threshold work is MLSS (e.g. 3 min @120% / 2 min @60% ladder) | p92, p231-232 | NOT ON ANY PAGE as a run session (3-min VO2 reps appear only in cycling p238). |
| A8 | `Run Intervals — {reps}×{dist}` / `Warm up 10 min easy. {reps}×{dist} at {pace} with {rest} between. Cool down 10 min. Focus on consistent splits, not all-out.` — taper 1000m race pace 2 min walk/jog; race_specific 1600m threshold/tempo 2 min jog; build 1200m 10km pace 90 sec; base 1000m 10K/tempo 90 sec | PS | session-factory.ts:449-476 | NT L1 "4 × 1200m @ 90% with rest equal to 50% of the run"; "2 × 1600m @ 90% with 3-min rest" | p233 | OFF — pace is 10K pace (≈100%+), rest 90 s–2 min vs 50% of the rep / 3 min; warm-up/cool-down not the p233 box. |
| A9 | `Run Intervals — {reps}×{dist}` / `Warm up 10 min easy. {reps}×{dist} at controlled quality pace with 90 sec jog recovery between. Cool down 10 min. Keep this crisp and smooth, not maximal.` (downgrade path) | PS | session-factory.ts:2136-2139 | — | — | NOT ON ANY PAGE ("controlled quality pace" has no number). |
| A10 | `Moderate sustained effort (comfortably hard). ` prefixed to any other downgraded session | PS | session-factory.ts:2163 | — | — | NOT ON ANY PAGE (grepped "comfortably hard": 0). |
| A11 | `Marathon Pace Run — {mp} mi` / `1.5 mi warm-up, {mp} mi at marathon goal pace (Z3–Z4, controlled), 1.5 mi cool-down. This teaches your body to run marathon pace on accumulating fatigue.` | PS | session-factory.ts:490-491 | race-specific NT marathon: "2 × 15-min repeats @ 92%" (L1), "2 × 20-min @ 92%" (L2), "3 × 15-min @ 92%" (L3), 3–5 min recovery | p233-234 | OFF — continuous miles vs 2–3 repeats of 15–20 min. Text says 1.5 mi warm-up/cool-down; steps are 15-min / 10-min (:493). |
| A12 | `{Race Pace Run / Half-Marathon Pace Run / Marathon Pace Run} — {miles} mi` / `1.5 mi warm-up, {miles} mi at {paceLabel}, 1.5 mi cool-down. Trains your body to hold race effort on accumulating fatigue.` paceLabel ∈ `Olympic/Sprint race pace (Z4–Z5)`, `Olympic race pace (Z4)`, `70.3 / half-marathon run pace (Z3–Z4)`, `Ironman / marathon run pace (Z3)`, `race pace (Z3–Z4)` | PS | session-factory.ts:512-561 | race-specific NT: 5K 2×5 min @105%, 10K 2×8 @100%, half 2×12 @95%, marathon 2×15 @92% (L1) | p233 | OFF — one continuous block vs 2–4 repeats; same 1.5 mi text vs 15/10-min steps mismatch (:563). |
| A13 | `Long Ride — {h} hr` / `Aerobic endurance ride at Z2. Maintain 60–70 rpm cadence. Nutrition practice: eat every 40–45 minutes. No surges.` | PS | session-factory.ts:575-576 | endurance "easy ride below 75%": L1 60–100 min, L2 2.5–3.5 h, L3 3.5–5 h; form focus on pedal stroke; p280 "get comfortable using bike bottles" | p239, p280 | OFF — intensity matches; "60–70 rpm" NOT ON ANY PAGE (rpm 0; cadence only p236 sprints); "eat every 40–45 min" not on page (p280 gives no interval). Book's form-focus line not printed. |
| A14 | `Easy Ride — {h} hr` / `Recovery spin at Z1–Z2. No pushing. Legs should feel loose and refreshed by the end.` (used for mid-week easy rides up to 2.5 h, week-builder.ts:2108-2113) | PS | session-factory.ts:706-707 | endurance L1 "60–100-min easy ride below 75%" | p239 | MATCHES on intensity. Calls a 2.5 h ride a "recovery spin". |
| A15 | `Bike Threshold — {n}×{m} min` / `Warm up 15 min with fast-pedal spins. {n}×{m} min at FTP (Zone 4 — hard but sustainable). 5 min easy between. Cool down 10 min.` (n 2→4, m 20) | PS | session-factory.ts:588-589, 745 | cycling families are Sprints / AnA / VO2 / Sweet Spot / Endurance; no at-FTP family. p99: intervals over 15 min become single-effort tempo; rest ≤2 min | p236-239, p99 | NOT ON ANY PAGE (no at-FTP cycling family); also OFF vs p99 (20-min reps with 5-min rest). No cooldown box is printed for any cycling family. |
| A16 | `Bike VO2max — {r}×5 min` / `Warm up 15 min. {r}×5 min at 110–120% FTP (Zone 5) with 3 min easy recovery. Cool down 10 min. Short, maximal efforts — go hard.` (r 3→6) | PS | session-factory.ts:601-602, 741 | "5 rounds of 5 min @ 110–120%, 5-min rest" (L3; L1 3 min, L2 4 min); warm-up "15-min easy spin · 5 min @ 95% · 5-min easy spin"; "these should be more carefully controlled" | p238 | OFF — rest 3 min vs 5; up to 6 reps vs 5; warm-up missing 5 min @95% + 5 min easy; "go hard" vs "carefully controlled". 110–120% MATCHES. |
| A17 | `Bike Sweet Spot — {n}×{m} min` / `Sweet spot training at 88–94% FTP (Zone 3–4). Warm up 15 min, {n}×{m} min at sweet spot with 5 min recovery. Cool down 10 min.` (n 2→4, m 15) | PS | session-factory.ts:614-615, 748 | L1 "3 rounds of 15 min @ 80%, 5-min easy spin"; warm-up "10–15 min easy spin"; family range 80–95% | p238-239 | OFF — 15-min blocks are printed at 80%, not 88–94%; book 15-min block is always 3 rounds. |
| A18 | `Bike Tempo — {n}×{m} min` / `Warm up 15 min. {n}×{m} min at tempo effort (82–88% FTP — comfortably hard, you can say a few words). 5 min easy between. Cool down 10 min. Builds aerobic power without deep fatigue.` (downgrade path) | PS | session-factory.ts:693-694, 2123,2130 | — | — | NOT ON ANY PAGE (tempo: no cycling hit; "comfortably hard" 0). |
| A19 | `{label}` / `{day} group ride — {h} hr. Ride your own effort. Push on the climbs, recover on the flats. {phaseLine}.{topo}{route}` phaseLine ∈ `Route has sustained climbing — expect threshold-like surges on hills; keep flats easy and fuel.` / `Keep overall effort aerobic — Z2 with climb surges.` / `This is your quality bike session — give the climbs real effort.`; topo adds `High climbing density — real threshold-like stress even at modest duration; respect recovery the next day.` or `Rolling/hilly profile — pace-by-feel can overshoot flat-road RPE.` | PS | session-factory.ts:236-248, 641-657 | p138: a harder ride is sanctioned when running volume is capped | p138 | NOT ON ANY PAGE (grepped "group ride" 0). Also prints `..effort.. .` — `phaseLine` ends in "." and the template adds another "." (:657). |
| A20 | `Bike Openers — 30 min` / `Short pre-race sharpener. 20 min easy Z2, then 3×30-second fast-pedal bursts. Legs should feel snappy afterwards.` (race week only) | PS | session-factory.ts:756-757; week-builder.ts:1482 | taper = switch to deload column; "focus on race pace repeats on your tempo days both taper weeks" | p247, p274 | NOT ON ANY PAGE (opener hits are lifting/page openers). |
| A21 | `Brick — Bike {h} hr` / non-RS `Brick bike at Zone 2. Build leg feel for the transition. Maintain steady power throughout.`; RS ≥60 min `Race-simulation brick — ride {base} min at Zone 2 to build durability, then close with {close} min at expected race power (Z3, ~0.78-0.82 IF for 70.3 / 0.62-0.68 IF for full IM). Stay aero through the close. Transition quickly into the run.`; RS short `Race-simulation bike at Zone 3 (race pace). Stay aero. Transition quickly into the run.` | PS | session-factory.ts:2034-2046 | — | — | NOT ON ANY PAGE (brick 0; IF targets not in corpus). |
| A22 | `Brick — Run {mi} mi off the bike` / `Immediately after the bike. The first 5 min will feel strange — focus on turnover, not pace. {Target race pace last half. / Easy Z2 throughout.}` | PS | session-factory.ts:2058-2059 | — | — | NOT ON ANY PAGE (brick 0). |
| A23 | `{event_name}` / `Race day. Swim {s}mi → Bike {b}mi → Run {r}mi. No add-on training; execute pacing and fueling.` | PS | science.ts:423-425; week-builder.ts:2136-2137 | — | — | NOT ON ANY PAGE ("race day" 0). |
| A24 | `Swim Speed / Turnover — {yd} yd` / `Warm up 300 yd easy. {drill}{n}×50 yd strong smooth speed (≈90–95% effort — crisp turnover, not all-out sprint) with 45 sec easy jog/walk rest. {m}×150 yd easy aerobic to flush lactate. Cool down 200 yd.{fallback}` | PS | session-factory.ts:821-823 | Speed L2 "6 × 50m sprint with 15-second rest"; L1 "2 sets of 6 × 100m as 25 easy / 25 moderate / 25 hard / 25 all-out with 15-second rest" | p240-241 | OFF — 45 s rest vs 15 s; "not all-out" vs "sprint"; "jog/walk rest" in a swim session. |
| A25 | `Race-Week Activation Swim — {yd} yd` / `Warm up 300 yd easy. 4×50 yd build accelerations (start easy, finish strong; long rest between — pure neuromuscular sharpener, NOT a hard interval). {n}×100 yd easy aerobic. Cool down 200 yd.` | PS | session-factory.ts:864-866 | — | — | NOT ON ANY PAGE. Steps say `swim_threshold_4x50yd_r45` (:874) — "long rest" printed, 45 s in steps. |
| A26 | `Swim Threshold — {yd} yd` / `Warm up 300 yd easy. {drill}{n}×100 yd at hard effort (maximal sustainable — what you can hold for the interval, not past it) with 15 sec rest. {m}×150 yd easy aerobic. Cool down 200 yd.{fallback}` | PS | session-factory.ts:931-933 | swim families are endurance / speed / open water; no threshold family | p240-241 | NOT ON ANY PAGE (CSS 0; no swim threshold family). |
| A27 | `{fallback}` = ` If you don't have a 100yd pace baseline yet, swim at an effort where you can hold a short conversation but feel like you're working. Aim for the same effort on every repeat — consistency matters more than hitting a specific number.` (appended to A24, A26, A28, A34 when no swim pace on file) | PS | session-factory.ts:108-113 | — | — | NOT ON ANY PAGE. Contradicts the session it is appended to ("hard effort", "race pace … sustainable hard"). |
| A28 | `{Moderate Aerobic Swim / Race-Specific Aerobic Swim} — {yd} yd` / `Warm up 300 yd. {drill}{n}×100 yd at moderate effort — sustainable and conversational ({rest} sec rest). Focus on consistent splits. Hands-only by default; paddles optional for occasional repeats only (not the full set)—protects shoulders on high-volume aerobic blocks. Cool down 200 yd.` / race variant `{n}×100 yd at sustainable race-swim rhythm (15 sec rest). Where the lane allows, merge into longer unbroken 200–400 yd pieces. Sight every 6–8 strokes; practice breathing to both sides for chop or sun glare. Swim these repeats hands-only by default; paddles optional…` + race_specific phase ` Bilateral breathing on at least half the repeats (alternate sides every 3rd or 5th stroke)… drafting can save ~10–15% of your effort on race day.` | PS | session-factory.ts:1117,1124-1143 | Endurance L1 "2 × 600m @ easy-to-moderate (race pace) with 2-min rest"; open water "sighting every 10 seconds" (L1) / "every 9 seconds" (L2) | p240-241 | NOT ON ANY PAGE for 100-yd repeats, rest 10–25 s, paddles, bilateral, drafting % (grepped paddles/bilateral/drafting: 0). Sighting "every 6–8 strokes" OFF vs every 9–10 seconds. |
| A29 | `Recovery Swim — {yd} yd` / beginner `Warm up 200 yd easy. {drill} 4 × (50 yd drill + 50 yd full stroke easy) at easy effort — drill side reinforces the cue, full-stroke side carries it into normal swimming. Cool down 200 yd.`; other `Warm up 200 yd easy. {n}×100 yd at easy aerobic effort (20 sec rest). Cool down 200 yd.` | PS | session-factory.ts:1206-1208, 1228-1229 | L1 endurance opens "200m as 25m easy / 25m drill choice" | p240 | NOT ON ANY PAGE as a session; drill+easy alternation resembles the p240 opener. |
| A30 | `{Technique Aerobic Swim / Easy Swim} — {yd} yd` / `Warm up 300 yd easy. {drill}{n}×150 yd at easy aerobic pace. Focus on technique: high elbow catch, bilateral breathing. Cool down 200 yd.` | PS | session-factory.ts:1290-1297 | drills to learn: catch-up, DPS, fist, kick, zipper/fingertip drag | p240 | NOT ON ANY PAGE (high elbow / bilateral: 0 hits for bilateral). |
| A31 | `Kick-Focused Swim — {yd} yd` / `Warm up 300 yd easy. {n}×50 yd kick with fins at light–moderate effort (20 sec rest). Focus ankle mobility and streamline — small relaxed kick from hips for rotation support (not a sprint kick). 4×100 yd full stroke easy aerobic — practice a relaxed 2-beat kick. Cool down 200 yd.` / short-course `… kick with kickboard at moderate effort (20 sec rest). Narrow kick from hips, toes pointed — quiet legs on the integration lengths. 4×100 yd full stroke easy–moderate — compact, propulsive kick cadence.` | PS | session-factory.ts:1346-1367 | "100m kick drill" / "100m kick" opens speed and L2-3 endurance sessions | p240-241 | NOT ON ANY PAGE as a kick session (fins 0). |
| A32 | `Pull-Focused Swim — {yd} yd` / `Warm up 300 yd easy. {drill}{n}×100 yd pull with buoy at moderate aerobic rhythm (sustainable steady turnover). 20 sec rest — high-elbow catch feel without kicking. 4×100 yd full stroke easy aerobic — reconnect kick and rotation after pull isolation. Cool down 200 yd. Small paddles optional for upper-body overload if comfortable (skip if shoulders feel tight). Keep core engaged so hips do not sag.` | PS | session-factory.ts:1440-1484 | "100m with pull buoy" inside speed sessions | p240-241 | NOT ON ANY PAGE as a pull session. |
| A33 | `Endurance Swim — {yd} yd` / `Warm up 400 yd easy. {drill}Main set — {1×{main} yd continuous easy aerobic. / 2×{half} yd easy aerobic with 30 sec rest between.}{ Over-distance session: stay purely aerobic — durability and confidence, not pace.} Cool down 200 yd.` | PS | session-factory.ts:1540-1568 | Endurance L1 "2 × 600m @ easy-to-moderate (race pace) with 2-min rest"; L2 "3 × 600m or 2 × 1000m … 2-min rest"; L3 "3 × 1200m or 2 × 1600m … 3-min rest" | p240-241 | OFF — rest 30 s vs 2–3 min; intensity "easy" vs "easy-to-moderate (race pace)"; beginner/advanced get one continuous block. |
| A34 | `Race-Pace Sustained Swim — {yd} yd` / `Warm up 300 yd easy. {drill}{n}×600 yd at race pace (sustainable hard — what you can hold for the race-distance swim). 45 sec rest between. Cool down 300 yd easy.{fallback}` | PS | session-factory.ts:1971-1973 | "2 × 600m @ easy-to-moderate (race pace) with 2-min rest" | p240 | OFF — same 600 reps, but "sustainable hard" vs "easy-to-moderate", rest 45 s vs 2 min. |
| A35 | `Swim Time Trial — 1400 yd` / `Warm up 500 yd with progressive build (last 100 at moderate effort). 400 yd MAX effort — sustained hard, hold form. 4 min easy recovery (back-and-forth jogs or float). 200 yd MAX effort — leave nothing. Cool down 300 yd easy. The engine will recompute your 100yd pace target from these two splits.` | PS | session-factory.ts:1791-1793 | no swim pretest on pp210-213 (run, talk test, FTP only) | p210-213 | NOT ON ANY PAGE (CSS 0, "Critical Swim" 0). "back-and-forth jogs" in a swim session. |
| A36 | `Open Water Skills — {yd} yd` / `Warm up 300 yd easy. Open water if accessible — otherwise pool with sighting every 6 strokes throughout the main set. {n}×100 yd at race-start hard effort (settle into race pace by the end of each 100), 30 sec rest. {m}×200 yd at race-rhythm sustained effort with sighting every 6 strokes — bilateral breathing alternating sides. Cool down 200 yd easy. If you have access to a group, practice both lead position and drafting (feet/hip-side).` | PS | session-factory.ts:1840-1842 | open water: "sighting every 10 seconds" (L1), "every 9 seconds" (L2); "strongly recommends a watch with an audible timer" | p240-241 | OFF — sighting by strokes not seconds; audible-timer line not printed. |
| A37 | `Mixed/Fartlek Swim — {yd} yd` / `Warm up 300 yd easy. {drill}{n}×400 yd building intensity within each 400 — first 100 easy aerobic, second 100 moderate, third 100 race-rhythm, fourth 100 hard but controlled. 30 sec rest between. Cool down 200 yd easy.` | PS | session-factory.ts:1904-1906 | speed L1 100s "as 25 easy / 25 moderate / 25 hard / 25 all-out" | p240 | NOT ON ANY PAGE as 400s; closest printed build is 25-yd quarters ending all-out. |
| A38 | `Open Water Practice` / `Open water session (~{m} min). Use conditions similar to your race where possible: wetsuit if legal, sight every 6–8 strokes, practice bilateral breathing into chop or sun glare. Steady aerobic effort — not an anaerobic sprint.` (m 28–55) | PS | session-factory.ts:1997-1998 | L3 OW (20 min out / 20 back): "Belt with rope tether, bright/contrast buoy, water/fluid supply and emergency whistle are MANDATED … experienced swimmers in locations with visible lifeguards or a dedicated boat/kayak escort only"; audible timer | p241 | OFF — up to 55 min open water with none of the p241 safety items printed; sighting by strokes not seconds; wetsuit not on page. |
| A39 | `Swim Baseline — CSS Test` / `Critical Swim Speed (CSS) assessment. Warm up 400 yd easy freestyle, rest 3 min. Swim 400 yd all-out — time it. Rest 3 min. Swim 200 yd all-out — time it. Cool down 200 yd easy. Record both times: your coach uses them to set your threshold swim pace for the entire plan.` | PS (assessment week) | week-builder.ts:2557-2566 | no swim pretest | p210-213 | NOT ON ANY PAGE. Also "your coach" — the app has no coach. |
| A40 | `Bike Baseline — 20-Minute FTP Test` / `20-minute FTP assessment. Warm up 10 min easy spin building to moderate effort, then 2 × 1 min hard / 1 min easy. Ride 20 min all-out as evenly paced as possible — this is not a sprint. Cool down 5 min easy. Record average power (or average heart rate if no power meter). Your FTP ≈ average power × 0.95. Your coach uses this to set all bike training zones for the plan.` | PS (assessment week) | week-builder.ts:2580-2588 | "5–10 min easy; 3 × 1 min high turnover / 1 min rest; 3 min easy; 3 min at 9/10; 6–8 min easy; 20 min best effort; FTP = 20-min average watts × 0.95" | p212 | OFF — ×0.95 MATCHES; warm-up is 2 hard minutes vs p212's 3 × 1 min high turnover + 3 min @9/10 + 6–8 min easy; "average heart rate" fallback not on page. |
| A41 | `Run Baseline — 12-Minute Time Trial` / `Running threshold assessment. Warm up 15 min easy (conversational pace), then 4 × 30 sec strides with 30 sec walk recovery. Run 12 min all-out on a flat surface — start evenly, not a sprint. Cool down 10 min easy walk/jog. Record distance covered (or average pace). Your coach uses this to set your run zones and easy/threshold paces for the entire plan.` | PS (assessment week) | week-builder.ts:2604-2610 | "Easy 6–8 min jog · 2 × 100 m strides · 3 × 30 s at fast-run (mile PR) pace, 1 min easy · 1 min rest · 9.5/10 to begin, ending at 10/10 · 12 min (beginner) / 10 (intermediate) / 8 (advanced)"; threshold = 88% of vVO2 speed | p210 | OFF — warm-up differs (15 min + 4×30 s strides vs 6–8 min + 2×100 m + 3×30 s fast); 12 min for everyone vs 12/10/8 by training age; 88% not stated. |
| A42 | `Week {n} long run is shorter than the typical {phase} floor ({x}mi vs {f}mi). If recovery allows, extending toward {f}+ mi protects durability.` / `Week {n} has no long run scheduled — {phase} plans target a {f}+ mi long run for durability.` | plan trade-off notes (inferring — index.ts:416 comment "athlete-facing trade-offs") | validate-training-floors.ts:565-567 | Strength+5K LSD: "runs up to 90 to 100 minutes"; nothing on a mileage floor | p247 | NOT ON ANY PAGE (no mileage floor on a page). |
| A43 | `Week {n} long ride is shorter than the typical {phase} floor ({x}h vs {f}h). Lengthening toward {f}h+ builds the bike-leg endurance the race demands.` / `Week {n} has no long ride scheduled — {phase} plans target a {f}h+ long ride for bike-leg durability.` | plan trade-off notes (inferring) | validate-training-floors.ts:590-592 | Base: "The Saturday long ride can likewise progress … every 1 to 2 weeks"; no amount printed | p281 | NOT ON ANY PAGE (no hour floor printed). |

Not printing (checked): swim template `notes: 'Maintenance aerobic swim — run-primary emphasis, swim kept short.'` (week-builder.ts:1322) — grepped `template.notes` / `.notes` in session-factory.ts, week-builder.ts, index.ts: only the strength exercise read at session-factory.ts:2302. Scheduling/pairing notes (week-builder.ts:1696, 2037, 2382, 2439, 2460) are placement, not endurance prescriptions — not rated.

---

### Table B — generate-run-plan

| # | line as printed | where | file:line | book says | page | verdict |
|---|---|---|---|---|---|---|
| B1 | Plan name `{race} {year} Completion Plan` / `{dist} Completion Plan - {w} Weeks`; description `A {w}-week plan designed to get you to the finish line healthy and confident. Uses effort-based pacing (no complicated pace charts) with optional light speedwork. Based on progressive training principles.` + marathon prerequisite `This plan assumes you're already running about {x} miles a week with a long run around {y}. If that's not where you are, do the half — this build won't be safe for you.` / too-short variant | plan detail (inferring) | sustainable.ts:111-148 | — | — | NOT ON ANY PAGE (plan framing, no prescription from the book). |
| B2 | `Shakeout Run` / `2-3 miles very easy with a few strides. Stay loose and relaxed.` (steps: 3 mi + 4×100 m) | PS, day before race, both generators | base-generator.ts:102-110; sustainable.ts:341; performance-build.ts:268 | — | — | NOT ON ANY PAGE (shakeout 0). "a few strides" printed, 4×100 m in steps. |
| B3 | `Easy Run` / `3-4 miles very easy. Keep the legs loose and stay relaxed.` (3–4 days out; steps 4 mi) | PS | sustainable.ts:408-413 | taper = deload column; VT1 L1 25–30 min | p247, p235 | NOT ON ANY PAGE as a taper rule; intensity MATCHES VT1. |
| B4 | `Easy + Strides` / `4 miles easy with 4×100m strides. Keep it light and fun!` and `… Keep it light!` | PS | sustainable.ts:420-425, 435-440 | only strides on a page: p210 2×100 m | p210 | NOT ON ANY PAGE (strides). |
| B5 | `{race} — {Marathon/Half marathon/10K/5K}` / `{miles} miles. The effort you have run all block: conversational at the start, and it will not stay that way. No pace target — this block was built to get you here able to finish.` | PS | sustainable.ts:515-519 | — | — | NOT ON ANY PAGE ("race day" 0). |
| B6 | `Long Run` / `{miles} miles — Z2 aerobic ({HR a–b · ~pace/mi}). Easy and conversational; talk in full sentences throughout. Time on feet, not speed.` / no-data `{miles} miles at easy, conversational pace. You should be able to talk in full sentences throughout. Focus on time on your feet, not speed.` | PS | sustainable.ts:757-760 | LSD primarily below VT1; talk test = VT1 | p235, p211 | MATCHES on intensity. HR band is Friel % of LTHR (OURS per SOURCE H0.2), not the p211 talk-test VT1 HR. |
| B7 | `Easy Run + Strides` / `{4} miles easy ({base}), then 6×100m strides at Z5 effort ({z5}) — quick, relaxed, full recovery. Strides optional; skip if tired.` / no-data `… then 6×100m strides (quick but relaxed sprints with full recovery). Strides are optional - skip if tired. Focus on good form and having fun.` | PS | sustainable.ts:784-797 | p210 2×100 m | p210 | NOT ON ANY PAGE. Text says 6×100 m; steps are `strides_4x100m` (:797). |
| B8 | `Fartlek Run` / `{4} miles with {n} pickups at Z4–Z5 effort ({z4}): 30–60s comfortably hard, then easy jog to recover. Easy base ({base}).` / no-data `{4} miles with {n} pick-ups: run comfortably hard for 30-60 seconds when you feel like it, then easy jog to recover. No watch needed - run by feel and enjoy it!` | PS | sustainable.ts:803-815 | LSD L2 "1.5h VT1 fartlek targeting 6 × 3 min @ 85%"; L3 "6 × 4 min @ 85%" | p235 | OFF — book fartlek is 3–4-min surges at 85% inside a 1.5–2.5 h run; ours is 30–60 s at Z4–Z5 inside 4 mi. |
| B9 | `Easy Run` / `{miles} miles — easy aerobic, Z1–Z2 ({HR · pace}). Conversational throughout.` / no-data, **picked at random**: `{m} miles at easy, conversational pace.` · `{m} miles nice and easy. Enjoy the run!` · `{m} miles at a comfortable effort. Chat with a friend or enjoy some music.` | PS | sustainable.ts:825-834 | VT1: at or below VT1 | p235 | MATCHES on intensity. `Math.random()` (:834) — the same plan can print different text on each build. |
| B10 | Plan name `{race} {year} Performance Plan` / `{dist} Performance Plan - {w} Weeks`; description `A {w}-week performance-focused plan with personalized pace zones. Features two quality workouts per week (intervals and tempo) with paces calculated from your 5K time. Based on proven training principles.` | plan detail (inferring) | performance-build.ts:116-138 | pretest: 12/10/8-min time trial, threshold = 88% of vVO2 | p210 | OFF — paces from a 5K time, not the p210 trial. |
| B11 | `Easy Run` / `4 miles very easy. Stay fresh for race day.`; `5 miles easy. Maintaining fitness while resting.`; `4 miles at E pace. Recovery and aerobic maintenance.`; `5 miles at E pace. Recovery and aerobic maintenance.` | PS (race weeks) | performance-build.ts:276, 295, 313, 325 | — | — | NOT ON ANY PAGE ("E pace" is Daniels; Daniels 0). |
| B12 | `R Pace Strides` / `Easy 4 miles + {6/8/10} × 200m @ R pace (fast but relaxed, full recovery). Maintains leg turnover and mechanics.` | PS (weeks 1–3, week A Tue) | performance-build.ts:450-457 | sprint L1 "2 rounds of 4×200m @ >vVO2 with flying start, 2-min recovery between sets" | p229 | NOT ON ANY PAGE as written ("R pace" Daniels). Steps are 30 min easy + 4×100 m strides (:456) — text and steps disagree. |
| B13 | `Cruise Intervals` / `{3/4}×{1/1.5}mi at T pace with 60-90s jog recovery. Total: {q} miles @ T (comfortably hard, ~10K effort). Cruise intervals build lactate threshold.` | PS | performance-build.ts:475-481 | threshold: 4:1 work:rest, rest 30 s–2 min, 8–15 min intervals capped at 2 min rest | p99 | MATCHES on rest band (60–90 s inside 30 s–2 min). Pace basis is Daniels T, not % of p210 threshold. |
| B14 | `I Pace Intervals` / `{6/8}×400m at I pace (5K effort). Jog 90s recovery between reps. Total quality: ~{q} miles. Shorter intervals for economy and mechanics.` | PS | performance-build.ts:581-594 | — | — | NOT ON ANY PAGE. Text 6–8×400 m; steps `intervals_800(ceil(reps/2))` = 3–4×800 m (:591). |
| B15 | `I Pace Intervals` / `{5/6}×800m`, `4×1000m`, `4×1200m`, `3×1 mile` at I pace (5K effort), jog {120s/180s/4 min}; tails `These develop VO2max and running economy.` / `Longer intervals for sustained VO2max development.` / `Extended intervals for marathon-specific VO2max work.` / `Mile repeats for sustained VO2max and mental toughness.` | PS | performance-build.ts:606-690; 2117-2135 | running over-threshold work is MLSS (zone 4, equalised fatigue); zones 5-6 by resistance principles | p231, p92 | NOT ON ANY PAGE (I pace / Daniels 0). |
| B16 | `Easy Run + M Pace` / `{t} minutes ({mi} miles): {25} min @ E pace, then {m} min @ M pace (marathon goal pace). Early M-pace exposure for rhythm and economy.` | PS | performance-build.ts:775-782 | LSD L1 "30 min @ VT1 with a 5-min race-pace finish"; L2 "10-min race-pace finish" | p235 | OFF — 12–18 min M finish vs 5–10 min printed finishes. |
| B17 | `{race} RACE DAY` / `{race} {year}. {d} miles at M pace ({m:ss}/mi). Trust your training. Go crush it.` | PS | performance-build.ts:852-864 | — | — | NOT ON ANY PAGE. |
| B18 | `Quality Long Run` / `{t} minutes ({mi} miles): {20} min E + {20} min @ M + {10} min E + {20} min @ M + {10} min E. Quality long run with structured M-pace segments. Practice returning to M pace under fatigue.` | PS | performance-build.ts:1648-1656 | LSD L3 "1.5h VT1 run with 3 sets … 2 rounds of 4 min @ 95% / 1 min @ VT1"; "90–120 min @ VT1 with a single 10-min @ 95% interval in the middle, 15-min race-pace finish" | p235 | OFF — two 20-min M blocks vs one 10-min @95% + 15-min finish. Steps `long_run_with_mp(total, 40)` (:1655) — inferring this expands as one M block, not two; token grammar not traced into materialize-plan. |
| B19 | `Long Run` / `{t} minutes ({mi} miles): First {e} minutes at E pace (easy, conversational), final {m} minutes at M pace (marathon goal pace). Practice race-day fueling and pacing.` / `{t} minutes ({mi} miles) at E pace (easy, conversational). Stay relaxed and save energy for quality days.` + ` [Time capped at {150/180} minutes per Jack Daniels' method to prevent excessive fatigue.]` | PS | performance-build.ts:2061-2089; cap :1700-1709 | "rarely more than 2h of VT1 in one session"; Strength+5K LSD "up to 90 to 100 minutes"; LSD L3 3h+ hike / VT1 jog | p108, p247, p235 | OFF — cap 150/180 min (and raised to proven capacity) vs p108 2 h VT1; M finish length not a p235 finish (5–15 min). Cites Daniels on screen. |
| B20 | `T Pace Tempo` / `{15–25} minutes continuous at T pace (comfortably hard, ~10K effort). ~{n} miles of quality. Should feel controlled but challenging.` | PS | performance-build.ts:2144-2152 | "intervals over 15 min become tempo/single efforts" | p99 | MATCHES p99 shape (single effort >15 min). Pace basis Daniels, not p210 threshold. |
| B21 | `Cruise Intervals` / `{3/4}×{1/1.5}mi at T pace with 60-90s jog recovery. Total: {q} miles @ T. Cruise intervals build lactate threshold with brief recovery.` | PS | performance-build.ts:2169-2177 | 4:1, rest 30 s–2 min | p99 | MATCHES on rest band (same as B13, different words). |
| B22 | `M Pace Run` / `{4–6} miles at M pace (marathon goal pace). Practice your race-day rhythm and pacing. Should feel sustainable for the full marathon.` | PS | performance-build.ts:2192-2200 | race-specific NT marathon "2 × 15-min repeats @ 92%" (L1) … "3 × 15-min @ 92%" (L3) | p233-234 | OFF — continuous miles vs 15–20-min repeats with 3–5 min recovery. |
| B23 | `Easy Run + Strides` / `{t} minutes ({mi} miles) at E pace, then 4×100m strides (fast but relaxed, full recovery). Strides maintain leg turnover and neuromuscular coordination.` | PS | performance-build.ts:2217-2225 | p210 2×100 m | p210 | NOT ON ANY PAGE. |
| B24 | `Easy Run` / `{t} minutes ({mi} miles) at E pace. Recovery and aerobic maintenance.` | PS | performance-build.ts:2237-2241, 2336-2341 | VT1 at or below | p235 | MATCHES on intensity ("E pace" wording is Daniels). |
| B25 | `Race Tune-up` / `4×400m at I pace with full recovery (2-3 min jog). Short, sharp effort to stay sharp without fatigue. Trust your fitness - the hay is in the barn!` | PS | performance-build.ts:2252-2262 | p247: "focus on race pace repeats on your tempo days both taper weeks" | p247 | OFF — I-pace 400s vs race-pace repeats. Text 4×400 m; steps `intervals_800(3, 180)` = 3×800 m (:2259). Idiom "the hay is in the barn". |
| B26 | `Race Week Activation` / `20 min easy + 4×100m strides (walk back recovery). Strides should feel effortless and fast — not a workout. Legs should feel bouncy after, not tired.` | PS | performance-build.ts:2274-2281 | p210 2×100 m | p210 | NOT ON ANY PAGE. |
| B27 | Phase `focus` lines: `Aerobic foundation and movement patterns`, `VO2max development and race pace`, `Recovery and race preparation`, `Aerobic foundation`, `VO2max and speed development`, `Race-specific work`, `Recovery and sharpening`, `Aerobic foundation building`, `Speed and VO2max development`, `Recovery and race readiness`, `Hold fitness + retest — light week to re-benchmark, no race taper`, `Continued build — no race-specific sharpening`, week `notes: 'Reduced volume for recovery and adaptation'` | week focus label (inferring — index.ts:633) | base-generator.ts:307-420, 453-458, 913 | deload is tied to an event or fatigue, never a calendar | p120, p245-283 (J4) | OFF for the recovery-week note (fixed-calendar recovery week; J4 records no program that deloads on a calendar). Focus labels otherwise NOT ON ANY PAGE. |

Not called (listed, not counted): base-generator.ts `createEasyRunMiles` :517 `{m} miles at easy, conversational pace`; `createEasyRun` :532 `Easy aerobic run at conversational pace`; `createLongRunMiles` :546 `{m} miles - Long run with final {mp} miles at marathon pace`; `createLongRun` :570; `createMarathonPaceRun` :592 `Goal Pace Practice` / `{m} miles at goal marathon pace`; `createStridesSession(Miles)` :614/:629 `… with 6x20s strides at the end`; `createRestDay` :116. performance-build.ts `createBaseIntervalSession` :1029 and `createBaseCruiseSession` :1055 and the `[Compressed plan note: This assumes recent interval training. If you haven't done structured speed work in 2+ months, reduce Week 1 by 25% …]` they append (:1016-1022).

---

### Counts (Tables A + B, 70 rows)

A row with a matching part and an off part is counted once, by its worst part.

| verdict | A (combined, 43) | B (run, 27) | total |
|---|---|---|---|
| MATCHES | 3 — A1, A3, A14 | 6 — B6, B9, B13, B20, B21, B24 | **9** |
| OFF | 15 — A2, A6, A8, A11, A12, A13, A16, A17, A24, A33, A34, A36, A38, A40, A41 | 8 — B8, B10, B16, B18, B19, B22, B25, B27 | **23** |
| NOT ON ANY PAGE | 25 — A4, A5, A7, A9, A10, A15, A18-A23, A25-A32, A35, A37, A39, A42, A43 | 13 — B1-B5, B7, B11, B12, B14, B15, B17, B23, B26 | **38** |

---

### List 2 — one prescription, two or more places, different words or numbers

1. **Run threshold test.** week-builder.ts:2604-2610 (15-min warm-up, 4×30 s strides, 12 min for everyone, "start evenly") vs `_shared/baseline-test-rows.ts:40-45` (p210 step for step: 6–8 min jog, 2×100 m strides, 3×30 s fast, 1 min rest, 12/10/8 min by training age, 88% of speed). **Should come from** `_shared/baseline-test-rows.ts`.
2. **FTP test.** week-builder.ts:2580-2588 (10 min building, 2×1 min hard, 5-min cool-down, HR fallback) vs `_shared/baseline-test-rows.ts:51-58` (p212: 3×1 min high turnover, 3 min @9/10, 6–8 min easy, 5–10 min cool-down). **Should come from** `_shared/baseline-test-rows.ts`.
3. **Swim 400/200 test.** week-builder.ts:2557-2566 (400 yd warm-up, 3-min rests) vs session-factory.ts:1791-1793 (500 yd build warm-up, 4-min rest). No book page for either. **Should be one function** (ours, marked OURS).
4. **Strides — nine versions.** session-factory.ts:376-378 (4×20 s ~5K pace, 30 s walk) · week-builder.ts:2607 (4×30 s, 30 s walk) · base-generator.ts:105 ("a few", steps 4×100 m) · sustainable.ts:422/437 (4×100 m) · sustainable.ts:785-786 (6×100 m text, 4×100 m steps :797) · performance-build.ts:453 (6–10×200 m @R text, 4×100 m steps :456) · performance-build.ts:2219 (4×100 m) · performance-build.ts:2276 (4×100 m walk back) · uncalled base-generator.ts:621/633 (6×20 s). Book has one stride line: p210 "2 × 100 m strides (slow → near full tilt)". **Should come from** one stride definition; the only page is p210.
5. **Text says one workout, steps run another** (the athlete reads one thing, the step list / watch does another):
   - performance-build.ts:585 text 6–8×400 m → steps :591 3–4×800 m.
   - performance-build.ts:2254 text 4×400 m → steps :2259 3×800 m.
   - performance-build.ts:453 text 4 mi + 6–10×200 m → steps :456 30 min + 4×100 m.
   - sustainable.ts:785 text 6×100 m → steps :797 4×100 m.
   - session-factory.ts:491 and :561 text "1.5 mi warm-up … 1.5 mi cool-down" → steps :493/:563 15-min / 10-min.
   - session-factory.ts:866 "long rest between" → steps :874 45 s.
   - performance-build.ts:1648 two 20-min M blocks → steps :1655 one M total (inferring).
   **Should come from** the step list (the description written from the same numbers).
6. **Race-pace finish on the long run.** session-factory.ts:334 (final 50%) vs its own zone line :302-313 (last 30–40%, not printed) vs performance-build.ts:2061-2065 (final M minutes from the arc) vs performance-build.ts:775 (12–18 min M after 25 min E). Book p235: 5 / 10 / 15-min race-pace finish by level. **Should come from** `_shared/endurance-library` run_lsd (p235).
7. **Bike VO2.** session-factory.ts:597-608 (15-min warm-up, N×5 min, 3-min rest, up to 6) vs `_shared/endurance-library/source-rules.ts:186-195` (p238 warm-up: 15 easy + 5 @95% + 5 easy) and generate.ts:430 ladder (3/4/5 min, 5 rounds, 5-min rest). **Should come from** endurance-library ride_vo2.
8. **Sweet spot.** session-factory.ts:614-615 (88–94% FTP, 15-min warm-up, 5-min rest, 2–4 × 15 min) vs source-rules.ts:179-183 (p238 10–15-min easy spin) + p238-239 table (15-min blocks at 80%). Plus a running "Sweet-Spot Run" at session-factory.ts:406 (RPE 6). **Should come from** endurance-library ride_sweet_spot; the run version has no page.
9. **Quality-run warm-up / cool-down.** session-factory.ts:441, 476, 2139 ("Warm up 10 min easy … Cool down 10 min") and :423 (warm-up in miles) vs source-rules.ts:151-158 (p231/p233: 10-min jog + 3×20 m walking lunges + 2×10 Cossack squats; 8-min cool-down). **Should come from** endurance-library run_near_threshold / run_mlss wrapper.
10. **"Comfortably hard" used for five different intensities.** tempoRun session-factory.ts:423 (lactate threshold, RPE 7–8) · tempoBike :694 (82–88% FTP) · downgrade prefix :2163 · performance-build.ts:479/2147 (T pace ~10K effort) · sustainable.ts:806/812 (30–60 s pickups at Z4–Z5). Not on any page (grep 0). **Should come from** one intensity vocabulary (% of threshold, p229).
11. **Easy intensity wording.** session-factory.ts:350 (Z1–Z2 conversational) · :335 (Full Z2, speak in sentences) · sustainable.ts:758 (Z2 + HR band) · :827 (Z1–Z2 + HR band) · performance-build.ts E pace (2073, 2239). Book: one definition — at or below VT1 by talk test (p211, p235). **Should come from** the VT1 / talk-test definition.
12. **Race day.** science.ts:423-425 (tri: "execute pacing and fueling") · sustainable.ts:516-519 (no pace target) · performance-build.ts:852-854 (M pace, "Go crush it"). Different on purpose per the comment at sustainable.ts:476-500 (completion vs performance), but the tri line and the performance line are unrelated wordings for the same row. No page.
13. **Swim no-pace fallback contradicts the session.** session-factory.ts:108-113 ("hold a short conversation") appended to :933 ("hard effort, maximal sustainable"), :823 (90–95% speed) and :1973 ("race pace, sustainable hard"). **Should come from** a per-session fallback, or none.
14. **Open-water sighting.** session-factory.ts:1136 (every 6–8 strokes), :1842 (every 6 strokes), :1998 (every 6–8 strokes) vs p240-241 (every 10 s / 9 s). **Should come from** p240-241.
15. **Long-run length ceiling.** performance-build.ts:1700-1709 + text :2083 (150/180 min "per Jack Daniels") vs book p108 (2 h VT1 ceiling) and p247 (90–100 min). Single place in scope; listed because the screen names a source that is not the book.

---

## Part C — materialize, get-week, client (full detail)

## Audit — endurance text composed after a plan is generated (materialize-plan, _shared display, get-week, client)

Branch `stage/one-truth-drift`, read-only, 2026-09-18. Book = `docs/SOURCE-viada-hybrid-athlete.md`.

**Evidence labels.** Every file:line below was read in this session ("read the code"). "Where it prints" is traced
to a component unless marked *(inferring)*. Nothing was run on a device or against a database. Absence verdicts
name the terms grepped in the SOURCE doc (case-insensitive `grep -ci`).

**Which screen prints what (read the code):**
- **Today drawer + plan list** print `computed.step_lines` (server, `_shared/planned-step-lines.ts`) through
  `src/components/PlannedWorkoutSummary.tsx:336-341,425-428`, with the generator's `friendly_summary` /
  `description` above them (`:185-189`). `get-week` passes `step_lines` through untouched
  (`get-week/index.ts:839,1149,1231,1685`).
- **Planned tab of the workout screen** (`UnifiedWorkoutView.tsx:1314`) prints `StructuredPlannedView.tsx`, which
  does NOT read `step_lines`; it re-composes every step from `computed.steps` itself (`:200-360`).
- **Recording screen** prints `ExecutionScreen.tsx` (target = midpoint of the range) and the live cue words.
- **Instead sheet** prints `qualityWorkLine` (`_shared/plan-tokens/quality-work.ts:435`) via
  `_shared/session-swap/workout-choice.ts:222`.
- `planned-step-lines.ts:123-130` prints a step's `label` only when the step has no time and no distance, so the
  step labels written by materialize-plan reach the Today drawer / plan list almost never; they reach the Planned
  tab when the step has no pace/HR/power target (`StructuredPlannedView.tsx:356-358`).

**Files with no prescription line (read in full):** `_shared/run-warmup-easy.ts` (reads samples, no text),
`intent-title.ts` (lifting titles), `planned-duration-label.ts` (length only), `display-format.ts` (unit
formatting), `empty-day-line.ts` ("Rest" / "No effort logged" / "No effort scheduled"), `plan-line.ts` ("week N of
M"), `swim-sessions.ts` (no text). `get-week` composes no step text; its only endurance number is the ±5% pace
fallback (row 72). `WorkoutSummaryView` / `WorkoutExecutionView` (`services/plans/templates/workoutDisplayTemplates.ts`)
are imported but never rendered (grepped `<WorkoutSummaryView`, `<WorkoutExecutionView`: no JSX use) — not audited.

**p107 drift / termination rule:** grepped `drift`, `5%`, `10 percent`, `terminat` in `planned-step-lines.ts`,
`materialize-plan/index.ts`, `StructuredPlannedView.tsx`, `PlannedWorkoutSummary.tsx`, `get-week/index.ts`: no
athlete-facing line states it. It reaches the screen only inside the generator's description (quoted in the comment at
`materialize-plan/index.ts:3727-3733`, printed by `PlannedWorkoutSummary.tsx:185-189`) — generator text, not audited here.

---

### Table 1 — every prescription line

| # | Line as printed | Where it prints | file:line | What the book says | Page | Verdict |
|---|---|---|---|---|---|---|
| **A** | **Server step lines (`computed.step_lines`)** | | | | | |
| 1 | `{len} warm-up · easy pace {lo}–{hi}/mi` (run) | Today drawer, plan list | `_shared/planned-step-lines.ts:165`; priced `materialize-plan/index.ts:1580-1581,725-729` | Sprint/Power: "5-min easy jog · 3 sets of 20m walking lunges · 2 × 30-second rounds of butt kicks · 3 rounds of arm-pump drills". MLSS/NT: "10-min easy jog · 3 sets of 20m walking lunges · 2 sets of 10 Cossack squats" | p229, p231, p233 | **OFF.** The drills never print: the library carries them as labelled steps (`endurance-library/source-rules.ts:137-158`) but the token wrapper sums only seconds into one `warmup_run_{n}min_easy` (`standing-plan/session-vocabulary.ts:329-363`). Sprint/Power prints `8:00 warm-up` (5-min jog + drill seconds, rounded, `session-vocabulary.ts:44`). The pace range is Friel Z2 (threshold × 1.14–1.29, D-478); the page prints no pace. |
| 2 | `{len} cool-down · easy pace {lo}–{hi}/mi` (run) | Today drawer, plan list | `planned-step-lines.ts:165`; `materialize-plan/index.ts:1583-1584` | "Cooldown: 8-min easy jog" (MLSS/NT); "5-min easy jog or cross-training/bike" (Sprint/Power) | p229, p231, p233 | **OFF (partly).** Time and "easy" match; "or cross-training/bike" is dropped on Sprint/Power; the pace number is not on the page. |
| 3 | `{len} warm-up · {A}–{B} W` (ride, 55–70% FTP) | Today drawer, plan list | `planned-step-lines.ts:168`; `materialize-plan/index.ts:2272-2275` (`warmup_bike_quality_…_fastpedal`, emitted for every ride at `session-vocabulary.ts:342-344`) | Sprints: "10-min easy spin · 4 cadence-only 15-second sprints … 3-min rest between". AnA / SS: "10–15 min easy spin". VO2: "15-min easy spin · 5 min @ 95% · 5-min easy spin" | p236, p237, p238 | **OFF.** Every ride warm-up is one block at 55–70% FTP (OURS, labelled `:2271`). The VO2 warm-up's 5 min @ 95% and the sprint ride's four cadence sprints are not in the steps. "Easy spin" carries no number on the page. |
| 4 | `{len} cool-down · {A}–{B} W` (ride, 40–55% FTP) | Today drawer, plan list | `materialize-plan/index.ts:2284-2288` | No cooldown box for any cycling family | p236-239 (`source-rules.ts:171`) | **NOT ON ANY PAGE** (grepped `cool`: 11 hits, none a cycling cooldown). The Viada library emits no ride cooldown; reachable from other generators *(inferring)*. |
| 5 | `{len} @ {lo}–{hi}/mi` — run work step at a % of threshold, e.g. 15 s @ 130% | Today drawer, plan list | `planned-step-lines.ts:136`; pace `quality-work.ts:142-146`; band `materialize-plan/index.ts:4002-4012` | "percentages are percent of threshold speed … 100% = threshold/VT2"; "15s @ 130% / 45s @ 105%" | p229, p231 | **Centre MATCHES** (threshold ÷ %). The ±2% band around it is **NOT ON ANY PAGE** (OURS, labelled `:4002`; grepped `tolerance`, `±`: 0). |
| 6 | `{len} @ {easy lo}–{hi}/mi` — a recovery the page writes "@ VT1" | Today drawer, plan list | `planned-step-lines.ts:136`; `quality-work.ts:244-246`; `materialize-plan/index.ts:735-741` | "1 min @ VT1"; VT1 = the talk-test point | p231, p211, p235 | **OFF.** VT1 prints as a pace range off threshold (Friel × 1.14–1.29). The book's VT1 is the talk-test anchor (p211, a ramp the app has not built — SOURCE H0.2). |
| 7 | `{len} @ {pace range}` — recovery the page prints as a % ("20s @ 50%", "@ 60%") | Today drawer, plan list | `quality-work.ts:244-246`; band `materialize-plan/index.ts:4007` | "40s @ 130% / 20s @ 50%"; ladder "… / 2 min @ 60% / …" | p231-232 | **Centre MATCHES.** ±6% band **NOT ON ANY PAGE** (OURS, `:4002`). |
| 8 | `… · {len} @ {easy pace} between sets` / `{len} @ {easy pace} between sets` | Today drawer, plan list | `planned-step-lines.ts:221,301`; `quality-work.ts:252-254` | "2-min recovery walk/jog between sets"; "4-min full recovery between larger sets"; "1:30 walk or recovery jog" | p231-232 | **OFF.** A walk / full recovery prints with an easy-jog pace. (The watch gets time only, `materialize-plan/index.ts:739`.) |
| 9 | NT: `{n} × {len} @ {pace}, {rest} @ {easy pace} between` | Today drawer, plan list | `quality-work.ts:258-265`; `planned-step-lines.ts:223-225` | "4 × 1200m @ 90% with rest equal to 50% of the run"; "3-min rest"; "1-min easy jog" | p233-234 | **OFF.** Numbers match; "rest" prints as an easy-jog pace. |
| 10 | `{len} @ HR {lo}–{hi} · ref {pace}/mi` — easy run and long run | Today drawer, plan list | `planned-step-lines.ts:118-120,135`; HR `materialize-plan/index.ts:4243-4253` (Friel Z2, 85–90% LTHR) | VT1: talk test; "VT1 heart rate zone and pace": record HR at the last talk-test level | p235, p211 | **OFF.** The range is Friel % of LTHR (OURS by choice, D-462, labelled `:4247`). The book's VT1 HR comes from the p211 ramp. |
| 11 | `Easy enough to talk in full sentences. Check after 5 minutes and again after 20.` | Today drawer, plan list (VT1 and LSD rows) | `planned-step-lines.ts:56,322` | "Practise the talk test at least twice per run — once after 5 minutes and once after 20"; test = recite a sentence "without taking a breath" | p235, p211 | **MATCHES** |
| 12 | `All-out: the best speed you have today.` | Today drawer, plan list (Sprint/Power, only when a work step has no target) | `planned-step-lines.ts:58,323-325` | "All-out" = best possible speed for the day | p229 | **MATCHES** |
| 13 | `{len}` with no words — the LSD race-pace finish | Today drawer, plan list | `quality-work.ts:239-243` (no pace); `planned-step-lines.ts:127,141` | "30 min @ VT1 with a 5-min race-pace finish"; "10-min race-pace finish" | p235 | **OFF.** The step prints its time only; "race pace" never appears. |
| 14 | `{len}` with no words — ride all-out sprint (ride_sprints max-effort; p239 "10-second all-out sprint") | Today drawer, plan list | `quality-work.ts:285`; `materialize-plan/index.ts:2376`; effort line limited to run at `planned-step-lines.ts:60` | "max-effort 2–3-min sprints"; "flying 30-second surges to max effort"; "10-second all-out sprint every 9 minutes" | p236, p239 | **OFF.** No effort word prints on a ride's all-out step. |
| 15 | `{len} easy` — ride recovery with no target | Today drawer, plan list | `planned-step-lines.ts:141`; `quality-work.ts:287,311-313` | "4-min easy spin"; "2-min easy spin"; VO2 "5-min rest" | p237, p238 | **MATCHES** for easy spin ("spin" dropped). **OFF** for VO2's "5-min rest", printed "easy". |
| 16 | `{lo} W and up` — anaerobic work | Today drawer, plan list; Planned tab | `planned-step-lines.ts:111`; `quality-work.ts:208`; `StructuredPlannedView.tsx:258` | "Best done by feel with a power FLOOR rather than a specific power target" | p237 | **MATCHES** |
| 17 | `under {N} W` — endurance ride easy step (0–75% FTP) | Today drawer, plan list | `planned-step-lines.ts:113`; `materialize-plan/index.ts:2258-2260` | "easy ride below 75%" | p239 | **MATCHES** |
| 18 | `{lo}–{hi} W` — a single printed % (±10%; sweet spot capped at FTP) | Today drawer, plan list | `quality-work.ts:161,199-218`; `planned-step-lines.ts:115` | "3 rounds of 8 min @ 90%"; sweet spot "as close to threshold as possible without exceeding it" | p238-239 | **Centre MATCHES.** ±10% is TrainingPeaks (cited `quality-work.ts:155`) — **NOT ON ANY PAGE** (grepped `±`, `tolerance`: 0). |
| 19 | `{lo}–{hi} W` — a printed range (VO2 110–120%) | Today drawer, plan list | `quality-work.ts:217` | "5 rounds of 3 min @ 110–120%" | p238 | **MATCHES** |
| 20 | `{A}–{B} W` (56–75% FTP) — easy ride step on a row without `family:ride_endurance` | Today drawer, plan list | `materialize-plan/index.ts:2257-2261` (`COGGAN_Z2`) | "easy ride below 75%" | p239 | **OFF.** Top matches; the 56% floor is Coggan (grepped `Coggan`: 0). |
| 21 | `Set N` / `{lens} @ {pace}` / `jog after each: {lens} @ {pace}` / `{len} @ {pace} between sets` — the descending ladder | Today drawer, plan list | `planned-step-lines.ts:295-302` | "3 min @ 120% / 2 min @ 60% / 2 min @ 120% / 1:20 @ 60% …"; "1:30–2 min walk/recovery jog between rounds" | p231-232 | **OFF.** The page's "@ 60%" steps print as "jog after each" (the page gives a percentage, not a jog); the rest between rounds prints an easy pace. The word "jog" is sport-blind (a ride would print it; no ride family builds this shape — *inferring*). |
| 22 | `Walk/Jog — as long as you need @ HR {lo}–{hi} · ref {pace}` — strides recovery on an easy run | Today drawer, plan list | `materialize-plan/index.ts:2215-2222`; `planned-step-lines.ts:129,135` | Strides appear only in the p210 pretest; Sprint/Power recovery = "full recovery" | p210, p229 | **NOT ON ANY PAGE** as an easy-run add-on (grepped `stride`: 6 hits, p210 and Sprint/Power only). |
| **B** | **Test steps — labels print on the Planned tab only (see "Which screen")** | | | | | |
| 23 | `Easy spin — 8 min` | Planned tab | `materialize-plan/index.ts:1520` | "5–10 min easy" | p212 | **MATCHES** |
| 24 | `High turnover — 1 min (fast pedal, easy resistance)` ×3 | Planned tab | `:1521,1523,1525` | "3 × 1 min high turnover / 1 min rest" | p212 | **OFF.** "(fast pedal, easy resistance)" is not on the page (grepped `fast pedal`: 0). |
| 25 | `Easy — 1 min` (between turnovers) | Planned tab; step lines print `1:00 easy` | `:1522,1524,1526` | "1 min rest" | p212 | **OFF** (minor): rest printed as easy. |
| 26 | `Easy — 3 min` | Planned tab | `:1527` | "3 min easy" | p212 | **MATCHES** |
| 27 | `Hard — 3 min at 9 out of 10` | Planned tab | `:1528` | "3 min at 9/10" | p212 | **MATCHES** |
| 28 | `Easy — 7 min` | Planned tab | `:1530` | "6–8 min easy" | p212 | **MATCHES** |
| 29 | `20-minute test — best effort you can hold the whole way. This is the test.` | Planned tab only; step lines print `20:00` | `:1531` | "20 min best effort; FTP = 20-min average × 0.95" | p212 | **MATCHES** |
| 30 | `Easy cool-down — 5 min` (FTP test) | Planned tab | `:1532` | none given | p212 | **NOT ON ANY PAGE** (OURS, labelled `:1512`). |
| 31 | `Easy jog — 7 min` | Planned tab | `:1545` | "Easy 6–8 min jog" | p210 | **MATCHES** |
| 32 | `Stride — about 100 m (20 s), slow to near full tilt` ×2 | Planned tab | `:1546,1548` | "2 × 100 m strides (slow → near full tilt)" | p210 | **MATCHES**; "(20 s)" is OURS (labelled `:1542`). |
| 33 | `Easy — 1 min` after each stride | Planned tab | `:1547` | none given between strides | p210 | **NOT ON ANY PAGE** (OURS, `:1542`). |
| 34 | `Fast — 30 s at your mile-PR pace` ×3 | Planned tab | `:1549,1551,1553` | "3 rounds of 30 s at a 'fast run' (mile PR) pace" | p210 | **MATCHES** |
| 35 | `Easy walk or jog — 1 min` ×3 | Planned tab | `:1550,1552,1554` | "1 min easy walk/jog between" | p210 | **MATCHES** |
| 36 | `Rest — 1 min` | Planned tab | `:1556` | "1 min additional rest" | p210 | **MATCHES** |
| 37 | `Time trial — {n} min. Start at 9.5 out of 10, finish at 10. Even the whole way.` | Planned tab only; step lines print `12:00` | `:1557` | "9.5/10 to begin, ending at 10/10"; 12 / 10 / 8 min by training age | p210 | **OFF.** "Even the whole way" is not on the page (grepped `even pace`, `evenly`: 0) and sits against a build from 9.5 to 10. |
| 38 | `Easy cool-down — 9 min` (run test) | Planned tab | `:1558` | none given | p210 | **NOT ON ANY PAGE** (OURS, `:1542`). |
| 39 | `Time trial — {n} min, all out and even` (`run_tt_` token, non-assessment rows) | Planned tab | `:1665-1669` | "9.5/10 to begin, ending at 10/10" | p210 | **OFF.** "all out and even" ≠ start at 9.5, finish at 10. |
| 40 | `Rest — {n} min` (`run_rest_`) | Planned tab | `:1672-1675` | "1 minute additional rest" | p210 | **MATCHES** |
| 41 | `FTP Test - Maximal Effort` (notes `All-out sustainable effort`) | Planned tab *(notes: not traced to a screen)* | `:2297-2302` | "20 min best effort" | p212 | **OFF.** "Maximal" / "All-out" is not the page's "best effort". |
| 42 | `Easy warmup — 400 yd` · `Rest — 3 min` · `400 yd time trial — max effort` · `200 yd time trial — max effort` · `Easy cool-down — 200 yd` (swim CSS test) | Planned tab | `:1497-1506` | no CSS test in the book | — | **NOT ON ANY PAGE** (grepped `CSS`: 0; field-cited at `:1498`). |
| **C** | **Materialize — run tokens from other generators (labels print on the Planned tab; numbers print everywhere)** | | | | | |
| 43 | `Threshold` label, threshold pace, 60 s rest when none named | Planned tab / step lines | `:1822-1845` | threshold work: "4:1 work-to-rest, rest 30 s–2 min" | p99 | **MATCHES** pace (100%); the 60 s default is OURS (labelled `:1826`). |
| 44 | `Sprint` / `Walk back` (`run_sprint_`) | Planned tab; step lines print `{len} easy` for the walk | `:1853-1866` | "1-min walk between sets"; "2-min walk" | p229 | **MATCHES** on the Planned tab; **OFF** in step lines, where the walk prints as "easy" (`planned-step-lines.ts:141`). |
| 45 | `Z5` / `Float`, pace = 5K − 12 s/mi (floor 4:30/mi), 90 s float | Planned tab / step lines | `:1867-1887` | — | — | **NOT ON ANY PAGE** (grepped `Z5`, `float`, `5K pace`: 0). |
| 46 | tempo at threshold pace (`tempo_{n}min_threshold`); tempo at 5K + offset (`tempo_…_5kpace_plus`) | step lines | `:1735-1782` | "intervals over 15 min become tempo/single efforts" | p99 | Threshold tempo **MATCHES**; the 5K-plus form **NOT ON ANY PAGE** (grepped `5K pace`: 0). |
| 47 | cruise intervals at threshold pace, 60 s rest | step lines | `:1886-1907` | — | — | **NOT ON ANY PAGE** (grepped `cruise`: 0). |
| 48 | fartlek pickups at 5K + 12 s, recovery = pickup length | step lines | `:1784-1800` | p235 "VT1 fartlek targeting 6 × 3 min @ 85%" is a different session | p235 | **NOT ON ANY PAGE** (OURS, labelled `:1795`). |
| 49 | `interval_{n}x{d}_5kpace` / `_base` / `_build` / `_race_specific` / `_taper` — priced at typed 5K / threshold / race pace; 90 or 120 s rest | step lines | `:1953-1995` | MLSS is % of threshold ("15s @ 130% / 45s @ 105%") | p231 | **OFF** where the Viada MLSS falls back to this token (`standing-plan/session-vocabulary.ts:593-607`): 5K pace, not % of threshold. Otherwise **NOT ON ANY PAGE**. |
| 50 | long-run marathon-pace finish, `run_mp_`, tri `run_race_pace_` | step lines | `:1596-1702` | "5-min race-pace finish" (p235) has no pace source on the page | p235 | **NOT ON ANY PAGE** (grepped `marathon pace`: 0). |
| 51 | `Warm-up` · `Hill · {lo}-{hi}% grade` / `Incline · …` · `Walk down` / `Jog down` / `… — press lap when ready` / `Easy — incline down` · `Cool-down` | Planned tab | `:2064-2160` | Intervals "may be done on hills with pace adjusted to hold target intensity" | p229, p231 | **NOT ON ANY PAGE** as a session (grepped `hill`: 2 hits, both that sentence; `grade`, `incline`, `treadmill`: no endurance hit). |
| 52 | `Stride` / `Walk/Jog — as long as you need` (`strides_`) | Planned tab; step lines (row 22) | `:2168-2227` | strides only in the p210 pretest | p210 | **NOT ON ANY PAGE** as a session. |
| **D** | **Materialize — ride tokens** | | | | | |
| 53 | `bike_vo2_` → 110–120% FTP on a row without the anaerobic family | step lines | `:2356-2362` | "6–10 × 1 min @ 110–115%+ … progress to 125–130% by the end" | p237 | **OFF.** The 120% ceiling is not on the page (OURS, labelled `:2358`). |
| 54 | `bike_ss_` 85–95% / `bike_thr_` 95–105% FTP | step lines | `quality-work.ts:62-65,306-315` | sweet spot prints one number per session: 80%, 90%, 95%, 100% | p238-239 | **OFF.** The band replaces the page's number (OURS, labelled `:61`); used only where the library builds a sweet-spot session with no printed level (`session-vocabulary.ts:637-641`). |
| 55 | `bike_tempo_` 80–85%, `bike_race_prep_`, `bike_openers` | step lines | `:2384-2393` | — | — | **NOT ON ANY PAGE** (OURS, labelled `:2385`). |
| 56 | `Recovery` (`bike_recovery_{n}min`) — Planned tab prints `Recovery {len} Recovery` | Planned tab; step lines `{len} easy` | `:2290-2294`; `StructuredPlannedView.tsx:203,356-358` | "5-min easy spin between sets" | p237-239 | **OFF** (wording): page says easy spin. |
| **E** | **Swim** | | | | | |
| 57 | step label = tier word `easy` / `moderate` / `hard` | Planned tab (`{dist} — easy`) | `materialize-plan/index.ts:621-678,3549,3564,3580,3602`; `StructuredPlannedView.tsx:310-322` | L1 endurance: "2 × 600m @ easy-to-moderate (race pace) with 2-min rest"; speed: "25 easy / 25 moderate / 25 hard / 25 all-out" | p240 | **OFF.** The Viada swim (`swim_aerobic_…`, `session-vocabulary.ts:739-751`) carries no swim tag, so it falls to `easy` (`:675`); "to moderate (race pace)" is lost. The tag→tier mapping (CSS, threshold) is **NOT ON ANY PAGE** (grepped `CSS`: 0). |
| 58 | `Drill — {name}` (+ owned gear) | Planned tab | `:3495-3527` | drills: catch-up, DPS, fist, kick, zipper/fingertip drag | p240 | **MATCHES** (names); gear hint is OURS. |
| 59 | `open water steady — sight every 6–8 strokes, pick a landmark; bilateral breathing into chop or sun glare` | Planned tab | `:3437-3459` | "sighting every 10 seconds" (L1), "every 9 seconds" (L2); L3: tether belt, buoy, fluid, whistle MANDATED; escort only | p240-241 | **OFF.** "every 6–8 strokes", "landmark", "bilateral" are not on the page (grepped: 0 each); the mandated L3 safety items are absent. |
| 60 | `aerobic` (workout_structure fallback) | Planned tab | `:3670` | — | — | **NOT ON ANY PAGE** (legacy rows). |
| 61 | subtitle `WU {n} {u} • Drills: … • Pull … • Kick … • Aerobic threshold {n}x{d} @ :{r}r` | Today drawer, plan list, Planned tab (`friendly_summary`) | `_shared/swim/swim-plan-summary.ts:36-117`; written at `materialize-plan/index.ts:4570-4573` | — | — | **NOT ON ANY PAGE**; "threshold" sets are listed under "Aerobic". |
| 62 | swim pace bands `Recovery` / `Easy` / `Moderate` / `Threshold` / `Hard` (+12/+8/+3/−2 s per 100) | Profile *(per file header; not traced)* | `_shared/endurance/display-zones.ts:84-94` | — | — | **NOT ON ANY PAGE** (OURS, labelled `:88`). |
| 63 | swim slot notes, e.g. `Primary quality swim — threshold / sustained race-relevant pace.` | *(inferring: generate-combined-plan; not traced to a screen)* | `_shared/swim-program-templates.ts:104-422` | — | — | **NOT ON ANY PAGE** (grepped `CSS`: 0; `open water`: 4 hits, all p240-241). |
| **F** | **Other shared text** | | | | | |
| 64 | power zones `Z1 Recovery` … `Z7 Neuromuscular` (Coggan) | Profile / State *(per file header)* | `display-zones.ts:44-58` | six zones: Z2 tops at VT1, Z3 subthreshold to VT2, Z4 VT2–vVO2max, Z5 anaerobic, Z6 sprint | p92 | **NOT ON ANY PAGE** (grepped `Coggan`, `Neuromuscular`: 0); seven levels vs the book's six. |
| 65 | live cue `✅ IN ZONE` / `⬆️ PICK IT UP` / `⬆️⬆️ SPEED UP` / `⬇️ EASE OFF` / `⬇️⬇️ SLOW DOWN`; voice `Pick it up` / `Ease off` / `Speed up` / `Slow down`; bands 5% fast / 7% slow / ±10 bpm | recording screen `ExecutionScreen.tsx:81-84`; voice `useVoiceAnnouncements.ts:220-226` | `_shared/live-cue.ts:19-45` | — | — | **NOT ON ANY PAGE** (grepped `pick it up`, `ease off`, `slow down`, `in zone`: 0; numbers OURS, labelled). Emojis print on the screen. |
| 66 | `At 5 and 20 minutes in, could you say a full sentence without taking a breath?` | post-workout popup (`PostWorkoutFeedback.tsx:672`) | `_shared/effort-words.ts:53` | talk test after 5 and 20 min; "without taking a breath" | p235, p211 | **MATCHES** |
| 67 | `planned: a full sentence without taking a breath · you: yes` / `… you: no. Harder than the talk test this session asked for.` | Performance rows *(per file header)* | `effort-words.ts:64-67` | same | p211 | **MATCHES** |
| 68 | `RPE {n}, {very easy … maximal}` (Foster CR-10) | effort popup / Performance | `effort-words.ts:39-61`; `src/components/ui/effort-scale.tsx:34-38` | reported RPE is one of three signals for adjusting threshold | p123 | **NOT ON ANY PAGE** as a scale (Foster, cited `:12`). |
| 69 | Instead sheet: `{sets} sets of {r} rounds: 15 s at {pace}, 45 s at {pace}, 1 min easy; 2 min easy between` / `{n} × {len} at {pace}, {rest} easy between` / `{len} all out` | Instead sheet | `quality-work.ts:412-461`; `ALL_OUT_WORD` `:432` | "1 min @ VT1"; "2-min recovery walk/jog between sets"; "max effort" / "all-out" | p231, p233, p236 | **OFF.** VT1 → "easy", walk/jog and rest → "easy"; single pace where step lines print a range. `all out` is flagged unapproved in the code (`:431`). |
| 70 | swapped row: `Hard {ride/run/swim}, no target` / `Easy {…}, no pace target` + `Swapped from your planned {x}. Same time, same effort.` | Today drawer, plan list, Planned tab | `_shared/session-swap/swap.ts:333-345`; `PlannedWorkoutSummary.tsx:298-301` | "when in doubt, use cross-training for easy work, not threshold or sprint work"; hard ride allowed when running volume is capped | p137, p138 | **NOT ON ANY PAGE** (grepped `same effort`, `no target`: 0). |
| 71 | `Same session, indoors. Ground impact still counts.` / `Same session, indoors.` | Instead sheet | `_shared/session-swap/copy.ts:22,29` | substitution on a machine "as long as they know their threshold in each"; "impact with the ground on at least one day" | p275 | **MATCHES** |
| **G** | **get-week** | | | | | |
| 72 | pace range ±5% built from `paceTarget` when a step has none | wherever get-week's steps are read *(inferring: inert — `toV3Step` always writes `pace_range` beside `paceTarget`, `materialize-plan/index.ts:3985-4012`)* | `get-week/index.ts:776-796,1086-1105,1185-1200` | — | — | **NOT ON ANY PAGE**; a third pace tolerance. |
| **H** | **Client re-composition** | | | | | |
| 73 | `Warmup` / `Cooldown` / `Recovery` / `Rest` + `{len} @ {lo}–{hi}/mi` or `@ {A}–{B} W` | Planned tab | `StructuredPlannedView.tsx:200-205,334-354`; pace `/mi` always `:248` | as rows 1–9 | p229-239 | **OFF** — same numbers as rows 1–9 in different words (`Warmup 10:00 @ …` vs `10:00 warm-up · easy pace …`), and `/mi` for a metric athlete. |
| 74 | `@ HR {lo}–{hi}, easy enough to say a full sentence without stopping for breath · ref pace {…}` (first HR step only) | Planned tab | `StructuredPlannedView.tsx:334-346` | talk test | p211, p235 | **MATCHES** in substance; a third wording of the talk test (rows 11, 66). |
| 75 | `Unstructured session — ride with the group. No prescribed intervals.` | Planned tab | `StructuredPlannedView.tsx:652-654` | — | — | **NOT ON ANY PAGE** (group ride). |
| 76 | `Target: {midpoint}/mi` · `🎯 Target: {mph} mph` | recording screen | `workout-execution/ExecutionScreen.tsx:232,242` | page prints one % per step | p229-235 | Work steps: **MATCHES** the centre. Easy/VT1 steps: **OFF** as rows 6 and 10 (Friel midpoint). An emoji prints on the screen. |
| 77 | titles `Run — Tempo` / `Run — Intervals` / `Easy Run` / `M-Pace Run` / `Ride — VO2` / `Ride — Threshold` / `Ride — Sweet Spot` / `Ride — Endurance` | workout screen title (when no `workout_structure.title`) | `UnifiedWorkoutView.tsx:620-656,676-694` | session names: Sprint/Power, MLSS, NT, VT1, LSD, Sprints, AnA, VO2, Sweet Spot, Endurance | p229-239 | **NOT ON ANY PAGE** for Tempo / M-Pace / Intervals (grepped `tempo`: 9 hits, none a session name). |
| 78 | calendar chips `RN-VO2` / `RN-TMP` / `RN-LR` / `RN` · `BK-VO2` / `BK-THR` / `BK-SS` / `BK-EZ` / `BK` | calendar cells | `WorkoutCalendar.tsx:174-181,219-238` | Anaerobic (p237) and VO2 (p238) are two sessions | p237, p238 | **OFF.** An Anaerobic Ride carried by `bike_vo2_` prints `BK-VO2` (`:231`); MLSS and NT runs print `RN` *(inferring from their tokens)*. |
| 79 | builder hard card `Hard run — sustained threshold` / `Hard ride — top-end intensity` / `— club session` | NonRaceBuilder week card (`NonRaceBuilder.tsx:6448`) | `src/lib/preview-week-read.ts:22-27,96-107` | MLSS "emphasises time spent in zone 4"; sweet spot "as close to threshold as possible without exceeding it" | p231, p238 | **NOT ON ANY PAGE** (grepped `top-end`, `sustained threshold`: 0). MLSS is called "top-end". |

---

### Counts (79 rows, one verdict each; split rows listed apart)

- **MATCHES — 22:** 11, 12, 16, 17, 19, 23, 26, 27, 28, 29, 31, 32, 34, 35, 36, 40, 43, 58, 66, 67, 71, 74
- **OFF — 25:** 1, 2, 3, 6, 8, 9, 10, 13, 14, 20, 21, 24, 25, 37, 39, 41, 49, 53, 54, 56, 57, 59, 69, 73, 78
- **NOT ON ANY PAGE — 25:** 4, 22, 30, 33, 38, 42, 45, 47, 48, 50, 51, 52, 55, 60, 61, 62, 63, 64, 65, 68, 70, 72, 75, 77, 79
- **Split — 7:** 5, 7, 18 (centre number MATCHES, the band around it NOT ON ANY PAGE) · 15, 44, 76 (MATCHES on one step or screen, OFF on another) · 46 (threshold form MATCHES, 5K form NOT ON ANY PAGE)

---

### Table 2 — one prescription, two or more places, different words or numbers

| # | Prescription | Places and what each says | Should come from |
|---|---|---|---|
| M1 | **Warm-up / cool-down of a hard run or ride** | Library: page labels "Easy jog", "Walking lunges, 3 sets of 20 m", "Cossack squats…", "Butt kicks…", "Cadence-only sprints…", "Steady effort" 5 min @ 95% (`endurance-library/source-rules.ts:137-189`) → collapsed to one timed token (`standing-plan/session-vocabulary.ts:329-363`) → step lines `10:00 warm-up · easy pace …` (`planned-step-lines.ts:165`) → Planned tab `Warmup 10:00 @ …/mi` (`StructuredPlannedView.tsx:201,346-349`) → ride `… · {A}–{B} W` at 55–70% FTP (`materialize-plan/index.ts:2272-2275`). | The library wrapper (`source-rules.ts` WRAPPERS), carried step by step through materialize into `computed.steps` / `step_lines`. |
| M2 | **Talk test** | `Easy enough to talk in full sentences. Check after 5 minutes and again after 20.` (`planned-step-lines.ts:56`) · `, easy enough to say a full sentence without stopping for breath` (`StructuredPlannedView.tsx:343`) · `At 5 and 20 minutes in, could you say a full sentence without taking a breath?` (`effort-words.ts:53`) · `planned: a full sentence without taking a breath` (`effort-words.ts:65`). | `_shared/effort-words.ts` (the module the header names as the rule's home); the Planned tab should print the server line. |
| M3 | **Pace band around a target** | run work ±2%, other run steps ±6% (`materialize-plan/index.ts:4004-4011`) · easy steps Friel × 1.14–1.29 (`:725-756`, D-478) · get-week ±5% (`get-week/index.ts:787-796,1097-1105,1196`) · ride ±10% TrainingPeaks (`quality-work.ts:161`). | One constant beside `SINGLE_PERCENT_BAND` in `quality-work.ts`, with the run tolerance sourced or marked OURS in one place; get-week's copy deleted. |
| M4 | **Target pace shown as range vs single number** | step lines: range (`planned-step-lines.ts:100`) · Instead sheet: single threshold ÷ % (`quality-work.ts:417,456`) · recording screen: midpoint of the range (`ExecutionScreen.tsx:232,242`) · Planned tab: range (`StructuredPlannedView.tsx:248`). | The saved step's `pace_range` in `computed.steps` (`toV3Step`). |
| M5 | **Recovery / rest wording** | step lines ` easy`, `@ {easy pace}`, `jog after each:` (`planned-step-lines.ts:141,221,297`) · Instead sheet `easy between` (`quality-work.ts:441`) · Planned tab `Recovery` / `Rest` (`StructuredPlannedView.tsx:203-204`) · materialize labels `Walk back`, `Float`, `Walk/Jog — as long as you need`, `Recovery`, `Easy — 1 min` (`materialize-plan/index.ts:1862,1882,2221,2293,1522`). Page: "walk", "walk/jog", "easy spin", "rest", "full recovery", "@ VT1". | The page word on the library step (`endurance-library` step label), carried through `toV3Step` and printed by step lines. |
| M6 | **Test instructions (p210 run test, p212 FTP test)** | `buildAssessmentSteps` labels (`materialize-plan/index.ts:1495-1561`) print on the Planned tab only; step lines print times only (`planned-step-lines.ts:123-130`) on Today and the plan list; `run_tt_` token says `all out and even` (`:1668`); `bike_ftp_test_` says `FTP Test - Maximal Effort` / `All-out sustainable effort` (`:2301`). | `buildAssessmentSteps` labels, printed by step lines. |
| M7 | **All-out effort** | `All-out: the best speed you have today.` (`planned-step-lines.ts:58`, run only) · `all out` (`quality-work.ts:432`, unapproved) · `Sprint` labels (`materialize-plan/index.ts:1860,2376`) · `Maximal Effort` / `All-out sustainable effort` (`:2301`) · ride all-out steps print nothing (row 14). | `ALL_OUT_LINE` in `planned-step-lines.ts`, applied to every family whose page says all-out / max effort (p229, p236, p239). |
| M8 | **An easy ride's watts** | `under {N} W` (0–75% FTP) on `ride_endurance` rows (`materialize-plan/index.ts:2258-2260`) · `{A}–{B} W` (56–75%, Coggan) on every other row (`:2261`). | `EASY_RIDE_CEILING_PCT_OF_FTP` (`quality-work.ts:188`, p239) for every easy ride step. |
| M9 | **VT1 on a run** | step lines: easy pace range (row 6) · HR range Friel 85–90% LTHR (row 10) · Instead sheet: `easy` (row 69) · Planned tab: HR + talk test (row 74) · recording screen: midpoint pace (row 76). | One VT1 anchor. The book's is the p211 talk-test ramp (not built; SOURCE H0.2). |
| M10 | **The session's name / intensity** | generator name (e.g. "Anaerobic Ride") · workout screen `Ride — VO2` / `Run — Tempo` (`UnifiedWorkoutView.tsx:623-656,681-694`) · calendar `BK-VO2` (`WorkoutCalendar.tsx:231`) · builder `top-end intensity` / `sustained threshold` (`preview-week-read.ts:96-107`). | The `family:` tag (`standing-plan/session-vocabulary.ts` family labels). |
| M11 | **Pace unit for a metric athlete** | step lines: work steps `/mi` (`planned-step-lines.ts:100`), warm-up `/km` (`:148-155`) · Instead sheet `/km` (`quality-work.ts:357-361`) · Planned tab `/mi` (`StructuredPlannedView.tsx:248`) · recording screen `/mi` (`ExecutionScreen.tsx:52`). | `display-format.ts` (the server's one formatter). |
| M12 | **Swim intensity** | step label `easy` / `moderate` / `hard` (`materialize-plan/index.ts:621-678`) · subtitle `Aerobic threshold …` (`swim-plan-summary.ts:86`) · page "easy-to-moderate (race pace)" (p240). | The library swim step (p240-241), carried through `swimTokenIntensity`. |
| M13 | **Rest between MLSS sets** | step lines: `@ {easy pace}` (row 8) · watch: time only, no target (`materialize-plan/index.ts:735-741`) · page: "recovery walk/jog". | The page's word on the step; the step lines should not print a pace the watch does not get. |

---

# Appendix C — Text that leaves the app, State and Performance, line by line


Branch `stage/one-truth-drift`, read-only, 2026-09-18. Book = `docs/SOURCE-viada-hybrid-athlete.md`.
Evidence labels: **[read]** = I opened the file/page text; **[traced]** = I followed the code path; **[inferred]** = reasoning, not run.

### 0. What actually leaves the app (traced)

| Route | What goes | Where |
|---|---|---|
| Calendar sync → **Intervals.icu → Zwift** | rides only; name = derived title; description = the row's session note + one line per step (`- cue 12m 55-70%`) | `_shared/calendar-sync/run.ts:97-100`, `_shared/intervals/serialize.ts:58-129` |
| Calendar sync → **Garmin** | name = derived title; `description` (session note) **for rides only**; each step's description = the step label or a converter word (`warm up`, `cool down`, `rest`, `interval`, `Stride`) | `run.ts:101-105`, `_shared/garmin/convert-workout.ts:503-545, 825-828` |
| Default destinations | ride → Intervals, run → Garmin (if connected), swim none, **strength none**; written only when Intervals is connected | `_shared/intervals/connection.ts:17-20`. Grepped `src` for `workout_destinations` and `destinations`: no screen writes it. |
| Manual "Send to Garmin" | function exists, uses the raw stored name | `send-workout-to-garmin/index.ts:69`. Grepped `src` for `send-workout`, `Send to Garmin`, `sendToGarmin`, `send_to_garmin`: no caller. |
| Export zip | `plans.csv` (plan, dates, raw session `name`, minutes), `sets.csv` (Strong layout), `workouts.csv`, `profile.json` | `export-data/index.ts:196-325` |
| `.ics` feed | none. Grepped `src` + `supabase/functions` for `BEGIN:VCALENDAR`, `text/calendar`, `.ics`: no builder. |
| `.zwo` / Zwift file | none. Zwift gets rides only through Intervals.icu. Grepped `.zwo`, `zwift`. |

**Strength prescriptions never leave the app** [traced]: destination defaults to `none`; if a strength row were sent, its `computed.steps` (`kind:'strength'`, no seconds/distance) are dropped by the malformed-step guard at `convert-workout.ts:719-722` [inferred from trace, not run]. Only the name (`plans.csv`) and logged sets (`sets.csv`) leave.

**Run session notes never reach the watch** [traced]: `convert-workout.ts:825` sends `description` for CYCLING only. The run family lines, the race-tempo sentence and the run test's instructions stay in the app.

---

### 1. Line-by-line

#### 1a. Session names (calendar title on Garmin / Intervals; `plans.csv` export)

| # | Line as printed | Surface | Code | Book | Page | Verdict |
|---|---|---|---|---|---|---|
| N1 | `Hard Run` (run_mlss) | Garmin name, plans.csv | `_shared/standing-plan/session-vocabulary.ts:404` | "Maximal Lactate Steady State — MLSS" | p231 | **NOT ON ANY PAGE** (grepped SOURCE for "Hard Run": none) |
| N2 | `Near-threshold Run` | Garmin, plans.csv | `session-vocabulary.ts:405` | "Near-Threshold — NT" | p233 | MATCHES |
| N3 | `Easy Run` (run_vt1) | Garmin, plans.csv | `session-vocabulary.ts:406` | "VT1" | p235 | **OFF** — renamed; the page's name for the session is VT1 |
| N4 | `Long Run` (run_lsd) | Garmin, plans.csv | `session-vocabulary.ts:407` | "Long Slow Distance — LSD" | p235 | MATCHES (shortened) |
| N5 | `Hard Ride` (ride_sweet_spot) | Intervals/Zwift, plans.csv | `session-vocabulary.ts:410` | "Sweet Spot" | p238 | **NOT ON ANY PAGE** (grepped "Hard Ride": only our heading on p138 notes) |
| N6 | `Anaerobic Ride` | Intervals, plans.csv | `session-vocabulary.ts:417` | "Anaerobic — AnA" | p237 | MATCHES |
| N7 | `VO2 Ride`, `Sprint Ride` | Intervals, plans.csv | `session-vocabulary.ts:419-421` | "VO2", "Sprints" | p238, p236 | MATCHES — but the code marks both "PROPOSED, NOT APPROVED" and they reach calendars |
| N8 | `Ride` (ride_endurance) → calendar shows `Ride — Endurance`; plans.csv shows `Ride` | Intervals vs plans.csv | `session-vocabulary.ts:423`; `src/lib/derive-workout-title.ts:196-205`; `export-data/index.ts:274` | "Endurance" | p239 | **OFF on the export** (bare "Ride"); calendar matches |
| N9 | `Maximum Effort: Upper`, `Dynamic Effort: Lower` | calendar title (strength, if ever sent) | `_shared/intent-title.ts:23-37`, `run.ts:97` | "ME, or maximum effort"; "DE, or dynamic effort sets" | p219 | MATCHES |
| N10 | `{label} (race tempo)` + "Run at race pace, with the recovery periods a quarter longer than usual." | name on Garmin; sentence in-app only | `session-vocabulary.ts:782, 836-837` | "increase the pace here to race pace, but extend recovery periods by 25 percent" | p247 | MATCHES (sentence does not reach the watch) |
| N11 | `Threshold Time Trial`, `FTP Test — 20-Minute Protocol` | Garmin / Intervals names | `_shared/baseline-test-rows.ts:37, 55` | time trial; "The 20-Minute Test" | p210, p212 | MATCHES |
| N12 | `FTP Test — 5-Minute All-Out` | Intervals name | `baseline-test-rows.ts:89` | — | — | **NOT ON ANY PAGE** — code cites the hybrid-coach course Module 3, not the book (grepped SOURCE for "5-minute", "five-minute", "5-min test": none) |

#### 1b. Session notes sent as the workout description (rides → Garmin description + Intervals description)

| # | Line as printed | Code | Book | Page | Verdict |
|---|---|---|---|---|---|
| D1 | "Go by feel. Stay above the floor. No ceiling. Each set harder than the last." | `_shared/standing-plan/family-lines.ts:26` | "best done by feel with a power FLOOR rather than a specific power target … Each set should start at 110% and progress to 125–130% by the end" | p237 | **OFF** — (a) the page prints a top (125–130%) and the same export sends a 130% ceiling to the watch and to Zwift (`quality-work.ts:170`, `convert-workout.ts:239-241`, `serialize.ts:76`), so the description says "No ceiling" over steps that have one; (b) "each set harder than the last" reads the progression across sets, while `source-rules.ts:1735-1737` reads it within each set |
| D2 | "On Zwift, turn ERG off." | `family-lines.ts:79` (appended `session-vocabulary.ts:826`) | "by feel … power floor rather than a specific power target" | p237 | MATCHES in substance (Zwift/ERG not on the page). Also goes to Garmin's description, where it does not apply |
| D3 | "Easy ride, under 75 percent of FTP the whole way." | `family-lines.ts:30` | "easy ride below 75%" | p239 | MATCHES (FTP as the base is inferred — SOURCE Part D note) |
| D4 | "Easy ride with a block of 2-minute pushes, then a 10-second sprint every {N} minutes. Everything else under 75 percent of FTP." | `family-lines.ts:50-52` | "4 rounds of (2 min @ 80% / 3 min @ 70%) · 45 min @ VT1 with a 10-second all-out sprint every 9 minutes" | p239 | MATCHES ("@ VT1" rendered as under 75% — inferred) |
| D5 | "Spend a few minutes of the ride paying attention to how you pedal (smooth circles, not stomping) and how you sit on the bike." | `family-lines.ts:71-72` | "several minutes of every long ride on pedal stroke and position" | p239 | **OFF** — "(smooth circles, not stomping)" is not on the page (grepped "smooth", "stomp": none) |
| D6 | "As close to threshold as you can without going over." | `family-lines.ts:41` | "as close to threshold as possible without exceeding it" | p238 | MATCHES |
| D7 | FTP 20-min: "…PREPARATION: indoor trainer recommended; a power meter or smart trainer. WARM-UP: 5–10 min easy; 3 x 1 min at low resistance and high turnover with 1 min rest between; 3 min easy; 3 min at 9 out of 10; 6–8 min easy. TEST: press lap and ride 20 minutes at your best even effort… COOL-DOWN: 5–10 min easy. RESULT: your FTP is the 20-minute average power x 0.95…" | `baseline-test-rows.ts:58` | "5–10 min easy; 3 × 1 min high turnover / 1 min rest; 3 min easy; 3 min at 9/10; 6–8 min easy; 20 min best effort; FTP = 20-min average watts × 0.95" | p212 | **OFF** — steps and × 0.95 match; not on the page: PREPARATION, "low resistance", "even", the cool-down (code marks the cool-down OURS). Grepped H0 lines 1464-1497 for "indoor", "trainer", "resistance", "even", "cool": none |
| D8 | FTP 5-min: "…start as hard as you can hold and hang on until five minutes are up. There is no pacing strategy, which is what makes it repeatable. Your 5-minute power feeds the power curve…" | `baseline-test-rows.ts:92` | — | — | **NOT ON ANY PAGE** (course module, see N12) |
| D9 | Run test: "…PREPARATION: flat route or track; heart rate strap on. WARM-UP: 6–8 min easy jog; 2 x 100 m strides…; 3 x 30 s at your fast (mile-PR) pace with 1 min easy walk/jog between; then 1 min rest. TRIAL: … 12 minutes (under 2 years…), 10 minutes (2–4 years) or 8 minutes (4+ years) — start at 9.5 out of 10, finish at 10 out of 10, even the whole way… COOL-DOWN: 8–10 min easy. RESULT: …takes 88% of that speed as your threshold pace" | `baseline-test-rows.ts:40` (in-app; not sent — runs carry no description) | p210 protocol, 88% of speed | p210 | **OFF** — protocol and 88% match; "flat route or track; heart rate strap on", "even the whole way" and the cool-down are not on the page (cool-down marked OURS; grepped H0 for "flat", "track", "strap", "even": none) |

#### 1c. Steps and targets on the watch / on Zwift

| # | Line / target as sent | Surface | Code | Book | Page | Verdict |
|---|---|---|---|---|---|---|
| S1 | Ride warm-up: one step, `Warmup {N}m 55-70%` (Intervals) / 55–70% FTP (Garmin) | Intervals, Garmin | `session-vocabulary.ts:343` emits `warmup_bike_quality_{N}min_fastpedal`; `materialize-plan/index.ts:2266-2270` (marked OURS) | p237/p238: "10–15 min easy spin" (no number); p238 VO2: "15-min easy spin · 5 min @ 95% · 5-min easy spin"; p236: "10-min easy spin · 4 cadence-only 15-second sprints … 3-min rest between" | p236–p238 | **OFF** — the library keeps the page's steps (`endurance-library/source-rules.ts:170-195`); the token collapses them into one step at an OURS band. The VO2 warm-up's 5 min @ 95% and the sprint warm-up's cadence sprints do not reach the watch or Zwift; "easy spin" gets a number here while the same words in a recovery get none (`materialize-plan:2238-2241`) |
| S2 | Ride cool-down 40–55% FTP (`Cooldown 8m 40-55%`) | Intervals, Garmin (FTP test rows) | `materialize-plan/index.ts:2283-2287` (marked OURS); tokens at `baseline-test-rows.ts:67, 99` | "No cooldown box is printed for ANY cycling family" | p236–p239 | **NOT ON ANY PAGE** |
| S3 | Easy endurance step: Garmin 0–75% FTP; Intervals `freeride` | Garmin, Intervals | `materialize-plan:2255-2257`; `serialize.ts:81-84` | "easy ride below 75%" | p239 | MATCHES (Intervals sends no target; see M4) |
| S4 | A single printed % goes out as ±10% (e.g. p238 "4 min @ 95%" → 86–100%; p237 "1 min @ 50%" → 45–55%) | Intervals, Garmin | `plan-tokens/quality-work.ts:161, 199-218`; `convert-workout.ts:245` | one number per step | p237–p239 | **OFF** — widened; cited to TrainingPeaks, not the page. The cap at 100% on sweet spot matches p238 "without exceeding it" |
| S5 | Anaerobic floor-only step sent as 110–130% FTP | Intervals, Garmin | `quality-work.ts:170`; `serialize.ts:73-76`; `convert-workout.ts:239-241` | "start at 110% and progress to 125–130% by the end" | p237 | MATCHES (page top) — contradicts D1's "No ceiling" |
| S6 | Run work pace: single pace ±2%; other steps ±6% | Garmin | `materialize-plan/index.ts:4005-4008` (marked OURS) | single % of threshold | p231–p235 | **OFF** — band is ours |
| S7 | Run "@ VT1" / "easy jog" / "walk" recoveries → step description `rest`, time only | Garmin | `convert-workout.ts:455-467` (every recovery becomes `effortLabel:'rest'`); `materialize-plan:742` (`watch_target:'none'`) | "1 min @ VT1", "1-min easy jog", "2-min recovery walk/jog" | p231–p234 | **OFF** — "@ VT1" is a jog at VT1, printed on the watch as "rest" with intensity REST. Also drops step labels like "Jog down — press lap when ready", "Walk back", "Float", "Walk/Jog — as long as you need" (`materialize-plan:2088, 1862, 1882, 2221`) |
| S8 | Run warm-up = one `warm up` step of the easy-jog minutes | Garmin | `session-vocabulary.ts:359`; `convert-workout.ts:503-511` | "10-min easy jog · 3 sets of 20m walking lunges · 2 sets of 10 per side Cossack squats"; sprint box adds butt kicks and arm-pump drills | p229, p231, p233 | **OFF** — drills do not reach the watch; the sprint box's 60 s + 90 s of drills are counted as jog time |
| S9 | Easy run steps sent as a heart-rate range off threshold heart rate | Garmin | `convert-workout.ts:128-140`; range from Friel % LTHR (D-462) | VT1 by talk test | p211, p235 | **NOT ON ANY PAGE** |
| S10 | Run test trial: "Time trial — {N} min. Start at 9.5 out of 10, finish at 10. Even the whole way." N always 12 | Garmin | `materialize-plan/index.ts:1558`; length from `run_tt_12min` at `baseline-test-rows.ts:44` | "9.5/10 to begin, ending at 10/10"; 12 / 10 / 8 min by training age | p210 | **OFF** — "Even the whole way" not on the page; the watch always runs 12 min while the description offers 10 or 8 |
| S11 | Run test strides: in-app "Stride — about 100 m (20 s), slow to near full tilt"; watch shows `Stride` | Garmin | `materialize-plan:1546`; `convert-workout.ts:522-534` | "2 × 100 m strides (slow → near full tilt)" | p210 | **OFF on the watch** — the cue is cut to one word (20 s is marked OURS) |
| S12 | FTP 20-min test as sent from Adjust / week-one rows (not tagged `assessment`, so tokens expand): warm-up 8 min at 55–70%; three 1-min steps with no label (Garmin `interval`, Intervals no cue); "3 min at 9/10" sent as **110–120% FTP**; test step `FTP Test - Maximal Effort`; cool-down 8 min 40–55% | Intervals, Garmin | `baseline-test-rows.ts:62-70`; `materialize-plan:4485` (only `assessment` rows use the book steps); bike_vo2 branch `wattsAt(1.1, 1.2)` at `:2355-2359`; `:2301` | "3 min at 9/10"; "20 min best effort" | p212 | **OFF** — the note sent in the same workout says "3 min at 9 out of 10" and the step says 110–120% FTP |
| S13 | FTP test, assessment path: "Easy spin — 8 min", "High turnover — 1 min (fast pedal, easy resistance)", "Hard — 3 min at 9 out of 10", "20-minute test — best effort you can hold the whole way. This is the test." | Garmin; **refused by Intervals** | `materialize-plan/index.ts:1515-1531`; only rows from `generate-combined-plan/week-builder.ts:2594` | p212 protocol | p212 | MATCHES (5-min cool-down marked OURS). The labels contain digits, which `serialize.ts:67` refuses, so this row never reaches Intervals.icu/Zwift [traced] |
| S14 | Strides add-on: `Stride` steps, `rest` between | Garmin | `session-vocabulary.ts:284-293`; `source-rules.ts:1724-1732` | strides named; no dose | p109 | MATCHES (dose labelled OURS in code) |
| S15 | Older-generator labels: `Z5` (VO2 reps), `Threshold`, `Float`, `Hill · {grade}` | Garmin (race/combined plans) | `materialize-plan/index.ts:1838, 1880-1882, 2079` | zone 4 = VT2 to vVO2max; zone 5 = anaerobic | B4 (Ch.4; page not recorded in SOURCE) | **OFF** — "Z5" names VO2 work the book puts in zone 4; "Float" not on any page (grepped "float": none) |

#### 1d. State / Performance lines that state an instruction

| # | Line as printed | Surface | Code | Book | Page | Verdict |
|---|---|---|---|---|---|---|
| T1 | "A retest goes on today's calendar as a test session and opens in the logger: warm-up ramp, then one all-out set per lift. …" | State → Adjust → Strength (info) | `src/components/context/StateAdjustLens.tsx:412` | 75% × 6, +10% × 5, +5% for max reps | p215 | MATCHES ("max reps" as "all-out set") |
| T2 | "Easy days run on a heart-rate range off threshold heart rate; the easy pace shown is your zone 2 pace, worked out from threshold pace. … a run logged within a day of it is read as the test…" | Adjust → Run (info) | `StateAdjustLens.tsx:413` | VT1 by talk test | p211 | **NOT ON ANY PAGE** (Friel % LTHR, D-462; one-day window ours) |
| T3 | "The 20-minute test is the classic. The 5-minute test is all-out with no pacing, so it repeats well; it counts together with a ride that had a 20-minute effort in the last 90 days." | Adjust → Bike (info) | `StateAdjustLens.tsx:414` | 20-min test and Ramp test | p212–p213 | **OFF** — 5-min test is course material; 90 days ours; the Ramp test on the page is not offered |
| T4 | "Max-effort sets become skill and speed sets, the extra lower-body sets come out, and the endurance sessions drop a level. Switch to it two weeks out from a race or a meet. It is not a scheduled light week: the standard week is built to be run indefinitely." | Adjust → Deload | `StateAdjustLens.tsx:428` | p274: ME → SKILL (upper) / DE (lower); braced/superset volume off lower days; level 2 → 1, NT → VT1, days 2 and 5 lose endurance. Trigger per program: p247 two weeks out; p269 3 and 2 weeks out; p275 pivot program ~a month out; p283 up to 4 weeks; p245 ME underperforms 2 weeks in a row | p245, p247, p269, p274, p275, p283 | **OFF** — "speed" is not the book's word for DE (and was removed as a title word in `intent-title.ts:4-6`); "drop a level" misses that sessions are removed and NT becomes VT1; "two weeks out" is p247's rule stated for every program. Last sentence matches p120 / J4 |
| T5 | "Expect this to ease over 2–3 days — easy movement helps more than rest." / "Normal loading response — keep efforts easy if legs still feel heavy." / "…Fine to keep rides/runs easy until it clears; you'll be fresh for {event}." | State header (expanded) | `_shared/response-model/loaded-legs.ts:35-49` (marked OURS) | — | — | **NOT ON ANY PAGE** |
| T6 | Race-week bullets: "Most race-specific fitness is already in the bank — this week is about freshness and sharpness, not adding volume." / "Keep legs sharp with easy running plus short strides or a modest touch of race rhythm…" / "…keep effort controlled — a race-specific touch, not a fitness build or empty-the-tank session." / skip-for-fatigue bullet; title "Race week — grounded cues" | State header | `supabase/functions/coach/index.ts:536-567` | p247: "focus on race pace repeats on your tempo days both taper weeks"; p118: intensity does not drop | p118, p247 | **NOT ON ANY PAGE** — and runs against p247 and p118 |
| T7 | "how long each day takes to recover from, by its work sets — 6–8 is a day or two, 14 or more is up to three days" | State weekly lifting card | `src/components/context/ViadaWeekCard.tsx:161-162` | 6–8 work sets ~24–48 h; 14+ up to 72 h | p86 | MATCHES |

#### 1e. Export files

| # | Line | Code | Book | Verdict |
|---|---|---|---|---|
| X1 | `sets.csv` RPE column = 10 − logged RIR | `export-data/index.ts:241-244` | RIR defined on p219; no RIR→RPE rule | **NOT ON ANY PAGE** (Hevy/RPE-calculator convention, cited in code). Logged data, not a prescription |
| X2 | `plans.csv` session name = raw stored name | `export-data/index.ts:274` | — | see N8 and M1 |

**Counts: 44 rows — MATCHES 17 · OFF 17 · NOT ON ANY PAGE 10.**
(MATCHES: N2 N4 N6 N7 N9 N10 N11 D2 D3 D4 D6 S3 S5 S13 S14 T1 T7. OFF: N3 N8 D1 D5 D7 D9 S1 S4 S6 S7 S8 S10 S11 S12 S15 T3 T4. NOT ON ANY PAGE: N1 N5 N12 D8 S2 S9 T2 T5 T6 X1.)

---

### 2. One prescription, stated in two or more places with different words or numbers

| # | Prescription | Places and words | The one place it should come from |
|---|---|---|---|
| M1 | The session's title | Calendar sync: "Maximum Effort: Upper" / "Ride — Endurance" (`calendar-sync/run.ts:97`, via `derive-workout-title.ts` + `intent-title.ts`) · manual Garmin send: raw "ME: Upper" / "Ride" (`send-workout-to-garmin/index.ts:69` → `convert-workout.ts:827`) · `plans.csv`: raw name (`export-data/index.ts:274`) · State NEXT row: raw name (`coach/index.ts:1014`) | `run.ts:97`'s title (intentTitle + deriveWorkoutTitle), sent by the server to every reader |
| M2 | DE's name | "Dynamic Effort" (`intent-title.ts:25`) · "skill and speed sets" (`StateAdjustLens.tsx:428`) · "speed reps" in the week-change line (`ViadaWeekCard.tsx:191`) | `INTENT_TITLE` in `_shared/intent-title.ts` (p219) |
| M3 | p237 anaerobic progression and ceiling | "No ceiling. Each set harder than the last." (`family-lines.ts:26`, sent as the ride description) · "Each set starts at the bottom of the band and progresses toward the top by the end." (`source-rules.ts:1735-1737`) · sent ceiling 130% FTP (`quality-work.ts:170` → `convert-workout.ts:239-241`, `serialize.ts:76`) | `FAMILIES.ride_anaerobic` in `endurance-library/source-rules.ts` |
| M4 | p239 easy ride | "under 75 percent of FTP" (`family-lines.ts:30`) · Garmin 0–75% FTP (`materialize-plan:2255-2257`) · Intervals/Zwift no target (`serialize.ts:81-84`) | `EASY_RIDE_CEILING_PCT_OF_FTP` (`quality-work.ts:188`) |
| M5 | A run segment "@ VT1" | page "@ VT1" · swap sheet "{N} min easy" (`quality-work.ts:414`) · watch "rest", no target (`convert-workout.ts:455-467`, `materialize-plan:742`) | the library segment's intensity (`quality-work.ts` `parseQualityWork` / `source-rules.ts`) |
| M6 | FTP test "3 min at 9/10" | description "3 min at 9 out of 10" (`baseline-test-rows.ts:58`) · assessment step "Hard — 3 min at 9 out of 10" (`materialize-plan:1526`) · token step 110–120% FTP (`baseline-test-rows.ts:66` → `materialize-plan` bike_vo2 `:2355-2359`) | one step list for the test: `buildAssessmentSteps` (`materialize-plan:1515`), reached by every FTP test row |
| M7 | FTP test's 20-minute effort | "20-minute test — best effort you can hold the whole way. This is the test." (`materialize-plan:1529`) · "FTP Test - Maximal Effort" + note "All-out sustainable effort" (`materialize-plan:2301`) · "ride 20 minutes at your best even effort" (`baseline-test-rows.ts:58`) | same as M6; p212 says "20 min best effort" |
| M8 | Run time trial | "Time trial — {N} min. Start at 9.5 out of 10, finish at 10. Even the whole way." (`materialize-plan:1558`) · "Time trial — {N} min, all out and even" (`materialize-plan:1668`) · description (`baseline-test-rows.ts:40`). Length: description 12 / 10 / 8 by training age vs step fixed 12 (`baseline-test-rows.ts:44`) | `buildAssessmentSteps` run_test branch, with the length from the athlete's training age |
| M9 | Test cool-downs (all OURS) | run: description 8–10 min vs step 9 min · FTP: description 5–10 min vs assessment step 5 min (`materialize-plan:1530`) vs token step 8 min (`baseline-test-rows.ts:69`) | the test row in `baseline-test-rows.ts` |
| M10 | Hard-run family line | `run_mlss` prints the NT sentence "Spend as much time near threshold as you can while controlling fatigue." (`family-lines.ts:33-34`); p231 describes MLSS as time in zone 4 with fatigue spread evenly (that sentence is appended at `session-vocabulary.ts:830-831`) | `FAMILY_LINE` in `family-lines.ts`, one line per family. In-app only (runs send no description) |

### 3. Export failures and gaps found while tracing (not wording)

1. **FTP test from the race/combined plan never reaches Intervals.icu/Zwift** [traced]: its step labels contain digits ("Easy spin — 8 min"), `serialize.ts:67` throws, `run.ts:108-110` records the error and keeps the row off.
2. **Run notes never reach the watch** [traced]: `convert-workout.ts:825` sends a description for rides only. The VT1 talk-test line, the MLSS hills line, the race-tempo sentence and the run test's instructions stay in the app.
3. **Manual Send to Garmin has no caller in `src`** [grepped as above]. It would send the raw stored name (M1).
4. **Strength does not leave the app** [traced], except its name in `plans.csv` and logged sets in `sets.csv`.

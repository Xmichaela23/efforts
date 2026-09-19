# Book-language fix, endurance half — run, ride, swim, and what leaves the app (2026-09-18)

Branch `blf/endurance`, off `2ca43c8d`. The plan: `docs/AUDIT-book-language-2026-09-18.md` (Appendix B, Appendix C,
section 2 items 12–34, section 3's run / ride / State rows, section 4).
Nothing is pushed or deployed.

## Commits

| pass | commit | what |
|---|---|---|
| 1 | `c7db5c90a` | Each prescription stated twice now has one source; the copies are gone |
| 2 | `a6a717096` | The OFF lines, in the page's own words |
| 2 | `c16ed4293` | The descending ladder's "jog after each" loses "jog" |
| 3 | `b277a5c51` | The lines on no page come off |
| 3 | `fc9ceb645` | "By feel" comes off the unpriced strength rows (asked for by the strength half) |
| 4 | `2fca98919` | The page's warm-ups, race tempo, p278's Standard week, run notes to the watch |
| 5 | `d873478e4` | The reverse check: what the page gives that the app did not show |
| 5 | `f520e3fab` | A library row's description is no longer read for power targets (a bug pass 2 exposed) |
| 5 | `440fc8820` | `PLAN_WRITER_VERSION` 1 → 2, so built plans are rewritten with this code |
| report | this file | |

Tests: `supabase/functions/_shared/book-language-endurance.test.ts` (21 tests) pins each change. The full run of
`supabase/functions/_shared`, `materialize-plan`, `shared`, `src/lib` and `src/utils`: 4,656 passed, 5 failed. The same
5 fail on the untouched base: `run-threshold-test` "an FTP built on rides that never went hard", two in
`anchor-resolver-lint`, two in `wizard-day-lock.lint`. `npx tsc --noEmit -p tsconfig.app.json`: 305 errors before and
after, the same ones. `scripts/check-estimate-provenance.mjs --fail-only` passes. The goldens and `docs/INVENTORY.md`
were regenerated. The only golden line that moved is the p86 builder note.

### Where the book's words came from

- The coordinator's addendum said the page photographs in `~/Efforts_Local_Folder/book-sources/viada-hybrid-athlete/`
  are the book. Every line in this fix is quoted off a photograph I opened this session: p86 (SOURCE quote), p143,
  p210, p212, p229, p231, p232, p233, p234, p235, p236, p237, p238, p239, p241, p245 (SOURCE quote), p247 (SOURCE
  quote), p278 and p280–p281 (SOURCE Part E2, which was transcribed off the photographs).
- Shorter lines are cut from the page's sentence: words dropped, order kept. The whole sentence is quoted in the code
  beside each line.
- **The page corrected the audit in one place.** p212 prints a cool-down ("7. 5 to 10 minutes of easy recovery."). The
  audit and the old code both called the FTP test's cool-down ours.

---

## (a) Every changed athlete-facing line, before → after

### Today card and the planned-session drawer (the session's line, `family-lines.ts`)

| session | before | after | page |
|---|---|---|---|
| MLSS run | Spend as much time near threshold as you can while controlling fatigue. | Workouts that emphasize time spent in zone 4. The objective is accruing maximum time with equalized fatigue. | p231, whole |
| MLSS run (drawer) | Fatigue spread evenly across the rounds. Hills are fine, adjust pace to hold the effort. | Athletes may perform any of these work intervals on hills and adjust pace accordingly to maintain target intensity. | p231, "Note that" cut |
| Near-threshold run | Spend as much time near threshold as you can while controlling fatigue. | Workouts that maximize time near-threshold (NT)—whether shorter above-threshold intervals or longer below-threshold intervals. These are designed to maximize total time spent at this intensity while controlling fatigue. | p233, whole |
| Easy run | Easy. Talk test twice, at 5 minutes and at 20. | You're encouraged to practice your "talk test" at least twice per run if you're unsure—once after 5 minutes of running and the other after 20 minutes. | p235, whole |
| Easy run (drawer) | Go by heart rate. Pace varies with fatigue, hydration and weather. | The precise percentage of threshold that an athlete should remain at here may vary slightly depending on current level of fatigue, hydration status, and environmental conditions. | p235, whole |
| Long run | Easy the whole way. Stopping for a bit is fine. | Any workout that is intended to maximize training time may be a combination of zones. These sessions can include rest periods or pauses in the hike/jog sessions with little negative impact. | p235, cut around "VT1" |
| Long run (drawer) | Go by heart rate. Pace varies with fatigue, hydration and weather. | These workouts can be modified extensively depending on your needs and the training conditions. | p235, whole |
| Race-tempo run (drawer) | Run at race pace, with the recovery periods a quarter longer than usual. | Increase the pace here to race pace, but extend recovery periods by 25 percent. | p247, "If within six weeks of a race," cut |
| Anaerobic ride | Go by feel. Stay above the floor. No ceiling. Each set harder than the last. | With the aim of building anaerobic repeatability, these sessions are best done by feel with a power floor rather than a specific power target, so use the following numbers as guidelines. | p237, whole |
| Anaerobic ride, progressive option only | (part of the line above, on every option) | + Each set should start at 110% and progress up to 125–130% by the end. | p237, whole |
| Anaerobic ride (drawer) | On Zwift, turn ERG off. | unchanged | no page; kept because it says how to set Zwift, not how to ride (see (f)) |
| Sweet-spot ride | As close to threshold as you can without going over. | These workouts are intended to push you as close as possible to threshold without exceeding it, giving you plenty of time in the zone with far less fatigue than you would experience riding at or above. | p238, whole |
| VO2 ride | (nothing) | These workouts are intended to push your maximum aerobic intake; these should be more carefully controlled. | p238, middle cut |
| Easy ride | Easy ride, under 75 percent of FTP the whole way. | Easy ride below 75%. | p239, length cut |
| Ride with work | Easy ride with a block of 2-minute pushes, then a 10-second sprint every {n} minutes. Everything else under 75 percent of FTP. | 10-second all-out sprint every {n} minutes. | p239, "45 minutes @ VT1 with" cut |
| Easy ride (drawer) | Spend a few minutes of the ride paying attention to how you pedal (smooth circles, not stomping) and how you sit on the bike. | You won't regret spending several minutes on every long ride practicing pedal stroke and working on position. | p239, whole |

Today prints the line alone. The drawer, Garmin and Intervals.icu print the line and the drawer note together.

### Step lines (Today drawer, plan list, and now the Planned tab too — `planned-step-lines.ts`)

| where | before | after | page |
|---|---|---|---|
| under an easy run or long run | Easy enough to talk in full sentences. Check after 5 minutes and again after 20. | (nothing: the session line above says it) | p235 |
| under a Sprint / Power run | All-out: the best speed you have today. | "All-out" indicates "best possible speed" for the day. | p229, whole |
| hard run warm-up | 10:00 warm-up · easy pace {range} | 10:00 warm-up · 10-minute easy jog / warm-up · 3 sets of 20m walking lunges / warm-up · 2 sets of 10 per side Cossack squats (p233: "(per side)") | p231, p233 box |
| hard run cool-down | 8:00 cool-down · easy pace {range} | 8:00 cool-down · 8-minute easy jog | p231, p233 box |
| ride warm-up (anaerobic, sweet spot) | 13:00 warm-up · 138–175 W | 12:30 warm-up · 10- to 15-minute easy spin | p237, p238 box |
| VO2 ride warm-up | 25:00 warm-up · 138–175 W | 15:00 warm-up · 15-minute easy spin / 5:00 warm-up · 214–261 W · 5 minutes @ 95% / 5:00 warm-up · 5-minute easy spin | p238 box |
| sprint ride warm-up | 20:00 warm-up · 138–175 W | 10:00 warm-up · 10-minute easy spin / 10:00 warm-up · 4 cadence only 15-second sprints to build up the leg speed and focus on timing and technique with 3-minute rest between | p236 box |
| a rest the page names | 2:00 @ {easy pace} between sets / 5:00 easy between | 2:00 recovery walk/jog between sets (MLSS, NT) · 5:00 rest between (VO2) · 3:00 easy spin between sets (sweet spot) · 5:00 recovery (anaerobic progressive) · 5:30 recovery between (sprints) | p231–p239 by shape (`step-words.ts`) |
| an untargeted rest the page gives no word | … easy between | … between | our word "easy" off |
| ride all-out step | 3 × 2:00, 5:30 easy between | 3 × 2:00 max effort sprints where you try to beat your last effort, 5:30 recovery between · 10 s all-out sprint (p239) | p236, p239 |
| long run race-pace finish | 10:00 | 10:00 race pace finish | p235 |
| race-tempo run | 5 × 3:30 @ {90% pace}, 1:00 @ {easy} between | 5 × 3:30 race pace, 1:15 @ {easy} between | p247 |
| descending ladder | jog after each: … | after each: … | p231–p232 print "@ 60%", not "jog" |
| every pace, for a metric athlete | work steps /mi, warm-ups /km | every pace /km, through `display-format.ts` | — |
| run test / FTP test steps | 7:00 warm-up · …; 20 s stride; "Easy — 1 min" | each step prints the page's words (below) | p210, p212 |

### The two tests (planned sheet description, step labels, Garmin step descriptions, Intervals.icu)

| | before | after | page |
|---|---|---|---|
| Run test description | PREPARATION: flat route or track; heart rate strap on. WARM-UP: 6–8 min easy jog; 2 x 100 m strides, slow to near full tilt; 3 x 30 s at your fast (mile-PR) pace with 1 min easy walk/jog between; then 1 min rest. TRIAL: press lap and run 12 minutes (under 2 years of training), 10 minutes (2–4 years) or 8 minutes (4+ years) — start at 9.5 out of 10, finish at 10 out of 10, even the whole way; press lap at the end. COOL-DOWN: 8–10 min easy. RESULT: … | An easy 6- to 8-minute jog to warm up. 2 × 100-meter strides (begin slow and accelerate to near full tilt). 3 rounds of 30 seconds at a "fast run" (mile PR) pace followed by 1 minute easy walk/jog. 1 minute additional rest. Begin time trial: 9.5/10 intensity to begin, ending at 10/10 intensity. Record distance traveled after 12 minutes (beginner, less than 2 years of training). The app reads the trial lap, takes 88% of that speed as your threshold pace and sets it. | p210 |
| Run test steps | Easy jog — 7 min · Stride — about 100 m (20 s), slow to near full tilt · Easy — 1 min · … · Time trial — 12 min. Start at 9.5 out of 10, finish at 10. Even the whole way. · Easy cool-down — 9 min | An easy 6- to 8-minute jog to warm up (7:00) · 100-meter stride (begin slow and accelerate to near full tilt) ×2, lap button, no rest between · "fast run" (mile PR) pace / easy walk/jog ×3 · additional rest · time trial: 9.5/10 intensity to begin, ending at 10/10 intensity · (no cool-down) | p210 |
| `run_tt_` step on other rows | Time trial — 12 min, all out and even | time trial: 9.5/10 intensity to begin, ending at 10/10 intensity | p210 |
| FTP test description | …PREPARATION: indoor trainer recommended; a power meter or smart trainer. WARM-UP: 5–10 min easy; 3 x 1 min at low resistance and high turnover with 1 min rest between; … TEST: … best even effort … COOL-DOWN: 5–10 min easy. RESULT: … | Set your screen/device to average wattage. 5- to 10-minute easy warm-up. 3 x 1 minute at low resistance/high turnover (think rapid legs/rowing/etc.) with 1-minute rest between each. 3-minute easy recovery. 3 minutes at high intensity. Push yourself at a 9/10 effort. 6 to 8 minutes at a low pace to recover. Reset your device/hit the lap button, start a stopwatch, and do 20 minutes at your best effort! 5 to 10 minutes of easy recovery. If you're using average watts, use the number at the 20-minute mark and multiply it by 0.95. This is your starting functional threshold power (FTP) in watts. The app reads the lap and sets it. | p212 |
| FTP test steps (the week-one and Adjust test, which used the token path) | 8 min at 55–70% FTP · three unlabelled 1-min steps · **3 min at 110–120% FTP** · "FTP Test - Maximal Effort" / "All-out sustainable effort" · 8 min cool-down at 40–55% | 5- to 10-minute easy warm-up (8:00) · low resistance/high turnover ×3 with two "rest" between · easy recovery · high intensity. Push yourself at a 9/10 effort · 6 to 8 minutes at a low pace to recover (7:00) · hit the lap button and do 20 minutes at your best effort! · 5 to 10 minutes of easy recovery (5:00). No power target on any step. | p212 |
| FTP test to Intervals.icu | refused ("label contains digits") | sent: each label with the page's numbers prints on its own line above its step | §4 finding |

### Plan builder, setup and Adjust

| screen | before | after | page |
|---|---|---|---|
| Run + Strength card | You get stronger. Your speed and mileage hold. Twelve weeks: four lifting days, four runs. The long run stays under 100 minutes. | You get stronger. Four lifting days, four runs. The long run stays under 100 minutes. | p246–p247; the cut sentences have no page |
| Run + Strength requirement | …You should be comfortable running a full hour; the week holds about three hours of running and seven to nine hours of training in all. … | (those two clauses off) | no page |
| Ride + Strength card | For newer riders and riders coming back. Cycling and strength progress together. Four or five rides, three lifting days. | Training options for intermediate to advanced cyclists. Six or seven rides, three lifting days. | p280 (cut), p278 |
| Ride + Strength confirm | If you're coming back from a riding break, make sure your FTP is current. | (nothing) | no page |
| Rides screen chips | Four rides / Five rides | Six rides / Seven rides | p278 Standard column; one fewer is ours (see (c)) |
| Rides screen line | If easy rides are kept conversational, use your own judgement to go longer. | Over a 1-month cycle, the endurance rides should be the same duration, but each cycle can increase the overall duration. The long ride can likewise progress, increasing the volume gradually over the entire base season every 1 to 2 weeks. | p281, weekday names cut |
| Runs screen | Pick how long the long run is. The easy run is {n} minutes. The two hard runs rotate. | (last sentence off) | no page |
| Know your numbers? | The 20-minute FTP test (p212) … / The threshold time trial (p210) … | (page numbers off the screen) | citations belong in the ledger |
| Builder hard row | A series of near-threshold efforts. / A series of efforts near or above threshold. + Choose the workout on the day. | Choose the workout on the day. | the MLSS row is above threshold (p231); no page for either sentence |
| Builder week card | Hard run — sustained threshold / Hard ride — top-end intensity | Hard run / Hard ride | no page |
| Builder note, heavy legs then a long run | The run is on legs that have not recovered. | A highly taxing, 14+ work set session may diminish performance in other modalities significantly for twenty-four hours and still notably for up to seventy-two hours. A less taxing 6 to 8 work set session may result in only marginal performance deficits for twenty-four hours, with few issues noted forty-eight hours after the session. (cite p86) | p86 |
| Plan description note | The hard session is on the bike. Riding hard does not land on the legs the way running does, so the intensity costs the lifting less. | (nothing) | p280 says the opposite |
| Plan description note | The running keeps its long session and loses its hard one. Base endurance holds on that; top-end running speed decays. | (nothing) | not on p275; p119 says the opposite |
| Adjust → Deload | Max-effort sets become skill and speed sets, the extra lower-body sets come out, and the endurance sessions drop a level. Switch to it two weeks out from a race or a meet. It is not a scheduled light week: the standard week is built to be run indefinitely. | If performance begins to suffer, particularly if the ME lifts underperform 2 weeks in a row, consider running a single deload week. | p245 |
| Adjust → Bike (info) | …The 20-minute test is the classic. The 5-minute test is all-out with no pacing, so it repeats well; it counts together with… | …The 5-minute test counts together with… | no page |

### Today's two-session lines (`spacing-line.ts`, sent by get-week)

| before | after | page |
|---|---|---|
| Two sessions today. Keep them six to eight hours apart. | Allow at least 6 to 8 hours with one full meal before the resistance training session. | p143 rule 6 |
| (nothing) | + If the morning session is a VT1 session lasting less than an hour, 4 to 6 hours may be sufficient, as long as you consume calories and monitor hydration after this session. (only when the endurance session is VT1 or easier and under an hour) | p143 rule 6 |
| Lift first and keep the {run/ride} easy. | Performing low-intensity conditioning after these muscles have already been worked can potentially result in greater benefits at a given volume. | p143 rule 5 |
| Lift first. / {Running/Riding} first costs the lift its skill and speed sets. | The skill movements are focused on the first session because you may be "fresher," but this is not a hard-and-fast rule. | p143 rule 6 |

### State and Performance

| screen | before | after | page |
|---|---|---|---|
| State header, loaded legs | Expect this to ease over 2–3 days — easy movement helps more than rest. / Normal loading response — keep efforts easy if legs still feel heavy. / Soreness like this typically eases in 2–3 days… / …Fine to keep rides/runs easy until it clears; you'll be fresh for {event}. | (nothing; the label and the why stay) | no page |
| State NEXT row | the stored name ("ME: Upper", "Ride") | the server's one title ("Maximum Effort: Upper", "Ride — Endurance") | item 29 |
| State lifting card | {pattern} heavy reps / {pattern} speed reps | {pattern} reps over 90 percent / {pattern} velocity-focused reps | p80 |
| Workout screen title, attached planned run or ride | Ride — VO2 (on the anaerobic ride), Run — Tempo, … | the session's own title (`deriveWorkoutTitle`, the same the server sends) | item 29 |
| Calendar chip, anaerobic ride | BK-VO2 | BK-AnA | p237 heading "Anaerobic (AnA)" |
| Swapped session note | Swapped from your planned run. Same time, same effort. | Swapped from your planned run. | no page |
| Planned tab (workout screen) | its own step sentences, its own talk-test phrase, /mi always | the server's step lines | item 12/13/31 |

### Garmin (calendar sync and the manual send)

| | before | after |
|---|---|---|
| workout name | calendar sync: the spelled title; manual send: the stored name | both: `_shared/session-title.ts` |
| run workout description | none — runs never carried a note | the session's lines (talk test, MLSS hills line, race tempo, run test protocol) |
| ride workout description | the old lines | the page lines above |
| warm-up / cool-down step | "warm up" / "cool down", one block (rides at 55–70% FTP) | one step per line of the page's box, its description the page's words; drills are lap-button steps; easy spin has no target; p238's 5 min @ 95% has 95% ±10% (TrainingPeaks band) |
| a labelled work or rest step | the label was the intensity key (a labelled step went ACTIVE) and rests read "rest" | the page's words are the description; a rest the page names says so ("recovery walk/jog", "easy spin", "rest") |
| p210 strides | "Stride"; the untimed recovery reached the watch as a 1-second step (toV3Step dropped `lap_button`) | the page's words, lap button; `lap_button` now survives toV3Step |

### Intervals.icu / Zwift

| | before | after |
|---|---|---|
| a step whose label has digits or % | the whole ride refused | the label prints on its own text line above the step. ⚠️ Read off the Intervals.icu Workout Builder quick guide, not yet seen on a live calendar |
| ride warm-up | `- Warmup 13m 55-70%` | `10- to 15-minute easy spin` / `- Warmup 12m30s freeride`; VO2: three lines, the middle `86-104%` |
| rests | `- Recovery 5m freeride` | `- rest 5m freeride`, `- easy spin 2m freeride`, `- recovery …` by the page |
| all-out ride steps | `- 2m freeride` | `- max effort sprints where you try to beat your last effort 2m freeride` |
| the FTP test | never sent | sent (see the tests table) |

### Plan download (`plans.csv`)

| | before | after |
|---|---|---|
| session name column | the stored name ("ME: Upper", "Ride") | the server's one title |

⚠️ In pass 1 the `sessionTitle` call went into `export-data` without its import. It would have thrown on every download. The import was added in pass 4 (`2fca98919`), and nothing was deployed in between.

### The plans as built (steps, not words)

- **Race-tempo run (p247).** It now builds at race pace with recoveries 25 percent longer: `5 × 3:30 race pace, 1:15`. Before, only the name and the sentence changed, over 90% steps with 60 s rests.
- **The long run with sets (p235).** It builds the page's sets:
  - L1: 2 sets of 2 rounds of 30 s @ 100% / 30 s @ 90%.
  - L2: 2 sets of 2 rounds of 1:30 @ 115% / 30 s @ VT1.
  - L3: 3 sets of 3 rounds of 1 min @ 115% / 30 s @ VT1.
  - Before, L2 was 3–7 × 2:15 @ 115% with no recovery.
- **The race-pace finish (p235).** It carries the page's 95% interval in the middle at L2 (5 min) and L3 (10 min).
- **The fartlek (p235).** It is 6 × 3 min (L2) and 6 × 4 min (L3) @ 85%. It is no longer offered at L1, where the page prints none.
- **The long run's easy running** fills the athlete's chosen length around those sets. The long run now travels block by block. Before, one `longrun_` token held the whole session and the finish token was added on top, so the extra minutes counted twice.
- **Swim, level 1 (p241).** It builds 200 m + 3 × 50 m + 2 × 600 m, each piece labelled with the page's words. Before: a 300 m opener and one 600. Levels 2 and 3 are also printed, though the plan does not reach them.
- **Ride + Strength (p278).** The standard week has seven rides and the deload week has five (see (c)).

---

## (b) Pass 5 — reverse check, every run / ride / swim session the standing plan prints

The BEFORE state is the untouched base `2ca43c8d`. I recorded it before pass 1, which is stricter than recording it just before pass 5. The AFTER state is `440fc8820`. Both come from the same probe: the real library → `translateEnduranceSession` → materialize's `expandTokensForRow` → `toV3Step` → step lines, `convertWorkoutToGarmin` and `serializeRide`, at FTP 250 W and threshold 8:00/mi. The files are in the session scratchpad (`before.txt`, `after.txt`), not committed.

Key: **S** = screen (Today / drawer / Planned tab), **W** = Garmin watch, **I** = Intervals.icu / Zwift.

### MLSS run (p231–p232) — Today + drawer `family-lines.ts`; steps `source-rules.ts` → `session-vocabulary.ts`

| the page gives | BEFORE | AFTER |
|---|---|---|
| intent: "Workouts that emphasize time spent in zone 4. The objective is accruing maximum time with equalized fatigue." | S: p233's sentence instead; W: none | S + W (family-lines.ts:37) |
| "Note that athletes may perform any of these work intervals on hills…" | S: paraphrased; W: none | S + W, page words |
| warm-up: 10-minute easy jog · 3 sets of 20m walking lunges · 2 sets of 10 per side Cossack squats | S/W: one 10:00 block with our easy pace; the drills missing | S/W: three steps, page words, drills on the lap button |
| cool-down: 8-minute easy jog | S: with our easy pace; W: "cool down" | S/W: page words, no pace |
| the rounds (% of threshold, "@ VT1") | S/W: built as printed (the audit's MATCHES) | unchanged |
| "2-minute recovery walk/jog between sets" | S: easy pace; W: "rest" | S/W: "recovery walk/jog" (step-words.ts), no pace |
| ladder: "Then 2-minute walk/recovery jog" | S: easy pace | S/W: "walk/recovery jog" |
| ladder, level 1: the final "20 seconds @ 60%" | not built | not built (see (f)) |

### Near-threshold run (p233–p234) and the race-tempo row (p247)

| the page gives | BEFORE | AFTER |
|---|---|---|
| intent (whole) | S: "Spend as much time…" (paraphrase) | S + W, whole sentence |
| warm-up box with "(per side)" | as MLSS | as MLSS, p233's wording |
| "3-minute recovery walk/jog between sets", "1-minute easy jog" (surge opener) | S: easy pace / " easy" | S/W: page words |
| p247: "increase the pace here to race pace, but extend recovery periods by 25 percent" | S: the sentence (paraphrased); the steps stayed 90% / 60 s | S + W: the sentence; steps at race pace, rests × 1.25 |
| "@ VT1" rests | S: easy pace; W: rest | unchanged (see (f): the word VT1) |

### Easy run (p235)

| the page gives | BEFORE | AFTER |
|---|---|---|
| duration by level | built as printed | unchanged |
| talk test sentence | S: two paraphrases (Today line and step lines) + "Go by heart rate"; W: none | S + W: the page's sentence, once |
| "The precise percentage of threshold … may vary slightly depending on…" | S: paraphrase "Pace varies with fatigue, hydration and weather" | S + W: page words |

### Long run (p235)

| the page gives | BEFORE | AFTER |
|---|---|---|
| intent and "can include rest periods or pauses…" | S: "Easy the whole way. Stopping for a bit is fine." | S + W: page words (cut around "VT1") |
| "These workouts can be modified extensively…" | none | S + W (drawer) |
| inserted sets (L1/L2/L3) | shapes off a band (L2: 5 × 2:15 @ 115%, no recovery) | the page's sets, S/W/I-ready tokens |
| race-pace finish with a 95% interval in the middle | finish only, printed as a bare time | both, "race pace finish" printed |
| fartlek 6 × 3 / 6 × 4 @ 85%, none at L1 | 4 × 3 at L1, 6 × 3:30 at L2, 10 × 4 at L3 | as printed |
| strides add-on | 6 × 30 s, ours | unchanged (see (f)) |

### Sweet-spot ride (p238–p239)

| the page gives | BEFORE | AFTER |
|---|---|---|
| intent (whole) | S/W/I: paraphrase | S/W/I: whole sentence |
| warm-up "10- to 15-minute easy spin" | 13 min at 55–70% FTP | 12:30, no target, page words |
| "N-minute easy spin" rests | S: " easy"; I: "Recovery" | S/W/I: "easy spin" |
| the work at the page's single % | ±10% (TrainingPeaks), capped at FTP | unchanged (see (f)) |

### Anaerobic ride (p237)

| the page gives | BEFORE | AFTER |
|---|---|---|
| intent "…best done by feel with a power floor…" | S/W/I: "Go by feel. Stay above the floor. No ceiling…" | whole sentence |
| progressive option: "Each set should start at 110% and progress up to 125–130% by the end." | "Each set harder than the last", on every option | the page's sentence, on the progressive option only |
| warm-up "10- to 15-minute easy spin" | 13 min at 55–70% | 12:30, no target |
| "4- to 6-minute recovery between sets" | " easy" / "Recovery" | "recovery" |
| floor, the page's 130% top sent to W/I | built | unchanged |

### VO2 ride (p238)

| the page gives | BEFORE | AFTER |
|---|---|---|
| intent "…push your maximum aerobic intake; … more carefully controlled" | none | S/W/I |
| warm-up: 15-minute easy spin · 5 minutes @ 95% · 5-minute easy spin | one 25-min block at 55–70% | three steps; the 95% one at 95% ±10% |
| "5-minute rest", "@ easy spin", "5-minute recovery between sets" | " easy" | "rest", "easy spin", "recovery" |

### Sprint ride (p236)

| the page gives | BEFORE | AFTER |
|---|---|---|
| warm-up: 10-minute easy spin · 4 cadence only 15-second sprints… with 3-minute rest between | one 20-min block at 55–70% | two steps, page words |
| "max effort … sprints where you try to beat your last effort" | nothing on the step | on the step (S/W/I) |
| "flying … surges to max effort" | nothing on the step | "flying surges to max effort" |
| "5 to 6 minutes of recovery between sprints" / "2 to 3 minutes recovery between" | " easy" | "recovery" |
| standing start | not built (pre-existing: "no round token for standing_start"; the frame leaves it out) | unchanged |

### Endurance ride (p239)

| the page gives | BEFORE | AFTER |
|---|---|---|
| "60- to 100-minute easy ride below 75%" | paraphrase; W: 0–75%; I: freeride | "Easy ride below 75%."; W/I unchanged |
| "You won't regret spending several minutes on every long ride practicing pedal stroke…" | paraphrase with "(smooth circles, not stomping)" | page words |
| ride with work: "…with 10-second all-out sprint every 9 minutes" | our summary line; the sprint step labelled "Sprint" | "10-second all-out sprint every {n} minutes."; step "all-out sprint" |
| "5-minute easy spin between sets" | "Recovery" | "easy spin" |
| p281: endurance rides lengthen over 1-month cycles; long ride every 1–2 weeks | "use your own judgement to go longer" | the page's sentence on the rides screen; no length built (no amount printed) |

### Swim, endurance, level 1 (p241)

| the page gives | BEFORE | AFTER |
|---|---|---|
| 200m as 25m easy, 25m drill choice | 300 m warm-up | 200 m, page words |
| 3 x 50m @ 25m easy, 25m sprint with 10-second rest | not built | built, page words |
| 2 x 600m @ easy-to-moderate intensity (race pace) with 2-minute rest | 2 × 600 at 2:30 rest, labelled "easy" | 2 × 600, 2:00 rest, page words |
| p240: "Distances and interval lengths can be modified tremendously." | none | none (see (f)) |

### The two tests

These are in (a). Every step and the description are now p210's and p212's words. p210's cool-down is gone because the page prints none, and p212's cool-down is the page's.

---

## (c) p278 — which column the page means

I read SOURCE Part E2a (p278, transcribed off `p278.jpg` by row shading) and E2d (p281's Base cycling notes, verbatim).

- **p278 prints two columns side by side for each day: STANDARD and DELOAD.**
  - Standard rides: Day 1 sweet spot (level 1-2) · Day 2 endurance (1) · Day 3 VO2 (1) + sweet spot (1) · Day 5 endurance (1) + sprint (1) · Day 6 endurance (2). That is seven rides.
  - Deload rides: Day 1 sweet spot (1) · Day 2 endurance (1) · Day 3 VO2 (1) · Day 5 sprint (1) · Day 6 endurance (1). That is five rides.
- **The page means the Standard column for every ordinary week and the Deload column only for a deload week.**
  - p281's own Base notes speak of "the Tuesday and Friday endurance rides" and "the Saturday long ride".
  - Days 2, 5 and 6 are Tuesday, Friday and Saturday when Day 1 is Monday, the reading SOURCE E2a records.
  - **Only the Standard column has an endurance ride on Day 5.**
  - J4: every program's deload column is switched to for an event or for fatigue, never as the ordinary week.
- **What the app did:** the ordinary week took the Deload column's five level-1 rides under the Standard lifting (a work-order choice of 2026-09-13). It never built Day 3's second sweet spot, Day 5's endurance ride or the level-2 long ride.
- **What it does now (pass 4):** Standard = the Standard column's seven rides, and taper = the Deload column's five.
  - Day 1 "level 1-2" builds level 1, the low end of the printed range (marked OURS in `frames.ts`).
  - "Newer" riders still get every ride family at level 1 through the existing experience answer.
- **The one-fewer-ride choice** (OURS, Michael 2026-09-13, "four of five") is now six of seven. It still drops Day 2's easy ride.

## (d) Server functions that import changed shared code (for a later deploy — nothing is deployed)

From the regenerated `docs/INVENTORY.md` (import closures), plus the functions edited directly:

`analyze-cycling-workout` · `calendar-sync` · `coach` · `compute-session-boom` · `compute-snapshot` ·
`compute-workout-analysis` · `compute-workout-summary` · `create-goal-and-materialize-plan` · `endurance-checkpoint` ·
`export-data` · `generate-strength-plan` · `get-arc-context` · `get-week` · `ingest-phone-workout` · `materialize-plan` ·
`rematerialize-standing-block` · `send-workout-to-garmin` · `swap-list` · `swap-session` · `workout-detail`

- `create-goal-and-materialize-plan` and `ingest-phone-workout` are on the parked list. They import changed shared files (`baseline-test-rows.ts`, `quality-work.ts`, the endurance library), so their deployed copies stay old until they are redeployed.
- The phone bundle also changed: StructuredPlannedView, UnifiedWorkoutView, WorkoutCalendar, StateAdjustLens, StateNextBlock, ViadaWeekCard, RideStrengthWeekCard, NonRaceBuilder, `preview-week-read.ts`, `today-lines` (through `@shared/standing-plan/family-lines`), and `useCoachWeekContext`.
- `PLAN_WRITER_VERSION` is 2. Once `get-week`, `materialize-plan` and `rematerialize-standing-block` are deployed, each standing plan's upcoming rows are rewritten once.

## (e) Parked rows, not changed

- **Appendix B Part B, every row:** the race and combined generators, `generate-combined-plan` and `generate-run-plan`.
  - pace names, bricks, strides, "comfortably hard"
  - sweet spot at 88–94%, VO2 rests of 3 min
  - the 150/180-minute long-run caps "per Daniels" in `performance-build.ts`
  - swim sighting "every 6–8 strokes" in `session-factory.ts`
  - their swim test
  - the seven places where text and steps disagree
- **Rows reached only through those generators' tokens** (shared `materialize-plan` code; left as they are):
  - `Z5` / `Float` / `Threshold` / hills / `Walk back` / cruise / 5K-plus tempo / fartlek-pickup / marathon-pace labels and bands (Part C rows 43–52, 55)
  - the CSS swim test's steps (Part C row 42; only `generate-combined-plan` writes `css_test`)
  - the open-water label (row 59)
  - the ±2% / ±6% `toV3Step` pace band (see (f))
- `create-goal-and-materialize-plan/week-one-tests.ts` is not edited. It calls the same `baseline-test-rows.ts`, so the week-one tests it inserts are the fixed ones.
- **The race-week bullets on State** (`coach/index.ts` `computeGroundedRaceWeekGuidanceV1`, Appendix C T6):
  - They are reached only by a plan with a race goal in a taper or peak week, which is the race path.
  - They are left unchanged, and they are on no page (and against p247 / p118).
- **The recording screen** (`workout-execution/ExecutionScreen.tsx`, live cues): on the parked integration list.

## (f) Not done, and why

1. **Session names** ("Hard Run", "Easy Run", "Hard Ride", "Ride", "Easy Swim", "VO2 Ride" / "Sprint Ride" marked PROPOSED in code) and **the Instead-sheet workout names** ("Surge and float", "Long surge with a near-threshold float", …).
   - No page prints these names. The page's own names are "Maximal Lactate Steady State (MLSS)", "Near-Threshold", "VT1", "Long Slow Distance (LSD)", "Sweet Spot", "Endurance", etc.
   - An earlier ruling keeps "MLSS" / "sweet spot" off the screen, so renaming needs Michael.
   - "Long surge with a near-threshold float" is also wrong on its numbers: the "float" is 115%.
   - Item 29 (one title everywhere) is done. The names themselves are not changed.
2. **The word VT1 on screen.**
   - Today's standing rule (pinned in `today-lines.test.ts`) keeps VT1 off the screen. Today's rule, set after that pin, is to print the book's words.
   - Where the two meet I cut around the word (the long-run line) or left the rest wordless: a rest the page writes "@ VT1" keeps its easy pace on screen and "rest" on the watch.
   - Exception: the new two-session line quotes p143 whole ("If the morning session is a VT1 session…"), so VT1 prints there.
   - Michael's call.
3. **The easy / VT1 anchor.**
   - Easy runs, "@ VT1" rests and long runs are prescribed off Friel's zone 2 (heart rate and pace, D-462 / D-478).
   - The book's VT1 anchor is the p211 talk-test ramp, which the app has not built.
   - Out of scope for wording. The audit rows are 6, 10 and 76, and item M9.
4. **The bands around a single printed number.**
   - A single printed ride % goes out as ±10% (TrainingPeaks, cited). This includes p238's warm-up "5 minutes @ 95%", which the watch gets as 214–261 W.
   - Kept as the instruction said, and flagged here.
   - The run's ±2% / ±6% (`toV3Step`, marked OURS) is unchanged. Intervals.icu gets `freeride` for p239's 0–75% easy ride.
5. **Run test length by training age (4b).**
   - The app has no training-age answer: I grepped `training_age`, `years_training`, `trainingAge`, `training_years` and `yearsTraining` and found 0 hits.
   - The learner reads a ~720 s lap (`learn-fitness-profile`).
   - So the description now says what the test does: the page's 12-minute clause. Offering 10 or 8 minutes needs a question and a learner change.
6. **Where the long run's sets and the fartlek's efforts sit.** They are spread evenly through the easy running (OURS). The page says "at any point" / "during the session" / "in the middle".
7. **p281's ride-length progression.** The rides screen prints the page's sentence, but no length is built, because the page prints no amount.
8. **The strides add-on on the easy run** (6 × 30 s, labelled OURS; p109 says "a handful"). Also the strides' untimed recovery label "Walk/Jog — as long as you need", which is on no page. Left as they are, because they come from Michael's constraint that the strides reach Garmin.
9. **Swim:**
   - The subtitle ("WU … • Aerobic …", `swim-plan-summary.ts`) is ours.
   - p240's "Distances and interval lengths can be modified tremendously." is not printed.
   - The swim's Garmin steps use the tier word from the swim path.
10. **The descending ladder, level 1:** p231's last "20 seconds @ 60%" is still not built (library `ladderByLevel`).
11. **Standing-start sprints (p236)** fail to translate. This is pre-existing, and the frame leaves them out.
12. **"On Zwift, turn ERG off."** Kept. It is not a page line, but it operates the athlete's device (p237 asks for a floor, not a target). Michael approved it 2026-09-18.
13. **Builder notes that paraphrase a page and match it** (`week-conflicts.ts:306`, `:309`; `compose.ts:1862`, `:3392`, `:3419`; `setup-copy.ts` "The long run stays under 100 minutes") were not re-quoted. The passes covered the OFF and NO-PAGE rows. MATCHES rows were re-worded only where I touched them.
14. **The 5-minute FTP test** (`ftp5MinTestRow`, the Adjust offer) is hybrid-coach course material, not the book. I left it: taking out a test type is Michael's call.
15. **Strength files I did not touch:**
    - `src/lib/strength-focus-copy.ts:837` `HARD_RIDE_SHAPE`: "Four 4-minute efforts hard, three minutes easy between them…" prints in the plan builder (`NonRaceBuilder.tsx`). It is cited to Helgerud 2007, not the book, so it should come off.
    - The "By feel" stamp is off in materialize-plan. Any screen that falls back to its own "By feel" when `weight_display` is absent is in the strength files.
16. **Merge note.** `standing-plan/compose.ts` (one line: a conflict note carries its own cite) and `src/lib/today-lines.test.ts` (the endurance assertions only) are shared with the strength half's worktree.
17. **Verification.**
    - Nothing was run on a device, against a database, or against a live Garmin or Intervals.icu account.
    - The Intervals.icu text-line form and a run workout's Garmin description are read off the formats, not seen live.

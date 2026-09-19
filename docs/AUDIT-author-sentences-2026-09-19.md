# Author-sentence audit (2026-09-19)

Read only. No code changed. Branch `stage/one-truth-drift` at 9477947da (main e1edf4084 plus one commit).

**The question.** Which lines on screen are the book author's own sentences, word for word or close to it. Those need a rewrite in our words with the same meaning. Numbers, ranges, sets × reps, step lists and warm-up box items stay as printed.

## Method

- **The generated output [built].** Six throwaway accounts, one plan each, starting Monday 2026-09-21, 12 weeks:
  - Run + Ride + Strength, Run + Strength, Ride + Strength
  - each once with numbers on file (no test week) and once with nothing on file (test week)
  - The live builder made each plan. The checkout's own materialize-plan, get-week (all 13 weeks), plan-overview and strength-test-session ran over it. The Garmin and Intervals.icu send text was built from every row with the send path's own converters.
  - 676 rows in all. 840 distinct printed sentences.
  - All six accounts were deleted afterwards. All 44 tables with a user column were checked empty for each one, and each auth user is gone.
  - Script: `scripts/_burner-author-sentences-2026-09-19.ts`.
- **The book [read].** All 151 page photos in `book-sources/viada-hybrid-athlete/` were run through the Mac's built-in text recognition. Every printed sentence and every line of `src/`, `supabase/functions/` and `shared/` was matched against that text. A match means five or more words in a row are the same as the page.
  - pp.210–215 (the run test, the FTP test, the strength test and the 96 percent sentence) are not in the photo folder. Those lines were checked against the pinned words and the SOURCE doc's transcription of those pages.
- **The phone screens [traced].** The logger set-type sheet, the logger plyo card, the plan builder and State › Adjust are drawn on the phone from shared text. The throwaway plans do not reach them, so each was traced from the text to the component that draws it.
- **Already approved, not redone:** the MLSS line (`family-lines.ts:74`).

**Rewrite rules followed:**
- word replacement only, the same length or shorter (checked by character count)
- every number, range, unit and training term kept (checked by script)
- no dashes joining clauses, no idioms, nothing added

**Column "six plans":** Y = the line appeared in the throwaway plans' output. N = drawn on the phone, or needs a choice the six plans did not make.

## A — the author's sentences, grouped by screen


### Today, the session drawer, Plan, Garmin and Intervals.icu description (run and ride session lines)

| # | line as printed | where it prints | file:line | page | proposed rewrite | six plans | note |
|---|---|---|---|---|---|---|---|
| 1 | With the aim of building anaerobic repeatability, these sessions are best done by feel with a power floor rather than a specific power target, so use the following numbers as guidelines. | Today card line; session drawer; Plan session list; Garmin workout description; Intervals.icu description (rides) — anaerobic ride | `supabase/functions/_shared/standing-plan/family-lines.ts:68` | p237 | These sessions build anaerobic repeatability and are best ridden by feel, with a power floor instead of a set power target; treat the numbers below as guidelines. | Y |  |
| 2 | Workouts that maximize time near-threshold (NT)—whether shorter above-threshold intervals or longer below-threshold intervals. | Today card line; session drawer; Plan session list; Garmin workout description — near-threshold run | `supabase/functions/_shared/standing-plan/family-lines.ts:78` | p233 | Sessions that maximize time near threshold (NT), using shorter above-threshold or longer below-threshold intervals. | Y |  |
| 3 | These are designed to maximize total time spent at this intensity while controlling fatigue. | Today card line; session drawer; Plan session list; Garmin workout description — near-threshold run | `supabase/functions/_shared/standing-plan/family-lines.ts:78` | p233 | They aim for the most total time at this intensity while controlling fatigue. | Y |  |
| 4 | Any workout that is intended to maximize training time may be a combination of zones. | Today card line; session drawer; Plan session list; Garmin workout description — long run | `supabase/functions/_shared/standing-plan/family-lines.ts:83` | p235 | A session meant to maximize training time can mix zones. | Y |  |
| 5 | These sessions can include rest periods or pauses in the hike/jog sessions with little negative impact. | Today card line; session drawer; Plan session list; Garmin workout description — long run | `supabase/functions/_shared/standing-plan/family-lines.ts:83` | p235 | Hike/jog sessions can include rests or pauses with little negative effect. | Y |  |
| 6 | You're encouraged to practice your "talk test" at least twice per run if you're unsure—once after 5 minutes of running and the other after 20 minutes. | Today card line; session drawer; Plan session list; Garmin workout description — easy run | `supabase/functions/_shared/standing-plan/family-lines.ts:85` | p235 | If you're unsure, the "talk test" is worth doing at least twice per run: once after 5 minutes of running and once after 20. | Y |  |
| 7 | These workouts are intended to push you as close as possible to threshold without exceeding it, giving you plenty of time in the zone with far less fatigue than you would experience riding at or above. | Today card line; session drawer; Plan session list; Garmin workout description; Intervals.icu description (rides) — sweet-spot ride | `supabase/functions/_shared/standing-plan/family-lines.ts:88` | p238 | These sessions take you as close to threshold as possible without going over it, which gives plenty of time in the zone with much less fatigue than riding at or above it. | Y |  |
| 8 | These workouts are intended to push your maximum aerobic intake; these should be more carefully controlled. | Today card line; session drawer; Plan session list; Garmin workout description; Intervals.icu description (rides) — VO2 ride | `supabase/functions/_shared/standing-plan/family-lines.ts:93` | p238 | These sessions are meant to push your maximum aerobic intake; they need more careful control. | Y |  |
| 9 | Each set should start at 110% and progress up to 125–130% by the end. | Today card line; session drawer; Plan session list; Garmin workout description; Intervals.icu description (rides) — anaerobic ride, progressive option only | `supabase/functions/_shared/standing-plan/family-lines.ts:100` | p237 | Each set should begin at 110% and rise to 125–130% by the end. | Y |  |
| 10 | You won't regret spending several minutes on every long ride practicing pedal stroke and working on position. | Session drawer (after the line); Plan session list; Garmin workout description; Intervals.icu description (rides) — endurance ride | `supabase/functions/_shared/standing-plan/family-lines.ts:129` | p239 | It is worth spending several minutes on every long ride practicing pedal stroke and working on position. | Y |  |
| 11 | The precise percentage of threshold that an athlete should remain at here may vary slightly depending on current level of fatigue, hydration status, and environmental conditions. | Session drawer (after the line); Plan session list; Garmin workout description — easy run | `supabase/functions/_shared/standing-plan/family-lines.ts:136` | p235 | The exact percentage of threshold to stay at here can shift slightly with current fatigue, hydration, and environmental conditions. | Y |  |
| 12 | These workouts can be modified extensively depending on your needs and the training conditions. | Session drawer (after the line); Plan session list; Garmin workout description — long run | `supabase/functions/_shared/standing-plan/family-lines.ts:142` | p235 | These sessions can be changed a great deal to suit your needs and the training conditions. | Y |  |
| 13 | Increase the pace here to race pace, but extend recovery periods by 25 percent. | Session drawer (after the line); Plan session list; Garmin workout description — race-tempo row only | `supabase/functions/_shared/standing-plan/family-lines.ts:158` | p247 | Raise the pace here to race pace, but lengthen recovery periods by 25 percent. | N | Not in the six plans (no race). |
| 14 | "All-out" indicates "best possible speed" for the day. | Session sheet step list — sprint/power run | `supabase/functions/_shared/planned-step-lines.ts:61` | p229 | "All-out" means the fastest speed available that day. | N | Not in the six plans (no sprint/power run was picked). |

### Today (the line between a lift and a run or ride on the same day)

| # | line as printed | where it prints | file:line | page | proposed rewrite | six plans | note |
|---|---|---|---|---|---|---|---|
| 15 | Allow at least 6 to 8 hours with one full meal before the resistance training session. | Today, between the two sessions of a lift + run/ride day | `supabase/functions/_shared/standing-plan/spacing-line.ts:88` | p143 | Leave at least 6 to 8 hours and one full meal before the resistance training session. | Y |  |
| 16 | If the morning session is a VT1 session lasting less than an hour, 4 to 6 hours may be sufficient, as long as you consume calories and monitor hydration after this session. | Today, between the two sessions of a lift + run/ride day — morning VT1 run or ride under an hour | `supabase/functions/_shared/standing-plan/spacing-line.ts:90` | p143 | If the morning session is a VT1 session under an hour, 4 to 6 hours may be enough, provided you eat and track hydration after it. | Y |  |
| 17 | Performing low-intensity conditioning after these muscles have already been worked can potentially result in greater benefits at a given volume. | Today, between the two sessions of a lift + run/ride day — easy run or ride after legs | `supabase/functions/_shared/standing-plan/spacing-line.ts:92` | p143 | Doing low-intensity conditioning after these muscles have been worked may give greater benefits at a given volume. | Y |  |
| 18 | The skill movements are focused on the first session because you may be "fresher," but this is not a hard-and-fast rule. | Today, between the two sessions of a lift + run/ride day — SKILL or DE lift first | `supabase/functions/_shared/standing-plan/spacing-line.ts:94` | p143 | The skill movements go in the first session because you may be fresher then, but this is not a strict rule. | Y |  |
| 19 | The midweek plyo warm-up may be anywhere from one to three plyometric skills. | Today, under the "Plyo warm-up" title | `supabase/functions/_shared/standing-plan/plyo.ts:207` | p275 | The midweek plyo warm-up can include one to three plyometric skills. | Y |  |

### Today card, logger and plan builder (the line for each set type)

| # | line as printed | where it prints | file:line | page | proposed rewrite | six plans | note |
|---|---|---|---|---|---|---|---|
| 20 | Each set should be stopped short of failure because technical/form breakdown here can be counterproductive. | Today card (ME); logger ME row; logger set-type sheet (ME, last sentence of the paragraph) | `supabase/functions/_shared/strength-grid/intents.ts:262 and :275-276` | p219 | End each set before failure, because a breakdown in technique or form here can be counterproductive. | Y |  |
| 21 | Velocity and consistent bar path are the major objectives. | Today card (DE) | `supabase/functions/_shared/strength-grid/intents.ts:263` | p219 | The main goals are velocity and a consistent bar path. | N |  |
| 22 | The weight should be heavy enough to be a challenge, but form and consistency take priority over velocity. | Today card (SKILL); logger set-type sheet (SKILL) | `supabase/functions/_shared/strength-grid/intents.ts:264 and :285-286` | p219 | Use a weight heavy enough to challenge you, but form and consistency come before velocity. | N |  |
| 23 | Fatigue is not the enemy because repetitions will inevitably slow as fast-twitch fibers become exhausted. | Today card (HYP); logger, the line above the accessory cards; plan builder accessory step | `supabase/functions/_shared/strength-grid/intents.ts:265` | p219 | Fatigue is expected: reps will slow as the fast-twitch fibers tire. | N | Michael's own example, used as written. |

### Logger: the set-type sheet (tap the set type on a row)

| # | line as printed | where it prints | file:line | page | proposed rewrite | six plans | note |
|---|---|---|---|---|---|---|---|
| 24 | ME, or maximum effort, is a movement designed to improve your ability to move maximal or near maximal weight. | Logger set-type sheet (ME) | `supabase/functions/_shared/strength-grid/intents.ts:273-274` | p219 | ME (maximum effort) is a movement meant to build your ability to lift maximal or near-maximal weight. | N |  |
| 25 | It's typically an intentionally heavy set focused on peak force over the course of each repetition. | Logger set-type sheet (ME) | `supabase/functions/_shared/strength-grid/intents.ts:274` | p219 | It is usually a deliberately heavy set aimed at peak force through each rep. | N |  |
| 26 | Bar speed is still important for this work but is secondary to simply moving the weight well. | Logger set-type sheet (ME) | `supabase/functions/_shared/strength-grid/intents.ts:275` | p219 | Bar speed still matters here but comes second to moving the weight well. | N |  |
| 27 | DE, or dynamic effort sets, should have an emphasis on bar speed and quality of movement. | Logger set-type sheet (DE) | `supabase/functions/_shared/strength-grid/intents.ts:277` | p219 | DE (dynamic effort) sets put the emphasis on bar speed and movement quality. | N |  |
| 28 | Velocity and consistent bar path are the major objectives, and you should treat every repetition as though the bar were loaded to a maximum weight. | Logger set-type sheet (DE) | `supabase/functions/_shared/strength-grid/intents.ts:277-279` | p219 | The main goals are velocity and a consistent bar path, and each rep is treated as if the bar held a maximum weight. | N |  |
| 29 | Fatigue is likewise discouraged because movement quality is paramount. | Logger set-type sheet (DE) | `supabase/functions/_shared/strength-grid/intents.ts:279` | p219 | Fatigue is also avoided because movement quality comes first. | N |  |
| 30 | For dynamic effort, while both the load and the rep range are lower, the emphasis on peak output/velocity should make the movement more challenging than similar skill work. | Logger set-type sheet (DE) | `supabase/functions/_shared/strength-grid/intents.ts:281-282` | p218 | In dynamic effort the load and rep range are both lower, but the stress on peak output/velocity should make it harder than similar skill work. | N |  |
| 31 | The chief difference here is that skill work is focused primarily on "movement perfection," whereas DE work should aim for good form (of course), but with bar speed being the primary objective. | Logger set-type sheet (DE) | `supabase/functions/_shared/strength-grid/intents.ts:282-284` | p218 | The main difference is that skill work aims mainly at perfecting the movement, while DE work aims for good form (of course) but makes bar speed the first goal. | N |  |
| 32 | SKILL work is somewhat unique in that the objective is purely patterning and movement practice. | Logger set-type sheet (SKILL) | `supabase/functions/_shared/strength-grid/intents.ts:285` | p219 | SKILL work is unusual in that its only aim is patterning and movement practice. | N |  |
| 33 | Every rep either improves movement quality or degrades it! | Logger set-type sheet (SKILL) | `supabase/functions/_shared/strength-grid/intents.ts:287` | p76 | Each rep makes movement quality either better or worse. | N |  |
| 34 | Perfect practice makes perfect… if you're performing the movement poorly, STOP. | Logger set-type sheet (SKILL) | `supabase/functions/_shared/strength-grid/intents.ts:288` | p141 (the code cites p143) | Only correct practice improves a movement; if you're doing it poorly, stop. | N |  |
| 35 | HYP refers to hypertrophy work, and these sets are more of the standard "bodybuilding"-style work. | Logger set-type sheet (HYP) | `supabase/functions/_shared/strength-grid/intents.ts:289` | p219 | HYP means hypertrophy work; these sets are closer to standard bodybuilding-style training. | N |  |
| 36 | Maximum motor unit recruitment is the goal, and repetitions should be a steady tempo—controlled yet powerful. | Logger set-type sheet (HYP) | `supabase/functions/_shared/strength-grid/intents.ts:289-290` | p219 | The goal is maximum motor unit recruitment, with reps at a steady tempo, controlled but powerful. | N |  |
| 37 | Fatigue is not the enemy because repetitions will inevitably slow as fast-twitch fibers become exhausted, and the fatigue-resistant fibers start to engage heavily. | Logger set-type sheet (HYP) | `supabase/functions/_shared/strength-grid/intents.ts:290-292` | p219 | Fatigue is expected: reps will slow as the fast-twitch fibers tire and the fatigue-resistant fibers take on more of the work. | N |  |
| 38 | In fact, this is desirable (as discussed in Chapter 4) because some fatigue of all motor units is practically necessary to ensure maximum tension in all these units is reached. | Logger set-type sheet (HYP) | `supabase/functions/_shared/strength-grid/intents.ts:292-294` | p219 | This is wanted, because some fatigue of every motor unit is nearly required for all of them to reach maximum tension. | N | Drops "(as discussed in Chapter 4)", a cross-reference to another chapter, not a fact about the set. |
| 39 | RIR refers to "reps in reserve (before failure)." | Logger set-type sheet (every type) | `supabase/functions/_shared/strength-grid/intents.ts:229` | p219 | RIR means reps in reserve before failure. | N |  |
| 40 | It's important to note, therefore, that 0 RIR is not failure but refers to a set where you'd still complete the final repetition (even though it would be very slow). | Logger set-type sheet (every type) | `supabase/functions/_shared/strength-grid/intents.ts:229-230` | p219 | So 0 RIR is not failure: it is a set where the last rep still gets completed, though very slowly. | N |  |
| 41 | Sets should always remain on the lower end when starting a program, increasing only if an athlete is finding that they are progressing well and seem to have recovery to spare! | Logger set-type sheet (every type) | `supabase/functions/_shared/strength-grid/intents.ts:372-373` | p218 | Sets should stay at the low end when a program starts, rising only if the athlete is progressing well and seems to have recovery left over. | N |  |

### Logger: rest timer and set-type sheet

| # | line as printed | where it prints | file:line | page | proposed rewrite | six plans | note |
|---|---|---|---|---|---|---|---|
| 42 | Rest periods between sets should be sufficient to allow nearly full recovery (though not so long as to allow you to cool down). | Logger, beside the rest timer; logger set-type sheet; strength rows on Plan (ME, DE, SKILL) | `supabase/functions/_shared/strength-grid/intents.ts:207-208` | p78 | Rest between sets should allow almost full recovery, but not be so long that you cool down. | Y |  |
| 43 | Hit the next set when you know you can complete it without getting crushed. | Logger, beside the rest timer; logger set-type sheet; strength rows on Plan (ME, DE, SKILL) | `supabase/functions/_shared/strength-grid/intents.ts:208` | p78 | Start the next set when sure you can finish it without being overwhelmed. | Y |  |
| 44 | Strength and power training typically dictate that this point of reduced capacity represents the end of a productive session, but in hypertrophy training, this may well be a crucial part of the training session itself! | Logger, beside the rest timer; logger set-type sheet; strength rows on Plan (HYP) | `supabase/functions/_shared/strength-grid/intents.ts:220-222` | p84 | In strength and power training this point of reduced capacity usually marks the end of a productive session, but in hypertrophy training it may be a central part of the session. | Y |  |

### Logger: the warm-up line

| # | line as printed | where it prints | file:line | page | proposed rewrite | six plans | note |
|---|---|---|---|---|---|---|---|
| 45 | A good warm-up is meant to prepare your body to do work, not be a stimulus. | Logger, the session's warm-up line (every lifting day) | `supabase/functions/_shared/standing-plan/warmup.ts:111` | p139 | A good warm-up readies the body for work; it should not be a stimulus. | Y |  |
| 46 | With skill development work, every warm-up set should have equal focus and quality to the work sets. | Logger, the session's warm-up line (first lift is SKILL) | `supabase/functions/_shared/standing-plan/warmup.ts:112` | p140 | In skill development work, each warm-up set needs the same attention and quality as the work sets. | N |  |
| 47 | The first set of your skill work should also be the last set of your warm-up. | Logger, the session's warm-up line (first lift is SKILL) | `supabase/functions/_shared/standing-plan/warmup.ts:113` | p140 | Your last warm-up set should also serve as your first set of skill work. | N |  |

### Test day: logger set hints, Today and the session sheet

| # | line as printed | where it prints | file:line | page | proposed rewrite | six plans | note |
|---|---|---|---|---|---|---|---|
| 48 | Perform a regular warm-up in your chosen lift, slowly working your way up to a starting weight of 75 percent or so of your predicted max. | Test-day logger set hints; Today and session sheet on a test row (first set) | `supabase/functions/_shared/strength/test-session.ts:109` | p215 (photo not in the book folder; SOURCE doc) | Warm up as usual in the chosen lift, building slowly to a starting weight of about 75 percent of your predicted max. | Y |  |
| 49 | A weight where you can comfortably perform 8 repetitions but are approaching failure if you had to push to 10. | Test-day logger set hints; Today and session sheet on a test row (the set of 6) | `supabase/functions/_shared/strength/test-session.ts:125 and :139` | p215 | A weight you could lift 8 times comfortably, but near failure if pushed to 10. | Y |  |
| 50 | Enter this weight here. | Test-day logger set hints; Today and session sheet on a test row (the set of 6, launcher test) | `supabase/functions/_shared/strength/test-session.ts:126` | p215 | Type this weight in. | Y |  |
| 51 | Use this set of 6 to confirm that this feels about right. | Test-day logger set hints; Today and session sheet on a test row (the set of 6) | `supabase/functions/_shared/strength/test-session.ts:140` | p215 | This set of 6 checks that the weight feels about right. | Y |  |
| 52 | Perform {n} repetitions with this weight. | Test-day logger set hints; Today and session sheet on a test row (middle sets) | `supabase/functions/_shared/strength/test-session.ts:142` | p215 | Do {n} reps with this weight. | Y |  |
| 53 | Perform the maximum number of repetitions possible with this weight. | Test-day logger set hints; Today and session sheet on a test row (last set); Plan strength rows | `supabase/functions/_shared/strength/test-session.ts:116` | p215 | Do as many reps as you can with this weight. | Y |  |
| 54 | {movement} — {weight} lb × {reps} sets the working 1-rep max at {n} lb: (roughly) 96 percent of true 1-rep max. | Logger, after a test set is logged | `src/lib/standing-plan-copy.ts:72` | p214 (photo not in the book folder) | {movement} — {weight} lb × {reps} sets the working 1-rep max at {n} lb: about 96 percent of true 1-rep max. | N | Only the closing phrase is the author's. |

### FTP test row: Today, the session sheet and the Garmin description

| # | line as printed | where it prints | file:line | page | proposed rewrite | six plans | note |
|---|---|---|---|---|---|---|---|
| 55 | If you're using average watts, use the number at the 20-minute mark and multiply it by 0.95. | FTP test row description (Today, session sheet, Garmin workout description) | `supabase/functions/_shared/baseline-test-rows.ts:139` | p212 (photo not in the book folder) | With average watts, take the 20-minute number and multiply it by 0.95. | Y |  |
| 56 | This is your starting functional threshold power (FTP) in watts. | FTP test row description (Today, session sheet, Garmin workout description) | `supabase/functions/_shared/baseline-test-rows.ts:139` | p212 | It is your starting functional threshold power (FTP) in watts. | Y | A short factual sentence; the only change possible without losing the term or the unit is the opening word. |

### Plan screen: the block description (also the plan download text)

| # | line as printed | where it prints | file:line | page | proposed rewrite | six plans | note |
|---|---|---|---|---|---|---|---|
| 57 | A higher pain tolerance may be an excellent adaptation for endurance athletes because the ability to manage increasingly uncomfortable sensations during various endurance-dependent events may be directly related to their overall performance in their sport. | Plan screen, block description; plan download text (every block) | `supabase/functions/_shared/standing-plan/plan-row.ts:521-523` | p125 | Higher pain tolerance may be a very useful adaptation for endurance athletes, since handling growing discomfort in endurance events may tie directly to how well they perform in their sport. | Y |  |
| 58 | For strength athletes, however, it may be less clear; a higher tolerance may be of negligible benefit or even counterproductive to longer-term health. | Plan screen, block description; plan download text (every block) | `supabase/functions/_shared/standing-plan/plan-row.ts:523-524` | p125 | For strength athletes the case is less clear; higher tolerance may bring little benefit or may even be bad for longer-term health. | Y |  |
| 59 | A 3 to 4 percent reduction in working 1RM should be assumed here. | Plan screen, block description; plan download text; strength session note on Today and the session sheet (numbers-on-file blocks) | `supabase/functions/_shared/standing-plan/compose.ts:1075` | p247 | Assume a 3 to 4 percent drop in working 1RM here. | Y |  |
| 60 | This reduction can be gradually phased out in eight to ten weeks. | Plan screen, block description; plan download text; strength session note on Today and the session sheet (numbers-on-file blocks) | `supabase/functions/_shared/standing-plan/compose.ts:1076` | p247 | The drop can be taken away gradually over eight to ten weeks. | Y |  |
| 61 | Each drill should be done until the movement is optimized for the day and the athlete develops confidence in it; then they move on from it. | Plan screen, block description; plan download text; each plyo drill row; logger plyo card | `supabase/functions/_shared/standing-plan/plyo.ts:190-191` | p227 | Repeat each drill until the movement is at its best for the day and the athlete is confident in it, then move on. | Y |  |
| 62 | Fatigue, poor form, and imprecise movements are all absolute no-no's. | Plan screen, block description; plan download text; each plyo drill row; logger plyo card | `supabase/functions/_shared/standing-plan/plyo.ts:191-192` | p227 | Fatigue, poor form and imprecise movement must all be avoided. | Y |  |
| 63 | Core sits after the main work and before the isolation work — isolation is rarely degraded by a tired core, and core work carries the higher skill component. | Plan screen, block description; plan download text (when it is one of the block's first three sourced notes) | `supabase/functions/_shared/standing-plan/compose.ts:4037-4038` | p142 | Core comes after the main work and before the isolation work, because a tired core seldom harms isolation work and core work needs more skill. | N | Close to the page, not word for word. Not in the six plans. |

### Logger: the plyo card

| # | line as printed | where it prints | file:line | page | proposed rewrite | six plans | note |
|---|---|---|---|---|---|---|---|
| 64 | What is important here is that these drills are all done separately. | Logger plyo card | `supabase/functions/_shared/standing-plan/plyo.ts:184` | p227 | The point here is that each drill is done on its own. | N |  |
| 65 | Each drill should be performed multiple times with ample rest, with a full focus on technique and balance, as well as consistent quality. | Logger plyo card | `supabase/functions/_shared/standing-plan/plyo.ts:184-186` | p227 | Do each drill several times with plenty of rest, giving full attention to technique, balance and consistent quality. | N |  |

### Plan builder

| # | line as printed | where it prints | file:line | page | proposed rewrite | six plans | note |
|---|---|---|---|---|---|---|---|
| 66 | This program can be used as an “all-year” program for an athlete who’s interested in multiple different sports. | Plan builder, Run + Ride + Strength card | `supabase/functions/_shared/standing-plan/setup-copy.ts:29` | p275 | This program can run all year for an athlete interested in several sports. | N |  |
| 67 | Mileage will be dictated by experience level, with more proficient runners looking at runs up to 90 to 100 minutes. | Plan builder, Run + Strength card (after "Four lifting days, four runs.") | `supabase/functions/_shared/standing-plan/setup-copy.ts:41` | p247 | Mileage depends on experience level, and more proficient runners may run up to 90 to 100 minutes. | N |  |
| 68 | Training options for intermediate to advanced cyclists. | Plan builder, Ride + Strength card | `supabase/functions/_shared/standing-plan/setup-copy.ts:53` | p280 | Options for intermediate and advanced cyclists. | N |  |
| 69 | Few changes are needed as the months progress beyond adjustment of 1RM and threshold as you improve. | Plan builder, Run + Ride + Strength confirm step | `supabase/functions/_shared/standing-plan/setup-copy.ts:92-93` | p275 | Little needs to change month to month beyond updating 1RM and threshold as you improve. | N |  |
| 70 | Over a 1-month cycle, the endurance rides should be the same duration, but each cycle can increase the overall duration. | Plan builder, Ride + Strength rides screen | `supabase/functions/_shared/standing-plan/setup-copy.ts:195` | p281 | Within a 1-month cycle the endurance rides stay the same length, but each new cycle can add to the overall duration. | N |  |
| 71 | The long ride can likewise progress, increasing the volume gradually over the entire base season every 1 to 2 weeks. | Plan builder, Ride + Strength rides screen | `supabase/functions/_shared/standing-plan/setup-copy.ts:195` | p281 | The long ride can progress the same way, adding volume gradually every 1 to 2 weeks across the whole base season. | N |  |
| 72 | A highly taxing, 14+ work set session may diminish performance in other modalities significantly for twenty-four hours and still notably for up to seventy-two hours. | Plan builder week check, when a heavy-legs day and the long run fall on different days | `supabase/functions/_shared/standing-plan/week-conflicts.ts:29-30` | p86 | A very hard session of 14+ work sets may cut performance in other training a lot for twenty-four hours, and noticeably for up to seventy-two hours. | Y | Not shown in the six plans (the builder screen was not driven). |
| 73 | A less taxing 6 to 8 work set session may result in only marginal performance deficits for twenty-four hours, with few issues noted forty-eight hours after the session. | Plan builder week check, same case | `supabase/functions/_shared/standing-plan/week-conflicts.ts:30-31` | p86 | An easier session of 6 to 8 work sets may cause only small performance drops for twenty-four hours, with few problems forty-eight hours later. | Y |  |

### State › Adjust

| # | line as printed | where it prints | file:line | page | proposed rewrite | six plans | note |
|---|---|---|---|---|---|---|---|
| 74 | If a powerlifting meet or 5K approaches, I recommend that, 2 weeks out, you switch the program to the deload version. | State › Adjust, under the deload button (Run + Strength) | `supabase/functions/_shared/standing-plan/setup-copy.ts:74` | p247 | If a powerlifting meet or 5K is coming, the recommendation is to switch to the deload version 2 weeks before. | N |  |

No A line was found that cannot be reworded. Four rewrites need a closer look:
- **#38:** drops "(as discussed in Chapter 4)".
- **#34:** "Perfect practice makes perfect" is a saying, so it is rewritten as its plain meaning.
- **#56:** "This is" becomes "It is". Nothing else in that sentence can change without losing the term or the unit.
- **#23:** Michael's own example, used as written.

## Counts

| set | A (author) | approved (MLSS) | B (facts / notation) | C (ours) | not printed | total |
|---|---|---|---|---|---|---|
| pinned lines (`scripts/book-lines.pinned.json`) | 51 | 1 | 101 | 32 | 92 | 277 |
| generated output, distinct sentences (six plans) | 46 | 2 | 633 | 159 | — | 840 |
| A table above, distinct author sentences | 74 | | | | | |

How each row was counted:
- **Pinned lines:** sorted by hand.
- **Generated output:** sorted by script [inferred]:
  - A = contains a line from the A table
  - B = has a number, is four words or fewer, is a book label or table cell, or is a warm-up/cool-down/step item
  - C = everything else. Mostly the exercise how-to text, which matches no book page, and our plan notes.
- A pinned line and a generated sentence can be the same sentence, so the rows do not add across.
- The A table has more lines than the pinned A count. The code sweep found author sentences with no pin, e.g. the four spacing lines (`spacing-line.ts:88-94`), the p247 reduction (`compose.ts:1075`), the p125 sentences (`plan-row.ts:521`), the SKILL sheet paragraph and the p281 rides line.

B lines printed word for word from the book are kept as the order says. Some examples:
- the FTP and run test step lists (`baseline-test-rows.ts`)
- the warm-up boxes, including "4 cadence only 15-second sprints to build up the leg speed and focus on timing and technique with 3-minute rest between" (`source-rules.ts:196`)
- p218's four rows
- p226 carry cells
- the frame slot labels ("1 x ME: Primary hinge lower (rotate with primary push)")

## NOT PRINTED — pinned lines that never reach a screen

Evidence for each group:
- **`cite` strings:** no screen draws a cite field. No pinned "Viada p… —" cite appeared anywhere in the six plans' output.
- **Library `intent` fields and the note constants in `source-rules.ts`:** read only by the library session's notes in `generate.ts`, which no screen reads. The code carries this as a "never prints" note on each.
- **`objective` fields in `intents.ts`:** no reader outside tests. The same words print from the sheet paragraphs, which are in the A table.
- **Plyo plan notes (`plyo.ts`):** stored only in the plan's notes list, which no phone screen reads.
- **`strength-focus-copy.ts`:**
  - `strengthFocusSections`, `strengthFocusBrief`, `strengthFocusBufferLine`, `strengthFocusCeilingLine`: no reader
  - `BAR_SPEED_COPY`, `BAR_SPEED_AMRAP_AFTER`: tests only
  - `HARD_DAY_WHY`: imported by the plan builder but never drawn
  - `HARD_RIDE_SHAPE`: imported, never drawn

- `Percentages here are read as percent of threshold power. The cycling pages give no basis for` · `supabase/functions/_shared/endurance-library/source-rules.ts:58`
- `End the session when heart rate has drifted 5% at the same pace, or pace has fallen 5% at the` · `supabase/functions/_shared/endurance-library/source-rules.ts:118`
- `same heart rate. Training several times a week puts an athlete on the 5% figure rather than 10%.` · `supabase/functions/_shared/endurance-library/source-rules.ts:119`
- `Viada p237, p238 — "10- to 15-minute easy spin"; the midpoint of his own range` · `supabase/functions/_shared/endurance-library/source-rules.ts:210`
- `Viada p241, stated — 20 minutes out, 20 back` · `supabase/functions/_shared/endurance-library/source-rules.ts:376`
- `Pure speed, technical and neuromuscular. Paces come from performance and RPE rather` · `supabase/functions/_shared/endurance-library/source-rules.ts:654`
- `than a prescribed pace; "all-out" means the best speed available that day.` · `supabase/functions/_shared/endurance-library/source-rules.ts:655`
- `Viada pp230-231 — 1- to 3-minute walks between sets and rounds` · `supabase/functions/_shared/endurance-library/source-rules.ts:687`
- `Viada pp230-231 — 2- to 3-minute recovery between sets` · `supabase/functions/_shared/endurance-library/source-rules.ts:704`
- `Maximum time in zone 4 with equalised fatigue.` · `supabase/functions/_shared/endurance-library/source-rules.ts:743`
- `Viada pp231-232 — 2-minute walk/recovery jog between sets` · `supabase/functions/_shared/endurance-library/source-rules.ts:806`
- `Viada pp231-232 — 2-minute recovery walk/jog between sets` · `supabase/functions/_shared/endurance-library/source-rules.ts:868`
- `Viada pp231-232 — reps step down, recovery steps down with them` · `supabase/functions/_shared/endurance-library/source-rules.ts:893`
- `Maximum time near threshold, whether from shorter above-threshold intervals or longer` · `supabase/functions/_shared/endurance-library/source-rules.ts:902`
- `below-threshold ones, while controlling fatigue.` · `supabase/functions/_shared/endurance-library/source-rules.ts:903`
- `Viada pp233-234; recovery per Ch.4 (4:1, clamped 30s-2min)` · `supabase/functions/_shared/endurance-library/source-rules.ts:925`
- `Viada pp233-234 — 3- to 5-minute recovery walk/jog between sets` · `supabase/functions/_shared/endurance-library/source-rules.ts:964`
- `Viada pp233-234 — 1 to 1:30 at VT1 between` · `supabase/functions/_shared/endurance-library/source-rules.ts:997`
- `Viada pp233-234 — "8 rounds of: 5 min @ 90% / 1:30 @ VT1"` · `supabase/functions/_shared/endurance-library/source-rules.ts:1039`
- `Viada pp233-234 — "6 rounds of: 6 min @ 88% / 1 min @ VT1"` · `supabase/functions/_shared/endurance-library/source-rules.ts:1051`
- `Viada pp233-234 — "4 rounds of: 8:30 @ 85% / 1 min @ VT1"` · `supabase/functions/_shared/endurance-library/source-rules.ts:1063`
- `Viada pp233-234 — 1 minute at VT1 between` · `supabase/functions/_shared/endurance-library/source-rules.ts:1086`
- `Viada pp233-234 — a short supra-threshold surge inside a near-threshold block` · `supabase/functions/_shared/endurance-library/source-rules.ts:1117`
- `Viada pp233-234 — a sharp opening surge before a long steady effort` · `supabase/functions/_shared/endurance-library/source-rules.ts:1145`
- `Any run at or below VT1. The level refers almost strictly to the duration.` · `supabase/functions/_shared/endurance-library/source-rules.ts:1159`
- `Maximise training time; may combine zones but is primarily below VT1. Unlike VT1` · `supabase/functions/_shared/endurance-library/source-rules.ts:1184`
- `sessions it may include rest periods or pauses with little negative impact.` · `supabase/functions/_shared/endurance-library/source-rules.ts:1185`
- `Viada p235 — sets added at any point in the run` · `supabase/functions/_shared/endurance-library/source-rules.ts:1217`
- `Viada p235 — pauses permitted, and the one exception to the VT1 session cap` · `supabase/functions/_shared/endurance-library/source-rules.ts:1285`
- `Viada p236 — 5 to 6 minutes of recovery between` · `supabase/functions/_shared/endurance-library/source-rules.ts:1309`
- `Viada p236 — 6 to 10 minutes of easy spin between reps` · `supabase/functions/_shared/endurance-library/source-rules.ts:1354`
- `Viada p237 — 4 to 6 minutes of recovery between sets` · `supabase/functions/_shared/endurance-library/source-rules.ts:1391`
- `Viada p237 — 4-minute easy spin between rounds` · `supabase/functions/_shared/endurance-library/source-rules.ts:1438`
- `Viada p238 — 5-minute rest` · `supabase/functions/_shared/endurance-library/source-rules.ts:1459`
- `As close to threshold as possible without exceeding it — plenty of time in the zone` · `supabase/functions/_shared/endurance-library/source-rules.ts:1511`
- `with far less fatigue than riding at or above it.` · `supabase/functions/_shared/endurance-library/source-rules.ts:1512`
- `Viada pp238-239 — 3-minute easy spin` · `supabase/functions/_shared/endurance-library/source-rules.ts:1537`
- `Viada pp238-239 — 2-minute easy spin` · `supabase/functions/_shared/endurance-library/source-rules.ts:1556`
- `Viada pp238-239 — 4-minute easy spin` · `supabase/functions/_shared/endurance-library/source-rules.ts:1575`
- `Viada pp238-239 — 5-minute easy spin` · `supabase/functions/_shared/endurance-library/source-rules.ts:1596`
- `Straight endurance, or endurance carrying some speed/threshold work. Each level is` · `supabase/functions/_shared/endurance-library/source-rules.ts:1605`
- `meant to be roughly comparable in overall fatigue; the more intense versions are for` · `supabase/functions/_shared/endurance-library/source-rules.ts:1606`
- `Viada p239 — "easy ride below 75%"` · `supabase/functions/_shared/endurance-library/source-rules.ts:1617`
- `an hour and a half and involve significant fatigue.` · `supabase/functions/_shared/endurance-library/source-rules.ts:1657`
- `Viada p241 — 2- to 3-minute rest between the long repeats` · `supabase/functions/_shared/endurance-library/source-rules.ts:1667`
- `Short repeats built from easy, moderate, hard and all-out lengths.` · `supabase/functions/_shared/endurance-library/source-rules.ts:1676`
- `Viada p241 — 15- to 60-second rests, 1 minute between sets` · `supabase/functions/_shared/endurance-library/source-rules.ts:1687`
- `Viada p241 — 2-minute rest after returning to shore` · `supabase/functions/_shared/endurance-library/source-rules.ts:1718`
- `Viada p241 — 20 minutes out, 20 minutes back` · `supabase/functions/_shared/endurance-library/source-rules.ts:1728`
- `A watch with an audible timer is strongly recommended: the sighting intervals are timed, not counted.` · `supabase/functions/_shared/endurance-library/source-rules.ts:1746`
- `The exact percentage of threshold at VT1 moves with fatigue, hydration and conditions. If unsure,` · `supabase/functions/_shared/endurance-library/source-rules.ts:1750`
- `run the talk test twice — once after 5 minutes and once after 20.` · `supabase/functions/_shared/endurance-library/source-rules.ts:1751`
- `Sprint paces come from performance and RPE, not from a prescribed pace. "All-out" means the best` · `supabase/functions/_shared/endurance-library/source-rules.ts:1755`
- `speed available that day. Work intervals may be run on hills with the pace adjusted to hold the` · `supabase/functions/_shared/endurance-library/source-rules.ts:1756`
- `The dose is p210's: 2 × 100-meter strides (begin slow and accelerate to near full tilt), untimed, no rest` · `supabase/functions/_shared/endurance-library/source-rules.ts:1846`
- `A handful of strides at the end of an easy run trains running economy without a separate speed` · `supabase/functions/_shared/endurance-library/source-rules.ts:1851`
- `session. Run them fast and relaxed, at the best speed available that day — there is no pace` · `supabase/functions/_shared/endurance-library/source-rules.ts:1852`
- `target — and take full recovery between them.` · `supabase/functions/_shared/endurance-library/source-rules.ts:1853`
- `set starts at the bottom of the band and progresses toward the top by the end.` · `supabase/functions/_shared/endurance-library/source-rules.ts:1858`
- `Several minutes of a long ride spent on pedal stroke and position is time well used.` · `supabase/functions/_shared/endurance-library/source-rules.ts:1898`
- `The plyometric day takes one drill from each of the three families the source names. He caps a` · `supabase/functions/_shared/standing-plan/plyo.ts:120`
- `day at three or four drills and puts the warm-up at one to three skills; taking one from each` · `supabase/functions/_shared/standing-plan/plyo.ts:121`
- `Which drill a family gives first follows p89: foot-speed drills and static plyometrics before` · `supabase/functions/_shared/standing-plan/plyo.ts:137`
- `skipping, bounding and hops. The ramp is his; only taking one drill from each family at a time` · `supabase/functions/_shared/standing-plan/plyo.ts:138`
- `ME, or maximum effort, is a movement designed to improve your ability to move maximal or near maximal weight.` · `supabase/functions/_shared/strength-grid/intents.ts:82`
- `DE, or dynamic effort sets, should have an emphasis on bar speed and quality of movement.` · `supabase/functions/_shared/strength-grid/intents.ts:92`
- `Maximum motor unit recruitment is the goal, and repetitions should be a steady tempo—controlled yet powerful.` · `supabase/functions/_shared/strength-grid/intents.ts:113`
- `Sub-maximal loading keeps fatigue manageable. Three lifting days — squat,` · `src/lib/strength-focus-copy.ts:91`
- `Week {} tests the working number, which is what sets the next block's weights.` · `src/lib/strength-focus-copy.ts:106`
- `working number — the first sets where this block starts, the last sets where the next one does.` · `src/lib/strength-focus-copy.ts:108`
- `Training provides the stimulus. Adaptation happens during recovery. Prioritize how you feel —` · `src/lib/strength-focus-copy.ts:113`
- `the math only works if you honor your rest.` · `src/lib/strength-focus-copy.ts:114`
- `Your working number starts at 85% of your max and every set comes off that, which is the buffer` · `src/lib/strength-focus-copy.ts:186`
- `that makes the last set of {} worth measuring. Week one sits below what you can already` · `src/lib/strength-focus-copy.ts:187`
- `climbing for the rest of the block. That is usually the max on file being out of date rather` · `src/lib/strength-focus-copy.ts:217`
- `Every rep explosive and controlled.` · `src/lib/strength-focus-copy.ts:355`
- `Grind it out. Stop before failure.` · `src/lib/strength-focus-copy.ts:358`
- `As many clean reps as possible. The set ends when the form changes.` · `src/lib/strength-focus-copy.ts:362`
- `Rest until the speed's back.` · `src/lib/strength-focus-copy.ts:363`
- `Not to failure — you train tomorrow.` · `src/lib/strength-focus-copy.ts:382`
- `Assistance reps only. Main lifts always run at 85% training max, +5 lb upper / +10 lb lower` · `src/lib/strength-focus-copy.ts:576`
- `0 hard days, under 4 hrs → 40–50 reps. Full volume.` · `src/lib/strength-focus-copy.ts:588`
- `0 hard days, 4–8 hrs → 30–40 reps.` · `src/lib/strength-focus-copy.ts:589`
- `1 hard day, 8 hrs or under → 30–40 reps.` · `src/lib/strength-focus-copy.ts:590`
- `Over 8 hrs, any days → 25–30 reps.` · `src/lib/strength-focus-copy.ts:591`
- `2+ hard days, any hours → 25–30 reps. Minimum effective dose.` · `src/lib/strength-focus-copy.ts:592`
- `Assistance reps are the only expendable volume.` · `src/lib/strength-focus-copy.ts:598`
- `Flat sprints: maximal footfall is mechanical damage — the one session held 48 hrs clear` · `src/lib/strength-focus-copy.ts:614`
- `Threshold: level footfall, submaximal, but lots of it.` · `src/lib/strength-focus-copy.ts:616`
- `to two, forty-minute sessions down to thirteen, both held for fifteen weeks.` · `src/lib/strength-focus-copy.ts:636`
- `A fixed group run or ride lands in this same slot and costs the week the same recovery.` · `src/lib/strength-focus-copy.ts:650`
- `Four 4-minute efforts hard, three minutes easy between them. A climb, a flat road or a trainer` · `src/lib/strength-focus-copy.ts:682`


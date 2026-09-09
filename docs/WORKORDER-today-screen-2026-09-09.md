# Work order — The Today screen (2026-09-09)

Decided 2026-09-09 (docs/SESSION-2026-09-06-07-handoff.md, "decided, not built: the Today screen"). Michael:
brief breakdowns of the day's lifts and ride from the book, including spacing, each lift's kind of set and its
cue. Not redundant with the logger: the logger lays the work out and has the time; Today says what each set
is for so the athlete hits it with the intended purpose.

Rules: never use ours (memory feedback_never_use_ours_in_copy). Every line below marked APPROVED ships
verbatim. Anything marked PENDING does not ship; ask. No new athlete-facing words. Sessions are identified by
tag, never by name. Build what is tapped, warn in a note, never move or block. docs/COPY-VOICE.md.

## 1. Navigation

- Bottom bar becomes **Home · State · +**. `AppLayout.tsx` (~1900–1990) renders Home / State / Focus today.
- Home opens on **Today**. **Week** (the current calendar, `WorkoutCalendar.tsx`) is a second tab at the top
  of Home, the way State has Status / Adjust / Schedule.
- **+** opens the Focus screen (training card, race entry, current plan). Plan building only.
- Adding a workout by hand moves to the Week tab: tap a day, add (TrainingPeaks / TrainerRoad pattern). Low
  priority; may ship after the rest.
- The first-run spotlight on Focus (`FirstRunOverlay.tsx`, `data-first-run="focus"`) moves to the +.

## 2. Today, top to bottom

Data: today's rows from `get-week` (the rows `TodaysEffort.tsx` already loads). A strength row carries
`strength_exercises[]` with `name` / `execution_name`, `slot_intent` (ME / DE / SKILL / HYP), `target_reps`,
`target_rir`. An endurance row carries tags `family:<family>`, `level:<n>`, `sport:<run|ride|swim>`
(`session-vocabulary.ts` ~361) and `duration`.

1. **Spacing line**, only when the day has two sessions. Built from the day's own data (ride or run length
   and family, lift day, set count), never a list of rules. APPROVED (Michael's words):
   - `Two sessions today. Six to eight hours apart.` (p145)
   - then `Closer than that:` followed by one of
     `Lift first, make the ride easier.` (p144, p145) or
     `Ride first, skip the skill work.` (p145). On a day whose only speed row is DE the second reads
     `Ride first, drop the speed work.`
   - A run in place of the ride uses the same lines with "run".
2. **Each session**, in the day's order. Session name and time (from the row). Then:
   - **Lift session**: one line per row, in the row's order: movement name, the kind spelled out, the cue.
     The cue repeats when the kind repeats (three HYP rows show the HYP line three times). No sets, reps as a
     prescription, loads, or warm-ups; the logger has them.
     - ME, `Maximal effort`: `1 to 5 reps, stop short of failure.` (p218, p219). APPROVED.
     - DE, `Dynamic effort`: `As fast as possible on every rep. Bar slows, set is over.` (p218, p219).
       APPROVED. Existing rule kept: "bar" only on a barbell row (`displayFormat === 'total'`); dumbbell,
       band, bodyweight rows read `Move slows, set is over.` APPROVED 2026-09-09.
     - SKILL, `Skill`: `Form and consistency over speed. Weight heavy enough to be a challenge. Every rep
       either improves the movement or degrades it. Performed poorly, stop.` (p219, p76, p143). APPROVED.
     - HYP, `Hypertrophy`: `8 to 12 reps, 1 to 2 in reserve. Reps slow as the set goes.` (p86, p218).
       APPROVED.
     - Plyo rows (tag `plyo`): the row's own note (see WORKORDER-kill-ours §B.7), nothing more.
     - Test rows (tag `1rm_test`): the row's own note, nothing more.
   - **Endurance session**: one line for the family, then the stop rule.
     - `family:ride_anaerobic`: `Go by feel. Stay above the floor. No ceiling. Each set harder than the last.`
       (p237). APPROVED.
     - `family:ride_endurance`: `Easy, under 75 percent. Spend a few minutes of the ride paying attention to
       how you pedal (smooth circles, not stomping) and how you sit on the bike. Truly easy.` (p239, p275).
       APPROVED.
     - `family:run_mlss` and `family:run_near_threshold` (the Hard Run): `Stay near threshold as long as you can without
       falling apart.` (p233, p110). APPROVED.
     - `family:run_lsd` (the Long Run): `Easy the whole way. Stopping for a bit is fine. Be able to speak long
       sentences easily the whole time.` (p235, p211). APPROVED.
     - `family:run_vt1`: `Easy. Talk test twice, at 5 minutes and at 20.` (p235, p211). APPROVED. Never the
       word VT1 on screen.
     - `family:ride_sweet_spot`: `As close to threshold as you can without going over.` (p238). APPROVED.
     - Any other family: no line. Never invent one.
     - Stop rule, every endurance family: `Heart rate up 5 percent, or output down 5 percent: stop.` (p107).
       APPROVED.
   - **A workout not from the plan** (Garmin / Strava / typed): name and time only. No lines.
3. **The week so far**: dropped from Today (2026-09-09). It lives on State.
4. **Rest day / nothing planned**: nothing shown. No line.

## 2b. Look

- Sport colours reflected (Michael, 2026-09-09): each session on Today carries its sport's colour the way the
  calendar and cards do (docs/REFERENCE-wizard-visual-language.md, memory project_efforts_visual_language:
  sport dots as the light source, soft sport-colour bleed). Lift, ride, run each in their own colour; the
  spacing line carries no colour.

## 3. Not on Today

- Sets, reps, loads, warm-up ladders, how-to sheets, swap lists: the logger.
- Scores, badges, streaks. Any "coach" sentence.
- The set-word sheet stays on the logger (WORKORDER-kill-ours §B.4) with the same four lines.

## 3b. Polish, GO (Michael, 2026-09-09: "give this a little life")

1. **Weather block at the top of Today**, above the date. From `useWeather.ts` / `sessionWeather.ts`:
   temperature and feels-like, condition as an ICON, sunrise and sunset times, wind. Icons from
   `lucide-react` (already a dependency): Sun, Cloud, CloudSun, CloudRain, CloudSnow, CloudFog,
   CloudLightning. No emoji, ever. The condition today is `'—'` because `get-weather` asks Open-Meteo for no
   weather code (`get-weather/index.ts` ~319, ~413): add `weather_code` to the hourly request and map the
   WMO code to the icon (0 Sun · 1–3 CloudSun/Cloud · 45–48 CloudFog · 51–67, 80–82 CloudRain · 71–77, 85–86
   CloudSnow · 95–99 CloudLightning). Dew point: Open-Meteo has `dew_point_2m`; add it to the same request
   and show it beside humidity. Deploy `get-weather` when this lands.
2. **The load card moves from State to Today.** `LoadWeeksCard.tsx` (five weekly bars per sport, this week
   last) renders on Today below the day's sessions, one per sport the athlete does. It comes off State in
   the same change; nothing else on State moves.
3. **This week's counts**, one row under the load card, numbers only: miles run, miles ridden, pounds
   lifted. Miles from the week's completed workouts' distance (the same figure the calendar rows carry);
   pounds from the week's logged sets, weight × reps summed, the figure `StrengthCompletedView.tsx` already
   shows per session. Labels `Run` / `Ride` / `Lifted`, units `mi` / `lb` (km / kg when the athlete's units
   say so). No sentence.
4. **Colour follows the day**: the soft sport-colour bleed at the top of the screen
   (docs/REFERENCE-wizard-visual-language.md) takes the colour of the day's first session; a rest day keeps
   the neutral bleed.
5. The workouts in detail (built intervals under the family line) and Tomorrow (next day's sessions, name
   and time only) stay on the list, after 1–4.

## 3c. Lifting session time (Michael, 2026-09-09)

The 45 / 55 / 20 minutes the composer stamps on test, lifting and plyo sessions are fixed numbers with no
page. Replace with an estimate from the session's own rows: for each row, sets × (time under the bar + the
rest the timer would run for that kind of set), summed, shown as a range (low to high), e.g. `45–55 min`.
Time under the bar per set is a field estimate and is marked as such in the code. The ride and run keep
their built lengths. Shown wherever the shared header shows minutes (Today, the drawer, the planned screen).

## 4. Out of scope

- WORKORDER-kill-ours and WORKORDER-de-row-by-feel (separate, may land first or after).
- The rest timer (handoff item 0).
- Adjust, State, and the plan card. Nothing there changes.

## 5. Verification

- Throwaway account on the live server with a built Standard plan (barbell kit) and one with a bodyweight
  kit. Screenshots, phone size, light and dark: a two-session day (lift + anaerobic ride), a lift-only day,
  the plyo day, a long-run day, a rest day, a day with a Garmin ride and no plan row.
- Every line on the screen is one of the APPROVED lines above or a row's own data. `grep` the new component
  for string literals; each one is in this doc.
- The Week tab renders the same calendar as before; + opens Focus; the first-run spotlight lands on +.
- Michael's account is not touched; he sees it on his next sync.

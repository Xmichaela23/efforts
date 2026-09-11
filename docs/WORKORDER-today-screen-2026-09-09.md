> **SHIPPED 2026-09-10** (§1–3i; deck replaced by the lift card §3h). Pushed, deployed, iOS synced; device walk pending. Record: docs/SESSION-2026-09-09-10-handoff.md.

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

1. **Spacing line**, REVISED 2026-09-10 (Michael). Shown only when the day has two sessions. Two lines
   always: `Two sessions today. Keep them six to eight hours apart.` (p145). A third line `If they have to be
   closer` with a chevron at its right; tap opens, under it: `Lift first and keep the ride easy. Riding
   first costs the lift its skill and speed sets.` (p144, p145, p77). Closed by default. "ride" becomes
   "run" for a run day. On a lift day with no skill and no speed sets the second sentence drops. The
   app already reads the day's rows to pick the branch; keep that, and show the book's preferred order
   (lift first) with the cost of the other, not one branch alone. The earlier lines below are history.
   **Upper-body day** (Michael, 2026-09-10): on a day whose lift is an upper-body session (frame day
   label / tags, never the name), the "If they have to be closer" text is `Lift first and keep the ride
   easy.` only; the sentence about riding first costing the lift drops, because that cost is a leg cost
   (p131: fresh in the systems the session uses; p251: switch upper and lower days when legs are tired;
   p274 pairs the upper pull day with an easy ride). The six-to-eight-hours line stays on every day.
   **Form line**: moved to the status card (§3g, then the one-block-per-subject change).
   ORIGINAL: **Spacing line**, only when the day has two sessions. Built from the day's own data (ride or run length
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
     - `family:ride_endurance`, REVISED 2026-09-10 (Michael: lead with what the ride is). Two lines, one per
       p239 version, chosen by the session's archetype:
       · plain: `Easy ride, under 75 percent of FTP the whole way. You should be able to talk in full
         sentences.` (p239, p211)
       · with work: `Easy ride with a block of 2-minute pushes, then a 10-second sprint every 9 minutes.
         Everything else under 75 percent of FTP.` (p239)
       The pedalling and position note (`Spend a few minutes of the ride paying attention to how you pedal
       (smooth circles, not stomping) and how you sit on the bike.`) moves to the drawer under the line.
       BUILDER FIX: the with-work version must be p239 level 1 as printed (20 min easy · 4 × (2 min @ 80% /
       3 min @ 70%) · 45 min at VT1 with a 10-second sprint every 9 minutes). Ours built 40 min steady
       first and no sprint block; read `session-vocabulary.ts` / the endurance library for why before
       changing, then make it match the page, levels 2 and 3 likewise. Regenerate goldens.
     - `family:run_mlss` and `family:run_near_threshold` (the Hard Run): `Stay near threshold as long as you can without
       falling apart.` (p233, p110). APPROVED.
     - `family:run_lsd` (the Long Run): `Easy the whole way. Stopping for a bit is fine. Be able to speak long
       sentences easily the whole time.` (p235, p211). APPROVED.
     - `family:run_vt1`: `Easy. Talk test twice, at 5 minutes and at 20.` (p235, p211). APPROVED. Never the
       word VT1 on screen.
     - `family:ride_sweet_spot`: `As close to threshold as you can without going over.` (p238). APPROVED.
     - Any other family: no line. Never invent one.
     - Stop rule: REMOVED from Today (Michael, 2026-09-09). It is a mid-session rule the athlete applies with a
       watch, and the ride/run card already reads drift against p107's 5 percent line after the session, with
       heat and hills beside it. The endurance card carries the family line only.
   - **A workout not from the plan** (Garmin / Strava / typed): name and time only. No lines.
3. **The week so far**: dropped from Today (2026-09-09). It lives on State.
4. **Rest day / nothing planned**: the existing `No effort scheduled` line stays (Michael, 2026-09-09). Nothing else.

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
2. **The LOAD card moves from the Week calendar to Today** (Michael, 2026-09-09; State is untouched). The
   card with fitness / fatigue / form, run mi, bike mi, strength lb, under the day's sessions. It comes off
   Week. A chevron down at its right edge opens the workload bars (`LoadWeeksCard.tsx`, one per sport)
   under it; tap again closes. Closed by default; the choice is remembered on the device. The bars have
   been on no screen since 2026-09-04 (removed from State's run card, aa235822).
3. ~~This week's counts row~~ REMOVED 2026-09-09: the LOAD card carries the miles and pounds. Built and
   taken off. (Was: one row under the load card, numbers only: miles run, miles ridden, pounds
   lifted. Miles from the week's completed workouts' distance (the same figure the calendar rows carry);
   pounds from the week's logged sets, weight × reps summed, the figure `StrengthCompletedView.tsx` already
   shows per session. Labels `Run` / `Ride` / `Lifted`, units `mi` / `lb` (km / kg when the athlete's units
   say so). No sentence. Labels and the `54° dew point` form APPROVED 2026-09-09.
4. **Colour follows the day**: the soft sport-colour bleed at the top of the screen
   (docs/REFERENCE-wizard-visual-language.md) takes the colour of the day's first session; a rest day keeps
   the neutral bleed.
5. The workouts in detail (built intervals under the family line) and Tomorrow (next day's sessions, name
   and time only) stay on the list, after 1–4.

## 3d. The deck, GO (Michael, 2026-09-09: "it looks like a wall of words … something cool, floating"; "build it")

Mockup: docs/mockups/today-deck-2026-09-09.html (open in a browser; drag, swipe, arrow keys). Build what it
shows, with the app's own tokens and components.

- A lift session on Today is a DECK: one card per row, one card visible at a time, swipe sideways (pointer
  drag and touch; arrow keys on desktop). Card: movement name large, the kind spelled out in the sport colour
  with a lit dot, the approved cue, the row's weight or `By feel` top right. Session name and `n of N` above
  the deck, position dots below. The whole session takes one card's height.
- Depth: the next cards sit behind, offset up-right, smaller, dimmer, slightly blurred (three visible); read
  cards fall away down-left with a small rotate. CSS 3D transforms only, no library. `prefers-reduced-motion`
  turns the transitions off.
- A ride or run stays one card (name, time, family line, stop rule). The plyo session is a deck too, one
  card per drill, plyo colour.
- Glass: translucent panel over the dot grid, a thin edge in the sport colour, glow bleeding onto the grid.
  The top bleed follows the session in view (lift orange → ride green as the ride card scrolls up). The dot
  grid drifts against the scroll (parallax, about a quarter of scroll speed).
- Tap a card: the drawer opens as now. Swipe is the deck's; tap is the drawer's; a drag under 60 px snaps
  back and does not open the drawer.
- LOAD card as the mockup draws it (§3b.2 redraw): two number rows, dot before the sport label, chevron on
  the header line, no info icon.
- Nothing about the words changes. Every line is the approved one.

## 3c. Lifting session time (Michael, 2026-09-09)

The 45 / 55 / 20 minutes the composer stamps on test, lifting and plyo sessions are fixed numbers with no
page. Replace with an estimate from the session's own rows: for each row, sets × (time under the bar + the
rest the timer would run for that kind of set), summed, shown as a range (low to high), e.g. `45–55 min`.
Time under the bar per set is a field estimate and is marked as such in the code. The ride and run keep
their built lengths. Shown wherever the shared header shows minutes (Today, the drawer, the planned screen).

## 3e. Device round two, GO (Michael, 2026-09-09 evening)

Field check (TrainingPeaks home and calendar, TrainerRoad calendar, Whoop home, Runna Today and calendar,
2026-09-09): Today's data set matches Runna's Today (session + its instructions + week mileage) and
TrainingPeaks' home (fitness / fatigue / form + miles). Week is missing what TP and TrainerRoad show at a
glance: planned versus done for the week, and a compliance colour on missed sessions.

1. **Today header as one block.** Date row (chevrons, `Wed, Sep 9 · Week 2 · Base`, block label right)
   directly under the tabs; the weather under it inside the same quiet block, no second card, the block
   ends at the sunrise line, city right-aligned on that line, 14 px padding. No empty band.
2. **The first session is the big thing.** The first planned session card: name one step larger, glow
   on; the second and later session cards and the LOAD card one step quieter (smaller name, thinner
   edge). LOAD closed is one number row; the dot row (Run / Bike / Lifted) shows only when open.
3. **Week compact.** Rows at content height, 8 px apart. Chips: sport dot, length, a check when done, the
   swap arrow only on a swapped session. No sport codes (`BK-EZ`, `ST`, `RN`) as text. Today's row lit;
   tapping it goes to the Today tab. Tap an empty area of a day row to add to that day (same menu as the
   +); the floating + goes. Drag a chip to another day moves it (the same move the Schedule tab makes,
   same warnings).
4. **Week planned versus done.** One line above the rows: `Planned 6h 10m · 42 mi` / `Done 2h 05m · 12 mi`
   (hours and miles for run + ride; lifts counted as sessions: `3 lifts planned · 2 done`). Data from the
   calendar rows already loaded. A planned session whose day has passed with nothing logged gets the
   status (missed) colour from the two status tokens (`risk` muted red edge), never a sport colour.
   Numbers only; no sentence. Labels `Planned` / `Done` approved by the go.
5. **Bug.** The Week chip labels a swapped anaerobic ride easy. Chips read the row's `band:` tag, never a
   fallback to easy.

## 3f. The Week tab, GO (Michael, 2026-09-09: "feels like an afterthought"; mockup approved)

Mockup: docs/mockups/week-view-2026-09-09.html. Build what it shows with the app's tokens.

- Seven day rows fill the pane edge to edge (grid, equal rows), no space below Sunday. Day label left
  (weekday small caps, number large).
- A session is a LINE, not a chip: sport dot, name, length or real numbers, and at the right a check
  (done), the swap arrow (swapped), or nothing. Two sessions, two lines. Names are the row's own.
- Done days dim, with real numbers: `Near-threshold Run 3.6 mi · 37m`, `Lower body: Hinge 8,817 lb`.
  Today's row lit in its first session's colour with a 3 px bar at the left edge. Days ahead in full
  colour. Missed sessions in the status red (`risk` token). Rest day: the word `Rest`, dim, italic.
- Under the week header, one thin bar: done over planned, the run→ride gradient fill, `Done 1h 17m · 12 mi`
  left and `Planned 6h 23m · 12 mi · 5 lifts` right. Replaces the two-line Planned / Done text.
- Tap a row opens that day on the Today tab. Tap an empty part of a row adds to that day (same menu). Press
  and hold a session line to drag it to another day (§3e.3 move).
- No new words beyond `Done`, `Planned`, `Rest`.

## 3g. LOAD off Today (Michael, 2026-09-09, go)

The LOAD card (fitness / fatigue / form, run / bike / lifted, the bars deck) comes off Today. State keeps
its own load plate; the Week tab's bar carries the week's hours and miles. On Today, one line in the
header block, right of the weather rows: `form −21 · optimal`, the word in the status colour (formZoneColor),
number white. Tap it opens State. Nothing else of the card remains on Today. `WeekLoadCard` and the
LOAD deck: delete if no other screen renders them.

## 3h. The lift card replaces the deck (Michael, 2026-09-10, go)

The swipe deck for lift and plyo sessions comes off Today. In its place, one card per session, the same
height as the deck card was, that expands on tap:
- Closed: session name and estimated time on the header line; the first two exercises, each as a line
  (name, the kind word in the sport colour, weight or `By feel` right) with its approved cue under it; a
  last line `4 more` (the count of the remaining exercises). Tap anywhere on the card and it opens.
- Open: all exercises with their cues, in session order. Tap again and it closes. The ride or run card
  below moves with it. Height animates; `prefers-reduced-motion` turns that off.
- Plyo sessions the same shape, plyo colour, the approved plyo note as the cue.
- Tap on an exercise line does nothing; the card's tap is the only tap. The drawer opens from the
  header line only (session name), so the cue card and the drawer do not fight.
- Ride and run cards unchanged. The mockup docs/mockups/today-deck-2026-09-09.html stays for reference.
- Field basis: TrainingPeaks and Runna show a session as a list with notes inline; Strong and Hevy are
  lists. Nothing in that set swipes through exercises.

## 3i. Superset on the lift card; kind word wrapping (Michael, 2026-09-10 evening)

- Two rows that share a `superset_group` show on the Today lift card as ONE line: `Tate Press + Drag Curl`
  with `superset` after the kind word, and the two cues under it (one cue when both rows are the same kind).
  Same words the drawer uses. The drawer's banner line stays.
- The kind word (`MAXIMAL EFFORT`, `HYPERTROPHY`) must not wrap: keep it on the name line, shrink to 11 px
  or move it under the name at narrow widths, never split the two words.

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

# Client cache audit — 2026-09-21

Read-only inventory of how the client holds server data, to plan moving it all onto the one react-query cache
(the field standard: show what the phone has, refetch in the background, mark stale after any change, prefetch next).
"(inferred)" = read from code, not run. Items marked VERIFIED were confirmed by reading the exact lines.

## Headline
- localStorage holds almost no server data. The duplication is in memory: AppContext `useState`, per-hook `useState`,
  component refs, module-level Sets/Maps.
- Only 5 react-query keys exist: `['weekUnified',…]`, `['planned','windowed']`, `['workout-detail',…]`,
  `['workout-detail',id,'session_detail']`, `['garmin-connection-present']`.
- QueryClient: `App.tsx:23`, library defaults (staleTime 0, gcTime 5 min, refetch on focus/mount, retry 3). Not persisted.
- Three events are dispatched with no listener: `plans:invalidate`, `nav:pullrefresh`, `plan:adjusted`.

## Two gaps an athlete can see
1. VERIFIED — pull-to-refresh (`AppLayout.tsx:1398`, wired at `:1457`) sends `planned:invalidate` + `nav:pullrefresh`,
   never `week:invalidate`. The week feed behind Today and the calendar has a 60 min staleTime (`useWeekUnified.ts`),
   so a pull does not refresh Today or the calendar.
2. VERIFIED — the realtime handler for new/changed workouts (`useWorkouts.ts:923-927`) refetches the 45-day list and
   sends `workouts:invalidate`, not `week:invalidate`. A workout that syncs in does not reach Today or the calendar
   until something else refreshes the week.

## By kind of data

**1. Week feed (`get-week`)** — `useWeekUnified.ts:39-63`, key `['weekUnified','me',userId,from,to]`, stale 60 min prod,
gc 6 h, keepPreviousData, no focus refetch. Neighbour weeks prefetched `WorkoutCalendar.tsx:654-671`. Listens
`week:invalidate` (`:72`). `AppContext.tsx:314` and `:665` call `get-week` to "warm" but throw the result away (never
reaches the cache, inferred). `AppLayout.tsx:1223/1288` one-day calls for the pilates/yoga logger. Screens: Today,
calendar, workout detail.

**2. Planned workouts** — `usePlannedWorkouts.ts:64-73`, key `['planned','windowed']`, stale 10 min, `refetchOnMount:false`;
the queryFn writes into per-instance `useState`, so a second instance mounting while fresh shows `[]` (inferred).
UnifiedWorkoutView:198 and WorkoutCalendar:388 pass `fetchWindowedPlanned:false` → always `[]`. Delete path `:255`
searches that `[]`; `:277` clears the old draft key `strength_logger_session_${date}` while drafts now live at
`…_${date}_${id}` (inferred). Many raw `planned_workouts` reads elsewhere (usePlannedWorkoutLink, AllPlansInterface,
TodaysEffort, StrengthLogger, CompletedTab, AssociatePlannedDialog, StateAdjustLens). `useSwapSheet.ts:25-32` reruns
`swap-session` on `planned:invalidate`.

**3. Completed workouts** — `useWorkouts.ts` plain `useState`, 45 days, one instance in AppContext:216; `CompletedTab.tsx:91`
makes a second full instance (second fetch + same-named realtime channel, inferred). Realtime `:908-934`.
Readers: AppLayout date summary, StrengthLogger, PilatesYogaLogger, StrengthCompletedView, NonRaceBuilder,
useWorkoutDetail preview, useGarminDataPresence.

**4. Workout detail** — `useWorkoutDetail.ts`, keys `['workout-detail',id,opts]` (60 s) and `…,'session_detail'` (5 min),
no user id in key. Listens `workout-detail:invalidate`. Three copies: react-query, UnifiedWorkoutView
`updatedWorkoutData` (`:258-309`), AppLayout `selectedWorkout`.

**5. Training plans** — AppContext `loadPlans` (`:566`, `plan-overview`) into `useState`; reloads on `plans:refresh`
only. `detailedPlans` mutated in place `:833`, `:859`. AllPlansInterface own `plan-overview` call (`:586`) +
`weekCacheRef` Map (`:193`). StateTab reads `plans` directly (`:375`). `plans:invalidate` reaches none of them.

**6. Baselines / FTP / 1RMs / units** — no cache; `loadUserBaselines` (`AppContext.tsx:412`) is a fresh query per call,
plus ~15 direct `user_baselines` reads. Only TrainingBaselines hears `baseline:saved`. StatePerformanceSection:1055 and
StateAdjustLens:76 write the whole `ui_prefs` from a load-time snapshot — can overwrite a flag written in between (inferred).

**7. Strength history** — `useExerciseLog`, `useStrengthCalibration`, direct reads in StrengthCompareTable/StrengthLogger.

**8. State / coach** — `useCoachWeekContext` in 4 separate instances (ContextTabs, WorkoutCalendar, TodaysEffort,
GoalsScreen), each reading `coach_cache` + calling `coach` (inferred duplication). No window event.

**9. Goals** — `useGoals` (GoalsScreen only) on `goals:invalidate`; direct reads in StateTab, AthleticRecordPage,
AllPlansInterface, useStateTrends.

**10. Other** — weather module Map `useWeather.ts:17` with its own expiry; workout execution in IndexedDB (device state, keep).

## localStorage that mirrors server data
`strength_logger_workout` (copy of a planned workout, AppLayout:263); `efforts:state_row_order`,
`efforts:adjust_section_order`, `efforts:seen:*` (mirror `ui_prefs`); connection flags `strava_connected`,
`strava_access_token`, `garmin_access_token`, `healthKitAuthorized`, `healthKitSyncEnabled`. `pool_length_default_m` is
read, never written.

## Device-only (leave alone)
theme, map basemap, profile last sport, intake step, dismissals, strength logger drafts/timers, warmup variants,
crash marker, Garmin OAuth session values, IndexedDB workout execution.

## Proposed order
1. Week feed: pull-to-refresh and the workouts realtime handler invalidate it (closes both visible gaps).
2. Planned workouts read from the cache, not per-instance state.
3. Completed workouts onto one query; drop the second instance.
4. Plans onto one query; `plans:invalidate` becomes real.
5. Baselines onto one query; `ui_prefs` writes merge instead of overwrite.
6. Coach context: one query shared by the four screens.
7. Retire the custom window events once each kind invalidates through the cache.

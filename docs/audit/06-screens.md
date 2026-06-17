# AREA — Screens (client)

> Reverse-documentation of the user-facing React screens. Derived from code reads (this
> session) plus three parallel `Explore` sub-agent sweeps. **Read-only audit — describes what
> the code does, does not judge or fix.** Where a line cite is from a sub-agent sweep and not
> independently re-opened, it is marked `(sweep)`; treat those as high-confidence-but-verify.
> Headings are fixed per the work order.

## What this area does (plain-language overview)

The client is a React + TypeScript (Vite) SPA wrapped for iOS via Capacitor. Routing is thin:
`src/App.tsx` maps nearly every in-app route to `Index.tsx → AuthWrapper → AppLayout`, and
`AppLayout.tsx` (~1884 lines) is the real shell — it owns ~25 boolean "which view is showing"
flags, the bottom-nav, the post-workout-feedback popup, and the realtime subscription. The
screens themselves divide into (a) **read/display surfaces** that consume pre-formatted server
contracts (the State panel, the workout-detail/Performance/Details tabs, the Home dashboard,
the calendar), (b) **capture/setup surfaces** that do real client math (onboarding, the Arc-setup
wizard, Goals, baselines, the plan wizards, interval builders), and (c) **glue surfaces**
(Connections/OAuth, admin import). The animating tension is "smart server, dumb client": the
server pre-computes display contracts (`session_detail_v1`, `get-week` unified items, coach
context, arc context, `state_trends_v1`) and the read surfaces are meant to render them verbatim.
The display surfaces largely honor this; the capture/builder surfaces deliberately do not (they
must compute to build), and a handful of display surfaces still do formatting-adjacent or
genuinely-recomputed math — inventoried below.

## Features / flows

### App shell / auth gate (AuthWrapper + AppLayout)
- **What it does:** Boots the session, gates on `users.approved`, then renders the single-page shell.
- **How it works:** `Index.tsx` → `AuthWrapper.tsx` resolves the stored auth user, runs
  `fetchApprovalOutcome` (3 retries, 12s timeout each) and shows Loading / Login / "pending
  approval" (denied) / "can't verify" (error) / `AppLayout`. `AppLayout` holds all view-toggle
  state and renders one of: dashboard (`TodaysEffort` + calendar), `UnifiedWorkoutView`,
  loggers, plans, baselines, gear, goals, context panel.
- **Inputs / outputs:** reads `users.approved` (`AuthWrapper.tsx:45`), `useAppContext()` (workouts,
  plans), `usePlannedWorkouts`. Writes: dispatches `workouts:invalidate` / `week:invalidate`;
  invokes `save-imported-workout`, `auto-attach-planned`, `calculate-workload`, `check-feedback-needed`.
- **Triggers:** app load; route deep-links (`/goals`, `/profile/athletic-record`, `?openPlans`).
- **Client-side math vs. server values:**
  - `todayDateString()` / `formatHeaderDate()` — client date formatting (`AppLayout.tsx:47`, `:709`).
  - Mobility → strength exercise conversion: large client parser that regex-extracts sets/reps/
    weight/duration from `mobility_exercises` free text and expands per-side entries
    (`AppLayout.tsx:270-348`, duplicated at `:1206-1345` in `handleAddEffort`/`handleSelectEffortType`).
    This is genuine client parsing of authored data, not a recompute of a server number.
  - Post-workout-feedback gating: client re-reads `workouts` rows directly (`AppLayout.tsx:507`,
    `:434`, `:1126`) and computes `isWithin7Days` from `date` (`:529-531`) — direct table reads
    outside `get-week` (allowed per CLAUDE.md's enumerated exceptions; `PostWorkoutFeedback` is listed).

### State panel (StateTab / StatePerformanceSection / LoadBar)
- **What it does:** The "Today" instrument panel — load gauge, readiness, per-discipline fitness
  trends, strength status, race readiness, deterministic glance headline.
- **How it works:** `ContextTabs.tsx` calls `useCoachWeekContext()` and renders `StateTab`.
  `StateTab` additionally pulls `useExerciseLog(8)`, `useStateTrends()` (via
  `StatePerformanceSection`), `fetchArcContext()`, and queries `goals` / `race_courses` directly.
  `LoadBar` renders the ACWR gauge + 7-day daily-load sparkline.
- **Inputs / outputs:** reads `coach_cache` (via `useCoachWeekContext`), `exercise_log`,
  `workouts.workout_analysis` / `route_progress_metrics` / `workout_facts` (via `useStateTrends`),
  `goals`, `race_courses`, get-arc-context. Writes: `course-upload`, `course-strategy` invokes
  from the race section.
- **Triggers:** opened from the dashboard context button (`handleOpenContext`).
- **Client-side math vs. server values:**
  - **Read from server:** load verdict + ACWR scalar, readiness state, race-readiness
    `delta_display` / `assessment` / `predicted_finish_display`, strength `verdict_label`/`tone`,
    nudge headline/severity — all pre-formatted by the coach edge fn and rendered verbatim.
  - **Glance headline** is composed client-side by `buildLoadHeadline()` (`src/lib/load-headline.ts`)
    from server verdict fields — bounded string composition, not numeric recompute. `acwrVolumeLabel()`
    in that same file is the single source for the ACWR→label band mapping; `LoadBar` imports it so
    the gauge label and headline cannot drift.
  - **Client math (formatting):** `fmtGoalClock()` seconds→HH:MM:SS (`StateTab.tsx:98` sweep),
    `fmtSignedDeltaVsGoal()` computes actual−goal and signs it (`:107` sweep), `daysSinceYmd()` /
    `isRaceWeekClosed()` race-week date math (`:81`,`:92` sweep).
  - **Client math (genuine recompute) — FLAG:** strength bar `e1rm_pct` is recomputed client-side
    as `e1rm_current / peak1RM * 100` (`StateTab.tsx:1438-1442` sweep) even though server provides
    `e1rm_current` and `peak1RM` as scalars.
  - **`LoadBar` client math:** `acwrToGaugePct()` maps ACWR [0.6,1.7]→[0,100]% for dot position
    (`LoadBar.tsx:46` sweep); daily bar heights normalized as `d.load / maxLoad` (`:141` sweep);
    stacked `by_type` segment percentages `seg.load / d.load * 100` (`:153` sweep); weekday-narrow
    label via `toLocaleDateString` (`:164` sweep). These are presentation transforms of server scalars.
  - **`StatePerformanceSection` client math:** `verdictSignedPct()` re-signs the server `pctChange`
    so a lower-is-better metric reads "+2%" when improving (`:23-28` sweep). Same D-160 re-sign
    pattern appears in `MobileSummary` — see Redundancies.

### Workout detail — Performance / Details / Planned / Completed (UnifiedWorkoutView + MobileSummary + CompletedTab + Strength views)
- **What it does:** The per-workout screen with tab routing (planned / compare / completed /
  performance). For completed endurance: metrics, charts, GPS map, trend line. For strength:
  planned-vs-actual exercise table.
- **How it works:** `AppLayout` selects a workout → `UnifiedWorkoutView` → `useWorkoutDetail(id,
  {fetchSessionDetail:true})` fetches the `session_detail_v1` display contract from the
  `workout-detail` edge fn; `MobileSummary` renders the merged planned/completed view;
  `CompletedTab` renders charts via `useWorkoutData`.
- **Inputs / outputs:** reads `workout-detail` edge (`session_detail_v1`), `get-week` single-day
  (`useWeekUnified`), `usePlannedWorkoutLink`, context workouts; `CompletedTab` reads `gear` and
  invokes `recompute-workout`. Writes: RPE/gear via feedback; recompute invalidation events.
- **Triggers:** tap a workout from calendar / TodaysEffort / plans.
- **Client-side math vs. server values:**
  - **Read from server:** `session_detail_v1` is a fully pre-formatted contract (display strings,
    verdicts, deviations, race block) — rendered verbatim. `discipline_trend` verdict/pct,
    strength `weight/volume_deviation` flags, `normalized_power`/`intensity_factor`/`variability_index`
    come from `computed.analysis.power` as scalars.
  - **Client math (formatting):** `WorkoutMetrics.tsx` formats every metric client-side —
    `formatTime` / `formatPace` / `formatSpeed` / `formatPower` / `formatCadence` / `formatElevation`
    (`:42-79` sweep) from server scalars.
  - **Client math (recompute / fallback chains) — FLAG:** `useWorkoutData.ts` is the heaviest
    display-side recompute. It prefers a server field but **falls back to client arithmetic**:
    `avg_pace_s_per_km` = `computed.overall.avg_pace_s_per_mi / 1.60934` else from speed
    (`:66-70` sweep); `max_pace_s_per_km` prefers `computed.analysis.bests.max_pace_s_per_km` else
    from `max_speed_mps` (`:85-89` sweep); `avg_swim_pace_per_100m` is computed scalar-first as
    `moving_duration / (distance_m/100)` and only falls back to `computed.analysis.swim` when scalar
    inputs are absent (D-166 rationale: `computed.analysis` can be stale) (`:104-109` sweep).
  - **Strength recompute — FLAG:** `StrengthCompletedView.calculateExerciseVolume()` sums
    `reps*weight` and `getExerciseComparison()` recomputes `plannedVolume = sets*reps*weight` and
    `volumeDiff` (`:78-113` sweep); `StrengthPerformanceSummary` parses computed.steps and computes
    reps-range midpoints "4-6"→5 (D-094) (`:69-94` sweep). Server may also surface these in
    `session_detail_v1`; client computes anyway.
  - **`MobileSummary`** re-signs `discipline_trend.pct_change` by verdict (D-160) (`:33-35` sweep);
    `mergeSessionDetailRaceReadiness()` merges live edge `session_detail_v1` with the persisted
    `workout_analysis.session_detail_v1.race_readiness` to survive stale-cache nulls (`:45-83` sweep).

### Home dashboard + calendar (TodaysEffort + WorkoutCalendar)
- **What it does:** The default landing surface — today's workouts, week strip, the Arc one-liner,
  and a 7-day calendar with per-cell labels.
- **How it works:** `TodaysEffort` (~2175 lines) calls `useWeekUnified(from,to)` (get-week is the
  sole calendar path), `fetchArcContext()` for the home line, and `useStrengthOrderingPreference`.
  `WorkoutCalendar` (~1452 lines) likewise reads `useWeekUnified` and renders per-cell abbreviations.
- **Inputs / outputs:** reads get-week (unified items), get-arc-context, user baselines (via
  AppContext direct `user_baselines` read at `AppContext.tsx:834`). Writes: `planned_workouts`
  update/insert directly (mark complete, skip, pool selection — `TodaysEffort.tsx:289`,`:505`,`:559`
  sweep), `validate-reschedule` + `planned_workouts` update/delete on reschedule (`WorkoutCalendar`
  sweep).
- **Triggers:** dashboard render; week navigation (`week:navigate` event).
- **Client-side math vs. server values:**
  - **Read from server:** unified items carry server-materialized `computed.steps` (durations,
    pace_range objects). `useWeekUnified` explicitly does NO client merging/matching (`useWeekUnified.ts`
    header comment) — adherence is never re-derived client-side. This honors the calendar invariant.
  - **Arc home line:** `buildArcLine()` (`src/lib/build-arc-line.ts`) formats phase + next-goal +
    weeks-out from the server arc-context; client does the `daysUntil()` date math and weeks rounding
    (`build-arc-line.ts:20`,`:56`). Server is documented to order `active_goals` by target_date.
  - **Week bounds:** Monday anchoring computed client-side (`startOfWeek`, `TodaysEffort.tsx:178`
    sweep; `WorkoutCalendar.tsx:47` sweep).
  - **Workout title:** `deriveWorkoutTitle()` (`src/lib/derive-workout-title.ts`) — single source of
    truth across TodaysEffort / PlannedWorkoutSummary / AllPlansInterface; priority chain (discipline →
    brick tag → `workout_structure.title` → materialized `name` → regex on tags/steps_preset/desc).
  - **Duration:** `resolveMovingSeconds()` resolver — for planned prefers `computed.total_duration_seconds`
    or sums `computed.steps[].seconds`; for completed prefers `overall.duration_s_moving` then falls
    back to metric fields / distance÷speed estimate (sweep). Then formatted MM:SS client-side.
  - **Completed-metric display math — FLAG (formatting/recompute):** `formatRichWorkoutDisplay()`
    computes run pace `(seconds/60)/(distance_m/1609.34)`, ride `mph = avg_speed_mps*2.237`, swim
    per-100 `seconds/(distance/100)`, elevation `m*3.28084` ft (`TodaysEffort.tsx:1000-1018` sweep)
    from server `overall` scalars. Strength `getMetrics()` sums `reps*weight` volume client-side
    (`:894-898` sweep).
  - **Calendar cell label:** `derivePlannedCellLabel()` — tag-first dispatch (brick/long_ride),
    bike always shows duration, OPT prefix for optional, swim distance chip (`WorkoutCalendar.tsx:130`
    sweep). Provider priority inference `deriveProvider()` (`:84` sweep). Day stacking via shared
    `orderDayWorkoutsByTimingThenDiscipline()` + `pairing-timing.ts`.

### Planned-workout views (PlannedWorkoutSummary / StructuredPlannedView / AllPlansInterface / SkipSessionReasonPanel)
- **What it does:** Render a single planned session's description/structure, the full plans list,
  and the skip-reason picker.
- **How it works:** `PlannedWorkoutSummary` builds a friendly subtitle from `workout_structure` +
  `rendered_description`; `StructuredPlannedView` renders `computed.steps` in detail;
  `AllPlansInterface` derives from `detailedPlans` (AppContext) and queries tables directly per the
  CLAUDE.md exception list.
- **Inputs / outputs:** reads context plans, `computed.steps`, `steps_preset` tokens. Writes:
  skip reason → `planned_workouts` (via `skip-session-reasons.ts` reasons list).
- **Triggers:** opening a planned workout / the Plans view.
- **Client-side math vs. server values:**
  - `PlannedWorkoutSummary.computeMinutes()` sums `computed.steps[].seconds` or estimates from
    `steps_preset`/distance÷pace (`:51-119` sweep); `computeSwimYards()` sums token `_NNNyd` suffixes
    or converts step meters (`:121-142` sweep). These read server-materialized steps (dumb-viewer),
    with a regex fallback only when steps are absent.
  - `StructuredPlannedView` decides pool display unit client-side from `pool_unit` → plan `units` →
    token regex → user `useImperial` (`:131` sweep); formats step durations/distances and pace/power
    ranges from `computed.steps` (`:118-222` sweep).
  - `AllPlansInterface.estimateMinutesFromSteps()` parses `steps_preset` `min` patterns for legacy
    plans lacking `computed.steps` (`:102` sweep).

### Workout execution (WorkoutExecutionView + workout-execution/*)
- **What it does:** Step-by-step guided execution (Pre-run → Execution → Post-run summary).
- **How it works:** `WorkoutExecutionView` calls `generateExecutionTemplate(computed)` and renders;
  receives `computed` + `baselines` as props from the parent.
- **Client-side math vs. server values:** title/duration/step rendering come from the template
  generator over server `computed`; no independent recompute observed (sweep). (Coverage here is
  shallower than the display surfaces — see honesty note.)

### Onboarding / Arc-setup / Goals / Season-plan wizards
- **What it does:** Capture athlete identity, build a season (races → intent → anchors → budget →
  strength → confirm), manage event goals, and build single-sport plans.
- **How it works:** `OnboardingProfilePage` confirms inferred identity. `ArcSetupWizard` (~3000
  lines) is a multi-step wizard that assembles an `ArcSetupPayload` and persists via
  `useArcSetupComplete` → `create-goal-and-materialize-plan`. `GoalsScreen` (~2000 lines) manages
  goals + a quick pace-calibration. `PlanWizard` is the single-sport `/plans/generate` builder.
- **Inputs / outputs:** read `user_baselines`, `athlete_snapshot`, `athlete_memory`, `goals`,
  `race_courses`, 90-day `workouts`, `extract-races`, get-arc-context. Write: `goals` rows +
  `training_prefs`, `user_baselines.performance_numbers` (calibration), `athlete_identity.confirmed`,
  race backfill via `complete-race`, `end-plan` for stale plans (sweep).
- **Triggers:** onboarding route, `/arc-setup`, `/goals`, `/plans/generate`.
- **Client-side math vs. server values (THE capture-side hotspot):**
  - **Effort Score / VDOT recompute — FLAG:** `src/lib/effort-score.ts` holds full VDOT and pace
    lookup tables + interpolation. `PlanWizard` uses `calculateEffortScoreResult()`/`getPacesFromScore()`
    for live preview; `GoalsScreen` quick-calibration embeds its OWN copy of VDOT_5K + PACE_BY_VDOT
    tables and interpolators (`GoalsScreen.tsx:1024-1099` sweep) and writes resulting paces back to
    `user_baselines.performance_numbers`. The same VDOT math exists server-side (shared
    `_shared/effort-score.ts`); `goal-target-time.ts`'s own header notes the course-strategy edge fn
    computes the same VDOT projection server-side. **Two independent embeddings of the table → drift risk.**
  - **Session-frequency defaults:** `src/lib/session-frequency-defaults.ts` is a client matrix lookup
    (hours-tier × days/week + limiter shifts) returning per-discipline weekly counts, with a
    `gate_block: 'hours_too_high_for_days'` for 14+hr/5-days (sweep). The server also derives session
    frequency in `create-goal-and-materialize-plan`.
  - **Weeks-out / days-until:** date arithmetic in the wizard payload assembly (`ArcSetupWizard` ~`:609`
    sweep) and `buildArcLine`.
  - **Fitness-tier inference:** `GoalsScreen` maps server `effort_score` (vDOT) to beginner/inter/advanced
    via hardcoded 33/45 thresholds, and `current_volume.run` mileage to tiers via 12/30 thresholds
    (`:502-512` sweep). Strength-protocol inference counts memory lifts >100 with confidence>0.2 and
    snapshot weeks with volume>0 (`:533-587` sweep).
  - **Race backfill:** `actualFinishSecondsPreferElapsed()` (`src/lib/race-finish-seconds.ts`) chooses
    elapsed-over-moving time from a workout row (sweep).
  - **Duration / pace / strength / power interpretation in `PlanSelect`** — see Builders below.

### Baselines / Athletic record / Gear
- **What it does:** Edit/view athlete baselines (HR zones, thresholds, paces, FTP, equipment);
  view completed-event athletic record; track shoe/bike mileage.
- **How it works:** `TrainingBaselines` (~2100 lines) reads/writes `user_baselines`,
  `athlete_snapshot`, `athlete_memory`, and the arc 5K-nudge. `AthleticRecordPage` reads completed
  `goals` + ride `workouts`. `Gear` reads/writes `gear` with a realtime subscription.
- **Client-side math vs. server values:**
  - **HR zones — client computes:** Friel zones from LTHR % bands and Karvonen from HRR
    (`TrainingBaselines.tsx:560-586` sweep), written to `user_baselines.configured_hr_zones` on save.
  - **Pace display:** learned paces stored sec/km converted to sec/mi for display (`*1.60934`,
    `:499` sweep) — the documented pace-unit footgun surface.
  - **FTP resolution — INCONSISTENCY FLAG:** `TrainingBaselines` uses a plain `manual || learned`
    precedence (`:1246-1250` sweep), while `AthleticRecordPage` (and the canonical
    `src/lib/resolve-current-ftp.ts`) use confidence-gated learned-first precedence. Two different
    answers for "current FTP" depending on screen.
  - **5K nudge:** `should_prompt` is a server signal; client renders the prompt and writes a
    dismissal key to `user_baselines.dismissed_suggestions.five_k_nudge` (sweep).
  - `AthleticRecordPage`: `resolveCurrentFtp()` + longest-ride aggregation `max(elapsed|moving)` over
    ride rows client-side (`:141-151` sweep).

### Course strategy (CourseStrategyModal)
- **What it does:** Display elevation profile + per-segment race strategy (effort zones, pace/HR cues).
- **Client-side math vs. server values:** segments/zones/pace ranges come from the
  `course-detail` edge payload. Client does elevation **interpolation** for segment boundaries and
  unit conversion (m→mi, m→ft) for the chart (`CourseStrategyModal.tsx:29-164` sweep). Strategy
  generation itself is server-side (`course-strategy`).

### Connections / OAuth / import (Connections + Garmin/Strava/AppleHealth + FitFileImporter)
- **What it does:** Connect Strava/Garmin/Apple Health, manage source preference + swim override,
  import history, parse local FIT files.
- **How it works:** `Connections` is OAuth/state glue (popups, localStorage/sessionStorage tokens,
  webhook subscribe/unsubscribe). `Garmin/StravaPreview` delegate metric detection to services and
  let the user select which detected baselines to apply. `FitFileImporter` parses FIT binaries in-browser.
- **Inputs / outputs:** reads `users.preferences`, `device_connections`, `user_connections`,
  `garmin_activities`. Writes: preference rows; invokes `strava-webhook-manager`,
  `import-strava-history`, `disconnect-connection`, `bright-service`/`swift-task` (Garmin),
  `ingest-activity` (HealthKit swims).
- **Client-side math vs. server values:**
  - `Connections` has **no numeric math** — date formatting only; source preference read/written as-is (sweep).
  - `Garmin/StravaPreview` strip numeric values out of detected-metric strings ("250W"→250) for the
    apply payload (`GarminPreview.tsx:308-319`, `StravaPreview.tsx:109` sweep) — extraction, not recompute.
  - **`FitFileImporter` — all extraction is client-side** from the FIT binary: duration, distance,
    elevation (note `total_ascent` is stored in km, multiplied ×1000 → meters, `:256` sweep),
    intensity_factor 0-1→% (`:308` sweep), HR/power/speed/cadence/TSS/temp/VAM (`:180-353` sweep).
    No DB write — returns `ImportedWorkout[]` to `AppLayout` which then invokes server save/workload.

### Plan builders / catalog / admin (PlanSelect / PlanBuilder / interval builders / PlansCatalog / PlansAdminImport / PTPlanBuilderPage / WorkloadAdmin)
- **What it does:** Interpret a library plan against the athlete's baselines (`PlanSelect`), build
  custom workouts (interval builders), import/publish library plans (admin), build mobility plans.
- **Client-side math vs. server values (builders are expected to compute):**
  - **`PlanSelect` is a plan interpreter with HARDCODED training-science constants — FLAG:** week
    count from user dates (Monday-aligned) (`:429-452` sweep); pace token substitution + offset math
    with hardcoded zone offsets (threshold +35 sec/mi, tempo +45) (`:620-637` sweep); tolerance bands
    ±4% intervals / ±6% easy (`:657` sweep); strength accessory ratios (bench→row 0.90, etc.)
    (`:667-688` sweep); bike power ranges as FTP fractions (VO2 1.06-1.20, threshold 0.95-1.00, SS
    0.88-0.94, Z2 0.60-0.75) (`:718` sweep); duration-from-description, with `duration = 0` fallback
    when pace is missing (`:720-780` sweep). None of these constants has a server source on this path.
  - **Interval builders** (`Run/Ride/SwimIntervalBuilder`, `WorkoutBuilder`): time→seconds parsing,
    total-duration summation, repeat-block multiplication; pace/power/RPE targets are **free-text user
    input**, not computed (sweep). `WorkoutBuilder` pool default 25yd=22.86m hardcoded (`:176-188` sweep).
  - **`StrengthExerciseBuilder`** displays `% of 1RM = weight/oneRepMax*100` (`:69-72` sweep); weights
    are manual entry (no auto-fetch from baselines).
  - **`PTPlanBuilderPage`** is a large deterministic regex parser of free-text mobility exercises +
    recurrence expansion (`:35-419` sweep); no training math.
  - **`PlanJSONImport`** does DSL macro/token expansion + discipline inference; `WorkloadAdmin` invokes
    backfill/recompute edge fns with offset pagination (no math). Admin pages gate on `useAppAdmin()`.

## Edge cases & conditional handling

- **Auth gate states:** Loading spinner while `sessionResolving` (`AuthWrapper.tsx:155`); login/register
  toggle when `!user` (`:163`); "pending approval" only when row exists and `approved===false`
  (`:178`); "can't verify" on `error`/`null` with retry (`:201`). Missing-row / transport failure
  returns `null` → error UI, NOT "pending" (`:56-69`) — deliberate so a network blip is not read as denial.
- **Approval check generation guard:** `checkGeneration` ref discards stale async results across
  auth-state changes (`AuthWrapper.tsx:84`,`:102`,`:114`).
- **Strength-logger reopen AND-gate (D-109):** reopen requires BOTH `strength_logger_open==='1'` AND
  today's session key non-empty; yesterday's orphaned key lives under a different date key so day
  rollover prevents stale reopen (`AppLayout.tsx:55-165`).
- **Feedback popup:** only run/ride/swim (`isFeedbackType`, `AppLayout.tsx:193`); only completed,
  no RPE, not dismissed, within 7 days (`:528-535`); realtime INSERT/UPDATE fast-path plus
  server-authoritative `check-feedback-needed`; `feedbackShownIdsRef` prevents dup popups (`:429`).
- **State panel empty states:** aimless state when no plan/goal/race (server `empty_state` else
  hardcoded fallback, `StateTab.tsx:1131-1135` sweep); LOAD "—" when ACWR null (`LoadBar.tsx:72` sweep);
  RACE "Can't project a finish time yet" when no model+goal (`StateTab.tsx:417` sweep); strength
  "no data" when `perLift.length===0` (`:1431` sweep); readiness only when check-in present (`:1338` sweep).
- **Discipline conditional rendering:** `CompletedTab` shows power/cadence/elevation/VAM cards and
  GPS map conditionally by type and `gps_track` presence (D-159 swim detection) (sweep);
  `StatePerformanceSection` flags swim as provisional pending Q-038 (`:64`,`:90` sweep);
  `StructuredPlannedView` branches run/ride/swim/strength for step formatting (sweep).
- **Unit conversions:** sec/km↔sec/mi (`*1.60934`) in `useWorkoutData`, `TrainingBaselines`,
  `effort-score.pacesToKm`; m→ft (`*3.28084`) and m/s→mph (`*2.237`) in `TodaysEffort`/`FitFileImporter`;
  FIT `total_ascent` km→m (×1000); pool yd↔m (25yd=22.86m).
- **Missing-data fallbacks:** `resolveMovingSeconds` multi-tier (steps → totals → metrics →
  distance÷speed) returns null → "N/A" (sweep); `useWeekUnified` `weeklyStats` defaults `{planned:0,
  completed:0}` (`useWeekUnified.ts:70`); `PlanSelect` duration falls to 0 when pace absent (sweep);
  swim pool metadata fallback chain `pool_length_m → swim_data.lengths → race-distance estimate` (sweep).
- **Loading vs placeholder:** `useWeekUnified` distinguishes real-loading from prior-week placeholder
  via `keepPreviousData` + `isPlaceholderData` to avoid flicker (`useWeekUnified.ts:72-77`).
- **Reschedule:** `WorkoutCalendar` calls `validate-reschedule` before moving and may delete conflicts
  (sweep); `RescheduleValidationPopup` surfaces the result.
- **Deep links:** `/goals`, `/profile/athletic-record`, `?openPlans/focusPlanId/focusWeek/showCompleted`
  route into `AppLayout` view flags and clear route state to avoid re-open on back (`AppLayout.tsx:660-703`).
- **OAuth edge cases:** Safari same-tab vs Chrome/Firefox popup; Garmin PKCE verifier in sessionStorage;
  Apple Health iOS-only gate `Capacitor.getPlatform()==='ios'`; post-disconnect webhook re-verify (sweep).
- **Wizard gates:** 14+hr/5-days returns `gate_block` (session-frequency-defaults); `PlanWizard`
  marathon-beginner low-mileage duration warnings high_risk/caution (`:198-279` sweep); day-count-gate
  (`src/lib/day-count-gate.ts`) caps preferred-day selection.

## Redundancies / duplication (observed, not judged)

- **VDOT/pace tables embedded twice client-side:** `src/lib/effort-score.ts` and an independent inline
  copy in `GoalsScreen.tsx:1024-1099` (sweep), plus a third server copy in `_shared/effort-score.ts`.
- **FTP resolution divergence:** `resolve-current-ftp.ts` (confidence-gated, used by `AthleticRecordPage`)
  vs `TrainingBaselines.tsx:1246-1250` plain `manual||learned` (sweep) — same question, two code paths,
  different answers.
- **D-160 verdict re-sign appears in ≥2 places:** `StatePerformanceSection.verdictSignedPct` (`:23-28`
  sweep) and `MobileSummary` (`:33-35` sweep).
- **`state_trends_v1` computed in two ways:** `useStateTrends` re-fetches raw rows and re-runs
  `assembleStateTrends` client-side rather than reading the cached `athlete_snapshot.state_trends_v1`.
  This is intentional single-source (same `@shared/state-trend` function client + server, see file
  header) so verdicts cannot drift — but it IS a second execution of the assembly + extra table reads.
- **Mobility→strength conversion parser duplicated** across three sites in `AppLayout` (`:270-348`,
  `:1206`, `:1296`).
- **Pace/duration formatting helpers** (`formatTime`/`formatPace`) reimplemented in `WorkoutMetrics`,
  `effort-score.ts`, `TodaysEffort` rich-display, and others rather than one shared formatter.
- **Strength volume `reps*weight`** summed independently in `StrengthCompletedView`,
  `StrengthPerformanceSummary`, and `TodaysEffort.getMetrics` (sweep).

## Discrepancies & flags (for human review)

1. **Client recomputes server-provided values on display surfaces** (the smart-server/dumb-client
   tension, concrete instances): `StateTab` e1rm_pct (`:1438` sweep); `useWorkoutData` pace fallbacks
   (`:66-109` sweep); strength volume/comparison (`StrengthCompletedView`/`StrengthPerformanceSummary`
   sweep); `TodaysEffort.formatRichWorkoutDisplay` pace/speed/per-100 (`:1000-1018` sweep). Whether
   these are "recompute" vs "defensive fallback when the server field is absent/stale" varies per case —
   `useWorkoutData` and `mergeSessionDetailRaceReadiness` are explicitly defensive (D-166); `e1rm_pct`
   and strength volume look like pure recompute. Human should decide which to push server-side.
2. **VDOT table drift risk:** three independent embeddings of the VDOT/pace tables (effort-score.ts,
   inline GoalsScreen, server shared). A change to one is not propagated to the others.
3. **FTP precedence inconsistency:** `TrainingBaselines` can show a low-confidence manual FTP while
   other screens show a high-confidence learned FTP for the same athlete (sweep) — user-visible mismatch.
4. **Hardcoded training-science constants in `PlanSelect`** (pace offsets, tolerance bands, accessory
   ratios, FTP power fractions) with no server source on that path (sweep). If the engine's zones change
   server-side, this interpreter path silently diverges. Also: silent `duration = 0` when pace missing.
5. **Direct table reads outside get-week:** the feedback path in `AppLayout` and several capture screens
   read `workouts`/`planned_workouts` directly. CLAUDE.md enumerates these as allowed exceptions (the
   calendar invariant is specifically "never re-derive adherence / never merge the two tables for the
   calendar"), and the read surfaces honor that — but the direct reads are worth confirming against the
   enumerated exception list as new ones may have been added (e.g. `StateTab` reading `goals`/`race_courses`).
6. **`feedbackWorkout` type cast** sets `type` as `'run'|'ride'|'swim'` from a string in several places
   but the realtime/general paths still carry comments referencing only run/ride — minor; verify swim
   coverage (D-162) is consistent across all four set-sites in `AppLayout`.
7. **AppLayout disabled code path:** the `loadProviderData` effect is hard-gated `false &&` (`:387`) —
   dead-but-present; trigger condition unclear/intentional. Listed, not acted on.
8. **`suggestBaselineUpdate` imported but invocation not located** in `AthleticRecordPage` (sweep) —
   reachable-but-possibly-unused; verify.

## Cross-references

- **Existing screen docs to reconcile (mostly consistent with this map):**
  `docs/SMART_SERVER_DUMB_CLIENT_AUDIT.md`, `docs/PERFORMANCE_SCREEN_AUDIT.md`,
  `docs/SPEC-state-screen-v2-performance.md`, `docs/PERF-COMPARISON-POOL-SPEC.md`,
  `docs/WIZARD-AUDIT.md`, `docs/SPEC-state-headline.md`, `docs/APP-FLOW.md`.
- **Engine/decisions:** `docs/ENGINE-STATE.md` (run-title divergence now resolved by
  `derive-workout-title.ts`); `docs/DECISIONS-LOG.md` D-094 (reps-range/qualitative weight), D-109
  (strength-logger AND-gate), D-159 (swim GPS detection), D-160 (verdict-signed pct), D-162 (swim
  feedback), D-166 (swim scalar-truth pace), D-173/D-174 (swim source / manual swim). Verify exact
  D-NNN numbers against the log before citing.
- **Open questions:** Q-038 (swim provisional flag in `StatePerformanceSection`).
- **Other audit areas:** server contracts in `05-compute-contracts.md` (`session_detail_v1`, get-week,
  resolvers); spine/state-trend in `03-spine-snapshot.md` (`assembleStateTrends`, `state_trends_v1`);
  baselines origin in `07-baselines.md` (FTP/HR/learned-fitness); planning in `04-planning.md`
  (create-goal-and-materialize-plan, session-frequency on server).
- **Contracts in code:** `supabase/functions/_shared/session-detail/types.ts` + `build.ts`;
  `_shared/state-trend`; `_shared/arc-context.ts`; `src/lib/load-headline.ts`, `effort-score.ts`,
  `build-arc-line.ts`, `derive-workout-title.ts`, `resolve-current-ftp.ts`, `goal-target-time.ts`,
  `session-frequency-defaults.ts`.

---

### Coverage honesty note
Fully mapped: app shell/auth, State panel, workout-detail/Performance/Details, Home + calendar,
planned views, onboarding/Arc-setup/Goals, baselines/record/gear, Connections/import, plan
interpreter (`PlanSelect`) and interval builders — with the client-side-math inventory as the
priority output. Independently re-read by me: `AuthWrapper`, `ContextTabs`, `AppLayout` (first
~1346 lines), `useWeekUnified`, `useStateTrends`, and the flagged lib math files (`effort-score`,
`load-headline`, `build-arc-line`, `derive-workout-title`, `resolve-current-ftp`, `goal-target-time`).
Component-internal line cites tagged `(sweep)` come from parallel `Explore` agents reading excerpts,
not full independent re-reads — high confidence on the value-flow conclusions, but specific line
numbers in the 1500-3000-line components (`StateTab`, `ArcSetupWizard`, `GoalsScreen`, `TodaysEffort`,
`WorkoutCalendar`, `PlanSelect`) should be spot-verified before being quoted as exact. Shallower
coverage: `WorkoutExecutionView`/`workout-execution/*` (template path noted but not exhaustively
traced) and the chart sub-components (`CleanElevationChart`, `HRZoneChart`, `PowerZoneChart`,
`EffortsViewerMapbox`) which were treated as leaf renderers. The "client recomputes a server value"
vs "defensive fallback" distinction in flag #1 is the judgment call most worth a human pass.

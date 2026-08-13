# AUDIT — plan navigation + client wasteland census (2026-08-13)

**Read-only. Nothing was edited, deleted, or fixed.** Companion to
`AUDIT-plan-generators-2026-08-07.md` (server side). That audit mapped the generators; this one maps
the CLIENT — every screen, route, and button by which a plan gets built or opened, marked LIVE or
RUIN, plus the root cause of the weekly-planner landing bug.

**Method.** Two parallel read-only traces over `src/` + `supabase/functions/`: (1) the live
navigation graph from every build entry point to its landing; (2) a zero-importer / unreachable-route
census. The landing-bug mechanism (§1) was then **verified by direct read** of `AppLayout.tsx` —
it is a finding, not a hypothesis. Census claims in §4–§5 are single-trace; spot-verify the specific
file before cutting it.

---

## 1. THE LANDING BUG — root cause found: `showGoals` is never cleared

**Symptom (banner, multiple sessions):** a finished build does not land on the weekly planner at
week 1. Prior fixes kept "not working" because they were aimed at the navigation state — which is
actually arriving correctly. The screen that renders is decided elsewhere.

**Mechanism, verified line by line:**

1. The wizard hand-off navigates to `/goals`. The deep-link effect `AppLayout.tsx:729-733` sets
   `showGoals = true`. **It has no else branch — leaving `/goals` never clears it.**
2. GoalsScreen's landing effect fires `onOpenBuiltPlan` → `AppLayout.tsx:1573-1580` →
   `navigate('/', { state: { openPlans: true, focusPlanId, focusWeek: 1 } })`.
   **It never calls `setShowGoals(false)`.**
3. The `openPlans` effect `AppLayout.tsx:712-726` duly sets `showAllPlans = true`, `focusPlanId`,
   `focusWeek` — all correct.
4. But the render chain is one ternary and **`showGoals` (`AppLayout.tsx:1558`) is checked BEFORE
   `showAllPlans` (`:1594`)**. `showGoals` is still true, so the Focus screen renders and the
   planner — fully armed underneath — never appears.

**Why the comment at `:1575` ("same pattern as PlanSelect") is the trap:** PlanSelect navigates from
`/plans/select`, where `showGoals` was never set. The pattern only works for callers not sitting on
`/goals`. The two sibling handlers prove the omission: `onSelectPlan` (`:1563-1566`) and
`onGoToSchedule` (via `handleBackToDashboard`, clears at `:1095`) both clear `showGoals` first.

**Fix shape (not applied):** clear `showGoals` when the planner is being opened — either in
`onOpenBuiltPlan` itself, or more robustly in the `openPlans` effect (`:714`) so every caller of the
`openPlans` route-state is covered. One to two lines.

**Secondary risks on the same chain (real, but not the blocker):**
- `builtPlanId` null → GoalsScreen `:492-493` silently falls back to `onGoToSchedule` (Home
  calendar). `create-goal-and-materialize-plan` returns `plan_id: null` on the preview path.
- `AllPlansInterface` auto-open (`:1202-1218`) is one-shot (`hasAutoOpenedRef`) and requires
  `detailedPlans[focusPlanId]` populated; `refreshPlans()` is fired un-awaited. Deps re-fire covers
  it, but it is fragile.

---

## 2. THE LIVE MAP — seven build entrances, five landing behaviours

The fragmentation Michael describes is real and measurable: **four separate landing mechanisms**
(`onOpenBuiltPlan` / `onGoToSchedule` / `setArcPlanReady` / raw `navigate`) for the same event.

| # | Entrance | Chain | Lands | focusWeek |
|---|---|---|---|---|
| a | **Strong Focus** (Focus → Train) | GoalsScreen `:2490` → embedded `NonRaceBuilder` (`entry` prop) → `:1901` `complete()` → `useArcSetupComplete:244` (`build_existing`) → navigate `/goals` `+builtPlanId` → GoalsScreen `:492` `onOpenBuiltPlan` | planner wk 1 **(blocked by §1)** | 1 |
| b | **Marathon** (Focus → Race) | identical chain — same builder, `state.goal === 'marathon'` | same | 1 |
| b′ | Build from a saved goal card | GoalsScreen `:1238` → `:1251` invoke → `:1275` `onGoToSchedule()` | **Home calendar** | — |
| c | GoalsScreen inline event form | `:1472` invoke → `:1485` `onOpenBuiltPlan` | planner wk 1 (§1) | 1 |
| d | Season build (combined) | `:1311` invoke → `:1334` `onOpenBuiltPlan`, else on-card badge | planner wk 1 or stays on Focus | 1 |
| d′ | Arc season wizard (`/arc-setup`) | `useArcSetupComplete` with `announcePlanReady: true` → GoalsScreen `:450` banner → user taps "View training calendar" | Focus + manual tap | — |
| e | **PlanWizard** `/plans/generate` | `PlanWizard:868` invokes `generate-run-plan` DIRECTLY — no goal row, no create-goal, writes `plans` itself, `activate-plan`, then `:941` navigate after 500 ms timer | planner, **week unset** | absent |
| f | Plan library catalog | `PlanSelect:1138` `activate-plan` → `:1179` | planner wk 1 | 1 |

⚠ **The canonical paths (a) and (b) are ONE chain.** Strong Focus and marathon differ only by
`state.goal` inside `NonRaceBuilder`. Any fix on `useArcSetupComplete` → GoalsScreen landing →
`onOpenBuiltPlan` covers both. Paths (c)/(d)/(b′) are the GoalsScreen-form family — the wrong place
the last session's first fix landed.

⚠ **PlanWizard (e) is a live bypass** reachable from GoalsScreen `:2586` ("Build a custom plan"):
it skips the entire goal lifecycle. Flagged in the 2026-08-07 audit §1; still live.

**Route table (src/App.tsx:42-58):** live: `/` `/goals` `/plans/admin` `/plans/catalog`
`/plans/generate` `/arc-setup` `/baselines`. **Orphans: `/plans/select`** (only inbound link is a
dead-branch `<a>` in `PlanCatalog.tsx:78`) **and `/goals/build`** (`NonRaceBuilderPage` — zero
navigators; GoalsScreen `:370`'s own comment says the embedded builder replaced it).
`/plans/build` + `/plans/pt` are transitively unreachable (§4.6–4.7).

**Nav-state flags (writers → readers):** `openPlans`/`focusPlanId`/`focusWeek`/`showCompleted`
written by AppLayout `:1579`, PlansMenu, PlansDropdown, PlanWizard `:941`, PlanSelect `:1179,:1246`;
read only by AppLayout `:201-204` + `:712-726`. `announcePlanReady`/`builtPlanId`/
`seasonPlanJustBuilt`/`fromArcSetup`/`needPaceCalibration`/`schedule_signals` written by
`useArcSetupComplete:293-302` (+ `useConflictResolutionLoop`); read by GoalsScreen `:424-495`.
There is no `openGoals` flag — `/goals` is a pathname deep-link.

---

## 3. Corrections to the prior audits

- The six dead generator classes and `generate-plan/` + `generate-training-context/` from
  AUDIT-plan-generators §7 are **ALREADY DELETED** from disk. That audit's quarantine list is
  partially actioned; its §3.5/§3.6 trap tables are now history.
- `generate-overall-context` is still present (550 lines) and its orphan status is now
  double-confirmed: its only caller `useOverallContext.ts` has zero importers.

---

## 4. THE WASTELAND — ranked census (single-trace; verify before cutting)

### Tier 1 — a whole dead pathway: client-side "library plan" bake/materialize (~4,300 LOC)

The third plan pipeline. `PlanSelect.tsx` (1,498 ln) materializes plans **in the browser** —
imports `composeTri`, `plan_dsl`, `augmentPlan`, writes `plans` directly, calls `activate-plan` —
bypassing create-goal AND materialize-plan. Its route is orphaned (§2). The cluster:

| File | LOC | Status |
|---|---|---|
| `src/pages/PlanSelect.tsx` | 1,498 | orphan route; dead-branch root |
| `src/services/plans/tools/plan_bake_and_compute.ts` | 1,097 | importers: PlanSelect (dead) + a never-called import in `AppContext.tsx:6` |
| `src/components/PlanCatalog.tsx` + `src/pages/PlansCatalog.tsx` + `PlanJSONImport.tsx` + `PlansAdminImport.tsx` + `LibraryPlans.ts` + `UniversalPlanValidator.ts` + `plan_dsl.ts` + `composeTri.ts` | ~1,070 | admin `library_plans` catalog — technically reachable via GoalsScreen `:2587` "Browse plan library" + `WorkoutBuilder:516`, but light-mode styled (pre-galaxy), raw `confirm()`/`alert()` |
| `src/services/plans/BundleLoader.ts` + `public/plans.v1.0.0/` (9 JSON) + 4 schema files | ~83+ | **dead by default flag**: `AppContext.tsx:239` `DEFER_BUNDLE` defaults true → `loadPlansBundle` never runs; outputs have zero readers |
| `scripts/bake-all.mjs` `bake-one.mjs` `plan-minify.mjs` | 125 | zero `*.baked.json` exist anywhere — pipeline never produced a live artifact |

**Bonus rot:** `package.json:15` `plan:validate` points at `scripts/validate-plan.mjs` which
**does not exist** — `npm run plan:validate` is a hard error (CLAUDE.md still advertises it).

### Tier 2 — unreachable routes and unrendered menus (~1,000 LOC)

- `src/pages/PlansBuild.tsx` (71) — `/plans/build`; only navigators are PlansMenu/PlansDropdown
  (below). **Uses `<Button>` without importing it** — would throw ReferenceError on first render;
  proof nobody has ever loaded it.
- `src/pages/PTPlanBuilderPage.tsx` (574) — `/plans/pt`; only inbound is PlansBuild `:45`.
  Transitively unreachable. TRAP: mounted in App.tsx under alias `MobilityPlanBuilderPage`.
- `src/components/PlansMenu.tsx` (192) + `PlansDropdown.tsx` (149) — imported by AppLayout but
  **zero JSX render sites repo-wide**. Duplicates of each other; the sole keep-alive for
  `/plans/build`. Vestigial `plansMenuOpen` state at AppLayout `:228`.
- `src/pages/NonRaceBuilderPage.tsx` (21) — orphan route wrapper. ⚠ **TRAP: wraps the LIVE
  `NonRaceBuilder.tsx` (4,506 ln). Delete the page, never the component.**
- `src/components/PlanBuilder.tsx` (22) — shell over PlanJSONImport + PlanCatalog; sole live
  trigger `WorkoutBuilder.tsx:516` ("Build me a plan") drops the user into the light-mode admin
  catalog. TRAP: name-adjacent to PlanWizard / NonRaceBuilder.

### Tier 3 — zero-importer orphans (plan-adjacent; 17 orphan files repo-wide)

- `src/components/non-race/non-race-intake-steps.tsx` (259) + `src/lib/non-race-intake.ts` (141,
  imported only by the orphan + its test). ⚠ TRAP: NonRaceBuilder has its own live inline steps.
- `src/hooks/useOverallContext.ts` (167) — with it, edge fn `generate-overall-context` (550).
- `src/components/context/CoachWeekTab.tsx` (1,151) — biggest single orphan in src/.
- `src/types/planRelayoutBanner.ts` (11).
- Adjacent-domain zero-importers: `useAthleteSnapshot.ts` (79), `StrengthAdjustmentModal.tsx`
  (216), `swim-source-tier.ts` (71), `ui/popover.tsx` (29). (`native-fetch-shim.ts` flagged
  zero-importer but it is a **vite alias target** — NOT dead, do not cut.)
- Imported-but-never-rendered: `NewEffortDropdown.tsx` (105), `LogEffortDropdown.tsx` (92),
  `AllEffortsDropdown.tsx` (124) — all imported at AppLayout `:16-18`, zero render sites.

### Tier 4 — edge functions with zero invokers (beyond the known list)

Plan/goal-relevant: `arc-setup-chat/` (246 — the wizard invokes only `extract-races`),
`readiness/` (86). Others (not plan-scoped, listed for completeness): `detect-cores`,
`restore-gps-track`, `enrich-history`, `reingest-activity`, `import-connect-history`,
`backfill-planned-workload`, `backfill-facts`, `backfill-routes`, `strava-refresh`,
`process-workouts-batch`, `backfill-week-summaries`, `analyze-user-profile`, `save-location`,
`backfill-strength-load`. ⚠ `garmin-webhook-activities` is externally triggered — zero client
callers is NOT evidence of death for webhooks; same caution for any backfill run by hand.

**Live-code bug found in passing:** `Connections.tsx:495` invokes `'disconect-connection'`
(missing n) as a fallback after the correctly-spelled call at `:487` — the fallback can only 404.

---

## 5. Demolition order (proposed — GATED, nothing actioned)

1. Fix §1 (the one-liner) and verify on device — before any deletion, so the cut isn't blamed.
2. Isolated, no-risk: `PlansBuild.tsx`, `PTPlanBuilderPage.tsx`, `PlansMenu.tsx`,
   `PlansDropdown.tsx` + the `/plans/build` `/plans/pt` routes (~986 LOC).
3. Unrendered dropdowns + `PlanBuilder` trigger (~350 LOC).
4. `NonRaceBuilderPage.tsx` + `/goals/build` route + `non-race-intake-steps.tsx` +
   `non-race-intake.ts` (~421 LOC).
5. Orphan hooks/types (+ `generate-overall-context` edge fn) (~2,100 LOC).
6. The big one, Michael's call: cut "Browse plan library" (GoalsScreen `:2587`) + the
   `WorkoutBuilder:516` trigger → strands ALL of Tier 1 (~4,300 LOC + public JSON + 3 scripts +
   2 npm entries) for deletion in one pass. Also decides `/plans/select` + `/plans/admin`
   (WorkloadAdmin re-associate lives there — keep the admin, or rehome it).
7. Separate decision: PlanWizard `/plans/generate` — live, reachable, but bypasses the goal
   lifecycle. Retire it or make it call create-goal. Leaving it is how a "lost plan with no goal"
   gets minted.

# SPEC — planned-session read-model consolidation

> ⛔ **TEMPORARY. THIS FILE DIES WHEN STAGE 4 SHIPS.** Per the spec lifecycle in `CLAUDE.md`: a SPEC
> is a build contract, not a record. When the last stage lands, fold the substance into a `D-NNN` and
> **delete this file**. If only some stages ship, leave this holding *only* the unbuilt remainder.
>
> Opened 2026-08-09. Owner: the consolidation work below. Stage 0 shipped; stages 1–4 open.

---

## Why this exists

A planned session is represented several ways, and they drift. This is not theoretical — every bug in
the discipline-swap work of 2026-08-08/09 was an instance of it:

- The swap gate read the root duration; the row printed the steps-sum. Card showed `63:00`, gate
  computed `0`, and the control vanished **on one surface only**.
- The posture map keys the bike as `bike`; the swap's vocabulary says `ride`. The gate read
  `posture['ride']` — always `undefined` — so a **develop** bike was offered a swap it should never
  have been offered.
- A duplicate session appeared on the calendar because `get-week`'s membership key included `type`,
  and `type` stopped being immutable the day the swap shipped.

Each was fixed at its own call site. The class was not fixed. **The unit tests were green through all
of it**, because they tested the readers against row shapes the app does not actually produce.

---

## 1. DURATION — four readers, three answers

| reader | file | reads, in order | on nothing |
|---|---|---|---|
| `resolvePlannedDurationMinutes` | `src/utils/resolvePlannedDuration.ts` | root `total_duration_seconds` **only** | `null` — "no fallbacks", deliberate |
| `resolveMovingSeconds` | `src/utils/resolveMovingSeconds.ts` | root total → `computed.total_duration_seconds` → **sum `computed.steps[].seconds`** → sum `intervals` | `null` |
| `computeMinutes` | `src/components/PlannedWorkoutSummary.tsx:63` (private) | recompute from `computed.steps`, then fall back | `null` |
| `resolveMinutes` | `src/lib/session-discipline-swap.ts` | delegates to `resolveMovingSeconds`, then `duration` | `0` |

Plus inline reads at `AllPlansInterface.tsx:723` and `services/watchConnectivity.ts:144`.

**Authoritative: `resolveMovingSeconds`.** It is the only reader that sees all four storage locations,
and it is what the surfaces the athlete actually looks at print with. The others are narrower views of
the same fact — which is exactly why they disagree.

⚠️ `resolvePlannedDurationMinutes`'s null-on-nothing contract is **deliberate and must survive**: it
feeds a displayed badge, and a wrong duration on screen is a lie. It may become a wrapper; it may not
gain fallbacks.

⛔ **`resolveMovingSeconds` IS TWO READERS IN ONE, keyed on `workout_status`** — found while building
the stage-0 fixtures. Its planned branch is the four-priority ladder above; a **completed** row takes a
different branch entirely (`moving_time`, `total_elapsed_time`, `metrics.*`). So it is not a "planned
duration" reader, it is "this session's duration, whatever kind of session it is".

Consequence for the target: `plannedDurationSeconds()` should own **only the planned branch**, and the
completed branch stays where it is. Collapsing both into one accessor would put executed-time logic
behind a planned-session name — a fresh version of the same confusion this SPEC exists to end.

---

## 2. DISCIPLINE — two vocabularies, three unknown-handlers

| normalizer | file | emits bike as | unknown → |
|---|---|---|---|
| `disciplineOf` | `_shared/state-trend/assemble.ts:167` | **`bike`** | `null` |
| `normDisc` | `coach/index.ts:5503` | `ride` | `null` |
| `sportSubtype` | `auto-attach-planned/index.ts:16` | `ride` | **`run`** ⚠ |
| `normalizeSportType` | `AssociatePlannedDialog.tsx:23` | `ride` | **`run`** ⚠ |
| `disciplineOf` | `src/lib/session-discipline-swap.ts:93` | `ride` | `null` |
| `normalizeSport` | `src/lib/associate-candidates.ts:51` | `ride` | passthrough |

Three more vocabularies exist that are not normalizers and are **not** in scope to change:

- `planned_workouts.type` — `run | ride | swim | strength | mobility | pilates_yoga | walk`
- `per_discipline_posture` keys — `run | `**`bike`**` | swim | strength`
- `MatrixSessionKind` — `easy_run | quality_bike | long_ride | lower_body_strength | …`

**Two live defects:**

1. **`bike` vs `ride`.** Already caused a develop-bike to be offered a swap. `state-trend` sits on the
   `bike` side; everything else on `ride`.
2. **Unknown → `run`.** Two normalizers silently call an unrecognised type a run;
   `auto-attach-planned:32` logs it before doing it. A mis-attachment waiting to happen.

**Target:** canonical `run | ride | swim | strength` — `ride`, because five of six normalizers and the
DB column already use it. ONE `normalizeDiscipline()` returning **`null` on unknown, never `run`**.
Translation lives at exactly two named boundaries: `postureKey(d)` (`ride → bike`) and the existing
`matrixKindFor(d, band)`.

---

## 3. ROW SHAPE — two mappers that must stay in sync and do not

| shape | built by | consumed by |
|---|---|---|
| raw `planned_workouts` row | `get-week` select (`:447`) — **no `duration` column** | server only |
| **server** mapped row | `get-week:1489 toPlannedWorkout` | wins wherever present |
| **client** mapped row | `src/utils/workout-mappers.ts:17 mapUnifiedItemToPlanned` | fallback only |
| `session_detail_v1` | `workout-detail` | completed views (6 components) — **out of scope** |

Every surface reads `it?.planned_workout ?? mapUnifiedItemToPlanned(it)`. The server's copy wins; the
client's is a shadow of it. **Both omit `duration`.**

⚠️ **A correction worth keeping**: it was previously stated that the calendar reads a raw row and only
Today's card reads a mapped one. That is **false** — `WorkoutCalendar:544` maps too, and `_src` holds a
mapped row. All four surfaces consume the same object; they disagree only about how to *read* it.

`session_detail_v1` is a different concern (completed sessions, pre-formatted for display) and stays
separate.

---

## 4. The target read-model

`PlannedSessionView` — the server mapper's shape **plus `duration`**, built once on the server in
`get-week`. The client mapper is **deleted**, not fixed.

Accessors, one each, in `src/lib/planned-session/`:

| accessor | replaces |
|---|---|
| `plannedDurationSeconds()` | `resolveMovingSeconds`, `computeMinutes`, 2 inline reads |
| `plannedDiscipline()` | the 4 client normalizers |
| `plannedIntensityBand()` | `intensityOf` (currently in the swap lib) |
| `plannedTitle()` | **already consolidated** (`deriveWorkoutTitle`) — leave alone |

---

## 5. Stages

Each stage ships and is verifiable alone. Order is by blast radius, lowest first.

### Stage 0 — pin current behaviour ✅ SHIPPED 2026-08-09

Golden fixtures capturing what every reader returns for **12** real row shapes. **No behaviour
change.** `src/lib/planned-session-golden.test.ts` — 10 tests, 12 shapes, 5 readers.

Shapes: steps-only · stored root total · `computed.total` only · intervals-only · long run · long ride
· swim · strength · swapped (with origin tag) · completed · no-duration-anywhere · `bike` spelling.

**Two** drifts are pinned as ⚠️ DRIFT assertions — statements of today's reality, each carrying what it
must become:

1. the two duration readers disagree on **3 of 12** shapes (A, C, D — steps-only, `computed.total`-only,
   intervals-only), which is the exact family that hid the swap glyph;
2. unknown disciplines are handled **three** ways (`null` / passthrough / `'run'`).

⚠️ **The `bike`/`ride` split is NOT pinned here, and that is a real coverage gap.** The client-side
half was already fixed (`postureKey`), and row L only proves both client normalizers agree on `ride`.
The remaining exposure is `_shared/state-trend/assemble.ts:167` emitting `bike` — **server-side, and
these fixtures are client-only**. Stage 1 must add its own coverage there; do not read stage 0 as
having that flank covered.

⛔ **SCOPE, STATED HONESTLY.** These pin the **READERS**, not the rendered DOM. The repo has no DOM
test infrastructure — `deno test` only, no vitest/jest/testing-library/jsdom — and `CLAUDE.md` forbids
speculative npm deps, so adding one is a separate decision, not a thing to slip into a migration.

That boundary is acceptable because the readers **are** the drift surface: every bug listed at the top
of this file was a reader disagreeing with another reader over the same row. It is not sufficient for
layout or positioning regressions, which stay a device check.

### Stage 1 — discipline (client-only, no deploy) — NEXT

Add `normalizeDiscipline` + `postureKey`. Migrate the four client normalizers. **Fixes the `bike`/`ride`
posture split and the unknown→`run` default.** Highest defect yield, lowest risk.

### Stage 2 — duration reads (client-only, no deploy)

Everything calls `plannedDurationSeconds`. Delete `computeMinutes` and the two inline reads;
`resolvePlannedDurationMinutes` becomes a wrapper that keeps its null contract.

### Stage H — Rules-of-Hooks hoist in `UnifiedWorkoutView` (client-only)

`UnifiedWorkoutView.tsx:125` early-returns on `!workout`, and **every hook in the component sits below
it**. eslint flags each one; the file carries ~125 errors and a meaningful share are this. If `workout`
goes falsy→truthy across renders, React throws *"Rendered more hooks than during the previous render."*

⚠️ `useDeclaredPosture` was deliberately placed **above** the guard so it adds nothing to the debt. The
rest were not hoisted — that is this stage.

One mechanical move: hoist all hooks above the guard, convert the early return to a render-time branch.
**No behaviour change.** Must land **before stage 3** touches this file. Not urgent (the crash needs a
specific transition) but it is a latent crash in the component every workout tap goes through.

### Stage 3 — row shape (⚠️ needs a `get-week` deploy)

Add `duration` to `get-week`'s select and its mapper; delete the client mapper; surfaces consume the
server contract. **`get-week` is on every calendar read — this stage goes alone**, after 1, 2 and H are
proven on device.

### Stage 4 — cleanup, then delete this file

Delete the dead readers. Add a lint rule or test forbidding new `total_duration_seconds` reads outside
the accessor. Fold this SPEC into a `D-NNN` and remove it.

---

## Rules for whoever picks this up

- **One stage per handoff.** These run on every workout tap.
- **Stage 0's fixtures are the contract.** A stage that changes a golden value is either a bug or a
  deliberate decision that must be stated in the diff — never a silent update to make green.
- **Do not add fallbacks to `resolvePlannedDurationMinutes`.** See §1.
- **Do not make unknown disciplines default to `run`.** See §2.

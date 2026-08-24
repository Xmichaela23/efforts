# HANDOFF — equipment gate regression on the Standing Plan (2026-08-24, evening)

**The complaint (Michael, on device):** his Strong Focus block prescribes `lat pulldown` and
`tricep pushdown` — cable movements — on a declared home gym (barbell+plates, dumbbells, rack,
flat bench, pull-up bar, bands, ab wheel; **no cable machine**). "Equipment has worked in the past."

**He is right on both counts.** It worked before, and it is broken now. The regression is in the
NEW strength-grid slot resolver (stage 2, 2026-08-22); every older path is innocent.

---

## The proof (reproducible fixture, run 2026-08-24)

`composeBlock` for the `strength_5k` frame, week 2, upper accessory slot, run twice:

| equipment passed | slot fills with |
|---|---|
| his declared kit | **lat pulldown** (band-route, last-resort tier) |
| `null` (undeclared) | **rear delt fly** (dumbbells — which he owns) |

**Declaring MORE equipment buys a WORSE pick.** That is the bug in one line.

## Mechanism

1. `grid.ts:152-156` — `reachable()` requires `isGearTagged(name) && canPerform(name, equipment)`
   the moment ANY equipment is declared. An **untagged** movement is ejected as "unknown".
2. `src/lib/strength-gear.ts` `ASSISTANCE_GEAR` has only **52 entries**. Most of the catalogue is
   untagged — rear delt fly, curls, tricep extensions, calf raises, most core. (Untagged movements
   otherwise pass every gate: `gearRoutesFor` falls back to "needs nothing" with a console warning,
   so `canPerform` = true, `equipmentFitRank` = 0.)
3. So the slot pool keeps only tagged movements. `lat pulldown` IS tagged (`[['cable'],['bands']]`,
   strength-gear.ts:259) — he owns bands, so it survives at the last-resort band tier (rank ≥100)
   and wins a pool emptied of its loadable rivals. Same for `tricep pushdown` (line 236).

## Why it "worked in the past"

- **Get Stronger assistance was athlete-picked from an equipment-gated menu** (D-423/D-424,
  2026-08-13). The engine never auto-chose a cable movement; you couldn't be handed one.
- **materialize-plan's `substituteExerciseForEquipment`** (index.ts:1123) backstops specific
  machines at render time (face pull, leg curl, leg extension, incline press, farmers carry) —
  but has **no rule for lat pulldown or tricep pushdown**, so it passes them through untouched,
  with no "band" label.
- The Standing Plan grid (stage 2) is the first engine that AUTO-selects accessories — so the
  half-tagged table became load-bearing for the first time, and broke.

## Precedent already in the repo

Stage 3 hit this exact defect on the muscle-floor path: **calves were unfillable for a
commercial-gym athlete** because all nine calf movements are untagged and the grid declined them
all. Its fix: gate on `canPerform`, rank with `equipmentFitRank`, and it **withdrew** the
"tag ~25 movements" plan — "untagged movements pass every real equipment gate"
(NOTES-stage3-accessory-dosing-2026-08-22.md:69-82). The slot path was left on the old rule.

Stage 2's own written policy (NOTES-stage2-strength-grid-2026-08-22.md): *"gate on declarable
gear; leave machine-only movements ungated and let substitution handle them."* The ejection rule
contradicts this — it exists to avoid handing a home athlete a leg press, which is a real risk if
the ejection is simply deleted (the materialize backstop covers few machines).

## Two more bugs found on the same trace

- **`config.athlete_equipment` is read by `rematerialize-standing-block` (index.ts:156) and
  written by NOTHING.** The build passes equipment into the composer, but the plan row never
  stores it — so every test-read restate re-composes UNGATED, can pick different accessory names
  than the calendar carries, and those rows silently miss the weight restate (the exact
  "silent no-op" restate.ts warns about).
- **Band-route picks are not labelled.** The plan prints "lat pulldown", meaning "band lat
  pulldown" — reads as ignoring the athlete's gym even when the pick is intentional.

## Fix options (terminal session decides with Michael)

- **A. Tag the slot-pool catalogue.** The stage-2 file warning's own ask. Correct but the biggest
  lift; stage 3 withdrew a smaller version of it for the floor path.
- **B. Align the slot gate with stage 3:** `canPerform` + `equipmentFitRank` only, drop
  `isGearTagged`. One-line change, but re-opens "untagged machine movement prescribed to a home
  athlete" wherever the materialize backstop has no rule.
- **C. (recommended) B plus a machine guard from existing vocabulary:** taxonomy already owns
  "externally braced / machine-ish" — `BRACED_RE` (taxonomy.ts:186-187) and the `braced` category.
  Treat untagged as free UNLESS it reads as machine-braced; those stay ejected (or tagged
  properly, a much shorter list). No new taxonomy; asks an existing axis a new question.

Plus, regardless of A/B/C: store `athlete_equipment` in the block config at build (small), and
label band-route picks "band …" (small).

## Test plan for whichever fix

- Fixture: his exact kit, `strength_5k`, assert the focused-pull slot resolves to a loadable
  movement (not a band-tier pick) — this is the regression pin.
- Extend the stage-2 gate suite (260 resolutions): add the assertion "no band-tier (rank ≥100)
  pick while any loadable candidate exists in the cell".
- Restate round-trip: build with equipment → restate reads `config.athlete_equipment` → composed
  names match the calendar (kills the silent no-op).
- Per the house rule: ≥3 clean back-to-back recomposes on any generator-facing change.

# Work order — a border means you can tap it (2026-09-06)

Rule (docs/DESIGN-button-shape.md, "A border means you can tap it"): a bordered pill is a control; a label
never has a border; editable values need no pencil.

## 1. Labels lose their borders

Find every `span`/`div` that wears `border` + `rounded-(full|xl|lg)` and is not a control (no onClick,
not inside a button). About 70, mostly src/components/StrengthLogger.tsx, NonRaceBuilder.tsx,
ArcSetupWizard.tsx, GoalsScreen.tsx, RescheduleValidationPopup.tsx, PlannedWorkoutSummary.tsx (the yards
tag), FitFileImporter.tsx, CourseStrategyModal.tsx, AllPlansInterface.tsx. Each becomes plain text: keep
the words, keep a sport or state tint on the text if it had one, drop the border and the pill padding.
Where a tag sat inline, keep it inline with a middle dot or a space. Do not change any words.

The photo circle on Profile keeps its ring: it is a control (tap to change photo).

## 2. Pencils come off

`src/components/ui/number-row.tsx`: remove the pencil icon from the pill. The pill (sport-tinted border and
fill) is the affordance. Read-only rows stay plain text. Keep the `auto` segment. Both Profile and Adjust
use this row, so both change at once.

Profile's "You" rows (name, location, birthday, height, weight) and the units switch: same rule, no pencil,
pill stays. Email stays plain text.

## 3. One line says it

At the top of the Profile plate and at the top of Adjust's first sport section: "Tap a value to change
it." Remove the per-sport "Tap a number to set your own" sentences on Adjust where this makes them
redundant; keep the second half of each ("The threshold test goes on the calendar three days out" etc.).

## 4. Verify, ship

Lint: no new `consistent-button-shape` findings. `npx tsc --noEmit` clean. Walk Home, State (all three
lenses), Profile (all four sports), the logger, the wizard, a plan builder screen: no bordered label
left, every bordered pill does something on tap. Push, wait for Netlify, `npm run ios`. Report pushed /
web / iOS synced, and what was not device-checked.

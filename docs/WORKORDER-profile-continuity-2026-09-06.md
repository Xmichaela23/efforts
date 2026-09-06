# Work order — Profile looks and works like Adjust (2026-09-06)

Michael, after building the Profile fold on the phone: "we need visual continuity between Adjust and
Profile with the baselines — like how clean they look in Adjust, but I like the tab picker for the
sports on Profile — also auto and my number are handled differently." Decided in chat; this is the
build. The design law: the app is a hand-held tool from 1982 sci-fi. One reading per screen, few
controls, every number says where it came from, nothing decorative.

## The rule

**A number looks and behaves the same everywhere it appears.** Today Profile draws a lift three ways at
once (big number, a typed field, an auto / my-number switch) and Adjust draws it one way (the pill).
Adjust's way wins.

## 1. One number row, shared

Extract Adjust's `Row` (src/components/context/StateAdjustLens.tsx: `const Row = …`, the `pill` style
string, `withSource`, `mine`, `setAuto`, `commit`) into one component under `src/components/ui/`
(name it for what it is, e.g. `NumberRow`). Both screens import it. Behaviour, unchanged from Adjust:

- Name left, pill right: `125 lb · auto ✎`. Tap the pill → inline input (16px, no zoom), save / cancel.
- The word beside the number follows the switch: `auto`, `your number` (athlete set it), `accepted`
  (a proposal was taken). This is the terminal's 2026-09-06 rule; keep it.
- When the athlete's own number is in use, the pill grows an `auto` segment that switches back.
- Optional one-line note under the row (12px, white/50). Profile uses it for provenance: "from your
  lifts, 12 sets". Adjust uses it for the easy-pace note. Same slot.
- Read-only rows (easy pace) render the value with no pill.
- Sport colour on the pill border/fill via `getDisciplineColor`. Corners `rounded-xl`
  (docs/DESIGN-button-shape.md; the lint `efforts/consistent-button-shape` must show nothing new).
- Pull-ups is reps, not a load: same row, unit `reps`.

Remove from Profile: the big number + separate typed field, the auto / my-number switch as its own
control, the orange "Performance Numbers" heading, the grey input boxes, the "Don't know your numbers?"
paragraph. Retesting lives on Adjust; Profile ends each sport with one line, "Retest or rebuild on
Adjust", that navigates there.

## 2. The sport strip on Profile

Keep the sport picker, but draw it as the app's segmented control — the same strip as Status / Adjust /
Schedule (src/components/context/StateHubTabs.tsx): one strip, four segments, icon + word, the chosen
one lit in its sport colour, the rest dim. Not four outlined boxes. It filters everything under it to
that sport.

## 3. The plates

- Top: a "You" plate. Photo left; name, location, email beside it; then birthday (age beside), units,
  height, weight as rows. Same row component where a row is a number.
- Then the sport strip.
- Then ONE plate for the chosen sport, wearing Adjust's plate exactly: `galaxy-card readout-texture
  readout-texture--forge rounded-2xl divide-y divide-white/[0.10]` with `readoutPlateStyle(undefined,
  { galaxy: true })`. Sections inside it use Adjust's section header (icon + 11.5px tracked uppercase
  label in the sport colour + ⓘ), each on its own line, body full width. Sections per sport: Numbers ·
  Zones · Equipment; swim keeps its own settings section. Nothing else on the screen gets a card.
- State keeps its spectral plate. Two rooms (State = read, Profile/Adjust = set), not three.

## 4. Adjust (small)

Optional, Michael likes the tabs: the same sport strip on Adjust as a JUMP bar — tap Run and the screen
scrolls to the Run section. Nothing hidden, nothing filtered; the block and deload sections stay above
it and the athlete's reorder still works. If it fights the reorder, leave it out and say so.

## 5. Copy

Plain words, no idioms, no "the book's". Provenance lines say the fact: "from your lifts, 12 sets",
"typed, until your lifts measure", "from your rides", "from runs". Never "move it" style shorthand.

## 6. Verify, then ship

Throwaway account (create → type numbers on Profile → they show on Adjust with the same word beside
them → set one to your number on Adjust → Profile agrees → back to auto on Profile → Adjust agrees →
photo upload → delete the account, zero rows left). Lint: no new `consistent-button-shape` warnings.
`npx tsc --noEmit` clean. Then push, wait for Netlify, `npm run ios`. Xcode build is Michael's. Report:
pushed / web deployed / edge functions (none expected) / iOS synced, and anything not device-verified.

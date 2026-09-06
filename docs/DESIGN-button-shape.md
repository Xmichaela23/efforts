# Button shape — one shape, enforced

_Established 2026-08-11 (design-system pass). This is the rule future work follows so button shape can't drift per-element again._

## The rule

**Every tappable button is `rounded-xl`.** Route it through the shared component:

```tsx
import { GalaxyButton } from '@/components/ui/galaxy-button';

<GalaxyButton variant="primary" size="lg" fullWidth>Start session</GalaxyButton>
<GalaxyButton>Save</GalaxyButton>                          // secondary (default)
<GalaxyButton variant="ghost">Cancel</GalaxyButton>
<GalaxyButton variant="danger">Delete</GalaxyButton>
<GalaxyButton shape="chip" variant={on ? 'primary' : 'secondary'}>Warm-up</GalaxyButton>
```

- **Shape is fixed:** buttons `rounded-xl` (12px), chips `rounded-full`. Shape is never a per-screen choice.
- **Variant carries hierarchy, uniformly:** `primary` = the one main action, `secondary` = standard (default), `ghost` = tertiary/dismiss, `danger` = destructive. The same action reads the same on every screen.
- **Digital-galaxy treatment** (dark instrument, white-alpha fills) is baked in. This is about shape + state, not colour.
- **Sport colour is wayfinding, not decoration.** When a control belongs to a discipline, tint it with `getDisciplineColorRgb('run'|'bike'|…)` (run gold, ride green, strength orange). Let the container/box carry the sport cue; keep selection highlights neutral so "which did I pick" stays legible. Amber = an intensity day (hard/club), not a sport.

## Leave alone (deliberately not `rounded-xl`)

- **True circles:** FAB, numeric steppers, close-X. They carry explicit square dims (`h-9 w-9`, `size-9`) and are meant to be round.
- **Non-buttons:** progress bars, badges, tags, cards. Cards may use a softer `rounded-2xl` — that's a container tier, not a button.
- The bottom nav bar is `rounded-xl` like everything else (it was `rounded-2xl`, corrected in this pass).

## The guard

`eslint-rules/consistent-button-shape.js` (wired in `eslint.config.js` as `efforts/consistent-button-shape`) flags a raw `<button className="… rounded-full | rounded-2xl | rounded-lg | rounded-md | rounded-sm …">`. True circles (with `h-`/`w-`/`size-` dims) are exempt.

- It is a **warning** today: ~144 pre-existing off-standard buttons exist, so `error` would flood the build. It catches every _new_ one immediately, and the old ones are a gradual migration to `GalaxyButton`.
- **Ratchet to `error`** once the count reaches zero — that's the point where the rule becomes hard enforcement.
- A genuine one-off exception: `// eslint-disable-next-line efforts/consistent-button-shape` **with a reason**. A raw `rounded-full` chip is not an exception — move it to `<GalaxyButton shape="chip">`.

## Adding a button

Reach for `<GalaxyButton>` first. If it can't express what you need, extend the component (a new variant/size), not the call site — that's what keeps every screen in one language.

## A border means you can tap it (2026-09-06)

Michael: "It's the easiest way to train the user, and it's clean: every bordered pill does something."

- **A bordered pill is a control.** Tap it and something happens: it edits, toggles, opens, or submits.
- **A label never has a border.** Tags, badges, units, counts, statuses ("yards", "estimated", "grey zone",
  a set count) are plain text, tinted if they carry a sport or a state, no border, no pill.
- **Editable values need no pencil.** The pill is the affordance; a read-only value is plain text beside
  it. One line at the top of a plate says "Tap a value to change it" and nothing else repeats it.
- The lint `efforts/consistent-button-shape` keeps button corners honest; this rule is enforced by
  review until a lint exists for bordered `span`/`div` labels.
- **Three taps, two glyphs.** No glyph: it happens in place (edit, toggle, apply). Down chevron: it opens
  under your thumb (a row expands, a sheet rises). Right chevron: you leave the screen (the Goals row
  "Plan: Standard Focus · Week 1 ›" is the model; iOS Settings rows are the precedent). A card that
  navigates gets the right chevron too.
- **A segmented strip shares one border.** Status / Adjust / Schedule, Run / Ride / Strength / Swim:
  one border around the group, the chosen segment marked by underline and colour, never bordered on
  its own.

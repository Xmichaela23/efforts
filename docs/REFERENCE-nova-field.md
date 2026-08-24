# Reference — the "supernova" field (top ↔ bottom mirror)

**What this is:** the implementation recipe for the multi-hue glow field the app opens on — the header's field and its mirror rising from the tabbar — and the traps that made the bottom impossible to match for two weeks. Aesthetic intent lives in memory `project_efforts_visual_language.md`; this doc is the how, not the why. (2026-08-24.)

---

## The architecture: glow lives on the CHROME, cards stay clear

The screen is symmetric. At the top: the header carries the field, spills toward center, and the Today card sits ON it as a dark clear instrument. At the bottom: the tabbar carries the same field mirrored, spills up, and the LOAD card sits ON it the same way. **No data card paints the glow inside itself** — two failed passes did, and both drowned the readouts (the orange strength number over a gold puff).

Four places, nothing else:

1. `.mobile-header::before` / `::after` (`src/index.css` ~line 457/502) — the master. `::before` is the soft-light spectral wash + grids; `::after` is the **visible** six-blob glow (gold, orange, red, purple, blue, green at alpha 0.24–0.40, `screen`, 26px blur). Blob order left→right is fixed: **gold 14% → orange 32% → red/purple 50% → blue 68% → green 86%.**
2. `.mobile-tabbar::before` / `::after` — **the header's two pseudo-elements copied value-for-value, y-positions flipped, nothing else changed.** Any future edit to the header's field gets copied down verbatim, mirrored y only. (The old tabbar field was a hand-authored "keep subtle" half-strength version — that asymmetry is exactly what kept the bottom reading dimmer.)
3. `.mobile-main-content` background — the bridge radials, now at BOTH edges: the original top set and the same five layers y-flipped at the bottom, same alphas. This is what glows in the gap between the LOAD card and the tabbar.
4. `.readout-texture--nova.galaxy-card::before` — the LOAD card. **Carries no colour**: dark bed (`#050505` → near-black radial) + stars; grid via `::after`. It is deliberately NOT the galaxy purple base and has NO `--card-accent-rgb` bloom.

`--nova-hue` / `--nova-dx/dy` are rolled per app launch in `main.tsx`; header and tabbar read `--nova-hue` so both ends drift together.

## The traps (why this took two weeks)

- **The visible header field is `::after`, not the wash.** The soft-light wash renders almost nothing over near-black; matching against it can never converge. Anything matching the header matches the six-blob `::after`.
- **The galaxy base leaks colour.** `.galaxy-card::before` is purple-navy with an orange `--card-accent-rgb` fallback bloom — under a "supernova" surface that read as a mystery sunset. A nova surface overrides both.
- **Half-strength "subtle" copies drift.** Any hand-retuned copy of the field (old tabbar, the card puffs) ends up visibly wrong next to the original. Mirror verbatim or don't mirror.

## Do / Don't

- **Do** change the field only in `.mobile-header`, then copy to `.mobile-tabbar` verbatim with y flipped.
- **Do** keep data cards colour-free — dark bed + stars + grid; the glow belongs behind and around them.
- **Don't** paint glow inside a card that holds readouts.
- **Don't** author a "subtle version" of the field for another surface — copy verbatim or leave it off.
- **Don't** match against the soft-light wash.

# Reference — the "supernova" field (header ↔ nova card match)

**What this is:** the implementation recipe for the multi-hue glow field the app opens on — the header's spill and the Home LOAD card's bottom-lit "nova" — and the trap that made them impossible to match for two weeks. Aesthetic intent lives in memory `project_efforts_visual_language.md`; this doc is the how, not the why. (2026-08-24, commit `5a865121`.)

---

## The trap (read this before touching either side)

The header paints **two** color layers, and only one of them is what you see:

1. `.mobile-header::before` — the spectral wash. Five hues at alpha 0.06–0.18 under `soft-light`. Over near-black this renders almost nothing; it's texture, not the field.
2. `.mobile-header::after` — **the visible field.** Six glow blobs (gold, orange, red, purple, blue, green at alpha 0.24–0.40), `screen` blend, 26px blur, spilling down over near-black.

The first nova pass matched the *wash* and could never converge — and the card also sat on the galaxy purple-navy base (`#14132b`) with the `--card-accent-rgb` orange fallback bloom underneath, which is where the mystery sunset came from. **Anything that must match the header matches the `::after` blob recipe, on the header's near-black ground, with the galaxy base and accent bloom removed.**

## Where the look lives (3 places)

1. `.mobile-header::after` (`src/index.css` ~line 502) — the master recipe. Blob order left→right is fixed: **gold 14% → orange 32% → red/purple 50% → blue 68% → green 86%.**
2. `.readout-texture--nova.galaxy-card::before` (`src/index.css` ~line 1078) — the LOAD card's copy of that recipe, mirrored to the card's **bottom** edge (2026-08-15: "light from the bottom up so the schedule looks like it's in the nova"). Used in exactly one place: the Home LOAD card in `WorkoutCalendar.tsx`.
3. `--nova-dx` / `--nova-dy` / `--nova-hue` — rolled once per app launch in `main.tsx`, so the sky drifts a little every open. Header and card read the same vars and drift together.

## What makes it read "smoky" (not a sunset band)

- **Small staggered puffs, not wall-to-wall ellipses.** Full-width ellipses on one baseline fuse into a smooth gradient strip. The card uses nine radials: six main puffs in the header's hue order at varied heights, plus three dim high wisps (gold/purple/blue at alpha 0.11–0.13).
- **A dim full-width haze under the puffs** (`rgba(150,135,175, 0.10 → 0)` rising ~58%) so the valleys between puffs aren't pure black — the header's blobs overlap on a faintly lit chassis; without this the card reads as separate islands.
- **Wide soft radial falloff stands in for the header's 26px blur.** A `filter: blur()` on the card's `::before` would blur the stars and ground too — don't add one.

## Do / Don't

- **Do** keep the left→right hue order identical to the header's when extending this look to another surface, and anchor light to whichever edge faces the header's glow.
- **Do** keep alphas in the header's 0.24–0.34 range for main puffs; wisps ~0.11–0.13.
- **Don't** match against the soft-light wash — it's invisible over black (this is the trap, twice now: the wash hues were also once invisible on the card's `::after` for the same reason).
- **Don't** reintroduce the galaxy purple base or the `--card-accent-rgb` bloom under a nova surface.
- **Don't** hand-blur the pseudo-element.

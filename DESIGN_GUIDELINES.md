# Design Guidelines

## Principles
- Minimal Scandinavian aesthetic: clean, uncluttered, high contrast.
- No decorative frames: avoid card-in-card and unnecessary borders.
- Friendly summaries: never show raw JSON/tokens; resolve paces/power and show ranges + total duration.
- Deterministic outputs: same formulas everywhere (Today, Plan, Detail, Export).

## Typography & Color
- Typeface: Inter (system fallback acceptable).
- Text color: black on white; secondary text: #666.
- Accents are rare and functional (e.g., links, alerts).

## Components & Layout
- Page content is edge-to-edge on mobile; generous spacing on desktop.
- Lists and rows are flat; prefer divider spacing over boxes.
- Prominence: show workout duration and primary target next to the title.
- Badges: minimal; avoid duplicating information already in the line summary.

## Copy & Formatting
- Pacing format: “6 × 800 m @ 7:30–8:10 w/ 2:00 rest”.
- Swim units respect plan `swim_unit` (yd/m) and convert as needed for export.
- Strength: show absolute weights derived from %1RM; include rest where relevant.
- Notes: concise, user-facing (no internal codes or control tags).

## Navigation & Behavior
- Use client-side navigation (`useNavigate`) to avoid full reloads.
- Keep Today/Calendar light: truncate long details; avoid repetition.
- Realtime updates should not flicker—defer global spinners on background refresh.

## Accessibility
- Hit targets ≥ 44px on touch surfaces.
- Maintain sufficient color contrast; avoid color-only signaling.
- Keyboard navigable components (focus outlines on interactive elements).

## Authoring Guidance
- Plans are JSON templates; see `PLAN_AUTHORING.md`.
- Use `steps_preset` + `export_hints`; normalizer handles friendly text and duration.

## Do/Don’t
- Do: show resolved targets, ranges, and total duration.
- Do: remove bracketed code tokens from user-facing views.
- Don’t: render raw formulas like `{5k_pace}+0:45/mi`.
- Don’t: nest cards or repeat the same labels in multiple places.

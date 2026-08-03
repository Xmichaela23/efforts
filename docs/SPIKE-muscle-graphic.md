# SPIKE — the real muscle body in Efforts' lights (throwaway, ~20 min)

**Why:** decide borrow-vs-bespoke for the muscle-group graphic by seeing the ACTUAL library body
wearing the Efforts palette — male + female, front + back — not a hand-drawn sketch. This is a
throwaway: a temp page, removed after we look. Not wired into the app.

**Context:** design locked in `SPEC-strength-language.md` (the two-axis strength language). The muscle
graphic is a later lens over the same exercise vocabulary — the 9 movement patterns → muscle groups.

---

## Steps

1. **Install the WEB port** (Efforts is React web + Vite/Capacitor):
   ```
   npm i react-body-highlighter
   ```
   ⛔ **NOT `react-native-body-highlighter`** — that's React Native, it won't run in this app. The web
   port's SVGs were lifted from the RN one, so it's the same artwork. (`@mjcdev/react-body-highlighter`
   is an alt fork if the plain one won't install; both MIT.)

2. **Temp route/page**, e.g. `src/pages/_spike-body.tsx`, NOT linked in nav. Delete when done.

3. **Render it. ⚠️ Confirm the exact prop names in the package README first — do not assume them.**
   The API shape (from the RN sibling, for reference): a `data` array of `{ muscle/slug, intensity }`,
   a `side`/`type` for front vs back, and a `gender` for male vs female. Feed a sample 5/3/1 week:
   e.g. `chest`, `quadriceps`, `gluteal`, `hamstring`, `biceps`, `triceps`, `front-deltoids`,
   `trapezius`, `abs` at varying intensity. (Real slugs, from the web README:
   trapezius, upper-back, lower-back, chest, biceps, triceps, forearm, back-deltoids, front-deltoids,
   abs, obliques, adductor, hamstring, quadriceps, abductors, calves, gluteal, head, neck.)

4. **Apply our lights.** Replace the library's flat blue intensity colors with the Efforts ramp:
   - Muscle fill by intensity: warm `#ffb257` → `#ff5f6d` (amber → coral), unlit `rgba(120,140,180,.14)`.
   - Dark space background + the header aurora: reuse the app header's stacked
     `radial-gradient(...)` glow (orange / violet / cyan on `#070a13`).
   - Glow: CSS `filter: drop-shadow(0 0 6px rgba(255,157,77,.6))` on the lit muscles, or an SVG
     `feGaussianBlur` on the muscle group. This is what turns flat panels into the OMNI vessel look.

5. **Check all four:** male front, male back, female front, female back.
   ⚠️ If the web port is **male-only**, note it — the female SVG exists in the RN package (MIT); port it
   over, or treat female absence as a point in favor of bespoke.

---

## What we're deciding after the look

- Does the faceted body read **premium** in our palette, or dated/generic?
- Is the **female** version present and good enough?
- **Borrow** (use the library body, free/shared) vs **own** (trace a bespoke body — unique, ours,
  drawn for the vessel aesthetic from the start).

## Cleanup
Delete the temp route. If we keep the library, add the dep **deliberately** (CLAUDE.md: no speculative
deps) or inline the SVG for self-containment. Nothing from this spike ships as-is.

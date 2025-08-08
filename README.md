# Efforts - Proven 12‑Week Balanced Triathlon Training

A React + TypeScript app that generates 12‑week triathlon plans using proven balanced methodology. Rule‑driven, no fallbacks, clean 3‑file engine.

## Core Philosophy
- Periodization: Base (1–4), Build (5–8), Peak (9–11), Taper (12)
- Weekly pattern:
  - Swim 2/wk
  - Bike 3/wk (Tue hard, mid‑week short Z2, Sat long) — Taper 2/wk
  - Run 2/wk; hard run Fri (Build/Peak); never adjacent to hard bike
  - Strength: Traditional 2/1–2/0–1 or Cowboy 3/2/1 with taper auto‑limit
- Intensity distribution (endurance only): Base 70–85% Z2; Build 50–70%; Peak 40–60%; Taper 70–85%
- Outcomes, not caps: weekly hours emerge from rules (target Base ~10–12h, Build ~11–13h, Peak ~12–14h, Taper ~6–8h)

## Engine (3 files)
- `src/services/Seventy3Template.ts` – phase templates + detailed workouts (swim/bike/run); VO2/threshold caps applied
- `src/services/StrengthTemplate.ts` – Traditional/Cowboy generation with spacing rules
- `src/services/TrainingEngine.ts` – week generation, scaling, validation (phase‑aware minimums, recovery, intensity)

## Deploy (Git → Netlify)
- Netlify reads `netlify.toml` (build: `npm run build`, publish: `dist`, SPA redirects)
- Push to `main` → auto build & deploy

## Quick start
```bash
git clone https://github.com/Xmichaela23/efforts.git
cd efforts
npm install
npm run dev
```

See `APP_BIBLE.md` for design rules and `STRENGTH_TRAINING_DECISIONS.md` for strength specifics. 
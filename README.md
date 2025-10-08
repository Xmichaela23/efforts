# Efforts

Triathlon training app. React + TypeScript + Supabase.

## Architecture

**Smart server, dumb client.**
- Two sources: `planned_workouts` table, `workouts` table
- One view: `get-week` endpoint merges them
- React just renders

## Quick Start

```bash
npm install
npm run dev
```

`.env.local`:
```env
VITE_SUPABASE_URL=your_url
VITE_SUPABASE_ANON_KEY=your_key
VITE_MAPTILER_KEY=your_token
```

## Design

Minimal Scandinavian aesthetic. See [DESIGN_GUIDELINES.md](DESIGN_GUIDELINES.md).

## Deploy

- **Frontend**: Netlify auto-deploys from `main`
- **Functions**: `supabase functions deploy <name>`

---

**For AI assistants**: Read the code. It's clean. Start with `supabase/functions/get-week/index.ts`.

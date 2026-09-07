# Work order — no model calls anywhere in the app (2026-09-07)

Michael: "rip out all AI … clean house." The headline for the Garmin and Strava partner reviews is
"deterministic, no AI", and it has to be literally true. Nothing that computes a plan, a load, a pace, a
lift or a zone has ever touched a model. What remains is words, and half of it is already dead. The
marathon plan is a future deterministic rebuild; its race-time pieces come out now rather than get patched.

## Inventory (2026-09-07 scan)

Dead, delete:
1. `analyze-cycling-workout` — `generateAINarrativeInsights` is defined and never called. Remove it and the
   `_shared/llm.ts` import.
2. `analyze-swim-workout` — the LLM block is gated behind `SWIM_INSIGHTS_LLM` which is never set. Remove
   the block; the deterministic facts fallback is the read.
3. `arc-setup-chat` (function) and `_shared/llm-arc-setup.ts` — no screen invokes it. Delete both; remove
   the route/handlers if any client code references the name (`grep -rn arc-setup-chat src` → none today).
4. `coach` — `generateCoaching` runs on every coach build when `ANTHROPIC_API_KEY` exists and the client
   reads none of `snapshot.coaching`. Remove the call, the key read, and the `coaching` field from the
   payload (bump `COACH_PAYLOAD_VERSION` and `COACH_CLIENT_MIN_PAYLOAD_VERSION` together, the usual
   cache gate). Keep every deterministic line: readiness_why, readiness_suggestion, the D-306 week narrative.
5. `analyze-strength-workout` — comment references only; confirm no call, remove any dead import.

Live on race plans, replace:
6. `workout-detail` → `_shared/session-detail/race-readiness-llm.ts` (`trySessionRaceReadinessLlm`). Keep
   `raceReadinessDeterministicFallback` as THE path; delete the LLM function, the gate that chose between
   them, and the file's `callLLM` import. The fallback's sentences are the copy; make them read plainly
   (docs/COPY-VOICE.md), and verify on a throwaway race plan that a workout detail still shows a readiness
   line.
7. `course-strategy` — the pacing plan is a model writing JSON. Replace with arithmetic: per-segment target
   pace off threshold pace and the course's grade profile (the GAP model already in the app,
   `_shared/heat-adjust.ts` / the Minetti grade cost used by session-detail), fuel and pacing notes as fixed
   sentences keyed to distance. If that is more than a day, remove the "Generate strategy" action from the
   three screens (CourseStrategyModal, GoalsScreen, StateTab) and leave the course view without it; say
   which you did.
8. `extract-races` — a model reading a race web page. Remove the function and the two wizard calls
   (ArcSetupWizard 838, 1101); the race name, date and distance are typed. The NonRaceBuilder note that
   mentions it comes out.

## Then

- Delete `_shared/llm.ts` once nothing imports it. `grep -rn "callLLM\|api.anthropic.com\|api.openai.com\|ANTHROPIC_API_KEY\|OPENAI_API_KEY" supabase src` must return nothing.
- Remove `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` from the project's function secrets (`supabase secrets unset`), and from `.env.example` if listed. Say so in the report.
- Privacy page: one sentence in the data section: "Efforts does not use AI. Every number and every sentence in the app is computed from your data by fixed rules." Michael reads it before the meeting.
- `docs/INVENTORY.md` regenerated (`npm run inventory:write`); the 5 red standing-plan tests and the pre-existing deno-check errors are not yours, leave them; nothing new red.

## Verify, ship

Throwaway: one account on a race plan with a course → workout detail shows the deterministic readiness
line; course view either shows the arithmetic strategy or has no strategy action; the wizard's race step
takes typed entry. Home refreshes for a Standard Focus user with readiness lines intact. Coach cache
version bumped so old caches are ignored. Deploy every touched function, push, `npm run ios`. Report:
functions deleted, functions changed and versions, secrets removed, what the course screen does now, what
was not device-checked.

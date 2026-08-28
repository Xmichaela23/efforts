-- ⛔⛔ APPLIED BY HAND ON 2026-08-28, AND DELIBERATELY NOT RECORDED IN THE MIGRATION LEDGER.
--
-- Michael ran these two statements in the Supabase SQL editor against production
-- (`yyriamwvtvzlkumqrvpm`); the column was then confirmed live by a direct PostgREST select
-- returning 200 with the field present, not by reading a success message off a screen.
--
-- ⚠️ IF YOU RUN `supabase migration list` AND SEE TEN LOCAL-ONLY FILES, THAT IS THE EXISTING STATE,
-- NOT A BREAKAGE. Only `0000` is recorded on Remote; every other migration in this repo was applied
-- by hand exactly as this one was. `supabase db push` therefore refuses to run a single new file and
-- demands `--include-all`, which would attempt the entire backlog against a database that already
-- has it — which is why this one was applied directly instead.
--
-- ⛔ `migration repair --status applied` WAS CONSIDERED AND REJECTED. Stamping this file into a
-- ledger that records none of its nine predecessors leaves `db push` refusing exactly as before, so
-- the repair buys nothing — and it writes to production state to buy it. Consistency with the other
-- nine is the smaller lie. ⚠️ The real fix is to reconcile the whole ledger at once, which is a
-- separate piece of work and nobody's today.

-- THE SET'S INTENT REACHES THE SERIES — `exercise_log.slot_intent`.
--
-- ⛔ STARVED, NOT ABSENT. The intent has been DATA on the prescription since 2026-08-26
-- (`standing-plan/compose.ts` stamps `slot_intent` on every row), `materialize-plan` preserves it
-- onto `planned_workouts.strength_exercises`, and `StrengthLogger` carries it onto the workout the
-- athlete saves — so it is already sitting on `workouts.strength_exercises` today. It died one hop
-- from where it was needed: `compute-facts` built `exercise_log` without it, so
-- `state-trend/assemble.ts` had nothing to filter on and gated the e1RM series on rep ceiling and
-- deload phase alone.
--
-- ⛔ WHY THAT MATTERS. On a Viada standing block the SAME lift is prescribed at two intensities in
-- one week — Michael's bench is 135 on the heavy day (ME, 90-100%) and 105 on the speed day
-- (DE, 70-80%). Both landed on the same series, so every speed session planted a point about a
-- fifth below the heavy one and the strength line dipped on a week followed exactly.
--
--   ME    max effort, 90-100%      — the only intent that may mint a max
--   DE    dynamic effort, 70-80%   — light ON PURPOSE
--   SKILL 75-85%
--   HYP   hypertrophy, 6-12 reps
--
-- ⚠️ NULL IS NOT "no intent existed" — it is "we were not told". A hand-added exercise, a session
-- logged off-plan, and every row written before the field was carried all read NULL.
--
-- ⛔ THE e1RM SERIES FAILS CLOSED ON NULL (Michael, 2026-08-28): only ME mints a max, and a set we
-- were not told about does not. That empties the line of everything logged before this column
-- existed, which he ruled for explicitly — he is re-testing and starting the line fresh rather than
-- carrying sets whose intent nobody recorded. ⚠️ It is deliberately the OPPOSITE of D-417's
-- fail-open rep gate sitting beside it; the two answer different questions and the difference is
-- not an oversight.
-- ⚠️ CONSEQUENCE FOR ANY PLAN GENERATOR: a programme that does not stamp this has no strength line
-- at all. Stamp it when the rows are authored.

-- ⚠️ COVERAGE GAP, FOUND ON LIVE ROWS 2026-08-28 AND DELIBERATELY NOT CHASED. A read of four of
-- the athlete's own completed sessions confirmed the field arrives with correct values (a DE Upper
-- session carried `DE` on the bench and the pull-up, `HYP` on the dumbbell bench and the curl) —
-- and the ab wheel rollout in that same session carried NOTHING. It is the athlete's OWN core pick,
-- and an athlete-chosen exercise appears to reach the log without an intent even inside a fully
-- marked session. It changes nothing for the strength cards, which exclude accessories by ruling.
-- ⛔ IT WILL MATTER TO ANYTHING THAT COUNTS HYPERTROPHY REPS PER MUSCLE, because the athlete's own
-- picks are exactly where that work lives. Recorded here rather than opened.

ALTER TABLE exercise_log
  ADD COLUMN IF NOT EXISTS slot_intent TEXT;

COMMENT ON COLUMN exercise_log.slot_intent IS
  'What the plan asked this exercise to be: ME (max effort, 90-100%), DE (dynamic/speed, 70-80%), SKILL (75-85%) or HYP (hypertrophy). Read off the logged row first and the planned row as fallback. NULL = not told (hand-added, off-plan, or logged before the field was carried) — never "no intent".';

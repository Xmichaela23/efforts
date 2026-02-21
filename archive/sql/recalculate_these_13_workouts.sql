-- Recalculate workload for the 13 specific strength workouts that still need it
-- These are the ones that still show format: "string" after migration

-- First, let's see what the actual string values look like
SELECT 
  id,
  name,
  date,
  -- Show first 500 chars of the string to see what we're dealing with
  LEFT(strength_exercises::text, 500) as exercises_preview,
  LENGTH(strength_exercises::text) as string_length
FROM workouts
WHERE id IN (
  '0643bc8b-b234-4bbb-8d25-2ebeb9c84bc5',  -- Jan 13
  '27924333-da3f-4c43-885c-bcfc8673fa53',  -- Jan 12
  'e9a498ec-13b8-4c2d-b3f9-334fc734b7ba',  -- Jan 7
  '482ddaec-1a59-4e16-ac38-6eed85fc7b93',  -- Dec 24
  'de43c5fc-5c42-4ae9-8e1d-b961b51a1110',  -- Dec 5
  '4085145f-cbb2-4610-8e0d-db1551c0f4af',  -- Dec 3
  'c051a007-d5fa-4c51-bb1d-b3a51c23c722',  -- Oct 27
  '105e45f2-5458-408d-827b-db637d5ded23',  -- Oct 10
  '73a11e02-b23f-42d9-9e16-85caf01ac900',  -- Oct 1
  '0895e984-847e-4a02-b4d6-e0812ebc5845',  -- Sep 19
  '9e0fd637-61b6-4117-b720-7dc4781dffc0',  -- Sep 17
  '1ddb990f-3124-4aab-8475-156e531213ee',  -- Sep 9
  'c8884b1d-1248-42b5-b683-b0730223cc85'   -- Sep 2
)
ORDER BY date DESC;

-- After fixing the format, you'll need to call calculate-workload for each
-- Use Supabase Dashboard → Edge Functions → calculate-workload → Invoke
-- Or use the batch script

# How to Run the Migration

## Option 1: Supabase CLI (Recommended)

```bash
# Push all pending migrations to your database
supabase db push

# Or link to your project first (if not already linked)
supabase link --project-ref your-project-ref
supabase db push
```

## Option 2: Manual via Supabase Dashboard

1. Go to your Supabase Dashboard
2. Navigate to **SQL Editor**
3. Copy the contents of `supabase/migrations/20260116_fix_strength_exercises_jsonb_format.sql`
4. Paste into the SQL Editor
5. Click **Run**

## Check if Migration Already Ran

Supabase tracks which migrations have been applied. To check:

```bash
# See migration history
supabase migration list
```

Or check in Supabase Dashboard:
- Go to **Database** → **Migrations**
- Look for `20260116_fix_strength_exercises_jsonb_format`

## Note

This migration has likely already been run (based on our earlier conversation where you confirmed it worked). If you run it again, it will:
- Show the NOTICE messages (counts before/after)
- Skip the UPDATE if no rows match (since they're already fixed)
- Be safe to run multiple times (idempotent)

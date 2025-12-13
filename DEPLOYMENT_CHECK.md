# Deployment Check: Shared Library Imports

## ⚠️ Important: Verify Before Deploying

When deploying Supabase edge functions, **relative imports from `../../lib/` may not work** unless the `lib/` directory is included in the deployment.

## 🔍 What We Changed

1. **`analyze-running-workout/index.ts`**:
   ```typescript
   import { extractSensorData } from '../../lib/analysis/sensor-data/extractor.ts';
   ```

2. **`compute-workout-analysis/index.ts`**:
   ```typescript
   import { normalizeSamples } from '../../lib/analysis/sensor-data/extractor.ts';
   ```

## ✅ How Supabase Edge Functions Handle Imports

Supabase edge functions run in Deno and support:
- ✅ Relative imports within the function directory (`./file.ts`)
- ✅ Absolute imports from npm/CDN (`https://esm.sh/...`)
- ⚠️ **Relative imports outside function directory** (`../../lib/...`) - **May not work**

## 🧪 Testing Before Deployment

### Option 1: Test Locally with Supabase CLI

```bash
# Start local Supabase
supabase start

# Test the function locally
supabase functions serve analyze-running-workout --no-verify-jwt

# In another terminal, test it:
curl -X POST http://localhost:54321/functions/v1/analyze-running-workout \
  -H "Authorization: Bearer <anon_key>" \
  -H "Content-Type: application/json" \
  -d '{"workout_id": "<test_workout_id>"}'
```

**If this works locally**, it should work when deployed.

### Option 2: Check Import Resolution

The import path `../../lib/analysis/sensor-data/extractor.ts` resolves to:
- From: `supabase/functions/analyze-running-workout/index.ts`
- To: `supabase/lib/analysis/sensor-data/extractor.ts`

**This should work** because:
1. Supabase CLI includes the entire `supabase/` directory structure
2. Deno supports relative imports across directories
3. The path is correct relative to the function file

## 🚨 Potential Issues

### Issue 1: Import Path Not Found
**Error**: `Module not found: "../../lib/analysis/sensor-data/extractor.ts"`

**Solution**: 
- Verify the file exists at that path
- Check the relative path is correct
- Consider using absolute import or copying file into function directory

### Issue 2: TypeScript Compilation Error
**Error**: TypeScript can't resolve the import

**Solution**:
- Add `deno.json` to function directory with import map
- Or use dynamic import: `await import('../../lib/analysis/sensor-data/extractor.ts')`

## ✅ Recommended Deployment Steps

1. **Test locally first**:
   ```bash
   supabase functions serve analyze-running-workout
   ```

2. **If local test passes**, deploy:
   ```bash
   supabase functions deploy analyze-running-workout
   supabase functions deploy compute-workout-analysis
   ```

3. **Test deployed functions**:
   - Use the test script: `node scripts/test-phase1-refactor.mjs <workout_id>`
   - Or test manually via frontend

4. **Monitor for errors**:
   - Check Supabase dashboard → Edge Functions → Logs
   - Look for import errors or runtime errors

## 🔄 Fallback Plan

If imports don't work when deployed:

### Option A: Copy Files into Function Directories
Copy `extractor.ts` into each function directory:
- `supabase/functions/analyze-running-workout/extractor.ts`
- `supabase/functions/compute-workout-analysis/extractor.ts`

Update imports to: `import { extractSensorData } from './extractor.ts';`

### Option B: Use Dynamic Imports
```typescript
const { extractSensorData } = await import('../../lib/analysis/sensor-data/extractor.ts');
```

### Option C: Use Import Map in deno.json
Create `supabase/functions/analyze-running-workout/deno.json`:
```json
{
  "imports": {
    "@lib/extractor": "../../lib/analysis/sensor-data/extractor.ts"
  }
}
```

Then import: `import { extractSensorData } from '@lib/extractor';`

## ✅ Verification Checklist

Before deploying:
- [ ] File exists at `supabase/lib/analysis/sensor-data/extractor.ts`
- [ ] Import paths are correct (`../../lib/...`)
- [ ] Tested locally with `supabase functions serve`
- [ ] No TypeScript errors
- [ ] Old functions commented out (not deleted)

After deploying:
- [ ] Functions deploy without errors
- [ ] Test script passes
- [ ] Frontend works correctly
- [ ] No import errors in logs

---

**Recommendation**: Test locally first, then deploy. If imports fail, use fallback Option A (copy files).









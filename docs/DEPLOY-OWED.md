# Deploy-Owed / Post-Deploy Verification

Changes committed locally but **not yet pushed/deployed**, plus verifications that can only run **against the deployed code** (not the local working tree). When a push/deploy happens, work this list: deploy the named functions, then run the post-deploy checks here. This is the bucket for "local-verified, deployed-equals-local still owed."

> Convention: nothing here blocks local work. These are the checks that close the loop once code is live.

---

## Owed

### D-212 Cut 2 — coach payload (divergence) → `supabase functions deploy coach`
- **Why:** Cut 2 changed the coach payload (`COACH_PAYLOAD_VERSION` 45→46; new top-level `fitness_verdict_divergence`). The new field doesn't reach the client until the deployed function emits it.
- **On deploy:** `supabase functions deploy coach`. Also re-deploy any function bundling the changed `_shared/arc-context.ts` (divergence is computed there) if you want the field fresh everywhere.
- **Post-deploy verify:** the spine↔projection divergence renders in the State RACE-block verdicts subsection **only on a real disagreement** — currently none exists for the sole athlete, so the render path is verified by reading, not runtime. Confirm on a live divergence when one occurs. (Block-verdict line shows the dormant "needs more comparable sessions" today.)

### D-213 non-race work — the full 486-plan matrix is a post-deploy check
- **Why:** `scripts/plan-generation-matrix.mjs` **POSTs to the deployed `generate-combined-plan`** — it cannot validate undeployed local changes. Pre-deploy, the local `deno test` suite (the in-process generator tests) is the substitute behavioral proof; the 486-matrix is the **final local-equals-deployed confirmation**.
- **Schema migration owed:** `supabase db push` to apply `20260625120000_add_target_weeks_to_goals.sql` (D-213 Cut 2 — adds `goals.target_weeks`). Verified by precondition only (REST creds can't run DDL); additive nullable + NULL-passing CHECK, existing event goals unaffected.
- **On deploy (of any non-race generation cut):** `supabase functions deploy generate-combined-plan` (+ callers per the ingest/recompute fan-out rule).
- **Post-deploy verify:** `node scripts/plan-generation-matrix.mjs` → expect the matrix to pass (was 486/486; confirm the count). Cut 1 ('retest' vocabulary) is byte-identical to race output by construction, so the matrix should be unchanged after Cut 1 deploys; later cuts (terminal branch, volume anchor) are where it earns its keep.

### Standing — the whole D-212/D-213 arc is committed but unpushed
- Multiple commits on `main` (D-212 Piece 1/4 + Cut 2, the standards SPECs + D-210/D-211/D-212/D-213, the non-race Cut 1) are **not pushed**. `git push origin main` when ready; Netlify auto-deploys the client, edge functions deploy separately (above).

---

## Done
_(move items here once deployed + post-deploy-verified, with the date)_

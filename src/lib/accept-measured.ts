// =============================================================================
// accept-measured — "use this number": send the shown value, the server saves the accept
// =============================================================================
//
// ⛔ THE PHONE WRITES NOTHING (2026-09-10). Profile, Adjust and the post-workout popup each ran
// `acceptEstimatedFtp` / `acceptLearnedRunThreshold` on the phone and wrote `learned_fitness` and the
// manual flag themselves. They now send the number the button showed to `save-baselines`, which runs the
// same accept and saves it (and refuses if the estimate moved since the button was drawn).
//
// My Record's "Logged suggests … Update" goes through the same call (2026-09-10, audit H-B12): 'lift' with
// the lift key, or 'swim_pace'. The server checks it against the suggestion it built, locks respected.

import type { SupabaseClient } from '@supabase/supabase-js';

export type AcceptKind = 'ftp' | 'run_threshold' | 'lift' | 'swim_pace';

/** One shape, not a union: `tsconfig` runs without strict null checks, so a union would not narrow. */
export type AcceptResult = {
  ok: boolean;
  /** Set when `ok` is false. */
  error: string | null;
  /** The accepted value as the server saved it (watts, or seconds per km). NaN when `ok` is false. */
  acceptedValue: number;
  learnedFitness: Record<string, unknown> | null;
  performanceNumbers: Record<string, unknown> | null;
  /** 'lift' only: true when the lift was locked and its locked number moved (the block's weights restate). */
  locked: boolean;
};

const failed = (error: string): AcceptResult => ({ ok: false, error, acceptedValue: NaN, learnedFitness: null, performanceNumbers: null, locked: false });

/**
 * `value`: watts for FTP, seconds per km for run threshold — the proposal's own number; pounds for a lift,
 * seconds per 100 yd for swim pace — the "Logged suggests" number. `lift`: the lift key, 'lift' only.
 */
export async function acceptMeasuredNumber(supabase: SupabaseClient, kind: AcceptKind, value: number, lift?: string): Promise<AcceptResult> {
  try {
    const { data, error } = await supabase.functions.invoke('save-baselines', { body: { accept: { kind, value, ...(lift ? { lift } : {}) } } });
    if (error || !data?.success) {
      let message = data?.error ? String(data.error) : error?.message || 'accept failed';
      try {
        const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } } | null)?.context;
        const payload = ctx?.json ? await ctx.json() : null;
        if (payload?.error) message = String(payload.error);
      } catch { /* keep the generic message */ }
      return failed(message);
    }
    return {
      ok: true,
      error: null,
      acceptedValue: Number(data.accepted?.value),
      learnedFitness: data.learned_fitness ?? null,
      performanceNumbers: data.performance_numbers ?? null,
      locked: data.accepted?.locked === true,
    };
  } catch (e) {
    return failed((e as Error)?.message || 'accept failed');
  }
}

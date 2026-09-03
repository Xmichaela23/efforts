// State-as-hub "Adjust" lens (D-316) — v0 scaffold.
//
// The Adjust tab mirrors the discipline layout of Status, but each row is a HANDLE to steer that
// discipline (changes WHAT you do). v0 lays out the disciplines and names the steer each one gets;
// the functional controls (strength swap/add/weight already exist in the logger + StrengthAdjustmentModal;
// endurance ease/push next) get re-homed here in the next pass. Nothing here changes your plan yet —
// no dead buttons that pretend to work; honest labels for what lands where. Consent-first throughout.

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

type Lift = { canonical_name: string; display_name?: string };

export default function StateAdjustLens({ perLift }: { perLift: Lift[] }) {
  // 2026-09-03 (Michael: "maybe it should be here"): the one control that already works — rewrite the
  // unstarted sessions of the block from the plan (same lifts, weights, days; completed sessions never
  // touched). It used to fire only as a side effect of saving Baselines after a lift lock changed.
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildNote, setRebuildNote] = useState<string | null>(null);
  const rebuild = () => {
    void (async () => {
      setRebuilding(true);
      setRebuildNote(null);
      try {
        const { data: rs, error } = await supabase.functions.invoke('rematerialize-standing-block', { body: { apply: true } });
        if (error) throw error;
        setRebuildNote((rs as any)?.success ? 'Upcoming sessions rebuilt from the plan.' : 'Nothing to rebuild.');
      } catch (e) {
        setRebuildNote('Could not rebuild. Try again.');
        console.warn('[StateAdjustLens] rebuild failed:', e);
      } finally { setRebuilding(false); }
    })();
  };
  return (
    <div className="px-0.5">
      <p className="text-[13px] text-white/55 mb-4 leading-snug">
        Everything here changes your training from today forward. Nothing applies on its own.
      </p>

      <section className="mb-5">
        <div className="text-[12px] uppercase tracking-wider text-white/45 mb-2">The block</div>
        <button
          type="button"
          disabled={rebuilding}
          onClick={rebuild}
          className="text-[13px] px-3 py-1.5 rounded-lg border border-white/15 bg-white/[0.05] text-white/80 hover:bg-white/[0.08] disabled:opacity-50"
        >
          {rebuilding ? 'Rebuilding…' : 'Rebuild upcoming sessions'}
        </button>
        <p className="text-[11px] text-white/35 mt-2 leading-snug">
          Rewrites the sessions you have not started from the plan. Same lifts, weights and days. Done sessions are not touched.
        </p>
        {rebuildNote && <p className="text-[12px] text-white/60 mt-1.5">{rebuildNote}</p>}
      </section>

      {/* STRENGTH — the deepest steer (swap / add / adjust weight already built; re-homing here next) */}
      <section className="mb-5">
        <div className="text-[12px] uppercase tracking-wider text-white/45 mb-2">Strength</div>
        {perLift.length === 0 ? (
          <p className="text-[13px] text-white/40 leading-snug">Logged lifts show up here.</p>
        ) : (
          <div className="space-y-1.5">
            {perLift.map((lt) => (
              <div key={lt.canonical_name} className="flex items-center justify-between py-1">
                <span className="text-[13px] text-white/80">{lt.display_name ?? lt.canonical_name}</span>
                <span className="text-[12px] text-white/35">adjust · swap · add</span>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-white/35 mt-2.5 leading-snug">
          Swap, add, and weight changes live in the logger for now.
        </p>
      </section>

      {/* ENDURANCE — load steering (ease / push) lands here next */}
      <section>
        <div className="text-[12px] uppercase tracking-wider text-white/45 mb-2">Run · Bike · Swim</div>
        <p className="text-[13px] text-white/40 leading-snug">
          Ease or push each discipline's load — coming next.
        </p>
      </section>
    </div>
  );
}

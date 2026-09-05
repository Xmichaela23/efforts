// State-as-hub "Adjust" lens (D-316) — v0 scaffold.
//
// The Adjust tab mirrors the discipline layout of Status, but each row is a HANDLE to steer that
// discipline (changes WHAT you do). v0 lays out the disciplines and names the steer each one gets;
// the functional controls (strength swap/add/weight already exist in the logger + StrengthAdjustmentModal;
// endurance ease/push next) get re-homed here in the next pass. Nothing here changes your plan yet —
// no dead buttons that pretend to work; honest labels for what lands where. Consent-first throughout.

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppContext } from '@/contexts/AppContext';
import { resolveStrengthCapacity } from '@shared/state-trend/capacity-resolver';
import { resolveCurrentFtp } from '@/lib/resolve-current-ftp';
import { resolveCurrentRunThresholdPace, resolveCurrentRunEasyPace } from '@/lib/resolve-current-run-pace';

// The numbers the block is priced from, read through the SAME resolvers Training Baselines and the plan
// builder use (Michael, 2026-09-05: "add the current e1RM, FTP, running threshold pace, easy pace").
const sourceWord = (src: string | null | undefined): string => {
  const v = String(src ?? '').toLowerCase();
  if (!v || v === 'none') return '';
  if (v === 'locked' || v === 'typed' || v === 'manual' || v.startsWith('manual')) return 'your number';
  if (v === 'accepted') return 'accepted';
  return 'auto';
};
const fmtPace = (secPerMi: number | null | undefined, metric: boolean): string | null => {
  if (secPerMi == null || !Number.isFinite(secPerMi) || secPerMi <= 0) return null;
  const s = metric ? secPerMi / 1.609344 : secPerMi;
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}/${metric ? 'km' : 'mi'}`;
};

type Lift = { canonical_name: string; display_name?: string };

export default function StateAdjustLens({ perLift }: { perLift: Lift[] }) {
  // 2026-09-03 (Michael: "maybe it should be here"): the one control that already works — rewrite the
  // unstarted sessions of the block from the plan (same lifts, weights, days; completed sessions never
  // touched). It used to fire only as a side effect of saving Baselines after a lift lock changed.
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildNote, setRebuildNote] = useState<string | null>(null);
  const { loadUserBaselines } = useAppContext();
  const [baselines, setBaselines] = useState<any | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadUserBaselines?.().then((b: any) => { if (!cancelled && b) setBaselines(b); }).catch(() => {});
    return () => { cancelled = true; };
  }, [loadUserBaselines]);
  const pn = baselines ? (baselines.performanceNumbers ?? baselines.performance_numbers ?? null) : null;
  const lf = baselines?.learned_fitness ?? null;
  const metric = baselines?.units === 'metric';
  const liftNumber = (canonical: string): string | null => {
    if (!baselines) return null;
    const r = resolveStrengthCapacity({ key: canonical, typed: pn, learnedStrength1rms: lf?.strength_1rms ?? null, locked: baselines.locked_baselines ?? null, asOf: new Date().toISOString().slice(0, 10) });
    if (r.value == null) return null;
    const w = sourceWord(r.source);
    return `${Math.round(r.value)} ${metric ? 'kg' : 'lb'}${w ? ` · ${w}` : ''}`;
  };
  const ftp = baselines ? resolveCurrentFtp({ learned_fitness: lf, performance_numbers: pn } as any) : null;
  const thr = baselines ? resolveCurrentRunThresholdPace({ learned_fitness: lf, performance_numbers: pn } as any) : null;
  const easy = baselines ? resolveCurrentRunEasyPace({ learned_fitness: lf, performance_numbers: pn } as any) : null;
  const withSource = (num: string | null, src: string | null | undefined) => num ? `${num}${sourceWord(src) ? ` · ${sourceWord(src)}` : ''}` : null;
  const [repricing, setRepricing] = useState(false);
  const [repriceNote, setRepriceNote] = useState<string | null>(null);
  // Endurance re-price = the six-week checkpoint's own accept path (endurance-checkpoint `reprice`), which
  // rewrites the unstarted endurance rows through materialize-plan from the current FTP and paces.
  const repriceEndurance = () => {
    void (async () => {
      setRepricing(true); setRepriceNote(null);
      try {
        const { data: rs, error } = await supabase.functions.invoke('endurance-checkpoint', { body: { reprice: true } });
        if (error) throw error;
        const n = Number((rs as any)?.rows_repriced ?? 0);
        setRepriceNote(n > 0 ? `${n} endurance session${n === 1 ? '' : 's'} re-priced from your current numbers.` : 'Nothing to re-price.');
      } catch (e) {
        setRepriceNote('Could not re-price. Try again.');
        console.warn('[StateAdjustLens] endurance re-price failed:', e);
      } finally { setRepricing(false); }
    })();
  };
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
                <span className="text-[14px] text-white/85">{lt.display_name ?? lt.canonical_name}</span>
                <span className="text-[14px] text-white/90 tabular-nums">{liftNumber(lt.canonical_name) ?? <span className="text-white/35">no number yet</span>}</span>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-white/35 mt-2.5 leading-snug">
          Swap, add, and weight changes live in the logger for now.
        </p>
      </section>

      {/* ENDURANCE — the numbers the run and ride sessions are priced from, and the re-price. */}
      <section>
        <div className="text-[12px] uppercase tracking-wider text-white/45 mb-2">Run · Bike</div>
        <div className="space-y-1.5">
          {([
            ['FTP', withSource(ftp?.value != null ? `${Math.round(ftp.value)} W` : null, ftp?.source)],
            ['Threshold pace', withSource(fmtPace(thr?.sec_per_mi, metric), thr?.source)],
            ['Easy pace', withSource(fmtPace(easy?.sec_per_mi, metric), easy?.source)],
          ] as Array<[string, string | null]>).map(([name, val]) => (
            <div key={name} className="flex items-center justify-between py-1">
              <span className="text-[14px] text-white/85">{name}</span>
              <span className="text-[14px] text-white/90 tabular-nums">{val ?? <span className="text-white/35">no number yet</span>}</span>
            </div>
          ))}
        </div>
        <button
          type="button"
          disabled={repricing}
          onClick={repriceEndurance}
          className="mt-3 text-[13px] px-3 py-1.5 rounded-lg border border-white/15 bg-white/[0.05] text-white/80 hover:bg-white/[0.08] disabled:opacity-50"
        >
          {repricing ? 'Re-pricing…' : 'Re-price upcoming endurance sessions'}
        </button>
        <p className="text-[11px] text-white/35 mt-2 leading-snug">
          Rewrites the run and ride sessions you have not started from the numbers above. Done sessions are not touched.
        </p>
        {repriceNote && <p className="text-[12px] text-white/60 mt-1.5">{repriceNote}</p>}
      </section>
    </div>
  );
}

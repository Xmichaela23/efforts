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
import { resolveStrengthCapacity, canonicalizeLiftKey } from '@shared/state-trend/capacity-resolver';
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
  const { loadUserBaselines, saveUserBaselines } = useAppContext();
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
  // ⛔ EDIT IN PLACE (Michael, 2026-09-05: "lost the edit option — the whole point"). Tap a number, type, save.
  // Writes go through AppContext.saveUserBaselines — the SAME save Training Baselines uses — with the same
  // fields: a lift becomes `locked_baselines[key]` (your number, auto off); FTP becomes `performanceNumbers.ftp`
  // + `ftp_source: 'manual'`; threshold pace becomes `threshold_pace_min_per_mi` ("m:ss", per mile) +
  // `threshold_pace_source: 'manual'`. Easy pace is threshold × 1.19 (the resolver's one rule) and is not edited.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const reload = () => loadUserBaselines?.().then((b: any) => { if (b) setBaselines(b); }).catch(() => {});
  const parsePace = (t: string): number | null => { const m = t.trim().match(/^(\d{1,2}):(\d{2})$/); if (!m) return null; const sec = Number(m[1]) * 60 + Number(m[2]); return sec > 0 ? sec : null; };
  const commit = async (id: string) => {
    if (!baselines) return;
    const t = draft.trim();
    try {
      if (id === 'ftp') {
        const v = Math.round(Number(t)); if (!(v > 0)) return;
        await saveUserBaselines({ ...baselines, performanceNumbers: { ...(pn ?? {}), ftp: v, ftp_source: 'manual' } });
      } else if (id === 'threshold') {
        const sec = parsePace(t); if (sec == null) return;
        const secPerMi = metric ? sec * 1.609344 : sec;
        const str = `${Math.floor(secPerMi / 60)}:${String(Math.round(secPerMi % 60)).padStart(2, '0')}`;
        await saveUserBaselines({ ...baselines, performanceNumbers: { ...(pn ?? {}), threshold_pace_min_per_mi: str, threshold_pace_source: 'manual' } });
      } else {
        const key = canonicalizeLiftKey(id); const v = Math.round(Number(t)); if (!key || !(v > 0)) return;
        await saveUserBaselines({ ...baselines, locked_baselines: { ...(baselines.locked_baselines ?? {}), [key]: v } });
      }
      setSaveNote('Saved. Tap "Rebuild upcoming sessions" to apply it to the block.');
      await reload();
    } catch (e) {
      setSaveNote('Could not save. Try again.');
      console.warn('[StateAdjustLens] save failed:', e);
    } finally { setEditing(null); setDraft(''); }
  };
  const Row = ({ id, name, value, editable = true, hint }: { id: string; name: string; value: string | null; editable?: boolean; hint?: string }) => (
    <div className="flex items-center justify-between py-1 gap-3">
      <span className="text-[14px] text-white/85">{name}</span>
      {editing === id ? (
        <span className="flex items-center gap-2">
          <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void commit(id); if (e.key === 'Escape') { setEditing(null); setDraft(''); } }}
            inputMode={id === 'threshold' ? 'numeric' : 'decimal'} placeholder={hint} className="w-24 bg-white/[0.06] border border-white/20 rounded-md px-2 py-1 text-[14px] text-white/90 text-right tabular-nums outline-none" />
          <button type="button" onClick={() => void commit(id)} className="text-[12px] text-white/80 px-2 py-1 rounded-md border border-white/15">save</button>
          <button type="button" onClick={() => { setEditing(null); setDraft(''); }} className="text-[12px] text-white/45 px-1 py-1">cancel</button>
        </span>
      ) : editable ? (
        <button type="button" onClick={() => { setEditing(id); setDraft(''); setSaveNote(null); }} className="text-[14px] text-white/90 tabular-nums underline decoration-white/25 underline-offset-4 outline-none focus:outline-none">
          {value ?? <span className="text-white/35 no-underline">tap to add</span>}
        </button>
      ) : (
        <span className="text-[14px] text-white/90 tabular-nums">{value ?? <span className="text-white/35">no number yet</span>}</span>
      )}
    </div>
  );
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
              <Row key={lt.canonical_name} id={lt.canonical_name} name={lt.display_name ?? lt.canonical_name} value={liftNumber(lt.canonical_name)} hint={metric ? 'kg' : 'lb'} />
            ))}
          </div>
        )}
        <p className="text-[11px] text-white/35 mt-2.5 leading-snug">
          Tap a number to set your own. Swaps and added movements live in the logger.
        </p>
      </section>

      {/* ENDURANCE — the numbers the run and ride sessions are priced from, and the re-price. */}
      <section>
        <div className="text-[12px] uppercase tracking-wider text-white/45 mb-2">Run · Bike</div>
        <div className="space-y-1.5">
          <Row id="ftp" name="FTP" value={withSource(ftp?.value != null ? `${Math.round(ftp.value)} W` : null, ftp?.source)} hint="W" />
          <Row id="threshold" name="Threshold pace" value={withSource(fmtPace(thr?.sec_per_mi, metric), thr?.source)} hint={metric ? 'm:ss/km' : 'm:ss/mi'} />
          <Row id="easy" name="Easy pace" value={withSource(fmtPace(easy?.sec_per_mi, metric), easy?.source)} editable={false} />
        </div>
        <p className="text-[11px] text-white/35 mt-2 leading-snug">
          Tap FTP or threshold pace to set your own. Easy pace follows threshold. Rebuild above to apply.
        </p>
        {saveNote && <p className="text-[12px] text-white/60 mt-1.5">{saveNote}</p>}
      </section>
    </div>
  );
}

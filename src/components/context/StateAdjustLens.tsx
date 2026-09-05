// State-as-hub "Adjust" lens (D-316) — v0 scaffold.
//
// The Adjust tab mirrors the discipline layout of Status, but each row is a HANDLE to steer that
// discipline (changes WHAT you do). v0 lays out the disciplines and names the steer each one gets;
// the functional controls (strength swap/add/weight already exist in the logger + StrengthAdjustmentModal;
// endurance ease/push next) get re-homed here in the next pass. Nothing here changes your plan yet —
// no dead buttons that pretend to work; honest labels for what lands where. Consent-first throughout.

import { useEffect, useState } from 'react';
import { Pencil, Dumbbell, Activity, Bike } from 'lucide-react';
import { getDisciplineColor } from '@/lib/context-utils';
import { supabase, getStoredUserId } from '@/lib/supabase';
import { useAppContext } from '@/contexts/AppContext';
import { resolveStrengthCapacity, canonicalizeLiftKey } from '@shared/state-trend/capacity-resolver';
import { resolveCurrentFtp, pendingFtpProposal, acceptEstimatedFtp } from '@/lib/resolve-current-ftp';
import { resolveCurrentRunThresholdPace, resolveCurrentRunEasyPace } from '@/lib/resolve-current-run-pace';
import { resolveCurrentLthr } from '@/lib/resolve-current-lthr';
import { usePlannedWorkouts } from '@/hooks/usePlannedWorkouts';
import { runThresholdTestRow, ftpTestRow, ftp5MinTestRow, addDaysISO } from '@/lib/baseline-tests';

// The numbers the block is priced from, read through the SAME resolvers Training Baselines and the plan
// builder use (Michael, 2026-09-05: "add the current e1RM, FTP, running threshold pace, easy pace").
const sourceWord = (src: string | null | undefined): string => {
  const v = String(src ?? '').toLowerCase();
  if (!v || v === 'none') return '';
  if (v === 'locked' || v === 'typed' || v === 'manual' || v.startsWith('manual')) return 'your number';
  if (v === 'accepted') return 'accepted';
  return 'auto';
};
const SportHeading = ({ sport, label }: { sport: 'strength' | 'run' | 'bike'; label: string }) => {
  const Icon = sport === 'strength' ? Dumbbell : sport === 'run' ? Activity : Bike;
  const color = getDisciplineColor(sport);
  return (
    <div className="flex items-center gap-2 mb-2">
      <Icon size={14} strokeWidth={2.25} style={{ color }} aria-hidden="true" />
      <span className="text-[12px] uppercase tracking-[0.14em]" style={{ color }}>{label}</span>
    </div>
  );
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
  // The FTP the rides measured, waiting on acceptance (TrainerRoad's proposed-then-accepted). Same write as
  // Training Baselines' "use it": accept into learned_fitness, then re-price the unstarted endurance rows.
  const proposal = baselines ? pendingFtpProposal({ learned_fitness: lf, performance_numbers: pn } as any) : null;
  const [accepting, setAccepting] = useState(false);
  const acceptFtp = () => {
    void (async () => {
      const uid = getStoredUserId(); if (!uid) return;
      setAccepting(true); setSaveNote(null);
      try {
        const { data: row } = await supabase.from('user_baselines').select('learned_fitness').eq('user_id', uid).maybeSingle();
        const raw = row?.learned_fitness; const cur = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const next = acceptEstimatedFtp(cur as any, 'baselines'); if (!next) return;
        const { error } = await supabase.from('user_baselines').update({ learned_fitness: next, updated_at: new Date().toISOString() }).eq('user_id', uid);
        if (error) throw error;
        let note = `${Math.round(Number((next.ride_ftp_accepted as any).value))} W in use.`;
        try { const { data: rp } = await supabase.functions.invoke('endurance-checkpoint', { body: { reprice: true } }); const n = Number((rp as any)?.rows_repriced ?? 0); if (n > 0) note += ` ${n} upcoming session${n === 1 ? '' : 's'} re-priced.`; } catch { /* the accept stands; rebuild covers it */ }
        setSaveNote(note);
        await reload();
      } catch (e) { setSaveNote('Could not accept. Try again.'); console.warn('[StateAdjustLens] accept FTP failed:', e); }
      finally { setAccepting(false); }
    })();
  };
  const lthr = baselines ? resolveCurrentLthr({ learned_fitness: lf, performance_numbers: pn, configured_hr_zones: baselines.configured_hr_zones ?? null } as any) : null;
  const withSource = (num: string | null, src: string | null | undefined) => num ? `${num}${sourceWord(src) ? ` · ${sourceWord(src)}` : ''}` : null;
  // ⛔ EDIT IN PLACE (Michael, 2026-09-05: "lost the edit option — the whole point"). Tap a number, type, save.
  // Writes go through AppContext.saveUserBaselines — the SAME save Training Baselines uses — with the same
  // fields: a lift becomes `locked_baselines[key]` (your number, auto off); FTP becomes `performanceNumbers.ftp`
  // + `ftp_source: 'manual'`; threshold pace becomes `threshold_pace_min_per_mi` ("m:ss", per mile) +
  // `threshold_pace_source: 'manual'`. Easy pace is threshold × 1.19 (the resolver's one rule) and is not edited.
  // ⛔ DELOAD — the book's TAPER/DELOAD column (p274), deployed by the athlete, never scheduled (p120 rejects
  // overreach-to-deload). Read the plan's current week + deload weeks from the rebuild's dry run; toggling
  // next week calls the same rebuild with `taper_weeks` and applies.
  const [deload, setDeload] = useState<{ currentWeek: number; weeks: number; taperWeeks: number[] } | null>(null);
  const [deloadBusy, setDeloadBusy] = useState(false);
  const [deloadNote, setDeloadNote] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void supabase.functions.invoke('rematerialize-standing-block', { body: { apply: false } }).then(({ data }) => {
      const d = data as any;
      if (cancelled || !d?.success || typeof d.current_week !== 'number') return;
      setDeload({ currentWeek: d.current_week, weeks: Number(d.weeks) || 12, taperWeeks: Array.isArray(d.taper_weeks) ? d.taper_weeks.map(Number) : [] });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const nextWeek = deload ? deload.currentWeek + 1 : null;
  const nextIsDeload = !!(deload && nextWeek != null && deload.taperWeeks.includes(nextWeek));
  const toggleDeload = () => {
    if (!deload || nextWeek == null || nextWeek > deload.weeks) return;
    const next = nextIsDeload ? deload.taperWeeks.filter((w) => w !== nextWeek) : [...deload.taperWeeks, nextWeek];
    void (async () => {
      setDeloadBusy(true); setDeloadNote(null);
      try {
        const { data: rs, error } = await supabase.functions.invoke('rematerialize-standing-block', { body: { apply: true, taper_weeks: next } });
        if (error) throw error;
        const d = rs as any;
        setDeload({ ...deload, taperWeeks: Array.isArray(d?.taper_weeks) ? d.taper_weeks.map(Number) : next });
        setDeloadNote(nextIsDeload ? `Week ${nextWeek} is back to the standard week.` : `Week ${nextWeek} is a deload week. Sessions rebuilt.`);
      } catch (e) {
        setDeloadNote('Could not change it. Try again.');
        console.warn('[StateAdjustLens] deload toggle failed:', e);
      } finally { setDeloadBusy(false); }
    })();
  };
  // ⛔ RETEST (Michael, 2026-09-05: tests live on Adjust, not a tab). Run threshold and FTP tests are the SAME
  // rows Training Baselines and the wizard schedule (`baseline-tests.ts`, same helper), 3 and 2 days out as
  // Baselines defaults them. The lifts open the logger's test flow (Lower / Upper / Full Body), the same
  // entry Baselines uses. A scheduled test is detected by its tag (`run_test` / `ftp_test`), the contract.
  const { addPlannedWorkout } = usePlannedWorkouts() as any;
  const [scheduled, setScheduled] = useState<{ run: { id: string; date: string } | null; ftp: { id: string; date: string } | null; ftp5: { id: string; date: string } | null }>({ run: null, ftp: null, ftp5: null });
  const [testBusy, setTestBusy] = useState<string | null>(null);
  const refreshScheduled = async () => {
    const uid = getStoredUserId(); if (!uid) return;
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase.from('planned_workouts').select('id, date, tags').eq('user_id', uid).eq('workout_status', 'planned').gte('date', today).order('date');
    const rows = (data ?? []) as Array<{ id: string; date: string; tags?: string[] | null }>;
    const find = (tag: string, not?: string) => { const r = rows.find((x) => Array.isArray(x.tags) && x.tags.includes(tag) && !(not && x.tags.includes(not))); return r ? { id: r.id, date: r.date } : null; };
    setScheduled({ run: find('run_test'), ftp: find('ftp_test', 'ftp_test_5min'), ftp5: find('ftp_test_5min') });
  };
  useEffect(() => { void refreshScheduled(); }, []);
  const scheduleTest = (kind: 'run' | 'ftp' | 'ftp5') => {
    void (async () => {
      setTestBusy(kind);
      try {
        const today = new Date().toISOString().slice(0, 10);
        const row = kind === 'run' ? runThresholdTestRow(addDaysISO(today, 3)) : kind === 'ftp5' ? ftp5MinTestRow(addDaysISO(today, 2)) : ftpTestRow(addDaysISO(today, 2));
        await addPlannedWorkout(row as any);
        await refreshScheduled();
      } catch (e) { console.warn('[StateAdjustLens] schedule test failed:', e); }
      finally { setTestBusy(null); }
    })();
  };
  const removeTest = (kind: 'run' | 'ftp' | 'ftp5') => {
    const t = scheduled[kind]; if (!t) return;
    void (async () => {
      setTestBusy(kind);
      try { await supabase.from('planned_workouts').delete().eq('id', t.id); await refreshScheduled(); }
      catch (e) { console.warn('[StateAdjustLens] remove test failed:', e); }
      finally { setTestBusy(null); }
    })();
  };
  const openLiftTest = (which: 'Lower' | 'Upper' | 'Full Body') => {
    window.dispatchEvent(new CustomEvent('baselines:openTest', { detail: { testName: `Baseline Test: ${which}` } }));
  };
  const fmtDay = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
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
      } else if (id === 'lthr') {
        const v = Math.round(Number(t)); if (!(v > 0)) return;
        // The zones object Baselines writes (manual_run_lthr + the sport-agnostic threshold_heart_rate), same column.
        const uid = getStoredUserId();
        const zones = { ...((baselines.configured_hr_zones && typeof baselines.configured_hr_zones === 'object') ? baselines.configured_hr_zones : {}), source: 'manual', custom_zones: true, updated_at: new Date().toISOString(), manual_run_lthr: v, threshold_heart_rate: v };
        if (uid) { const { error } = await supabase.from('user_baselines').update({ configured_hr_zones: zones }).eq('user_id', uid); if (error) throw error; }
        await saveUserBaselines({ ...baselines, configured_hr_zones: zones, performanceNumbers: { ...(pn ?? {}), lthr_source: 'manual' } });
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
  const Row = ({ id, name, value, editable = true, hint, sport }: { id: string; name: string; value: string | null; editable?: boolean; hint?: string; sport: 'strength' | 'run' | 'bike' }) => (
    <div className="flex items-center justify-between py-1 gap-3">
      <span className="text-[14px] text-white/85">{name}</span>
      {editing === id ? (
        <span className="flex items-center gap-2">
          <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void commit(id); if (e.key === 'Escape') { setEditing(null); setDraft(''); } }}
            inputMode={id === 'threshold' ? 'numeric' : 'decimal'} placeholder={hint} className="w-24 bg-white/[0.06] border border-white/20 rounded-md px-2 py-1 text-[16px] text-white/90 text-right tabular-nums outline-none" />
          <button type="button" onClick={() => void commit(id)} className="text-[12px] text-white/80 px-2 py-1 rounded-md border border-white/15">save</button>
          <button type="button" onClick={() => { setEditing(null); setDraft(''); }} className="text-[12px] text-white/45 px-1 py-1">cancel</button>
        </span>
      ) : editable ? (
        <button type="button" onClick={() => { setEditing(id); setDraft(''); setSaveNote(null); }} aria-label={`edit ${name}`}
          style={{ borderColor: `${getDisciplineColor(sport)}55`, background: `${getDisciplineColor(sport)}14` }}
          className="inline-flex items-center gap-1.5 pl-2.5 pr-2 py-1 rounded-lg border text-[14px] text-white/90 tabular-nums outline-none focus:outline-none active:brightness-125">
          {value ?? <span className="text-white/45">tap to add</span>}
          <Pencil size={12} strokeWidth={2} style={{ color: getDisciplineColor(sport) }} className="shrink-0 opacity-80" aria-hidden="true" />
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
    <div className="px-0.5 overflow-x-hidden">
      <p className="text-[14px] text-white/70 mb-4 leading-snug">
        Everything here changes your training from today forward. Nothing applies on its own.
      </p>

      <section className="mb-5">
        <div className="text-[12px] uppercase tracking-wider text-white/60 mb-2">The block</div>
        <button
          type="button"
          disabled={rebuilding}
          onClick={rebuild}
          className="text-[13px] px-3 py-1.5 rounded-lg border border-white/15 bg-white/[0.05] text-white/80 hover:bg-white/[0.08] disabled:opacity-50"
        >
          {rebuilding ? 'Rebuilding…' : 'Rebuild upcoming sessions'}
        </button>
        <p className="text-[13px] text-white/60 mt-2 leading-snug">
          Rewrites the sessions you have not started from the plan. Same lifts, weights and days. Done sessions are not touched.
        </p>
        {rebuildNote && <p className="text-[13px] text-white/75 mt-1.5">{rebuildNote}</p>}
      </section>

      {deload && nextWeek != null && nextWeek <= deload.weeks && (
        <section className="mb-5">
          <div className="text-[12px] uppercase tracking-wider text-white/60 mb-2">Deload</div>
          <button
            type="button"
            disabled={deloadBusy}
            onClick={toggleDeload}
            className="text-[13px] px-3 py-1.5 rounded-lg border border-white/15 bg-white/[0.05] text-white/80 hover:bg-white/[0.08] disabled:opacity-50"
          >
            {deloadBusy ? 'Rebuilding…' : nextIsDeload ? `Week ${nextWeek}: deload on · make it standard` : `Make week ${nextWeek} a deload week`}
          </button>
          <p className="text-[13px] text-white/60 mt-2 leading-snug">
            Max-effort sets become skill and speed sets, the extra lower-body sets come out, and the endurance sessions drop a level. Switch to it two weeks out from a race or a meet. It is not a scheduled light week: the standard week is built to be run indefinitely.
          </p>
          {deload.taperWeeks.length > 0 && <p className="text-[11px] text-white/45 mt-1">Deload weeks: {deload.taperWeeks.join(', ')}</p>}
          {deloadNote && <p className="text-[13px] text-white/75 mt-1.5">{deloadNote}</p>}
        </section>
      )}

      <section className="mb-5">
        <div className="text-[12px] uppercase tracking-wider text-white/60 mb-2">Retest</div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => openLiftTest('Lower')} className="text-[13px] px-3 py-1.5 rounded-lg border border-white/15 bg-white/[0.05] text-white/80">Lower lifts</button>
          <button type="button" onClick={() => openLiftTest('Upper')} className="text-[13px] px-3 py-1.5 rounded-lg border border-white/15 bg-white/[0.05] text-white/80">Upper lifts</button>
          {scheduled.run ? (
            <button type="button" disabled={testBusy === 'run'} onClick={() => removeTest('run')} className="text-[13px] px-3 py-1.5 rounded-lg border border-white/15 bg-white/[0.05] text-white/80 disabled:opacity-50">Run threshold · {fmtDay(scheduled.run.date)} · remove</button>
          ) : (
            <button type="button" disabled={testBusy === 'run'} onClick={() => scheduleTest('run')} className="text-[13px] px-3 py-1.5 rounded-lg border border-white/15 bg-white/[0.05] text-white/80 disabled:opacity-50">Run threshold</button>
          )}
          {scheduled.ftp ? (
            <button type="button" disabled={testBusy === 'ftp'} onClick={() => removeTest('ftp')} className="text-[13px] px-3 py-1.5 rounded-lg border border-white/15 bg-white/[0.05] text-white/80 disabled:opacity-50">FTP · {fmtDay(scheduled.ftp.date)} · remove</button>
          ) : (
            <button type="button" disabled={testBusy === 'ftp'} onClick={() => scheduleTest('ftp')} className="text-[13px] px-3 py-1.5 rounded-lg border border-white/15 bg-white/[0.05] text-white/80 disabled:opacity-50">FTP · 20 min</button>
          )}
          {scheduled.ftp5 ? (
            <button type="button" disabled={testBusy === 'ftp5'} onClick={() => removeTest('ftp5')} className="text-[13px] px-3 py-1.5 rounded-lg border border-white/15 bg-white/[0.05] text-white/80 disabled:opacity-50">FTP · 5 min · {fmtDay(scheduled.ftp5.date)} · remove</button>
          ) : (
            <button type="button" disabled={testBusy === 'ftp5'} onClick={() => scheduleTest('ftp5')} className="text-[13px] px-3 py-1.5 rounded-lg border border-white/15 bg-white/[0.05] text-white/80 disabled:opacity-50">FTP · 5 min</button>
          )}
        </div>
        <p className="text-[13px] text-white/60 mt-2 leading-snug">
          Lifts open the test session in the logger now. Run threshold and FTP tests go on the calendar three and two days out. The 5-minute test is all-out with no pacing, so it repeats well; the 20-minute one is the classic. A logged test re-prices the block.
        </p>
      </section>

      {/* STRENGTH — the deepest steer (swap / add / adjust weight already built; re-homing here next) */}
      <section className="mb-5">
        <SportHeading sport="strength" label="Strength" />
        {perLift.length === 0 ? (
          <p className="text-[13px] text-white/40 leading-snug">Logged lifts show up here.</p>
        ) : (
          <div className="space-y-1.5">
            {perLift.map((lt) => (
              <Row key={lt.canonical_name} id={lt.canonical_name} name={lt.display_name ?? lt.canonical_name} value={liftNumber(lt.canonical_name)} hint={metric ? 'kg' : 'lb'} sport="strength" />
            ))}
          </div>
        )}
        <p className="text-[13px] text-white/60 mt-2.5 leading-snug">
          Tap a number to set your own. Swaps and added movements live in the logger.
        </p>
      </section>

      {/* ENDURANCE — the numbers the run and ride sessions are priced from, and the re-price. */}
      <section>
        <SportHeading sport="run" label="Run" />
        <div className="space-y-1.5">
          <Row id="threshold" name="Threshold pace" value={withSource(fmtPace(thr?.sec_per_mi, metric), thr?.source)} hint={metric ? 'm:ss/km' : 'm:ss/mi'} sport="run" />
          <Row id="lthr" name="Threshold heart rate" value={withSource(lthr?.bpm != null ? `${Math.round(lthr.bpm)} bpm` : null, lthr?.source)} hint="bpm" sport="run" />
          <Row id="easy" name="Easy pace" value={fmtPace(easy?.sec_per_mi, metric) ? `${fmtPace(easy?.sec_per_mi, metric)} · from threshold` : null} editable={false} sport="run" />
        </div>
        <div className="mt-4">
          <SportHeading sport="bike" label="Bike" />
          <div className="space-y-1.5">
            <Row id="ftp" name="FTP" value={withSource(ftp?.value != null ? `${Math.round(ftp.value)} W` : null, ftp?.source)} hint="W" sport="bike" />
            {proposal && (
              <div className="flex items-center justify-between py-1 gap-3">
                <span className="text-[13px] text-white/70">Your rides measure {Math.round(proposal.measured)} W</span>
                <button type="button" disabled={accepting} onClick={acceptFtp} style={{ borderColor: `${getDisciplineColor('bike')}88`, color: getDisciplineColor('bike') }} className="text-[13px] px-3 py-1 rounded-lg border bg-white/[0.04] disabled:opacity-50">{accepting ? 'Applying…' : `use ${Math.round(proposal.measured)} W`}</button>
              </div>
            )}
          </div>
        </div>
        <p className="text-[13px] text-white/60 mt-2 leading-snug">
          Tap a number to set your own. Easy days run on threshold heart rate; easy pace is threshold pace × 1.19. Rebuild above to apply.
        </p>
        {saveNote && <p className="text-[13px] text-white/75 mt-1.5">{saveNote}</p>}
      </section>
    </div>
  );
}

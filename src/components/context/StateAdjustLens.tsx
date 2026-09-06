// State-as-hub "Adjust" lens (D-316) — v0 scaffold.
//
// The Adjust tab mirrors the discipline layout of Status, but each row is a HANDLE to steer that
// discipline (changes WHAT you do). v0 lays out the disciplines and names the steer each one gets;
// the functional controls (strength swap/add/weight already exist in the logger + StrengthAdjustmentModal;
// endurance ease/push next) get re-homed here in the next pass. Nothing here changes your plan yet —
// no dead buttons that pretend to work; honest labels for what lands where. Consent-first throughout.

import React, { useEffect, useState } from 'react';
import { Pencil, Dumbbell, Activity, Bike, Layers, Feather } from 'lucide-react';
import { getDisciplineColor } from '@/lib/context-utils';
import { readoutPlateStyle } from '@/lib/readout-plate';
import { supabase, getStoredUserId } from '@/lib/supabase';
import { useAppContext } from '@/contexts/AppContext';
import { resolveStrengthCapacity, canonicalizeLiftKey } from '@shared/state-trend/capacity-resolver';
import { resolveCurrentFtp, pendingFtpProposal, acceptEstimatedFtp } from '@/lib/resolve-current-ftp';
import { resolveCurrentRunThresholdPace, resolveCurrentRunEasyPace, pendingRunThresholdProposal, acceptLearnedRunThreshold } from '@/lib/resolve-current-run-pace';
import { resolveCurrentLthr } from '@/lib/resolve-current-lthr';
import { frielZones } from '@shared/endurance/hr-zones';
import { usePlannedWorkouts } from '@/hooks/usePlannedWorkouts';
import { runThresholdTestRow, ftpTestRow, ftp5MinTestRow, addDaysISO } from '@/lib/baseline-tests';

// The numbers the block is priced from, read through the SAME resolvers Training Baselines and the plan
// builder use (Michael, 2026-09-05: "add the current e1RM, FTP, running threshold pace, easy pace").
// While the server re-prices row by row (30 rows on a full block), the screen says so — leaving mid-way is not
// guaranteed to finish (Michael, 2026-09-05).
const REPRICE_WAIT = 'Updating your upcoming sessions…';
const sourceWord = (src: string | null | undefined): string => {
  const v = String(src ?? '').toLowerCase();
  if (!v || v === 'none') return '';
  if (v === 'locked' || v === 'typed' || v === 'manual' || v.startsWith('manual')) return 'your number';
  if (v === 'accepted') return 'accepted';
  return 'auto';
};
// The heading carries LOAD's ⓘ (LoadBar.tsx): one line stays under the sport, the rest opens here.
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
  /**
   * ⛔ THE SECTIONS ARE THE ATHLETE'S TO ORDER (Michael, 2026-09-05: "a similar movable container for user
   * priority"), the same mechanism as the State rows: device copy in localStorage, account copy in
   * `user_baselines.ui_prefs.adjust_section_order`. The plate wears the FORGE variant of the galaxy
   * texture (index.css): side-lit, violet, scanlines — same family as State, different room.
   */
  const SECTION_ORDER_KEY = 'efforts:adjust_section_order';
  const DEFAULT_SECTIONS = ['block', 'deload', 'strength', 'run', 'bike'];
  const [sectionOrder, setSectionOrder] = useState<string[]>(() => {
    try { const v = JSON.parse(localStorage.getItem(SECTION_ORDER_KEY) || 'null'); return Array.isArray(v) && v.length ? v : DEFAULT_SECTIONS; } catch { return DEFAULT_SECTIONS; }
  });
  const [reordering, setReordering] = useState(false);
  const [infoOpen, setInfoOpen] = useState<Set<string>>(new Set());
  const toggleInfo = (id: string) => setInfoOpen((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  useEffect(() => {
    const o = baselines?.ui_prefs?.adjust_section_order;
    if (Array.isArray(o) && o.length > 0) { setSectionOrder(o); try { localStorage.setItem(SECTION_ORDER_KEY, JSON.stringify(o)); } catch { /* device copy only */ } }
  }, [baselines]);
  const saveSectionOrder = (next: string[]) => {
    setSectionOrder(next);
    try { localStorage.setItem(SECTION_ORDER_KEY, JSON.stringify(next)); } catch { /* device copy only */ }
    const uid = getStoredUserId();
    if (!uid) return;
    const prefs = { ...((baselines?.ui_prefs && typeof baselines.ui_prefs === 'object') ? baselines.ui_prefs : {}), adjust_section_order: next };
    void supabase.from('user_baselines').update({ ui_prefs: prefs }).eq('user_id', uid).then(({ error }) => {
      if (error) console.warn('[Adjust] section order kept on this device only:', error.message);
    });
  };
  // A section missing from the saved order (the deload row is only there when a block is live) keeps
  // its default place instead of dropping to the bottom.
  const effectiveOrder = (): string[] => {
    const known = sectionOrder.filter((id) => DEFAULT_SECTIONS.includes(id));
    for (const id of DEFAULT_SECTIONS) if (!known.includes(id)) known.splice(DEFAULT_SECTIONS.indexOf(id), 0, id);
    return known;
  };
  const moveSection = (id: string, dir: -1 | 1) => {
    const order = effectiveOrder();
    const i = order.indexOf(id); const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    saveSectionOrder(order);
  };
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
      setAccepting(true); setSaveNote(REPRICE_WAIT); setLastSaved('bike');
      try {
        const { data: row } = await supabase.from('user_baselines').select('learned_fitness').eq('user_id', uid).maybeSingle();
        const raw = row?.learned_fitness; const cur = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const next = acceptEstimatedFtp(cur as any, 'baselines'); if (!next) return;
        const { error } = await supabase.from('user_baselines').update({ learned_fitness: next, updated_at: new Date().toISOString() }).eq('user_id', uid);
        if (error) throw error;
        if (pn?.ftp_source === 'manual') { const cleared: any = { ...(pn ?? {}) }; delete cleared.ftp_source; await saveUserBaselines({ ...baselines, performanceNumbers: cleared }); }
        let note = `${Math.round(Number((next.ride_ftp_accepted as any).value))} W in use.`;
        try { note = await repriceEndurance(note); } catch { /* the accept stands */ }
        setSaveNote(note);
        await reload();
      } catch (e) { setSaveNote('Could not accept. Try again.'); console.warn('[StateAdjustLens] accept FTP failed:', e); }
      finally { setAccepting(false); }
    })();
  };
  const thrProposal = baselines ? pendingRunThresholdProposal({ learned_fitness: lf, performance_numbers: pn } as any) : null;
  const [acceptingThr, setAcceptingThr] = useState(false);
  const acceptThr = () => {
    void (async () => {
      const uid = getStoredUserId(); if (!uid) return;
      setAcceptingThr(true); setSaveNote(REPRICE_WAIT); setLastSaved('run');
      try {
        const { data: row } = await supabase.from('user_baselines').select('learned_fitness').eq('user_id', uid).maybeSingle();
        const raw = row?.learned_fitness; const cur = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const next = acceptLearnedRunThreshold(cur as any, 'baselines'); if (!next) return;
        const { error } = await supabase.from('user_baselines').update({ learned_fitness: next, updated_at: new Date().toISOString() }).eq('user_id', uid);
        if (error) throw error;
        if (pn?.threshold_pace_source === 'manual') await saveUserBaselines({ ...baselines, performanceNumbers: { ...(pn ?? {}), threshold_pace_source: 'learned' } });
        let note = `${fmtPace(Number((next.run_threshold_pace_accepted as any).value) * 1.609344, metric)} in use.`;
        try { note = await repriceEndurance(note); } catch { /* the accept stands */ }
        setSaveNote(note);
        await reload();
      } catch (e) { setSaveNote('Could not accept. Try again.'); console.warn('[StateAdjustLens] accept threshold failed:', e); }
      finally { setAcceptingThr(false); }
    })();
  };
  const lthr = baselines ? resolveCurrentLthr({ learned_fitness: lf, performance_numbers: pn, configured_hr_zones: baselines.configured_hr_zones ?? null } as any) : null;
  const withSource = (num: string | null, src: string | null | undefined) => num ? `${num}${sourceWord(src) ? ` · ${sourceWord(src)}` : ''}` : null;
  // ⛔ EDIT IN PLACE (Michael, 2026-09-05: "lost the edit option — the whole point"). Tap a number, type, save.
  // Writes go through AppContext.saveUserBaselines — the SAME save Training Baselines uses — with the same
  // fields: a lift becomes `locked_baselines[key]` (your number, auto off); FTP becomes `performanceNumbers.ftp`
  // + `ftp_source: 'manual'`; threshold pace becomes `threshold_pace_min_per_mi` ("m:ss", per mile) +
  // `threshold_pace_source: 'manual'`. Easy pace is a readout (last five easy runs, else threshold × 1.19) and is not edited.
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
  // ⛔ THE LIFT RETEST IS A CALENDAR ROW (Michael, 2026-09-05): `rematerialize-standing-block` writes today's
  // "Retest: Lower / Upper" row — tagged like week one's test, linked to the plan, p215's ramp aimed by the
  // number the block prices from — and the logger opens on it. The save links the workout to the row; the restate
  // every strength save fires reads the latest tested session per lift (`readTestWeek`, any week) and re-prices
  // the unstarted weeks. Without a standing plan the Baselines launcher session is the fallback (off-plan; it
  // writes the number on file and nothing else).
  const [retestBusy, setRetestBusy] = useState<string | null>(null);
  const openLiftTest = (which: 'Lower' | 'Upper') => {
    void (async () => {
      setRetestBusy(which);
      try {
        const { data, error } = await supabase.functions.invoke('rematerialize-standing-block', { body: { schedule_retest: which.toLowerCase() } });
        const d = data as any;
        if (!error && d?.success && d?.planned) {
          window.dispatchEvent(new CustomEvent('open:strengthLogger', { detail: { planned: d.planned } }));
          window.dispatchEvent(new CustomEvent('week:invalidate'));
          return;
        }
      } catch (e) { console.warn('[StateAdjustLens] retest row failed:', e); }
      finally { setRetestBusy(null); }
      window.dispatchEvent(new CustomEvent('baselines:openTest', { detail: { testName: `Baseline Test: ${which}` } }));
    })();
  };
  const fmtDay = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saveNote, setSaveNote] = useState<string | null>(null);
  // Which sport's section shows the note — the one whose number was just saved.
  const [lastSaved, setLastSaved] = useState<'strength' | 'run' | 'bike' | null>(null);
  const sportOf = (id: string): 'strength' | 'run' | 'bike' => id === 'ftp' ? 'bike' : id === 'threshold' || id === 'lthr' ? 'run' : 'strength';
  const reload = () => loadUserBaselines?.().then((b: any) => { if (b) setBaselines(b); }).catch(() => {});
  const parsePace = (t: string): number | null => { const m = t.trim().match(/^(\d{1,2}):(\d{2})$/); if (!m) return null; const sec = Number(m[1]) * 60 + Number(m[2]); return sec > 0 ? sec : null; };
  const commit = async (id: string) => {
    if (!baselines) return;
    const t = draft.trim();
    setLastSaved(sportOf(id));
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
      setSaveNote(await repriceAfter(id === 'ftp' || id === 'threshold' || id === 'lthr' ? 'endurance' : 'strength'));
      await reload();
    } catch (e) {
      setSaveNote('Could not save. Try again.');
      console.warn('[StateAdjustLens] save failed:', e);
    } finally { setEditing(null); setDraft(''); }
  };
  // The same follow-through Training Baselines runs after its Save: an endurance number re-prices the unstarted
  // run/ride rows (`endurance-checkpoint`), a lift lock restates the block (`rematerialize-standing-block`).
  // The endurance re-price is a background job on the server (endurance-checkpoint `reprice` → `reprice_job` on the
  // plan). Queue it, tell the athlete they can leave, and poll for the count while this screen is open.
  const pollRef = React.useRef<number | null>(null);
  React.useEffect(() => () => { if (pollRef.current) window.clearInterval(pollRef.current); }, []);
  const repriceEndurance = async (prefix: string): Promise<string> => {
    const { data: rp } = await supabase.functions.invoke('endurance-checkpoint', { body: { reprice: true } });
    const d = rp as any;
    if (d?.queued) {
      const total = Number(d.rows_pending ?? 0);
      if (pollRef.current) window.clearInterval(pollRef.current);
      const startedAt = Date.now();
      pollRef.current = window.setInterval(async () => {
        try {
          const { data: st } = await supabase.functions.invoke('endurance-checkpoint', { body: { reprice_status: true } });
          const job = (st as any)?.job;
          if (job?.finished_at) {
            if (pollRef.current) window.clearInterval(pollRef.current); pollRef.current = null;
            setSaveNote(`${prefix} ${Number(job.done ?? 0)} upcoming session${Number(job.done) === 1 ? '' : 's'} re-priced.`);
          } else if (Date.now() - startedAt > 180_000) {
            if (pollRef.current) window.clearInterval(pollRef.current); pollRef.current = null;
          }
        } catch { /* keep polling */ }
      }, 3000);
      return `${prefix} Updating ${total} upcoming session${total === 1 ? '' : 's'} in the background. You can leave; it finishes on its own.`;
    }
    const n = Number(d?.rows_repriced ?? 0);
    return n > 0 ? `${prefix} ${n} upcoming session${n === 1 ? '' : 's'} re-priced.` : prefix;
  };
  const repriceAfter = async (kind: 'endurance' | 'strength'): Promise<string> => {
    setSaveNote(REPRICE_WAIT);
    try {
      if (kind === 'endurance') return await repriceEndurance('Saved.');
      const { data: rs } = await supabase.functions.invoke('rematerialize-standing-block', { body: { apply: true } });
      return (rs as any)?.success ? 'Saved. Upcoming weights updated.' : 'Saved.';
    } catch { return 'Saved. Rebuild above to apply it.'; }
  };
  // ⛔ AUTO / MY NUMBER, ON THE PILL (Michael, 2026-09-05). "auto" clears the manual choice through the SAME save
  // Baselines uses — threshold_pace_source → 'learned', ftp_source removed, lthr_source → 'learned', the lift lock
  // removed — and the pill shows the measured number. Typing a number is choosing "my number" (Q-240), as before.
  const mine = (id: string): boolean => {
    if (!baselines) return false;
    if (id === 'threshold') return pn?.threshold_pace_source === 'manual';
    if (id === 'ftp') return pn?.ftp_source === 'manual';
    if (id === 'lthr') return pn?.lthr_source === 'manual';
    const key = canonicalizeLiftKey(id);
    return !!key && Number(baselines.locked_baselines?.[key]) > 0;
  };
  const setAuto = async (id: string) => {
    if (!baselines) return;
    setSaveNote(null); setLastSaved(sportOf(id));
    try {
      if (id === 'threshold') {
        await saveUserBaselines({ ...baselines, performanceNumbers: { ...(pn ?? {}), threshold_pace_source: 'learned' } });
      } else if (id === 'ftp') {
        const next: any = { ...(pn ?? {}) }; delete next.ftp_source;
        await saveUserBaselines({ ...baselines, performanceNumbers: next });
      } else if (id === 'lthr') {
        await saveUserBaselines({ ...baselines, performanceNumbers: { ...(pn ?? {}), lthr_source: 'learned' } });
      } else {
        const key = canonicalizeLiftKey(id); if (!key) return;
        const next = { ...(baselines.locked_baselines ?? {}) } as Record<string, number>; delete next[key];
        await saveUserBaselines({ ...baselines, locked_baselines: Object.keys(next).length ? next : null });
      }
      setSaveNote((await repriceAfter(id === 'ftp' || id === 'threshold' || id === 'lthr' ? 'endurance' : 'strength')).replace('Saved.', 'Auto.'));
      await reload();
    } catch (e) { setSaveNote('Could not switch. Try again.'); console.warn('[StateAdjustLens] auto failed:', e); }
  };
  const pill = 'text-[13px] px-3 py-1.5 rounded-lg border border-white/15 bg-white/[0.05] text-white/80 disabled:opacity-50';
  const Row = ({ id, name, value, editable = true, hint, sport, note }: { id: string; name: string; value: string | null; editable?: boolean; hint?: string; sport: 'strength' | 'run' | 'bike'; note?: string }) => (
    <div className="py-1">
    <div className="flex items-center justify-between gap-3">
      <span className="text-[14px] text-white/85 min-w-0 leading-tight">{name}</span>
      {editing === id ? (
        <span className="flex items-center gap-2">
          <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void commit(id); if (e.key === 'Escape') { setEditing(null); setDraft(''); } }}
            inputMode={id === 'threshold' ? 'numeric' : 'decimal'} placeholder={hint} className="w-24 bg-white/[0.06] border border-white/20 rounded-md px-2 py-1 text-[16px] text-white/90 text-right tabular-nums outline-none" />
          <button type="button" onClick={() => void commit(id)} className="text-[12px] text-white/80 px-2 py-1 rounded-md border border-white/15">save</button>
          <button type="button" onClick={() => { setEditing(null); setDraft(''); }} className="text-[12px] text-white/45 px-1 py-1">cancel</button>
        </span>
      ) : editable ? (
        <span className="inline-flex shrink-0 whitespace-nowrap rounded-lg border overflow-hidden" style={{ borderColor: `${getDisciplineColor(sport)}55`, background: `${getDisciplineColor(sport)}14` }}>
          <button type="button" onClick={() => { setEditing(id); setDraft(''); setSaveNote(null); }} aria-label={`edit ${name}`}
            className="inline-flex items-center gap-1.5 pl-2.5 pr-2 py-1 bg-transparent border-none text-[14px] text-white/90 tabular-nums outline-none focus:outline-none active:brightness-125">
            {value ?? <span className="text-white/45">tap to add</span>}
            <Pencil size={12} strokeWidth={2} style={{ color: getDisciplineColor(sport) }} className="shrink-0 opacity-80" aria-hidden="true" />
          </button>
          {mine(id) && (
            <button type="button" onClick={() => void setAuto(id)} aria-label={`${name}: back to auto`}
              className="px-2 py-1 border-l text-[12px] text-white/70 bg-white/[0.04] outline-none focus:outline-none active:brightness-125" style={{ borderColor: `${getDisciplineColor(sport)}55` }}>
              auto
            </button>
          )}
        </span>
      ) : (
        <span className="text-[14px] text-white/90 tabular-nums shrink-0 text-right">{value ?? <span className="text-white/35">no number yet</span>}</span>
      )}
    </div>
      {note && <p className="text-[12px] text-white/50 mt-1 leading-snug">{note}</p>}
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
  const STRENGTH_INFO = "A retest goes on today's calendar as a test session and opens in the logger: warm-up ramp, then one all-out set per lift. When it is saved, the sessions you have not started re-price from it. Typing a number makes it your number and locks it; auto uses what your lifts measure. Swaps and added movements live in the logger.";
  const RUN_INFO = "Easy days run on a heart-rate range off threshold heart rate; the easy pace shown is what your last five easy runs measured, or threshold pace × 1.19 until there are five. The threshold test goes on the calendar three days out; a run logged within a day of it is read as the test, and the result shows here and after the run as a number to accept. Typing a number makes it your number; auto uses what your runs measure.";
  const BIKE_INFO = "The FTP tests go on the calendar two days out; a ride logged within a day of the test is read as the test. The 20-minute test is the classic. The 5-minute test is all-out with no pacing, so it repeats well; it prices alongside a ride with a 20-minute effort in the last 90 days. The result shows here and after the ride as a number to accept. Typing a number makes it your number; auto uses what your rides measure.";

  type Section = { id: string; label: string; sport?: 'strength' | 'run' | 'bike'; Icon: React.ComponentType<any>; info?: string; body: React.ReactNode };
  const sections: Section[] = [
    { id: 'block', label: 'The block', Icon: Layers, body: (
      <>
        <button type="button" disabled={rebuilding} onClick={rebuild} className={pill}>{rebuilding ? 'Rebuilding…' : 'Rebuild upcoming sessions'}</button>
        <p className="text-[13px] text-white/60 mt-2 leading-snug">Rewrites the sessions you have not started from the plan: lifts and weights, runs and rides. Same days. Done sessions are not touched.</p>
        {rebuildNote && <p className="text-[13px] text-white/75 mt-1.5">{rebuildNote}</p>}
      </>
    ) },
    ...(deload && nextWeek != null && nextWeek <= deload.weeks ? [{ id: 'deload', label: 'Deload', Icon: Feather, body: (
      <>
        <button type="button" disabled={deloadBusy} onClick={toggleDeload} className={pill}>{deloadBusy ? 'Rebuilding…' : nextIsDeload ? `Week ${nextWeek}: deload on · make it standard` : `Make week ${nextWeek} a deload week`}</button>
        <p className="text-[13px] text-white/60 mt-2 leading-snug">Max-effort sets become skill and speed sets, the extra lower-body sets come out, and the endurance sessions drop a level. Switch to it two weeks out from a race or a meet. It is not a scheduled light week: the standard week is built to be run indefinitely.</p>
        {deload.taperWeeks.length > 0 && <p className="text-[11px] text-white/45 mt-1">Deload weeks: {deload.taperWeeks.join(', ')}</p>}
        {deloadNote && <p className="text-[13px] text-white/75 mt-1.5">{deloadNote}</p>}
      </>
    ) }] : []),
    { id: 'strength', label: 'Strength', sport: 'strength', Icon: Dumbbell, info: STRENGTH_INFO, body: (
      <>
        {perLift.length === 0 ? (
          <p className="text-[13px] text-white/40 leading-snug">Logged lifts show up here.</p>
        ) : (
          <div className="space-y-1.5">
            {perLift.map((lt) => (
              <Row key={lt.canonical_name} id={lt.canonical_name} name={lt.display_name ?? lt.canonical_name} value={liftNumber(lt.canonical_name)} hint={metric ? 'kg' : 'lb'} sport="strength" />
            ))}
          </div>
        )}
        <div className="flex items-center justify-between py-1 gap-3 mt-1.5">
          <span className="text-[14px] text-white/85">Retest</span>
          <span className="flex flex-wrap gap-2 justify-end">
            <button type="button" disabled={retestBusy != null} onClick={() => openLiftTest('Lower')} className={pill}>{retestBusy === 'Lower' ? 'Opening…' : 'Lower lifts'}</button>
            <button type="button" disabled={retestBusy != null} onClick={() => openLiftTest('Upper')} className={pill}>{retestBusy === 'Upper' ? 'Opening…' : 'Upper lifts'}</button>
          </span>
        </div>
        <p className="text-[13px] text-white/60 mt-2 leading-snug">Tap a number to set your own. A retest opens today, in the logger.</p>
        {saveNote && lastSaved === 'strength' && <p className="text-[13px] text-white/75 mt-1.5">{saveNote}</p>}
      </>
    ) },
    { id: 'run', label: 'Run', sport: 'run', Icon: Activity, info: RUN_INFO, body: (
      <>
        <div className="space-y-1.5">
          <Row id="threshold" name="Threshold pace" value={withSource(fmtPace(thr?.sec_per_mi, metric), thr?.source)} hint={metric ? 'm:ss/km' : 'm:ss/mi'} sport="run" />
          {thrProposal && (
            <div className="flex items-center justify-between py-1 gap-3">
              <span className="text-[13px] text-white/70">Your runs measure {fmtPace(thrProposal.measuredSecPerKm * 1.609344, metric)}</span>
              <button type="button" disabled={acceptingThr} onClick={acceptThr} style={{ borderColor: `${getDisciplineColor('run')}88`, color: getDisciplineColor('run') }} className="text-[13px] px-3 py-1 rounded-lg border bg-white/[0.04] disabled:opacity-50">{acceptingThr ? 'Applying…' : `use ${fmtPace(thrProposal.measuredSecPerKm * 1.609344, metric)}`}</button>
            </div>
          )}
          <Row id="lthr" name="Threshold heart rate" value={withSource(lthr?.bpm != null ? `${Math.round(lthr.bpm)} bpm` : null, lthr?.source)} hint="bpm" sport="run" />
          <Row id="easy" name="Easy pace" editable={false} sport="run"
            value={fmtPace(easy?.sec_per_mi, metric) ? `${fmtPace(easy?.sec_per_mi, metric)} · ${easy?.source === 'learned' ? 'from runs' : 'from threshold'}` : null}
            note={easy?.source === 'learned'
              ? (lthr?.bpm != null
                ? `Your pace at ${frielZones(lthr.bpm)[1].min}–${frielZones(lthr.bpm)[1].max} bpm, your zone 2, over your last five easy runs. Heat and hills slow this pace at the same heart rate.`
                : 'Your last five easy runs. Heat and hills slow this pace at the same heart rate.')
              : 'Worked out from threshold until five easy runs are on file.'} />
          <div className="flex items-center justify-between py-1 gap-3">
            <span className="text-[14px] text-white/85">Retest</span>
            <span className="flex flex-wrap gap-2 justify-end">
              {scheduled.run ? (
                <button type="button" disabled={testBusy === 'run'} onClick={() => removeTest('run')} className={pill}>Threshold · {fmtDay(scheduled.run.date)} · remove</button>
              ) : (
                <button type="button" disabled={testBusy === 'run'} onClick={() => scheduleTest('run')} className={pill}>Threshold</button>
              )}
            </span>
          </div>
        </div>
        <p className="text-[13px] text-white/60 mt-2 leading-snug">Tap a number to set your own. The threshold test goes on the calendar three days out.</p>
        {saveNote && lastSaved === 'run' && <p className="text-[13px] text-white/75 mt-1.5">{saveNote}</p>}
      </>
    ) },
    { id: 'bike', label: 'Bike', sport: 'bike', Icon: Bike, info: BIKE_INFO, body: (
      <>
        <div className="space-y-1.5">
          <Row id="ftp" name="FTP" value={withSource(ftp?.value != null ? `${Math.round(ftp.value)} W` : null, ftp?.source)} hint="W" sport="bike" />
          {proposal && (
            <div className="flex items-center justify-between py-1 gap-3">
              <span className="text-[13px] text-white/70">Your rides measure {Math.round(proposal.measured)} W</span>
              <button type="button" disabled={accepting} onClick={acceptFtp} style={{ borderColor: `${getDisciplineColor('bike')}88`, color: getDisciplineColor('bike') }} className="text-[13px] px-3 py-1 rounded-lg border bg-white/[0.04] disabled:opacity-50">{accepting ? 'Applying…' : `use ${Math.round(proposal.measured)} W`}</button>
            </div>
          )}
          <div className="flex items-center justify-between py-1 gap-3">
            <span className="text-[14px] text-white/85">Retest</span>
            <span className="flex flex-wrap gap-2 justify-end">
              {scheduled.ftp ? (
                <button type="button" disabled={testBusy === 'ftp'} onClick={() => removeTest('ftp')} className={pill}>20 min · {fmtDay(scheduled.ftp.date)} · remove</button>
              ) : (
                <button type="button" disabled={testBusy === 'ftp'} onClick={() => scheduleTest('ftp')} className={pill}>20 min</button>
              )}
              {scheduled.ftp5 ? (
                <button type="button" disabled={testBusy === 'ftp5'} onClick={() => removeTest('ftp5')} className={pill}>5 min · {fmtDay(scheduled.ftp5.date)} · remove</button>
              ) : (
                <button type="button" disabled={testBusy === 'ftp5'} onClick={() => scheduleTest('ftp5')} className={pill}>5 min</button>
              )}
            </span>
          </div>
        </div>
        <p className="text-[13px] text-white/60 mt-2 leading-snug">Tap a number to set your own. The FTP tests go on the calendar two days out.</p>
        {saveNote && lastSaved === 'bike' && <p className="text-[13px] text-white/75 mt-1.5">{saveNote}</p>}
      </>
    ) },
  ];
  const eff = effectiveOrder();
  const ordered = [...sections].sort((x, y) => eff.indexOf(x.id) - eff.indexOf(y.id));

  return (
    <div className="px-0.5 overflow-x-hidden">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <p className="text-[14px] text-white/70 leading-snug">Everything here changes your training from today forward. Nothing applies on its own.</p>
        <button type="button" onClick={() => setReordering((v) => !v)} className="shrink-0 text-[11px] tracking-wider uppercase text-white/45 py-1 outline-none focus:outline-none">{reordering ? 'done' : 'reorder'}</button>
      </div>
      {/* ⛔ ONE PLATE, HAIRLINE DIVIDERS, the State construction — but plain glass, not the galaxy
          texture, so Adjust reads as its own zone (Michael, 2026-09-05). Left column: icon + label,
          the same 92px the State rows use, so the two screens line up when you flip between them. */}
      <div className="galaxy-card readout-texture readout-texture--forge rounded-2xl divide-y divide-white/[0.10]" style={readoutPlateStyle(undefined, { galaxy: true })}>
        {ordered.map((sec, i) => {
          const color = sec.sport ? getDisciplineColor(sec.sport) : 'rgba(255,255,255,0.7)';
          const open = sec.info ? infoOpen.has(sec.id) : false;
          return (
            <div key={sec.id} className="flex items-start gap-3 px-3 py-3">
              <span className="flex flex-col gap-1 shrink-0 w-[92px] pt-[3px]">
                <span className="flex items-center gap-2">
                  <sec.Icon size={15} strokeWidth={2.25} style={{ color }} className="shrink-0" aria-hidden="true" />
                  <span className="text-[11.5px] font-semibold tracking-[0.14em] uppercase" style={{ color }}>{sec.label}</span>
                </span>
                {sec.info && (
                  <button type="button" onClick={() => toggleInfo(sec.id)} aria-label={`About ${sec.label.toLowerCase()} on this screen`} aria-expanded={open} className="self-start bg-transparent border-none p-0 cursor-pointer text-white/45 text-[12px] leading-none">ⓘ</button>
                )}
              </span>
              <div className="flex-1 min-w-0">
                {open && sec.info && <p className="mb-2 text-[12px] text-white/65 leading-snug">{sec.info}</p>}
                {sec.body}
              </div>
              {reordering && (
                <span className="flex flex-col items-center shrink-0 -mr-1">
                  <span role="button" aria-label={`move ${sec.label.toLowerCase()} up`} onClick={() => moveSection(sec.id, -1)} className={`px-2 py-0.5 text-[14px] leading-none ${i === 0 ? 'text-white/25' : 'text-white/85'}`}>▲</span>
                  <span role="button" aria-label={`move ${sec.label.toLowerCase()} down`} onClick={() => moveSection(sec.id, 1)} className={`px-2 py-0.5 text-[14px] leading-none ${i === ordered.length - 1 ? 'text-white/25' : 'text-white/85'}`}>▼</span>
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// State-as-hub "Adjust" lens (D-316) — v0 scaffold.
//
// The Adjust tab mirrors the discipline layout of Status, but each row is a HANDLE to steer that
// discipline (changes WHAT you do). v0 lays out the disciplines and names the steer each one gets;
// the functional controls (strength swap/add/weight already exist in the logger + StrengthAdjustmentModal;
// endurance ease/push next) get re-homed here in the next pass. Nothing here changes your plan yet —
// no dead buttons that pretend to work; honest labels for what lands where. Consent-first throughout.

import React, { useEffect, useState } from 'react';
import { Dumbbell, Activity, Bike, Layers, Feather, ChevronRight } from 'lucide-react';
import { NumberRow } from '@/components/ui/number-row';
import { pillClass } from '@/lib/number-word';
import { openLiftRetest, rebuildUpcomingSessions, REBUILD_NOTE } from '@/lib/plan-actions';
import SportStrip, { type StripSport } from '@/components/ui/sport-strip';
import { getDisciplineColor } from '@/lib/context-utils';
import { readoutPlateStyle } from '@/lib/readout-plate';
import { supabase, getStoredUserId } from '@/lib/supabase';
import { useAppContext } from '@/contexts/AppContext';
import { canonicalizeLiftKey } from '@shared/state-trend/capacity-resolver';
import { acceptMeasuredNumber } from '@/lib/accept-measured';
import { usePlannedWorkouts } from '@/hooks/usePlannedWorkouts';
import { runThresholdTestRow, ftpTestRow, ftp5MinTestRow } from '@/lib/baseline-tests';
// ⛔ EVERY NUMBER ON THIS SCREEN IS THE SERVER'S (2026-09-15, one-truth workorder Stage 4 session 1).
import { useBaselineZones } from '@/hooks/useBaselineZones';

// The numbers the block is priced from — the SAME server readout Training Baselines prints, so the two
// screens cannot show two numbers for one fact (Michael, 2026-09-05: "add the current e1RM, FTP, running
// threshold pace, easy pace").
// While the server re-prices row by row (30 rows on a full block), the screen says so — leaving mid-way is not
// guaranteed to finish (Michael, 2026-09-05).
const REPRICE_WAIT = 'Updating your upcoming sessions…';
// The heading carries LOAD's ⓘ (LoadBar.tsx): one line stays under the sport, the rest opens here.


export default function StateAdjustLens({ mainLifts }: {
  /**
   * The canonical names of the athlete's MAIN lifts, as the coach picked them
   * (`weekly_state_v1.strength_logged_sets.main`). ⛔ The screen used to be handed the raw per-lift
   * list and `StateTab` applied the main-lift test itself, a second copy of the server's own
   * (2026-09-15, Stage 4 session 2).
   */
  mainLifts: string[];
}) {
  // 2026-09-03 (Michael: "maybe it should be here"): the one control that already works — rewrite the
  // unstarted sessions of the block from the plan (same lifts, weights, days; completed sessions never
  // touched). It used to fire only as a side effect of saving Baselines after a lift lock changed.
  const [jumpTo, setJumpTo] = useState<StripSport | null>(null);
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
  /**
   * ⛔ THE READOUT IS THE SERVER'S (2026-09-15). Every row below — the lift and its unit, the FTP, the
   * threshold pace, the threshold heart rate, the easy range, the two "your runs/rides measure" lines and
   * the day a retest lands on — arrives finished, already in the athlete's own unit, from `save-baselines`.
   * This screen ran six resolvers and did its own kilogram labels, its own kilometre conversion and its own
   * `today + 3`; Training Baselines ran the same six against different inputs, which is how one athlete
   * could read two threshold heart rates. One payload, both screens.
   */
  const { readout, refresh: refreshReadout, apply: applyReadout } = useBaselineZones();
  /**
   * The four lifts the block prices from are always listed, whether or not a set has been logged:
   * a fresh account with numbers typed on the profile page saw "Logged lifts show up here." and no
   * rows, while the profile page showed all four (throwaway check, 2026-09-05). Logged lifts beyond
   * the four (the coach's main-lift list) follow them; the same lift is not listed twice.
   */
  const FOUR: string[] = ['squat', 'deadlift', 'bench', 'overheadPress1RM'];
  const liftRows = (() => {
    const all = readout?.strength.lifts ?? [];
    const extraKeys = new Set(
      mainLifts.map((n) => canonicalizeLiftKey(n)).filter((k): k is NonNullable<typeof k> => k != null).map(String),
    );
    return all.filter((l) => FOUR.includes(l.key) || extraKeys.has(l.key))
      .sort((a, b) => (FOUR.indexOf(a.key) + 1 || 99) - (FOUR.indexOf(b.key) + 1 || 99));
  })();
  const run = readout?.run ?? null;
  const bike = readout?.bike ?? null;
  // The FTP the rides measured, waiting on acceptance (TrainerRoad's proposed-then-accepted). Same write as
  // Training Baselines' "use it": accept into learned_fitness, then re-price the unstarted endurance rows.
  const proposal = bike?.ftp_proposal ?? null;
  const [accepting, setAccepting] = useState(false);
  const acceptFtp = () => {
    void (async () => {
      const uid = getStoredUserId(); if (!uid) return;
      setAccepting(true); setSaveNote(REPRICE_WAIT); setLastSaved('bike');
      try {
        // ⛔ The shown number goes to save-baselines, which saves the accept and clears the manual flag (2026-09-10).
        if (!proposal) return;
        const res = await acceptMeasuredNumber(supabase, 'ftp', proposal.accept_value);
        if (!res.ok) throw new Error(res.error);
        // The wattage the button showed, which is the number now in use. The phone rounds nothing.
        let note = `${proposal.button.replace(/^use /, '')} in use.`;
        try { note = await repriceEndurance(note); } catch { /* the accept stands */ }
        setSaveNote(note);
        await reload();
      } catch (e) { setSaveNote('Could not accept. Try again.'); console.warn('[StateAdjustLens] accept FTP failed:', e); }
      finally { setAccepting(false); }
    })();
  };
  const thrProposal = run?.threshold_proposal ?? null;
  const [acceptingThr, setAcceptingThr] = useState(false);
  const acceptThr = () => {
    void (async () => {
      const uid = getStoredUserId(); if (!uid) return;
      setAcceptingThr(true); setSaveNote(REPRICE_WAIT); setLastSaved('run');
      try {
        // ⛔ The shown pace (sec/km) goes to save-baselines, which saves the accept and the flag (2026-09-10).
        if (!thrProposal) return;
        const res = await acceptMeasuredNumber(supabase, 'run_threshold', thrProposal.accept_value);
        if (!res.ok) throw new Error(res.error);
        // The pace the server now prints on the row, not a second conversion of the accepted value.
        let note = `${thrProposal.button.replace(/^use /, '')} in use.`;
        try { note = await repriceEndurance(note); } catch { /* the accept stands */ }
        setSaveNote(note);
        await reload();
      } catch (e) { setSaveNote('Could not accept. Try again.'); console.warn('[StateAdjustLens] accept threshold failed:', e); }
      finally { setAcceptingThr(false); }
    })();
  };

  // ⛔ EDIT IN PLACE (Michael, 2026-09-05: "lost the edit option — the whole point"). Tap a number, type, save.
  // Writes go through AppContext.saveUserBaselines — the SAME save Training Baselines uses — with the same
  // fields: a lift becomes `locked_baselines[key]` (your number, auto off); FTP becomes `performanceNumbers.ftp`
  // + `ftp_source: 'manual'`; threshold pace becomes `threshold_pace_min_per_mi` ("m:ss", per mile) +
  // `threshold_pace_source: 'manual'`. Easy pace is a range off threshold (× 1.14 to × 1.29, D-478) and is not edited.
  // ⛔ DELOAD — the book's TAPER/DELOAD column (p274), deployed by the athlete, never scheduled (p120 rejects
  // overreach-to-deload). Read the plan's current week + deload weeks from the rebuild's dry run; toggling
  // next week calls the same rebuild with `taper_weeks` and applies.
  // ⛔ WHICH WEEK, AND WHETHER IT CAN — THE BLOCK'S ANSWER (2026-09-15). The screen worked out "next week"
  // as `current + 1`, gated it on `≤ weeks`, and carried its own `|| 12` beside the server's. The dry run
  // returns `next_week`, `next_is_deload` and `can_deload`; this prints them.
  type Deload = { nextWeek: number; nextIsDeload: boolean; canDeload: boolean; taperWeeks: number[]; line: string | null };
  const [deload, setDeload] = useState<Deload | null>(null);
  const [deloadBusy, setDeloadBusy] = useState(false);
  const [deloadNote, setDeloadNote] = useState<string | null>(null);
  const readDeload = (d: any): Deload | null =>
    d?.success && typeof d.next_week === 'number'
      ? { nextWeek: d.next_week, nextIsDeload: d.next_is_deload === true, canDeload: d.can_deload === true, taperWeeks: Array.isArray(d.taper_weeks) ? d.taper_weeks.map(Number) : [], line: typeof d.deload_line === 'string' ? d.deload_line : null }
      : null;
  useEffect(() => {
    let cancelled = false;
    void supabase.functions.invoke('rematerialize-standing-block', { body: { apply: false } }).then(({ data }) => {
      const next = readDeload(data);
      if (!cancelled && next) setDeload(next);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const nextWeek = deload?.nextWeek ?? null;
  const nextIsDeload = deload?.nextIsDeload === true;
  const toggleDeload = () => {
    if (!deload || !deload.canDeload || nextWeek == null) return;
    const next = nextIsDeload ? deload.taperWeeks.filter((w) => w !== nextWeek) : [...deload.taperWeeks, nextWeek];
    void (async () => {
      setDeloadBusy(true); setDeloadNote(null);
      try {
        const { data: rs, error } = await supabase.functions.invoke('rematerialize-standing-block', { body: { apply: true, taper_weeks: next } });
        if (error) throw error;
        setDeload(readDeload(rs) ?? { ...deload, taperWeeks: next, nextIsDeload: !nextIsDeload });
        setDeloadNote(nextIsDeload ? `Week ${nextWeek} is back to the standard week.` : `Week ${nextWeek} is a deload week. Sessions rebuilt.`);
      } catch (e) {
        setDeloadNote('Could not change it. Try again.');
        console.warn('[StateAdjustLens] deload toggle failed:', e);
      } finally { setDeloadBusy(false); }
    })();
  };
  // ⛔ RETEST (Michael, 2026-09-05: tests live on Adjust, not a tab). Run threshold and FTP tests are the SAME
  // rows Training Baselines and the wizard schedule (`baseline-tests.ts`, same helper), on the day the
  // server's readout names (today; the athlete moves it on the calendar if it does not suit). The lifts open the logger's test flow (Lower / Upper / Full Body), the same
  // entry Baselines uses. A scheduled test is detected by its tag (`run_test` / `ftp_test`), the contract.
  const { addPlannedWorkout } = usePlannedWorkouts() as any;
  const [scheduled, setScheduled] = useState<{ run: { id: string; date: string } | null; ftp: { id: string; date: string } | null; ftp5: { id: string; date: string } | null }>({ run: null, ftp: null, ftp5: null });
  const [testBusy, setTestBusy] = useState<string | null>(null);
  const refreshScheduled = async () => {
    const uid = getStoredUserId(); if (!uid) return;
    // The athlete's own calendar day, not UTC (§8.0 #42) — a test scheduled for today must still list.
    const today = new Date().toLocaleDateString('en-CA');
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
        // ⛔ THE SERVER SAYS WHICH DAY (2026-09-15). This screen counted `today + 3` for the run and
        // `today + 2` for the bike off a UTC clock, and week one in a new block counted its own two days
        // somewhere else. The readout carries the day; the athlete moves it on the calendar if it suits.
        const date = readout?.retest.date;
        if (!date) return;
        const row = kind === 'run' ? runThresholdTestRow(date) : kind === 'ftp5' ? ftp5MinTestRow(date) : ftpTestRow(date);
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
  // One owner with Baselines' Strength card (`@/lib/plan-actions`, 2026-09-20).
  const openLiftTest = (which: 'Lower' | 'Upper') => {
    void (async () => {
      setRetestBusy(which);
      try { await openLiftRetest(which); } finally { setRetestBusy(null); }
    })();
  };
  const fmtDay = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const [saveNote, setSaveNote] = useState<string | null>(null);
  // Which sport's section shows the note — the one whose number was just saved.
  const [lastSaved, setLastSaved] = useState<'strength' | 'run' | 'bike' | null>(null);
  const sportOf = (id: string): 'strength' | 'run' | 'bike' => id === 'ftp' ? 'bike' : id === 'threshold' || id === 'lthr' ? 'run' : 'strength';
  const reload = async () => {
    await loadUserBaselines?.().then((b: any) => { if (b) setBaselines(b); }).catch(() => {});
    await refreshReadout();
  };
  /**
   * ⛔ WHAT WAS TYPED, IN THE ATHLETE'S OWN UNIT (2026-09-15). A pace and a lift go over as typed and
   * `save-baselines` converts and stores them. This screen used to multiply a kilometre pace by 1.609344
   * itself — the server never saw the number the athlete entered — and a typed kilogram lift was stored
   * raw as pounds, which is how 100 kg became 100 lb everywhere the plan priced from it.
   */
  const commit = async (id: string, text: string) => {
    if (!baselines) return;
    const t = text.trim();
    setLastSaved(sportOf(id));
    try {
      let saved: any = null;
      if (id === 'ftp') {
        const v = Math.round(Number(t)); if (!(v > 0)) return;
        saved = await saveUserBaselines({ ...baselines, performanceNumbers: { ...(pn ?? {}), ftp: v, ftp_source: 'manual' } });
      } else if (id === 'threshold') {
        if (!/^\d{1,2}:\d{2}$/.test(t)) return;
        saved = await saveUserBaselines(baselines, undefined, { paces: { threshold: t } });
      } else if (id === 'lthr') {
        const v = Math.round(Number(t)); if (!(v > 0)) return;
        // ⛔ The typed threshold only (2026-09-10). `save-baselines` stores it and rebuilds the zone tables
        // from it — this wrote the object itself and left the old zone arrays standing beside the new number.
        saved = await saveUserBaselines({ ...baselines, performanceNumbers: { ...(pn ?? {}), lthr_source: 'manual' } }, { manual_run_lthr: v });
      } else {
        const key = canonicalizeLiftKey(id); const v = Number(t);
        if (!key || !Number.isFinite(v) || !(key === 'pullupMaxReps' ? v >= 0 : v > 0)) return;
        saved = await saveUserBaselines(baselines, undefined, { lifts: { [key]: v } });
      }
      applyReadout(saved?.zones);
      setSaveNote(await repriceAfter(id === 'ftp' || id === 'threshold' || id === 'lthr' ? 'endurance' : 'strength'));
      await reload();
    } catch (e) {
      setSaveNote('Could not save. Try again.');
      console.warn('[StateAdjustLens] save failed:', e);
    }
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
            setSaveNote(`${prefix} ${Number(job.done ?? 0)} upcoming session${Number(job.done) === 1 ? '' : 's'} updated.`);
          } else if (Date.now() - startedAt > 180_000) {
            if (pollRef.current) window.clearInterval(pollRef.current); pollRef.current = null;
          }
        } catch { /* keep polling */ }
      }, 3000);
      return `${prefix} Updating ${total} upcoming session${total === 1 ? '' : 's'} in the background. You can leave; it finishes on its own.`;
    }
    const n = Number(d?.rows_repriced ?? 0);
    return n > 0 ? `${prefix} ${n} upcoming session${n === 1 ? '' : 's'} updated.` : prefix;
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
        // `null` clears that lift's lock — the server's one write shape, same as a typed value.
        await saveUserBaselines(baselines, undefined, { lifts: { [key]: null } });
      }
      setSaveNote((await repriceAfter(id === 'ftp' || id === 'threshold' || id === 'lthr' ? 'endurance' : 'strength')).replace('Saved.', 'Auto.'));
      await reload();
    } catch (e) { setSaveNote('Could not switch. Try again.'); console.warn('[StateAdjustLens] auto failed:', e); }
  };
  const pill = pillClass;
  /** One server row, rendered. Nothing here decides a value, a unit or a word. */
  const Row = ({ id, name, row, sport, editable = true }: { id: string; name: string; row?: { value: string | null; hint: string; note: string | null; mine: boolean } | null; sport: 'strength' | 'run' | 'bike'; editable?: boolean }) => (
    <NumberRow id={id} name={name} value={row?.value ?? null} editable={editable} hint={row?.hint} sport={sport} note={row?.note ?? undefined} mine={row?.mine === true}
      inputMode={id === 'threshold' ? 'numeric' : 'decimal'} onEditStart={() => setSaveNote(null)} onSave={(t) => commit(id, t)} onAuto={editable ? () => setAuto(id) : undefined} />
  );
  const rebuild = () => {
    void (async () => {
      setRebuilding(true);
      setRebuildNote(null);
      // ⛔ THIS TAP TAKES THE EQUIPMENT ON BASELINES (2026-09-20): a chip checked after the plan was built reaches the
      // sessions still ahead here (`rematerialize-standing-block`, `use_current_equipment`).
      const result = await rebuildUpcomingSessions({ useCurrentEquipment: true });
      setRebuildNote(REBUILD_NOTE[result]);
      setRebuilding(false);
    })();
  };
  const STRENGTH_INFO = "A retest goes on today's calendar as a test session and opens in the logger: warm-up ramp, then one all-out set per lift. When it is saved, the sessions you have not started take the new number. Typing a number makes it your number and locks it; auto uses what your lifts measure. Swaps and added movements live in the logger.";
  const RUN_INFO = "Easy days run on a heart-rate range off threshold heart rate; the easy pace shown is your zone 2 pace, worked out from threshold pace. The threshold test goes on the calendar today; a run logged within a day of it is read as the test, and the result shows here and after the run as a number to accept. Typing a number makes it your number; auto uses what your runs measure.";
  // ⛔ "The 20-minute test is the classic … all-out with no pacing, so it repeats well" came off (2026-09-18, book-language
  // pass 2): on no page. What is left says how the app reads the tests.
  const BIKE_INFO = "The FTP tests go on the calendar today; a ride logged within a day of the test is read as the test. The 5-minute test counts together with a ride that had a 20-minute effort in the last 90 days. The result shows here and after the ride as a number to accept. Typing a number makes it your number; auto uses what your rides measure.";

  type Section = { id: string; label: string; sport?: 'strength' | 'run' | 'bike'; Icon: React.ComponentType<any>; info?: string; body: React.ReactNode };
  const sections: Section[] = [
    { id: 'block', label: 'The block', Icon: Layers, body: (
      <>
        <button type="button" disabled={rebuilding} onClick={rebuild} className={pill}>{rebuilding ? 'Rebuilding…' : 'Rebuild upcoming sessions'}</button>
        <p className="text-footnote text-label-secondary mt-2 leading-snug">Rewrites the sessions you have not started from the plan: lifts and weights, runs and rides. Same days. Done sessions are not touched. Changes made to equipment will be adjusted here for future sessions.</p>
        {rebuildNote && <p className="text-footnote text-label-secondary mt-1.5">{rebuildNote}</p>}
      </>
    ) },
    ...(deload?.canDeload && nextWeek != null ? [{ id: 'deload', label: 'Deload', Icon: Feather, body: (
      <>
        <button type="button" disabled={deloadBusy} onClick={toggleDeload} className={pill}>{deloadBusy ? 'Rebuilding…' : nextIsDeload ? `Week ${nextWeek}: deload on · make it standard` : `Make week ${nextWeek} a deload week`}</button>
        {/* ⛔ THE PROGRAM'S OWN PAGE, OR NOTHING (2026-09-18, round 3). p245's sentence printed here for every program, and
            p245 is the Hypertrophy + 5K page. The server sends each program's own words (`DELOAD_LINE`, setup-copy.ts):
            p247 on Run + Strength, nothing where the program's page has none. */}
        {deload.line && <p className="text-footnote text-label-secondary mt-2 leading-snug">{deload.line}</p>}
        {deload.taperWeeks.length > 0 && <p className="text-caption text-label-secondary mt-1">Deload weeks: {deload.taperWeeks.join(', ')}</p>}
        {deloadNote && <p className="text-footnote text-label-secondary mt-1.5">{deloadNote}</p>}
      </>
    ) }] : []),
    { id: 'strength', label: 'Strength', sport: 'strength', Icon: Dumbbell, info: STRENGTH_INFO, body: (
      <>
        <div className="space-y-1.5">
          {liftRows.map((lt) => (
            <Row key={lt.key} id={lt.key} name={lt.label} row={lt.row} sport="strength" />
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-y-2 py-1 gap-3 mt-1.5">
          <span className="text-subhead text-label">Retest</span>
          <span className="flex flex-wrap gap-2 justify-end">
            <button type="button" disabled={retestBusy != null} onClick={() => openLiftTest('Lower')} className={`${pill} inline-flex items-center gap-1`}>{retestBusy === 'Lower' ? 'Opening…' : 'Lower lifts'}<ChevronRight className="h-4 w-4 text-label-secondary" aria-hidden="true" /></button>
            <button type="button" disabled={retestBusy != null} onClick={() => openLiftTest('Upper')} className={`${pill} inline-flex items-center gap-1`}>{retestBusy === 'Upper' ? 'Opening…' : 'Upper lifts'}<ChevronRight className="h-4 w-4 text-label-secondary" aria-hidden="true" /></button>
          </span>
        </div>
        <p className="text-footnote text-label-secondary mt-2 leading-snug">A retest opens today, in the logger.</p>
        {saveNote && lastSaved === 'strength' && <p className="text-footnote text-label-secondary mt-1.5">{saveNote}</p>}
      </>
    ) },
    { id: 'run', label: 'Run', sport: 'run', Icon: Activity, info: RUN_INFO, body: (
      <>
        <div className="space-y-1.5">
          <Row id="threshold" name="Threshold pace" row={run?.threshold} sport="run" />
          {thrProposal && (
            <div className="flex items-center justify-between py-1 gap-3">
              <span className="text-footnote text-label-secondary">{thrProposal.text}</span>
              <button type="button" disabled={acceptingThr} onClick={acceptThr} style={{ borderColor: `${getDisciplineColor('run')}88`, color: getDisciplineColor('run') }} className="text-footnote px-3 py-1 rounded-xl border bg-white/[0.04] disabled:opacity-50">{acceptingThr ? 'Applying…' : thrProposal.button}</button>
            </div>
          )}
          <Row id="lthr" name="Threshold heart rate" row={run?.lthr} sport="run" />
          <Row id="easy" name="Easy pace" editable={false} row={run?.easy} sport="run" />
          <div className="flex flex-wrap items-center justify-between gap-y-2 py-1 gap-3">
            <span className="text-subhead text-label">Retest</span>
            <span className="flex flex-wrap gap-2 justify-end">
              {scheduled.run ? (
                <button type="button" disabled={testBusy === 'run'} onClick={() => removeTest('run')} className={pill}>Threshold · {fmtDay(scheduled.run.date)} · remove</button>
              ) : (
                <button type="button" disabled={testBusy === 'run'} onClick={() => scheduleTest('run')} className={pill}>Threshold</button>
              )}
            </span>
          </div>
        </div>
        <p className="text-footnote text-label-secondary mt-2 leading-snug">The threshold test goes on the calendar today.</p>
        {saveNote && lastSaved === 'run' && <p className="text-footnote text-label-secondary mt-1.5">{saveNote}</p>}
      </>
    ) },
    { id: 'bike', label: 'Bike', sport: 'bike', Icon: Bike, info: BIKE_INFO, body: (
      <>
        <div className="space-y-1.5">
          <Row id="ftp" name="FTP" row={bike?.ftp} sport="bike" />
          {proposal && (
            <div className="flex items-center justify-between py-1 gap-3">
              <span className="text-footnote text-label-secondary">{proposal.text}</span>
              <button type="button" disabled={accepting} onClick={acceptFtp} style={{ borderColor: `${getDisciplineColor('bike')}88`, color: getDisciplineColor('bike') }} className="text-footnote px-3 py-1 rounded-xl border bg-white/[0.04] disabled:opacity-50">{accepting ? 'Applying…' : proposal.button}</button>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-y-2 py-1 gap-3">
            <span className="text-subhead text-label">Retest</span>
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
        <p className="text-footnote text-label-secondary mt-2 leading-snug">The FTP tests go on the calendar today.</p>
        {saveNote && lastSaved === 'bike' && <p className="text-footnote text-label-secondary mt-1.5">{saveNote}</p>}
      </>
    ) },
  ];
  const eff = effectiveOrder();
  const ordered = [...sections].sort((x, y) => eff.indexOf(x.id) - eff.indexOf(y.id));
  // One line says it, once, at the top of the first sport section (docs/DESIGN-button-shape.md, 2026-09-06).
  const firstSportId = ordered.find((s) => s.sport)?.id;

  return (
    <div className="px-0.5 overflow-x-hidden">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <p className="text-subhead text-label-secondary leading-snug">Changes here go into the sessions you have not done yet.</p>
        <button type="button" onClick={() => setReordering((v) => !v)} className="shrink-0 text-caption tracking-wider uppercase text-label-secondary py-1 outline-none focus:outline-none">{reordering ? 'done' : 'reorder'}</button>
      </div>
      {/* ⛔ ONE PLATE, HAIRLINE DIVIDERS, the State construction — but plain glass, not the galaxy
          texture, so Adjust reads as its own zone (Michael, 2026-09-05). Left column: icon + label,
          the same 92px the State rows use, so the two screens line up when you flip between them. */}
      {/* The sport strip as a JUMP bar (2026-09-06): tap Run and the screen scrolls to the Run section. Nothing
          hidden, nothing filtered; the block and deload sections stay above it and the reorder still works. */}
      <SportStrip value={jumpTo} sports={['run', 'bike', 'strength']} className="mb-3" onChange={(sp) => {
        setJumpTo(sp);
        const el = document.getElementById(`adjust-section-${sp}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }} />
      <div className="galaxy-card readout-texture readout-texture--forge rounded-2xl divide-y divide-white/[0.10]" style={readoutPlateStyle(undefined, { galaxy: true })}>
        {ordered.map((sec, i) => {
          const color = sec.sport ? getDisciplineColor(sec.sport) : 'var(--label-secondary)';
          const open = sec.info ? infoOpen.has(sec.id) : false;
          // Label on its own line, body full width (Michael, 2026-09-05: "a lot of dead space on the
          // left"). The State plate's side column works for name + number rows; these rows carry pills
          // and buttons and need the whole width on a phone.
          return (
            <div key={sec.id} id={sec.sport ? `adjust-section-${sec.sport}` : undefined} className="px-3 py-3 scroll-mt-24">
              <div className="flex items-center gap-2 mb-2">
                <sec.Icon size={15} strokeWidth={2.25} style={{ color }} className="shrink-0" aria-hidden="true" />
                <span className="text-caption font-semibold tracking-[0.14em] uppercase" style={{ color }}>{sec.label}</span>
                {sec.info && (
                  <button type="button" onClick={() => toggleInfo(sec.id)} aria-label={`About ${sec.label.toLowerCase()} on this screen`} aria-expanded={open} className="bg-transparent border-none p-0 cursor-pointer text-label-secondary text-caption leading-none">ⓘ</button>
                )}
                {reordering && (
                  <span className="ml-auto flex items-center shrink-0 -mr-1">
                    <span role="button" aria-label={`move ${sec.label.toLowerCase()} up`} onClick={() => moveSection(sec.id, -1)} className={`px-2 py-0.5 text-subhead leading-none ${i === 0 ? 'text-label-secondary' : 'text-label'}`}>▲</span>
                    <span role="button" aria-label={`move ${sec.label.toLowerCase()} down`} onClick={() => moveSection(sec.id, 1)} className={`px-2 py-0.5 text-subhead leading-none ${i === ordered.length - 1 ? 'text-label-secondary' : 'text-label'}`}>▼</span>
                  </span>
                )}
              </div>
              {open && sec.info && <p className="mb-2 text-caption text-label-secondary leading-snug">{sec.info}</p>}
              {sec.id === firstSportId && <p className="mb-2 text-footnote text-label-secondary leading-snug">Tap a value to change it.</p>}
              {sec.body}
            </div>
          );
        })}
      </div>
    </div>
  );
}

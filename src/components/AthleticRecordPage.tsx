import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Trophy, Plus, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { supabase, getStoredUserId } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useLocation, useNavigate } from 'react-router-dom';
import { actualFinishSecondsPreferElapsed, type WorkoutTimeRow } from '@/lib/race-finish-seconds';

function fmtGoalClock(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const mi = Math.floor((totalSec % 3600) / 60);
  const s = Math.round(totalSec % 60);
  if (h > 0) return `${h}:${String(mi).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${mi}:${String(s).padStart(2, '0')}`;
}

function parseTimeToSeconds(input: string): number | null {
  const t = input.trim();
  if (!t) return null;
  const parts = t.split(':').map((p) => parseInt(p, 10));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

type RaceRow = {
  id: string;
  name: string;
  target_date: string | null;
  distance: string | null;
  sport: string | null;
  current_value: number | null;
  target_time: number | null;
  training_prefs: Record<string, unknown> | null;
};

type AddRacePrefill = {
  goalId?: string;
  name?: string;
  date?: string;
  distance?: string;
  sport?: string;
  planId?: string;
  workoutId?: string;
  elapsedSeconds?: number;
};

export default function AthleticRecordPage({ onClose: _onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [races, setRaces] = useState<RaceRow[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [pn, setPn] = useState<Record<string, unknown>>({});
  const [learnedFtp, setLearnedFtp] = useState<number | null>(null);
  const [longestRideSec, setLongestRideSec] = useState<number | null>(null);
  const [longestRideDate, setLongestRideDate] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addDate, setAddDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [addDistance, setAddDistance] = useState('marathon');
  const [addTime, setAddTime] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [addPrefill, setAddPrefill] = useState<AddRacePrefill | null>(null);
  const handledAddRaceRef = useRef(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<
    | { kind: 'saving'; name: string }
    | { kind: 'saved'; name: string; seconds: number }
    | { kind: 'error'; name: string; message: string }
    | null
  >(null);

  const load = useCallback(async () => {
    const uid = getStoredUserId();
    if (!uid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [{ data: goalRows }, { data: bl }, rideResult] = await Promise.all([
        supabase
          .from('goals')
          .select('id, name, target_date, distance, sport, current_value, target_time, training_prefs, status, goal_type')
          .eq('user_id', uid)
          .eq('goal_type', 'event')
          .eq('status', 'completed')
          .not('current_value', 'is', null)
          .order('target_date', { ascending: false }),
        supabase.from('user_baselines').select('performance_numbers, learned_fitness, updated_at').eq('user_id', uid).maybeSingle(),
        supabase
          .from('workouts')
          .select('id, date, type, workout_status, moving_time, elapsed_time, duration, computed')
          .eq('user_id', uid)
          .eq('workout_status', 'completed')
          .eq('type', 'ride'),
      ]);

      const gr = (goalRows || []) as RaceRow[];
      setRaces(gr);
      if (bl?.updated_at) setLastUpdated(String(bl.updated_at));
      const perf = (bl?.performance_numbers as Record<string, unknown>) || {};
      setPn(perf);
      const lf = bl?.learned_fitness as { ride_ftp_estimated?: { value?: number } } | null;
      setLearnedFtp(
        typeof lf?.ride_ftp_estimated?.value === 'number' && lf.ride_ftp_estimated.value > 0
          ? Math.round(lf.ride_ftp_estimated.value)
          : null,
      );

      const rides = Array.isArray(rideResult.data) ? rideResult.data : [];
      let best = 0;
      let bestDate: string | null = null;
      for (const w of rides) {
        const sec = actualFinishSecondsPreferElapsed(w as WorkoutTimeRow);
        if (sec != null && sec > best) {
          best = sec;
          bestDate = (w as { date?: string }).date ? String((w as { date: string }).date).slice(0, 10) : null;
        }
      }
      setLongestRideSec(best > 0 ? best : null);
      setLongestRideDate(bestDate);
    } catch (e) {
      console.warn('[AthleticRecord] load', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Declared before the auto-save effect so the effect's dep array can reference it
  // without hitting a temporal dead zone (otherwise React renders blank screen with
  // "Cannot access 'X' before initialization" because deps are read during render).
  const persistRaceResult = useCallback(
    async (input: {
      uid: string;
      prefill: AddRacePrefill | null;
      seconds: number | null;
      manual: { name: string; date: string; distance: string };
    }) => {
      const { uid, prefill, seconds, manual } = input;
      if (prefill?.planId) {
        const { data: fnData, error: fnErr } = await supabase.functions.invoke('complete-race', {
          body: {
            plan_id: prefill.planId,
            ...(prefill.workoutId ? { workout_id: prefill.workoutId } : {}),
          },
        });
        const payload = fnData as { error?: string; success?: boolean } | null;
        const serverError =
          (payload && typeof payload.error === 'string' && payload.error.trim() ? payload.error : '') || '';
        if (fnErr) throw new Error(serverError || (fnErr as Error).message || 'complete-race failed');
        if (serverError && !payload?.success) throw new Error(serverError);
        try { window.dispatchEvent(new CustomEvent('goals:invalidate')); } catch { /* ignore */ }
        try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch { /* ignore */ }
        try { window.dispatchEvent(new CustomEvent('week:invalidate')); } catch { /* ignore */ }
        return;
      }
      if (prefill?.goalId) {
        if (seconds == null || seconds <= 0) throw new Error('Missing elapsed seconds');
        const { data: existing } = await supabase
          .from('goals')
          .select('training_prefs')
          .eq('id', prefill.goalId)
          .eq('user_id', uid)
          .maybeSingle();
        const currentPrefs =
          existing?.training_prefs && typeof existing.training_prefs === 'object'
            ? (existing.training_prefs as Record<string, unknown>)
            : {};
        const { error } = await supabase
          .from('goals')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            current_value: seconds,
            training_prefs: {
              ...currentPrefs,
              manual_athletic_record: true,
              race_result: {
                actual_seconds: seconds,
                time_source: 'manual_elapsed',
                completed_at: new Date().toISOString(),
              },
            },
            updated_at: new Date().toISOString(),
          } as any)
          .eq('id', prefill.goalId)
          .eq('user_id', uid);
        if (error) throw error;
        try { window.dispatchEvent(new CustomEvent('goals:invalidate')); } catch { /* ignore */ }
        return;
      }
      if (seconds == null || seconds <= 0) throw new Error('Missing elapsed seconds');
      const date10 =
        typeof manual.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(manual.date.slice(0, 10))
          ? manual.date.slice(0, 10)
          : null;
      const racedAt = date10 ? `${date10}T12:00:00.000Z` : new Date().toISOString();
      const { error } = await supabase.from('goals').insert({
        user_id: uid,
        name: manual.name.trim(),
        goal_type: 'event',
        target_date: manual.date,
        distance: manual.distance,
        sport: 'run',
        status: 'completed',
        completed_at: racedAt,
        current_value: seconds,
        training_prefs: { manual_athletic_record: true, time_source: 'manual_elapsed' },
      } as any);
      if (error) throw error;
    },
    [],
  );

  useEffect(() => {
    if (handledAddRaceRef.current || !new URLSearchParams(location.search).has('addRace')) return;
    handledAddRaceRef.current = true;
    const prefill = ((location.state as { athleticRecordAddRace?: AddRacePrefill } | null)?.athleticRecordAddRace || null);
    setAddPrefill(prefill);
    if (prefill?.name) setAddName(prefill.name);
    if (prefill?.date) setAddDate(prefill.date.slice(0, 10));
    if (prefill?.distance) setAddDistance(prefill.distance);
    if (typeof prefill?.elapsedSeconds === 'number' && prefill.elapsedSeconds > 0) {
      setAddTime(fmtGoalClock(prefill.elapsedSeconds));
    }

    const elapsed = typeof prefill?.elapsedSeconds === 'number' ? prefill.elapsedSeconds : null;
    const canAutoSave =
      Boolean(prefill?.planId) ||
      (Boolean(prefill?.goalId) && elapsed != null && elapsed > 0);

    if (!canAutoSave) {
      setAddOpen(true);
      return;
    }

    const uid = getStoredUserId();
    if (!uid) {
      setAddOpen(true);
      return;
    }

    const displayName = prefill?.name?.trim() || 'race';
    setAutoSaveStatus({ kind: 'saving', name: displayName });
    void (async () => {
      try {
        await persistRaceResult({
          uid,
          prefill,
          seconds: elapsed,
          manual: { name: displayName, date: prefill?.date || '', distance: prefill?.distance || 'marathon' },
        });
        await load();
        setAutoSaveStatus({
          kind: 'saved',
          name: displayName,
          seconds: elapsed ?? 0,
        });
        setAddPrefill(null);
      } catch (e) {
        setAutoSaveStatus({
          kind: 'error',
          name: displayName,
          message: (e as Error)?.message || 'Could not save',
        });
        setAddOpen(true);
      }
    })();
  }, [location.search, location.state, persistRaceResult, load]);

  const hasContent =
    races.length > 0 ||
    (typeof pn.ftp === 'number' && pn.ftp > 0) ||
    learnedFtp != null ||
    (typeof (pn.fiveK_pace || pn.fiveK) === 'string' && String(pn.fiveK_pace || pn.fiveK).trim() !== '') ||
    (typeof pn.swimPace100 === 'string' && (pn.swimPace100 as string).trim() !== '') ||
    typeof pn.squat === 'number' ||
    typeof pn.deadlift === 'number' ||
    typeof pn.bench === 'number' ||
    typeof pn.overheadPress1RM === 'number' ||
    longestRideSec != null;

  const ftpDisplay = (typeof pn.ftp === 'number' && pn.ftp > 0 ? Math.round(pn.ftp) : null) ?? learnedFtp;
  const fiveKDisplay = String(pn.fiveK_pace || pn.fiveK || '').trim();
  const marathonPrDisplay = useMemo(() => {
    const r = races.find(
      (x) => /marathon|26\.2|42/i.test(String(x.distance || x.name || '')) && x.current_value != null,
    );
    return r?.current_value != null ? fmtGoalClock(Math.round(r.current_value)) : '—';
  }, [races]);

  const runDisc = (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-white/70">Running</p>
      <ul className="text-sm text-white/80 space-y-1.5">
        <li className="flex justify-between">
          <span className="text-white/50">5K</span>
          <span className="tabular-nums">{fiveKDisplay || '—'}</span>
        </li>
        <li className="flex justify-between">
          <span className="text-white/50">10K</span>
          <span className="tabular-nums">—</span>
        </li>
        <li className="flex justify-between">
          <span className="text-white/50">Half</span>
          <span className="tabular-nums">—</span>
        </li>
        <li className="flex justify-between">
          <span className="text-white/50">Marathon</span>
          <span className="tabular-nums text-emerald-200/90">{marathonPrDisplay}</span>
        </li>
      </ul>
    </div>
  );

  async function saveManualRace() {
    const uid = getStoredUserId();
    if (!uid) return;
    const sec = parseTimeToSeconds(addTime);
    if (!addPrefill?.planId && (!addName.trim() || !addDate || sec == null || sec <= 0)) {
      window.alert('Enter name, date, and finish time (e.g. 4:38:00 or 45:30). Times are elapsed / chip, not moving.');
      return;
    }
    setAddSaving(true);
    try {
      await persistRaceResult({
        uid,
        prefill: addPrefill,
        seconds: sec,
        manual: { name: addName, date: addDate, distance: addDistance },
      });
      setAddOpen(false);
      setAddName('');
      setAddTime('');
      setAddPrefill(null);
      await load();
    } catch (e) {
      window.alert((e as Error)?.message || 'Could not save');
    } finally {
      setAddSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 pb-6">
      <h2 className="text-2xl font-bold text-white pb-2">My Record</h2>
      <div className="text-center mb-6">
        <p className="text-white/50 text-sm">What you&apos;ve accomplished — finish times use elapsed (chip), not moving time.</p>
        {lastUpdated && (
          <p className="text-xs text-white/40 mt-2">Last updated: {new Date(lastUpdated).toLocaleDateString()}</p>
        )}
      </div>

      {autoSaveStatus && (
        <div
          className={
            autoSaveStatus.kind === 'error'
              ? 'mb-4 p-3 rounded-xl border border-red-400/30 bg-red-500/10 text-sm text-red-100 flex items-start gap-2'
              : autoSaveStatus.kind === 'saved'
                ? 'mb-4 p-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 text-sm text-emerald-100 flex items-start gap-2'
                : 'mb-4 p-3 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-white/80 flex items-center gap-2'
          }
        >
          {autoSaveStatus.kind === 'saving' ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>Saving {autoSaveStatus.name} result…</span>
            </>
          ) : autoSaveStatus.kind === 'saved' ? (
            <>
              <Trophy className="w-4 h-4 shrink-0 text-emerald-300" />
              <span>
                Saved <span className="font-semibold">{autoSaveStatus.name}</span>
                {autoSaveStatus.seconds > 0 && (
                  <> · <span className="tabular-nums">{fmtGoalClock(Math.round(autoSaveStatus.seconds))}</span></>
                )}{' '}
                to your record. Plan moved to past.
              </span>
              <button
                type="button"
                className="ml-auto text-xs text-emerald-200/80 hover:text-emerald-100"
                onClick={() => setAutoSaveStatus(null)}
              >
                Dismiss
              </button>
            </>
          ) : (
            <>
              <span className="shrink-0">⚠</span>
              <span>
                Couldn&apos;t auto-save {autoSaveStatus.name}: {autoSaveStatus.message}. The form is open below so you can save manually.
              </span>
              <button
                type="button"
                className="ml-auto text-xs text-red-200/80 hover:text-red-100"
                onClick={() => setAutoSaveStatus(null)}
              >
                Dismiss
              </button>
            </>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-white/40" />
        </div>
      ) : !hasContent ? (
        <div className="p-6 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-center space-y-4">
          <Trophy className="w-10 h-10 text-amber-400/70 mx-auto" />
          <p className="text-white/75 text-sm leading-relaxed max-w-sm mx-auto">
            Your record starts here. Add your first race or connect Strava to import your history.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center pt-1">
            <Button
              type="button"
              onClick={() => setAddOpen(true)}
              className="bg-amber-500/20 text-amber-100 border border-amber-400/30 hover:bg-amber-500/30"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add your first result
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate('/connections')} className="border-white/20 text-white/80">
              Connect Strava
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="p-4 rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/[0.08]">
            <h3 className="text-sm font-semibold text-white/90 mb-3 tracking-wide">Race results</h3>
            {races.length === 0 ? (
              <p className="text-sm text-white/45">No saved race finishes yet. Complete a plan from State or add one manually.</p>
            ) : (
              <ul className="space-y-2">
                {races.map((r) => {
                  const sec = r.current_value != null ? Math.round(Number(r.current_value)) : 0;
                  const tp = (r.training_prefs as { race_result?: { time_source?: string } } | null)?.race_result;
                  const isElapsed = (tp?.time_source || '').includes('elapsed') || (r.training_prefs as any)?.manual_athletic_record;
                  const hasCompare = r.target_time != null && r.target_time > 0;
                  return (
                    <li key={r.id} className="rounded-lg border border-white/[0.07] bg-white/[0.02]">
                      <button
                        type="button"
                        className="w-full text-left p-3 flex items-start justify-between gap-2"
                        onClick={() => setExpandedId((id) => (id === r.id ? null : r.id))}
                      >
                        <div>
                          <p className="text-sm font-medium text-white/90">{r.name}</p>
                          <p className="text-xs text-white/45 mt-0.5">
                            {r.target_date} {r.distance ? `· ${r.distance}` : ''} {r.sport ? `· ${r.sport}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-lg font-semibold tabular-nums text-emerald-300/90">{fmtGoalClock(sec)}</span>
                          {expandedId === r.id ? <ChevronDown className="w-4 h-4 text-white/40" /> : <ChevronRight className="w-4 h-4 text-white/40" />}
                        </div>
                      </button>
                      <p className="px-3 pb-2 text-[10px] text-white/40 uppercase tracking-wide">
                        {isElapsed || (r.training_prefs as any)?.manual_athletic_record ? 'Elapsed (chip) time' : 'Finish time'}
                      </p>
                      {expandedId === r.id && (
                        <div className="px-3 pb-3 text-xs text-white/55 space-y-1 border-t border-white/[0.06] pt-2">
                          {hasCompare && (
                            <p>
                              Goal target: <span className="text-white/75 tabular-nums">{fmtGoalClock(Math.round(r.target_time!))}</span>
                            </p>
                          )}
                          <p className="text-white/40">Finish times are elapsed (chip) where available — same rule as your State race results, not Strava moving time.</p>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <Button
              type="button"
              variant="ghost"
              className="mt-3 w-full text-amber-300/90 hover:text-amber-200 hover:bg-white/5"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add race
            </Button>
          </div>

          <div className="p-4 rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/[0.08]">
            <h3 className="text-sm font-semibold text-white/90 mb-3 tracking-wide">Personal records</h3>
            <div className="space-y-4">
              {runDisc}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-white/70">Cycling</p>
                <ul className="text-sm text-white/80 space-y-1.5">
                  <li className="flex justify-between">
                    <span className="text-white/50">FTP (best)</span>
                    <span className="tabular-nums">{ftpDisplay != null ? `${ftpDisplay}W` : '—'}</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-white/50">Longest ride (elapsed)</span>
                    <span className="tabular-nums text-right">
                      {longestRideSec != null ? (
                        <>
                          {fmtGoalClock(longestRideSec)}
                          {longestRideDate && <span className="text-white/40 text-xs ml-1">({longestRideDate})</span>}
                        </>
                      ) : (
                        '—'
                      )}
                    </span>
                  </li>
                </ul>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-white/70">Swim</p>
                <p className="text-sm text-white/80">
                  100yd pace:{' '}
                  <span className="tabular-nums text-white/90">{(pn.swimPace100 as string) || '—'}</span>
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-white/70">Strength</p>
                <ul className="text-sm text-white/80 space-y-1.5">
                  {[
                    ['Deadlift', pn.deadlift],
                    ['Squat', pn.squat],
                    ['Bench', pn.bench],
                    ['OHP', pn.overheadPress1RM],
                  ].map(([label, v]) => (
                    <li key={String(label)} className="flex justify-between">
                      <span className="text-white/50">{label}</span>
                      <span className="tabular-nums">
                        {typeof v === 'number' && v > 0 ? `${v} lbs` : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/[0.08]">
            <h3 className="text-sm font-semibold text-white/90 mb-2 tracking-wide">Milestones</h3>
            <p className="text-sm text-white/45 leading-relaxed">
              Streaks, plan completions, and other highlights from your training will show here.
            </p>
          </div>
        </div>
      )}

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) setAddPrefill(null);
        }}
      >
        <DialogContent className="bg-zinc-900 border border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle>{addPrefill?.planId || addPrefill?.goalId ? 'Save race result' : 'Add race result'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-white/50">
              {addPrefill?.planId
                ? 'My Record saves this elapsed-first race result and moves the plan to past.'
                : addPrefill?.goalId
                  ? 'My Record saves this elapsed result to the existing past goal.'
                : <>Enter <span className="text-amber-200/80">elapsed</span> (chip) time, not moving time.</>}
            </p>
            <label className="block text-xs text-white/60">Name</label>
            <input
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              disabled={Boolean(addPrefill?.planId || addPrefill?.goalId)}
              className="w-full h-9 px-2 text-sm bg-white/[0.08] border border-white/20 rounded"
              placeholder="City Marathon 2026"
            />
            <label className="block text-xs text-white/60">Race date</label>
            <input
              type="date"
              value={addDate}
              onChange={(e) => setAddDate(e.target.value)}
              disabled={Boolean(addPrefill?.planId || addPrefill?.goalId)}
              className="w-full h-9 px-2 text-sm bg-white/[0.08] border border-white/20 rounded"
            />
            <label className="block text-xs text-white/60">Distance</label>
            <select
              value={addDistance}
              onChange={(e) => setAddDistance(e.target.value)}
              disabled={Boolean(addPrefill?.planId || addPrefill?.goalId)}
              className="w-full h-9 px-2 text-sm bg-white/[0.08] border border-white/20 rounded"
            >
              <option value="5K">5K</option>
              <option value="10K">10K</option>
              <option value="half">Half marathon</option>
              <option value="marathon">Marathon</option>
              <option value="ultra">Ultra</option>
            </select>
            <label className="block text-xs text-white/60">Finish time (elapsed)</label>
            <input
              value={addTime}
              onChange={(e) => setAddTime(e.target.value)}
              disabled={Boolean(addPrefill?.planId)}
              className="w-full h-9 px-2 text-sm bg-white/[0.08] border border-white/20 rounded tabular-nums"
              placeholder={addPrefill?.planId ? 'Read from completed race log' : '4:38:00 or 45:30'}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)} type="button">
              Cancel
            </Button>
            <Button
              onClick={() => {
                void saveManualRace();
              }}
              disabled={addSaving}
              className="bg-amber-600 hover:bg-amber-500"
              type="button"
            >
              {addSaving ? 'Saving…' : addPrefill?.planId ? 'Save result & close plan' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

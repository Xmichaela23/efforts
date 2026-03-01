import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Target, Calendar, TrendingUp, Plus, ChevronRight, ChevronDown, Flag, Dumbbell, Activity, Bike, Waves, Loader2, Trash2, Pause, Play, Link2, List } from 'lucide-react';
import { differenceInWeeks, format } from 'date-fns';
import { useGoals, Goal, GoalInsert } from '@/hooks/useGoals';
import { supabase } from '@/lib/supabase';
import { useAppContext } from '@/contexts/AppContext';

interface GoalsScreenProps {
  onClose: () => void;
  onSelectPlan?: (planId: string) => void;
  onViewAllPlans?: () => void;
  onPlanBuilt?: () => void;
  currentPlans?: Array<{ id: string; name: string; currentWeek?: number; status: string; goal_id?: string | null; config?: any; plan_type?: string }>;
  completedPlans?: Array<{ id: string; name: string; status: string; goal_id?: string | null }>;
}

const SPORT_ICONS: Record<string, React.FC<{ className?: string }>> = {
  run: Activity, ride: Bike, swim: Waves, strength: Dumbbell,
  triathlon: Activity, general: Activity, other: Target,
};

const DISTANCE_OPTIONS: Record<string, string[]> = {
  run: ['5K', '10K', 'Half Marathon', 'Marathon', 'Ultra'],
  ride: ['Century', 'Metric Century', 'Gran Fondo'],
  swim: ['Sprint', 'Mile', 'Open Water'],
  triathlon: ['Sprint', 'Olympic', '70.3', '140.6'],
};

const METRIC_OPTIONS: Record<string, string[]> = {
  Speed: ['5K time', 'Mile time', '10K time'],
  Strength: ['Squat 1RM', 'Bench 1RM', 'Deadlift 1RM', 'OHP 1RM'],
  Endurance: ['Weekly volume', 'Long run distance'],
  Power: ['FTP', 'Max power'],
};

function getGoalTypeIcon(t: string) {
  return t === 'event' ? Flag : t === 'capacity' ? TrendingUp : t === 'maintenance' ? Activity : Target;
}

function getSportIcon(s: string | null) {
  return s ? SPORT_ICONS[s.toLowerCase()] ?? null : null;
}

function inferSportFromPlanConfig(config: any, planType?: string): string {
  if (config?.sport) return String(config.sport).toLowerCase();
  const dist = String(config?.distance || '').toLowerCase();
  if (['5k', '10k', 'half', 'marathon'].includes(dist)) return 'run';
  const pt = String(planType || '').toLowerCase();
  if (pt.includes('run')) return 'run';
  if (pt.includes('ride') || pt.includes('bike') || pt.includes('cycling')) return 'ride';
  if (pt.includes('swim')) return 'swim';
  if (pt.includes('tri')) return 'triathlon';
  return '';
}

const GoalsScreen: React.FC<GoalsScreenProps> = ({
  onClose, onSelectPlan, onViewAllPlans, onPlanBuilt,
  currentPlans = [], completedPlans = [],
}) => {
  const navigate = useNavigate();
  const { useImperial } = useAppContext();
  const { goals, loading, addGoal, deleteGoal, updateGoal, refreshGoals } = useGoals();

  const [showAddGoal, setShowAddGoal] = useState(false);
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null);
  const [showEventForm, setShowEventForm] = useState(false);
  const [showCapacityForm, setShowCapacityForm] = useState(false);
  const [showMaintenanceForm, setShowMaintenanceForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [buildingGoalId, setBuildingGoalId] = useState<string | null>(null);
  const [buildError, setBuildError] = useState<{ goalId: string; message: string } | null>(null);
  const [currentBaselines, setCurrentBaselines] = useState<any>(null);
  const [currentSnapshot, setCurrentSnapshot] = useState<any>(null);
  const [conflictDialog, setConflictDialog] = useState<{ goal: Goal; conflictPlan: typeof currentPlans[0] } | null>(null);
  const [linkDialog, setLinkDialog] = useState<{ plan: typeof currentPlans[0] } | null>(null);
  const [showCalibration, setShowCalibration] = useState(false);
  const [calEasyPace, setCalEasyPace] = useState('');
  const [calFiveKPace, setCalFiveKPace] = useState('');
  const [calSaving, setCalSaving] = useState(false);
  const [goalFlowError, setGoalFlowError] = useState<string | null>(null);

  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventSport, setEventSport] = useState('run');
  const [eventDistance, setEventDistance] = useState('');
  const [eventPriority, setEventPriority] = useState<'A' | 'B' | 'C'>('A');
  const [eventFitness, setEventFitness] = useState<'beginner' | 'intermediate' | 'advanced' | ''>('');
  const [eventTrainingGoal, setEventTrainingGoal] = useState<'complete' | 'speed' | ''>('');
  const [overrideFitness, setOverrideFitness] = useState(false);
  const [overrideGoal, setOverrideGoal] = useState(false);
  const [eventStrength, setEventStrength] = useState<'none' | 'neural_speed' | 'durability' | 'upper_aesthetics'>('none');
  const [eventStrengthFreq, setEventStrengthFreq] = useState<2 | 3>(2);
  const [overrideStrength, setOverrideStrength] = useState(false);

  // Pre-fill fitness + goal from existing data when the event form opens
  useEffect(() => {
    if (!showEventForm) return;
    if (!eventFitness && (currentBaselines || currentSnapshot)) {
      const vdot = currentBaselines?.effort_score;
      const weeklyMi = currentSnapshot?.weekly_distance
        ? Math.round(currentSnapshot.weekly_distance)
        : currentBaselines?.current_volume?.run
          ? parseFloat(currentBaselines.current_volume.run) || 0
          : 0;

      if (vdot) {
        setEventFitness(vdot >= 45 ? 'advanced' : vdot >= 33 ? 'intermediate' : 'beginner');
      } else if (weeklyMi > 0) {
        setEventFitness(weeklyMi >= 30 ? 'advanced' : weeklyMi >= 12 ? 'intermediate' : 'beginner');
      } else if (currentSnapshot) {
        setEventFitness('intermediate');
      }
    }
    if (!eventTrainingGoal && (currentBaselines !== undefined)) {
      const hasPaceData = currentBaselines?.effort_score || currentBaselines?.effort_paces?.race;
      setEventTrainingGoal(hasPaceData ? 'speed' : 'complete');
    }
    if (eventStrength === 'none') {
      const existingPlan = currentPlans.find(p => p.status === 'active' && p.config?.strength_protocol);
      if (existingPlan?.config?.strength_protocol) {
        setEventStrength(existingPlan.config.strength_protocol);
        setEventStrengthFreq(existingPlan.config.strength_frequency || 2);
      }
    }
  }, [showEventForm, currentBaselines, currentSnapshot]);
  const [capCategory, setCapCategory] = useState('Speed');
  const [capMetric, setCapMetric] = useState('');
  const [capTarget, setCapTarget] = useState('');
  const [maintSport, setMaintSport] = useState('run');
  const [maintDays, setMaintDays] = useState('4');

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [{ data: bl }, { data: sn }] = await Promise.all([
        supabase.from('user_baselines').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('athlete_snapshot').select('*').eq('user_id', user.id).order('week_start', { ascending: false }).limit(1).maybeSingle(),
      ]);
      setCurrentBaselines(bl);
      setCurrentSnapshot(sn);
    })();
  }, []);

  const activeGoals = useMemo(() => goals.filter(g => g.status === 'active'), [goals]);
  const inactiveGoals = useMemo(() => goals.filter(g => g.status !== 'active'), [goals]);

  const plansByGoalId = useMemo(() => {
    const map = new Map<string, typeof currentPlans[0]>();
    for (const p of currentPlans) if (p.goal_id) map.set(p.goal_id, p);
    return map;
  }, [currentPlans]);

  // Only active plans not linked to any goal
  const activeUnlinkedPlans = useMemo(
    () => currentPlans.filter(p => !p.goal_id && (p.status === 'active' || p.status === 'paused')),
    [currentPlans],
  );

  const totalPlanCount = currentPlans.length + completedPlans.length;

  async function parseFunctionError(error: any, data: any, fallback: string): Promise<{ message: string; code?: string }> {
    if (data && typeof data === 'object') {
      const msg = (data as any).error;
      const code = (data as any).error_code;
      if (typeof msg === 'string' && msg.trim()) return { message: msg, code };
    }

    try {
      const ctx = (error as any)?.context;
      if (ctx?.json) {
        const payload = await ctx.json();
        const msg = payload?.error;
        const code = payload?.error_code;
        if (typeof msg === 'string' && msg.trim()) return { message: msg, code };
      }
    } catch {
      // Ignore parse failures and fall back to generic text
    }

    return { message: error?.message || fallback };
  }

  function resetForms() {
    setShowAddGoal(false); setShowEventForm(false); setShowCapacityForm(false); setShowMaintenanceForm(false);
    setEventName(''); setEventDate(''); setEventSport('run'); setEventDistance(''); setEventPriority('A'); setEventFitness(''); setEventTrainingGoal(''); setOverrideFitness(false); setOverrideGoal(false); setEventStrength('none'); setEventStrengthFreq(2); setOverrideStrength(false);
    setCapCategory('Speed'); setCapMetric(''); setCapTarget('');
    setMaintSport('run'); setMaintDays('4');
    setGoalFlowError(null);
  }

  // --- Quick Calibration (two-pace baseline) ---

  const VDOT_5K: [number, number][] = [
    [30,1860],[31,1800],[32,1740],[33,1686],[34,1632],[35,1584],[36,1536],[37,1488],
    [38,1446],[39,1404],[40,1362],[41,1326],[42,1290],[43,1254],[44,1222],[45,1188],
    [46,1158],[47,1128],[48,1098],[49,1072],[50,1044],[51,1020],[52,996],[53,972],
    [54,951],[55,930],[56,909],[57,891],[58,873],[59,855],[60,838],[65,762],[70,696],
    [75,642],[80,594],[85,552],
  ];
  const PACE_BY_VDOT: [number, number, number, number, number, number][] = [
    // vdot, base, race, steady, power, speed  (sec/mile)
    [30,744,682,622,568,534],[32,708,648,592,540,508],[34,672,618,564,516,484],
    [36,642,588,538,492,462],[38,612,562,514,470,442],[40,585,537,491,449,422],
    [42,560,514,470,430,404],[44,536,492,450,412,387],[45,525,482,441,403,379],[46,514,472,432,395,371],
    [48,494,453,415,379,357],[50,474,436,399,365,343],[52,456,419,383,351,330],
    [54,439,403,369,338,318],[56,423,388,355,325,306],[58,408,375,343,314,295],
    [60,394,362,331,303,285],[65,362,332,304,278,262],[70,334,306,280,256,241],
    [75,309,284,260,238,224],[80,287,264,241,221,208],
  ];

  function parsePace(s: string): number | null {
    const m = s.trim().match(/^(\d{1,2}):(\d{2})$/);
    return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : null;
  }

  function fmtPace(sec: number): string {
    const m = Math.floor(sec / 60), s = Math.round(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function vdotFrom5KTime(timeSec: number): number {
    if (timeSec >= VDOT_5K[0][1]) return VDOT_5K[0][0];
    if (timeSec <= VDOT_5K[VDOT_5K.length - 1][1]) return VDOT_5K[VDOT_5K.length - 1][0];
    for (let i = 0; i < VDOT_5K.length - 1; i++) {
      const [v1, t1] = VDOT_5K[i], [v2, t2] = VDOT_5K[i + 1];
      if (timeSec <= t1 && timeSec >= t2) {
        return Math.round((v1 + ((t1 - timeSec) / (t1 - t2)) * (v2 - v1)) * 10) / 10;
      }
    }
    return 40;
  }

  function pacesFromVdot(vdot: number): { base: number; race: number; steady: number; power: number; speed: number } {
    const tbl = PACE_BY_VDOT;
    if (vdot <= tbl[0][0]) return { base: tbl[0][1], race: tbl[0][2], steady: tbl[0][3], power: tbl[0][4], speed: tbl[0][5] };
    if (vdot >= tbl[tbl.length - 1][0]) { const l = tbl[tbl.length - 1]; return { base: l[1], race: l[2], steady: l[3], power: l[4], speed: l[5] }; }
    for (let i = 0; i < tbl.length - 1; i++) {
      if (vdot >= tbl[i][0] && vdot <= tbl[i + 1][0]) {
        const f = (vdot - tbl[i][0]) / (tbl[i + 1][0] - tbl[i][0]);
        return {
          base:   Math.round(tbl[i][1] - f * (tbl[i][1] - tbl[i + 1][1])),
          race:   Math.round(tbl[i][2] - f * (tbl[i][2] - tbl[i + 1][2])),
          steady: Math.round(tbl[i][3] - f * (tbl[i][3] - tbl[i + 1][3])),
          power:  Math.round(tbl[i][4] - f * (tbl[i][4] - tbl[i + 1][4])),
          speed:  Math.round(tbl[i][5] - f * (tbl[i][5] - tbl[i + 1][5])),
        };
      }
    }
    return { base: 585, race: 537, steady: 491, power: 449, speed: 422 };
  }

  const isMetric = !useImperial;
  const paceUnit = isMetric ? '/km' : '/mi';

  async function handleCalibrationSave() {
    const easyRaw = parsePace(calEasyPace);
    const fiveKRaw = parsePace(calFiveKPace);
    if (!easyRaw || !fiveKRaw) return;

    setCalSaving(true);
    try {
      const toSecPerMile = (v: number) => isMetric ? Math.round(v * 1.60934) : v;
      const fiveKPerMile = toSecPerMile(fiveKRaw);
      const easyPerMile = toSecPerMile(easyRaw);
      const fiveKTimeSec = Math.round(fiveKPerMile * 3.10686);
      const vdot = vdotFrom5KTime(fiveKTimeSec);
      const paces = pacesFromVdot(vdot);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from('user_baselines').upsert({
        user_id: user.id,
        effort_score: vdot,
        effort_source_distance: 5000,
        effort_source_time: fiveKTimeSec,
        effort_paces: paces,
        effort_paces_source: 'calculated',
        effort_score_status: 'self_reported',
        effort_updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

      const { data: bl } = await supabase.from('user_baselines').select('*').eq('user_id', user.id).maybeSingle();
      setCurrentBaselines(bl);
      setShowCalibration(false);
      setCalEasyPace('');
      setCalFiveKPace('');
    } finally {
      setCalSaving(false);
    }
  }

  function findConflictPlan(goal: Goal) {
    if (!goal.sport) return null;
    const sport = goal.sport.toLowerCase();
    return currentPlans.find(p =>
      !p.goal_id && p.status === 'active' && inferSportFromPlanConfig(p.config || {}, p.plan_type) === sport
    ) ?? null;
  }

  function handleBuildPlan(goal: Goal) {
    const conflict = findConflictPlan(goal);
    conflict ? setConflictDialog({ goal, conflictPlan: conflict }) : executeBuildPlan(goal, null);
  }

  async function executeBuildPlan(goal: Goal, _conflictPlanId: string | null): Promise<{ success: boolean; error?: string }> {
    setConflictDialog(null);
    setBuildingGoalId(goal.id);
    setBuildError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');
      const { data, error } = await supabase.functions.invoke('create-goal-and-materialize-plan', {
        body: {
          user_id: user.id,
          mode: 'build_existing',
          existing_goal_id: goal.id,
          replace_plan_id: _conflictPlanId || null,
        },
      });
      if (error || !data?.success) {
        const parsed = await parseFunctionError(error, data, 'Unable to build and materialize plan');
        if (parsed.code === 'missing_pace_benchmark') setShowCalibration(true);
        throw new Error(parsed.message);
      }

      try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch {}
      onPlanBuilt?.();
      refreshGoals();
      return { success: true };
    } catch (err: any) {
      console.error('Build plan failed:', err);
      const message = err?.message || 'Failed to build plan';
      setBuildError({ goalId: goal.id, message });
      return { success: false, error: message };
    } finally {
      setBuildingGoalId(null);
    }
  }

  // --- Link plan to goal ---

  async function handleLinkPlan(planId: string, goalId: string) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');

      const { data, error } = await supabase.functions.invoke('create-goal-and-materialize-plan', {
        body: {
          user_id: user.id,
          mode: 'link_existing',
          existing_goal_id: goalId,
          plan_id: planId,
        },
      });
      if (error || !data?.success) {
        const parsed = await parseFunctionError(error, data, 'Unable to link plan');
        throw new Error(parsed.message);
      }

      setLinkDialog(null);
      onPlanBuilt?.();
      refreshGoals();
    } catch (err) {
      console.error('Link plan failed:', err);
    }
  }

  // --- Goal CRUD ---

  async function handleDeleteGoal(goal: Goal) {
    if (!confirm(`Delete "${goal.name}"?`)) return;
    await deleteGoal(goal.id);
    setExpandedGoalId(null);
  }

  async function handleTogglePause(goal: Goal) {
    await updateGoal(goal.id, { status: goal.status === 'paused' ? 'active' : 'paused' });
  }

  const [existingGoalPrompt, setExistingGoalPrompt] = useState<{ existing: Goal; action?: 'keep' | 'replace' } | null>(null);

  async function handleSaveEvent() {
    if (!eventName.trim() || !eventDate || !eventFitness || !eventTrainingGoal) return;
    setGoalFlowError(null);

    const sameSportGoal = activeGoals.find(
      g => g.goal_type === 'event' && (g.sport || '').toLowerCase() === eventSport.toLowerCase()
    );
    if (sameSportGoal && !existingGoalPrompt?.action) {
      setExistingGoalPrompt({ existing: sameSportGoal });
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');

      const action: 'keep' | 'replace' = existingGoalPrompt?.action === 'replace' ? 'replace' : 'keep';
      const payload = {
        user_id: user.id,
        action,
        existing_goal_id: existingGoalPrompt?.existing.id || null,
        replace_goal_id: action === 'replace' ? existingGoalPrompt?.existing.id : null,
        goal: {
          name: eventName.trim(),
          target_date: eventDate,
          sport: eventSport,
          distance: eventDistance || null,
          training_prefs: {
            fitness: eventFitness,
            goal_type: eventTrainingGoal,
            ...(eventStrength !== 'none' && { strength_protocol: eventStrength, strength_frequency: eventStrengthFreq }),
          },
          notes: null,
        },
      };

      const { data, error } = await supabase.functions.invoke('create-goal-and-materialize-plan', { body: payload });
      if (error || !data?.success) {
        const parsed = await parseFunctionError(error, data, 'Unable to create goal and build plan');
        if (parsed.code === 'missing_pace_benchmark') setShowCalibration(true);
        throw new Error(parsed.message);
      }

      setExistingGoalPrompt(null);
      resetForms();
      onPlanBuilt?.();
      refreshGoals();
    } catch (err: any) {
      console.error('Goal create+build flow failed:', err);
      setGoalFlowError(err?.message || 'Unable to build and materialize plan for this goal.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveCapacity() {
    if (!capMetric || !capTarget) return;
    setSaving(true);
    await addGoal({ name: `Improve ${capMetric}`, goal_type: 'capacity', target_date: null, sport: null, distance: null, course_profile: {}, target_metric: capMetric, target_value: parseFloat(capTarget), current_value: null, priority: 'A', status: 'active', training_prefs: { category: capCategory }, notes: null });
    setSaving(false); resetForms(); refreshGoals();
  }

  async function handleSaveMaintenance() {
    setSaving(true);
    await addGoal({ name: `${maintSport.charAt(0).toUpperCase() + maintSport.slice(1)} maintenance`, goal_type: 'maintenance', target_date: null, sport: maintSport, distance: null, course_profile: {}, target_metric: null, target_value: null, current_value: null, priority: 'A', status: 'active', training_prefs: { days_per_week: parseInt(maintDays, 10) }, notes: null });
    setSaving(false); resetForms(); refreshGoals();
  }

  // ===================== RENDER =====================

  function renderGoalCard(goal: Goal) {
    const TypeIcon = getGoalTypeIcon(goal.goal_type);
    const SportIcon = getSportIcon(goal.sport);
    const linkedPlan = plansByGoalId.get(goal.id);
    const isExpanded = expandedGoalId === goal.id;

    return (
      <div key={goal.id} className={`rounded-2xl border p-4 transition-all duration-200 ${isExpanded ? 'border-white/20 bg-white/[0.06]' : 'border-white/10 bg-white/[0.04]'}`}>
        <button className="w-full text-left" onClick={() => setExpandedGoalId(isExpanded ? null : goal.id)}>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex items-center gap-2">
              <TypeIcon className="h-5 w-5 text-white/50" />
              {SportIcon && <SportIcon className="h-4 w-4 text-white/40" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-lg font-medium text-white/90 truncate">{goal.name}</span>
                {goal.priority !== 'A' && <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/50">{goal.priority}</span>}
                {goal.status === 'paused' && <span className="shrink-0 rounded-full bg-yellow-500/15 px-2 py-0.5 text-[11px] font-medium text-yellow-400/70">Paused</span>}
              </div>
              {goal.goal_type === 'event' && goal.target_date && (
                <div className="mt-1 flex items-center gap-2 text-sm text-white/50">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{format(new Date(goal.target_date + 'T12:00:00'), 'MMM d, yyyy')}</span>
                  <span className="text-white/30">{differenceInWeeks(new Date(goal.target_date + 'T12:00:00'), new Date())} weeks away</span>
                </div>
              )}
              {goal.goal_type === 'capacity' && (
                <div className="mt-1 flex items-center gap-2 text-sm text-white/50">
                  <TrendingUp className="h-3.5 w-3.5" />
                  <span>{goal.current_value ?? '?'} → {goal.target_value}</span>
                  {goal.target_metric && <span className="text-white/30">{goal.target_metric}</span>}
                </div>
              )}
              {goal.goal_type === 'maintenance' && (
                <p className="mt-1 text-sm text-white/50">{goal.sport ? `${goal.sport.charAt(0).toUpperCase() + goal.sport.slice(1)} · ` : ''}Ongoing</p>
              )}
            </div>
          </div>
        </button>

        <div className="ml-[44px] mt-1">
          {linkedPlan ? (
            <button className="flex items-center gap-1 text-sm text-white/60 hover:text-white/80 transition-colors" onClick={() => onSelectPlan?.(linkedPlan.id)}>
              <span>Plan: {linkedPlan.name}{linkedPlan.currentWeek != null && ` · Week ${linkedPlan.currentWeek}`}</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          ) : buildingGoalId === goal.id ? (
            <div className="flex items-center gap-2 text-sm text-white/50"><Loader2 className="h-3.5 w-3.5 animate-spin" />Building your plan...</div>
          ) : (() => {
            const conflictPlan = goal.goal_type === 'event' ? findConflictPlan(goal) : null;

            if (goal.goal_type === 'event' && conflictPlan) return (
              <div className="space-y-2">
                <p className="text-xs text-white/40">You have an active plan: <span className="text-white/60">{conflictPlan.name}</span></p>
                <div className="flex gap-2">
                  <button className="rounded-lg bg-white/[0.08] border border-white/10 px-3 py-1.5 text-xs font-medium text-white/60 hover:bg-white/[0.12] transition-all" onClick={() => handleLinkPlan(conflictPlan.id, goal.id)}>Link existing plan</button>
                  <button className="rounded-lg bg-white/[0.12] border border-white/15 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/[0.18] transition-all" onClick={() => handleBuildPlan(goal)}>End it · Build new →</button>
                </div>
              </div>
            );
            if (goal.goal_type === 'event') return (
              <button className="text-sm text-white/50 hover:text-white/70 transition-colors" onClick={() => handleBuildPlan(goal)}>No plan yet · Build Plan →</button>
            );
            return <p className="text-sm text-white/25">No plan linked</p>;
          })()}
          {buildError?.goalId === goal.id && <p className="mt-1 text-xs text-red-400/70">{buildError.message}</p>}
        </div>

        {isExpanded && (
          <div className="mt-3 ml-[44px] flex items-center gap-2 pt-3 border-t border-white/[0.06]">
            <button onClick={() => handleTogglePause(goal)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white/50 hover:bg-white/[0.06] hover:text-white/70 transition-all">
              {goal.status === 'paused' ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              {goal.status === 'paused' ? 'Resume' : 'Pause'}
            </button>
            <button onClick={() => handleDeleteGoal(goal)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-400/60 hover:bg-red-400/10 hover:text-red-400/80 transition-all">
              <Trash2 className="h-3.5 w-3.5" />Delete
            </button>
          </div>
        )}
      </div>
    );
  }

  function renderPlanCard(plan: typeof currentPlans[0]) {
    return (
      <div key={plan.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition-all duration-200 hover:bg-white/[0.06]">
        <button className="w-full text-left" onClick={() => onSelectPlan?.(plan.id)}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-base font-medium text-white/90">{plan.name}</p>
              {plan.currentWeek != null && <p className="text-sm text-white/50 mt-0.5">Week {plan.currentWeek}</p>}
            </div>
            <ChevronRight className="h-4 w-4 text-white/30" />
          </div>
        </button>
        {activeGoals.length > 0 && (
          <button
            className="mt-2 flex items-center gap-1.5 text-xs text-white/35 hover:text-white/55 transition-colors"
            onClick={() => setLinkDialog({ plan })}
          >
            <Link2 className="h-3 w-3" />Link to a goal
          </button>
        )}
      </div>
    );
  }

  // ===================== SUB-SCREENS =====================

  if (showEventForm) return renderEventForm();
  if (showCapacityForm) return renderCapacityForm();
  if (showMaintenanceForm) return renderMaintenanceForm();
  if (showAddGoal) return renderAddGoalSheet();

  // ===================== MAIN SCREEN =====================

  return (
    <div className="flex flex-col h-full">
      {/* Conflict dialog */}
      {conflictDialog && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#0b0b0c]/95 p-5 shadow-2xl">
            <p className="text-base font-medium text-white/90 mb-2">Replace existing plan?</p>
            <p className="text-sm text-white/50 leading-relaxed mb-5">
              You have an active plan: <span className="text-white/70">{conflictDialog.conflictPlan.name}</span>.
              This will end it and build a new plan for <span className="text-white/70">{conflictDialog.goal.name}</span>.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConflictDialog(null)} className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-medium text-white/50 hover:bg-white/[0.06] transition-all">Cancel</button>
              <button onClick={() => executeBuildPlan(conflictDialog.goal, conflictDialog.conflictPlan.id)} className="flex-1 rounded-xl bg-white/[0.15] py-2.5 text-sm font-medium text-white/90 hover:bg-white/[0.22] transition-all">End & Build</button>
            </div>
          </div>
        </div>
      )}

      {/* Link to goal dialog */}
      {linkDialog && activeGoals.length > 0 && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#0b0b0c]/95 p-5 shadow-2xl">
            <p className="text-base font-medium text-white/90 mb-1">Link plan to a goal</p>
            <p className="text-sm text-white/40 mb-4">{linkDialog.plan.name}</p>
            <div className="space-y-2 mb-4">
              {activeGoals.map(g => (
                <button
                  key={g.id}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-sm text-white/80 hover:bg-white/[0.08] transition-all"
                  onClick={() => handleLinkPlan(linkDialog.plan.id, g.id)}
                >
                  {g.name}
                </button>
              ))}
            </div>
            <button onClick={() => setLinkDialog(null)} className="w-full rounded-xl border border-white/10 py-2.5 text-sm font-medium text-white/50 hover:bg-white/[0.06] transition-all">Cancel</button>
          </div>
        </div>
      )}

      {/* Existing goal prompt */}
      {existingGoalPrompt && !existingGoalPrompt.action && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#0b0b0c]/95 p-5 shadow-2xl">
            <p className="text-base font-medium text-white/90 mb-2">You already have an active goal</p>
            <p className="text-sm text-white/50 leading-relaxed mb-5">
              <span className="text-white/70">{existingGoalPrompt.existing.name}</span>
              {existingGoalPrompt.existing.target_date && ` · ${format(new Date(existingGoalPrompt.existing.target_date + 'T12:00:00'), 'MMM d')}`}.
              What would you like to do?
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => { setExistingGoalPrompt({ ...existingGoalPrompt, action: 'keep' }); handleSaveEvent(); }}
                className="w-full rounded-xl px-4 py-3 text-left transition-all border border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"
              >
                <span className="text-sm font-medium text-white/80">Keep both</span>
                <span className="block text-xs text-white/35 mt-0.5">Train for both — the new one becomes secondary</span>
              </button>
              <button
                onClick={() => { setExistingGoalPrompt({ ...existingGoalPrompt, action: 'replace' }); handleSaveEvent(); }}
                className="w-full rounded-xl px-4 py-3 text-left transition-all border border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"
              >
                <span className="text-sm font-medium text-white/80">Replace it</span>
                <span className="block text-xs text-white/35 mt-0.5">End {existingGoalPrompt.existing.name} and focus on the new one</span>
              </button>
              <button onClick={() => setExistingGoalPrompt(null)} className="w-full rounded-xl py-2.5 text-sm text-white/40 hover:text-white/60 transition-all">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Calibration modal */}
      {showCalibration && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#0b0b0c]/95 p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-white/90 mb-1">Quick Calibration</h3>
            <p className="text-sm text-white/40 mb-5">Two paces to set your training zones.</p>

            <div className="space-y-4">
              <div>
                <label className="text-sm text-white/50 block mb-1.5">
                  Easy pace — conversational, could hold for an hour
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text" inputMode="numeric" placeholder={isMetric ? '6:30' : '10:30'}
                    value={calEasyPace} onChange={e => setCalEasyPace(e.target.value)}
                    className="bg-white/[0.06] border border-white/10 rounded-xl px-4 py-2.5 text-white/90 text-center text-lg w-28 focus:outline-none focus:border-white/25 transition-colors"
                  />
                  <span className="text-sm text-white/30">{paceUnit}</span>
                </div>
              </div>

              <div>
                <label className="text-sm text-white/50 block mb-1.5">
                  5K pace — fastest you could sustain for ~25 minutes
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text" inputMode="numeric" placeholder={isMetric ? '5:00' : '8:00'}
                    value={calFiveKPace} onChange={e => setCalFiveKPace(e.target.value)}
                    className="bg-white/[0.06] border border-white/10 rounded-xl px-4 py-2.5 text-white/90 text-center text-lg w-28 focus:outline-none focus:border-white/25 transition-colors"
                  />
                  <span className="text-sm text-white/30">{paceUnit}</span>
                </div>
              </div>

              {parsePace(calEasyPace) && parsePace(calFiveKPace) && (() => {
                const easyS = parsePace(calEasyPace)!, fiveKS = parsePace(calFiveKPace)!;
                if (fiveKS >= easyS) return <p className="text-xs text-red-400/70">5K pace should be faster than easy pace</p>;
                const ratio = easyS / fiveKS;
                if (ratio > 1.8) return <p className="text-xs text-amber-400/60">That's a large gap — double-check your paces</p>;
                const fiveKTime = Math.round((isMetric ? fiveKS * 1.60934 : fiveKS) * 3.10686);
                const vdot = vdotFrom5KTime(fiveKTime);
                const paces = pacesFromVdot(vdot);
                const fmt = (s: number) => fmtPace(isMetric ? s / 1.60934 : s);
                return (
                  <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3 space-y-1">
                    <p className="text-xs text-white/40 mb-1.5">Your derived training zones</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <span className="text-white/40">Easy</span><span className="text-white/70 font-mono">{fmt(paces.base)} {paceUnit}</span>
                      <span className="text-white/40">Tempo</span><span className="text-white/70 font-mono">{fmt(paces.steady)} {paceUnit}</span>
                      <span className="text-white/40">Interval</span><span className="text-white/70 font-mono">{fmt(paces.power)} {paceUnit}</span>
                      <span className="text-white/40">Race</span><span className="text-white/70 font-mono">{fmt(paces.race)} {paceUnit}</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowCalibration(false); setCalEasyPace(''); setCalFiveKPace(''); }}
                className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-medium text-white/50 hover:bg-white/[0.06] transition-all"
              >Cancel</button>
              <button
                onClick={handleCalibrationSave}
                disabled={!parsePace(calEasyPace) || !parsePace(calFiveKPace) || (parsePace(calFiveKPace)! >= parsePace(calEasyPace)!) || calSaving}
                className="flex-1 rounded-xl bg-white/[0.15] py-2.5 text-sm font-medium text-white/90 hover:bg-white/[0.22] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >{calSaving ? 'Saving...' : 'Set Baseline'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4">
        <h2 className="text-2xl font-semibold text-white/90">Goals</h2>
        <button onClick={onClose} className="rounded-full p-2 text-white/50 hover:bg-white/10 hover:text-white/80 transition-all">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 animate-pulse">
                <div className="h-5 w-2/3 rounded bg-white/10 mb-2" /><div className="h-4 w-1/2 rounded bg-white/[0.06]" />
              </div>
            ))}
          </div>
        ) : activeGoals.length === 0 && activeUnlinkedPlans.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Target className="h-10 w-10 text-white/20 mb-4" />
            <p className="text-white/50 text-base">No goals yet</p>
            <p className="text-white/30 text-sm mt-1">Add one to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeGoals.map(renderGoalCard)}

            {activeUnlinkedPlans.length > 0 && (
              <>
                {activeGoals.length > 0 && (
                  <div className="flex items-center gap-3 py-3">
                    <div className="h-px flex-1 bg-white/10" />
                    <span className="text-xs font-medium text-white/30 uppercase tracking-wider">Active Plans</span>
                    <div className="h-px flex-1 bg-white/10" />
                  </div>
                )}
                {activeUnlinkedPlans.map(renderPlanCard)}
              </>
            )}

            {inactiveGoals.length > 0 && (
              <button className="flex items-center gap-2 text-sm text-white/30 hover:text-white/50 transition-colors py-2" onClick={() => setExpandedGoalId(prev => prev === '__past' ? null : '__past')}>
                <ChevronDown className={`h-4 w-4 transition-transform ${expandedGoalId === '__past' ? 'rotate-0' : '-rotate-90'}`} />
                Past goals ({inactiveGoals.length})
              </button>
            )}
            {expandedGoalId === '__past' && inactiveGoals.map(renderGoalCard)}
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div className="shrink-0 px-4 pb-4 pt-2 space-y-2">
        <button onClick={() => setShowAddGoal(true)} className="w-full flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] py-3 text-white/70 font-medium hover:bg-white/[0.10] transition-all">
          <Plus className="h-5 w-5" />Add Goal
        </button>
        {totalPlanCount > 0 && (
          <button onClick={() => onViewAllPlans?.()} className="w-full flex items-center justify-center gap-2 rounded-xl py-2 text-xs text-white/30 hover:text-white/50 transition-colors">
            <List className="h-3.5 w-3.5" />View all plans
          </button>
        )}
      </div>
    </div>
  );

  // ===================== FORM SCREENS =====================

  function renderAddGoalSheet() {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-4">
          <h2 className="text-2xl font-semibold text-white/90">New Goal</h2>
          <button onClick={resetForms} className="rounded-full p-2 text-white/50 hover:bg-white/10 hover:text-white/80 transition-all"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-8">
          <div className="space-y-3">
            {[
              { type: 'event', icon: Flag, title: 'Train for an event', sub: 'Race, competition, or target date' },
              { type: 'capacity', icon: TrendingUp, title: 'Improve a metric', sub: 'Get faster, stronger, or build endurance' },
              { type: 'maintenance', icon: Activity, title: 'Stay consistent', sub: 'Maintain fitness with structured training' },
            ].map(({ type, icon: Icon, title, sub }) => (
              <button key={type} className="w-full rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-left transition-all hover:bg-white/[0.08]"
                onClick={() => { setShowAddGoal(false); type === 'event' ? setShowEventForm(true) : type === 'capacity' ? setShowCapacityForm(true) : setShowMaintenanceForm(true); }}>
                <div className="flex items-center gap-4">
                  <Icon className="h-6 w-6 text-white/60" />
                  <div><p className="text-base font-medium text-white/90">{title}</p><p className="text-sm text-white/40 mt-0.5">{sub}</p></div>
                </div>
              </button>
            ))}
          </div>
          <div className="mt-6 space-y-2">
            <button className="w-full rounded-xl px-4 py-3 text-sm text-white/40 hover:text-white/60 hover:bg-white/[0.04] transition-all text-left" onClick={() => { resetForms(); navigate('/plans/generate'); }}>Build a custom plan</button>
            <button className="w-full rounded-xl px-4 py-3 text-sm text-white/40 hover:text-white/60 hover:bg-white/[0.04] transition-all text-left" onClick={() => { resetForms(); navigate('/plans/catalog'); }}>Browse plan library</button>
          </div>
        </div>
      </div>
    );
  }

  function renderEventForm() {
    const hasSameSportActiveGoal = activeGoals.some(
      g => g.goal_type === 'event' && (g.sport || '').toLowerCase() === eventSport.toLowerCase()
    );
    const requiresDistance = Boolean(DISTANCE_OPTIONS[eventSport]);

    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-4">
          <h2 className="text-xl font-semibold text-white/90">Train for an event</h2>
          <button onClick={resetForms} className="rounded-full p-2 text-white/50 hover:bg-white/10 hover:text-white/80 transition-all"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-4">
          <label className="block"><span className="text-sm text-white/50 mb-1.5 block">Name</span>
            <input type="text" placeholder="e.g. Boston Marathon" value={eventName} onChange={e => setEventName(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-white/90 placeholder:text-white/25 focus:outline-none focus:border-white/25 transition-colors" />
          </label>
          <label className="block"><span className="text-sm text-white/50 mb-1.5 block">Date</span>
            <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-white/90 focus:outline-none focus:border-white/25 transition-colors [color-scheme:dark]" />
          </label>
          <label className="block"><span className="text-sm text-white/50 mb-1.5 block">Sport</span>
            <select value={eventSport} onChange={e => { setEventSport(e.target.value); setEventDistance(''); }} className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-white/90 focus:outline-none focus:border-white/25 transition-colors appearance-none">
              <option value="run">Run</option><option value="ride">Ride</option><option value="swim">Swim</option><option value="triathlon">Triathlon</option><option value="other">Other</option>
            </select>
          </label>
          {DISTANCE_OPTIONS[eventSport] && (
            <label className="block"><span className="text-sm text-white/50 mb-1.5 block">Distance</span>
              <select value={eventDistance} onChange={e => setEventDistance(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-white/90 focus:outline-none focus:border-white/25 transition-colors appearance-none">
                <option value="">Select distance</option>
                {DISTANCE_OPTIONS[eventSport].map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
          )}
          {(() => {
            const hasData = !!(currentBaselines || currentSnapshot);
            const fitnessLabels: Record<string, [string, string]> = {
              beginner: ['Building up', '< 12 mi/week or new to structured training'],
              intermediate: ['Consistent', '12–30 mi/week with some race experience'],
              advanced: ['Competitive', '30+ mi/week, chasing PRs'],
            };
            const goalLabels: Record<string, [string, string]> = {
              complete: ['Finish it', 'Comfortable volume build — cross the line healthy'],
              speed: ['Race for time', 'Pace-targeted plan with intervals and tempo work'],
            };

            return (<>
              <div>
                <span className="text-sm text-white/50 mb-1.5 block">Training level</span>
                {hasData && eventFitness && !overrideFitness ? (
                  <div className="rounded-xl border border-white/15 bg-white/[0.08] px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-white/90">{fitnessLabels[eventFitness]?.[0]}</span>
                        <span className="block text-xs text-white/40 mt-0.5">{fitnessLabels[eventFitness]?.[1]}</span>
                      </div>
                      <button onClick={() => setOverrideFitness(true)} className="text-xs text-white/30 hover:text-white/60 transition-colors shrink-0 ml-3">Change</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {(['beginner', 'intermediate', 'advanced'] as const).map(val => (
                      <button key={val} onClick={() => { setEventFitness(val); if (hasData) setOverrideFitness(false); }} className={`w-full rounded-xl px-4 py-3 text-left transition-all border ${eventFitness === val ? 'border-white/25 bg-white/[0.12]' : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.06]'}`}>
                        <span className={`text-sm font-medium ${eventFitness === val ? 'text-white/90' : 'text-white/50'}`}>{fitnessLabels[val][0]}</span>
                        <span className={`block text-xs mt-0.5 ${eventFitness === val ? 'text-white/50' : 'text-white/25'}`}>{fitnessLabels[val][1]}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <span className="text-sm text-white/50 mb-1.5 block">What's your goal?</span>
                {hasData && eventTrainingGoal && !overrideGoal ? (
                  <div className="rounded-xl border border-white/15 bg-white/[0.08] px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-white/90">{goalLabels[eventTrainingGoal]?.[0]}</span>
                        <span className="block text-xs text-white/40 mt-0.5">{goalLabels[eventTrainingGoal]?.[1]}</span>
                      </div>
                      <button onClick={() => setOverrideGoal(true)} className="text-xs text-white/30 hover:text-white/60 transition-colors shrink-0 ml-3">Change</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {(['complete', 'speed'] as const).map(val => (
                      <button key={val} onClick={() => { setEventTrainingGoal(val); if (hasData) setOverrideGoal(false); }} className={`w-full rounded-xl px-4 py-3 text-left transition-all border ${eventTrainingGoal === val ? 'border-white/25 bg-white/[0.12]' : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.06]'}`}>
                        <span className={`text-sm font-medium ${eventTrainingGoal === val ? 'text-white/90' : 'text-white/50'}`}>{goalLabels[val][0]}</span>
                        <span className={`block text-xs mt-0.5 ${eventTrainingGoal === val ? 'text-white/50' : 'text-white/25'}`}>{goalLabels[val][1]}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <span className="text-sm text-white/50 mb-1.5 block">Strength work</span>
                {(() => {
                  const strengthLabels: Record<string, [string, string]> = {
                    none: ['No strength', 'Running only'],
                    neural_speed: ['Get faster', 'Heavy lifts for power and running economy'],
                    durability: ['Stay healthy', 'Injury prevention with progressive strength'],
                    upper_aesthetics: ['Build upper body', 'Hypertrophy up top, functional legs'],
                  };
                  const hasExisting = eventStrength !== 'none';
                  const freqLabel = `${eventStrengthFreq}x/week`;

                  if (hasExisting && !overrideStrength) return (
                    <div className="rounded-xl border border-white/15 bg-white/[0.08] px-4 py-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-medium text-white/90">{strengthLabels[eventStrength]?.[0]} · {freqLabel}</span>
                          <span className="block text-xs text-white/40 mt-0.5">{strengthLabels[eventStrength]?.[1]}</span>
                        </div>
                        <button onClick={() => setOverrideStrength(true)} className="text-xs text-white/30 hover:text-white/60 transition-colors shrink-0 ml-3">Change</button>
                      </div>
                    </div>
                  );

                  return (
                    <div className="space-y-3">
                      <div className="flex flex-col gap-2">
                        {(['none', 'neural_speed', 'durability', 'upper_aesthetics'] as const).map(val => (
                          <button key={val} onClick={() => { setEventStrength(val); if (val !== 'none') setOverrideStrength(false); }} className={`w-full rounded-xl px-4 py-3 text-left transition-all border ${eventStrength === val ? 'border-white/25 bg-white/[0.12]' : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.06]'}`}>
                            <span className={`text-sm font-medium ${eventStrength === val ? 'text-white/90' : 'text-white/50'}`}>{strengthLabels[val][0]}</span>
                            <span className={`block text-xs mt-0.5 ${eventStrength === val ? 'text-white/50' : 'text-white/25'}`}>{strengthLabels[val][1]}</span>
                          </button>
                        ))}
                      </div>
                      {eventStrength !== 'none' && (
                        <div>
                          <span className="text-xs text-white/40 mb-1.5 block">Sessions per week</span>
                          <div className="flex gap-2">
                            {([2, 3] as const).map(n => (
                              <button key={n} onClick={() => setEventStrengthFreq(n)} className={`flex-1 rounded-xl py-2.5 text-sm font-medium transition-all border ${eventStrengthFreq === n ? 'border-white/25 bg-white/[0.12] text-white/90' : 'border-white/10 bg-white/[0.04] text-white/40 hover:bg-white/[0.06]'}`}>{n}x/week</button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </>);
          })()}
          <button onClick={handleSaveEvent} disabled={saving || !eventName.trim() || !eventDate || !eventFitness || !eventTrainingGoal || (requiresDistance && !eventDistance)} className="w-full mt-4 rounded-xl bg-white/[0.15] py-3 text-base font-medium text-white/90 hover:bg-white/[0.20] disabled:opacity-40 disabled:cursor-not-allowed transition-all">{saving ? 'Saving...' : 'Save & Build Plan'}</button>
          {requiresDistance && !eventDistance && (
            <p className="mt-2 text-xs text-white/35">Select a race distance to continue.</p>
          )}
          {hasSameSportActiveGoal ? (
            <p className="mt-2 text-xs text-white/45">
              You already have an active goal in this sport. You will choose to keep both or replace, and replacement only ends the old plan after the new one materializes.
            </p>
          ) : (
            <p className="mt-2 text-xs text-white/35">
              This creates your goal and immediately materializes your new plan.
            </p>
          )}
          {goalFlowError && (
            <p className="mt-2 text-xs text-red-400/80">{goalFlowError}</p>
          )}
        </div>
      </div>
    );
  }

  function renderCapacityForm() {
    const metrics = METRIC_OPTIONS[capCategory] ?? [];
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-4">
          <h2 className="text-xl font-semibold text-white/90">Improve a metric</h2>
          <button onClick={resetForms} className="rounded-full p-2 text-white/50 hover:bg-white/10 hover:text-white/80 transition-all"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-4">
          <label className="block"><span className="text-sm text-white/50 mb-1.5 block">Category</span>
            <select value={capCategory} onChange={e => { setCapCategory(e.target.value); setCapMetric(''); }} className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-white/90 focus:outline-none focus:border-white/25 transition-colors appearance-none">
              {Object.keys(METRIC_OPTIONS).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="block"><span className="text-sm text-white/50 mb-1.5 block">Metric</span>
            <select value={capMetric} onChange={e => setCapMetric(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-white/90 focus:outline-none focus:border-white/25 transition-colors appearance-none">
              <option value="">Select metric</option>
              {metrics.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="block"><span className="text-sm text-white/50 mb-1.5 block">Target value</span>
            <input type="number" value={capTarget} onChange={e => setCapTarget(e.target.value)} placeholder="e.g. 250" className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-white/90 placeholder:text-white/25 focus:outline-none focus:border-white/25 transition-colors" />
          </label>
          <button onClick={handleSaveCapacity} disabled={saving || !capMetric || !capTarget} className="w-full mt-4 rounded-xl bg-white/[0.15] py-3 text-base font-medium text-white/90 hover:bg-white/[0.20] disabled:opacity-40 disabled:cursor-not-allowed transition-all">{saving ? 'Saving...' : 'Save Goal'}</button>
        </div>
      </div>
    );
  }

  function renderMaintenanceForm() {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-4">
          <h2 className="text-xl font-semibold text-white/90">Stay consistent</h2>
          <button onClick={resetForms} className="rounded-full p-2 text-white/50 hover:bg-white/10 hover:text-white/80 transition-all"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-4">
          <label className="block"><span className="text-sm text-white/50 mb-1.5 block">Sport focus</span>
            <select value={maintSport} onChange={e => setMaintSport(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-white/90 focus:outline-none focus:border-white/25 transition-colors appearance-none">
              <option value="run">Run</option><option value="ride">Ride</option><option value="swim">Swim</option><option value="strength">Strength</option><option value="general">General</option>
            </select>
          </label>
          <label className="block"><span className="text-sm text-white/50 mb-1.5 block">Days per week</span>
            <select value={maintDays} onChange={e => setMaintDays(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-white/90 focus:outline-none focus:border-white/25 transition-colors appearance-none">
              <option value="3">3</option><option value="4">4</option><option value="5">5</option><option value="6">6</option>
            </select>
          </label>
          <button onClick={handleSaveMaintenance} disabled={saving} className="w-full mt-4 rounded-xl bg-white/[0.15] py-3 text-base font-medium text-white/90 hover:bg-white/[0.20] disabled:opacity-40 disabled:cursor-not-allowed transition-all">{saving ? 'Saving...' : 'Save Goal'}</button>
        </div>
      </div>
    );
  }
};

export default GoalsScreen;

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Target, Calendar, TrendingUp, Plus, ChevronRight, ChevronDown, Flag, Dumbbell, Activity, Bike, Waves, Loader2, Trash2, Pause, Play, Link2, List } from 'lucide-react';
import { differenceInWeeks, format, nextMonday, isMonday } from 'date-fns';
import { useGoals, Goal, GoalInsert } from '@/hooks/useGoals';
import { supabase } from '@/lib/supabase';

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

const DISTANCE_TO_API: Record<string, string> = {
  '5K': '5k', '10K': '10k', 'Half Marathon': 'half', 'Marathon': 'marathon', 'Ultra': 'marathon',
};

const SUPPORTED_GENERATORS: Record<string, string> = { run: 'generate-run-plan' };

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
  const { goals, loading, addGoal, deleteGoal, updateGoal, refreshGoals } = useGoals();

  const [showAddGoal, setShowAddGoal] = useState(false);
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null);
  const [showEventForm, setShowEventForm] = useState(false);
  const [showCapacityForm, setShowCapacityForm] = useState(false);
  const [showMaintenanceForm, setShowMaintenanceForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [buildingGoalId, setBuildingGoalId] = useState<string | null>(null);
  const [buildError, setBuildError] = useState<{ goalId: string; message: string } | null>(null);
  const [conflictDialog, setConflictDialog] = useState<{ goal: Goal; conflictPlan: typeof currentPlans[0] } | null>(null);
  const [linkDialog, setLinkDialog] = useState<{ plan: typeof currentPlans[0] } | null>(null);

  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventSport, setEventSport] = useState('run');
  const [eventDistance, setEventDistance] = useState('');
  const [eventPriority, setEventPriority] = useState<'A' | 'B' | 'C'>('A');
  const [capCategory, setCapCategory] = useState('Speed');
  const [capMetric, setCapMetric] = useState('');
  const [capTarget, setCapTarget] = useState('');
  const [maintSport, setMaintSport] = useState('run');
  const [maintDays, setMaintDays] = useState('4');

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

  function resetForms() {
    setShowAddGoal(false); setShowEventForm(false); setShowCapacityForm(false); setShowMaintenanceForm(false);
    setEventName(''); setEventDate(''); setEventSport('run'); setEventDistance(''); setEventPriority('A');
    setCapCategory('Speed'); setCapMetric(''); setCapTarget('');
    setMaintSport('run'); setMaintDays('4');
  }

  // --- Plan generation ---

  function canAutoGenerate(goal: Goal): boolean {
    return goal.goal_type === 'event' && (goal.sport || '').toLowerCase() in SUPPORTED_GENERATORS;
  }

  function findConflictPlan(goal: Goal) {
    if (!goal.sport) return null;
    const sport = goal.sport.toLowerCase();
    return currentPlans.find(p =>
      !p.goal_id && p.status === 'active' && inferSportFromPlanConfig(p.config || {}, p.plan_type) === sport
    ) ?? null;
  }

  function handleBuildPlan(goal: Goal) {
    if (!canAutoGenerate(goal)) return;
    const conflict = findConflictPlan(goal);
    conflict ? setConflictDialog({ goal, conflictPlan: conflict }) : executeBuildPlan(goal, null);
  }

  async function executeBuildPlan(goal: Goal, conflictPlanId: string | null) {
    setConflictDialog(null);
    setBuildingGoalId(goal.id);
    setBuildError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');

      const sport = (goal.sport || '').toLowerCase();
      const generatorFn = SUPPORTED_GENERATORS[sport];
      if (!generatorFn) throw new Error(`Plan generation not yet available for ${goal.sport}`);

      const weeksOut = goal.target_date ? differenceInWeeks(new Date(goal.target_date), new Date()) : 12;
      const durationWeeks = Math.max(4, Math.min(weeksOut, 20));
      const today = new Date();
      const startDate = isMonday(today) ? today : nextMonday(today);
      const startDateStr = format(startDate, 'yyyy-MM-dd');

      let snapshot: any = null;
      try {
        const { data } = await supabase.from('athlete_snapshot').select('*')
          .eq('user_id', user.id).order('week_start', { ascending: false }).limit(1).maybeSingle();
        snapshot = data;
      } catch {}

      const body = buildGeneratorBody(sport, goal, user.id, durationWeeks, startDateStr, snapshot);

      const resp = await supabase.functions.invoke(generatorFn, { body });
      if (resp.error) {
        let detail = resp.error.message || 'Generation failed';
        try {
          const ctx = (resp.error as any).context;
          if (ctx?.json) { const b = await ctx.json(); detail = b?.error || b?.validation_errors?.join(', ') || detail; }
          else if (resp.data && typeof resp.data === 'object') { detail = resp.data.error || (resp.data.validation_errors || []).join(', ') || detail; }
        } catch {}
        throw new Error(detail);
      }
      if (!resp.data?.plan_id) throw new Error(resp.data?.error || 'Plan generation returned no plan_id');

      const planId = resp.data.plan_id;
      if (conflictPlanId) await supabase.from('plans').update({ status: 'ended' }).eq('id', conflictPlanId);
      await supabase.from('plans').update({ goal_id: goal.id, plan_mode: 'rolling' }).eq('id', planId);

      const { error: actErr } = await supabase.functions.invoke('activate-plan', { body: { plan_id: planId, start_date: startDateStr } });
      if (actErr) throw actErr;

      try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch {}
      onPlanBuilt?.();
      refreshGoals();
    } catch (err: any) {
      console.error('Build plan failed:', err);
      setBuildError({ goalId: goal.id, message: err?.message || 'Failed to build plan' });
    } finally {
      setBuildingGoalId(null);
    }
  }

  function buildGeneratorBody(sport: string, goal: Goal, userId: string, durationWeeks: number, startDate: string, snapshot: any): Record<string, any> {
    const prefs = goal.training_prefs || {};
    const daysPerWeek = prefs.days_per_week ? `${prefs.days_per_week}-${prefs.days_per_week + 1}` : '4-5';

    if (sport === 'run') {
      const distance = DISTANCE_TO_API[goal.distance || ''] || 'marathon';
      const weeklyMiles = snapshot?.workload_by_discipline?.run ? Math.round(snapshot.workload_by_discipline.run / 10) : undefined;
      const hasHistory = snapshot?.acwr != null;
      const fitness = hasHistory ? (snapshot.acwr > 1.2 ? 'advanced' : snapshot.acwr > 0.8 ? 'intermediate' : 'beginner') : (prefs.fitness || 'intermediate');
      const goalType = prefs.goal_type || (fitness === 'beginner' ? 'complete' : 'speed');
      return {
        user_id: userId, distance, fitness, goal: goalType, duration_weeks: durationWeeks,
        start_date: startDate, approach: goalType === 'complete' ? 'sustainable' : 'performance_build',
        days_per_week: daysPerWeek, race_date: goal.target_date || undefined,
        race_name: goal.name, current_weekly_miles: weeklyMiles,
      };
    }

    return { user_id: userId, sport, goal_name: goal.name, duration_weeks: durationWeeks, start_date: startDate, days_per_week: daysPerWeek, target_date: goal.target_date || undefined, distance: goal.distance || undefined };
  }

  // --- Link plan to goal ---

  async function handleLinkPlan(planId: string, goalId: string) {
    await supabase.from('plans').update({ goal_id: goalId }).eq('id', planId);
    setLinkDialog(null);
    onPlanBuilt?.();
    refreshGoals();
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

  async function handleSaveEvent() {
    if (!eventName.trim() || !eventDate) return;
    setSaving(true);
    await addGoal({ name: eventName.trim(), goal_type: 'event', target_date: eventDate, sport: eventSport, distance: eventDistance || null, course_profile: {}, target_metric: null, target_value: null, current_value: null, priority: eventPriority, status: 'active', training_prefs: {}, notes: null });
    setSaving(false); resetForms(); refreshGoals();
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
                  <span>{format(new Date(goal.target_date), 'MMM d, yyyy')}</span>
                  <span className="text-white/30">{differenceInWeeks(new Date(goal.target_date), new Date())} weeks away</span>
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
          ) : canAutoGenerate(goal) ? (
            <button className="text-sm text-white/50 hover:text-white/70 transition-colors" onClick={() => handleBuildPlan(goal)}>No plan yet · Build Plan →</button>
          ) : goal.goal_type === 'event' ? (
            <button className="text-sm text-white/30 hover:text-white/50 transition-colors" onClick={() => navigate('/plans/generate')}>No plan yet · Create manually →</button>
          ) : (
            <p className="text-sm text-white/25">No plan linked</p>
          )}
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
          <div><span className="text-sm text-white/50 mb-1.5 block">Priority</span>
            <div className="flex gap-2">
              {(['A', 'B', 'C'] as const).map(p => (
                <button key={p} onClick={() => setEventPriority(p)} className={`flex-1 rounded-xl py-2.5 text-sm font-medium transition-all border ${eventPriority === p ? 'border-white/25 bg-white/[0.12] text-white/90' : 'border-white/10 bg-white/[0.04] text-white/40 hover:bg-white/[0.06]'}`}>{p}</button>
              ))}
            </div>
          </div>
          <button onClick={handleSaveEvent} disabled={saving || !eventName.trim() || !eventDate} className="w-full mt-4 rounded-xl bg-white/[0.15] py-3 text-base font-medium text-white/90 hover:bg-white/[0.20] disabled:opacity-40 disabled:cursor-not-allowed transition-all">{saving ? 'Saving...' : 'Save Goal'}</button>
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

import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppContext } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Menu, User, Upload, Settings, Activity, Link } from 'lucide-react';
import WorkoutBuilder from './WorkoutBuilder';
import WorkoutCalendar from './WorkoutCalendar';
import WorkoutDetail from './WorkoutDetail';
import GarminAutoSync from './GarminAutoSync';
import TodaysEffort from './TodaysEffort';
import StrengthLogger from './StrengthLogger';
import MobilityLogger from './MobilityLogger';
import AllPlansInterface from './AllPlansInterface';
import StrengthPlansView from './StrengthPlansView';
import WorkoutSummary from './WorkoutSummary';
import NewEffortDropdown from './NewEffortDropdown';
import LogEffortDropdown from './LogEffortDropdown';
import AllEffortsDropdown from './AllEffortsDropdown';
import UnifiedWorkoutView from './UnifiedWorkoutView';
import PlansDropdown from './PlansDropdown';
import PlanBuilder from './PlanBuilder';
import FitFileImporter from './FitFileImporter';
import TrainingBaselines from './TrainingBaselines';
import { usePlannedWorkouts } from '@/hooks/usePlannedWorkouts';
import PullToRefresh from './PullToRefresh';
import { supabase } from '@/lib/supabase';

interface AppLayoutProps {
  onLogout?: () => void;
}

const AppLayout: React.FC<AppLayoutProps> = ({ onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    workouts,
    loading,
    deleteWorkout,
    addWorkout,
    currentPlans,
    completedPlans,
    detailedPlans,
    addPlan,
    deletePlan,
    loadProviderData,
    repairPlan,
  } = useAppContext();
  
  // plannedWorkouts removed; unified get-week feeds views

  const [showBuilder, setShowBuilder] = useState(false);
  const [showStrengthLogger, setShowStrengthLogger] = useState(false);
  const [showMobilityLogger, setShowMobilityLogger] = useState(false);
  const initialRouteState: any = (location && location.state) || {};
  const [showAllPlans, setShowAllPlans] = useState<boolean>(!!initialRouteState.openPlans);
  const [focusPlanId, setFocusPlanId] = useState<string | undefined>(initialRouteState.focusPlanId);
  const [focusWeek, setFocusWeek] = useState<number | undefined>(initialRouteState.focusWeek);
  const [showStrengthPlans, setShowStrengthPlans] = useState(false);
  const [showPlanBuilder, setShowPlanBuilder] = useState(false);
  const [showImportPage, setShowImportPage] = useState(false);
  const [showTrainingBaselines, setShowTrainingBaselines] = useState(false);
  const [builderType, setBuilderType] = useState<string>('');
  const [builderSourceContext, setBuilderSourceContext] = useState<string>('');
  const [selectedWorkout, setSelectedWorkout] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<string>('summary');

  const [showSummary, setShowSummary] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toLocaleDateString('en-CA'));
  const [dateWorkouts, setDateWorkouts] = useState<any[]>([]);
  const [currentWorkoutIndex, setCurrentWorkoutIndex] = useState(0);
  const [workoutBeingEdited, setWorkoutBeingEdited] = useState<any>(null);
  // Pass a planned strength workout directly into the Strength Logger
  const [loggerScheduledWorkout, setLoggerScheduledWorkout] = useState<any | null>(null);
  // Pass a planned mobility workout directly into the Mobility Logger
  const [loggerMobilityScheduledWorkout, setLoggerMobilityScheduledWorkout] = useState<any | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const providerFetchedRef = useRef<boolean>(false);

  useEffect(() => {
    if (selectedWorkout) {
      // Smart tab routing based on workout status and type
      if (selectedWorkout.type === 'strength') {
        // Strength: if completed, open Completed; otherwise Planned
        if (String(selectedWorkout.workout_status || '').toLowerCase() === 'completed') {
          setActiveTab('completed');
        } else {
          setActiveTab('planned');
        }
      } else if (selectedWorkout.workout_status === 'completed') {
        // Check if this was a planned workout that got completed
        // Be more specific about what constitutes "planned data" to avoid false positives for Garmin imports
        const hasPlannedData = (selectedWorkout.intervals && selectedWorkout.intervals.length > 0) || 
                               selectedWorkout.target_power || 
                               selectedWorkout.target_pace ||
                               // Only consider workout_type as planned data if it's NOT a Garmin import
                               (selectedWorkout.workout_type && 
                                selectedWorkout.workout_type !== selectedWorkout.type &&
                                !selectedWorkout.description?.includes('Imported from Garmin'));
        
        if (hasPlannedData) {
          // B) Completed planned workout -> Summary tab (shows planned vs actual)
          setActiveTab('summary');
        } else {
          // C) Completed workout without plan -> Completed tab (just show data)
          setActiveTab('completed');
        }
      } else {
        // A) Planned workout -> Planned tab
        setActiveTab('planned');
      }
    }
  }, [selectedWorkout?.id]);

  // Open Strength Logger on demand from child views (e.g., Planned tab button)
  useEffect(() => {
    const handler = (ev: any) => {
      try {
        const planned = ev?.detail?.planned;
        if (!planned) return;
        // Ensure logger opens targeted to that planned row/date
        setShowAllPlans(false);
        setSelectedWorkout(null);
        // Mutual exclusion: close mobility logger if open
        setShowMobilityLogger(false);
        setLoggerScheduledWorkout(planned);
        if (planned?.date) setSelectedDate(String(planned.date));
        setShowStrengthLogger(true);
      } catch {}
    };
    window.addEventListener('open:strengthLogger', handler as any);
    return () => window.removeEventListener('open:strengthLogger', handler as any);
  }, []);

  // Open Mobility Logger on demand from child views (Planned tab button)
  useEffect(() => {
    const handler = (ev: any) => {
      try {
        const planned = ev?.detail?.planned;
        if (!planned) return;
        setShowAllPlans(false);
        setSelectedWorkout(null);
        // Mutual exclusion: close strength logger if open
        setShowStrengthLogger(false);
        setLoggerMobilityScheduledWorkout(planned);
        if (planned?.date) setSelectedDate(String(planned.date));
        setShowMobilityLogger(true);
      } catch {}
    };
    window.addEventListener('open:mobilityLogger', handler as any);
    return () => window.removeEventListener('open:mobilityLogger', handler as any);
  }, []);

  // Load provider data once per session when Completed tab is first opened
  useEffect(() => {
    // Only pull provider data for endurance types; skip for strength to avoid unnecessary queries
    const isEndurance = (w: any) => {
      const t = String(w?.type || '').toLowerCase();
      return t === 'run' || t === 'ride' || t === 'swim' || t === 'walk';
    };
    if (
      false && // disabled: avoid 406/500 noise and unnecessary fetch on Completed open
      activeTab === 'completed' &&
      typeof loadProviderData === 'function' &&
      !providerFetchedRef.current &&
      isEndurance(selectedWorkout)
    ) {
      providerFetchedRef.current = true;
      try { loadProviderData(); } catch {}
    }
  }, [activeTab, loadProviderData, selectedWorkout]);

  // Open weekly planner when routed with state { openPlans, focusPlanId, focusWeek }
  useLayoutEffect(() => {
    const state: any = (location && location.state) || {};
    if (state.openPlans) {
      setShowAllPlans(true);
      if (state.focusPlanId) setFocusPlanId(state.focusPlanId);
      if (state.focusWeek) setFocusWeek(state.focusWeek);
      // Clear state to avoid re-opening on back/refresh
      try { navigate(location.pathname, { replace: true, state: {} }); } catch {}
    }
  }, [location]);





  const formatHeaderDate = () => {
    const today = new Date();
    return today.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const handleWorkoutSelect = (workout: any) => {
    setSelectedWorkout(workout);
  };

  const handleUpdateWorkout = async (workoutId: string, updates: any) => {
  };

  const handleOpenPlanBuilder = () => {
    setShowPlanBuilder(true);
    setShowSummary(false);
    setDateWorkouts([]);
    setCurrentWorkoutIndex(0);
  };

  const handleHeaderBack = () => {
    // Prefer navigating back to Plans when in any plan-related view
    if (showPlanBuilder) {
      setShowPlanBuilder(false);
      setShowAllPlans(true);
      return;
    }
    if (showStrengthPlans) {
      setShowStrengthPlans(false);
      setShowAllPlans(true);
      return;
    }
    if (showAllPlans) {
      // From plans, go back to dashboard
      handleBackToDashboard();
      return;
    }
    // Fallback: browser history
    history.back();
  };

  // NEW: Training Baselines handler
  const handleTrainingBaselinesClick = () => {
    setShowTrainingBaselines(true);
  };

  // NEW: Connections handler
  const handleConnectionsClick = () => {
    navigate('/connections');
  };

  // NEW: Import handlers
  const handleImportClick = () => {
    setShowImportPage(true);
  };

  // 🔧 ENHANCED: Complete FIT data extraction - pass through ALL fields that FitFileImporter extracts
  const handleWorkoutsImported = (importedWorkouts: any[]) => {
    importedWorkouts.forEach(async (workout) => {
      try {
        const workoutToSave = {
          // CORE WORKOUT DATA
          name: workout.name,
          type: workout.type,
          date: workout.date,
          duration: workout.duration,
          distance: workout.distance,
          description: workout.description || "",
          userComments: "",
          completedManually: false,
          workout_status: 'completed',

          // 🆕 NEW TOP-LEVEL FIELDS that CompletedTab expects
          timestamp: workout.timestamp,
          start_position_lat: workout.start_position_lat,
          start_position_long: workout.start_position_long,
          friendly_name: workout.friendly_name,
          moving_time: workout.moving_time,
          elapsed_time: workout.elapsed_time,
          avg_speed: workout.avg_speed,
          avg_speed_mps: workout.avg_speed_mps,

          // EXISTING FIELDS - ensure proper data types
          avg_heart_rate: workout.metrics?.avg_heart_rate,
          max_heart_rate: workout.metrics?.max_heart_rate,
          avg_power: workout.metrics?.avg_power,
          max_power: workout.metrics?.max_power,
          normalized_power: workout.metrics?.normalized_power,
          max_speed: workout.metrics?.max_speed,
          avg_cadence: workout.metrics?.avg_cadence,
          max_cadence: workout.metrics?.max_cadence,
          calories: workout.metrics?.calories,
          intensity_factor: workout.metrics?.intensity_factor,

          // ELEVATION - check both locations for elevation_gain
          elevation_gain: workout.metrics?.elevation_gain ?
            Math.round(Number(workout.metrics.elevation_gain)) :
            workout.elevation_gain ?
              Math.round(Number(workout.elevation_gain)) :
              null,
          elevation_loss: workout.metrics?.elevation_loss,

          // 🆕 NEW FIELDS - Pass through ALL the metrics that FitFileImporter extracts
          avg_temperature: workout.metrics?.avg_temperature,
          max_temperature: workout.metrics?.max_temperature,
          total_timer_time: workout.metrics?.total_timer_time,
          total_elapsed_time: workout.metrics?.total_elapsed_time,
          total_timer_time_seconds: workout.metrics?.total_timer_time_seconds,
          total_elapsed_time_seconds: workout.metrics?.total_elapsed_time_seconds,
          total_work: workout.metrics?.total_work,
          total_descent: workout.metrics?.total_descent,
          avg_vam: workout.metrics?.avg_vam,
          total_training_effect: workout.metrics?.total_training_effect,
          total_anaerobic_effect: workout.metrics?.total_anaerobic_effect,

          // 🆕 ZONES DATA
          functional_threshold_power: workout.metrics?.functional_threshold_power,
          threshold_heart_rate: workout.metrics?.threshold_heart_rate,
          hr_calc_type: workout.metrics?.hr_calc_type,
          pwr_calc_type: workout.metrics?.pwr_calc_type,

          // 🆕 USER PROFILE DATA
          age: workout.metrics?.age,
          weight: workout.metrics?.weight,
          height: workout.metrics?.height,
          gender: workout.metrics?.gender,
          default_max_heart_rate: workout.metrics?.default_max_heart_rate,
          resting_heart_rate: workout.metrics?.resting_heart_rate,
          dist_setting: workout.metrics?.dist_setting,
          weight_setting: workout.metrics?.weight_setting,

          // 🆕 CYCLING DETAILS DATA
          avg_fractional_cadence: workout.metrics?.avg_fractional_cadence,
          avg_left_pedal_smoothness: workout.metrics?.avg_left_pedal_smoothness,
          avg_left_torque_effectiveness: workout.metrics?.avg_left_torque_effectiveness,
          max_fractional_cadence: workout.metrics?.max_fractional_cadence,
          left_right_balance: workout.metrics?.left_right_balance,
          threshold_power: workout.metrics?.threshold_power,
          total_cycles: workout.metrics?.total_cycles,

          // 🆕 DEVICE INFO
          deviceInfo: workout.deviceInfo,

          // Keep complete metrics object for CompletedTab compatibility
          metrics: workout.metrics
        };

        await addWorkout(workoutToSave);
      } catch (error) {
        console.error('❌ Error importing workout:', error);
      }
    });
    setShowImportPage(false);
  };

  const handleBackToDashboard = () => {
    const comingFromPlanBuilder = showPlanBuilder;
    const shouldReturnToSummary = showBuilder && !comingFromPlanBuilder && selectedDate && workoutBeingEdited;

    setShowStrengthLogger(false);
    setShowBuilder(false);
    setShowAllPlans(false);
    setShowStrengthPlans(false);
    setShowPlanBuilder(false);
    setShowImportPage(false);
    setShowTrainingBaselines(false); // NEW: Reset training baselines
    setBuilderType('');
    setBuilderSourceContext('');
    setLoggerScheduledWorkout(null);
    setSelectedWorkout(null);
    setWorkoutBeingEdited(null);
    setActiveTab('summary');

    if (shouldReturnToSummary) {
      const workoutsForDate = workouts?.filter(w => w.date === selectedDate) || [];
      if (workoutsForDate.length > 0) {
        setDateWorkouts(workoutsForDate);
        setCurrentWorkoutIndex(0);
        setShowSummary(true);
      } else {
        setDateWorkouts([]);
        setCurrentWorkoutIndex(0);
        setShowSummary(true);
      }
    } else {
      setShowSummary(false);
      setDateWorkouts([]);
      setCurrentWorkoutIndex(0);
    }
  };

  const handleDateSelect = (date: string) => {
    // Calendar is for date selection only
    // TodaysEffort is for workout access - clean separation of concerns
    setSelectedDate(date);
    // Clear any selected workout to return to main dashboard
    setSelectedWorkout(null);
  };

  const handleEditEffort = async (workout: any) => {
    const status = String((workout as any)?.workout_status || '').toLowerCase();
    if (status === 'completed') {
      let row = workout;
      try {
        // If coming from calendar/range feed, fetch full workout by id for complete details
        const minimal = !('sensor_data' in (workout as any)) && !('gps_track' in (workout as any)) && !('computed' in (workout as any));
        const hasFewKeys = Object.keys(workout || {}).length < 8; // heuristic
        if ((minimal || hasFewKeys) && (workout as any)?.id) {
          const { data } = await supabase
            .from('workouts')
            .select('*')
            .eq('id', String((workout as any).id))
            .maybeSingle();
          if (data) row = data as any;
        }
      } catch {}
      setSelectedWorkout(row);
      setActiveTab('completed');
    } else if (status === 'planned') {
      // Planned workout: open in UnifiedWorkoutView on Planned sub-tab
      setShowAllPlans(false);
      setSelectedWorkout(workout);
      setActiveTab((workout as any).__preferredTab === 'planned' ? 'planned' : 'planned');
    } else {
      // For other workout types, show in summary
      setDateWorkouts([workout]);
      setCurrentWorkoutIndex(0);
      setShowSummary(true);
    }
  };

  const handleDeleteWorkout = async (workoutId: string) => {
    try {
      await deleteWorkout(workoutId);
      setShowSummary(false);
      setDateWorkouts([]);
      setCurrentWorkoutIndex(0);
      // Ensure we leave the Unified view and return to dashboard
      setSelectedWorkout(null);
      setActiveTab('summary');
    } catch (error) {
      console.error('Error deleting workout:', error);
      alert('Error deleting workout. Please try again.');
    }
  };

  const handleNavigateToPlans = () => {
    setShowBuilder(false);
    setBuilderType('');
    setBuilderSourceContext('');
    setWorkoutBeingEdited(null);
    setSelectedWorkout(null);
    setShowAllPlans(true);
  };

  const handleAddEffort = (type: string, date?: string) => {
    setBuilderType(type);
    setBuilderSourceContext('');
    setWorkoutBeingEdited(null);
    setSelectedWorkout(null);

    if (date) {
      setSelectedDate(date);
    }

    const cameFromSummary = showSummary;

    if (type === 'strength_logger' || type === 'log-strength') {
      setShowStrengthLogger(true);
    } else if (type === 'log-mobility') {
      setShowMobilityLogger(true);
    } else {
      setShowBuilder(true);
    }

    if (cameFromSummary) {
      setShowSummary(false);
      setDateWorkouts([]);
      setCurrentWorkoutIndex(0);
    }
  };

  const handleSelectEffortType = (type: string) => {
    setBuilderType(type);
    setBuilderSourceContext('');
    setWorkoutBeingEdited(null);
    setSelectedWorkout(null);

    if (type === 'strength_logger' || type === 'log-strength') {
      setShowStrengthLogger(true);
    } else {
      setShowBuilder(true);
    }
  };

  const handleViewCompleted = () => {
  };

  const handleSelectRoutine = (routineId: string) => {
    setSelectedWorkout(null);
    setShowAllPlans(true);
  };

  const handleSelectDiscipline = (discipline: string) => {
    setSelectedWorkout(null);

    if (discipline === 'strength') {
      setShowStrengthPlans(true);
    } else {
      setShowAllPlans(true);
    }
  };

  const handlePlanSelect = (plan: any) => {
    setSelectedWorkout(null);
    setShowAllPlans(false);
  };

  const handleBuildWorkout = (type: string, sourceContext?: string) => {
    setBuilderType(type);
    setBuilderSourceContext(sourceContext || '');
    setWorkoutBeingEdited(null);
    setSelectedWorkout(null);
    setShowAllPlans(false);
    setShowStrengthPlans(false);
    setShowBuilder(true);
  };

  const handlePlanGenerated = async (newPlan: any) => {
    try {
      await addPlan(newPlan);
      setShowPlanBuilder(false);
      setShowAllPlans(true);
    } catch (error) {
      console.error('Error saving plan:', error);
      alert('Error saving plan. Please try again.');
    }
  };

  const handlePlanDeleted = async (planId: string) => {
    try {
      const planWorkouts = workouts?.filter(w => {
        const matchesPattern = w.name && (
          w.name.includes('Week 1') ||
          w.name.includes('Week 2') ||
          w.name.includes('Week 3') ||
          w.name.includes('Week 4')
        );
        return matchesPattern;
      }) || [];

      for (const workout of planWorkouts) {
        try {
          await deleteWorkout(workout.id);
        } catch (error) {
          console.error('Error deleting workout:', workout.id, error);
        }
      }

      await deletePlan(planId);
      setShowAllPlans(true);

    } catch (error) {
      console.error('Error deleting plan:', error);
      alert('Error deleting plan. Please try again.');
    }
  };

  // Dead simple swipe detection


  // Show import page
  if (showImportPage) {
    return (
      <FitFileImporter
        onWorkoutsImported={handleWorkoutsImported}
      />
    );
  }

  // Show training baselines
  if (showTrainingBaselines) {
    return (
      <TrainingBaselines
        onClose={handleBackToDashboard}
      />
    );
  }

  if (loading) {
    return (
      <div className="mobile-app-container">
        <div className="flex items-center justify-center h-full">
          <div className="text-lg">Loading...</div>
        </div>
      </div>
    );
  }

  const currentWorkout = dateWorkouts[currentWorkoutIndex];

  const handleGlobalRefresh = async () => {
    try {
      // Prefer a data refresh via provider hook if available
      if (typeof loadProviderData === 'function') {
        await Promise.resolve(loadProviderData());
      }
      // Invalidate planned range caches and notify weekly to bust week cache
      try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch {}
      try { window.dispatchEvent(new CustomEvent('nav:pullrefresh')); } catch {}
      // Light UI refresh: re-navigate to current route to trigger hooks where needed
      navigate(location.pathname, { replace: true });
    } catch {
      // Fallback: full reload
      try { location.reload(); } catch {}
    }
  };

  return (
    <div className="mobile-app-container">
      <header className="mobile-header">
        <div className="w-full">
          <div className="flex items-center justify-between h-16 w-full">
            <div className="flex items-center space-x-1 pl-4">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="p-0.5">
                    <Menu className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {currentPlans && currentPlans.length > 0 && (
                    <DropdownMenuItem
                      onClick={async () => {
                        try {
                          const active = currentPlans[0];
                          if (!active?.id || !repairPlan) return;
                          const res = await repairPlan(String(active.id));
                          try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch {}
                          alert(`Plan repaired: ${res.repaired} item(s) updated`);
                        } catch (e: any) {
                          alert(`Repair failed: ${e?.message || 'unknown error'}`);
                        }
                      }}
                    >
                      Repair Active Plan
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={handleTrainingBaselinesClick}>
                    <Activity className="mr-2 h-4 w-4" />
                    Training Baselines
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <User className="mr-2 h-4 w-4" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleConnectionsClick}>
                    <Link className="mr-2 h-4 w-4" />
                    Connections
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleImportClick}>
                    <Upload className="mr-2 h-4 w-4" />
                    Import
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Upload className="mr-2 h-4 w-4" />
                    Export Data
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    Help & Support
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onLogout}>
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <h1 className="text-2xl font-bold text-primary">efforts</h1>
              {(selectedWorkout || showStrengthLogger || showBuilder || showAllPlans || showStrengthPlans || showPlanBuilder) && !showSummary && (
                <div className="flex items-center gap-3">
                  <Button
                    onClick={handleHeaderBack}
                    variant="ghost"
                    className="text-sm font-medium text-gray-700 hover:bg-gray-50"
                    style={{fontFamily: 'Inter, sans-serif'}}
                  >
                    ← Back
                  </Button>
                  <Button
                    onClick={handleBackToDashboard}
                    variant="ghost"
                    className="text-sm font-medium text-gray-700 hover:bg-gray-50"
                    style={{fontFamily: 'Inter, sans-serif'}}
                  >
                    Dashboard
                  </Button>
                </div>
              )}
            </div>

            <div className="flex items-center">
            </div>

            <div className="flex items-center pr-4">
              {/* Date removed - now shown in TodaysEffort */}
            </div>
          </div>
        </div>
      </header>

      <main className="mobile-main-content">
        <PullToRefresh onRefresh={handleGlobalRefresh}>
        <div className="w-full px-2">
          {showPlanBuilder ? (
            <div className="pt-1">
              <PlanBuilder
                onClose={handleBackToDashboard}
                onPlanGenerated={handlePlanGenerated}
              />
            </div>
          ) : showStrengthPlans ? (
            <div className="pt-4">
              <StrengthPlansView
                onClose={handleBackToDashboard}
                onBuildWorkout={handleBuildWorkout}
              />
            </div>
          ) : showAllPlans ? (
            <div className="pt-4">
              <AllPlansInterface
                onClose={handleBackToDashboard}
                onSelectPlan={handlePlanSelect}
                onBuildWorkout={handleBuildWorkout}
                currentPlans={currentPlans}
                completedPlans={completedPlans}
                detailedPlans={detailedPlans}
                onDeletePlan={handlePlanDeleted}
                onSelectWorkout={(w) => {
                  setSelectedWorkout(w);
                }}
                focusPlanId={focusPlanId}
                focusWeek={focusWeek}
              />
            </div>
          ) : showStrengthLogger ? (
            <div className="pt-4">
              <StrengthLogger 
                onClose={handleBackToDashboard} 
                scheduledWorkout={loggerScheduledWorkout || undefined}
                onWorkoutSaved={(workout) => {
                  setShowStrengthLogger(false);
                  setSelectedWorkout(workout);
                  setActiveTab('summary');
                  setLoggerScheduledWorkout(null);
                }}
                targetDate={(loggerScheduledWorkout as any)?.date || selectedDate}
              />
            </div>
          ) : showMobilityLogger ? (
            <div className="pt-4">
              <MobilityLogger 
                onClose={handleBackToDashboard} 
                onWorkoutSaved={(workout) => {
                  setShowMobilityLogger(false);
                  setSelectedWorkout(workout);
                  setActiveTab('completed');
                }}
                scheduledWorkout={loggerMobilityScheduledWorkout || undefined}
              />
            </div>
          ) : showBuilder ? (
            <div className="pt-4">
              <WorkoutBuilder
                onClose={handleBackToDashboard}
                initialType={builderType}
                existingWorkout={workoutBeingEdited}
                initialDate={selectedDate}
                sourceContext={builderSourceContext}
                onNavigateToPlans={handleNavigateToPlans}
                onOpenPlanBuilder={handleOpenPlanBuilder}
              />
            </div>
          ) : selectedWorkout ? (
            <div className="pt-4 h-full">
              <UnifiedWorkoutView
                workout={selectedWorkout}
                onUpdateWorkout={handleUpdateWorkout}
                onClose={handleBackToDashboard}
                onDelete={handleDeleteWorkout}
                origin="today"
                initialTab={activeTab as any}
              />
            </div>
          ) : (
            <div className="w-full h-full flex flex-col">
              <div className="space-y-1 pt-2 flex-shrink-0">
                <TodaysEffort
                  selectedDate={selectedDate}
                  onAddEffort={handleAddEffort}
                  onViewCompleted={handleViewCompleted}
                  onEditEffort={handleEditEffort}
                />
                <div className="flex-1 overflow-hidden">
                  <div className="h-full overflow-hidden">
                    <WorkoutCalendar
                      onAddEffort={() => handleAddEffort('run')}
                      onSelectType={handleSelectEffortType}
                      onSelectWorkout={handleEditEffort}
                      onViewCompleted={handleViewCompleted}
                      onEditEffort={handleEditEffort}
                      onDateSelect={handleDateSelect}
                      onSelectRoutine={handleSelectRoutine}
                      onOpenPlanBuilder={handleOpenPlanBuilder}
                      currentPlans={currentPlans}
                      completedPlans={completedPlans}
                      workouts={workouts}
                      plannedWorkouts={[]}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        </PullToRefresh>
      </main>

      {/* Bottom Navigation Tab Bar - Instagram style */}
      {!(selectedWorkout || showStrengthLogger || showMobilityLogger || showBuilder || showAllPlans || showStrengthPlans || showPlanBuilder || showSummary || showImportPage || showTrainingBaselines || workoutBeingEdited) && (
        <div className="mobile-tabbar px-3 pt-0.5 flex items-center">
          <div className="w-full">
            <div className="flex justify-around items-center">
              <NewEffortDropdown 
                onSelectType={handleSelectEffortType} 
                onOpenPlanBuilder={handleOpenPlanBuilder}
              />
              <LogEffortDropdown onSelectType={handleSelectEffortType} />
              <PlansDropdown 
                onSelectRoutine={handleSelectRoutine}
                currentPlans={currentPlans}
                completedPlans={completedPlans}
                onOpenPlanBuilder={handleOpenPlanBuilder}
              />
              <AllEffortsDropdown onSelectWorkout={handleEditEffort} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppLayout;
import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Menu, User, Upload, Settings } from 'lucide-react';
import WorkoutBuilder from './WorkoutBuilder';
import WorkoutCalendar from './WorkoutCalendar';
import WorkoutDetail from './WorkoutDetail';
import GarminAutoSync from './GarminAutoSync';
import TodaysEffort from './TodaysEffort';
import StrengthLogger from './StrengthLogger';
import AllPlansInterface from './AllPlansInterface';
import StrengthPlansView from './StrengthPlansView';
import WorkoutSummary from './WorkoutSummary';
import NewEffortDropdown from './NewEffortDropdown';
import PlansDropdown from './PlansDropdown';
import PlanBuilder from './PlanBuilder';
import FitFileImporter from './FitFileImporter';

interface AppLayoutProps {
  onLogout?: () => void;
}

const AppLayout: React.FC<AppLayoutProps> = ({ onLogout }) => {
  const { 
    workouts, 
    loading, 
    deleteWorkout,
    addWorkout,
    currentPlans,
    completedPlans,
    detailedPlans,
    addPlan,
    deletePlan
  } = useAppContext();
  
  const [showBuilder, setShowBuilder] = useState(false);
  const [showStrengthLogger, setShowStrengthLogger] = useState(false);
  const [showAllPlans, setShowAllPlans] = useState(false);
  const [showStrengthPlans, setShowStrengthPlans] = useState(false);
  const [showPlanBuilder, setShowPlanBuilder] = useState(false);
  const [showImportPage, setShowImportPage] = useState(false);
  const [builderType, setBuilderType] = useState<string>('');
  const [builderSourceContext, setBuilderSourceContext] = useState<string>('');
  const [selectedWorkout, setSelectedWorkout] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<string>('summary');

  const [showSummary, setShowSummary] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toLocaleDateString('en-CA'));
  const [dateWorkouts, setDateWorkouts] = useState<any[]>([]);
  const [currentWorkoutIndex, setCurrentWorkoutIndex] = useState(0);
  const [workoutBeingEdited, setWorkoutBeingEdited] = useState<any>(null);

  // Ultra-simple transform state
  const [transform, setTransform] = useState(0);
  const [isSwipeDetected, setIsSwipeDetected] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedWorkout) {
      if (selectedWorkout.type === 'strength') {
        setActiveTab('completed');
      } else if (selectedWorkout.workout_status === 'completed') {
        // 🔧 FIX: Completed workouts (like FIT imports) should show Completed tab
        setActiveTab('completed');
      } else {
        setActiveTab('summary');
      }
    }
  }, [selectedWorkout?.id]);

  // Simple transform sync
  useEffect(() => {
    setTransform(showSummary ? -50 : 0);
  }, [showSummary]);

  // Add modern swipe handlers
  useEffect(() => {
    const container = containerRef.current;
    const wrapper = wrapperRef.current;
    if (!container || !wrapper) return;

    let startX = 0;
    let currentX = 0;
    let isPointerDown = false;
    let hasMovedHorizontally = false;

    const handlePointerDown = (clientX: number) => {
      startX = clientX;
      currentX = clientX;
      isPointerDown = true;
      hasMovedHorizontally = false;
      
      // Disable CSS transition for live tracking
      wrapper.style.transition = 'none';
    };

    const handlePointerMove = (clientX: number, preventDefault: () => void) => {
      if (!isPointerDown) return;
      
      currentX = clientX;
      const deltaX = currentX - startX;
      const deltaY = 0; // We don't track Y for simplicity
      
      // Start horizontal movement immediately on any horizontal motion
      if (Math.abs(deltaX) > 2) {
        if (!hasMovedHorizontally) {
          hasMovedHorizontally = true;
          setIsSwipeDetected(true);
          preventDefault();
        }
        
        // Live transform - content follows finger immediately
        const baseTransform = showSummary ? -50 : 0;
        const dragPercent = (deltaX / window.innerWidth) * 100;
        let newTransform = baseTransform + dragPercent;
        
        // Soft bounds with resistance at edges
        if (newTransform > 0) {
          newTransform = newTransform * 0.3; // Resistance when going past calendar
        } else if (newTransform < -100) {
          newTransform = -100 + (newTransform + 100) * 0.3; // Resistance past summary
        }
        
        wrapper.style.transform = `translateX(${newTransform}%)`;
      }
    };

    const handlePointerUp = () => {
      if (!isPointerDown) return;
      
      // Re-enable CSS transition for snap animation
      wrapper.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';
      
      if (hasMovedHorizontally) {
        const deltaX = currentX - startX;
        const velocity = Math.abs(deltaX);
        
        // Smart threshold - smaller swipe needed if fast, larger if slow
        const threshold = velocity > 100 ? 30 : 80;
        
        if (Math.abs(deltaX) > threshold) {
          if (deltaX > 0 && showSummary) {
            // Swipe right: summary → calendar
            setShowSummary(false);
            setDateWorkouts([]);
            setCurrentWorkoutIndex(0);
          } else if (deltaX < 0 && !showSummary) {
            // Swipe left: calendar → summary
            const workoutsForDate = workouts?.filter(w => w.date === selectedDate) || [];
            setDateWorkouts(workoutsForDate);
            setCurrentWorkoutIndex(0);
            setShowSummary(true);
          } else {
            // Snap back to current position
            wrapper.style.transform = `translateX(${showSummary ? -50 : 0}%)`;
          }
        } else {
          // Snap back to current position
          wrapper.style.transform = `translateX(${showSummary ? -50 : 0}%)`;
        }
      }
      
      // Reset everything
      isPointerDown = false;
      hasMovedHorizontally = false;
      setIsSwipeDetected(false);
    };

    // Mouse events
    const handleMouseDown = (e: MouseEvent) => {
      handlePointerDown(e.clientX);
    };

    const handleMouseMove = (e: MouseEvent) => {
      handlePointerMove(e.clientX, () => e.preventDefault());
    };

    const handleMouseUp = (e: MouseEvent) => {
      handlePointerUp();
    };

    // Touch events
    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      handlePointerDown(touch.clientX);
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      handlePointerMove(touch.clientX, () => e.preventDefault());
    };

    const handleTouchEnd = (e: TouchEvent) => {
      handlePointerUp();
    };

    // Add listeners
    container.addEventListener('mousedown', handleMouseDown, { passive: true });
    container.addEventListener('mousemove', handleMouseMove, { passive: false });
    container.addEventListener('mouseup', handleMouseUp, { passive: true });
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [showSummary, workouts, selectedDate]);

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
    console.log('Updating workout:', workoutId, updates);
  };

  const handleOpenPlanBuilder = () => {
    setShowPlanBuilder(true);
    setShowSummary(false);
    setDateWorkouts([]);
    setCurrentWorkoutIndex(0);
  };

  // NEW: Import handlers
  const handleImportClick = () => {
    setShowImportPage(true);
  };

  // 🔧 ENHANCED: Complete FIT data extraction - pass through ALL fields that FitFileImporter extracts
  const handleWorkoutsImported = (importedWorkouts: any[]) => {
    console.log('📥 handleWorkoutsImported called with:', importedWorkouts);
    
    importedWorkouts.forEach(async (workout) => {
      try {
        console.log('🔧 Processing workout with all fields:', workout.name);
        console.log('🔍 Full workout object:', workout);
        
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
          
          // EXISTING FIELDS - ensure proper data types
          avg_heart_rate: workout.metrics?.avg_heart_rate,
          max_heart_rate: workout.metrics?.max_heart_rate,
          avg_power: workout.metrics?.avg_power,
          max_power: workout.metrics?.max_power,
          normalized_power: workout.metrics?.normalized_power,
          avg_speed: workout.metrics?.avg_speed,
          max_speed: workout.metrics?.max_speed,
          avg_cadence: workout.metrics?.avg_cadence,
          max_cadence: workout.metrics?.max_cadence,
          calories: workout.metrics?.calories,
          tss: workout.metrics?.training_stress_score,
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
        
        console.log('✅ Complete workout data being saved:', workoutToSave);
        console.log('🆕 NEW FIELDS being saved:');
        console.log('  Location:', { lat: workoutToSave.start_position_lat, lng: workoutToSave.start_position_long });
        console.log('  Temperature:', workoutToSave.avg_temperature);
        console.log('  Device:', workoutToSave.friendly_name);
        console.log('  Total Work:', workoutToSave.total_work);
        console.log('  VAM:', workoutToSave.avg_vam);
        console.log('  Training Effects:', { 
          aerobic: workoutToSave.total_training_effect, 
          anaerobic: workoutToSave.total_anaerobic_effect 
        });
        console.log('  User Profile:', { 
          age: workoutToSave.age, 
          weight: workoutToSave.weight, 
          height: workoutToSave.height 
        });
        console.log('  Cycling Details:', {
          left_right_balance: workoutToSave.left_right_balance,
          pedal_smoothness: workoutToSave.avg_left_pedal_smoothness,
          torque_effectiveness: workoutToSave.avg_left_torque_effectiveness
        });
        
        await addWorkout(workoutToSave);
        console.log('✅ Successfully imported workout with ALL metrics:', workout.name);
      } catch (error) {
        console.error('❌ Error importing workout:', error);
      }
    });
    
    console.log(`✅ Successfully imported ${importedWorkouts.length} workouts with complete data`);
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
    setShowImportPage(false); // NEW: Reset import page
    setBuilderType('');
    setBuilderSourceContext('');
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
    setSelectedDate(date);
  };

  const handleEditEffort = (workout: any) => {
    if (workout.workout_status === 'completed') {
      setSelectedWorkout(workout);
    } else {
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
    console.log('View completed workouts');
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
        const matchesId = w.planId === planId;
        const matchesPattern = w.name && (
          w.name.includes('Week 1') || 
          w.name.includes('Week 2') || 
          w.name.includes('Week 3') || 
          w.name.includes('Week 4')
        );
        return matchesId || matchesPattern;
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
  const handleSwipeLeft = () => {
    if (!showSummary) {
      const workoutsForDate = workouts?.filter(w => w.date === selectedDate) || [];
      setDateWorkouts(workoutsForDate);
      setCurrentWorkoutIndex(0);
      setShowSummary(true);
    }
  };

  const handleSwipeRight = () => {
    if (showSummary) {
      setShowSummary(false);
      setDateWorkouts([]);
      setCurrentWorkoutIndex(0);
    }
  };

  // Show import page
  if (showImportPage) {
    return (
      <FitFileImporter 
        onWorkoutsImported={handleWorkoutsImported}
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
                  <DropdownMenuItem>
                    <User className="mr-2 h-4 w-4" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Settings className="mr-2 h-4 w-4" />
                    Connect Devices
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
                <Button
                  onClick={handleBackToDashboard}
                  variant="ghost"
                  className="text-sm font-medium hover:bg-gray-50"
                  style={{fontFamily: 'Inter, sans-serif'}}
                >
                  Dashboard
                </Button>
              )}
            </div>

            <div className="flex items-center">
            </div>

            <div className="flex items-center pr-4">
              {!(selectedWorkout || showStrengthLogger || showBuilder || showAllPlans || showStrengthPlans || showPlanBuilder || showSummary) && (
                <span className="text-lg font-normal text-muted-foreground" style={{fontFamily: 'Inter, sans-serif'}}>
                  {formatHeaderDate()}
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="mobile-main-content">
        <div className="w-full max-w-sm mx-auto px-4 sm:max-w-md md:max-w-4xl md:px-6">
          {showPlanBuilder ? (
            <div className="pt-4">
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
              />
            </div>
          ) : showStrengthLogger ? (
            <div className="pt-4">
              <StrengthLogger onClose={handleBackToDashboard} />
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
              />
            </div>
          ) : selectedWorkout ? (
            <div className="pt-4">
              <WorkoutDetail
                workout={selectedWorkout}
                onUpdateWorkout={handleUpdateWorkout}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                onClose={handleBackToDashboard}
              />
            </div>
          ) : (
            <div 
              ref={containerRef}
              className="relative w-full h-full"
              style={{
                overflow: 'hidden'
              }}
            >
              {/* Swipe capture overlay - only visible during potential swipes */}
              {isSwipeDetected && (
                <div 
                  className="absolute inset-0 z-50"
                  style={{
                    backgroundColor: 'transparent',
                    pointerEvents: 'auto'
                  }}
                />
              )}
              
              <div 
                ref={wrapperRef}
                className="flex h-full"
                style={{
                  width: '200%',
                  transform: `translateX(${transform}%)`,
                  transition: 'transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)',
                  willChange: 'transform',
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden'
                }}
              >
                {/* Calendar Panel */}
                <div className="w-1/2 flex-shrink-0">
                  <div className="space-y-2 pt-4">
                    <TodaysEffort
                      selectedDate={selectedDate}
                      onAddEffort={handleAddEffort}
                      onViewCompleted={handleViewCompleted}
                      onEditEffort={handleEditEffort}
                    />
                    <WorkoutCalendar
                      onAddEffort={handleAddEffort}
                      onSelectType={handleSelectEffortType}
                      onSelectWorkout={handleEditEffort}
                      onViewCompleted={handleViewCompleted}
                      onEditEffort={handleEditEffort}
                      onDateSelect={handleDateSelect}
                      onSelectRoutine={handleSelectRoutine}
                      onSelectDiscipline={handleSelectDiscipline}
                      onOpenPlanBuilder={handleOpenPlanBuilder}
                      isSwipingHorizontally={isSwipeDetected}
                      currentPlans={currentPlans}
                      completedPlans={completedPlans}
                    />
                  </div>
                </div>

                {/* Summary Panel */}
                <div className="w-1/2 flex-shrink-0">
                  <div className="pt-4">
                    {currentWorkout ? (
                      <WorkoutSummary 
                        workout={currentWorkout} 
                        onClose={() => {
                          setShowSummary(false);
                          setDateWorkouts([]);
                          setCurrentWorkoutIndex(0);
                        }}
                        onDelete={handleDeleteWorkout}
                      />
                    ) : showSummary ? (
                      <div className="flex flex-col items-center justify-center py-16 px-4">
                        <h2 className="text-lg font-medium mb-4">No workouts for this date</h2>
                        <p className="text-muted-foreground mb-8 text-center">
                          Add a workout to get started
                        </p>
                        <div className="flex flex-col items-center gap-4">
                          <NewEffortDropdown 
                            onSelectType={(type) => {
                              setShowSummary(false);
                              handleAddEffort(type, selectedDate);
                            }}
                            onOpenPlanBuilder={handleOpenPlanBuilder}
                          />
                          
                          <button
                            onClick={() => {
                              setShowSummary(false);
                              setDateWorkouts([]);
                              setCurrentWorkoutIndex(0);
                            }}
                            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                          >
                            ← Back to calendar
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
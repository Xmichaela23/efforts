import React, { useState, useEffect } from 'react';
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

interface Plan {
  id: string;
  name: string;
  currentWeek?: number;
  status: 'active' | 'completed';
  description?: string;
}

// 🔥 NEW: Add interface for AppLayout props
interface AppLayoutProps {
  onLogout?: () => void;
}

// 🔥 UPDATED: AppLayout now accepts onLogout prop
const AppLayout: React.FC<AppLayoutProps> = ({ onLogout }) => {
  const { 
    workouts, 
    loading, 
    useImperial, 
    toggleUnits, 
    deleteWorkout,
    // NEW: Plan context
    currentPlans,
    completedPlans,
    detailedPlans,
    plansLoading,
    addPlan,
    deletePlan,
    updatePlan,
    refreshPlans
  } = useAppContext();
  const [showBuilder, setShowBuilder] = useState(false);
  const [showStrengthLogger, setShowStrengthLogger] = useState(false);
  const [showAllPlans, setShowAllPlans] = useState(false);
  const [showStrengthPlans, setShowStrengthPlans] = useState(false);
  const [showPlanBuilder, setShowPlanBuilder] = useState(false);
  const [builderType, setBuilderType] = useState<string>('');
  const [builderSourceContext, setBuilderSourceContext] = useState<string>('');
  const [selectedWorkout, setSelectedWorkout] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<string>('summary');

  // Plan data state - now comes from context
  // const [currentPlans, setCurrentPlans] = useState<Plan[]>([]);
  // const [completedPlans, setCompletedPlans] = useState<Plan[]>([]);
  // const [detailedPlans, setDetailedPlans] = useState<any>({});

  // 🆕 NEW: Sliding summary state
  const [showSummary, setShowSummary] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toLocaleDateString('en-CA'));
  const [dateWorkouts, setDateWorkouts] = useState<any[]>([]);
  const [currentWorkoutIndex, setCurrentWorkoutIndex] = useState(0);
  
  // 🍎 APPLE PHOTOS STYLE: Enhanced touch handling
  const [isSwipeActive, setIsSwipeActive] = useState(false);
  const [swipeProgress, setSwipeProgress] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [liveTransform, setLiveTransform] = useState(0);

  // Track workout being edited in builder
  const [workoutBeingEdited, setWorkoutBeingEdited] = useState<any>(null);

  // 🚨 CRITICAL FIX: Set appropriate tab when workout is selected
  useEffect(() => {
    if (selectedWorkout) {
      console.log('🔍 New workout selected:', selectedWorkout.id, 'type:', selectedWorkout.type);
      
      // For strength workouts, default to 'completed' tab
      if (selectedWorkout.type === 'strength') {
        setActiveTab('completed');
      } else {
        setActiveTab('summary');
      }
    }
  }, [selectedWorkout?.id]); // Only trigger when workout ID changes

  // Format date for header display (June 30 2025 format)
  const formatHeaderDate = () => {
    const today = new Date();
    return today.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const handleWorkoutSelect = (workout: any) => {
    console.log('🔍 handleWorkoutSelect called with workout:', workout.id);
    setSelectedWorkout(workout);
    // Tab will be set by the useEffect above based on workout type
  };

  const handleUpdateWorkout = async (workoutId: string, updates: any) => {
    console.log('Updating workout:', workoutId, updates);
  };

  const handleOpenPlanBuilder = () => {
    setShowPlanBuilder(true);
    // Clear other states
    setShowSummary(false);
    setDateWorkouts([]);
    setCurrentWorkoutIndex(0);
  };

  const handleBackToDashboard = () => {
    console.log('🔍 handleBackToDashboard called - clearing all state');
    
    // 🚨 FIX: Check if we're coming from Plan Builder BEFORE clearing states
    const comingFromPlanBuilder = showPlanBuilder;
    
    // 🚨 FIX: Only return to summary if we came from a workout that was opened from summary sliding
    // This should ONLY happen when editing an existing workout from the sliding summary view
    const shouldReturnToSummary = showBuilder && !comingFromPlanBuilder && selectedDate && workoutBeingEdited;
    
    // Clear all state and return to dashboard
    setShowStrengthLogger(false);
    setShowBuilder(false);
    setShowAllPlans(false);
    setShowStrengthPlans(false);
    setShowPlanBuilder(false);
    setBuilderType('');
    setBuilderSourceContext('');
    setSelectedWorkout(null);
    setWorkoutBeingEdited(null);
    setActiveTab('summary');
    setLiveTransform(0);
    
    // 🚨 FIX: If we should return to summary, restore the summary state
    if (shouldReturnToSummary) {
      // Check if there are workouts for this date
      const workoutsForDate = workouts?.filter(w => w.date === selectedDate) || [];
      if (workoutsForDate.length > 0) {
        // Return to summary with workouts
        setDateWorkouts(workoutsForDate);
        setCurrentWorkoutIndex(0);
        setShowSummary(true);
        setLiveTransform(-50);
      } else {
        // Return to empty date summary
        setDateWorkouts([]);
        setCurrentWorkoutIndex(0);
        setShowSummary(true);
        setLiveTransform(-50);
      }
    } else {
      // 🆕 NEW: Clear summary state completely
      setShowSummary(false);
      setDateWorkouts([]);
      setCurrentWorkoutIndex(0);
    }
  };

  // 🆕 NEW: Handle date selection - update Today's Effort to show selected date
  const handleDateSelect = (date: string) => {
    console.log('📅 Date selected:', date);
    console.log('📅 Previous selectedDate:', selectedDate);
    setSelectedDate(date);
    console.log('📅 New selectedDate will be:', date);
    
    // Update Today's Effort to show this date immediately
    // This enables the sliding functionality for empty dates
  };

  // 🚨 FIXED: Handle workout clicks - route completed workouts to WorkoutDetail
  const handleEditEffort = (workout: any) => {
    console.log('🎯 Workout clicked from Today\'s Effort:', workout);
    console.log('🎯 Workout status:', workout.workout_status);
    
    // If workout is completed, go directly to WorkoutDetail
    if (workout.workout_status === 'completed') {
      console.log('🎯 Routing completed workout to WorkoutDetail');
      setSelectedWorkout(workout);
      // Tab will be set by useEffect based on workout type
    } else {
      // For scheduled/planned workouts, use sliding summary
      console.log('🎯 Routing scheduled workout to sliding summary');
      setDateWorkouts([workout]);
      setCurrentWorkoutIndex(0);
      setShowSummary(true);
    }
  };

  // 🍎 APPLE PHOTOS STYLE: Smooth, instant, visual feedback
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.targetTouches[0];
    setTouchStartX(touch.clientX);
    setTouchStartY(touch.clientY);
    setIsSwipeActive(false);
    setSwipeProgress(0);
    setLiveTransform(0);
    console.log('👆 Touch start - Apple Photos style', {
      x: touch.clientX,
      y: touch.clientY,
      showSummary,
      selectedDate,
      hasWorkouts: workouts?.filter(w => w.date === selectedDate)?.length || 0
    });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartX || !touchStartY) return;
    
    const touch = e.targetTouches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    
    // 🍎 APPLE PHOTOS: Balanced horizontal detection - 8px threshold
    const isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 8;
    
    if (isHorizontalSwipe) {
      // 🍎 PHOTOS STYLE: Activate horizontal swipe mode
      if (!isSwipeActive) {
        console.log('🔥 Horizontal swipe ACTIVATED', {
          deltaX,
          deltaY,
          showSummary,
          selectedDate
        });
      }
      setIsSwipeActive(true);
      
      // Prevent other interactions during swipe
      e.preventDefault();
      e.stopPropagation();
      
      // Calculate swipe progress (0-100) for visual feedback
      const progress = Math.min(Math.abs(deltaX) / 50, 1) * 100;
      setSwipeProgress(progress);
      
      // 🍎 PHOTOS STYLE: Live transform - content moves with finger
      const screenWidth = window.innerWidth;
      const transformPercent = (deltaX / screenWidth) * 100;
      
      if (showSummary) {
        // In workout view - slide between workouts or back to calendar
        const baseTransform = -50; // Current position (50% left)
        let liveTransform = Math.max(-100, Math.min(0, baseTransform + transformPercent));
        
        // For empty dates, make sure right swipe goes back to calendar
        if (dateWorkouts.length === 0 && deltaX > 0) {
          liveTransform = Math.max(-50, Math.min(0, baseTransform + transformPercent));
        }
        
        setLiveTransform(liveTransform);
      } else {
        // In calendar view - preview workout slide
        const liveTransform = Math.max(-50, Math.min(0, transformPercent));
        setLiveTransform(liveTransform);
      }
    } else {
      // Reset swipe state if not horizontal
      if (isSwipeActive) {
        setIsSwipeActive(false);
      }
    }
  };

  const handleTouchEnd = () => {
    if (!touchStartX || !touchStartY) return;
    
    const wasSwipeActive = isSwipeActive;
    const progress = swipeProgress;
    const currentTransform = liveTransform;
    
    // 🍎 APPLE PHOTOS: Only process if it was a real swipe
    if (!wasSwipeActive) {
      // Reset states
      setIsSwipeActive(false);
      setSwipeProgress(0);
      setTouchStartX(null);
      setTouchStartY(null);
      setLiveTransform(0);
      return;
    }
    
    // 🍎 APPLE PHOTOS: Reasonable commit threshold - 15%
    const commitThreshold = 15;
    const isCommitted = progress > commitThreshold;
    
    if (isCommitted) {
      // Determine direction from current transform
      const isLeftSwipe = currentTransform < (showSummary ? -50 : 0);
      const isRightSwipe = currentTransform > (showSummary ? -50 : 0);
      
      console.log('🍎 Swipe committed:', { isLeftSwipe, isRightSwipe, showSummary, dateWorkouts: dateWorkouts.length });
      
      if (showSummary && dateWorkouts.length > 0) {
        // We're in workout summary view with workouts
        if (isLeftSwipe && currentWorkoutIndex < dateWorkouts.length - 1) {
          // Next workout
          setCurrentWorkoutIndex(currentWorkoutIndex + 1);
          setLiveTransform(-50); // Snap to workout position
        } else if (isRightSwipe) {
          if (currentWorkoutIndex > 0) {
            // Previous workout
            setCurrentWorkoutIndex(currentWorkoutIndex - 1);
            setLiveTransform(-50); // Snap to workout position
          } else {
            // Back to calendar (like Photos back to grid)
            console.log('🔙 Swiping back to calendar from workout');
            setShowSummary(false);
            setDateWorkouts([]);
            setCurrentWorkoutIndex(0);
            setLiveTransform(0); // Snap to calendar position
          }
        } else {
          // Not committed - snap back
          setLiveTransform(-50);
        }
      } else if (showSummary && dateWorkouts.length === 0) {
        // 🚨 FIX: We're in EMPTY DATE summary view - swipe right should go back
        if (isRightSwipe) {
          console.log('🔙 Swiping back to calendar from EMPTY DATE');
          setShowSummary(false);
          setDateWorkouts([]);
          setCurrentWorkoutIndex(0);
          setLiveTransform(0); // Snap to calendar position
        } else {
          // Not committed - snap back to empty date position
          setLiveTransform(-50);
        }
      } else if (!showSummary && isLeftSwipe) {
        // Enter workout view (like Photos full-screen)
        console.log('🔙 Swiping from calendar to summary for date:', selectedDate);
        const workoutsForDate = workouts?.filter(w => w.date === selectedDate) || [];
        console.log('📊 Found workouts for date:', workoutsForDate.length, workoutsForDate);
        
        if (workoutsForDate.length > 0) {
          // Has workouts - go to workout summary
          setDateWorkouts(workoutsForDate);
          setCurrentWorkoutIndex(0);
          setShowSummary(true);
          setLiveTransform(-50); // Snap to workout position
          console.log('✅ Navigated to workout summary');
        } else {
          // No workouts - go to empty date screen
          setDateWorkouts([]);
          setCurrentWorkoutIndex(0);
          setShowSummary(true);
          setLiveTransform(-50); // Snap to empty date position
          console.log('✅ Navigated to empty date screen');
        }
      } else {
        // Not committed - snap back to calendar
        setLiveTransform(0);
      }
    } else {
      // 🍎 APPLE PHOTOS: Smooth animation back to position if not committed
      if (showSummary) {
        setLiveTransform(-50);
      } else {
        setLiveTransform(0);
      }
    }
    
    // Reset touch states
    setIsSwipeActive(false);
    setSwipeProgress(0);
    setTouchStartX(null);
    setTouchStartY(null);
    
    // Clear live transform after animation completes
    setTimeout(() => {
      setLiveTransform(0);
    }, 300);
  };

  const handleDeleteWorkout = async (workoutId: string) => {
    try {
      await deleteWorkout(workoutId);
      // 🍎 APPLE PHOTOS STYLE: Smooth transition back to calendar
      setLiveTransform(0); // Animate back to calendar position
      setTimeout(() => {
        setShowSummary(false);
        setDateWorkouts([]);
        setCurrentWorkoutIndex(0);
      }, 300); // Wait for animation to complete
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
    setSelectedWorkout(null); // Clear selected workout
    
    if (date) {
      setSelectedDate(date);
    }
    
    // 🚨 IMPORTANT: Store where we came from for proper back navigation
    const cameFromSummary = showSummary;
    
    // 🚨 FIXED: Handle all strength logger variants - now only 'log-strength'
    if (type === 'strength_logger' || type === 'log-strength') {
      setShowStrengthLogger(true);
    } else {
      // 🚨 NEW: Always open WorkoutBuilder with the selected type
      setShowBuilder(true);
    }
    
    // Clear summary state but remember we came from there
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
    setSelectedWorkout(null); // Clear selected workout
    
    // 🚨 FIXED: Handle all strength logger variants - now only 'log-strength'
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
    console.log('handleSelectRoutine called with:', routineId);
    setSelectedWorkout(null); // Clear selected workout
    if (routineId === 'all-plans') {
      console.log('Setting showAllPlans to true');
      setShowAllPlans(true);
      console.log('showAllPlans should now be true');
    } else {
      console.log('Plan selected:', routineId);
      // Handle specific plan selection - could open plan detail view
      // For now, open AllPlansInterface and let it handle the plan detail view
      setShowAllPlans(true);
    }
  };

  // 🚨 NEW: Handle discipline selection from Plans dropdown
  const handleSelectDiscipline = (discipline: string) => {
    console.log('handleSelectDiscipline called with:', discipline);
    setSelectedWorkout(null); // Clear selected workout
    
    // Go directly to discipline-specific plans page
    if (discipline === 'strength') {
      setShowStrengthPlans(true);
    } else {
      // For other disciplines, still use AllPlansInterface for now
      setShowAllPlans(true);
    }
  };

  const handlePlanSelect = (plan: any) => {
    console.log('Selected plan:', plan);
    setSelectedWorkout(null); // Clear selected workout
    // TODO: Handle plan selection (add to active plans, etc.)
    setShowAllPlans(false);
  };

  const handleBuildWorkout = (type: string, sourceContext?: string) => {
    console.log('Building workout of type:', type, 'from context:', sourceContext);
    setBuilderType(type);
    setBuilderSourceContext(sourceContext || '');
    setWorkoutBeingEdited(null);
    setSelectedWorkout(null); // Clear selected workout
    setShowAllPlans(false);
    setShowStrengthPlans(false);
    setShowBuilder(true);
  };

  // Plan generation callback - now uses context
  const handlePlanGenerated = async (newPlan: any) => {
    console.log('🎯 handlePlanGenerated called in AppLayout with:', newPlan);
    
    try {
      // Save to Supabase via context
      await addPlan(newPlan);
      console.log('🎯 Plan saved to Supabase successfully');
      
      // Close plan builder and show plans interface
      setShowPlanBuilder(false);
      setShowAllPlans(true);
    } catch (error) {
      console.error('🎯 Error saving plan:', error);
      alert('Error saving plan. Please try again.');
    }
  };

  // Handle plan deletion - now uses context
  const handlePlanDeleted = async (planId: string) => {
    console.log('🗑️ handlePlanDeleted called with planId:', planId);
    
    try {
      // Find workouts associated with this plan
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
      
      console.log('🗑️ Found plan workouts to delete:', planWorkouts.length);
      
      // Delete all associated workouts
      for (const workout of planWorkouts) {
        try {
          console.log('🗑️ Deleting workout:', workout.id, workout.name);
          await deleteWorkout(workout.id);
        } catch (error) {
          console.error('🗑️ Error deleting workout:', workout.id, error);
        }
      }
      
      // Delete plan from Supabase via context
      await deletePlan(planId);
      console.log('🗑️ Plan deleted successfully');
      
      // Go back to plans list
      setShowAllPlans(true);
      
    } catch (error) {
      console.error('🗑️ Error deleting plan:', error);
      alert('Error deleting plan. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="mobile-app-container">
        <div className="flex items-center justify-center h-full">
          <div className="text-lg">Loading...</div>
        </div>
      </div>
    );
  }

  // Get current workout for summary display
  const currentWorkout = dateWorkouts[currentWorkoutIndex];

  // 🍎 APPLE PHOTOS STYLE: Calculate final transform
  const finalTransform = liveTransform !== 0 ? liveTransform : (showSummary ? -50 : 0);

  console.log('🔍 AppLayout render state:', {
    showAllPlans, 
    showBuilder, 
    showStrengthLogger, 
    showStrengthPlans,
    showPlanBuilder,
    showSummary,
    dateWorkouts: dateWorkouts.length,
    currentWorkoutIndex,
    selectedWorkout: !!selectedWorkout,
    selectedWorkoutId: selectedWorkout?.id,
    selectedWorkoutType: selectedWorkout?.type,
    selectedWorkoutStatus: selectedWorkout?.workout_status,
    selectedDate,
    activeTab,
    finalTransform,
    isSwipeActive,
    currentPlans: currentPlans.length,
    completedPlans: completedPlans.length
  });

  // 🚨 DEBUG: Log plan state 
  console.log('🗂️ Current Plans State:', currentPlans);
  console.log('🗂️ Completed Plans State:', completedPlans);
  console.log('🗂️ Detailed Plans State:', Object.keys(detailedPlans));

  return (
    <div className="mobile-app-container">
      {/* Header with navigation */}
      <header className="mobile-header">
        <div className="w-full">
          <div className="flex items-center justify-between h-16 w-full">
            {/* Left: Hamburger menu and efforts title */}
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
                  <DropdownMenuItem>
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
                  {/* 🔥 UPDATED: Sign Out now calls onLogout */}
                  <DropdownMenuItem onClick={onLogout}>
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              <h1 className="text-2xl font-bold text-primary">efforts</h1>
              
              {/* Dashboard button when in builder/logger/plans */}
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

            {/* Center: Empty - removed workout indicator dots */}
            <div className="flex items-center">
              {/* Dots removed - they were appearing as ")) on mobile */}
            </div>

            {/* Right: Date (only when on dashboard) */}
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

      {/* Main content with Apple Photos style sliding */}
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
            // 🍎 APPLE PHOTOS STYLE: Balanced sliding container
            <div className="sliding-container">
              <div 
                className="sliding-wrapper"
                style={{
                  transform: `translateX(${finalTransform}%)`,
                  transition: isSwipeActive ? 'none' : 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                {/* Calendar view */}
                <div className="slide-panel calendar-panel">
                  <div className="space-y-2 pt-4">
                    <TodaysEffort
                      selectedDate={selectedDate}
                      onAddEffort={handleAddEffort}
                      onViewCompleted={handleViewCompleted}
                      onEditEffort={handleEditEffort}
                    />
                    <div 
                      className="calendar-container"
                      style={{ touchAction: isSwipeActive ? 'none' : 'auto' }}
                    >
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
                        isSwipingHorizontally={isSwipeActive}
                        currentPlans={currentPlans}
                        completedPlans={completedPlans}
                      />
                    </div>
                  </div>
                </div>

                {/* Summary view */}
                <div className="slide-panel summary-panel">
                  <div className="pt-4">
                    {currentWorkout ? (
                      <WorkoutSummary 
                        workout={currentWorkout} 
                        onClose={() => {
                          // 🍎 APPLE PHOTOS STYLE: Smooth back transition
                          setLiveTransform(0); // Animate back to calendar position
                          setTimeout(() => {
                            setShowSummary(false);
                            setDateWorkouts([]);
                            setCurrentWorkoutIndex(0);
                          }, 300); // Wait for animation to complete
                        }}
                        onDelete={handleDeleteWorkout}
                      />
                    ) : showSummary ? (
                      // Show "Add effort" screen when no workouts for this date
                      <div className="flex flex-col items-center justify-center py-16 px-4">
                        <h2 className="text-lg font-medium mb-4">No workouts for this date</h2>
                        <p className="text-muted-foreground mb-8 text-center">
                          Add a workout to get started
                        </p>
                        <div className="flex flex-col items-center gap-4">
                          <NewEffortDropdown 
                            onSelectType={(type) => {
                              // 🍎 APPLE PHOTOS STYLE: Smooth transition to builder
                              setLiveTransform(0); // Animate back to calendar position first
                              setTimeout(() => {
                                setShowSummary(false);
                                handleAddEffort(type, selectedDate);
                              }, 300); // Wait for animation to complete
                            }}
                            onOpenPlanBuilder={handleOpenPlanBuilder}
                          />
                          
                          {/* 🚨 FIX: Add back button for empty date screen */}
                          <button
                            onClick={() => {
                              // 🍎 APPLE PHOTOS STYLE: Smooth back transition
                              setLiveTransform(0); // Animate back to calendar position
                              setTimeout(() => {
                                setShowSummary(false);
                                setDateWorkouts([]);
                                setCurrentWorkoutIndex(0);
                              }, 300); // Wait for animation to complete
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
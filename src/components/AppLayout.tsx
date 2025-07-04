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

const AppLayout: React.FC = () => {
  const { workouts, loading, useImperial, toggleUnits, deleteWorkout } = useAppContext();
  const [showBuilder, setShowBuilder] = useState(false);
  const [showStrengthLogger, setShowStrengthLogger] = useState(false);
  const [showAllPlans, setShowAllPlans] = useState(false);
  const [showStrengthPlans, setShowStrengthPlans] = useState(false);
  const [builderType, setBuilderType] = useState<string>('');
  const [builderSourceContext, setBuilderSourceContext] = useState<string>('');
  const [selectedWorkout, setSelectedWorkout] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<string>('summary');

  // 🆕 NEW: Sliding summary state
  const [showSummary, setShowSummary] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toLocaleDateString('en-CA'));
  const [dateWorkouts, setDateWorkouts] = useState<any[]>([]);
  const [currentWorkoutIndex, setCurrentWorkoutIndex] = useState(0);
  
  // 🆕 NEW: Touch/swipe handling
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

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

  const handleBackToDashboard = () => {
    console.log('🔍 handleBackToDashboard called - clearing all state');
    // Clear all state and return to dashboard
    setShowStrengthLogger(false);
    setShowBuilder(false);
    setShowAllPlans(false);
    setShowStrengthPlans(false);
    setBuilderType('');
    setBuilderSourceContext('');
    setSelectedWorkout(null);
    setWorkoutBeingEdited(null);
    setActiveTab('summary');
    // 🆕 NEW: Clear summary state
    setShowSummary(false);
    setDateWorkouts([]);
    setCurrentWorkoutIndex(0);
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

  // 🆕 NEW: Touch/swipe handlers for pure sliding navigation
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
    console.log('👆 Touch start:', e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;
    
    console.log('👆 Touch end - distance:', distance, 'left swipe:', isLeftSwipe, 'right swipe:', isRightSwipe, 'showSummary:', showSummary);

    if (showSummary && dateWorkouts.length > 0) {
      if (isLeftSwipe) {
        console.log('⬅️ Swiping left - next workout');
        // Swipe left - next workout (only if there are more workouts)
        if (currentWorkoutIndex < dateWorkouts.length - 1) {
          setCurrentWorkoutIndex(currentWorkoutIndex + 1);
        }
        // If at last workout, do nothing (no abyss)
      } else if (isRightSwipe) {
        console.log('➡️ Swiping right');
        // Swipe right - previous workout or back to calendar
        if (currentWorkoutIndex > 0) {
          setCurrentWorkoutIndex(currentWorkoutIndex - 1);
        } else {
          console.log('🔙 Going back to calendar');
          // At first workout, go back to calendar
          setShowSummary(false);
          setDateWorkouts([]);
          setCurrentWorkoutIndex(0);
        }
      }
    } else if (!showSummary) {
      // If we're on calendar and swipe left, slide to summary for selected date
      if (isLeftSwipe) {
        console.log('📅 Calendar swipe left - checking for workouts on', selectedDate);
        const workoutsForDate = workouts?.filter(w => w.date === selectedDate) || [];
        console.log('📅 Found', workoutsForDate.length, 'workouts for', selectedDate);
        console.log('📅 Workout details:', workoutsForDate);
        
        // Always slide to summary, even if no workouts (will show "Add effort" screen)
        setDateWorkouts(workoutsForDate);
        setCurrentWorkoutIndex(0);
        setShowSummary(true);
      }
    } else if (showSummary && dateWorkouts.length === 0) {
      // Handle empty date swiping
      if (isRightSwipe) {
        console.log('🔙 Going back to calendar from empty date');
        setShowSummary(false);
        setDateWorkouts([]);
        setCurrentWorkoutIndex(0);
      }
    }
    
    // Reset touch state
    setTouchStart(null);
    setTouchEnd(null);
  };

  const handleDeleteWorkout = async (workoutId: string) => {
    try {
      await deleteWorkout(workoutId);
      // Close summary and go back to calendar after deletion
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
    setSelectedWorkout(null); // Clear selected workout
    
    if (date) {
      setSelectedDate(date);
    }
    
    // 🚨 FIXED: Handle all strength logger variants - now only 'log-strength'
    if (type === 'strength_logger' || type === 'log-strength') {
      setShowStrengthLogger(true);
    } else {
      // 🚨 NEW: Always open WorkoutBuilder with the selected type
      setShowBuilder(true);
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
      // TODO: Handle specific plan selection
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

  console.log('🔍 AppLayout render state:', {
    showAllPlans, 
    showBuilder, 
    showStrengthLogger, 
    showStrengthPlans,
    showSummary,
    dateWorkouts: dateWorkouts.length,
    currentWorkoutIndex,
    selectedWorkout: !!selectedWorkout,
    selectedWorkoutId: selectedWorkout?.id,
    selectedWorkoutType: selectedWorkout?.type,
    selectedWorkoutStatus: selectedWorkout?.workout_status,
    selectedDate,
    activeTab
  });

  return (
    <div className="mobile-app-container">
      {/* Header with navigation - NO CHEVRONS */}
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
                  <DropdownMenuItem>
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              <h1 className="text-2xl font-bold text-primary">efforts</h1>
              
              {/* Dashboard button when in builder/logger/plans */}
              {(selectedWorkout || showStrengthLogger || showBuilder || showAllPlans || showStrengthPlans) && !showSummary && (
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

            {/* Center: Empty - removed workout indicator dots that were showing as ")) symbol */}
            <div className="flex items-center">
              {/* Dots removed - they were appearing as ")) on mobile */}
            </div>

            {/* Right: Date (only when on dashboard) */}
            <div className="flex items-center pr-4">
              {!(selectedWorkout || showStrengthLogger || showBuilder || showAllPlans || showStrengthPlans || showSummary) && (
                <span className="text-lg font-normal text-muted-foreground" style={{fontFamily: 'Inter, sans-serif'}}>
                  {formatHeaderDate()}
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main content with pure sliding navigation */}
      <main className="mobile-main-content">
        <div className="w-full max-w-sm mx-auto px-4 sm:max-w-md md:max-w-4xl md:px-6">
          {showStrengthPlans ? (
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
            // 🆕 NEW: Pure sliding container
            <div className="sliding-container">
              <div 
                className={`sliding-wrapper ${showSummary ? 'show-summary' : ''}`}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                {/* Calendar view */}
                <div className="slide-panel calendar-panel">
                  <div className="space-y-4 pt-4">
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
                    />
                  </div>
                </div>

                {/* Summary view */}
                <div className="slide-panel summary-panel">
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
                      // Show "Add effort" screen when no workouts for this date
                      <div className="flex flex-col items-center justify-center py-16 px-4">
                        <h2 className="text-lg font-medium mb-4">No workouts for this date</h2>
                        <p className="text-muted-foreground mb-8 text-center">
                          Add a workout to get started
                        </p>
                        <NewEffortDropdown 
                          onSelectType={(type) => {
                            setShowSummary(false);
                            handleAddEffort(type, selectedDate);
                          }} 
                        />
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
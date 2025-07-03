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

const AppLayout: React.FC = () => {
  const { workouts, loading, useImperial, toggleUnits } = useAppContext();
  const [showBuilder, setShowBuilder] = useState(false);
  const [showStrengthLogger, setShowStrengthLogger] = useState(false);
  const [showAllPlans, setShowAllPlans] = useState(false);
  const [showStrengthPlans, setShowStrengthPlans] = useState(false);
  const [builderType, setBuilderType] = useState<string>('');
  const [builderSourceContext, setBuilderSourceContext] = useState<string>('');
  const [selectedWorkout, setSelectedWorkout] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<string>('summary'); // Always start with summary

  // Track workout being edited in builder
  const [workoutBeingEdited, setWorkoutBeingEdited] = useState<any>(null);

  // Track selected date for calendar interactions
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toLocaleDateString('en-CA'));

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
    setActiveTab('summary'); // Reset tab when going back
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

  // 🔧 FIXED: handleEditEffort now goes to Summary/Completed view instead of Builder
  const handleEditEffort = (workout: any) => {
    console.log('🎯 Workout clicked from Today\'s Effort:', workout);
    
    // 🆕 FIXED: Use the same logic as handleWorkoutSelect
    // This will open WorkoutDetail (Summary/Completed view) instead of Builder
    setSelectedWorkout(workout);
    
    // 🆕 Clear any builder-related state (don't need these anymore)
    setWorkoutBeingEdited(null);
    setBuilderType('');
    setBuilderSourceContext('');
    setShowBuilder(false);
    
    // 🆕 Set appropriate tab based on workout type (handled by useEffect above)
    // The useEffect will automatically set the right tab when selectedWorkout changes
  };

  // 🚨 FIXED: Calendar date click - only select date, don't auto-open workouts
  const handleDateSelect = (date: string) => {
    console.log('📅 Calendar date clicked:', date);
    setSelectedDate(date);
    
    // Just select the date - let TodaysEffort component handle displaying workouts
    // Users can click on individual workouts in TodaysEffort to view/edit them
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  console.log('🔍 AppLayout render state:', {
    showAllPlans, 
    showBuilder, 
    showStrengthLogger, 
    showStrengthPlans,
    selectedWorkout: !!selectedWorkout,
    selectedWorkoutId: selectedWorkout?.id,
    selectedWorkoutType: selectedWorkout?.type,
    selectedWorkoutStatus: selectedWorkout?.workout_status,
    activeTab
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header with navigation */}
      <header className="border-b border-border/40 bg-card/30 backdrop-blur-sm sticky top-0 z-40">
        {/* 🚨 FIXED: Mobile centering container */}
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
              {(selectedWorkout || showStrengthLogger || showBuilder || showAllPlans || showStrengthPlans) && (
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

            {/* Center: Empty for spacing */}
            <div></div>

            {/* Right: Date (only when on dashboard) */}
            <div className="flex items-center pr-4">
              {!(selectedWorkout || showStrengthLogger || showBuilder || showAllPlans || showStrengthPlans) && (
                <span className="text-lg font-normal text-muted-foreground" style={{fontFamily: 'Inter, sans-serif'}}>
                  {formatHeaderDate()}
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main content - 🚨 FIXED: Removed pt-16 from here since it's handled in individual components */}
      <main className="flex-1">
        {/* 🚨 FIXED: Mobile centering container */}
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
                onSelectWorkout={handleWorkoutSelect}
                onViewCompleted={handleViewCompleted}
                onEditEffort={handleEditEffort}
                onDateSelect={handleDateSelect}
                onSelectRoutine={handleSelectRoutine}
                onSelectDiscipline={handleSelectDiscipline}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
import React, { useState } from 'react';
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

const AppLayout: React.FC = () => {
  const { workouts, loading, useImperial, toggleUnits } = useAppContext();
  const [showBuilder, setShowBuilder] = useState(false);
  const [showStrengthLogger, setShowStrengthLogger] = useState(false);
  const [builderType, setBuilderType] = useState<string>('');
  const [selectedWorkout, setSelectedWorkout] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<string>('planned');

  // Track workout being edited in builder
  const [workoutBeingEdited, setWorkoutBeingEdited] = useState<any>(null);

  // Track selected date for calendar interactions
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toLocaleDateString('en-CA'));

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
    console.log('❌ WRONG: handleWorkoutSelect called - going to detail view');
    setSelectedWorkout(workout);
  };

  const handleUpdateWorkout = async (workoutId: string, updates: any) => {
    console.log('Updating workout:', workoutId, updates);
  };

  const handleBackToDashboard = () => {
    // Check if we have unsaved exercises in StrengthLogger
    if (showStrengthLogger) {
      if (confirm('Leave without saving? All progress will be lost.')) {
        setShowStrengthLogger(false);
      }
      return;
    }

    // Regular builder close
    setShowBuilder(false);
    setBuilderType('');
    setSelectedWorkout(null);
    setWorkoutBeingEdited(null);
  };

  const handleAddEffort = (type: string, date?: string) => {
    setBuilderType(type);
    setWorkoutBeingEdited(null);
    
    if (date) {
      setSelectedDate(date);
    }
    
    // 🚨 FIXED: Only open specific interfaces, not automatic WorkoutBuilder
    if (type === 'strength_logger' || type === 'log-strength') {
      setShowStrengthLogger(true);
    } else {
      // 🚨 NEW: Always open WorkoutBuilder with the selected type
      setShowBuilder(true);
    }
  };

  const handleSelectEffortType = (type: string) => {
    setBuilderType(type);
    setWorkoutBeingEdited(null);
    
    // 🚨 FIXED: Handle both 'strength_logger' and 'log-strength'
    if (type === 'strength_logger' || type === 'log-strength') {
      setShowStrengthLogger(true);
    } else {
      setShowBuilder(true);
    }
  };

  const handleEditEffort = (workout: any) => {
    setWorkoutBeingEdited(workout);
    setBuilderType(workout.type);
    setShowBuilder(true);
  };

  // 🚨 FIXED: Calendar date click navigation - Smart handling
  const handleDateSelect = (date: string) => {
    console.log('📅 Calendar date clicked:', date);
    setSelectedDate(date);
    
    // Find workouts for the selected date
    const workoutsForDate = workouts?.filter(w => w && w.date === date) || [];
    console.log('🔍 Found workouts for', date, ':', workoutsForDate);
    
    if (workoutsForDate.length === 0) {
      // Empty date - just select it, TodaysEffort will show "Add effort"
      console.log('📅 Empty date selected - TodaysEffort will handle UI');
    } else if (workoutsForDate.length === 1) {
      // Single workout - open it for viewing/editing
      const workout = workoutsForDate[0];
      console.log('📝 Opening single workout:', workout);
      
      if (workout.workout_status === 'completed') {
        // Open in detail view for completed workouts
        setSelectedWorkout(workout);
      } else {
        // Open in builder for editing scheduled workouts
        setWorkoutBeingEdited(workout);
        setBuilderType(workout.type);
        setShowBuilder(true);
      }
    } else {
      // Multiple workouts - open first one for now
      console.log('🔀 Multiple workouts - opening first one');
      const workout = workoutsForDate[0];
      setSelectedWorkout(workout);
    }
  };

  const handleViewCompleted = () => {
    console.log('View completed workouts');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

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
              
              {/* Dashboard button when in builder/logger */}
              {(selectedWorkout || showStrengthLogger || showBuilder) && (
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
              {!(selectedWorkout || showStrengthLogger || showBuilder) && (
                <span className="text-lg font-normal text-gray-600" style={{fontFamily: 'Inter, sans-serif'}}>
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
          {showStrengthLogger ? (
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
              />
            </div>
          ) : selectedWorkout ? (
            <div className="pt-4">
              <WorkoutDetail
                workout={selectedWorkout}
                onUpdateWorkout={handleUpdateWorkout}
                activeTab={activeTab}
                onTabChange={setActiveTab}
              />
            </div>
          ) : (
            <div className="space-y-1 pt-4">
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
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
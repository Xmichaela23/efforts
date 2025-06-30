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
    
    // 🚨 FIXED: Handle both 'strength_logger' and 'log-strength'
    if (type === 'strength_logger' || type === 'log-strength') {
      setShowStrengthLogger(true);
    } else {
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

  const handleDateSelect = (date: string) => {
    setSelectedDate(date);
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
        <div className="w-full max-w-sm mx-auto px-4 sm:max-w-md md:max-w-4xl md:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-primary">Efforts</h1>
              
              {/* 🚨 ADDED: Missing Dashboard button */}
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

            <div className="flex items-center space-x-3">
              {/* 🎯 IMPERIAL BUTTON DELETED - Units toggle now only in WorkoutBuilder */}
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Menu className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
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
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1">
        {/* 🚨 FIXED: Mobile centering container */}
        <div className="w-full max-w-sm mx-auto px-4 sm:max-w-md md:max-w-4xl md:px-6">
          {showStrengthLogger ? (
            <StrengthLogger onClose={handleBackToDashboard} />
          ) : showBuilder ? (
            <WorkoutBuilder
              onClose={handleBackToDashboard}
              initialType={builderType}
              existingWorkout={workoutBeingEdited}
              initialDate={selectedDate}
            />
          ) : selectedWorkout ? (
            <WorkoutDetail
              workout={selectedWorkout}
              onUpdateWorkout={handleUpdateWorkout}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />
          ) : (
            <div className="space-y-1">
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
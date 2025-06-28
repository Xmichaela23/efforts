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

const AppLayout: React.FC = () => {
  const { workouts, loading, useImperial, toggleUnits } = useAppContext();
  const [showBuilder, setShowBuilder] = useState(false);
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
    setShowBuilder(false);
    setSelectedWorkout(null);
    setBuilderType('');
    setActiveTab('planned');
    setWorkoutBeingEdited(null);
  };

  const handleAddEffort = () => {
    console.log('🆕 Adding new effort for date:', selectedDate);
    setWorkoutBeingEdited(null);
    setBuilderType('');
    setSelectedWorkout(null);
    setShowBuilder(true);
  };

  const handleSelectEffortType = (type: string) => {
    console.log('🎯 Selecting effort type:', type);
    setWorkoutBeingEdited(null);
    setBuilderType(type);
    setSelectedWorkout(null);
    setShowBuilder(true);
  };

  // Handle editing existing workout
  const handleEditEffort = (workout: any) => {
    console.log('✅ CORRECT: handleEditEffort called - going to builder');
    console.log('✏️ Editing effort:', workout);
    
    // Clear all other states first
    setSelectedWorkout(null);
    setActiveTab('planned');
    
    // Then set edit states
    setWorkoutBeingEdited(workout);
    setBuilderType('');
    setShowBuilder(true);
  };

  // Handle calendar date selection
  const handleDateSelect = (dateString: string) => {
    console.log('📅 Calendar date selected:', dateString);
    setSelectedDate(dateString);
  };

  const handleViewCompleted = () => {
    setActiveTab('completed');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-b-2 border-black mx-auto mb-4" style={{borderRadius: 0}}></div>
          <p className="font-medium text-black" style={{fontFamily: 'Inter, sans-serif', letterSpacing: '0.02em'}}>Loading workouts...</p>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="bg-white border-b border-[#E5E5E5]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    className="p-2 bg-white text-black border border-black hover:bg-black hover:text-white" 
                    style={{borderRadius: 0, fontFamily: 'Inter, sans-serif', fontWeight: 500}}
                  >
                    <Menu className="h-6 w-6" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="bg-white border border-black" style={{borderRadius: 0}}>
                  <DropdownMenuItem className="hover:bg-black hover:text-white">
                    <User className="mr-2 h-4 w-4" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem className="hover:bg-black hover:text-white">
                    <Upload className="mr-2 h-4 w-4" />
                    Import
                  </DropdownMenuItem>
                  <DropdownMenuItem className="hover:bg-black hover:text-white" onClick={toggleUnits}>
                    <Settings className="mr-2 h-4 w-4" />
                    Units: {useImperial ? 'Imperial' : 'Metric'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="ml-6">
                <h1 className="text-black lowercase" style={{fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: '28px', letterSpacing: '0.03em'}}>efforts</h1>
              </div>
              {(selectedWorkout || showBuilder) && (
                <Button 
                  onClick={handleBackToDashboard}
                  className="ml-8 bg-white text-black border border-black hover:bg-black hover:text-white"
                  style={{fontFamily: 'Inter, sans-serif', fontWeight: 500, borderRadius: 0, padding: '12px 24px'}}
                >
                  ← Back
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {showBuilder ? (
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
          <div className="space-y-8">
            {/* FIXED: Only render ONE TodaysEffort component */}
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
            
            <div className="flex justify-end">
              <div className="w-64">
                <GarminAutoSync />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AppLayout;
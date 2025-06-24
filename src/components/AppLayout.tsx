import React, { useState } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';
import WorkoutBuilder from './WorkoutBuilder';
import WorkoutCalendar from './WorkoutCalendar';
import WorkoutDetail from './WorkoutDetail';
import GarminAutoSync from './GarminAutoSync';

const AppLayout: React.FC = () => {
  const { workouts, loading } = useAppContext();
  const [showBuilder, setShowBuilder] = useState(false);
  const [builderType, setBuilderType] = useState<string>('');
  const [selectedWorkout, setSelectedWorkout] = useState<any>(null);

  const handleWorkoutSelect = (workout: any) => {
    setSelectedWorkout(workout);
  };

  const handleUpdateWorkout = async (workoutId: string, updates: any) => {
    console.log('Updating workout:', workoutId, updates);
  };

  const handleBackToDashboard = () => {
    setShowBuilder(false);
    setSelectedWorkout(null);
    setBuilderType('');
  };

  const handleAddEffort = () => {
    setShowBuilder(true);
  };

  const handleSelectEffortType = (type: string) => {
    setBuilderType(type);
    setShowBuilder(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p style={{fontFamily: 'Helvetica, Arial, sans-serif'}}>Loading workouts...</p>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Menu className="h-6 w-6 mr-3" />
              <img 
                src="https://d64gsuwffb70l.cloudfront.net/685966bdc8eab861425f2afc_1750787561575_b9cfca50.png" 
                alt="Efforts Logo" 
                className="h-36 w-auto max-w-[576px] object-contain"
              />
              {(selectedWorkout || showBuilder) && (
                <Button 
                  variant="ghost" 
                  onClick={handleBackToDashboard}
                  className="ml-4"
                  style={{fontFamily: 'Helvetica, Arial, sans-serif'}}
                >
                  ← Back
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {showBuilder ? (
          <WorkoutBuilder onClose={handleBackToDashboard} initialType={builderType} />
        ) : selectedWorkout ? (
          <WorkoutDetail 
            workout={selectedWorkout} 
            onUpdateWorkout={handleUpdateWorkout}
          />
        ) : (
          <div className="space-y-6">
            <WorkoutCalendar 
              onAddEffort={handleAddEffort}
              onSelectType={handleSelectEffortType}
              onSelectWorkout={handleWorkoutSelect}
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
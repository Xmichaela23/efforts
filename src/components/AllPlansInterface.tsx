import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Play, Pause, Edit, Trash2, Calendar, Clock, Target } from 'lucide-react';

interface Plan {
  id: string;
  name: string;
  description: string;
  currentWeek?: number;
  status: 'active' | 'completed';
}

interface AllPlansInterfaceProps {
  onClose: () => void;
  onSelectPlan: (plan: Plan) => void;
  onBuildWorkout: (type: string, sourceContext?: string) => void;
  currentPlans?: Plan[];
  completedPlans?: Plan[];
  detailedPlans?: any;
}

const AllPlansInterface: React.FC<AllPlansInterfaceProps> = ({ 
  onClose, 
  onSelectPlan, 
  onBuildWorkout,
  currentPlans = [],
  completedPlans = [],
  detailedPlans = {}
}) => {
  const [currentView, setCurrentView] = useState<'list' | 'detail'>('list');
  const [selectedPlanDetail, setSelectedPlanDetail] = useState<any>(null);
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [planStatus, setPlanStatus] = useState<string>('active');

  const handlePlanClick = (planId: string) => {
    console.log('Opening plan details for:', planId);
    const planDetail = detailedPlans[planId as keyof typeof detailedPlans];
    if (planDetail) {
      setSelectedPlanDetail(planDetail);
      setSelectedWeek(planDetail.currentWeek);
      setPlanStatus(planDetail.status);
      setCurrentView('detail');
    }
  };

  const handleBack = () => {
    setCurrentView('list');
    setSelectedPlanDetail(null);
  };

  // Plan Detail View Functions
  const getWorkoutIcon = (type: string) => {
    switch (type) {
      case 'run': return '🏃';
      case 'ride': return '🚴';
      case 'swim': return '🏊';
      case 'strength': return '💪';
      case 'rest': return '😴';
      default: return '⚡';
    }
  };
  
  const getIntensityColor = (intensity: string) => {
    switch (intensity) {
      case 'Easy': return 'bg-green-100 text-green-800 border-green-200';
      case 'Moderate': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Hard': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getCompletionBadge = (workout: any) => {
    if (!workout.completed) {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
          Planned
        </span>
      );
    }
    
    const ratingColors = {
      1: 'bg-red-100 text-red-800 border-red-200',
      2: 'bg-orange-100 text-orange-800 border-orange-200', 
      3: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      4: 'bg-green-100 text-green-800 border-green-200',
      5: 'bg-emerald-100 text-emerald-800 border-emerald-200'
    };
    
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium border ${ratingColors[workout.rating as keyof typeof ratingColors] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
        ✓ {workout.rating}/5
      </span>
    );
  };
  
  const formatDuration = (minutes: number) => {
    if (!minutes) return '';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const getWeeklyVolume = (week: any) => {
    return week.workouts.reduce((total: number, workout: any) => {
      return total + (workout.duration || 0);
    }, 0);
  };

  // Plan Detail View Render
  if (currentView === 'detail' && selectedPlanDetail) {
    const progress = Math.round((selectedPlanDetail.currentWeek / selectedPlanDetail.duration) * 100);
    const currentWeekData = selectedPlanDetail.weeks.find((w: any) => w.weekNumber === selectedWeek);
    
    const totalVolume = selectedPlanDetail.weeks.reduce((total: number, week: any) => {
      return total + getWeeklyVolume(week);
    }, 0);

    const averageWeeklyVolume = Math.round(totalVolume / selectedPlanDetail.duration);

    return (
      <div className="space-y-6" style={{ fontFamily: 'Inter, sans-serif' }}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <button 
            onClick={handleBack}
            className="flex items-center gap-2 p-0 h-auto text-gray-600 hover:text-black transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Plans
          </button>
          
          <div className="flex items-center gap-2">
            {planStatus === 'active' ? (
              <button 
                onClick={() => setPlanStatus('paused')}
                className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Pause className="h-4 w-4" />
                Pause
              </button>
            ) : (
              <button 
                onClick={() => setPlanStatus('active')}
                className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Play className="h-4 w-4" />
                Resume
              </button>
            )}
            
            <button className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              <Edit className="h-4 w-4" />
              Modify
            </button>
            
            <button className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-red-600 hover:bg-red-50 transition-colors">
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </div>
        </div>

        {/* Plan Overview */}
        <div className="border border-gray-200 rounded-lg">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">{selectedPlanDetail.name}</h1>
                <p className="text-gray-600 mt-1">{selectedPlanDetail.description}</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                planStatus === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
              }`}>
                {planStatus}
              </span>
            </div>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="text-center">
                <div className="text-2xl font-bold">{selectedPlanDetail.duration}</div>
                <div className="text-sm text-gray-600">Weeks</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{selectedPlanDetail.totalWorkouts}</div>
                <div className="text-sm text-gray-600">Workouts</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{Math.round(totalVolume / 60)}h</div>
                <div className="text-sm text-gray-600">Total Time</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{averageWeeklyVolume}m</div>
                <div className="text-sm text-gray-600">Avg/Week</div>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progress</span>
                <span>Week {selectedPlanDetail.currentWeek} of {selectedPlanDetail.duration}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-black rounded-full h-2 transition-all duration-300" 
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        {/* Week Navigation */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {selectedPlanDetail.weeks.map((week: any) => (
            <button
              key={week.weekNumber}
              onClick={() => setSelectedWeek(week.weekNumber)}
              className={`whitespace-nowrap px-4 py-2 rounded-lg font-medium transition-colors ${
                selectedWeek === week.weekNumber 
                  ? 'bg-black text-white' 
                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
              } ${
                week.weekNumber === selectedPlanDetail.currentWeek ? 'ring-2 ring-blue-500' : ''
              }`}
            >
              Week {week.weekNumber}
              {week.weekNumber === selectedPlanDetail.currentWeek && (
                <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full">
                  Current
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Selected Week Details */}
        {currentWeekData && (
          <div className="border border-gray-200 rounded-lg">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold flex items-center gap-2 mb-2">
                <Calendar className="h-5 w-5" />
                Week {currentWeekData.weekNumber}: {currentWeekData.title}
              </h2>
              <p className="text-gray-600 mb-4">{currentWeekData.focus}</p>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {formatDuration(getWeeklyVolume(currentWeekData))} total
                </div>
                <div className="flex items-center gap-1">
                  <Target className="h-4 w-4" />
                  {currentWeekData.workouts.filter((w: any) => w.type !== 'rest').length} workouts
                </div>
              </div>
            </div>
            <div className="p-6">
              <div className="space-y-3">
                {currentWeekData.workouts.map((workout: any) => (
                  <div
                    key={workout.id}
                    className={`p-4 rounded-lg border transition-colors cursor-pointer ${
                      workout.type === 'rest' ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="text-2xl">{getWorkoutIcon(workout.type)}</div>
                        <div className="flex-1">
                          <div className="font-medium">{workout.name}</div>
                          <div className="text-sm text-gray-600 mt-1">
                            {workout.description}
                          </div>
                          {workout.completed && workout.notes && (
                            <div className="text-xs text-gray-500 mt-1 italic">
                              "{workout.notes}"
                            </div>
                          )}
                          {workout.completed && (
                            <div className="text-xs text-gray-500 mt-1">
                              Completed {workout.completedDate}
                              {workout.actualDuration && workout.duration && (
                                <span className={`ml-2 ${workout.actualDuration > workout.duration ? 'text-orange-600' : workout.actualDuration < workout.duration ? 'text-blue-600' : 'text-green-600'}`}>
                                  {formatDuration(workout.actualDuration)} 
                                  {workout.actualDuration !== workout.duration && (
                                    <span> (planned: {formatDuration(workout.duration)})</span>
                                  )}
                                </span>
                              )}
                              {workout.actualDistance && workout.distance && (
                                <span className={`ml-2 ${workout.actualDistance > workout.distance ? 'text-orange-600' : workout.actualDistance < workout.distance ? 'text-blue-600' : 'text-green-600'}`}>
                                  {workout.actualDistance}km
                                  {workout.actualDistance !== workout.distance && (
                                    <span> (planned: {workout.distance}km)</span>
                                  )}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {getCompletionBadge(workout)}
                        {workout.intensity && (
                          <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getIntensityColor(workout.intensity)}`}>
                            {workout.intensity}
                          </span>
                        )}
                        {!workout.completed && workout.duration && (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">
                            {formatDuration(workout.duration)}
                          </span>
                        )}
                        {!workout.completed && workout.distance && (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">
                            {workout.distance}km
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Plans List View
  return (
    <div className="space-y-6" style={{fontFamily: 'Inter, sans-serif'}}>
      {/* Current Plans */}
      {currentPlans.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-medium text-gray-900">Current Plans</h2>
          {currentPlans.map((plan) => (
            <div
              key={plan.id}
              onClick={() => handlePlanClick(plan.id)}
              className="p-4 cursor-pointer hover:bg-gray-50 transition-colors rounded-lg border border-gray-200"
            >
              <div className="font-medium">{plan.name} - Wk {plan.currentWeek}</div>
              <div className="text-sm text-gray-600 mt-1">{plan.description}</div>
            </div>
          ))}
        </div>
      )}

      {/* Completed Plans */}
      {completedPlans.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-medium text-gray-900">Completed Plans</h2>
          {completedPlans.map((plan) => (
            <div
              key={plan.id}
              onClick={() => handlePlanClick(plan.id)}
              className="p-4 cursor-pointer hover:bg-gray-50 transition-colors rounded-lg border border-gray-200"
            >
              <div className="font-medium">{plan.name}</div>
              <div className="text-sm text-gray-600 mt-1">{plan.description}</div>
              <div className="text-xs text-green-600 mt-1">✓ Completed</div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {currentPlans.length === 0 && completedPlans.length === 0 && (
        <div className="text-center py-8">
          <h2 className="text-lg font-medium text-gray-900 mb-2">No Plans Yet</h2>
          <p className="text-gray-600 mb-4">Use "Build me a plan" in the Builder tab to create your first training plan</p>
        </div>
      )}
    </div>
  );
};

export default AllPlansInterface;
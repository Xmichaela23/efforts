import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, ChevronDown, Activity, Bike, Waves, Dumbbell, Move } from 'lucide-react';

interface Plan {
  id: string;
  name: string;
  description: string;
  details: string;
  category: string;
  focusArea: string;
}

interface Category {
  id: string;
  name: string;
  description: string;
  icon: any;
}

interface FocusArea {
  id: string;
  name: string;
  description: string;
  categoryId: string;
}

interface AllPlansInterfaceProps {
  onClose: () => void;
  onSelectPlan: (plan: Plan) => void;
  onBuildWorkout: (type: string, sourceContext?: string) => void;
}

const AllPlansInterface: React.FC<AllPlansInterfaceProps> = ({ onClose, onSelectPlan, onBuildWorkout }) => {
  const [currentLevel, setCurrentLevel] = useState<'categories' | 'focus' | 'plans'>('categories');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedFocusArea, setSelectedFocusArea] = useState<string>('');
  const [showMore, setShowMore] = useState(false);

  // Current active plans - would come from context/state in real app
  const currentPlans = [
    { id: '1', name: 'Marathon Training', currentWeek: 8 },
    { id: '2', name: 'Strength Foundation', currentWeek: 3 }
  ];

  // Data from wireframes - Updated terminology
  const categories: Category[] = [
    { id: 'running', name: 'Run', description: '', icon: Activity },
    { id: 'lifting', name: 'Strength', description: '', icon: Dumbbell },
    { id: 'cycling', name: 'Ride', description: '', icon: Bike },
    { id: 'swimming', name: 'Swim', description: '', icon: Waves },
    { id: 'mobility', name: 'Mobility', description: '', icon: Move }
  ];

  const focusAreas: FocusArea[] = [
    { id: 'start-running', name: 'Start Running', description: '', categoryId: 'running' },
    { id: 'distance-training', name: 'Distance Training', description: '', categoryId: 'running' },
    { id: 'marathon-prep', name: 'Marathon Prep', description: '', categoryId: 'running' },
    { id: 'speed-development', name: 'Speed Development', description: '', categoryId: 'running' }
  ];

  const plans: Plan[] = [
    {
      id: '16-week-buildup',
      name: '16-Week Build-up',
      description: '',
      details: '',
      category: 'running',
      focusArea: 'marathon-prep'
    },
    {
      id: '12-week-focused',
      name: '12-Week Focused',
      description: '',
      details: '',
      category: 'running',
      focusArea: 'marathon-prep'
    },
    {
      id: '20-week-high-volume',
      name: '20-Week High Volume',
      description: '',
      details: '',
      category: 'running',
      focusArea: 'marathon-prep'
    },
    {
      id: 'hansons-method',
      name: 'Hansons Method',
      description: '',
      details: '',
      category: 'running',
      focusArea: 'marathon-prep'
    },
    {
      id: 'pfitzinger-18-55',
      name: 'Pfitzinger 18/55',
      description: '',
      details: '',
      category: 'running',
      focusArea: 'marathon-prep'
    },
    {
      id: 'pfitzinger-18-70',
      name: 'Pfitzinger 18/70',
      description: '',
      details: '',
      category: 'running',
      focusArea: 'marathon-prep'
    }
  ];

  const handleCategoryClick = (categoryId: string) => {
    setSelectedCategory(categoryId);
    setCurrentLevel('focus');
  };

  const handleFocusAreaClick = (focusAreaId: string) => {
    setSelectedFocusArea(focusAreaId);
    setCurrentLevel('plans');
  };

  const handlePlanSelect = (plan: Plan) => {
    onSelectPlan(plan);
    onClose();
  };

  const handleCurrentPlanClick = () => {
    console.log('Opening current running plan details');
    // TODO: Navigate to plan details view
  };

  const handleBuild = () => {
    console.log('Building workout for:', selectedCategory);
    const typeMapping = {
      running: 'run',
      lifting: 'strength',
      cycling: 'ride',
      swimming: 'swim',
      mobility: 'mobility'
    };
    const builderType = typeMapping[selectedCategory as keyof typeof typeMapping] || 'run';
    onBuildWorkout(builderType, 'plans');
  };

  const handleBack = () => {
    if (currentLevel === 'focus') {
      setCurrentLevel('categories');
      setSelectedCategory('');
    } else if (currentLevel === 'plans') {
      setCurrentLevel('focus');
      setSelectedFocusArea('');
    }
  };

  const getFilteredFocusAreas = () => {
    return focusAreas.filter(area => area.categoryId === selectedCategory);
  };

  const getFilteredPlans = () => {
    const filtered = plans.filter(plan => 
      plan.category === selectedCategory && plan.focusArea === selectedFocusArea
    );
    return showMore ? filtered : filtered.slice(0, 5);
  };

  const getRemainingCount = () => {
    const total = plans.filter(plan => 
      plan.category === selectedCategory && plan.focusArea === selectedFocusArea
    ).length;
    return Math.max(0, total - 5);
  };

  const getTitle = () => {
    if (currentLevel === 'categories') return 'All Plans';
    if (currentLevel === 'focus') {
      const category = categories.find(c => c.id === selectedCategory);
      return `${category?.name} Plans`;
    }
    if (currentLevel === 'plans') {
      const focusArea = focusAreas.find(f => f.id === selectedFocusArea);
      return `${focusArea?.name} Plans`;
    }
    return 'All Plans';
  };

  const getBackText = () => {
    if (currentLevel === 'focus') return 'Back to Categories';
    if (currentLevel === 'plans') {
      const category = categories.find(c => c.id === selectedCategory);
      return `Back to ${category?.name}`;
    }
    return 'Back';
  };

  const getCurrentPlan = () => {
    if (selectedCategory === 'running') {
      return { name: 'Marathon Training', currentWeek: 8 };
    }
    if (selectedCategory === 'lifting') {
      return { name: 'Strength Foundation', currentWeek: 3 };
    }
    return null;
  };

  return (
    <div className="space-y-6" style={{fontFamily: 'Inter, sans-serif'}}>
      {/* Back button only - no duplicate title */}
      {currentLevel !== 'categories' && (
        <Button
          onClick={handleBack}
          variant="ghost"
          className="flex items-center gap-2 p-0 h-auto text-gray-600 hover:text-black"
        >
          <ArrowLeft className="h-4 w-4" />
          {getBackText()}
        </Button>
      )}

      {/* Current Plans Section - only show on categories level */}
      {currentLevel === 'categories' && currentPlans.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-medium text-gray-900">Current Plans</h2>
          {currentPlans.map((plan) => (
            <div
              key={plan.id}
              className="p-4 cursor-pointer hover:bg-gray-50 transition-colors rounded-lg"
            >
              <div className="font-medium">{plan.name} - Wk {plan.currentWeek}</div>
            </div>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="space-y-3">
        {currentLevel === 'categories' && (
          <>
            {currentPlans.length > 0 && (
              <h2 className="text-lg font-medium text-gray-900">Browse Plans</h2>
            )}
            {categories.map((category) => {
              const IconComponent = category.icon;
              return (
                <div
                  key={category.id}
                  onClick={() => handleCategoryClick(category.id)}
                  className="p-4 cursor-pointer hover:bg-gray-50 transition-colors rounded-lg"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <IconComponent className="h-5 w-5 text-gray-600" />
                      <div className="font-medium">{category.name}</div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-gray-400" />
                  </div>
                </div>
              );
            })}
          </>
        )}

        {currentLevel === 'focus' && (
          <>
            {/* Current Plan - show for any discipline that has one */}
            {getCurrentPlan() && (
              <>
                <div
                  onClick={handleCurrentPlanClick}
                  className="p-4 cursor-pointer hover:bg-gray-50 transition-colors rounded-lg"
                >
                  <div className="font-medium">Current Plan: {getCurrentPlan()?.name} - Wk {getCurrentPlan()?.currentWeek}</div>
                </div>
                <div className="border-t border-gray-200 my-4"></div>
              </>
            )}

            {getFilteredFocusAreas().map((focusArea) => (
              <div
                key={focusArea.id}
                onClick={() => handleFocusAreaClick(focusArea.id)}
                className="p-4 cursor-pointer hover:bg-gray-50 transition-colors rounded-lg"
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium">{focusArea.name}</div>
                  <ArrowRight className="h-4 w-4 text-gray-400" />
                </div>
              </div>
            ))}

            {/* Build - show for all disciplines */}
            <div className="border-t border-gray-200 my-4"></div>
            <div
              onClick={handleBuild}
              className="p-4 cursor-pointer hover:bg-gray-50 transition-colors rounded-lg"
            >
              <div className="font-medium">Build</div>
            </div>
          </>
        )}

        {currentLevel === 'plans' && (
          <>
            {getFilteredPlans().map((plan) => (
              <div
                key={plan.id}
                onClick={() => handlePlanSelect(plan)}
                className="p-4 cursor-pointer hover:bg-gray-50 transition-colors rounded-lg"
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium">{plan.name}</div>
                  <div className="w-2 h-2 bg-black rounded-full"></div>
                </div>
              </div>
            ))}
            
            {!showMore && getRemainingCount() > 0 && (
              <Button
                onClick={() => setShowMore(true)}
                variant="ghost"
                className="w-full flex items-center gap-2 text-gray-600 hover:text-black"
              >
                <ChevronDown className="h-4 w-4" />
                Show More ({getRemainingCount()} plans)
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AllPlansInterface;
import React from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';

interface TodaysEffortProps {
  onAddEffort: () => void;
}

const TodaysEffort: React.FC<TodaysEffortProps> = ({ onAddEffort }) => {
  const { workouts } = useAppContext();
  
  const today = new Date().toISOString().split('T')[0];
  const todaysWorkout = workouts.find(w => 
    w.date && w.date.split('T')[0] === today
  );

  const handleClick = () => {
    if (todaysWorkout) {
      // Open workout details - for now just log
      console.log('Opening workout details:', todaysWorkout);
    } else {
      onAddEffort();
    }
  };

  const displayText = todaysWorkout 
    ? `${todaysWorkout.type.charAt(0).toUpperCase() + todaysWorkout.type.slice(1)} ${todaysWorkout.distance || todaysWorkout.duration || ''}`.trim()
    : 'Rest Day';

  return (
    <Button 
      variant="ghost" 
      onClick={handleClick}
      className="text-sm font-normal text-gray-900 hover:bg-gray-100"
      style={{fontFamily: 'Helvetica, Arial, sans-serif'}}
    >
      Today's Effort: {displayText}
    </Button>
  );
};

export default TodaysEffort;
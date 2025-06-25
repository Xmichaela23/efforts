import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Activity, Dumbbell, Calendar, Filter, Waves, Bike } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface WorkoutTypeFilterProps {
  selectedType: 'all' | 'run' | 'ride' | 'strength' | 'swim';
  onTypeChange: (type: 'all' | 'run' | 'ride' | 'strength' | 'swim') => void;
  workoutCounts: {
    all: number;
    run: number;
    ride: number;
    strength: number;
    swim: number;
  };
}

const WorkoutTypeFilter: React.FC<WorkoutTypeFilterProps> = ({
  selectedType,
  onTypeChange,
  workoutCounts
}) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Filter className="h-5 w-5" />
          Training Session Type
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <Select value={selectedType} onValueChange={onTypeChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select training type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  All Sessions
                </div>
              </SelectItem>
              <SelectItem value="run">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-blue-500" />
                  Running
                </div>
              </SelectItem>
              <SelectItem value="ride">
                <div className="flex items-center gap-2">
                  <Bike className="h-4 w-4 text-orange-500" />
                  Riding
                </div>
              </SelectItem>
              <SelectItem value="strength">
                <div className="flex items-center gap-2">
                  <Dumbbell className="h-4 w-4 text-green-500" />
                  Strength Training
                </div>
              </SelectItem>
              <SelectItem value="swim">
                <div className="flex items-center gap-2">
                  <Waves className="h-4 w-4 text-cyan-500" />
                  Swimming
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          
          <div className="grid grid-cols-5 gap-2">
            <Button
              variant={selectedType === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onTypeChange('all')}
              className="flex flex-col gap-1 h-auto py-2"
            >
              <Calendar className="h-4 w-4" />
              <span className="text-xs">All</span>
              <Badge variant="secondary" className="text-xs">
                {workoutCounts.all}
              </Badge>
            </Button>
            
            <Button
              variant={selectedType === 'run' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onTypeChange('run')}
              className="flex flex-col gap-1 h-auto py-2"
            >
              <Activity className="h-4 w-4 text-blue-500" />
              <span className="text-xs">Run</span>
              <Badge variant="secondary" className="text-xs">
                {workoutCounts.run}
              </Badge>
            </Button>
            
            <Button
              variant={selectedType === 'ride' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onTypeChange('ride')}
              className="flex flex-col gap-1 h-auto py-2"
            >
              <Bike className="h-4 w-4 text-orange-500" />
              <span className="text-xs">Ride</span>
              <Badge variant="secondary" className="text-xs">
                {workoutCounts.ride}
              </Badge>
            </Button>
            
            <Button
              variant={selectedType === 'strength' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onTypeChange('strength')}
              className="flex flex-col gap-1 h-auto py-2"
            >
              <Dumbbell className="h-4 w-4 text-green-500" />
              <span className="text-xs">Strength</span>
              <Badge variant="secondary" className="text-xs">
                {workoutCounts.strength}
              </Badge>
            </Button>
            
            <Button
              variant={selectedType === 'swim' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onTypeChange('swim')}
              className="flex flex-col gap-1 h-auto py-2"
            >
              <Waves className="h-4 w-4 text-cyan-500" />
              <span className="text-xs">Swim</span>
              <Badge variant="secondary" className="text-xs">
                {workoutCounts.swim}
              </Badge>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default WorkoutTypeFilter;
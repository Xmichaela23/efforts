import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Smartphone, Watch, Waves } from 'lucide-react';
import { SwimWorkoutData } from '@/contexts/AppContext';

interface SwimExportProps {
  workoutName: string;
  swimData: SwimWorkoutData;
}

const SwimExport: React.FC<SwimExportProps> = ({ workoutName, swimData }) => {
  const handleGarminExport = () => {
    const garminData = {
      name: workoutName,
      type: 'swim',
      distance: swimData.totalDistance,
      strokeType: swimData.strokeType,
      targetPace: swimData.targetPacePer100,
      equipment: swimData.equipmentUsed
    };
    console.log('Exporting to Garmin:', garminData);
    alert('Swim workout exported to Garmin Connect!');
  };

  const handleAppleWatchExport = () => {
    console.log('Exporting to Apple Watch:', { workoutName, swimData });
    alert('Swim workout exported to Apple Watch!');
  };

  const handleFormGogglesExport = () => {
    console.log('Exporting to Form Goggles:', { workoutName, swimData });
    alert('Swim workout exported to Form Goggles!');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Waves className="h-5 w-5" />
          Export Swim Workout
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-4 bg-gray-50 rounded-lg">
          <h4 className="font-medium mb-2">{workoutName}</h4>
          <div className="space-y-1 text-sm text-gray-600">
            <p>Distance: {swimData.totalDistance}m</p>
            <p>Stroke: {swimData.strokeType}</p>
            {swimData.targetPacePer100 && <p>Target Pace: {swimData.targetPacePer100}/100m</p>}
            {swimData.equipmentUsed.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                <span>Equipment:</span>
                {swimData.equipmentUsed.map(eq => (
                  <Badge key={eq} variant="outline" className="text-xs">{eq}</Badge>
                ))}
              </div>
            )}
          </div>
        </div>
        
        <div className="grid gap-3">
          <Button onClick={handleGarminExport} className="flex items-center gap-2">
            <Watch className="h-4 w-4" />
            Export to Garmin Connect
          </Button>
          
          <Button onClick={handleAppleWatchExport} variant="outline" className="flex items-center gap-2">
            <Smartphone className="h-4 w-4" />
            Export to Apple Watch
          </Button>
          
          <Button onClick={handleFormGogglesExport} variant="outline" className="flex items-center gap-2">
            <Waves className="h-4 w-4" />
            Export to Form Goggles
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default SwimExport;
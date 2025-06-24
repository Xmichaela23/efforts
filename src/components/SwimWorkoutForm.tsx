import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { SwimWorkoutData } from '@/contexts/AppContext';
import { Waves } from 'lucide-react';

interface SwimWorkoutFormProps {
  swimData: SwimWorkoutData;
  onChange: (data: SwimWorkoutData) => void;
}

const STROKE_TYPES = [
  'Freestyle',
  'Backstroke', 
  'Breaststroke',
  'Butterfly',
  'Kick-Only'
] as const;

const EQUIPMENT_OPTIONS = [
  'Fins',
  'Snorkel',
  'Pull Buoy',
  'Paddles',
  'Kickboard'
];

const SwimWorkoutForm: React.FC<SwimWorkoutFormProps> = ({ swimData, onChange }) => {
  const handleEquipmentChange = (equipment: string, checked: boolean) => {
    const newEquipment = checked 
      ? [...swimData.equipmentUsed, equipment]
      : swimData.equipmentUsed.filter(e => e !== equipment);
    
    onChange({ ...swimData, equipmentUsed: newEquipment });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Waves className="h-5 w-5" />
          Swim Workout Details
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="totalDistance">Total Distance (meters)</Label>
          <Input
            id="totalDistance"
            type="number"
            value={swimData.totalDistance}
            onChange={(e) => onChange({ 
              ...swimData, 
              totalDistance: parseInt(e.target.value) || 0 
            })}
            placeholder="1500"
            min="0"
          />
        </div>

        <div>
          <Label htmlFor="targetPace">Target Pace per 100m</Label>
          <Input
            id="targetPace"
            value={swimData.targetPacePer100}
            onChange={(e) => onChange({ 
              ...swimData, 
              targetPacePer100: e.target.value 
            })}
            placeholder="1:30"
          />
        </div>

        <div>
          <Label htmlFor="strokeType">Stroke Type</Label>
          <Select 
            value={swimData.strokeType} 
            onValueChange={(value: typeof STROKE_TYPES[number]) => 
              onChange({ ...swimData, strokeType: value })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select stroke type" />
            </SelectTrigger>
            <SelectContent>
              {STROKE_TYPES.map(stroke => (
                <SelectItem key={stroke} value={stroke}>
                  {stroke}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Equipment Used</Label>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {EQUIPMENT_OPTIONS.map(equipment => (
              <div key={equipment} className="flex items-center space-x-2">
                <Checkbox
                  id={equipment}
                  checked={swimData.equipmentUsed.includes(equipment)}
                  onCheckedChange={(checked) => 
                    handleEquipmentChange(equipment, checked as boolean)
                  }
                />
                <Label htmlFor={equipment} className="text-sm">
                  {equipment}
                </Label>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SwimWorkoutForm;
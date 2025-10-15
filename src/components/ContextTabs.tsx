import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, BarChart3, TrendingUp } from 'lucide-react';
import TodaysWorkoutsTab from './context/TodaysWorkoutsTab';
import WeeklyAnalysisTab from './context/WeeklyAnalysisTab';
import BlockSummaryTab from './context/BlockSummaryTab';

interface ContextTabsProps {
  onClose?: () => void;
}

const ContextTabs: React.FC<ContextTabsProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState('today');

  return (
    <div className="w-full h-full">
      {/* Context Title Section */}
      <div className="px-4 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-black" style={{ fontFamily: 'Inter, sans-serif' }}>
              Context
            </h2>
            <p className="text-sm text-gray-600 mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>
              Training Analysis & Insights
            </p>
          </div>
          {onClose && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-gray-600 hover:text-gray-900"
            >
              Close
            </Button>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="px-4 py-2 border-b border-gray-100">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="today" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Today's Workouts
            </TabsTrigger>
            <TabsTrigger value="weekly" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Weekly Analysis
            </TabsTrigger>
            <TabsTrigger value="block" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Block Summary
            </TabsTrigger>
          </TabsList>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden">
            <TabsContent value="today" className="h-full mt-0">
              <TodaysWorkoutsTab />
            </TabsContent>
            
            <TabsContent value="weekly" className="h-full mt-0">
              <WeeklyAnalysisTab />
            </TabsContent>
            
            <TabsContent value="block" className="h-full mt-0">
              <BlockSummaryTab />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
};

export default ContextTabs;

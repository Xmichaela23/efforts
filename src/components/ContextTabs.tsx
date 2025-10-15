import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, CalendarCheck, CalendarDays } from 'lucide-react';
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

      {/* Tabs - Exact Same Design as Completed Tab */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-3 bg-transparent border-none mb-0 py-0">
          <TabsTrigger 
            value="today" 
            className="flex items-center gap-2 py-1 data-[state=active]:bg-transparent data-[state=active]:text-black data-[state=active]:underline data-[state=inactive]:text-gray-500 hover:text-gray-700"
          >
            <Calendar className="h-4 w-4" />
            Daily
          </TabsTrigger>
          <TabsTrigger 
            value="weekly" 
            className="flex items-center gap-2 py-1 data-[state=active]:bg-transparent data-[state=active]:text-black data-[state=active]:underline data-[state=inactive]:text-gray-500 hover:text-gray-700"
          >
            <CalendarCheck className="h-4 w-4" />
            Weekly
          </TabsTrigger>
          <TabsTrigger 
            value="block" 
            className="flex items-center gap-2 py-1 data-[state=active]:bg-transparent data-[state=active]:text-black data-[state=active]:underline data-[state=inactive]:text-gray-500 hover:text-gray-700"
          >
            <CalendarDays className="h-4 w-4" />
            Block
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-auto">
          <TabsContent value="today" className="flex-1 p-1">
            <TodaysWorkoutsTab />
          </TabsContent>
          
          <TabsContent value="weekly" className="flex-1 p-1">
            <WeeklyAnalysisTab />
          </TabsContent>
          
          <TabsContent value="block" className="flex-1 p-1">
            <BlockSummaryTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default ContextTabs;

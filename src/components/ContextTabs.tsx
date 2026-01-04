import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, CalendarDays } from 'lucide-react';
import TrainingContextTab from './context/TrainingContextTab';
import BlockSummaryTab from './context/BlockSummaryTab';

interface ContextTabsProps {
  onClose?: () => void;
}

const ContextTabs: React.FC<ContextTabsProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState('context');

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {/* Context Title Section */}
      <div className="px-4 py-4 border-b border-gray-100 flex-shrink-0">
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
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="grid w-full grid-cols-2 bg-transparent border-none mb-0 py-0 flex-shrink-0">
          <TabsTrigger 
            value="context" 
            className="flex items-center gap-2 py-1 data-[state=active]:bg-transparent data-[state=active]:text-black data-[state=active]:underline data-[state=inactive]:text-gray-500 hover:text-gray-700"
          >
            <TrendingUp className="h-4 w-4" />
            Context
          </TabsTrigger>
          <TabsTrigger 
            value="block" 
            className="flex items-center gap-2 py-1 data-[state=active]:bg-transparent data-[state=active]:text-black data-[state=active]:underline data-[state=inactive]:text-gray-500 hover:text-gray-700"
          >
            <CalendarDays className="h-4 w-4" />
            Block
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-y-auto min-h-0 px-4">
          <TabsContent value="context" className="mt-0 pt-2">
            <TrainingContextTab />
          </TabsContent>
          
          <TabsContent value="block" className="mt-0 pt-2">
            <BlockSummaryTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default ContextTabs;

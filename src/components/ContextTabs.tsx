import React, { useState } from 'react';
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
      {/* Header */}
      <div className="px-4 pt-2 pb-4 flex-shrink-0">
        <p className="text-xs text-white/40 uppercase tracking-widest mb-1">
          Training Analysis
        </p>
        
        {/* Tab Pills */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-3">
          <TabsList className="inline-flex gap-2 bg-transparent p-0">
            <TabsTrigger 
              value="context" 
              className="px-4 py-2 rounded-full text-sm font-medium transition-all
                data-[state=active]:bg-white/[0.12] data-[state=active]:text-white data-[state=active]:backdrop-blur-md
                data-[state=inactive]:bg-transparent data-[state=inactive]:text-white/50
                hover:bg-white/[0.08] border border-transparent data-[state=active]:border-white/20"
            >
              <TrendingUp className="h-4 w-4 mr-2" />
              Context
            </TabsTrigger>
            <TabsTrigger 
              value="block" 
              className="px-4 py-2 rounded-full text-sm font-medium transition-all
                data-[state=active]:bg-white/[0.12] data-[state=active]:text-white data-[state=active]:backdrop-blur-md
                data-[state=inactive]:bg-transparent data-[state=inactive]:text-white/50
                hover:bg-white/[0.08] border border-transparent data-[state=active]:border-white/20"
            >
              <CalendarDays className="h-4 w-4 mr-2" />
              Block
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto min-h-0 px-4">
          <TabsContent value="context" className="mt-0">
            <TrainingContextTab />
          </TabsContent>
          
          <TabsContent value="block" className="mt-0">
            <BlockSummaryTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default ContextTabs;

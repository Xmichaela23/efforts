import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import TrainingContextTab from './context/TrainingContextTab';
import BlockSummaryTab from './context/BlockSummaryTab';

interface ContextTabsProps {
  onClose?: () => void;
  onSelectWorkout?: (workout: any) => void;
}

const ContextTabs: React.FC<ContextTabsProps> = ({ onClose, onSelectWorkout }) => {
  const [activeTab, setActiveTab] = useState('context');

  return (
    <div className="w-full h-full flex flex-col overflow-hidden instrument-panel">
      <div aria-hidden="true" className="instrument-panel-texture" />

      <div className="instrument-surface w-full h-full flex flex-col min-h-0">
        {/* Header */}
        <div className="px-1 pt-1 pb-3 flex-shrink-0">
          <p className="text-xs text-white/40 uppercase tracking-widest mb-2">
            Training Analysis
          </p>
          
          {/* Tab Pills (more “mounted” like dashboard controls) */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-1">
            <TabsList className="inline-flex gap-2 bg-transparent p-0">
              <TabsTrigger 
                value="context" 
                className="px-4 py-2 rounded-full text-sm font-medium transition-all
                  data-[state=active]:bg-white/[0.10] data-[state=active]:text-white data-[state=active]:backdrop-blur-md
                  data-[state=inactive]:bg-transparent data-[state=inactive]:text-white/45
                  hover:bg-white/[0.08] border data-[state=active]:border-white/25 data-[state=inactive]:border-white/10"
                style={{
                  boxShadow: '0 0 0 1px rgba(255,255,255,0.03) inset, 0 6px 14px rgba(0,0,0,0.32)',
                }}
              >
                Week
              </TabsTrigger>
              <TabsTrigger 
                value="block" 
                className="px-4 py-2 rounded-full text-sm font-medium transition-all
                  data-[state=active]:bg-white/[0.10] data-[state=active]:text-white data-[state=active]:backdrop-blur-md
                  data-[state=inactive]:bg-transparent data-[state=inactive]:text-white/45
                  hover:bg-white/[0.08] border data-[state=active]:border-white/25 data-[state=inactive]:border-white/10"
                style={{
                  boxShadow: '0 0 0 1px rgba(255,255,255,0.03) inset, 0 6px 14px rgba(0,0,0,0.32)',
                }}
              >
                Block
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div aria-hidden="true" className="instrument-divider" />

        {/* Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto min-h-0 px-1 pb-1">
            <TabsContent value="context" className="mt-0">
              <TrainingContextTab onSelectWorkout={onSelectWorkout} />
            </TabsContent>
            
            <TabsContent value="block" className="mt-0">
              <BlockSummaryTab />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
};

export default ContextTabs;

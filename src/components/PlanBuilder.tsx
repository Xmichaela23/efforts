import React, { useState } from 'react';
import { ArrowLeft, Calendar } from 'lucide-react';
import AIPlanBuilder from './AIPlanBuilder';
import ManualPlanBuilder from './ManualPlanBuilder';

export default function PlanBuilder() {
  const [activeTab, setActiveTab] = useState<'ai' | 'manual'>('ai');
  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [generatedPlan, setGeneratedPlan] = useState<any>(null);

  return (
    <div className="w-full">
      <div className="flex border-b border-gray-200 mb-6">
        <button
          className={`px-4 py-2 -mb-px font-medium border-b-2 transition-colors ${
            activeTab === 'ai'
              ? 'border-black text-black'
              : 'border-transparent text-gray-500 hover:text-black'
          }`}
          onClick={() => setActiveTab('ai')}
        >
          AI Assistant
        </button>
        <button
          className={`ml-2 px-4 py-2 -mb-px font-medium border-b-2 transition-colors ${
            activeTab === 'manual'
              ? 'border-black text-black'
              : 'border-transparent text-gray-500 hover:text-black'
          }`}
          onClick={() => setActiveTab('manual')}
        >
          Manual Build
        </button>
      </div>
      {activeTab === 'ai' ? (
        <AIPlanBuilder />
      ) : (
        <ManualPlanBuilder
          startDate={startDate}
          onStartDateChange={setStartDate}
          onPlanGenerated={setGeneratedPlan}
          generatingPlan={generatingPlan}
          onSetGeneratingPlan={setGeneratingPlan}
        />
      )}
    </div>
  );
}
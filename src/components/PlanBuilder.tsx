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
    <div className="max-w-2xl mx-auto mt-8 p-4 bg-white rounded shadow">
      <div className="flex gap-2 mb-6">
        <button
          className={`px-4 py-2 rounded font-medium transition-colors ${activeTab === 'ai' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}
          onClick={() => setActiveTab('ai')}
        >
          AI Assistant
        </button>
        <button
          className={`px-4 py-2 rounded font-medium transition-colors ${activeTab === 'manual' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}
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
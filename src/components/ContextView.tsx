import React from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, TrendingUp, Target, Calendar } from 'lucide-react';
import { useOverallContext } from '@/hooks/useOverallContext';

interface ContextViewProps {
  onClose?: () => void;
}

const ContextView: React.FC<ContextViewProps> = ({ onClose }) => {
  const { data, loading, error, refresh } = useOverallContext();

  const handleRefresh = () => {
    refresh();
  };

  if (loading && !data) {
    return (
      <div className="w-full">
        {/* Context Title Section */}
        <div className="px-4 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-black" style={{ fontFamily: 'Inter, sans-serif' }}>
                Context
              </h2>
              <p className="text-sm text-gray-600 mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                9/15 - 10/15
              </p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="text-gray-600 hover:text-gray-900 text-sm font-medium disabled:opacity-50"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>
        <div className="p-4">
          <div className="space-y-4">
            <div className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
            <div className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-2/3 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            </div>
            <div className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-4/5 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full">
        {/* Context Title Section */}
        <div className="px-4 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-black" style={{ fontFamily: 'Inter, sans-serif' }}>
                Context
              </h2>
              <p className="text-sm text-gray-600 mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                9/15 - 10/15
              </p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="text-gray-600 hover:text-gray-900 text-sm font-medium disabled:opacity-50"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              {loading ? 'Refreshing...' : 'Try Again'}
            </button>
          </div>
        </div>
        <div className="p-4">
          <div className="text-center py-12">
            <div className="text-gray-500 mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>
              Unable to generate context
            </div>
            <div className="text-sm text-gray-400" style={{ fontFamily: 'Inter, sans-serif' }}>
              {error}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="w-full">
        {/* Context Title Section */}
        <div className="px-4 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-black" style={{ fontFamily: 'Inter, sans-serif' }}>
                Context
              </h2>
              <p className="text-sm text-gray-600 mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                9/15 - 10/15
              </p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="text-gray-600 hover:text-gray-900 text-sm font-medium disabled:opacity-50"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>
        <div className="p-4">
          <div className="text-center py-12">
            <div className="text-gray-500" style={{ fontFamily: 'Inter, sans-serif' }}>
              No context data available
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">

      {/* Context Title Section - matching "Swim — Technique" style */}
      <div className="px-4 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-black" style={{ fontFamily: 'Inter, sans-serif' }}>
              Context
            </h2>
            <p className="text-sm text-gray-600 mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>
              9/15 - 10/15
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="text-gray-600 hover:text-gray-900 text-sm font-medium disabled:opacity-50"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="p-4">

        {/* Content - no cards, flat design */}
        <div className="space-y-6">
          {/* Performance Trends */}
          <div>
            <h2 className="text-lg font-semibold text-black mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
              Performance Trends
            </h2>
            <div className="text-gray-600 leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>
              {data.performance_trends}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-100"></div>

          {/* Plan Adherence */}
          <div>
            <h2 className="text-lg font-semibold text-black mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
              Plan Adherence
            </h2>
            <div className="text-gray-600 leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>
              {data.plan_adherence}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-100"></div>

          {/* Weekly Summary */}
          <div>
            <h2 className="text-lg font-semibold text-black mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
              This Week
            </h2>
            <div className="text-gray-600 leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>
              {data.weekly_summary}
            </div>
          </div>
        </div>

        {/* Footer note */}
        <div className="mt-12 pt-6 border-t border-gray-100">
          <div className="text-xs text-gray-400 text-center" style={{ fontFamily: 'Inter, sans-serif' }}>
            Analysis based on last 4 weeks of training data
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContextView;

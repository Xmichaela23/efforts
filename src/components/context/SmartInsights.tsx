/**
 * =============================================================================
 * SMART INSIGHTS COMPONENT
 * =============================================================================
 * 
 * Displays training insights as styled cards:
 * - Color-coded by severity (critical, warning, info)
 * - Appropriate icons for each severity
 * - Maximum 3 insights shown
 */

import React from 'react';
import { AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { INSIGHT_SEVERITY_CONFIG } from '@/lib/context-utils';
import type { Insight } from '@/hooks/useTrainingContext';

interface SmartInsightsProps {
  insights: Insight[];
}

export const SmartInsights: React.FC<SmartInsightsProps> = ({ insights }) => {
  // Don't render if no insights
  if (!insights || insights.length === 0) {
    return null;
  }

  // Get appropriate icon for severity
  const getIcon = (severity: Insight['severity']) => {
    switch (severity) {
      case 'critical':
        return AlertTriangle;
      case 'warning':
        return AlertCircle;
      case 'info':
      default:
        return Info;
    }
  };

  return (
    <div className="space-y-2">
      {insights.map((insight, idx) => {
        const config = INSIGHT_SEVERITY_CONFIG[insight.severity];
        const Icon = getIcon(insight.severity);
        
        return (
          <div 
            key={`${insight.type}-${idx}`}
            className={`${config.bgClass} border ${config.borderClass} rounded-lg p-3 flex items-start gap-3`}
          >
            {/* Icon */}
            <Icon className={`w-4 h-4 ${config.iconClass} flex-shrink-0 mt-0.5`} />
            
            {/* Message */}
            <p className={`text-sm ${config.textClass} leading-relaxed`}>
              {insight.message}
            </p>
          </div>
        );
      })}
    </div>
  );
};

export default SmartInsights;


/**
 * =============================================================================
 * ACWR GAUGE COMPONENT
 * =============================================================================
 * 
 * Displays the Acute:Chronic Workload Ratio with:
 * - Visual gauge bar showing position in zones
 * - Current status and ratio
 * - Acute and chronic totals
 * - Projected ACWR if planned workout exists
 * - Progressive disclosure for insufficient data
 */

import React from 'react';
import { ACWR_STATUS_CONFIG } from '@/lib/context-utils';
import type { ACWRData } from '@/hooks/useTrainingContext';

interface ACWRGaugeProps {
  acwr: ACWRData;
  showProjected?: boolean;
}

export const ACWRGauge: React.FC<ACWRGaugeProps> = ({ acwr, showProjected = true }) => {
  const config = ACWR_STATUS_CONFIG[acwr.status];
  
  // Calculate gauge position (0.5 = leftmost, 2.0 = rightmost)
  // Map 0.5-2.0 range to 0-100%
  const clampedRatio = Math.min(Math.max(acwr.ratio, 0.5), 2.0);
  const gaugePosition = ((clampedRatio - 0.5) / 1.5) * 100;

  // Progressive disclosure - show message if insufficient data
  if (acwr.data_days < 7) {
    const daysNeeded = 7 - acwr.data_days;
    return (
      <div className="bg-white/[0.05] backdrop-blur-md border border-white/20 rounded-lg p-4">
        <div className="text-center">
          <div className="text-white/60 text-sm">
            Train for {daysNeeded} more day{daysNeeded !== 1 ? 's' : ''} to unlock training load insights
          </div>
          <div className="text-white/40 text-xs mt-2">
            {acwr.data_days} day{acwr.data_days !== 1 ? 's' : ''} of data collected
          </div>
        </div>
      </div>
    );
  }

  // Build caveat for partial data
  let caveat = '';
  if (acwr.data_days < 14) {
    caveat = '(preliminary - 7 days)';
  } else if (acwr.data_days < 28) {
    caveat = `(${acwr.data_days} days of data)`;
  }

  return (
    <div className="bg-white/[0.05] backdrop-blur-md border border-white/20 rounded-lg p-4">
      {/* ACWR Value and Status */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-2xl font-bold text-white">
            {acwr.ratio.toFixed(2)}
          </div>
          <div className={`text-sm ${config.textClass}`}>
            {config.label}
            {caveat && <span className="text-white/40 ml-1">{caveat}</span>}
          </div>
        </div>
        <div className="text-right text-sm text-white/60">
          <div>Acute (7d): {acwr.acute_total}</div>
          <div>Chronic (28d): {acwr.chronic_total}</div>
        </div>
      </div>

      {/* Gauge Bar */}
      <div className="relative h-3 bg-white/10 rounded-full overflow-hidden mb-2">
        {/* Zone indicators - positioned as percentages of the 0.5-2.0 range */}
        {/* 0.5-0.8 = undertrained (0-20%), 0.8-1.3 = optimal (20-53%), 1.3-1.5 = elevated (53-67%), 1.5-2.0 = high_risk (67-100%) */}
        <div className="absolute inset-0 flex">
          <div className="bg-blue-500/30" style={{ width: '20%' }}></div>
          <div className="bg-green-500/30" style={{ width: '33%' }}></div>
          <div className="bg-yellow-500/30" style={{ width: '14%' }}></div>
          <div className="bg-red-500/30" style={{ width: '33%' }}></div>
        </div>
        
        {/* Current position indicator */}
        <div 
          className={`absolute top-0 bottom-0 w-1.5 ${config.bgClass} rounded-full shadow-lg transition-all duration-300`}
          style={{ left: `${gaugePosition}%`, transform: 'translateX(-50%)' }}
        />
      </div>

      {/* Zone labels */}
      <div className="flex justify-between text-xs text-white/30 mb-3">
        <span>0.5</span>
        <span>0.8</span>
        <span>1.3</span>
        <span>1.5</span>
        <span>2.0</span>
      </div>

      {/* Projected ACWR */}
      {showProjected && acwr.projected && (
        <div className="mt-3 pt-3 border-t border-white/10 text-sm text-white/70">
          <span className="text-white/50">If you complete today's workout: </span>
          <span className={ACWR_STATUS_CONFIG[acwr.projected.status].textClass}>
            {acwr.projected.ratio.toFixed(2)} ({ACWR_STATUS_CONFIG[acwr.projected.status].label})
          </span>
        </div>
      )}
    </div>
  );
};

export default ACWRGauge;


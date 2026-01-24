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
    <div className="space-y-3">
      {insights.map((insight, idx) => {
        const config = INSIGHT_SEVERITY_CONFIG[insight.severity];
        const Icon = getIcon(insight.severity);

        // Severity tint (used for the accent glow only)
        const tintRgb =
          insight.severity === 'critical'
            ? '239, 68, 68' // red
            : insight.severity === 'warning'
              ? '234, 179, 8' // yellow
              : '74, 158, 255'; // blue (matches swim phosphor more than Tailwind blue-500)
        
        return (
          <div 
            key={`${insight.type}-${idx}`}
            className="instrument-card flex items-start gap-3"
            style={{
              borderColor: `rgba(${tintRgb}, 0.22)`,
              padding: '14px',
            }}
          >
            {/* Accent wash (so it reads like a console instrument, not a blue blob) */}
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                borderRadius: 12,
                zIndex: 0,
                opacity: 0.85,
                mixBlendMode: 'screen',
                backgroundImage: `
                  radial-gradient(220px 120px at 14% 20%, rgba(${tintRgb}, 0.18) 0%, rgba(${tintRgb}, 0.0) 68%),
                  radial-gradient(240px 140px at 86% 22%, rgba(${tintRgb}, 0.10) 0%, rgba(${tintRgb}, 0.0) 70%),
                  linear-gradient(90deg, rgba(${tintRgb}, 0.10) 0%, rgba(${tintRgb}, 0.0) 40%),
                  linear-gradient(270deg, rgba(${tintRgb}, 0.08) 0%, rgba(${tintRgb}, 0.0) 40%)
                `,
                filter: 'blur(10px) saturate(1.06)',
                transform: 'translateZ(0)',
              }}
            />
            {/* Icon */}
            <Icon className={`w-4 h-4 ${config.iconClass} flex-shrink-0 mt-0.5`} style={{ position: 'relative', zIndex: 1 }} />
            
            {/* Message */}
            <p
              className="text-sm leading-relaxed"
              style={{
                position: 'relative',
                zIndex: 1,
                color: 'rgba(245, 245, 245, 0.82)',
                textShadow: '0 1px 1px rgba(0,0,0,0.55)',
              }}
            >
              {insight.message}
            </p>
          </div>
        );
      })}
    </div>
  );
};

export default SmartInsights;


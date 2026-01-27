import React, { useRef, useState, useEffect } from 'react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
  thresholdPx?: number;
}

// Minimal, dependency‑free pull‑to‑refresh for PWA
// Works when the page is scrolled to the very top; on pull ≥ threshold, triggers onRefresh
const PullToRefresh: React.FC<PullToRefreshProps> = ({ onRefresh, children, thresholdPx = 70 }) => {
  const startYRef = useRef<number | null>(null);
  const pullingRef = useRef(false);
  const [offset, setOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const el = document.scrollingElement || document.documentElement;

    const onTouchStart = (e: TouchEvent) => {
      if ((el?.scrollTop || 0) <= 0 && !refreshing) {
        startYRef.current = e.touches[0].clientY;
        pullingRef.current = true;
      } else {
        startYRef.current = null;
        pullingRef.current = false;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pullingRef.current || startYRef.current == null) return;
      
      // Check if touch is inside a scrollable container - if so, don't interfere
      const target = e.target as HTMLElement;
      if (target) {
        const scrollableParent = target.closest('[style*="overflow"], [class*="overflow"]');
        if (scrollableParent) {
          const computedStyle = window.getComputedStyle(scrollableParent as Element);
          if (computedStyle.overflowY === 'auto' || computedStyle.overflowY === 'scroll') {
            // User is scrolling inside a nested container - don't interfere
            pullingRef.current = false;
            startYRef.current = null;
            return;
          }
        }
      }
      
      const dy = e.touches[0].clientY - startYRef.current;
      if (dy > 0) {
        // Apply easing
        const eased = Math.min(thresholdPx * 1.5, dy * 0.6);
        setOffset(eased);
        e.preventDefault();
      }
    };

    const onTouchEnd = async () => {
      if (!pullingRef.current) return;
      pullingRef.current = false;
      const shouldRefresh = offset >= thresholdPx;
      setOffset(0);
      if (shouldRefresh && !refreshing) {
        try {
          setRefreshing(true);
          await onRefresh?.();
        } finally {
          setRefreshing(false);
        }
      }
    };

    window.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);

    return () => {
      window.removeEventListener('touchstart', onTouchStart as any);
      window.removeEventListener('touchmove', onTouchMove as any);
      window.removeEventListener('touchend', onTouchEnd as any);
    };
  }, [offset, thresholdPx, onRefresh, refreshing]);

  return (
    <div style={{ 
      transform: offset ? `translateY(${offset}px)` : undefined, 
      transition: pullingRef.current ? 'none' : 'transform 120ms ease-out', 
      height: '100%',
      display: 'flex', 
      flexDirection: 'column' as const,
    }}>
      {refreshing && (
        <div className="fixed top-10 left-1/2 -translate-x-1/2 text-[11px] text-gray-500">Refreshing…</div>
      )}
      {children}
    </div>
  );
};

export default PullToRefresh;



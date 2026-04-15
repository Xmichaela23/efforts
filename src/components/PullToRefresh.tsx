import React, { useRef, useState, useEffect } from 'react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
  thresholdPx?: number;
}

// PWA pull-to-refresh: window-level listeners so fixed overlays (e.g. workout detail) still work.
// Arms only when every vertical scroll ancestor is at top; nested overflow-y panels no longer block.
const INTERACTIVE_SELECTORS =
  'button, a[href], input, textarea, select, [role="button"], [role="tab"], [data-pull-refresh-ignore]';

const touchTargetIsInteractive = (target: EventTarget | null): boolean => {
  const el = target instanceof Element ? target : null;
  if (!el) return false;
  return Boolean(el.closest(INTERACTIVE_SELECTORS));
};

function isVerticallyScrollable(el: HTMLElement): boolean {
  const s = window.getComputedStyle(el);
  const oy = s.overflowY;
  if (oy !== 'auto' && oy !== 'scroll' && oy !== 'overlay') return false;
  return el.scrollHeight > el.clientHeight + 1;
}

/** All elements between `start` and `<html>` that can scroll vertically (deepest first). */
function getVerticalScrollChain(start: Element | null): HTMLElement[] {
  const chain: HTMLElement[] = [];
  let node: Element | null = start;
  while (node) {
    if (node instanceof HTMLElement && isVerticallyScrollable(node)) {
      chain.push(node);
    }
    if (node === document.documentElement) break;
    node = node.parentElement;
  }
  return chain;
}

function allScrollChainAtTop(chain: HTMLElement[]): boolean {
  return chain.every((el) => el.scrollTop <= 1);
}

const PullToRefresh: React.FC<PullToRefreshProps> = ({ onRefresh, children, thresholdPx = 70 }) => {
  const startYRef = useRef<number | null>(null);
  const pullingRef = useRef(false);
  const scrollChainRef = useRef<HTMLElement[]>([]);
  const offsetRef = useRef(0);
  const onRefreshRef = useRef(onRefresh);
  const refreshingRef = useRef(false);
  const [offset, setOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);

  useEffect(() => {
    const el = document.scrollingElement || document.documentElement;

    const resetPull = () => {
      pullingRef.current = false;
      startYRef.current = null;
      scrollChainRef.current = [];
      offsetRef.current = 0;
      setOffset(0);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (touchTargetIsInteractive(e.target)) {
        resetPull();
        return;
      }
      if (refreshingRef.current) {
        resetPull();
        return;
      }
      const chain = getVerticalScrollChain(e.target as Element);
      scrollChainRef.current = chain;
      if (!allScrollChainAtTop(chain)) {
        resetPull();
        return;
      }
      if ((el?.scrollTop || 0) > 1) {
        resetPull();
        return;
      }
      startYRef.current = e.touches[0].clientY;
      pullingRef.current = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pullingRef.current || startYRef.current == null) return;

      if (!allScrollChainAtTop(scrollChainRef.current)) {
        resetPull();
        return;
      }
      if ((el?.scrollTop || 0) > 1) {
        resetPull();
        return;
      }

      const dy = e.touches[0].clientY - startYRef.current;
      if (dy > 0) {
        const eased = Math.min(thresholdPx * 1.5, dy * 0.6);
        offsetRef.current = eased;
        setOffset(eased);
        e.preventDefault();
      }
    };

    const onTouchEnd = async () => {
      if (!pullingRef.current) return;
      pullingRef.current = false;
      const shouldRefresh = offsetRef.current >= thresholdPx;
      scrollChainRef.current = [];
      offsetRef.current = 0;
      setOffset(0);
      startYRef.current = null;

      if (shouldRefresh && !refreshingRef.current) {
        try {
          setRefreshing(true);
          refreshingRef.current = true;
          await Promise.resolve(onRefreshRef.current?.());
        } finally {
          setRefreshing(false);
          refreshingRef.current = false;
        }
      }
    };

    const onTouchCancel = () => {
      resetPull();
    };

    window.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchCancel);

    return () => {
      window.removeEventListener('touchstart', onTouchStart as EventListener);
      window.removeEventListener('touchmove', onTouchMove as EventListener);
      window.removeEventListener('touchend', onTouchEnd as EventListener);
      window.removeEventListener('touchcancel', onTouchCancel as EventListener);
    };
  }, [thresholdPx]);

  return (
    <div
      style={{
        transform: offset ? `translateY(${offset}px)` : undefined,
        transition: pullingRef.current ? 'none' : 'transform 120ms ease-out',
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column' as const,
      }}
    >
      {refreshing && (
        <div className="fixed top-10 left-1/2 -translate-x-1/2 text-[11px] text-gray-500 z-[100]">
          Refreshing…
        </div>
      )}
      {children}
    </div>
  );
};

export default PullToRefresh;

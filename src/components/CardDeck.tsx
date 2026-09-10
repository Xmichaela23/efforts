import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

/**
 * ═══ THE DECK MECHANIC, ONCE ═════════════════════════════════════════════════════════════════════
 *
 * docs/WORKORDER-today-screen-2026-09-09.md §3d built the swipeable stack for a lift session; the
 * open LOAD card wants the same object (Michael, 2026-09-09: the open card "is a wall"). ⛔ SO THE
 * MECHANIC LIVES HERE AND BOTH RENDER IT. Two hand-rolled swipe handlers on one screen would drift
 * on the threshold, the depth maths and the reduced-motion rule — and would disagree about which
 * one an arrow key belongs to.
 *
 * ⛔ CSS TRANSFORMS ONLY, NO LIBRARY. `translate3d` + `rotateY` under one `perspective`, the
 * mockup's own numbers. `prefers-reduced-motion` turns the transitions off and the deck still works.
 *
 * ⛔ SWIPE IS THE DECK'S, TAP IS THE CALLER'S. A drag under 60 px snaps back and does NOT fire
 * `onCardTap` — otherwise every abandoned swipe becomes an accidental navigation.
 *
 * ⚠️ THE ARROW KEYS ARE SCOPED TO THE FOCUSED DECK, NOT TO THE WINDOW. The mockup listened on
 * `window` because it had one deck; two decks on one screen would both move on one key press.
 */

const SWIPE_PX = 60;
/** How many cards deep the stack draws. Past this they are invisible anyway. */
const DEPTH = 3;

const prefersReducedMotion = (): boolean => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

export type DeckItem = { key: string; node: React.ReactNode };

export const CardDeck: React.FC<{
  items: DeckItem[];
  /** The sport colour, as a hex — the lit edge, the active dot. */
  colour: string;
  /** The same colour as `r, g, b`, for the panel's translucent edge and glow. */
  rgb: string;
  /** Left of the `n of N` counter. Omitted where the deck needs no name. */
  header?: React.ReactNode;
  /** Card padding. The session deck and the load deck run the same 14/16. */
  padding?: string;
  onCardTap?: () => void;
  /** A hook for the screenshot harness to read the deck and its position. */
  testId?: string;
  className?: string;
}> = ({ items, colour, rgb, header, padding = '14px 16px', onCardTap, testId, className = '' }) => {
  const [idx, setIdx] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const moved = useRef(0);
  const reduced = useMemo(prefersReducedMotion, []);

  /**
   * ⛔ THE CARD IS AS TALL AS ITS OWN CONTENT, no fixed minimum. The stack has to be absolutely
   * positioned for the cards to sit on one another, which leaves the container with no height — so
   * it takes the FRONT card's, measured.
   * ⚠️ `useLayoutEffect`, so the browser never paints the unmeasured state. ⚠️ AND A `ResizeObserver`
   * BESIDE IT, because a card whose content reflows — a chart resizing, a font landing late — would
   * otherwise keep the height it had when it first mounted.
   */
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [stackHeight, setStackHeight] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const el = cardRefs.current[idx];
    if (!el) return;
    const measure = () => setStackHeight((prev) => (prev === el.offsetHeight ? prev : el.offsetHeight));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [idx, items]);

  useEffect(() => { setIdx((i) => Math.min(i, Math.max(0, items.length - 1))); }, [items.length]);

  if (items.length === 0) return null;

  const go = (n: number) => { setIdx(Math.max(0, Math.min(items.length - 1, n))); setDragX(0); };

  /**
   * ⛔ THE STACK. The front card follows the finger and yaws with it; the next cards sit behind,
   * offset up-right, smaller, dimmer, blurred; read cards fall away down-left with a small rotate.
   */
  const styleFor = (i: number): React.CSSProperties => {
    const k = i - idx;
    if (k === 0) {
      return {
        transform: `translate3d(${dragX}px,0,0) rotateY(${dragX / 18}deg)`,
        opacity: 1, filter: 'none', zIndex: 10, pointerEvents: 'auto',
      };
    }
    if (k > 0) {
      const d = Math.min(k, DEPTH);
      return {
        transform: `translate3d(${d * 10}px, ${-d * 12}px, ${-d * 90}px) scale(${1 - d * 0.05})`,
        // ⚠️ 2.5 px, NOT THE MOCKUP'S 0.6 — see `deckGlass`. At 0.6 the next card's heading is still
        // readable through the front one, which turns depth into a second thing to read.
        opacity: Math.max(0, 0.85 - d * 0.28), filter: `blur(${d * 2.5}px)`, zIndex: 10 - d, pointerEvents: 'none',
      };
    }
    const d = Math.min(-k, DEPTH);
    return {
      transform: `translate3d(${-d * 14}px, ${d * 10}px, ${-d * 120}px) rotateY(${-6 * d}deg) scale(${1 - d * 0.08})`,
      opacity: Math.max(0, 0.45 - d * 0.22), filter: `blur(${d * 2}px)`, zIndex: 10 - d, pointerEvents: 'none',
    };
  };

  const end = () => {
    if (!dragging) return;
    setDragging(false);
    // ⛔ UNDER 60 px IS NOT A SWIPE. It snaps back, and the tap handler refuses to fire only when the
    // finger actually travelled.
    if (dragX < -SWIPE_PX) go(idx + 1);
    else if (dragX > SWIPE_PX) go(idx - 1);
    else setDragX(0);
  };

  return (
    <div
      data-deck={testId ?? '1'}
      className={`select-none ${className}`}
      style={{ perspective: 900, touchAction: 'pan-y' }}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); go(idx + 1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); go(idx - 1); }
      }}
      onPointerDown={(e) => {
        setDragging(true);
        startX.current = e.clientX;
        moved.current = 0;
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* older webviews */ }
      }}
      onPointerMove={(e) => {
        if (!dragging) return;
        const dx = e.clientX - startX.current;
        moved.current = Math.max(moved.current, Math.abs(dx));
        setDragX(dx);
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div
        className="flex justify-between text-[11px] uppercase tracking-[0.06em] mb-1.5"
        style={{ color: 'rgba(255,255,255,0.38)' }}
      >
        <span className="truncate pr-3">{header}</span>
        <span data-deck-pos={testId ?? '1'} className="tabular-nums flex-shrink-0">{idx + 1} of {items.length}</span>
      </div>

      <div
        className="relative"
        style={{
          height: stackHeight ?? undefined,
          transition: reduced ? 'none' : 'height 420ms cubic-bezier(.2,.8,.2,1)',
        }}
      >
        {items.map((item, i) => (
          <div
            key={item.key}
            ref={(el) => { cardRefs.current[i] = el; }}
            role={onCardTap ? 'button' : undefined}
            tabIndex={onCardTap ? 0 : undefined}
            className="absolute text-left w-full"
            style={{
              ...deckGlass(rgb),
              top: 0, left: 0, right: 0,
              padding,
              transformStyle: 'preserve-3d',
              transformOrigin: '50% 60%',
              transition: dragging || reduced
                ? 'none'
                : 'transform 420ms cubic-bezier(.2,.8,.2,1), opacity 420ms ease, filter 420ms ease',
              willChange: 'transform',
              cursor: onCardTap ? 'pointer' : undefined,
              ...styleFor(i),
            }}
            onClick={(e) => {
              if (!onCardTap) return;
              e.preventDefault();
              e.stopPropagation();
              // ⛔ A DRAG IS NOT A TAP. Anything past a few pixels was the deck's gesture.
              if (moved.current > 8) return;
              onCardTap();
            }}
          >
            {item.node}
          </div>
        ))}
      </div>

      <div className="flex gap-1.5 justify-center mt-1.5">
        {items.map((item, i) => (
          <span
            key={item.key}
            aria-hidden="true"
            className="inline-block rounded-full"
            style={{
              height: 5,
              width: i === idx ? 16 : 5,
              borderRadius: i === idx ? 3 : 999,
              background: i === idx ? colour : 'rgba(255,255,255,0.18)',
              boxShadow: i === idx ? `0 0 8px ${colour}` : undefined,
              transition: reduced ? 'none' : 'background 300ms, width 300ms',
            }}
          />
        ))}
      </div>
    </div>
  );
};

/**
 * The glass panel — translucent over the dot grid, a thin edge in the sport colour, the glow
 * bleeding onto the grid (§3d).
 *
 * ⚠️ SLIGHTLY MORE OPAQUE THAN THE MOCKUP'S 0.82, AND THE STACK IS BLURRED HARDER (see `styleFor`).
 * The mockup leans on `backdrop-filter` to smear the cards sitting 10 px behind the front one; where
 * that filter does not composite — an older WebView, a device with it off — the next card's heading
 * reads straight through the front one. Two small changes carry the legibility without the filter,
 * and the panel is still glass.
 */
export const deckGlass = (rgb: string): React.CSSProperties => ({
  borderRadius: 18,
  background: 'linear-gradient(180deg, rgba(19,21,27,0.90), rgba(11,12,16,0.96))',
  border: `1px solid rgba(${rgb},0.45)`,
  boxShadow: `0 0 0 1px rgba(255,255,255,0.03) inset, 0 18px 50px rgba(0,0,0,0.55), 0 0 40px rgba(${rgb},0.18)`,
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
});

export default CardDeck;

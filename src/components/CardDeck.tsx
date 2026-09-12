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
 * ⛔ SWIPE IS THE DECK'S, TAP IS THE CALLER'S. A drag that does not commit snaps back and does NOT
 * fire `onCardTap` — otherwise every abandoned swipe becomes an accidental navigation.
 *
 * ⚠️ THE ARROW KEYS ARE SCOPED TO THE FOCUSED DECK, NOT TO THE WINDOW. The mockup listened on
 * `window` because it had one deck; two decks on one screen would both move on one key press.
 *
 * ═══ THE GESTURE, REBUILT FOR A THUMB (2026-09-09 device finding) ════════════════════════════════
 *
 * On the phone the deck FOUGHT THE PAGE SCROLL and asked for a drag nobody makes. Three separate
 * causes, and all three are in the handler rather than the visuals:
 *
 *  1. ⛔ NO AXIS. `onPointerMove` fed every horizontal component of every gesture straight into
 *     `dragX`, so scrolling the screen yawed the card sideways under the thumb — a thumb never
 *     travels straight up. THE FIX IS AN AXIS LOCK: the first `AXIS_LOCK_PX` of travel decides
 *     whether the gesture is the deck's or the page's, and once decided IT DOES NOT CHANGE for the
 *     rest of that gesture. A vertical verdict makes the deck inert and the page scrolls normally.
 *  2. ⛔ 60 px WAS THE WHOLE JOB. Distance was the only way to turn a card, so a fast flick that
 *     covered 40 px did nothing. `SWIPE_PX` is halved AND velocity now commits on its own — a quick
 *     flick turns the card at any distance past `FLICK_MIN_PX`.
 *  3. ⛔ `pointercancel` COMMITTED THE SWIPE. When the browser took the gesture over to scroll, the
 *     old handler ran the same `end()` as a finger lift — so a scroll that had drifted past the
 *     threshold turned a card on the way past. Cancel now ABANDONS: snap back, nothing committed.
 *
 * ⚠️ AND THE TAP GUARD COUNTS BOTH AXES. It only ever measured horizontal travel, so a vertical drag
 * left it at zero and the card's `onClick` still fired — the drawer opened when the athlete scrolled.
 *
 * ⚠️ TEST THIS ON TOUCH, NOT WITH A MOUSE. A mouse drag is straight, arrives as `pointerType:
 * 'mouse'`, and never triggers a browser scroll — every one of the three bugs above is invisible to it.
 */

/** Distance that commits a card on its own. Halved from 60 — see the gesture note above. */
const SWIPE_PX = 30;
/** The first movement that decides horizontal-vs-vertical. Below this the deck does nothing at all. */
const AXIS_LOCK_PX = 8;
/** px/ms. A flick this fast turns the card whatever the distance. ~500 px/s. */
const FLICK_VELOCITY = 0.5;
/** A flick still has to be a movement, so a fast twitch in place is not a swipe. */
const FLICK_MIN_PX = 10;
/** Past this much travel on EITHER axis, the gesture was a drag and the tap does not fire. */
const TAP_SLOP_PX = 8;
/** How many cards deep the stack draws. Past this they are invisible anyway. */
const DEPTH = 3;

const prefersReducedMotion = (): boolean => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

export type DeckItem = { key: string; node: React.ReactNode };

/**
 * ⛔ `lead` IS THE FIRST SESSION OF THE DAY, `quiet` IS EVERY OTHER CARD ON TODAY (§3e.2). It is a
 * position on the screen, not a property of the session — the same lift is `lead` on a day it comes
 * first and `quiet` on a day it does not.
 */
export type CardEmphasis = 'lead' | 'quiet';

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
  /** See `CardEmphasis` — where this card sits on Today, not what it is. */
  emphasis?: CardEmphasis;
  className?: string;
}> = ({ items, colour, rgb, header, padding = '14px 16px', onCardTap, testId, emphasis = 'lead', className = '' }) => {
  const [idx, setIdx] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const reduced = useMemo(prefersReducedMotion, []);

  /**
   * The whole gesture in one ref. ⚠️ A REF, NOT STATE — the commit decision reads the last sample at
   * the moment the finger lifts, and a `dragX` read out of state can be a render behind it.
   *
   * `axis` is the lock: `null` while the gesture is still ambiguous, then `'x'` (ours) or `'y'` (the
   * page's) for the rest of it. `movedAny` is the tap guard and counts BOTH axes.
   */
  const g = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    lastX: number;
    lastT: number;
    vx: number;
    dx: number;
    axis: null | 'x' | 'y';
    movedAny: number;
  }>({ active: false, startX: 0, startY: 0, lastX: 0, lastT: 0, vx: 0, dx: 0, axis: null, movedAny: 0 });

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

  /**
   * The finger lifted. ⛔ EITHER TEST COMMITS: far enough, or fast enough. Distance alone is what
   * made the deck feel like hard work.
   */
  const end = () => {
    const s = g.current;
    if (!s.active) return;
    s.active = false;
    setDragging(false);

    if (s.axis !== 'x') { s.dx = 0; setDragX(0); return; }

    const far = Math.abs(s.dx) > SWIPE_PX;
    const flick = Math.abs(s.vx) > FLICK_VELOCITY && Math.abs(s.dx) > FLICK_MIN_PX;
    // ⚠️ THE FLICK'S DIRECTION IS THE VELOCITY'S, not the offset's — a flick back the other way at
    // the end of a drag is the athlete changing their mind, and it should follow the thumb.
    const dir = far ? Math.sign(s.dx) : Math.sign(s.vx);

    s.dx = 0;
    if ((far || flick) && dir < 0) go(idx + 1);
    else if ((far || flick) && dir > 0) go(idx - 1);
    else setDragX(0);
  };

  /**
   * ⛔ THE BROWSER TOOK THE GESTURE — abandon it. This is the normal end of every page scroll that
   * started on a card, and committing a card here is what turned pages while the athlete scrolled.
   */
  const cancel = () => {
    const s = g.current;
    // ⚠️ `lostpointercapture` also fires on a NORMAL finger lift, after `end` has already committed.
    // Without this guard it would wipe the card the athlete just turned to.
    if (!s.active) return;
    s.active = false;
    s.axis = 'y';
    s.dx = 0;
    setDragging(false);
    setDragX(0);
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
        g.current = {
          active: true,
          startX: e.clientX,
          startY: e.clientY,
          lastX: e.clientX,
          lastT: e.timeStamp,
          vx: 0,
          dx: 0,
          axis: null,
          movedAny: 0,
        };
        /**
         * ⚠️ CAPTURE ONLY ONCE THE AXIS IS OURS, NOT HERE. Capturing on pointerdown redirects every
         * later event to this element, and on a vertical gesture that is exactly the wrong place for
         * them — it is part of why the deck fought the scroll.
         */
      }}
      onPointerMove={(e) => {
        const s = g.current;
        if (!s.active) return;

        const dx = e.clientX - s.startX;
        const dy = e.clientY - s.startY;
        s.movedAny = Math.max(s.movedAny, Math.abs(dx), Math.abs(dy));

        // ⛔ THE LOCK. Decided once, on the first AXIS_LOCK_PX, and never revisited.
        if (s.axis == null) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) < AXIS_LOCK_PX) return;
          s.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
          if (s.axis === 'x') {
            setDragging(true);
            try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* older webviews */ }
          } else {
            // The page's gesture. The deck stops listening and never moves.
            return;
          }
        }
        if (s.axis !== 'x') return;

        // Velocity, lightly smoothed — a single raw sample at 120 Hz is mostly noise.
        const dt = Math.max(1, e.timeStamp - s.lastT);
        const instant = (e.clientX - s.lastX) / dt;
        s.vx = s.vx === 0 ? instant : s.vx * 0.3 + instant * 0.7;
        s.lastX = e.clientX;
        s.lastT = e.timeStamp;

        s.dx = dx;
        setDragX(dx);
      }}
      onPointerUp={end}
      /**
       * ⛔ `pointercancel` IS THE ONLY ABANDON SIGNAL — NOT `lostpointercapture`.
       *
       * ⚠️ A touch pointer is IMPLICITLY captured to whatever element it went down on (the card),
       * and `setPointerCapture` on this container RETARGETS it — which fires `lostpointercapture` on
       * the card, and that event BUBBLES to here. Handling it aborted the gesture at the exact
       * moment the axis locked to horizontal, so no drag ever turned a card. Caught by the touch
       * harness; a mouse never showed it, because a mouse has no implicit capture to lose.
       */
      onPointerCancel={cancel}
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
            className="absolute text-left w-full galaxy-card readout-texture readout-texture--home"
            style={{
              ...deckGlass(rgb, emphasis),
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
              /**
               * ⛔ A DRAG IS NOT A TAP — ON EITHER AXIS. `movedAny` is the reason the drawer no
               * longer opens when the athlete scrolls the screen with a thumb on a card.
               */
              if (g.current.movedAny > TAP_SLOP_PX) return;
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
export const deckGlass = (rgb: string, emphasis: CardEmphasis = 'lead'): React.CSSProperties => ({
  borderRadius: 18,
  /**
   * ⛔ THE BED MOVED TO THE CARD CLASSES (2026-09-12, Michael: "all cards should have the same
   * texture light and feel — you're just touching load"). This painted
   * `linear-gradient(180deg, rgba(19,21,27,0.90), rgba(11,12,16,0.96))` — effectively opaque black —
   * which is why every session card stayed a black slab through a whole afternoon of lighting work:
   * the light was being applied to the Today screen and this style was covering it, and the load card
   * was the only card on the screen that did NOT come through here.
   * ⛔ SO THE SURFACE IS NOW `galaxy-card readout-texture readout-texture--home`, the same treatment
   * the load card wears, applied at each call site below. One bed, one grid, one light, by
   * construction rather than by two numbers kept in step by hand.
   * ⚠️ EVERY CALLER MUST CARRY THOSE CLASSES. Without them a card has no bed at all and renders
   * fully transparent — there are three call sites and all three were changed with this.
   */
  /**
   * ⛔ THE FIRST SESSION IS THE BIG THING (§3e.2). Everything after it is the same object one step
   * quieter — a thinner edge and no glow — so the eye lands on the session the athlete is about to
   * do rather than on whichever card happens to be brightest.
   * ⚠️ THE EDGE STILL CARRIES THE SPORT COLOUR at `quiet`. Draining it to grey would make a second
   * ride read as disabled; it is not disabled, it is second.
   */
  /**
   * ⛔ NO SPORT OUTLINE (Michael, 2026-09-12: "maybe the outline is too bold, maybe it's no outline
   * like state"). A drawn line in the sport colour makes the card read as a tagged badge; STATE's cards
   * carry no outline at all and are defined by their BED against the ground. The colour does not go
   * away, it moves: the title holds it and the glow below throws it onto the floor, which is the part
   * he said was working. A hairline of neutral white is kept only so the edge stays crisp where the
   * daylight behind is brightest.
   */
  border: 'none',
  boxShadow: emphasis === 'lead'
    ? `0 0 0 1px rgba(255,255,255,0.03) inset, 0 18px 50px rgba(0,0,0,0.55), 0 0 40px rgba(${rgb},0.18)`
    : `0 0 0 1px rgba(255,255,255,0.02) inset, 0 12px 34px rgba(0,0,0,0.5)`,
  backdropFilter: 'blur(12px) saturate(1.05)',
  WebkitBackdropFilter: 'blur(12px) saturate(1.05)',
  /**
   * ⛔ §3e.2's HIERARCHY, WHICH THE SHARED BED HAD FLATTENED (2026-09-12). A thinner edge and no glow
   * stopped being enough once every card wore the same surface: a long lift card simply has more rows
   * than a run card, so the SECOND session was pulling the eye first. A step down in level restores the
   * order without changing a single word or size.
   */
  opacity: emphasis === 'lead' ? 1 : 0.9,
});

export default CardDeck;

/**
 * ⛔ ONE DRAG FOR CARRYING A SESSION TO ANOTHER DAY (2026-09-21) — the calendar week and the "Can't train this day"
 * sheet both use it, so a finger moves a session the same way on both.
 *
 * WHILE CARRYING:
 *   • the page does not scroll and pull-to-refresh does not fire — a document-level, NON-PASSIVE `touchmove` calls
 *     `preventDefault()` (React's own touch listeners are passive and cannot), and the root's overscroll is off;
 *   • a lifted card (shadow, a little larger, the sport colour on its edge) follows the finger up and down;
 *   • the day under the finger is `over` — the screen lights it; the row it came from is `carryingId` — the screen
 *     dims it. The card has no words of its own: the session's name and its line.
 *
 * ⚠️ THE SCREEN DECIDES WHEN A CARRY STARTS (a grip, or a hold) and calls `pickUp`; the drop goes to `onDrop` with the
 * day under the finger, or nothing when the finger lifts off every day. A mouse is carried the same way through
 * pointer events. Nothing here knows what a session is or where it may go.
 */
import React from 'react';
import { createPortal } from 'react-dom';

export type CarryItem = { id: string; name: string; meta?: string; colour: string };

type Carry<T> = {
  item: CarryItem; payload: T; from: string;
  left: number; width: number; height: number; grabY: number; y: number;
};

const NO_SELECT = { userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' } as React.CSSProperties;

/** `#rrggbb` → `rgba(…, a)`; anything else is returned as it is. */
const alpha = (hex: string, a: number): string => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

export function useCarryDrag<T>({ dayAttr, onDrop }: {
  /** The attribute every day row carries, holding its date — `data-day` on the calendar. */
  dayAttr: string;
  onDrop: (payload: T, from: string, to: string) => void;
}) {
  const [carry, setCarry] = React.useState<Carry<T> | null>(null);
  const [over, setOver] = React.useState<string | null>(null);
  const ref = React.useRef<{ carry: Carry<T>; over: string | null } | null>(null);
  const dropRef = React.useRef(onDrop);
  dropRef.current = onDrop;

  /** Start carrying: `el` is the row being lifted, `fingerY` where the finger (or mouse) is on it. */
  const pickUp = React.useCallback((el: HTMLElement | null, fingerY: number, item: CarryItem, payload: T, from: string) => {
    if (!el) return;
    const r = el.getBoundingClientRect();
    const c: Carry<T> = { item, payload, from, left: r.left, width: r.width, height: r.height, grabY: fingerY - r.top, y: fingerY };
    ref.current = { carry: c, over: null };
    setCarry(c);
    setOver(null);
  }, []);

  const cancel = React.useCallback(() => {
    ref.current = null;
    setCarry(null);
    setOver(null);
  }, []);

  const carrying = carry != null;
  React.useEffect(() => {
    if (!carrying) return;
    const move = (x: number, y: number) => {
      const cur = ref.current;
      if (!cur) return;
      setCarry((c) => (c ? { ...c, y } : c));
      const day = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest(`[${dayAttr}]`)?.getAttribute(dayAttr) ?? null;
      if (day !== cur.over) { cur.over = day; setOver(day); }
    };
    const drop = () => {
      const cur = ref.current;
      ref.current = null;
      setCarry(null);
      setOver(null);
      if (cur?.over) dropRef.current(cur.carry.payload, cur.carry.from, cur.over);
    };
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      e.preventDefault();
      move(t.clientX, t.clientY);
    };
    const onPointerMove = (e: PointerEvent) => { if (e.pointerType === 'mouse') move(e.clientX, e.clientY); };
    const onPointerUp = (e: PointerEvent) => { if (e.pointerType === 'mouse') drop(); };
    // ⚠️ THE ROOT'S OVERSCROLL IS OFF WHILE CARRYING, and restored exactly as it was.
    const root = document.documentElement;
    const before = root.style.overscrollBehavior;
    root.style.overscrollBehavior = 'none';
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', drop);
    document.addEventListener('touchcancel', cancel);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    return () => {
      root.style.overscrollBehavior = before;
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', drop);
      document.removeEventListener('touchcancel', cancel);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
    };
  }, [carrying, dayAttr, cancel]);

  /** The lifted card — render it once, anywhere; it portals to the body and never takes the finger's events. */
  const card = carry ? createPortal(
    <div
      aria-hidden="true"
      className="fixed z-[70] grid items-center gap-2.5 text-[15px] rounded-[10px]"
      style={{
        left: carry.left, width: carry.width, top: carry.y - carry.grabY, minHeight: carry.height,
        gridTemplateColumns: '10px minmax(0,1fr) auto', padding: '6px 10px',
        background: 'rgba(28,28,30,0.97)', borderLeft: `3px solid ${carry.item.colour}`,
        boxShadow: `0 14px 32px rgba(0,0,0,0.55), 0 0 0 1px ${alpha(carry.item.colour, 0.35)}`,
        transform: 'scale(1.04)', transformOrigin: 'center', pointerEvents: 'none', ...NO_SELECT,
      }}
    >
      <span className="inline-block rounded-full" style={{ width: 8, height: 8, background: carry.item.colour, boxShadow: `0 0 8px ${carry.item.colour}` }} />
      <span className="truncate" style={{ color: 'rgba(242,240,236,1)' }}>{carry.item.name}</span>
      <span className="text-[14px] tabular-nums" style={{ color: 'rgba(242,240,236,0.62)' }}>{carry.item.meta ?? ''}</span>
    </div>,
    document.body,
  ) : null;

  /** The highlight for the day under the finger, in the carried session's colour. */
  const overStyle = (day: string): React.CSSProperties | undefined => (carry && over === day
    ? { background: `linear-gradient(90deg, ${alpha(carry.item.colour, 0.18)}, ${alpha(carry.item.colour, 0.06)})`, boxShadow: `inset 0 0 0 1px ${alpha(carry.item.colour, 0.55)}` }
    : undefined);

  return { carryingId: carry?.item.id ?? null, over, pickUp, cancel, card, overStyle, isCarrying: () => ref.current != null };
}

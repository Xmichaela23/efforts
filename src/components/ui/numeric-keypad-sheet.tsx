import * as React from "react";
import { cn } from "@/lib/utils";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";

/**
 * ⛔ A NUMBER KEYBOARD, NOT A SHEET (2026-09-24, WORKORDER-logger-set-entry §1 as ruled mid-build). A panel of
 * keyboard height anchored to the bottom: the digits, the decimal on a weight box, backspace, Next, and on a
 * bar-loaded weight box the plate calculator — Strong's own number keyboard. The box in the row is the display:
 * the number the athlete types appears in the row's own cell, so there is no title, no display line, no Clear,
 * no Save row and no Close row. `hint` is the one line above the keys (the check's "add the rep count", the
 * assist box's "leave blank if none").
 *
 * FIELD — Strong help, "Plate Calculator" (https://help.strongapp.io/article/169-plate-calculator): the
 * "plate calculator button on the right hand side of the keyboard"; Strong's App Store release notes: the Next
 * key; Hevy help, "How to use the plate calculator" (hevyapp.com/help/how-to-use-the-plate-calculator): the
 * calculator button above the phone keyboard. Hevy types on the phone keyboard with a thin bar above it; Strong
 * draws its own, and this is Strong's shape.
 *
 * ⚠️ NOT MODAL (2026-09-10, Michael: the chevron beside Swap took two taps on the phone). With the keypad open,
 * the drawer's overlay ate the first tap on anything behind it. Non-modal, Vaul draws no overlay and leaves the
 * page's pointer events alone; the tap outside closes the keypad without saving (Vaul hands the outside press to
 * `onPointerDownOutside` and then stops its own close, so it is closed here) AND lands where the athlete aimed
 * it — tap another cell, the keypad follows. Drag-down closes without saving too.
 */
type Props = {
  open: boolean;
  /** The accessible name only (sr-only) — nothing is printed above the keys but `hint`. */
  title: string;
  value: string;
  onChange: (next: string) => void;
  onOpenChange: (open: boolean) => void;
  /** Next: commit this box; the caller opens the row's next box or closes. */
  onConfirm: (value: string) => void;
  allowDecimal?: boolean;
  hint?: string;
  /** Changes when the box being edited changes, so the first digit replaces the box's current number again. */
  editKey?: string;
  /** The plate calculator key (right column), given only on a weight box whose bar is the load. */
  plates?: { open: boolean; onToggle: () => void } | null;
};

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export function NumericKeypadSheet({
  open,
  title,
  value,
  onChange,
  onOpenChange,
  onConfirm,
  allowDecimal = false,
  hint,
  editKey,
  plates,
}: Props) {
  // When a box opens, treat the first digit press as "replace" (faster than append).
  const replaceArmedRef = React.useRef(true);
  const liveValueRef = React.useRef<string>(value);
  React.useEffect(() => {
    if (open) replaceArmedRef.current = true;
  }, [open, editKey]);
  React.useEffect(() => {
    liveValueRef.current = value;
  }, [value]);

  const append = React.useCallback(
    (k: string) => {
      const current = liveValueRef.current;
      const shouldReplace = replaceArmedRef.current && current.length > 0;
      if (k === ".") {
        if (!allowDecimal) return;
        if (!shouldReplace && current.includes(".")) return;
        if (shouldReplace || current.length === 0) liveValueRef.current = "0.";
        else liveValueRef.current = `${current}.`;
        onChange(liveValueRef.current);
        replaceArmedRef.current = false;
        return;
      }
      if (k === "0") {
        if (shouldReplace) {
          liveValueRef.current = "0";
          onChange(liveValueRef.current);
        } else {
          if (current === "0") return;
          liveValueRef.current = current.length === 0 ? "0" : `${current}0`;
          onChange(liveValueRef.current);
        }
        replaceArmedRef.current = false;
        return;
      }
      // digits 1-9
      if (shouldReplace || current === "0") liveValueRef.current = k;
      else liveValueRef.current = `${current}${k}`;
      onChange(liveValueRef.current);
      replaceArmedRef.current = false;
    },
    [allowDecimal, onChange]
  );

  const backspace = React.useCallback(() => {
    const current = liveValueRef.current;
    if (!current) return;
    liveValueRef.current = current.slice(0, -1);
    onChange(liveValueRef.current);
    replaceArmedRef.current = false;
  }, [onChange]);

  // One key, one look: 48 px tall (the iOS keyboard's key row is 46 pt), four columns.
  const keyCls = "h-12 rounded-xl border border-white/15 bg-white/[0.06] text-white/95 text-xl font-medium tabular-nums active:bg-white/[0.12] select-none";
  const sideCls = "h-12 rounded-xl border border-white/15 bg-white/[0.04] text-white/85 active:bg-white/[0.10] select-none";

  return (
    <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false} modal={false}>
      <DrawerContent
        handle={false}
        data-keypad-panel=""
        className="bg-black/95 border-white/15 rounded-t-2xl"
        onPointerDownOutside={() => onOpenChange(false)}
        aria-describedby={undefined}
      >
        <DrawerTitle className="sr-only">{title}</DrawerTitle>
        <div className="px-2 pt-2" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)" }}>
          {hint ? <div className="px-1 pb-1.5 text-xs text-white/55 leading-snug">{hint}</div> : null}
          {/* Strong's layout: digits on the left, the action keys down the right — backspace, plates, Next. */}
          <div className="grid grid-cols-4 grid-rows-4 gap-1.5">
            {DIGITS.map((k, i) => (
              <React.Fragment key={k}>
                <button type="button" onClick={() => append(k)} className={keyCls}>{k}</button>
                {i === 2 && (
                  <button type="button" onClick={backspace} className={sideCls} aria-label="Backspace">
                    ⌫
                  </button>
                )}
                {i === 5 && (plates ? (
                  <button
                    type="button"
                    onClick={plates.onToggle}
                    className={cn(sideCls, "text-sm font-medium", plates.open && "border-white/40 bg-white/[0.12]")}
                    aria-pressed={plates.open}
                  >
                    plates
                  </button>
                ) : <span aria-hidden="true" />)}
                {i === 8 && (
                  <button
                    type="button"
                    onClick={() => onConfirm(liveValueRef.current)}
                    className={cn(sideCls, "row-span-2 h-auto border-white/30 bg-white/[0.12] text-white text-base font-medium tracking-wide active:bg-white/[0.18]")}
                  >
                    Next
                  </button>
                )}
              </React.Fragment>
            ))}
            {/* bottom row: the decimal (weight only), 0, an empty key; Next fills the right column from the row above */}
            {allowDecimal
              ? <button type="button" onClick={() => append(".")} className={keyCls}>.</button>
              : <span aria-hidden="true" />}
            <button type="button" onClick={() => append("0")} className={keyCls}>0</button>
            <span aria-hidden="true" />
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

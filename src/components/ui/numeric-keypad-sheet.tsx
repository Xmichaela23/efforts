import * as React from "react";
import { cn } from "@/lib/utils";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  title: string;
  value: string;
  onChange: (next: string) => void;
  onOpenChange: (open: boolean) => void;
  onConfirm: (value: string) => void;
  confirmLabel?: string;
  secondaryLabel?: string;
  onSecondary?: () => void;
  allowDecimal?: boolean;
  hint?: string;
};

const keysDefault = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export function NumericKeypadSheet({
  open,
  title,
  value,
  onChange,
  onOpenChange,
  onConfirm,
  confirmLabel = "Save",
  secondaryLabel,
  onSecondary,
  allowDecimal = false,
  hint,
}: Props) {
  // When the sheet opens, treat the first digit press as "replace" (faster than append).
  const replaceArmedRef = React.useRef(true);
  const liveValueRef = React.useRef<string>(value);
  React.useEffect(() => {
    if (open) replaceArmedRef.current = true;
  }, [open, title]);
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
  }, [onChange]);

  const clear = React.useCallback(() => {
    liveValueRef.current = "";
    onChange(liveValueRef.current);
  }, [onChange]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerContent className="bg-black/95 border-white/15">
        <DrawerHeader className="pt-3 pb-2">
          <DrawerTitle className="text-white/90 font-light">{title}</DrawerTitle>
          {hint ? <div className="text-xs text-white/55 mt-1">{hint}</div> : null}
        </DrawerHeader>

        <div className="px-4 pb-4">
          <div
            className={cn(
              "w-full rounded-2xl border border-white/15 bg-white/[0.06] backdrop-blur-[3px]",
              "px-4 py-3 flex items-center justify-between"
            )}
          >
            <div className="text-2xl tabular-nums text-white/95 tracking-wide">
              {value.length ? value : "—"}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={clear}
                className="min-h-[44px] px-3 rounded-xl border border-white/15 bg-white/[0.05] text-white/75 hover:bg-white/[0.08]"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={backspace}
                className="min-h-[44px] px-4 rounded-xl border border-white/15 bg-white/[0.05] text-white/85 hover:bg-white/[0.08]"
                aria-label="Backspace"
              >
                ⌫
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            {keysDefault.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => append(k)}
                className="min-h-[54px] rounded-2xl border border-white/15 bg-white/[0.06] text-white/95 text-xl font-medium active:bg-white/[0.10]"
              >
                {k}
              </button>
            ))}

            {/* bottom row: decimal (optional), 0, confirm */}
            <button
              type="button"
              onClick={() => append(".")}
              disabled={!allowDecimal}
              className={cn(
                "min-h-[54px] rounded-2xl border border-white/15 bg-white/[0.06] text-white/95 text-xl font-medium",
                !allowDecimal && "opacity-35"
              )}
            >
              .
            </button>
            <button
              type="button"
              onClick={() => append("0")}
              className="min-h-[54px] rounded-2xl border border-white/15 bg-white/[0.06] text-white/95 text-xl font-medium active:bg-white/[0.10]"
            >
              0
            </button>
            <button
              type="button"
                          onClick={() => onConfirm(liveValueRef.current)}
              className="min-h-[54px] rounded-2xl border border-white/25 bg-white/[0.10] text-white text-sm font-medium tracking-wide active:bg-white/[0.14]"
            >
              {confirmLabel}
            </button>
          </div>

          {/* Footer actions */}
          <div className="mt-3 flex gap-3">
            {secondaryLabel && onSecondary ? (
              <Button
                type="button"
                variant="ghost"
                className="flex-1 min-h-[44px] rounded-2xl bg-white/[0.05] hover:bg-white/[0.08] text-white/80"
                onClick={onSecondary}
              >
                {secondaryLabel}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              className="flex-1 min-h-[44px] rounded-2xl bg-white/[0.05] hover:bg-white/[0.08] text-white/80"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}


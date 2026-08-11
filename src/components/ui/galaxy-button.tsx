import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

/**
 * GalaxyButton — the ONE button/chip shape for the app.
 *
 * Why this exists: button radii were set ad-hoc per element and drifted
 * (Home rounded-xl, nav rounded-2xl, logger rounded-full). Route every
 * tappable action through this so shape + state can't drift again.
 *
 * The rules it encodes (UX: an action reads the same everywhere):
 *  - SHAPE is fixed: buttons are rounded-xl, chips are rounded-full.
 *    Shape is NOT a per-screen choice.
 *  - VARIANT communicates hierarchy, uniformly:
 *      primary   = the one main action (brightest fill/border)
 *      secondary = standard action (default)
 *      ghost     = tertiary / dismiss (text-only until hover)
 *      danger    = destructive
 *  - Digital-galaxy treatment (dark instrument, white-alpha fills) is baked
 *    in — this is about shape + state, not recolor.
 *
 * Leave alone (do NOT route through this): true circles (FAB, numeric
 * steppers, close-X), progress bars, and the nav tab-bar (its own
 * rounded-2xl container tier).
 */

type GalaxyVariant = "primary" | "secondary" | "ghost" | "danger";
type GalaxySize = "sm" | "md" | "lg";
type GalaxyShape = "button" | "chip";

const BASE =
  "inline-flex items-center justify-center gap-2 font-medium tracking-wide text-white " +
  "transition-all duration-200 backdrop-blur-md select-none " +
  "focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 " +
  "active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none disabled:active:scale-100";

const VARIANTS: Record<GalaxyVariant, string> = {
  // The single main action — clearly the brightest thing on the surface.
  primary:
    "bg-white/[0.10] border border-white/30 hover:bg-white/[0.15] hover:border-white/45",
  // Standard action — the app-wide default weight (matches Home today).
  secondary:
    "bg-white/[0.04] border border-white/15 text-white/85 hover:bg-white/[0.08] hover:text-white",
  // Tertiary / dismiss — recedes until you reach for it.
  ghost:
    "bg-transparent border border-transparent text-white/55 hover:bg-white/[0.06] hover:text-white/85",
  // Destructive — carries red only on intent/hover, never shouty at rest.
  danger:
    "bg-white/[0.04] border border-red-400/30 text-red-300/90 hover:bg-red-400/10 hover:border-red-400/50 hover:text-red-300",
};

// Button sizes (rounded-xl). Chips ignore these and use their own compact pad.
const SIZES: Record<GalaxySize, string> = {
  sm: "px-3 py-2 text-[13px]",
  md: "px-4 py-2.5 text-sm",
  lg: "px-4 py-3 text-[15px]",
};

const SHAPES: Record<GalaxyShape, string> = {
  button: "rounded-xl",
  chip: "rounded-full px-3 py-1.5 text-[13px]",
};

export interface GalaxyButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: GalaxyVariant;
  size?: GalaxySize;
  shape?: GalaxyShape;
  /** Stretch to fill its container (common for stacked CTAs). */
  fullWidth?: boolean;
  /** Render as the child element (e.g. an <a>) instead of a <button>. */
  asChild?: boolean;
}

/**
 * The app's canonical tappable-action primitive.
 * <GalaxyButton>Save</GalaxyButton>
 * <GalaxyButton variant="primary" size="lg" fullWidth>Start session</GalaxyButton>
 * <GalaxyButton shape="chip" variant={active ? "primary" : "secondary"}>Warm-up</GalaxyButton>
 */
export const GalaxyButton = React.forwardRef<
  HTMLButtonElement,
  GalaxyButtonProps
>(
  (
    {
      className,
      variant = "secondary",
      size = "md",
      shape = "button",
      fullWidth = false,
      asChild = false,
      type,
      ...props
    },
    ref
  ) => {
    const Comp: any = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : type ?? "button"}
        className={cn(
          BASE,
          SHAPES[shape],
          VARIANTS[variant],
          shape === "button" && SIZES[size],
          fullWidth && "w-full",
          className
        )}
        {...props}
      />
    );
  }
);
GalaxyButton.displayName = "GalaxyButton";

export default GalaxyButton;

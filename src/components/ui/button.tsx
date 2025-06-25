import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-black text-white hover:bg-black border-none",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-black bg-white text-black hover:bg-black hover:text-white",
        secondary:
          "bg-white text-black border border-black hover:bg-black hover:text-white",
        ghost: "bg-white text-black hover:bg-black hover:text-white",
        link: "text-black underline-offset-4 hover:underline",
        toggle: "bg-white text-black border border-black hover:bg-black hover:text-white",
        "toggle-active": "bg-black text-white border border-black",
      },
      size: {
        default: "px-6 py-3",
        sm: "px-3 py-2 text-xs",
        lg: "px-8 py-4",
        icon: "h-9 w-9",
        effort: "px-6 py-3",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        style={{ 
          borderRadius: 0, 
          boxShadow: 'none', 
          fontFamily: 'Inter, sans-serif', 
          fontWeight: 500,
          letterSpacing: '0.02em',
          padding: size === 'effort' ? '12px 24px' : undefined
        }}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
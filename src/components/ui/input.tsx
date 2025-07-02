import * as React from "react"

import { cn } from "@/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full border border-gray-300 bg-white px-4 py-3 text-sm text-black placeholder:text-muted-foreground focus:border-black focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        style={{ 
          fontFamily: 'Inter, sans-serif', 
          letterSpacing: '0.02em' 
        }}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
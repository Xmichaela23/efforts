import * as React from "react"

import { cn } from "@/lib/utils"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[60px] w-full border border-[#E5E5E5] bg-white px-4 py-3 text-sm text-black placeholder:text-[#999999] focus:border-black focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        style={{ 
          borderRadius: 0, 
          boxShadow: 'none', 
          fontFamily: 'Inter, sans-serif', 
          letterSpacing: '0.02em' 
        }}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
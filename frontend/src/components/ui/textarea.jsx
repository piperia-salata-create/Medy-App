import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[60px] w-full rounded-md border border-pharma-slate-grey/35 bg-white px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:border-pharma-teal/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pharma-teal/30 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      ref={ref}
      {...props} />
  );
})
Textarea.displayName = "Textarea"

export { Textarea }

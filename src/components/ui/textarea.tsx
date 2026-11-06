import * as React from "react";

import { cn, focusRing } from "@/lib/utils";

// Minimum height is 104 px (26 x 4 px).
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-26 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-base text-foreground",
        "placeholder:text-muted-foreground",
        "transition-[box-shadow,border-color] duration-120 ease-standard motion-reduce:transition-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-danger aria-invalid:border-2",
        focusRing,
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };

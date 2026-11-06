import * as React from "react";

import { cn } from "@/lib/utils";

// Loading placeholder. It stops pulsing when the user asks for less motion.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-muted motion-reduce:animate-none", className)}
      {...props}
    />
  );
}

export { Skeleton };

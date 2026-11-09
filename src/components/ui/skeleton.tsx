import * as React from "react";

import { cn } from "@/lib/utils";

// Loading placeholder.
// - It is invisible for the first 200 ms (animate-skeleton), so a fast page never flashes gray.
// - A soft light band moves across it (shimmer). With "reduce motion" there is no shimmer: the block is a
//   plain color that only fades in.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(
        "animate-skeleton rounded-md bg-muted bg-[linear-gradient(90deg,var(--color-muted)_0%,color-mix(in_oklab,var(--color-muted),var(--color-background)_65%)_50%,var(--color-muted)_100%)] bg-[length:200%_100%] motion-reduce:animate-delayed-in motion-reduce:bg-none",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };

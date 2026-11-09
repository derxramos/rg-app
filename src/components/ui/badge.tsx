import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Text on a soft background always uses the matching "-ink" color (WCAG AA).
// The ONE pill for the whole app (status, role, tier, Required / Optional ...). It never leaves its parent:
// max-w-full caps its width, and a long label wraps onto a second line instead of sticking out. The icon stays
// level with the first line. A short label stays on one line because the pill is only as wide as its content.
const badgeVariants = cva(
  "inline-flex w-fit max-w-full min-w-0 items-start gap-1.5 rounded-full px-3 py-1 text-sm leading-5 font-bold [overflow-wrap:anywhere] [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        neutral: "bg-muted text-foreground",
        primary: "bg-primary-soft text-primary-ink",
        accent: "bg-brand-accent-soft text-brand-accent-ink",
        success: "bg-success-soft text-success-ink",
        warning: "bg-warning-soft text-warning-ink",
        danger: "bg-danger-soft text-danger-ink",
        info: "bg-info-soft text-info-ink",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Text on a soft background always uses the matching "-ink" color (WCAG AA).
// A badge never wraps its own text. Put badges in a row that can wrap (flex-wrap).
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-sm font-bold [&_svg]:size-4 [&_svg]:shrink-0",
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

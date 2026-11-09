import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Card: rounded-lg, border, shadow-sm, padding 20 px on phone and 24 px from md.
// min-w-0 lets a card shrink inside a grid or a flex row, and overflow-wrap:anywhere lets a very long word
// (a long email, a long name) break instead of pushing out of the card.
const cardVariants = cva(
  "flex min-w-0 flex-col gap-4 rounded-lg border p-5 text-card-foreground shadow-sm [overflow-wrap:anywhere] md:p-6",
  {
    variants: {
      tint: {
        none: "bg-card",
        subtle: "bg-surface-subtle",
        primary: "bg-primary-soft text-primary-ink",
        accent: "bg-brand-accent-soft text-brand-accent-ink",
      },
    },
    defaultVariants: { tint: "none" },
  },
);

function Card({
  className,
  tint,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  return <div data-slot="card" className={cn(cardVariants({ tint }), className)} {...props} />;
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-header" className={cn("flex flex-col gap-1", className)} {...props} />
  );
}

// "as" lets a page keep a correct heading order (h1, then h2, then h3).
function CardTitle({
  className,
  as: Tag = "h3",
  ...props
}: React.ComponentProps<"h3"> & { as?: "h2" | "h3" | "h4" }) {
  return <Tag data-slot="card-title" className={cn("text-lg font-bold", className)} {...props} />;
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-content" className={cn("flex flex-col gap-3", className)} {...props} />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex flex-wrap items-center gap-3", className)}
      {...props}
    />
  );
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, cardVariants };

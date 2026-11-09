import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import { Slot } from "radix-ui";

import { cn, focusRing } from "@/lib/utils";

// Sizes: sm is 44 px on phone and 40 px from md. md is 44 px. lg is 52 px.
const buttonVariants = cva(
  [
    "inline-flex max-w-full shrink-0 items-center justify-center gap-2 rounded-md text-center font-bold",
    "transition-[background-color,box-shadow,filter] duration-120 ease-standard motion-reduce:transition-none",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
    focusRing,
  ],
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        secondary: "bg-secondary text-secondary-foreground hover:brightness-95",
        outline: "border border-input bg-background text-foreground hover:bg-accent",
        ghost: "text-foreground hover:bg-accent",
        destructive: "bg-destructive text-destructive-foreground hover:brightness-90",
        // The one orange button style. Colors are tokens (globals.css). Weight 600. Focus ring comes from focusRing.
        accent: "bg-cta text-on-cta font-semibold hover:bg-cta-hover",
      },
      size: {
        sm: "min-h-11 px-4 py-2 text-sm md:min-h-10 md:py-1.5",
        md: "min-h-11 px-5 py-2 text-base",
        lg: "min-h-13 px-6 py-3 text-base",
        icon: "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    // Shows a spinner and blocks clicks while work is running.
    loading?: boolean;
  };

function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  type,
  ...props
}: ButtonProps) {
  if (asChild) {
    return (
      <Slot.Root
        data-slot="button"
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      >
        {children}
      </Slot.Root>
    );
  }

  return (
    <button
      data-slot="button"
      type={type ?? "button"}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {loading ? (
        <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
      ) : null}
      {children}
    </button>
  );
}

export { Button, buttonVariants };
export type { ButtonProps };

"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";

import { cn, focusRing } from "@/lib/utils";

// The box is 24 px. Put it inside CheckboxRow so the whole row is at least 44 px tall.
function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer flex size-6 shrink-0 items-center justify-center rounded-sm border-2 border-input bg-background text-primary-foreground",
        "transition-[background-color,box-shadow] duration-120 ease-standard motion-reduce:transition-none",
        "data-[state=checked]:border-primary data-[state=checked]:bg-primary",
        "disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger",
        focusRing,
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        <Check aria-hidden="true" className="size-4" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

// A full row: box on the left, text on the right. The text wraps and is part of the tap target.
function CheckboxRow({
  className,
  children,
  htmlFor,
}: {
  className?: string;
  children: React.ReactNode;
  htmlFor: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn("flex min-h-11 cursor-pointer items-start gap-3 py-2.5 text-base", className)}
    >
      {children}
    </label>
  );
}

export { Checkbox, CheckboxRow };

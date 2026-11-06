"use client";

import * as React from "react";
import { Switch as SwitchPrimitive } from "radix-ui";

import { cn, focusRing } from "@/lib/utils";

// Track is 44 x 24 px. Put it inside a row that is at least 44 px tall.
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent",
        "bg-input data-[state=checked]:bg-primary",
        "transition-[background-color,box-shadow] duration-120 ease-standard motion-reduce:transition-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        focusRing,
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block size-5 rounded-full bg-background shadow-sm",
          "transition-transform duration-120 ease-standard motion-reduce:transition-none",
          "data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };

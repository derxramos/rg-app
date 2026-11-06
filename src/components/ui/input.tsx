import * as React from "react";

import { cn, focusRing } from "@/lib/utils";

// 44 px tall, 16 px text. 16 px stops iPhones from zooming the page when the field is focused.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-base text-foreground",
        "placeholder:text-muted-foreground",
        "file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-bold file:text-foreground",
        "transition-[box-shadow,border-color] duration-120 ease-standard motion-reduce:transition-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-2 aria-invalid:border-danger",
        focusRing,
        className,
      )}
      {...props}
    />
  );
}

// An input with fixed text in front of it, for example "+63" (phone) or "₱" (money).
// The ring shows around the whole box when the inner input has focus.
function InputWithPrefix({
  prefix,
  className,
  invalid,
  ...props
}: Omit<React.ComponentProps<"input">, "prefix"> & {
  prefix: React.ReactNode;
  invalid?: boolean;
}) {
  return (
    <div
      data-slot="input-with-prefix"
      className={cn(
        "flex min-h-11 w-full min-w-0 items-stretch overflow-hidden rounded-md border border-input bg-background",
        "has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring has-[input:focus-visible]:ring-offset-2 has-[input:focus-visible]:ring-offset-background",
        invalid && "border-2 border-danger",
        className,
      )}
    >
      <span className="flex items-center border-r bg-muted px-3 text-base font-bold text-foreground">
        {prefix}
      </span>
      <input
        aria-invalid={invalid || undefined}
        className="min-w-0 flex-1 bg-transparent px-3 py-2 text-base text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
        {...props}
      />
    </div>
  );
}

export { Input, InputWithPrefix };

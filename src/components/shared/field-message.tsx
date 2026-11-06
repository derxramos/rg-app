import { CircleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

// Error line under a field: icon + words, so the error is never shown by color alone.
// Connect it to the field with aria-describedby.
export function FieldError({
  id,
  children,
  className,
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      id={id}
      className={cn("flex items-start gap-2 text-sm font-bold text-danger-ink", className)}
    >
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

// Help text under a field.
export function FieldHint({
  id,
  children,
  className,
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p id={id} className={cn("text-sm text-muted-foreground", className)}>
      {children}
    </p>
  );
}

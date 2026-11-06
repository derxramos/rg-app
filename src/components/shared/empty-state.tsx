import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  // An optional action, for example a Button.
  children?: React.ReactNode;
  className?: string;
};

// Icon + words + optional action. The icon is decoration only; the words carry the meaning.
export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-dashed bg-surface-subtle px-5 py-10 text-center",
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary-ink">
        <Icon aria-hidden="true" className="size-6" />
      </span>
      <h3 className="text-lg font-bold">{title}</h3>
      {description ? (
        <p className="max-w-prose text-base text-muted-foreground">{description}</p>
      ) : null}
      {children ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}

import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  // An optional action, for example a Button.
  children?: React.ReactNode;
  className?: string;
  // Use h2 when the page has only an h1 above, so the heading order stays correct.
  headingTag?: "h2" | "h3";
};

// Icon + words + optional action. The icon is decoration only; the words carry the meaning.
export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  className,
  headingTag: Heading = "h3",
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
      <Heading className="text-lg font-bold">{title}</Heading>
      {description ? (
        <p className="max-w-prose text-base text-muted-foreground">{description}</p>
      ) : null}
      {children ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}

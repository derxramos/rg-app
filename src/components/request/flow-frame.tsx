import { Stepper } from "@/components/shared/stepper";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// The common frame of the request pages: a narrow column (640 px), the 5 step bar and one heading.
// wide=true is for the receipt step (900 px).
export function FlowFrame({
  step,
  requestId,
  title,
  intro,
  wide = false,
  children,
}: {
  // Leave out for a visitor who came from the tracking page (no steps to show).
  step?: number;
  // With the request id, the steps already passed become links (go back and change something).
  requestId?: string;
  title: string;
  intro?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-col gap-6 px-5 py-8 md:py-12",
        wide ? "max-w-[900px]" : "max-w-[640px]",
      )}
    >
      {step ? <Stepper current={step} requestId={requestId} /> : null}
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-primary-ink md:text-3xl">{title}</h1>
        {intro ? <p className="text-lg text-muted-foreground">{intro}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function FlowSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="mx-auto flex w-full max-w-[640px] flex-col gap-4 px-5 py-8"
    >
      {/* The same shape as a real step: the step bar, the heading, one line of help, then the form card. */}
      <Skeleton className="h-6 w-full" />
      <Skeleton className="h-9 w-2/3" />
      <Skeleton className="h-6 w-5/6" />
      <Skeleton className="h-56 w-full rounded-lg" />
      <Skeleton className="h-11 w-40" />
    </div>
  );
}

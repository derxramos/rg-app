import { Stepper } from "@/components/shared/stepper";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// The common frame of the request pages: a narrow column (640 px), the 5 step bar and one heading.
// wide=true is for the receipt step (900 px).
export function FlowFrame({
  step,
  title,
  intro,
  wide = false,
  children,
}: {
  step: number;
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
      <Stepper current={step} />
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
      <Skeleton className="h-6 w-full" />
      <Skeleton className="h-9 w-2/3" />
      <Skeleton className="h-40 w-full rounded-lg" />
    </div>
  );
}

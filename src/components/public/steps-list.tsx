import { HOW_IT_WORKS_STEPS } from "@/content/how-it-works";
import { cn } from "@/lib/utils";

// The 5 steps as a numbered list. "compact" is the short version for the home page.
export function StepsList({
  compact = false,
  headingTag: Heading = "h3",
}: {
  compact?: boolean;
  headingTag?: "h2" | "h3";
}) {
  return (
    <ol className={cn("grid gap-4", compact ? "md:grid-cols-5" : "max-w-3xl")}>
      {HOW_IT_WORKS_STEPS.map((step, index) => {
        const Icon = step.icon;
        return (
          <li
            key={step.title}
            className={cn(
              "flex gap-4 rounded-lg border bg-card p-5 shadow-sm",
              compact ? "items-center md:flex-col md:items-start md:p-4" : "items-start md:p-6",
            )}
          >
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-ink">
              <Icon aria-hidden="true" className="size-6" />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <Heading className="text-lg font-bold">
                <span className="text-muted-foreground">{index + 1}. </span>
                {step.title}
              </Heading>
              {compact ? null : <p className="text-base">{step.text}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

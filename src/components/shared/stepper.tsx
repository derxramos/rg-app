import { Check } from "lucide-react";
import Link from "next/link";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

// The 5 steps of the request flow (docs/FEATURES.md P7 to P11).
export const REQUEST_STEPS = ["Your details", "Documents", "Payment", "Receipt", "Review"] as const;

// Where each step lives. A client may go back to any step they already passed (while the request is a draft).
export function stepHref(requestId: string, number: number): string | null {
  const id = encodeURIComponent(requestId);
  switch (number) {
    case 1:
      return `/request/${id}/details`;
    case 2:
      return `/request/${id}/documents`;
    case 3:
    case 4:
      // The receipt step needs a chosen payment method, so it is reached from the payment page.
      return `/request/${id}/payment`;
    default:
      return null;
  }
}

type StepperProps = {
  // Which step the client is on. 1 is the first step.
  current: number;
  steps?: readonly string[];
  className?: string;
  // Give the request id to make the steps already passed into links (go back and change something).
  requestId?: string;
};

// Under 640 px: one line of words, a thin bar and a "go back" link. From 640 px: all steps in a row.
export function Stepper({ current, steps = REQUEST_STEPS, className, requestId }: StepperProps) {
  const total = steps.length;
  const safeCurrent = Math.min(Math.max(Math.round(current), 1), total);
  const backHref = requestId && safeCurrent > 1 ? stepHref(requestId, safeCurrent - 1) : null;

  return (
    <nav aria-label="Request steps" className={cn("w-full", className)}>
      <div className="flex flex-col gap-2 sm:hidden">
        <p className="text-base font-bold">
          Step {safeCurrent} of {total}: {steps[safeCurrent - 1]}
        </p>
        <Progress
          value={(safeCurrent / total) * 100}
          aria-label={`Step ${safeCurrent} of ${total}`}
        />
        {backHref ? (
          <Link
            href={backHref}
            className="inline-flex min-h-11 items-center text-base font-bold text-primary underline"
          >
            Go back to: {steps[safeCurrent - 2]}
          </Link>
        ) : null}
      </div>

      <ol className="hidden items-start gap-2 sm:flex">
        {steps.map((label, index) => {
          const number = index + 1;
          const state =
            number < safeCurrent ? "done" : number === safeCurrent ? "current" : "upcoming";
          const href = requestId && state === "done" ? stepHref(requestId, number) : null;
          const body = (
            <span className="flex items-start gap-2">
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold",
                  state === "done" && "border-primary bg-primary text-primary-foreground",
                  state === "current" && "border-primary bg-primary-soft text-primary-ink",
                  state === "upcoming" && "border-input bg-background text-muted-foreground",
                )}
              >
                {state === "done" ? <Check className="size-4" strokeWidth={3} /> : number}
              </span>
              <span
                className={cn(
                  "min-w-0 pt-0.5 text-sm",
                  state === "current" ? "font-bold text-foreground" : "text-muted-foreground",
                  href && "text-primary underline",
                )}
              >
                {label}
                <span className="sr-only">
                  {state === "done" ? " (done)" : state === "current" ? " (current step)" : ""}
                </span>
              </span>
            </span>
          );
          return (
            <li
              key={label}
              aria-current={state === "current" ? "step" : undefined}
              className="flex min-w-0 flex-1 flex-col gap-2"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "h-1 w-full rounded-full",
                  state === "upcoming" ? "bg-muted" : "bg-primary",
                )}
              />
              {href ? (
                <Link href={href} className="rounded-md hover:opacity-80">
                  {body}
                </Link>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

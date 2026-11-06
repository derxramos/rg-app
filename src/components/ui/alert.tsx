import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

// Warning box. Variants: info, warning, danger, success.
// "strong" is for payment checks: thicker border, bigger text, and it can never be closed.
const alertVariants = cva("flex w-full gap-3 rounded-lg border p-4 text-base", {
  variants: {
    variant: {
      info: "border-info bg-info-soft text-info-ink",
      warning: "border-warning bg-warning-soft text-warning-ink",
      danger: "border-danger bg-danger-soft text-danger-ink",
      success: "border-success bg-success-soft text-success-ink",
    },
    strong: {
      true: "border-2 p-5",
      false: "",
    },
  },
  defaultVariants: { variant: "info", strong: false },
});

const ICONS = {
  info: Info,
  warning: TriangleAlert,
  danger: CircleAlert,
  success: CircleCheck,
} as const;

type AlertProps = Omit<React.ComponentProps<"div">, "title"> &
  VariantProps<typeof alertVariants> & {
    title?: React.ReactNode;
  };

function Alert({
  className,
  variant = "info",
  strong = false,
  title,
  children,
  ...props
}: AlertProps) {
  const kind = variant ?? "info";
  const Icon = ICONS[kind];
  // Urgent messages are read out at once. The others wait for a pause.
  const role = kind === "danger" || kind === "warning" ? "alert" : "status";

  return (
    <div
      role={role}
      data-slot="alert"
      className={cn(alertVariants({ variant: kind, strong }), className)}
      {...props}
    >
      <Icon aria-hidden="true" className={cn("mt-0.5 shrink-0", strong ? "size-6" : "size-5")} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title ? <p className={cn("font-bold", strong && "text-lg")}>{title}</p> : null}
        {children ? <div className="text-base">{children}</div> : null}
      </div>
    </div>
  );
}

export { Alert, alertVariants };

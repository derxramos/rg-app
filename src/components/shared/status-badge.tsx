import {
  Ban,
  CircleCheck,
  FilePenLine,
  Hourglass,
  LoaderCircle,
  ReceiptText,
  Search,
  Send,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, type RequestStatus } from "@/lib/status";
import { cn } from "@/lib/utils";

// TODO(owner question): DATABASE.md has 9 statuses, but FEATURES.md and DESIGN_SYSTEM.md list 8.
// The extra one in the database is "payment_verified". It has no color pair and no icon yet,
// so the badge does not accept it. Add it here when the owner answers the question.
export type BadgeStatus = Exclude<RequestStatus, "payment_verified">;

// Tailwind cannot see class names that are built from strings, so every class is written out in full.
const STATUS_STYLES: Record<BadgeStatus, { icon: LucideIcon; className: string }> = {
  draft: {
    icon: FilePenLine,
    className: "bg-status-draft-bg text-status-draft-fg",
  },
  submitted: {
    icon: Send,
    className: "bg-status-submitted-bg text-status-submitted-fg",
  },
  payment_submitted: {
    icon: ReceiptText,
    className: "bg-status-payment-submitted-bg text-status-payment-submitted-fg",
  },
  under_review: {
    icon: Search,
    className: "bg-status-under-review-bg text-status-under-review-fg",
  },
  waiting_for_client: {
    icon: Hourglass,
    className: "bg-status-waiting-for-client-bg text-status-waiting-for-client-fg",
  },
  in_progress: {
    icon: LoaderCircle,
    className: "bg-status-in-progress-bg text-status-in-progress-fg",
  },
  completed: {
    icon: CircleCheck,
    className: "bg-status-completed-bg text-status-completed-fg",
  },
  cancelled: {
    icon: Ban,
    className: "bg-status-cancelled-bg text-status-cancelled-fg",
  },
};

// The order used on the design boards and in /dev/ui.
export const BADGE_STATUSES = Object.keys(STATUS_STYLES) as BadgeStatus[];

// Status is never shown by color alone: it always has an icon and words.
export function StatusBadge({ status, className }: { status: BadgeStatus; className?: string }) {
  const { icon: Icon, className: colors } = STATUS_STYLES[status];
  return (
    <Badge className={cn(colors, className)}>
      <Icon aria-hidden="true" />
      {STATUS_LABELS[status]}
    </Badge>
  );
}

// Request status rules. Source: docs/DATABASE.md section 5 ("Status rules").
// This file has no database or browser code, so both the server and the browser can use it.

export const REQUEST_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "waiting_for_client",
  "payment_submitted",
  "payment_verified",
  "in_progress",
  "completed",
  "cancelled",
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

// Who is making the change.
export type StatusActor = "admin" | "client" | "system";

// Words shown to people. The database keeps the snake_case value.
export const STATUS_LABELS: Record<RequestStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under review",
  waiting_for_client: "Waiting for client",
  payment_submitted: "Payment submitted",
  payment_verified: "Payment verified",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

// Every change the table in DATABASE.md allows, whoever makes it.
const ALLOWED_NEXT: Record<RequestStatus, readonly RequestStatus[]> = {
  draft: ["submitted", "payment_submitted", "cancelled"],
  submitted: ["under_review", "waiting_for_client", "payment_submitted", "cancelled"],
  under_review: [
    "waiting_for_client",
    "payment_submitted",
    "payment_verified",
    "in_progress",
    "cancelled",
  ],
  waiting_for_client: ["under_review", "payment_submitted", "cancelled"],
  payment_submitted: ["payment_verified", "waiting_for_client", "under_review", "cancelled"],
  payment_verified: ["in_progress", "completed", "cancelled"],
  in_progress: ["waiting_for_client", "completed", "cancelled"],
  completed: [],
  cancelled: [],
};

// The only changes a client can cause (when they submit a request or a payment).
const CLIENT_NEXT: Partial<Record<RequestStatus, readonly RequestStatus[]>> = {
  draft: ["submitted", "payment_submitted"],
  submitted: ["payment_submitted"],
  under_review: ["payment_submitted"],
  waiting_for_client: ["payment_submitted"],
};

// The only change the system makes by itself: an expired draft is cancelled.
function isSystemChange(from: RequestStatus, to: RequestStatus): boolean {
  return from === "draft" && to === "cancelled";
}

// Completed requests can be opened again to "in progress". Admin only, and it must be logged.
export function isReopen(from: RequestStatus, to: RequestStatus): boolean {
  return from === "completed" && to === "in_progress";
}

export function canChangeStatus(
  actor: StatusActor,
  from: RequestStatus,
  to: RequestStatus,
): boolean {
  if (actor === "system") return isSystemChange(from, to);
  if (actor === "client") return CLIENT_NEXT[from]?.includes(to) ?? false;
  // Admin: a draft belongs to the client until they submit it, so admins do not move drafts.
  if (from === "draft") return false;
  return ALLOWED_NEXT[from].includes(to) || isReopen(from, to);
}

// The list of statuses to offer in the "Change status" menu.
export function nextStatusesFor(actor: StatusActor, from: RequestStatus): RequestStatus[] {
  return REQUEST_STATUSES.filter((to) => canChangeStatus(actor, from, to));
}

// Completed and cancelled requests are finished. Files are deleted some days after this point.
export function isClosedStatus(status: RequestStatus): boolean {
  return status === "completed" || status === "cancelled";
}

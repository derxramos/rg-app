// Where each step of the request flow goes next. One place, so adding steps later is one edit.
// Order: details (1) > documents (2) > payment (3) > receipt (4) > review (5) > done.
// Phase 3 has no payment steps yet, so documents go straight to the review.
export function nextStepAfterDocuments(requestId: string): string {
  return `/request/${requestId}/review`;
}

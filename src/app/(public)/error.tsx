"use client";

import { ErrorView } from "@/components/shared/error-view";

// Shows when a public page fails. It sits inside the public layout, so the header, the footer
// and the Messenger and Viber links are still there.
export default function PublicError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorView {...props} />;
}

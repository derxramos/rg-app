"use client";

import { ErrorView } from "@/components/shared/error-view";

// Catches errors outside the public layout (for example when the layout itself cannot load).
// There are no contact links here because they come from the database.
export default function RootError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main-content" className="flex-1">
      <ErrorView {...props} />
    </main>
  );
}

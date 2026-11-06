"use client";

import { Send } from "lucide-react";
import { useTransition } from "react";

import { submitRequestAction } from "@/app/(public)/request/actions";
import { Button } from "@/components/ui/button";

// The "Send my request" button. It shows a spinner while the server works.
export function SubmitRequestButton({
  requestId,
  label = "Send my request",
}: {
  requestId: string;
  label?: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="lg"
      loading={pending}
      className="w-full sm:w-auto"
      onClick={() => startTransition(() => submitRequestAction(requestId))}
    >
      {!pending ? <Send aria-hidden="true" /> : null}
      {label}
    </Button>
  );
}

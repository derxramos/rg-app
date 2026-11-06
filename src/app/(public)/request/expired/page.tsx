import { Hourglass } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { PageContainer } from "@/components/shared/page-container";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Request link expired", robots: { index: false } };

// Shown when the draft cookie is missing, wrong, or older than 7 days.
export default function ExpiredPage() {
  return (
    <PageContainer className="max-w-[640px] py-12">
      <EmptyState
        icon={Hourglass}
        title="We cannot open this request"
        description="The request may have expired, been sent already, or been started on another phone or browser. A request you started but did not send is deleted after 7 days."
      >
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/track" className={buttonVariants()}>
            Track a sent request
          </Link>
          <Link href="/request" className={buttonVariants({ variant: "outline" })}>
            Start again
          </Link>
        </div>
      </EmptyState>
    </PageContainer>
  );
}

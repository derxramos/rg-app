import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { DocumentsUploader } from "@/components/request/documents-uploader";
import { FlowFrame, FlowSkeleton } from "@/components/request/flow-frame";
import { buttonVariants } from "@/components/ui/button";
import { guardRequestPage } from "@/server/auth/request-page-guard";
import { getDb } from "@/server/db/client";
import { getUploadLimits, listFiles, listRequirementsForRequest } from "@/server/services/files";
import { nextStepAfterDocuments } from "@/lib/request-flow";

export const metadata: Metadata = { title: "Upload documents", robots: { index: false } };

export default function DocumentsPage({ params }: PageProps<"/request/[id]/documents">) {
  return (
    <Suspense fallback={<FlowSkeleton />}>
      <Documents params={params} />
    </Suspense>
  );
}

async function Documents({ params }: { params: PageProps<"/request/[id]/documents">["params"] }) {
  const { id } = await params;
  const request = await guardRequestPage(id, "upload");
  const db = getDb();
  const [requirements, files, limits] = await Promise.all([
    listRequirementsForRequest(db, request.serviceId),
    listFiles(db, id),
    getUploadLimits(db),
  ]);

  return (
    <FlowFrame
      step={2}
      title="Upload your documents"
      intro="Add a photo or a PDF of each document. You can continue even if you do not have everything yet. We will ask you for what is missing."
    >
      <DocumentsUploader
        requestId={id}
        requirements={requirements}
        initialFiles={files}
        maxFiles={limits.maxFiles}
        maxBytes={limits.maxBytes}
      />
      <div>
        <Link href={nextStepAfterDocuments(id)} className={buttonVariants({ size: "lg" })}>
          Continue
          <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    </FlowFrame>
  );
}

import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { DocumentsUploader } from "@/components/request/documents-uploader";
import { FlowFrame, FlowSkeleton } from "@/components/request/flow-frame";
import { buttonVariants } from "@/components/ui/button";
import { flowMode } from "@/server/auth/request-access-core";
import { guardRequestAccess } from "@/server/auth/request-page-guard";
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
  const access = await guardRequestAccess(id, "upload");
  const { request } = access;
  const mode = flowMode(access);
  const fromTracking = mode.afterSend;
  const db = getDb();
  const [requirements, files, limits] = await Promise.all([
    listRequirementsForRequest(db, request.serviceId),
    // A client who came from the tracking page never sees earlier files (privacy).
    mode.showEarlierFiles ? listFiles(db, id) : Promise.resolve([]),
    getUploadLimits(db),
  ]);

  return (
    <FlowFrame
      step={fromTracking ? undefined : 2}
      title="Upload your documents"
      intro="Add a photo or a PDF of each document. You can continue even if you do not have everything yet. We will ask you for what is missing."
    >
      <DocumentsUploader
        requestId={id}
        requirements={requirements}
        initialFiles={files}
        canRemove={request.status === "draft"}
        maxFiles={limits.maxFiles}
        maxBytes={limits.maxBytes}
      />
      <div>
        <Link
          href={fromTracking ? mode.backHref : nextStepAfterDocuments(id)}
          className={buttonVariants({ size: "lg" })}
        >
          {fromTracking ? "Done. Back to my request" : "Continue"}
          <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    </FlowFrame>
  );
}

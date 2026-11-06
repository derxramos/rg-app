import { PageContainer } from "@/components/shared/page-container";
import { Skeleton } from "@/components/ui/skeleton";

// Shown while the services list loads (for example on a slow phone connection).
export default function ServicesLoading() {
  return (
    <>
      <div className="border-b bg-surface-subtle">
        <PageContainer className="flex flex-col gap-3 py-8 md:py-12">
          <Skeleton className="h-8 w-2/3 max-w-sm" />
          <Skeleton className="h-6 w-full max-w-prose" />
        </PageContainer>
      </div>
      <PageContainer className="py-10 md:py-14">
        <div
          role="status"
          aria-label="Loading services"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-40 rounded-lg" />
          ))}
        </div>
      </PageContainer>
    </>
  );
}

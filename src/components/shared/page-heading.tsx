import { PageContainer } from "@/components/shared/page-container";
import { cn } from "@/lib/utils";

type PageHeadingProps = {
  title: string;
  intro?: string;
  // Extra content under the title, for example badges.
  children?: React.ReactNode;
  className?: string;
};

// The top block of an inner page: one h1, a short intro, and a soft background.
export function PageHeading({ title, intro, children, className }: PageHeadingProps) {
  return (
    <div className={cn("border-b bg-surface-subtle", className)}>
      <PageContainer className="flex flex-col gap-3 py-8 md:py-12">
        <h1 className="text-2xl font-bold text-primary-ink md:text-3xl">{title}</h1>
        {intro ? <p className="max-w-prose text-lg text-muted-foreground">{intro}</p> : null}
        {children}
      </PageContainer>
    </div>
  );
}

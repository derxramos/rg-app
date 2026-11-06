import { cn } from "@/lib/utils";

// Public page width: max 1200 px, side padding 20 px on phone and 32 px from md.
export function PageContainer({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-[1200px] px-5 md:px-8", className)} {...props} />;
}

import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, focusRing } from "@/lib/utils";
import type { PublicService } from "@/server/services/site-content";

// One service in a list. The whole card is one link (one tap target) to the detail page.
export function ServiceCard({
  service,
  headingTag = "h3",
}: {
  service: PublicService;
  headingTag?: "h2" | "h3";
}) {
  return (
    <Link
      href={`/services/${service.slug}`}
      className={cn("group block h-full rounded-lg", focusRing)}
    >
      <Card className="h-full transition-shadow duration-120 ease-standard group-hover:shadow-md motion-reduce:transition-none">
        <CardHeader>
          <CardTitle as={headingTag} className="text-xl">{service.name}</CardTitle>
          {service.shortDescription ? (
            <CardDescription className="text-base">{service.shortDescription}</CardDescription>
          ) : null}
        </CardHeader>
        <span className="mt-auto inline-flex items-center gap-2 text-base font-bold text-primary">
          See what you need
          <ArrowRight aria-hidden="true" className="size-5" />
        </span>
      </Card>
    </Link>
  );
}

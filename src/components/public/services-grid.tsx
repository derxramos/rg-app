import { Briefcase } from "lucide-react";

import { ServiceCard } from "@/components/public/service-card";
import { EmptyState } from "@/components/shared/empty-state";
import type { PublicService } from "@/server/services/site-content";

// A grid of service cards, or a friendly empty state when no service is active.
export function ServicesGrid({
  services,
  headingTag = "h3",
}: {
  services: PublicService[];
  headingTag?: "h2" | "h3";
}) {
  if (services.length === 0) {
    return (
      <EmptyState
        icon={Briefcase}
        headingTag={headingTag}
        title="No services listed yet"
        description="We are still adding our services. Please check again soon, or contact us."
      />
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {services.map((service) => (
        <li key={service.slug}>
          <ServiceCard service={service} headingTag={headingTag} />
        </li>
      ))}
    </ul>
  );
}

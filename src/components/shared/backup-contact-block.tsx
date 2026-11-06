import { MessageCircle, Phone } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { safeContactUrl } from "@/lib/contact-links";
import { cn } from "@/lib/utils";

type BackupContactBlockProps = {
  messengerUrl?: string | null;
  viberUrl?: string | null;
  className?: string;
};

// Backup way to reach the business when the site has a problem.
// Each button is hidden when its link is empty. The whole block is hidden when both are empty.
// Text names and simple icons only: no brand logos.
export function BackupContactBlock({ messengerUrl, viberUrl, className }: BackupContactBlockProps) {
  const messenger = safeContactUrl(messengerUrl);
  const viber = safeContactUrl(viberUrl);

  if (!messenger && !viber) return null;

  const linkClass = cn(buttonVariants({ variant: "outline" }), "rounded-full");

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <p className="text-base font-bold">Need help? Message us directly.</p>
      <div className="flex flex-wrap gap-3">
        {messenger ? (
          <a href={messenger} target="_blank" rel="noopener noreferrer" className={linkClass}>
            <MessageCircle aria-hidden="true" />
            Messenger
          </a>
        ) : null}
        {viber ? (
          <a href={viber} target="_blank" rel="noopener noreferrer" className={linkClass}>
            <Phone aria-hidden="true" />
            Viber
          </a>
        ) : null}
      </div>
    </div>
  );
}

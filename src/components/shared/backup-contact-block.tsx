import { ContactButtons } from "@/components/shared/contact-buttons";
import { safeContactUrl, viberDisplayNumber } from "@/lib/contact-links";
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
  const hasChannel = Boolean(safeContactUrl(messengerUrl) || viberDisplayNumber(viberUrl));
  if (!hasChannel) return null;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <p className="text-base font-bold">Need help? Message us directly.</p>
      <ContactButtons messengerUrl={messengerUrl} viberUrl={viberUrl} showContactPage={false} />
    </div>
  );
}

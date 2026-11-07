import { MessageCircle, Phone } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { safeContactUrl, viberDisplayNumber } from "@/lib/contact-links";
import { cn } from "@/lib/utils";

type ContactButtonsProps = {
  messengerUrl?: string | null;
  viberUrl?: string | null;
  // The "Contact us" button goes to the contact page. Pages that already are the contact page can hide it.
  showContactPage?: boolean;
  className?: string;
};

// One row of contact buttons, shared by the home page and the footer so they look the same.
// A channel with no saved link is not shown. On phones the buttons stack at full width.
export function ContactButtons({
  messengerUrl,
  viberUrl,
  showContactPage = true,
  className,
}: ContactButtonsProps) {
  const messenger = safeContactUrl(messengerUrl);
  const viberNumber = viberDisplayNumber(viberUrl);

  if (!showContactPage && !messenger && !viberNumber) return null;

  // Same size and style for every item.
  const itemClass = cn(buttonVariants({ variant: "outline" }), "h-auto w-full max-w-full rounded-full px-4 sm:w-auto");

  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center", className)}>
      {showContactPage ? (
        <Link href="/contact" className={itemClass}>
          Contact us
        </Link>
      ) : null}
      {messenger ? (
        <a href={messenger} target="_blank" rel="noopener noreferrer" className={itemClass}>
          <MessageCircle aria-hidden="true" />
          Messenger
        </a>
      ) : null}
      {viberNumber ? (
        // Not a link: the viber:// link did nothing on many devices, so the number is shown instead.
        // It has the same size and shape as the buttons, but no hover color, so it does not look clickable.
        <p
          className={cn(itemClass, "cursor-default hover:bg-background")}
          aria-label={`Viber number ${viberNumber}`}
        >
          <Phone aria-hidden="true" />
          <span className="min-w-0">Viber: {viberNumber}</span>
        </p>
      ) : null}
    </div>
  );
}

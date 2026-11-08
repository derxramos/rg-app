import { isPanelRole, landingPathForRole } from "@/lib/permissions";
import { LogOut } from "lucide-react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";

import { AccountMenu } from "@/components/shared/account-menu";
import { Button, buttonVariants } from "@/components/ui/button";
import { displayName } from "@/lib/display-name";
import { cn } from "@/lib/utils";
import { getViewer, type Viewer } from "@/server/auth/session";

// The sign in / account part of the public header. It is a SERVER component that reads the login at
// request time, inside its own <Suspense> (see PublicShell). So:
//   - the first page the browser gets already shows the right buttons (no flash of the wrong state)
//   - it is never cached or shared between people (the rest of the page can stay cached)
// "bar" is the desktop header: "Sign in" for a visitor, ONE account menu button for a signed in person.
// "menu" is the column inside the phone menu: the same choices as normal list items.
// Orange stays only for "Start a request", so these buttons use the outline style.

// If the database is down, the public pages must still open. We show the signed-out buttons and log the error.
// IMPORTANT: Next.js uses special errors to learn that a part of the page must wait for a real visitor.
// unstable_rethrow lets those through. If they were swallowed here, the signed-out header could be saved
// in the cached page and shown to everyone.
async function currentViewer(): Promise<Viewer> {
  try {
    return await getViewer();
  } catch (error) {
    unstable_rethrow(error);
    console.error("Header could not read the login:", error);
    return { kind: "visitor" };
  }
}

export async function HeaderAuth({ layout }: { layout: "bar" | "menu" }) {
  // Wait for a real visitor BEFORE anything else, so this part is never prerendered or cached.
  await connection();
  const viewer = await currentViewer();
  const menu = layout === "menu";

  if (viewer.kind === "visitor") {
    return (
      <div
        className={cn("items-center", menu ? "flex flex-col" : "flex")}
        data-auth-state="visitor"
      >
        <Link
          href="/login"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "whitespace-nowrap",
            menu && "w-full",
          )}
        >
          Sign in
        </Link>
      </div>
    );
  }

  // Staff, admin and owner get an "Admin" link to their own first page. Clients get "My requests".
  const isPanel = isPanelRole(viewer.kind);
  const linkHref = landingPathForRole(viewer.kind);
  const linkLabel = isPanel ? "Admin" : "My requests";

  if (!menu) {
    const { name, initial } = displayName(viewer.profile.fullName);
    return (
      <div className="flex items-center" data-auth-state={viewer.kind}>
        <AccountMenu name={name} initial={initial} linkHref={linkHref} linkLabel={linkLabel} />
      </div>
    );
  }

  // Phone menu: normal list items, each at least 44 px tall.
  return (
    <div className="flex flex-col gap-1" data-auth-state={viewer.kind}>
      <Link
        href={linkHref}
        className={cn(
          "flex min-h-11 w-full items-center rounded-md px-3 text-base font-semibold whitespace-nowrap hover:bg-accent",
        )}
      >
        {linkLabel}
      </Link>
      {/* A plain form POST, never a link, so another website cannot sign someone out. The answer is a full page load. */}
      <form method="post" action="/auth/sign-out" className="w-full">
        <Button
          type="submit"
          variant="ghost"
          className="min-h-11 w-full justify-start px-3 text-base whitespace-nowrap"
        >
          <LogOut aria-hidden="true" />
          Sign out
        </Button>
      </form>
    </div>
  );
}

// Same size as the real buttons, so nothing jumps while the login is read. It shows no button at all
// (never a wrong "Sign in").
export function HeaderAuthFallback({ layout }: { layout: "bar" | "menu" }) {
  return <div aria-hidden="true" className={layout === "menu" ? "h-11 w-full" : "h-10 w-36"} />;
}

import { isPanelRole, landingPathForRole } from "@/lib/permissions";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";

import { SignOutForm } from "@/components/shared/sign-out-form";
import { AccountMenu } from "@/components/shared/account-menu";
import { AuthHint } from "@/components/shared/auth-hint";
import { buttonVariants } from "@/components/ui/button";
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
        {menu ? null : <AuthHint signedIn={false} />}
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

  // Staff, admin and owner get an "Admin" link to their own first page. Clients get "My Requests".
  const isPanel = isPanelRole(viewer.kind);
  const linkHref = landingPathForRole(viewer.kind);
  const linkLabel = isPanel ? "Admin" : "My Requests";

  if (!menu) {
    const { name, initial } = displayName(viewer.profile.fullName);
    return (
      <div className="flex items-center" data-auth-state={viewer.kind}>
        <AuthHint signedIn />
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
          "flex min-h-11 w-full items-center rounded-md border border-primary/30 bg-primary-soft px-3 text-base font-bold whitespace-nowrap text-primary-ink hover:bg-primary hover:text-primary-foreground",
        )}
      >
        {linkLabel}
      </Link>
      {/* A plain form POST, never a link, so another website cannot sign someone out. The answer is a full page load. */}
      <SignOutForm variant="phone" />
    </div>
  );
}

// What shows while the login is read (a refresh, a slow connection). It has the same size as the real buttons, so
// nothing jumps. A visitor sees a working "Sign in" link right away. A browser that was signed in last time (the
// hint cookie, see auth-hint.tsx) sees a neutral box instead, so a signed in person never sees a wrong "Sign in".
export function HeaderAuthFallback({ layout }: { layout: "bar" | "menu" }) {
  const menu = layout === "menu";
  return (
    <div className={menu ? "w-full" : "flex items-center"}>
      <Link
        href="/login"
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "whitespace-nowrap",
          menu && "w-full",
          "[html[data-signed-in]_&]:hidden",
        )}
      >
        Sign in
      </Link>
      <div
        aria-hidden="true"
        className={cn(
          "hidden animate-pulse rounded-md bg-muted motion-reduce:animate-none",
          menu ? "h-11 w-full" : "h-10 w-36",
          "[html[data-signed-in]_&]:block",
        )}
      />
    </div>
  );
}

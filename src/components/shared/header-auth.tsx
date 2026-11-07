import { LogOut } from "lucide-react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getViewer, type Viewer } from "@/server/auth/session";

// The sign in / sign out part of the public header. It is a SERVER component that reads the login at
// request time, inside its own <Suspense> (see PublicShell). So:
//   - the first page the browser gets already shows the right buttons (no flash of the wrong state)
//   - it is never cached or shared between people (the rest of the page can stay cached)
// "bar" is the row in the desktop header. "menu" is the column inside the phone menu.
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
  const item = cn("md:min-h-11", menu && "w-full");

  return (
    <div
      className={cn("items-center gap-2", menu ? "flex flex-col" : "flex")}
      data-auth-state={viewer.kind}
    >
      {viewer.kind === "visitor" ? (
        <Link
          href="/login"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), item)}
        >
          Sign in
        </Link>
      ) : (
        <>
          <Link
            href={viewer.kind === "admin" ? "/admin" : "/account"}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), item)}
          >
            {viewer.kind === "admin" ? "Admin" : "My requests"}
          </Link>
          {/* A plain form POST, never a link, so another website cannot sign someone out. The answer is a full page load. */}
          <form method="post" action="/auth/sign-out" className={menu ? "w-full" : undefined}>
            <Button type="submit" variant="outline" size="sm" className={item}>
              <LogOut aria-hidden="true" />
              Sign out
            </Button>
          </form>
        </>
      )}
    </div>
  );
}

// Same size as the real buttons, so nothing jumps while the login is read. It shows no button at all
// (never a wrong "Sign in").
export function HeaderAuthFallback({ layout }: { layout: "bar" | "menu" }) {
  return <div aria-hidden="true" className={layout === "menu" ? "h-11 w-full" : "h-11 w-36"} />;
}

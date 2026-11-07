import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// "Continue with Google". A plain link to /auth/google (no script needed). It is shown only when the
// owner has turned Google sign in on (GOOGLE_SIGNIN_ENABLED=true). The "G" follows Google's brand rules.
export function GoogleButton({
  next,
  label = "Continue with Google",
}: {
  next?: string;
  label?: string;
}) {
  const href = next ? `/auth/google?next=${encodeURIComponent(next)}` : "/auth/google";
  return (
    // A normal link, not next/link: the person leaves our site, so we want a full page load.
    <a href={href} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}>
      <svg aria-hidden="true" viewBox="0 0 48 48" className="size-5">
        <path
          fill="#EA4335"
          d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"
        />
        <path
          fill="#4285F4"
          d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"
        />
        <path
          fill="#FBBC05"
          d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z"
        />
        <path
          fill="#34A853"
          d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"
        />
      </svg>
      {label}
    </a>
  );
}

// A thin line with a word in the middle, between the Google button and the email form.
export function OrDivider({ children = "or use your email" }: { children?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground" role="separator">
      <span className="h-px flex-1 bg-border" />
      {children}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

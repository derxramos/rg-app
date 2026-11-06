import Image from "next/image";

import { cn } from "@/lib/utils";

type LogoProps = {
  // Use "inverse" on a dark or primary-colored background.
  inverse?: boolean;
  // Hide the words when space is tight. The tile stays.
  showWordmark?: boolean;
  className?: string;
};

// The tile is an SVG file. The words are live text, so they stay sharp and can wrap.
export function Logo({ inverse = false, showWordmark = true, className }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <Image
        src={inverse ? "/brand/rg-monogram-inverse.svg" : "/brand/rg-monogram.svg"}
        alt=""
        width={40}
        height={40}
        priority
        className="size-10 shrink-0"
      />
      {showWordmark ? (
        <span className="flex min-w-0 flex-col leading-tight">
          <span
            className={cn(
              "text-lg font-bold",
              inverse ? "text-primary-foreground" : "text-primary-ink",
            )}
          >
            RG&apos;S
          </span>{" "}
          <span
            className={cn(
              "text-xs font-bold tracking-wide uppercase",
              inverse ? "text-primary-foreground" : "text-muted-foreground",
            )}
          >
            Bookkeeping &amp; Accounting
          </span>
        </span>
      ) : (
        <span className="sr-only">RG&apos;S Bookkeeping &amp; Accounting</span>
      )}
    </span>
  );
}

import { cn } from "@/lib/utils";

// One rule for every admin list: a TABLE from 1180 px wide, CARDS below it.
// Why 1180 px: with the 256 px sidebar and the 32 px page padding, a table of 6 columns needs about 860 px
// to show its words without wrapping. Below that, cards are easier to read and to tap (no sideways scroll).
export const TABLE_ONLY = "hidden min-[1180px]:block";
export const CARDS_ONLY = "min-[1180px]:hidden";

// The box around a table. If the table is still wider than its box, it scrolls inside the box
// (the Table component has its own scroll area), never the whole page.
export function TableBox({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("overflow-hidden rounded-lg border bg-card", TABLE_ONLY, className)}
      {...props}
    />
  );
}

// A list of cards, 12 px apart.
export function CardList({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul className={cn("flex flex-col gap-3", CARDS_ONLY, className)} {...props} />;
}

// Cuts a long value (an email) with "..." and shows the full value in a tooltip. Never breaks a word.
export function Clip({ text, max = 40 }: { text: string; max?: number }) {
  if (text.length <= max) return <>{text}</>;
  return <span title={text}>{text.slice(0, max - 3)}...</span>;
}

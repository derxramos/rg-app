import ReactMarkdown, { type Components } from "react-markdown";

import { cn, focusRing } from "@/lib/utils";

// Styles for Markdown text. We use our own tokens, so no extra typography plugin is needed.
const components: Components = {
  h2: ({ children }) => (
    <h2 className="mt-8 mb-3 text-xl font-bold text-primary-ink">{children}</h2>
  ),
  h3: ({ children }) => <h3 className="mt-6 mb-2 text-lg font-bold">{children}</h3>,
  p: ({ children }) => <p className="mb-4 text-base">{children}</p>,
  ul: ({ children }) => <ul className="mb-4 list-disc space-y-2 pl-6 text-base">{children}</ul>,
  ol: ({ children }) => <ol className="mb-4 list-decimal space-y-2 pl-6 text-base">{children}</ol>,
  strong: ({ children }) => <strong className="font-bold">{children}</strong>,
  a: ({ href, children }) => (
    <a
      href={href}
      rel="noopener noreferrer"
      className={cn("rounded-sm text-primary underline underline-offset-4", focusRing)}
    >
      {children}
    </a>
  ),
};

// Safe Markdown: raw HTML in the text is NOT rendered (skipHtml), and unsafe link types such as
// javascript: are removed by react-markdown's default URL check. Used for texts the owner writes.
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("max-w-prose", className)}>
      <ReactMarkdown skipHtml components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

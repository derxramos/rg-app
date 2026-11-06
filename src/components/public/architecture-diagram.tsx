// A simple picture of how the system fits together. Drawn in SVG, so it is sharp, tiny, and has no download.
// The words are in the image, and the same facts are in the list under it for screen readers.
export function ArchitectureDiagram() {
  const box = (x: number, y: number, w: number, h: number, title: string, lines: string[], tone: "a" | "b" | "c") => {
    const fill = tone === "a" ? "var(--primary-soft)" : tone === "b" ? "var(--info-soft)" : "var(--brand-accent-soft)";
    const ink = tone === "a" ? "var(--primary-ink)" : tone === "b" ? "var(--info-ink)" : "var(--brand-accent-ink)";
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} rx={12} fill={fill} stroke={ink} strokeWidth={1.5} />
        <text x={x + 14} y={y + 26} fontSize={15} fontWeight={700} fill={ink}>{title}</text>
        {lines.map((line, i) => (
          <text key={line} x={x + 14} y={y + 48 + i * 18} fontSize={13} fill={ink}>{line}</text>
        ))}
      </g>
    );
  };
  const arrow = (x1: number, y1: number, x2: number, y2: number, label?: string) => (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--text-muted)" strokeWidth={2} markerEnd="url(#arrow)" />
      {label ? <text x={(x1 + x2) / 2 + 6} y={(y1 + y2) / 2 - 6} fontSize={12} fill="var(--text-muted)">{label}</text> : null}
    </g>
  );

  return (
    <figure className="flex flex-col gap-3">
      <svg viewBox="0 0 860 430" role="img" aria-labelledby="arch-title arch-desc" className="h-auto w-full max-w-4xl rounded-lg border bg-card">
        <title id="arch-title">How the system fits together</title>
        <desc id="arch-desc">The client phone and the admin browser talk to a Next.js app on Netlify. The app talks to Supabase (database, files, login), Brevo (email) and Cloudflare Turnstile (spam check). GitHub Actions runs two small jobs. The receipt reader runs only in the browser.</desc>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted)" />
          </marker>
        </defs>

        {box(20, 20, 230, 96, "Client's phone", ["Public pages, request flow", "Receipt reader (Tesseract.js)", "The picture never leaves here"], "c")}
        {box(20, 160, 230, 76, "Owner and staff", ["Admin area, phone or computer", "Password + 2FA code"], "c")}

        {box(330, 70, 230, 150, "Next.js app (Netlify)", ["Static public pages", "Server Actions and routes", "Every one checks access first", "Zod checks on every input"], "a")}

        {box(630, 20, 210, 76, "Supabase", ["Postgres (RLS on, no policies)", "Private file bucket, Login"], "b")}
        {box(630, 114, 210, 56, "Brevo", ["Email (plain fetch)"], "b")}
        {box(630, 188, 210, 56, "Cloudflare Turnstile", ["Spam check (server verifies)"], "b")}

        {box(330, 290, 230, 96, "GitHub Actions", ["Keep-alive every 3 days", "Cleanup every day", "Talk to Supabase directly"], "a")}

        {arrow(250, 70, 330, 110, "HTTPS")}
        {arrow(250, 198, 330, 175)}
        {arrow(560, 100, 630, 62, "server only")}
        {arrow(560, 145, 630, 142)}
        {arrow(560, 190, 630, 216)}
        {arrow(560, 340, 700, 100)}
      </svg>
      <figcaption className="max-w-prose text-sm text-muted-foreground">
        Everything the browser can reach goes through the Next.js app. The browser never talks to the database. The two GitHub jobs do not use the app at all, so they cost no hosting credits.
      </figcaption>
    </figure>
  );
}

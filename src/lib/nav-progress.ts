// Decides when the admin area shows its "Loading..." indicator after a click. Pure code, so it is easy to test.
//   "page" = the click opens another page or address on this site: show the indicator until the address changes
//   "file" = a file download or a server route (CSV export, sign out): there is no new page to wait for, so the
//            indicator is shown for a few seconds only
//   null   = nothing to show (another website, a new tab, the same address, a click with Ctrl or Shift, an anchor on
//            the same page)

export type ClickInfo = {
  href: string;
  // The address of the page now, for example "https://site/admin/requests?page=2".
  currentUrl: string;
  target?: string | null;
  download?: boolean;
  // Ctrl, Shift, Alt or Meta was held, or it was not the left mouse button.
  modified?: boolean;
};

export function navigationKind(click: ClickInfo): "page" | "file" | null {
  if (click.download) return "file";
  if (click.modified) return null;
  if (click.target && click.target !== "_self") return null;

  let to: URL;
  let from: URL;
  try {
    from = new URL(click.currentUrl);
    to = new URL(click.href, from);
  } catch {
    return null;
  }
  if (to.origin !== from.origin) return null;
  if (!/^https?:$/.test(to.protocol)) return null;
  // Same page and same search, only the #anchor differs (or nothing differs).
  if (to.pathname === from.pathname && to.search === from.search) return null;
  if (to.pathname.startsWith("/api/") || to.pathname.startsWith("/auth/")) return "file";
  return "page";
}

// A GET form (search, filters, the export form) sends the browser to a new address. A POST form (sign out)
// loads a new page. Either way the person should see that something is happening.
export function formKind(form: {
  method: string;
  action: string;
  currentUrl: string;
}): "page" | "file" {
  try {
    const to = new URL(form.action, form.currentUrl);
    if (to.pathname.startsWith("/api/") || to.pathname.startsWith("/auth/")) return "file";
  } catch {
    // fall through
  }
  return "page";
}

export const PAGE_TIMEOUT_MS = 20_000;
export const FILE_TIMEOUT_MS = 4_000;

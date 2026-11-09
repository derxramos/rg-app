import { can, type Role } from "@/lib/permissions";

// Breadcrumb helpers for the admin area. Pure code, so it is easy to test.
//   Crumb       one step of the trail. The last one is the current page and has no address.
//   settingsTrail  the first step for the pages under Settings. Staff have no Settings page (their menu shows
//                  "Services" instead), so for them the trail starts lower and never links to a page that says
//                  "Not allowed".
//   requestsListHref  the address of the Requests list with the search, filters and page number the person had
//                  before they opened one request, so "Back to Requests" returns to the same list.

export type Crumb = { label: string; href?: string };

export function settingsTrail(role: Role): Crumb[] {
  return can(role, "accounts.view") ? [{ label: "Settings", href: "/admin/settings" }] : [];
}

// The only list filters that may travel in the address. Anything else is dropped, so a made-up address cannot
// put its own words in a link.
const LIST_KEYS = ["q", "status", "service", "from", "to", "page"] as const;
const MAX_VALUE_LENGTH = 100;

// "raw" is the text after the "?" of the list address, as saved by the list page. Returns the clean text to put
// after "?" (empty when there is nothing to keep).
export function cleanListQuery(raw: string | null | undefined): string {
  if (!raw || raw.length > 600) return "";
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(raw.replace(/^\?/, ""));
  } catch {
    return "";
  }
  const clean = new URLSearchParams();
  for (const key of LIST_KEYS) {
    const value = params.get(key);
    if (value && value.length <= MAX_VALUE_LENGTH) clean.set(key, value);
  }
  return clean.toString();
}

export function requestsListHref(raw: string | null | undefined): string {
  const query = cleanListQuery(raw);
  return query ? `/admin/requests?${query}` : "/admin/requests";
}

// The address of one request, with the list the person came from (so the trail can go back to it).
export function requestHref(id: string, listQuery: string): string {
  const query = cleanListQuery(listQuery);
  return query
    ? `/admin/requests/${id}?${new URLSearchParams({ list: query }).toString()}`
    : `/admin/requests/${id}`;
}

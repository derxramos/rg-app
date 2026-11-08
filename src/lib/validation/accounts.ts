import { z } from "zod";

import { ROLES } from "@/lib/permissions";

// The settings of the accounts table, read from the web address (?q=&role=&status=&page=&per=).
// Pure code (no server imports) so the page, the service and the tests share it.

export const PAGE_SIZES = [10, 25, 50] as const;
export const DEFAULT_PAGE_SIZE = 25;

export const ACCOUNT_STATUSES = ["active", "turned_off", "invited", "unverified"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const STATUS_LABELS: Record<AccountStatus, string> = {
  active: "Active",
  turned_off: "Turned off",
  invited: "Invited with temporary password",
  unverified: "Email not verified",
};

export type AccountQuery = {
  q: string;
  role: (typeof ROLES)[number] | null;
  status: AccountStatus | null;
  page: number;
  perPage: (typeof PAGE_SIZES)[number];
};

// A wrong value never breaks the page: it falls back to the default.
const lenient = <T extends z.ZodType>(schema: T, fallback: z.infer<T>) =>
  schema.catch(fallback as never);

const querySchema = z.object({
  q: lenient(z.string().trim().max(100), ""),
  role: lenient(z.enum(ROLES).nullable(), null),
  status: lenient(z.enum(ACCOUNT_STATUSES).nullable(), null),
  page: lenient(z.coerce.number().int().min(1).max(10000), 1),
  per: lenient(
    z.coerce
      .number()
      .refine((n): n is (typeof PAGE_SIZES)[number] =>
        (PAGE_SIZES as readonly number[]).includes(n),
      ),
    DEFAULT_PAGE_SIZE,
  ),
});

export function parseAccountQuery(
  params: Record<string, string | string[] | undefined>,
): AccountQuery {
  const first = (name: string) => {
    const value = params[name];
    const one = Array.isArray(value) ? value[0] : value;
    return one === "" ? undefined : one;
  };
  const parsed = querySchema.parse({
    q: first("q") ?? "",
    role: first("role") ?? null,
    status: first("status") ?? null,
    page: first("page") ?? 1,
    per: first("per") ?? DEFAULT_PAGE_SIZE,
  });
  return {
    q: parsed.q,
    role: parsed.role,
    status: parsed.status,
    page: parsed.page,
    perPage: parsed.per as AccountQuery["perPage"],
  };
}

// Builds the address for a page link, keeping every setting that is not the default.
export function accountQueryString(query: Partial<AccountQuery>): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.role) params.set("role", query.role);
  if (query.status) params.set("status", query.status);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  if (query.perPage && query.perPage !== DEFAULT_PAGE_SIZE)
    params.set("per", String(query.perPage));
  const text = params.toString();
  return text ? `?${text}` : "";
}

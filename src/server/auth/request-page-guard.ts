import "server-only";

import { redirect } from "next/navigation";

import { requireRequestAccess } from "./request-access";
import { AccessError, type RequestAction } from "./request-access-core";

// For pages: returns the request when the client may see it, otherwise sends them to the
// "expired or no access" page. (redirect must not run inside try/catch, so it is after it.)
export async function guardRequestAccess(requestId: string, action: RequestAction) {
  let access: Awaited<ReturnType<typeof requireRequestAccess>> | null = null;
  try {
    access = await requireRequestAccess(requestId, action);
  } catch (error) {
    if (!(error instanceof AccessError)) throw error;
  }
  if (!access) redirect("/request/expired");
  return access;
}

// The same, when only the request row is needed.
export async function guardRequestPage(requestId: string, action: RequestAction) {
  return (await guardRequestAccess(requestId, action)).request;
}

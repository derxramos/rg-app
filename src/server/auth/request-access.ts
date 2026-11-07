import "server-only";

import { cookies } from "next/headers";
import { connection } from "next/server";

import { getDb } from "@/server/db/client";
import { getTokenSecret, isProduction } from "@/server/env";

import { getSession } from "./session";

import {
  AccessError,
  checkRequestAccess,
  makeDraftCookieValue,
  makeTrackingSession,
  readTrackingSession,
  type RequestAction,
} from "./request-access-core";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DRAFT_COOKIE = "rg_draft";
export const TRACKING_COOKIE = "rg_track";
export const DONE_COOKIE = "rg_done";

const cookieBase = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: isProduction(),
  path: "/",
});

// Called at the start of EVERY server action, route and page that touches one request (CLAUDE.md rule 5).
// Throws AccessError when the client may not do this. Returns the request row when they may.
export async function requireRequestAccess(requestId: string, action: RequestAction) {
  // This depends on the visitor (cookies and the current time), so it can only run at request time.
  await connection();
  // An id that is not a UUID can never match. Answer like "not found" (and do not ask the database).
  if (!UUID.test(requestId)) throw new AccessError("not-found");
  const jar = await cookies();
  // The signed-in person (if any). Only the server session is used, never an id from the browser.
  const session = await getSession();
  return checkRequestAccess(getDb(), {
    requestId,
    action,
    userId: session?.userId ?? null,
    draftCookie: jar.get(DRAFT_COOKIE)?.value ?? null,
    trackingCookie: jar.get(TRACKING_COOKIE)?.value ?? null,
    secret: getTokenSecret(),
  });
}

export async function setDraftCookie(requestId: string, token: string, expiresAt: Date) {
  const jar = await cookies();
  jar.set(DRAFT_COOKIE, makeDraftCookieValue(requestId, token), {
    ...cookieBase(),
    expires: expiresAt,
  });
}

// A short session after the tracking form succeeds (1 hour).
export async function setTrackingCookie(requestId: string) {
  const expiresAtMs = Date.now() + 60 * 60 * 1000;
  const jar = await cookies();
  jar.set(TRACKING_COOKIE, makeTrackingSession(getTokenSecret(), requestId, expiresAtMs), {
    ...cookieBase(),
    expires: new Date(expiresAtMs),
  });
}

// Which request does the tracking session cookie belong to? Null when there is none, it is forged, or it ran out.
export async function getTrackingRequestId(): Promise<string | null> {
  await connection();
  const value = (await cookies()).get(TRACKING_COOKIE)?.value;
  if (!value) return null;
  const session = readTrackingSession(getTokenSecret(), value);
  return session && session.expiresAtMs > Date.now() ? session.requestId : null;
}

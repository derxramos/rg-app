// Rules for step 1 of the request flow (docs/FEATURES.md P7).
// The same schema runs in the browser (fast feedback) and on the server (the real check).

import { z } from "zod";

import { normalizePhMobile } from "@/lib/phone";

export const REQUEST_MESSAGE_MAX = 2000;

export const requestDetailsSchema = z.object({
  serviceSlug: z.string().trim().min(1, "Please choose a service.").max(100),
  fullName: z
    .string()
    .trim()
    .min(1, "Please enter your full name.")
    .max(100, "That name is too long."),
  email: z
    .string()
    .trim()
    .min(1, "Please enter your email.")
    .max(200, "That email is too long.")
    .email("Please enter a full email address, for example name@example.com."),
  // Stored as +63XXXXXXXXXX.
  phone: z
    .string()
    .trim()
    .min(1, "Please enter your mobile number.")
    .transform((value, ctx) => {
      const normalized = normalizePhMobile(value);
      if (!normalized) {
        ctx.addIssue({
          code: "custom",
          message: "Please enter a Philippine mobile number, for example 917 123 4567.",
        });
        return z.NEVER;
      }
      return normalized;
    }),
  businessName: z.string().trim().max(150, "That name is too long.").optional().default(""),
  message: z
    .string()
    .trim()
    .max(REQUEST_MESSAGE_MAX, `Please keep your message under ${REQUEST_MESSAGE_MAX} characters.`)
    .optional()
    .default(""),
  // Never ticked by default. The request cannot go on without it.
  consent: z.literal(true, { error: "Please tick the box to agree to the privacy notice." }),
});

export type RequestDetailsInput = z.input<typeof requestDetailsSchema>;
export type RequestDetails = z.output<typeof requestDetailsSchema>;
export type RequestDetailsField = keyof RequestDetails;

export function requestFieldErrors(
  error: z.ZodError,
): Partial<Record<RequestDetailsField, string>> {
  const result: Partial<Record<RequestDetailsField, string>> = {};
  for (const issue of error.issues) {
    const field = issue.path[0] as RequestDetailsField | undefined;
    if (field && !result[field]) result[field] = issue.message;
  }
  return result;
}

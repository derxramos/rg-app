// Rules for the contact form. The same schema runs in the browser (for fast feedback)
// and on the server (the real check, added in Phase 6).

import { z } from "zod";

import { normalizePhMobile } from "@/lib/phone";

export const CONTACT_MESSAGE_MAX = 2000;

export const contactFormSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name.").max(100, "That name is too long."),
  email: z
    .string()
    .trim()
    .min(1, "Please enter your email.")
    .max(200, "That email is too long.")
    .email("Please enter a full email address, for example name@example.com."),
  // Optional. When it is filled in, it must be a Philippine mobile number.
  phone: z
    .string()
    .trim()
    .max(30, "That number is too long.")
    .refine((value) => value === "" || normalizePhMobile(value) !== null, {
      message: "Please enter a Philippine mobile number, for example 917 123 4567.",
    }),
  message: z
    .string()
    .trim()
    .min(1, "Please write your message.")
    .max(CONTACT_MESSAGE_MAX, `Please keep your message under ${CONTACT_MESSAGE_MAX} characters.`),
});

export type ContactFormValues = z.infer<typeof contactFormSchema>;
export type ContactFormField = keyof ContactFormValues;

// Turns Zod errors into one message per field (the first message for each field).
export function fieldErrorsFrom(error: z.ZodError): Partial<Record<ContactFormField, string>> {
  const result: Partial<Record<ContactFormField, string>> = {};
  for (const issue of error.issues) {
    const field = issue.path[0] as ContactFormField | undefined;
    if (field && !result[field]) result[field] = issue.message;
  }
  return result;
}

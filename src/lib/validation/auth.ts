import { z } from "zod";

// Shared by the forms (browser hints) and the Server Actions (the real check).
// Supabase has its own minimum length setting too (docs/AUTH_AND_ROLES.md). Set it to the same number.

export const PASSWORD_MIN = 12;
// bcrypt, used by Supabase, only reads the first 72 bytes.
export const PASSWORD_MAX = 72;

// A short list of passwords people use most. Supabase's leaked-password check is a paid feature, so this is
// a small free guard. Compared in lower case, with spaces and symbols removed.
const COMMON_PASSWORDS = [
  "password",
  "password1",
  "password12",
  "password123",
  "passw0rd1234",
  "qwertyuiop",
  "qwerty123456",
  "123456789012",
  "1234567890123",
  "iloveyou1234",
  "welcome12345",
  "admin1234567",
  "letmein12345",
  "bookkeeping",
  "rgbookkeeping",
  "philippines",
  "pilipinas123",
  "abc123456789",
  "11111111111",
  "000000000000",
];

function squash(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isCommonPassword(password: string): boolean {
  const flat = squash(password);
  if (COMMON_PASSWORDS.some((common) => flat === squash(common))) return true;
  // The same character over and over, such as "aaaaaaaaaaaa".
  return /^(.)\1+$/.test(flat);
}

// Returns a plain-English problem, or null when the password is fine.
export function passwordProblem(password: string, email = ""): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  const name = email.split("@")[0]?.trim().toLowerCase();
  if (email && password.toLowerCase() === email.toLowerCase())
    return "The password cannot be the same as your email.";
  if (name && name.length >= 4 && squash(password) === squash(name))
    return "The password cannot be the same as your email name.";
  if (isCommonPassword(password)) return "That password is too easy to guess. Try a longer phrase.";
  return null;
}

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Please enter your email.")
  .max(200, "That email is too long.")
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Please enter a full email address.");

export const fullNameSchema = z
  .string()
  .trim()
  .min(2, "Please enter your full name.")
  .max(100, "That name is too long.");

export const passwordSchema = z.string().superRefine((value, context) => {
  const problem = passwordProblem(value);
  if (problem) context.addIssue({ code: "custom", message: problem });
});

// Login does not judge the password (an old account may have an old rule). It only checks the size.
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Please enter your password.").max(200),
});

export const registerSchema = z
  .object({
    fullName: fullNameSchema,
    email: emailSchema,
    password: z.string().max(200),
    confirmPassword: z.string().max(200),
    consent: z.literal("on", { error: "Please tick the box to continue." }),
  })
  .superRefine((value, context) => {
    const problem = passwordProblem(value.password, value.email);
    if (problem) context.addIssue({ code: "custom", path: ["password"], message: problem });
    if (value.password !== value.confirmPassword)
      context.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "The two passwords are not the same.",
      });
  });

export const emailOnlySchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({ password: z.string().max(200), confirmPassword: z.string().max(200) })
  .superRefine((value, context) => {
    const problem = passwordProblem(value.password);
    if (problem) context.addIssue({ code: "custom", path: ["password"], message: problem });
    if (value.password !== value.confirmPassword)
      context.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "The two passwords are not the same.",
      });
  });

// Turns a Zod error into { fieldName: message } for the forms.
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    result[key] ??= issue.message;
  }
  return result;
}

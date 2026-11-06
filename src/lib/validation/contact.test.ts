import { describe, expect, it } from "vitest";

import { contactFormSchema, fieldErrorsFrom, CONTACT_MESSAGE_MAX } from "./contact";

const good = {
  name: "Test Person",
  email: "zolb-test+contact@example.com",
  phone: "",
  message: "Hello, I have a question.",
};

describe("contactFormSchema", () => {
  it("accepts a good message, with no phone", () => {
    expect(contactFormSchema.safeParse(good).success).toBe(true);
  });

  it("accepts a Philippine mobile number in common styles", () => {
    expect(contactFormSchema.safeParse({ ...good, phone: "0917 123 4567" }).success).toBe(true);
    expect(contactFormSchema.safeParse({ ...good, phone: "+639171234567" }).success).toBe(true);
  });

  it("rejects a bad phone number but allows an empty one", () => {
    expect(contactFormSchema.safeParse({ ...good, phone: "12345" }).success).toBe(false);
    expect(contactFormSchema.safeParse({ ...good, phone: "   " }).success).toBe(true);
  });

  it("rejects missing name, email and message", () => {
    const result = contactFormSchema.safeParse({ name: " ", email: "", phone: "", message: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = fieldErrorsFrom(result.error);
      expect(Object.keys(errors).sort()).toEqual(["email", "message", "name"]);
    }
  });

  it("rejects a bad email", () => {
    const result = contactFormSchema.safeParse({ ...good, email: "not-an-email" });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrorsFrom(result.error).email).toMatch(/full email address/);
  });

  it("rejects a message that is too long", () => {
    const result = contactFormSchema.safeParse({
      ...good,
      message: "x".repeat(CONTACT_MESSAGE_MAX + 1),
    });
    expect(result.success).toBe(false);
  });

  it("trims spaces around the values", () => {
    const result = contactFormSchema.parse({ ...good, name: "  Ana  " });
    expect(result.name).toBe("Ana");
  });
});

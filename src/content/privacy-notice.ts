// Draft text of the privacy notice (docs/FEATURES.md P6, docs/SECURITY_AND_PRIVACY.md section 2).
//
// Written from the project docs. It is not legal advice. The owner reviews and approves it before the site goes live.
// Chosen values: request records are kept 5 years (tax and business records), and the data is stored in the
// Supabase region Singapore (the owner must pick that region when creating the project). Change them here if needed.
// Later the notice can be edited in the admin area. The version number comes from site settings.

export const PRIVACY_NOTICE_DATE = "2026-11-06";

type NoticeInput = {
  retentionDays: number;
  contactEmail: string;
  contactPhone: string;
};

// Builds the Markdown text. Facts that can change (retention days, contact details) come from settings.
export function buildPrivacyNotice({
  retentionDays,
  contactEmail,
  contactPhone,
}: NoticeInput): string {
  const contactLines = [
    contactEmail ? `- Email: ${contactEmail}` : null,
    contactPhone ? `- Phone: ${contactPhone}` : null,
  ].filter(Boolean);
  const contact =
    contactLines.length > 0
      ? contactLines.join("\n")
      : "- [Contact person and contact details to be added by the owner]";

  return `## Who we are

This website is run by RG'S BOOKKEEPING AND ACCOUNTING SERVICES in the Philippines ("we"). This notice explains how we handle your personal information when you use this website, in line with the Data Privacy Act of 2012 (Republic Act 10173).

## What we collect

When you create an account, we ask for your full name, your email address and a password. We keep your password only in a protected form that we cannot read. You may also add your mobile number.

When you send a request, we ask for:

- your full name, email address and mobile number
- your business name (if you want to tell us)
- an optional message
- the documents you upload for your request
- if you tell us about a payment: the payment method, the reference number, the amount and the date

When you use the contact form, we receive your name, email address, optional mobile number and your message.

We do **not** keep a picture of your payment receipt. If you use the "read my receipt" tool, the picture is read on your own phone and is never sent to us. We save only the four typed values listed above.

## Why we collect it

- To run your account, so you can sign in and see your own requests.
- To process the service you asked for.
- To contact you about your request.
- To check your payment.
- To keep business records.

We ask for your consent (the tick box) when you create an account and when you send a request.

## How long we keep it

- Uploaded documents are deleted ${retentionDays} days after your request is Completed or Cancelled.
- A request that you start but never send (a draft) is deleted, with its files, after 7 days.
- Your account stays until you delete it. You can delete it yourself at any time (see "Your rights"), unless you still have an open request.
- The text records of your request (name, contact details, status and payment values) are kept for business records for 5 years (for tax and business records).

## Who can see your information

- Only our authorised team members can see your request and documents. They log in with a password and a second check.
- You can see only your own requests when you are signed in. Other users cannot see them.
- The tracking page shows only the service name, the status, a simple timeline and our latest message to you. It never shows your documents, your email or your full mobile number.

## Other services that help us run this website

We use other companies to run the website. They handle data for us only for these purposes:

- **Supabase** stores our database and your uploaded files. Data location: Singapore.
- **Vercel** hosts the website.
- **Brevo** sends emails to you and to us.
- **Cloudflare Turnstile** checks that a form is filled in by a person and not by a robot.

## Your rights

You can ask us to:

- show you the information we hold about you
- correct information that is wrong
- delete your information
- stop using your information, by taking back your consent

When you are signed in, the page "My requests" lets you:

- see and change your name and mobile number
- **download** a file with the information we hold about you
- **delete your account**. We delete your documents and your personal details and remove your login. We keep a short record of each request (the code, the service, the dates and the payment values) for our business accounts, with no name or contact details.

For anything else, contact us using the details below. You can also ask the National Privacy Commission about your rights.

## Contact

${contact}

## Changes to this notice

If we change this notice, we change the version number and the date at the top. The version you agreed to is saved with your request.
`;
}

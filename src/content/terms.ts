// Terms of Service text (shown at /terms). Written in plain words from the project docs.
// It is NOT legal advice. The owner reads it and approves it before real clients use the site.
// It makes no promises about fees, government rules or how long a government office takes.
// The date and the contact details come from here and from the site settings.

export const TERMS_DATE = "2026-11-06";

type TermsInput = { contactEmail: string; contactPhone: string };

export function buildTerms({ contactEmail, contactPhone }: TermsInput): string {
  const contactLines = [
    contactEmail ? `- Email: ${contactEmail}` : null,
    contactPhone ? `- Phone, Viber: ${contactPhone}` : null,
  ].filter(Boolean);
  const contact =
    contactLines.length > 0
      ? contactLines.join("\n")
      : "- Please use the Contact page on this website.";

  return `## About these terms

These terms are between you and RG'S BOOKKEEPING AND ACCOUNTING SERVICES ("we", "us"), in the Philippines. They apply when you use this website to ask for a service, send documents, pay, or track a request. By sending a request you agree to these terms and to our privacy notice.

## What this website does

You can choose one of our services, send your details and documents, and follow your request with a tracking code. We help prepare and process paperwork for you. **We are not a government office.** A government office makes its own decisions and sets its own rules, fees and timing.

## What you agree to do

- Give true, complete and current information and documents. Do not send documents that are not yours, or that you are not allowed to send.
- Keep your tracking code to yourself. Anyone with the code and the last 4 digits of your mobile number can see the status of your request.
- Pay only to the account shown for your payment method, and check the account name before you pay.
- Do not misuse the website: no spam, no attempts to break in, no automated copying, no false payment receipts.

## Our services and what we cannot promise

- A service on this website is a request. We confirm with you what is needed, and any fees, **before** we start the work.
- Requirements, fees and rules of government offices can change. We will tell you what applies to your case. The information on this website is general.
- We cannot promise that a government office will approve a request, or how long it will take.
- If we need more documents, we will ask you. The work may wait until you send them.

## Payments

- You pay in your own GCash, Maya or bank app. **This website never takes money and never asks for your bank password or PIN.**
- The values you type or read from a receipt are only a note for us. A payment counts only after we find it in our own account and mark it as verified.
- A reference number can be used only once for the same payment method.
- If we cannot find your payment, we will tell you, and you can send a new receipt or contact us.
- Questions about refunds or cancellations: contact us before you pay, and we will tell you how we handle your case.

## Your documents and your information

We keep your documents private and delete them on the schedule written in the privacy notice. We use your information only as the privacy notice says. You may ask us to show, correct or delete your information at any time (see the privacy notice).

## Using this website

- We try to keep the website working, but we cannot promise it will always be available or free of errors.
- If the website has a problem, you can still reach us by Messenger, Viber or the Contact page.
- We may stop or change the website, and we may refuse a request that looks false, unsafe or abusive.

## Our responsibility

We take care in our work. To the extent the law allows, we are not responsible for: delays or decisions by government offices or banks; problems caused by false or incomplete information or documents you gave us; or losses that come from you sharing your tracking code or your account details with others. Nothing in these terms takes away rights that the law gives you.

## Changes to these terms

If we change these terms, we change the date at the top. Requests already sent stay under the terms that applied when you sent them.

## The law

These terms follow the laws of the Republic of the Philippines.

## Contact

${contact}
`;
}

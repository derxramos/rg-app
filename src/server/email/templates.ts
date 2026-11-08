import "server-only";

// Email templates: plain functions that return subject, html and text (docs/ARCHITECTURE.md section 8).
// Everything a client typed (name, message) is escaped before it goes into HTML, so nobody can send
// us an email with hidden links or markup.

export type Rendered = { subject: string; html: string; text: string };

const BUSINESS = "RG'S Bookkeeping and Accounting Services";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Removes new lines from a value used in a subject line (stops header tricks).
const oneLine = (value: string) =>
  value
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 120);

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f7f5;font-family:Arial,Helvetica,sans-serif;color:#121c1b">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px">
<h1 style="font-size:20px;margin:0 0 16px;color:#08463f">${escapeHtml(title)}</h1>
${bodyHtml}
<p style="margin:24px 0 0;font-size:12px;color:#4c5957">${escapeHtml(BUSINESS)}</p>
</div></body></html>`;
}

const p = (text: string) =>
  `<p style="font-size:16px;line-height:24px;margin:0 0 12px">${escapeHtml(text)}</p>`;
const button = (href: string, label: string) =>
  `<p style="margin:16px 0"><a href="${escapeHtml(href)}" style="display:inline-block;background:#0b6158;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">${escapeHtml(label)}</a></p>`;
const codeBox = (code: string) =>
  `<p style="font-family:Consolas,Menlo,monospace;font-size:28px;font-weight:bold;letter-spacing:2px;background:#e3f2ef;color:#08463f;padding:12px 16px;border-radius:8px;display:inline-block;margin:8px 0">${escapeHtml(code)}</p>`;

// ---------- To the admin inbox ----------

// A new request. No documents and no full phone number (docs/ARCHITECTURE.md section 8).
export function requestSubmittedAdmin(i: {
  trackingCode: string;
  serviceName: string;
  clientName: string;
  adminUrl: string;
}): Rendered {
  const subject = `New request ${i.trackingCode}: ${oneLine(i.serviceName)}`;
  const lines = [
    `A new request was sent.`,
    `Code: ${i.trackingCode}`,
    `Service: ${i.serviceName}`,
    `Client: ${i.clientName}`,
  ];
  return {
    subject,
    text: `${lines.join("\n")}\nOpen it: ${i.adminUrl}`,
    html: layout("New request", lines.map(p).join("") + button(i.adminUrl, "Open the request")),
  };
}

export function paymentSubmittedAdmin(i: {
  trackingCode: string;
  amount: string;
  method: string;
  reference: string;
  adminUrl: string;
}): Rendered {
  const lines = [
    `A payment was added to request ${i.trackingCode}.`,
    `Amount: ${i.amount}`,
    `Method: ${i.method}`,
    `Reference: ${i.reference}`,
    "Please check it in your own account before you verify it.",
  ];
  return {
    subject: `Payment submitted for ${i.trackingCode}`,
    text: `${lines.join("\n")}\nOpen it: ${i.adminUrl}`,
    html: layout(
      "Payment submitted",
      lines.map(p).join("") + button(i.adminUrl, "Open the request"),
    ),
  };
}

// A new message from the contact form. Reply-to is the client, so "Reply" goes to them.
export function contactFormAdmin(i: {
  name: string;
  email: string;
  phone: string;
  message: string;
}): Rendered {
  const lines = [`From: ${i.name}`, `Email: ${i.email}`, ...(i.phone ? [`Phone: ${i.phone}`] : [])];
  return {
    subject: `Contact form: ${oneLine(i.name)}`,
    text: `${lines.join("\n")}\n\n${i.message}`,
    html: layout(
      "Message from the contact form",
      lines.map(p).join("") +
        `<p style="font-size:16px;line-height:24px;white-space:pre-wrap;border-left:4px solid #0b6158;padding-left:12px;margin:12px 0">${escapeHtml(i.message)}</p>`,
    ),
  };
}

// ---------- To the owner ----------

// Alert when a payment method changes (threat T1, the QR swap).
export function paymentMethodChangedOwner(i: {
  who: string;
  what: string;
  when: string;
  adminUrl: string;
}): Rendered {
  const lines = [
    `A payment method was changed.`,
    `Who: ${i.who}`,
    `What: ${i.what}`,
    `When: ${i.when}`,
    "If you did not expect this, turn off the account and change the password now.",
  ];
  return {
    subject: "ALERT: a payment method was changed",
    text: `${lines.join("\n")}\nSee the activity log: ${i.adminUrl}`,
    html: layout(
      "Payment method changed",
      lines.map(p).join("") + button(i.adminUrl, "Open the activity log"),
    ),
  };
}

// ---------- To the owner: a payment was recorded by hand ----------

// Staff recorded a cash (or other offline) payment. The owners are told, so a mistake or a misuse is noticed.
export function offlinePaymentRecordedOwner(i: {
  who: string;
  trackingCode: string;
  amount: string;
  method: string;
  when: string;
  adminUrl: string;
}): Rendered {
  const lines = [
    `${i.who} recorded a payment made outside the website.`,
    `Request: ${i.trackingCode}`,
    `Amount: ${i.amount}`,
    `How: ${i.method}`,
    `When: ${i.when}`,
    "If this is not right, open the request and void the payment (owner or admin).",
  ];
  return {
    subject: `Payment recorded by ${oneLine(i.who)}: ${i.trackingCode}`,
    text: `${lines.join("\n")}\nOpen the request: ${i.adminUrl}`,
    html: layout(
      "Payment recorded by hand",
      lines.map(p).join("") + button(i.adminUrl, "Open the request"),
    ),
  };
}

// ---------- To a person whose account was changed ----------

// A change made to somebody's account (role, turned off or on, 2-step login reset). The person is told who
// did it and when, so a change nobody expected is noticed at once. No secrets are ever put in this email.
export function accountChanged(i: {
  title: string;
  name: string;
  lines: string[];
  when: string;
  loginUrl: string;
}): Rendered {
  const lines = [`Hello ${i.name || "there"}.`, ...i.lines, `When: ${i.when}`];
  const warning =
    "If you did not expect this change, contact the owner or the developer right away.";
  return {
    subject: oneLine(i.title),
    text: `${lines.join("\n")}\n\n${warning}\nSign in: ${i.loginUrl}`,
    html: layout(i.title, [...lines, warning].map(p).join("") + button(i.loginUrl, "Sign in")),
  };
}

// ---------- To the client ----------

export function requestSubmittedClient(i: {
  name: string;
  trackingCode: string;
  trackUrl: string;
}): Rendered {
  const intro = `Hello ${i.name}. We received your request. Please keep this tracking code. You need it, and the last 4 digits of your mobile number, to see where your request is.`;
  return {
    subject: `We received your request (${i.trackingCode})`,
    text: `${intro}\n\nTracking code: ${i.trackingCode}\nTrack it: ${i.trackUrl}\n\nWe will tell you if we need anything more.`,
    html: layout(
      "We received your request",
      p(intro) +
        codeBox(i.trackingCode) +
        button(i.trackUrl, "Track my request") +
        p("We will tell you if we need anything more."),
    ),
  };
}

// Status changes and messages from us. The message is shown as written.
export function statusChangedClient(i: {
  name: string;
  trackingCode: string;
  statusLabel: string;
  message: string | null;
  trackUrl: string;
}): Rendered {
  const intro = `Hello ${i.name}. Your request ${i.trackingCode} is now: ${i.statusLabel}.`;
  return {
    subject: `Update on your request ${i.trackingCode}: ${i.statusLabel}`,
    text: `${intro}\n${i.message ? `\nMessage from us:\n${i.message}\n` : ""}\nSee it here: ${i.trackUrl}`,
    html: layout(
      "Update on your request",
      p(intro) +
        (i.message
          ? `<p style="font-size:16px;line-height:24px;white-space:pre-wrap;background:#e1eefb;color:#174c8c;padding:12px;border-radius:8px">${escapeHtml(i.message)}</p>`
          : "") +
        button(i.trackUrl, "See my request"),
    ),
  };
}

// A message from us with no status change.
export function clientMessageClient(i: {
  name: string;
  trackingCode: string;
  message: string;
  trackUrl: string;
}): Rendered {
  const intro = `Hello ${i.name}. We have a message about your request ${i.trackingCode}.`;
  return {
    subject: `A message about your request ${i.trackingCode}`,
    text: `${intro}\n\n${i.message}\n\nSee it here: ${i.trackUrl}`,
    html: layout(
      "A message from us",
      p(intro) +
        `<p style="font-size:16px;line-height:24px;white-space:pre-wrap;background:#e1eefb;color:#174c8c;padding:12px;border-radius:8px">${escapeHtml(i.message)}</p>` +
        button(i.trackUrl, "See my request"),
    ),
  };
}

// A simple payment acknowledgment for the client, sent when the owner verifies the payment.
// It is NOT an official receipt, and it says so. The client already knows these values (they typed them).
export function paymentVerifiedClient(i: {
  name: string;
  trackingCode: string;
  amount: string;
  method: string;
  reference: string;
  paidOn: string;
  trackUrl: string;
}): Rendered {
  const intro = `Hello ${i.name}. We found your payment and marked it as verified. Thank you.`;
  const lines = [
    `Request: ${i.trackingCode}`,
    `Amount: ${i.amount}`,
    `Paid with: ${i.method}`,
    `Reference number: ${i.reference}`,
    `Date on your receipt: ${i.paidOn}`,
  ];
  const note =
    "This is a simple payment acknowledgment, not an official receipt. If you want an official receipt copy, please send us a message using the Contact page of our website.";
  return {
    subject: `Payment received for ${i.trackingCode}`,
    text: [intro, "", ...lines, "", note, "", `See your request: ${i.trackUrl}`].join("\n"),
    html: layout(
      "Payment received",
      p(intro) + lines.map(p).join("") + p(note) + button(i.trackUrl, "See my request"),
    ),
  };
}

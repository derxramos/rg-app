# FEATURES.md

User stories with acceptance checks. Format: **As a … I want … so that …**, then checks that must all pass.

"Client" = a member of the public. "Owner" = the business owner. "Staff" = other admin users. "Admin" = owner or staff.

---

## Public side

### P1 — Home page
As a client, I want to quickly understand what the business does so that I know if it can help me.
- [ ] Shows business name, short intro, main services, and a clear "Start a request" button.
- [ ] Shows "Track my request" link.
- [ ] Shows contact block with Messenger and Viber links (from settings).
- [ ] Texts come from `site_settings.home_texts` (editable in admin).
- [ ] Loads in under 3 seconds on a slow 3G phone test (Lighthouse "Slow 4G" + mid-tier phone setting, score ≥ 90 for performance).
- [ ] No government agency logos anywhere.

### P2 — Services list
As a client, I want to see all services so that I can pick the one I need.
- [ ] Shows only active services, in admin's order.
- [ ] Each card: name, short description, link to detail.
- [ ] Empty state if no services are active.

### P3 — Service detail with checklist
As a client, I want to see what documents I need so that I can prepare them.
- [ ] Shows description and the requirement checklist from the database.
- [ ] If the checklist is empty, shows: "Please contact us for the list of requirements." (no invented items).
- [ ] Shows "Start a request for this service" button (pre-selects the service).
- [ ] Shows a note that government fees and rules may change and the business will confirm.

### P4 — How it works
- [ ] Explains the steps: request → upload → pay by QR → we review → track.
- [ ] Says clearly that payment is done in the client's own GCash/Maya/bank app, not in this website.

### P5 — Contact page
As a client, I want to send a message so that I can ask questions.
- [ ] Fields: name, email, phone (optional), message. Zod checks on both sides.
- [ ] Turnstile widget. Server verifies the token.
- [ ] Rate limit: 5 messages per hour per IP.
- [ ] On success, email goes to the admin inbox through Brevo with reply-to = client email.
- [ ] If email fails, the client still sees a friendly message with the Messenger/Viber backup links.
- [ ] Shows business hours, address, phone, Messenger and Viber links.

### P6 — Privacy notice
- [ ] Explains: what data we collect, why, how long we keep it, who can see it, how to ask for access/correction/deletion, contact person.
- [ ] Has a version number and date. The request form links to it.
- [ ] Text is editable in admin (or a Markdown file in Phase 2; editable later).

### P7 — Start a request (step 1: service and contact details)
As a client, I want to start a request so that the business can help me.
- [ ] Choose service (or pre-selected from P3).
- [ ] Fields: full name, email, mobile number (PH format), business name (optional), message (optional).
- [ ] Consent checkbox (not pre-ticked) with link to privacy notice. Cannot continue without it.
- [ ] Turnstile check on this step.
- [ ] On success: request is saved with status **Draft**, a tracking code is shown big on screen with a "Copy" button and the advice "Save this code."
- [ ] A draft cookie is set so the next steps work on this phone.
- [ ] Rate limit: 5 new drafts per hour per IP.

### P8 — Upload documents (step 2)
As a client, I want to upload my documents so that the business can process my request.
- [ ] Shows the service checklist; client can attach files to each item, or to "Other".
- [ ] Accepts JPG, PNG, PDF only. Max size and max count come from settings.
- [ ] Images are compressed in the browser before upload. Shows progress for each file.
- [ ] Server rejects wrong real type (e.g. an .exe renamed to .jpg) with a clear message.
- [ ] Client can remove a file they just uploaded (only while status is Draft).
- [ ] Works on slow data: one file at a time, retry button on failure.
- [ ] Client can continue even if not all checklist items have files (the admin will ask later).

### P9 — Payment step (step 3, can be skipped)
As a client, I want to see how to pay so that I can pay with my own app.
- [ ] Shows active payment methods in admin's order: name, QR image, account name, number, instructions.
- [ ] Each QR has a "Save QR image" button and the account number has a "Copy" button.
- [ ] Clear warning: "Check that the account name is **[name]** before you pay."
- [ ] "Skip for now — I will pay later" button. Client can pay later from the tracking page.

### P10 — Receipt OCR and confirm (step 4)
As a client, I want the app to read my receipt so that I type less.
- [ ] Client picks the payment method and the receipt screenshot.
- [ ] The image is shown next to the form fields. **It is not uploaded.**
- [ ] "Read my receipt" fills reference number, amount, date. Payment method comes from the choice.
- [ ] Every field stays editable. Manual typing always works, even with no OCR.
- [ ] Client must tick "I checked that these values match my receipt."
- [ ] Server rejects a reference number already used for that payment method, with a clear message.
- [ ] Full details in OCR_PAYMENTS.md.

### P11 — Submit
- [ ] Shows a summary: service, contact details, number of files, payment values (or "Not paid yet").
- [ ] Submit sets status to **Submitted** (or **Payment submitted** if a payment was added).
- [ ] Client sees the tracking code again and a confirmation email is sent.
- [ ] Admin gets a "New request" email.

### P12 — Track my request
As a client, I want to check my request status so that I know what is happening.
- [ ] Inputs: tracking code + last 4 digits of mobile number. Turnstile check.
- [ ] Rate limits: per IP (10 per 15 min) and per tracking code (5 wrong tries → locked 15 min).
- [ ] Same error message for "wrong code" and "wrong digits" (so attackers learn nothing).
- [ ] Shows **only**: service name, current status, simple timeline (status + date), latest client message from admin.
- [ ] **Never** shows documents, file names, full phone, email, or payment details beyond "Payment received / verified".
- [ ] Shows "Pay now" if status allows payment.
- [ ] Shows "Upload more documents" only when status is "Waiting for client".

### P13 — Backup contact block
- [ ] On Home, Contact, Track, and error pages: Messenger and Viber buttons from settings.
- [ ] Hidden if the link is empty.

---

## Accounts (users)

### U1 — Create an account
As a client, I want an account so I can send requests and follow them.
- [ ] Full name, email, password (12+ characters), consent checkbox with Privacy notice and Terms links, Turnstile.
- [ ] Same answer whether or not the email is already used ("Check your email").
- [ ] I cannot sign in or send a request before I open the link in the email. "Send the link again" has a rate limit.

### U2 — Sign in, forgot and reset password
- [ ] One message for a wrong email and a wrong password. 5 tries per 15 minutes per place, 10 per email. Turnstile.
- [ ] After sign in I go back to the page I wanted (safe paths on this site only), or to `/account` (users) or `/admin` (admins).
- [ ] If my session ended I see "Your session ended" and come back to where I was.
- [ ] "Forgot your password?" always shows the same message. The email link opens `/reset-password`. A new password ends my other sessions.

### U3 — Header
- [ ] Visitor: "Sign in" (outline) next to the orange "Start a request". User: "My requests" and "Sign out". Admin: "Admin" and "Sign out". Same in the phone menu. No wrong state on the first page load.
- [ ] "Sign out" is a form button. After it I am on the home page with "You have been signed out." and the Back button does not show private pages.

### U4 — Start a request needs an account
- [ ] A visitor who clicks "Start a request" goes to sign in and comes back.
- [ ] The email on the request is my account email. Name and phone are filled from my profile.
- [ ] Sending the request needs a verified email.

### U5 — My requests
- [ ] A list of only my requests with status, code and date. Empty state with "Start a request". It refreshes by itself every minute.
- [ ] Another person's request, a made-up id and a missing request all show the same "not found" page.

### U6 — One request
- [ ] Status, timeline, the latest message from us, payment state, "Pay now" / "Upload more" only when the status allows.
- [ ] Documents: **names and dates only**, no way to open them.

### U7 — My details
- [ ] I can change my name and phone. I cannot change my email or my role.

### U8 — My data (Data Privacy Act)
- [ ] "Download my data" gives a JSON file with only my data (no internal notes, no files).
- [ ] "Delete my account": type DELETE, enter the password again. Refused while a request is open, and for admins. It erases my documents and personal fields, keeps a minimal record, and removes my login. Logged.

## Admin side

### A1 — Login with 2FA
As an admin, I want a safe login so that only we can see client data.
- [ ] Email + password on the shared `/login` page (users and admins). Admins are made by an owner ("Make admin" or invite), never by sign-up.
- [ ] While `ADMIN_REQUIRE_2FA` is "false": password only, and a red banner shows on every admin page. Otherwise: after password, asks for 6-digit TOTP code. First login forces 2FA setup (QR code for the authenticator app) and asks to add a backup device.
- [ ] 5 wrong logins from one IP in 15 min → slowed down/blocked for 15 min.
- [ ] Login success and failure are logged.
- [ ] Inactive admins cannot log in.

### A2 — Dashboard
- [ ] Counts by status (Submitted, Under review, Waiting for client, Payment submitted, In progress).
- [ ] "Needs action" list: newest Submitted and Payment submitted.
- [ ] Storage meter: used MB / 1024 MB, yellow at warning %, red at 95%.
- [ ] Emails sent today / 300.
- [ ] "Last cleanup" and "Last keep-alive" times, with warning if older than 3 days.

### A3 — Request list with filters
- [ ] Table: tracking code, client name, service, status, created date, payment state.
- [ ] Filters: status, service, date range, search by code/name/email.
- [ ] Pagination (25 per page). Works on a phone (cards on small screens).
- [ ] Drafts hidden by default (filter to show).

### A4 — Request detail
- [ ] Client info, service, consent date and version.
- [ ] Files list with "Open" (60-second signed link, logged). If files were deleted by cleanup, shows "Files deleted on [date]".
- [ ] Payments list with values, entry method (OCR / OCR edited / manual), method snapshot.
- [ ] Timeline of status changes.
- [ ] Internal notes (staff only) and client messages (shown on tracking + emailed).
- [ ] Change status: only allowed next statuses are offered. Optional message to client.

### A5 — Mark payment verified
- [ ] Button on each pending payment.
- [ ] A clear box above it: "**Check this payment in your own GCash / Maya / BDO app first.** The values here were typed or read by OCR from the client's screenshot. They can be wrong or fake."
- [ ] Admin must tick "I found this payment in our account" before the button works.
- [ ] Reject option with a reason (client sees a simple message).
- [ ] Both actions are logged.

### A6 — Settings: payment methods (owner only)
- [ ] List, add, edit, turn on/off, reorder, delete (delete only if no payments use it; otherwise turn off).
- [ ] Fields: name, parser (GCash/Maya/BDO/none), QR image, account name, number, instructions.
- [ ] Changing QR image, account name, or account number needs a fresh 2FA code.
- [ ] Every change is logged with before/after, and an alert email goes to the owner.
- [ ] Preview of how the client will see it.

### A7 — Settings: services and checklists
- [ ] Add, edit, turn on/off, reorder services.
- [ ] Add, edit, delete, reorder checklist items per service.
- [ ] New services start with an empty checklist.
- [ ] Public pages update after saving.

### A8 — Settings: site content
- [ ] Contact details, business hours, Messenger and Viber links, home page texts, privacy notice text and version.
- [ ] File settings: retention days, max files per request, max file size, storage warning %.
- [ ] Every change logged.

### A9 — Admin users (also: Make admin, Remove admin)
- [ ] Owner only, fresh 2FA code (while 2FA is on). "Make admin" turns an existing account into an admin (staff or owner). "Remove admin" turns the person back into a normal user. Both are logged as `role.changed`. The last active owner can never be removed.

### A9a — Admin users (invite) (owner only)
- [ ] Invite staff by email, set role, turn off access.
- [ ] Cannot turn off the last active owner.
- [ ] Needs a fresh 2FA code.

### A10 — Activity log
- [ ] List of actions with who, what, when. Filters: action type, admin, date.
- [ ] Payment method changes are highlighted.
- [ ] Read-only. Nobody can edit or delete entries from the app.

### A11 — CSV export
- [ ] Export requests and payments as CSV, with date range.
- [ ] Owner only (staff if the owner allows — open question).
- [ ] Each export is logged.
- [ ] CSV is safe against "formula injection" (values starting with `=`, `+`, `-`, `@` are escaped).
- [ ] Reminder text on dashboard: "Export a backup every week."

### A12 — Email retry
- [ ] Failed emails show on the request detail with a "Retry" button.

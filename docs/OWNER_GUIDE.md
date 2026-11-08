# How to use the admin area

For the owner and staff of RG'S Bookkeeping and Accounting Services. Plain words, step by step.

> This guide has no screenshots yet. Take them from the admin area **with fake data only** (names like "Test Client") and add them here. Never put a real client in a screenshot.

---

## 1. Logging in

1. Go to your website address and add `/admin/login`. Example: `https://your-site.com/admin/login`.
2. Type your **email** and **password**.
3. Open your **authenticator app** on your phone and type the **6-digit code**.

**The first time:** the site shows a picture (a QR code). Scan it with an authenticator app (Google Authenticator or Microsoft Authenticator). Type the first code. Then the site asks for a **second device as a backup** (step 2 of 2). You must do both before you can use the admin area. You can scan the same QR code on two phones. If you lose your only phone, there is no recovery code, so the backup device matters. Manage your devices any time on the **Security** page (the Security link at the top).

**Five wrong passwords** from one place block that place for 15 minutes.

---

## 2. Your day

Open **Dashboard**. It shows:

- how many requests are in each step (tap a number to see them)
- **Needs action**: new requests and new payments
- **File storage**: the bar turns yellow when it gets full, red when it is almost full
- **Emails today** out of 300
- the last time the **cleanup** and **keep-alive** jobs ran. If one says "check the job", see section 8

On a phone, use the bar at the bottom: Dashboard, Requests, Settings, Activity.

### A new request

1. Tap it in **Needs action**, or find it in **Requests** (search by code, name or email).
2. Read the client details and the **Files**. Tap **Open (new tab)** to see a document. Every open is written to the activity log. The link works for 60 seconds.
3. Change the **status** when you start work. You can write a message for the client. They get an email and see it on the tracking page.

### Checking a payment (the most important step)

> **Always check the payment in your own GCash, Maya or BDO account first.** The numbers on the screen were typed or read by a computer from the client's screenshot. They can be wrong or fake.

1. Open the request. Find the payment card.
2. Open your own app. Find the payment with the same reference number and amount.
3. Tick **"I found this payment in our account."**
4. Tap **Mark payment verified**.
5. The client gets a short email: a simple payment acknowledgment (amount, method, reference, date). It says it is **not an official receipt**. If the client wants an official receipt copy, they send you a message with the Contact page.

**Only the owner** can verify or reject a payment. Staff can see payments but the buttons are not for them.

If you cannot find it: write a short reason and tap **Reject payment**. The client sees your reason and can send a new receipt.

### Notes and messages

- **Yellow box with a lock** = internal note. Only staff see it.
- **Blue box with a send arrow** = a message to the client. They see it on the tracking page and get an email.

### If an email did not send

On the request, look at **Emails**. If you see **Email not sent**, tap **Retry**. If it fails again, the email settings need a look. The request itself is fine.

---

## 3. What clients can see

On the tracking page a client sees only: the service, the status, a timeline, **your message**, and a line about payment. They never see their documents, their email or phone, or any payment details. The page closes after 1 hour.

---

## 4. Settings

### Roles: who can do what

| Role | Who | What they can use |
|---|---|---|
| **Owner** | You | Everything |
| **Admin** | The developer | Everything an owner can do, except changing an owner account |
| **Staff** | An employee | Only **Requests** (change status, notes, open client documents), **Services and checklists** (words only) and **Activity** (read only) |

Staff **cannot**: verify a payment, change a fee, hide or delete a service, delete anything, see the Dashboard, Payment methods, Site content, File settings, Admin users or Export, or make accounts. If staff try to open a page that is not for them, they see "Not allowed" and the try is written in the Activity page. Staff see a smaller menu: Requests, Services, Activity.

### Services and checklists (owner, admin and staff)

- Add a service. A service added by **staff** starts hidden and with no fee. An owner or admin sets the fee and shows it. A new service starts with an **empty checklist**.
- Add only the documents you are **sure** about. Clients read them. If the list is empty, clients see "Please contact us for the list of requirements."
- Do not write fees or government rules you are not sure about.
- Changes show on the website at once.

### Site content (owner and admin)

Phone, email, address, hours, the **Messenger** and **Viber** links, and the home page text. An empty link hides its button. Links must start with `https://`.

### Payment methods (owner and admin)

- Clients see the **active** methods in the order you set.
- **Be very careful here.** A wrong QR code or account number sends clients' money to the wrong place.
- Changing the QR picture, the account name or the account number needs a **fresh code** from your authenticator app. Every change is saved in the activity log and you get an **alert email**.
- You cannot delete a method that was used for a payment. Turn it off instead.
- The first methods shipped with the app are marked **SAMPLE, not real**. Replace them before you turn them on.

### File settings (owner and admin)

How many days files are kept after a request is Completed or Cancelled (start: 30), the most files per request (15), the biggest file (3 MB), and the storage warning (80 percent).

### Admin users (owner and admin)

A table of every account. Search by name or email, filter by role and status, choose how many rows per page.

- **Invite** a person as staff or admin (only an owner can invite an owner). By email, or with a temporary password that the person must change at the first sign in.
- **Actions** on a row: **Change role**, **Reset 2-step login**, **Turn account off or on**, **Resend invite**. There is no delete.
- Every change needs **your own** code from your authenticator app. The person gets an email, and the change is in the Activity page.
- You cannot change, turn off or reset your own account. There is always at least one active owner. Only an owner can change an owner.

**A colleague lost their phone?** First make sure it is really them (call them). Then use **Reset 2-step login** on their row. Type their email to confirm. They are signed out everywhere and must set up a new app and a backup device. If the colleague is an owner, every owner gets an email.

---

## 5. Activity log

**Activity** lists who did what and when. Payment method changes are highlighted. **Nobody can change or delete these lines.**

---

## 6. Every week: export a backup

1. Open **Export**.
2. Download **requests** and **payments** as CSV files.
3. Keep them safe. They have your clients' personal data. Delete old ones.

The free database plan has **no automatic backups**.

---

## 7. A client asks to delete their data

Open the request. Use **Delete client data (privacy request)**. Type **DELETE** and a fresh code. The files are deleted and the name, email, phone and messages are cleared. A small record stays for your accounts (the code, the service, dates and payment values). This cannot be undone. It is written in the activity log.

---

## 8. When something goes wrong

| What you see | What to do |
|---|---|
| **A payment method changed and you did not do it** | Turn off that method. Check the activity log for who. Turn off that account. Change the password. Tell the developer. Think about which clients paid since the change |
| **You lost your phone (the authenticator)** | Use your backup device, then add a new device on the **Security** page. If you have none, ask another owner or the admin to **Reset 2-step login** for you. If nobody can, the developer can do it in Supabase (see docs/RECOVERY.md) after calling you to check it is really you |
| **A cleanup or keep-alive job says "check the job"** | Open GitHub > Actions > Scheduled jobs > Run workflow. If it fails, send the error to the developer |
| **Storage is red** | Lower the days files are kept, or ask the developer to clean up. New uploads stop at 95 percent |
| **The site says it cannot send emails** | Clients and you can still use Messenger and Viber. Tell the developer |
| **Vercel says a usage limit is almost reached** | The site may pause. Avoid new deployments and tell the developer. Also check Vercel's terms about using the free plan for a business |
| **You think data was leaked** | Turn off all admin accounts except yours. Tell the developer. Write down what happened. The law may require you to tell clients and the National Privacy Commission. Ask a lawyer |

---

## 9. Words used

- **2FA**: a second check. A 6-digit code from your phone, after the password.
- **Tracking code**: the `RG-XXXXXXXX` code the client gets.
- **Draft**: a request the client started but did not send. It is deleted after 7 days.
- **OCR**: the computer reading text from a picture. It only saves typing. It does not prove a payment.

**Make an existing account an admin.** The person first creates an account on the website (Sign in > Create an account) and opens the email link. Then go to Settings > Admin users > "Make an existing account an admin", type their email and choose Staff or Owner. To take the role away, press "Remove admin" next to their name: they become a normal user again.

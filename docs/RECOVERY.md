# RECOVERY.md

What to do when someone loses access. Plain English on purpose.

> Nothing in this file has been tested on a live Supabase project yet. Test the steps on your **test** project first.

## The three layers (try them in this order)

| Layer | When | Who does it |
|---|---|---|
| 1. Backup device | Lost phone, but the person has a second device | The person, on the Security page |
| 2. Reset by another person | Lost phone, no second device | An **owner** or an **admin**, in the app |
| 3. Last resort | Nobody can sign in, or no owner or admin is left to reset | The **developer**, in the Supabase dashboard |

**Forgot password does not bring back a lost authenticator.** An email code, a PIN or a recovery code for staff, admin and owner accounts is **not allowed**: it would make 2-step login useless, because anyone who gets into the email could then skip it.

---

## Layer 1: a backup device

Every staff, admin and owner account has two authenticator devices (the app and a backup), because the setup does not finish without them. A code from **either** device works at sign in.

If the main phone is lost:
1. Sign in with the **backup** device.
2. Open **Security** (the link in the admin header).
3. Add a new device (**Add a device**), then remove the lost one (**Remove**). Removing needs a code from a **different** device.
4. The last device can never be removed, so you are never left with none.

---

## Layer 2: reset by another person

For a person with no second device.

1. An **owner** or an **admin** signs in (not the person who lost the phone).
2. First **check who is asking** (see "How to confirm a person" below).
3. Settings > **Admin users**. Find the person (search by name or email).
4. **Actions > Reset 2-step login.**
5. Enter **your own** 6-digit code (it is the code of YOU, not of the other person). If you have no authenticator yet and 2-step login is switched off, the box asks for your own account password.
6. Type the **full email** of the person you are resetting. Press the button.

What the system does:
- removes all authenticator devices of that person (the Supabase secret key is used on the server, never in the browser),
- signs that person out everywhere,
- writes the activity log (`account.2fa_reset`: who, whom, when),
- sends an email to that person. **If the person is an owner, it also sends an email to every active owner.**

At the next sign in the person must set up a **new** authenticator app and a **backup** device before they reach the admin area.

Rules:
- Nobody can reset themselves.
- Owner and admin can reset each other (this is how a lost owner phone is fixed). An admin still cannot demote or turn off an owner.
- Staff cannot reset anybody.

---

## Layer 3: last resort, in the Supabase dashboard

Only the **developer** does this. Use it when no owner or admin can sign in to do layer 2, or when layer 2 does not work.

### 3a. First confirm the person
Do **not** remove a device only because of an email, a chat message or a text. Someone may be pretending.
- Call the person on a phone number you already knew (not one written in the message), **or** meet in person.
- Ask something only the real person would know (for example the name of a recent client request).
- If the person is an owner, also tell the other owners, if there are any.
- Write down who asked, who confirmed, how, and when.

### 3b. Remove the device
1. Open the Supabase dashboard, your project.
2. **Authentication > Users**. Search for the person's email and open the user.
3. Find the **multi-factor** (MFA) factors and remove them (the "Delete factor" button or the three-dot menu on each factor). Remove all of them.
   - Removing a verified factor signs the person out of every session.
   - The page layout changes between Supabase versions. If you cannot find the factors, search the Supabase docs for "delete MFA factor" or use the SQL step below.
4. Check with SQL (the SQL Editor, this only reads):
   ```sql
   select f.id, f.friendly_name, f.status, f.created_at
   from auth.mfa_factors f join auth.users u on u.id = f.user_id
   where u.email = '<PERSON EMAIL>';
   ```
   It must show no rows.
5. Make the person set up again (this keeps the same rule as layer 2: two devices):
   ```sql
   update public.profiles
   set mfa_reset_required = true, sessions_revoked_at = now()
   where email = '<PERSON EMAIL>';
   ```
6. Write the event in the activity log by hand (so the owner can see it):
   ```sql
   insert into public.activity_log (actor_type, action, entity_type, entity_id, details)
   select 'system', 'account.2fa_reset', 'account', id::text,
          jsonb_build_object('email', email, 'method', 'dashboard', 'note', 'Identity confirmed by phone call')
   from public.profiles where email = '<PERSON EMAIL>';
   ```
7. Tell the person to sign in. They will set up a new authenticator and a backup device.

### If the only owner is locked out
Do the same steps for the owner. The system always keeps at least one active owner, so you do not need to make a new owner first.

---

## Recovery for regular users (clients)

Clients have **no** authenticator. They recover their account like this:
- **Forgot your password?** on the sign in page. They get an email link and choose a new password. The old password stops working.
- **Continue with Google**, if they signed up with Google (when Google sign in is switched on).
- Their requests are not lost: they belong to the account. A guest request can always be followed with the tracking code and the last 4 digits of the phone.
- If a client cannot open their email at all, the owner can still help them over the phone. Admins cannot read or reset a client's password. They can only turn the account off or on.

---

## Prevent it

- Add a backup device the first day (the setup makes you).
- Scan the same QR code on two phones if you only have one person.
- Keep at least **two people** who can reset: for example one owner and one admin.
- Test layer 2 once on the test project, with a test account (an email like `zolb-test+...@example.com`).

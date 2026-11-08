# Clean-up before hand-over

Goal: the owner starts with a system that looks brand new. Only **two accounts stay** (you name them in the script).
Services, checklists, payment methods and settings stay. This cannot be undone, so follow the order.

## 1. Backup first (10 minutes)
1. Admin > **Export**: download the CSV files and keep them somewhere private.
2. Supabase dashboard > **Database > Backups**: make sure a recent backup exists (or download one).
3. Apply migration 0008 if you have not yet: `pnpm db:migrate` (see `docs/DEPLOY_RUNBOOK.md`).

## 2. The database
1. Open Supabase > **SQL Editor**. Paste `scripts/cleanup-before-handover.sql`.
2. Run **PART 1** (the first block, read only). Read it: are there real clients you must not lose? Are there sample services?
3. In **PART 2**, replace `OWNER_EMAIL_HERE` and `DEVELOPER_ADMIN_EMAIL_HERE` with the two emails, then run PART 2.
   It checks the two accounts first and stops with an error (changing nothing) if anything looks wrong.
4. Run **PART 3**. Expected: 2 accounts, 0 requests, 0 payments, 0 file rows, 0 emails.

What it removes: all requests, payments, file rows, notes, status history, email log, rate-limit rows, and every sign-in
account except the two (their profiles, 2-step devices and sessions go with them).
What it keeps: services, checklists, payment methods, site settings and the activity log (it is append-only on purpose;
one new line says the system was cleaned).

## 3. Storage (by hand: Supabase does not allow deleting files with SQL)
1. Supabase > **Storage**. Open the **private** client files bucket (its name is in `SUPABASE_BUCKET_CLIENT_FILES`).
2. Select all folders and files, then **Delete**. Check that the bucket is empty.
3. Open the **public** bucket. Delete test or sample pictures only. **Keep the real QR code pictures** used by the payment methods.

## 4. Look for sample content (2 minutes)
- Admin > Settings > Services: rename or remove services such as "Test ...". Check that fees and checklists are the owner's.
- Admin > Settings > Payments: every QR and account number must be the real one.
- Admin > Settings > Site content: the contact phone, email, address and social links are the real ones.

## 5. Smoke test
Sign in as the owner (2-step login works), open each admin page, and send one test message from the Contact page.

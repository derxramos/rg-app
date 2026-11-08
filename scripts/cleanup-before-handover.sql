-- CLEAN-UP BEFORE HAND-OVER (run by a person, in the Supabase SQL editor of the LIVE project).
-- Nothing in this repository runs it. It makes the database look brand new: it keeps ONLY the two accounts you
-- name below, and all the settings, services, checklists and payment methods.
--
-- ORDER: 1) take the backup in docs/CLEANUP_BEFORE_HANDOVER.md  2) run PART 1 (read only) and look at it
--        3) put the two emails in PART 2 and run PART 2 (one transaction: it all happens or nothing does)
--        4) run PART 3 (read only check)  5) clean the storage bucket by hand (the document says how).
-- This cannot be undone. Apply migration 0008 first (pnpm db:migrate).

-- ============================== PART 1: look first (read only) ==============================
select p.email, p.full_name, p.role, p.is_active from public.profiles p order by p.role, p.email;
select 'requests' as t, count(*) from public.requests
union all select 'payments', count(*) from public.payments
union all select 'request_files', count(*) from public.request_files
union all select 'request_notes', count(*) from public.request_notes
union all select 'request_status_events', count(*) from public.request_status_events
union all select 'email_log', count(*) from public.email_log
union all select 'rate_limits', count(*) from public.rate_limits
union all select 'profiles', count(*) from public.profiles
union all select 'auth.users', count(*) from auth.users
union all select 'activity_log (kept)', count(*) from public.activity_log;
select slug, name, is_active from public.services order by sort_order;  -- look for "Test" or sample services

-- ============================== PART 2: the clean-up (one transaction) ==============================
begin;

-- >>> EDIT THESE TWO EMAILS: the owner account and the developer admin account. <<<
create temporary table keep_emails (email text primary key) on commit drop;
insert into keep_emails values (lower('OWNER_EMAIL_HERE')), (lower('DEVELOPER_ADMIN_EMAIL_HERE'));

-- Safety checks: stop (and undo everything) unless exactly those two accounts exist and are right.
do $$
declare found_count int; owners int; admins int;
begin
  select count(*) into found_count from public.profiles p join keep_emails k on lower(p.email) = k.email;
  if found_count <> 2 then
    raise exception 'Expected exactly 2 accounts to keep, found %. Check the two emails.', found_count;
  end if;
  select count(*) into owners from public.profiles p join keep_emails k on lower(p.email) = k.email
    where p.role = 'owner' and p.is_active;
  select count(*) into admins from public.profiles p join keep_emails k on lower(p.email) = k.email
    where p.role = 'admin' and p.is_active;
  if owners <> 1 or admins <> 1 then
    raise exception 'The two accounts must be one active owner and one active admin (found % owner, % admin).', owners, admins;
  end if;
end $$;

-- 1. All requests and everything that hangs on them (payments first: they are "restrict").
delete from public.payments;
delete from public.request_files;          -- the rows only; the files in Storage are deleted by hand
delete from public.request_notes;
delete from public.request_status_events;
delete from public.email_log;
delete from public.requests;
delete from public.rate_limits;

-- 2. Links that point at accounts we are about to remove.
update public.payment_methods set updated_by = null
  where updated_by is not null
    and updated_by not in (select p.id from public.profiles p join keep_emails k on lower(p.email) = k.email);
update public.site_settings set updated_by = null
  where updated_by is not null
    and updated_by not in (select p.id from public.profiles p join keep_emails k on lower(p.email) = k.email);

-- 3. All other accounts. Deleting the sign-in user also removes the profile, 2-step devices and sessions.
delete from auth.users
  where id not in (select p.id from public.profiles p join keep_emails k on lower(p.email) = k.email);

-- 4. One note in the (append-only) activity log, so the owner can see when the system was cleaned.
insert into public.activity_log (actor_type, action, entity_type, details)
  values ('system', 'system.cleaned_before_handover', 'system',
          jsonb_build_object('note', 'All test data removed before hand-over.'));

-- Final check inside the transaction: still exactly the two accounts, and an active owner.
do $$
begin
  if (select count(*) from public.profiles) <> 2 or (select count(*) from auth.users) <> 2 then
    raise exception 'After the clean-up there must be exactly 2 accounts. Nothing was changed.';
  end if;
  if (select count(*) from public.profiles where role = 'owner' and is_active) < 1 then
    raise exception 'There must be an active owner. Nothing was changed.';
  end if;
end $$;

commit;

-- ============================== PART 3: check (read only) ==============================
select email, role, is_active from public.profiles order by role;
select 'requests' as t, count(*) from public.requests
union all select 'payments', count(*) from public.payments
union all select 'request_files', count(*) from public.request_files
union all select 'email_log', count(*) from public.email_log
union all select 'auth.users', count(*) from auth.users
union all select 'services (kept)', count(*) from public.services
union all select 'payment_methods (kept)', count(*) from public.payment_methods;
-- The files in Storage are not counted above. Check them in Storage (the document says how).
select bucket_id, count(*) as files from storage.objects group by 1;

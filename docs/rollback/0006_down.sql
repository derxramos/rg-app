-- UNDO for drizzle/0006_single_role.sql. It is NOT part of the normal migrations (it lives in docs/, so
-- `pnpm db:migrate` never runs it). Read docs/DEPLOY_RUNBOOK.md section C before you use it.
--
-- What it does: puts the database back to the shape it had after migration 0005
--   - admin_profiles comes back, filled from profiles (staff -> staff, admin -> owner, owner -> owner;
--     the old model only knows "owner" and "staff", and an admin has the same power as an owner)
--   - profiles.role goes back to user | admin (every staff, admin and owner becomes "admin")
--   - public.is_admin() and the old Row Level Security policies come back
--   - the old last-owner trigger moves back to admin_profiles
--   - the new columns, the private schema and the new triggers are removed
-- What it LOSES (the old model has no place for it): is_active of a client, mfa_reset_required,
-- sessions_revoked_at, and last_login_at of an account that is not staff/admin/owner.
-- A turned-off staff, admin or owner stays turned off (admin_profiles.is_active).
--
-- Run it ONCE, in the Supabase SQL editor, on the project that was migrated. Everything is in one transaction:
-- if any line fails, nothing is changed.

BEGIN;

-- 1. The old types and the old table
CREATE TYPE public.admin_role AS ENUM ('owner', 'staff');
CREATE TYPE public.app_role AS ENUM ('user', 'admin');

CREATE TABLE public.admin_profiles (
  id uuid PRIMARY KEY,
  full_name text NOT NULL,
  email text NOT NULL,
  role public.admin_role NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  last_login_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;

-- 2. Fill it from profiles
INSERT INTO public.admin_profiles (id, full_name, email, role, is_active, last_login_at, created_at)
SELECT p.id,
       p.full_name,
       p.email,
       CASE WHEN p.role::text = 'staff' THEN 'staff'::public.admin_role ELSE 'owner'::public.admin_role END,
       p.is_active,
       p.last_login_at,
       p.created_at
FROM public.profiles p
WHERE p.role::text IN ('staff', 'admin', 'owner');

-- Old notes, payments and so on may point to a person who is a client now. The old links need a row, so that
-- person gets a turned-off staff row (they cannot open the admin area).
INSERT INTO public.admin_profiles (id, full_name, email, role, is_active)
SELECT DISTINCT p.id, p.full_name, p.email, 'staff'::public.admin_role, false
FROM public.profiles p
WHERE p.id NOT IN (SELECT id FROM public.admin_profiles)
  AND p.id IN (
    SELECT updated_by FROM public.payment_methods WHERE updated_by IS NOT NULL
    UNION SELECT verified_by FROM public.payments WHERE verified_by IS NOT NULL
    UNION SELECT author_id FROM public.request_notes
    UNION SELECT changed_by FROM public.request_status_events WHERE changed_by IS NOT NULL
    UNION SELECT updated_by FROM public.site_settings WHERE updated_by IS NOT NULL
  );

-- 3. The new triggers and policies go away first (they use the private schema)
DROP TRIGGER IF EXISTS profiles_guard_changes ON public.profiles;
DROP TRIGGER IF EXISTS profiles_guard_delete ON public.profiles;
DROP TRIGGER IF EXISTS profiles_protect_last_owner ON public.profiles;
DROP TRIGGER IF EXISTS payments_guard_changes ON public.payments;
DROP TRIGGER IF EXISTS services_guard_changes ON public.services;
DROP TRIGGER IF EXISTS services_guard_delete ON public.services;
DROP TRIGGER IF EXISTS service_payment_methods_guard ON public.service_payment_methods;
DROP TRIGGER IF EXISTS requests_guard_delete ON public.requests;
DROP TRIGGER IF EXISTS request_files_guard_delete ON public.request_files;
DROP TRIGGER IF EXISTS request_notes_guard_delete ON public.request_notes;
DROP TRIGGER IF EXISTS service_requirements_guard_delete ON public.service_requirements;
DROP TRIGGER IF EXISTS payment_methods_guard_delete ON public.payment_methods;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    DROP POLICY IF EXISTS profiles_select ON public.profiles;
    DROP POLICY IF EXISTS requests_select ON public.requests;
    DROP POLICY IF EXISTS request_status_events_select ON public.request_status_events;
    DROP POLICY IF EXISTS request_files_select ON public.request_files;
    DROP POLICY IF EXISTS payments_select ON public.payments;
    DROP POLICY IF EXISTS request_notes_select ON public.request_notes;
  END IF;
END $$;

DROP SCHEMA private CASCADE;

-- 4. profiles.role goes back to user | admin, and the new columns are removed
ALTER TABLE public.profiles ALTER COLUMN role DROP DEFAULT;
ALTER TABLE public.profiles
  ALTER COLUMN role TYPE public.app_role
  USING (CASE WHEN role::text IN ('staff', 'admin', 'owner') THEN 'admin' ELSE 'user' END)::public.app_role;
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'user';
ALTER TABLE public.profiles DROP COLUMN is_active;
ALTER TABLE public.profiles DROP COLUMN last_login_at;
ALTER TABLE public.profiles DROP COLUMN mfa_reset_required;
ALTER TABLE public.profiles DROP COLUMN sessions_revoked_at;
DROP TYPE public.account_role;

-- 5. The old links point to admin_profiles again
ALTER TABLE public.payment_methods DROP CONSTRAINT payment_methods_updated_by_profiles_id_fk;
ALTER TABLE public.payments DROP CONSTRAINT payments_verified_by_profiles_id_fk;
ALTER TABLE public.request_notes DROP CONSTRAINT request_notes_author_id_profiles_id_fk;
ALTER TABLE public.request_status_events DROP CONSTRAINT request_status_events_changed_by_profiles_id_fk;
ALTER TABLE public.site_settings DROP CONSTRAINT site_settings_updated_by_profiles_id_fk;
ALTER TABLE public.payment_methods ADD CONSTRAINT payment_methods_updated_by_admin_profiles_id_fk FOREIGN KEY (updated_by) REFERENCES public.admin_profiles(id) ON DELETE no action ON UPDATE no action;
ALTER TABLE public.payments ADD CONSTRAINT payments_verified_by_admin_profiles_id_fk FOREIGN KEY (verified_by) REFERENCES public.admin_profiles(id) ON DELETE no action ON UPDATE no action;
ALTER TABLE public.request_notes ADD CONSTRAINT request_notes_author_id_admin_profiles_id_fk FOREIGN KEY (author_id) REFERENCES public.admin_profiles(id) ON DELETE no action ON UPDATE no action;
ALTER TABLE public.request_status_events ADD CONSTRAINT request_status_events_changed_by_admin_profiles_id_fk FOREIGN KEY (changed_by) REFERENCES public.admin_profiles(id) ON DELETE no action ON UPDATE no action;
ALTER TABLE public.site_settings ADD CONSTRAINT site_settings_updated_by_admin_profiles_id_fk FOREIGN KEY (updated_by) REFERENCES public.admin_profiles(id) ON DELETE no action ON UPDATE no action;

-- 6. The old triggers: updated_at, and the last-owner rule on admin_profiles
CREATE TRIGGER admin_profiles_set_updated_at BEFORE UPDATE ON public.admin_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.protect_last_owner() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  losing_owner boolean;
  other_owners integer;
BEGIN
  losing_owner := OLD.role = 'owner' AND OLD.is_active AND (
    TG_OP = 'DELETE' OR NEW.role <> 'owner' OR NOT NEW.is_active
  );

  IF NOT losing_owner THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('admin_profiles_last_owner'));

  SELECT count(*) INTO other_owners
  FROM public.admin_profiles
  WHERE role = 'owner' AND is_active AND id <> OLD.id;

  IF other_owners = 0 THEN
    RAISE EXCEPTION 'There must always be at least one active owner.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER admin_profiles_protect_last_owner BEFORE UPDATE OR DELETE ON public.admin_profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_last_owner();

-- 7. The old is_admin() and the old policies (only where Supabase exists)
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.admin_profiles a ON a.id = p.id
    WHERE p.id = auth.uid() AND p.role = 'admin' AND a.is_active
  );
END;
$$;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;

DO $$
DECLARE
  stmt text;
BEGIN
  IF NOT (
    EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
    AND EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'auth' AND p.proname = 'uid'
    )
  ) THEN
    RAISE NOTICE 'No Supabase auth schema: policies skipped.';
    RETURN;
  END IF;

  FOREACH stmt IN ARRAY ARRAY[
    $q$REVOKE ALL ON public.admin_profiles FROM anon, authenticated$q$,
    $q$GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated$q$,
    $q$CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
         USING (id = (SELECT auth.uid()) OR public.is_admin())$q$,
    $q$CREATE POLICY requests_select ON public.requests FOR SELECT TO authenticated
         USING (user_id = (SELECT auth.uid()) OR public.is_admin())$q$,
    $q$CREATE POLICY request_status_events_select ON public.request_status_events FOR SELECT TO authenticated
         USING (
           EXISTS (SELECT 1 FROM public.requests r
                   WHERE r.id = public.request_status_events.request_id AND r.user_id = (SELECT auth.uid()))
           OR public.is_admin()
         )$q$,
    $q$CREATE POLICY request_files_select ON public.request_files FOR SELECT TO authenticated
         USING (
           EXISTS (SELECT 1 FROM public.requests r
                   WHERE r.id = public.request_files.request_id AND r.user_id = (SELECT auth.uid()))
           OR public.is_admin()
         )$q$,
    $q$CREATE POLICY payments_select ON public.payments FOR SELECT TO authenticated
         USING (
           EXISTS (SELECT 1 FROM public.requests r
                   WHERE r.id = public.payments.request_id AND r.user_id = (SELECT auth.uid()))
           OR public.is_admin()
         )$q$,
    $q$CREATE POLICY request_notes_select ON public.request_notes FOR SELECT TO authenticated
         USING (
           (visibility = 'client' AND EXISTS (SELECT 1 FROM public.requests r
                   WHERE r.id = public.request_notes.request_id AND r.user_id = (SELECT auth.uid())))
           OR public.is_admin()
         )$q$
  ] LOOP
    EXECUTE stmt;
  END LOOP;
END $$;

-- 8. The link to the Supabase login table (only where it exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users'
  ) THEN
    ALTER TABLE public.admin_profiles
      ADD CONSTRAINT admin_profiles_id_auth_users_fk
      FOREIGN KEY (id) REFERENCES auth.users (id) ON DELETE CASCADE;
  END IF;
END $$;

COMMIT;

-- After this, also remove the record of migration 0006, so `pnpm db:migrate` can run it again later:
--   delete from drizzle.__drizzle_migrations
--   where id = (select max(id) from drizzle.__drizzle_migrations);
-- (Check first with: select id, created_at from drizzle.__drizzle_migrations order by id;  the last row must be 0006.)

-- Hand-written migration (Drizzle cannot describe these parts). It follows 0002_accounts_and_roles.sql,
-- which made the profiles table and requests.user_id.
-- Read docs/AUTH_AND_ROLES.md and docs/DATABASE.md for the reasons behind each block.
--
-- Parts that need Supabase (the "auth" schema, the anon/authenticated roles, the "storage" schema) run
-- only when those exist. So this file also works on a plain local Postgres.

-- ============================================================
-- 1. profiles.updated_at is always fresh
-- ============================================================
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint

-- ============================================================
-- 2. A user can never change their own role
-- ============================================================
-- The two public roles (what a logged-in browser or app user runs as) cannot create a profile with a role
-- other than "user", and cannot change a role. Our server and the Supabase SQL editor run as the database
-- owner, so the owner can still make an admin.
CREATE OR REPLACE FUNCTION public.protect_profile_role() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' AND NEW.role <> 'user' THEN
      RAISE EXCEPTION 'A new account must have the role user.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'The role of an account cannot be changed this way.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER profiles_protect_role BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role();
--> statement-breakpoint

-- ============================================================
-- 3. Every new sign-up gets a profile with role "user"
-- ============================================================
-- The role is NEVER read from the sign-up data. A broken trigger would block every sign-up, so a failure
-- here only writes a warning. The app also creates a missing profile on first use (as "user").
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    coalesce(NEW.email, ''),
    left(coalesce(NEW.raw_user_meta_data ->> 'full_name', ''), 100)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
--> statement-breakpoint

-- Link profiles to Supabase Auth and start the trigger (only where the auth schema exists).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'auth' AND table_name = 'users'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_id_auth_users_fk
      FOREIGN KEY (id) REFERENCES auth.users (id) ON DELETE CASCADE;
    CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;
--> statement-breakpoint

-- ============================================================
-- 4. Fill in profiles for people who already exist
-- ============================================================
-- Everyone with a login gets a profile. Everyone already in admin_profiles becomes "admin".
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'auth' AND table_name = 'users'
  ) THEN
    EXECUTE $q$
      INSERT INTO public.profiles (id, email, full_name)
      SELECT u.id, coalesce(u.email, ''), left(coalesce(u.raw_user_meta_data ->> 'full_name', ''), 100)
      FROM auth.users u
      ON CONFLICT (id) DO NOTHING
    $q$;
  END IF;
END $$;
--> statement-breakpoint

INSERT INTO public.profiles (id, email, full_name, role)
SELECT a.id, a.email, a.full_name, 'admin' FROM public.admin_profiles a
ON CONFLICT (id) DO UPDATE SET role = 'admin';
--> statement-breakpoint

-- ============================================================
-- 5. is_admin(): is the logged-in person an active admin?
-- ============================================================
-- Written in plpgsql so it can be created before the auth schema exists. The policies below call it.
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
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
--> statement-breakpoint

-- ============================================================
-- 6. Row Level Security policies and table rights for logged-in users
-- ============================================================
-- A logged-in user (the "authenticated" role) may READ only their own rows. They get NO insert, update
-- or delete rights, except for their own name and phone on profiles. The "anon" role gets nothing.
-- Column rights hide private columns (draft token, tracking lock, storage paths, author ids).
-- Our server uses these rules by running user pages inside "set local role authenticated" (withUserRls).
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
    RAISE NOTICE 'Supabase auth schema or authenticated role not found: policies skipped.';
    RETURN;
  END IF;

  FOREACH stmt IN ARRAY ARRAY[
    $q$GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated$q$,

    $q$GRANT SELECT ON public.services TO authenticated$q$,
    $q$CREATE POLICY services_read ON public.services FOR SELECT TO authenticated USING (true)$q$,

    $q$GRANT SELECT (id, email, full_name, phone, role, created_at, updated_at) ON public.profiles TO authenticated$q$,
    $q$GRANT UPDATE (full_name, phone) ON public.profiles TO authenticated$q$,
    $q$CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
         USING (id = (SELECT auth.uid()) OR public.is_admin())$q$,
    $q$CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated
         USING (id = (SELECT auth.uid())) WITH CHECK (id = (SELECT auth.uid()))$q$,

    $q$GRANT SELECT (id, tracking_code, service_id, status, user_id, client_full_name, client_email,
         client_phone, business_name, client_message, public_message, submitted_at, completed_at,
         cancelled_at, files_deleted_at, created_at, updated_at)
         ON public.requests TO authenticated$q$,
    $q$CREATE POLICY requests_select ON public.requests FOR SELECT TO authenticated
         USING (user_id = (SELECT auth.uid()) OR public.is_admin())$q$,

    $q$GRANT SELECT ON public.request_status_events TO authenticated$q$,
    $q$CREATE POLICY request_status_events_select ON public.request_status_events FOR SELECT TO authenticated
         USING (
           EXISTS (SELECT 1 FROM public.requests r
                   WHERE r.id = public.request_status_events.request_id AND r.user_id = (SELECT auth.uid()))
           OR public.is_admin()
         )$q$,

    $q$GRANT SELECT (id, request_id, requirement_id, original_name, mime_type, size_bytes, uploaded_at, deleted_at)
         ON public.request_files TO authenticated$q$,
    $q$CREATE POLICY request_files_select ON public.request_files FOR SELECT TO authenticated
         USING (
           EXISTS (SELECT 1 FROM public.requests r
                   WHERE r.id = public.request_files.request_id AND r.user_id = (SELECT auth.uid()))
           OR public.is_admin()
         )$q$,

    $q$GRANT SELECT (id, request_id, method_snapshot, reference_number, amount_centavos, paid_on,
         entry_method, status, verified_at, rejection_reason, created_at)
         ON public.payments TO authenticated$q$,
    $q$CREATE POLICY payments_select ON public.payments FOR SELECT TO authenticated
         USING (
           EXISTS (SELECT 1 FROM public.requests r
                   WHERE r.id = public.payments.request_id AND r.user_id = (SELECT auth.uid()))
           OR public.is_admin()
         )$q$,

    $q$GRANT SELECT (id, request_id, visibility, body, created_at) ON public.request_notes TO authenticated$q$,
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
--> statement-breakpoint

-- ============================================================
-- 7. Storage rule for private client files
-- ============================================================
-- New files are saved under users/{userId}/requests/{requestId}/... A logged-in user may read only
-- objects in their own folder. Writes stay server-only (secret key). The app never gives the browser a
-- file link, so this rule is a safety net.
-- The storage tables belong to Supabase. If this role may not add a policy there, we only print a note and
-- docs/AUTH_AND_ROLES.md shows how to add the rule by hand in the SQL editor.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'objects'
  ) AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE $q$
      CREATE POLICY client_files_read_own ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'client-files'
        AND (storage.foldername(name))[1] = 'users'
        AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
      )
    $q$;
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Could not add the storage policy. Add it by hand (see docs/AUTH_AND_ROLES.md).';
END $$;

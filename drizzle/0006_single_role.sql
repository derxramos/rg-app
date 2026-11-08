-- Hand-written migration. One role column for everybody: user, staff, admin, owner.
-- It replaces the two old records (profiles.role user|admin + admin_profiles owner|staff).
-- Read docs/AUTH_AND_ROLES.md and docs/DATABASE.md for the reasons behind each block.
--
-- NOTHING in this file runs by itself on the live database. The owner of the project applies it by hand
-- (steps in docs/AUTH_AND_ROLES.md section 3). Parts that need Supabase (auth schema, the authenticated
-- role) run only when those exist, so the file also works on a plain local Postgres.
--
-- How the old accounts are mapped:
--   admin_profiles owner (active or off)   -> profiles.role = owner, is_active as before
--   admin_profiles staff (active or off)   -> profiles.role = staff, is_active as before
--   an admin that was removed earlier      -> user (the old admin_profiles row is dropped)
--   an old "admin" with no admin_profiles  -> user
--   everybody else                         -> user
-- The developer is made "admin" by hand afterwards (one SQL line, see docs/AUTH_AND_ROLES.md).

-- ============================================================
-- 1. The new role type and the new columns on profiles
-- ============================================================
CREATE TYPE "public"."account_role" AS ENUM('user', 'staff', 'admin', 'owner');
--> statement-breakpoint

ALTER TABLE "profiles" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "last_login_at" timestamp with time zone;
--> statement-breakpoint
-- Set when another person resets the 2-step login. The next sign in must set up a new device and a backup device.
ALTER TABLE "profiles" ADD COLUMN "mfa_reset_required" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- "Signed out everywhere": a session that started before this time is not accepted any more.
ALTER TABLE "profiles" ADD COLUMN "sessions_revoked_at" timestamp with time zone;
--> statement-breakpoint

-- ============================================================
-- 2. profiles.role moves to the new type
-- ============================================================
ALTER TABLE "profiles" ALTER COLUMN "role" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "role" SET DATA TYPE "public"."account_role" USING ("role"::text::"public"."account_role");
--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "role" SET DEFAULT 'user';
--> statement-breakpoint

-- ============================================================
-- 3. Move the data from admin_profiles into profiles
-- ============================================================
-- Every admin row must have a profile (migration 0003 made them). This is only a safety net.
INSERT INTO public.profiles (id, email, full_name)
SELECT a.id, a.email, a.full_name FROM public.admin_profiles a
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint

-- Old "admin" accounts get their level (owner or staff) and their on/off switch.
UPDATE public.profiles p
SET role = a.role::text::public.account_role,
    is_active = a.is_active,
    last_login_at = a.last_login_at
FROM public.admin_profiles a
WHERE a.id = p.id AND p.role = 'admin';
--> statement-breakpoint

-- Anything still "admin" had no admin_profiles row. It could never open the admin area, so it becomes a user.
UPDATE public.profiles SET role = 'user' WHERE role = 'admin';
--> statement-breakpoint

-- Every staff, admin and owner account must set up an authenticator AND a backup device. This flag keeps the panel
-- closed until two devices exist. It only matters while ADMIN_REQUIRE_2FA is on. New panel accounts get it too.
UPDATE public.profiles SET mfa_reset_required = true WHERE role IN ('staff', 'admin', 'owner');
--> statement-breakpoint

-- ============================================================
-- 4. Point the old foreign keys at profiles (the ids are the same, so no data changes)
-- ============================================================
ALTER TABLE "payment_methods" DROP CONSTRAINT "payment_methods_updated_by_admin_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_verified_by_admin_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "request_notes" DROP CONSTRAINT "request_notes_author_id_admin_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "request_status_events" DROP CONSTRAINT "request_status_events_changed_by_admin_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "site_settings" DROP CONSTRAINT "site_settings_updated_by_admin_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_verified_by_profiles_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "request_notes" ADD CONSTRAINT "request_notes_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "request_status_events" ADD CONSTRAINT "request_status_events_changed_by_profiles_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- ============================================================
-- 5. The "private" schema: role helpers for Row Level Security
-- ============================================================
-- Supabase advice: put helpers that policies call in a schema that the Data API does not expose,
-- make them security definer with an empty search_path, and call them as (select private.can(...)).
-- Written in plpgsql so they can be created before the auth schema exists.
CREATE SCHEMA IF NOT EXISTS private;
--> statement-breakpoint

-- The pure table. It must say the same as PERMISSIONS in src/lib/permissions.ts (a test compares every cell).
CREATE FUNCTION private.role_can(r public.account_role, action text) RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN action IN (
      'requests.view', 'requests.change_status', 'requests.add_note', 'requests.retry_email',
      'requests.open_file', 'services.view', 'services.create', 'services.edit_text',
      'checklist.add', 'checklist.edit', 'checklist.reorder', 'activity.view', 'security.self'
    ) THEN r::text IN ('staff', 'admin', 'owner')
    WHEN action IN (
      'dashboard.view', 'payments.verify', 'requests.erase_client_data', 'services.edit_fee',
      'services.set_visibility', 'services.reorder', 'services.payment_links', 'checklist.delete',
      'payment_methods.manage', 'site_content.edit', 'file_settings.edit', 'export.csv',
      'accounts.view', 'accounts.invite', 'accounts.change_role', 'accounts.turn_off',
      'accounts.reset_2fa', 'accounts.resend_invite'
    ) THEN r::text IN ('admin', 'owner')
    WHEN action = 'accounts.manage_owner' THEN r::text = 'owner'
    ELSE false
  END
$$;
--> statement-breakpoint

-- The role of the logged-in person, but only if the account is on and is a panel role (else null).
CREATE FUNCTION private.panel_role() RETURNS public.account_role
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  found_role public.account_role;
BEGIN
  SELECT p.role INTO found_role
  FROM public.profiles p
  WHERE p.id = auth.uid() AND p.is_active AND p.role::text IN ('staff', 'admin', 'owner');
  RETURN found_role;
END;
$$;
--> statement-breakpoint

CREATE FUNCTION private.can(action text) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r public.account_role := private.panel_role();
BEGIN
  IF r IS NULL THEN
    RETURN false;
  END IF;
  RETURN private.role_can(r, action);
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION private.role_can(public.account_role, text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION private.panel_role() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION private.can(text) FROM PUBLIC;
--> statement-breakpoint

-- ============================================================
-- 6. Row Level Security policies use private.can() instead of is_admin()
-- ============================================================
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
    $q$GRANT USAGE ON SCHEMA private TO authenticated$q$,
    $q$GRANT EXECUTE ON FUNCTION private.can(text) TO authenticated$q$,
    $q$GRANT EXECUTE ON FUNCTION private.panel_role() TO authenticated$q$,
    $q$GRANT SELECT (id, email, full_name, phone, role, created_at, updated_at) ON public.profiles TO authenticated$q$,

    $q$DROP POLICY IF EXISTS profiles_select ON public.profiles$q$,
    $q$CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
         USING (id = (SELECT auth.uid()) OR (SELECT private.can('accounts.view')))$q$,

    $q$DROP POLICY IF EXISTS requests_select ON public.requests$q$,
    $q$CREATE POLICY requests_select ON public.requests FOR SELECT TO authenticated
         USING (user_id = (SELECT auth.uid()) OR (SELECT private.can('requests.view')))$q$,

    $q$DROP POLICY IF EXISTS request_status_events_select ON public.request_status_events$q$,
    $q$CREATE POLICY request_status_events_select ON public.request_status_events FOR SELECT TO authenticated
         USING (
           EXISTS (SELECT 1 FROM public.requests r
                   WHERE r.id = public.request_status_events.request_id AND r.user_id = (SELECT auth.uid()))
           OR (SELECT private.can('requests.view'))
         )$q$,

    $q$DROP POLICY IF EXISTS request_files_select ON public.request_files$q$,
    $q$CREATE POLICY request_files_select ON public.request_files FOR SELECT TO authenticated
         USING (
           EXISTS (SELECT 1 FROM public.requests r
                   WHERE r.id = public.request_files.request_id AND r.user_id = (SELECT auth.uid()))
           OR (SELECT private.can('requests.view'))
         )$q$,

    $q$DROP POLICY IF EXISTS payments_select ON public.payments$q$,
    $q$CREATE POLICY payments_select ON public.payments FOR SELECT TO authenticated
         USING (
           EXISTS (SELECT 1 FROM public.requests r
                   WHERE r.id = public.payments.request_id AND r.user_id = (SELECT auth.uid()))
           OR (SELECT private.can('requests.view'))
         )$q$,

    $q$DROP POLICY IF EXISTS request_notes_select ON public.request_notes$q$,
    $q$CREATE POLICY request_notes_select ON public.request_notes FOR SELECT TO authenticated
         USING (
           (visibility = 'client' AND EXISTS (SELECT 1 FROM public.requests r
                   WHERE r.id = public.request_notes.request_id AND r.user_id = (SELECT auth.uid())))
           OR (SELECT private.can('requests.view'))
         )$q$
  ] LOOP
    EXECUTE stmt;
  END LOOP;
END $$;
--> statement-breakpoint

-- No policy uses it any more.
DROP FUNCTION public.is_admin();
--> statement-breakpoint

-- ============================================================
-- 7. The last active owner can never be lost (now a trigger on profiles)
-- ============================================================
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

  -- One lock for all owner changes, so two admins cannot remove the last two owners at the same moment.
  PERFORM pg_advisory_xact_lock(hashtext('profiles_last_owner'));

  SELECT count(*) INTO other_owners
  FROM public.profiles
  WHERE role = 'owner' AND is_active AND id <> OLD.id;

  IF other_owners = 0 THEN
    RAISE EXCEPTION 'There must always be at least one active owner.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER profiles_protect_last_owner BEFORE UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_last_owner();
--> statement-breakpoint

-- ============================================================
-- 8. The old admin table and old types are gone
-- ============================================================
-- This also removes its triggers (updated_at, last owner) and its link to auth.users.
DROP TABLE public.admin_profiles;
--> statement-breakpoint
DROP TYPE public.admin_role;
--> statement-breakpoint
DROP TYPE public.app_role;
--> statement-breakpoint

-- ============================================================
-- 9. Safety net inside the database: triggers that know who is acting
-- ============================================================
-- Our server connects as the database owner, so Row Level Security does not apply to it. The server tells
-- the database who is acting with: select set_config('app.actor_id', '<profile id>', true) inside the
-- transaction. When it is set, these triggers refuse what that role may not do. When it is NOT set (seed,
-- cleanup job, the SQL editor) nothing is refused. The real checks are in the code (src/lib/permissions.ts).
CREATE FUNCTION private.actor_id() RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  raw text := nullif(current_setting('app.actor_id', true), '');
BEGIN
  IF raw IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN raw::uuid;
EXCEPTION WHEN invalid_text_representation THEN
  -- A value that is not an id (for example a test marker) is treated as "no actor".
  RETURN NULL;
END;
$$;
--> statement-breakpoint

-- The role of the acting person. 'user' when the actor is set but has no usable profile or is turned off,
-- so an unknown actor can do nothing. Null when there is no actor.
CREATE FUNCTION private.actor_role() RETURNS public.account_role
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  who uuid := private.actor_id();
  found_role public.account_role;
BEGIN
  IF who IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT p.role INTO found_role FROM public.profiles p WHERE p.id = who AND p.is_active;
  RETURN coalesce(found_role, 'user');
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION private.actor_id() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION private.actor_role() FROM PUBLIC;
--> statement-breakpoint

-- These trigger functions are SECURITY DEFINER, so they also work when a signed-in client updates their own
-- name or phone (that role has no rights on the private schema). They only read settings and raise errors.
--
-- Accounts: only admin or owner may change a role or the on/off switch. Never your own. Only an owner may
-- touch an owner (including making someone an owner).
CREATE FUNCTION private.guard_profile_changes() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  who uuid := private.actor_id();
  actor public.account_role;
BEGIN
  IF who IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.role IS NOT DISTINCT FROM OLD.role AND NEW.is_active IS NOT DISTINCT FROM OLD.is_active THEN
    RETURN NEW;
  END IF;

  actor := private.actor_role();
  IF actor::text NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'You are not allowed to change a role or turn an account on or off.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.id = who THEN
    RAISE EXCEPTION 'You cannot change your own role or turn your own account off.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF actor::text <> 'owner' AND (OLD.role::text = 'owner' OR NEW.role::text = 'owner') THEN
    RAISE EXCEPTION 'Only an owner can change an owner account.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER profiles_guard_changes BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.guard_profile_changes();
--> statement-breakpoint

-- Staff may not verify or reject a payment.
CREATE FUNCTION private.guard_payment_changes() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF private.actor_role()::text = 'staff' AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status::text IN ('verified', 'rejected') THEN
    RAISE EXCEPTION 'Staff cannot verify or reject a payment.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER payments_guard_changes BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION private.guard_payment_changes();
--> statement-breakpoint

-- Staff may not change a fee, hide or show a service, or reorder services. A service made by staff
-- starts hidden and with no fee.
CREATE FUNCTION private.guard_service_changes() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- IS DISTINCT FROM, because the role is null when no actor is set.
  IF private.actor_role()::text IS DISTINCT FROM 'staff' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_active OR NEW.fee_centavos IS NOT NULL THEN
      RAISE EXCEPTION 'Staff can only add a service that is hidden and has no fee.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.fee_centavos IS DISTINCT FROM OLD.fee_centavos
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.sort_order IS DISTINCT FROM OLD.sort_order THEN
    RAISE EXCEPTION 'Staff cannot change a fee, hide or show a service, or change the order.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER services_guard_changes BEFORE INSERT OR UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION private.guard_service_changes();
--> statement-breakpoint

-- Staff may not change which payment methods a service shows.
CREATE FUNCTION private.guard_staff_no_write() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF private.actor_role()::text = 'staff' THEN
    RAISE EXCEPTION 'Staff cannot change this.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER service_payment_methods_guard BEFORE INSERT OR UPDATE OR DELETE ON public.service_payment_methods
  FOR EACH ROW EXECUTE FUNCTION private.guard_staff_no_write();
--> statement-breakpoint

-- Staff cannot delete anything (requests, files, notes, services, checklist items, payment methods, accounts).
CREATE TRIGGER requests_guard_delete BEFORE DELETE ON public.requests
  FOR EACH ROW EXECUTE FUNCTION private.guard_staff_no_write();
--> statement-breakpoint
CREATE TRIGGER request_files_guard_delete BEFORE DELETE ON public.request_files
  FOR EACH ROW EXECUTE FUNCTION private.guard_staff_no_write();
--> statement-breakpoint
CREATE TRIGGER request_notes_guard_delete BEFORE DELETE ON public.request_notes
  FOR EACH ROW EXECUTE FUNCTION private.guard_staff_no_write();
--> statement-breakpoint
CREATE TRIGGER services_guard_delete BEFORE DELETE ON public.services
  FOR EACH ROW EXECUTE FUNCTION private.guard_staff_no_write();
--> statement-breakpoint
CREATE TRIGGER service_requirements_guard_delete BEFORE DELETE ON public.service_requirements
  FOR EACH ROW EXECUTE FUNCTION private.guard_staff_no_write();
--> statement-breakpoint
CREATE TRIGGER payment_methods_guard_delete BEFORE DELETE ON public.payment_methods
  FOR EACH ROW EXECUTE FUNCTION private.guard_staff_no_write();
--> statement-breakpoint
CREATE TRIGGER profiles_guard_delete BEFORE DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.guard_staff_no_write();

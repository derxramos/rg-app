-- Hand-written migration. Drizzle cannot describe these parts, so we write the SQL ourselves.
-- Read docs/DATABASE.md (sections 1 and 3) for the reasons behind each block.

-- ============================================================
-- 1. Link admin_profiles to Supabase Auth
-- ============================================================
-- admin_profiles.id is the same value as auth.users.id.
-- The "auth" schema exists only on Supabase, so we check first. This keeps the migration
-- usable on a plain local Postgres for tests.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'auth' AND table_name = 'users'
  ) THEN
    ALTER TABLE public.admin_profiles
      ADD CONSTRAINT admin_profiles_id_auth_users_fk
      FOREIGN KEY (id) REFERENCES auth.users (id) ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint

-- ============================================================
-- 2. Extra checks
-- ============================================================
-- Reference numbers are saved with letters and digits only (no spaces). The server also checks this.
ALTER TABLE public.payments
  ADD CONSTRAINT payments_reference_format CHECK (reference_number ~ '^[A-Za-z0-9]+$');
--> statement-breakpoint

-- ============================================================
-- 3. updated_at is always fresh
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER admin_profiles_set_updated_at BEFORE UPDATE ON public.admin_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER services_set_updated_at BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER service_requirements_set_updated_at BEFORE UPDATE ON public.service_requirements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER requests_set_updated_at BEFORE UPDATE ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER payment_methods_set_updated_at BEFORE UPDATE ON public.payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER site_settings_set_updated_at BEFORE UPDATE ON public.site_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint

-- ============================================================
-- 4. activity_log is append-only
-- ============================================================
-- UPDATE and DELETE are blocked. The one exception is the purge function below,
-- which may remove rows older than 1 year.
CREATE OR REPLACE FUNCTION public.activity_log_block_change() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND current_setting('app.activity_log_purge', true) = 'on'
     AND OLD.created_at < now() - interval '1 year' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'activity_log is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint

CREATE TRIGGER activity_log_no_update_delete BEFORE UPDATE OR DELETE ON public.activity_log
  FOR EACH ROW EXECUTE FUNCTION public.activity_log_block_change();
--> statement-breakpoint

-- TRUNCATE would empty the table without touching rows, so it needs its own trigger.
CREATE OR REPLACE FUNCTION public.activity_log_block_truncate() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'activity_log is append-only: TRUNCATE is not allowed'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint

CREATE TRIGGER activity_log_no_truncate BEFORE TRUNCATE ON public.activity_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.activity_log_block_truncate();
--> statement-breakpoint

-- Called by the daily cleanup job. Removes only rows older than 1 year. Returns how many were removed.
CREATE OR REPLACE FUNCTION public.purge_old_activity_log() RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed bigint;
BEGIN
  PERFORM set_config('app.activity_log_purge', 'on', true);
  DELETE FROM public.activity_log WHERE created_at < now() - interval '1 year';
  GET DIAGNOSTICS removed = ROW_COUNT;
  PERFORM set_config('app.activity_log_purge', 'off', true);
  RETURN removed;
END;
$$;
--> statement-breakpoint

-- Nobody but the database owner may call it. (Supabase would otherwise allow it through its API.)
REVOKE ALL ON FUNCTION public.purge_old_activity_log() FROM PUBLIC;
--> statement-breakpoint

-- ============================================================
-- 5. Every change to payment_methods is written to activity_log
-- ============================================================
-- This is the safety net for the "QR swap" threat (docs/SECURITY_AND_PRIVACY.md, T1).
-- It records before and after values even if the app code has a bug.
-- The app can name the admin by running, inside the same transaction:
--   SELECT set_config('app.actor_id', '<admin uuid>', true);
-- Without it, the row is recorded with actor_type "system".
CREATE OR REPLACE FUNCTION public.log_payment_method_change() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  actor uuid := nullif(current_setting('app.actor_id', true), '')::uuid;
BEGIN
  -- Skip updates that change nothing. updated_at is ignored because its own trigger always changes it.
  IF TG_OP = 'UPDATE' AND (to_jsonb(OLD) - 'updated_at') = (to_jsonb(NEW) - 'updated_at') THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.activity_log (actor_type, actor_id, action, entity_type, entity_id, details)
  VALUES (
    CASE WHEN actor IS NULL THEN 'system'::public.actor_type ELSE 'admin'::public.actor_type END,
    actor,
    'payment_method.row_changed',
    'payment_method',
    COALESCE(NEW.id, OLD.id)::text,
    jsonb_build_object(
      'operation', TG_OP,
      'before', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
      'after', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
    )
  );
  RETURN NULL;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER payment_methods_log_change AFTER INSERT OR UPDATE OR DELETE ON public.payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.log_payment_method_change();
--> statement-breakpoint

-- ============================================================
-- 6. There must always be at least one active owner
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
--> statement-breakpoint

CREATE TRIGGER admin_profiles_protect_last_owner BEFORE UPDATE OR DELETE ON public.admin_profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_last_owner();
--> statement-breakpoint

-- ============================================================
-- 7. Lock down the Supabase Data API
-- ============================================================
-- Row Level Security is already ON for every table, with no policies, so the public keys see no rows.
-- Here we also take away the table rights from the two public roles. Two locks are better than one.
-- The roles exist only on Supabase, so we check first.
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', r);
      -- New tables made later by migrations get the same rule.
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', r);
    END IF;
  END LOOP;
END $$;

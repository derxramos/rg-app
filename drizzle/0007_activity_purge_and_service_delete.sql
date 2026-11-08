-- Hand-written migration. Two changes for the admin improvements:
--   1. A MANUAL clean-up of the activity log (owner and admin, with a confirm in the app). The log stays
--      append-only: the only way to remove rows is the purge function below, and a row younger than 30 days
--      can never be removed, whoever asks. (The daily job still removes rows older than 1 year by itself.)
--   2. private.role_can() knows the two new actions: services.delete and activity.purge (admin and owner).
-- NOT applied to any live database by the author. Apply it by hand with `pnpm db:migrate`
-- (docs/DEPLOY_RUNBOOK.md). Until it is applied, the manual clean-up button answers with an error. Nothing else breaks.

-- ============================================================
-- 1. The append-only trigger: the purge may remove rows older than 30 days (was: 1 year)
-- ============================================================
CREATE OR REPLACE FUNCTION public.activity_log_block_change() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND current_setting('app.activity_log_purge', true) = 'on'
     AND OLD.created_at < now() - interval '30 days' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'activity_log is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint

-- Removes the rows older than the given number of days. At least 30 days. Returns how many were removed.
-- Only the database owner (our server, after the checks and the fresh confirm) may call it.
CREATE FUNCTION public.purge_activity_log_older_than(days integer) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed bigint;
BEGIN
  IF days IS NULL OR days < 30 THEN
    RAISE EXCEPTION 'The activity log can only be cleaned up for entries older than 30 days.'
      USING ERRCODE = 'check_violation';
  END IF;
  PERFORM set_config('app.activity_log_purge', 'on', true);
  DELETE FROM public.activity_log WHERE created_at < now() - make_interval(days => days);
  GET DIAGNOSTICS removed = ROW_COUNT;
  PERFORM set_config('app.activity_log_purge', 'off', true);
  RETURN removed;
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.purge_activity_log_older_than(integer) FROM PUBLIC;
--> statement-breakpoint

-- ============================================================
-- 2. private.role_can(): the two new actions
-- ============================================================
CREATE OR REPLACE FUNCTION private.role_can(r public.account_role, action text) RETURNS boolean
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
      'services.set_visibility', 'services.reorder', 'services.payment_links', 'services.delete',
      'checklist.delete', 'payment_methods.manage', 'site_content.edit', 'file_settings.edit',
      'export.csv', 'activity.purge',
      'accounts.view', 'accounts.invite', 'accounts.change_role', 'accounts.turn_off',
      'accounts.reset_2fa', 'accounts.resend_invite'
    ) THEN r::text IN ('admin', 'owner')
    WHEN action = 'accounts.manage_owner' THEN r::text = 'owner'
    ELSE false
  END
$$;

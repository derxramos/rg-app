-- Hand-written migration: payments that were made OUTSIDE the website (cash, a bank transfer, anything else) and are
-- recorded by staff, admin or owner in the admin area. A client who chose "Skip for now. I will pay later" can then
-- be marked as paid.
--   - payments.entry_method gets the value 'offline'
--   - payment_method_id may be empty for an offline payment (there is no QR payment method)
--   - three new columns: offline_method (cash | bank_transfer | other), recorded_by (who recorded it), note
--   - private.role_can() knows two new actions: payments.record_offline (staff, admin, owner) and
--     payments.void (admin, owner)
-- NOT applied to any live database by the author. Apply it by hand with `pnpm db:migrate` (docs/DEPLOY_RUNBOOK.md).
-- Until it is applied, the "Record a payment" form in the admin area answers with an error. Nothing else breaks.
--
-- Note: a new enum value cannot be used in the same transaction that adds it, so the check below compares the
-- value as text.

ALTER TYPE public.payment_entry ADD VALUE IF NOT EXISTS 'offline';
--> statement-breakpoint

ALTER TABLE "payments" ALTER COLUMN "payment_method_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "offline_method" text;
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "recorded_by" uuid;
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "note" text;
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_profiles_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- A payment has a payment method (the QR the client used), unless it is an offline payment.
ALTER TABLE "payments" ADD CONSTRAINT "payments_method_or_offline" CHECK ("payments"."payment_method_id" is not null or "payments"."entry_method"::text = 'offline');
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_offline_method_values" CHECK ("payments"."offline_method" is null or "payments"."offline_method" in ('cash', 'bank_transfer', 'other'));
--> statement-breakpoint

-- private.role_can(): the two new actions
CREATE OR REPLACE FUNCTION private.role_can(r public.account_role, action text) RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN action IN (
      'requests.view', 'requests.change_status', 'requests.add_note', 'requests.retry_email',
      'requests.open_file', 'services.view', 'services.create', 'services.edit_text',
      'checklist.add', 'checklist.edit', 'checklist.reorder', 'activity.view', 'security.self',
      'payments.record_offline'
    ) THEN r::text IN ('staff', 'admin', 'owner')
    WHEN action IN (
      'dashboard.view', 'payments.verify', 'payments.void', 'requests.erase_client_data', 'services.edit_fee',
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

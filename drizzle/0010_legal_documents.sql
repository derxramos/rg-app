CREATE TABLE "legal_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"version" text NOT NULL,
	"body" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legal_documents_kind_values" CHECK ("legal_documents"."kind" in ('privacy', 'terms'))
);
--> statement-breakpoint
ALTER TABLE "legal_documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "legal_documents" ADD CONSTRAINT "legal_documents_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "legal_documents_kind_version_unique" ON "legal_documents" USING btree ("kind","version");--> statement-breakpoint
CREATE INDEX "legal_documents_kind_created_idx" ON "legal_documents" USING btree ("kind","created_at");--> statement-breakpoint

-- Saved versions are history: the text cannot be changed or deleted. (The only allowed update is the database
-- clearing created_by when the person's account is deleted.)
CREATE OR REPLACE FUNCTION public.legal_documents_block_change() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.id = OLD.id AND NEW.kind = OLD.kind AND NEW.version = OLD.version
     AND NEW.body = OLD.body AND NEW.created_at = OLD.created_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'legal_documents is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER legal_documents_no_change BEFORE UPDATE OR DELETE ON public.legal_documents
  FOR EACH ROW EXECUTE FUNCTION public.legal_documents_block_change();
--> statement-breakpoint

-- private.role_can(): the new action legal_text.edit (admin and owner)
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
      'accounts.reset_2fa', 'accounts.resend_invite', 'legal_text.edit'
    ) THEN r::text IN ('admin', 'owner')
    WHEN action = 'accounts.manage_owner' THEN r::text = 'owner'
    ELSE false
  END
$$;

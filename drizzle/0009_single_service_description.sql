-- One description for a service. The old short description is joined in front of the long text, so visitors
-- still see the same words (the short text used to be shown above the long text on the service page).
UPDATE "services" SET "description" = CASE
  WHEN btrim("short_description") = '' THEN "description"
  WHEN btrim("description") = '' THEN btrim("short_description")
  ELSE btrim("short_description") || E'\n\n' || "description"
END;
--> statement-breakpoint
ALTER TABLE "services" DROP COLUMN "short_description";

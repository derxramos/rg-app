// Database schema for all tables. Source: docs/DATABASE.md.
// Names: snake_case in the database, camelCase in TypeScript.
// Money is bigint centavos. Times are timestamptz (stored in UTC).
//
// Every table has Row Level Security (RLS) turned on and NO policies, so the public Supabase keys
// can read and write nothing. Only our server (which connects as a database owner) can use the tables.
//
// Things Drizzle cannot express (triggers, extra checks, the auth.users link) are in the
// hand-written SQL migration in /drizzle.

import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------- Enums ----------

// Keep this list in the same order as REQUEST_STATUSES in src/lib/status.ts.
export const requestStatus = pgEnum("request_status", [
  "draft",
  "submitted",
  "under_review",
  "waiting_for_client",
  "payment_submitted",
  "payment_verified",
  "in_progress",
  "completed",
  "cancelled",
]);
export const paymentStatus = pgEnum("payment_status", ["pending", "verified", "rejected"]);
export const paymentEntry = pgEnum("payment_entry", ["ocr", "ocr_edited", "manual"]);
export const adminRole = pgEnum("admin_role", ["owner", "staff"]);
// The login role of every account. "admin" people also have an admin_profiles row (owner or staff).
export const appRole = pgEnum("app_role", ["user", "admin"]);
export const noteVisibility = pgEnum("note_visibility", ["internal", "client"]);
export const actorType = pgEnum("actor_type", ["admin", "client", "system"]);
export const emailStatus = pgEnum("email_status", ["sent", "failed"]);

// ---------- Shared column helpers ----------

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
// A database trigger (see the SQL migration) also keeps updated_at fresh on every update.
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

// ---------- admin_profiles ----------
// Same id as auth.users.id. The link to auth.users is added in the SQL migration.
export const adminProfiles = pgTable("admin_profiles", {
  id: uuid("id").primaryKey(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  role: adminRole("role").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}).enableRLS();

// ---------- profiles ----------
// One row for every login (same id as auth.users.id). A database trigger makes it with role "user"
// when someone signs up. A user can never change their own role (see drizzle/0003_*.sql).
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  // A copy of the login email, for display and for the data download.
  email: text("email").notNull().default(""),
  fullName: text("full_name").notNull().default(""),
  // Format: +63XXXXXXXXXX
  phone: text("phone"),
  role: appRole("role").notNull().default("user"),
  // True when an admin made this account with a temporary password. The person must choose their own
  // password before they can use the admin area. Only our server changes this (users cannot).
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}).enableRLS();

// ---------- services and checklists ----------
export const services = pgTable(
  "services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    shortDescription: text("short_description").notNull().default(""),
    // Markdown for the detail page.
    description: text("description").notNull().default(""),
    // Service fee in whole centavos (5000 pesos is 500000). Null until the owner fills it in.
    feeCentavos: bigint("fee_centavos", { mode: "number" }),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("services_active_sort_idx").on(t.isActive, t.sortOrder)],
).enableRLS();

// Which payment QR codes a service shows. A service with no rows here shows all active methods.
export const servicePaymentMethods = pgTable(
  "service_payment_methods",
  {
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    paymentMethodId: uuid("payment_method_id")
      .notNull()
      .references(() => paymentMethods.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.serviceId, t.paymentMethodId] })],
).enableRLS();

// The checklist for each service. It starts empty: the owner fills it in.
export const serviceRequirements = pgTable(
  "service_requirements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    details: text("details"),
    isRequired: boolean("is_required").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("service_requirements_service_sort_idx").on(t.serviceId, t.sortOrder)],
).enableRLS();

// ---------- requests ----------
export const requests = pgTable(
  "requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Format: RG-XXXXXXXX
    trackingCode: text("tracking_code").notNull().unique(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "restrict" }),
    status: requestStatus("status").notNull().default("draft"),
    // The service fee when the request was made. A later price change does not change old requests.
    serviceFeeCentavos: bigint("service_fee_centavos", { mode: "number" }),
    // The account that owns the request. Null for old guest requests (made before accounts existed),
    // and after the owner deletes their account.
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "set null" }),
    clientFullName: text("client_full_name").notNull(),
    clientEmail: text("client_email").notNull(),
    // Format: +63XXXXXXXXXX
    clientPhone: text("client_phone").notNull(),
    // A copy of the last 4 digits for the fast tracking check.
    clientPhoneLast4: char("client_phone_last4", { length: 4 }).notNull(),
    businessName: text("business_name"),
    clientMessage: text("client_message"),
    consentVersion: text("consent_version").notNull(),
    consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
    // HMAC of the draft cookie token. Cleared on submit.
    draftTokenHash: text("draft_token_hash"),
    draftExpiresAt: timestamp("draft_expires_at", { withTimezone: true }),
    // The latest message the client sees on the tracking page.
    publicMessage: text("public_message"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    // Set by the cleanup job when the files are removed.
    filesDeletedAt: timestamp("files_deleted_at", { withTimezone: true }),
    // For the tracking lockout.
    trackingFailedAttempts: integer("tracking_failed_attempts").notNull().default(0),
    trackingLockedUntil: timestamp("tracking_locked_until", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("requests_status_created_idx").on(t.status, t.createdAt.desc()),
    index("requests_created_idx").on(t.createdAt.desc()),
    index("requests_service_idx").on(t.serviceId),
    // "My requests": one user's requests, newest first.
    index("requests_user_created_idx").on(t.userId, t.createdAt.desc()),
    // Used by the cleanup job to find finished requests that still have files.
    index("requests_cleanup_idx")
      .on(t.completedAt)
      .where(sql`${t.status} in ('completed', 'cancelled') and ${t.filesDeletedAt} is null`),
    check("requests_client_message_length", sql`char_length(${t.clientMessage}) <= 2000`),
    check("requests_phone_last4_digits", sql`${t.clientPhoneLast4} ~ '^[0-9]{4}$'`),
  ],
).enableRLS();

// ---------- request_status_events ----------
// The timeline on the tracking page and in the admin area.
export const requestStatusEvents = pgTable(
  "request_status_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    fromStatus: requestStatus("from_status"),
    toStatus: requestStatus("to_status").notNull(),
    // Null means the client or the system made the change.
    changedBy: uuid("changed_by").references(() => adminProfiles.id),
    createdAt: createdAt(),
  },
  (t) => [index("request_status_events_request_idx").on(t.requestId, t.createdAt)],
).enableRLS();

// ---------- request_files ----------
export const requestFiles = pgTable(
  "request_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    // Which checklist item the file is for. Null means "Other".
    requirementId: uuid("requirement_id").references(() => serviceRequirements.id, {
      onDelete: "set null",
    }),
    // requests/{requestId}/{uuid}.{ext}
    storagePath: text("storage_path").notNull().unique(),
    // Shown to admins only. Never used as a path.
    originalName: text("original_name").notNull(),
    // Found by the magic-byte check on the server, not taken from the browser.
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow().notNull(),
    // Set when the cleanup job removes the file.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("request_files_request_idx").on(t.requestId),
    // Used to add up the storage meter (only files that still exist).
    index("request_files_live_idx")
      .on(t.deletedAt)
      .where(sql`${t.deletedAt} is null`),
    check("request_files_size_positive", sql`${t.sizeBytes} >= 0`),
  ],
).enableRLS();

// ---------- request_notes ----------
// Internal notes (staff only) and messages to the client.
export const requestNotes = pgTable(
  "request_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => adminProfiles.id),
    visibility: noteVisibility("visibility").notNull(),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("request_notes_request_idx").on(t.requestId, t.createdAt),
    check("request_notes_body_length", sql`char_length(${t.body}) between 1 and 2000`),
  ],
).enableRLS();

// ---------- payment_methods ----------
// Every insert, update and delete is also written to activity_log by a database trigger.
export const paymentMethods = pgTable(
  "payment_methods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    // gcash, maya, bdo, or null (no parser: manual entry only).
    parserKey: text("parser_key"),
    accountName: text("account_name").notNull(),
    accountNumber: text("account_number").notNull(),
    instructions: text("instructions"),
    // Path in the public-assets bucket.
    qrImagePath: text("qr_image_path"),
    isActive: boolean("is_active").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    updatedBy: uuid("updated_by").references(() => adminProfiles.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("payment_methods_active_sort_idx").on(t.isActive, t.sortOrder)],
).enableRLS();

// ---------- payments ----------
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "restrict" }),
    paymentMethodId: uuid("payment_method_id")
      .notNull()
      .references(() => paymentMethods.id, { onDelete: "restrict" }),
    // Name, account name, account number and QR path at the moment of payment.
    methodSnapshot: jsonb("method_snapshot").notNull(),
    // Normalized: only letters and digits, no spaces.
    referenceNumber: text("reference_number").notNull(),
    amountCentavos: bigint("amount_centavos", { mode: "number" }).notNull(),
    // The date on the receipt, in Asia/Manila.
    paidOn: date("paid_on", { mode: "string" }).notNull(),
    entryMethod: paymentEntry("entry_method").notNull(),
    // What OCR first read, for comparison. Text only. Never the image.
    ocrRawValues: jsonb("ocr_raw_values"),
    status: paymentStatus("status").notNull().default("pending"),
    verifiedBy: uuid("verified_by").references(() => adminProfiles.id),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    createdAt: createdAt(),
  },
  (t) => [
    // The same reference number cannot be used twice for the same payment method.
    uniqueIndex("payments_method_reference_unique").on(t.paymentMethodId, t.referenceNumber),
    index("payments_request_idx").on(t.requestId),
    index("payments_status_created_idx").on(t.status, t.createdAt.desc()),
    check("payments_amount_positive", sql`${t.amountCentavos} > 0`),
  ],
).enableRLS();

// ---------- site_settings ----------
// Key and value settings the owner can edit. Each key has a Zod schema in src/lib/validation/settings.ts.
export const siteSettings = pgTable("site_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by").references(() => adminProfiles.id),
  updatedAt: updatedAt(),
}).enableRLS();

// ---------- activity_log ----------
// Append-only. A trigger blocks UPDATE and DELETE (see the SQL migration).
export const activityLog = pgTable(
  "activity_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorType: actorType("actor_type").notNull(),
    // The admin id when the actor is an admin.
    actorId: uuid("actor_id"),
    // For example: payment_method.qr_changed, request.status_changed, file.opened, export.csv
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    // Before and after values. Never passwords, tokens or full documents.
    details: jsonb("details")
      .notNull()
      .default(sql`'{}'::jsonb`),
    // HMAC of the IP address, not the raw IP.
    ipHash: text("ip_hash"),
    createdAt: createdAt(),
  },
  (t) => [
    index("activity_log_created_idx").on(t.createdAt.desc()),
    index("activity_log_entity_idx").on(t.entityType, t.entityId),
    index("activity_log_action_idx").on(t.action),
  ],
).enableRLS();

// ---------- rate_limits ----------
// Updated with one atomic INSERT ... ON CONFLICT DO UPDATE SET count = count + 1.
export const rateLimits = pgTable(
  "rate_limits",
  {
    // For example: track:ip:{hash}, track:code:{code}, upload:req:{id}
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
).enableRLS();

// ---------- email_log ----------
export const emailLog = pgTable(
  "email_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // For example: request_submitted_client
    template: text("template").notNull(),
    toEmail: text("to_email").notNull(),
    requestId: uuid("request_id").references(() => requests.id, { onDelete: "set null" }),
    status: emailStatus("status").notNull(),
    providerMessageId: text("provider_message_id"),
    // A short message only.
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("email_log_created_idx").on(t.createdAt.desc())],
).enableRLS();

// ---------- Useful lists ----------

// Every table, used by the RLS test to make sure no table is forgotten.
export const ALL_TABLES = {
  adminProfiles,
  profiles,
  services,
  serviceRequirements,
  servicePaymentMethods,
  requests,
  requestStatusEvents,
  requestFiles,
  requestNotes,
  paymentMethods,
  payments,
  siteSettings,
  activityLog,
  rateLimits,
  emailLog,
} as const;

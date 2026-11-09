# DATABASE.md

PostgreSQL on Supabase. Schema written in Drizzle (`src/server/db/schema.ts`). Migrations in `/drizzle`.

General rules:
- Primary keys are `uuid` (random), except `activity_log` and `rate_limits`.
- Every table has `created_at timestamptz default now()`. Editable tables also have `updated_at`.
- Money is `bigint` centavos.
- Names: `snake_case`.

---

## 1. Access rules — decision: server-only access

**Choice:** Only our server talks to the database and storage. We turn on **Row Level Security (RLS)** on every table. RLS is a Postgres feature that filters rows per user.

- The `anon` role (the public Supabase key, nobody logged in) has **no rights and no policies**. It can read or write **nothing**. That is a safety net if a key leaks.
- The `authenticated` role (a logged-in user) can only **read its own rows** (migration `0003_accounts_security.sql`). It has no insert, update or delete rights, except to change its own name and phone on `profiles`. Private columns (draft token, tracking lock, storage paths, note authors) are hidden with column rights.
- Staff, admin and owner accounts are checked by the function `private.can('<action>')` (migration `0006_single_role.sql`). It lives in the schema `private` (not exposed to the Data API), is `security definer` with an empty `search_path`, and reads the role of the logged-in person from `profiles` (only if the account is on). Policies call it as `(select private.can('requests.view'))`. This is the Supabase advice for role checks in policies: no recursion, and it is cached per statement. The pure table is `private.role_can(role, action)`, and a test checks it says the same as `src/lib/permissions.ts` for every role and action.

**Why two layers:**
1. The server checks access first (`requireUser`, `requirePanel(action)`, `requireRequestAccess`). One place is easier to read, test, and explain.
2. User pages (My requests) read through `withUserRls`, which runs the query as the `authenticated` role with the user's id. So RLS filters the rows too, even if our code has a bug.
3. We also turn off (or limit) the Supabase Data API (the automatic REST API) for the `public` schema, because we do not use it. The 0001 migration revokes the table rights from `anon` and `authenticated`. Migration 0003 gives back only the read rights above.

**Server connection:** Drizzle connects with the pooled URL (port 6543, transaction mode, `prepare: false`). This connection user bypasses RLS, so the server code **must** check access first. Every service function takes an `actor` argument and tests cover it. Writes (many steps, activity log) use this connection, after the check.

**Role safety:** a user cannot change their own role: (1) `authenticated` has no update right on `profiles.role`, (2) the trigger `profiles_protect_role` refuses a role change from `anon` or `authenticated` even if a wide right is given by mistake. Only the database owner (our server, or you in the SQL editor) can change a role.

**Actor triggers (a second layer for our own server):** our server connects as the database owner, so RLS does not apply to it. Every admin write therefore starts with `select set_config('app.actor_id', '<profile id>', true)` (`setActor` in `src/server/db/actor.ts`). When it is set, these triggers refuse what that role may not do, even if the code forgot a check. When it is NOT set (seed, cleanup job, the SQL editor) nothing is refused. These functions are `security definer`, so they also work for a signed-in client who changes their own name.
| Trigger | Refuses |
|---|---|
| `profiles_guard_changes` | a role or on/off change by anyone but admin or owner; by anyone on their own account; by an admin on an owner account, or to make someone owner |
| `profiles_protect_last_owner` | removing, demoting, turning off or deleting the last active owner (always, with or without an actor; error 23514) |
| `payments_guard_changes` | staff setting a payment to verified or rejected |
| `services_guard_changes` | staff changing a fee, hiding or showing a service, or changing the order; staff adding a service that is shown or has a fee |
| `service_payment_methods_guard` | staff changing which payment methods a service shows |
| `*_guard_delete` (requests, request_files, request_notes, services, service_requirements, payment_methods, profiles) | staff deleting anything |

**Tests:** `tests/unit/accounts-rls.test.ts` runs the real migrations on PGlite with a tiny fake of Supabase (`tests/helpers/fake-supabase.ts`) and proves these rules.

**Storage:** two buckets.
| Bucket | Public? | Contents | Who writes |
|---|---|---|---|
| `client-files` | **Private** | Client documents. New files: `users/{userId}/requests/{requestId}/{uuid}.{ext}`. Old files: `requests/{requestId}/...` | Server only (secret key) |
| `public-assets` | Public read | Payment QR images, site images | Server only, after `requirePanel("payment_methods.manage")` (admin or owner) |

QR images use a new random file name on each change (no overwrite), so old links stop working and the log can point to the old file.

---

## 2. Enums

```
request_status: draft, submitted, under_review, waiting_for_client,
                payment_submitted, payment_verified, in_progress,
                completed, cancelled
payment_status: pending, verified, rejected
payment_entry:  ocr, ocr_edited, manual
account_role:   user, staff, admin, owner   (the ONE role of every account)
note_visibility: internal, client
actor_type:     admin, client, system
email_status:   sent, failed
```

---

## 3. Tables

### profiles
One row for every login. Same id as `auth.users.id`. A trigger (`handle_new_user`) makes it when someone signs up, always with role `user`.
| Field | Type | Notes |
|---|---|---|
| id | uuid PK, = `auth.users.id` | on delete cascade from auth.users |
| email | text | copy for display and data download |
| full_name | text | |
| phone | text, nullable | `+63…` |
| role | account_role, default `user` | The one role: `user` (client), `staff`, `admin`, `owner`. Nobody can change their own role. There is no separate admin table any more |
| is_active | boolean, default true | false = "Turned off": cannot sign in or use the admin area. Also banned at Supabase |
| last_login_at | timestamptz, nullable | last sign in of a staff, admin or owner |
| mfa_reset_required | boolean, default false | true until the person has an authenticator AND a backup device (first setup, or after another person reset the 2-step login). Staff, admin and owner accounts start with true. It only closes the admin area while `ADMIN_REQUIRE_2FA` is on |
| sessions_revoked_at | timestamptz, nullable | "signed out everywhere": a login session that started before this time is not accepted any more (turn off, a lower role, a 2-step reset) |
| must_change_password | boolean, default false | true for an admin made with a temporary password. The admin area refuses the account until the person chooses a new password. Only the server changes it (users have no rights on this column) |
| created_at, updated_at | timestamptz | |

### services
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| slug | text, unique | used in URL `/services/[slug]` |
| name | text | e.g. "Business permit registration" |
| description | text | one plain-text description: the list shows the first ~150 characters, the detail page shows all of it |
| fee_centavos | bigint, nullable | the owner's service fee in whole centavos (₱5,000 = 500000). Null = "Fee will be confirmed" |
| sort_order | int | |
| is_active | boolean, default true | hidden from public when false |
| created_at, updated_at | timestamptz | |

Index: `(is_active, sort_order)`.

### service_payment_methods
Which payment QR codes a service shows. A service with **no rows** shows all active payment methods.
| Field | Type | Notes |
|---|---|---|
| service_id | uuid FK → services, on delete cascade | part of the primary key |
| payment_method_id | uuid FK → payment_methods, on delete cascade | part of the primary key |

### service_requirements
The checklist for each service. **Starts empty** — the owner fills it in.
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| service_id | uuid FK → services, on delete cascade | |
| label | text | e.g. "Valid ID" (owner writes this) |
| details | text, nullable | extra help text |
| is_required | boolean, default true | |
| sort_order | int | |
| created_at, updated_at | timestamptz | |

Index: `(service_id, sort_order)`.

### requests
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| tracking_code | text, unique | `RG-XXXXXXXX` |
| service_id | uuid FK → services, on delete restrict | |
| status | request_status, default `draft` | |
| service_fee_centavos | bigint, nullable | the service fee when the request was made. A later price change does not change it |
| user_id | uuid FK → profiles, on delete set null, nullable | the owner account. Null = old guest request, or the owner deleted their account |
| client_full_name | text | |
| client_email | text | |
| client_phone | text | `+63…` |
| client_phone_last4 | char(4) | copy for fast tracking check |
| business_name | text, nullable | |
| client_message | text, nullable | max 2000 chars |
| consent_version | text | which privacy notice version they agreed to |
| consent_at | timestamptz | |
| draft_token_hash | text, nullable | HMAC of draft cookie token; cleared on submit |
| draft_expires_at | timestamptz, nullable | |
| public_message | text, nullable | the latest message the client sees on tracking |
| submitted_at, completed_at, cancelled_at | timestamptz, nullable | |
| files_deleted_at | timestamptz, nullable | set by cleanup job |
| tracking_failed_attempts | int, default 0 | for lockout |
| tracking_locked_until | timestamptz, nullable | |
| created_at, updated_at | timestamptz | |

Indexes: unique `(tracking_code)`; `(user_id, created_at desc)` for "My requests"; `(status, created_at desc)`; `(created_at desc)`; `(service_id)`; partial `(completed_at) where status in ('completed','cancelled') and files_deleted_at is null` for cleanup.

### request_status_events
The timeline on the tracking page and in admin.
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| request_id | uuid FK → requests, cascade | |
| from_status | request_status, nullable | |
| to_status | request_status | |
| changed_by | uuid FK → profiles, nullable | null = client or system |
| created_at | timestamptz | |

Index: `(request_id, created_at)`.

### request_files
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| request_id | uuid FK → requests, cascade | |
| requirement_id | uuid FK → service_requirements, on delete set null, nullable | which checklist item it is for |
| storage_path | text, unique | `requests/{requestId}/{uuid}.{ext}` |
| original_name | text | shown to admin only, cleaned of strange characters |
| mime_type | text | from magic-byte check, not from the browser |
| size_bytes | int | |
| uploaded_at | timestamptz | |
| deleted_at | timestamptz, nullable | set when cleanup removes the file |

Indexes: `(request_id)`; `(deleted_at)` partial where null (for storage meter sum).

### request_notes
Internal notes and messages to the client.
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| request_id | uuid FK → requests, cascade | |
| author_id | uuid FK → profiles | |
| visibility | note_visibility | `internal` = staff only; `client` = shown on tracking + emailed |
| body | text | max 2000 chars |
| created_at | timestamptz | |

Index: `(request_id, created_at)`.

### payment_methods
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | e.g. "GCash" |
| parser_key | text, nullable | Not used any more and not shown in the admin form. The receipt reader finds the app from the receipt text. Kept so no migration is needed |
| account_name | text | |
| account_number | text | |
| instructions | text, nullable | |
| qr_image_path | text, nullable | path in `public-assets` |
| is_active | boolean | |
| sort_order | int | |
| updated_by | uuid FK → profiles, nullable | |
| created_at, updated_at | timestamptz | |

Index: `(is_active, sort_order)`.
Every insert/update/delete writes an `activity_log` row with before and after values.

### payments
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| request_id | uuid FK → requests, restrict | |
| payment_method_id | uuid FK → payment_methods, restrict, **nullable** | Empty only for an offline payment (check `payments_method_or_offline`). Migration 0008. |
| method_snapshot | jsonb | name, account name, account number, QR path **at the moment of payment** (helps if a QR swap happened) |
| reference_number | text | normalized: only digits/letters, no spaces |
| amount_centavos | bigint, > 0 | |
| paid_on | date | date on the receipt (Asia/Manila) |
| entry_method | payment_entry | `ocr`, `ocr_edited`, `manual`, `offline` (recorded by staff, admin or owner for cash and so on) |
| ocr_raw_values | jsonb, nullable | what OCR first read, for comparing (text only, no image) |
| status | payment_status, default `pending` | |
| verified_by | uuid FK → profiles, nullable | |
| verified_at | timestamptz, nullable | |
| rejection_reason | text, nullable | For a voided offline payment: "Voided: <reason>" |
| offline_method | text, nullable | `cash`, `bank_transfer` or `other` (offline payments only) |
| recorded_by | uuid FK → profiles, nullable | Who recorded the offline payment |
| note | text, nullable | Offline payments only ("Other" must have one) |
| created_at | timestamptz | |

Indexes: **unique `(payment_method_id, reference_number)`**; `(request_id)`; `(status, created_at desc)`.

### site_settings
Key–value settings the owner can edit.
| Field | Type | Notes |
|---|---|---|
| key | text PK | |
| value | jsonb | validated with a Zod schema per key |
| updated_by | uuid FK → profiles, nullable | |
| updated_at | timestamptz | |

Keys: `contact` (phone, email, address), `business_hours`, `social_links` (Facebook Messenger, Viber), `home_texts`, `file_retention_days` (default 30), `max_files_per_request` (default 15), `max_file_size_mb` (default 3), `storage_warning_percent` (default 80), `last_keep_alive_at`, `last_cleanup_at`.

### legal_documents
The Privacy notice and the Terms of service, one row for each saved version (migration `0010_legal_documents.sql`). The owner or admin edits them in Settings > Privacy and terms.
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| kind | text | `privacy` or `terms` (check constraint) |
| version | text | made by the app: the day (Manila) and a counter, like `2026-11-09.1`. Unique with `kind`. The text that ships with the app is shown as `<date>.0` until the first save |
| body | text | Markdown. `{{retention_days}}` and `{{contact_lines}}` are filled in when a visitor reads the page |
| created_by | uuid FK → profiles, nullable | set to null if the account is deleted |
| created_at | timestamptz | |

Rows are only added. A trigger blocks any change to a saved text and any delete, so the version in a request's `consent_version` always points to the exact words the client saw. The newest row of a kind is the live text. Row Level Security is on, with no policies, like every table.

### admin_profiles (removed)
This table no longer exists (migration `0006_single_role.sql`). Its data moved into `profiles` (role, `is_active`, `last_login_at`). The links from notes, payments, status events, payment methods and site settings now point to `profiles(id)` (the ids are the same).

Rule: there must always be at least one active owner (code check and the trigger `profiles_protect_last_owner`).

### activity_log
Append-only record of who did what.
| Field | Type | Notes |
|---|---|---|
| id | bigserial PK | |
| actor_type | actor_type | |
| actor_id | uuid, nullable | admin id when actor is admin |
| action | text | e.g. `payment_method.qr_changed`, `request.status_changed`, `file.opened`, `export.csv`, `login.success` |
| entity_type | text | e.g. `payment_method` |
| entity_id | text, nullable | |
| details | jsonb | before/after values. **No passwords, tokens, or full documents** |
| ip_hash | text, nullable | HMAC of IP, not the raw IP |
| created_at | timestamptz | |

Indexes: `(created_at desc)`; `(entity_type, entity_id)`; `(action)`.
A database trigger blocks `UPDATE` and `DELETE` on this table. (Only the cleanup job may delete rows older than 1 year, through a separate function.)

### rate_limits
| Field | Type | Notes |
|---|---|---|
| key | text | e.g. `track:ip:{hash}`, `track:code:{code}`, `upload:req:{id}` |
| window_start | timestamptz | start of the time window |
| count | int | |

PK `(key, window_start)`. Updated with one atomic `INSERT … ON CONFLICT DO UPDATE SET count = count + 1 RETURNING count`.

### email_log
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| template | text | e.g. `request_submitted_client` |
| to_email | text | |
| request_id | uuid FK → requests, set null, nullable | |
| status | email_status | |
| provider_message_id | text, nullable | |
| error | text, nullable | short message |
| created_at | timestamptz | |

Index: `(created_at desc)`.

---

## 4. Relations (summary)

```
services 1───* service_requirements
services 1───* requests
profiles 1───* requests           (user_id; null for old guest requests)
requests 1───* request_files      (* ───1 service_requirements, optional)
requests 1───* request_notes      (* ───1 profiles)
requests 1───* request_status_events
requests 1───* payments           (* ───1 payment_methods)
profiles ── auth.users (same id)
activity_log, site_settings, rate_limits, email_log: stand alone
```

---

## 5. Status rules (allowed changes)

Coded in `src/lib/status.ts` and tested.

| From | Allowed to |
|---|---|
| draft | submitted, payment_submitted (client submit) — cancelled (system, when expired) |
| submitted | under_review, waiting_for_client, payment_submitted, cancelled |
| under_review | waiting_for_client, payment_submitted, payment_verified, in_progress, cancelled |
| waiting_for_client | under_review, payment_submitted, cancelled |
| payment_submitted | payment_verified, waiting_for_client, under_review, cancelled |
| payment_verified | in_progress, completed, cancelled |
| in_progress | waiting_for_client, completed, cancelled |
| completed | (none — admin can re-open to in_progress, logged) |
| cancelled | (none) |

- Client actions can only cause: draft → submitted / payment_submitted; and submitted / under_review / waiting_for_client → payment_submitted.
- "Mark payment verified" sets the payment row to `verified` and the request to `payment_verified`.
- Every change writes `request_status_events` + `activity_log`.

---

## 6. Size estimate

Text rows are small. 1,000 requests with notes, payments, and logs is well under 20 MB. The 500 MB database limit is not a worry. The 1 GB file storage **is** the main limit — that is why we compress images, limit file count, and auto-delete.

// A tiny copy of the parts of Supabase that our database rules need, for tests on PGlite:
//   - the "auth" schema with auth.users, auth.jwt() and auth.uid()
//   - the roles "anon" and "authenticated"
//   - the "storage" schema with storage.objects and storage.foldername()
// It must run BEFORE the migrations, like on a real Supabase project where these already exist.
// Real Supabase reads the logged-in user from the setting request.jwt.claims. We do the same.

export const FAKE_SUPABASE_SQL = [
  `CREATE ROLE anon NOLOGIN`,
  `CREATE ROLE authenticated NOLOGIN`,
  `CREATE SCHEMA auth`,
  `CREATE TABLE auth.users (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     email text,
     raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
     email_confirmed_at timestamptz
   )`,
  // The authenticator devices (TOTP factors) and the login sessions, as Supabase stores them.
  `CREATE TABLE auth.mfa_factors (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id uuid NOT NULL,
     friendly_name text,
     factor_type text NOT NULL DEFAULT 'totp',
     status text NOT NULL DEFAULT 'unverified',
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE auth.sessions (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id uuid NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
     SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
   $$`,
  `CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
     SELECT nullif(auth.jwt() ->> 'sub', '')::uuid
   $$`,
  `CREATE SCHEMA storage`,
  `CREATE TABLE storage.objects (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     bucket_id text NOT NULL,
     name text NOT NULL
   )`,
  `ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY`,
  `CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE plpgsql AS $$
     DECLARE parts text[];
     BEGIN
       parts := string_to_array(name, '/');
       RETURN parts[1:array_length(parts, 1) - 1];
     END
   $$`,
  `GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated`,
  // Real Supabase lets these roles use storage.objects. The policies then decide which rows they see.
  `GRANT ALL ON storage.objects TO anon, authenticated`,
  `GRANT EXECUTE ON FUNCTION auth.jwt(), auth.uid() TO anon, authenticated`,
  `GRANT EXECUTE ON FUNCTION storage.foldername(text) TO anon, authenticated`,
];

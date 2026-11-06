import "server-only";

import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { isProduction } from "@/server/env";

import type { StorageDriver } from "./types";

// One small wrapper around file storage (docs/ARCHITECTURE.md). The rest of the app only knows the
// StorageDriver interface, so the host can change without touching other code.

export const CLIENT_FILES_BUCKET = () =>
  process.env.SUPABASE_BUCKET_CLIENT_FILES?.trim() || "client-files";
export const PUBLIC_ASSETS_BUCKET = () =>
  process.env.SUPABASE_BUCKET_PUBLIC_ASSETS?.trim() || "public-assets";

function supabaseDriver(url: string, secretKey: string): StorageDriver {
  const client = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    async put(bucket, filePath, bytes, mime) {
      const { error } = await client.storage.from(bucket).upload(filePath, bytes, {
        contentType: mime,
        upsert: false,
      });
      if (error) throw new Error(`Storage upload failed: ${error.message}`);
    },
    async remove(bucket, paths) {
      if (paths.length === 0) return;
      const { error } = await client.storage.from(bucket).remove(paths);
      if (error) throw new Error(`Storage remove failed: ${error.message}`);
    },
    async signedUrl(bucket, filePath, seconds) {
      const { data, error } = await client.storage.from(bucket).createSignedUrl(filePath, seconds);
      if (error || !data) throw new Error(`Could not sign the link: ${error?.message}`);
      return data.signedUrl;
    },
  };
}

// Development only: keeps files in the .local-storage folder, so the upload flow can be tried
// without a Supabase account. It is NEVER used in production.
function localDriver(): StorageDriver {
  const root = path.resolve(process.cwd(), ".local-storage");
  const target = (bucket: string, filePath: string) => path.join(root, bucket, filePath);
  return {
    async put(bucket, filePath, bytes) {
      const full = target(bucket, filePath);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, bytes);
    },
    async remove(bucket, paths) {
      for (const p of paths) await rm(target(bucket, p), { force: true });
    },
    async signedUrl(bucket, filePath) {
      return `/api/dev-storage?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(filePath)}`;
    },
  };
}

export function getStorage(): StorageDriver {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (url && secretKey) return supabaseDriver(url, secretKey);
  if (isProduction()) throw new Error("Supabase storage is not set up (SUPABASE_SECRET_KEY).");
  return localDriver();
}

// Supabase Storage as a StorageDriver. No "server-only" import here, because the Node scripts (cleanup job)
// use it too. It needs the SECRET key, so never import it from browser code.
import { createClient } from "@supabase/supabase-js";

import type { StorageDriver } from "./types";

export function createSupabaseStorage(url: string, secretKey: string): StorageDriver {
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

// Creates the two Supabase Storage buckets (or fixes their settings if they already exist).
// Run: pnpm storage:setup
//   client-files   PRIVATE. Client documents. Only our server (secret key) can use it.
//   public-assets  Public read. Payment QR images and site images. Only our server writes.

import { createClient } from "@supabase/supabase-js";

import { loadEnv, requireEnv } from "./lib/env";

loadEnv();

const MB = 1024 * 1024;

async function main() {
  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SECRET_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const buckets = [
    {
      name: process.env.SUPABASE_BUCKET_CLIENT_FILES?.trim() || "client-files",
      options: {
        public: false,
        // Only the three allowed types. The server also checks the real file type.
        allowedMimeTypes: ["image/jpeg", "image/png", "application/pdf"],
        // A hard top limit. The real limit comes from the max_file_size_mb setting (default 3 MB).
        fileSizeLimit: 10 * MB,
      },
    },
    {
      name: process.env.SUPABASE_BUCKET_PUBLIC_ASSETS?.trim() || "public-assets",
      options: {
        public: true,
        allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
        fileSizeLimit: 2 * MB,
      },
    },
  ];

  for (const { name, options } of buckets) {
    const { data: existing } = await supabase.storage.getBucket(name);
    if (existing) {
      const { error } = await supabase.storage.updateBucket(name, options);
      if (error) throw new Error(`Could not update bucket "${name}": ${error.message}`);
      console.log(
        `Bucket "${name}": already existed, settings checked (public: ${options.public}).`,
      );
    } else {
      const { error } = await supabase.storage.createBucket(name, options);
      if (error) throw new Error(`Could not create bucket "${name}": ${error.message}`);
      console.log(`Bucket "${name}": created (public: ${options.public}).`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

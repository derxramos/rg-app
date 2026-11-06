// What the app needs from file storage. Supabase Storage is one implementation. Tests use a fake.
export interface StorageDriver {
  put(bucket: string, path: string, bytes: Uint8Array, mime: string): Promise<void>;
  remove(bucket: string, paths: string[]): Promise<void>;
  // A link that works for a short time. Admin file links last 60 seconds.
  signedUrl(bucket: string, path: string, seconds: number): Promise<string>;
}

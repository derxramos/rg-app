// Where a payment QR image is. Real QR images are in the public "public-assets" bucket.
// "samples/..." paths are the fake sample QR that ships with the app (public/samples).
export function qrImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("samples/")) return `/${path}`;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const bucket = process.env.SUPABASE_BUCKET_PUBLIC_ASSETS?.trim() || "public-assets";
  if (base) return `${base}/storage/v1/object/public/${bucket}/${path}`;
  // No Supabase (local development): the local storage folder serves it.
  return process.env.NODE_ENV === "production"
    ? null
    : `/api/dev-storage?bucket=${bucket}&path=${encodeURIComponent(path)}`;
}

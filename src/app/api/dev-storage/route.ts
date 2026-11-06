import { readFile } from "node:fs/promises";
import path from "node:path";

// Development only: serves files from the .local-storage folder, so "open file" works without Supabase.
// In production this route does not exist (404). Client files need an admin session.
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });

  const url = new URL(request.url);
  const bucket = url.searchParams.get("bucket") ?? "";
  // Client documents are only for admins. The public-assets bucket (QR pictures) is public, like in Supabase.
  if (bucket !== "public-assets") {
    const { requireAdmin } = await import("@/server/auth/admin");
    try {
      await requireAdmin();
    } catch {
      return new Response("Not allowed", { status: 403 });
    }
  }
  const filePath = url.searchParams.get("path") ?? "";
  const root = path.resolve(process.cwd(), ".local-storage");
  const full = path.resolve(root, bucket, filePath);
  // Never leave the storage folder.
  if (!full.startsWith(root + path.sep)) return new Response("Not found", { status: 404 });

  try {
    const bytes = await readFile(full);
    const type = full.endsWith(".pdf")
      ? "application/pdf"
      : full.endsWith(".png")
        ? "image/png"
        : "image/jpeg";
    return new Response(new Uint8Array(bytes), { headers: { "content-type": type } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

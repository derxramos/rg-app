// Finds the REAL type of a file from its first bytes ("magic bytes"). The name and the type the
// browser reports can be fake: an .exe renamed to .jpg must be refused. Docs: ARCHITECTURE.md section 6.

export type DetectedFile = {
  mime: "image/jpeg" | "image/png" | "application/pdf";
  ext: "jpg" | "png" | "pdf";
};

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

export function detectFileType(bytes: Uint8Array): DetectedFile | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ext: "jpg" };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mime: "image/png", ext: "png" };
  }
  // "%PDF-"
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return { mime: "application/pdf", ext: "pdf" };
  }
  return null;
}

// The original file name is saved only for the admin to read. It is cleaned of path pieces and
// strange characters, and it is never used as a storage path.
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 100) || "file";
}

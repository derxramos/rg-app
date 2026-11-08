import "server-only";

import type { MfaApi } from "./mfa-devices";
import { createSupabaseServer } from "./supabase-server";

// The real devices of the signed-in person, through Supabase Auth and the login cookies.
export async function createMfaApi(): Promise<MfaApi> {
  const supabase = await createSupabaseServer();
  return {
    async list() {
      const { data } = await supabase.auth.mfa.listFactors();
      // listFactors().totp holds the verified devices. "all" also holds the unverified ones.
      const all = data?.all ?? [];
      return all
        .filter((f) => f.factor_type === "totp")
        .map((f) => ({
          id: f.id,
          name: f.friendly_name ?? "Authenticator",
          createdAt: String(f.created_at),
          verified: f.status === "verified",
        }));
    },
    async enroll(name) {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: name,
      });
      if (error || !data) throw new Error("Could not start the device setup.");
      return { id: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
    },
    async verify(factorId, code) {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: code.replace(/\s/g, ""),
      });
      return !error;
    },
    async unenroll(factorId) {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw new Error("Could not remove the device.");
    },
  };
}

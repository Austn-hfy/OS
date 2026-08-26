import { createClient } from "@supabase/supabase-js";
import { publicSupabaseEnv, requiredEnv } from "@/lib/env";

export function createSupabaseAdminClient() {
  const { url } = publicSupabaseEnv();
  return createClient(url, requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

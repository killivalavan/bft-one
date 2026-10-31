import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _adminClient: SupabaseClient | null = null;

/**
 * Server-only Supabase Administrative Client.
 * Powered strictly by SUPABASE_SERVICE_ROLE_KEY to bypass RLS and perform
 * authoritative administrative/token operations on the backend.
 *
 * Reuses a single server-side client instance to avoid socket leaks and GC churn.
 */
export function supabaseAdmin(): SupabaseClient {
  if (_adminClient) return _adminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable.");
  }

  if (!serviceKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY environment variable. Administrative operations require a service-role key."
    );
  }

  _adminClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return _adminClient;
}

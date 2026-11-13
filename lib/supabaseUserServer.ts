/**
 * CounterCub — User-Scoped Server Supabase Client (RLS Enforced)
 *
 * Implements Principle 5 & Section 6:
 * - Never use service-role access (`supabaseAdmin()`) as the normal tenant CRUD mechanism.
 * - Uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` + the caller's verified `Authorization: Bearer <jwt>`
 *   so PostgreSQL executes every query under the `authenticated` role and enforces Row Level Security (RLS).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface UserScopedClientOptions {
  /**
   * Optional verified support impersonation session ID header forwarded to PostgREST
   * (`request.headers` GUC) when an authorized short-lived support session is active.
   */
  impersonationSessionId?: string | null;
}

/**
 * Creates a stateless, per-request Supabase client bound to the authenticated user's JWT.
 * All queries executed through this client enforce PostgreSQL RLS and table grants.
 */
export function createUserScopedServerClient(
  accessToken: string,
  options?: UserScopedClientOptions
): SupabaseClient {
  if (!accessToken || typeof accessToken !== "string" || !accessToken.trim()) {
    throw new Error(
      "createUserScopedServerClient requires a non-empty user access token."
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables."
    );
  }

  const globalHeaders: Record<string, string> = {
    Authorization: `Bearer ${accessToken.trim()}`,
  };

  if (options?.impersonationSessionId) {
    globalHeaders["x-impersonation-session-id"] = options.impersonationSessionId;
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: globalHeaders,
    },
  });
}


import { supabaseClient } from "@/lib/supabaseClient";

/**
 * Returns headers with Authorization: Bearer <session.access_token>
 * if the user is currently signed in to Supabase.
 */
export async function getAuthHeaders(customHeaders: Record<string, string> = {}): Promise<Record<string, string>> {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const token = session?.access_token;
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...customHeaders,
    };
  } catch {
    return {
      "Content-Type": "application/json",
      ...customHeaders,
    };
  }
}

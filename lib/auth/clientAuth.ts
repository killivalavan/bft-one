import { supabaseClient } from "@/lib/supabaseClient";

/**
 * Returns headers with Authorization: Bearer <session.access_token>
 * if the user is currently signed in to Supabase.
 */
export async function getAuthHeaders(customHeaders: Record<string, string> = {}): Promise<Record<string, string>> {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    let token = session?.access_token;

    if (!token && typeof window !== "undefined") {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
            const raw = localStorage.getItem(key);
            if (raw) {
              const parsed = JSON.parse(raw);
              token = parsed.access_token || (Array.isArray(parsed) ? parsed[0]?.access_token : "");
              if (token) break;
            }
          }
        }
      } catch {}
    }

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

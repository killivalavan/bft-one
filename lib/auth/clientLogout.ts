import { supabaseClient } from "@/lib/supabaseClient";

/**
 * Securely clears all cached client-side tenant data, IndexedDB storage,
 * local and session storage, and terminates the active Supabase authentication session.
 */
export async function performClientLogout(redirectTo: string = "/login"): Promise<void> {
  try {
    await Promise.race([
      supabaseClient.auth.signOut(),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  } catch (e) {
    console.warn("Supabase signOut error/timeout:", e);
  } finally {
    if (typeof window !== "undefined") {
      try {
        localStorage.clear();
      } catch {}
      try {
        sessionStorage.clear();
      } catch {}
      try {
        if (window.indexedDB) {
          window.indexedDB.deleteDatabase("seyalpro_offline_v1");
          window.indexedDB.deleteDatabase("bftone_offline_db");
        }
      } catch {}
    }
    if (typeof document !== "undefined") {
      document.cookie = "tenant_slug=; path=/; max-age=0; SameSite=Lax";
    }
    window.location.href = redirectTo;
  }
}

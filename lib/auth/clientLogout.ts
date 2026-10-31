import { supabaseClient } from "@/lib/supabaseClient";
import { resetUserCache } from "@/lib/hooks/useUser";
import { resetProfileCache } from "@/lib/hooks/useProfile";

export interface LogoutOptions {
  currentTenantId?: string | null;
  preserveSharedSettings?: boolean;
}

/**
 * Safely removes tenant-specific data from localStorage and IndexedDB.
 * Can be called during store switching or tenant eviction.
 */
export async function clearTenantBrowserStorage(
  tenantId?: string | null,
  options: { preserveSharedSettings?: boolean } = {}
): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    // 1. LocalStorage Tenant Data Cleansing
    if (window.localStorage) {
      const keysToRemove: string[] = [];
      const totalKeys = localStorage.length;

      for (let i = 0; i < totalKeys; i++) {
        const key = localStorage.key(i);
        if (!key) continue;

        // If specific tenantId provided, only remove keys explicitly tied to that tenant or active session
        if (tenantId) {
          if (
            key.endsWith(`_${tenantId}`) ||
            key.includes(tenantId) ||
            key === "bftone_tenant_cache" ||
            key === "bftone_active_tenant_id" ||
            key === "bftone_active_tab" ||
            key === "seyalpro_app_mode"
          ) {
            keysToRemove.push(key);
          }
        } else {
          // General logout: remove all SeyalPro/BFT tenant and session keys
          // Preserve device hardware configuration unless preserveSharedSettings === false
          const isSharedConfig =
            options.preserveSharedSettings !== false &&
            (key === "client_device_id" ||
              key === "bftone_device_id" ||
              key.startsWith("theme") ||
              key.startsWith("printer_"));

          if (!isSharedConfig && (key.startsWith("bftone_") || key.startsWith("bft_") || key === "seyalpro_app_mode")) {
            keysToRemove.push(key);
          }
        }
      }

      for (const k of keysToRemove) {
        try {
          localStorage.removeItem(k);
        } catch {}
      }
    }
  } catch (lsErr) {
    console.warn("Failed to clean localStorage during tenant isolation:", lsErr);
  }

  // 2. SessionStorage Cleansing
  try {
    if (window.sessionStorage) {
      sessionStorage.clear();
    }
  } catch {}

  // 3. Tenant Cookie Expiration
  try {
    if (typeof document !== "undefined") {
      document.cookie = "tenant_slug=; path=/; max-age=0; SameSite=Lax";
    }
  } catch {}

  // 4. IndexedDB Scoped Tenant Cleansing
  try {
    if (window.indexedDB) {
      if (tenantId) {
        // Isolate deletion to the specific tenant in IndexedDB
        const { clearTenantData } = await import("@/lib/offline/db");
        await clearTenantData(tenantId).catch(() => {});
      } else {
        // If logging out completely without tenant context, delete the offline databases
        window.indexedDB.deleteDatabase("seyalpro_offline_v1");
        window.indexedDB.deleteDatabase("bftone_offline_db");
      }
    }
  } catch (idbErr) {
    console.warn("Failed to clean IndexedDB during tenant isolation:", idbErr);
  }
}

/**
 * Clears client state when a tenant switch occurs (e.g., in Super Admin or multi-store navigation).
 */
export async function clearTenantClientState(previousTenantId?: string | null): Promise<void> {
  await clearTenantBrowserStorage(previousTenantId, { preserveSharedSettings: true });
}

/**
 * Securely terminates the active Supabase authentication session, purges tenant storage,
 * and redirects to the login screen. Guarantees redirect and cleanup even if signOut times out.
 */
export async function performClientLogout(
  redirectTo: string = "/login",
  options: LogoutOptions = {}
): Promise<void> {
  try {
    await Promise.race([
      supabaseClient.auth.signOut(),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  } catch (e) {
    console.warn("Supabase signOut error/timeout:", e);
  } finally {
    resetUserCache();
    resetProfileCache();
    try {
      await clearTenantBrowserStorage(options.currentTenantId, {
        preserveSharedSettings: options.preserveSharedSettings ?? true,
      });
    } catch (cleanErr) {
      console.warn("Error during post-logout client storage purge:", cleanErr);
    }

    if (typeof window !== "undefined") {
      window.location.href = redirectTo;
    }
  }
}

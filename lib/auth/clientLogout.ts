import { supabaseClient } from "@/lib/supabaseClient";
import { resetUserCache } from "@/lib/hooks/useUser";
import { resetProfileCache } from "@/lib/hooks/useProfile";

export interface LogoutOptions {
  currentTenantId?: string | null;
  preserveSharedSettings?: boolean;
}

/**
 * Safely removes tenant-specific data from localStorage, sessionStorage, cookies,
 * Service Worker CacheStorage, and IndexedDB (SEC-18).
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

        if (tenantId) {
          if (
            key.endsWith(`_${tenantId}`) ||
            key.includes(tenantId) ||
            key === "countercub_tenant_cache" ||
            key === "bftone_tenant_cache" ||
            key === "bftone_active_tenant_id" ||
            key === "bftone_active_tab" ||
            key === "countercub_app_mode" ||
            key === "seyalpro_app_mode"
          ) {
            keysToRemove.push(key);
          }
        } else {
          // General logout: remove all CounterCub/SeyalPro/BFT tenant and session keys
          const isSharedConfig =
            options.preserveSharedSettings !== false &&
            (key === "client_device_id" ||
              key === "bftone_device_id" ||
              key.startsWith("theme") ||
              key.startsWith("printer_"));

          if (
            !isSharedConfig &&
            (key.startsWith("countercub_") ||
              key.startsWith("bftone_") ||
              key.startsWith("bft_") ||
              key.startsWith("seyalpro_") ||
              key === "seyalpro_app_mode")
          ) {
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

  // 3. Tenant & Impersonation Cookie Expiration
  try {
    if (typeof document !== "undefined") {
      document.cookie = "tenant_slug=; path=/; max-age=0; SameSite=Lax";
      document.cookie = "cc_impersonation_session=; path=/; max-age=0; SameSite=Strict";
    }
  } catch {}

  // 4. Service Worker CacheStorage Cleansing (SEC-18)
  try {
    if ("caches" in window && window.caches) {
      const cacheKeys = await window.caches.keys();
      await Promise.all(cacheKeys.map((k) => window.caches.delete(k)));
    }
    if ("serviceWorker" in navigator && navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "CLEAR_TENANT_CACHE" });
    }
  } catch (swErr) {
    console.warn("Failed to purge Service Worker caches during logout:", swErr);
  }

  // 5. IndexedDB Scoped Tenant Cleansing
  try {
    if (window.indexedDB) {
      if (tenantId) {
        const { clearTenantData } = await import("@/lib/offline/db");
        await clearTenantData(tenantId).catch(() => {});
      } else {
        window.indexedDB.deleteDatabase("countercub_offline_v1");
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

# SeyalPro — Next.js Caching & Cache Isolation Strategy

**Framework:** Next.js 16.0.7 (App Router) + React 19  
**Auditor:** Next.js Performance & Security Engineer  

---

## 1. Caching Layer Classification & Risk Audit

| Layer | Current Behavior | Isolation Status | Required Remediation |
| :--- | :--- | :---: | :--- |
| **Route Handlers (`app/api/*`)** | Default caching (no headers set) | ⚠️ RISK | Force `export const dynamic = 'force-dynamic'` & inject `Cache-Control: private, no-store, must-revalidate`. |
| **Next.js Data Cache (`fetch`)** | Defaults to framework behavior | ⚠️ RISK | Ensure authenticated internal fetches use `cache: 'no-store'` unless public static data. |
| **TanStack React Query** | In-memory cache (`gcTime: 30m`, `staleTime: 2m`) | ⚠️ RISK | Namespaced by `bizId`, but NOT cleared on logout. Must invoke `queryClient.clear()` on logout/switch. |
| **Zustand POS Cart** | Local memory + optional persist | 🟢 SECURE | POS cart scoped to active tab session. |
| **IndexedDB (`seyalpro_offline_v1`)** | Persistent local browser storage | ⚠️ RISK | Data contains `business_id`, but stores are not isolated across tenant account switching on shared devices. |
| **Browser `localStorage`** | Stores `bftone_invoices_${bizId}` | ⚠️ RISK | Retains historical customer names and invoices after logout. Must be cleared on signout. |
| **Full Route Cache (RSC)** | Protected routes rendered dynamically | 🟢 SECURE | Handled by dynamic cookies / auth headers in `ProtectedLayout`. |

---

## 2. Mandatory Isolation Rules

1. **Explicit Private Headers:**
   Every response from an authenticated endpoint in `app/api/*` must return:
   ```http
   Cache-Control: private, no-store, no-cache, max-age=0, must-revalidate
   Pragma: no-cache
   ```
2. **Session Eviction:**
   When `handleLogout()` executes, the application must purge:
   - `queryClient.clear()`
   - All tenant-specific `localStorage` keys
   - Clear tenant-specific entries in IndexedDB or isolate by `user_id + tenant_id`
   - Expire `tenant_slug` and auth cookies with `maxAge: 0`
3. **No Dynamic Shared Cache:**
   Never cache API responses in edge or CDN caches without a `Vary: Authorization, Cookie, x-tenant-slug` header.

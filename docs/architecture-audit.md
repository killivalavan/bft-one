# SeyalPro — Architecture Audit Report

**Date:** October 2026  
**Auditor:** Principal Software Architect & Application Security Lead  
**Scope:** `bft-one` (SeyalPro Multi-Tenant SaaS)  
**Status:** Stage A Read-Only Audit Complete  

---

## 1. Verified Environment & Dependencies

| Component | Verified Version | Configuration / Notes |
| :--- | :--- | :--- |
| **Framework** | Next.js `16.0.7` | App Router, React Server Components enabled |
| **Runtime** | React `19.2.0` / ReactDOM `19.2.0` | Latest React 19 architecture |
| **Language** | TypeScript `5` | `tsc --noEmit` verified PASS (0 errors) |
| **Styling** | Tailwind CSS `^4.0.0` | Modern `@tailwindcss/postcss` compiler |
| **Database** | Supabase JS `^2.76.1` | PostgreSQL 15+ with Auth & RLS |
| **Offline DB** | Custom IndexedDB Engine | `seyalpro_offline_v1` (13 object stores) |
| **State / Cache** | TanStack Query `^5.90.5` | In-memory query client, 2m staleTime, 30m gcTime |
| **Client State** | Zustand `^5.0.8` | POS Shopping Cart (`store/cart.ts`) |
| **Document Export**| jsPDF `^3.0.3` + AutoTable `^5.0.7` | Client-side thermal receipts, GST invoices, payslips |

---

## 2. Production Architecture & Trust Boundaries

```
[Browser Client / PWA]
       │
       ▼ (HTTPS)
[Next.js Middleware (middleware.ts)]
  • Subdomain parsing (e.g. navalur.seyalpro.in -> navalur)
  • Query param & cookie extraction
  • Injects header: x-tenant-slug
       │
       ▼
[Next.js 16 App Router (app/)]
  • Public Routes: /login, /super-admin/login, /api/health
  • Protected Routes: app/(protected)/* guarded by ProtectedLayout
  • B2B Routes: app/(protected)/b2b/* guarded by BakerLayout
       │
       ▼
[Backend Route Handlers (app/api/*)]
  • authenticateRequest() in lib/auth/serverAuth.ts
  • Bearer Token / Chunked Cookie extraction
  • Resolves user profile, business_id, and role flags
  • Rate limiting via in-memory sliding window
       │
       ▼
[Supabase Cloud PostgreSQL]
  • Multi-tenant relational tables with business_id UUID
  • Row Level Security (RLS) policies
  • Service-Role client in serverAuth / route handlers
```

---

## 3. Trust Boundary Analysis

1. **Untrusted Inputs:**
   - URL parameters (`?tenant=...`, `?business_id=...`, `?userId=...`)
   - HTTP Request Headers (`x-forwarded-host`, `host`, `x-tenant-slug`)
   - Client Cookies (`tenant_slug`, `sb-*-auth-token`)
   - Browser Storage (`localStorage`, `sessionStorage`, `IndexedDB`)
   - Request JSON bodies submitted to `/api/*`

2. **Authoritative Sources of Truth:**
   - Cryptographically verified Supabase JWT (`supabaseAdmin().auth.getUser(token)`)
   - Server-queried `public.profiles` row (`business_id`, `is_admin`, `is_super_admin`)
   - PostgreSQL Row Level Security enforced directly at the database layer

3. **Current Flaws in Trust Boundaries:**
   - **Silent Navalur Fallback:** When tenant resolution fails or profile has no business, code silently falls back to `DEFAULT_BUSINESS_ID` (`a0000000-0000-0000-0000-000000000001`).
   - **Service-Role RLS Bypass in APIs:** All 32 API routes use `supabaseAdmin()` (service role key), which bypasses PostgreSQL RLS. If an API route does not explicitly filter by `caller.businessId`, multi-tenant isolation fails completely.
   - **Super Admin Email Heuristic:** Server auth treats hardcoded emails (`admin@seyalpro.com`, `admin@bft.com`) as Super Admin without requiring `profile.is_super_admin = true`.
   - **Client-Side Profile Self-Elevation:** Supabase RLS policies on `public.profiles` permit users to update their own row without preventing modification of `is_admin`, `is_super_admin`, or `business_id`.

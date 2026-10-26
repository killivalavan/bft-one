# SeyalPro — Performance Audit & Optimization Plan

**Baseline Status:** `tsc --noEmit` PASS (0 errors). Next.js App Router dynamic tree.

---

## 1. Measured Performance Bottlenecks

1. **Heavy Client Bundle in POS & Admin:**
   - [billPdf.ts](file:///d:/My%20Projects/bft-one/lib/utils/billPdf.ts), [statementPdf.ts](file:///d:/My%20Projects/bft-one/lib/utils/statementPdf.ts), and [combinedLedgerPdf.ts](file:///d:/My%20Projects/bft-one/lib/utils/combinedLedgerPdf.ts) import `jspdf` and `jspdf-autotable` statically. This loads heavy PDF parsing code onto the initial page bundle.
   - **Optimization:** Dynamic import (`await import('jspdf')`) when printing or downloading PDFs.

2. **Unbounded Database Queries:**
   - In `/api/invoices` and `/api/b2b/dispatches`, queries fetch all records for a business with `.select('*')` without cursor-based or offset pagination. For stores with 10,000+ dispatches, this causes memory bloat.
   - **Optimization:** Introduce `limit` and `offset` / `before_date` pagination parameters with a default cap of 100 records per page.

3. **Dual-Engine JSON Fallback Overhead:**
   - Fallback logic checks `businesses.enabled_modules._b2b_data`, loading massive nested JSON objects into memory on every request.
   - **Optimization:** Ensure migration to relational tables is completed so `_b2b_data` in JSONB is deprecated and not loaded repeatedly.

4. **Font & CSS Optimization:**
   - Fonts (`Plus_Jakarta_Sans` & `Geist_Mono`) are already loaded via `next/font/google` with `display: 'swap'`.
   - Tailwind CSS v4 compiler produces clean atomic utility CSS without bloated runtime.

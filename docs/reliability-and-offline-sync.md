# SeyalPro — Reliability, Offline Sync & Financial Integrity

**Core Focus:** Idempotency, atomic transactions, conflict handling, and offline queue safety.

---

## 1. Offline Queue Integrity Architecture

```
[POS Order Created Offline]
        │
        ▼
[SyncQueueItem Created]
  • op.id: UUID
  • op.client_operation_id: Idempotency token (ORD-xxxx)
  • op.user_id: Bound strictly to currently logged-in user
  • op.business_id: Bound strictly to verified active business
        │
        ▼
[Device Reconnects / Online Event]
        │
        ▼
[syncPendingQueue() in syncEngine.ts]
  • Verify: Current session user === op.user_id
  • Verify: Current session business_id === op.business_id
  • IF mismatch: Mark status = 'quarantined' / Do NOT execute
  • IF match: Call cloud mutation with Idempotency Token
```

---

## 2. Financial Atomicity & Conflict Resolution

1. **Idempotency Keys:** Every order, invoice, and payment mutation passes a unique `client_operation_id` to prevent duplicate ledger postings or stock decrements during network retries.
2. **Atomic Stock Decrements:** In `app/api/stock/adjust/route.ts`, recipe-level BOM deductions must execute inside an atomic database function (`RPC: deduct_order_stock_and_recipes`) or PostgreSQL transaction block so partial failure does not leave stock ledger inconsistent.
3. **No Silent Reversal:** Never overwrite historical sales records. Corrections must be handled by credit notes / returns (`b2b_dispatches` with `isReturn: true`).
